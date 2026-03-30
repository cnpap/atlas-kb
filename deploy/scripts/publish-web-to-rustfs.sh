#!/usr/bin/env sh
set -eu

DIST_DIR="${1:-}"

if [ -z "${DIST_DIR}" ]; then
  echo "Usage: publish-web-to-rustfs.sh <dist-dir>" >&2
  exit 1
fi

if [ ! -d "${DIST_DIR}" ] || [ ! -f "${DIST_DIR}/index.html" ]; then
  echo "Missing web dist output in ${DIST_DIR}" >&2
  exit 1
fi

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
"${SCRIPT_DIR}/bootstrap-rustfs.sh"

ATLAS_KB_WEB_S3_ENDPOINT="${ATLAS_KB_WEB_S3_ENDPOINT:-http://rustfs:9000}"
LANCEDB_S3_REGION="${LANCEDB_S3_REGION:-us-east-1}"

export AWS_ACCESS_KEY_ID="${RUSTFS_ACCESS_KEY}"
export AWS_SECRET_ACCESS_KEY="${RUSTFS_SECRET_KEY}"
export AWS_DEFAULT_REGION="${LANCEDB_S3_REGION}"
export AWS_EC2_METADATA_DISABLED=true

aws configure set default.s3.addressing_style path >/dev/null 2>&1 || true

aws --endpoint-url "${ATLAS_KB_WEB_S3_ENDPOINT}" \
  s3 sync "${DIST_DIR}" "s3://${ATLAS_KB_WEB_BUCKET}" \
  --delete \
  --exclude "index.html" \
  --no-progress >/dev/null

aws --endpoint-url "${ATLAS_KB_WEB_S3_ENDPOINT}" \
  s3 cp "${DIST_DIR}/index.html" "s3://${ATLAS_KB_WEB_BUCKET}/index.html" \
  --content-type "text/html; charset=utf-8" \
  --cache-control "no-store, no-cache, max-age=0, must-revalidate" \
  --no-progress >/dev/null

printf 'Published frontend to s3://%s\n' "${ATLAS_KB_WEB_BUCKET}"
