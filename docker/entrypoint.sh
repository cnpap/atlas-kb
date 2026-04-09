#!/usr/bin/env sh
set -eu

cd /app

if [ ! -e public/storage ]; then
  php artisan storage:link >/dev/null 2>&1 || true
fi

if [ "${1:-}" = "octane-web" ]; then
  set -- php artisan octane:start \
    --server="${OCTANE_SERVER:-swoole}" \
    --host="${OCTANE_HOST:-0.0.0.0}" \
    --port="${OCTANE_PORT:-8000}"

  if [ -n "${OCTANE_WORKERS:-}" ]; then
    set -- "$@" "--workers=${OCTANE_WORKERS}"
  fi

  if [ -n "${OCTANE_TASK_WORKERS:-}" ]; then
    set -- "$@" "--task-workers=${OCTANE_TASK_WORKERS}"
  fi

  if [ -n "${OCTANE_MAX_REQUESTS:-}" ]; then
    set -- "$@" "--max-requests=${OCTANE_MAX_REQUESTS}"
  fi
fi

exec "$@"
