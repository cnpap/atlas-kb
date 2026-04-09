.PHONY: build app-build up down restart logs ps health deploy update bootstrap migrate seed ensure-network env-check format format-js format-php lint lint-check lint-js lint-js-check lint-php lint-php-check test verify

SHELL := /bin/bash

ENV_FILE ?= .env.deploy
COMPOSE_FILE ?= compose.yaml
BIOME=./node_modules/.bin/biome
PINT=./vendor/bin/pint
BIOME_PATHS=resources/js resources/css vite.config.js package.json biome.json

define compose_cmd
docker compose --env-file $(ENV_FILE) -f $(COMPOSE_FILE)
endef

env-check:
	@test -f "$(ENV_FILE)" || { echo "Missing $(ENV_FILE). Copy .env.deploy.example first." >&2; exit 1; }
	@source "$(ENV_FILE)"; \
	required_vars=(ATLAS_KB_ADMIN_IMAGE APP_KEY DB_HOST DB_PORT DB_DATABASE DB_USERNAME DB_PASSWORD ATLAS_KB_INTERNAL_SECRET ATLAS_KB_PUBLIC_API_BASE_URL); \
	missing=(); \
	for var in "$${required_vars[@]}"; do \
		if [ -z "$${!var:-}" ]; then \
			missing+=("$$var"); \
		fi; \
	done; \
	octane_server="$${OCTANE_SERVER:-swoole}"; \
	if [ "$$octane_server" != "swoole" ]; then \
		echo "OCTANE_SERVER must be swoole in $(ENV_FILE), got: $$octane_server" >&2; \
		exit 1; \
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
	DOCKER_BUILDKIT=1 docker build -t "$${ATLAS_KB_ADMIN_IMAGE}" .

app-build:
	bun run build

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
	health_port="$${ATLAS_KB_ADMIN_HOST_PORT:-$${OCTANE_PORT:-8000}}"; \
	health_url="http://127.0.0.1:$$health_port/up"; \
	for attempt in $$(seq 1 30); do \
		if $(compose_cmd) exec -T web sh -lc 'php -m | grep -qi "^openswoole$$"' >/dev/null 2>&1 && curl -fsS "$$health_url" >/dev/null; then \
			exit 0; \
		fi; \
		sleep 2; \
	done; \
	echo "Atlas KB Admin health check failed: Octane/OpenSwoole web service did not become ready at $$health_url" >&2; \
	exit 1

deploy: build migrate
	@$(compose_cmd) up -d --force-recreate --remove-orphans
	@$(MAKE) health ENV_FILE="$(ENV_FILE)" COMPOSE_FILE="$(COMPOSE_FILE)"

update: deploy

bootstrap: build migrate seed
	@$(compose_cmd) up -d --force-recreate --remove-orphans
	@$(MAKE) health ENV_FILE="$(ENV_FILE)" COMPOSE_FILE="$(COMPOSE_FILE)"

migrate: env-check ensure-network
	@$(compose_cmd) run --rm web php artisan migrate --force

seed: env-check ensure-network
	@$(compose_cmd) run --rm web php artisan db:seed --force

format: format-php format-js

format-js:
	$(BIOME) check --write $(BIOME_PATHS)

format-php:
	$(PINT)

lint: lint-php lint-js

lint-js:
	$(BIOME) check --write $(BIOME_PATHS)

lint-js-check:
	$(BIOME) check $(BIOME_PATHS)

lint-check: lint-php-check lint-js-check

lint-php:
	$(PINT)

lint-php-check:
	$(PINT) --test

test: app-build
	php artisan test --compact

verify: lint-check test
