/* Uniquement les ressources locales explicitement listées ; jamais les données Supabase. */
importScripts('./pwa-assets.js');
const assetURLs = new Set(self.RADIO_ASSETS.map(path => new URL(path, self.registration.scope).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(self.RADIO_CACHE).then(cache => cache.addAll([...assetURLs].map(url => new Request(url, { cache: 'reload' })))));
});
self.addEventListener('activate', event => {
  // Les anciens caches sont conservés : aucun nettoyage automatique non sollicité.
  event.waitUntil(self.clients.claim());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const localEntry = new URL('./local.html', self.registration.scope);
  const isLocalNavigation = request.mode === 'navigate' && url.pathname === localEntry.pathname;
  if (!isLocalNavigation && !assetURLs.has(url.href)) return;
  const key = isLocalNavigation ? localEntry.href : url.href;
  event.respondWith(caches.open(self.RADIO_CACHE).then(async cache => {
    const cached = await cache.match(key);
    return cached || fetch(request);
  }));
});
