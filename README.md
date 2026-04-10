# Atlas KB

Atlas KB is a Bun workspace for a multi-user knowledge base with auth, file
upload, workspace search, chat retrieval, and briefing-opinion generation.

The knowledge runtime uses Mastra `Workspace + Workspace Search` together with
`@cnpap/ops-agent-kit` for Docling-backed content proxying and workspace index
maintenance. Search runs with BM25 plus optional Qdrant vector search, and file
imports are processed through the knowledge import job pipeline.

## Packages

- `@atlas-kb/schema`: shared Zod contracts
- `@atlas-kb/errors`: shared API errors
- `@atlas-kb/mastra`: Mastra runtime, workspace indexing, retrieval, chat, briefing export logic
- `@atlas-kb/api`: Elysia API for auth, collections, sources, search, and ask
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

## Runtime Dependencies

- API: `http://localhost:6112`
- Web: `http://localhost:6111`
- Mastra: `http://localhost:4111`
- Postgres: `postgresql://127.0.0.1:15432/atlas_kb_admin`
- Qdrant: `http://127.0.0.1:6333`

## Default Login

- Username: `admin`
- Password: `atlas-kb-dev`

Override them in `.env` with `ATLAS_KB_DEFAULT_USERNAME` and
`ATLAS_KB_DEFAULT_PASSWORD`.

## Model Config

- `OPENAI_BASE_URL`: OpenAI-compatible base URL for chat and briefing generation
- `OPENAI_API_KEY`: provider key for chat and briefing generation
- `OPENAI_MODEL`: defaults to `gpt-5.4`
- `EMBEDDING_BASE_URL`: OpenAI-compatible base URL for embeddings
- `EMBEDDING_API_KEY`: provider key for embeddings
- `EMBEDDING_MODEL`: embedding model id
- `EMBEDDING_DIMENSIONS`: optional fixed embedding dimension
- `QDRANT_URL`: Qdrant endpoint
- `QDRANT_API_KEY`: optional Qdrant API key
- `QDRANT_COLLECTION_PREFIX`: optional prefix for workspace vector collections
- `ATLAS_KB_S3_ENDPOINT`: required S3-compatible endpoint such as RustFS
- `ATLAS_KB_S3_REGION`: required S3 region
- `ATLAS_KB_S3_BUCKET`: required bucket for source files
- `ATLAS_KB_S3_ACCESS_KEY_ID`: required access key used for source mirroring
- `ATLAS_KB_S3_SECRET_ACCESS_KEY`: required secret key used for source mirroring
- `ATLAS_KB_S3_PREFIX`: optional object key prefix, defaults to `knowledge-sources`
- `ATLAS_KB_S3_FORCE_PATH_STYLE`: defaults to `true` for S3-compatible local deployments

Atlas KB now reads these values only from the runtime environment loaded from
project `.env`. If you run RustFS locally, copy its endpoint, bucket, and
credentials into this repo's `.env` before starting API or Mastra.

## Upload Support

Atlas KB stores uploaded sources in the collection workspace filesystem and
indexes them through the knowledge import pipeline. Text-like sources can be
written and indexed immediately, while file uploads can be queued for
background extraction and indexing. Manually entered text sources are also
written to `<prefix>/<userId>/<collectionId>/<sourceId>/content.txt`.
