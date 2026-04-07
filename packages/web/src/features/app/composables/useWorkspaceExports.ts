import type {
  BriefingExport,
  BriefingForm,
  KnowledgeExportTask,
  KnowledgeSource,
  KnowledgeTemplateSummary,
} from "@atlas-kb/schema";
import { ref } from "vue";
import {
  createBriefingExportRequest,
  createKnowledgeExportTaskRequest,
  fetchBriefingOpinionRequest,
  listKnowledgeExportTasksRequest,
  listKnowledgeTemplatesRequest,
} from "@/lib/api-client";

export function useWorkspaceExports(args: {
  getBriefingExportSummary: (
    source: KnowledgeSource,
    form: BriefingForm,
  ) => string;
  onError: (message: string) => void;
  onOpenExportsForSource: (source: KnowledgeSource) => Promise<void>;
  onSuccess: (message: string) => void;
}) {
  const briefing = ref<
    Awaited<ReturnType<typeof fetchBriefingOpinionRequest>>["briefing"] | null
  >(null);
  const briefingHistory = ref<BriefingExport[]>([]);
  const exportTasks = ref<KnowledgeExportTask[]>([]);
  const exportTemplates = ref<KnowledgeTemplateSummary[]>([]);
  const loadingBriefing = ref(false);
  const loadingExportTasks = ref(false);
  const savingBriefing = ref(false);

  async function loadBriefing(sourceId: string) {
    loadingBriefing.value = true;

    try {
      const data = await fetchBriefingOpinionRequest(sourceId);
      briefing.value = data.briefing;
      briefingHistory.value = data.history;
    } catch (cause) {
      briefing.value = null;
      briefingHistory.value = [];
      args.onError(cause instanceof Error ? cause.message : "拟办意见生成失败");
    } finally {
      loadingBriefing.value = false;
    }
  }

  async function loadExportTemplates() {
    try {
      const data = await listKnowledgeTemplatesRequest();
      exportTemplates.value = data.templates;
    } catch (cause) {
      exportTemplates.value = [];
      args.onError(cause instanceof Error ? cause.message : "导出模版加载失败");
    }
  }

  async function loadExportTasks(sourceId?: string) {
    loadingExportTasks.value = true;

    try {
      const data = await listKnowledgeExportTasksRequest({
        sourceId,
      });
      exportTasks.value = data.tasks;
    } catch (cause) {
      exportTasks.value = [];
      args.onError(cause instanceof Error ? cause.message : "导出任务加载失败");
    } finally {
      loadingExportTasks.value = false;
    }
  }

  async function openExportPanelForSource(source: KnowledgeSource) {
    await args.onOpenExportsForSource(source);
    await loadExportTasks(source.id);
  }

  async function createExportTask(
    source: KnowledgeSource,
    templateId?: string,
  ) {
    try {
      await createKnowledgeExportTaskRequest({
        sourceId: source.id,
        body: {
          taskType: templateId ? undefined : "briefing",
          templateId,
        },
      });
      await openExportPanelForSource(source);
      args.onSuccess("导出任务已提交");
    } catch (cause) {
      args.onError(cause instanceof Error ? cause.message : "导出任务提交失败");
    }
  }

  async function openBriefing(source: KnowledgeSource) {
    if (source.status !== "ready") {
      args.onError("当前资料尚未处理完成，暂时无法生成拟办意见");
      return;
    }

    await openExportPanelForSource(source);
  }

  async function refreshBriefing(source: KnowledgeSource | null) {
    if (!source) {
      return;
    }

    await loadBriefing(source.id);
  }

  async function exportBriefing(argsForExport: {
    citations: BriefingExport["citations"];
    form: BriefingForm;
    source: KnowledgeSource | null;
  }) {
    if (!argsForExport.source) {
      return;
    }

    savingBriefing.value = true;

    try {
      const data = await createBriefingExportRequest({
        sourceId: argsForExport.source.id,
        body: {
          summary: args.getBriefingExportSummary(
            argsForExport.source,
            argsForExport.form,
          ),
          form: argsForExport.form,
          citations: argsForExport.citations,
        },
      });

      briefingHistory.value = [data.export, ...briefingHistory.value];
      args.onSuccess("拟办意见已导出");
      return data.export;
    } catch (cause) {
      args.onError(cause instanceof Error ? cause.message : "导出拟办意见失败");
      return undefined;
    } finally {
      savingBriefing.value = false;
    }
  }

  function resetBriefingState() {
    briefing.value = null;
    briefingHistory.value = [];
  }

  return {
    briefing,
    briefingHistory,
    createExportTask,
    exportBriefing,
    exportTasks,
    exportTemplates,
    loadBriefing,
    loadExportTasks,
    loadExportTemplates,
    loadingBriefing,
    loadingExportTasks,
    openBriefing,
    openExportPanelForSource,
    refreshBriefing,
    resetBriefingState,
    savingBriefing,
  };
}
