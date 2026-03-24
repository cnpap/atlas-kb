# Atlas KB

Atlas KB is a Bun workspace for a local-first knowledge-base project with auth,
file upload, and optional Qdrant vector retrieval.

## Packages

- `@atlas-kb/schema`: shared Zod contracts
- `@atlas-kb/errors`: shared API errors
- `@atlas-kb/mastra`: Mastra runtime, ingestion, retrieval, and answer logic
- `@atlas-kb/api`: Elysia API for auth, spaces, uploads, search, and ask
- `@atlas-kb/web`: Vue web console for login and knowledge management

## Quick Start

```bash
cp .env.example .env
bun install
docker compose up -d qdrant
bun run dev
```

If you need the Mastra runtime separately:

```bash
bun run mastra:dev
```

## Default URLs

- API: `http://localhost:6112`
- Web: `http://localhost:6111`
- Qdrant: `http://localhost:6333`

## Default Login

- Email: `admin@atlas-kb.local`
- Password: `atlas-kb-dev`

Override them in `.env` for anything beyond local development.

## OpenAI Config

- `OPENAI_BASE_URL`: OpenAI-compatible base URL, default `https://api.openai.com/v1`
- `OPENAI_API_KEY`: provider key used for ask
- `OPENAI_MODEL`: defaults to `gpt-5.4`

## Embedding Config

- `DASHSCOPE_API_KEY`: preferred provider key for embeddings
- `DASHSCOPE_BASE_URL`: defaults to `https://dashscope.aliyuncs.com/compatible-mode/v1`
- `DASHSCOPE_EMBEDDING_MODEL`: defaults to `text-embedding-v4`

If `DASHSCOPE_API_KEY` is absent, embeddings fall back to the OpenAI embedding config.

## Upload Support

The current ingestion path accepts text-like files: plain text, markdown, HTML,
JSON, CSV, XML, and YAML.
