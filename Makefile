SHELL := /bin/bash

.PHONY: build up down restart logs ps health deploy update ensure-network env-check

ENV_FILE ?= .env.deploy
COMPOSE_FILE ?= compose.yaml

define compose_cmd
docker compose --env-file $(ENV_FILE) -f $(COMPOSE_FILE)
endef

env-check:
	@test -f "$(ENV_FILE)" || { echo "Missing $(ENV_FILE). Copy .env.deploy.example first." >&2; exit 1; }

ensure-network: env-check
	@source "$(ENV_FILE)"; \
	network_name="$${ATLAS_KB_DOCKER_NETWORK:-atlas-app-network}"; \
	docker network inspect "$$network_name" >/dev/null 2>&1 || docker network create "$$network_name" >/dev/null

build: env-check
	@source "$(ENV_FILE)"; \
	secret_args=(); \
	if [ -n "$${GITHUB_TOKEN_CLASSIC:-}" ]; then \
		secret_args+=(--secret id=github_token_classic,env=GITHUB_TOKEN_CLASSIC); \
	fi; \
	DOCKER_BUILDKIT=1 docker build "$${secret_args[@]}" --target api-runtime -t "$${ATLAS_KB_API_IMAGE}" .; \
	DOCKER_BUILDKIT=1 docker build "$${secret_args[@]}" --target web-runtime --build-arg VITE_API_BASE_URL="$${VITE_API_BASE_URL:-/}" -t "$${ATLAS_KB_WEB_IMAGE}" .

up: env-check ensure-network
	@$(compose_cmd) up -d --remove-orphans

down: env-check
	@$(compose_cmd) down --remove-orphans

restart: env-check
	@$(compose_cmd) restart

logs: env-check
	@$(compose_cmd) logs -f

ps: env-check
	@$(compose_cmd) ps

health: env-check
	@source "$(ENV_FILE)"; \
	api_url="http://127.0.0.1:$${ATLAS_KB_API_HOST_PORT:-6112}/api/health"; \
	web_url="http://127.0.0.1:$${ATLAS_KB_WEB_HOST_PORT:-6111}"; \
	for attempt in $$(seq 1 20); do \
		if curl -fsS "$$api_url" >/dev/null && curl -fsS "$$web_url" >/dev/null; then \
			exit 0; \
		fi; \
		sleep 2; \
	done; \
	echo "Atlas KB health check failed: $$api_url or $$web_url did not become ready" >&2; \
	exit 1

deploy: build up health

update: build ensure-network
	@$(compose_cmd) up -d --force-recreate --remove-orphans
	@$(MAKE) health ENV_FILE="$(ENV_FILE)" COMPOSE_FILE="$(COMPOSE_FILE)"
