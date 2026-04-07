<script setup lang="ts">
  import type {
    KnowledgeCollection,
    KnowledgeExportTask,
    KnowledgeSource,
  } from "@atlas-kb/schema";
  import {
    FileCog,
    FolderPlus,
    Info,
    Search,
    Settings,
    Upload,
  } from "lucide-vue-next";
  import {
    formatRelativeTime,
    getExportTaskStatusLabel,
    getExportTaskStatusTone,
    getSourceStatusLabel,
    getSourceStatusTone,
  } from "@/lib/knowledge-ui";

  defineProps<{
    activeCollection: KnowledgeCollection | null;
    exportTasks: KnowledgeExportTask[];
    filteredSources: KnowledgeSource[];
    loadingSources?: boolean;
    loadingExportTasks?: boolean;
    panel: "library" | "exports";
    sourceActionId: string;
    sourceFilter: string;
  }>();

  defineEmits<{
    deleteSource: [source: KnowledgeSource];
    downloadExportTask: [task: KnowledgeExportTask];
    downloadSource: [source: KnowledgeSource];
    editSource: [source: KnowledgeSource];
    openExportModal: [source: KnowledgeSource];
    openImport: [];
    openPanel: [panel: "library" | "exports"];
    openSettings: [];
    openTaskDetail: [taskId: string];
    "update:sourceFilter": [value: string];
  }>();
</script>

<template>
  <aside class="workbench-pane right-pane" data-testid="workspace-context-pane">
    <div class="pane-header pane-header-stack">
      <div class="segmented-tabs !bg-transparent !border-none !p-0 gap-2">
        <button
          class="soft-button"
          data-testid="context-panel-library-tab"
          :class="panel === 'library' ? 'primary' : ''"
          type="button"
          @click="$emit('openPanel', 'library')"
        >
          文件夹
        </button>
        <button
          class="soft-button"
          data-testid="context-panel-exports-tab"
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
                  class="soft-button !rounded-[6px] !px-2.5 !py-2 text-xs"
                  data-testid="source-export-button"
                  type="button"
                  @click="$emit('openExportModal', source)"
                >
                  导出
                </button>
                <button
                  class="soft-button !rounded-[6px] !px-2.5 !py-2 text-xs"
                  data-testid="source-edit-button"
                  type="button"
                  :disabled="sourceActionId === source.id"
                  @click="$emit('editSource', source)"
                >
                  编辑
                </button>
                <button
                  class="soft-button !rounded-[6px] !px-2.5 !py-2 text-xs"
                  data-testid="source-download-button"
                  type="button"
                  :disabled="sourceActionId === source.id"
                  @click="$emit('downloadSource', source)"
                >
                  下载
                </button>
                <button
                  class="soft-button warn !rounded-[6px] !px-2.5 !py-2 text-xs"
                  data-testid="source-delete-button"
                  type="button"
                  :disabled="sourceActionId === source.id"
                  @click="$emit('deleteSource', source)"
                >
                  删除
                </button>
              </div>
            </div>
          </article>
        </div>
      </template>
    </div>

    <div v-else class="pane-scroll flex flex-col pt-4">
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
        <FileCog class="mb-2 size-8 text-[var(--text-dim)]" />
        <p class="text-sm text-[var(--text-muted)]">
          当前还没有导出任务。选择文件后点击导出，即可异步创建任务。
        </p>
      </div>

      <div v-else class="stack-list">
        <article
          v-for="task in exportTasks"
          :key="task.id"
          class="stack-item !rounded-[8px] !p-3 shadow-none"
        >
          <div class="flex flex-col gap-3">
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="status-pill"
                :class="getExportTaskStatusTone(task.status)"
              >
                {{ getExportTaskStatusLabel(task.status) }}
              </span>
              <span class="text-[10px] text-[var(--text-dim)]">
                {{ formatRelativeTime(task.updatedAt) }}
              </span>
            </div>

            <div class="min-w-0">
              <p
                class="truncate text-sm font-semibold text-[var(--text-strong)]"
              >
                {{ task.templateName }}
              </p>
              <p class="mt-1 text-[12px] leading-6 text-[var(--text-muted)]">
                {{ task.sourceTitle }}
              </p>
              <p
                v-if="task.failureMessage"
                class="mt-1 text-[12px] leading-6 text-[var(--danger)]"
              >
                {{ task.failureMessage }}
              </p>
            </div>

            <div
              v-if="task.status === 'completed'"
              class="flex items-center justify-end gap-2 border-t border-[rgba(93,72,34,0.08)] pt-3"
            >
              <button
                v-if="task.exportFile"
                class="soft-button !rounded-[6px] !px-3 !py-2 text-xs"
                :data-testid="`export-task-download-${task.id}`"
                type="button"
                @click="$emit('downloadExportTask', task)"
              >
                下载
              </button>
              <button
                class="soft-button !rounded-[6px] !px-3 !py-2 text-xs"
                :data-testid="`export-task-detail-${task.id}`"
                type="button"
                @click="$emit('openTaskDetail', task.id)"
              >
                查看详情
              </button>
            </div>
          </div>
        </article>
      </div>
    </div>
  </aside>
</template>
