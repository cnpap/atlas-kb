#!/usr/bin/env sh
set -eu

: "${PGHOST:?PGHOST is required}"
: "${PGPORT:?PGPORT is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
: "${ATLAS_KB_DB_USER:?ATLAS_KB_DB_USER is required}"
: "${ATLAS_KB_DB_PASSWORD:?ATLAS_KB_DB_PASSWORD is required}"
: "${ATLAS_KB_DB_NAME:?ATLAS_KB_DB_NAME is required}"

until pg_isready -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" >/dev/null 2>&1; do
  sleep 1
done

psql \
  -h "${PGHOST}" \
  -p "${PGPORT}" \
  -U "${PGUSER}" \
  -d postgres \
  -v ON_ERROR_STOP=1 \
  -v atlas_kb_db_user="${ATLAS_KB_DB_USER}" \
  -v atlas_kb_db_password="${ATLAS_KB_DB_PASSWORD}" <<'SQL'
SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L',
  :'atlas_kb_db_user',
  :'atlas_kb_db_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'atlas_kb_db_user')\gexec

SELECT format(
  'ALTER ROLE %I LOGIN PASSWORD %L',
  :'atlas_kb_db_user',
  :'atlas_kb_db_password'
)\gexec
SQL

psql \
  -h "${PGHOST}" \
  -p "${PGPORT}" \
  -U "${PGUSER}" \
  -d postgres \
  -v ON_ERROR_STOP=1 \
  -v atlas_kb_db_name="${ATLAS_KB_DB_NAME}" \
  -v atlas_kb_db_user="${ATLAS_KB_DB_USER}" <<'SQL'
SELECT format('CREATE DATABASE %I OWNER %I', :'atlas_kb_db_name', :'atlas_kb_db_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'atlas_kb_db_name')\gexec
SQL

psql \
  -h "${PGHOST}" \
  -p "${PGPORT}" \
  -U "${PGUSER}" \
  -d "${ATLAS_KB_DB_NAME}" \
  -v ON_ERROR_STOP=1 \
  -v atlas_kb_db_user="${ATLAS_KB_DB_USER}" <<'SQL'
GRANT USAGE, CREATE ON SCHEMA public TO :"atlas_kb_db_user";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO :"atlas_kb_db_user";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO :"atlas_kb_db_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO :"atlas_kb_db_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO :"atlas_kb_db_user";
SQL

printf 'Atlas KB database ready: %s\n' "${ATLAS_KB_DB_NAME}"
