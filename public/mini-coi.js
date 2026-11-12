/*! coi-serviceworker v0.1.7 - Guido Zuidhof and contributors, licensed under MIT */
/*! mini-coi - Andrea Giammarchi and contributors, licensed under MIT */
/* with small changes for convert */
(({ document: d, navigator: { serviceWorker: s } }) => {
  if (d) {
    if (!s || !("crossOriginIsolated" in self)) return;
    if (self.crossOriginIsolated && !s.controller) return;
    const { currentScript: c } = d;
    s.register(c.src, { scope: c.getAttribute("scope") || "." }).then((r) => {
      s.addEventListener("controllerchange", () => location.reload());
      if (r.active && !s.controller) location.reload();
    });
  } else {
    addEventListener("install", () => skipWaiting());
    addEventListener("activate", (e) => e.waitUntil(clients.claim()));
    addEventListener("fetch", (e) => {
      const { request: r } = e;
      if (r.cache === "only-if-cached" && r.mode !== "same-origin") return;
      if (r.mode !== "navigate" && !r.destination.endsWith("worker")) return;
      const response = fetch(r).then((r) => {
        const { body, status, statusText } = r;
        if (!status || status > 399) return r;
        const h = new Headers(r.headers);
        // keep in sync with src/securityHeaders.cjs
        h.set("Cross-Origin-Opener-Policy", "same-origin");
        h.set("Cross-Origin-Embedder-Policy", "require-corp");
        if (!h.has("Content-Security-Policy"))
          h.set(
            "Content-Security-Policy",
            "default-src 'none'; script-src 'self' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline' blob: data:; img-src 'self' blob: data:; media-src 'self' blob: data:; font-src 'self' blob: data:; connect-src 'self' blob: data:; worker-src 'self' blob:; frame-src 'self' blob: data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; webrtc 'block'",
          );
        return new Response(status == 204 ? null : body, { status, statusText, headers: h });
      });
      e.respondWith(response);
    });
  }
})(self);
