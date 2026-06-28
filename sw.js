const CACHE_NAME = 'asomiya-lexicon-v2'; // Incremented version to force clear old cache structures
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './logo.svg'
];

// Install Event - Caching App Shell
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Cleaning Up Old Caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Network First with Cache Fallback for Core Assets & Cloudflare Edge API
self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  // Handle Cloudflare Edge API requests dynamic caching
  if (url.includes('/word/')) {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          // If the lookup is successful, cache it so it works offline
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => caches.match(e.request)) // Offline backup fallback for searched words
    );
    return;
  }

  // Handle standard app assets (HTML, JS, CSS, Logos)
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (response.status === 200 && ASSETS_TO_CACHE.some(asset => url.includes(asset.replace('./', '')))) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});