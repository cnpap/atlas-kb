<script setup lang="ts">
  import type {
    AskKnowledgeResult,
    KnowledgeSpace,
    KnowledgeSpacesData,
  } from "@atlas-kb/schema";
  import { onMounted, ref } from "vue";
  import { useRoute } from "vue-router";
  import { api, getErrorMessage, unwrapSuccess } from "@/lib/api-client";

  const route = useRoute();

  const loading = ref(false);
  const spacesLoading = ref(true);
  const errorMessage = ref("");
  const question = ref("How should answers cite evidence?");
  const selectedSpaceId = ref("");
  const spaces = ref<KnowledgeSpace[]>([]);
  const result = ref<AskKnowledgeResult | null>(null);

  async function loadSpaces() {
    spacesLoading.value = true;

    try {
      const response = await api.api.kb.spaces.get();
      const data = unwrapSuccess<KnowledgeSpacesData>(response.data);
      spaces.value = data.spaces;

      const querySpaceId = route.query.spaceId;
      if (typeof querySpaceId === "string") {
        selectedSpaceId.value = querySpaceId;
      }
    } catch (error) {
      errorMessage.value = getErrorMessage(error);
    } finally {
      spacesLoading.value = false;
    }
  }

  async function submitQuestion() {
    loading.value = true;
    errorMessage.value = "";

    try {
      const response = await api.api.kb.ask.post({
        question: question.value,
        spaceId: selectedSpaceId.value || undefined,
        limit: 3,
      });
      result.value = unwrapSuccess<AskKnowledgeResult>(response.data);
    } catch (error) {
      result.value = null;
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
    <div class="content-grid">
      <div class="content-main panel">
        <div class="panel-body form-shell">
          <div class="eyebrow">Ask Atlas KB</div>
          <h1>Send a question and inspect the grounded citations.</h1>
          <p class="lede">
            The API will search the seeded documents, return citations, and use
            a model only when an OpenAI key is configured.
          </p>

          <div v-if="spacesLoading" class="status">Loading spaces...</div>

          <div class="field">
            <label for="space-select">Space</label>
            <select id="space-select" v-model="selectedSpaceId" class="select">
              <option value="">All spaces</option>
              <option v-for="space in spaces" :key="space.id" :value="space.id">
                {{ space.name }}
              </option>
            </select>
          </div>

          <div class="field">
            <label for="question-input">Question</label>
            <textarea
              id="question-input"
              v-model="question"
              class="textarea"
              placeholder="Ask a grounded question about the knowledge base"
            />
          </div>

          <div class="cta-row">
            <button
              class="button button-primary"
              type="button"
              @click="submitQuestion"
            >
              {{ loading ? "Running..." : "Ask the KB" }}
            </button>
          </div>

          <div v-if="errorMessage" class="status status-error">
            {{ errorMessage }}
          </div>
        </div>
      </div>

      <aside class="content-side panel panel-strong">
        <div class="panel-body stack">
          <h2>Answer</h2>
          <div v-if="result" class="stack">
            <div class="status">
              <strong>Mode:</strong>
              <span class="mono">{{ result.mode }}</span>
            </div>
            <p class="result-answer">{{ result.answer }}</p>
            <div class="citation-list">
              <article
                v-for="citation in result.citations"
                :key="citation.documentId"
                class="citation"
              >
                <strong>{{ citation.title }}</strong>
                <p class="muted">{{ citation.snippet }}</p>
              </article>
            </div>
          </div>
          <div v-else class="status">
            Submit a question to inspect the answer envelope and citation
            output.
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>
