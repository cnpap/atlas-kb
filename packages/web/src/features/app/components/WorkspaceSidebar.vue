<script setup lang="ts">
  import type { ChatSession, KnowledgeCollection } from "@atlas-kb/schema";
  import {
    ChevronsUpDown,
    FolderKanban,
    MessageSquare,
    Plus,
    Trash2,
  } from "lucide-vue-next";
  import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
  import { formatRelativeTime } from "@/lib/knowledge-ui";
  import CurrentUserPanel from "./CurrentUserPanel.vue";

  const props = defineProps<{
    activeCollectionId: string;
    activeSessionId: string;
    collections: KnowledgeCollection[];
    creatingSession?: boolean;
    currentUsername?: string;
    loadingCollections?: boolean;
    loadingSessions?: boolean;
    sessions: ChatSession[];
    userLoading?: boolean;
  }>();

  const emit = defineEmits<{
    createCollection: [];
    createSession: [];
    deleteSession: [sessionId: string];
    logout: [];
    selectCollection: [collectionId: string];
    selectSession: [session: ChatSession];
  }>();

  const switcherRef = ref<HTMLDivElement | null>(null);
  const collectionMenuOpen = ref(false);

  const activeCollection = computed(
    () =>
      props.collections.find(
        (collection) => collection.id === props.activeCollectionId,
      ) || null,
  );
  const collectionSwitcherLabel = computed(() => {
    if (props.loadingCollections) {
      return "正在加载";
    }

    return activeCollection.value?.name || "选择工作区";
  });

  function closeCollectionMenu() {
    collectionMenuOpen.value = false;
  }

  function toggleCollectionMenu() {
    if (props.loadingCollections || props.collections.length === 0) {
      return;
    }

    collectionMenuOpen.value = !collectionMenuOpen.value;
  }

  function handleSelectCollection(collectionId: string) {
    closeCollectionMenu();

    if (collectionId === props.activeCollectionId) {
      return;
    }

    emit("selectCollection", collectionId);
  }

  function handleDocumentPointerDown(event: PointerEvent) {
    const switcherElement = switcherRef.value;

    if (!switcherElement || switcherElement.contains(event.target as Node)) {
      return;
    }

    closeCollectionMenu();
  }

  function handleDocumentKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      closeCollectionMenu();
    }
  }

  watch(
    () => props.activeCollectionId,
    () => {
      closeCollectionMenu();
    },
  );

  watch(
    () => props.loadingCollections,
    (loadingCollections) => {
      if (loadingCollections) {
        closeCollectionMenu();
      }
    },
  );

  watch(
    () => props.collections.length,
    (collectionCount) => {
      if (collectionCount === 0) {
        closeCollectionMenu();
      }
    },
  );

  onMounted(() => {
    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleDocumentKeydown);
  });

  onBeforeUnmount(() => {
    document.removeEventListener("pointerdown", handleDocumentPointerDown);
    document.removeEventListener("keydown", handleDocumentKeydown);
  });
</script>

<template>
  <aside class="workbench-pane">
    <div class="pane-section border-b border-[rgba(93,72,34,0.06)]">
      <div class="workspace-switcher" ref="switcherRef">
        <button
          class="workspace-switcher-trigger"
          :class="collectionMenuOpen ? 'is-open' : ''"
          data-testid="collection-switcher-trigger"
          :disabled="loadingCollections || collections.length === 0"
          type="button"
          aria-haspopup="listbox"
          :aria-expanded="collectionMenuOpen ? 'true' : 'false'"
          @click="toggleCollectionMenu"
        >
          <span class="workspace-switcher-icon-shell" aria-hidden="true">
            <FolderKanban class="size-4" />
          </span>
          <p
            class="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-strong)]"
          >
            {{ collectionSwitcherLabel }}
          </p>
          <ChevronsUpDown
            class="workspace-switcher-chevron size-4"
            :class="collectionMenuOpen ? 'is-open' : ''"
          />
        </button>

        <div
          v-if="collectionMenuOpen"
          class="workspace-switcher-menu"
          data-testid="collection-switcher-menu"
          role="listbox"
          aria-label="资料文件夹切换"
        >
          <button
            v-for="collection in collections"
            :key="collection.id"
            class="workspace-switcher-item"
            :class="activeCollectionId === collection.id ? 'is-active' : ''"
            data-testid="collection-item"
            type="button"
            role="option"
            :aria-selected="activeCollectionId === collection.id"
            @click="handleSelectCollection(collection.id)"
          >
            <div class="flex min-w-0 items-center gap-2.5">
              <span class="workspace-switcher-item-icon" aria-hidden="true">
                <FolderKanban class="size-3.5" />
              </span>
              <p
                class="truncate text-sm font-semibold text-[var(--text-strong)]"
              >
                {{ collection.name }}
              </p>
            </div>
          </button>
        </div>
      </div>

      <div
        v-if="!loadingCollections && collections.length === 0"
        class="workspace-switcher-empty mt-3"
      >
        还没有资料文件夹，先新建一个开始整理内容。
      </div>

      <div class="pane-actions-grid mt-3 w-full">
        <button
          class="soft-button flex-1"
          data-testid="create-collection-button"
          type="button"
          @click="emit('createCollection')"
        >
          <Plus class="size-4" />
          <span class="text-xs">建文件夹</span>
        </button>
        <button
          class="soft-button primary flex-1"
          type="button"
          :disabled="!activeCollectionId || creatingSession"
          @click="emit('createSession')"
        >
          <MessageSquare class="size-4" />
          <span class="text-xs"
            >{{ creatingSession ? "创建中" : "新对话" }}</span
          >
        </button>
      </div>
    </div>

    <div class="flex min-h-0 flex-1 flex-col">
      <div class="pane-section min-h-0 flex-1">
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

        <div v-else class="stack-list h-full overflow-auto pr-1">
          <div
            v-for="session in sessions"
            :key="session.id"
            class="stack-item flex items-center gap-2"
            :class="activeSessionId === session.id ? 'is-active' : ''"
          >
            <button
              class="min-w-0 flex-1 cursor-pointer text-left"
              type="button"
              @click="emit('selectSession', session)"
            >
              <p class="truncate text-sm font-medium text-[var(--text-strong)]">
                {{ session.title }}
              </p>
              <p class="mt-1 truncate text-[10px] text-[var(--text-dim)]">
                {{ formatRelativeTime(session.updatedAt) }}
              </p>
            </button>
            <button
              class="soft-button warn !p-1.5"
              type="button"
              @click.stop="emit('deleteSession', session.id)"
            >
              <Trash2 class="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      <CurrentUserPanel
        :loading="userLoading"
        :username="currentUsername"
        @logout="emit('logout')"
      />
    </div>
  </aside>
</template>
