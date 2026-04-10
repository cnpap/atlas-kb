import type { ChatReplyStreamDataEvent } from "@atlas-kb/schema";

export type ChatReplyProgressItemStatus = "running" | "completed" | "failed";

export type ChatReplyProgressItem = {
  id: string;
  kind: "thinking" | "tool" | "error";
  label: string;
  status: ChatReplyProgressItemStatus;
};

export type ChatReplyProgressState = {
  items: ChatReplyProgressItem[];
  runId: string;
  status: "running" | "completed" | "failed";
  summaryLabel: string;
};

function ensureState(
  current: ChatReplyProgressState | null,
  runId: string,
): ChatReplyProgressState {
  return (
    current ?? {
      items: [],
      runId,
      status: "running",
      summaryLabel: "正在准备回答",
    }
  );
}

function upsertItem(
  items: ChatReplyProgressItem[],
  nextItem: ChatReplyProgressItem,
) {
  const targetIndex = items.findIndex((item) => item.id === nextItem.id);

  if (targetIndex >= 0) {
    items[targetIndex] = nextItem;
    return;
  }

  items.push(nextItem);
}

function markThinkingCompleted(items: ChatReplyProgressItem[]) {
  const thinkingItem = items.find((item) => item.kind === "thinking");

  if (!thinkingItem || thinkingItem.status !== "running") {
    return;
  }

  thinkingItem.status = "completed";
}

function markRunningItemsCompleted(items: ChatReplyProgressItem[]) {
  for (const item of items) {
    if (item.status === "running") {
      item.status = "completed";
    }
  }
}

function addFailureItem(items: ChatReplyProgressItem[], message: string) {
  upsertItem(items, {
    id: "error",
    kind: "error",
    label: message,
    status: "failed",
  });
}

export function applyChatReplyProgressEvent(
  current: ChatReplyProgressState | null,
  event: ChatReplyStreamDataEvent,
): ChatReplyProgressState | null {
  switch (event.type) {
    case "reply-progress-started":
      return {
        items: [],
        runId: event.runId,
        status: "running",
        summaryLabel: "正在准备回答",
      };
    case "reply-progress-thinking": {
      const nextState = ensureState(current, event.runId);

      nextState.summaryLabel = event.label;
      nextState.status = "running";

      upsertItem(nextState.items, {
        id: "thinking",
        kind: "thinking",
        label: event.label,
        status: "running",
      });

      return {
        ...nextState,
        items: [...nextState.items],
      };
    }
    case "reply-progress-tool-started": {
      const nextState = ensureState(current, event.runId);

      markThinkingCompleted(nextState.items);
      nextState.summaryLabel = `正在执行：${event.toolLabel}`;
      nextState.status = "running";

      upsertItem(nextState.items, {
        id: `tool:${event.toolCallId}`,
        kind: "tool",
        label: event.toolLabel,
        status: "running",
      });

      return {
        ...nextState,
        items: [...nextState.items],
      };
    }
    case "reply-progress-tool-succeeded": {
      const nextState = ensureState(current, event.runId);

      upsertItem(nextState.items, {
        id: `tool:${event.toolCallId}`,
        kind: "tool",
        label: event.toolLabel,
        status: "completed",
      });
      nextState.summaryLabel = "正在整理回答";
      nextState.status = "running";

      return {
        ...nextState,
        items: [...nextState.items],
      };
    }
    case "reply-progress-tool-failed": {
      const nextState = ensureState(current, event.runId);

      upsertItem(nextState.items, {
        id: `tool:${event.toolCallId}`,
        kind: "tool",
        label: `${event.toolLabel}失败`,
        status: "failed",
      });
      nextState.summaryLabel = event.message;
      nextState.status = "failed";

      return {
        ...nextState,
        items: [...nextState.items],
      };
    }
    case "reply-progress-step-finished": {
      const nextState = ensureState(current, event.runId);

      markThinkingCompleted(nextState.items);
      nextState.summaryLabel = "正在整理回答";

      return {
        ...nextState,
        items: [...nextState.items],
      };
    }
    case "reply-progress-finished":
    case "reply-completed": {
      const nextState =
        "runId" in event ? ensureState(current, event.runId) : current;

      if (!nextState) {
        return null;
      }

      markRunningItemsCompleted(nextState.items);
      nextState.summaryLabel = "已完成";
      nextState.status = "completed";

      return {
        ...nextState,
        items: [...nextState.items],
      };
    }
    case "reply-progress-failed": {
      const nextState = ensureState(current, event.runId);

      addFailureItem(nextState.items, event.message);
      nextState.summaryLabel = event.message;
      nextState.status = "failed";

      return {
        ...nextState,
        items: [...nextState.items],
      };
    }
    case "reply-error": {
      const nextState =
        current ??
        ({
          items: [],
          runId: "chat-reply",
          status: "failed",
          summaryLabel: event.message,
        } satisfies ChatReplyProgressState);

      addFailureItem(nextState.items, event.message);
      nextState.summaryLabel = event.message;
      nextState.status = "failed";

      return {
        ...nextState,
        items: [...nextState.items],
      };
    }
    case "reply-accepted":
      return current;
  }
}

export function reduceChatReplyProgressEvents(
  events: ChatReplyStreamDataEvent[],
): ChatReplyProgressState | null {
  return events.reduce<ChatReplyProgressState | null>(
    (state, event) => applyChatReplyProgressEvent(state, event),
    null,
  );
}
