/* ═══════════════════════════════════════════════════════════
   INAVZN · service worker
   Strategy:
     • App shell (the HTML page)  → NETWORK-FIRST, cache fallback.
       This is the important bit: a fresh deploy is loaded as soon
       as you're online, instead of being stuck on an old cached
       copy. If you're offline, the last cached page is served.
     • Everything else (CDN scripts, fonts, icons) → stale-while-
       revalidate: instant from cache, refreshed in the background.
   Updates activate immediately (skipWaiting + clients.claim); the
   page reloads itself once the new worker takes over.
   Bump CACHE only if you ever need to force-purge cached assets —
   you do NOT need to bump it for normal HTML/code changes.
═══════════════════════════════════════════════════════════ */
const CACHE = 'inavzn-cache-v3';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png'];

self.addEventListener('install', (event) => {
  // Take over as soon as possible so new code isn't left "waiting".
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // allSettled: a single missing optional file must not abort install.
      Promise.allSettled(SHELL.map((url) => cache.add(url)))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const accept = req.headers.get('accept') || '';
  const isPage = req.mode === 'navigate' || accept.includes('text/html');

  if (isPage) {
    // NETWORK-FIRST — always try to fetch the freshest page.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // STALE-WHILE-REVALIDATE for other assets.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
