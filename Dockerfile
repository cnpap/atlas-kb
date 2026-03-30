# syntax=docker/dockerfile:1.10

FROM oven/bun:1 AS deps
WORKDIR /app

COPY .npmrc biome.json bun.lock bunfig.toml package.json tsconfig.json ./
COPY packages/api/package.json ./packages/api/package.json
COPY packages/errors/package.json ./packages/errors/package.json
COPY packages/mastra/package.json ./packages/mastra/package.json
COPY packages/schema/package.json ./packages/schema/package.json
COPY packages/web/package.json ./packages/web/package.json

RUN --mount=type=secret,id=github_token_classic \
  export GITHUB_TOKEN_CLASSIC="$(cat /run/secrets/github_token_classic)" \
  && bun install --frozen-lockfile

FROM deps AS ci-runner
WORKDIR /app

COPY . .

FROM ci-runner AS web-build

ARG VITE_API_BASE_URL=/
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN bun run web:build

FROM ci-runner AS api-build

RUN bun run api:build

FROM oven/bun:1 AS api-runtime
WORKDIR /app

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=8080

COPY --chown=bun:bun --from=api-build /app/packages/api/dist ./dist

RUN mkdir -p /var/lib/atlas-kb && chown bun:bun /var/lib/atlas-kb

USER bun
EXPOSE 8080

CMD ["bun", "dist/server.js"]

FROM api-runtime AS runtime
