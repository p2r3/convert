#!/usr/bin/env bash
set -u
set -o pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

overall_exit=0

run_check() {
  local label="$1"
  shift

  echo "=== ${label} ==="
  "$@"
  local code=$?
  echo "exit_code=${code}"
  echo

  if [ "$code" -ne 0 ]; then
    overall_exit=1
  fi
}

has_package_script() {
  local script_name="$1"
  node --input-type=module -e "import fs from 'node:fs'; const p = JSON.parse(fs.readFileSync('package.json', 'utf8')); process.exit(p.scripts && p.scripts['${script_name}'] ? 0 : 1);" >/dev/null 2>&1
}

run_required_script() {
  local script_name="$1"
  if has_package_script "$script_name"; then
    run_check "package script: ${script_name}" bun run "$script_name"
  else
    echo "=== package script: ${script_name} ==="
    echo "Required script is missing from package.json: ${script_name}"
    echo "exit_code=1"
    echo
    overall_exit=1
  fi
}

run_optional_script() {
  local script_name="$1"
  if has_package_script "$script_name"; then
    run_check "package script: ${script_name}" bun run "$script_name"
  else
    echo "=== package script: ${script_name} ==="
    echo "skipped (script not defined in package.json)"
    echo
  fi
}

echo "Validation profile: deterministic local/CI checks (no dev server, Docker, or database)."
echo

run_required_script "check:seo-policy"
run_required_script "check:integrity"
run_required_script "test:unit"

if [ "${VALIDATE_INCLUDE_BROWSER_TESTS:-0}" = "1" ]; then
  run_optional_script "test:browser"
else
  echo "=== package script: test:browser ==="
  echo "skipped (set VALIDATE_INCLUDE_BROWSER_TESTS=1 to include browser conversion tests)"
  echo
fi

if [ "${VALIDATE_INCLUDE_BUILD:-0}" = "1" ]; then
  run_optional_script "build"
  run_required_script "check:cf-assets"
else
  echo "=== package script: build ==="
  echo "skipped (set VALIDATE_INCLUDE_BUILD=1 for full build validation)"
  echo
fi

echo "overall_exit=${overall_exit}"
exit "$overall_exit"
