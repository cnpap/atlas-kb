<script setup lang="ts">
  import type {
    KnowledgeCollection,
    KnowledgeExportTask,
    KnowledgeSource,
    KnowledgeTemplateSummary,
  } from "@atlas-kb/schema";
  import {
    Download,
    FileCog,
    FolderPlus,
    Info,
    PencilLine,
    Search,
    Settings,
    Trash2,
    Upload,
  } from "lucide-vue-next";
  import {
    formatRelativeTime,
    getSourceStatusLabel,
    getSourceStatusTone,
  } from "@/lib/knowledge-ui";

  defineProps<{
    activeCollection: KnowledgeCollection | null;
    exportTasks: KnowledgeExportTask[];
    exportTemplates: KnowledgeTemplateSummary[];
    filteredSources: KnowledgeSource[];
    loadingSources?: boolean;
    loadingExportTasks?: boolean;
    panel: "library" | "exports";
    selectedSource: KnowledgeSource | null;
    sourceActionId: string;
    sourceFilter: string;
  }>();

  defineEmits<{
    deleteSource: [source: KnowledgeSource];
    downloadSource: [source: KnowledgeSource];
    editSource: [source: KnowledgeSource];
    createExportTask: [
      payload: { source: KnowledgeSource; templateId?: string },
    ];
    openBriefing: [source: KnowledgeSource];
    openImport: [];
    openPanel: [panel: "library" | "exports"];
    openSettings: [];
    "update:sourceFilter": [value: string];
  }>();
</script>

<template>
  <aside class="workbench-pane right-pane" data-testid="workspace-context-pane">
    <div class="pane-header pane-header-stack">
      <div class="segmented-tabs !bg-transparent !border-none !p-0 gap-2">
        <button
          class="soft-button"
          :class="panel === 'library' ? 'primary' : ''"
          type="button"
          @click="$emit('openPanel', 'library')"
        >
          文件夹
        </button>
        <button
          class="soft-button"
          :class="panel === 'exports' ? 'primary' : ''"
          type="button"
          @click="$emit('openPanel', 'exports')"
        >
          导出
        </button>
      </div>
    </div>

    <div v-if="panel === 'library'" class="pane-scroll flex flex-col pt-4">
      <div
        class="mb-4 flex items-center gap-2 border-b border-[rgba(93,72,34,0.08)] pb-4"
      >
        <button
          class="soft-button !px-2.5 !py-1.5"
          data-testid="open-import-button"
          type="button"
          :disabled="!activeCollection"
          @click="$emit('openImport')"
        >
          <Upload class="size-3.5" />
          <span class="text-xs">添加文件</span>
        </button>
        <button
          class="soft-button !px-2.5 !py-1.5"
          type="button"
          :disabled="!activeCollection"
          @click="$emit('openSettings')"
        >
          <Settings class="size-3.5" />
          <span class="text-xs">设置</span>
        </button>
      </div>

      <div
        v-if="!activeCollection"
        class="empty-state items-center text-center"
      >
        <FolderPlus class="mb-2 size-8 text-[var(--text-dim)]" />
        <p class="text-sm text-[var(--text-muted)]">请先在左侧选择一个文件夹</p>
      </div>

      <template v-else>
        <div class="relative mb-4 w-full">
          <Search
            class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-dim)]"
          />
          <input
            :value="sourceFilter"
            class="field-shell w-full !rounded-[6px] !py-2.5 pl-9 pr-3 text-sm"
            data-testid="source-filter-input"
            placeholder="搜索文件标题、摘要或标签"
            type="search"
            @input="$emit('update:sourceFilter', ($event.target as HTMLInputElement).value)"
          >
        </div>

        <div
          v-if="loadingSources"
          class="empty-state items-center text-center text-sm text-[var(--text-muted)]"
        >
          正在加载文件...
        </div>

        <div
          v-else-if="filteredSources.length === 0"
          class="empty-state items-center text-center"
        >
          <Info class="mb-2 size-8 text-[var(--text-dim)]" />
          <p class="text-sm text-[var(--text-muted)]">
            当前文件夹还没有资料，先上传文件或导入文本。
          </p>
        </div>

        <div v-else class="stack-list">
          <article
            v-for="source in filteredSources"
            :key="source.id"
            class="stack-item !rounded-[8px] !p-3 shadow-none"
            data-testid="source-card"
          >
            <div class="flex flex-col gap-3">
              <div class="flex flex-wrap items-center gap-2">
                <span
                  class="status-pill"
                  :class="getSourceStatusTone(source.status)"
                >
                  {{ getSourceStatusLabel(source.status) }}
                </span>
                <span class="text-[10px] text-[var(--text-dim)]">
                  {{ formatRelativeTime(source.updatedAt) }}
                </span>
              </div>

              <div class="min-w-0">
                <p
                  class="truncate text-sm font-semibold text-[var(--text-strong)]"
                  data-testid="source-card-title"
                >
                  {{ source.title }}
                </p>
                <p
                  class="mt-1 line-clamp-3 text-[12px] leading-6 text-[var(--text-muted)]"
                >
                  {{ source.summary }}
                </p>
              </div>

              <div
                class="flex items-center justify-end gap-1 border-t border-[rgba(93,72,34,0.08)] pt-3"
                data-testid="source-card-actions"
              >
                <button
                  class="soft-button !rounded-[6px] !p-2"
                  data-testid="source-edit-button"
                  type="button"
                  :disabled="sourceActionId === source.id"
                  @click="$emit('editSource', source)"
                >
                  <PencilLine class="size-4" />
                </button>
                <button
                  class="soft-button !rounded-[6px] !p-2"
                  data-testid="source-download-button"
                  type="button"
                  :disabled="sourceActionId === source.id"
                  @click="$emit('downloadSource', source)"
                >
                  <Download class="size-4" />
                </button>
                <button
                  class="soft-button !rounded-[6px] !p-2"
                  data-testid="source-delete-button"
                  type="button"
                  :disabled="sourceActionId === source.id"
                  @click="$emit('deleteSource', source)"
                >
                  <Trash2 class="size-4" />
                </button>
              </div>
            </div>
          </article>
        </div>
      </template>
    </div>

    <div v-else class="pane-scroll flex flex-col pt-4">
      <div v-if="!selectedSource" class="empty-state items-center text-center">
        <FileCog class="mb-2 size-8 text-[var(--text-dim)]" />
        <p class="text-sm text-[var(--text-muted)]">
          选择一个资料文件后，可在这里查看拟办和模版导出任务。
        </p>
      </div>

      <template v-else>
        <div class="mb-5">
          <p
            class="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-dim)]"
          >
            当前资料
          </p>
          <div class="panel-muted border border-[var(--border-soft)] p-4">
            <p class="text-sm font-semibold text-[var(--text-strong)]">
              {{ selectedSource.title }}
            </p>
            <p class="mt-2 text-[12px] leading-6 text-[var(--text-muted)]">
              {{ selectedSource.summary }}
            </p>
          </div>
        </div>

        <div class="mb-5 flex flex-wrap gap-2">
          <button
            class="soft-button !px-3 !py-1.5"
            type="button"
            @click="$emit('openBriefing', selectedSource)"
          >
            拟办导出
          </button>
          <button
            v-for="template in exportTemplates"
            :key="template.id"
            class="soft-button !px-3 !py-1.5"
            type="button"
            @click="$emit('createExportTask', { source: selectedSource, templateId: template.id })"
          >
            {{ template.name }}
          </button>
        </div>

        <div
          v-if="loadingExportTasks"
          class="empty-state items-center text-center text-sm text-[var(--text-muted)]"
        >
          正在加载导出任务...
        </div>

        <div
          v-else-if="exportTasks.length === 0"
          class="empty-state items-center text-center"
        >
          <Info class="mb-2 size-8 text-[var(--text-dim)]" />
          <p class="text-sm text-[var(--text-muted)]">当前还没有导出任务。</p>
        </div>

        <div v-else class="stack-list">
          <article
            v-for="task in exportTasks"
            :key="task.id"
            class="stack-item !rounded-[8px] !p-3 shadow-none"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-[var(--text-strong)]">
                  {{ task.templateName }}
                </p>
                <p class="mt-1 text-[12px] text-[var(--text-muted)]">
                  {{ task.status }}
                </p>
              </div>
              <span class="text-[10px] text-[var(--text-dim)]">
                {{ formatRelativeTime(task.updatedAt) }}
              </span>
            </div>
          </article>
        </div>
      </template>
    </div>
  </aside>
</template>
