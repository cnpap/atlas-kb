<script setup lang="ts">
  import { RouterLink } from "vue-router";
</script>

<template>
  <section class="page">
    <div class="hero-grid">
      <div class="hero-copy stack">
        <div class="eyebrow">Seeded workspace for grounded answers</div>
        <h1>Atlas KB turns a small workspace into a usable knowledge base.</h1>
        <p class="lede">
          This starter keeps the shape of the original `chunks-ai` workspace but
          trims it to the pieces a knowledge project needs first: schemas,
          retrieval logic, a typed API, and a web console.
        </p>
        <div class="cta-row">
          <RouterLink class="button button-primary" to="/kb">
            Browse spaces
          </RouterLink>
          <RouterLink class="button button-secondary" to="/ask">
            Ask the knowledge base
          </RouterLink>
        </div>
      </div>

      <aside class="hero-panel panel panel-strong">
        <div class="panel-body metric-strip">
          <div class="metric">
            <span class="metric-label">Workspace</span>
            <span class="metric-value mono">bun + mastra + elysia + vue</span>
          </div>
          <div class="metric">
            <span class="metric-label">Knowledge Seed</span>
            <span class="metric-value">2 spaces / 4 documents</span>
          </div>
          <div class="metric">
            <span class="metric-label">Ask Fallback</span>
            <span class="metric-value"
              >Grounded mock answer if no model key</span
            >
          </div>
        </div>
      </aside>
    </div>

    <div class="content-grid">
      <div class="content-main card-grid">
        <article class="card">
          <h2>What ships in v1</h2>
          <p>
            Shared Zod schemas, API error handling, seeded spaces and documents,
            simple ranking search, an ask endpoint with citations, and a thin
            web client that only talks through the typed API client.
          </p>
        </article>

        <article class="card">
          <h2>What stays out for now</h2>
          <p>
            No file upload, no auth, no vector database, and no background
            indexing. The project is meant to be runnable immediately and
            extensible later.
          </p>
        </article>
      </div>

      <aside class="content-side card-grid">
        <article class="card">
          <h3>Suggested next moves</h3>
          <p>
            Replace the seeded document list with your ingestion source, keep
            the shared schema package as the contract boundary, and swap the
            search helper for vector retrieval only when the corpus justifies
            it.
          </p>
        </article>
      </aside>
    </div>
  </section>
</template>
