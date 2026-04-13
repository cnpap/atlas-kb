<script setup lang="ts">
  import type {
    AssistantRole,
    KnowledgeCollection,
    KnowledgeExportTask,
    KnowledgeSource,
  } from "@atlas-kb/schema";
  import excelIcon from "@/assets/icon/excel.png";
  import pdfIcon from "@/assets/icon/pdf.png";
  import pptIcon from "@/assets/icon/ppt.png";
  import txtIcon from "@/assets/icon/txt.png";
  import wordIcon from "@/assets/icon/word.png";
  import {
    EllipsisVertical,
    FileCog,
    FolderPlus,
    Info,
    Search,
    Upload,
  } from "lucide-vue-next";
  import { onBeforeUnmount, onMounted, ref, watch } from "vue";
  import WorkspaceSettingsPane from "@/features/app/components/WorkspaceSettingsPane.vue";
  import {
    formatRelativeTime,
    getExportTaskStatusLabel,
    getExportTaskStatusTone,
    getSourceTaskMessage,
    shouldShowSourceTaskMessage,
  } from "@/lib/knowledge-ui";

  const props = defineProps<{
    activeAssistantRoleId: string;
    activeCollection: KnowledgeCollection | null;
    assistantRoles: AssistantRole[];
    canDeleteCollection?: boolean;
    deletingCollection?: boolean;
    deletingRoleId?: string;
    exportTasks: KnowledgeExportTask[];
    filteredSources: KnowledgeSource[];
    loadingAssistantRoles?: boolean;
    loadingSources?: boolean;
    loadingExportTasks?: boolean;
    panel: "library" | "exports" | "settings";
    roleSwitchDisabled?: boolean;
    savingCollection?: boolean;
    savingRole?: boolean;
    sourceActionId: string;
    sourceFilter: string;
    switchingAssistantRole?: boolean;
  }>();

  const emit = defineEmits<{
    createRole: [payload: { name: string; stylePrompt: string }];
    deleteCollection: [];
    deleteRole: [roleId: string];
    deleteSource: [source: KnowledgeSource];
    downloadExportTask: [task: KnowledgeExportTask];
    downloadSource: [source: KnowledgeSource];
    editSource: [source: KnowledgeSource];
    openExportModal: [source: KnowledgeSource];
    openImport: [];
    openPanel: [panel: "library" | "exports" | "settings"];
    openTaskDetail: [taskId: string];
    reorderRoles: [roleIds: string[]];
    retrySource: [source: KnowledgeSource];
    saveCollection: [payload: { description: string; name: string }];
    selectActiveRole: [roleId: string];
    updateRole: [
      payload: {
        body: { name: string; stylePrompt: string };
        roleId: string;
      },
    ];
    "update:sourceFilter": [value: string];
  }>();

  type SourceFileKind =
    | "default"
    | "pdf"
    | "presentation"
    | "spreadsheet"
    | "text"
    | "word";

  const sourceMenuId = ref("");

  const SOURCE_ICON_BY_KIND: Record<SourceFileKind, string> = {
    default: txtIcon,
    pdf: pdfIcon,
    presentation: pptIcon,
    spreadsheet: excelIcon,
    text: txtIcon,
    word: wordIcon,
  };

  function normalizeMimeType(value?: string): string {
    return value?.split(";", 1)[0]?.trim().toLowerCase() || "";
  }

  function getSourceExtension(source: KnowledgeSource): string {
    const fileName = source.sourceFilename || source.documentId || "";
    const match = /\.([a-z0-9]+)$/i.exec(fileName);
    return match?.[1]?.toLowerCase() || "";
  }

  function getSourceFileKind(source: KnowledgeSource): SourceFileKind {
    const extension = getSourceExtension(source);
    const mimeType = normalizeMimeType(source.mimeType);

    if (extension === "pdf" || mimeType === "application/pdf") {
      return "pdf";
    }

    if (
      ["ppt", "pptx"].includes(extension) ||
      [
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ].includes(mimeType)
    ) {
      return "presentation";
    }

    if (
      ["xls", "xlsx", "csv"].includes(extension) ||
      [
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv",
      ].includes(mimeType)
    ) {
      return "spreadsheet";
    }

    if (
      ["doc", "docx"].includes(extension) ||
      [
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ].includes(mimeType)
    ) {
      return "word";
    }

    if (
      ["txt", "md", "json", "xml", "yaml", "yml"].includes(extension) ||
      mimeType.startsWith("text/")
    ) {
      return "text";
    }

    return "default";
  }

  function getSourceIcon(source: KnowledgeSource): string {
    return SOURCE_ICON_BY_KIND[getSourceFileKind(source)];
  }

  function getSourceDisplayName(source: KnowledgeSource): string {
    const fileName = source.sourceFilename?.trim();

    if (fileName) {
      return fileName;
    }

    const documentId = source.documentId?.trim();

    if (documentId) {
      return documentId;
    }

    const title = source.title.trim();

    if (title) {
      return title;
    }

    if (source.sourceType === "text") {
      return "文本录入";
    }

    if (source.sourceType === "seed") {
      return "系统资料";
    }

    return "文件资料";
  }

  function closeSourceMenu(): void {
    sourceMenuId.value = "";
  }

  function toggleSourceMenu(sourceId: string): void {
    sourceMenuId.value = sourceMenuId.value === sourceId ? "" : sourceId;
  }

  function handleDocumentClick(): void {
    closeSourceMenu();
  }

  function handleDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      closeSourceMenu();
    }
  }

  function handleSourceAction(
    action:
      | "deleteSource"
      | "downloadSource"
      | "editSource"
      | "openExportModal"
      | "retrySource",
    source: KnowledgeSource,
  ): void {
    closeSourceMenu();

    switch (action) {
      case "deleteSource":
        emit("deleteSource", source);
        return;
      case "downloadSource":
        emit("downloadSource", source);
        return;
      case "editSource":
        emit("editSource", source);
        return;
      case "openExportModal":
        emit("openExportModal", source);
        return;
      case "retrySource":
        emit("retrySource", source);
        return;
      default:
        return;
    }
  }

  onMounted(() => {
    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleDocumentKeydown);
  });

  onBeforeUnmount(() => {
    document.removeEventListener("click", handleDocumentClick);
    document.removeEventListener("keydown", handleDocumentKeydown);
  });

  watch(
    () => [props.panel, props.sourceActionId, props.filteredSources.length],
    () => {
      closeSourceMenu();
    },
  );
</script>

<template>
  <aside class="workbench-pane right-pane" data-testid="workspace-context-pane">
    <div class="pane-header">
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
        <button
          class="soft-button"
          data-testid="context-panel-settings-tab"
          :class="panel === 'settings' ? 'primary' : ''"
          type="button"
          @click="$emit('openPanel', 'settings')"
        >
          设置
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
            placeholder="搜索文件标题"
            type="search"
            @input="emit('update:sourceFilter', ($event.target as HTMLInputElement).value)"
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
            class="stack-item !rounded-[8px] !px-2.5 !py-2 shadow-none"
            data-testid="source-card"
          >
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center gap-2.5">
                <img
                  :src="getSourceIcon(source)"
                  alt=""
                  aria-hidden="true"
                  class="h-8 w-8 shrink-0 object-contain"
                  data-testid="source-file-icon"
                >
                <p
                  class="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-strong)]"
                  data-testid="source-card-title"
                >
                  {{ getSourceDisplayName(source) }}
                </p>

                <div
                  class="relative shrink-0"
                  data-testid="source-card-actions"
                >
                  <button
                    class="soft-button !rounded-[6px] !p-1.5"
                    data-testid="source-menu-button"
                    type="button"
                    :disabled="sourceActionId === source.id"
                    @click.stop="toggleSourceMenu(source.id)"
                  >
                    <EllipsisVertical class="size-4" />
                  </button>

                  <div
                    v-if="sourceMenuId === source.id"
                    class="absolute right-0 top-full z-20 mt-2 flex min-w-[132px] flex-col rounded-[10px] border border-[var(--border-soft)] bg-[var(--bg-panel-strong)] p-1.5 shadow-[var(--shadow-floating)]"
                    data-testid="source-menu"
                    @click.stop
                  >
                    <button
                      class="rounded-[8px] px-3 py-2 text-left text-xs font-medium text-[var(--text-strong)] transition hover:bg-[rgba(93,72,34,0.08)]"
                      data-testid="source-menu-export"
                      type="button"
                      @click="handleSourceAction('openExportModal', source)"
                    >
                      导出
                    </button>
                    <button
                      class="rounded-[8px] px-3 py-2 text-left text-xs font-medium text-[var(--text-strong)] transition hover:bg-[rgba(93,72,34,0.08)]"
                      data-testid="source-menu-edit"
                      type="button"
                      :disabled="sourceActionId === source.id"
                      @click="handleSourceAction('editSource', source)"
                    >
                      编辑
                    </button>
                    <button
                      class="rounded-[8px] px-3 py-2 text-left text-xs font-medium text-[var(--text-strong)] transition hover:bg-[rgba(93,72,34,0.08)]"
                      data-testid="source-menu-download"
                      type="button"
                      :disabled="sourceActionId === source.id"
                      @click="handleSourceAction('downloadSource', source)"
                    >
                      下载
                    </button>
                    <button
                      v-if="source.sourceType === 'file' && source.status === 'failed'"
                      class="rounded-[8px] px-3 py-2 text-left text-xs font-medium text-[var(--text-strong)] transition hover:bg-[rgba(93,72,34,0.08)]"
                      data-testid="source-menu-retry"
                      type="button"
                      :disabled="sourceActionId === source.id"
                      @click="handleSourceAction('retrySource', source)"
                    >
                      重试
                    </button>
                    <button
                      class="rounded-[8px] px-3 py-2 text-left text-xs font-medium text-[var(--rose)] transition hover:bg-[rgba(154,52,18,0.08)]"
                      data-testid="source-menu-delete"
                      type="button"
                      :disabled="sourceActionId === source.id"
                      @click="handleSourceAction('deleteSource', source)"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>

              <div
                v-if="shouldShowSourceTaskMessage(source)"
                class="pl-[42px]"
              >
                <div
                  class="rounded-[6px] border border-[rgba(93,72,34,0.08)] bg-[rgba(255,250,240,0.65)] px-3 py-2"
                  data-testid="source-card-task-message"
                >
                  <p class="text-[11px] leading-5 text-[var(--text-muted)]">
                    <span class="font-medium text-[var(--text-strong)]">
                      处理失败：
                    </span>
                    {{ getSourceTaskMessage(source) }}
                  </p>
                </div>
              </div>
            </div>
          </article>
        </div>
      </template>
    </div>

    <div v-else-if="panel === 'exports'" class="pane-scroll flex flex-col pt-4">
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

    <WorkspaceSettingsPane
      v-else
      :active-assistant-role-id="activeAssistantRoleId"
      :active-collection="activeCollection"
      :assistant-roles="assistantRoles"
      :can-delete-collection="canDeleteCollection"
      :deleting-collection="deletingCollection"
      :deleting-role-id="deletingRoleId"
      :loading-assistant-roles="loadingAssistantRoles"
      :role-switch-disabled="roleSwitchDisabled"
      :saving-collection="savingCollection"
      :saving-role="savingRole"
      :switching-assistant-role="switchingAssistantRole"
      @create-role="$emit('createRole', $event)"
      @delete-collection="$emit('deleteCollection')"
      @delete-role="$emit('deleteRole', $event)"
      @reorder-roles="$emit('reorderRoles', $event)"
      @save-collection="$emit('saveCollection', $event)"
      @select-active-role="$emit('selectActiveRole', $event)"
      @update-role="$emit('updateRole', $event)"
    />
  </aside>
</template>
