// Hardcoded copies (keep in sync when editing): docker/nginx/default.conf, public/mini-coi.js
module.exports = {
  // obtain shared memory
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  // forbid every external connection
  "Content-Security-Policy":
    "default-src 'none'; script-src 'self' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline' blob: data:; img-src 'self' blob: data:; media-src 'self' blob: data:; font-src 'self' blob: data:; connect-src 'self' blob: data:; worker-src 'self' blob:; frame-src 'self' blob: data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; webrtc 'block'",
};
