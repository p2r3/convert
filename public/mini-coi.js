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
        h.set("Cross-Origin-Opener-Policy", "same-origin");
        h.set("Cross-Origin-Embedder-Policy", "require-corp");
        h.set("Cross-Origin-Resource-Policy", "cross-origin");
        return new Response(status == 204 ? null : body, { status, statusText, headers: h });
      });
      e.respondWith(response);
    });
  }
})(self);
