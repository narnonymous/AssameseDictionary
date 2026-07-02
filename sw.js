const CACHE_NAME = 'asomiya-lexicon-v5'; 
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/app.js',
  '/dist/output.css',
  '/logo.svg',
  '/logo.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  // Intercept and cache incoming edge queries on the fly
  if (url.includes('/word/')) {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Handle baseline static files
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request) || caches.match('/index.html'))
  );
});