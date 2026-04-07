import type {
  KnowledgeExportTask,
  KnowledgeExportTaskDetail,
  KnowledgeExportTaskParameters,
  KnowledgeSource,
  KnowledgeTemplateSummary,
} from "@atlas-kb/schema";
import { computed, onBeforeUnmount, ref } from "vue";
import {
  createKnowledgeExportTaskRequest,
  fetchKnowledgeExportTaskRequest,
  listKnowledgeExportTasksRequest,
  listKnowledgeTemplatesRequest,
  updateKnowledgeExportTaskRequest,
} from "@/lib/api-client";

const EXPORT_POLL_INTERVAL_MS = 4_000;

function isTaskInProgress(task: KnowledgeExportTask): boolean {
  return task.status === "pending" || task.status === "processing";
}

export function useWorkspaceExports(args: {
  onError: (message: string) => void;
  onOpenExportsPanel: () => Promise<void>;
  onSuccess: (message: string) => void;
}) {
  const exportTasks = ref<KnowledgeExportTask[]>([]);
  const exportTemplates = ref<KnowledgeTemplateSummary[]>([]);
  const selectedExportSource = ref<KnowledgeSource | null>(null);
  const selectedTaskDetail = ref<KnowledgeExportTaskDetail | null>(null);
  const loadingExportTaskDetail = ref(false);
  const loadingExportTasks = ref(false);
  const savingExportTask = ref(false);
  const showExportTaskDetailModal = ref(false);
  const showExportTemplateModal = ref(false);
  const creatingExportTask = ref(false);

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const inProgressTaskIds = computed(() =>
    exportTasks.value.filter(isTaskInProgress).map((task) => task.id),
  );

  function stopExportTaskPolling() {
    if (!pollTimer) {
      return;
    }

    clearInterval(pollTimer);
    pollTimer = null;
  }

  function upsertTaskSummary(task: KnowledgeExportTask) {
    const currentTasks = [...exportTasks.value];
    const index = currentTasks.findIndex((item) => item.id === task.id);

    if (index >= 0) {
      currentTasks[index] = task;
    } else {
      currentTasks.unshift(task);
    }

    exportTasks.value = currentTasks.sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  }

  async function pollInProgressTasks() {
    const ids = inProgressTaskIds.value;

    if (ids.length === 0) {
      stopExportTaskPolling();
      return;
    }

    try {
      const details = await Promise.all(
        ids.map((taskId) => fetchKnowledgeExportTaskRequest(taskId)),
      );

      for (const detail of details) {
        upsertTaskSummary(detail.task);

        if (selectedTaskDetail.value?.id === detail.task.id) {
          selectedTaskDetail.value = detail.task;
        }
      }
    } catch (cause) {
      stopExportTaskPolling();
      args.onError(
        cause instanceof Error ? cause.message : "导出任务状态刷新失败",
      );
    }
  }

  function ensureExportTaskPolling() {
    if (inProgressTaskIds.value.length === 0 || pollTimer) {
      if (inProgressTaskIds.value.length === 0) {
        stopExportTaskPolling();
      }

      return;
    }

    pollTimer = setInterval(() => {
      void pollInProgressTasks();
    }, EXPORT_POLL_INTERVAL_MS);
  }

  async function loadExportTemplates() {
    try {
      const data = await listKnowledgeTemplatesRequest();
      exportTemplates.value = data.templates;
    } catch (cause) {
      exportTemplates.value = [];
      args.onError(cause instanceof Error ? cause.message : "导出模板加载失败");
    }
  }

  async function loadExportTasks() {
    loadingExportTasks.value = true;

    try {
      const data = await listKnowledgeExportTasksRequest();
      exportTasks.value = data.tasks;
      ensureExportTaskPolling();
    } catch (cause) {
      exportTasks.value = [];
      stopExportTaskPolling();
      args.onError(cause instanceof Error ? cause.message : "导出任务加载失败");
    } finally {
      loadingExportTasks.value = false;
    }
  }

  function openExportTemplateModal(source: KnowledgeSource) {
    selectedExportSource.value = source;
    showExportTemplateModal.value = true;
  }

  function closeExportTemplateModal() {
    showExportTemplateModal.value = false;
  }

  async function submitExportTask(templateId: string) {
    if (!selectedExportSource.value) {
      return;
    }

    creatingExportTask.value = true;

    try {
      const data = await createKnowledgeExportTaskRequest({
        sourceId: selectedExportSource.value.id,
        body: {
          templateId,
        },
      });

      upsertTaskSummary(data.task);
      closeExportTemplateModal();
      await args.onOpenExportsPanel();
      await loadExportTasks();
      ensureExportTaskPolling();
      args.onSuccess("导出任务已提交");
    } catch (cause) {
      args.onError(cause instanceof Error ? cause.message : "导出任务提交失败");
    } finally {
      creatingExportTask.value = false;
    }
  }

  async function openExportTaskDetail(taskId: string) {
    loadingExportTaskDetail.value = true;
    showExportTaskDetailModal.value = true;

    try {
      const data = await fetchKnowledgeExportTaskRequest(taskId);
      selectedTaskDetail.value = data.task;
      upsertTaskSummary(data.task);
      ensureExportTaskPolling();
    } catch (cause) {
      selectedTaskDetail.value = null;
      args.onError(
        cause instanceof Error ? cause.message : "导出任务详情加载失败",
      );
    } finally {
      loadingExportTaskDetail.value = false;
    }
  }

  function closeExportTaskDetailModal() {
    showExportTaskDetailModal.value = false;
  }

  async function saveExportTask(parameters: KnowledgeExportTaskParameters) {
    if (!selectedTaskDetail.value) {
      return;
    }

    savingExportTask.value = true;

    try {
      const data = await updateKnowledgeExportTaskRequest({
        taskId: selectedTaskDetail.value.id,
        body: {
          parameters,
        },
      });

      selectedTaskDetail.value = data.task;
      upsertTaskSummary(data.task);
      args.onSuccess("导出任务已保存");
    } catch (cause) {
      args.onError(cause instanceof Error ? cause.message : "导出任务保存失败");
    } finally {
      savingExportTask.value = false;
    }
  }

  onBeforeUnmount(() => {
    stopExportTaskPolling();
  });

  return {
    creatingExportTask,
    exportTasks,
    exportTemplates,
    loadExportTasks,
    loadExportTemplates,
    loadingExportTaskDetail,
    loadingExportTasks,
    openExportTaskDetail,
    openExportTemplateModal,
    saveExportTask,
    selectedExportSource,
    selectedTaskDetail,
    showExportTaskDetailModal,
    showExportTemplateModal,
    stopExportTaskPolling,
    submitExportTask,
    closeExportTaskDetailModal,
    closeExportTemplateModal,
    savingExportTask,
  };
}
