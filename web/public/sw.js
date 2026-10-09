/*
 * Service worker: permite abrir la app sin señal (la casa del cliente puede no tener cobertura).
 * Siempre intenta primero la red (versión más nueva) y usa la copia guardada solo si no hay conexión.
 */
const CACHE = 'tallerpro-shell-v24';
const SHELL = ['/', '/boot.js', '/manifest.webmanifest', '/favicon.png', '/logo-96.webp', '/logo-384.webp'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  const isPage = e.request.mode === 'navigate';
  const isAsset = url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname);
  if (!isPage && !isAsset) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(isPage ? '/' : e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(isPage ? '/' : e.request).then((hit) => hit || Response.error())),
  );
});
