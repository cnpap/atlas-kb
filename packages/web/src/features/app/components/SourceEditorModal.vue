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
    formatPageNumberList,
    getSourceIndexProgressStatusLabel,
    getSourceStatusLabel,
    getSourceStatusTone,
    shouldShowSourceIndexProgress,
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
        summary: string;
        tags: string;
        title: string;
      },
    ];
  }>();

  const title = ref("");
  const summary = ref("");
  const tags = ref("");
  const content = ref("");

  function isDoclingManagedSource(source: KnowledgeSource | null): boolean {
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
      summary.value = source?.summary || "";
      tags.value = source?.tags.join(", ") || "";
      content.value = source?.content || "";
    },
    { immediate: true },
  );

  function submit() {
    emit("submit", {
      title: title.value.trim(),
      summary: summary.value.trim(),
      tags: tags.value,
      content: isDoclingManagedSource(props.source)
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
      isDoclingManagedSource(source)
        ? '当前 PDF、Word、Excel 资料不再持久化正文快照；你仍然可以更新标题、摘要和标签。'
        : '编辑标题、摘要、标签和正文内容，保存后会立即更新检索。'
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

        <div class="space-y-1.5">
          <p class="section-label">摘要</p>
          <textarea
            v-model="summary"
            class="field-shell w-full text-sm !min-h-[80px]"
          />
        </div>

        <div class="space-y-1.5">
          <p class="section-label">标签</p>
          <input
            v-model="tags"
            class="field-shell w-full text-sm"
            placeholder="标签1, 标签2"
          >
        </div>

        <div
          v-if="shouldShowSourceIndexProgress(source)"
          class="space-y-3 rounded-[8px] border border-[rgba(93,72,34,0.08)] bg-[rgba(255,250,240,0.6)] p-3"
        >
          <div class="flex items-center justify-between gap-3">
            <p class="section-label">索引进度</p>
            <span
              v-if="source.indexProgress"
              class="text-[11px] font-medium text-[var(--text-strong)]"
            >
              {{ getSourceIndexProgressStatusLabel(source.indexProgress) }}
            </span>
          </div>

          <div v-if="source.indexProgress" class="grid gap-2 sm:grid-cols-2">
            <div class="rounded-[6px] bg-white/70 px-3 py-2">
              <p class="text-[11px] text-[var(--text-dim)]">分块进度</p>
              <p class="mt-1 text-sm font-medium text-[var(--text-strong)]">
                {{ source.indexProgress.completedChunks }}
                /
                {{ source.indexProgress.totalChunks }}
                块
              </p>
            </div>
            <div class="rounded-[6px] bg-white/70 px-3 py-2">
              <p class="text-[11px] text-[var(--text-dim)]">失败分块</p>
              <p class="mt-1 text-sm font-medium text-[var(--text-strong)]">
                {{ source.indexProgress.failedChunks }}
                块
              </p>
            </div>
            <div class="rounded-[6px] bg-white/70 px-3 py-2">
              <p class="text-[11px] text-[var(--text-dim)]">页进度</p>
              <p class="mt-1 text-sm font-medium text-[var(--text-strong)]">
                {{ source.indexProgress.completedPages }}
                /
                {{ source.indexProgress.totalPages }}
                页
              </p>
            </div>
            <div class="rounded-[6px] bg-white/70 px-3 py-2">
              <p class="text-[11px] text-[var(--text-dim)]">最近处理页</p>
              <p class="mt-1 text-sm font-medium text-[var(--text-strong)]">
                {{ source.indexProgress.lastProcessedPage === null
                    ? "未开始"
                    : `第 ${source.indexProgress.lastProcessedPage} 页` }}
              </p>
            </div>
          </div>

          <div
            v-if="source.indexProgress?.lastError || source.failureMessage"
            class="rounded-[6px] border border-[rgba(185,28,28,0.12)] bg-[rgba(254,242,242,0.78)] px-3 py-2"
          >
            <p class="text-[11px] text-[var(--text-dim)]">最近错误</p>
            <p class="mt-1 text-sm leading-6 text-[var(--text-strong)]">
              {{ source.indexProgress?.lastError ||
                source.failureMessage ||
                "未记录" }}
            </p>
          </div>

          <div
            v-if="source.indexProgress"
            class="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-muted)]"
          >
            <span
              >更新时间：{{ formatDateTime(source.indexProgress.updatedAt) }}</span
            >
            <span>
              {{ source.indexProgress.resumeable ? "支持续跑" : "无需续跑" }}
            </span>
          </div>

          <div
            v-if="source.indexProgress?.failedChunkDetails.length"
            class="space-y-2"
          >
            <p class="text-[11px] font-medium text-[var(--text-dim)]">
              失败分块
            </p>
            <div
              v-for="failure in source.indexProgress.failedChunkDetails"
              :key="failure.chunkId"
              class="rounded-[6px] border border-[rgba(93,72,34,0.08)] bg-white/70 px-3 py-2"
            >
              <p class="text-xs font-medium text-[var(--text-strong)]">
                块 {{ failure.ordinal + 1 }} ·
                {{ formatPageNumberList(failure.pageNumbers) }}
              </p>
              <p class="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                {{ failure.error }}
              </p>
            </div>
          </div>
        </div>

        <div v-if="!isDoclingManagedSource(source)" class="space-y-1.5">
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
