/* Growth Intelligence service worker. Vanilla JS, no build step (pwa-offline skill pattern).
 *
 *  static assets (/_next/static, /icons, fonts)  -> cache-first
 *  page navigations                               -> network-first, then last cached copy, then /offline
 *  server actions, RSC fetches, everything else   -> network only (never cached)
 *
 * Bump VERSION when static caching rules change.
 */
const VERSION = "v2";
const STATIC_CACHE = `gi-static-${VERSION}`;
const PAGE_CACHE = `gi-pages-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const MAX_PAGES = 40;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGE_CACHE).then((c) => c.add(new Request(OFFLINE_URL, { cache: "reload" }))));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("gi-") && ![STATIC_CACHE, PAGE_CACHE].includes(k)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "clear-pages") caches.delete(PAGE_CACHE);
  if (event.data === "skip-waiting") self.skipWaiting();
});

async function trimPages() {
  const cache = await caches.open(PAGE_CACHE);
  const keys = await cache.keys();
  const pages = keys.filter((r) => new URL(r.url).pathname !== OFFLINE_URL);
  for (let i = 0; i < pages.length - MAX_PAGES; i++) await cache.delete(pages[i]);
}

function isStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/__nextjs_font/") ||
    /\.(?:woff2?|svg|png|jpg|webp|ico)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // server actions are POST: always network
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/login" || url.pathname.startsWith("/api/")) return;
  if (req.headers.get("RSC") || url.searchParams.has("_rsc")) return; // let Next fall back to a full navigation offline

  if (isStatic(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok && res.type === "basic" && !res.redirected) {
            const cache = await caches.open(PAGE_CACHE);
            await cache.put(req, res.clone());
            trimPages();
          }
          return res;
        } catch {
          const cache = await caches.open(PAGE_CACHE);
          return (await cache.match(req, { ignoreSearch: false })) || (await cache.match(OFFLINE_URL)) || Response.error();
        }
      })()
    );
  }
});
