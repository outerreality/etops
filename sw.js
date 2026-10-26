/* ETOPS Checklist – offline support.
   Checklist files: tries the internet first (so updates show up), falls back to the saved copy when offline.
   Fonts: saved copy first. ARINC HF requests are not touched. */
const CACHE = "etops-v1";
const FILES = ["./", "./index.html", "./config.js", "./manifest.webmanifest", "./icon-180.png", "./icon-512.png"];
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(FILES);
    try {   /* save the Inter font so it works offline from the first use */
      const css = await fetch(FONT_CSS);
      await c.put(FONT_CSS, css.clone());
      const urls = [...(await css.text()).matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
      await Promise.all(urls.map(u => fetch(u).then(r => c.put(u, r)).catch(() => {})));
    } catch (err) {}
    self.skipWaiting();
  })());
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.match(req.url).then(hit => hit || fetch(req).then(r => {
      const copy = r.clone(); caches.open(CACHE).then(c => c.put(req.url, copy)); return r;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try {
      /* "no-cache" makes the iPad check GitHub for a newer copy every time instead of reusing one for up to 10 minutes */
      const net = await Promise.race([fetch(req.url, { cache: "no-cache", credentials: "same-origin" }),
                                      new Promise((_, no) => setTimeout(() => no(0), 4000))]);
      if (net && net.ok) c.put(req, net.clone());
      return net;
    } catch (err) {
      return (await c.match(req, { ignoreSearch: true })) ||
             (req.mode === "navigate" ? await c.match("./index.html") : undefined) ||
             new Response("Offline", { status: 503 });
    }
  })());
});
