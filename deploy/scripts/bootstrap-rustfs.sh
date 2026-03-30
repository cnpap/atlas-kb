#!/usr/bin/env sh
set -eu

: "${RUSTFS_ACCESS_KEY:?RUSTFS_ACCESS_KEY is required}"
: "${RUSTFS_SECRET_KEY:?RUSTFS_SECRET_KEY is required}"
: "${ATLAS_KB_WEB_BUCKET:?ATLAS_KB_WEB_BUCKET is required}"
: "${LANCEDB_URI:?LANCEDB_URI is required}"

ATLAS_KB_WEB_S3_ENDPOINT="${ATLAS_KB_WEB_S3_ENDPOINT:-http://rustfs:9000}"
LANCEDB_S3_REGION="${LANCEDB_S3_REGION:-us-east-1}"
LANCEDB_BUCKET="$(printf '%s' "${LANCEDB_URI}" | sed -e 's#^s3://##' -e 's#/.*$##')"

if [ -z "${LANCEDB_BUCKET}" ]; then
  echo "Failed to parse bucket name from LANCEDB_URI=${LANCEDB_URI}" >&2
  exit 1
fi

export AWS_ACCESS_KEY_ID="${RUSTFS_ACCESS_KEY}"
export AWS_SECRET_ACCESS_KEY="${RUSTFS_SECRET_KEY}"
export AWS_DEFAULT_REGION="${LANCEDB_S3_REGION}"
export AWS_EC2_METADATA_DISABLED=true

aws configure set default.s3.addressing_style path >/dev/null 2>&1 || true

until aws --endpoint-url "${ATLAS_KB_WEB_S3_ENDPOINT}" s3api list-buckets >/dev/null 2>&1; do
  sleep 2
done

ensure_bucket() {
  bucket_name="$1"

  if ! aws --endpoint-url "${ATLAS_KB_WEB_S3_ENDPOINT}" s3api head-bucket --bucket "${bucket_name}" >/dev/null 2>&1; then
    aws --endpoint-url "${ATLAS_KB_WEB_S3_ENDPOINT}" s3api create-bucket --bucket "${bucket_name}" >/dev/null
  fi
}

ensure_bucket "${LANCEDB_BUCKET}"
ensure_bucket "${ATLAS_KB_WEB_BUCKET}"

policy_file="$(mktemp)"
trap 'rm -f "${policy_file}"' EXIT

cat > "${policy_file}" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadAtlasKbWeb",
      "Effect": "Allow",
      "Principal": {
        "AWS": ["*"]
      },
      "Action": ["s3:GetObject"],
      "Resource": ["arn:aws:s3:::${ATLAS_KB_WEB_BUCKET}/*"]
    }
  ]
}
EOF

aws --endpoint-url "${ATLAS_KB_WEB_S3_ENDPOINT}" \
  s3api put-bucket-policy \
  --bucket "${ATLAS_KB_WEB_BUCKET}" \
  --policy "file://${policy_file}" >/dev/null

printf 'RustFS buckets ready: %s, %s\n' "${LANCEDB_BUCKET}" "${ATLAS_KB_WEB_BUCKET}"
