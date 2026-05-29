# convert-api docs

Detailed documentation for the convert-api project. The Express server is layered on top of the original p2r3/convert browser-based converter (a fork — see the project README banner).

| Page | What's inside |
|---|---|
| [architecture.md](./architecture.md) | High-level diagram, conversion-engine layering, request lifecycle, page pool, cache, jobs |
| [api.md](./api.md) | Every endpoint with cURL examples, request/response shapes, error codes |
| [jobs.md](./jobs.md) | The async job system — the 100ms threshold, polling, SSE, cancellation |
| [examples.md](./examples.md) | Worked examples in cURL, JavaScript/Node, Python |
| [deployment.md](./deployment.md) | Docker, env vars, scaling, monitoring, hardening |
| [format-updates.md](./format-updates.md) | Subscribing to format additions via SSE or webhooks |
| [contributing.md](./contributing.md) | Adding new format handlers, native fast-paths, tests |

Live (auto-generated) reference: hit `/docs` on the running server for the Swagger UI, or `/openapi.json` for the raw spec.
