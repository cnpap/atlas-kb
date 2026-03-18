<script setup lang="ts">
  import type { KnowledgeSpace } from "@atlas-kb/schema";
  import { computed, onMounted, reactive, ref } from "vue";
  import { useRouter } from "vue-router";
  import {
    createKnowledgeSpaceRequest,
    getErrorMessage,
    getKnowledgeSpaces,
  } from "@/lib/api-client";

  interface CreateSpaceState {
    name: string;
    description: string;
  }

  const router = useRouter();
  const spaces = ref<KnowledgeSpace[]>([]);
  const loading = ref(true);
  const errorMessage = ref("");
  const searchQuery = ref("");
  const creating = ref(false);
  const isModalOpen = ref(false);

  const state = reactive<CreateSpaceState>({
    name: "",
    description: "",
  });

  const filteredSpaces = computed(() => {
    if (!searchQuery.value.trim()) {
      return spaces.value;
    }

    const query = searchQuery.value.toLowerCase();
    return spaces.value.filter(
      (space) =>
        space.name.toLowerCase().includes(query) ||
        space.description.toLowerCase().includes(query),
    );
  });

  const totalDocuments = computed(() =>
    spaces.value.reduce((total, space) => total + space.documentCount, 0),
  );

  const newestUpdate = computed(() => {
    const dates = spaces.value.map((space) =>
      new Date(space.updatedAt).getTime(),
    );
    return dates.length ? new Date(Math.max(...dates)) : null;
  });

  async function loadSpaces() {
    loading.value = true;
    try {
      const data = await getKnowledgeSpaces();
      spaces.value = data.spaces;
    } catch (error: unknown) {
      errorMessage.value = getErrorMessage(error);
    } finally {
      loading.value = false;
    }
  }

  async function createSpace() {
    if (!state.name.trim() || !state.description.trim()) {
      return;
    }

    creating.value = true;
    try {
      await createKnowledgeSpaceRequest({
        name: state.name,
        description: state.description,
      });

      state.name = "";
      state.description = "";
      isModalOpen.value = false;
      await loadSpaces();
    } catch (error: unknown) {
      errorMessage.value = getErrorMessage(error);
    } finally {
      creating.value = false;
    }
  }

  function openChat(spaceId: string) {
    void router.push({ path: "/ask", query: { spaceId } });
  }

  onMounted(() => {
    void loadSpaces();
  });
</script>

<template>
  <div class="atlas-page">
    <div class="flex h-full min-h-0 flex-col gap-4 p-4 sm:p-6">
      <section
        class="atlas-panel grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-end"
      >
        <div class="space-y-3">
          <div class="atlas-chip">
            <UIcon
              name="i-lucide-library"
              class="size-3.5 text-[var(--ui-primary)]"
            />
            知识库工作区
          </div>
          <div>
            <h2
              class="text-2xl font-semibold tracking-tight text-[var(--atlas-text)]"
            >
              知识库空间
            </h2>
            <p class="mt-1 text-sm text-[var(--atlas-text-muted)]">
              以统一界面完成知识库空间的创建、浏览、检索与进入问答。
            </p>
          </div>
        </div>

        <div class="flex flex-col gap-3 sm:flex-row">
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            placeholder="搜索知识库空间..."
            size="xl"
            class="min-w-[280px]"
            :ui="{ base: 'bg-white text-[var(--atlas-text)] ring-[var(--atlas-line)]' }"
          />
          <UButton
            icon="i-lucide-plus"
            label="新建空间"
            size="xl"
            class="rounded-full"
            @click="isModalOpen = true"
          />
        </div>
      </section>

      <section class="grid gap-4 lg:grid-cols-3">
        <div class="atlas-card p-5">
          <p class="atlas-label">空间数量</p>
          <p
            class="mt-3 text-3xl font-semibold tracking-tight text-[var(--atlas-text)]"
          >
            {{ spaces.length }}
          </p>
        </div>
        <div class="atlas-card p-5">
          <p class="atlas-label">文档总数</p>
          <p
            class="mt-3 text-3xl font-semibold tracking-tight text-[var(--atlas-text)]"
          >
            {{ totalDocuments }}
          </p>
        </div>
        <div class="atlas-card p-5">
          <p class="atlas-label">最近更新</p>
          <p class="mt-3 text-lg font-semibold text-[var(--atlas-text)]">
            {{ newestUpdate ? newestUpdate.toLocaleDateString() : "暂无更新" }}
          </p>
        </div>
      </section>

      <section class="atlas-panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          class="border-b px-5 py-4"
          style="border-color: var(--atlas-line);"
        >
          <p class="text-sm font-medium text-[var(--atlas-text-muted)]">
            共 {{ filteredSpaces.length }} 个结果
          </p>
        </div>

        <div class="atlas-page-scroll p-4 sm:p-5">
          <UAlert
            v-if="errorMessage"
            color="error"
            variant="subtle"
            :title="errorMessage"
            icon="i-lucide-alert-circle"
            class="mb-4"
          />

          <div v-if="loading" class="grid gap-4 xl:grid-cols-2">
            <USkeleton v-for="i in 4" :key="i" class="h-52 rounded-[24px]" />
          </div>

          <div
            v-else-if="filteredSpaces.length === 0"
            class="flex h-full min-h-[360px] flex-col items-center justify-center gap-5 rounded-[24px] border border-dashed bg-[var(--atlas-bg-soft)] p-10 text-center"
            style="border-color: var(--atlas-line-strong);"
          >
            <div
              class="flex size-14 items-center justify-center rounded-3xl bg-[var(--atlas-primary-soft)] text-[var(--ui-primary)]"
            >
              <UIcon name="i-lucide-book-open" class="size-6" />
            </div>
            <div class="space-y-2">
              <h3 class="text-xl font-semibold text-[var(--atlas-text)]">
                当前还没有知识库空间
              </h3>
              <p
                class="max-w-md text-sm leading-6 text-[var(--atlas-text-muted)]"
              >
                先创建第一个知识库空间，再继续上传文档并将问答范围限定到正确的业务上下文。
              </p>
            </div>
            <UButton
              label="创建第一个空间"
              icon="i-lucide-plus"
              class="rounded-full"
              @click="isModalOpen = true"
            />
          </div>

          <div v-else class="grid gap-4 xl:grid-cols-2">
            <article
              v-for="space in filteredSpaces"
              :key="space.id"
              class="atlas-card atlas-card-hover flex cursor-pointer flex-col gap-5 p-5"
              @click="router.push(`/kb/${space.id}`)"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="flex items-start gap-3">
                  <div
                    class="flex size-12 items-center justify-center rounded-2xl bg-[var(--atlas-primary-soft)] text-[var(--ui-primary)]"
                  >
                    <UIcon name="i-lucide-library" class="size-5" />
                  </div>
                  <div>
                    <h3 class="text-lg font-semibold text-[var(--atlas-text)]">
                      {{ space.name }}
                    </h3>
                    <p
                      class="mt-1 text-sm leading-6 text-[var(--atlas-text-muted)]"
                    >
                      {{ space.description }}
                    </p>
                  </div>
                </div>

                <UBadge color="neutral" variant="subtle" size="lg">
                  {{ space.documentCount }}
                  篇文档
                </UBadge>
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <div class="atlas-panel-muted p-4">
                  <p class="atlas-label">更新时间</p>
                  <p class="mt-3 text-sm font-medium text-[var(--atlas-text)]">
                    {{ new Date(space.updatedAt).toLocaleDateString() }}
                  </p>
                </div>
                <div class="atlas-panel-muted p-4">
                  <p class="atlas-label">当前用途</p>
                  <p class="mt-3 text-sm font-medium text-[var(--atlas-text)]">
                    检索、引用与限定范围问答
                  </p>
                </div>
              </div>

              <div class="flex flex-wrap gap-3">
                <UButton
                  icon="i-lucide-arrow-up-right"
                  label="进入空间"
                  color="neutral"
                  variant="outline"
                  class="atlas-action-secondary rounded-full"
                  @click.stop="router.push(`/kb/${space.id}`)"
                />
                <UButton
                  icon="i-lucide-message-circle"
                  label="进入问答"
                  class="rounded-full"
                  @click.stop="openChat(space.id)"
                />
              </div>
            </article>
          </div>
        </div>
      </section>
    </div>

    <UModal v-model:open="isModalOpen" title="创建知识库空间">
      <template #body>
        <form class="space-y-5" @submit.prevent="createSpace">
          <UFormField label="空间名称" name="name" required>
            <UInput
              v-model="state.name"
              placeholder="例如：研发文档"
              class="w-full"
              size="xl"
              :ui="{ base: 'bg-white text-[var(--atlas-text)] ring-[var(--atlas-line)]' }"
            />
          </UFormField>

          <UFormField label="空间说明" name="description" required>
            <UTextarea
              v-model="state.description"
              placeholder="描述这个空间用于存放哪些内容，以及服务哪些团队或场景。"
              class="w-full"
              :rows="4"
              :ui="{ base: 'bg-white text-[var(--atlas-text)] ring-[var(--atlas-line)]' }"
            />
          </UFormField>

          <div class="flex justify-end gap-3">
            <UButton
              label="取消"
              variant="ghost"
              color="neutral"
              class="atlas-action-secondary rounded-full"
              @click="isModalOpen = false"
            />
            <UButton
              type="submit"
              label="创建空间"
              :loading="creating"
              :disabled="!state.name.trim() || !state.description.trim() || creating"
              class="rounded-full"
            />
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
