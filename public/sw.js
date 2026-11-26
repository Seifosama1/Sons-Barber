const CACHE_NAME = 'sons-barber-static-v3';
const DATA_CACHE_NAME = 'sons-barber-data-v3';

// Only cache immutable media and offline fallback assets
const ASSETS_TO_CACHE = [
  '/app-icon-gold.png',
  '/app-icon.jpg',
  '/favicon.svg',
  '/scissors.svg'
];

// Install: Cache icons and assets, then activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

// Activate: Immediately purge all old caches and claim existing clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME && key !== DATA_CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Listen for explicit SKIP_WAITING message
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 1. HTML Documents (Navigation requests, /, /barber, /client, etc.)
  // NEVER serve stale cached HTML when online!
  // Always fetch latest HTML from network so the latest bundled script hash is loaded.
  // Only fall back to cached index.html when user is completely offline.
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/offline-index.html', clone));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match('/offline-index.html') || await caches.match('/index.html');
          return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
        })
    );
    return;
  }

  // 2. Supabase REST calls (Allow offline viewing of latest fetched data)
  if (url.origin.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(DATA_CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 3. Vite hashed assets (/assets/index-[hash].js, .css, images, fonts)
  // These files have unique content hashes in their filename upon every deployment.
  // Cache First with network fallback is safe because their URL changes every build.
  if (url.pathname.startsWith('/assets/') || url.pathname.match(/\.(png|jpg|jpeg|svg|woff2?)$/i)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 4. Default: Network first
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
