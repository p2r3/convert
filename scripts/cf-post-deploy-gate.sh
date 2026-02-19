#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/cf-common.sh"

usage() {
  cat <<'USAGE'
Usage:
  scripts/cf-post-deploy-gate.sh [production|staging] --base-url <https://converttoit.com>

Examples:
  scripts/cf-post-deploy-gate.sh production --base-url https://converttoit.com
  CF_CURL_RESOLVE="converttoit.com:443:172.67.147.116" scripts/cf-post-deploy-gate.sh production --base-url https://converttoit.com

Environment variables:
  CF_DEPLOY_BASE_URL   Optional base URL fallback for --base-url
  CF_CURL_TIMEOUT      Curl max-time in seconds (default: 20)
  CF_CURL_RESOLVE      Optional curl --resolve value (host:443:ip) for edge pinning
  CF_OPS_LOG_TOKEN     Optional token used by scripts/cf-log-check.sh
USAGE
}

TARGET_ENV="production"
BASE_URL="${CF_DEPLOY_BASE_URL:-}"
CF_CURL_TIMEOUT="${CF_CURL_TIMEOUT:-20}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    production|staging)
      TARGET_ENV="$1"
      ;;
    --base-url)
      shift
      BASE_URL="${1:-}"
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "[post-gate] Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

if [ -z "$BASE_URL" ]; then
  echo "[post-gate] --base-url is required (or CF_DEPLOY_BASE_URL)." >&2
  exit 1
fi

if [[ ! "$BASE_URL" =~ ^https:// ]]; then
  echo "[post-gate] base URL must use https:// (got: $BASE_URL)" >&2
  exit 1
fi

NORMALIZED_BASE_URL="${BASE_URL%/}"
BASE_HOST="$(printf '%s' "$NORMALIZED_BASE_URL" | sed -E 's#^[A-Za-z]+://([^/:?#]+).*$#\1#')"
BASE_PATH="$(printf '%s' "$NORMALIZED_BASE_URL" | sed -E 's#^[A-Za-z]+://[^/]+(/.*)?$#\1#')"

if [ "$BASE_HOST" != "converttoit.com" ]; then
  echo "[post-gate] base host must be converttoit.com (got: $BASE_HOST)." >&2
  exit 1
fi

if [ -n "$BASE_PATH" ] && [ "$BASE_PATH" != "/" ]; then
  echo "[post-gate] base URL must not include a path (got: $NORMALIZED_BASE_URL)." >&2
  exit 1
fi

if ! [[ "$CF_CURL_TIMEOUT" =~ ^[1-9][0-9]*$ ]]; then
  echo "[post-gate] CF_CURL_TIMEOUT must be a positive integer." >&2
  exit 1
fi

read -r -a CURL_RESOLVE_ARGS <<< ""
if [ -n "${CF_CURL_RESOLVE:-}" ]; then
  CURL_RESOLVE_ARGS=(--resolve "$CF_CURL_RESOLVE")
fi

curl_json() {
  local path="$1"
  local url="${NORMALIZED_BASE_URL}${path}"

  curl \
    --silent \
    --show-error \
    --fail \
    --max-time "$CF_CURL_TIMEOUT" \
    --connect-timeout 5 \
    "${CURL_RESOLVE_ARGS[@]}" \
    "$url"
}

echo "[post-gate] Checking /_ops/health"
HEALTH_JSON="$(curl_json "/_ops/health")"
echo "$HEALTH_JSON"
HEALTH_STATUS="$(printf '%s' "$HEALTH_JSON" | jq -r '.status // ""')"
if [ "$HEALTH_STATUS" != "ok" ]; then
  echo "[post-gate] /_ops/health status must be ok (got: $HEALTH_STATUS)." >&2
  exit 1
fi

echo "[post-gate] Checking /_ops/version"
VERSION_JSON="$(curl_json "/_ops/version")"
echo "$VERSION_JSON"
VERSION_SERVICE="$(printf '%s' "$VERSION_JSON" | jq -r '.service // ""')"
if [ "$VERSION_SERVICE" != "converttoit.com" ]; then
  echo "[post-gate] /_ops/version service must be converttoit.com (got: $VERSION_SERVICE)." >&2
  exit 1
fi

export CF_DEPLOY_BASE_URL="$NORMALIZED_BASE_URL"

if [ -n "${CF_CURL_RESOLVE:-}" ]; then
  echo "[post-gate] CF_CURL_RESOLVE is set for direct curl checks; skipping cf-log-check because wrangler tail flow does not support --resolve."
  echo "[post-gate] PASS (partial): /_ops checks passed with explicit edge resolve."
  exit 0
fi

echo "[post-gate] Running log correlation check"
bash "$SCRIPT_DIR/cf-log-check.sh" "$TARGET_ENV" --base-url "$NORMALIZED_BASE_URL"

echo "[post-gate] SUCCESS: /_ops + log-check gate passed."
