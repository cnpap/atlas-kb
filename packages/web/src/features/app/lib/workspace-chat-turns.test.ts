import { describe, expect, it } from "bun:test";
import type { ChatMessage } from "@atlas-kb/schema";
import {
  buildWorkspaceChatTurns,
  getWorkspaceChatTurnStatus,
} from "./workspace-chat-turns";

function createUserMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    citations: [],
    content: "请总结这份资料。",
    createdAt: "2026-03-29T00:00:00.000Z",
    id: "user-1",
    role: "user",
    sessionId: "session-1",
    ...overrides,
  };
}

function createAssistantMessage(
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    citations: [],
    content: "这是最终回答。",
    createdAt: "2026-03-29T00:00:02.000Z",
    id: "assistant-1",
    role: "assistant",
    sessionId: "session-1",
    ...overrides,
  };
}

describe("workspace chat turns", () => {
  it("groups a user message and assistant message into one turn", () => {
    const turns = buildWorkspaceChatTurns(
      [createUserMessage(), createAssistantMessage()],
      {
        selectedAssistantMessageId: "assistant-1",
      },
    );

    expect(turns).toHaveLength(1);
    expect(turns[0]?.id).toBe("turn-0");
    expect(turns[0]?.userMessage?.id).toBe("user-1");
    expect(turns[0]?.assistantMessage?.id).toBe("assistant-1");
    expect(turns[0]?.isSelected).toBe(true);
    expect(turns[0]?.status).toBe("completed");
  });

  it("treats temporary assistant messages as streaming turns", () => {
    const assistantMessage = createAssistantMessage({
      content: "",
      id: "temp:assistant-1",
    });

    const turns = buildWorkspaceChatTurns([
      createUserMessage(),
      assistantMessage,
    ]);

    expect(turns[0]?.assistantMessage?.id).toBe("temp:assistant-1");
    expect(getWorkspaceChatTurnStatus(turns[0]!)).toBe("streaming");
  });

  it("keeps turn ids stable when temporary ids are replaced by persisted ids", () => {
    const draftTurns = buildWorkspaceChatTurns([
      createUserMessage({
        id: "temp:user-1",
      }),
      createAssistantMessage({
        content: "",
        id: "temp:assistant-1",
      }),
    ]);
    const persistedTurns = buildWorkspaceChatTurns([
      createUserMessage(),
      createAssistantMessage(),
    ]);

    expect(draftTurns[0]?.id).toBe("turn-0");
    expect(persistedTurns[0]?.id).toBe("turn-0");
  });

  it("marks turns as failed when stream progress reports a failure", () => {
    const turns = buildWorkspaceChatTurns(
      [
        createUserMessage(),
        createAssistantMessage({
          content: "",
          id: "temp:assistant-1",
        }),
      ],
      {
        progressByMessageId: {
          "temp:assistant-1": {
            items: [],
            runId: "run-1",
            status: "failed",
            summaryLabel: "知识库回答失败",
          },
        },
      },
    );

    expect(turns[0]?.progress?.status).toBe("failed");
    expect(getWorkspaceChatTurnStatus(turns[0]!)).toBe("failed");
  });
});
