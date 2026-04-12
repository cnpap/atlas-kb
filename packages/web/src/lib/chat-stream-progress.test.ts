import { describe, expect, it } from "bun:test";
import type { ChatReplyStreamDataEvent } from "@atlas-kb/schema";
import {
  applyChatReplyProgressEvent,
  reduceChatReplyProgressEvents,
} from "./chat-stream-progress";

describe("chat stream progress", () => {
  it("deduplicates thinking updates and tracks tool status", () => {
    const events: ChatReplyStreamDataEvent[] = [
      {
        type: "reply-progress-started",
        runId: "run-1",
      },
      {
        type: "reply-progress-thinking",
        label: "正在分析问题",
        runId: "run-1",
        stepIndex: 0,
      },
      {
        type: "reply-progress-thinking",
        label: "正在分析问题",
        runId: "run-1",
        stepIndex: 0,
      },
      {
        type: "reply-progress-tool-started",
        runId: "run-1",
        stepIndex: 0,
        toolCallId: "tool-1",
        toolDetail: "/约稿函.docx",
        toolLabel: "知识检索",
        toolName: "search_knowledge",
      },
      {
        type: "reply-progress-tool-succeeded",
        runId: "run-1",
        stepIndex: 0,
        toolCallId: "tool-1",
        toolDetail: "/约稿函.docx",
        toolLabel: "知识检索",
        toolName: "search_knowledge",
      },
      {
        type: "reply-progress-finished",
        runId: "run-1",
      },
    ];

    const state = reduceChatReplyProgressEvents(events);

    expect(state).not.toBeNull();
    expect(state?.status).toBe("completed");
    expect(state?.items).toHaveLength(2);
    expect(state?.items[0]).toMatchObject({
      kind: "thinking",
      status: "completed",
    });
    expect(state?.items[1]).toMatchObject({
      kind: "tool",
      label: "知识检索 · /约稿函.docx",
      status: "completed",
    });
  });

  it("keeps failure details visible after reply errors", () => {
    const state = applyChatReplyProgressEvent(null, {
      type: "reply-error",
      message: "知识库回答失败",
    });

    expect(state).not.toBeNull();
    expect(state?.status).toBe("failed");
    expect(state?.items.at(-1)).toMatchObject({
      kind: "error",
      label: "知识库回答失败",
      status: "failed",
    });
  });
});
