import type { ChatReplyStreamDataEvent } from "@atlas-kb/schema";
import type { ChunkType } from "@mastra/core/stream";

const TOOL_LABELS: Record<string, string> = {
  search_knowledge: "知识检索",
};

function toReadableToolLabel(toolName: string): string {
  const knownLabel = TOOL_LABELS[toolName];

  if (knownLabel) {
    return knownLabel;
  }

  const segments = toolName
    .split(/[_-]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.length > 0 ? segments.join(" ") : "工具执行";
}

function readErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return fallback;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readChunkPayload(chunk: ChunkType): Record<string, unknown> {
  const payload = (chunk as { payload?: unknown }).payload;

  return payload && typeof payload === "object"
    ? (payload as Record<string, unknown>)
    : {};
}

export function createChatReplyStreamEventMapper() {
  let currentStepIndex = -1;
  let emittedFailure = false;
  let emittedFinish = false;
  let hasSeenStepStart = false;
  let hasThinkingInCurrentStep = false;
  let lastRunId = "";
  const toolStatuses = new Map<string, "running" | "completed" | "failed">();

  function getRunId(fallbackRunId?: string) {
    return lastRunId || fallbackRunId || "chat-reply";
  }

  function getActiveStepIndex() {
    if (currentStepIndex < 0) {
      currentStepIndex = 0;
    }

    return currentStepIndex;
  }

  function buildToolBaseEvent(params: {
    runId: string;
    toolCallId: string;
    toolName: string;
  }) {
    return {
      runId: params.runId,
      stepIndex: getActiveStepIndex(),
      toolCallId: params.toolCallId,
      toolLabel: toReadableToolLabel(params.toolName),
      toolName: params.toolName,
    };
  }

  function mapToolStartedEvent(params: {
    runId: string;
    toolCallId: string;
    toolName: string;
  }): ChatReplyStreamDataEvent[] {
    const currentStatus = toolStatuses.get(params.toolCallId);

    if (currentStatus) {
      return [];
    }

    toolStatuses.set(params.toolCallId, "running");

    return [
      {
        type: "reply-progress-tool-started",
        ...buildToolBaseEvent(params),
      },
    ];
  }

  function mapToolFinishedEvent(params: {
    fallbackMessage?: string;
    isError?: boolean;
    runId: string;
    toolCallId: string;
    toolName: string;
  }): ChatReplyStreamDataEvent[] {
    const currentStatus = toolStatuses.get(params.toolCallId);

    if (currentStatus === "completed" || currentStatus === "failed") {
      return [];
    }

    const baseEvent = buildToolBaseEvent(params);

    if (params.isError) {
      toolStatuses.set(params.toolCallId, "failed");

      return [
        {
          type: "reply-progress-tool-failed",
          ...baseEvent,
          message: params.fallbackMessage || "工具执行失败",
        },
      ];
    }

    toolStatuses.set(params.toolCallId, "completed");

    return [
      {
        type: "reply-progress-tool-succeeded",
        ...baseEvent,
      },
    ];
  }

  function ensureFailed(message: string, fallbackRunId?: string) {
    if (emittedFailure) {
      return null;
    }

    emittedFailure = true;

    return {
      type: "reply-progress-failed",
      runId: getRunId(fallbackRunId),
      stepIndex: currentStepIndex >= 0 ? currentStepIndex : undefined,
      message,
    } satisfies ChatReplyStreamDataEvent;
  }

  function ensureFinished(fallbackRunId?: string) {
    if (emittedFailure || emittedFinish) {
      return null;
    }

    emittedFinish = true;

    return {
      type: "reply-progress-finished",
      runId: getRunId(fallbackRunId),
      stepIndex: currentStepIndex >= 0 ? currentStepIndex : undefined,
    } satisfies ChatReplyStreamDataEvent;
  }

  return {
    ensureFailed,
    ensureFinished,
    mapChunk(chunk: ChunkType): ChatReplyStreamDataEvent[] {
      const runId = readNonEmptyString((chunk as { runId?: unknown }).runId);

      if (runId) {
        lastRunId = runId;
      }

      switch (chunk.type) {
        case "start":
          return [
            {
              type: "reply-progress-started",
              runId: getRunId(runId),
            },
          ];
        case "step-start":
          currentStepIndex = hasSeenStepStart
            ? currentStepIndex + 1
            : Math.max(currentStepIndex, 0);
          hasSeenStepStart = true;
          hasThinkingInCurrentStep = false;
          return [];
        case "reasoning-start":
        case "reasoning-delta":
          if (hasThinkingInCurrentStep) {
            return [];
          }

          hasThinkingInCurrentStep = true;

          return [
            {
              type: "reply-progress-thinking",
              runId: getRunId(runId),
              stepIndex: getActiveStepIndex(),
              label:
                getActiveStepIndex() === 0 ? "正在分析问题" : "正在继续分析",
            },
          ];
        case "tool-call": {
          const payload = readChunkPayload(chunk);
          const toolCallId = readNonEmptyString(payload.toolCallId);
          const toolName = readNonEmptyString(payload.toolName);

          if (!toolCallId || !toolName) {
            return [];
          }

          return mapToolStartedEvent({
            runId: getRunId(runId),
            toolCallId,
            toolName,
          });
        }
        case "tool-call-input-streaming-start": {
          const payload = readChunkPayload(chunk);
          const toolCallId = readNonEmptyString(payload.toolCallId);
          const toolName = readNonEmptyString(payload.toolName);

          if (!toolCallId || !toolName) {
            return [];
          }

          return mapToolStartedEvent({
            runId: getRunId(runId),
            toolCallId,
            toolName,
          });
        }
        case "tool-result": {
          const payload = readChunkPayload(chunk);
          const toolCallId = readNonEmptyString(payload.toolCallId);
          const toolName = readNonEmptyString(payload.toolName);

          if (!toolCallId || !toolName) {
            return [];
          }

          return mapToolFinishedEvent({
            isError: payload.isError === true,
            runId: getRunId(runId),
            toolCallId,
            toolName,
          });
        }
        case "tool-error": {
          const payload = readChunkPayload(chunk);
          const toolCallId = readNonEmptyString(payload.toolCallId);
          const toolName = readNonEmptyString(payload.toolName);

          if (!toolCallId || !toolName) {
            return [];
          }

          return mapToolFinishedEvent({
            fallbackMessage: readErrorMessage(payload.error, "工具执行失败"),
            isError: true,
            runId: getRunId(runId),
            toolCallId,
            toolName,
          });
        }
        case "step-finish":
          return [
            {
              type: "reply-progress-step-finished",
              runId: getRunId(runId),
              stepIndex: getActiveStepIndex(),
            },
          ];
        case "finish": {
          const finishedEvent = ensureFinished(runId);
          return finishedEvent ? [finishedEvent] : [];
        }
        case "error": {
          const payload = readChunkPayload(chunk);
          const failureEvent = ensureFailed(
            readErrorMessage(payload.error, "AI 对话失败"),
            runId,
          );

          return failureEvent ? [failureEvent] : [];
        }
        case "abort": {
          const failureEvent = ensureFailed("AI 对话已中断", runId);
          return failureEvent ? [failureEvent] : [];
        }
        default:
          return [];
      }
    },
  };
}
