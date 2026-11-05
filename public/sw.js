// Service Worker for Government ITI Raigarh Portal
const CACHE_NAME = 'iti-raigarh-static-v1';
const API_CACHE_NAME = 'iti-raigarh-api-v1';

const STATIC_PRECACHE = [
  '/',
  '/index.html',
  '/assets/aistudio/iti-logo_b32addc6.png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_PRECACHE).catch((err) => {
        console.warn('SW Precache warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== API_CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Skip non-GET requests (mutations like POST/PUT/DELETE handled by app IndexedDB sync queue)
  if (request.method !== 'GET') {
    return;
  }

  // 2. Navigation requests (HTML): Network first with fallback to cached '/' or '/index.html'
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = await caches.match('/');
          if (fallback) return fallback;
          return caches.match('/index.html');
        })
    );
    return;
  }

  // 3. API Read requests (/api/*): Network first with fallback to cached API response
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(API_CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) {
            return cached;
          }
          // Fallback minimal JSON for critical bootstrap if offline
          if (url.pathname === '/api/bootstrap') {
            return new Response(
              JSON.stringify({
                settings: null,
                sessions: [],
                trades: [],
                stats: { totalTrades: 0, totalOfficers: 0, totalTrainees: 0, totalInventoryItems: 0 },
                offline: true,
              }),
              { headers: { 'Content-Type': 'application/json', 'x-offline-fallback': 'true' } }
            );
          }
          return new Response(JSON.stringify({ error: 'Offline mode active. Using cached records.', offline: true }), {
            headers: { 'Content-Type': 'application/json', 'x-offline-error': 'true' },
            status: 503,
          });
        })
    );
    return;
  }

  // 4. Static Assets (scripts, CSS, images, Google Fonts): Cache first, fallback to network
  if (
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'image' ||
    request.destination === 'font' ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        }).catch(() => {
          // If offline and request is an image, could return placeholder
          return new Response('', { status: 408, statusText: 'Offline asset not cached' });
        });
      })
    );
    return;
  }

  // Default: Network with cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
