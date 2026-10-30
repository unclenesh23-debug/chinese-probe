/* Проба 2: работа без сети + журнал service worker.
   Журнал (IndexedDB «probe-swlog») пишет, вызывали ли его при каждом открытии и что он отдал, —
   так по отчёту видно, почему страница не открылась без сети (проба 1, 30.10: кэш был, а не открылась).
   Страницу отдаём новым ответом из байтов кэша: без пометки «перенаправлен», которую Safari для страницы не принимает. */
const V = "pea993a3";
const CACHE = "probe-" + V;
const SHELL = ["./", "index.html", "probe.css", "probe.js", "worklet.js", "manifest.webmanifest", "say3.mp3", "ping.txt",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png"];
const MATCH = { ignoreSearch: true, ignoreVary: true };
const abs = p => new URL(p, self.registration.scope).href;
const short = u => String(u).replace(self.registration.scope, "./");
const errText = e => String((e && e.message) || e).slice(0, 160);

function openLog() {
  return new Promise((ok, bad) => {
    const r = indexedDB.open("probe-swlog", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("ev", { autoIncrement: true });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => bad(r.error);
  });
}
async function log(ev) {
  try {
    const db = await openLog();
    await new Promise(done => {
      const tx = db.transaction("ev", "readwrite"), st = tx.objectStore("ev");
      st.add(Object.assign({ t: Date.now(), v: V, on: self.navigator.onLine }, ev));
      const c = st.count();
      c.onsuccess = () => { // держим последние 150 событий
        let extra = c.result - 150;
        if (extra > 0) st.openCursor().onsuccess = e => { const cur = e.target.result; if (cur && extra-- > 0) { cur.delete(); cur.continue(); } };
      };
      tx.oncomplete = tx.onerror = tx.onabort = () => done();
    });
    db.close();
  } catch (e) {}
}

const FALLBACK = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Проба</title></head>
<body style="font:17px -apple-system,system-ui,sans-serif;padding:calc(env(safe-area-inset-top) + 24px) 20px 24px;background:#121413;color:#f2f2ef">
<h2 style="margin:0 0 12px">Проба: нет страницы в памяти</h2>
<p>Service worker ответил (это хорошо), но сохранённой страницы у него нет, а сети нет. Включи сеть и VPN, открой «Пробу» снова — дальше она расскажет Claude, что было.</p>
<p style="opacity:.6;font-size:14px">версия ${V}</p></body></html>`;

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const t0 = Date.now();
    try {
      const c = await caches.open(CACHE);
      await c.addAll(SHELL.map(p => new Request(p, { cache: "reload" })));
      await log({ k: "install", ok: true, n: SHELL.length, ms: Date.now() - t0 });
    } catch (err) {
      await log({ k: "install", ok: false, err: errText(err), ms: Date.now() - t0 });
      throw err;
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    let old = 0;
    for (const k of await caches.keys()) if (k.startsWith("probe-") && k !== CACHE) { await caches.delete(k); old++; }
    await self.clients.claim();
    const wins = await self.clients.matchAll({ type: "window" });
    let moved = 0;
    // обновление со старой версии: открытую старую страницу сразу перезагружаем в новую (не ждём — иначе встанем сами себе в очередь)
    if (old) for (const w of wins) { try { if (w.navigate) { w.navigate(w.url).catch(() => {}); moved++; } } catch (err) {} }
    await log({ k: "activate", old, wins: wins.length, moved });
  })());
});

async function page(req) {
  const t0 = Date.now(), ev = { k: "page", url: short(req.url) };
  let res;
  try {
    const c = await caches.open(CACHE);
    let hit = await c.match(abs("./"), MATCH), from = "кэш ./";
    if (!hit) { hit = await c.match(abs("index.html"), MATCH); from = "кэш index.html"; }
    if (!hit) {
      for (const k of await caches.keys()) {
        if (!k.startsWith("probe-")) continue;
        hit = await (await caches.open(k)).match(abs("index.html"), MATCH);
        if (hit) { from = "старый кэш " + k; break; }
      }
    }
    if (hit) {
      ev.from = from; ev.st = hit.status; ev.redir = hit.redirected; ev.type = hit.type;
      res = new Response(await hit.blob(), { status: 200, statusText: "OK", headers: { "Content-Type": "text/html; charset=utf-8" } });
    } else {
      ev.from = "сеть (в памяти страницы нет)";
      const net = await fetch(req);
      ev.st = net.status; ev.redir = net.redirected;
      res = net.redirected ? new Response(await net.blob(), { status: net.status, statusText: net.statusText, headers: net.headers }) : net;
    }
  } catch (err) {
    ev.from = "запасная страница"; ev.err = errText(err);
    res = new Response(FALLBACK, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  ev.ms = Date.now() - t0;
  return { res, ev };
}

async function file(req) {
  const hit = await (await caches.open(CACHE)).match(req, MATCH);
  if (hit) return hit;
  try { return await fetch(req); }
  catch (err) { await log({ k: "miss", url: short(req.url), err: errText(err) }); throw err; }
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (url.searchParams.has("cold")) return; // проверка связи — всегда в сеть
  if (req.mode === "navigate") {
    const job = page(req);
    e.respondWith(job.then(r => r.res));
    e.waitUntil(job.then(r => log(r.ev)));
    return;
  }
  if (req.headers.has("range")) return; // звук играем из памяти страницы, кусками не просим
  e.respondWith(file(req));
});
