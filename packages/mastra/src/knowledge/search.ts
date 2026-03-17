import { UpstreamServiceError } from "@atlas-kb/errors";
import {
  type AskKnowledgeCitation,
  type AskKnowledgeRequest,
  AskKnowledgeRequestSchema,
  type AskKnowledgeResult,
  type SearchKnowledgeHit,
  type SearchKnowledgeRequest,
  SearchKnowledgeRequestSchema,
  type SearchKnowledgeResult,
} from "@atlas-kb/schema";
import { getOpenAIModel, getOpenAIUrl } from "./config";
import { listKnowledgeDocuments } from "./repository";
import { searchKnowledgeVectors } from "./qdrant";

const DEFAULT_SEARCH_LIMIT = 5;
const DEFAULT_ASK_LIMIT = 3;

interface OpenAIChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>;
    };
  }>;
}

function normalizeTokens(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) {
    return 0;
  }

  let count = 0;
  let startIndex = 0;

  while (true) {
    const index = haystack.indexOf(needle, startIndex);
    if (index < 0) {
      break;
    }

    count += 1;
    startIndex = index + needle.length;
  }

  return count;
}

function buildSnippet(
  content: string,
  tokens: string[],
  fallback: string,
): string {
  const normalizedContent = content.toLowerCase();

  for (const token of tokens) {
    const index = normalizedContent.indexOf(token);
    if (index < 0) {
      continue;
    }

    const start = Math.max(0, index - 56);
    const end = Math.min(content.length, index + token.length + 104);
    return content.slice(start, end).trim();
  }

  return fallback;
}

function scoreDocument(
  document: {
    title: string;
    summary: string;
    content: string;
    tags: string[];
  },
  tokens: string[],
): number {
  const title = document.title.toLowerCase();
  const summary = document.summary.toLowerCase();
  const content = document.content.toLowerCase();
  const tags = document.tags.map((tag) => tag.toLowerCase());

  let score = 0;

  for (const token of tokens) {
    score += countOccurrences(title, token) * 5;
    score += countOccurrences(summary, token) * 3;
    score += countOccurrences(content, token);

    if (tags.some((tag) => tag.includes(token))) {
      score += 2;
    }
  }

  return score;
}

function toCitation(hit: SearchKnowledgeHit): AskKnowledgeCitation {
  return {
    documentId: hit.documentId,
    title: hit.title,
    snippet: hit.snippet,
  };
}

function buildMockAnswer(
  question: string,
  citations: AskKnowledgeCitation[],
): string {
  if (citations.length === 0) {
    return `No matching evidence was found in Atlas KB for "${question}". Refine the question or choose a narrower knowledge space.`;
  }

  const lead = citations
    .slice(0, 2)
    .map((citation) => `${citation.title}: ${citation.snippet}`)
    .join(" ");

  return `Atlas KB found ${citations.length} relevant source(s). ${lead}`;
}

function getMessageText(
  payload: OpenAIChatCompletionResponse,
): string | undefined {
  const content = payload.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content.trim() || undefined;
  }

  if (!Array.isArray(content)) {
    return undefined;
  }

  const text = content
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();

  return text || undefined;
}

async function tryGenerateModelAnswer(params: {
  question: string;
  citations: AskKnowledgeCitation[];
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): Promise<string | undefined> {
  if (!params.apiKey || params.citations.length === 0) {
    return undefined;
  }

  const fetchImpl = params.fetchImpl ?? fetch;
  const context = params.citations
    .map(
      (citation, index) =>
        `${index + 1}. ${citation.title}\n${citation.snippet}`,
    )
    .join("\n\n");

  try {
    const response = await fetchImpl(
      getOpenAIUrl("chat/completions", params.baseUrl),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: params.model ?? getOpenAIModel(),
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "Answer using only the supplied knowledge citations. Keep the answer concise and grounded.",
            },
            {
              role: "user",
              content: `Question: ${params.question}\n\nContext:\n${context}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!response.ok) {
      throw new UpstreamServiceError(
        `Configured OpenAI provider rejected the ask request with status ${response.status}`,
      );
    }

    const payload = (await response.json()) as OpenAIChatCompletionResponse;
    const answer = getMessageText(payload);

    if (!answer) {
      throw new UpstreamServiceError(
        "Configured OpenAI provider returned an empty ask response",
      );
    }

    return answer;
  } catch (error) {
    if (error instanceof UpstreamServiceError) {
      throw error;
    }

    throw new UpstreamServiceError(
      "Configured OpenAI provider request failed",
      error,
    );
  }
}

async function lexicalSearch(
  input: SearchKnowledgeRequest,
): Promise<SearchKnowledgeResult> {
  const tokens = normalizeTokens(input.query);
  const limit = input.limit ?? DEFAULT_SEARCH_LIMIT;

  if (tokens.length === 0) {
    return {
      query: input.query,
      engine: "lexical",
      total: 0,
      hits: [],
    };
  }

  const hits = (await listKnowledgeDocuments(input.spaceId))
    .map((document) => {
      const score = scoreDocument(document, tokens);
      if (score <= 0) {
        return undefined;
      }

      return {
        documentId: document.id,
        spaceId: document.spaceId,
        title: document.title,
        summary: document.summary,
        snippet: buildSnippet(document.content, tokens, document.excerpt),
        tags: [...document.tags],
        score,
      } satisfies SearchKnowledgeHit;
    })
    .filter((hit): hit is SearchKnowledgeHit => Boolean(hit))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.title.localeCompare(right.title);
    });

  return {
    query: input.query,
    engine: "lexical",
    total: hits.length,
    hits: hits.slice(0, limit),
  };
}

export async function searchKnowledge(
  input: SearchKnowledgeRequest,
): Promise<SearchKnowledgeResult> {
  const parsedInput = SearchKnowledgeRequestSchema.parse(input);
  const vectorResult = await searchKnowledgeVectors(parsedInput);

  if (vectorResult) {
    return vectorResult;
  }

  return lexicalSearch(parsedInput);
}

export async function answerKnowledgeQuestion(
  input: AskKnowledgeRequest,
  options: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<AskKnowledgeResult> {
  const parsedInput = AskKnowledgeRequestSchema.parse(input);
  const limit = parsedInput.limit ?? DEFAULT_ASK_LIMIT;
  const searchResult = await searchKnowledge({
    query: parsedInput.question,
    spaceId: parsedInput.spaceId,
    limit,
  });
  const citations = searchResult.hits.slice(0, limit).map(toCitation);
  const modelAnswer = await tryGenerateModelAnswer({
    question: parsedInput.question,
    citations,
    apiKey: options.apiKey ?? "",
    baseUrl: options.baseUrl,
    model: options.model,
    fetchImpl: options.fetchImpl,
  });

  return {
    question: parsedInput.question,
    answer: modelAnswer ?? buildMockAnswer(parsedInput.question, citations),
    mode: modelAnswer ? "model" : "mock",
    engine: searchResult.engine,
    citations,
  };
}
