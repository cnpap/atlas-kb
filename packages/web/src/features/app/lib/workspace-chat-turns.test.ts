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
    trace: [
      {
        createdAt: "2026-03-29T00:00:01.000Z",
        detail: "查询变体 2 个。",
        id: "status:search",
        kind: "search",
        state: "completed",
        title: "命中 6 条资料",
      },
      {
        createdAt: "2026-03-29T00:00:00.000Z",
        id: "status:reply",
        kind: "status",
        state: "running",
        title: "已提交问题，正在准备检索",
      },
    ],
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
    expect(turns[0]?.traceEvents.map((event) => event.id)).toEqual([
      "status:reply",
      "status:search",
    ]);
    expect(turns[0]?.isSelected).toBe(true);
    expect(turns[0]?.status).toBe("streaming");
  });

  it("keeps partial answer content visible when the assistant trace fails", () => {
    const assistantMessage = createAssistantMessage({
      content: "这是保留下来的部分回答。",
      trace: [
        {
          createdAt: "2026-03-29T00:00:01.000Z",
          detail: "模型响应中断。",
          id: "status:reply",
          kind: "status",
          state: "failed",
          title: "回答生成失败",
        },
      ],
    });

    const turns = buildWorkspaceChatTurns([
      createUserMessage(),
      assistantMessage,
    ]);

    expect(turns[0]?.assistantMessage?.content).toBe(
      "这是保留下来的部分回答。",
    );
    expect(getWorkspaceChatTurnStatus(turns[0]!)).toBe("failed");
  });

  it("keeps turn ids stable when temporary ids are replaced by persisted ids", () => {
    const draftTurns = buildWorkspaceChatTurns([
      createUserMessage({
        id: "temp:user-1",
      }),
      createAssistantMessage({
        content: "",
        id: "temp:assistant-1",
        trace: [
          {
            createdAt: "2026-03-29T00:00:00.000Z",
            id: "status:reply",
            kind: "status",
            state: "running",
            title: "已提交问题，正在准备检索",
          },
        ],
      }),
    ]);
    const persistedTurns = buildWorkspaceChatTurns([
      createUserMessage(),
      createAssistantMessage({
        trace: [
          {
            createdAt: "2026-03-29T00:00:00.000Z",
            id: "status:reply",
            kind: "status",
            state: "completed",
            title: "已提交问题，正在准备检索",
          },
        ],
      }),
    ]);

    expect(draftTurns[0]?.id).toBe("turn-0");
    expect(persistedTurns[0]?.id).toBe("turn-0");
  });
});
