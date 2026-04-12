import type { ChatReplyStreamDataEvent } from "@atlas-kb/schema";
import type { ChunkType } from "@mastra/core/stream";
import { normalizeWorkspaceDisplayPath } from "./workspace-paths";

const TOOL_LABELS: Record<string, string> = {
  mastra_workspace_list_files: "查看目录",
  mastra_workspace_read_file: "读取文件",
  mastra_workspace_search: "检索内容",
  search_knowledge: "知识检索",
};

type ToolPresentation = {
  toolDetail?: string;
  toolPath?: string;
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

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function readToolArgs(payload: Record<string, unknown>) {
  const directArgs = readRecord(payload.args);

  if (directArgs) {
    return directArgs;
  }

  const serializedArgs = readNonEmptyString(payload.args);

  if (!serializedArgs) {
    return null;
  }

  try {
    return readRecord(JSON.parse(serializedArgs));
  } catch {
    return null;
  }
}

function readToolPresentation(params: {
  payload: Record<string, unknown>;
  toolName: string;
}): ToolPresentation {
  const args = readToolArgs(params.payload);

  if (!args) {
    return {};
  }

  const path = readNonEmptyString(args.path);

  if (
    path &&
    (params.toolName === "mastra_workspace_read_file" ||
      params.toolName === "mastra_workspace_list_files")
  ) {
    return {
      toolDetail: normalizeWorkspaceDisplayPath(path),
      toolPath: normalizeWorkspaceDisplayPath(path),
    };
  }

  const query = readNonEmptyString(args.query);

  if (
    query &&
    (params.toolName === "mastra_workspace_search" ||
      params.toolName === "search_knowledge")
  ) {
    return {
      toolDetail: query,
    };
  }

  return {};
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
  const toolPresentations = new Map<string, ToolPresentation>();

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
    toolDetail?: string;
    runId: string;
    toolCallId: string;
    toolName: string;
    toolPath?: string;
  }) {
    return {
      runId: params.runId,
      stepIndex: getActiveStepIndex(),
      toolCallId: params.toolCallId,
      toolDetail: params.toolDetail,
      toolLabel: toReadableToolLabel(params.toolName),
      toolName: params.toolName,
      toolPath: params.toolPath,
    };
  }

  function rememberToolPresentation(
    toolCallId: string,
    presentation: ToolPresentation,
  ): ToolPresentation {
    const currentPresentation = toolPresentations.get(toolCallId) ?? {};
    const nextPresentation = {
      toolDetail: presentation.toolDetail ?? currentPresentation.toolDetail,
      toolPath: presentation.toolPath ?? currentPresentation.toolPath,
    };

    toolPresentations.set(toolCallId, nextPresentation);
    return nextPresentation;
  }

  function mapToolStartedEvent(params: {
    toolDetail?: string;
    runId: string;
    toolCallId: string;
    toolName: string;
    toolPath?: string;
  }): ChatReplyStreamDataEvent[] {
    const currentStatus = toolStatuses.get(params.toolCallId);
    const previousPresentation = toolPresentations.get(params.toolCallId);
    const presentation = rememberToolPresentation(params.toolCallId, {
      toolDetail: params.toolDetail,
      toolPath: params.toolPath,
    });

    if (currentStatus === "completed" || currentStatus === "failed") {
      return [];
    }

    const baseEvent = buildToolBaseEvent({
      ...params,
      ...presentation,
    });

    if (currentStatus === "running") {
      if (
        previousPresentation?.toolDetail === presentation.toolDetail &&
        previousPresentation?.toolPath === presentation.toolPath
      ) {
        return [];
      }

      return [
        {
          type: "reply-progress-tool-started",
          ...baseEvent,
        },
      ];
    }

    toolStatuses.set(params.toolCallId, "running");

    return [
      {
        type: "reply-progress-tool-started",
        ...baseEvent,
      },
    ];
  }

  function mapToolFinishedEvent(params: {
    fallbackMessage?: string;
    isError?: boolean;
    toolDetail?: string;
    runId: string;
    toolCallId: string;
    toolName: string;
    toolPath?: string;
  }): ChatReplyStreamDataEvent[] {
    const currentStatus = toolStatuses.get(params.toolCallId);

    if (currentStatus === "completed" || currentStatus === "failed") {
      return [];
    }

    const presentation = rememberToolPresentation(params.toolCallId, {
      toolDetail: params.toolDetail,
      toolPath: params.toolPath,
    });
    const baseEvent = buildToolBaseEvent({
      ...params,
      ...presentation,
    });

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

          const presentation = readToolPresentation({
            payload,
            toolName,
          });

          return mapToolStartedEvent({
            runId: getRunId(runId),
            toolCallId,
            toolDetail: presentation.toolDetail,
            toolName,
            toolPath: presentation.toolPath,
          });
        }
        case "tool-call-input-streaming-start": {
          const payload = readChunkPayload(chunk);
          const toolCallId = readNonEmptyString(payload.toolCallId);
          const toolName = readNonEmptyString(payload.toolName);

          if (!toolCallId || !toolName) {
            return [];
          }

          const presentation = readToolPresentation({
            payload,
            toolName,
          });

          return mapToolStartedEvent({
            runId: getRunId(runId),
            toolCallId,
            toolDetail: presentation.toolDetail,
            toolName,
            toolPath: presentation.toolPath,
          });
        }
        case "tool-result": {
          const payload = readChunkPayload(chunk);
          const toolCallId = readNonEmptyString(payload.toolCallId);
          const toolName = readNonEmptyString(payload.toolName);

          if (!toolCallId || !toolName) {
            return [];
          }

          const presentation = readToolPresentation({
            payload,
            toolName,
          });

          return mapToolFinishedEvent({
            isError: payload.isError === true,
            runId: getRunId(runId),
            toolCallId,
            toolDetail: presentation.toolDetail,
            toolName,
            toolPath: presentation.toolPath,
          });
        }
        case "tool-error": {
          const payload = readChunkPayload(chunk);
          const toolCallId = readNonEmptyString(payload.toolCallId);
          const toolName = readNonEmptyString(payload.toolName);

          if (!toolCallId || !toolName) {
            return [];
          }

          const presentation = readToolPresentation({
            payload,
            toolName,
          });

          return mapToolFinishedEvent({
            fallbackMessage: readErrorMessage(payload.error, "工具执行失败"),
            isError: true,
            runId: getRunId(runId),
            toolCallId,
            toolDetail: presentation.toolDetail,
            toolName,
            toolPath: presentation.toolPath,
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
