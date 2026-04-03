# Atlas KB

Atlas KB is a Bun workspace for a multi-user knowledge-base project with auth,
file upload, chat retrieval, and briefing-opinion generation backed by
`@cnpap/ops-agent-kit`.

## Packages

- `@atlas-kb/schema`: shared Zod contracts
- `@atlas-kb/errors`: shared API errors
- `@atlas-kb/mastra`: Mastra runtime, `ops-agent-kit` integration, ingestion, retrieval, chat, and briefing export logic
- `@atlas-kb/api`: Elysia API for auth, spaces, uploads, search, and ask
- `@atlas-kb/web`: Vue web console for login and knowledge management

## Quick Start

```bash
cp .env.example .env
bun install
bun run compose:up
bun run dev
```

If you need the Mastra runtime separately:

```bash
bun run mastra:dev
```

To bring up the shared TimescaleDB + RustFS + Tika stack and the app in one command:

```bash
bun run dev:local
```

## Runtime Dependencies

- API: `http://localhost:6112`
- Web: `http://localhost:6111`
- Tika: `http://localhost:9998`
- RustFS S3: `http://localhost:9000`
- TimescaleDB: `postgresql://127.0.0.1:5432/ops_agent_kit`

If `own209.test` resolves to your machine locally, the dev web server also accepts
`http://own209.test:6111`. By default, Vite proxies `/api/*` to the local API, so
the browser stays on one origin during development. Set `VITE_API_BASE_URL` only
when you intentionally want the web app to call a different API origin directly.

## Deployment

- `Jenkinsfile` lives in the repository root and is the single source of truth for CI/CD.
- The runtime image contains the backend only; the web build is published separately to RustFS.
- Caddy serves `atlas-kb.apitype.com` as a single-domain entrypoint:
  `/api/*` is proxied to the `atlas-kb` container and all other paths are served from the public `atlas-kb-web` bucket in RustFS.
- `atlas-kb-api.apitype.com` is no longer required for normal traffic.

## Default Login

The shared Laravel migration and seed flow in `atlas-kb-admin` is responsible for
initializing the default knowledge login in the shared database.

- Username: `admin`
- Password: `atlas-kb-dev`

Override them in `.env` with `ATLAS_KB_DEFAULT_USERNAME` and
`ATLAS_KB_DEFAULT_PASSWORD` for anything beyond local development.

Atlas KB reads infrastructure values from `.env` and expects the shared services in
`/root/docker/compose.yml`.

Use a dedicated `LANCEDB_URI` scope for Atlas, for example
`s3://ops-agent-kit/lancedb/atlas-kb`, instead of pointing at a shared root that
already contains other knowledge indexes. This keeps the two `ops-agent-kit`
tables isolated while still using the same Lance/S3 backend.

## Model Config

- `OPENAI_BASE_URL`: OpenAI-compatible base URL, default `https://api.openai.com/v1`
- `OPENAI_API_KEY`: provider key used for chat and task generation
- `OPENAI_MODEL`: defaults to `gpt-5.4`
- `EMBEDDING_*`: embedding model configuration consumed by `ops-agent-kit`
- `RERANK_*`: rerank model configuration consumed by `ops-agent-kit`
- `VISION_*`: multimodal model configuration for rich document tasks

## Upload Support

The current ingestion path accepts file and text uploads. File parsing is handled
through Tika, and the indexed knowledge core lives in LanceDB + S3 via
`@cnpap/ops-agent-kit`.
