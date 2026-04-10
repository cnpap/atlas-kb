<script setup lang="ts">
  import type { KnowledgeSource } from "@atlas-kb/schema";
  import { ref, watch } from "vue";
  import { Download, LoaderCircle, Save, Trash2 } from "lucide-vue-next";
  import {
    getSourceStatusLabel,
    getSourceStatusTone,
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
            @click="emit('download', source)"
          >
            <Download class="size-4" />
            <span>下载</span>
          </button>
        </div>

        <div class="flex items-center gap-2">
          <button
            class="soft-button warn"
            type="button"
            @click="emit('delete', source)"
          >
            <Trash2 class="size-4" />
            <span>删除</span>
          </button>
          <button
            class="soft-button primary"
            type="button"
            :disabled="saving"
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
