const CACHE = "maple-v8-offline-1";
const CORE = [
  "./",
  "./index.html",
  "./export.html",
  "./manifest.webmanifest",
  "./favicon.png",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png",
];

async function putIfOk(cache, request) {
  try {
    const response = await fetch(request, { cache: "reload" });
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return null;
  }
}

async function precacheBuiltAssets(cache, page) {
  const response = await putIfOk(cache, page);
  if (!response) return;
  const html = await response.clone().text();
  const base = new URL(page, self.registration.scope);
  const urls = new Set();
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const value = match[1];
    if (!value || value.startsWith("data:") || value.startsWith("http")) continue;
    const url = new URL(value, base).href;
    if (url.startsWith(self.registration.scope)) urls.add(url);
  }
  await Promise.all([...urls].map((url) => putIfOk(cache, url)));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(CORE.map((url) => putIfOk(cache, url)));
    await precacheBuiltAssets(cache, "./index.html");
    await precacheBuiltAssets(cache, "./export.html");
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("maple-") && name !== CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch {
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      if (request.mode === "navigate") {
        if (url.pathname.endsWith("/export.html")) {
          return (await cache.match("./export.html")) || Response.error();
        }
        return (await cache.match("./index.html")) || Response.error();
      }
      return Response.error();
    }
  })());
});
