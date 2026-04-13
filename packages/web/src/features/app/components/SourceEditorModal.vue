<script setup lang="ts">
  import type { KnowledgeSource } from "@atlas-kb/schema";
  import { ref, watch } from "vue";
  import {
    Download,
    LoaderCircle,
    RotateCcw,
    Save,
    Trash2,
  } from "lucide-vue-next";
  import {
    formatDateTime,
    getSourceStatusLabel,
    getSourceStatusTone,
    getSourceTaskMessage,
    shouldShowSourceTaskMessage,
  } from "@/lib/knowledge-ui";

  const props = defineProps<{
    open: boolean;
    saving?: boolean;
    source: KnowledgeSource | null;
    sourceActionPending?: boolean;
  }>();

  const emit = defineEmits<{
    delete: [source: KnowledgeSource];
    download: [source: KnowledgeSource];
    retry: [source: KnowledgeSource];
    "update:open": [value: boolean];
    submit: [
      payload: {
        content?: string;
        title: string;
      },
    ];
  }>();

  const title = ref("");
  const content = ref("");

  function isBinaryManagedSource(source: KnowledgeSource | null): boolean {
    if (!source) {
      return false;
    }

    const normalizedMimeType = source.mimeType
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();

    if (
      normalizedMimeType === "application/pdf" ||
      normalizedMimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      normalizedMimeType ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      return true;
    }

    return /\.(pdf|docx|xlsx)$/i.test(
      source.sourceFilename || source.documentId || "",
    );
  }

  watch(
    () => [props.source, props.open] as const,
    ([source, isOpen]) => {
      if (!isOpen) {
        return;
      }

      title.value = source?.title || "";
      content.value = source?.content || "";
    },
    { immediate: true },
  );

  function submit() {
    emit("submit", {
      title: title.value.trim(),
      content: isBinaryManagedSource(props.source)
        ? undefined
        : content.value.trim(),
    });
  }

  function updateOpen(value: boolean) {
    emit("update:open", value);
  }
</script>

<template>
  <UModal
    :open="open"
    title="资料编辑器"
    :description="
      isBinaryManagedSource(source)
        ? '当前 PDF、Word、Excel 资料不再持久化正文快照；你仍然可以更新标题。'
        : '编辑标题和正文内容，保存后会立即更新检索。'
    "
    :close="!saving"
    @update:open="updateOpen"
  >
    <template #body>
      <div v-if="source" class="space-y-5">
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <p class="section-label">资料标题</p>
            <span
              class="status-pill scale-75 origin-right"
              :class="getSourceStatusTone(source.status)"
            >
              {{ getSourceStatusLabel(source.status) }}
            </span>
          </div>
          <input v-model="title" class="field-shell w-full text-sm font-medium">
        </div>

        <div
          v-if="shouldShowSourceTaskMessage(source)"
          class="space-y-3 rounded-[8px] border border-[rgba(93,72,34,0.08)] bg-[rgba(255,250,240,0.6)] p-3"
        >
          <div class="flex items-center justify-between gap-3">
            <p class="section-label">后台状态</p>
            <span class="text-[11px] font-medium text-[var(--text-strong)]">
              {{ source.status === "failed" ? "处理失败" : "后台处理中" }}
            </span>
          </div>
          <div
            class="rounded-[6px] border border-[rgba(93,72,34,0.08)] bg-white/70 px-3 py-2"
          >
            <p class="text-sm leading-6 text-[var(--text-strong)]">
              {{ getSourceTaskMessage(source) }}
            </p>
          </div>
          <div class="text-[11px] text-[var(--text-muted)]">
            更新时间：{{ formatDateTime(source.updatedAt) }}
          </div>
        </div>

        <div v-if="!isBinaryManagedSource(source)" class="space-y-1.5">
          <p class="section-label">正文内容</p>
          <textarea
            v-model="content"
            class="field-shell w-full text-sm !min-h-[260px] font-mono leading-6"
            placeholder="编辑当前资料正文"
          />
        </div>
      </div>
    </template>
    <template #footer>
      <div v-if="source" class="flex w-full flex-wrap justify-between gap-2">
        <div class="flex items-center gap-2">
          <button
            class="soft-button"
            type="button"
            :disabled="sourceActionPending"
            @click="emit('download', source)"
          >
            <Download class="size-4" />
            <span>下载</span>
          </button>
          <button
            v-if="source.sourceType === 'file' && source.status === 'failed'"
            class="soft-button"
            type="button"
            :disabled="sourceActionPending"
            @click="emit('retry', source)"
          >
            <RotateCcw class="size-4" />
            <span>重试索引</span>
          </button>
        </div>

        <div class="flex items-center gap-2">
          <button
            class="soft-button warn"
            type="button"
            :disabled="sourceActionPending"
            @click="emit('delete', source)"
          >
            <Trash2 class="size-4" />
            <span>删除</span>
          </button>
          <button
            class="soft-button primary"
            type="button"
            :disabled="saving || sourceActionPending"
            @click="submit"
          >
            <LoaderCircle v-if="saving" class="size-4 animate-spin" />
            <Save v-else class="size-4" />
            <span>保存修改</span>
          </button>
        </div>
      </div>
    </template>
  </UModal>
</template>
