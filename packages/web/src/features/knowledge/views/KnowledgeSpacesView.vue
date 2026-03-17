<script setup lang="ts">
  import type { KnowledgeSpace, KnowledgeSpacesData } from "@atlas-kb/schema";
  import { onMounted, ref } from "vue";
  import { RouterLink } from "vue-router";
  import { api, getErrorMessage, unwrapSuccess } from "@/lib/api-client";

  const loading = ref(true);
  const errorMessage = ref("");
  const spaces = ref<KnowledgeSpace[]>([]);

  async function loadSpaces() {
    loading.value = true;
    errorMessage.value = "";

    try {
      const response = await api.api.kb.spaces.get();
      const data = unwrapSuccess<KnowledgeSpacesData>(response.data);
      spaces.value = data.spaces;
    } catch (error) {
      errorMessage.value = getErrorMessage(error);
    } finally {
      loading.value = false;
    }
  }

  onMounted(() => {
    void loadSpaces();
  });
</script>

<template>
  <section class="page">
    <div class="stack">
      <div class="eyebrow">Knowledge spaces</div>
      <h1>Seeded spaces ready for search and ask flows.</h1>
      <p class="lede">
        Each space groups a small set of documents so the API and UI can
        validate routing, list views, retrieval, and grounded citation output.
      </p>
    </div>

    <div v-if="loading" class="status">Loading spaces...</div>
    <div v-else-if="errorMessage" class="status status-error">
      {{ errorMessage }}
    </div>
    <div v-else class="list">
      <article v-for="space in spaces" :key="space.id" class="list-item">
        <div class="list-item-header">
          <div>
            <h2 class="list-item-title">{{ space.name }}</h2>
            <p class="muted">{{ space.description }}</p>
          </div>
          <span class="tag">{{ space.documentCount }} docs</span>
        </div>
        <div class="cta-row">
          <RouterLink class="button button-primary" :to="`/kb/${space.id}`">
            Open space
          </RouterLink>
          <RouterLink
            class="button button-secondary"
            :to="{ path: '/ask', query: { spaceId: space.id } }"
          >
            Ask this space
          </RouterLink>
        </div>
      </article>
    </div>
  </section>
</template>
