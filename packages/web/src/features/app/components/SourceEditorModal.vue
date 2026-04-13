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
        sourceFilename: string;
      },
    ];
  }>();

  const fileNameStem = ref("");
  const fileNameExtension = ref("");
  const content = ref("");

  function splitFileName(fileName: string): {
    extension: string;
    stem: string;
  } {
    const normalized = fileName.trim();
    const dotIndex = normalized.lastIndexOf(".");

    if (dotIndex <= 0) {
      return {
        extension: "",
        stem: normalized,
      };
    }

    return {
      extension: normalized.slice(dotIndex),
      stem: normalized.slice(0, dotIndex),
    };
  }

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

      const resolvedFileName = source?.sourceFilename || source?.documentId || "";
      const nextFileName = splitFileName(resolvedFileName);
      fileNameStem.value = nextFileName.stem;
      fileNameExtension.value = nextFileName.extension;
      content.value = source?.content || "";
    },
    { immediate: true },
  );

  function submit() {
    emit("submit", {
      sourceFilename: `${fileNameStem.value.trim() || "source"}${fileNameExtension.value}`,
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
        ? '当前 PDF、Word、Excel 资料不支持编辑正文；你仍然可以修改文件名，保存后会重建索引。'
        : '编辑文件名和正文内容，保存后会立即重建检索。'
    "
    :close="!saving"
    @update:open="updateOpen"
  >
    <template #body>
      <div v-if="source" class="space-y-5">
        <div class="space-y-2">
          <p class="section-label">文件名</p>
          <div class="flex items-center gap-2">
            <input
              v-model="fileNameStem"
              class="field-shell min-w-0 flex-1 text-sm font-medium"
              placeholder="输入文件名"
            >
            <span
              v-if="fileNameExtension"
              class="rounded-[6px] border border-[var(--border-soft)] bg-[var(--bg-panel-muted)] px-2 py-2 text-xs text-[var(--text-dim)]"
            >
              {{ fileNameExtension }}
            </span>
          </div>
        </div>

        <div
          v-if="shouldShowSourceTaskMessage(source)"
          class="space-y-3 rounded-[8px] border border-[rgba(93,72,34,0.08)] bg-[rgba(255,250,240,0.6)] p-3"
        >
          <div class="flex items-center justify-between gap-3">
            <p class="section-label">后台状态</p>
            <span class="text-[11px] font-medium text-[var(--text-strong)]">
              处理失败
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
