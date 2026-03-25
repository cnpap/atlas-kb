<script setup lang="ts">
  import type {
    ChatMessage,
    ChatSession,
    KnowledgeCollection,
    KnowledgeSource,
    SearchKnowledgeHit,
  } from "@atlas-kb/schema";
  import { computed, onMounted, ref, watch } from "vue";
  import { useRoute, useRouter } from "vue-router";
  import {
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
    importKnowledgeFileRequest,
    importKnowledgeTextRequest,
    listChatSessionsRequest,
    listKnowledgeCollections,
    replyChatSessionRequest,
    reprocessKnowledgeSourceRequest,
    sendChatFeedbackRequest,
    updateChatSessionRequest,
    updateKnowledgeCollectionRequest,
    updateKnowledgeSourceRequest,
  } from "@/lib/api-client";
  import {
    formatDateTime,
    formatRelativeTime,
    getSourceStatusLabel,
    getSourceStatusTone,
    getSourceTypeLabel,
  } from "@/lib/knowledge-ui";

  type PanelMode = "citations" | "library";
  type ImportMode = "file" | "text";

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

  const composer = ref("");
  const selectedAssistantMessageId = ref("");
  const sourceFilter = ref("");
  const importMode = ref<ImportMode>("file");
  const chosenFile = ref<File | null>(null);

  // Modals Visibility
  const showCreateCollection = ref(false);
  const showImportModal = ref(false);
  const showSourceDetailModal = ref(false);
  const showCollectionSettingsModal = ref(false);

  const createCollectionForm = ref({
    name: "",
    description: "",
  });
  const collectionEditor = ref({
    name: "",
    description: "",
  });
  const fileForm = ref({
    title: "",
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

  function parseTags(input: string): string[] | undefined {
    const tags = input
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);

    return tags.length > 0 ? [...new Set(tags)] : undefined;
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
      error.value = cause instanceof Error ? cause.message : "知识分组加载失败";
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

  async function loadSources(collectionId: string) {
    if (!collectionId) {
      sources.value = [];
      syncCollectionEditor(null);
      return;
    }

    loadingSources.value = true;

    try {
      const data = await fetchKnowledgeCollectionSources(collectionId);
      sources.value = data.sources;
      syncCollectionEditor(data.collection);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "资料加载失败";
    } finally {
      loadingSources.value = false;
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
    await replaceWorkspaceQuery({
      session: created.session.id,
    });

    return created.session.id;
  }

  async function createCollection() {
    const name = createCollectionForm.value.name.trim();
    const description = createCollectionForm.value.description.trim();

    if (!name || !description) {
      error.value = "请填写知识分组名称和说明";
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
      error.value = cause instanceof Error ? cause.message : "创建知识分组失败";
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
      error.value = cause instanceof Error ? cause.message : "知识分组保存失败";
    } finally {
      savingCollection.value = false;
    }
  }

  async function removeCollection() {
    if (!activeCollection.value) {
      return;
    }

    const accepted = window.confirm(
      `确认删除知识分组“${activeCollection.value.name}”？`,
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
      error.value = cause instanceof Error ? cause.message : "删除知识分组失败";
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

    try {
      const sessionId = await ensureSession();
      const result = await replyChatSessionRequest({
        sessionId,
        body: {
          query: trimmed,
          collectionId: activeCollectionId.value || undefined,
          limit: 6,
        },
      });

      composer.value = "";
      messages.value = [
        ...messages.value,
        result.userMessage,
        result.assistantMessage,
      ];
      selectedAssistantMessageId.value = result.assistantMessage.id;

      const firstCitation = result.assistantMessage.citations[0];

      await loadSessions();

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
      error.value = cause instanceof Error ? cause.message : "发送消息失败";
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
      error.value = "请先选择一个知识分组";
      return;
    }

    importPending.value = true;
    error.value = "";

    try {
      if (importMode.value === "file") {
        if (!chosenFile.value) {
          throw new Error("请先选择文件");
        }

        await importKnowledgeFileRequest({
          collectionId: activeCollection.value.id,
          file: chosenFile.value,
          title: fileForm.value.title.trim() || undefined,
          summary: fileForm.value.summary.trim() || undefined,
          tags: parseTags(fileForm.value.tags),
        });
        chosenFile.value = null;
        fileForm.value.title = "";
        fileForm.value.summary = "";
        fileForm.value.tags = "";
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
        textForm.value.title = "";
        textForm.value.summary = "";
        textForm.value.tags = "";
        textForm.value.content = "";
      }

      await loadCollections();
      await loadSources(activeCollection.value.id);
      showImportModal.value = false;
    } catch (cause) {
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
    chosenFile.value = input?.files?.[0] || null;
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
    void loadMessages(value);
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
            <span class="text-xs">建分组</span>
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
          <span class="section-label">知识分组</span>
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
              资料库
            </button>
          </div>
        </div>
      </div>

      <div v-if="error" class="notice-strip warn">
        <CircleAlert class="size-4 shrink-0" />
        <span>{{ error }}</span>
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
            选择一个知识分组，系统将通过多路召回技术，基于您的私有资料提供精准回复。
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
              {{ message.role === "user" ? "YOU" : "ATLAS" }}
            </p>
            <p class="text-[10px] text-[var(--text-dim)]">
              {{ formatDateTime(message.createdAt) }}
            </p>
          </div>
          <p
            class="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-strong)]"
          >
            {{ message.content }}
          </p>

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
            v-if="message.role === 'assistant'"
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
            placeholder="询问有关您的知识库的问题..."
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
            {{ panel === 'citations' ? '引用溯源' : '分组资料库' }}
          </p>
        </div>
        <div v-if="panel === 'library'" class="flex items-center gap-2">
          <button
            class="soft-button !px-2.5 !py-1.5"
            type="button"
            @click="showImportModal = true"
          >
            <Upload class="size-3.5" />
            <span class="text-xs">导入资料</span>
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
          <p class="text-sm text-[var(--text-muted)]">请先在左侧选择一个分组</p>
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
    title="新建知识分组"
    description="创建一个新的命名空间，以便按主题管理您的资料。"
    :close="!creatingCollection"
  >
    <template #body>
      <div class="space-y-4 py-2">
        <div class="space-y-1.5">
          <p class="section-label">分组名称</p>
          <input
            v-model="createCollectionForm.name"
            class="field-shell w-full text-sm"
            placeholder="例如：市场研究、技术文档..."
          >
        </div>
        <div class="space-y-1.5">
          <p class="section-label">用途描述</p>
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
    title="导入知识资料"
    description="向当前分组添加新资料。支持文件上传或文本粘贴。"
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
            <p class="section-label">选择文件</p>
            <label
              class="field-shell flex flex-col items-center justify-center py-8 border-dashed cursor-pointer hover:border-[var(--accent)] transition-colors"
            >
              <Upload class="size-8 text-[var(--text-dim)] mb-2" />
              <p class="text-sm font-medium">
                {{ chosenFile ? chosenFile.name : '点击或拖拽文件到此处' }}
              </p>
              <p
                v-if="chosenFile"
                class="text-[10px] text-[var(--accent)] mt-1"
              >
                {{ (chosenFile.size / 1024).toFixed(1) }}
                KB
              </p>
              <input type="file" class="hidden" @change="handleFileChange">
            </label>
          </div>
          <div class="space-y-1.5">
            <p class="section-label">显示标题 (可选)</p>
            <input
              v-model="fileForm.title"
              class="field-shell w-full text-sm"
              placeholder="默认为文件名"
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
            <p class="section-label">正文内容</p>
            <textarea
              v-model="textForm.content"
              class="field-shell w-full text-sm !min-h-[160px]"
              placeholder="在这里粘贴或输入资料正文..."
            />
          </div>
        </template>

        <div class="space-y-1.5">
          <p class="section-label">标签 (用逗号分隔)</p>
          <input
            v-if="importMode === 'file'"
            v-model="fileForm.tags"
            class="field-shell w-full text-sm"
            placeholder="标签1, 标签2..."
          >
          <input
            v-else
            v-model="textForm.tags"
            class="field-shell w-full text-sm"
            placeholder="标签1, 标签2..."
          >
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <button
          class="soft-button"
          type="button"
          @click="showImportModal = false"
          :disabled="importPending"
        >
          取消
        </button>
        <button
          class="soft-button primary"
          type="button"
          @click="submitImport"
          :disabled="importPending"
        >
          <LoaderCircle v-if="importPending" class="size-4 animate-spin" />
          <Upload v-else class="size-4" />
          <span>开始处理</span>
        </button>
      </div>
    </template>
  </UModal>

  <!-- Modal: Source Detail & Edit -->
  <UModal
    v-model:open="showSourceDetailModal"
    title="资料详细信息"
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
          <p class="section-label">摘要摘要</p>
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
    title="知识分组设置"
    :close="!savingCollection"
  >
    <template #body>
      <div v-if="activeCollection" class="space-y-4 py-2">
        <div class="space-y-1.5">
          <p class="section-label">分组名称</p>
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
            删除此知识分组
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
</style>
