#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/cf-common.sh"

usage() {
  cat <<'USAGE'
Usage:
  scripts/cf-log-check.sh [production|staging] --base-url <https://...> [--tail-seconds N] [--log-timeout N]

Examples:
  scripts/cf-log-check.sh production --base-url https://converttoit-site.<subdomain>.workers.dev
  CF_OPS_LOG_TOKEN=... scripts/cf-log-check.sh staging --base-url https://staging.example.com

Environment variables:
  CF_OPS_LOG_TOKEN      Optional token sent as x-ops-token for /_ops/log-ping
  CF_LOG_PING_TIMEOUT   Curl max time in seconds (default: 20)
  WRANGLER_CONFIG_PATH  Config path (default: ./wrangler.toml)
USAGE
}

TARGET_ENV="production"
BASE_URL="${CF_DEPLOY_BASE_URL:-}"
TAIL_SECONDS=15
LOG_PING_TIMEOUT="${CF_LOG_PING_TIMEOUT:-20}"
TAIL_PID=""
TAIL_OUTPUT_FILE=""
PING_OUTPUT_FILE=""

cleanup() {
  if [ -n "$TAIL_PID" ] && kill -0 "$TAIL_PID" >/dev/null 2>&1; then
    kill "$TAIL_PID" >/dev/null 2>&1 || true
    wait "$TAIL_PID" 2>/dev/null || true
  fi
  [ -n "$TAIL_OUTPUT_FILE" ] && rm -f "$TAIL_OUTPUT_FILE"
  [ -n "$PING_OUTPUT_FILE" ] && rm -f "$PING_OUTPUT_FILE"
}

is_positive_integer() {
  [[ "$1" =~ ^[1-9][0-9]*$ ]]
}

trap cleanup EXIT INT TERM

while [ "$#" -gt 0 ]; do
  case "$1" in
    production|staging)
      TARGET_ENV="$1"
      ;;
    --base-url)
      shift
      BASE_URL="${1:-}"
      ;;
    --tail-seconds)
      shift
      TAIL_SECONDS="${1:-}"
      ;;
    --log-timeout)
      shift
      LOG_PING_TIMEOUT="${1:-}"
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

if [ -z "$BASE_URL" ]; then
  echo "[log-check] --base-url is required (or CF_DEPLOY_BASE_URL env var)." >&2
  exit 1
fi

if ! is_positive_integer "$TAIL_SECONDS"; then
  echo "[log-check] --tail-seconds must be a positive integer." >&2
  exit 1
fi

if ! is_positive_integer "$LOG_PING_TIMEOUT"; then
  echo "[log-check] --log-timeout must be a positive integer." >&2
  exit 1
fi

if [[ ! "$BASE_URL" =~ ^https:// ]]; then
  echo "[log-check] --base-url must use https://." >&2
  exit 1
fi

BASE_HOST="$(printf '%s' "$BASE_URL" | sed -E 's#^[A-Za-z]+://([^/:?#]+).*$#\1#')"
if [ "$BASE_HOST" = "converttoit.app" ] || [ "$BASE_HOST" = "www.converttoit.app" ]; then
  echo "[log-check] --base-url cannot target converttoit.app (redirect-only domain)." >&2
  exit 1
fi

if ! ensure_wrangler_config; then
  exit 1
fi

if [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ] && [ "${CF_ALLOW_INTERACTIVE:-0}" != "1" ]; then
  echo "[log-check] CLOUDFLARE_ACCOUNT_ID is required when CLOUDFLARE_API_TOKEN is used." >&2
  exit 1
fi

cd "$ROOT_DIR"

CORRELATION_ID="ops-check-$(date +%Y%m%d%H%M%S)-$RANDOM"
PING_URL="${BASE_URL%/}/_ops/log-ping?id=$CORRELATION_ID"
TAIL_OUTPUT_FILE="$(mktemp -t cf-log-tail.XXXXXX)"
PING_OUTPUT_FILE="$(mktemp -t cf-log-ping.XXXXXX)"

TAIL_ARGS=(tail --config "$WRANGLER_CONFIG_PATH" --format pretty)
if [ "$TARGET_ENV" = "production" ]; then
  :
else
  TAIL_ARGS+=(--env "$TARGET_ENV")
fi

echo "[log-check] Starting wrangler tail for $TARGET_ENV (search=$CORRELATION_ID)"
wrangler_cmd "${TAIL_ARGS[@]}" >"$TAIL_OUTPUT_FILE" 2>&1 &
TAIL_PID=$!

TAIL_READY=0
for _ in $(seq 1 20); do
  if grep -q "Connected to" "$TAIL_OUTPUT_FILE"; then
    TAIL_READY=1
    break
  fi
  if ! kill -0 "$TAIL_PID" >/dev/null 2>&1; then
    echo "[log-check] wrangler tail exited early:" >&2
    cat "$TAIL_OUTPUT_FILE" >&2
    rm -f "$PING_OUTPUT_FILE"
    rm -f "$TAIL_OUTPUT_FILE"
    exit 1
  fi
  sleep 1
done

if [ "$TAIL_READY" -ne 1 ]; then
  echo "[log-check] wrangler tail did not become ready in time." >&2
  cat "$TAIL_OUTPUT_FILE" >&2
  exit 1
fi

CURL_ARGS=(--silent --show-error --fail --request GET "$PING_URL" --header "accept: application/json")
CURL_ARGS+=(--max-time "$LOG_PING_TIMEOUT" --connect-timeout 5)
if [ -n "${CF_OPS_LOG_TOKEN:-}" ]; then
  CURL_ARGS+=(--header "x-ops-token: $CF_OPS_LOG_TOKEN")
fi

echo "[log-check] Triggering $PING_URL"
curl "${CURL_ARGS[@]}" >"$PING_OUTPUT_FILE"
cat "$PING_OUTPUT_FILE"

FOUND=0
for _ in $(seq 1 "$TAIL_SECONDS"); do
  if grep -q "$CORRELATION_ID" "$TAIL_OUTPUT_FILE"; then
    FOUND=1
    break
  fi
  if ! kill -0 "$TAIL_PID" >/dev/null 2>&1; then
    echo "[log-check] wrangler tail exited before correlation id was observed." >&2
    cat "$TAIL_OUTPUT_FILE" >&2
    exit 1
  fi
  sleep 1
done

kill "$TAIL_PID" >/dev/null 2>&1 || true
wait "$TAIL_PID" 2>/dev/null || true
TAIL_PID=""

if [ "$FOUND" -eq 1 ]; then
  echo "[log-check] SUCCESS: correlation id found in Cloudflare tail output."
  exit 0
fi

echo "[log-check] FAILED: correlation id was not found in tail output." >&2
echo "[log-check] Tail output:" >&2
cat "$TAIL_OUTPUT_FILE" >&2
exit 1
