const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow, noarchive"
};

const CANONICAL_ORIGIN = "https://converttoit.com";
const REDIRECT_SOURCE_HOSTS = new Set([
  "converttoit.app",
  "www.converttoit.app",
  "www.converttoit.com"
]);

const DEFAULT_SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy":
    "accelerometer=(), autoplay=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()",
  "x-permitted-cross-domain-policies": "none",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin"
};

const OPS_ALLOWED_METHODS = new Set(["GET", "HEAD"]);
const MAX_CORRELATION_ID_LENGTH = 64;
const CORRELATION_ID_SAFE_CHARS = /[^A-Za-z0-9._:-]/g;

function mergeDefaultHeaders(headers, defaults) {
  for (const [key, value] of Object.entries(defaults)) {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  }
}

function withHeaders(response, defaults = {}) {
  const headers = new Headers(response.headers);
  mergeDefaultHeaders(headers, defaults);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function getCanonicalRedirectResponse(request) {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  const shouldRedirectHost = REDIRECT_SOURCE_HOSTS.has(host);
  const shouldUpgradeCanonicalHost = host === "converttoit.com" && url.protocol === "http:";

  if (!shouldRedirectHost && !shouldUpgradeCanonicalHost) {
    return null;
  }

  const canonicalUrl = new URL(CANONICAL_ORIGIN);
  canonicalUrl.pathname = url.pathname;
  canonicalUrl.search = url.search;
  canonicalUrl.hash = url.hash;

  return withHeaders(Response.redirect(canonicalUrl.toString(), 301), DEFAULT_SECURITY_HEADERS);
}

function jsonResponse(payload, init = {}, requestMethod = "GET") {
  const headers = new Headers(init.headers || {});
  mergeDefaultHeaders(headers, JSON_HEADERS);
  mergeDefaultHeaders(headers, DEFAULT_SECURITY_HEADERS);

  const body = requestMethod === "HEAD" ? null : JSON.stringify(payload);
  return new Response(body, {
    ...init,
    headers
  });
}

function readVersion(env) {
  return {
    service: "converttoit.com",
    environment: env.ENVIRONMENT || "unknown",
    appVersion: env.APP_VERSION || "unknown",
    buildSha: env.BUILD_SHA || "unknown"
  };
}

function requireOpsToken(request, env) {
  const expected = env.OPS_LOG_TOKEN;
  if (!expected) {
    return true;
  }

  const headerToken = request.headers.get("x-ops-token");
  const queryToken = new URL(request.url).searchParams.get("token");
  return headerToken === expected || queryToken === expected;
}

function makeRequestId(request) {
  return request.headers.get("cf-ray") || crypto.randomUUID();
}

function sanitizeCorrelationId(rawValue) {
  if (!rawValue || typeof rawValue !== "string") {
    return null;
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(CORRELATION_ID_SAFE_CHARS, "-").slice(0, MAX_CORRELATION_ID_LENGTH);
}

function ensureOpsMethod(request, requestId) {
  if (OPS_ALLOWED_METHODS.has(request.method)) {
    return null;
  }

  return jsonResponse({
    error: "method_not_allowed",
    requestId
  }, {
    status: 405,
    headers: {
      allow: "GET, HEAD"
    }
  }, request.method);
}

async function handleOpsRoute(request, env, pathname) {
  if (!pathname.startsWith("/_ops/")) {
    return null;
  }

  const requestId = makeRequestId(request);
  const invalidMethodResponse = ensureOpsMethod(request, requestId);
  if (invalidMethodResponse) {
    return invalidMethodResponse;
  }

  if (pathname === "/_ops/health") {
    return jsonResponse({
      status: "ok",
      timestamp: new Date().toISOString(),
      requestId,
      ...readVersion(env)
    }, {}, request.method);
  }

  if (pathname === "/_ops/version") {
    return jsonResponse({
      timestamp: new Date().toISOString(),
      requestId,
      ...readVersion(env)
    }, {}, request.method);
  }

  if (pathname === "/_ops/log-ping") {
    if (!requireOpsToken(request, env)) {
      return jsonResponse({
        error: "unauthorized",
        requestId
      }, { status: 401 }, request.method);
    }

    const url = new URL(request.url);
    const correlationId =
      sanitizeCorrelationId(request.headers.get("x-correlation-id")) ||
      sanitizeCorrelationId(url.searchParams.get("id")) ||
      crypto.randomUUID();

    const logPayload = {
      event: "ops.log_ping",
      timestamp: new Date().toISOString(),
      requestId,
      correlationId,
      environment: env.ENVIRONMENT || "unknown"
    };

    console.log(JSON.stringify(logPayload));

    return jsonResponse({
      ok: true,
      ...logPayload
    }, {}, request.method);
  }

  return jsonResponse({
    error: "not_found",
    requestId
  }, { status: 404 }, request.method);
}

export default {
  async fetch(request, env) {
    const redirectResponse = getCanonicalRedirectResponse(request);
    if (redirectResponse) {
      return redirectResponse;
    }

    const url = new URL(request.url);
    const opsResponse = await handleOpsRoute(request, env, url.pathname);
    if (opsResponse) {
      return opsResponse;
    }

    if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
      return withHeaders(
        new Response("ASSETS binding is not configured", { status: 500 }),
        DEFAULT_SECURITY_HEADERS
      );
    }

    const assetResponse = await env.ASSETS.fetch(request);
    return withHeaders(assetResponse, DEFAULT_SECURITY_HEADERS);
  }
};
