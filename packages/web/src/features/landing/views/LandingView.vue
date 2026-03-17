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
            <span class="metric-label">Access</span>
            <span class="metric-value">JWT auth + protected KB routes</span>
          </div>
          <div class="metric">
            <span class="metric-label">Retrieval</span>
            <span class="metric-value"
              >Qdrant vectors with lexical fallback</span
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
            Shared Zod schemas, login, protected knowledge routes, space
            creation, file upload, persisted documents, Qdrant-backed vector
            search, and grounded ask responses with citations.
          </p>
        </article>

        <article class="card">
          <h2>Current upload focus</h2>
          <p>
            The ingestion path currently targets text-like documents such as
            plain text, markdown, HTML, JSON, CSV, XML, and YAML so the vector
            index stays predictable in local development.
          </p>
        </article>
      </div>

      <aside class="content-side card-grid">
        <article class="card">
          <h3>Suggested next moves</h3>
          <p>
            Add richer parsers for PDF or Office files if your corpus needs
            them, keep the shared schema package as the contract boundary, and
            extend the management model beyond the default admin session.
          </p>
        </article>
      </aside>
    </div>
  </section>
</template>
