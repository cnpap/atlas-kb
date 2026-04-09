FROM public.ecr.aws/docker/library/debian:bookworm-slim AS bun-base
ARG BUN_VERSION=1.3.10
WORKDIR /app

ENV BUN_INSTALL=/opt/bun
ENV PATH=${BUN_INSTALL}/bin:${PATH}

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    unzip \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL https://bun.sh/install | bash -s -- bun-v${BUN_VERSION} \
  && groupadd --system bun \
  && useradd --system --gid bun --create-home --home-dir /home/bun bun \
  && ln -s ${BUN_INSTALL}/bin/bun /usr/local/bin/bun

FROM bun-base AS deps
WORKDIR /app

ENV BUN_INSTALL_CACHE_DIR=/root/.bun/install/cache

COPY .npmrc biome.json bun.lock bunfig.toml package.json tsconfig.json ./
COPY packages/api/package.json ./packages/api/package.json
COPY packages/errors/package.json ./packages/errors/package.json
COPY packages/mastra/package.json ./packages/mastra/package.json
COPY packages/schema/package.json ./packages/schema/package.json
COPY packages/web/package.json ./packages/web/package.json

RUN --mount=type=cache,id=atlas-kb-bun-cache,target=/root/.bun/install/cache \
  --mount=type=secret,id=github_token_classic,required=false \
  if [ -f /run/secrets/github_token_classic ]; then \
    export GITHUB_TOKEN_CLASSIC="$(cat /run/secrets/github_token_classic)"; \
  fi \
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

FROM bun-base AS api-runtime
WORKDIR /app

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=6112
ENV BUN_INSTALL_CACHE_DIR=/var/lib/atlas-kb/bun-install-cache

COPY --chown=bun:bun --from=api-build /app/packages/api/dist ./dist

RUN mkdir -p /var/lib/atlas-kb/bun-install-cache \
  && chown -R bun:bun /var/lib/atlas-kb

USER bun
EXPOSE 6112

CMD ["bun", "dist/server.js"]

FROM public.ecr.aws/docker/library/caddy:2-alpine AS web-runtime

COPY deploy/caddy/web.Caddyfile /etc/caddy/Caddyfile
COPY --from=web-build /app/packages/web/dist /srv

EXPOSE 80

FROM api-runtime AS runtime
