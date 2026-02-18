const CACHE_NAME = 'convert-app-v1';
const ASSET_CACHE_NAME = 'convert-assets-v1';
const urlsToCache = [
  '/convert/',
  '/convert/index.html',
  '/convert/favicon.ico',
  '/convert/favicon.png',
  '/convert/manifest.json'
];

// Install service worker and cache essential files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache).catch(() => {
        // Some files may not exist yet, continue anyway
        console.warn('Some files could not be cached during install');
      });
    })
  );
  self.skipWaiting();
});

// Activate service worker and clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== ASSET_CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event: network-first for HTML, cache-first for assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Network-first strategy for HTML pages
  if (event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request)
            .then((response) => response || caches.match('/convert/index.html'));
        })
    );
  } 
  // Cache-first strategy for assets (CSS, JS, images, fonts, WASM, binaries)
  else if (url.pathname.includes('/assets/') || 
           event.request.url.endsWith('.css') || 
           event.request.url.endsWith('.js') ||
           event.request.url.endsWith('.wasm') ||
           event.request.url.endsWith('.png') ||
           event.request.url.endsWith('.ico') ||
           event.request.url.endsWith('.bin') ||
           event.request.url.endsWith('.json')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request)
          .then((response) => {
            if (response && response.status === 200) {
              const responseToCache = response.clone();
              caches.open(ASSET_CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
            return response;
          })
          .catch(() => {
            return caches.match('/convert/index.html');
          });
      })
    );
  }
  // Network-first for everything else
  else {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(ASSET_CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request)
            .then((response) => response || caches.match('/convert/index.html'));
        })
    );
  }
});
