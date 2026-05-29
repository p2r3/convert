# Contributing

## Project layout

```
.
├── server/           # Express API (this fork's addition)
│   ├── index.ts      # entry
│   ├── lib/          # cross-cutting libs (browser pool, jobs, cache, ...)
│   ├── routes/       # one file per endpoint family
│   ├── openapi.ts    # Swagger spec + /docs page
│   └── public/       # static landing page
├── src/              # original p2r3/convert browser app (untouched)
├── test/             # tests for both the original tool and the server
└── docs/             # markdown reference (this directory)
```

## Workflow

```bash
bun install
bun run server:dev   # tsx watch on server/
bun run test:server  # smoke tests over the full surface
bun run server:typecheck
```

## Adding a new endpoint

1. Create `server/routes/<name>.ts` exporting `Router`.
2. Decide whether the work fits the job model:
   - Quick & deterministic → may run inline.
   - Slow or external → wrap with `spawnJob` and respect the 100ms threshold.
3. Wire it into `server/index.ts`.
4. Add an entry in `server/openapi.ts` under `paths`.
5. Add at least one smoke test in `test/server/run.ts`.
6. Document under `docs/api.md`.

## Adding a new native fast-path converter

The current fast-path is `sharp` for raster images. To add another (e.g. native PDF rendering via `pdf-lib`, or audio transcoding via `ffmpeg-static`):

1. Create `server/lib/<name>.ts` with a `convert(...)` function returning `{ bytes, contentType, fileName }`.
2. Hook it into the `planConversion()` decision tree in `server/routes/convert.ts` ahead of the browser-converter fallback.
3. Add an entry to `server/lib/estimate.ts` if the cost profile is different from the existing kinds.
4. Update `docs/architecture.md`'s layering table.

## Adding a format handler to the original tool

Follow the upstream guide in the project root README ("Creating a handler"). New handlers populate the WASM converter; the API picks them up automatically through `dist/cache.json`. The format-tracker fires `added` events to subscribers on next `/api/formats` call.

## Testing

`test/server/run.ts` is an end-to-end smoke runner — no test framework required. Add a case with a name + an `async run()`. The runner spins up an isolated Express app, exercises the handler, and tears down.

For tests that need external services (yt-dlp, tesseract, OpenAI, etc.), gate them on a `probe()` call and `skip` cleanly when unavailable — the test runner respects skips.

## Coding style

- TypeScript strict mode (in `server/tsconfig.json`).
- No comments explaining *what* code does; only *why* it does something non-obvious (security invariants, hidden constraints, library quirks).
- Errors via `ApiError` (`server/lib/errors.ts`) — the error middleware maps these to HTTP statuses.
- Keep route handlers thin; push logic into `server/lib/`.
