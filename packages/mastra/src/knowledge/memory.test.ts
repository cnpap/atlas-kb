import { describe, expect, it } from "bun:test";
import type { MastraDBMessage } from "@mastra/core/agent";
import {
  KNOWLEDGE_MEMORY_MESSAGE_MAX_CHARS,
  KNOWLEDGE_MEMORY_TRUNCATION_NOTICE,
  sanitizeKnowledgeMemoryMessage,
} from "../memory";

function createMessage(
  parts: MastraDBMessage["content"]["parts"],
): MastraDBMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    createdAt: new Date("2026-04-12T00:00:00.000Z"),
    threadId: "thread-1",
    resourceId: "resource-1",
    content: {
      format: 2,
      parts,
    },
  };
}

describe("knowledge memory sanitization", () => {
  it("keeps only text parts and drops cached provider metadata", () => {
    const message = createMessage([
      {
        type: "text",
        text: "保留文本",
        providerMetadata: {
          mastra: {
            cachedTokens: 999,
          },
        },
      },
      {
        type: "reasoning",
        text: "推理内容不应进入持久化记忆",
      },
      {
        type: "data-om-status",
        data: {
          pendingMessageTokens: 123,
        },
      },
      {
        type: "tool-search_knowledge",
        toolCallId: "tool-1",
        state: "output-available",
        input: {
          query: "部门职责",
        },
        output: {
          hits: [],
        },
      },
    ] as unknown as MastraDBMessage["content"]["parts"]);

    const sanitized = sanitizeKnowledgeMemoryMessage(message);

    expect(sanitized).not.toBeNull();
    expect(sanitized?.content.parts).toHaveLength(1);
    expect(sanitized?.content.parts[0]).toMatchObject({
      type: "text",
      text: "保留文本",
    });
    expect("providerMetadata" in (sanitized?.content.parts[0] ?? {})).toBe(
      false,
    );
  });

  it("truncates oversized text messages to the configured bound", () => {
    const oversizedText = "x".repeat(KNOWLEDGE_MEMORY_MESSAGE_MAX_CHARS + 256);
    const message = createMessage([
      {
        type: "text",
        text: oversizedText,
      },
      {
        type: "text",
        text: "这段内容不应再进入同一条 message。",
      },
    ] as unknown as MastraDBMessage["content"]["parts"]);

    const sanitized = sanitizeKnowledgeMemoryMessage(message);
    const savedText = sanitized?.content.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");

    expect(sanitized).not.toBeNull();
    expect(sanitized?.content.parts).toHaveLength(1);
    expect(savedText?.length).toBe(KNOWLEDGE_MEMORY_MESSAGE_MAX_CHARS);
    expect(savedText?.endsWith(KNOWLEDGE_MEMORY_TRUNCATION_NOTICE)).toBe(true);
  });
});
