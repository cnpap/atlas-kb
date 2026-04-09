SHELL := /bin/bash

.PHONY: build up down restart logs ps health deploy update ensure-network env-check

ENV_FILE ?= .env.deploy
COMPOSE_FILE ?= compose.yaml

define compose_cmd
docker compose --env-file $(ENV_FILE) -f $(COMPOSE_FILE)
endef

env-check:
	@test -f "$(ENV_FILE)" || { echo "Missing $(ENV_FILE). Copy .env.deploy.example first." >&2; exit 1; }
	@source "$(ENV_FILE)"; \
	required_vars=(ATLAS_KB_API_IMAGE ATLAS_KB_WEB_IMAGE ATLAS_KB_DEFAULT_USERNAME ATLAS_KB_DEFAULT_PASSWORD ATLAS_KB_JWT_SECRET ATLAS_KB_INTERNAL_SECRET ATLAS_KB_ADMIN_API_BASE_URL DATABASE_URL); \
	missing=(); \
	for var in "$${required_vars[@]}"; do \
		if [ -z "$${!var:-}" ]; then \
			missing+=("$$var"); \
		fi; \
	done; \
	runtime_provider="$${RUNTIME_PROVIDER:-openai}"; \
	case "$$runtime_provider" in \
		openai) \
			if [ -z "$${OPENAI_API_KEY:-}" ]; then \
				missing+=("OPENAI_API_KEY"); \
			fi; \
			;; \
		alibaba-cn) \
			if [ -z "$${DASHSCOPE_API_KEY:-}" ]; then \
				missing+=("DASHSCOPE_API_KEY"); \
			fi; \
			if [ -z "$${RUNTIME_MODEL:-}" ]; then \
				missing+=("RUNTIME_MODEL"); \
			fi; \
			;; \
	esac; \
	if [ -n "$${EMBEDDING_BASE_URL:-}$${EMBEDDING_MODEL:-}" ] && [ -z "$${EMBEDDING_API_KEY:-}" ]; then \
		missing+=("EMBEDDING_API_KEY"); \
	fi; \
	if [ "$${#missing[@]}" -gt 0 ]; then \
		echo "Missing required variables in $(ENV_FILE): $${missing[*]}" >&2; \
		exit 1; \
	fi

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
	for attempt in $$(seq 1 30); do \
		if curl -fsS "$$api_url" >/dev/null \
			&& curl -fsS "$$web_url" >/dev/null \
			&& $(compose_cmd) exec -T api bun -e 'const base = "http://127.0.0.1:" + (process.env.API_PORT || "6112"); const username = process.env.ATLAS_KB_DEFAULT_USERNAME; const password = process.env.ATLAS_KB_DEFAULT_PASSWORD; if (!username || !password) { throw new Error("missing default credentials"); } const login = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ username, password }) }); if (!login.ok) { throw new Error("login smoke failed: " + login.status + " " + (await login.text())); } const loginPayload = await login.json(); const token = loginPayload?.data?.token; if (!token) { throw new Error("login smoke missing token"); } const templates = await fetch(base + "/api/kb/templates", { headers: { Authorization: "Bearer " + token, Accept: "application/json" } }); if (!templates.ok) { throw new Error("template smoke failed: " + templates.status + " " + (await templates.text())); }' >/dev/null 2>&1; then \
			exit 0; \
		fi; \
		sleep 2; \
	done; \
	echo "Atlas KB health check failed: API/web readiness or authenticated template smoke did not pass" >&2; \
	exit 1

deploy: build ensure-network
	@$(compose_cmd) up -d --force-recreate --remove-orphans
	@$(MAKE) health ENV_FILE="$(ENV_FILE)" COMPOSE_FILE="$(COMPOSE_FILE)"

update: build ensure-network
	@$(compose_cmd) up -d --force-recreate --remove-orphans
	@$(MAKE) health ENV_FILE="$(ENV_FILE)" COMPOSE_FILE="$(COMPOSE_FILE)"
