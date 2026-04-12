FROM public.ecr.aws/docker/library/php:8.4-cli-bookworm AS php-base

ENV COMPOSER_ALLOW_SUPERUSER=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    $PHPIZE_DEPS \
    curl \
    git \
    libicu-dev \
    libonig-dev \
    libpq-dev \
    libssl-dev \
    libxml2-dev \
    libzip-dev \
    unzip \
    zlib1g-dev \
  && docker-php-ext-install sockets \
  && pecl install -D 'enable-sockets="yes" enable-openssl="yes" enable-http2="yes"' openswoole \
  && docker-php-ext-enable openswoole \
  && docker-php-ext-install \
    bcmath \
    dom \
    intl \
    mbstring \
    opcache \
    pcntl \
    pdo_pgsql \
    pgsql \
    zip \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL https://getcomposer.org/installer -o /tmp/composer-setup.php \
  && php /tmp/composer-setup.php --install-dir=/usr/local/bin --filename=composer \
  && rm -f /tmp/composer-setup.php

WORKDIR /app

FROM php-base AS vendor

ENV APP_ENV=production
ENV CACHE_STORE=array
ENV DB_CONNECTION=sqlite
ENV DB_DATABASE=/app/database/database.sqlite
ENV QUEUE_CONNECTION=sync
ENV SESSION_DRIVER=array

RUN mv /usr/local/etc/php/conf.d/docker-php-ext-openswoole.ini /usr/local/etc/php/conf.d/zz-docker-php-ext-openswoole.ini

COPY composer.json composer.lock ./

RUN composer install \
  --no-dev \
  --no-interaction \
  --no-progress \
  --no-scripts \
  --optimize-autoloader \
  --prefer-dist

COPY . .

RUN mkdir -p \
    bootstrap/cache \
    storage/framework/cache/data \
    storage/framework/sessions \
    storage/framework/views \
    storage/logs \
  && touch storage/logs/laravel.log \
  && rm -f bootstrap/cache/*.php \
  && export APP_KEY=base64:MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA= \
  && php artisan package:discover --ansi \
  && php artisan filament:upgrade --ansi

FROM public.ecr.aws/docker/library/debian:bookworm-slim AS frontend-build
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
  && ln -s ${BUN_INSTALL}/bin/bun /usr/local/bin/bun

COPY package.json bun.lock vite.config.js ./

RUN --mount=type=cache,id=atlas-kb-admin-bun-cache,target=/root/.bun/install/cache \
  bun install --frozen-lockfile

COPY . .
COPY --from=vendor /app/vendor /app/vendor

RUN bun run build

FROM php-base AS runtime

ENV APP_ENV=production
ENV APP_DEBUG=false
ENV APP_SERVER_HOST=0.0.0.0
ENV APP_SERVER_PORT=8000
ENV OCTANE_SERVER=swoole
ENV OCTANE_HOST=0.0.0.0
ENV OCTANE_PORT=8000

RUN mv /usr/local/etc/php/conf.d/docker-php-ext-openswoole.ini /usr/local/etc/php/conf.d/zz-docker-php-ext-openswoole.ini

COPY --from=vendor /app /app
COPY --from=frontend-build /app/public/build /app/public/build
COPY docker/entrypoint.sh /usr/local/bin/atlas-kb-admin-entrypoint

RUN chmod +x /usr/local/bin/atlas-kb-admin-entrypoint \
  && chown -R www-data:www-data /app

USER www-data

EXPOSE 8000

ENTRYPOINT ["atlas-kb-admin-entrypoint"]
CMD ["octane-web"]
