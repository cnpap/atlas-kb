#!/usr/bin/env sh
set -eu

cd /app

if [ ! -e public/storage ]; then
  php artisan storage:link >/dev/null 2>&1 || true
fi

exec "$@"
