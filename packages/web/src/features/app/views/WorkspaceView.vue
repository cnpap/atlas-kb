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
  const showCreateCollection = ref(false);

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
      filteredSources.value[0] ||
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

  function formatCollectionStats(collection: KnowledgeCollection): string {
    return `可用 ${collection.readyDocumentCount} · 总计 ${collection.documentCount}`;
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

      if (!routeSourceId.value && data.sources[0]?.id) {
        await replaceWorkspaceQuery({
          source: data.sources[0].id,
        });
      }
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
        fileForm.value = {
          title: "",
          summary: "",
          tags: "",
        };
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
        textForm.value = {
          title: "",
          summary: "",
          tags: "",
          content: "",
        };
      }

      await loadCollections();
      await loadSources(activeCollection.value.id);
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
      panel: "library",
    });
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
    <aside class="workbench-pane">
      <div class="pane-header pane-header-stack">
        <div class="min-w-0">
          <p class="section-label">个人知识库</p>
        </div>
        <div class="pane-actions-grid">
          <button
            class="soft-button w-full"
            type="button"
            @click="openCreateCollectionModal"
          >
            <UIcon name="i-lucide-folder-plus" class="size-4" />
            创建分组
          </button>
          <button
            class="soft-button primary w-full"
            type="button"
            @click="startNewSession"
          >
            <UIcon name="i-lucide-plus" class="size-4" />
            新建会话
          </button>
        </div>
      </div>

      <div class="pane-section">
        <div class="section-row">
          <span class="section-label">知识分组</span>
          <span class="text-xs text-[var(--text-dim)]"
            >{{ collections.length }}</span
          >
        </div>

        <div v-if="loadingCollections" class="stack-list mt-2">
          <div
            v-for="index in 4"
            :key="index"
            class="stack-item h-14 animate-pulse"
          />
        </div>

        <div
          v-else-if="collections.length === 0"
          class="empty-state mt-2 !px-4 !py-4"
        >
          <p class="text-sm text-[var(--text-muted)]">
            还没有知识分组，先建一个再导入资料。
          </p>
        </div>

        <div v-else class="stack-list mt-2">
          <button
            v-for="collection in collections"
            :key="collection.id"
            class="stack-item cursor-pointer text-left"
            :class="activeCollectionId === collection.id ? 'is-active' : ''"
            type="button"
            @click="selectCollection(collection.id)"
          >
            <div class="min-w-0">
              <p
                class="truncate text-sm font-semibold text-[var(--text-strong)]"
              >
                {{ collection.name }}
              </p>
              <p
                class="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-muted)]"
              >
                {{ collection.description || "暂无说明" }}
              </p>
              <p class="collection-stats">
                {{ formatCollectionStats(collection) }}
              </p>
            </div>
          </button>
        </div>
      </div>

      <div class="pane-section min-h-0 flex-1">
        <div class="section-row">
          <span class="section-label">会话</span>
          <span class="text-xs text-[var(--text-dim)]"
            >{{ sessions.length }}</span
          >
        </div>

        <div v-if="loadingSessions" class="stack-list mt-2">
          <div
            v-for="index in 5"
            :key="index"
            class="stack-item h-[72px] animate-pulse"
          />
        </div>

        <div
          v-else-if="sessions.length === 0"
          class="empty-state mt-2 !px-4 !py-4"
        >
          <p class="text-sm text-[var(--text-muted)]">
            还没有会话，可以直接开始新会话。
          </p>
        </div>

        <div v-else class="stack-list mt-2 min-h-0 flex-1 overflow-auto">
          <div
            v-for="session in sessions"
            :key="session.id"
            class="stack-item flex items-start gap-3"
            :class="activeSessionId === session.id ? 'is-active' : ''"
          >
            <button
              class="min-w-0 flex-1 cursor-pointer text-left"
              type="button"
              @click="openSession(session)"
            >
              <div class="flex items-start justify-between gap-3">
                <p
                  class="truncate text-sm font-semibold text-[var(--text-strong)]"
                >
                  {{ session.title }}
                </p>
              </div>
              <p
                class="mt-2 line-clamp-2 text-xs leading-5 text-[var(--text-muted)]"
              >
                {{ session.preview || "还没有会话摘要。" }}
              </p>
              <div class="session-meta-row">
                <span class="tag-chip !px-2 !py-0.5">
                  {{ getCollectionName(session.collectionId) }}
                </span>
                <span>{{ formatRelativeTime(session.updatedAt) }}</span>
              </div>
            </button>
            <button
              class="soft-button warn session-delete-button"
              type="button"
              @click.stop="removeSession(session.id)"
            >
              <UIcon name="i-lucide-trash-2" class="size-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>

    <section class="workbench-pane center-pane">
      <div class="pane-header">
        <div class="min-w-0">
          <p class="truncate text-base font-semibold text-[var(--text-strong)]">
            {{ activeSession?.title || "新对话" }}
          </p>
          <p class="mt-1 text-sm text-[var(--text-muted)]">
            {{ activeSessionCollectionLabel }}
          </p>
        </div>
        <div class="flex flex-wrap justify-end gap-2">
          <button
            class="soft-button"
            type="button"
            @click="renameSession"
            :disabled="!activeSession"
          >
            重命名
          </button>
          <button
            class="soft-button"
            type="button"
            @click="openPanel('citations')"
          >
            引用
          </button>
          <button
            class="soft-button"
            type="button"
            @click="openPanel('library')"
          >
            资料库
          </button>
        </div>
      </div>

      <div v-if="error" class="notice-strip warn">
        <UIcon name="i-lucide-circle-alert" class="size-4 shrink-0" />
        <span>{{ error }}</span>
      </div>

      <div v-if="loadingMessages" class="messages-scroller">
        <div
          v-for="index in 4"
          :key="index"
          class="message-bubble assistant h-24 animate-pulse"
        />
      </div>

      <div v-else class="messages-scroller">
        <div v-if="messages.length === 0" class="empty-state">
          <p class="card-heading">直接提问即可</p>
          <p class="text-sm leading-6 text-[var(--text-muted)]">
            建议把问题问得更具体，例如“基于这组资料，给我一套可执行的复盘流程”。
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
          <div class="flex items-center justify-between gap-3">
            <p class="message-meta">
              {{ message.role === "user" ? "我的问题" : "知识回答" }}
            </p>
            <p class="text-[11px] text-[var(--text-dim)]">
              {{ formatDateTime(message.createdAt) }}
            </p>
          </div>
          <p
            class="whitespace-pre-wrap text-sm leading-7 text-[var(--text-strong)]"
          >
            {{ message.content }}
          </p>

          <div
            v-if="message.citations.length > 0"
            class="mt-3 flex flex-wrap gap-2"
          >
            <button
              v-for="citation in message.citations"
              :key="`${message.id}:${citation.sourceId}:${citation.snippet}`"
              class="tag-chip cursor-pointer"
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
              {{ citation.title }}
            </button>
          </div>

          <div
            v-if="message.role === 'assistant'"
            class="mt-4 flex items-center gap-2"
          >
            <button
              class="soft-button !px-3 !py-1.5"
              type="button"
              :class="message.feedback?.rating === 'up' ? 'primary' : ''"
              @click.stop="sendFeedback(message, 'up')"
            >
              <UIcon name="i-lucide-thumbs-up" class="size-4" />
              有用
            </button>
            <button
              class="soft-button !px-3 !py-1.5"
              type="button"
              :class="message.feedback?.rating === 'down' ? 'warn' : ''"
              @click.stop="sendFeedback(message, 'down')"
            >
              <UIcon name="i-lucide-thumbs-down" class="size-4" />
              不够好
            </button>
          </div>
        </article>
      </div>

      <form class="composer-bar" @submit.prevent="submitReply">
        <label class="field-shell composer-field">
          <span class="section-label">提问</span>
          <textarea
            v-model="composer"
            class="textarea-reset mt-2 !min-h-[72px]"
            placeholder="输入问题，系统会先检索资料，再基于证据回答。"
          />
        </label>
        <div class="composer-actions">
          <button
            class="soft-button primary"
            type="submit"
            :disabled="replying"
          >
            <UIcon
              :name="replying ? 'i-lucide-loader-circle' : 'i-lucide-arrow-up'"
              class="size-4"
              :class="replying ? 'animate-spin' : ''"
            />
            {{ replying ? "发送中" : "发送" }}
          </button>
        </div>
      </form>
    </section>

    <aside class="workbench-pane right-pane">
      <div class="pane-header">
        <div class="segmented-tabs">
          <button
            class="segmented-tab"
            :class="panel === 'citations' ? 'is-active' : ''"
            type="button"
            @click="openPanel('citations')"
          >
            引用
          </button>
          <button
            class="segmented-tab"
            :class="panel === 'library' ? 'is-active' : ''"
            type="button"
            @click="openPanel('library')"
          >
            资料库
          </button>
        </div>
      </div>

      <div v-if="panel === 'citations'" class="pane-scroll">
        <div v-if="!retrieval" class="empty-state">
          <p class="card-heading">还没有可回看的召回结果</p>
          <p class="text-sm leading-6 text-[var(--text-muted)]">
            发送问题后，这里会展示本轮命中的资料，以及哪些片段真的被用于回答。
          </p>
        </div>

        <template v-else>
          <div class="panel-muted mt-3 p-3">
            <p class="section-label">多路召回</p>
            <p class="mt-2 text-sm leading-6 text-[var(--text-strong)]">
              本轮命中 {{ retrieval.total }} 条资料，实际引用
              {{ usedHits.length }}
              条。
            </p>
            <p class="mt-2 text-xs leading-5 text-[var(--text-muted)]">
              查询变体：{{ retrieval.queryVariants.join(" / ") }}
            </p>
          </div>

          <div class="pane-section">
            <div class="section-row">
              <span class="section-label">已用于回答</span>
              <span class="text-xs text-[var(--text-dim)]"
                >{{ usedHits.length }}</span
              >
            </div>
            <div
              v-if="usedHits.length === 0"
              class="empty-state mt-2 !px-4 !py-4"
            >
              <p class="text-sm text-[var(--text-muted)]">
                这轮没有直接引用的资料片段。
              </p>
            </div>
            <div v-else class="stack-list mt-2">
              <button
                v-for="hit in usedHits"
                :key="hit.chunkId"
                class="stack-item cursor-pointer text-left"
                type="button"
                @click="focusHit(hit)"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <span class="status-pill ready">已引用</span>
                  <span
                    class="tag-chip"
                    v-for="path in hit.recallPaths"
                    :key="`${hit.chunkId}:${path}`"
                    >{{ path }}</span
                  >
                </div>
                <p class="mt-2 text-sm font-semibold text-[var(--text-strong)]">
                  {{ hit.title }}
                </p>
                <p class="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                  {{ hit.sectionPath || "未标记章节" }}
                </p>
                <p class="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                  {{ hit.snippet }}
                </p>
              </button>
            </div>
          </div>

          <div class="pane-section">
            <div class="section-row">
              <span class="section-label">已召回但未引用</span>
              <span class="text-xs text-[var(--text-dim)]"
                >{{ extraHits.length }}</span
              >
            </div>
            <div
              v-if="extraHits.length === 0"
              class="empty-state mt-2 !px-4 !py-4"
            >
              <p class="text-sm text-[var(--text-muted)]">没有额外候选。</p>
            </div>
            <div v-else class="stack-list mt-2">
              <button
                v-for="hit in extraHits"
                :key="hit.chunkId"
                class="stack-item cursor-pointer text-left"
                type="button"
                @click="focusHit(hit)"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    class="tag-chip"
                    v-for="path in hit.recallPaths"
                    :key="`${hit.chunkId}:${path}`"
                    >{{ path }}</span
                  >
                </div>
                <p class="mt-2 text-sm font-semibold text-[var(--text-strong)]">
                  {{ hit.title }}
                </p>
                <p class="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                  {{ hit.snippet }}
                </p>
              </button>
            </div>
          </div>

          <div v-if="selectedSource" class="pane-section">
            <div class="section-row">
              <span class="section-label">资料预览</span>
              <button
                class="soft-button !px-3 !py-1.5"
                type="button"
                @click="openPanel('library')"
              >
                去资料库
              </button>
            </div>
            <div class="panel-muted mt-2 p-3">
              <div class="flex flex-wrap items-center gap-2">
                <span
                  class="status-pill"
                  :class="getSourceStatusTone(selectedSource.status)"
                >
                  {{ getSourceStatusLabel(selectedSource.status) }}
                </span>
                <span class="tag-chip"
                  >{{ getSourceTypeLabel(selectedSource.sourceType) }}</span
                >
              </div>
              <p class="mt-3 text-sm font-semibold text-[var(--text-strong)]">
                {{ selectedSource.title }}
              </p>
              <p class="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                {{ selectedSource.summary || "暂无摘要。" }}
              </p>
              <p class="mt-3 text-xs leading-5 text-[var(--text-muted)]">
                {{ selectedSource.contentPreview }}
              </p>
            </div>
          </div>
        </template>
      </div>

      <div v-else class="pane-scroll">
        <div v-if="!activeCollection" class="empty-state">
          <p class="card-heading">先选择知识分组</p>
          <p class="text-sm leading-6 text-[var(--text-muted)]">
            资料导入、编辑、重处理都依附在某个知识分组下。
          </p>
        </div>

        <template v-else>
          <div class="pane-section">
            <div class="section-row">
              <span class="section-label">分组设置</span>
              <div class="flex gap-2">
                <button
                  class="soft-button warn !px-3 !py-1.5"
                  type="button"
                  @click="removeCollection"
                >
                  删除
                </button>
                <button
                  class="soft-button primary !px-3 !py-1.5"
                  type="button"
                  :disabled="savingCollection"
                  @click="saveCollection"
                >
                  <UIcon
                    :name="savingCollection ? 'i-lucide-loader-circle' : 'i-lucide-save'"
                    class="size-4"
                    :class="savingCollection ? 'animate-spin' : ''"
                  />
                  保存
                </button>
              </div>
            </div>
            <div class="mt-2 space-y-3">
              <label class="field-shell block">
                <span class="section-label">名称</span>
                <input v-model="collectionEditor.name" class="input-reset mt-2">
              </label>
              <label class="field-shell block">
                <span class="section-label">说明</span>
                <textarea
                  v-model="collectionEditor.description"
                  class="textarea-reset mt-2 !min-h-[88px]"
                />
              </label>
            </div>
          </div>

          <div class="pane-section">
            <div class="section-row">
              <span class="section-label">导入资料</span>
              <div class="segmented-tabs">
                <button
                  class="segmented-tab"
                  :class="importMode === 'file' ? 'is-active' : ''"
                  type="button"
                  @click="importMode = 'file'"
                >
                  上传文件
                </button>
                <button
                  class="segmented-tab"
                  :class="importMode === 'text' ? 'is-active' : ''"
                  type="button"
                  @click="importMode = 'text'"
                >
                  粘贴内容
                </button>
              </div>
            </div>

            <div v-if="importMode === 'file'" class="mt-2 space-y-3">
              <label class="field-shell block">
                <span class="section-label">文件</span>
                <input
                  class="mt-2 block w-full text-sm text-[var(--text-muted)]"
                  type="file"
                  @change="handleFileChange"
                >
                <p
                  v-if="chosenFile"
                  class="mt-2 text-xs text-[var(--text-muted)]"
                >
                  {{ chosenFile.name }}
                </p>
              </label>
              <label class="field-shell block">
                <span class="section-label">标题</span>
                <input
                  v-model="fileForm.title"
                  class="input-reset mt-2"
                  placeholder="可选"
                >
              </label>
              <label class="field-shell block">
                <span class="section-label">摘要</span>
                <textarea
                  v-model="fileForm.summary"
                  class="textarea-reset mt-2 !min-h-[72px]"
                  placeholder="可选"
                />
              </label>
              <label class="field-shell block">
                <span class="section-label">标签</span>
                <input
                  v-model="fileForm.tags"
                  class="input-reset mt-2"
                  placeholder="用逗号分隔"
                >
              </label>
            </div>

            <div v-else class="mt-2 space-y-3">
              <label class="field-shell block">
                <span class="section-label">标题</span>
                <input
                  v-model="textForm.title"
                  class="input-reset mt-2"
                  placeholder="例如：访谈纪要"
                >
              </label>
              <label class="field-shell block">
                <span class="section-label">摘要</span>
                <textarea
                  v-model="textForm.summary"
                  class="textarea-reset mt-2 !min-h-[72px]"
                  placeholder="可选"
                />
              </label>
              <label class="field-shell block">
                <span class="section-label">标签</span>
                <input
                  v-model="textForm.tags"
                  class="input-reset mt-2"
                  placeholder="用逗号分隔"
                >
              </label>
              <label class="field-shell block">
                <span class="section-label">内容</span>
                <textarea
                  v-model="textForm.content"
                  class="textarea-reset mt-2 !min-h-[140px]"
                  placeholder="直接粘贴你的资料正文"
                />
              </label>
            </div>

            <div class="mt-3 flex justify-end">
              <button
                class="soft-button primary"
                type="button"
                :disabled="importPending"
                @click="submitImport"
              >
                <UIcon
                  :name="importPending ? 'i-lucide-loader-circle' : 'i-lucide-upload'"
                  class="size-4"
                  :class="importPending ? 'animate-spin' : ''"
                />
                {{ importPending ? "处理中" : "开始导入" }}
              </button>
            </div>
          </div>

          <div class="pane-section">
            <div class="section-row">
              <span class="section-label">资料列表</span>
              <span class="text-xs text-[var(--text-dim)]"
                >{{ sources.length }}</span
              >
            </div>

            <label class="field-shell mt-2 block">
              <span class="section-label">筛选</span>
              <input
                v-model="sourceFilter"
                class="input-reset mt-2"
                placeholder="按标题、摘要、标签筛选"
              >
            </label>

            <div v-if="loadingSources" class="stack-list mt-2">
              <div
                v-for="index in 4"
                :key="index"
                class="stack-item h-16 animate-pulse"
              />
            </div>

            <div
              v-else-if="filteredSources.length === 0"
              class="empty-state mt-2 !px-4 !py-4"
            >
              <p class="text-sm text-[var(--text-muted)]">
                这个分组还没有资料。
              </p>
            </div>

            <div v-else class="stack-list mt-2">
              <button
                v-for="source in filteredSources"
                :key="source.id"
                class="stack-item cursor-pointer text-left"
                :class="selectedSource?.id === source.id ? 'is-active' : ''"
                type="button"
                @click="openSource(source)"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    class="status-pill"
                    :class="getSourceStatusTone(source.status)"
                  >
                    {{ getSourceStatusLabel(source.status) }}
                  </span>
                  <span class="tag-chip"
                    >{{ getSourceTypeLabel(source.sourceType) }}</span
                  >
                </div>
                <p class="mt-2 text-sm font-semibold text-[var(--text-strong)]">
                  {{ source.title }}
                </p>
                <p class="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                  {{ source.summary || "暂无摘要。" }}
                </p>
              </button>
            </div>
          </div>

          <div v-if="selectedSource" class="pane-section">
            <div class="section-row">
              <span class="section-label">资料详情</span>
              <div class="flex gap-2">
                <button
                  class="soft-button !px-3 !py-1.5"
                  type="button"
                  @click="downloadSource(selectedSource)"
                >
                  下载
                </button>
                <button
                  class="soft-button !px-3 !py-1.5"
                  type="button"
                  :disabled="sourceActionId === selectedSource.id"
                  @click="reprocessSource(selectedSource)"
                >
                  重新处理
                </button>
                <button
                  class="soft-button warn !px-3 !py-1.5"
                  type="button"
                  :disabled="sourceActionId === selectedSource.id"
                  @click="archiveSource(selectedSource)"
                >
                  归档
                </button>
                <button
                  class="soft-button warn !px-3 !py-1.5"
                  type="button"
                  :disabled="sourceActionId === selectedSource.id"
                  @click="deleteSource(selectedSource)"
                >
                  删除
                </button>
              </div>
            </div>
            <div class="mt-2 space-y-3">
              <label class="field-shell block">
                <span class="section-label">标题</span>
                <input v-model="sourceEditor.title" class="input-reset mt-2">
              </label>
              <label class="field-shell block">
                <span class="section-label">摘要</span>
                <textarea
                  v-model="sourceEditor.summary"
                  class="textarea-reset mt-2 !min-h-[72px]"
                />
              </label>
              <label class="field-shell block">
                <span class="section-label">标签</span>
                <input v-model="sourceEditor.tags" class="input-reset mt-2">
              </label>
              <div class="panel-muted p-3">
                <div class="flex flex-wrap items-center gap-2">
                  <span
                    class="status-pill"
                    :class="getSourceStatusTone(selectedSource.status)"
                  >
                    {{ getSourceStatusLabel(selectedSource.status) }}
                  </span>
                  <span class="tag-chip"
                    >{{ getSourceTypeLabel(selectedSource.sourceType) }}</span
                  >
                  <span
                    v-for="tag in selectedSource.tags"
                    :key="tag"
                    class="tag-chip"
                    >#{{ tag }}</span
                  >
                </div>
                <p class="mt-3 text-xs leading-5 text-[var(--text-muted)]">
                  最近处理
                  {{ formatRelativeTime(selectedSource.lastProcessedAt || selectedSource.updatedAt) }}
                  · 更新于 {{ formatDateTime(selectedSource.updatedAt) }}
                </p>
                <p class="mt-3 text-sm leading-6 text-[var(--text-muted)]">
                  {{ selectedSource.contentPreview }}
                </p>
              </div>
              <div class="flex justify-end">
                <button
                  class="soft-button primary"
                  type="button"
                  :disabled="savingSource"
                  @click="saveSourceMetadata"
                >
                  <UIcon
                    :name="savingSource ? 'i-lucide-loader-circle' : 'i-lucide-save'"
                    class="size-4"
                    :class="savingSource ? 'animate-spin' : ''"
                  />
                  {{ savingSource ? "保存中" : "保存资料信息" }}
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>
    </aside>
  </section>

  <UModal
    v-model:open="showCreateCollection"
    title="创建知识分组"
    description="给这组资料一个清晰的名称和用途说明。"
    :close="!creatingCollection"
    :dismissible="!creatingCollection"
  >
    <template #body>
      <div class="space-y-3">
        <label class="field-shell block">
          <span class="section-label">分组名称</span>
          <input
            v-model="createCollectionForm.name"
            class="input-reset mt-2"
            placeholder="例如：写作资料"
          >
        </label>
        <label class="field-shell block">
          <span class="section-label">分组说明</span>
          <textarea
            v-model="createCollectionForm.description"
            class="textarea-reset mt-2 !min-h-[88px]"
            placeholder="说明这组资料主要放什么内容"
          />
        </label>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <button
          class="soft-button"
          type="button"
          :disabled="creatingCollection"
          @click="showCreateCollection = false"
        >
          取消
        </button>
        <button
          class="soft-button primary"
          type="button"
          :disabled="creatingCollection"
          @click="createCollection"
        >
          <UIcon
            :name="creatingCollection ? 'i-lucide-loader-circle' : 'i-lucide-check'"
            class="size-4"
            :class="creatingCollection ? 'animate-spin' : ''"
          />
          {{ creatingCollection ? "创建中" : "创建分组" }}
        </button>
      </div>
    </template>
  </UModal>
</template>
