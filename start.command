#!/bin/sh
# Double-click in Finder (macOS) to build the app when needed and open it in the browser.
# index.html cannot be opened directly: a page at a file:// address may not load its own
# scripts, workers and WebAssembly.
cd "$(dirname "$0")" || exit 1
PATH="$HOME/.bun/bin:$PATH"
URL="http://localhost:4319/"

# a server from an earlier double-click is still running: open it rather than start a second
# one, which would move to the next port while the browser may still show the old one
if curl -s --max-time 2 "$URL" | grep -q "<title>Convert to it!</title>"; then
  open "$URL"
  exit 0
fi

if ! command -v bun >/dev/null; then
  echo "Bun is not installed. Get it from https://bun.sh and start this again."
  exit 1
fi

[ -d node_modules ] || bun install || exit 1

# rebuild when there is no build yet, or when a source file is newer than the build
if [ ! -f dist/index.html ] ||
  [ -n "$(find src index.html vite.config.js package.json -newer dist/index.html -print -quit)" ]; then
  bun run build || exit 1
  # the cache only makes the first load faster, so a failure here must not stop the app
  bun run cache:build ||
    echo "The format cache could not be built; the app works without it, it only starts slower."
fi

exec bun run start
