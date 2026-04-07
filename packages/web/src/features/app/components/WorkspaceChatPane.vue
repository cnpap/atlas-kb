<script setup lang="ts">
  import type {
    ChatMessage,
    ChatTraceEvent,
    ChatSession,
  } from "@atlas-kb/schema";
  import {
    ArrowUp,
    Check,
    ChevronDown,
    Copy,
    FileText,
    LoaderCircle,
    MessageSquare,
    ThumbsDown,
    ThumbsUp,
  } from "lucide-vue-next";
  import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
  import type {
    WorkspaceChatTurn,
    WorkspaceChatTurnStatus,
  } from "@/features/app/lib/workspace-chat-turns";
  import { formatDateTime, formatRelativeTime } from "@/lib/knowledge-ui";
  import { renderMarkdown } from "@/lib/markdown";

  const props = defineProps<{
    activeSession: ChatSession | null;
    activeSessionCollectionLabel: string;
    composer: string;
    replying: boolean;
    turns: WorkspaceChatTurn[];
  }>();

  const emit = defineEmits<{
    feedback: [message: ChatMessage, rating: "up" | "down"];
    renameSession: [];
    selectAssistantMessage: [messageId: string];
    submit: [];
    "update:composer": [value: string];
  }>();

  const scrollerRef = ref<HTMLDivElement | null>(null);
  const stickToBottom = ref(true);
  const copiedItemId = ref("");
  const expandedTraceKeys = ref<Record<string, boolean>>({});
  const markdownCache = new Map<string, { content: string; html: string }>();

  let copiedResetTimer: number | undefined;

  const lastTurnRenderKey = computed(() => {
    const turn = props.turns.at(-1);

    if (!turn) {
      return "";
    }

    return [
      turn.id,
      turn.status,
      turn.assistantMessage?.id ?? "",
      turn.assistantMessage?.content.length ?? 0,
      turn.traceEvents.length,
      turn.traceEvents.at(-1)?.id ?? "",
      turn.traceEvents.at(-1)?.state ?? "",
    ].join(":");
  });

  function getTraceStateLabel(state: ChatTraceEvent["state"]): string {
    switch (state) {
      case "completed":
        return "已完成";
      case "failed":
        return "失败";
      case "info":
        return "过程";
      default:
        return "进行中";
    }
  }

  function getTraceKindLabel(kind: ChatTraceEvent["kind"]): string {
    switch (kind) {
      case "search":
        return "检索";
      case "tool-call":
        return "工具";
      case "reasoning":
        return "组织";
      case "error":
        return "错误";
      default:
        return "状态";
    }
  }

  function getTurnStatusLabel(status: WorkspaceChatTurnStatus): string {
    switch (status) {
      case "completed":
        return "已完成";
      case "failed":
        return "失败";
      case "streaming":
        return "生成中";
      default:
        return "等待中";
    }
  }

  function getDistanceFromBottom(element: HTMLDivElement): number {
    return element.scrollHeight - element.scrollTop - element.clientHeight;
  }

  function syncStickToBottom() {
    const element = scrollerRef.value;

    if (!element) {
      return;
    }

    stickToBottom.value = getDistanceFromBottom(element) <= 96;
  }

  async function scrollToBottom(force = false) {
    await nextTick();
    const element = scrollerRef.value;

    if (!element || (!force && !stickToBottom.value)) {
      return;
    }

    element.scrollTop = element.scrollHeight;
  }

  function getAssistantHtml(turn: WorkspaceChatTurn): string {
    const assistantMessage = turn.assistantMessage;

    if (!assistantMessage?.content.trim()) {
      return "";
    }

    const cached = markdownCache.get(assistantMessage.id);

    if (cached && cached.content === assistantMessage.content) {
      return cached.html;
    }

    const html = renderMarkdown(assistantMessage.content);
    markdownCache.set(assistantMessage.id, {
      content: assistantMessage.content,
      html,
    });
    return html;
  }

  function getTurnFailureMessage(turn: WorkspaceChatTurn): string {
    const failedEvent = [...turn.traceEvents]
      .reverse()
      .find((event) => event.state === "failed");

    return (
      failedEvent?.detail ||
      failedEvent?.title ||
      "回答在生成过程中中断，已保留当前可见内容。"
    );
  }

  function getAssistantCopyText(turn: WorkspaceChatTurn): string {
    return turn.assistantMessage?.content.trim() || getTurnFailureMessage(turn);
  }

  function getTraceCopyText(event: ChatTraceEvent): string {
    return event.detail ? `${event.title}\n\n${event.detail}` : event.title;
  }

  function buildTraceKey(turnId: string, traceId: string): string {
    return `${turnId}:trace:${traceId}`;
  }

  function isTraceExpanded(turnId: string, traceId: string): boolean {
    return expandedTraceKeys.value[buildTraceKey(turnId, traceId)] === true;
  }

  function toggleTraceExpanded(turnId: string, traceId: string) {
    const key = buildTraceKey(turnId, traceId);
    expandedTraceKeys.value = {
      ...expandedTraceKeys.value,
      [key]: !expandedTraceKeys.value[key],
    };
  }

  function clearCopiedStateTimer() {
    if (copiedResetTimer) {
      window.clearTimeout(copiedResetTimer);
      copiedResetTimer = undefined;
    }
  }

  async function writeClipboardText(text: string) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();

    const copied = document.execCommand("copy");
    textarea.remove();

    if (!copied) {
      throw new Error("copy failed");
    }
  }

  async function copyText(itemId: string, value: string) {
    const text = value.trim();

    if (!text) {
      return;
    }

    await writeClipboardText(text);
    copiedItemId.value = itemId;
    clearCopiedStateTimer();
    copiedResetTimer = window.setTimeout(() => {
      copiedItemId.value = "";
      copiedResetTimer = undefined;
    }, 1600);
  }

  function selectAssistantTurn(turn: WorkspaceChatTurn) {
    const assistantMessageId = turn.assistantMessage?.id;

    if (!assistantMessageId) {
      return;
    }

    emit("selectAssistantMessage", assistantMessageId);
  }

  watch(
    () => props.activeSession?.id,
    () => {
      markdownCache.clear();
      copiedItemId.value = "";
      expandedTraceKeys.value = {};
      stickToBottom.value = true;
      void scrollToBottom(true);
    },
    {
      flush: "post",
    },
  );

  watch(
    lastTurnRenderKey,
    () => {
      void scrollToBottom();
    },
    {
      flush: "post",
    },
  );

  onBeforeUnmount(() => {
    clearCopiedStateTimer();
  });
</script>

<template>
  <section class="workbench-pane center-pane chat-pane">
    <div class="pane-header">
      <div class="min-w-0">
        <p class="truncate text-sm font-bold text-[var(--text-strong)]">
          {{ activeSession?.title || "新对话" }}
        </p>
        <div class="mt-0.5 flex items-center gap-2">
          <span
            class="rounded-[4px] bg-[var(--bg-canvas-strong)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]"
          >
            {{ activeSessionCollectionLabel }}
          </span>
          <span v-if="activeSession" class="text-[10px] text-[var(--text-dim)]">
            {{ formatRelativeTime(activeSession.updatedAt) }}
          </span>
        </div>
      </div>
      <button
        class="soft-button !rounded-[6px] !p-2"
        title="重命名"
        type="button"
        :disabled="!activeSession"
        @click="emit('renameSession')"
      >
        <FileText class="size-4" />
      </button>
    </div>

    <div
      ref="scrollerRef"
      class="chat-scroll-container"
      @scroll="syncStickToBottom"
    >
      <div
        v-if="turns.length === 0"
        class="empty-state my-auto max-w-sm self-center items-center text-center"
      >
        <div class="mb-2 rounded-[6px] bg-[rgba(255,251,244,0.9)] p-3">
          <MessageSquare class="size-6 text-[var(--accent)]" />
        </div>
        <p class="card-heading">开始深度知识问答</p>
        <p class="text-sm leading-6 text-[var(--text-muted)]">
          选择一个资料文件夹，智能体会先检索你的资料，再基于证据组织回答。
        </p>
      </div>

      <div v-else class="chat-block-list">
        <template v-for="turn in turns" :key="turn.id">
          <section
            v-if="turn.userMessage"
            class="stack-item ml-auto w-full max-w-[76%] !rounded-[8px] !border-[rgba(93,72,34,0.08)] !bg-[rgba(255,252,247,0.94)] !px-3.5 !py-3 shadow-none"
          >
            <div class="block-header">
              <span class="block-label">提问</span>
            </div>
            <p
              class="block-text whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-strong)]"
            >
              {{ turn.userMessage.content }}
            </p>
            <div class="block-footer">
              <span class="block-time">
                {{ formatDateTime(turn.userMessage.createdAt) }}
              </span>
              <div class="block-actions">
                <button
                  class="block-action"
                  title="复制消息"
                  type="button"
                  @click.stop="copyText(`copy:${turn.userMessage.id}`, turn.userMessage.content)"
                >
                  <Check
                    v-if="copiedItemId === `copy:${turn.userMessage.id}`"
                    class="size-3.5"
                  />
                  <Copy v-else class="size-3.5" />
                </button>
              </div>
            </div>
          </section>

          <section
            v-for="event in turn.traceEvents"
            :key="`${turn.id}:trace:${event.id}`"
            class="stack-item w-full !rounded-[8px] !px-3.5 !py-3 shadow-none"
            :class="[
              event.state === 'failed'
                ? '!border-[rgba(154,52,18,0.16)] !bg-[rgba(255,248,243,0.94)]'
                : event.state === 'completed'
                  ? '!border-[rgba(93,72,34,0.08)] !bg-[rgba(255,252,247,0.94)]'
                  : '!border-[rgba(93,72,34,0.08)] !bg-[rgba(255,251,244,0.82)]',
            ]"
          >
            <div class="block-header">
              <div class="block-header-group">
                <span class="block-label">执行</span>
                <span class="block-kind"
                  >{{ getTraceKindLabel(event.kind) }}</span
                >
                <span class="block-state" :class="`is-${event.state}`">
                  {{ getTraceStateLabel(event.state) }}
                </span>
              </div>
            </div>
            <div class="trace-summary-row">
              <p class="trace-title">{{ event.title }}</p>
              <button
                v-if="event.detail"
                class="trace-toggle"
                type="button"
                :aria-expanded="isTraceExpanded(turn.id, event.id)"
                @click.stop="toggleTraceExpanded(turn.id, event.id)"
              >
                <span
                  >{{ isTraceExpanded(turn.id, event.id) ? "收起详情" : "查看详情" }}</span
                >
                <ChevronDown
                  class="size-3.5 transition-transform"
                  :class="isTraceExpanded(turn.id, event.id) ? 'rotate-180' : ''"
                />
              </button>
            </div>
            <p
              v-if="event.detail && isTraceExpanded(turn.id, event.id)"
              class="trace-detail whitespace-pre-wrap text-[12px] leading-6 text-[var(--text-muted)]"
            >
              {{ event.detail }}
            </p>
            <div class="block-footer">
              <span class="block-time">
                {{ formatDateTime(event.createdAt) }}
              </span>
              <div class="block-actions">
                <button
                  class="block-action"
                  title="复制消息"
                  type="button"
                  @click.stop="copyText(`copy:${turn.id}:trace:${event.id}`, getTraceCopyText(event))"
                >
                  <Check
                    v-if="copiedItemId === `copy:${turn.id}:trace:${event.id}`"
                    class="size-3.5"
                  />
                  <Copy v-else class="size-3.5" />
                </button>
              </div>
            </div>
          </section>

          <section
            v-if="turn.assistantMessage || turn.status !== 'pending'"
            class="stack-item w-full !rounded-[8px] !px-3.5 !py-3 shadow-none transition-colors"
            :class="[
              turn.isSelected
                ? '!border-[rgba(15,118,110,0.28)] !bg-[rgba(15,118,110,0.08)]'
                : turn.status === 'failed'
                  ? '!border-[rgba(154,52,18,0.16)] !bg-[rgba(255,248,243,0.94)]'
                  : '!border-[rgba(93,72,34,0.08)] !bg-[rgba(255,251,244,0.82)] hover:!bg-[rgba(255,252,247,0.92)]',
            ]"
            @click="selectAssistantTurn(turn)"
          >
            <div class="block-header">
              <div class="block-header-group">
                <span class="block-label">回答</span>
                <span class="block-state" :class="`is-${turn.status}`">
                  {{ getTurnStatusLabel(turn.status) }}
                </span>
              </div>
            </div>

            <div
              v-if="turn.assistantMessage?.content.trim()"
              class="answer-markdown text-[13px] leading-relaxed text-[var(--text-strong)]"
              v-html="getAssistantHtml(turn)"
            />
            <p
              v-else-if="turn.status === 'streaming'"
              class="answer-placeholder"
            >
              正在生成回答...
            </p>
            <p v-else class="answer-placeholder answer-error">
              {{ getTurnFailureMessage(turn) }}
            </p>

            <p
              v-if="turn.status === 'failed' && turn.assistantMessage?.content.trim()"
              class="answer-note"
            >
              本轮回答未完整结束，已保留已生成内容。
            </p>

            <div class="block-footer">
              <span class="block-time">
                {{ formatDateTime(turn.assistantMessage?.createdAt || turn.createdAt) }}
              </span>
              <div class="block-actions">
                <button
                  class="block-action"
                  title="复制消息"
                  type="button"
                  @click.stop="copyText(`copy:${turn.id}:answer`, getAssistantCopyText(turn))"
                >
                  <Check
                    v-if="copiedItemId === `copy:${turn.id}:answer`"
                    class="size-3.5"
                  />
                  <Copy v-else class="size-3.5" />
                </button>
                <button
                  v-if="turn.assistantMessage && !turn.assistantMessage.id.startsWith('temp:')"
                  class="block-action"
                  title="赞同"
                  type="button"
                  :disabled="turn.assistantMessage.feedback?.rating === 'up'"
                  @click.stop="emit('feedback', turn.assistantMessage, 'up')"
                >
                  <ThumbsUp class="size-3.5" />
                </button>
                <button
                  v-if="turn.assistantMessage && !turn.assistantMessage.id.startsWith('temp:')"
                  class="block-action"
                  title="不赞同"
                  type="button"
                  :disabled="turn.assistantMessage.feedback?.rating === 'down'"
                  @click.stop="emit('feedback', turn.assistantMessage, 'down')"
                >
                  <ThumbsDown class="size-3.5" />
                </button>
              </div>
            </div>
          </section>
        </template>
      </div>
    </div>

    <form class="composer-bar" @submit.prevent="emit('submit')">
      <textarea
        :value="composer"
        class="field-shell composer-field !min-h-[108px] !rounded-[6px] resize-none text-sm"
        placeholder="向当前资料文件夹提问..."
        @input="emit('update:composer', ($event.target as HTMLTextAreaElement).value)"
      />
      <div class="composer-actions">
        <button
          class="soft-button primary !rounded-[6px] !px-4 !py-1.5"
          type="submit"
          :disabled="replying || !composer.trim()"
        >
          <LoaderCircle v-if="replying" class="size-4 animate-spin" />
          <ArrowUp v-else class="size-4" />
          <span>发送</span>
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped>
  .chat-pane {
    min-width: 0;
  }

  .chat-scroll-container {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0.9rem 1rem 1rem;
    overscroll-behavior: contain;
    overflow-anchor: none;
  }

  .chat-scroll-container::-webkit-scrollbar {
    width: 6px;
  }

  .chat-scroll-container::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.05);
  }

  .chat-block-list {
    display: flex;
    flex-direction: column;
    width: 100%;
    gap: 0.6rem;
  }

  .block-header,
  .block-header-group,
  .block-footer,
  .block-actions {
    display: flex;
    align-items: center;
  }

  .block-header {
    justify-content: space-between;
    gap: 0.6rem;
  }

  .block-header-group {
    min-width: 0;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .block-label,
  .block-kind,
  .block-state {
    border-radius: 4px;
    padding: 0.16rem 0.38rem;
    font-size: 11px;
    line-height: 1.2;
  }

  .block-label {
    background: rgba(93, 72, 34, 0.06);
    color: var(--text-muted);
  }

  .block-kind {
    color: var(--text-dim);
    background: rgba(93, 72, 34, 0.03);
  }

  .block-state {
    color: #475569;
    background: rgba(148, 163, 184, 0.16);
  }

  .block-state.is-completed {
    color: #0f766e;
    background: rgba(15, 118, 110, 0.12);
  }

  .block-state.is-streaming,
  .block-state.is-running {
    color: #155e75;
    background: rgba(21, 94, 117, 0.12);
  }

  .block-state.is-failed {
    color: #b91c1c;
    background: rgba(220, 38, 38, 0.12);
  }

  .block-state.is-info,
  .block-state.is-pending {
    color: #6b7280;
    background: rgba(107, 114, 128, 0.12);
  }

  .block-text,
  .trace-title {
    margin: 0.55rem 0 0;
  }

  .trace-summary-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    margin-top: 0.55rem;
  }

  .trace-title {
    min-width: 0;
    flex: 1;
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--text-strong);
  }

  .trace-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    border: 0;
    background: transparent;
    padding: 0;
    font-size: 11px;
    line-height: 1.2;
    color: var(--text-dim);
    cursor: pointer;
    flex-shrink: 0;
  }

  .trace-toggle:hover {
    color: var(--text-strong);
  }

  .trace-detail {
    margin-top: 0.35rem;
  }

  .answer-placeholder {
    margin: 0.55rem 0 0;
    line-height: 1.7;
    color: var(--text-muted);
  }

  .answer-error {
    color: #b91c1c;
  }

  .answer-note {
    margin-top: 0.7rem;
    font-size: 12px;
    line-height: 1.6;
    color: #b45309;
  }

  .block-footer {
    justify-content: space-between;
    gap: 0.6rem;
    margin-top: 0.75rem;
  }

  .block-time {
    font-size: 10px;
    color: var(--text-dim);
  }

  .block-actions {
    gap: 0.3rem;
  }

  .block-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-dim);
    padding: 0.28rem;
    cursor: pointer;
    transition:
      background 120ms ease,
      color 120ms ease;
  }

  .block-action:hover:not(:disabled) {
    background: rgba(93, 72, 34, 0.08);
    color: var(--text-strong);
  }

  .block-action:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .answer-markdown {
    margin-top: 0.55rem;
    color: var(--text-strong);
  }

  .answer-markdown :deep(*) {
    min-width: 0;
  }

  .answer-markdown :deep(p),
  .answer-markdown :deep(ul),
  .answer-markdown :deep(ol),
  .answer-markdown :deep(blockquote),
  .answer-markdown :deep(pre),
  .answer-markdown :deep(table),
  .answer-markdown :deep(hr) {
    margin: 0.85rem 0 0;
  }

  .answer-markdown :deep(h1),
  .answer-markdown :deep(h2),
  .answer-markdown :deep(h3),
  .answer-markdown :deep(h4) {
    margin-top: 1.1rem;
    margin-bottom: 0.5rem;
    font-weight: 700;
    line-height: 1.3;
    color: var(--text-strong);
  }

  .answer-markdown :deep(h1) {
    font-size: 1.04rem;
  }

  .answer-markdown :deep(h2) {
    font-size: 0.98rem;
  }

  .answer-markdown :deep(h3),
  .answer-markdown :deep(h4) {
    font-size: 0.92rem;
  }

  .answer-markdown :deep(p) {
    line-height: 1.75;
    color: color-mix(in srgb, var(--text-strong) 92%, white 8%);
  }

  .answer-markdown :deep(strong) {
    font-weight: 700;
    color: var(--text-strong);
  }

  .answer-markdown :deep(em) {
    color: color-mix(in srgb, var(--text-strong) 82%, white 18%);
  }

  .answer-markdown :deep(a) {
    color: var(--accent-strong);
    text-decoration: underline;
    text-decoration-thickness: 0.08em;
    text-underline-offset: 0.18em;
    word-break: break-word;
  }

  .answer-markdown :deep(a:hover) {
    color: var(--accent);
  }

  .answer-markdown :deep(ul),
  .answer-markdown :deep(ol) {
    padding-left: 1.2rem;
  }

  .answer-markdown :deep(ul) {
    list-style: disc;
  }

  .answer-markdown :deep(ol) {
    list-style: decimal;
  }

  .answer-markdown :deep(li) {
    line-height: 1.7;
    padding-left: 0.1rem;
  }

  .answer-markdown :deep(li + li) {
    margin-top: 0.35rem;
  }

  .answer-markdown :deep(blockquote) {
    border-radius: 4px;
    background: rgba(15, 118, 110, 0.05);
    padding: 0.75rem 0.85rem;
    color: color-mix(in srgb, var(--text-strong) 80%, white 20%);
  }

  .answer-markdown :deep(code) {
    font-family:
      "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
  }

  .answer-markdown :deep(:not(pre) > code) {
    border-radius: 4px;
    background: rgba(93, 72, 34, 0.08);
    padding: 0.18rem 0.38rem;
    font-size: 0.92em;
    color: #7c2d12;
  }

  .answer-markdown :deep(pre) {
    overflow-x: auto;
    border-radius: 6px;
    background: #172033;
    padding: 0.85rem 0.95rem;
  }

  .answer-markdown :deep(pre code) {
    display: block;
    white-space: pre;
    color: rgba(244, 247, 250, 0.96);
    font-size: 12px;
    line-height: 1.7;
  }

  .answer-markdown :deep(table) {
    display: block;
    width: 100%;
    overflow-x: auto;
    border-collapse: separate;
    border-spacing: 0;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.76);
  }

  .answer-markdown :deep(th),
  .answer-markdown :deep(td) {
    padding: 0.65rem 0.8rem;
    text-align: left;
    vertical-align: top;
    white-space: nowrap;
  }

  .answer-markdown :deep(th) {
    background: rgba(15, 118, 110, 0.06);
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-strong);
  }

  .answer-markdown :deep(hr) {
    border: none;
    border-top: 1px solid rgba(93, 72, 34, 0.12);
  }
</style>
