import {
  getChatTitleApiKey,
  getChatTitleModel,
  getChatTitleUrl,
} from "./config";

const CHAT_TITLE_INPUT_MAX_CHARS = 500;
const CHAT_TITLE_MAX_CHARS = 30;
const CHAT_TITLE_REQUEST_TIMEOUT_MS = 8_000;

class ChatTitleGenerationTimeoutError extends Error {
  constructor() {
    super("Chat title generation timed out");
    this.name = "ChatTitleGenerationTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ChatTitleGenerationTimeoutError());
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function limitText(value: string, maxChars: number): string {
  return normalizeWhitespace(value).slice(0, maxChars).trim();
}

function readUnknownText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => readUnknownText(item)).join("");
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  if ("text" in value) {
    return readUnknownText((value as { text?: unknown }).text);
  }

  if ("content" in value) {
    return readUnknownText((value as { content?: unknown }).content);
  }

  return "";
}

function readChatCompletionMessageContent(payload: unknown): string {
  if (!payload || typeof payload !== "object" || !("choices" in payload)) {
    return "";
  }

  const choices = (payload as { choices?: unknown }).choices;

  if (!Array.isArray(choices) || choices.length === 0) {
    return "";
  }

  const firstChoice = choices[0];

  if (!firstChoice || typeof firstChoice !== "object") {
    return "";
  }

  return readUnknownText(
    (firstChoice as { message?: { content?: unknown } }).message?.content,
  );
}

function stripTitleDecorations(value: string): string {
  return value
    .replace(/^(?:标题|会话标题)\s*[:：-]\s*/iu, "")
    .replace(/^[`"'“”‘’《》「」『』【】[\]()（）]+/u, "")
    .replace(/[`"'“”‘’《》「」『』【】[\]()（）]+$/u, "")
    .replace(/[。！？!?；;，,、:：]+$/u, "")
    .replace(/(?:对话|会话)+$/u, "")
    .trim();
}

function normalizeCandidateTitle(value: string): string {
  return limitText(
    stripTitleDecorations(normalizeWhitespace(value)),
    CHAT_TITLE_MAX_CHARS,
  );
}

export function buildChatTitleExcerpt(query: string): string {
  return limitText(query, CHAT_TITLE_INPUT_MAX_CHARS);
}

export function buildFallbackChatTitle(query: string): string {
  const excerpt = buildChatTitleExcerpt(query);

  if (!excerpt) {
    return "";
  }

  const firstLine = excerpt.split(/\r?\n/u)[0] ?? excerpt;
  const firstSentence =
    firstLine.split(/[。！？!?]/u).find((part) => part.trim()) ?? firstLine;

  return (
    normalizeCandidateTitle(firstSentence) ||
    normalizeCandidateTitle(excerpt) ||
    limitText(excerpt, CHAT_TITLE_MAX_CHARS)
  );
}

function summarizeResponseError(payload: string): string {
  return normalizeWhitespace(payload).slice(0, 200);
}

export async function generateChatTitle(query: string): Promise<string> {
  const excerpt = buildChatTitleExcerpt(query);

  if (!excerpt) {
    return "";
  }

  const apiKey = getChatTitleApiKey();

  if (!apiKey) {
    throw new Error("Missing chat title API key");
  }

  const content = await withTimeout(
    (async () => {
      const response = await fetch(getChatTitleUrl("chat/completions"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: getChatTitleModel(),
          temperature: 0,
          max_tokens: 40,
          messages: [
            {
              role: "system",
              content:
                "你负责生成聊天会话标题。请根据用户首条提问输出一个简短明确的标题，限制在30个字以内。只输出标题本身，不要加引号，不要加句号，不要包含“对话”或“会话”这两个词。",
            },
            {
              role: "user",
              content: excerpt,
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(summarizeResponseError(await response.text()));
      }

      return readChatCompletionMessageContent(await response.json());
    })(),
    CHAT_TITLE_REQUEST_TIMEOUT_MS,
  );

  return normalizeCandidateTitle(content) || buildFallbackChatTitle(excerpt);
}
