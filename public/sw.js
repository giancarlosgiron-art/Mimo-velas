const CACHE_NAME = 'mimo-admin-v2';

// App shell assets to cache on install
const APP_SHELL = [
  '/',
  '/css/style.css',
  '/js/api.js',
  '/js/dashboard.js',
  '/js/inventory.js',
  '/js/sales.js',
  '/js/customers.js',
  '/js/orders.js',
  '/js/reports.js',
  '/js/expenses.js',
  '/js/main.js',
  '/icon-192.svg',
  '/icon-512.svg',
  '/manifest.json',
];

// Install: pre-cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-only for API calls, network-first for everything else
// (así Gian y Luis ven siempre la última versión; la caché solo se usa sin conexión)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-only for API requests — never cache dynamic data
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request).then((response) => {
      if (response && response.status === 200 && response.type !== 'opaque' && event.request.method === 'GET') {
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
      }
      return response;
    }).catch(() =>
      caches.match(event.request).then((cached) =>
        cached || (event.request.mode === 'navigate' ? caches.match('/') : undefined)
      )
    )
  );
});
