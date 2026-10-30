/* Проба для iPhone хозяина: сама прогоняет проверки и ведёт по шагам там, где нужен человек.
   Ничего никуда не отправляет: результаты лежат в памяти этой страницы, отчёт копируется кнопкой.
   Пишу без «?.» и «??», чтобы скрипт запустился и на старом iPhone (тогда страница честно скажет «iOS слишком старая»). */
(function () {
  "use strict";
  window.__probeBoot = true;
  var VER = "p36d475f";
  var KEY = "zhprobe.v1";
  var doc = document;

  /* ---------------------------------------------------------------- мелочи */
  function $(id) { return doc.getElementById(id); }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { for (var i = 0; i < c.length; i++) add(el, c[i]); return; }
    el.appendChild(typeof c === "object" ? c : doc.createTextNode(String(c)));
  }
  function h(tag, attrs) {
    var el = doc.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        var v = attrs[k];
        if (v == null || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k === "svg") el.innerHTML = v; // только свои статические значки
        else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? "" : v);
      }
    }
    for (var j = 2; j < arguments.length; j++) add(el, arguments[j]);
    return el;
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function fmtDate(t) { var d = new Date(t); return pad2(d.getDate()) + "." + pad2(d.getMonth() + 1) + "." + d.getFullYear() + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()); }
  function fmtClock(t) { var d = new Date(t); return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds()); }
  function secs(ms) { return (ms / 1000).toFixed(ms < 10000 ? 2 : 1).replace(".", ",") + " с"; }
  function ms0(ms) { return Math.round(ms) + " мс"; }
  function kbs(n) { return Math.round(n / 1024) + " КБ"; }
  function dbs(x) { return (x <= -100 ? "−∞" : String(Math.round(x)).replace("-", "−")) + " дБ"; }
  function mmss(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ":" + pad2(s % 60); }
  function rnd() { return Math.random().toString(36).slice(2, 10); }
  function median(a) { var b = a.slice().sort(function (x, y) { return x - y; }); return b.length ? b[Math.floor(b.length / 2)] : 0; }

  /* ---------------------------------------------------------------- состояние (в памяти страницы) */
  function fresh() { return { v: 1, step: 0, res: {}, net: {}, launches: [], seq: [], errs: [], manualIos: "", answers: {}, persist: null, started: Date.now(), back: 1 }; }
  var S = null, storeOK = true;
  function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && s.v === 1) return s; } catch (e) { storeOK = false; } return null; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { storeOK = false; } }
  function logSeq(ev) { S.seq.push(fmtClock(Date.now()) + " " + ev); if (S.seq.length > 90) S.seq.shift(); save(); }
  var E = {}; // что идёт прямо сейчас (не сохраняется)

  /* ---------------------------------------------------------------- где мы и какой iPhone */
  var UA = navigator.userAgent || "";
  function detectMode() {
    var sa = navigator.standalone, dm = false;
    try { dm = matchMedia("(display-mode: standalone)").matches; } catch (e) {}
    if (sa === true || dm) return "home";
    if (/MicroMessenger|WeChat|Telegram|FBAN|FBAV|Instagram|Line\/|MQQBrowser|QQ\/|Weibo|DingTalk|Alipay|TikTok|musical_ly|Snapchat|Twitter/i.test(UA)) return "inapp";
    if (sa === undefined && /iPhone|iPad|iPod/.test(UA) && !/Safari\//.test(UA)) return "inapp"; // встроенный просмотрщик
    return "safari";
  }
  var MODE = detectMode();
  function modeName(m) { return m === "home" ? "с экрана «Домой»" : (m === "safari" ? "в Safari" : "внутри другого приложения"); }
  function iosInfo() {
    var isApple = /iPhone|iPad|iPod/.test(UA);
    var ipadDesktop = !isApple && /Macintosh/.test(UA) && (navigator.maxTouchPoints || 0) > 1;
    var m = /OS (\d+)[_.](\d+)(?:[_.](\d+))?/.exec(UA), v = /Version\/(\d+)(?:\.(\d+))?/.exec(UA);
    var os = isApple && m ? m[1] + "." + m[2] + (m[3] ? "." + m[3] : "") : null;
    var sf = v ? v[1] + "." + (v[2] || "0") : null;
    var o = { isApple: isApple, ipadDesktop: ipadDesktop, os: os, sf: sf, major: null, minor: 0, src: "" };
    if (isApple && v) { o.major = +v[1]; o.minor = +(v[2] || 0); o.src = "по Safari " + sf; }
    else if (isApple && m) { o.major = +m[1]; o.minor = +m[2]; o.src = "по строке браузера"; }
    return o;
  }
  var IOS = iosInfo();
  function effIos() {
    var man = String(S.manualIos || "").trim().replace(",", ".");
    var m = /^(\d+)(?:\.(\d+))?/.exec(man);
    if (m) return { major: +m[1], minor: +(m[2] || 0), text: m[1] + (m[2] ? "." + m[2] : ""), src: "вписано тобой" };
    if (IOS.major != null) return { major: IOS.major, minor: IOS.minor, text: IOS.major + "." + IOS.minor, src: IOS.src };
    return { major: null, minor: 0, text: "?", src: "" };
  }

  /* ---------------------------------------------------------------- таблица проверок (порядок = порядок в итоге) */
  var CHECKS = [
    ["ios", "Телефон и страница", "Версия iOS"],
    ["home", "Телефон и страница", "Запущена с экрана «Домой»"],
    ["https", "Телефон и страница", "Защищённое соединение (https)"],
    ["cache", "Телефон и страница", "Страница сохранена в телефоне"],
    ["persist", "Телефон и страница", "iPhone обещает не стирать данные"],
    ["audiosession", "Телефон и страница", "Режим звука (audioSession) есть"],
    ["mediasession", "Телефон и страница", "Кнопки на экране блокировки (Media Session) есть"],
    ["topbar", "Экран", "Строка состояния видна"],
    ["kb", "Экран", "Клавиатура не закрывает кнопку"],
    ["net_on", "Связь", "Связь при включённом VPN"],
    ["net_off", "Связь", "Связь без VPN"],
    ["open", "Связь", "Открытие страницы"],
    ["offline", "Без сети", "Открывается без сети из сохранённого"],
    ["mic", "Звук", "Микрофон в режиме «Домой»"],
    ["worklet", "Звук", "Сырой звук для проверки тонов (AudioWorklet)"],
    ["vol_now", "Звук", "Громкость после записи — как сейчас"],
    ["vol_fix", "Звук", "Громкость после записи — с исправлением"],
    ["silent", "Звук", "Речь при беззвучном переключателе"],
    ["silent_wa", "Звук", "Сигнал Web Audio при беззвучном (не важно)"],
    ["lock", "Звук", "Звук при погашенном экране"],
    ["lockui", "Звук", "Название и кнопки на экране блокировки"]
  ];
  var HOME_SENSITIVE = { persist: 1, topbar: 1, kb: 1, open: 1, offline: 1, mic: 1, worklet: 1, vol_now: 1, vol_fix: 1, silent: 1, silent_wa: 1, lock: 1, lockui: 1 };
  var MK = { ok: "✓", bad: "✗", warn: "!", todo: "○", info: "·", live: "…" };
  function setRes(id, st, msg) { S.res[id] = { st: st, msg: msg, mode: MODE, at: Date.now() }; save(); }
  function getRes(id) { return S.res[id] || null; }
  function counts() {
    var c = { ok: 0, bad: 0, warn: 0, todo: 0 };
    CHECKS.forEach(function (k) { var r = S.res[k[0]]; var st = r ? r.st : "todo"; if (c[st] != null) c[st]++; });
    return c;
  }

  /* ---------------------------------------------------------------- сеть: замеры */
  function timedFetch(url, o, limit) {
    var ctl = ("AbortController" in window) ? new AbortController() : null;
    var t0 = performance.now(), timer = null, timedOut = false;
    var opt = { cache: "no-store", credentials: "omit", redirect: "follow" };
    if (o) { for (var k in o) { if (k !== "read" && k !== "text") opt[k] = o[k]; } }
    if (ctl) { opt.signal = ctl.signal; timer = setTimeout(function () { timedOut = true; ctl.abort(); }, limit); }
    var main = fetch(url, opt).then(function (r) {
      var body = o && o.read ? r.arrayBuffer() : (o && o.text ? r.text() : Promise.resolve(null));
      return body.then(function (b) {
        clearTimeout(timer);
        return { ok: true, ms: performance.now() - t0, status: r.status, type: r.type, bytes: b && b.byteLength != null ? b.byteLength : 0, text: typeof b === "string" ? b : null };
      });
    }).catch(function (e) {
      clearTimeout(timer);
      return { ok: false, ms: performance.now() - t0, err: timedOut ? "нет ответа за " + Math.round(limit / 1000) + " с" : ((e && e.message) || "ошибка") };
    });
    if (ctl) return main;
    return Promise.race([main, sleep(limit).then(function () { return { ok: false, ms: limit, err: "нет ответа за " + Math.round(limit / 1000) + " с" }; })]);
  }
  // true — связь есть, false — нет совсем (запрос отвергнут сразу, как в авиарежиме), "slow" — не ответила за 6 с (очень медленно или закрыто)
  function quickNet() { return timedFetch("ping.txt?r=" + rnd(), null, 6000).then(function (r) { return r.ok ? true : (/нет ответа/.test(r.err || "") ? "slow" : false); }); }

  var TARGETS = [
    { id: "gh", name: "github.io (сайт приложения)", url: "ping.txt" },
    { id: "api", name: "api.github.com (прогресс)", url: "https://api.github.com/zen", nocors: true },
    { id: "cf", name: "cloudflare.com", url: "https://www.cloudflare.com/cdn-cgi/trace", trace: true },
    // chinese-probe-ping.workers.dev не существует (DNS 28.10: Non-existent domain) — проверяем сам домен workers.dev: он есть и стоит на тех же адресах Cloudflare
    { id: "wk", name: "workers.dev (будущий «ящик»)", url: "https://workers.dev/", nocors: true }
  ];
  function parseTrace(t) { var o = {}; String(t || "").split("\n").forEach(function (l) { var i = l.indexOf("="); if (i > 0) o[l.slice(0, i)] = l.slice(i + 1).trim(); }); return o; }
  async function pingOne(t) {
    var oks = [], err = null, loc = null, colo = null, i, r;
    for (i = 0; i < 3; i++) {
      var u = t.url + (t.url.indexOf("?") < 0 ? "?" : "&") + "r=" + rnd();
      if (t.trace) {
        r = await timedFetch(u, { mode: "cors", text: true, referrerPolicy: "no-referrer" }, 10000);
        if (r.ok && r.text) { var tr = parseTrace(r.text); if (tr.loc) { loc = tr.loc; colo = tr.colo || null; } }
        else if (!r.ok && /нет ответа/.test(r.err || "")) { /* не ответил совсем — второй раз не ждём */ }
        else { r = await timedFetch(u, { mode: "no-cors", referrerPolicy: "no-referrer" }, 10000); }
      } else if (t.nocors) {
        r = await timedFetch(u, { mode: "no-cors", referrerPolicy: "no-referrer" }, 10000);
      } else {
        r = await timedFetch(u, { text: true }, 10000);
      }
      if (r.ok) oks.push(r.ms); else err = r.err;
    }
    return { ok: oks.length > 0, okCount: oks.length, ms: median(oks), max: oks.length ? Math.max.apply(null, oks) : 0, err: oks.length ? null : err, loc: loc, colo: colo };
  }
  async function measureNet(label, upd) {
    var rec = { label: label, at: Date.now(), ping: {}, loc: null, colo: null, shell: null, payload: null };
    await Promise.all(TARGETS.map(async function (t) {
      var r = await pingOne(t);
      rec.ping[t.id] = r;
      if (r.loc) { rec.loc = r.loc; rec.colo = r.colo; }
      if (upd) upd(rec);
    }));
    if (!rec.ping.gh || !rec.ping.gh.ok) {
      rec.shell = { skipped: true }; rec.payload = { skipped: true };
      if (upd) upd(rec);
      return rec;
    }
    var files = ["index.html", "probe.css", "probe.js", "manifest.webmanifest"];
    var t0 = performance.now();
    var rs = await Promise.all(files.map(function (f) { return timedFetch(f + "?cold=" + rnd(), { read: true }, 25000); }));
    var allOk = rs.every(function (r) { return r.ok; });
    rec.shell = { ok: allOk, ms: performance.now() - t0, bytes: rs.reduce(function (a, r) { return a + (r.bytes || 0); }, 0), n: files.length, err: allOk ? null : (rs.filter(function (r) { return !r.ok; })[0] || {}).err };
    if (upd) upd(rec);
    var p = await timedFetch("payload.bin?cold=" + rnd(), { read: true }, 40000);
    rec.payload = { ok: p.ok, ms: p.ms, bytes: p.bytes, kbps: p.ok && p.ms > 0 ? (p.bytes / 1024) / (p.ms / 1000) : 0, err: p.ok ? null : p.err };
    if (upd) upd(rec);
    return rec;
  }
  function pingLine(t, r) { // [статус, текст] для одной строки
    if (!r) return ["live", t.name + ": проверяю…"];
    if (!r.ok) return ["bad", t.name + ": не отвечает", r.err];
    if (r.okCount < 3) return ["warn", t.name + ": отвечает " + r.okCount + " из 3 раз", "в среднем " + ms0(r.ms) + ", самый долгий " + ms0(r.max)];
    return ["ok", t.name + ": " + ms0(r.ms)];
  }
  var SHORT = { gh: "github.io", api: "api.github.com", cf: "cloudflare", wk: "workers.dev" };
  function netText(rec) {
    var parts = TARGETS.map(function (t) {
      var r = rec.ping[t.id];
      if (!r) return SHORT[t.id] + " ?";
      return SHORT[t.id] + " " + (r.ok ? (r.okCount < 3 ? r.okCount + " из 3, " : "") + ms0(r.ms) : "НЕ отвечает");
    });
    var s = parts.join(" · ");
    if (rec.shell && rec.shell.skipped) s += "; страницу целиком не грузил (github.io не отвечает)";
    else if (rec.shell) s += "; страница целиком (" + rec.shell.n + " файла, " + kbs(rec.shell.bytes) + "): " + (rec.shell.ok ? secs(rec.shell.ms) : "не загрузилась — " + rec.shell.err);
    if (rec.payload && rec.payload.ok) s += "; 256 КБ за " + secs(rec.payload.ms) + " (" + Math.round(rec.payload.kbps) + " КБ/с)";
    else if (rec.payload && !rec.payload.skipped) s += "; 256 КБ не скачались — " + rec.payload.err;
    if (rec.loc) s += "; Cloudflare видит выход из страны " + rec.loc + (rec.colo ? " (узел " + rec.colo + ")" : "");
    return s;
  }
  function judgeNet(rec) {
    var gh = rec.ping.gh, st = "ok";
    if (!gh || !gh.ok) st = "bad";
    else {
      var weak = TARGETS.some(function (t) { var r = rec.ping[t.id]; return !r || !r.ok || r.okCount < 3; });
      if (weak || (rec.shell && !rec.shell.ok) || (rec.payload && !rec.payload.ok)) st = "warn";
    }
    return st;
  }

  /* ---------------------------------------------------------------- звук */
  var sayURL = null, sayPromise = null, sayErr = null;
  function audioEl() { return $("aud"); }
  function setSession(type) { try { if (navigator.audioSession) { navigator.audioSession.type = type; return navigator.audioSession.type; } } catch (e) {} return null; }
  function getSession() { try { if (navigator.audioSession) return navigator.audioSession.type; } catch (e) {} return null; }
  function preloadSay() {
    if (sayPromise) return sayPromise;
    sayPromise = fetch("say.mp3").then(function (r) { if (!r.ok) throw new Error("say.mp3: " + r.status); return r.blob(); })
      .then(function (b) { sayURL = URL.createObjectURL(new Blob([b], { type: "audio/mpeg" })); sayErr = null; return sayURL; })
      .catch(function (e) { sayErr = String((e && e.message) || e); sayPromise = null; return null; });
    return sayPromise;
  }
  function playOnce(url) { // вызывать прямо из нажатия: iPhone требует «касание» для первого звука
    var a = audioEl();
    a.loop = false;
    if (a.getAttribute("data-src") !== url) { a.src = url; a.setAttribute("data-src", url); }
    try { a.currentTime = 0; } catch (e) {}
    var p;
    try { p = a.play(); } catch (e) { return Promise.resolve({ ok: false, why: (e && e.name) || "play" }); }
    return new Promise(function (resolve) {
      var done = false, tm = null;
      function fin(ok, why) { if (done) return; done = true; clearTimeout(tm); a.removeEventListener("ended", onEnd); a.removeEventListener("error", onErr); resolve({ ok: ok, why: why }); }
      function onEnd() { fin(true, "ended"); }
      function onErr() { fin(false, "ошибка звука " + (a.error ? a.error.code : "?")); }
      a.addEventListener("ended", onEnd); a.addEventListener("error", onErr);
      tm = setTimeout(function () { fin(true, "timeout"); }, 15000);
      if (p && p.catch) p.catch(function (e) { fin(false, (e && e.name) || "play-failed"); });
    });
  }
  function stopAudio() { var a = audioEl(); try { a.pause(); } catch (e) {} }

  /* длинная дорожка для проверки «погашенный экран»: 3 минуты, нота раз в секунду, низкий гонг раз в 10 секунд */
  function makeWav(seconds) {
    var sr = 16000, n = seconds * sr, buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf);
    function str(o, s) { for (var i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); }
    str(0, "RIFF"); dv.setUint32(4, 36 + n * 2, true); str(8, "WAVE"); str(12, "fmt ");
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    str(36, "data"); dv.setUint32(40, n * 2, true);
    var scale = [0, 2, 4, 7, 9, 12, 9, 7, 4, 2], notes = [], gong = new Int16Array(sr), i, k;
    for (k = 0; k < scale.length; k++) {
      var f = 523.25 * Math.pow(2, scale[k] / 12), a = new Int16Array(sr);
      for (i = 0; i < sr * 0.9; i++) {
        var t = i / sr, env = Math.min(1, t / 0.005) * Math.exp(-t * 4.5);
        a[i] = Math.round((Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t)) * env * 0.3 * 32767);
      }
      notes.push(a);
    }
    for (i = 0; i < sr; i++) { var tg = i / sr; gong[i] = Math.round(Math.sin(2 * Math.PI * 196 * tg) * Math.exp(-tg * 2.2) * 0.45 * 32767); }
    var out = new Int16Array(buf, 44, n);
    for (var s = 0; s < seconds; s++) {
      var src = notes[s % notes.length], o = s * sr, g = (s % 10 === 0);
      for (i = 0; i < sr; i++) { var v = src[i] + (g ? gong[i] : 0); out[o + i] = v > 32767 ? 32767 : (v < -32768 ? -32768 : v); }
    }
    return new Blob([buf], { type: "audio/wav" });
  }

  /* ---------------------------------------------------------------- микрофон */
  function permState() {
    try { if (navigator.permissions && navigator.permissions.query) return navigator.permissions.query({ name: "microphone" }).then(function (p) { return p.state; }, function () { return "?"; }); } catch (e) {}
    return Promise.resolve("?");
  }
  function dbOf(x) { return x > 1e-9 ? 20 * Math.log10(x) : -120; }
  function noMic(name, text) { var e = new Error(text); e.name = name; return e; }
  async function recordMic(seconds, onLevel) {
    var info = { worklet: false }, frames = [], peak = 0, tick = null, ctx = null, src = null, stream = null;
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) throw noMic("NoAPI", "у страницы нет микрофона");
    // iPhone пускает к микрофону и звуку только из «касания»: всё нужное запускаем сразу, до первого await
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw noMic("NoAPI", "нет AudioContext");
    ctx = new AC();
    try { var rp = ctx.resume(); if (rp && rp.catch) rp.catch(function () {}); } catch (e0) {}
    var permP = permState();
    var gum = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    info.permBefore = await permP;
    try {
      stream = await Promise.race([gum, sleep(30000).then(function () { throw noMic("AbortError", "iPhone не ответил про микрофон за 30 с"); })]);
    } catch (e1) { try { ctx.close(); } catch (e2) {} throw e1; }
    info.permAfter = await permState();
    try { info.settings = stream.getAudioTracks()[0].getSettings(); } catch (e3) {}
    try {
      if (ctx.state !== "running") { try { await Promise.race([ctx.resume(), sleep(1500)]); } catch (e4) {} }
      info.ctxState = ctx.state;
      info.sampleRate = ctx.sampleRate;
      src = ctx.createMediaStreamSource(stream);
      var node = null;
      try {
        if (ctx.audioWorklet) {
          await ctx.audioWorklet.addModule("worklet.js");
          node = new AudioWorkletNode(ctx, "lvl");
          node.port.onmessage = function (ev) { frames.push(ev.data.rms); if (ev.data.peak > peak) peak = ev.data.peak; if (onLevel) onLevel(ev.data.rms); };
          var sink = ctx.createGain(); sink.gain.value = 0; node.connect(sink); sink.connect(ctx.destination);
          src.connect(node);
          info.worklet = true;
        }
      } catch (e8) { info.workletErr = (e8 && e8.name ? e8.name + ": " : "") + ((e8 && e8.message) || ""); node = null; }
      if (!node) { // запасной путь: обычный измеритель
        var an = ctx.createAnalyser(); an.fftSize = 2048;
        var bytes = new Uint8Array(an.fftSize);
        src.connect(an);
        tick = setInterval(function () {
          an.getByteTimeDomainData(bytes);
          var s = 0, p = 0, i;
          for (i = 0; i < bytes.length; i++) { var x = (bytes[i] - 128) / 128; s += x * x; var a = x < 0 ? -x : x; if (a > p) p = a; }
          var rms = Math.sqrt(s / bytes.length); frames.push(rms); if (p > peak) peak = p; if (onLevel) onLevel(rms);
        }, 50);
      }
      await sleep(seconds * 1000);
    } finally {
      if (tick) clearInterval(tick);
      try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e5) {}
      try { if (src) src.disconnect(); } catch (e6) {}
      try { await ctx.close(); } catch (e7) {}
    }
    info.sessionAfter = getSession();
    info.frames = frames.length;
    info.peakDb = dbOf(peak);
    var voiced = frames.filter(function (r) { return dbOf(r) > -45; });
    info.voicedPct = frames.length ? Math.round(100 * voiced.length / frames.length) : 0;
    info.rmsDb = voiced.length ? dbOf(Math.sqrt(voiced.reduce(function (a, r) { return a + r * r; }, 0) / voiced.length)) : -120;
    return info;
  }
  function micErr(e) {
    var n = (e && e.name) || "Error";
    if (n === "NotAllowedError" || n === "PermissionDeniedError") return ["iPhone не дал доступ к микрофону", "Закрой приложение, открой снова и на вопрос про микрофон нажми «Разрешить». Если запретил насовсем: Настройки → Safari → Микрофон → «Спрашивать»."];
    if (n === "NotFoundError" || n === "OverconstrainedError") return ["микрофон не найден", "Проверь, что микрофон не закрыт чехлом, и попробуй ещё раз."];
    if (n === "NotReadableError" || n === "AbortError") return ["микрофон занят другим приложением", "Закрой разговор, запись или звонок и попробуй ещё раз."];
    if (n === "NoAPI" || n === "SecurityError" || n === "TypeError") return ["у страницы нет микрофона", "Открой страницу в Safari или с «Домой», не из WeChat/Telegram."];
    return ["ошибка микрофона (" + n + ")", ((e && e.message) || "").slice(0, 120)];
  }
  function judgeMic(i) {
    var d = "уровень: пик " + dbs(i.peakDb) + ", голос " + dbs(i.rmsDb) + ", говорил " + i.voicedPct + "% времени; частота " + (i.sampleRate || "?") + " Гц; AudioContext: " + (i.ctxState || "?") + "; разрешение: было «" + i.permBefore + "», стало «" + i.permAfter + "»";
    var clip = i.peakDb > -1 ? " Сигнал упирается в максимум (слишком громко)." : "";
    if (!i.frames) return { st: "bad", msg: "запись не пошла (ни одного отсчёта). " + d };
    if (i.peakDb < -70) return { st: "bad", msg: "микрофон открылся, но слышна тишина. " + d };
    if (i.peakDb < -30 || i.voicedPct < 8) return { st: "warn", msg: "микрофон работает, но очень тихо или ты почти не говорил. " + d + clip };
    return { st: "ok", msg: "микрофон открылся и слышит. " + d + clip };
  }

  /* ---------------------------------------------------------------- «погашенный экран» и Media Session */
  var LK = { phase: "idle", url: null, hidden: [], h: null, actions: {}, events: [], timer: null };
  function prepLock() {
    if (LK.url || LK.preparing) return;
    LK.preparing = true;
    setTimeout(function () {
      try { LK.url = URL.createObjectURL(makeWav(180)); } catch (e) { LK.err = String((e && e.message) || e); }
      LK.preparing = false;
      if (curId() === "lock") render();
    }, 30);
  }
  function setupMediaSession() {
    if (!("mediaSession" in navigator)) return false;
    var ms = navigator.mediaSession, a = audioEl();
    try {
      ms.metadata = new MediaMetadata({
        title: "Проба: звук при погашенном экране", artist: "Китайский", album: "Проба",
        artwork: [{ src: "icons/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" }]
      });
    } catch (e) {}
    function on(name, fn) { try { ms.setActionHandler(name, function (d) { LK.actions[name] = (LK.actions[name] || 0) + 1; LK.events.push(fmtClock(Date.now()) + " кнопка «" + name + "»"); try { fn(d); } catch (e) {} if (curId() === "lock") render(); }); } catch (e) {} }
    on("play", function () { a.play(); });
    on("pause", function () { a.pause(); });
    on("stop", function () { a.pause(); });
    on("seekbackward", function () { a.currentTime = Math.max(0, a.currentTime - 10); });
    on("seekforward", function () { a.currentTime = Math.min(a.duration || 1e9, a.currentTime + 10); });
    on("previoustrack", function () { a.currentTime = 0; });
    on("nexttrack", function () { a.currentTime = Math.min((a.duration || 1e9) - 1, a.currentTime + 30); });
    return true;
  }
  function lockAudioEvents() {
    var a = audioEl();
    ["play", "pause", "ended", "waiting", "stalled", "error"].forEach(function (n) {
      a.addEventListener(n, function () {
        if (LK.phase !== "play") return;
        LK.events.push(fmtClock(Date.now()) + " звук: " + n + (doc.hidden ? " (экран скрыт)" : ""));
        if (LK.events.length > 40) LK.events.shift();
        try { if ("mediaSession" in navigator && (n === "play" || n === "pause" || n === "ended")) navigator.mediaSession.playbackState = n === "play" ? "playing" : "paused"; } catch (e) {}
      });
    });
  }
  function startLock() {
    if (!LK.url) { toast("Дорожка ещё готовится — секунду"); prepLock(); return; }
    var a = audioEl();
    setSession("playback");
    LK.ms = setupMediaSession();
    a.src = LK.url; a.setAttribute("data-src", LK.url); a.loop = false;
    try { a.currentTime = 0; } catch (e) {}
    LK.phase = "play"; LK.t0 = Date.now(); LK.hidden = []; LK.h = null; LK.events = []; LK.actions = {}; LK.playErr = null; E.lockAsk = false;
    var p;
    try { p = a.play(); } catch (e) { LK.playErr = (e && e.name) || "play"; }
    if (p && p.catch) p.catch(function (e) { LK.playErr = (e && e.name) || "play-failed"; LK.phase = "idle"; render(); });
    logSeq("дорожка включена (audioSession=" + getSession() + ", экран/режим=" + MODE + ")");
    keepAwake(false);
    clearInterval(LK.timer);
    LK.timer = setInterval(function () { var t = $("lkTime"); if (t) t.textContent = mmss(a.currentTime) + " из " + mmss(a.duration || 180); }, 500);
    render();
  }
  function stopLock() {
    stopAudio(); clearInterval(LK.timer); LK.phase = LK.phase === "play" ? "done" : LK.phase;
    try { if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "none"; } catch (e) {}
  }
  function lockBest() {
    var best = null;
    LK.hidden.forEach(function (r) { if (r.wall >= 8 && (!best || r.wall > best.wall)) best = r; });
    return best;
  }
  function lockAuto() { // по часам: звук продвигался, пока экран был погашен?
    var b = lockBest();
    if (!b) return null;
    var exp = Math.min(b.wall, Math.max(0, (b.dur || 180) - b.ct));
    var ok = b.adv >= exp - 3;
    return { ok: ok, wall: b.wall, adv: b.adv, pausedNow: b.pausedNow };
  }
  function lockJudge() {
    var auto = lockAuto(), ans = S.answers.lock_heard || null, st, msg, parts = [];
    if (auto) parts.push("экран был погашен " + Math.round(auto.wall) + " с, звук за это время продвинулся на " + Math.round(auto.adv) + " с" + (auto.ok ? " — играл" : " — остановился" + (auto.pausedNow ? " (iPhone поставил на паузу)" : "")));
    if (ans === "yes") parts.push("слышал звук при погашенном экране");
    if (ans === "no") parts.push("звук замолчал при погашении");
    if (auto && ans) {
      if (auto.ok && ans === "yes") st = "ok";
      else if (!auto.ok && ans === "no") st = "bad";
      else { st = "warn"; parts.push("часы и слух не сходятся — проверить ещё раз"); }
    } else if (auto) st = auto.ok ? "ok" : "bad";
    else if (ans === "yes") st = "ok";
    else if (ans === "no") st = "bad";
    else return;
    if (!auto) parts.push("замера по часам нет (экран при включённой дорожке не гасили)");
    parts.push("режим " + modeName(MODE));
    setRes("lock", st, parts.join("; "));
  }
  doc.addEventListener("visibilitychange", function () {
    if (LK.phase !== "play") return;
    var a = audioEl();
    if (doc.hidden) { LK.h = { at: Date.now(), ct: a.currentTime, paused: a.paused }; LK.events.push(fmtClock(Date.now()) + " экран погас/страница скрыта"); }
    else if (LK.h) {
      var r = { at: LK.h.at, ct: LK.h.ct, wall: (Date.now() - LK.h.at) / 1000, adv: a.currentTime - LK.h.ct, pausedAtHide: LK.h.paused, pausedNow: a.paused, ended: a.ended, dur: a.duration || 180 };
      LK.hidden.push(r); LK.h = null;
      LK.events.push(fmtClock(Date.now()) + " вернулся: прошло " + Math.round(r.wall) + " с, звук продвинулся на " + Math.round(r.adv) + " с, на паузе: " + (r.pausedNow ? "да" : "нет"));
      logSeq("вернулся после погашения: " + Math.round(r.wall) + " с, звук +" + Math.round(r.adv) + " с, пауза=" + r.pausedNow);
      lockJudge(); render();
    }
  });

  /* не давать экрану гаснуть, пока идёт проверка (кроме шага с погашением) */
  var wake = null;
  function keepAwake(on) {
    try {
      if (!on) { if (wake && wake.release) wake.release(); wake = null; return; }
      if (wake || !navigator.wakeLock || doc.hidden) return;
      navigator.wakeLock.request("screen").then(function (l) { wake = l; l.addEventListener("release", function () { if (wake === l) wake = null; }); }, function () {});
    } catch (e) {}
  }

  /* ---------------------------------------------------------------- проверки при запуске */
  function idbTest() {
    return Promise.race([new Promise(function (resolve) {
      try {
        var rq = indexedDB.open("zhprobe", 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore("k"); };
        rq.onerror = function () { resolve("ошибка открытия"); };
        rq.onsuccess = function () {
          try {
            var db = rq.result, tx = db.transaction("k", "readwrite");
            tx.objectStore("k").put(Date.now(), "t");
            tx.oncomplete = function () { db.close(); resolve("ok"); };
            tx.onerror = function () { resolve("ошибка записи"); };
          } catch (e) { resolve("ошибка: " + e.name); }
        };
      } catch (e) { resolve("IndexedDB нет"); }
    }), sleep(4000).then(function () { return "не ответил за 4 с"; })]);
  }
  function autoBasic() {
    var eff = effIos();
    if (!IOS.isApple && !S.manualIos) setRes("ios", "warn", IOS.ipadDesktop ? "iPad в режиме «ПК-сайт» — версию по строке браузера не определить, впиши её в «Памятке»" : "это не iPhone (проверка на компьютере)");
    else if (eff.major == null) setRes("ios", "warn", "версию определить не удалось — впиши её в «Памятке»");
    else if (eff.major < 16 || (eff.major === 16 && eff.minor < 4)) setRes("ios", "bad", eff.text + " (" + eff.src + ") — старше 16.4: режим звука и напоминания не заработают");
    else setRes("ios", "ok", eff.text + " (" + eff.src + ") — подходит" + (eff.major < 17 ? ", но до 17-й у приложения меньше места для данных" : ""));
    if (MODE === "home") setRes("home", "ok", "да");
    else if (MODE === "inapp") setRes("home", "bad", "нет: открыта внутри другого приложения (WeChat, Telegram…) — там нет микрофона и «Домой», открой в Safari");
    else setRes("home", "warn", "нет: открыта в Safari — результаты звука и микрофона тогда про Safari, а не про приложение");
    var secure = location.protocol === "https:" || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    setRes("https", secure ? "ok" : "bad", secure ? "да" : "нет — микрофон и работа без сети не включатся");
    var hasAS = "audioSession" in navigator;
    setRes("audiosession", hasAS ? "ok" : "bad", hasAS ? "есть (сейчас режим «" + getSession() + "»)" : "нет — «громче после записи» исправить этим способом нельзя (нужен iOS 16.4+)");
    var hasMS = "mediaSession" in navigator && typeof MediaMetadata !== "undefined";
    setRes("mediasession", hasMS ? "ok" : "bad", hasMS ? "есть" : "нет — кнопок на экране блокировки не будет");
    if (!("AudioWorkletNode" in window)) setRes("worklet", "bad", "в браузере нет — проверку тонов на сыром звуке не сделать");
  }
  async function autoStorage() {
    var parts = [], st = "ok", granted = null, already = null;
    try {
      if (navigator.storage && navigator.storage.persisted) already = await navigator.storage.persisted();
      granted = already;
      if (!already && navigator.storage && navigator.storage.persist) granted = await navigator.storage.persist();
    } catch (e) { parts.push("persist: ошибка " + (e && e.name)); }
    var quota = "";
    try { if (navigator.storage && navigator.storage.estimate) { var es = await navigator.storage.estimate(); quota = "места под данные: " + Math.round((es.quota || 0) / 1048576) + " МБ, занято " + (((es.usage || 0) / 1048576).toFixed(1)).replace(".", ",") + " МБ"; } } catch (e) {}
    var idb = await idbTest();
    S.persist = { already: already, granted: granted, idb: idb, quota: quota };
    if (granted === true) parts.unshift("да, обещал (persist = true)");
    else if (granted === false) { parts.unshift("нет, не обещал (persist = false)" + (MODE === "home" ? " — на «Домой» ждали «да»" : " — для вкладки Safari это обычно, на «Домой» должно быть «да»")); st = MODE === "home" ? "bad" : "warn"; }
    else { parts.unshift("ответа нет (persist не поддерживается)"); st = "warn"; }
    if (quota) parts.push(quota);
    parts.push("IndexedDB: " + (idb === "ok" ? "пишет и читает" : idb));
    if (idb !== "ok") st = "bad";
    setRes("persist", st, parts.join("; "));
  }
  async function setupSW() {
    if (!("serviceWorker" in navigator)) { setRes("cache", "bad", "у этого браузера нет service worker — без сети страница не откроется"); return; }
    try {
      await navigator.serviceWorker.register("sw.js", { scope: "./" });
      await Promise.race([navigator.serviceWorker.ready, sleep(9000).then(function () { throw new Error("не успел встать за 9 с"); })]);
      var names = (await caches.keys()).filter(function (k) { return k.indexOf("probe-") === 0; });
      var n = 0, hasIndex = false;
      for (var i = 0; i < names.length; i++) { var c = await caches.open(names[i]); n += (await c.keys()).length; if (await c.match("index.html")) hasIndex = true; }
      var ctl = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
      if (hasIndex) setRes("cache", "ok", "да: в памяти телефона " + n + " файлов страницы" + (ctl ? "" : " (при следующем открытии страница уже будет открываться оттуда)"));
      else setRes("cache", "warn", "service worker встал, но файлов в памяти ещё нет");
    } catch (e) { setRes("cache", "bad", "не получилось сохранить страницу в телефоне: " + ((e && e.message) || e)); }
  }
  function recordLaunch() {
    var L = { t: Date.now(), mode: MODE, v: VER, sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller), onLine: navigator.onLine };
    function fin() {
      try {
        var n = performance.getEntriesByType("navigation")[0];
        if (n) { L.type = n.type; L.ttfb = Math.round(n.responseStart); L.dcl = Math.round(n.domContentLoadedEventEnd); L.load = Math.round(n.loadEventEnd || 0); L.xfer = n.transferSize; }
      } catch (e) {}
      S.launches.push(L); if (S.launches.length > 14) S.launches.shift(); save();
      openCheck();
      quickNet().then(function (ok) { L.net = ok; save(); if (ok === false || L.onLine === false) offlineSeen(L); });
    }
    if (doc.readyState === "complete") setTimeout(fin, 0); else window.addEventListener("load", function () { setTimeout(fin, 0); });
  }
  function openCheck() {
    var Ls = S.launches, cold = null, warm = null, i;
    for (i = 0; i < Ls.length; i++) if (!Ls[i].sw && Ls[i].load > 0 && !cold) cold = Ls[i];
    for (i = Ls.length - 1; i >= 0; i--) if (Ls[i].sw && Ls[i].load > 0) { warm = Ls[i]; break; }
    if (!cold && !warm) return;
    var parts = [], st = "ok";
    if (cold) { parts.push("первое открытие " + modeName(cold.mode) + ": страница готова за " + secs(cold.load) + " (ответ сервера за " + secs(cold.ttfb) + ")"); st = cold.load > 8000 ? "bad" : (cold.load > 3000 ? "warn" : "ok"); }
    if (warm) { parts.push("повторное открытие: " + secs(warm.load) + (warm.xfer === 0 ? ", из памяти телефона" : "")); if (warm.load > 1500 && st === "ok") st = "warn"; }
    if (!cold) parts.push("первого открытия в этом режиме не застали — смотри «Связь»");
    setRes("open", st, parts.join("; "));
  }
  function offlineSeen(L) {
    L.offline = true; save();
    var cur = getRes("offline");
    if (cur && cur.st === "ok" && cur.mode === "home") return;
    var why = L.onLine === false ? "телефон без сети" : "github.io не ответил сразу (сеть выключена или сайт закрыт)";
    if (L.sw) setRes("offline", MODE === "home" ? "ok" : "warn", "открылась из памяти телефона: " + why + " (" + modeName(MODE) + ")" + (MODE === "home" ? "" : " — а надо проверить с «Домой»"));
    else setRes("offline", "warn", "открылась, хотя " + why + ", но не из своего хранилища (service worker не управлял страницей) — " + modeName(MODE));
    toast("Открылась без сети — записал ✓");
    if (curId() === "offline") render();
  }

  /* ---------------------------------------------------------------- кусочки интерфейса */
  function btn(label, cls, fn, extra) { var a = { type: "button", class: "btn " + (cls || ""), onclick: fn }; if (extra) for (var k in extra) a[k] = extra[k]; return h("button", a, label); }
  function line(st, text, sub) { return h("div", { class: "line " + st }, h("span", { class: "mk" }, MK[st] || "·"), h("span", { class: "tx" }, text, sub ? h("small", { text: sub }) : null)); }
  function note(cls, text) { return h("div", { class: "note " + (cls || "") }, text); }
  function answers(id, opts, cb, cols) { // cols: 2 или 3 колонки
    return h("div", { class: "ans" + (cols === 3 ? " three" : (cols ? " two" : "")) }, opts.map(function (o) {
      return h("button", { type: "button", class: "btn sec " + (o[2] || "") + (S.answers[id] === o[0] ? " on" : ""), onclick: function () { S.answers[id] = o[0]; save(); cb(o[0]); } }, o[1]);
    }));
  }
  var toastTm = null;
  function toast(t) { var el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toastTm); toastTm = setTimeout(function () { el.hidden = true; }, 2600); }
  var SHARE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
  function setMeter(rms) {
    var m = $("meterI"); if (!m) return;
    var d = dbOf(rms), pct = Math.max(0, Math.min(100, (d + 60) / 60 * 100));
    m.style.width = pct + "%"; m.parentNode.className = "meter" + (d > -6 ? " hot" : "");
  }

  /* ---------------------------------------------------------------- экраны-шаги */
  function vMemo() {
    var items = ["Поставить на «Домой»", "Верх экрана", "Связь с VPN", "Связь без VPN", "Эталон громкости", "Микрофон", "Звук: исправление", "Беззвучный режим", "Погашенный экран", "Клавиатура", "Без интернета"];
    var inp = h("input", { type: "text", inputmode: "decimal", placeholder: "17.5", autocomplete: "off", value: S.manualIos || "", "aria-label": "Версия iOS" });
    inp.addEventListener("input", function () { S.manualIos = inp.value; save(); autoBasic(); });
    return [
      h("h1", { text: "Проба на твоём iPhone" }),
      h("p", { class: "lead" }, "Проверка перед новым приложением: ", h("b", { text: "около 10 минут" }), ", 11 коротких шагов, в каждом одна задача. В конце одна кнопка — «Скопировать отчёт»; вставь его в чат с Claude."),
      h("ol", { class: "memo" }, items.map(function (x, i) { return h("li", null, h("span", { class: "n" }, i + 1), h("span", { text: x })); })),
      h("p", { class: "small" }, "Понадобятся VPN (выключить и включить) и авиарежим. Не получилось — «Пропустить»: это тоже ответ."),
      h("div", { class: "field" }, h("label", { text: "Версия iOS, если знаешь (Настройки → Основные → Об этом устройстве)" }), inp)
    ];
  }
  function vHome() {
    if (MODE === "home") return [h("h1", { text: "Ты уже на «Домой» ✓" }), h("p", { class: "lead", text: "Так и надо: дальше проверяем здесь — так, как будет работать приложение." }), h("p", { class: "small", text: "Если откроешь эту страницу в Safari, результаты будут про Safari, а не про приложение." })];
    var out = [h("h1", { text: "Поставь страницу на «Домой»" })];
    if (MODE === "inapp") out.push(note("bad", "Сейчас страница открыта внутри другого приложения (WeChat, Telegram…). Там нет микрофона и нет «Домой». Открой эту ссылку в Safari."));
    out.push(h("p", { text: "Приложение будет жить на экране «Домой», значит и проверять надо оттуда." }));
    out.push(h("ul", { class: "todo-list" },
      h("li", null, h("span", { class: "n" }, "1"), h("span", null, "Нажми «Поделиться» ", h("span", { class: "ico", svg: SHARE }), " (квадрат со стрелкой, внизу; если его нет — сначала «···»).")),
      h("li", null, h("span", { class: "n" }, "2"), h("span", { text: "Пролистай меню и выбери «На экран „Домой“» (может быть под «Ещё»)." })),
      h("li", null, h("span", { class: "n" }, "3"), h("span", { text: "Нажми «Добавить» (справа вверху)." })),
      h("li", null, h("span", { class: "n" }, "4"), h("span", { text: "Закрой Safari и открой значок «Проба» на экране «Домой». Продолжим там." }))
    ));
    return out;
  }
  function vTop() {
    var cs = ""; try { cs = matchMedia("(prefers-color-scheme: dark)").matches ? "тёмная" : "светлая"; } catch (e) {}
    var probe = h("div", { style: "position:absolute;visibility:hidden;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)" });
    doc.body.appendChild(probe);
    var cst = getComputedStyle(probe), top = Math.round(parseFloat(cst.paddingTop) || 0), bot = Math.round(parseFloat(cst.paddingBottom) || 0);
    doc.body.removeChild(probe);
    E.safe = { top: top, bottom: bot, scheme: cs };
    var out = [
      h("h1", { text: "Посмотри на самый верх экрана" }),
      h("p", { class: "lead", text: "Там часы, сеть и батарея. Хорошо ли их видно на фоне этой страницы?" }),
      h("div", { class: "ruler", text: "↑ Страница начинается тут. Часы — выше." })
    ];
    if (MODE !== "home") out.push(note("", "Ты в Safari — шаг важнее с «Домой»."));
    out.push(h("div", { class: "q", text: "Как видно строку состояния?" }));
    out.push(answers("topbar", [["good", "Хорошо видно", "g"], ["blend", "Сливается с фоном", "y"], ["none", "Не видно совсем", "r"]], function (v) {
      var t = " (отступ сверху " + top + " px, тема " + (cs || "?") + ")";
      if (v === "good") setRes("topbar", "ok", "часы и батарея хорошо видны" + t);
      else if (v === "blend") setRes("topbar", "bad", "сливаются с фоном — на светлом фоне белые часы не видны, нужна тёмная полоса или другой стиль" + t);
      else setRes("topbar", "bad", "не видно совсем" + t);
      render();
    }));
    return out;
  }
  function vNet(kind) {
    var on = kind === "on", R = E["net_" + kind] || (E["net_" + kind] = { busy: false, rec: S.net[kind] || null });
    var out = [h("h1", { text: on ? "Связь: VPN включён" : "Связь: VPN выключен" })];
    var has = !!(R.rec || R.busy);
    if (!has) out.push(h("p", { class: "lead", text: on ? "Включи VPN, как для Claude. Нажми «Замерить» и подожди — до минуты, страницу не закрывай." : "Теперь выключи VPN и нажми «Замерить». Если что-то не отвечает — это тоже нужный ответ." }));
    out.push(h("div", { class: "acts" }, btn(R.busy ? "Замеряю…" : (R.rec ? "Замерить ещё раз" : "Замерить"), R.rec && !R.busy ? "sec" : "pri", function () { runNet(kind); }, R.busy ? { disabled: true } : null)));
    var rec = R.rec || { ping: {} };
    if (has) {
      var rows = TARGETS.map(function (t) { var l = pingLine(t, rec.ping[t.id]); return line(l[0], l[1], l[2]); });
      if (rec.shell) rows.push(rec.shell.skipped ? line("todo", "Страница целиком: не грузил (github.io не отвечает)") : line(rec.shell.ok ? "ok" : "bad", "Страница целиком (" + rec.shell.n + " файла, " + kbs(rec.shell.bytes) + "): " + (rec.shell.ok ? secs(rec.shell.ms) : "не загрузилась"), rec.shell.err));
      if (rec.payload && !rec.payload.skipped) rows.push(line(rec.payload.ok ? "ok" : "bad", rec.payload.ok ? "256 КБ: " + secs(rec.payload.ms) + " (" + Math.round(rec.payload.kbps) + " КБ/с)" : "256 КБ не скачались", rec.payload.err));
      out.push(h("div", { class: "lines compact" }, rows));
    }
    if (has && !R.busy) { // одна подсказка под результатом
      var msg = null, cls = "";
      if (rec.loc) {
        if (on && rec.loc === "CN") msg = "Cloudflare видит тебя в Китае — похоже, VPN выключен. Включи его и замерь ещё раз.";
        else if (!on && rec.loc !== "CN") msg = "Cloudflare видит тебя в стране " + rec.loc + " — похоже, VPN ещё включён. Выключи и замерь ещё раз.";
        else if (on) { msg = "VPN работает: выход в сеть из " + rec.loc + "."; cls = "good"; }
        else { msg = "Без VPN, как нужно. Включи VPN обратно — он нужен, чтобы вставить отчёт в чат."; cls = "good"; }
      } else if (!on) { msg = "Включи VPN обратно — он нужен, чтобы вставить отчёт в чат с Claude."; cls = "info"; }
      if (msg) out.push(note(cls, msg));
    }
    return out;
  }
  async function runNet(kind) {
    var R = E["net_" + kind] || (E["net_" + kind] = {});
    if (R.busy) return;
    R.busy = true; R.rec = { ping: {} }; render();
    logSeq("замер связи: " + kind);
    var rec;
    try { rec = await measureNet(kind, function (r) { R.rec = r; if (curId() === "net" + (kind === "on" ? "On" : "Off")) render(); }); }
    catch (e) { rec = { label: kind, ping: {}, shell: { skipped: true }, payload: { skipped: true }, err: String((e && e.message) || e) }; }
    R.busy = false; R.rec = rec; S.net[kind] = rec; save();
    var st = judgeNet(rec), txt = netText(rec) + (rec.loc ? "" : "");
    if (kind === "on" && rec.loc === "CN") txt += " ⚠ но Cloudflare видит Китай — VPN, похоже, был выключен";
    if (kind === "off" && rec.loc && rec.loc !== "CN") txt += " ⚠ но Cloudflare видит не Китай — VPN, похоже, был включён";
    setRes("net_" + kind, st, txt);
    render();
  }
  function vRef() {
    var R = E.ref || (E.ref = { st: "idle" });
    var out = [
      h("h1", { text: "Запомни громкость" }),
      h("p", { class: "lead", text: "Поставь громкость как для учёбы — примерно на середину. Нажми «Послушать» и запомни, как громко звучит." }),
      h("div", { class: "acts" }, btn(R.st === "play" ? "Играет…" : "▶ Послушать (8 секунд)", "pri", function () {
        if (!sayURL) { toast(sayErr ? "Звук не скачался (нет сети?)" : "Звук ещё грузится — секунду"); preloadSay(); return; }
        setSession("auto");
        var p = playOnce(sayURL);
        R.st = "play"; E.micBefore = !!E.micUsed; render();
        p.then(function (r) { R.st = r.ok ? "done" : "err"; R.why = r.why; render(); });
      }, R.st === "play" ? { disabled: true } : null))
    ];
    if (R.st === "done") out.push(line("ok", "Готово. Эту громкость и запомни."));
    if (R.st === "err") out.push(note("bad", "iPhone не дал включить звук (" + R.why + "). Нажми ещё раз; проверь, что звук не выключен."));
    out.push(h("p", { class: "small", text: "Дальше будет запись голоса — после неё iPhone иногда играет тише. Сравним с этим." }));
    return out;
  }
  function recState(kind) { return E[kind] || (E[kind] = { phase: 0 }); }
  function vRec(kind) {
    var fix = kind === "rec2", R = recState(kind), id = fix ? "vol_fix" : "vol_now";
    var out = [h("h1", { text: R.phase >= 2 ? (fix ? "Теперь с исправлением" : "Послушай после записи") : (fix ? "То же, но с исправлением" : "Скажи что-нибудь") })];
    if (R.phase === 0) {
      out.push(h("p", { class: "lead", text: fix ? "Ещё раз: «Записать» и 4 секунды говори. Потом «Послушать» — страница перед этим включит особый режим звука." : "Нажми «Записать» и 4 секунды говори любую фразу, например «你好». iPhone спросит про микрофон — нажми «Разрешить»." }));
      if (R.err) { out.push(note("bad", R.err[0] + ". " + R.err[1])); }
      out.push(h("div", { class: "acts" }, btn("● Записать (4 секунды)", "rec", function () { doRecord(kind); })));
      if (fix && IOS.isApple && !("audioSession" in navigator)) out.push(note("", "На этом iPhone исправления нет (нужен iOS 16.4+) — послушаем без него."));
    }
    if (R.phase === 1) {
      out.push(h("p", { class: "lead", text: "Говори! Идёт запись… (Если iPhone спросил про микрофон — нажми «Разрешить».)" }));
      out.push(h("div", { class: "meter" }, h("i", { id: "meterI" })));
      out.push(h("div", { class: "acts" }, btn("Идёт запись…", "rec", function () {}, { disabled: true })));
    }
    if (R.phase >= 2) {
      var v = R.judge;
      if (v) out.push(line(v.st, "Микрофон: " + (v.st === "ok" ? "слышит" : (v.st === "warn" ? "слышит тихо" : "не слышит")), v.short));
      if (R.phase === 2 || R.phase === 3) out.push(h("p", { class: "lead", text: fix ? "Нажми «Послушать»: сначала включится режим звука, потом речь." : "Нажми «Послушать»: то же, что в шаге 5." }));
      out.push(h("div", { class: "acts" }, btn(R.phase === 3 ? "Играет…" : "▶ Послушать после записи", "pri", function () { doListen(kind); }, R.phase === 3 ? { disabled: true } : null)));
      if (R.phase === 4) {
        if (R.play && !R.play.ok) out.push(note("bad", "iPhone не дал включить звук (" + R.play.why + "). Нажми «Послушать» ещё раз."));
        out.push(h("div", { class: "q", text: "Громкость такая же, как в шаге 5?" }));
        out.push(answers(id, [["same", "Такая же", "g"], ["quiet", "Тише", "y"], ["none", "Не слышно", "r"]], function (val) { volAnswer(kind, val); }, 3));
        out.push(btn("Записать ещё раз", "ghost", function () { R.phase = 0; R.err = null; render(); }));
      }
    }
    return out;
  }
  async function doRecord(kind) {
    var R = recState(kind);
    if (R.phase === 1) return;
    R.phase = 1; R.err = null; render();
    E.micUsed = true;
    if (kind === "rec1") setSession("auto");
    logSeq("запись (" + kind + "), audioSession=" + getSession());
    try {
      var info = await recordMic(4, setMeter);
      R.info = info; R.phase = 2;
      var v = judgeMic(info);
      R.judge = { st: v.st, short: "пик " + dbs(info.peakDb) + ", голос " + dbs(info.rmsDb) };
      if (kind === "rec1" || !getRes("mic") || getRes("mic").st !== "ok") setRes("mic", v.st, v.msg);
      var wmsg = info.worklet ? "работает: сырые отсчёты идут, частота " + info.sampleRate + " Гц" : "не запустился" + (info.workletErr ? " (" + info.workletErr + ")" : "") + " — взяли запасной измеритель";
      setRes("worklet", info.worklet ? "ok" : "bad", wmsg);
      if (info.settings) { var s = info.settings; S.micSettings = "echoCancellation=" + s.echoCancellation + " noiseSuppression=" + s.noiseSuppression + " autoGainControl=" + s.autoGainControl + " sampleRate=" + s.sampleRate + " channels=" + s.channelCount; save(); }
      logSeq("записал: " + v.st + ", пик " + dbs(info.peakDb) + ", audioSession после=" + info.sessionAfter);
    } catch (e) {
      R.err = micErr(e); R.phase = 0;
      setRes("mic", "bad", R.err[0] + " (" + ((e && e.name) || "?") + ")");
      logSeq("микрофон: " + ((e && e.name) || "ошибка"));
    }
    render();
  }
  function doListen(kind) {
    var R = recState(kind);
    if (!sayURL) { toast(sayErr ? "Звук не скачался (нет сети?)" : "Звук ещё грузится — секунду"); preloadSay(); return; }
    var before = getSession(), set = null;
    if (kind === "rec2") set = setSession("playback");
    R.sess = { before: before, after: getSession(), fix: kind === "rec2" };
    var p = playOnce(sayURL);
    R.phase = 3; render();
    logSeq("слушает после записи (" + kind + "), audioSession " + before + " → " + getSession());
    p.then(function (r) { R.play = r; R.phase = 4; render(); });
  }
  function volAnswer(kind, val) {
    var R = recState(kind), id = kind === "rec2" ? "vol_fix" : "vol_now";
    var sess = R.sess ? "audioSession был «" + R.sess.before + "», стал «" + R.sess.after + "»" : "";
    var base = kind === "rec2" ? "после записи и режима playback " : "после записи без исправления ";
    var warn = E.micBefore ? "; эталон слушали уже ПОСЛЕ микрофона — сравнение неточное" : "";
    if (val === "same") setRes(id, "ok", base + "громкость такая же, как до записи (" + sess + ")" + warn);
    else if (val === "quiet") setRes(id, "bad", base + "тише, чем до записи (" + sess + ")" + warn);
    else setRes(id, "bad", base + "звук почти не слышно (" + sess + ")" + warn);
    render();
  }
  function vSilent() {
    var R = E.silent || (E.silent = {});
    var out = [h("h1", { text: "Беззвучный режим" })];
    function speak() {
      if (!sayURL) { toast("Звук ещё грузится — секунду"); preloadSay(); return; }
      setSession("auto");
      var p = playOnce(sayURL);
      R.spStarted = true; render();
      p.then(function (r) { R.sp = r; });
    }
    if (!R.spStarted) {
      out.push(h("p", { class: "lead", text: "Включи беззвучный режим: переключатель на боку iPhone — вниз, чтобы стала видна оранжевая полоска." }));
      out.push(h("p", { class: "small", text: "На новых iPhone — кнопка действия или колокольчик в Пункте управления. Громкость не трогай." }));
      out.push(h("div", { class: "acts" }, btn("▶ Речь", "pri", speak)));
    } else {
      out.push(h("div", { class: "acts" }, btn("▶ Речь ещё раз", "sec", speak)));
      out.push(h("div", { class: "q", text: "Речь слышно?" }));
      out.push(answers("silent", [["yes", "Да, слышно", "g"], ["no", "Нет, тишина", "r"]], function (v) { setRes("silent", v === "yes" ? "ok" : "bad", v === "yes" ? "речь через <audio> слышна при беззвучном переключателе" : "речь через <audio> молчит при беззвучном переключателе — нужен режим playback или подсказка в приложении"); render(); }, 2));
      if (getRes("silent")) {
        out.push(h("p", { class: "smallline", text: "Дополнительно (не важно): сигнал другим способом." }));
        out.push(btn("▶ Короткий сигнал", "sec", function () { beep(); R.beeped = true; render(); }));
        if (R.beeped) out.push(answers("silent_wa", [["yes", "Слышно", ""], ["no", "Тишина", ""]], function (v) { setRes("silent_wa", "info", v === "yes" ? "слышен" : "не слышен (ожидаемо: сигналы «верно/неверно» при беззвучном молчат)"); render(); }, 2));
        out.push(h("p", { class: "smallline", text: "Потом верни переключатель обратно." }));
      }
    }
    return out;
  }
  var wactx = null;
  function beep() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!wactx) wactx = new AC();
      if (wactx.resume) wactx.resume();
      var o = wactx.createOscillator(), g = wactx.createGain();
      o.frequency.value = 880; g.gain.value = 0.3; o.connect(g); g.connect(wactx.destination);
      o.start(); g.gain.setValueAtTime(0.3, wactx.currentTime + 0.5); g.gain.linearRampToValueAtTime(0.0001, wactx.currentTime + 0.7); o.stop(wactx.currentTime + 0.75);
    } catch (e) { toast("Не вышло: " + ((e && e.name) || "ошибка")); }
  }
  function vLock() {
    prepLock();
    var a = audioEl(), out = [h("h1", { text: "Погашенный экран" })];
    var asking = LK.hidden.length > 0 || E.lockAsk || LK.phase === "done";
    if (LK.phase === "idle") {
      out.push(h("p", { class: "lead", text: "Нажми «Включить дорожку» — пойдут ноты, 3 минуты. Потом нажми боковую кнопку: экран погаснет. Через 30 секунд разбуди его, посмотри экран блокировки и вернись сюда." }));
      out.push(h("div", { class: "acts" }, btn(LK.url ? "▶ Включить дорожку" : "Готовлю дорожку…", "pri", startLock, LK.url ? null : { disabled: true })));
      if (LK.err) out.push(note("bad", "Не получилось собрать дорожку: " + LK.err));
      if (LK.playErr) out.push(note("bad", "iPhone не дал включить звук (" + LK.playErr + "). Нажми ещё раз."));
      if (MODE !== "home") out.push(note("", "Ты в Safari — для приложения важнее с «Домой»."));
      if (getRes("lock") || getRes("lockui")) out.push(h("p", { class: "smallline", text: "Результат уже записан — можно перейти дальше или повторить." }));
    } else {
      out.push(h("div", { class: "timer", id: "lkTime" }, mmss(a.currentTime) + " из " + mmss(a.duration || 180)));
      if (!asking) {
        out.push(h("p", { class: "lead", text: "Играет. Нажми боковую кнопку — экран погаснет. Через 30 секунд разбуди его, посмотри экран блокировки, разблокируй и вернись сюда." }));
        out.push(line("live", "Жду, пока экран погаснет (хотя бы на 8 секунд)…"));
        out.push(h("div", { class: "acts" }, btn("■ Остановить дорожку", "sec", function () { stopLock(); render(); })));
        out.push(btn("Я уже проверил — ответить", "ghost", function () { E.lockAsk = true; render(); }));
      } else {
        var auto = lockAuto();
        if (auto) out.push(line(auto.ok ? "ok" : "bad", "Экран был погашен " + Math.round(auto.wall) + " с, звук продвинулся на " + Math.round(auto.adv) + " с.", auto.ok ? "Играл всё время." : (auto.pausedNow ? "iPhone остановил звук." : "Звук не шёл.")));
        out.push(h("div", { class: "q", text: "Слышал ноты, пока экран был погашен?" }));
        out.push(answers("lock_heard", [["yes", "Да, всё время", "g"], ["no", "Замолчало", "r"], ["skip", "Не знаю", ""]], function (v) { if (v === "skip") { delete S.answers.lock_heard; } lockJudge(); render(); }, 3));
        out.push(h("div", { class: "q", text: "На экране блокировки были название и кнопки?" }));
        out.push(answers("lock_ui", [["yes", "Да, есть", "g"], ["no", "Нет", "r"], ["skip", "Не смотрел", ""]], function (v) {
          var acts = Object.keys(LK.actions).map(function (k) { return k + "×" + LK.actions[k]; }).join(", ");
          if (v === "yes") setRes("lockui", "ok", "на экране блокировки видны название «Проба…» и кнопки" + (acts ? "; нажатия на них дошли до страницы: " + acts : ""));
          else if (v === "no") setRes("lockui", "bad", "на экране блокировки названия и кнопок нет" + (acts ? "; но нажатия дошли: " + acts : ""));
          else delete S.res.lockui;
          render();
        }, 3));
        if (LK.phase === "play") out.push(btn("■ Остановить дорожку", "ghost", function () { stopLock(); render(); }));
        else out.push(btn("↻ Включить дорожку заново", "ghost", function () { LK.phase = "idle"; LK.hidden = []; LK.h = null; E.lockAsk = false; render(); }));
      }
    }
    return out;
  }
  function vKb() {
    var K = E.kb || (E.kb = { max: null });
    var inp = h("input", { class: "kbinput", type: "text", placeholder: "Нажми сюда и напиши что-нибудь", autocomplete: "off", autocapitalize: "off", id: "kbInput" });
    inp.addEventListener("focus", function () { setTimeout(kbMeasure, 700); setTimeout(kbMeasure, 1400); });
    var out = [
      h("h1", { text: "Клавиатура и кнопка" }),
      h("p", { class: "small", text: "Нажми в поле — выедет клавиатура. Какие кнопки «Проверить» остались видны над ней?" }),
      inp,
      h("div", { class: "smallline", id: "kbLine" }, kbLineText())
    ];
    out.push(h("div", { class: "q", text: "Что видно над клавиатурой?" }));
    out.push(answers("kb", [["both", "Обе кнопки", "g"], ["b", "Только Б (синяя)", "y"], ["a", "Только А (серая)", "y"], ["none", "Ни одной", "r"]], function (v) { kbJudge(); render(); }, 2));
    if (getRes("kb")) out.push(btn("Дальше →", "pri", function () { go(curIdx() + 1); }));
    return out;
  }
  function kbMeasure() {
    var a = $("kbA"), b = $("kbB"); if (!a || !b || curId() !== "kb") return;
    var vv = window.visualViewport;
    var lh = doc.documentElement.clientHeight, vh = vv ? vv.height : window.innerHeight, vt = vv ? vv.offsetTop : 0;
    var kbH = Math.max(0, Math.round(lh - (vh + vt)));
    var top = vt, bot = vt + vh, ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    var m = { kbH: kbH, vvH: Math.round(vh), vvTop: Math.round(vt), layoutH: lh, innerH: window.innerHeight, aVis: ra.top >= top - 1 && ra.bottom <= bot + 1, bVis: rb.top >= top - 1 && rb.bottom <= bot + 1 };
    var K = E.kb || (E.kb = {});
    if (kbH > 80 && (!K.max || kbH >= K.max.kbH)) { K.max = m; kbJudge(); kbUpdateLine(); } // поле ввода не перерисовываем: иначе клавиатура закроется
    else if (!K.max) K.last = m;
  }
  function kbLineText() {
    var K = E.kb || {}, m = K.max;
    if (!m) return "Клавиатура ещё не выезжала";
    return "Клавиатура " + m.kbH + " px · А " + (m.aVis ? "видна" : "закрыта") + " · Б " + (m.bVis ? "видна" : "закрыта");
  }
  function kbUpdateLine() { var el = $("kbLine"); if (el) el.textContent = kbLineText(); }
  function kbPos() {
    var vv = window.visualViewport; if (!vv) return;
    var kb = Math.max(0, Math.round(doc.documentElement.clientHeight - (vv.height + vv.offsetTop)));
    doc.documentElement.style.setProperty("--kb", kb + "px");
  }
  function kbJudge() {
    var K = E.kb || {}, ans = S.answers.kb, m = K.max, st, msg = [];
    if (m) msg.push("клавиатура " + m.kbH + " px: кнопка А (просто внизу) " + (m.aVis ? "видна" : "ЗАКРЫТА") + ", кнопка Б (над клавиатурой) " + (m.bVis ? "видна" : "закрыта"));
    else msg.push("замера клавиатуры нет (она не выезжала или экран не изменился)");
    if (ans) msg.push("ты видишь: " + ({ both: "обе кнопки", b: "только Б", a: "только А", none: "ни одной" })[ans]);
    var aV = ans ? (ans === "both" || ans === "a") : (m ? m.aVis : null), bV = ans ? (ans === "both" || ans === "b") : (m ? m.bVis : null);
    if (aV == null) { if (!ans) return; }
    if (aV) st = "ok"; else if (bV) { st = "warn"; msg.push("простая кнопка внизу закрыта клавиатурой — в приложении кнопку надо поднимать над клавиатурой (способ Б работает)"); } else st = "bad";
    setRes("kb", st, msg.join("; "));
  }
  function vOffline() {
    var o = getRes("offline"), out = [
      h("h1", { text: "Откроется ли без интернета?" }),
      h("ul", { class: "todo-list" },
        h("li", null, h("span", { class: "n" }, "1"), h("span", { text: "Закрой приложение: смахни «Проба» вверх." })),
        h("li", null, h("span", { class: "n" }, "2"), h("span", { text: "Включи авиарежим (самолётик в Пункте управления)." })),
        h("li", null, h("span", { class: "n" }, "3"), h("span", { text: "Открой «Проба» с экрана «Домой». Страница сама отметит результат." })),
        h("li", null, h("span", { class: "n" }, "4"), h("span", { text: "Выключи авиарежим, включи VPN. Нажми «Итог»." }))
      )
    ];
    if (MODE !== "home") out.push(note("", "Ты в Safari — лучше с «Домой»."));
    out.push(o ? line(o.st, o.msg) : line("todo", "Без сети ещё не открывали."));
    out.push(btn("Не открылась (ошибка, белый экран)", "sec", function () { setRes("offline", "bad", "без сети не открылась (хозяин нажал «Не открылась»), режим " + modeName(MODE)); render(); }));
    return out;
  }
  function vSummary() {
    var c = counts();
    var out = [h("div", { class: "sumhead" },
      h("span", { class: "chip ok", text: "✓ " + c.ok }), h("span", { class: "chip bad", text: "✗ " + c.bad }), h("span", { class: "chip warn", text: "! " + c.warn }), h("span", { class: "chip", text: "○ " + c.todo }))];
    var g = null;
    CHECKS.forEach(function (k) {
      if (k[1] !== g) { g = k[1]; out.push(h("div", { class: "group", text: g })); }
      var r = S.res[k[0]];
      out.push(line(r ? r.st : "todo", k[2] + (r ? ": " + r.msg : ": ещё не проверено") + (r && r.mode !== "home" && HOME_SENSITIVE[k[0]] ? " [в Safari]" : "")));
    });
    if (E.showRep) out.push(h("textarea", { class: "rep", id: "repText", readonly: true }, buildReport()));
    out.push(h("div", { class: "verline", text: "страница " + VER + (storeOK ? "" : " · память страницы недоступна") }));
    return out;
  }

  /* ---------------------------------------------------------------- отчёт */
  function buildReport() {
    var L = [], c = counts(), eff = effIos();
    L.push("ПРОБА iPhone · " + fmtDate(Date.now()) + " · страница " + VER + " · сейчас " + modeName(MODE));
    L.push("Итог: ✓ " + c.ok + " · ✗ " + c.bad + " · ! " + c.warn + " (осторожно) · ○ " + c.todo + " (не проверено)");
    var g = null;
    CHECKS.forEach(function (k) {
      if (k[1] !== g) { g = k[1]; L.push(""); L.push(g.toUpperCase()); }
      var r = S.res[k[0]];
      L.push(MK[r ? r.st : "todo"] + " " + k[2] + (r ? ": " + r.msg : ": не проверено") + (r && r.mode !== "home" && HOME_SENSITIVE[k[0]] ? " [в Safari]" : ""));
    });
    ["on", "off"].forEach(function (k) {
      var rec = S.net[k]; if (!rec) return;
      L.push(""); L.push("СВЯЗЬ ПОДРОБНО — VPN " + (k === "on" ? "включён" : "выключен") + " (" + fmtClock(rec.at) + ")");
      TARGETS.forEach(function (t) { var r = rec.ping[t.id]; L.push("  " + t.name + ": " + (r ? (r.ok ? ms0(r.ms) + " (" + r.okCount + " из 3, макс " + ms0(r.max) + ")" : "нет ответа: " + r.err) : "?")); });
      if (rec.shell) L.push("  страница целиком: " + (rec.shell.skipped ? "не грузил" : (rec.shell.ok ? kbs(rec.shell.bytes) + " за " + secs(rec.shell.ms) : "ошибка " + rec.shell.err)));
      if (rec.payload) L.push("  256 КБ: " + (rec.payload.skipped ? "не грузил" : (rec.payload.ok ? secs(rec.payload.ms) + ", " + Math.round(rec.payload.kbps) + " КБ/с" : "ошибка " + rec.payload.err)));
      if (rec.loc) L.push("  Cloudflare видит выход из: " + rec.loc + (rec.colo ? " (узел " + rec.colo + ")" : ""));
    });
    L.push(""); L.push("ОТКРЫТИЯ СТРАНИЦЫ (последние)");
    S.launches.slice(-8).forEach(function (l) { L.push("  " + fmtClock(l.t) + " " + modeName(l.mode) + ": из памяти=" + (l.sw ? "да" : "нет") + ", готова за " + (l.load ? secs(l.load) : "?") + ", связь=" + (l.net === false ? "нет" : (l.net === true ? "есть" : (l.net === "slow" ? "не ответила за 6 с" : "?"))) + (l.offline ? ", БЕЗ СЕТИ" : "")); });
    L.push(""); L.push("ТЕХНИЧЕСКИ");
    L.push("iOS: по строке браузера " + (IOS.os || "—") + ", по Safari " + (IOS.sf || "—") + (S.manualIos ? ", вписано тобой " + S.manualIos : "") + " → считаю " + eff.text);
    L.push("строка браузера: " + UA);
    var vv = window.visualViewport;
    L.push("экран " + screen.width + "×" + screen.height + " @" + (window.devicePixelRatio || 1) + "x; окно " + window.innerWidth + "×" + window.innerHeight + "; видимая область " + (vv ? Math.round(vv.width) + "×" + Math.round(vv.height) : "?") + (E.safe ? "; отступы сверху/снизу " + E.safe.top + "/" + E.safe.bottom + " px; тема " + E.safe.scheme : ""));
    L.push("язык " + (navigator.language || "?") + "; часовой пояс UTC" + (new Date().getTimezoneOffset() <= 0 ? "+" : "−") + Math.abs(new Date().getTimezoneOffset() / 60) + "; navigator.onLine=" + navigator.onLine + "; audioSession.type=" + getSession());
    if (S.micSettings) L.push("микрофон: " + S.micSettings);
    if (S.persist) L.push("хранилище: persist already=" + S.persist.already + " granted=" + S.persist.granted + "; IndexedDB=" + S.persist.idb + (S.persist.quota ? "; " + S.persist.quota : ""));
    if (E.rec1 && E.rec1.info) L.push("запись 1: " + JSON.stringify({ rate: E.rec1.info.sampleRate, worklet: E.rec1.info.worklet, frames: E.rec1.info.frames, sessionAfter: E.rec1.info.sessionAfter }));
    if (E.rec2 && E.rec2.info) L.push("запись 2: " + JSON.stringify({ rate: E.rec2.info.sampleRate, worklet: E.rec2.info.worklet, frames: E.rec2.info.frames, sessionAfter: E.rec2.info.sessionAfter }));
    if (LK.events.length) { L.push(""); L.push("ПОГАШЕННЫЙ ЭКРАН — события"); LK.events.slice(-16).forEach(function (e) { L.push("  " + e); }); }
    if (S.errs.length) { L.push(""); L.push("ОШИБКИ СТРАНИЦЫ"); S.errs.slice(-6).forEach(function (e) { L.push("  " + e); }); }
    L.push(""); L.push("ПОРЯДОК ДЕЙСТВИЙ");
    S.seq.slice(-30).forEach(function (s) { L.push("  " + s); });
    return L.join("\n");
  }
  async function copyReport() {
    var txt = buildReport(), ok = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(txt); ok = true; } } catch (e) {}
    if (!ok) {
      try {
        var ta = h("textarea", { style: "position:fixed;left:-1000px;top:0;opacity:0", readonly: true }, txt);
        doc.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0, txt.length);
        ok = doc.execCommand("copy"); doc.body.removeChild(ta);
      } catch (e) {}
    }
    logSeq("копирование отчёта: " + (ok ? "ок" : "не вышло"));
    if (ok) toast("Отчёт скопирован — вставь его в чат с Claude");
    else { E.showRep = true; render(); toast("Не вышло — выдели текст ниже и скопируй"); setTimeout(function () { var t = $("repText"); if (t) { t.focus(); t.select(); } }, 80); }
  }

  /* ---------------------------------------------------------------- шаги и переходы */
  var STEPS = [
    { id: "memo", title: "Памятка", view: vMemo, nonum: true, done: function () { return true; }, next: "Начать →" },
    { id: "home", title: "Поставить на «Домой»", view: vHome, done: function () { return MODE === "home"; }, skip: "Проверять в Safari (хуже) →" },
    { id: "top", title: "Верх экрана", view: vTop, done: function () { return !!getRes("topbar"); } },
    { id: "netOn", title: "Связь с VPN", view: function () { return vNet("on"); }, done: function () { return !!getRes("net_on"); } },
    { id: "netOff", title: "Связь без VPN", view: function () { return vNet("off"); }, done: function () { return !!getRes("net_off"); } },
    { id: "ref", title: "Эталон громкости", view: vRef, done: function () { return !!(E.ref && E.ref.st === "done"); } },
    { id: "rec1", title: "Микрофон и звук после него", view: function () { return vRec("rec1"); }, done: function () { return !!getRes("vol_now"); } },
    { id: "rec2", title: "Звук с исправлением", view: function () { return vRec("rec2"); }, done: function () { return !!getRes("vol_fix"); } },
    { id: "silent", title: "Беззвучный режим", view: vSilent, done: function () { return !!getRes("silent"); } },
    { id: "lock", title: "Погашенный экран", view: vLock, done: function () { return !!getRes("lock") || !!getRes("lockui"); } },
    { id: "kb", title: "Клавиатура", view: vKb, done: function () { return !!getRes("kb"); }, nofoot: true, kb: true },
    { id: "offline", title: "Без интернета", view: vOffline, done: function () { var o = getRes("offline"); return !!o; }, next: "К итогу →" },
    { id: "sum", title: "Итог", view: vSummary, nonum: true, nofoot: true }
  ];
  var NUM = STEPS.filter(function (s) { return !s.nonum; }).length;
  function curIdx() { return Math.max(0, Math.min(STEPS.length - 1, S.step || 0)); }
  function curId() { return STEPS[curIdx()].id; }
  function stepNo(i) { var n = 0; for (var k = 0; k <= i; k++) if (!STEPS[k].nonum) n++; return n; }
  function go(i) {
    if (curId() === "lock") stopLock();
    stopAudio();
    i = Math.max(0, Math.min(STEPS.length - 1, i));
    S.step = i; save();
    if (STEPS[i].id === "lock") keepAwake(false); else keepAwake(true);
    render();
    var v = $("view"); if (v) v.scrollTop = 0;
  }
  function renderFoot(st, i) {
    var f = $("foot"); f.textContent = "";
    if (st.nofoot) return;
    var done = st.done ? st.done() : true;
    if (st.id === "memo") { f.appendChild(btn("Начать →", "pri", function () { go(1); })); return; }
    f.appendChild(done
      ? btn(st.next || "Дальше →", "pri", function () { go(i + 1); })
      : btn(st.skip || "Пропустить шаг →", "sec", function () { go(i + 1); }));
  }
  function render() {
    if (!S) return;
    var i = curIdx(), st = STEPS[i], view = $("view");
    var scroll = view.scrollTop, same = view.getAttribute("data-step") === st.id;
    view.textContent = "";
    view.setAttribute("data-step", st.id);
    view.className = "view" + (st.kb ? " kbpad" : "");
    add(view, st.view());
    $("stepno").textContent = st.nonum ? st.title : "Шаг " + stepNo(i) + " из " + NUM;
    $("barfill").style.width = Math.round(100 * (st.id === "sum" ? NUM : (st.nonum ? 0 : stepNo(i) - 1)) / NUM) + "%";
    $("btnSum").textContent = st.id === "sum" ? "← Шаги" : "Итог";
    $("btnBack").hidden = (i === 0 || st.id === "sum");
    renderFoot(st, i);
    // нижние кнопки шага «Клавиатура»
    var old = $("kbwrap"); if (old) old.parentNode.removeChild(old);
    if (st.kb) {
      var w = h("div", { id: "kbwrap", class: "kbwrap" },
        h("button", { type: "button", id: "kbB", class: "kbB", onclick: function () { toast("Кнопка Б нажата"); } }, "Проверить (Б) — над клавиатурой"),
        h("button", { type: "button", id: "kbA", class: "kbA", onclick: function () { toast("Кнопка А нажата"); } }, "Проверить (А) — внизу"));
      doc.body.appendChild(w); kbPos();
    }
    if (st.id === "sum") {
      var fo = $("foot"); fo.textContent = "";
      fo.appendChild(btn("Скопировать отчёт", "pri", copyReport));
      fo.appendChild(h("div", { class: "row" },
        btn(E.showRep ? "Скрыть текст" : "Текст", "ghost", function () { E.showRep = !E.showRep; render(); }),
        btn("Памятка", "ghost", function () { go(0); }),
        btn(E.sure ? "Точно?" : "Заново", "ghost", function () {
          if (!E.sure) { E.sure = true; render(); setTimeout(function () { E.sure = false; if (curId() === "sum") render(); }, 4000); return; }
          E.sure = false; var keep = S.launches; S = fresh(); S.launches = keep; save(); E = {};
          LK.phase = "idle"; LK.hidden = []; LK.h = null; LK.events = []; LK.actions = {};
          autoBasic(); openCheck(); setupSW().then(function () { return autoStorage(); }); go(0);
        })));
      fo.style.display = "";
    }
    if (same && st.id !== "sum") view.scrollTop = scroll;
  }

  /* ---------------------------------------------------------------- запуск */
  function boot() {
    S = load() || fresh();
    var first = !S.launches.length;
    window.addEventListener("error", function (e) { try { S.errs.push(fmtClock(Date.now()) + " " + (e.message || "ошибка") + (e.filename ? " @" + String(e.filename).split("/").pop() + ":" + e.lineno : "")); save(); showErr(); } catch (x) {} });
    window.addEventListener("unhandledrejection", function (e) { try { var r = e.reason; S.errs.push(fmtClock(Date.now()) + " promise: " + ((r && (r.name + ": " + r.message)) || r)); save(); showErr(); } catch (x) {} });
    $("btnSum").addEventListener("click", function () {
      if (curId() === "sum") go(S.back || 1);
      else { S.back = curIdx(); save(); go(STEPS.length - 1); }
    });
    $("btnBack").addEventListener("click", function () { go(curIdx() - 1); });
    if (window.visualViewport) { window.visualViewport.addEventListener("resize", function () { kbPos(); kbMeasure(); }); window.visualViewport.addEventListener("scroll", function () { kbPos(); kbMeasure(); }); }
    doc.addEventListener("visibilitychange", function () { if (!doc.hidden && curId() !== "lock") keepAwake(true); });
    lockAudioEvents();
    autoBasic();
    recordLaunch();
    preloadSay();
    setupSW().then(function () { return autoStorage(); }).then(function () { if (curId() === "sum") render(); });
    if (first && MODE === "home") S.step = 2; // свежая установка с «Домой»: памятку уже читали в Safari
    if (S.step > STEPS.length - 1 || S.step < 0) S.step = 0;
    keepAwake(curId() !== "lock");
    render();
  }
  function showErr() { /* ошибки уходят в отчёт; на экране — только тихая подсказка */ var el = $("toast"); if (el && curId() !== "sum") { toast("Что-то пошло не так — это попадёт в отчёт"); } }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot); else boot();
  window.__probe = { render: render, go: go, S: function () { return S; }, E: function () { return E; }, buildReport: buildReport, STEPS: STEPS, kbMeasure: kbMeasure };
})();
