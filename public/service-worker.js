// __BUILD_ID__ et la liste PRECACHE sont remplacés à chaque build par vite.config.ts.
const BUILD_ID = '__BUILD_ID__';
const CACHE_NAME = `continuite-cinema-${BUILD_ID}`;
const BASE_URL = new URL('./', self.registration.scope);
const PRECACHE = [/*__PRECACHE__*/];
const APP_SHELL = [BASE_URL.href, ...PRECACHE.map((path) => new URL(path, BASE_URL).href)];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // La page d'accueil est indispensable ; les autres fichiers sont mis en cache au mieux (un échec isolé ne bloque pas l'installation).
    await cache.add(BASE_URL.href);
    await Promise.all(APP_SHELL.slice(1).map((url) => cache.add(url).catch(() => undefined)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('continuite-cinema-') && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Navigation : réseau d'abord (nouvelle version dès qu'il y a du réseau), cache en secours hors ligne.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) { const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(BASE_URL.href, copy)); }
      return response;
    }).catch(async () => (await caches.match(BASE_URL.href)) || Response.error()));
    return;
  }

  // Fichiers à nom haché (assets/) : immuables, cache d'abord.
  if (url.pathname.includes('/assets/')) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) { const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)); }
      return response;
    })));
    return;
  }

  // Manifest, icônes, etc. : réseau d'abord pour rester à jour, cache en secours.
  event.respondWith(fetch(request).then((response) => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)); }
    return response;
  }).catch(async () => (await caches.match(request)) || Response.error()));
});
