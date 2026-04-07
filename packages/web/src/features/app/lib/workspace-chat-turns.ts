import type { ChatMessage } from "@atlas-kb/schema";

export type WorkspaceChatTurnStatus =
  | "pending"
  | "streaming"
  | "completed"
  | "failed";

export type WorkspaceChatTurn = {
  assistantMessage: ChatMessage | null;
  createdAt: string;
  id: string;
  isSelected: boolean;
  status: WorkspaceChatTurnStatus;
  userMessage: ChatMessage | null;
};

type MutableWorkspaceChatTurn = Omit<
  WorkspaceChatTurn,
  "isSelected" | "status"
>;

function createTurn(
  turnIndex: number,
  seed: {
    assistantMessage?: ChatMessage | null;
    createdAt: string;
    userMessage?: ChatMessage | null;
  },
): MutableWorkspaceChatTurn {
  return {
    assistantMessage: seed.assistantMessage ?? null,
    createdAt: seed.createdAt,
    id: `turn-${turnIndex}`,
    userMessage: seed.userMessage ?? null,
  };
}

export function getWorkspaceChatTurnStatus(
  turn: Pick<WorkspaceChatTurn, "assistantMessage">,
): WorkspaceChatTurnStatus {
  const assistantMessage = turn.assistantMessage;

  if (!assistantMessage) {
    return "pending";
  }

  if (assistantMessage.id.startsWith("temp:")) {
    return "streaming";
  }

  return assistantMessage.content.trim() ? "completed" : "pending";
}

export function buildWorkspaceChatTurns(
  messages: ChatMessage[],
  options: {
    selectedAssistantMessageId?: string;
  } = {},
): WorkspaceChatTurn[] {
  const turns: MutableWorkspaceChatTurn[] = [];
  let pendingTurn: MutableWorkspaceChatTurn | null = null;

  for (const message of messages) {
    if (message.role === "user") {
      const turn = createTurn(turns.length, {
        createdAt: message.createdAt,
        userMessage: message,
      });

      turns.push(turn);
      pendingTurn = turn;
      continue;
    }

    const targetTurn =
      pendingTurn ??
      createTurn(turns.length, {
        assistantMessage: message,
        createdAt: message.createdAt,
      });

    if (!pendingTurn) {
      turns.push(targetTurn);
    }

    targetTurn.assistantMessage = message;
    pendingTurn = null;
  }

  return turns.map((turn) => ({
    ...turn,
    isSelected:
      Boolean(options.selectedAssistantMessageId) &&
      turn.assistantMessage?.id === options.selectedAssistantMessageId,
    status: getWorkspaceChatTurnStatus(turn),
  }));
}
