<script setup lang="ts">
  import type {
    ChatMessage,
    ChatTraceEvent,
    ChatSession,
    KnowledgeCollection,
    KnowledgeSource,
    KnowledgeSourcesData,
    SearchKnowledgeHit,
  } from "@atlas-kb/schema";
  import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
  import { useRoute, useRouter } from "vue-router";
  import {
    File as FileIcon,
    FileCode,
    FileSpreadsheet,
    Presentation,
    CircleAlert,
    FolderPlus,
    Plus,
    Trash2,
    Save,
    Upload,
    ArrowUp,
    LoaderCircle,
    ThumbsUp,
    ThumbsDown,
    Download,
    RefreshCw,
    Archive,
    Search,
    FileText,
    MessageSquare,
    Info,
    Check,
    X,
    Settings,
  } from "lucide-vue-next";
  import {
    createChatSessionRequest,
    createKnowledgeCollectionRequest,
    deleteChatSessionRequest,
    deleteKnowledgeCollectionRequest,
    deleteKnowledgeSourceRequest,
    downloadKnowledgeSourceRequest,
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
  import { generateClientId } from "@/lib/ids";
  import { renderMarkdown } from "@/lib/markdown";
  import {
    formatDateTime,
    formatFileSize,
    getKnowledgeFileDisplay,
    formatRelativeTime,
    type KnowledgeFileKind,
    getSourceStatusLabel,
    getSourceStatusTone,
  } from "@/lib/knowledge-ui";

  type PanelMode = "citations" | "library";
  type ImportMode = "file" | "text";
  type QueuedImportStatus =
    | "queued"
    | "uploading"
    | "accepted"
    | "failed"
    | "unsupported";

  type QueuedImportFile = {
    id: string;
    file: File;
    name: string;
    size: number;
    mimeType?: string;
    formatLabel: string;
    kind: KnowledgeFileKind;
    supported: boolean;
    status: QueuedImportStatus;
    errorMessage?: string;
  };

  const route = useRoute();
  const router = useRouter();

  const collections = ref<KnowledgeCollection[]>([]);
  const sessions = ref<ChatSession[]>([]);
  const sources = ref<KnowledgeSource[]>([]);
  const messages = ref<ChatMessage[]>([]);

  const loadingCollections = ref(true);
  const loadingSessions = ref(true);
  const loadingMessages = ref(false);
  const loadingSources = ref(false);
  const replying = ref(false);
  const creatingCollection = ref(false);
  const savingCollection = ref(false);
  const savingSource = ref(false);
  const importPending = ref(false);
  const sourceActionId = ref("");
  const error = ref("");
  const noticeMessage = ref("");

  const composer = ref("");
  const selectedAssistantMessageId = ref("");
  const sourceFilter = ref("");
  const importMode = ref<ImportMode>("file");
  const queuedFiles = ref<QueuedImportFile[]>([]);
  const fileInputRef = ref<HTMLInputElement | null>(null);
  const fileDropActive = ref(false);
  const importSummaryMessage = ref("");
  const expandedTraceState = ref<Record<string, boolean>>({});
  const suspendedMessageLoadSessionId = ref("");

  // Modals Visibility
  const showCreateCollection = ref(false);
  const showImportModal = ref(false);
  const showSourceDetailModal = ref(false);
  const showCollectionSettingsModal = ref(false);
  let sourcePollingTimer: number | undefined;

  const createCollectionForm = ref({
    name: "",
    description: "",
  });
  const collectionEditor = ref({
    name: "",
    description: "",
  });
  const fileForm = ref({
    summary: "",
    tags: "",
  });
  const textForm = ref({
    title: "",
    summary: "",
    tags: "",
    content: "",
  });
  const sourceEditor = ref({
    title: "",
    summary: "",
    tags: "",
  });

  function readQueryValue(value: unknown): string {
    return typeof value === "string" ? value : "";
  }

  const panel = computed<PanelMode>(() =>
    route.query.panel === "library" ? "library" : "citations",
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

  const selectedSource = computed(() => {
    return (
      filteredSources.value.find((item) => item.id === routeSourceId.value) ||
      sources.value.find((item) => item.id === routeSourceId.value) ||
      null
    );
  });

  const activeSessionCollectionLabel = computed(() => {
    if (activeSession.value?.collectionId) {
      return getCollectionName(activeSession.value.collectionId, "未选择分组");
    }

    if (activeCollection.value) {
      return activeCollection.value.name;
    }

    return "未选择分组";
  });

  const queuedFilesAwaitingUpload = computed(() =>
    queuedFiles.value.filter(
      (item) =>
        item.supported &&
        (item.status === "queued" || item.status === "failed"),
    ),
  );
  const queuedFilesSuccessCount = computed(
    () => queuedFiles.value.filter((item) => item.status === "accepted").length,
  );
  const queuedFilesFailureCount = computed(
    () =>
      queuedFiles.value.filter(
        (item) => item.status === "failed" || item.status === "unsupported",
      ).length,
  );
  const queuedFilesUnsupportedCount = computed(
    () => queuedFiles.value.filter((item) => !item.supported).length,
  );
  const canSubmitImport = computed(() => {
    if (importPending.value) {
      return false;
    }

    if (importMode.value === "text") {
      return Boolean(textForm.value.content.trim());
    }

    return queuedFilesAwaitingUpload.value.length > 0;
  });

  function isTemporaryMessageId(messageId: string): boolean {
    return messageId.startsWith("temp:");
  }

  function createTempMessageId(prefix: "user" | "assistant"): string {
    return generateClientId(`temp:${prefix}`);
  }

  function isTraceExpanded(messageId: string): boolean {
    return expandedTraceState.value[messageId] ?? false;
  }

  function setTraceExpanded(messageId: string, expanded: boolean) {
    expandedTraceState.value = {
      ...expandedTraceState.value,
      [messageId]: expanded,
    };
  }

  function moveTraceExpandedState(fromMessageId: string, toMessageId: string) {
    if (!(fromMessageId in expandedTraceState.value)) {
      return;
    }

    const nextState = { ...expandedTraceState.value };
    nextState[toMessageId] = nextState[fromMessageId] ?? false;
    delete nextState[fromMessageId];
    expandedTraceState.value = nextState;
  }

  function toggleTrace(messageId: string) {
    setTraceExpanded(messageId, !isTraceExpanded(messageId));
  }

  function getMessageTrace(message: ChatMessage): ChatTraceEvent[] {
    return message.trace ?? [];
  }

  function getTraceStateLabel(state: ChatTraceEvent["state"]): string {
    switch (state) {
      case "completed":
        return "已完成";
      case "failed":
        return "失败";
      case "info":
        return "过程";
      default:
        return "进行中";
    }
  }

  function getTraceStateTone(state: ChatTraceEvent["state"]): string {
    switch (state) {
      case "completed":
        return "ready";
      case "failed":
        return "failed";
      case "info":
        return "archived";
      default:
        return "processing";
    }
  }

  function getTraceKindLabel(kind: ChatTraceEvent["kind"]): string {
    switch (kind) {
      case "search":
        return "检索";
      case "tool-call":
        return "工具";
      case "reasoning":
        return "组织";
      case "error":
        return "错误";
      default:
        return "状态";
    }
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

    if (currentMessageId !== nextMessage.id) {
      moveTraceExpandedState(currentMessageId, nextMessage.id);
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

  function createQueuedFile(
    file: globalThis.File,
    index: number,
  ): QueuedImportFile {
    const display = getKnowledgeFileDisplay({
      filename: file.name,
      mimeType: file.type || undefined,
    });

    return {
      id: `${file.name}:${file.size}:${file.lastModified}:${Date.now()}:${index}`,
      file,
      name: file.name,
      size: file.size,
      mimeType: file.type || undefined,
      formatLabel: display.formatLabel,
      kind: display.kind,
      supported: display.supported,
      status: display.supported ? "queued" : "unsupported",
      errorMessage: display.supported ? undefined : "暂不支持解析该文件格式",
    };
  }

  function appendFiles(files: Iterable<globalThis.File>) {
    const nextFiles = Array.from(files).map((file, index) =>
      createQueuedFile(file, index),
    );

    if (nextFiles.length === 0) {
      return;
    }

    queuedFiles.value = [...queuedFiles.value, ...nextFiles];
    importSummaryMessage.value = "";
  }

  function resetFileSelection() {
    queuedFiles.value = [];
    importSummaryMessage.value = "";
    fileDropActive.value = false;

    if (fileInputRef.value) {
      fileInputRef.value.value = "";
    }
  }

  function resetImportForm() {
    importMode.value = "file";
    fileForm.value.summary = "";
    fileForm.value.tags = "";
    textForm.value.title = "";
    textForm.value.summary = "";
    textForm.value.tags = "";
    textForm.value.content = "";
    resetFileSelection();
  }

  function removeQueuedFile(fileId: string) {
    queuedFiles.value = queuedFiles.value.filter((item) => item.id !== fileId);

    if (queuedFiles.value.length === 0) {
      importSummaryMessage.value = "";
    }
  }

  function getQueuedFileStatusLabel(status: QueuedImportStatus): string {
    switch (status) {
      case "uploading":
        return "上传中";
      case "accepted":
        return "已接收";
      case "failed":
        return "失败";
      case "unsupported":
        return "暂不支持";
      default:
        return "待上传";
    }
  }

  function getQueuedFileStatusTone(status: QueuedImportStatus): string {
    switch (status) {
      case "accepted":
        return "processing";
      case "failed":
      case "unsupported":
        return "failed";
      case "uploading":
        return "processing";
      default:
        return "archived";
    }
  }

  function getQueuedFileIcon(kind: KnowledgeFileKind) {
    switch (kind) {
      case "word":
      case "text":
      case "pdf":
        return FileText;
      case "spreadsheet":
        return FileSpreadsheet;
      case "presentation":
        return Presentation;
      case "code":
        return FileCode;
      default:
        return FileIcon;
    }
  }

  function getQueuedFileIconTone(kind: KnowledgeFileKind): string {
    switch (kind) {
      case "pdf":
        return "bg-red-50 text-red-600";
      case "word":
        return "bg-blue-50 text-blue-600";
      case "spreadsheet":
        return "bg-emerald-50 text-emerald-600";
      case "presentation":
        return "bg-amber-50 text-amber-600";
      case "code":
        return "bg-slate-100 text-slate-700";
      case "text":
        return "bg-stone-100 text-stone-700";
      default:
        return "bg-[var(--bg-panel-muted)] text-[var(--accent)]";
    }
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

  function syncCollectionEditor(collection: KnowledgeCollection | null) {
    collectionEditor.value = {
      name: collection?.name || "",
      description: collection?.description || "",
    };
  }

  function syncSourceEditor(source: KnowledgeSource | null) {
    sourceEditor.value = {
      title: source?.title || "",
      summary: source?.summary || "",
      tags: source?.tags.join(", ") || "",
    };
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
    syncCollectionEditor(data.collection);
    collections.value = collections.value.map((item) =>
      item.id === data.collection.id ? data.collection : item,
    );
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

  function openCreateCollectionModal() {
    error.value = "";
    showCreateCollection.value = true;
  }

  async function loadCollections() {
    loadingCollections.value = true;

    try {
      const data = await listKnowledgeCollections();
      collections.value = data.collections;

      const preferredCollectionId =
        activeCollectionId.value ||
        data.collections.find(
          (item) => item.id === activeSession.value?.collectionId,
        )?.id ||
        data.collections[0]?.id ||
        "";

      if (!activeCollectionId.value && preferredCollectionId) {
        await replaceWorkspaceQuery({
          group: preferredCollectionId,
        });
      }

      syncCollectionEditor(
        data.collections.find((item) => item.id === preferredCollectionId) ||
          null,
      );
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

      const preferredSessionId =
        activeSessionId.value || data.sessions[0]?.id || "";

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
      syncCollectionEditor(null);
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

  async function createCollection() {
    const name = createCollectionForm.value.name.trim();
    const description = createCollectionForm.value.description.trim();

    if (!name || !description) {
      error.value = "请填写文件夹名称和说明";
      return;
    }

    creatingCollection.value = true;
    error.value = "";

    try {
      const data = await createKnowledgeCollectionRequest({
        name,
        description,
      });

      createCollectionForm.value = {
        name: "",
        description: "",
      };
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

  async function saveCollection() {
    if (!activeCollection.value) {
      return;
    }

    savingCollection.value = true;
    error.value = "";

    try {
      await updateKnowledgeCollectionRequest({
        collectionId: activeCollection.value.id,
        body: {
          name: collectionEditor.value.name.trim(),
          description: collectionEditor.value.description.trim(),
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
      await replaceWorkspaceQuery({
        session: created.session.id,
      });
      await loadMessages(created.session.id);
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

      if (nextSessionId) {
        await loadMessages(nextSessionId);
      } else {
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

    replying.value = true;
    error.value = "";
    noticeMessage.value = "";

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
              id: "status:queued",
              kind: "status",
              state: "running",
              title: "已提交问题，正在准备检索",
              createdAt: draftCreatedAt,
            },
          ],
        },
      ];
      selectedAssistantMessageId.value = tempAssistantId;
      setTraceExpanded(tempAssistantId, true);

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
                moveTraceExpandedState(
                  tempAssistantId,
                  event.assistantMessage.id,
                );
                setTraceExpanded(event.assistantMessage.id, false);
                break;
              case "reply-error":
                replyErrorMessage = event.message;
                error.value = event.message;
                upsertTraceEvent(tempAssistantId, {
                  id: "status:error",
                  kind: "error",
                  state: "failed",
                  title: "回答生成失败",
                  detail: event.message,
                  createdAt: new Date().toISOString(),
                });
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

      const firstCitation = completedReplyState.assistantMessage?.citations[0];

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
        upsertTraceEvent(tempAssistantId, {
          id: "status:error",
          kind: "error",
          state: "failed",
          title: "回答生成失败",
          detail: getErrorMessage(cause),
          createdAt: new Date().toISOString(),
        });
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

  async function submitImport() {
    if (!activeCollection.value) {
      error.value = "请先选择一个资料文件夹";
      return;
    }

    importPending.value = true;
    error.value = "";
    importSummaryMessage.value = "";
    noticeMessage.value = "";

    try {
      if (importMode.value === "file") {
        const filesToUpload = queuedFilesAwaitingUpload.value;

        if (filesToUpload.length === 0) {
          throw new Error("请先选择可导入的文件");
        }

        const nextQueuedFiles = queuedFiles.value.map((item) =>
          filesToUpload.some((candidate) => candidate.id === item.id)
            ? {
                ...item,
                status: "uploading" as const,
                errorMessage: undefined,
              }
            : item,
        );
        queuedFiles.value = nextQueuedFiles;

        const result = await importKnowledgeFilesRequest({
          collectionId: activeCollection.value.id,
          files: filesToUpload.map((item) => item.file),
          summary: fileForm.value.summary.trim() || undefined,
          tags: parseTags(fileForm.value.tags),
        });

        queuedFiles.value = queuedFiles.value.map((item) => {
          const resultIndex = filesToUpload.findIndex(
            (candidate) => candidate.id === item.id,
          );

          if (resultIndex < 0) {
            return item;
          }

          const uploadResult = result.results[resultIndex];

          if (!uploadResult) {
            return {
              ...item,
              status: "failed",
              errorMessage: "批量导入结果不完整，请重试",
            };
          }

          return {
            ...item,
            status: uploadResult.accepted ? "accepted" : "failed",
            errorMessage: uploadResult.accepted
              ? undefined
              : uploadResult.errorMessage,
          };
        });

        const summaryParts: string[] = [];

        if (result.acceptedCount > 0) {
          summaryParts.push(
            `已接收 ${result.acceptedCount} 个文件，后台正在解析和建立索引`,
          );
        }

        if (result.rejectedCount > 0) {
          summaryParts.push(`${result.rejectedCount} 个文件未进入处理队列`);
        }

        if (queuedFilesUnsupportedCount.value > 0) {
          summaryParts.push(
            `${queuedFilesUnsupportedCount.value} 个文件暂不支持解析`,
          );
        }

        importSummaryMessage.value = summaryParts.join("，");
      }

      if (importMode.value === "text") {
        await importKnowledgeTextRequest({
          collectionId: activeCollection.value.id,
          body: {
            title: textForm.value.title.trim() || undefined,
            summary: textForm.value.summary.trim() || undefined,
            tags: parseTags(textForm.value.tags),
            content: textForm.value.content.trim(),
          },
        });
        noticeMessage.value = "文本资料已加入当前文件夹。";
        textForm.value.title = "";
        textForm.value.summary = "";
        textForm.value.tags = "";
        textForm.value.content = "";
      }

      await loadCollections();
      await loadSources(activeCollection.value.id);

      if (importMode.value === "text") {
        showImportModal.value = false;
        resetImportForm();
        return;
      }

      if (importSummaryMessage.value) {
        noticeMessage.value = importSummaryMessage.value;
      }

      if (queuedFiles.value.some((item) => item.status === "accepted")) {
        showImportModal.value = false;
        resetImportForm();
      }
    } catch (cause) {
      if (importMode.value === "file") {
        queuedFiles.value = queuedFiles.value.map((item) =>
          item.status === "uploading"
            ? {
                ...item,
                status: "failed",
                errorMessage:
                  cause instanceof Error ? cause.message : "导入资料失败",
              }
            : item,
        );
      }

      error.value = cause instanceof Error ? cause.message : "导入资料失败";
    } finally {
      importPending.value = false;
    }
  }

  async function saveSourceMetadata() {
    if (!selectedSource.value) {
      return;
    }

    savingSource.value = true;
    error.value = "";

    try {
      await updateKnowledgeSourceRequest({
        sourceId: selectedSource.value.id,
        body: {
          title: sourceEditor.value.title.trim() || undefined,
          summary: sourceEditor.value.summary.trim() || undefined,
          tags: parseTags(sourceEditor.value.tags),
        },
      });

      await loadSources(selectedSource.value.collectionId);
      await loadCollections();
      showSourceDetailModal.value = false;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "资料信息保存失败";
    } finally {
      savingSource.value = false;
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

  async function archiveSource(source: KnowledgeSource) {
    sourceActionId.value = source.id;
    error.value = "";

    try {
      await updateKnowledgeSourceRequest({
        sourceId: source.id,
        body: {
          status: "archived",
        },
      });
      await loadSources(source.collectionId);
      await loadCollections();
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "归档失败";
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
      showSourceDetailModal.value = false;
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

  function handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement | null;
    appendFiles(input?.files || []);

    if (input) {
      input.value = "";
    }
  }

  function handleFileDrop(event: DragEvent) {
    fileDropActive.value = false;
    appendFiles(event.dataTransfer?.files || []);
  }

  function openImportModal() {
    error.value = "";
    importSummaryMessage.value = "";
    noticeMessage.value = "";
    showImportModal.value = true;
  }

  function closeImportModal() {
    if (importPending.value) {
      return;
    }

    showImportModal.value = false;
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
      group: session.collectionId || undefined,
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
    });
    showSourceDetailModal.value = true;
  }

  watch(activeCollection, (value) => {
    syncCollectionEditor(value);
  });

  watch(selectedSource, (value) => {
    syncSourceEditor(value);
  });

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

  watch(showImportModal, (isOpen) => {
    if (!isOpen && !importPending.value) {
      resetImportForm();
    }
  });

  onMounted(async () => {
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
    <!-- Left Sidebar: Collections & Sessions -->
    <aside class="workbench-pane">
      <div class="pane-header pane-header-stack">
        <div class="pane-actions-grid w-full">
          <button
            class="soft-button flex-1"
            type="button"
            @click="openCreateCollectionModal"
          >
            <Plus class="size-4" />
            <span class="text-xs">建文件夹</span>
          </button>
          <button
            class="soft-button primary flex-1"
            type="button"
            @click="startNewSession"
          >
            <MessageSquare class="size-4" />
            <span class="text-xs">新对话</span>
          </button>
        </div>
      </div>

      <div class="pane-section border-b border-[rgba(93,72,34,0.06)]">
        <div class="section-row">
          <span class="section-label">资料文件夹</span>
          <span class="text-xs text-[var(--text-dim)]"
            >{{ collections.length }}</span
          >
        </div>

        <div v-if="loadingCollections" class="stack-list mt-3">
          <div
            v-for="i in 3"
            :key="i"
            class="stack-item h-12 animate-pulse opacity-50"
          />
        </div>

        <div v-else class="stack-list mt-3 max-h-[30vh] overflow-auto">
          <button
            v-for="collection in collections"
            :key="collection.id"
            class="stack-item cursor-pointer text-left !py-2"
            :class="activeCollectionId === collection.id ? 'is-active' : ''"
            type="button"
            @click="selectCollection(collection.id)"
          >
            <p class="truncate text-sm font-semibold text-[var(--text-strong)]">
              {{ collection.name }}
            </p>
            <p class="mt-1 truncate text-[10px] text-[var(--text-dim)]">
              {{ collection.readyDocumentCount }}
              份可用
            </p>
          </button>
        </div>
      </div>

      <div class="pane-section flex-1 min-h-0 flex flex-col">
        <div class="section-row mb-3">
          <span class="section-label">历史会话</span>
          <span class="text-xs text-[var(--text-dim)]"
            >{{ sessions.length }}</span
          >
        </div>

        <div v-if="loadingSessions" class="stack-list">
          <div
            v-for="i in 5"
            :key="i"
            class="stack-item h-16 animate-pulse opacity-50"
          />
        </div>

        <div v-else class="stack-list flex-1 overflow-auto">
          <div
            v-for="session in sessions"
            :key="session.id"
            class="stack-item flex items-center gap-2 group"
            :class="activeSessionId === session.id ? 'is-active' : ''"
          >
            <button
              class="min-w-0 flex-1 cursor-pointer text-left"
              type="button"
              @click="openSession(session)"
            >
              <p class="truncate text-sm font-medium text-[var(--text-strong)]">
                {{ session.title }}
              </p>
              <p class="mt-1 truncate text-[10px] text-[var(--text-dim)]">
                {{ formatRelativeTime(session.updatedAt) }}
              </p>
            </button>
            <button
              class="opacity-0 group-hover:opacity-100 soft-button warn !p-1.5"
              type="button"
              @click.stop="removeSession(session.id)"
            >
              <Trash2 class="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </aside>

    <!-- Center Pane: Chat -->
    <section class="workbench-pane center-pane">
      <div class="pane-header">
        <div class="min-w-0">
          <p class="truncate text-sm font-bold text-[var(--text-strong)]">
            {{ activeSession?.title || "新对话" }}
          </p>
          <div class="flex items-center gap-2 mt-0.5">
            <span
              class="text-[10px] px-1.5 py-0.5 bg-[var(--bg-canvas-strong)] rounded text-[var(--text-muted)]"
            >
              {{ activeSessionCollectionLabel }}
            </span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="soft-button !p-2"
            title="重命名"
            type="button"
            @click="renameSession"
            :disabled="!activeSession"
          >
            <FileText class="size-4" />
          </button>
          <div class="segmented-tabs !bg-transparent !border-none !p-0 gap-2">
            <button
              class="soft-button"
              :class="panel === 'citations' ? 'primary' : ''"
              type="button"
              @click="openPanel('citations')"
            >
              引用
            </button>
            <button
              class="soft-button"
              :class="panel === 'library' ? 'primary' : ''"
              type="button"
              @click="openPanel('library')"
            >
              文件夹
            </button>
          </div>
        </div>
      </div>

      <div v-if="error" class="notice-strip warn">
        <CircleAlert class="size-4 shrink-0" />
        <span>{{ error }}</span>
      </div>

      <div v-if="noticeMessage" class="notice-strip">
        <Info class="size-4 shrink-0" />
        <span>{{ noticeMessage }}</span>
      </div>

      <div class="messages-scroller">
        <div
          v-if="messages.length === 0"
          class="empty-state self-center my-auto max-w-sm text-center items-center"
        >
          <div class="p-3 bg-[var(--accent-soft)] rounded-full mb-2">
            <MessageSquare class="size-6 text-[var(--accent)]" />
          </div>
          <p class="card-heading">开始深度知识问答</p>
          <p class="text-sm leading-6 text-[var(--text-muted)]">
            选择一个资料文件夹，智能体会先检索您的私有资料，再基于证据组织回答。
          </p>
        </div>

        <article
          v-for="message in messages"
          :key="message.id"
          class="message-bubble"
          :class="[
            message.role,
            message.role === 'assistant' && selectedAssistantMessage?.id === message.id ? 'is-selected' : '',
          ]"
          @click="message.role === 'assistant' ? (selectedAssistantMessageId = message.id) : undefined"
        >
          <div class="flex items-center justify-between gap-3 mb-2">
            <p class="message-meta font-bold flex items-center gap-1.5">
              <span
                v-if="message.role === 'user'"
                class="size-1.5 rounded-full bg-[var(--text-dim)]"
              />
              <span v-else class="size-1.5 rounded-full bg-[var(--accent)]" />
              {{ message.role === "user" ? "YOU" : "智能体" }}
            </p>
            <p class="text-[10px] text-[var(--text-dim)]">
              {{ formatDateTime(message.createdAt) }}
            </p>
          </div>
          <p
            v-if="message.role === 'user'"
            class="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-strong)]"
          >
            {{ message.content }}
          </p>
          <div
            v-else
            class="message-markdown text-[13px] leading-relaxed text-[var(--text-strong)]"
            v-html="renderMarkdown(message.content)"
          />

          <div
            v-if="message.role === 'assistant' && getMessageTrace(message).length > 0"
            class="trace-panel"
          >
            <div class="flex items-center justify-between gap-3">
              <div
                class="flex items-center gap-2 text-[11px] text-[var(--text-muted)]"
              >
                <span>执行过程</span>
                <span>{{ getMessageTrace(message).length }} 步</span>
              </div>
              <button
                class="soft-button !px-2.5 !py-1 !text-[11px]"
                type="button"
                @click.stop="toggleTrace(message.id)"
              >
                {{ isTraceExpanded(message.id) ? "收起过程" : "查看过程" }}
              </button>
            </div>

            <div v-if="isTraceExpanded(message.id)" class="trace-list">
              <div
                v-for="event in getMessageTrace(message)"
                :key="`${message.id}:${event.id}`"
                class="trace-item"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span
                        class="status-pill scale-90 origin-left"
                        :class="getTraceStateTone(event.state)"
                      >
                        {{ getTraceStateLabel(event.state) }}
                      </span>
                      <span class="trace-kind"
                        >{{ getTraceKindLabel(event.kind) }}</span
                      >
                    </div>
                    <p
                      class="mt-2 text-[12px] font-medium text-[var(--text-strong)]"
                    >
                      {{ event.title }}
                    </p>
                    <p
                      v-if="event.detail"
                      class="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--text-muted)]"
                    >
                      {{ event.detail }}
                    </p>
                  </div>
                  <p class="text-[10px] text-[var(--text-dim)]">
                    {{ formatDateTime(event.createdAt) }}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="message.citations.length > 0"
            class="mt-4 pt-3 border-t border-[rgba(93,72,34,0.04)] flex flex-wrap gap-2"
          >
            <button
              v-for="citation in message.citations"
              :key="`${message.id}:${citation.sourceId}:${citation.snippet}`"
              class="tag-chip cursor-pointer hover:bg-[var(--accent-soft)] transition"
              type="button"
              @click.stop="focusHit({
                sourceId: citation.sourceId,
                documentId: citation.documentId,
                collectionId: citation.collectionId,
                spaceId: citation.spaceId,
                chunkId: `${citation.sourceId}:${citation.snippet}`,
                title: citation.title,
                summary: citation.title,
                snippet: citation.snippet,
                sectionPath: citation.sectionPath,
                sourceFilename: citation.sourceFilename,
                sourceUrl: citation.sourceUrl,
                downloadUrl: citation.downloadUrl,
                sourceType: citation.sourceType,
                tags: [],
                score: 0,
                strategy: 'rerank',
                usedInAnswer: true,
                recallPaths: ['重排'],
              })"
            >
              <Info class="size-3 mr-1" />
              {{ citation.title }}
            </button>
          </div>

          <div
            v-if="message.role === 'assistant' && !isTemporaryMessageId(message.id)"
            class="mt-4 flex items-center gap-2"
          >
            <button
              class="soft-button !px-2.5 !py-1 !text-xs"
              :class="message.feedback?.rating === 'up' ? 'primary' : ''"
              type="button"
              @click.stop="sendFeedback(message, 'up')"
            >
              <ThumbsUp class="size-3.5" />
            </button>
            <button
              class="soft-button !px-2.5 !py-1 !text-xs"
              :class="message.feedback?.rating === 'down' ? 'warn' : ''"
              type="button"
              @click.stop="sendFeedback(message, 'down')"
            >
              <ThumbsDown class="size-3.5" />
            </button>
          </div>
        </article>
      </div>

      <form class="composer-bar" @submit.prevent="submitReply">
        <div
          class="field-shell !bg-[var(--bg-canvas)] focus-within:!bg-white transition-colors"
        >
          <textarea
            v-model="composer"
            class="textarea-reset !min-h-[44px] max-h-32 text-sm"
            placeholder="向当前资料文件夹提问..."
            @keydown.enter.prevent="submitReply"
          />
          <div
            class="flex justify-between items-center mt-2 pt-2 border-t border-[rgba(93,72,34,0.06)]"
          >
            <span
              class="text-[10px] text-[var(--text-dim)] flex items-center gap-1"
            >
              <Search class="size-3" />
              使用 {{ activeSessionCollectionLabel }}
            </span>
            <button
              class="soft-button primary !px-4 !py-1.5"
              type="submit"
              :disabled="replying || !composer.trim()"
            >
              <LoaderCircle v-if="replying" class="size-4 animate-spin" />
              <ArrowUp v-else class="size-4" />
              <span>发送</span>
            </button>
          </div>
        </div>
      </form>
    </section>

    <!-- Right Pane: Context (Citations or Source List) -->
    <aside class="workbench-pane right-pane">
      <div class="pane-header">
        <div class="flex items-center gap-2">
          <Info
            v-if="panel === 'citations'"
            class="size-4 text-[var(--accent)]"
          />
          <FileText v-else class="size-4 text-[var(--accent)]" />
          <p class="text-sm font-bold text-[var(--text-strong)]">
            {{ panel === 'citations' ? '引用溯源' : '当前文件夹资料' }}
          </p>
        </div>
        <div v-if="panel === 'library'" class="flex items-center gap-2">
          <button
            class="soft-button !px-2.5 !py-1.5"
            type="button"
            @click="openImportModal"
          >
            <Upload class="size-3.5" />
            <span class="text-xs">添加文件</span>
          </button>
          <button
            class="soft-button !px-2.5 !py-1.5"
            type="button"
            @click="showCollectionSettingsModal = true"
          >
            <Settings class="size-3.5" />
            <span class="text-xs">设置</span>
          </button>
        </div>
      </div>

      <!-- Citations View -->
      <div v-if="panel === 'citations'" class="pane-scroll pt-4">
        <div v-if="!retrieval" class="empty-state items-center text-center">
          <Search class="size-8 text-[var(--text-dim)] mb-2" />
          <p class="text-sm text-[var(--text-muted)]">等待查询激发引用...</p>
        </div>

        <template v-else>
          <div class="mb-6">
            <div class="section-row mb-3">
              <span class="section-label">检索摘要</span>
            </div>
            <div class="panel-muted p-4 border border-[var(--border-soft)]">
              <p class="text-[13px] leading-relaxed">
                本轮命中了
                <span class="font-bold text-[var(--accent)]"
                  >{{ retrieval.total }}</span
                >
                条记录， 其中
                <span class="font-bold text-[var(--accent)]"
                  >{{ usedHits.length }}</span
                >
                条被核心引用。
              </p>
              <div class="mt-3 flex flex-wrap gap-1">
                <span
                  v-for="v in retrieval.queryVariants"
                  :key="v"
                  class="text-[10px] bg-[var(--bg-canvas-strong)] px-1.5 py-0.5 rounded"
                >
                  {{ v }}
                </span>
              </div>
            </div>
          </div>

          <div class="space-y-6">
            <div>
              <p class="section-label mb-3">核心引用片段</p>
              <div class="stack-list">
                <div
                  v-for="hit in usedHits"
                  :key="hit.chunkId"
                  class="stack-item !p-4 !bg-white"
                >
                  <div class="flex items-center justify-between mb-2">
                    <span class="status-pill ready scale-90 origin-left"
                      >已采用</span
                    >
                    <span class="text-[10px] text-[var(--text-dim)]"
                      >{{ hit.sourceType }}</span
                    >
                  </div>
                  <p class="text-sm font-bold mb-2">{{ hit.title }}</p>
                  <p
                    class="text-[12px] leading-relaxed text-[var(--text-muted)] italic"
                  >
                    "...{{ hit.snippet }}..."
                  </p>
                </div>
              </div>
            </div>

            <div v-if="extraHits.length > 0">
              <p class="section-label mb-3">补充召回结果</p>
              <div class="stack-list">
                <div
                  v-for="hit in extraHits"
                  :key="hit.chunkId"
                  class="stack-item !p-3 !bg-[var(--bg-panel-muted)] opacity-80"
                >
                  <p class="text-[12px] font-medium">{{ hit.title }}</p>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Library View -->
      <div v-else class="pane-scroll flex flex-col pt-4">
        <div
          v-if="!activeCollection"
          class="empty-state items-center text-center"
        >
          <FolderPlus class="size-8 text-[var(--text-dim)] mb-2" />
          <p class="text-sm text-[var(--text-muted)]">
            请先在左侧选择一个文件夹
          </p>
        </div>

        <template v-else>
          <div class="relative mb-4">
            <Search
              class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--text-dim)]"
            />
            <input
              v-model="sourceFilter"
              class="field-shell w-full !pl-9 !py-2 text-sm"
              placeholder="搜索资料..."
            >
          </div>

          <div v-if="loadingSources" class="stack-list">
            <div
              v-for="i in 6"
              :key="i"
              class="stack-item h-16 animate-pulse opacity-50"
            />
          </div>

          <div v-else class="stack-list">
            <button
              v-for="source in filteredSources"
              :key="source.id"
              class="stack-item cursor-pointer text-left group"
              :class="selectedSource?.id === source.id ? 'is-active' : ''"
              type="button"
              @click="openSource(source)"
            >
              <div class="flex items-start justify-between">
                <div class="min-w-0 flex-1">
                  <p
                    class="truncate text-sm font-bold text-[var(--text-strong)] group-hover:text-[var(--accent)] transition-colors"
                  >
                    {{ source.title }}
                  </p>
                  <p
                    class="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--text-muted)]"
                  >
                    {{ source.summary || "暂无摘要。" }}
                  </p>
                </div>
                <div class="ml-2 scale-75 origin-top-right">
                  <span
                    class="status-pill"
                    :class="getSourceStatusTone(source.status)"
                  >
                    {{ getSourceStatusLabel(source.status) }}
                  </span>
                </div>
              </div>

              <!-- Inline Actions: Visible on Hover -->
              <div
                class="mt-3 flex items-center gap-2 pt-2 border-t border-[rgba(93,72,34,0.04)] opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <button
                  class="soft-button !p-1.5"
                  title="下载"
                  type="button"
                  @click.stop="downloadSource(source)"
                >
                  <Download class="size-3.5" />
                </button>
                <button
                  class="soft-button !p-1.5"
                  title="重处理"
                  type="button"
                  :disabled="sourceActionId === source.id"
                  @click.stop="reprocessSource(source)"
                >
                  <RefreshCw
                    class="size-3.5"
                    :class="sourceActionId === source.id ? 'animate-spin' : ''"
                  />
                </button>
                <div class="flex-1" />
                <button
                  class="soft-button !p-1.5 warn"
                  title="归档"
                  type="button"
                  :disabled="sourceActionId === source.id"
                  @click.stop="archiveSource(source)"
                >
                  <Archive class="size-3.5" />
                </button>
                <button
                  class="soft-button !p-1.5 warn"
                  title="彻底删除"
                  type="button"
                  :disabled="sourceActionId === source.id"
                  @click.stop="deleteSource(source)"
                >
                  <Trash2 class="size-3.5" />
                </button>
              </div>
            </button>
          </div>
        </template>
      </div>
    </aside>
  </section>

  <!-- MODALS -->

  <!-- Modal: Create Collection -->
  <UModal
    v-model:open="showCreateCollection"
    title="新建资料文件夹"
    description="创建一个顶层资料文件夹，后续上传的文件都会归入这里。"
    :close="!creatingCollection"
  >
    <template #body>
      <div class="space-y-4 py-2">
        <div class="space-y-1.5">
          <p class="section-label">文件夹名称</p>
          <input
            v-model="createCollectionForm.name"
            class="field-shell w-full text-sm"
            placeholder="例如：市场研究、技术文档..."
          >
        </div>
        <div class="space-y-1.5">
          <p class="section-label">文件夹说明</p>
          <textarea
            v-model="createCollectionForm.description"
            class="field-shell w-full text-sm !min-h-[100px]"
            placeholder="简要说明此分组包含的资料范围..."
          />
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <button
          class="soft-button"
          type="button"
          @click="showCreateCollection = false"
          :disabled="creatingCollection"
        >
          取消
        </button>
        <button
          class="soft-button primary"
          type="button"
          @click="createCollection"
          :disabled="creatingCollection || !createCollectionForm.name.trim()"
        >
          <LoaderCircle v-if="creatingCollection" class="size-4 animate-spin" />
          <Check v-else class="size-4" />
          <span>确认创建</span>
        </button>
      </div>
    </template>
  </UModal>

  <!-- Modal: Import Source -->
  <UModal
    v-model:open="showImportModal"
    title="添加文件到当前分组"
    description="把文件放进当前分组，支持批量选择、名称预览、文件大小和格式识别。"
    :close="!importPending"
  >
    <template #body>
      <div class="space-y-4 py-2">
        <div class="segmented-tabs w-full">
          <button
            class="segmented-tab flex-1"
            :class="importMode === 'file' ? 'is-active' : ''"
            type="button"
            @click="importMode = 'file'"
          >
            文件上传
          </button>
          <button
            class="segmented-tab flex-1"
            :class="importMode === 'text' ? 'is-active' : ''"
            type="button"
            @click="importMode = 'text'"
          >
            手动录入
          </button>
        </div>

        <template v-if="importMode === 'file'">
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <p class="section-label">选择文件</p>
              <p class="text-[10px] text-[var(--text-dim)]">
                当前分组会作为顶层文件夹
              </p>
            </div>
            <label
              class="field-shell flex flex-col items-center justify-center py-8 border-dashed cursor-pointer transition-colors"
              :class="
                fileDropActive
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                  : 'hover:border-[var(--accent)]'
              "
              @dragenter.prevent="fileDropActive = true"
              @dragover.prevent="fileDropActive = true"
              @dragleave.prevent="fileDropActive = false"
              @drop.prevent="handleFileDrop"
            >
              <Upload class="size-8 text-[var(--text-dim)] mb-2" />
              <p class="text-sm font-medium">
                {{ queuedFiles.length > 0
                    ? `已选择 ${queuedFiles.length} 个文件，可继续添加`
                    : "点击或拖拽多个文件到此处" }}
              </p>
              <p class="mt-1 text-[10px] text-[var(--text-dim)] text-center">
                支持批量上传；当前可解析
                PDF、DOCX、Markdown、文本、HTML、JSON、CSV、XML、YAML。
              </p>
              <input
                ref="fileInputRef"
                type="file"
                multiple
                class="hidden"
                @change="handleFileChange"
              >
            </label>
          </div>

          <div v-if="queuedFiles.length > 0" class="space-y-2">
            <div class="flex items-center justify-between">
              <p class="section-label">文件预览</p>
              <p class="text-[10px] text-[var(--text-dim)]">
                {{ queuedFilesAwaitingUpload.length }}
                个待上传，
                {{ queuedFilesSuccessCount }}
                个已接收，
                {{ queuedFilesFailureCount }}
                个异常
              </p>
            </div>
            <div class="max-h-64 space-y-2 overflow-auto pr-1">
              <div
                v-for="fileItem in queuedFiles"
                :key="fileItem.id"
                class="rounded-xl border border-[var(--border-soft)] bg-white px-3 py-2"
              >
                <div class="flex items-start gap-3">
                  <div
                    class="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl"
                    :class="getQueuedFileIconTone(fileItem.kind)"
                  >
                    <component
                      :is="getQueuedFileIcon(fileItem.kind)"
                      class="size-4"
                    />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p
                          class="truncate text-sm font-medium text-[var(--text-strong)]"
                        >
                          {{ fileItem.name }}
                        </p>
                        <p class="mt-1 text-[10px] text-[var(--text-dim)]">
                          {{ fileItem.formatLabel }}
                          ·
                          {{ formatFileSize(fileItem.size) }}
                        </p>
                        <p
                          v-if="fileItem.errorMessage"
                          class="mt-1 text-[10px] text-red-500"
                        >
                          {{ fileItem.errorMessage }}
                        </p>
                      </div>
                      <button
                        class="soft-button !p-1.5"
                        type="button"
                        :disabled="importPending && fileItem.status === 'uploading'"
                        @click="removeQueuedFile(fileItem.id)"
                      >
                        <X class="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <span
                    class="status-pill scale-90 origin-right"
                    :class="getQueuedFileStatusTone(fileItem.status)"
                  >
                    {{ getQueuedFileStatusLabel(fileItem.status) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="importSummaryMessage"
            class="panel-muted rounded-xl border border-[var(--border-soft)] p-3"
          >
            <p class="text-[12px] leading-relaxed text-[var(--text-muted)]">
              {{ importSummaryMessage }}
            </p>
          </div>

          <div class="space-y-1.5">
            <p class="section-label">统一摘要 (可选)</p>
            <textarea
              v-model="fileForm.summary"
              class="field-shell w-full text-sm !min-h-[80px]"
              placeholder="会应用到本次选择的所有文件"
            />
          </div>
          <div class="space-y-1.5">
            <p class="section-label">统一标签 (用逗号分隔)</p>
            <input
              v-model="fileForm.tags"
              class="field-shell w-full text-sm"
              placeholder="例如：研究, 会议纪要"
            >
          </div>
        </template>

        <template v-else>
          <div class="space-y-1.5">
            <p class="section-label">资料标题</p>
            <input
              v-model="textForm.title"
              class="field-shell w-full text-sm"
              placeholder="输入资料名称"
            >
          </div>
          <div class="space-y-1.5">
            <p class="section-label">摘要 (可选)</p>
            <textarea
              v-model="textForm.summary"
              class="field-shell w-full text-sm !min-h-[80px]"
              placeholder="简要说明这段内容的用途"
            />
          </div>
          <div class="space-y-1.5">
            <p class="section-label">正文内容</p>
            <textarea
              v-model="textForm.content"
              class="field-shell w-full text-sm !min-h-[160px]"
              placeholder="在这里粘贴或输入资料正文..."
            />
          </div>
          <div class="space-y-1.5">
            <p class="section-label">标签 (用逗号分隔)</p>
            <input
              v-model="textForm.tags"
              class="field-shell w-full text-sm"
              placeholder="标签1, 标签2..."
            >
          </div>
        </template>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <button
          class="soft-button"
          type="button"
          @click="closeImportModal"
          :disabled="importPending"
        >
          取消
        </button>
        <button
          class="soft-button primary"
          type="button"
          @click="submitImport"
          :disabled="!canSubmitImport"
        >
          <LoaderCircle v-if="importPending" class="size-4 animate-spin" />
          <Upload v-else class="size-4" />
          <span>
            {{ importMode === "file"
                ? `上传 ${queuedFilesAwaitingUpload.length} 个文件`
                : "开始处理" }}
          </span>
        </button>
      </div>
    </template>
  </UModal>

  <!-- Modal: Source Detail & Edit -->
  <UModal
    v-model:open="showSourceDetailModal"
    title="资料详细信息"
    description="查看资料状态、编辑标题和摘要，并核对当前收录内容。"
    :close="!savingSource"
  >
    <template #body>
      <div v-if="selectedSource" class="space-y-5">
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <p class="section-label">资料标题</p>
            <span
              class="status-pill scale-75 origin-right"
              :class="getSourceStatusTone(selectedSource.status)"
            >
              {{ getSourceStatusLabel(selectedSource.status) }}
            </span>
          </div>
          <input
            v-model="sourceEditor.title"
            class="field-shell w-full text-sm font-medium"
          >
        </div>
        <div class="space-y-1.5">
          <p class="section-label">摘要</p>
          <textarea
            v-model="sourceEditor.summary"
            class="field-shell w-full text-sm !min-h-[80px]"
          />
        </div>
        <div class="space-y-1.5">
          <p class="section-label">标签</p>
          <input v-model="sourceEditor.tags" class="field-shell w-full text-sm">
        </div>
        <div class="space-y-1.5">
          <p class="section-label">内容预览</p>
          <div
            class="p-3 bg-white border border-[var(--border-soft)] rounded-lg text-[11px] leading-relaxed text-[var(--text-muted)] max-h-40 overflow-auto"
          >
            {{ selectedSource.contentPreview }}
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <button
          class="soft-button"
          type="button"
          @click="showSourceDetailModal = false"
        >
          关闭
        </button>
        <button
          class="soft-button primary"
          type="button"
          @click="saveSourceMetadata"
          :disabled="savingSource"
        >
          <LoaderCircle v-if="savingSource" class="size-4 animate-spin" />
          <Save v-else class="size-4" />
          <span>保存修改</span>
        </button>
      </div>
    </template>
  </UModal>

  <!-- Modal: Collection Settings -->
  <UModal
    v-model:open="showCollectionSettingsModal"
    title="资料文件夹设置"
    description="调整当前文件夹名称与说明，它会作为会话和文件的顶层容器。"
    :close="!savingCollection"
  >
    <template #body>
      <div v-if="activeCollection" class="space-y-4 py-2">
        <div class="space-y-1.5">
          <p class="section-label">文件夹名称</p>
          <input
            v-model="collectionEditor.name"
            class="field-shell w-full text-sm"
          >
        </div>
        <div class="space-y-1.5">
          <p class="section-label">说明描述</p>
          <textarea
            v-model="collectionEditor.description"
            class="field-shell w-full text-sm !min-h-[100px]"
          />
        </div>
        <div class="pt-4 mt-4 border-t border-red-100">
          <p class="section-label text-red-600 mb-2">危险区域</p>
          <button
            class="soft-button warn w-full"
            type="button"
            @click="removeCollection"
          >
            <Trash2 class="size-4 mr-2" />
            删除此资料文件夹
          </button>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <button
          class="soft-button"
          type="button"
          @click="showCollectionSettingsModal = false"
        >
          取消
        </button>
        <button
          class="soft-button primary"
          type="button"
          @click="saveCollection"
          :disabled="savingCollection"
        >
          <LoaderCircle v-if="savingCollection" class="size-4 animate-spin" />
          <Check v-else class="size-4" />
          <span>保存设置</span>
        </button>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
  /* 针对不同角色的气泡微调 */
  .message-bubble.user {
    background: white;
    border-color: var(--border-soft);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
  }

  .message-bubble.assistant {
    background: linear-gradient(135deg, #ffffff 0%, #f9fbfb 100%);
    border-left: 3px solid var(--accent);
  }

  /* 隐藏滚动条但保留功能 (可选，看审美) */
  .messages-scroller::-webkit-scrollbar {
    width: 6px;
  }
  .messages-scroller::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.05);
  }

  .message-markdown :deep(h1),
  .message-markdown :deep(h2),
  .message-markdown :deep(h3),
  .message-markdown :deep(h4) {
    margin-top: 0.9rem;
    margin-bottom: 0.45rem;
    font-weight: 700;
    line-height: 1.35;
    color: var(--text-strong);
  }

  .message-markdown :deep(h1) {
    font-size: 1.1rem;
  }

  .message-markdown :deep(h2) {
    font-size: 1rem;
  }

  .message-markdown :deep(h3),
  .message-markdown :deep(h4) {
    font-size: 0.92rem;
  }

  .message-markdown :deep(p),
  .message-markdown :deep(ul),
  .message-markdown :deep(ol),
  .message-markdown :deep(blockquote),
  .message-markdown :deep(pre),
  .message-markdown :deep(table) {
    margin-top: 0.65rem;
  }

  .message-markdown :deep(ul),
  .message-markdown :deep(ol) {
    padding-left: 1.15rem;
  }

  .message-markdown :deep(li + li) {
    margin-top: 0.25rem;
  }

  .message-markdown :deep(blockquote) {
    border-left: 3px solid rgba(15, 118, 110, 0.18);
    padding-left: 0.85rem;
    color: var(--text-muted);
  }

  .message-markdown :deep(code) {
    border-radius: 0.4rem;
    background: rgba(15, 118, 110, 0.08);
    padding: 0.08rem 0.35rem;
    font-size: 0.92em;
  }

  .message-markdown :deep(pre) {
    overflow-x: auto;
    border-radius: 0.9rem;
    background: #16211e;
    padding: 0.9rem 1rem;
    color: #eff7f4;
  }

  .message-markdown :deep(pre code) {
    background: transparent;
    padding: 0;
    color: inherit;
  }

  .message-markdown :deep(table) {
    width: 100%;
    overflow: hidden;
    border-collapse: collapse;
    border-radius: 0.9rem;
    border: 1px solid var(--border-soft);
  }

  .message-markdown :deep(th),
  .message-markdown :deep(td) {
    border-bottom: 1px solid var(--border-soft);
    padding: 0.55rem 0.7rem;
    text-align: left;
    vertical-align: top;
  }

  .message-markdown :deep(th) {
    background: var(--bg-panel-muted);
    font-weight: 700;
  }

  .message-markdown :deep(a) {
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 0.16em;
  }

  .trace-panel {
    margin-top: 1rem;
    border-top: 1px solid rgba(93, 72, 34, 0.06);
    padding-top: 0.9rem;
  }

  .trace-list {
    margin-top: 0.75rem;
    display: grid;
    gap: 0.6rem;
  }

  .trace-item {
    border: 1px solid var(--border-soft);
    border-radius: 0.95rem;
    background: rgba(255, 255, 255, 0.72);
    padding: 0.75rem 0.85rem;
  }

  .trace-kind {
    color: var(--text-dim);
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
</style>
