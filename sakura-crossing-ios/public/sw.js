/* ------------------------------------------------------------------ *
 * Offline cache.
 *
 * Only the home-screen (PWA) build uses this; inside the native shell the
 * files are already on the device.  It exists for the case a phone is
 * actually in -- on a train, in a lift, on airplane mode -- where a game
 * that needs the network to start is a game that does not start.
 *
 * Two strategies, split on what the request is for:
 *
 *   navigation  -> network first, cache as the fallback.  The page names
 *                  the hashed bundle, so serving a stale one pins the app
 *                  to an old build forever.
 *   everything  -> cache first.  Vite fingerprints these, so a given URL's
 *                  contents can never change, and a hit is always correct.
 *
 * The 1.6 MB bundle and the 3.9 MB music track are both cached on first
 * play rather than precached at install: an install that downloads five
 * megabytes before the first frame is worse than one that does not.
 * ------------------------------------------------------------------ */

const VERSION = 'sakura-crossing-v1';

self.addEventListener('install', (event) => {
  // take over as soon as the new worker is ready rather than waiting for
  // every tab to close -- there is only ever one tab of a game
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== VERSION) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(VERSION);
        cache.put(request, fresh.clone());
        return fresh;
      } catch {
        return (await caches.match(request)) || (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const hit = await caches.match(request);
    if (hit) return hit;
    const fresh = await fetch(request);
    /* Range requests are how Safari streams the audio track, and a 206 is
     * not a cacheable response -- putting one in the cache poisons every
     * later full request for the same URL. */
    if (fresh.ok && fresh.status === 200) {
      const cache = await caches.open(VERSION);
      cache.put(request, fresh.clone());
    }
    return fresh;
  })());
});
