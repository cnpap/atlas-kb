<script setup lang="ts">
  import type {
    ChatMessage,
    ChatSession,
    KnowledgeCollection,
    KnowledgeExportTask,
    KnowledgeSource,
    KnowledgeSourcesData,
  } from "@atlas-kb/schema";
  import { useToast } from "@nuxt/ui/composables";
  import { computed, onMounted, ref, watch } from "vue";
  import { useRoute, useRouter } from "vue-router";
  import {
    createChatSessionRequest,
    createKnowledgeCollectionRequest,
    deleteChatSessionRequest,
    deleteKnowledgeCollectionRequest,
    deleteKnowledgeSourceRequest,
    downloadKnowledgeExportTaskRequest,
    downloadKnowledgeSourceRequest,
    fetchChatMessagesRequest,
    fetchKnowledgeCollectionSources,
    getErrorMessage,
    importKnowledgeTextRequest,
    listChatSessionsRequest,
    listKnowledgeCollections,
    sendChatFeedbackRequest,
    streamChatReplyRequest,
    uploadKnowledgeFileRequest,
    updateChatSessionRequest,
    updateKnowledgeCollectionRequest,
    updateKnowledgeSourceRequest,
  } from "@/lib/api-client";
  import {
    initializeAuthSession,
    logout,
    useAuthSession,
  } from "@/lib/auth-session";
  import { generateClientId } from "@/lib/ids";
  import CollectionSettingsModal from "@/features/app/components/CollectionSettingsModal.vue";
  import CreateCollectionModal from "@/features/app/components/CreateCollectionModal.vue";
  import ExportTaskDetailModal from "@/features/app/components/ExportTaskDetailModal.vue";
  import ExportTemplateModal from "@/features/app/components/ExportTemplateModal.vue";
  import ImportSourcesModal from "@/features/app/components/ImportSourcesModal.vue";
  import SourceEditorModal from "@/features/app/components/SourceEditorModal.vue";
  import WorkspaceChatPane from "@/features/app/components/WorkspaceChatPane.vue";
  import WorkspaceContextPane from "@/features/app/components/WorkspaceContextPane.vue";
  import WorkspaceSidebar from "@/features/app/components/WorkspaceSidebar.vue";
  import { buildWorkspaceChatTurns } from "@/features/app/lib/workspace-chat-turns";
  import { useWorkspaceExports } from "@/features/app/composables/useWorkspaceExports";

  type PanelMode = "library" | "exports";

  const route = useRoute();
  const router = useRouter();
  const toast = useToast();
  const {
    currentUser,
    initialized: authInitialized,
    pending: authPending,
  } = useAuthSession();

  const collections = ref<KnowledgeCollection[]>([]);
  const sessions = ref<ChatSession[]>([]);
  const sources = ref<KnowledgeSource[]>([]);
  const messages = ref<ChatMessage[]>([]);
  const loadingCollections = ref(true);
  const loadingSessions = ref(true);
  const loadingMessages = ref(false);
  const loadingSources = ref(false);
  const bootstrappingWorkspace = ref(true);
  const replying = ref(false);
  const creatingCollection = ref(false);
  const savingCollection = ref(false);
  const savingSource = ref(false);
  const importPending = ref(false);
  const sourceActionId = ref("");
  const error = ref("");
  const composer = ref("");
  const sourceFilter = ref("");
  const selectedAssistantMessageId = ref("");
  const suspendedMessageLoadSessionId = ref("");
  const showCreateCollection = ref(false);
  const showImportModal = ref(false);
  const showSourceEditorModal = ref(false);
  const showCollectionSettingsModal = ref(false);

  function readQueryValue(value: unknown): string {
    return typeof value === "string" ? value : "";
  }

  function showToast(
    title: string,
    color: "success" | "warning" | "info" | "error" = "success",
  ) {
    toast.add({
      title,
      color,
    });
  }

  watch(error, (message, previousMessage) => {
    if (!message || message === previousMessage) {
      return;
    }

    showToast(message, "error");
  });

  const panel = computed<PanelMode>(() =>
    route.query.panel === "exports" ? "exports" : "library",
  );
  const activeCollectionId = computed(() => readQueryValue(route.query.group));
  const activeSessionId = computed(() => readQueryValue(route.query.session));
  const routeSourceId = computed(() => readQueryValue(route.query.source));

  const activeCollection = computed(
    () =>
      collections.value.find((item) => item.id === activeCollectionId.value) ||
      null,
  );
  const activeSession = computed(
    () =>
      sessions.value.find((item) => item.id === activeSessionId.value) || null,
  );
  const chatTurns = computed(() =>
    buildWorkspaceChatTurns(messages.value, {
      selectedAssistantMessageId: selectedAssistantMessageId.value,
    }),
  );
  const filteredSources = computed(() => {
    const keyword = sourceFilter.value.trim().toLowerCase();

    if (!keyword) {
      return sources.value;
    }

    return sources.value.filter((source) =>
      `${source.title}\n${source.summary}\n${source.tags.join(" ")}`
        .toLowerCase()
        .includes(keyword),
    );
  });
  const selectedSource = computed(
    () => sources.value.find((item) => item.id === routeSourceId.value) || null,
  );
  const activeSessionCollectionLabel = computed(() => {
    if (activeSession.value) {
      return getCollectionName(activeSession.value.collectionId, "未选择分组");
    }

    if (activeCollection.value) {
      return activeCollection.value.name;
    }

    return "未选择分组";
  });
  const userLoading = computed(
    () => !authInitialized.value || (authPending.value && !currentUser.value),
  );

  function createTempMessageId(prefix: "user" | "assistant"): string {
    return generateClientId(`temp:${prefix}`);
  }

  function replaceMessage(currentMessageId: string, nextMessage: ChatMessage) {
    messages.value = messages.value.map((message) => {
      if (message.id !== currentMessageId) {
        return message;
      }

      return nextMessage;
    });

    if (selectedAssistantMessageId.value === currentMessageId) {
      selectedAssistantMessageId.value = nextMessage.id;
    }
  }

  function updateAssistantDraftFromStream(messageId: string, content: string) {
    messages.value = messages.value.map((message) =>
      message.id === messageId
        ? {
            ...message,
            content,
          }
        : message,
    );
  }

  function parseTags(input: string): string[] | undefined {
    const tags = input
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);

    return tags.length > 0 ? [...new Set(tags)] : undefined;
  }

  const {
    closeExportTaskDetailModal,
    closeExportTemplateModal,
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
    savingExportTask,
    selectedExportSource,
    selectedTaskDetail,
    showExportTaskDetailModal,
    showExportTemplateModal,
    stopExportTaskPolling,
    submitExportTask,
  } = useWorkspaceExports({
    onError: (message) => {
      error.value = message;
    },
    onOpenExportsPanel: () =>
      replaceWorkspaceQuery({
        panel: "exports",
      }),
    onSuccess: (message) => {
      showToast(message);
    },
  });

  async function replaceWorkspaceQuery(
    patch: Record<string, string | undefined>,
  ) {
    const nextQuery = { ...route.query };

    for (const [key, value] of Object.entries(patch)) {
      if (value) {
        nextQuery[key] = value;
      } else {
        delete nextQuery[key];
      }
    }

    await router.replace({
      path: "/app",
      query: nextQuery,
    });
  }

  function getCollectionName(
    collectionId?: string | null,
    fallback = "未关联分组",
  ): string {
    if (!collectionId) {
      return fallback;
    }

    return (
      collections.value.find((item) => item.id === collectionId)?.name ||
      fallback
    );
  }

  function syncSourceCollection(data: KnowledgeSourcesData) {
    sources.value = data.sources;
  }

  async function loadCollections() {
    loadingCollections.value = true;

    try {
      const data = await listKnowledgeCollections();
      collections.value = data.collections;

      const preferredCollectionId = data.collections.some(
        (item) => item.id === activeCollectionId.value,
      )
        ? activeCollectionId.value
        : data.collections[0]?.id || "";

      if (!activeCollectionId.value && preferredCollectionId) {
        await replaceWorkspaceQuery({
          group: preferredCollectionId,
          panel: route.query.panel === "exports" ? "exports" : "library",
        });
      }
    } catch (cause) {
      error.value =
        cause instanceof Error ? cause.message : "资料文件夹加载失败";
    } finally {
      loadingCollections.value = false;
    }
  }

  async function loadSessions(collectionId: string) {
    if (!collectionId) {
      sessions.value = [];
      messages.value = [];
      selectedAssistantMessageId.value = "";
      return;
    }

    loadingSessions.value = true;

    try {
      const data = await listChatSessionsRequest(collectionId);
      sessions.value = data.sessions;

      const preferredSessionId = data.sessions.some(
        (item) => item.id === activeSessionId.value,
      )
        ? activeSessionId.value
        : data.sessions[0]?.id || "";

      if (preferredSessionId !== activeSessionId.value) {
        await replaceWorkspaceQuery({
          session: preferredSessionId || undefined,
        });
      } else if (preferredSessionId) {
        await loadMessages(preferredSessionId);
      } else {
        messages.value = [];
        selectedAssistantMessageId.value = "";
      }
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "会话加载失败";
    } finally {
      loadingSessions.value = false;
    }
  }

  async function loadSources(
    collectionId: string,
    options: {
      silent?: boolean;
    } = {},
  ) {
    if (!collectionId) {
      sources.value = [];
      return;
    }

    if (!options.silent) {
      loadingSources.value = true;
    }

    try {
      const data = await fetchKnowledgeCollectionSources(collectionId);
      syncSourceCollection(data);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "资料加载失败";
    } finally {
      if (!options.silent) {
        loadingSources.value = false;
      }
    }
  }

  async function loadMessages(sessionId: string) {
    if (!sessionId) {
      messages.value = [];
      selectedAssistantMessageId.value = "";
      return;
    }

    if (!sessions.value.some((item) => item.id === sessionId)) {
      messages.value = [];
      selectedAssistantMessageId.value = "";
      return;
    }

    loadingMessages.value = true;

    try {
      const data = await fetchChatMessagesRequest(sessionId);
      messages.value = data.messages;
      selectedAssistantMessageId.value =
        [...data.messages].reverse().find((item) => item.role === "assistant")
          ?.id || "";
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "消息加载失败";
    } finally {
      loadingMessages.value = false;
    }
  }

  async function ensureSession(): Promise<string> {
    if (activeSession.value) {
      return activeSessionId.value;
    }

    if (!activeCollectionId.value) {
      throw new Error("请先选择一个资料文件夹");
    }

    const created = await createChatSessionRequest({
      collectionId: activeCollectionId.value,
      title: undefined,
    });

    suspendedMessageLoadSessionId.value = created.session.id;
    await loadSessions(activeCollectionId.value);

    if (activeSessionId.value !== created.session.id) {
      suspendedMessageLoadSessionId.value = created.session.id;
      await replaceWorkspaceQuery({
        session: created.session.id,
      });
    }

    return created.session.id;
  }

  async function createCollection(payload: {
    description: string;
    name: string;
  }) {
    if (!payload.name.trim() || !payload.description.trim()) {
      error.value = "请填写文件夹名称和说明";
      return;
    }

    creatingCollection.value = true;
    error.value = "";

    try {
      const data = await createKnowledgeCollectionRequest({
        name: payload.name.trim(),
        description: payload.description.trim(),
      });

      showCreateCollection.value = false;
      await loadCollections();
      await replaceWorkspaceQuery({
        group: data.collection.id,
        panel: "library",
      });
      await loadSources(data.collection.id);
    } catch (cause) {
      error.value =
        cause instanceof Error ? cause.message : "创建资料文件夹失败";
    } finally {
      creatingCollection.value = false;
    }
  }

  async function saveCollection(payload: {
    description: string;
    name: string;
  }) {
    if (!activeCollection.value) {
      return;
    }

    savingCollection.value = true;
    error.value = "";

    try {
      await updateKnowledgeCollectionRequest({
        collectionId: activeCollection.value.id,
        body: {
          name: payload.name.trim(),
          description: payload.description.trim(),
        },
      });
      await loadCollections();
      await loadSources(activeCollection.value.id);
      showCollectionSettingsModal.value = false;
    } catch (cause) {
      error.value =
        cause instanceof Error ? cause.message : "资料文件夹保存失败";
    } finally {
      savingCollection.value = false;
    }
  }

  async function removeCollection() {
    if (!activeCollection.value) {
      return;
    }

    const accepted = window.confirm(
      `确认删除资料文件夹“${activeCollection.value.name}”？`,
    );

    if (!accepted) {
      return;
    }

    error.value = "";

    try {
      await deleteKnowledgeCollectionRequest(activeCollection.value.id);
      await loadCollections();

      const nextCollectionId = collections.value[0]?.id || "";

      await replaceWorkspaceQuery({
        group: nextCollectionId || undefined,
        session: undefined,
        source: undefined,
        panel: nextCollectionId ? "library" : undefined,
      });

      if (nextCollectionId) {
        await Promise.all([
          loadSources(nextCollectionId),
          loadSessions(nextCollectionId),
        ]);
      } else {
        sources.value = [];
        sessions.value = [];
        messages.value = [];
      }
      showCollectionSettingsModal.value = false;
    } catch (cause) {
      error.value =
        cause instanceof Error ? cause.message : "删除资料文件夹失败";
    }
  }

  async function startNewSession() {
    if (!activeCollectionId.value) {
      error.value = "请先选择一个资料文件夹";
      return;
    }

    error.value = "";

    try {
      const created = await createChatSessionRequest({
        collectionId: activeCollectionId.value,
      });
      suspendedMessageLoadSessionId.value = created.session.id;
      await loadSessions(activeCollectionId.value);
      messages.value = [];
      selectedAssistantMessageId.value = "";
      await replaceWorkspaceQuery({
        session: created.session.id,
      });
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "新建会话失败";
    }
  }

  async function renameSession() {
    if (!activeSession.value) {
      return;
    }

    const nextTitle = window.prompt(
      "输入新的会话名称",
      activeSession.value.title,
    );

    if (!nextTitle?.trim()) {
      return;
    }

    try {
      await updateChatSessionRequest({
        sessionId: activeSession.value.id,
        body: {
          title: nextTitle.trim(),
        },
      });
      await loadSessions(activeSession.value.collectionId);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "会话重命名失败";
    }
  }

  async function removeSession(sessionId: string) {
    const accepted = window.confirm("确认删除这个会话？");

    if (!accepted) {
      return;
    }

    try {
      await deleteChatSessionRequest(sessionId);
      if (activeCollectionId.value) {
        await loadSessions(activeCollectionId.value);
      } else {
        sessions.value = [];
        messages.value = [];
      }
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "删除会话失败";
    }
  }

  async function submitReply() {
    const trimmed = composer.value.trim();

    if (!trimmed) {
      return;
    }

    if (!activeCollectionId.value) {
      error.value = "请先选择一个资料文件夹";
      return;
    }

    replying.value = true;
    error.value = "";
    composer.value = "";

    const previousMessages = [...messages.value];
    const previousSelectedAssistantMessageId = selectedAssistantMessageId.value;
    const tempUserId = createTempMessageId("user");
    const tempAssistantId = createTempMessageId("assistant");
    const draftCreatedAt = new Date().toISOString();
    const draftSessionId = activeSessionId.value;
    let acceptedReply = false;
    let replyErrorMessage = "";
    const completedReplyState = {
      assistantMessage: null as ChatMessage | null,
    };
    let sessionId = "";

    messages.value = [
      ...messages.value,
      {
        id: tempUserId,
        sessionId: draftSessionId,
        role: "user",
        content: trimmed,
        citations: [],
        createdAt: draftCreatedAt,
      },
      {
        id: tempAssistantId,
        sessionId: draftSessionId,
        role: "assistant",
        content: "",
        citations: [],
        createdAt: draftCreatedAt,
      },
    ];
    selectedAssistantMessageId.value = tempAssistantId;

    try {
      sessionId = await ensureSession();

      messages.value = messages.value.map((message) =>
        message.id === tempUserId || message.id === tempAssistantId
          ? {
              ...message,
              sessionId,
            }
          : message,
      );
      selectedAssistantMessageId.value = tempAssistantId;

      await streamChatReplyRequest({
        sessionId,
        body: {
          query: trimmed,
          limit: 6,
        },
        onUpdate: ({ content, events }) => {
          updateAssistantDraftFromStream(tempAssistantId, content);

          for (const event of events) {
            switch (event.type) {
              case "reply-accepted":
                acceptedReply = true;
                replaceMessage(tempUserId, event.userMessage);
                break;
              case "reply-completed":
                completedReplyState.assistantMessage = event.assistantMessage;
                replaceMessage(tempUserId, event.userMessage);
                replaceMessage(tempAssistantId, event.assistantMessage);
                selectedAssistantMessageId.value = event.assistantMessage.id;
                break;
              case "reply-error":
                replyErrorMessage = event.message;
                error.value = event.message;
                break;
            }
          }
        },
      });

      if (replyErrorMessage) {
        throw new Error(replyErrorMessage);
      }

      if (!completedReplyState.assistantMessage) {
        throw new Error("AI 对话未完成，请重试。");
      }

      await loadSessions(activeCollectionId.value);
      await replaceWorkspaceQuery({
        session: sessionId,
        panel: "library",
      });
    } catch (cause) {
      if (!acceptedReply) {
        messages.value = previousMessages;
        selectedAssistantMessageId.value = previousSelectedAssistantMessageId;
        composer.value = trimmed;
      }

      if (!error.value) {
        error.value = getErrorMessage(cause);
      }
    } finally {
      replying.value = false;
    }
  }

  async function sendFeedback(message: ChatMessage, rating: "up" | "down") {
    try {
      const feedback = await sendChatFeedbackRequest({
        messageId: message.id,
        body: {
          rating,
        },
      });
      messages.value = messages.value.map((item) =>
        item.id === message.id
          ? {
              ...item,
              feedback,
            }
          : item,
      );
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "反馈提交失败";
    }
  }

  async function submitFileImport(payload: {
    files: File[];
    summary?: string;
    tags?: string[];
  }) {
    if (!activeCollection.value) {
      error.value = "请先选择一个资料文件夹";
      return;
    }

    importPending.value = true;
    error.value = "";

    const collectionId = activeCollection.value.id;
    let acceptedCount = 0;

    try {
      for (const file of payload.files) {
        await uploadKnowledgeFileRequest({
          collectionId,
          file,
          summary: payload.summary,
          tags: payload.tags,
        });

        acceptedCount += 1;
      }

      await loadCollections();
      await loadSources(collectionId);
      showImportModal.value = false;

      if (acceptedCount > 0) {
        showToast("文件已加入知识库");
      } else {
        showToast("没有成功导入的文件", "warning");
      }
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "导入资料失败";
    } finally {
      importPending.value = false;
    }
  }

  async function submitTextImport(payload: {
    content: string;
    summary?: string;
    tags?: string[];
    title?: string;
  }) {
    if (!activeCollection.value) {
      error.value = "请先选择一个资料文件夹";
      return;
    }

    importPending.value = true;
    error.value = "";

    try {
      await importKnowledgeTextRequest({
        collectionId: activeCollection.value.id,
        body: payload,
      });
      await loadCollections();
      await loadSources(activeCollection.value.id);
      showImportModal.value = false;
      showToast("文本资料已加入当前文件夹");
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "导入资料失败";
    } finally {
      importPending.value = false;
    }
  }

  async function saveSource(payload: {
    content: string;
    summary: string;
    tags: string;
    title: string;
  }) {
    if (!selectedSource.value) {
      return;
    }

    savingSource.value = true;
    error.value = "";

    try {
      await updateKnowledgeSourceRequest({
        sourceId: selectedSource.value.id,
        body: {
          title: payload.title.trim() || undefined,
          summary: payload.summary.trim() || undefined,
          tags: parseTags(payload.tags),
          content: payload.content.trim() || undefined,
        },
      });

      await loadSources(selectedSource.value.collectionId);
      await loadCollections();
      showSourceEditorModal.value = false;
      showToast("资料修改已保存");
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "资料信息保存失败";
    } finally {
      savingSource.value = false;
    }
  }

  async function deleteSource(source: KnowledgeSource) {
    const accepted = window.confirm(`确认删除资料“${source.title}”？`);

    if (!accepted) {
      return;
    }

    sourceActionId.value = source.id;
    error.value = "";

    try {
      await deleteKnowledgeSourceRequest(source.id);
      await loadSources(source.collectionId);
      await loadCollections();

      if (routeSourceId.value === source.id) {
        await replaceWorkspaceQuery({
          source: undefined,
        });
      }

      showSourceEditorModal.value = false;
      showToast("资料已删除");
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "删除资料失败";
    } finally {
      sourceActionId.value = "";
    }
  }

  async function downloadSource(source: KnowledgeSource) {
    try {
      await downloadKnowledgeSourceRequest({
        sourceId: source.id,
        filename: source.sourceFilename,
      });
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "资料下载失败";
    }
  }

  async function selectCollection(collectionId: string) {
    await replaceWorkspaceQuery({
      group: collectionId,
      session: undefined,
      source: undefined,
      panel: "library",
    });
  }

  async function openPanel(nextPanel: PanelMode) {
    await replaceWorkspaceQuery({
      panel: nextPanel,
    });
  }

  async function openSession(session: ChatSession) {
    await replaceWorkspaceQuery({
      session: session.id,
      group: session.collectionId,
    });
  }

  async function openSource(source: KnowledgeSource) {
    await replaceWorkspaceQuery({
      group: source.collectionId,
      source: source.id,
      panel: "library",
    });
    showSourceEditorModal.value = true;
  }

  function handleOpenExportModal(source: KnowledgeSource) {
    openExportTemplateModal(source);
  }

  async function handleOpenExportTaskDetail(taskId: string) {
    await openExportTaskDetail(taskId);
  }

  function handleDownloadExportTask(task: KnowledgeExportTask) {
    if (!task?.exportFile) {
      return;
    }

    void downloadKnowledgeExportTaskRequest({
      taskId: task.id,
      filename: task.exportFile.outputFilename,
    }).catch((cause) => {
      error.value = cause instanceof Error ? cause.message : "导出结果下载失败";
    });
  }

  async function restoreWorkspaceState() {
    bootstrappingWorkspace.value = true;

    try {
      await initializeAuthSession();
      await Promise.all([loadCollections(), loadExportTemplates()]);

      const resolvedCollectionId =
        activeCollectionId.value || collections.value[0]?.id || "";

      if (!resolvedCollectionId) {
        sources.value = [];
        sessions.value = [];
        messages.value = [];
        return;
      }

      if (resolvedCollectionId !== activeCollectionId.value) {
        await replaceWorkspaceQuery({
          group: resolvedCollectionId,
          panel: panel.value,
        });
      }

      await Promise.all([
        loadSources(resolvedCollectionId),
        loadSessions(resolvedCollectionId),
      ]);

      const resolvedSessionId = sessions.value.some(
        (item) => item.id === activeSessionId.value,
      )
        ? activeSessionId.value
        : sessions.value[0]?.id || "";

      if (resolvedSessionId && resolvedSessionId !== activeSessionId.value) {
        suspendedMessageLoadSessionId.value = resolvedSessionId;
        await replaceWorkspaceQuery({
          session: resolvedSessionId,
        });
      }

      if (resolvedSessionId) {
        await loadMessages(resolvedSessionId);
      }

      if (panel.value === "exports") {
        await loadExportTasks();
      }
    } finally {
      bootstrappingWorkspace.value = false;
    }
  }

  async function logoutCurrentUser() {
    logout();
    await router.replace("/login");
  }

  watch(activeCollectionId, (value, previousValue) => {
    if (bootstrappingWorkspace.value) {
      return;
    }

    if (value === previousValue) {
      return;
    }

    if (!value) {
      sources.value = [];
      sessions.value = [];
      messages.value = [];
      selectedAssistantMessageId.value = "";
      return;
    }

    void Promise.all([loadSources(value), loadSessions(value)]);
  });

  watch(activeSessionId, (value) => {
    if (bootstrappingWorkspace.value) {
      return;
    }

    if (value && value === suspendedMessageLoadSessionId.value) {
      suspendedMessageLoadSessionId.value = "";
      return;
    }

    void loadMessages(value);
  });

  watch(
    panel,
    (nextPanel) => {
      if (bootstrappingWorkspace.value) {
        return;
      }

      if (nextPanel !== "exports") {
        stopExportTaskPolling();
        return;
      }

      void loadExportTasks();
    },
    {
      immediate: true,
    },
  );

  onMounted(async () => {
    await restoreWorkspaceState();
  });
</script>

<template>
  <section class="workbench-grid">
    <WorkspaceSidebar
      :active-collection-id="activeCollectionId"
      :active-session-id="activeSessionId"
      :collections="collections"
      :current-username="currentUser?.username"
      :loading-collections="loadingCollections"
      :loading-sessions="loadingSessions"
      :sessions="sessions"
      :user-loading="userLoading"
      @create-collection="showCreateCollection = true"
      @create-session="startNewSession"
      @delete-session="removeSession"
      @logout="logoutCurrentUser"
      @select-collection="selectCollection"
      @select-session="openSession"
    />

    <WorkspaceChatPane
      :active-session="activeSession"
      :active-session-collection-label="activeSessionCollectionLabel"
      :composer="composer"
      :replying="replying"
      :turns="chatTurns"
      @feedback="sendFeedback"
      @rename-session="renameSession"
      @select-assistant-message="selectedAssistantMessageId = $event"
      @submit="submitReply"
      @update:composer="composer = $event"
    />

    <WorkspaceContextPane
      :active-collection="activeCollection"
      :export-tasks="exportTasks"
      :filtered-sources="filteredSources"
      :loading-export-tasks="loadingExportTasks"
      :loading-sources="loadingSources"
      :panel="panel"
      :source-action-id="sourceActionId"
      :source-filter="sourceFilter"
      @open-export-modal="handleOpenExportModal"
      @open-task-detail="handleOpenExportTaskDetail"
      @delete-source="deleteSource"
      @download-export-task="handleDownloadExportTask"
      @download-source="downloadSource"
      @edit-source="openSource"
      @open-import="showImportModal = true"
      @open-panel="openPanel"
      @open-settings="showCollectionSettingsModal = true"
      @update:source-filter="sourceFilter = $event"
    />
  </section>

  <CreateCollectionModal
    v-model:open="showCreateCollection"
    :creating="creatingCollection"
    @submit="createCollection"
  />

  <ImportSourcesModal
    v-model:open="showImportModal"
    :pending="importPending"
    @submit:file="submitFileImport"
    @submit:text="submitTextImport"
  />

  <ExportTemplateModal
    v-model:open="showExportTemplateModal"
    :pending="creatingExportTask"
    :source="selectedExportSource"
    :templates="exportTemplates"
    @submit="submitExportTask"
  />

  <ExportTaskDetailModal
    v-model:open="showExportTaskDetailModal"
    :loading="loadingExportTaskDetail"
    :pending="savingExportTask"
    :task="selectedTaskDetail"
    @submit="saveExportTask"
  />

  <SourceEditorModal
    v-model:open="showSourceEditorModal"
    :saving="savingSource"
    :source="selectedSource"
    :source-action-pending="sourceActionId === selectedSource?.id"
    @delete="deleteSource"
    @download="downloadSource"
    @submit="saveSource"
  />

  <CollectionSettingsModal
    v-model:open="showCollectionSettingsModal"
    :collection="activeCollection"
    :saving="savingCollection"
    @delete="removeCollection"
    @submit="saveCollection"
  />
</template>
