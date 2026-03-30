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
  && bun install --production --frozen-lockfile

FROM deps AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=8080

COPY --chown=bun:bun --from=deps /app/node_modules ./node_modules
COPY --chown=bun:bun --from=deps /app/package.json ./package.json
COPY --chown=bun:bun --from=deps /app/tsconfig.json ./tsconfig.json
COPY --chown=bun:bun --from=deps /app/bunfig.toml ./bunfig.toml
COPY --chown=bun:bun --from=deps /app/bun.lock ./bun.lock
COPY --chown=bun:bun ./packages/api ./packages/api
COPY --chown=bun:bun ./packages/errors ./packages/errors
COPY --chown=bun:bun ./packages/mastra ./packages/mastra
COPY --chown=bun:bun ./packages/schema ./packages/schema

RUN mkdir -p /var/lib/atlas-kb && chown bun:bun /var/lib/atlas-kb

USER bun
EXPOSE 8080

CMD ["bun", "run", "--filter", "@atlas-kb/api", "start"]
