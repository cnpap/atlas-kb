# Atlas KB

Atlas KB is a minimal Bun workspace for a seeded knowledge-base project.

## Packages

- `@atlas-kb/schema`: shared Zod contracts
- `@atlas-kb/errors`: shared API errors
- `@atlas-kb/mastra`: Mastra runtime, knowledge search, and answer logic
- `@atlas-kb/api`: Elysia API for spaces, documents, search, and ask
- `@atlas-kb/web`: Vue web console

## Quick Start

```bash
cp .env.example .env
bun install
bun run api:dev
bun run web:dev
bun run dev
```

Mastra runtime can be started separately:

```bash
bun run dev
```

## Default URLs

- API: `http://localhost:3001`
- Web: `http://localhost:5173`
