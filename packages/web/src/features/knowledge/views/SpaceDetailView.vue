<script setup lang="ts">
  import type { KnowledgeDocument, KnowledgeSpace } from "@atlas-kb/schema";
  import { computed, onMounted, reactive, ref } from "vue";
  import { useRoute, useRouter } from "vue-router";
  import {
    downloadKnowledgeDocumentRequest,
    getErrorMessage,
    getKnowledgeDocumentDownloadUrl,
    getKnowledgeDocuments,
    uploadKnowledgeDocumentRequest,
  } from "@/lib/api-client";

  interface UploadState {
    title: string;
    summary: string;
    tags: string;
    file: File | null;
  }

  const route = useRoute();
  const router = useRouter();
  const spaceId = route.params.spaceId as string;

  const space = ref<KnowledgeSpace | null>(null);
  const documents = ref<KnowledgeDocument[]>([]);
  const loading = ref(true);
  const error = ref("");
  const uploading = ref(false);
  const uploadStatus = ref("");

  const uploadState = reactive<UploadState>({
    title: "",
    summary: "",
    tags: "",
    file: null,
  });

  const totalSize = computed(() =>
    documents.value.reduce(
      (total, document) => total + (document.byteSize || 0),
      0,
    ),
  );

  function isDownloadableDocument(document: KnowledgeDocument): boolean {
    return document.source === "upload";
  }

  async function downloadDocument(document: KnowledgeDocument) {
    if (!isDownloadableDocument(document)) {
      return;
    }

    try {
      await downloadKnowledgeDocumentRequest({
        downloadUrl: getKnowledgeDocumentDownloadUrl({
          documentId: document.id,
          spaceId: document.spaceId,
        }),
        filename: document.sourceFilename || document.title,
      });
    } catch (err: unknown) {
      error.value = getErrorMessage(err);
    }
  }

  async function loadData() {
    loading.value = true;
    try {
      const data = await getKnowledgeDocuments(spaceId);
      space.value = data.space;
      documents.value = data.documents;
    } catch (err: unknown) {
      error.value = getErrorMessage(err);
    } finally {
      loading.value = false;
    }
  }

  function onFileChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0] || null;

    uploadState.file = file;
    if (file && !uploadState.title) {
      uploadState.title = file.name.replace(/\.[^/.]+$/, "");
    }
  }

  async function uploadDoc() {
    if (!uploadState.file) {
      return;
    }

    uploading.value = true;
    uploadStatus.value = "";
    error.value = "";

    try {
      const result = await uploadKnowledgeDocumentRequest({
        file: uploadState.file,
        spaceId,
        summary: uploadState.summary || undefined,
        tags: uploadState.tags || undefined,
        title: uploadState.title || undefined,
      });

      uploadStatus.value = result.indexed
        ? "文档上传并索引成功。"
        : "文档上传成功。";

      uploadState.file = null;
      uploadState.title = "";
      uploadState.summary = "";
      uploadState.tags = "";

      await loadData();

      window.setTimeout(() => {
        uploadStatus.value = "";
      }, 4000);
    } catch (err: unknown) {
      error.value = getErrorMessage(err);
    } finally {
      uploading.value = false;
    }
  }

  onMounted(() => {
    void loadData();
  });
</script>

<template>
  <div class="atlas-page">
    <div class="flex h-full min-h-0 flex-col gap-4 p-4 sm:p-6">
      <div
        v-if="loading && !space"
        class="flex flex-1 items-center justify-center"
      >
        <div class="space-y-4 text-center">
          <UIcon
            name="i-lucide-loader-2"
            class="mx-auto size-8 animate-spin text-[var(--ui-primary)]"
          />
          <p class="text-sm text-[var(--atlas-text-muted)]">
            正在加载空间详情…
          </p>
        </div>
      </div>

      <template v-else-if="space">
        <section class="atlas-panel flex flex-col gap-5 p-5">
          <div
            class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
          >
            <div class="space-y-3">
              <button
                type="button"
                class="atlas-chip"
                @click="router.push('/kb')"
              >
                <UIcon name="i-lucide-arrow-left" class="size-3.5" />
                返回空间列表
              </button>
              <div>
                <p class="atlas-label">知识库空间</p>
                <h2
                  class="mt-2 text-3xl font-semibold tracking-tight text-[var(--atlas-text)]"
                >
                  {{ space.name }}
                </h2>
                <p
                  class="mt-2 max-w-3xl text-sm leading-7 text-[var(--atlas-text-muted)]"
                >
                  {{ space.description }}
                </p>
              </div>
            </div>

            <div class="flex flex-wrap gap-3">
              <UButton
                :to="{ path: '/ask', query: { spaceId: space.id } }"
                icon="i-lucide-message-circle"
                label="进入问答"
                class="rounded-full"
              />
            </div>
          </div>

          <div class="grid gap-4 lg:grid-cols-3">
            <div class="atlas-card p-4">
              <p class="atlas-label">文档数量</p>
              <p class="mt-3 text-3xl font-semibold text-[var(--atlas-text)]">
                {{ documents.length }}
              </p>
            </div>
            <div class="atlas-card p-4">
              <p class="atlas-label">总大小</p>
              <p class="mt-3 text-lg font-semibold text-[var(--atlas-text)]">
                {{ totalSize > 0 ? `${Math.max(1, Math.round(totalSize / 1024))} KB` : "暂无上传文档" }}
              </p>
            </div>
            <div class="atlas-card p-4">
              <p class="atlas-label">最近更新</p>
              <p class="mt-3 text-lg font-semibold text-[var(--atlas-text)]">
                {{ new Date(space.updatedAt).toLocaleDateString() }}
              </p>
            </div>
          </div>
        </section>

        <section class="grid min-h-0 flex-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div class="atlas-panel flex min-h-0 flex-col overflow-hidden">
            <div
              class="flex items-center justify-between border-b px-5 py-4"
              style="border-color: var(--atlas-line);"
            >
              <div>
                <p class="text-lg font-semibold text-[var(--atlas-text)]">
                  文档列表
                </p>
                <p class="mt-1 text-sm text-[var(--atlas-text-muted)]">
                  浏览当前空间内的全部文档，并执行下载或进入问答等操作。
                </p>
              </div>
            </div>

            <div class="atlas-page-scroll p-4 sm:p-5">
              <UAlert
                v-if="error"
                color="error"
                variant="subtle"
                :title="error"
                icon="i-lucide-alert-circle"
                class="mb-4"
              />

              <div
                v-if="documents.length === 0"
                class="flex min-h-[320px] flex-col items-center justify-center gap-5 rounded-[24px] border border-dashed bg-[var(--atlas-bg-soft)] p-8 text-center"
                style="border-color: var(--atlas-line-strong);"
              >
                <div
                  class="flex size-14 items-center justify-center rounded-3xl bg-[var(--atlas-primary-soft)] text-[var(--ui-primary)]"
                >
                  <UIcon name="i-lucide-files" class="size-6" />
                </div>
                <div class="space-y-2">
                  <h3 class="text-xl font-semibold text-[var(--atlas-text)]">
                    当前还没有文档
                  </h3>
                  <p
                    class="max-w-md text-sm leading-6 text-[var(--atlas-text-muted)]"
                  >
                    先在右侧上传文档，再进入问答页面基于当前空间发起带引用的检索式问答。
                  </p>
                </div>
              </div>

              <div v-else class="space-y-3">
                <article
                  v-for="document in documents"
                  :key="document.id"
                  class="atlas-card p-5"
                >
                  <div
                    class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div class="min-w-0 flex-1 space-y-3">
                      <div class="flex items-start gap-3">
                        <div
                          class="flex size-11 items-center justify-center rounded-2xl bg-[var(--atlas-primary-soft)] text-[var(--ui-primary)]"
                        >
                          <UIcon name="i-lucide-file-text" class="size-5" />
                        </div>
                        <div class="min-w-0">
                          <h3
                            class="truncate text-base font-semibold text-[var(--atlas-text)]"
                          >
                            {{ document.title }}
                          </h3>
                          <p
                            class="mt-1 truncate text-sm text-[var(--atlas-text-muted)]"
                          >
                            {{ document.sourceFilename || "系统内部文档" }}
                          </p>
                        </div>
                      </div>

                      <p
                        class="text-sm leading-6 text-[var(--atlas-text-muted)]"
                      >
                        {{ document.summary || document.excerpt }}
                      </p>

                      <div
                        v-if="document.tags.length > 0"
                        class="flex flex-wrap gap-2"
                      >
                        <span
                          v-for="tag in document.tags"
                          :key="tag"
                          class="atlas-chip"
                        >
                          {{ tag }}
                        </span>
                      </div>
                    </div>

                    <div class="grid shrink-0 gap-3 sm:min-w-[180px]">
                      <div class="atlas-panel-muted p-3">
                        <p class="atlas-label">更新时间</p>
                        <p
                          class="mt-2 text-sm font-medium text-[var(--atlas-text)]"
                        >
                          {{ new Date(document.updatedAt).toLocaleDateString() }}
                        </p>
                      </div>
                      <div class="atlas-panel-muted p-3">
                        <p class="atlas-label">来源类型</p>
                        <p
                          class="mt-2 text-sm font-medium text-[var(--atlas-text)]"
                        >
                          {{ document.source === "upload" ? "上传文件" : "种子数据" }}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div
                    class="mt-4 flex flex-wrap gap-3 border-t pt-4"
                    style="border-color: var(--atlas-line);"
                  >
                    <UButton
                      v-if="isDownloadableDocument(document)"
                      icon="i-lucide-download"
                      label="下载原文"
                      color="neutral"
                      variant="outline"
                      class="atlas-action-secondary rounded-full"
                      @click="downloadDocument(document)"
                    />
                    <span v-else class="atlas-chip">
                      种子数据暂不支持下载
                    </span>

                    <UButton
                      icon="i-lucide-message-circle"
                      label="围绕此空间问答"
                      class="rounded-full"
                      @click="router.push({ path: '/ask', query: { spaceId: space.id } })"
                    />
                  </div>
                </article>
              </div>
            </div>
          </div>

          <aside class="atlas-panel flex min-h-0 flex-col overflow-hidden">
            <div
              class="border-b px-5 py-4"
              style="border-color: var(--atlas-line);"
            >
              <p class="text-lg font-semibold text-[var(--atlas-text)]">
                上传文档
              </p>
              <p class="mt-1 text-sm text-[var(--atlas-text-muted)]">
                上传新的来源文件，并将其纳入当前空间的检索范围。
              </p>
            </div>

            <div class="atlas-page-scroll p-5">
              <form class="space-y-5" @submit.prevent="uploadDoc">
                <UFormField label="源文件" name="file" required>
                  <div class="relative">
                    <input
                      id="file-upload"
                      type="file"
                      class="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                      @change="onFileChange"
                    >
                    <div
                      class="rounded-[24px] border border-dashed bg-[var(--atlas-bg-soft)] px-5 py-8 text-center"
                      style="border-color: var(--atlas-line-strong);"
                    >
                      <div
                        class="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[var(--atlas-primary-soft)] text-[var(--ui-primary)]"
                      >
                        <UIcon name="i-lucide-file-up" class="size-5" />
                      </div>
                      <p
                        class="mt-4 text-sm font-semibold text-[var(--atlas-text)]"
                      >
                        {{ uploadState.file ? uploadState.file.name : "选择 PDF、TXT 或 Markdown 文件" }}
                      </p>
                      <p class="mt-2 text-sm text-[var(--atlas-text-muted)]">
                        点击后可选择文件，已选文件也可以继续替换。
                      </p>
                    </div>
                  </div>
                </UFormField>

                <UFormField label="标题" name="title">
                  <UInput
                    v-model="uploadState.title"
                    placeholder="文档标题"
                    class="w-full"
                    size="xl"
                    :ui="{ base: 'bg-white text-[var(--atlas-text)] ring-[var(--atlas-line)]' }"
                  />
                </UFormField>

                <UFormField label="摘要" name="summary">
                  <UTextarea
                    v-model="uploadState.summary"
                    placeholder="填写简短摘要，帮助提升检索质量。"
                    class="w-full"
                    :rows="4"
                    :ui="{ base: 'bg-white text-[var(--atlas-text)] ring-[var(--atlas-line)]' }"
                  />
                </UFormField>

                <UFormField
                  label="标签"
                  name="tags"
                  help="使用逗号分隔多个标签"
                >
                  <UInput
                    v-model="uploadState.tags"
                    icon="i-lucide-tag"
                    placeholder="例如：制度、入职、产品"
                    class="w-full"
                    size="xl"
                    :ui="{ base: 'bg-white text-[var(--atlas-text)] ring-[var(--atlas-line)]' }"
                  />
                </UFormField>

                <UAlert
                  v-if="uploadStatus"
                  color="success"
                  variant="subtle"
                  :title="uploadStatus"
                  icon="i-lucide-check-circle"
                />

                <UAlert
                  v-if="error"
                  color="error"
                  variant="subtle"
                  :title="error"
                  icon="i-lucide-alert-circle"
                />

                <UButton
                  type="submit"
                  :disabled="!uploadState.file || uploading"
                  :loading="uploading"
                  label="上传并建立索引"
                  size="xl"
                  block
                  class="rounded-2xl"
                />
              </form>
            </div>
          </aside>
        </section>
      </template>
    </div>
  </div>
</template>
