<script setup lang="ts">
  import type { KnowledgeSpace } from "@atlas-kb/schema";
  import { onMounted, ref } from "vue";
  import { RouterLink } from "vue-router";
  import {
    createKnowledgeSpaceRequest,
    getErrorMessage,
    getKnowledgeSpaces,
  } from "@/lib/api-client";

  const loading = ref(true);
  const creating = ref(false);
  const errorMessage = ref("");
  const createError = ref("");
  const spaces = ref<KnowledgeSpace[]>([]);
  const newSpaceName = ref("");
  const newSpaceDescription = ref("");

  async function loadSpaces() {
    loading.value = true;
    errorMessage.value = "";

    try {
      const data = await getKnowledgeSpaces();
      spaces.value = data.spaces;
    } catch (error) {
      errorMessage.value = getErrorMessage(error);
    } finally {
      loading.value = false;
    }
  }

  async function createSpace() {
    creating.value = true;
    createError.value = "";

    try {
      await createKnowledgeSpaceRequest({
        name: newSpaceName.value,
        description: newSpaceDescription.value,
      });
      newSpaceName.value = "";
      newSpaceDescription.value = "";
      await loadSpaces();
    } catch (error) {
      createError.value = getErrorMessage(error);
    } finally {
      creating.value = false;
    }
  }

  onMounted(() => {
    void loadSpaces();
  });
</script>

<template>
  <section class="page">
    <div class="content-grid">
      <div class="content-main stack">
        <div class="stack">
          <div class="eyebrow">Knowledge spaces</div>
          <h1>Organize the workspace into searchable spaces.</h1>
          <p class="lede">
            Each space owns its uploaded files, document list, and ask flow.
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
      </div>

      <aside class="content-side panel panel-strong">
        <div class="panel-body form-shell">
          <h2>Create a space</h2>

          <div class="field">
            <label for="space-name">Name</label>
            <input
              id="space-name"
              v-model="newSpaceName"
              class="input"
              type="text"
            >
          </div>

          <div class="field">
            <label for="space-description">Description</label>
            <textarea
              id="space-description"
              v-model="newSpaceDescription"
              class="textarea textarea-compact"
            />
          </div>

          <div class="cta-row">
            <button
              class="button button-primary"
              type="button"
              @click="createSpace"
            >
              {{ creating ? "Creating..." : "Create space" }}
            </button>
          </div>

          <div v-if="createError" class="status status-error">
            {{ createError }}
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>
