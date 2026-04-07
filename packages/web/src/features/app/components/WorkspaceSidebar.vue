<script setup lang="ts">
  import type { ChatSession, KnowledgeCollection } from "@atlas-kb/schema";
  import { MessageSquare, Plus, Trash2 } from "lucide-vue-next";
  import { formatRelativeTime } from "@/lib/knowledge-ui";
  import CurrentUserPanel from "./CurrentUserPanel.vue";

  defineProps<{
    activeCollectionId: string;
    activeSessionId: string;
    collections: KnowledgeCollection[];
    currentUsername?: string;
    loadingCollections?: boolean;
    loadingSessions?: boolean;
    sessions: ChatSession[];
    userLoading?: boolean;
  }>();

  defineEmits<{
    createCollection: [];
    createSession: [];
    deleteSession: [sessionId: string];
    logout: [];
    selectCollection: [collectionId: string];
    selectSession: [session: ChatSession];
  }>();
</script>

<template>
  <aside class="workbench-pane">
    <div class="pane-header pane-header-stack">
      <div class="pane-actions-grid w-full">
        <button
          class="soft-button flex-1"
          data-testid="create-collection-button"
          type="button"
          @click="$emit('createCollection')"
        >
          <Plus class="size-4" />
          <span class="text-xs">建文件夹</span>
        </button>
        <button
          class="soft-button primary flex-1"
          type="button"
          :disabled="!activeCollectionId"
          @click="$emit('createSession')"
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
          data-testid="collection-item"
          type="button"
          @click="$emit('selectCollection', collection.id)"
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
              @click="$emit('selectSession', session)"
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
              @click.stop="$emit('deleteSession', session.id)"
            >
              <Trash2 class="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      <CurrentUserPanel
        :loading="userLoading"
        :username="currentUsername"
        @logout="$emit('logout')"
      />
    </div>
  </aside>
</template>
