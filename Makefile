.PHONY: build format format-js format-php lint lint-check lint-js lint-js-check lint-php lint-php-check test verify

BIOME=./node_modules/.bin/biome
PINT=./vendor/bin/pint
BIOME_PATHS=resources/js resources/css vite.config.js package.json biome.json

build:
	bun run build

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

test: build
	php artisan test --compact

verify: lint-check test
