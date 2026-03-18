<script setup lang="ts">
  import type { AskKnowledgeResult, KnowledgeSpace } from "@atlas-kb/schema";
  import { computed, nextTick, onMounted, ref, watch } from "vue";
  import { useRoute } from "vue-router";
  import {
    askKnowledgeQuestion,
    getErrorMessage,
    getKnowledgeSpaces,
  } from "@/lib/api-client";

  interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    result?: AskKnowledgeResult;
    timestamp: Date;
  }

  const ALL_SPACES_VALUE = "__all_spaces__";

  const route = useRoute();
  const spaces = ref<KnowledgeSpace[]>([]);
  const selectedSpaceId = ref(
    (route.query.spaceId as string) || ALL_SPACES_VALUE,
  );
  const loading = ref(false);
  const input = ref("");
  const errorMessage = ref("");
  const messages = ref<Message[]>([]);
  const scrollContainer = ref<HTMLDivElement | null>(null);

  const quickPrompts = [
    "总结当前知识库中最重要的文档与要点。",
    "新成员入职时最应该优先阅读哪些制度或流程？",
    "请找出最适合作为入门材料的来源文档。",
    "这个知识库最近更新了哪些重要内容？",
  ];

  const selectedSpace = computed(
    () =>
      spaces.value.find((space) => space.id === selectedSpaceId.value) || null,
  );

  const spaceOptions = computed(() => [
    { label: "全部知识库空间", value: ALL_SPACES_VALUE },
    ...spaces.value.map((space) => ({ label: space.name, value: space.id })),
  ]);

  async function loadSpaces() {
    try {
      const data = await getKnowledgeSpaces();
      spaces.value = data.spaces;
    } catch {
      // Initial load should not block the page chrome.
    }
  }

  async function scrollToBottom() {
    await nextTick();
    if (scrollContainer.value) {
      scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
    }
  }

  async function sendMessage(prompt?: string) {
    const question = (prompt ?? input.value).trim();
    if (!question || loading.value) {
      return;
    }

    input.value = "";
    errorMessage.value = "";

    messages.value.push({
      id: crypto.randomUUID(),
      role: "user",
      content: question,
      timestamp: new Date(),
    });

    await scrollToBottom();

    loading.value = true;
    try {
      const result = await askKnowledgeQuestion({
        question,
        spaceId:
          selectedSpaceId.value === ALL_SPACES_VALUE
            ? undefined
            : selectedSpaceId.value,
        limit: 3,
      });

      messages.value.push({
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.answer,
        result,
        timestamp: new Date(),
      });
    } catch (error: unknown) {
      errorMessage.value = getErrorMessage(error);
    } finally {
      loading.value = false;
      await scrollToBottom();
    }
  }

  function onPromptKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  watch(
    () => route.query.spaceId,
    (spaceId) => {
      selectedSpaceId.value =
        typeof spaceId === "string" ? spaceId : ALL_SPACES_VALUE;
    },
  );

  onMounted(() => {
    void loadSpaces();
  });
</script>

<template>
  <div class="atlas-page">
    <div class="flex h-full min-h-0 flex-col gap-4 p-4 sm:p-6">
      <section
        class="atlas-panel flex shrink-0 flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between"
      >
        <div class="space-y-3">
          <div class="atlas-chip">
            <UIcon
              name="i-lucide-message-circle"
              class="size-3.5 text-[var(--ui-primary)]"
            />
            智能问答工作区
          </div>
          <div>
            <h2
              class="text-2xl font-semibold tracking-tight text-[var(--atlas-text)]"
            >
              智能问答
            </h2>
            <p class="mt-1 text-sm text-[var(--atlas-text-muted)]">
              {{ selectedSpace ? `当前已限定为「${selectedSpace.name}」空间。` : "当前将在全部已索引知识库空间中进行问答。" }}
            </p>
          </div>
        </div>

        <div class="grid gap-3 sm:min-w-[280px]">
          <USelect
            v-model="selectedSpaceId"
            :items="spaceOptions"
            icon="i-lucide-library"
            size="xl"
            :ui="{ base: 'bg-white text-[var(--atlas-text)] ring-[var(--atlas-line)]' }"
          />
        </div>
      </section>

      <section class="atlas-panel flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          ref="scrollContainer"
          class="atlas-page-scroll px-4 py-5 sm:px-6 sm:py-6"
        >
          <div
            v-if="messages.length === 0"
            class="mx-auto flex h-full w-full max-w-4xl flex-col justify-center gap-8 py-6"
          >
            <div class="space-y-4">
              <p class="atlas-label">问答对话</p>
              <h3
                class="text-3xl font-semibold tracking-tight text-[var(--atlas-text)] sm:text-4xl"
              >
                发起问题，查看来源，让回答建立在真实文档之上。
              </h3>
              <p
                class="max-w-2xl text-base leading-7 text-[var(--atlas-text-muted)]"
              >
                当前问答界面围绕 Atlas
                的知识检索流程重新组织。你可以先选择知识库空间，也可以直接从推荐问题开始。
              </p>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <button
                v-for="prompt in quickPrompts"
                :key="prompt"
                type="button"
                class="atlas-card atlas-card-hover p-4 text-left"
                @click="sendMessage(prompt)"
              >
                <p class="text-sm font-medium text-[var(--atlas-text)]">
                  {{ prompt }}
                </p>
              </button>
            </div>
          </div>

          <div v-else class="mx-auto flex w-full max-w-4xl flex-col gap-6">
            <article
              v-for="message in messages"
              :key="message.id"
              class="flex gap-4"
              :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
            >
              <div
                class="flex max-w-3xl gap-3"
                :class="message.role === 'user' ? 'flex-row-reverse' : ''"
              >
                <div
                  class="flex size-10 shrink-0 items-center justify-center rounded-2xl"
                  :class="message.role === 'user' ? 'bg-[var(--ui-primary)] text-white' : 'bg-[var(--atlas-bg-muted)] text-[var(--atlas-text-muted)]'"
                >
                  <UIcon
                    :name="message.role === 'user' ? 'i-lucide-user' : 'i-lucide-bot'"
                    class="size-4"
                  />
                </div>

                <div class="space-y-3">
                  <div
                    class="rounded-[24px] px-5 py-4"
                    :class="
                      message.role === 'user'
                        ? 'bg-[var(--ui-primary)] text-white'
                        : 'border border-[var(--atlas-line)] bg-white text-[var(--atlas-text)]'
                    "
                  >
                    <p class="whitespace-pre-wrap text-sm leading-7">
                      {{ message.content }}
                    </p>
                  </div>

                  <div
                    v-if="message.result?.citations?.length"
                    class="grid gap-3 sm:grid-cols-2"
                  >
                    <a
                      v-for="citation in message.result.citations"
                      :key="citation.documentId"
                      :href="citation.downloadUrl || undefined"
                      :target="citation.downloadUrl ? '_blank' : undefined"
                      :rel="citation.downloadUrl ? 'noreferrer' : undefined"
                      class="atlas-card block p-4 hover:border-[var(--atlas-line-strong)]"
                    >
                      <div class="flex items-start gap-3">
                        <div
                          class="mt-0.5 flex size-9 items-center justify-center rounded-xl bg-[var(--atlas-primary-soft)] text-[var(--ui-primary)]"
                        >
                          <UIcon name="i-lucide-file-text" class="size-4" />
                        </div>
                        <div class="min-w-0">
                          <p
                            class="text-sm font-semibold text-[var(--atlas-text)]"
                          >
                            {{ citation.title }}
                          </p>
                          <p class="mt-1 text-xs text-[var(--atlas-text-dim)]">
                            {{ citation.sourceFilename || "已索引文档" }}
                          </p>
                          <p
                            class="mt-3 line-clamp-3 text-sm leading-6 text-[var(--atlas-text-muted)]"
                          >
                            {{ citation.snippet }}
                          </p>
                          <div v-if="citation.downloadUrl" class="mt-3">
                            <span
                              class="text-xs font-medium text-[var(--ui-primary)]"
                              >可下载原文</span
                            >
                          </div>
                        </div>
                      </div>
                    </a>
                  </div>
                </div>
              </div>
            </article>

            <article v-if="loading" class="flex gap-4">
              <div
                class="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--atlas-bg-muted)] text-[var(--atlas-text-muted)]"
              >
                <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
              </div>
              <div
                class="rounded-[24px] border border-[var(--atlas-line)] bg-white px-5 py-4"
              >
                <p class="text-sm text-[var(--atlas-text-muted)]">
                  正在检索最相关的来源并生成回答…
                </p>
              </div>
            </article>
          </div>
        </div>

        <div
          class="border-t bg-white px-4 py-4 sm:px-6"
          style="border-color: var(--atlas-line);"
        >
          <div class="mx-auto flex w-full max-w-4xl flex-col gap-4">
            <UAlert
              v-if="errorMessage"
              color="error"
              variant="subtle"
              :title="errorMessage"
              icon="i-lucide-alert-circle"
            />

            <div class="atlas-panel-muted p-2">
              <textarea
                v-model="input"
                rows="1"
                placeholder="输入你希望基于知识库回答的问题..."
                class="min-h-[104px] w-full resize-none border-0 bg-transparent px-3 py-3 text-sm leading-7 text-[var(--atlas-text)] outline-none placeholder:text-[var(--atlas-text-dim)]"
                :disabled="loading"
                @keydown="onPromptKeydown"
              />

              <div
                class="flex flex-col gap-3 border-t px-2 pt-3 sm:flex-row sm:items-center sm:justify-between"
                style="border-color: var(--atlas-line);"
              >
                <div class="flex flex-wrap gap-2">
                  <span class="atlas-chip">
                    <UIcon name="i-lucide-library" class="size-3.5" />
                    {{ selectedSpace ? selectedSpace.name : "全部空间" }}
                  </span>
                  <span class="atlas-chip">
                    <UIcon name="i-lucide-file-search" class="size-3.5" />
                    最多返回 3 条引用
                  </span>
                </div>

                <UButton
                  icon="i-lucide-arrow-up"
                  label="发送"
                  :loading="loading"
                  :disabled="!input.trim()"
                  class="rounded-full"
                  @click="sendMessage()"
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
