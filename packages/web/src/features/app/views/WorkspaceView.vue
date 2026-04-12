<script setup lang="ts">
  import type {
    AssistantRole,
    ChatMessage,
    ChatSession,
    KnowledgeCollection,
    KnowledgeExportTask,
    KnowledgeSource,
  } from "@atlas-kb/schema";
  import { useToast } from "@nuxt/ui/composables";
  import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
  import { useRoute, useRouter } from "vue-router";
  import CreateCollectionModal from "@/features/app/components/CreateCollectionModal.vue";
  import ExportTaskDetailModal from "@/features/app/components/ExportTaskDetailModal.vue";
  import ExportTemplateModal from "@/features/app/components/ExportTemplateModal.vue";
  import ImportSourcesModal from "@/features/app/components/ImportSourcesModal.vue";
  import SourceEditorModal from "@/features/app/components/SourceEditorModal.vue";
  import WorkspaceChatPane from "@/features/app/components/WorkspaceChatPane.vue";
  import WorkspaceContextPane from "@/features/app/components/WorkspaceContextPane.vue";
  import WorkspaceSidebar from "@/features/app/components/WorkspaceSidebar.vue";
  import { useWorkspaceExports } from "@/features/app/composables/useWorkspaceExports";
  import { buildWorkspaceChatTurns } from "@/features/app/lib/workspace-chat-turns";
  import {
    createAssistantRoleRequest,
    createChatSessionRequest,
    createKnowledgeCollectionRequest,
    deleteAssistantRoleRequest,
    deleteChatSessionRequest,
    deleteKnowledgeCollectionRequest,
    deleteKnowledgeSourceRequest,
    downloadKnowledgeExportTaskRequest,
    downloadKnowledgeSourceRequest,
    fetchChatMessagesRequest,
    fetchKnowledgeCollectionSources,
    getErrorMessage,
    importKnowledgeTextRequest,
    listAssistantRolesRequest,
    listChatSessionsRequest,
    listKnowledgeCollections,
    reorderAssistantRolesRequest,
    retryKnowledgeSourceImportRequest,
    selectActiveAssistantRoleRequest,
    sendChatFeedbackRequest,
    streamChatReplyRequest,
    updateAssistantRoleRequest,
    updateChatSessionRequest,
    updateKnowledgeCollectionRequest,
    updateKnowledgeSourceRequest,
    uploadKnowledgeFileRequest,
  } from "@/lib/api-client";
  import {
    initializeAuthSession,
    logout,
    switchActiveWorkspace,
    useAuthSession,
  } from "@/lib/auth-session";
  import type { ChatReplyProgressState } from "@/lib/chat-stream-progress";
  import { generateClientId } from "@/lib/ids";

  type PanelMode = "library" | "exports" | "settings";
  const SOURCE_POLL_INTERVAL_MS = 4_000;

  const route = useRoute();
  const router = useRouter();
  const toast = useToast();
  const {
    currentUser,
    initialized: authInitialized,
    pending: authPending,
    session,
  } = useAuthSession();

  const assistantRoles = ref<AssistantRole[]>([]);
  const collections = ref<KnowledgeCollection[]>([]);
  const sessions = ref<ChatSession[]>([]);
  const sources = ref<KnowledgeSource[]>([]);
  const messages = ref<ChatMessage[]>([]);
  const activeAssistantRoleId = ref("");
  const deletingAssistantRoleId = ref("");
  const deletingCollection = ref(false);
  const loadingCollections = ref(true);
  const loadingAssistantRoles = ref(true);
  const loadingSessions = ref(true);
  const loadingMessages = ref(false);
  const loadingSources = ref(false);
  const bootstrappingWorkspace = ref(true);
  const replying = ref(false);
  const creatingSession = ref(false);
  const creatingCollection = ref(false);
  const savingCollection = ref(false);
  const savingAssistantRole = ref(false);
  const savingSource = ref(false);
  const importPending = ref(false);
  const sourceActionId = ref("");
  const switchingAssistantRole = ref(false);
  const error = ref("");
  const composer = ref("");
  const sourceFilter = ref("");
  const editingSourceId = ref("");
  const selectedAssistantMessageId = ref("");
  const streamProgressByMessageId = ref<Record<string, ChatReplyProgressState>>(
    {},
  );
  const suspendedMessageLoadSessionId = ref("");
  const showCreateCollection = ref(false);
  const showImportModal = ref(false);
  const showSourceEditorModal = ref(false);

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

  const panel = computed<PanelMode>(() => {
    if (route.query.panel === "exports") {
      return "exports";
    }

    if (route.query.panel === "settings") {
      return "settings";
    }

    return "library";
  });
  const tokenCollectionId = computed(
    () => session.value?.activeCollectionId?.trim() || "",
  );
  const activeCollectionId = computed(
    () => tokenCollectionId.value || readQueryValue(route.query.group),
  );
  const activeSessionId = computed(() => readQueryValue(route.query.session));

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
      progressByMessageId: streamProgressByMessageId.value,
      selectedAssistantMessageId: selectedAssistantMessageId.value,
    }),
  );
  const filteredSources = computed(() => {
    const keyword = sourceFilter.value.trim().toLowerCase();

    if (!keyword) {
      return sources.value;
    }

    return sources.value.filter((source) =>
      `${source.title}\n${source.summary || ""}\n${source.tags.join(" ")}`
        .toLowerCase()
        .includes(keyword),
    );
  });
  const editingSource = computed(
    () => sources.value.find((item) => item.id === editingSourceId.value) || null,
  );
  const hasProcessingSources = computed(() =>
    sources.value.some((source) => source.status === "processing"),
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
  let sourcePollTimer: ReturnType<typeof setInterval> | null = null;

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

  function setAssistantProgress(
    messageId: string,
    progress: ChatReplyProgressState | null,
  ) {
    if (!progress) {
      clearAssistantProgress(messageId);
      return;
    }

    streamProgressByMessageId.value = {
      ...streamProgressByMessageId.value,
      [messageId]: progress,
    };
  }

  function clearAssistantProgress(messageId: string) {
    if (!(messageId in streamProgressByMessageId.value)) {
      return;
    }

    const nextState = { ...streamProgressByMessageId.value };
    delete nextState[messageId];
    streamProgressByMessageId.value = nextState;
  }

  function clearAllAssistantProgress() {
    if (Object.keys(streamProgressByMessageId.value).length === 0) {
      return;
    }

    streamProgressByMessageId.value = {};
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
    delete nextQuery.source;

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

  function syncSourceCollection(data: {
    collection: KnowledgeCollection;
    sources: KnowledgeSource[];
  }) {
    sources.value = data.sources;
  }

  async function loadAssistantRoles(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      loadingAssistantRoles.value = true;
    }

    try {
      const data = await listAssistantRolesRequest();
      assistantRoles.value = data.roles;
      activeAssistantRoleId.value = data.activeRoleId;
    } catch (cause) {
      assistantRoles.value = [];
      activeAssistantRoleId.value = "";
      error.value = cause instanceof Error ? cause.message : "角色加载失败";
    } finally {
      if (!options.silent) {
        loadingAssistantRoles.value = false;
      }
    }
  }

  async function loadCollections(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      loadingCollections.value = true;
    }

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
          panel: panel.value,
        });
      }
    } catch (cause) {
      error.value =
        cause instanceof Error ? cause.message : "资料文件夹加载失败";
    } finally {
      if (!options.silent) {
        loadingCollections.value = false;
      }
    }
  }

  async function loadSessions(collectionId: string) {
    if (!collectionId) {
      sessions.value = [];
      messages.value = [];
      clearAllAssistantProgress();
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
        clearAllAssistantProgress();
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

  function stopSourcePolling() {
    if (!sourcePollTimer) {
      return;
    }

    clearInterval(sourcePollTimer);
    sourcePollTimer = null;
  }

  async function pollProcessingSources() {
    const collectionId = activeCollection.value?.id;

    if (!collectionId || !hasProcessingSources.value) {
      stopSourcePolling();
      return;
    }

    try {
      await Promise.all([
        loadSources(collectionId, {
          silent: true,
        }),
        loadCollections({
          silent: true,
        }),
      ]);
    } catch (cause) {
      stopSourcePolling();
      error.value = cause instanceof Error ? cause.message : "资料状态刷新失败";
    }
  }

  function ensureSourcePolling() {
    if (!activeCollection.value?.id || !hasProcessingSources.value) {
      stopSourcePolling();
      return;
    }

    if (sourcePollTimer) {
      return;
    }

    sourcePollTimer = setInterval(() => {
      void pollProcessingSources();
    }, SOURCE_POLL_INTERVAL_MS);
  }

  async function loadMessages(sessionId: string) {
    if (!sessionId) {
      messages.value = [];
      clearAllAssistantProgress();
      selectedAssistantMessageId.value = "";
      return;
    }

    if (!sessions.value.some((item) => item.id === sessionId)) {
      messages.value = [];
      clearAllAssistantProgress();
      selectedAssistantMessageId.value = "";
      return;
    }

    loadingMessages.value = true;

    try {
      const data = await fetchChatMessagesRequest(sessionId);
      messages.value = data.messages;
      clearAllAssistantProgress();
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
      await switchActiveWorkspace(data.collection.id);

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
      showToast("文件夹设置已保存");
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

    error.value = "";
    deletingCollection.value = true;

    try {
      await deleteKnowledgeCollectionRequest(activeCollection.value.id);
      await loadCollections();

      const nextCollectionId = collections.value[0]?.id || "";

      if (nextCollectionId) {
        await switchActiveWorkspace(nextCollectionId);
      }

      await replaceWorkspaceQuery({
        group: nextCollectionId || undefined,
        session: undefined,
        panel: "settings",
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
        clearAllAssistantProgress();
      }
      editingSourceId.value = "";
      showSourceEditorModal.value = false;
      showToast("资料文件夹已删除");
    } catch (cause) {
      error.value =
        cause instanceof Error ? cause.message : "删除资料文件夹失败";
    } finally {
      deletingCollection.value = false;
    }
  }

  async function createAssistantRole(payload: {
    name: string;
    stylePrompt: string;
  }) {
    savingAssistantRole.value = true;
    error.value = "";

    try {
      const data = await createAssistantRoleRequest(payload);
      await selectActiveAssistantRoleRequest(data.role.id);
      await loadAssistantRoles();
      showToast("角色已创建");
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "角色创建失败";
    } finally {
      savingAssistantRole.value = false;
    }
  }

  async function updateAssistantRole(payload: {
    body: {
      name: string;
      stylePrompt: string;
    };
    roleId: string;
  }) {
    savingAssistantRole.value = true;
    error.value = "";

    try {
      await updateAssistantRoleRequest(payload);
      await loadAssistantRoles({
        silent: true,
      });
      showToast("角色已保存");
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "角色保存失败";
    } finally {
      savingAssistantRole.value = false;
    }
  }

  async function reorderAssistantRoles(roleIds: string[]) {
    if (roleIds.length === 0) {
      return;
    }

    savingAssistantRole.value = true;
    error.value = "";

    try {
      await reorderAssistantRolesRequest({
        roleIds,
      });
      await loadAssistantRoles({
        silent: true,
      });
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "角色排序失败";
    } finally {
      savingAssistantRole.value = false;
    }
  }

  async function deleteAssistantRole(roleId: string) {
    deletingAssistantRoleId.value = roleId;
    error.value = "";

    try {
      await deleteAssistantRoleRequest(roleId);
      await loadAssistantRoles();
      showToast("角色已删除");
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "角色删除失败";
    } finally {
      deletingAssistantRoleId.value = "";
    }
  }

  async function selectAssistantRole(roleId: string) {
    if (!roleId || roleId === activeAssistantRoleId.value) {
      return;
    }

    switchingAssistantRole.value = true;
    error.value = "";

    try {
      const data = await selectActiveAssistantRoleRequest(roleId);
      activeAssistantRoleId.value = data.activeRoleId;
      await loadAssistantRoles({
        silent: true,
      });
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "角色切换失败";
    } finally {
      switchingAssistantRole.value = false;
    }
  }

  async function startNewSession() {
    if (!activeCollectionId.value) {
      error.value = "请先选择一个资料文件夹";
      return;
    }

    if (creatingSession.value) {
      return;
    }

    creatingSession.value = true;
    error.value = "";

    try {
      const created = await createChatSessionRequest({
        collectionId: activeCollectionId.value,
      });
      suspendedMessageLoadSessionId.value = created.session.id;
      await loadSessions(activeCollectionId.value);
      messages.value = [];
      clearAllAssistantProgress();
      selectedAssistantMessageId.value = "";
      await replaceWorkspaceQuery({
        session: created.session.id,
      });
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "新建会话失败";
    } finally {
      creatingSession.value = false;
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
        clearAllAssistantProgress();
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
    const previousStreamProgressByMessageId = {
      ...streamProgressByMessageId.value,
    };
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
        assistantRoleId: activeAssistantRoleId.value || undefined,
        role: "user",
        content: trimmed,
        citations: [],
        createdAt: draftCreatedAt,
      },
      {
        id: tempAssistantId,
        sessionId: draftSessionId,
        assistantRoleId: activeAssistantRoleId.value || undefined,
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
        onUpdate: ({ content, events, progress }) => {
          updateAssistantDraftFromStream(tempAssistantId, content);
          setAssistantProgress(tempAssistantId, progress);

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
                clearAssistantProgress(tempAssistantId);
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
        streamProgressByMessageId.value = previousStreamProgressByMessageId;
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
    let queuedForProcessingCount = 0;

    try {
      for (const file of payload.files) {
        const result = await uploadKnowledgeFileRequest({
          collectionId,
          file,
          summary: payload.summary,
          tags: payload.tags,
        });

        acceptedCount += 1;
        if (result.source.status === "processing") {
          queuedForProcessingCount += 1;
        }
      }

      await loadCollections();
      await loadSources(collectionId);
      showImportModal.value = false;

      if (queuedForProcessingCount > 0) {
        showToast("文件已上传，正在后台解析与建立索引", "info");
      } else if (acceptedCount > 0) {
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
    content?: string;
    summary: string;
    tags: string;
    title: string;
  }) {
    if (!editingSource.value) {
      return;
    }

    savingSource.value = true;
    error.value = "";

    try {
      await updateKnowledgeSourceRequest({
        sourceId: editingSource.value.id,
        body: {
          title: payload.title.trim() || undefined,
          summary: payload.summary.trim() || undefined,
          tags: parseTags(payload.tags),
          content: payload.content?.trim() || undefined,
        },
      });

      await loadSources(editingSource.value.collectionId);
      await loadCollections();
      showSourceEditorModal.value = false;
      editingSourceId.value = "";
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

      showSourceEditorModal.value = false;
      if (editingSourceId.value === source.id) {
        editingSourceId.value = "";
      }
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

  async function retrySource(source: KnowledgeSource) {
    sourceActionId.value = source.id;
    error.value = "";

    try {
      await retryKnowledgeSourceImportRequest(source.id);
      await Promise.all([
        loadSources(source.collectionId),
        loadCollections({
          silent: true,
        }),
      ]);
      showToast("资料已重新加入索引队列");
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "资料重试失败";
    } finally {
      sourceActionId.value = "";
    }
  }

  async function selectCollection(collectionId: string) {
    if (!collectionId || collectionId === tokenCollectionId.value) {
      return;
    }

    await switchActiveWorkspace(collectionId);
    await replaceWorkspaceQuery({
      group: collectionId,
      session: undefined,
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

  function openSource(source: KnowledgeSource) {
    editingSourceId.value = source.id;
    showSourceEditorModal.value = true;
  }

  function handleSourceEditorOpenChange(value: boolean) {
    showSourceEditorModal.value = value;

    if (!value) {
      editingSourceId.value = "";
    }
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
      await Promise.all([
        loadAssistantRoles(),
        loadCollections(),
        loadExportTemplates(),
      ]);

      if (Object.hasOwn(route.query, "source")) {
        await replaceWorkspaceQuery({});
      }

      const resolvedCollectionId =
        tokenCollectionId.value || collections.value[0]?.id || "";

      if (!resolvedCollectionId) {
        sources.value = [];
        sessions.value = [];
        messages.value = [];
        clearAllAssistantProgress();
        return;
      }

      if (resolvedCollectionId !== readQueryValue(route.query.group)) {
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

    editingSourceId.value = "";
    showSourceEditorModal.value = false;

    if (!value) {
      sources.value = [];
      sessions.value = [];
      messages.value = [];
      clearAllAssistantProgress();
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

  watch(
    [activeCollectionId, hasProcessingSources],
    ([collectionId, hasProcessing]) => {
      if (bootstrappingWorkspace.value) {
        return;
      }

      if (!collectionId || !hasProcessing) {
        stopSourcePolling();
        return;
      }

      ensureSourcePolling();
    },
    {
      immediate: true,
    },
  );

  onMounted(async () => {
    await restoreWorkspaceState();
  });

  onBeforeUnmount(() => {
    stopExportTaskPolling();
    stopSourcePolling();
  });
</script>

<template>
  <section class="workbench-grid">
    <WorkspaceSidebar
      :active-collection-id="activeCollectionId"
      :active-session-id="activeSessionId"
      :collections="collections"
      :creating-session="creatingSession"
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
      :active-assistant-role-id="activeAssistantRoleId"
      :active-session="activeSession"
      :active-session-collection-label="activeSessionCollectionLabel"
      :assistant-roles="assistantRoles"
      :composer="composer"
      :replying="replying"
      :switching-assistant-role="switchingAssistantRole"
      :turns="chatTurns"
      @feedback="sendFeedback"
      @rename-session="renameSession"
      @select-assistant-role="selectAssistantRole"
      @select-assistant-message="selectedAssistantMessageId = $event"
      @submit="submitReply"
      @update:composer="composer = $event"
    />

    <WorkspaceContextPane
      :active-assistant-role-id="activeAssistantRoleId"
      :active-collection="activeCollection"
      :assistant-roles="assistantRoles"
      :can-delete-collection="collections.length > 1"
      :deleting-collection="deletingCollection"
      :deleting-role-id="deletingAssistantRoleId"
      :export-tasks="exportTasks"
      :filtered-sources="filteredSources"
      :loading-assistant-roles="loadingAssistantRoles"
      :loading-export-tasks="loadingExportTasks"
      :loading-sources="loadingSources"
      :panel="panel"
      :role-switch-disabled="replying"
      :saving-collection="savingCollection"
      :saving-role="savingAssistantRole"
      :source-action-id="sourceActionId"
      :source-filter="sourceFilter"
      :switching-assistant-role="switchingAssistantRole"
      @create-role="createAssistantRole"
      @delete-collection="removeCollection"
      @delete-role="deleteAssistantRole"
      @open-export-modal="handleOpenExportModal"
      @open-task-detail="handleOpenExportTaskDetail"
      @delete-source="deleteSource"
      @download-export-task="handleDownloadExportTask"
      @download-source="downloadSource"
      @edit-source="openSource"
      @open-import="showImportModal = true"
      @open-panel="openPanel"
      @reorder-roles="reorderAssistantRoles"
      @retry-source="retrySource"
      @save-collection="saveCollection"
      @select-active-role="selectAssistantRole"
      @update-role="updateAssistantRole"
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
    :open="showSourceEditorModal"
    :saving="savingSource"
    :source="editingSource"
    :source-action-pending="sourceActionId === editingSource?.id"
    @delete="deleteSource"
    @download="downloadSource"
    @retry="retrySource"
    @submit="saveSource"
    @update:open="handleSourceEditorOpenChange"
  />
</template>
