<script setup lang="ts">
  import type {
    BriefingExport,
    BriefingForm,
    ChatMessage,
    ChatTraceEvent,
    ChatSession,
    KnowledgeCollection,
    KnowledgeSource,
    KnowledgeSourcesData,
    SearchKnowledgeHit,
  } from "@atlas-kb/schema";
  import { useToast } from "@nuxt/ui/composables";
  import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
  import { useRoute, useRouter } from "vue-router";
  import {
    createBriefingExportRequest,
    createChatSessionRequest,
    createKnowledgeCollectionRequest,
    deleteChatSessionRequest,
    deleteKnowledgeCollectionRequest,
    deleteKnowledgeSourceRequest,
    downloadBriefingExportFile,
    downloadKnowledgeSourceRequest,
    fetchBriefingOpinionRequest,
    fetchChatMessagesRequest,
    fetchKnowledgeCollectionSources,
    getErrorMessage,
    importKnowledgeFilesRequest,
    importKnowledgeTextRequest,
    listChatSessionsRequest,
    listKnowledgeCollections,
    reprocessKnowledgeSourceRequest,
    sendChatFeedbackRequest,
    streamChatReplyRequest,
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
  import BriefingOpinionModal from "@/features/app/components/BriefingOpinionModal.vue";
  import ImportSourcesModal from "@/features/app/components/ImportSourcesModal.vue";
  import SourceEditorModal from "@/features/app/components/SourceEditorModal.vue";
  import WorkspaceChatPane from "@/features/app/components/WorkspaceChatPane.vue";
  import WorkspaceContextPane from "@/features/app/components/WorkspaceContextPane.vue";
  import WorkspaceSidebar from "@/features/app/components/WorkspaceSidebar.vue";
  import { buildWorkspaceChatTurns } from "@/features/app/lib/workspace-chat-turns";

  type PanelMode = "citations" | "library";

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
  const briefingHistory = ref<BriefingExport[]>([]);

  const loadingCollections = ref(true);
  const loadingSessions = ref(true);
  const loadingMessages = ref(false);
  const loadingSources = ref(false);
  const loadingBriefing = ref(false);
  const replying = ref(false);
  const creatingCollection = ref(false);
  const savingCollection = ref(false);
  const savingBriefing = ref(false);
  const savingSource = ref(false);
  const importPending = ref(false);
  const sourceActionId = ref("");
  const error = ref("");
  const composer = ref("");
  const sourceFilter = ref("");
  const selectedAssistantMessageId = ref("");
  const suspendedMessageLoadSessionId = ref("");
  const briefing = ref<
    Awaited<ReturnType<typeof fetchBriefingOpinionRequest>>["briefing"] | null
  >(null);

  const showCreateCollection = ref(false);
  const showBriefingModal = ref(false);
  const showImportModal = ref(false);
  const showSourceEditorModal = ref(false);
  const showCollectionSettingsModal = ref(false);

  let sourcePollingTimer: number | undefined;

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
    route.query.panel === "citations" ? "citations" : "library",
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
  const selectedAssistantMessage = computed(() => {
    const explicit =
      messages.value.find(
        (item) =>
          item.id === selectedAssistantMessageId.value &&
          item.role === "assistant",
      ) || null;

    if (explicit) {
      return explicit;
    }

    return (
      [...messages.value].reverse().find((item) => item.role === "assistant") ||
      null
    );
  });
  const retrieval = computed(
    () => selectedAssistantMessage.value?.retrieval || null,
  );
  const chatTurns = computed(() =>
    buildWorkspaceChatTurns(messages.value, {
      selectedAssistantMessageId: selectedAssistantMessage.value?.id || "",
    }),
  );
  const usedHits = computed(() =>
    (retrieval.value?.hits ?? []).filter((item) => item.usedInAnswer),
  );
  const extraHits = computed(() =>
    (retrieval.value?.hits ?? []).filter((item) => !item.usedInAnswer),
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
    if (activeSession.value?.collectionId) {
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

  function messageHasFailedTrace(messageId: string): boolean {
    const trace =
      messages.value.find((message) => message.id === messageId)?.trace ?? [];

    return trace.some((event) => event.state === "failed");
  }

  function ensureReplyFailedTrace(messageId: string, detail: string) {
    if (messageHasFailedTrace(messageId)) {
      return;
    }

    upsertTraceEvent(messageId, {
      id: "status:reply",
      kind: "status",
      state: "failed",
      title: "回答生成失败",
      detail,
      createdAt: new Date().toISOString(),
    });
  }

  function replaceMessage(
    currentMessageId: string,
    nextMessage: ChatMessage,
    options: {
      preserveTrace?: boolean;
    } = {},
  ) {
    messages.value = messages.value.map((message) => {
      if (message.id !== currentMessageId) {
        return message;
      }

      const trace =
        options.preserveTrace && nextMessage.trace === undefined
          ? message.trace
          : nextMessage.trace;

      return {
        ...nextMessage,
        trace,
      };
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

  function upsertTraceEvent(messageId: string, event: ChatTraceEvent) {
    messages.value = messages.value.map((message) => {
      if (message.id !== messageId) {
        return message;
      }

      const existingTrace = message.trace ?? [];
      const nextTrace = existingTrace.some((item) => item.id === event.id)
        ? existingTrace.map((item) => (item.id === event.id ? event : item))
        : [...existingTrace, event];

      return {
        ...message,
        trace: nextTrace,
      };
    });
  }

  function parseTags(input: string): string[] | undefined {
    const tags = input
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);

    return tags.length > 0 ? [...new Set(tags)] : undefined;
  }

  function getBriefingExportSummary(
    source: KnowledgeSource,
    form: BriefingForm,
  ) {
    return (
      form.briefingOpinion.trim() ||
      briefing.value?.summary ||
      `${source.title} 拟办意见`
    );
  }

  function downloadBriefingRecord(item: BriefingExport) {
    downloadBriefingExportFile(item);
  }

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

  function clearSourcePolling() {
    if (sourcePollingTimer) {
      window.clearTimeout(sourcePollingTimer);
      sourcePollingTimer = undefined;
    }
  }

  function syncSourceCollection(data: KnowledgeSourcesData) {
    sources.value = data.sources;
    clearSourcePolling();

    if (
      data.collection.id === activeCollectionId.value &&
      data.sources.some((item) => item.status === "processing")
    ) {
      sourcePollingTimer = window.setTimeout(() => {
        void loadSources(data.collection.id, {
          silent: true,
        });
      }, 2000);
    }
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
          panel: route.query.panel === "citations" ? "citations" : "library",
        });
      }
    } catch (cause) {
      error.value =
        cause instanceof Error ? cause.message : "资料文件夹加载失败";
    } finally {
      loadingCollections.value = false;
    }
  }

  async function loadSessions() {
    loadingSessions.value = true;

    try {
      const data = await listChatSessionsRequest();
      sessions.value = data.sessions;

      const preferredSessionId = data.sessions.some(
        (item) => item.id === activeSessionId.value,
      )
        ? activeSessionId.value
        : data.sessions[0]?.id || "";

      if (!activeSessionId.value && preferredSessionId) {
        await replaceWorkspaceQuery({
          session: preferredSessionId,
        });
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
    clearSourcePolling();

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

    loadingMessages.value = true;

    try {
      const data = await fetchChatMessagesRequest(sessionId);
      messages.value = data.messages;
      selectedAssistantMessageId.value =
        [...data.messages].reverse().find((item) => item.role === "assistant")
          ?.id || "";

      if (!activeCollectionId.value && data.session.collectionId) {
        await replaceWorkspaceQuery({
          group: data.session.collectionId,
        });
      }
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "消息加载失败";
    } finally {
      loadingMessages.value = false;
    }
  }

  async function ensureSession(): Promise<string> {
    if (activeSessionId.value) {
      return activeSessionId.value;
    }

    const created = await createChatSessionRequest({
      collectionId: activeCollectionId.value || undefined,
      title: undefined,
    });

    await loadSessions();
    suspendedMessageLoadSessionId.value = created.session.id;
    await replaceWorkspaceQuery({
      session: created.session.id,
    });

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
      await Promise.all([loadCollections(), loadSessions()]);

      const nextCollectionId = collections.value[0]?.id || "";

      await replaceWorkspaceQuery({
        group: nextCollectionId || undefined,
        source: undefined,
        panel: nextCollectionId ? "library" : undefined,
      });

      if (nextCollectionId) {
        await loadSources(nextCollectionId);
      } else {
        sources.value = [];
      }
      showCollectionSettingsModal.value = false;
    } catch (cause) {
      error.value =
        cause instanceof Error ? cause.message : "删除资料文件夹失败";
    }
  }

  async function startNewSession() {
    error.value = "";

    try {
      const created = await createChatSessionRequest({
        collectionId: activeCollectionId.value || undefined,
      });
      await loadSessions();
      suspendedMessageLoadSessionId.value = created.session.id;
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
      await loadSessions();
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
      await loadSessions();

      const nextSessionId =
        sessions.value.find((item) => item.id !== sessionId)?.id || "";

      await replaceWorkspaceQuery({
        session: nextSessionId || undefined,
      });

      if (!nextSessionId) {
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

    const previousMessages = [...messages.value];
    const previousSelectedAssistantMessageId = selectedAssistantMessageId.value;
    const tempUserId = createTempMessageId("user");
    const tempAssistantId = createTempMessageId("assistant");
    const draftCreatedAt = new Date().toISOString();
    let acceptedReply = false;
    let replyErrorMessage = "";
    const completedReplyState = {
      assistantMessage: null as ChatMessage | null,
    };
    let sessionId = "";

    try {
      sessionId = await ensureSession();

      messages.value = [
        ...messages.value,
        {
          id: tempUserId,
          sessionId,
          role: "user",
          content: trimmed,
          citations: [],
          createdAt: draftCreatedAt,
        },
        {
          id: tempAssistantId,
          sessionId,
          role: "assistant",
          content: "",
          citations: [],
          createdAt: draftCreatedAt,
          trace: [
            {
              id: "status:reply",
              kind: "status",
              state: "running",
              title: "已提交问题，正在准备检索",
              createdAt: draftCreatedAt,
            },
          ],
        },
      ];
      selectedAssistantMessageId.value = tempAssistantId;

      await streamChatReplyRequest({
        sessionId,
        body: {
          query: trimmed,
          collectionId: activeCollectionId.value || undefined,
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
              case "trace":
                upsertTraceEvent(tempAssistantId, event.event);
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
                ensureReplyFailedTrace(tempAssistantId, event.message);
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

      composer.value = "";
      await loadSessions();

      const firstCitation = completedReplyState.assistantMessage.citations[0];

      if (firstCitation) {
        await replaceWorkspaceQuery({
          group: firstCitation.collectionId,
          source: firstCitation.sourceId,
          session: sessionId,
          panel: "citations",
        });
      } else {
        await replaceWorkspaceQuery({
          session: sessionId,
          panel: "citations",
        });
      }
    } catch (cause) {
      if (!acceptedReply) {
        messages.value = previousMessages;
        selectedAssistantMessageId.value = previousSelectedAssistantMessageId;
      }

      if (!error.value) {
        error.value = getErrorMessage(cause);
      }

      if (acceptedReply && !completedReplyState.assistantMessage) {
        ensureReplyFailedTrace(tempAssistantId, getErrorMessage(cause));
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

    try {
      const result = await importKnowledgeFilesRequest({
        collectionId: activeCollection.value.id,
        files: payload.files,
        summary: payload.summary,
        tags: payload.tags,
      });

      await loadCollections();
      await loadSources(activeCollection.value.id);
      showImportModal.value = false;

      if (result.acceptedCount > 0) {
        showToast("文件已提交导入");
      } else {
        showToast("没有文件进入处理队列", "warning");
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

  async function loadBriefing(sourceId: string) {
    loadingBriefing.value = true;
    error.value = "";

    try {
      const data = await fetchBriefingOpinionRequest(sourceId);
      briefing.value = data.briefing;
      briefingHistory.value = data.history;
    } catch (cause) {
      briefing.value = null;
      briefingHistory.value = [];
      error.value = cause instanceof Error ? cause.message : "拟办意见生成失败";
    } finally {
      loadingBriefing.value = false;
    }
  }

  async function openBriefing(source: KnowledgeSource) {
    if (source.status !== "ready") {
      error.value = "当前资料尚未处理完成，暂时无法生成拟办意见";
      return;
    }

    await replaceWorkspaceQuery({
      group: source.collectionId,
      source: source.id,
      panel: "library",
    });
    showBriefingModal.value = true;
    await loadBriefing(source.id);
  }

  async function refreshBriefing() {
    if (!selectedSource.value) {
      return;
    }

    await loadBriefing(selectedSource.value.id);
  }

  async function exportBriefing(payload: {
    citations: BriefingExport["citations"];
    form: BriefingForm;
  }) {
    if (!selectedSource.value) {
      return;
    }

    savingBriefing.value = true;
    error.value = "";

    try {
      const data = await createBriefingExportRequest({
        sourceId: selectedSource.value.id,
        body: {
          summary: getBriefingExportSummary(selectedSource.value, payload.form),
          form: payload.form,
          citations: payload.citations,
        },
      });

      briefingHistory.value = [data.export, ...briefingHistory.value];
      downloadBriefingRecord(data.export);
      showBriefingModal.value = false;
      showToast("拟办意见已导出");
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "导出拟办意见失败";
    } finally {
      savingBriefing.value = false;
    }
  }

  async function reprocessSource(source: KnowledgeSource) {
    sourceActionId.value = source.id;
    error.value = "";

    try {
      await reprocessKnowledgeSourceRequest(source.id);
      await loadSources(source.collectionId);
      await loadCollections();
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "重新处理失败";
    } finally {
      sourceActionId.value = "";
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

      if (selectedSource.value?.id === source.id) {
        briefing.value = null;
        briefingHistory.value = [];
        showBriefingModal.value = false;
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
      group: session.collectionId || activeCollectionId.value || undefined,
    });
  }

  async function focusHit(hit: SearchKnowledgeHit) {
    selectedAssistantMessageId.value = selectedAssistantMessage.value?.id || "";
    await replaceWorkspaceQuery({
      group: hit.collectionId,
      source: hit.sourceId,
      panel: "citations",
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

  async function logoutCurrentUser() {
    logout();
    await router.replace("/login");
  }

  watch(activeCollectionId, (value) => {
    void loadSources(value);
  });

  watch(activeSessionId, (value) => {
    if (value && value === suspendedMessageLoadSessionId.value) {
      suspendedMessageLoadSessionId.value = "";
      return;
    }

    void loadMessages(value);
  });

  onMounted(async () => {
    await initializeAuthSession();
    await Promise.all([loadCollections(), loadSessions()]);

    if (activeCollectionId.value) {
      await loadSources(activeCollectionId.value);
    }

    if (activeSessionId.value) {
      await loadMessages(activeSessionId.value);
    }
  });

  onBeforeUnmount(() => {
    clearSourcePolling();
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
      :extra-hits="extraHits"
      :filtered-sources="filteredSources"
      :loading-sources="loadingSources"
      :panel="panel"
      :retrieval="retrieval"
      :source-action-id="sourceActionId"
      :source-filter="sourceFilter"
      :used-hits="usedHits"
      @open-briefing="openBriefing"
      @delete-source="deleteSource"
      @download-source="downloadSource"
      @edit-source="openSource"
      @focus-hit="focusHit"
      @open-import="showImportModal = true"
      @open-panel="openPanel"
      @open-settings="showCollectionSettingsModal = true"
      @reprocess-source="reprocessSource"
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

  <BriefingOpinionModal
    v-model:open="showBriefingModal"
    :briefing="briefing"
    :history="briefingHistory"
    :loading="loadingBriefing"
    :pending="savingBriefing"
    :source="selectedSource"
    @download-history="downloadBriefingRecord"
    @refresh="refreshBriefing"
    @submit="exportBriefing"
  />

  <SourceEditorModal
    v-model:open="showSourceEditorModal"
    :saving="savingSource"
    :source="selectedSource"
    :source-action-pending="sourceActionId === selectedSource?.id"
    @delete="deleteSource"
    @download="downloadSource"
    @reprocess="reprocessSource"
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
