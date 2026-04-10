import { describe, expect, it } from "bun:test";
import { ChunkFrom, type ChunkType } from "@mastra/core/stream";
import { createChatReplyStreamEventMapper } from "./chat-stream-events";

function createChunk(chunk: Record<string, unknown>): ChunkType {
  return {
    from: ChunkFrom.AGENT,
    runId: "run-1",
    ...chunk,
  } as ChunkType;
}

describe("chat stream event mapper", () => {
  it("maps progress events from Mastra chunks", () => {
    const mapper = createChatReplyStreamEventMapper();

    const events = [
      ...mapper.mapChunk(
        createChunk({
          type: "start",
          payload: {},
        }),
      ),
      ...mapper.mapChunk(
        createChunk({
          type: "step-start",
          payload: {
            request: {},
          },
        }),
      ),
      ...mapper.mapChunk(
        createChunk({
          type: "reasoning-delta",
          payload: {
            id: "reasoning-1",
            text: "先分析问题",
          },
        }),
      ),
      ...mapper.mapChunk(
        createChunk({
          type: "reasoning-delta",
          payload: {
            id: "reasoning-1",
            text: "继续分析",
          },
        }),
      ),
      ...mapper.mapChunk(
        createChunk({
          type: "tool-call",
          payload: {
            toolCallId: "tool-1",
            toolName: "search_knowledge",
          },
        }),
      ),
      ...mapper.mapChunk(
        createChunk({
          type: "tool-result",
          payload: {
            args: {
              query: "知识库内容",
            },
            result: {
              hits: [],
            },
            toolCallId: "tool-1",
            toolName: "search_knowledge",
          },
        }),
      ),
      ...mapper.mapChunk(
        createChunk({
          type: "step-finish",
          payload: {
            metadata: {},
            output: {
              usage: {
                inputTokens: 1,
                outputTokens: 1,
                totalTokens: 2,
              },
            },
            stepResult: {
              reason: "stop",
            },
          },
        }),
      ),
      ...mapper.mapChunk(
        createChunk({
          type: "finish",
          payload: {
            metadata: {},
            output: {
              usage: {
                inputTokens: 1,
                outputTokens: 1,
                totalTokens: 2,
              },
            },
            stepResult: {
              reason: "stop",
            },
          },
        }),
      ),
    ];

    expect(events.map((event) => event.type)).toEqual([
      "reply-progress-started",
      "reply-progress-thinking",
      "reply-progress-tool-started",
      "reply-progress-tool-succeeded",
      "reply-progress-step-finished",
      "reply-progress-finished",
    ]);
    expect(events[2]).toMatchObject({
      toolLabel: "知识检索",
      type: "reply-progress-tool-started",
    });
  });

  it("maps tool failures and unknown tool labels", () => {
    const mapper = createChatReplyStreamEventMapper();

    const events = mapper.mapChunk(
      createChunk({
        type: "tool-error",
        payload: {
          error: new Error("调用失败"),
          toolCallId: "tool-2",
          toolName: "list_workspace_files",
        },
      }),
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      message: "调用失败",
      toolLabel: "list workspace files",
      type: "reply-progress-tool-failed",
    });
  });

  it("tolerates chunks without runId", () => {
    const mapper = createChatReplyStreamEventMapper();

    const events = mapper.mapChunk({
      from: ChunkFrom.AGENT,
      payload: {
        id: "reasoning-1",
        text: "正在分析",
      },
      type: "reasoning-delta",
    } as ChunkType);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      runId: "chat-reply",
      type: "reply-progress-thinking",
    });
  });
});
