import { describe, expect, test } from "bun:test";
import worker from "../cloudflare/worker/index.mjs";

type AssetsBinding = { fetch: (request: Request) => Promise<Response> | Response };

function createEnv(overrides: Partial<Record<string, unknown>> = {}) {
  const assets: AssetsBinding = {
    fetch: () => new Response("asset-ok", { headers: { "cache-control": "public, max-age=60" } })
  };

  return {
    ENVIRONMENT: "production",
    APP_VERSION: "1.2.3",
    BUILD_SHA: "abc123",
    ASSETS: assets,
    ...overrides
  };
}

describe("Cloudflare worker hardening", () => {
  test("redirects .app host to canonical .com host", async () => {
    const response = await worker.fetch(
      new Request("https://converttoit.app/format/png-to-jpg/?q=1"),
      createEnv()
    );

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://converttoit.com/format/png-to-jpg/?q=1");
  });

  test("redirects www host to canonical apex host", async () => {
    const response = await worker.fetch(new Request("https://www.converttoit.com/compare/"), createEnv());

    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://converttoit.com/compare/");
  });

  test("adds noindex + security headers to ops responses", async () => {
    const response = await worker.fetch(new Request("https://converttoit.com/_ops/health"), createEnv());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });

  test("returns 405 for unsupported methods on /_ops routes", async () => {
    const response = await worker.fetch(new Request("https://converttoit.com/_ops/health", { method: "POST" }), createEnv());
    const body = await response.json();

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
    expect(body.error).toBe("method_not_allowed");
  });

  test("enforces OPS_LOG_TOKEN on log-ping", async () => {
    const env = createEnv({ OPS_LOG_TOKEN: "super-secret-token" });
    const unauthorized = await worker.fetch(new Request("https://converttoit.com/_ops/log-ping"), env);
    const authorized = await worker.fetch(
      new Request("https://converttoit.com/_ops/log-ping", {
        headers: { "x-ops-token": "super-secret-token" }
      }),
      env
    );

    expect(unauthorized.status).toBe(401);
    expect(authorized.status).toBe(200);
  });

  test("sanitizes and bounds correlation id", async () => {
    const noisyCorrelationId = "\nvery-long-value!!!__".repeat(20);
    const response = await worker.fetch(
      new Request(`https://converttoit.com/_ops/log-ping?id=${encodeURIComponent(noisyCorrelationId)}`),
      createEnv()
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(typeof body.correlationId).toBe("string");
    expect(body.correlationId.length).toBeLessThanOrEqual(64);
    expect(/^[A-Za-z0-9._:-]+$/.test(body.correlationId)).toBe(true);
  });

  test("returns empty body for HEAD ops requests", async () => {
    const response = await worker.fetch(new Request("https://converttoit.com/_ops/version", { method: "HEAD" }), createEnv());
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toBe("");
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  test("preserves existing asset security headers and fills missing defaults", async () => {
    const env = createEnv({
      ASSETS: {
        fetch: () =>
          new Response("ok", {
            headers: {
              "x-frame-options": "SAMEORIGIN"
            }
          })
      }
    });

    const response = await worker.fetch(new Request("https://converttoit.com/style.css"), env);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
