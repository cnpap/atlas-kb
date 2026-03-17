<script setup lang="ts">
  import type { KnowledgeDocument, KnowledgeSpace } from "@atlas-kb/schema";
  import { ref, watch } from "vue";
  import { RouterLink, useRoute } from "vue-router";
  import {
    downloadKnowledgeDocumentRequest,
    getErrorMessage,
    getKnowledgeDocumentDownloadUrl,
    getKnowledgeDocuments,
    uploadKnowledgeDocumentRequest,
  } from "@/lib/api-client";

  const route = useRoute();
  const loading = ref(true);
  const uploading = ref(false);
  const downloadingDocumentId = ref("");
  const errorMessage = ref("");
  const downloadError = ref("");
  const uploadError = ref("");
  const uploadStatus = ref("");
  const uploadTitle = ref("");
  const uploadSummary = ref("");
  const uploadTags = ref("");
  const uploadFile = ref<File | null>(null);
  const space = ref<KnowledgeSpace | null>(null);
  const documents = ref<KnowledgeDocument[]>([]);

  async function loadSpace(spaceId: string) {
    loading.value = true;
    errorMessage.value = "";

    try {
      const data = await getKnowledgeDocuments(spaceId);
      space.value = data.space;
      documents.value = data.documents;
    } catch (error) {
      space.value = null;
      documents.value = [];
      errorMessage.value = getErrorMessage(error);
    } finally {
      loading.value = false;
    }
  }

  function onFileSelected(event: Event) {
    const target = event.target as HTMLInputElement;
    uploadFile.value = target.files?.[0] ?? null;
  }

  async function uploadDocument() {
    if (!space.value) {
      return;
    }

    if (!uploadFile.value) {
      uploadError.value = "Choose a file before uploading";
      return;
    }

    uploading.value = true;
    uploadError.value = "";
    uploadStatus.value = "";

    try {
      const result = await uploadKnowledgeDocumentRequest({
        file: uploadFile.value,
        spaceId: space.value.id,
        summary: uploadSummary.value || undefined,
        tags: uploadTags.value || undefined,
        title: uploadTitle.value || undefined,
      });

      uploadTitle.value = "";
      uploadSummary.value = "";
      uploadTags.value = "";
      uploadFile.value = null;
      uploadStatus.value = result.indexed
        ? "File uploaded and indexed into Qdrant."
        : "File uploaded. Vector indexing is unavailable, so lexical search stays active.";
      await loadSpace(space.value.id);
    } catch (error) {
      uploadError.value = getErrorMessage(error);
    } finally {
      uploading.value = false;
    }
  }

  function canDownloadDocument(document: KnowledgeDocument) {
    return document.source === "upload";
  }

  async function downloadDocument(document: KnowledgeDocument) {
    if (!canDownloadDocument(document)) {
      return;
    }

    downloadingDocumentId.value = document.id;
    downloadError.value = "";

    try {
      await downloadKnowledgeDocumentRequest({
        downloadUrl: getKnowledgeDocumentDownloadUrl({
          documentId: document.id,
          spaceId: document.spaceId,
        }),
        filename: document.sourceFilename,
      });
    } catch (error) {
      downloadError.value = getErrorMessage(error);
    } finally {
      downloadingDocumentId.value = "";
    }
  }

  watch(
    () => route.params.spaceId,
    (spaceId) => {
      const resolvedSpaceId =
        typeof spaceId === "string"
          ? spaceId
          : Array.isArray(spaceId)
            ? spaceId[0]
            : "";

      if (!resolvedSpaceId) {
        errorMessage.value = "Missing space id";
        loading.value = false;
        return;
      }

      void loadSpace(resolvedSpaceId);
    },
    { immediate: true },
  );
</script>

<template>
  <section class="page">
    <div v-if="loading" class="status">Loading documents...</div>
    <div v-else-if="errorMessage" class="status status-error">
      {{ errorMessage }}
    </div>
    <template v-else-if="space">
      <div class="stack">
        <div class="eyebrow">Knowledge detail</div>
        <h1>{{ space.name }}</h1>
        <p class="lede">{{ space.description }}</p>
        <div class="cta-row">
          <RouterLink class="button button-secondary" to="/kb">
            Back to spaces
          </RouterLink>
          <RouterLink
            class="button button-primary"
            :to="{ path: '/ask', query: { spaceId: space.id } }"
          >
            Ask this space
          </RouterLink>
        </div>
      </div>

      <div class="content-grid">
        <div class="content-main list">
          <div v-if="downloadError" class="status status-error">
            {{ downloadError }}
          </div>
          <article
            v-for="document in documents"
            :key="document.id"
            class="list-item"
          >
            <div class="list-item-header">
              <div>
                <h2 class="list-item-title">{{ document.title }}</h2>
                <p class="muted">{{ document.summary }}</p>
              </div>
              <span class="tag">{{ document.source }}</span>
            </div>

            <p>{{ document.excerpt }}</p>

            <div class="meta-row">
              <span class="muted">
                {{ document.sourceFilename ?? "Inline document" }}
              </span>
              <span class="muted">{{ document.updatedAt.slice(0, 10) }}</span>
            </div>

            <div
              v-if="canDownloadDocument(document)"
              class="cta-row cta-row-tight"
            >
              <button
                class="button button-secondary"
                type="button"
                @click="downloadDocument(document)"
              >
                {{ downloadingDocumentId === document.id
                    ? "Downloading..."
                    : "Download original file" }}
              </button>
            </div>

            <div class="tag-row">
              <span v-for="tag in document.tags" :key="tag" class="tag">
                {{ tag }}
              </span>
            </div>
          </article>
        </div>

        <aside class="content-side panel panel-strong">
          <div class="panel-body form-shell">
            <h2>Upload a file</h2>

            <div class="field">
              <label for="upload-file">File</label>
              <input
                id="upload-file"
                class="input"
                type="file"
                @change="onFileSelected"
              >
            </div>

            <div class="field">
              <label for="upload-title">Title</label>
              <input
                id="upload-title"
                v-model="uploadTitle"
                class="input"
                type="text"
              >
            </div>

            <div class="field">
              <label for="upload-summary">Summary</label>
              <textarea
                id="upload-summary"
                v-model="uploadSummary"
                class="textarea textarea-compact"
              />
            </div>

            <div class="field">
              <label for="upload-tags">Tags</label>
              <input
                id="upload-tags"
                v-model="uploadTags"
                class="input"
                type="text"
                placeholder="operations, incident, runbook"
              >
            </div>

            <div class="cta-row">
              <button
                class="button button-primary"
                type="button"
                @click="uploadDocument"
              >
                {{ uploading ? "Uploading..." : "Upload document" }}
              </button>
            </div>

            <div v-if="uploadStatus" class="status">{{ uploadStatus }}</div>
            <div v-if="uploadError" class="status status-error">
              {{ uploadError }}
            </div>
          </div>
        </aside>
      </div>
    </template>
  </section>
</template>
