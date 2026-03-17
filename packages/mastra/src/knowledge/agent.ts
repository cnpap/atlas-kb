import type { AskKnowledgeCitation } from "@atlas-kb/schema";
import { createKnowledgeAgent } from "../agents";
import { getOpenAIApiKey } from "./config";
import { requireKnowledgeSpace } from "./repository";
import { searchKnowledge } from "./search";

export async function runKnowledgeAgentQuestion(params: {
  limit?: number;
  question: string;
  spaceId: string;
}): Promise<{
  answer: string;
  citations: AskKnowledgeCitation[];
  question: string;
  spaceId: string;
  toolCalls: number;
}> {
  const limit = params.limit ?? 3;

  await requireKnowledgeSpace(params.spaceId);

  if (!getOpenAIApiKey()) {
    throw new Error("OPENAI_API_KEY is required for Mastra agent execution");
  }

  const agent = createKnowledgeAgent({
    searchLimit: limit,
    spaceId: params.spaceId,
  });
  const output = await agent.generate(params.question);
  const citations = (
    await searchKnowledge({
      query: params.question,
      spaceId: params.spaceId,
      limit,
    })
  ).hits
    .slice(0, limit)
    .map((hit) => ({
      documentId: hit.documentId,
      spaceId: hit.spaceId,
      title: hit.title,
      snippet: hit.snippet,
      sourceFilename: hit.sourceFilename,
      downloadUrl: hit.downloadUrl,
    }));

  return {
    answer: output.text.trim(),
    citations,
    question: params.question,
    spaceId: params.spaceId,
    toolCalls: output.toolCalls.length,
  };
}
