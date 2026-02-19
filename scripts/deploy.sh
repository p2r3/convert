#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/cf-common.sh"

usage() {
  cat <<'USAGE'
Usage:
  scripts/deploy.sh [production|staging] [--dry-run] [--skip-build] [--skip-policy-checks] [-- <extra wrangler args>]

Examples:
  scripts/deploy.sh production
  scripts/deploy.sh staging --dry-run
  scripts/deploy.sh production --skip-policy-checks
  scripts/deploy.sh production -- --outdir .wrangler-dist

Environment variables:
  CLOUDFLARE_API_TOKEN   API token for non-interactive deploys
  CLOUDFLARE_ACCOUNT_ID  Cloudflare account id (kept in env, not wrangler config)
  CF_APP_VERSION         Version injected into /_ops/version (default: package.json version)
  CF_BUILD_SHA           Build SHA injected into /_ops/version (default: git short SHA)
  CF_ALLOW_INTERACTIVE   Set to 1 to allow deploy without CLOUDFLARE_API_TOKEN
  CF_SKIP_POLICY_CHECKS  Set to 1 to skip SEO/domain integrity preflight checks
  WRANGLER_CONFIG_PATH   Config path (default: ./wrangler.toml)
USAGE
}

TARGET_ENV="production"
DRY_RUN=0
SKIP_BUILD="${CF_SKIP_BUILD:-0}"
SKIP_POLICY_CHECKS="${CF_SKIP_POLICY_CHECKS:-0}"
EXTRA_ARGS=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    production|staging)
      TARGET_ENV="$1"
      ;;
    --dry-run)
      DRY_RUN=1
      ;;
    --skip-build)
      SKIP_BUILD=1
      ;;
    --skip-policy-checks)
      SKIP_POLICY_CHECKS=1
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --)
      shift
      EXTRA_ARGS+=("$@")
      break
      ;;
    *)
      EXTRA_ARGS+=("$1")
      ;;
  esac
  shift
done

cd "$ROOT_DIR"

if ! ensure_wrangler_config; then
  exit 1
fi

if [ "$SKIP_POLICY_CHECKS" != "1" ]; then
  echo "[deploy] Running SEO/domain preflight checks"
  node scripts/check-seo-domain-policy.mjs
  node scripts/check-critical-files.mjs
else
  echo "[deploy] Skipping SEO/domain preflight checks (CF_SKIP_POLICY_CHECKS=1 or --skip-policy-checks)"
fi

if [ "$SKIP_BUILD" != "1" ]; then
  if ! command -v bun >/dev/null 2>&1; then
    echo "[deploy] bun is required for build step but was not found in PATH." >&2
    exit 1
  fi
  echo "[deploy] Building static assets with bun run build"
  bun run build
else
  echo "[deploy] Skipping build (CF_SKIP_BUILD=1 or --skip-build)"
fi

echo "[deploy] Checking Cloudflare asset size limits"
node scripts/check-cloudflare-asset-sizes.mjs

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && [ "${CF_ALLOW_INTERACTIVE:-0}" != "1" ]; then
  echo "[deploy] CLOUDFLARE_API_TOKEN is not set."
  echo "         Set CLOUDFLARE_API_TOKEN for CI/non-interactive deploys,"
  echo "         or set CF_ALLOW_INTERACTIVE=1 to rely on local wrangler auth."
  if [ "$DRY_RUN" -ne 1 ]; then
    exit 1
  fi
fi

if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ] && [ "${CF_ALLOW_INTERACTIVE:-0}" != "1" ]; then
  echo "[deploy] CLOUDFLARE_ACCOUNT_ID is not set."
  echo "         Set CLOUDFLARE_ACCOUNT_ID in environment (do not hardcode account_id in wrangler config)."
  if [ "$DRY_RUN" -ne 1 ]; then
    exit 1
  fi
fi

PACKAGE_VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo '0.0.0')"
APP_VERSION="${CF_APP_VERSION:-$PACKAGE_VERSION}"
BUILD_SHA="${CF_BUILD_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')}"
ENVIRONMENT_LABEL="${CF_ENVIRONMENT:-$TARGET_ENV}"

DEPLOY_ARGS=(
  deploy
  --config "$WRANGLER_CONFIG_PATH"
  --var "APP_VERSION:$APP_VERSION"
  --var "BUILD_SHA:$BUILD_SHA"
  --var "ENVIRONMENT:$ENVIRONMENT_LABEL"
)

if [ "$TARGET_ENV" = "production" ]; then
  DEPLOY_ARGS+=(--env "")
else
  DEPLOY_ARGS+=(--env "$TARGET_ENV")
fi

if [ "$DRY_RUN" -eq 1 ]; then
  DEPLOY_ARGS+=(--dry-run)
fi

echo "[deploy] Deploying target environment: $TARGET_ENV"
echo "[deploy] APP_VERSION=$APP_VERSION BUILD_SHA=$BUILD_SHA"

if [ "${#EXTRA_ARGS[@]}" -gt 0 ]; then
  wrangler_cmd "${DEPLOY_ARGS[@]}" "${EXTRA_ARGS[@]}"
else
  wrangler_cmd "${DEPLOY_ARGS[@]}"
fi
