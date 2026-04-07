#!/usr/bin/env bash

set -euo pipefail

cd /root/code/atlas-kb-admin

php artisan migrate --force

php artisan serve --host=127.0.0.1 --port=8000 &
server_pid=$!

php artisan queue:work --tries=1 --timeout=120 --sleep=1 &
worker_pid=$!

cleanup() {
  kill "$server_pid" "$worker_pid" >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

wait "$server_pid"
