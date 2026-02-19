#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/cf-common.sh"

usage() {
  cat <<'USAGE'
Usage:
  scripts/cf-rollback.sh [production|staging] [version-id] [--yes]
  scripts/cf-rollback.sh [production|staging] --list

Examples:
  scripts/cf-rollback.sh production
  scripts/cf-rollback.sh production 9f0f5f6d-cf0d-4d0f-8d07-...
  scripts/cf-rollback.sh production --yes
  scripts/cf-rollback.sh production --list
  scripts/cf-rollback.sh staging

Environment variables:
  CLOUDFLARE_API_TOKEN    API token for non-interactive rollbacks
  CLOUDFLARE_ACCOUNT_ID   Cloudflare account id (kept in env, not wrangler config)
  CF_ALLOW_INTERACTIVE    Set to 1 to allow rollback without CLOUDFLARE_API_TOKEN
  CF_ROLLBACK_ASSUME_YES  Set to 1 to skip production confirmation prompt
  WRANGLER_CONFIG_PATH    Config path (default: ./wrangler.toml)
USAGE
}

TARGET_ENV="production"
VERSION_ID=""
ASSUME_YES="${CF_ROLLBACK_ASSUME_YES:-0}"
LIST_ONLY=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    production|staging)
      TARGET_ENV="$1"
      ;;
    --yes)
      ASSUME_YES=1
      ;;
    --list)
      LIST_ONLY=1
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      if [ -z "$VERSION_ID" ]; then
        VERSION_ID="$1"
      else
        echo "Unknown or duplicate argument: $1" >&2
        usage
        exit 1
      fi
      ;;
  esac
  shift
done

if ! ensure_wrangler_config; then
  exit 1
fi

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && [ "${CF_ALLOW_INTERACTIVE:-0}" != "1" ]; then
  echo "[rollback] CLOUDFLARE_API_TOKEN is not set." >&2
  echo "           Set CLOUDFLARE_API_TOKEN for CI/non-interactive rollbacks," >&2
  echo "           or set CF_ALLOW_INTERACTIVE=1 to rely on local wrangler auth." >&2
  exit 1
fi

if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ] && [ "${CF_ALLOW_INTERACTIVE:-0}" != "1" ]; then
  echo "[rollback] CLOUDFLARE_ACCOUNT_ID is not set." >&2
  echo "           Set CLOUDFLARE_ACCOUNT_ID in environment (do not hardcode account_id in wrangler config)." >&2
  exit 1
fi

cd "$ROOT_DIR"

if [ "$LIST_ONLY" -eq 1 ]; then
  LIST_ARGS=(versions list --config "$WRANGLER_CONFIG_PATH")
  if [ "$TARGET_ENV" != "production" ]; then
    LIST_ARGS+=(--env "$TARGET_ENV")
  fi
  echo "[rollback] listing versions for $TARGET_ENV"
  wrangler_cmd "${LIST_ARGS[@]}"
  exit 0
fi

if [ "$TARGET_ENV" = "production" ] && [ "$ASSUME_YES" != "1" ]; then
  if [ -t 0 ]; then
    read -r -p "[rollback] Confirm production rollback (type 'yes' to continue): " CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
      echo "[rollback] aborted by user."
      exit 1
    fi
  else
    echo "[rollback] non-interactive production rollback proceeding without prompt (use --yes to silence this warning)."
  fi
fi

ROLLBACK_ARGS=(rollback --config "$WRANGLER_CONFIG_PATH")
if [ "$TARGET_ENV" = "production" ]; then
  :
else
  ROLLBACK_ARGS+=(--env "$TARGET_ENV")
fi
if [ -n "$VERSION_ID" ]; then
  ROLLBACK_ARGS+=("$VERSION_ID")
fi

echo "[rollback] target environment: $TARGET_ENV"
if [ -n "$VERSION_ID" ]; then
  echo "[rollback] pinned version id: $VERSION_ID"
else
  echo "[rollback] rolling back to previous deployed version"
fi

wrangler_cmd "${ROLLBACK_ARGS[@]}"
