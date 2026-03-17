# Atlas KB Project Conventions

## Directory Layout

```txt
atlas-kb/
├── packages/
│   ├── mastra/                     # Mastra runtime + knowledge logic
│   │   ├── src/
│   │   │   ├── agents/
│   │   │   ├── knowledge/
│   │   │   ├── mastra/
│   │   │   ├── memory/
│   │   │   ├── models/
│   │   │   ├── routes/
│   │   │   ├── tools/
│   │   │   └── index.ts
│   │   └── package.json
│   ├── api/                        # Elysia API package
│   ├── web/                        # Vue web package
│   ├── schema/                     # Shared Zod schemas
│   └── errors/                     # Shared API error classes
├── package.json
├── tsconfig.json
├── biome.json
└── .env
```

## Command Rules

1. Executable project logic should live inside the relevant package.
2. Root `package.json` scripts are dispatchers only and should forward into a package with `bun run --filter`.
3. Commands that depend on environment variables should prefer `bun --env-file=.env`.

## Schema Rules

All Zod schemas must live in `@atlas-kb/schema`.

```ts
// Good
import { SearchKnowledgeRequestSchema, type SearchKnowledgeRequest } from "@atlas-kb/schema";

// Not allowed
import { z } from "zod/v4";
const SearchKnowledgeRequestSchema = z.object({});
```

Derived schemas should also start from shared schema exports.

## Dependency Rules

Use root `overrides` to keep shared dependency versions aligned. Package manifests should reference shared dependencies with `"*"` when they inherit the root version.

## Package Management

Use Bun for dependency management.

```bash
bun add <package>                         # add a shared dependency at the root
bun add -d <package>                      # add a shared dev dependency at the root
bun add <package> --filter @atlas-kb/<pkg>    # add a runtime dependency to one package
bun add -d <package> --filter @atlas-kb/<pkg> # add a dev dependency to one package
```

Rules:

1. Do not edit dependency versions by hand if `bun add` can express the change.
2. Shared dependencies that appear in multiple packages should be pinned in the root `package.json` `overrides`.
3. Package-local dependencies should be installed with `--filter @atlas-kb/<pkg>`.
4. Run `bun install` after manifest changes to refresh `bun.lock`.

## Engineering Rules

1. Keep TypeScript strict and avoid `any`.
2. Keep API contracts in `@atlas-kb/schema`.
3. Prefer code that is easy to unit test.

## Frontend API Rule

Frontend code must call backend interfaces through `packages/web/src/lib/api-client.ts`.
