<script setup lang="ts">
  import type {
    KnowledgeDocument,
    KnowledgeDocumentsData,
    KnowledgeSpace,
  } from "@atlas-kb/schema";
  import { ref, watch } from "vue";
  import { RouterLink, useRoute } from "vue-router";
  import { api, getErrorMessage, unwrapSuccess } from "@/lib/api-client";

  const route = useRoute();
  const loading = ref(true);
  const errorMessage = ref("");
  const space = ref<KnowledgeSpace | null>(null);
  const documents = ref<KnowledgeDocument[]>([]);

  async function loadSpace(spaceId: string) {
    loading.value = true;
    errorMessage.value = "";

    try {
      const response = await api.api.kb.spaces({ spaceId }).documents.get();
      const data = unwrapSuccess<KnowledgeDocumentsData>(response.data);
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

      <div class="list">
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
            <span class="tag">{{ document.updatedAt.slice(0, 10) }}</span>
          </div>

          <p>{{ document.excerpt }}</p>

          <div class="tag-row">
            <span v-for="tag in document.tags" :key="tag" class="tag">
              {{ tag }}
            </span>
          </div>
        </article>
      </div>
    </template>
  </section>
</template>
