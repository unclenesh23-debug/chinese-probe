/* Работа без сети для пробной страницы. Область действия — только папка probe/ (скрипт лежит в ней),
   поэтому приложению «Китайский» не мешает: чужие кэши не трогаем, чужие адреса не перехватываем. */
const V = "p36d475f";
const CACHE = "probe-" + V;
const SHELL = ["./", "index.html", "probe.css", "probe.js", "worklet.js", "manifest.webmanifest", "say.mp3",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png"];
const abs = p => new URL(p, self.registration.scope).href;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(SHELL.map(p => new Request(p, {cache: "reload"}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("probe-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;            // чужие сайты (замеры связи) — мимо
  if (!url.href.startsWith(self.registration.scope)) return;
  // замеры связи всегда идут в сеть, а не в кэш
  if (url.searchParams.has("cold") || /\/(ping\.txt|payload\.bin)$/.test(url.pathname)) return;
  if (req.headers.has("range")) return;                  // звук играем из памяти страницы, кусками не просим
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req.mode === "navigate" ? abs("./") : req, {ignoreSearch: true});
    if (hit) return hit;
    try { return await fetch(req); }
    catch (err) {
      if (req.mode === "navigate") { const idx = await cache.match(abs("index.html")); if (idx) return idx; }
      throw err;
    }
  })());
});
