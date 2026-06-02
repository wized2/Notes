// service-worker.js
// Version: 1.0.0
// Two-cache strategy: 'app-shell-v1' (critical) + 'dynamic-v1' (runtime)

const APP_SHELL_CACHE = 'app-shell-v1';
const DYNAMIC_CACHE = 'dynamic-v1';
const CACHED_RESOURCES = [
  '/Notes/index.html',
  '/Notes/manifest.json',
  '/Notes/icons/icon-192x192.png',
  '/Notes/icons/icon-384x384.png',
  '/Notes/icons/icon-512x512.png',
  '/Notes/icons/icon-180x180.png',
  '/Notes/icons/icon-192x192-maskable.png',
  '/Notes/icons/icon-512x512-maskable.png'
];

// Install: pre-cache app shell into both caches for redundancy
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const appShellCache = await caches.open(APP_SHELL_CACHE);
      const dynamicCache = await caches.open(DYNAMIC_CACHE);
      await Promise.all([
        appShellCache.addAll(CACHED_RESOURCES),
        dynamicCache.addAll(CACHED_RESOURCES)
      ]);
      self.skipWaiting();
    })()
  );
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  const validCaches = [APP_SHELL_CACHE, DYNAMIC_CACHE];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => !validCaches.includes(name))
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: serve from caches with fallback (two-layer redundancy)
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    (async () => {
      // 1. Try APP_SHELL_CACHE first
      const shellResponse = await caches.match(event.request, { cacheName: APP_SHELL_CACHE });
      if (shellResponse) return shellResponse;

      // 2. Try DYNAMIC_CACHE next
      const dynamicResponse = await caches.match(event.request, { cacheName: DYNAMIC_CACHE });
      if (dynamicResponse) return dynamicResponse;

      // 3. Fetch from network, then cache in dynamic
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const cache = await caches.open(DYNAMIC_CACHE);
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        // 4. Offline fallback: for navigation requests, serve cached index.html
        if (event.request.mode === 'navigate') {
          const fallbackCache = await caches.match('/Notes/index.html', { cacheName: APP_SHELL_CACHE });
          if (fallbackCache) return fallbackCache;
        }
        throw error;
      }
    })()
  );
});
