/* Проба 2 для iPhone хозяина (30.10): 1) звук после записи — 5 сравнений разными способами,
   2) открытие без сети с журналом service worker, 3) отчёт ≈ 20 КБ для Claude — он же проверка вставки в чат окна.
   Ничего никуда не отправляет: результаты лежат в памяти страницы, отчёт копируется кнопкой.
   Проба 1 (11 шагов) лежит в probe-src/v1/. */
(function () {
  "use strict";
  window.__probeBoot = true;
  var VER = "pea993a3";
  var KEY = "zhprobe.v2";
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
        else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? "" : v);
      }
    }
    for (var j = 2; j < arguments.length; j++) add(el, arguments[j]);
    return el;
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function pad3(n) { return (n < 10 ? "00" : (n < 100 ? "0" : "")) + n; }
  function clock(t) { var d = new Date(t); return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds()); }
  function dateStr(t) { var d = new Date(t); return pad2(d.getDate()) + "." + pad2(d.getMonth() + 1) + "." + d.getFullYear() + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()); }
  function sec(ms) { return ms == null ? "?" : (ms / 1000).toFixed(1).replace(".", ",") + " с"; }
  function rnd() { return Math.random().toString(36).slice(2, 10); }
  function dbOf(x) { return x > 1e-9 ? 20 * Math.log10(x) : -120; }
  function dbs(x) { return x == null ? "?" : (x <= -100 ? "−∞" : String(Math.round(x)).replace("-", "−")) + " дБ"; }
  function errName(e) { return ((e && e.name) || "Error") + (e && e.message ? ": " + String(e.message).slice(0, 100) : ""); }
  function named(name, text) { var e = new Error(text || name); e.name = name; return e; }
  function timeout(p, ms, text) { return Promise.race([p, sleep(ms).then(function () { throw named("AbortError", text); })]); }
  var toastT = null;
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function btn(label, cls, fn, dis) { return h("button", { type: "button", class: "btn " + (cls || ""), onclick: fn, disabled: !!dis }, label); }
  function note(cls, text) { return h("div", { class: "note " + (cls || "") }, text); }

  /* ---------------------------------------------------------------- состояние */
  function fresh() { return { v: 2, step: "start", trial: 0, vol: [], offStart: 0, off: null, launches: [], seq: [], copied: 0, started: Date.now() }; }
  function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && s.v === 2) return s; } catch (e) {} return null; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  var S = load() || fresh();
  function logSeq(ev) { S.seq.push(clock(Date.now()) + " " + ev); if (S.seq.length > 120) S.seq.shift(); save(); }
  var E = {}; // что идёт сейчас, не сохраняется

  /* ---------------------------------------------------------------- где мы */
  var UA = navigator.userAgent || "";
  var MODE = "safari";
  try { if (navigator.standalone === true || matchMedia("(display-mode: standalone)").matches) MODE = "home"; } catch (e) {}
  function iosText() { var v = /Version\/(\d+(?:\.\d+)?)/.exec(UA), m = /OS (\d+)[_.](\d+)/.exec(UA); return v ? v[1] : (m ? m[1] + "." + m[2] : "?"); }
  function sess() { try { return navigator.audioSession ? navigator.audioSession.type + (navigator.audioSession.state ? "/" + navigator.audioSession.state : "") : "нет"; } catch (e) { return "?"; } }
  function setSess(t) { try { if (navigator.audioSession) navigator.audioSession.type = t; } catch (e) { return "ошибка " + errName(e); } return sess(); }

  /* ---------------------------------------------------------------- запуск, сеть, «без сети» */
  var L = { t: Date.now(), mode: MODE, on: navigator.onLine, ctl: !!(navigator.serviceWorker && navigator.serviceWorker.controller), v: VER };
  S.launches.push(L); if (S.launches.length > 20) S.launches.shift(); save();
  function quickNet() {
    var c = null; try { c = new AbortController(); } catch (e) {}
    var f = fetch("ping.txt?cold=" + rnd(), { cache: "no-store", signal: c ? c.signal : undefined })
      .then(function (r) { return r.ok; }, function () { return false; });
    return Promise.race([f, sleep(3500).then(function () { try { if (c) c.abort(); } catch (e) {} return "slow"; })]);
  }
  quickNet().then(function (r) { L.net = r; save(); offlineCheck(); if (S.step === "off") render(); });
  function offlineCheck() {
    if (!S.offStart || S.off || L.t < S.offStart) return; // считается только новое открытие после «Начинаю»
    if (L.on === false || L.net === false) {
      S.off = { ok: true, at: L.t, ctl: L.ctl, how: "сама отметила: открылась без сети" + (L.ctl ? ", через service worker" : ", но НЕ через service worker") };
      logSeq("без сети открылась"); save();
    }
  }
  window.addEventListener("offline", function () {
    if (S.step === "off" && S.offStart && !S.off && L.t < S.offStart) toast("Сначала закрой «Пробу» смахиванием вверх, потом открой с «Домой»");
  });
  function netText(l) { return l.on === false ? "нет (телефон без сети)" : (l.net === true ? "есть" : (l.net === false ? "нет" : (l.net === "slow" ? "медленно" : "?"))); }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(function (e) { E.swErr = errName(e); });
  }
  function cacheStatus() {
    if (!window.caches) return Promise.resolve({ n: 0, of: 11, err: "нет Cache API" });
    return caches.open("probe-" + VER).then(function (c) { return c.keys(); }).then(function (k) { return { n: k.length, of: 11 }; }, function (e) { return { n: 0, of: 11, err: errName(e) }; });
  }
  function readSwLog() {
    return new Promise(function (ok) {
      var r;
      try { r = indexedDB.open("probe-swlog", 1); } catch (e) { ok([]); return; }
      r.onupgradeneeded = function () { r.result.createObjectStore("ev", { autoIncrement: true }); };
      r.onerror = function () { ok([]); };
      r.onsuccess = function () {
        var db = r.result;
        try {
          var q = db.transaction("ev", "readonly").objectStore("ev").getAll();
          q.onsuccess = function () { ok(q.result || []); db.close(); };
          q.onerror = function () { ok([]); db.close(); };
        } catch (e) { ok([]); }
      };
    });
  }

  /* ---------------------------------------------------------------- звук: образец */
  var A = { url: null, blob: null, ab: null, err: null, decErr: null };
  function decodeOffline(buf) {
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return Promise.reject(named("NoAPI", "нет OfflineAudioContext"));
    var oc = new OAC(1, 44100, 44100);
    return new Promise(function (ok, bad) { var p = oc.decodeAudioData(buf, ok, bad); if (p && p.then) p.then(ok, bad); });
  }
  fetch("say3.mp3").then(function (r) { if (!r.ok) throw named("HTTP", "say3.mp3: " + r.status); return r.arrayBuffer(); })
    .then(function (buf) {
      A.blob = new Blob([buf], { type: "audio/mpeg" }); A.url = URL.createObjectURL(A.blob);
      return decodeOffline(buf.slice(0)).then(function (ab) { A.ab = ab; }, function (e) { A.decErr = errName(e); });
    })
    .catch(function (e) { A.err = errName(e); })
    .then(function () { if (S.step === "vol") render(); });
  function needWA(T) { return T.before === "stream" || T.after === "stream" || T.after === "gain"; }

  /* ---------------------------------------------------------------- звук: способы играть */
  function playEl(el, url) { // вызывать прямо из нажатия
    var t0 = performance.now();
    return new Promise(function (resolve) {
      var done = false, tm = null;
      function fin(ok, why) { if (done) return; done = true; clearTimeout(tm); el.removeEventListener("ended", onEnd); el.removeEventListener("error", onErr); resolve({ ok: ok, why: why, ms: Math.round(performance.now() - t0) }); }
      function onEnd() { fin(true, "ended"); }
      function onErr() { fin(false, "ошибка звука " + (el.error ? el.error.code : "?")); }
      el.addEventListener("ended", onEnd); el.addEventListener("error", onErr);
      if (el.getAttribute("data-src") !== url) { el.src = url; el.setAttribute("data-src", url); }
      try { el.currentTime = 0; } catch (e) {}
      var p;
      try { p = el.play(); } catch (e) { fin(false, errName(e)); return; }
      if (p && p.catch) p.catch(function (e) { fin(false, errName(e)); });
      tm = setTimeout(function () { fin(true, "timeout"); }, 12000);
    });
  }
  function playNewEl() { // новый плеер и новый адрес звука — ничего от прошлого
    var a = new Audio(); a.setAttribute("playsinline", ""); a.preload = "auto";
    var u = URL.createObjectURL(A.blob);
    return playEl(a, u).then(function (r) { setTimeout(function () { try { URL.revokeObjectURL(u); a.removeAttribute("src"); a.load(); } catch (e) {} }, 500); r.how = "новый плеер"; return r; });
  }
  function playWA(gain, viaStream) { // Web Audio: новый AudioContext на каждое проигрывание
    var AC = window.AudioContext || window.webkitAudioContext, t0 = performance.now();
    if (!AC || !A.ab) return Promise.resolve({ ok: false, why: AC ? "звук не готов" : "нет AudioContext" });
    var ctx = new AC(), el = viaStream ? $("aud2") : null, p = null, last;
    try { var rp = ctx.resume(); if (rp && rp.catch) rp.catch(function () {}); } catch (e) {}
    var src = ctx.createBufferSource(); src.buffer = A.ab; last = src;
    if (gain !== 1) {
      var g = ctx.createGain(); g.gain.value = gain;
      var lim = ctx.createDynamicsCompressor(); // ограничитель: усиление ×2 без треска
      lim.threshold.value = -1.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.1;
      src.connect(g); g.connect(lim); last = lim;
    }
    if (viaStream) {
      var dest = ctx.createMediaStreamDestination(); last.connect(dest);
      el.srcObject = dest.stream;
      try { p = el.play(); } catch (e) { p = Promise.reject(e); }
    } else last.connect(ctx.destination);
    src.start(ctx.currentTime + 0.06);
    var st0 = ctx.state;
    return new Promise(function (resolve) {
      var done = false, tm = null;
      function fin(ok, why) {
        if (done) return; done = true; clearTimeout(tm);
        try { src.stop(); } catch (e) {}
        if (el) { try { el.pause(); } catch (e) {} try { el.srcObject = null; } catch (e) {} }
        var info = { ok: ok, why: why, ms: Math.round(performance.now() - t0), ctx: st0 + "→" + ctx.state, rate: ctx.sampleRate };
        try { ctx.close(); } catch (e) {}
        resolve(info);
      }
      src.onended = function () { setTimeout(function () { fin(true, "ended"); }, 150); };
      tm = setTimeout(function () { fin(true, "timeout"); }, 12000);
      if (p && p.catch) p.catch(function (e) { fin(false, "play: " + errName(e)); });
    });
  }
  function play(kind) {
    if (kind === "el") return playEl($("aud"), A.url);
    if (kind === "newel") return playNewEl();
    if (kind === "stream") return playWA(1, true);
    return playWA(2, false); // "gain"
  }

  /* ---------------------------------------------------------------- микрофон: два способа записи */
  function gum() { return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
  async function recWorklet(seconds, onLevel) { // как в пробе 1: AudioContext + AudioWorklet (так приложение берёт сырые отсчёты для тонов)
    var info = { how: "AudioWorklet" }, frames = [], peak = 0, tick = null, ctx, src = null, stream = null;
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) throw named("NoAPI", "у страницы нет микрофона");
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw named("NoAPI", "нет AudioContext");
    ctx = new AC(); // до первого await: iPhone пускает к звуку и микрофону только из нажатия
    try { var rp = ctx.resume(); if (rp && rp.catch) rp.catch(function () {}); } catch (e) {}
    var g = gum();
    try { stream = await timeout(g, 30000, "iPhone не ответил про микрофон за 30 с"); } catch (e1) { try { ctx.close(); } catch (e2) {} throw e1; }
    try {
      if (ctx.state !== "running") { try { await timeout(ctx.resume(), 1500, "resume"); } catch (e3) {} }
      info.ctx = ctx.state; info.rate = ctx.sampleRate;
      src = ctx.createMediaStreamSource(stream);
      var node = null;
      try {
        await ctx.audioWorklet.addModule("worklet.js");
        node = new AudioWorkletNode(ctx, "lvl");
        node.port.onmessage = function (ev) { frames.push(ev.data.rms); if (ev.data.peak > peak) peak = ev.data.peak; if (onLevel) onLevel(ev.data.rms); };
        var sink = ctx.createGain(); sink.gain.value = 0; node.connect(sink); sink.connect(ctx.destination);
        src.connect(node); info.worklet = true;
      } catch (e4) { info.workletErr = errName(e4); node = null; }
      if (!node) { // запасной измеритель
        var an = ctx.createAnalyser(), bytes = new Uint8Array(2048); an.fftSize = 2048; src.connect(an);
        tick = setInterval(function () {
          an.getByteTimeDomainData(bytes);
          var s = 0, pk = 0;
          for (var i = 0; i < bytes.length; i++) { var x = (bytes[i] - 128) / 128; s += x * x; var a = x < 0 ? -x : x; if (a > pk) pk = a; }
          var rms = Math.sqrt(s / bytes.length); frames.push(rms); if (pk > peak) peak = pk; if (onLevel) onLevel(rms);
        }, 50);
      }
      await sleep(seconds * 1000);
    } finally {
      if (tick) clearInterval(tick);
      try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e5) {}
      try { if (src) src.disconnect(); } catch (e6) {}
      try { await ctx.close(); } catch (e7) {}
    }
    info.peakDb = Math.round(dbOf(peak));
    var voiced = frames.filter(function (r) { return dbOf(r) > -45; });
    info.voiced = frames.length ? Math.round(100 * voiced.length / frames.length) : 0;
    info.frames = frames.length;
    return info;
  }
  async function recMR(seconds) { // MediaRecorder: во время записи нет ни одного AudioContext
    var info = { how: "MediaRecorder" }, stream = null, mr = null, chunks = [];
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) throw named("NoAPI", "у страницы нет микрофона");
    if (!window.MediaRecorder) throw named("NoAPI", "нет MediaRecorder");
    var g = gum();
    stream = await timeout(g, 30000, "iPhone не ответил про микрофон за 30 с");
    try {
      mr = new MediaRecorder(stream);
      info.mime = mr.mimeType;
      var stopped = new Promise(function (r) { mr.onstop = r; });
      mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      mr.start();
      await sleep(seconds * 1000);
      mr.stop();
      await timeout(stopped, 3000, "запись не остановилась");
    } finally {
      try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    }
    info.blob = new Blob(chunks, { type: (mr && mr.mimeType) || "audio/mp4" });
    info.bytes = info.blob.size;
    return info;
  }
  function decodeRec(blob) { // годится ли такая запись для разбора тона: читается ли в сырые отсчёты
    return blob.arrayBuffer().then(decodeOffline).then(function (ab) {
      var d = ab.getChannelData(0), pk = 0;
      for (var i = 0; i < d.length; i++) { var a = d[i] < 0 ? -d[i] : d[i]; if (a > pk) pk = a; }
      return { ok: true, dur: Math.round(ab.duration * 10) / 10, peakDb: Math.round(dbOf(pk)) };
    });
  }
  function micErr(e) {
    var n = (e && e.name) || "Error";
    if (n === "NotAllowedError" || n === "PermissionDeniedError") return "iPhone не дал доступ к микрофону. Закрой «Пробу», открой снова и нажми «Разрешить».";
    if (n === "NotFoundError" || n === "OverconstrainedError") return "Микрофон не найден — проверь, не закрыт ли он чехлом.";
    if (n === "NotReadableError" || n === "AbortError") return "Микрофон занят (звонок, запись, другое приложение) или не ответил. Нажми ещё раз.";
    if (n === "NoAPI" || n === "SecurityError" || n === "TypeError") return "У страницы нет микрофона (" + ((e && e.message) || n) + ").";
    return "Ошибка микрофона: " + errName(e);
  }
  function meter(rms) { var i = $("meterI"); if (i) i.style.width = Math.max(0, Math.min(100, (dbOf(rms) + 60) * 2)) + "%"; }

  /* ---------------------------------------------------------------- 5 сравнений */
  var TRIALS = [
    { id: "now", name: "как сейчас: запись через AudioWorklet → тот же плеер сразу", rec: "wl", before: "el", after: "el" },
    { id: "modes", name: "режимы: play-and-record до записи → playback после, пауза 0,5 с", rec: "wl", pre: "play-and-record", post: "playback", gap: 500, before: "el", after: "el" },
    { id: "stream", name: "через поток: Web Audio → MediaStream → <audio> (и до, и после)", rec: "wl", before: "stream", after: "stream" },
    { id: "gain", name: "громче ×2: после записи — Web Audio с усилением ×2 и ограничителем", rec: "wl", before: "el", after: "gain" },
    { id: "mr", name: "запись MediaRecorder без AudioContext → пауза 2,5 с → новый плеер", rec: "mr", gap: 2500, before: "el", after: "newel" }
  ];
  var ANS = { same: "одинаково громко", quieter: "после записи ТИШЕ", louder: "после записи громче", both: "оба раза тихо", skip: "пропущено" };
  function tr() { return E.tr || (E.tr = { phase: 0, err: null, log: { sess: {}, play: {}, replays: 0 } }); }
  function tBefore() {
    var T = TRIALS[S.trial], R = tr();
    R.log.sess.before = sess(); R.err = null; R.phase = 1; render();
    play(T.before).then(function (r) {
      R.log.play.before = r; R.phase = r.ok ? 2 : 0;
      if (!r.ok) R.err = "Звук не заиграл (" + r.why + "). Нажми «Послушай» ещё раз.";
      render();
    });
  }
  function tRec() {
    var T = TRIALS[S.trial], R = tr();
    if (R.phase === 3) return;
    if (T.pre) R.log.sess.pre = setSess(T.pre);
    R.log.sess.rec = sess(); R.err = null; R.phase = 3; render();
    logSeq("сравнение " + (S.trial + 1) + ": запись, режим " + sess());
    (T.rec === "mr" ? recMR(2) : recWorklet(2, meter)).then(function (info) {
      R.rec = info; R.recEnd = Date.now();
      R.log.rec = info.how + (info.peakDb != null ? ", пик " + dbs(info.peakDb) + ", голос " + info.voiced + "%" : "") + (info.mime ? ", " + info.mime + " " + Math.round(info.bytes / 1024) + " КБ" : "") + (info.workletErr ? ", worklet: " + info.workletErr : "");
      if (T.post) R.log.sess.post = setSess(T.post);
      R.log.sess.afterRec = sess();
      if (T.gap) { R.phase = 4; render(); setTimeout(function () { R.phase = 5; render(); }, T.gap); }
      else { R.phase = 5; render(); }
    }, function (e) {
      R.phase = 2; R.err = micErr(e); R.log.micErr = errName(e); logSeq("микрофон: " + errName(e)); render();
    });
  }
  function tAfter() {
    var T = TRIALS[S.trial], R = tr();
    R.log.gap = Date.now() - R.recEnd; R.log.sess.after = sess(); R.err = null; R.phase = 6; render();
    play(T.after).then(function (r) {
      R.log.play.after = r; R.phase = r.ok ? 7 : 5;
      if (!r.ok) R.err = "Звук не заиграл (" + r.why + "). Нажми ещё раз.";
      render();
      if (T.rec === "mr" && R.rec && R.rec.blob && !R.decoding) {
        R.decoding = true;
        decodeRec(R.rec.blob).then(function (d) { R.log.decode = d; save(); }, function (e) { R.log.decode = { ok: false, err: errName(e) }; save(); });
      }
    });
  }
  function tReplay() {
    var T = TRIALS[S.trial], R = tr();
    R.log.replays++; R.phase = 6; render();
    play(T.after).then(function (r) { R.log.play.again = r; R.phase = 7; render(); });
  }
  function tAnswer(val) {
    var T = TRIALS[S.trial], R = tr();
    R.log.id = T.id; R.log.ans = val; R.log.at = Date.now();
    S.vol[S.trial] = R.log;
    logSeq("сравнение " + (S.trial + 1) + " (" + T.id + "): " + ANS[val]);
    S.trial++;
    if (S.trial >= TRIALS.length) { S.step = "off"; save(); E.tr = null; render(); return; }
    save();
    // следующее сравнение — с чистой страницы: iPhone может держать «режим после микрофона» внутри страницы
    E.reloading = true; render();
    setTimeout(function () { location.reload(); }, 250);
  }

  /* ---------------------------------------------------------------- экраны */
  function dots() {
    var d = h("div", { class: "dots" });
    for (var i = 0; i < TRIALS.length; i++) d.appendChild(h("i", { class: i < S.trial ? "fin" : (i === S.trial ? "on" : "") }));
    return d;
  }
  function vStart() {
    var out = [
      h("h1", { text: "Проба 2 · 3 минуты" }),
      h("p", { class: "lead", text: "Три короткие проверки: звук после записи, открытие без сети и отчёт для Claude." }),
      h("div", { class: "card" }, h("ol", { class: "steps" },
        h("li", { text: "Без наушников, беззвучный режим выключен, громкость средняя. Кнопки громкости до конца проверки не трогай." }),
        h("li", { text: "5 сравнений звука: послушай → скажи «你好» → послушай ещё раз → ответь, громче или тише." }),
        h("li", { text: "Без сети: закрыть «Пробу», включить авиарежим, открыть." }),
        h("li", { text: "Скопировать отчёт и вставить в чат Claude." })))
    ];
    if (MODE !== "home") out.push(note("warn", "Ты в Safari. Лучше открыть «Пробу» с экрана «Домой» — так проверка честная."));
    out.push(btn("Начать", "", function () { S.step = "vol"; S.trial = 0; S.vol = []; logSeq("начал, " + (MODE === "home" ? "«Домой»" : "Safari")); save(); render(); }));
    return out;
  }
  function vVol() {
    var R = tr(), T = TRIALS[S.trial], first = S.trial === 0, out = [dots(), h("h1", { text: "Сравнение " + (S.trial + 1) + " из " + TRIALS.length })];
    if (E.reloading) { out.push(h("p", { class: "mut", text: "Секунду…" })); return out; }
    var stuck = A.err || (needWA(T) && A.decErr);
    if (R.phase <= 1) {
      out.push(h("p", { class: "lead", text: first ? "Послушай, как звучит сейчас." : "Страница перезапустилась. Послушай, как звучит сейчас." }));
      if (A.err) out.push(note("bad", "Звук не загрузился: " + A.err + ". Закрой «Пробу» и открой с включённой сетью."));
      else if (stuck) out.push(note("bad", "Этот способ здесь не работает: " + A.decErr + "."));
      var ready = !!A.url && (!needWA(T) || !!A.ab);
      out.push(btn(R.phase === 1 ? "Играет…" : (ready ? "▶ Послушай" : "Готовлю звук…"), "", tBefore, R.phase === 1 || !ready));
    } else if (R.phase <= 3) {
      out.push(h("p", { class: "lead", text: "Теперь скажи «你好» (ни хао) — запись 2 секунды." }));
      if (R.phase === 3) out.push(h("div", { class: "meter" }, h("i", { id: "meterI" })));
      out.push(btn(R.phase === 3 ? "Говори… идёт запись" : "● Записать и сказать «你好»", "rec", tRec, R.phase === 3));
      out.push(h("p", { class: "small", text: "Если iPhone спросит про микрофон — «Разрешить»." }));
    } else if (R.phase <= 6) {
      out.push(h("p", { class: "lead", text: "Послушай ещё раз и сравни громкость с первым разом." }));
      out.push(btn(R.phase === 4 ? "Секунду…" : (R.phase === 6 ? "Играет…" : "▶ Послушай ещё раз"), "", tAfter, R.phase !== 5));
    } else {
      out.push(h("div", { class: "q", text: "Второй раз было…" }));
      out.push(h("div", { class: "grid" },
        btn("Одинаково громко", "g", function () { tAnswer("same"); }),
        btn("После записи тише", "y", function () { tAnswer("quieter"); }),
        btn("После записи громче", "b", function () { tAnswer("louder"); }),
        btn("Оба раза тихо", "n", function () { tAnswer("both"); })));
      out.push(btn("▶ Послушать второй раз ещё раз", "ghost", tReplay));
    }
    if (R.err) out.push(note("bad", R.err));
    if (R.err || stuck) {
      if (stuck && !R.log.micErr) R.log.micErr = "звук: " + (A.err || A.decErr);
      out.push(btn("Пропустить это сравнение", "ghost", function () { tAnswer("skip"); }));
    }
    return out;
  }
  function vOff() {
    var out = [h("h1", { text: "Без сети" })];
    if (S.off) {
      if (S.off.ok) out.push(h("div", { class: "big-ok", text: "✓ Без сети открылась" }), h("p", { text: "Выключи авиарежим (если ещё включён) и жми «Дальше»." }));
      else out.push(note("bad", "Без сети не открылась: " + S.off.how + ". Это тоже ответ — Claude разберёт по журналу."));
      out.push(btn("Дальше", "", function () { S.step = "send"; save(); render(); }));
      return out;
    }
    if (!S.offStart) {
      out.push(h("div", { class: "card" }, h("ol", { class: "steps" },
        h("li", { text: "Нажми «Начинаю»." }),
        h("li", { text: "Закрой «Пробу»: смахни её вверх в переключателе приложений." }),
        h("li", { text: "Включи авиарежим." }),
        h("li", { text: "Открой «Пробу» с экрана «Домой». Откроется — увидишь зелёную галочку." }),
        h("li", { text: "Не откроется — выключи авиарежим, включи VPN и открой «Пробу» ещё раз: она спросит, что было." }))));
      var cs = h("p", { class: "small", id: "cacheLine", text: "Проверяю, сохранена ли страница в телефоне…" });
      out.push(cs);
      cacheStatus().then(function (c) {
        var el = $("cacheLine"); if (!el) return;
        el.textContent = c.n >= c.of ? "В памяти телефона: " + c.n + " из " + c.of + " файлов ✓" : "В памяти пока " + c.n + " из " + c.of + " файлов — подожди 10 секунд с включённой сетью." + (c.err ? " (" + c.err + ")" : "");
      });
      out.push(btn("Начинаю", "", function () { S.offStart = Date.now(); logSeq("без сети: начал (закрыть → авиарежим → открыть)"); save(); render(); }));
      return out;
    }
    if (L.t > S.offStart) { // новое открытие после «Начинаю», а галочки нет
      if (L.net === undefined && L.on !== false) { out.push(h("p", { class: "mut", text: "Проверяю связь…" })); return out; }
      out.push(h("div", { class: "q", text: "Без сети не открылась? Что было в авиарежиме?" }));
      var said = function (how) { S.off = { ok: false, how: how, at: Date.now() }; logSeq("без сети: " + how); save(); render(); };
      out.push(btn("Ошибка Safari «нет подключения»", "sec", function () { said("ошибка Safari «нет подключения к интернету»"); }));
      out.push(btn("Белый или пустой экран", "sec", function () { said("белый или пустой экран"); }));
      out.push(btn("Окно «выключите авиарежим»", "sec", function () { said("окно iPhone «выключите авиарежим»"); }));
      out.push(btn("Открылась, но галочки не было", "sec", function () { said("открылась, но страница не отметила"); }));
      out.push(btn("Ещё не пробовал — попробую", "ghost", function () { S.offStart = Date.now(); save(); render(); }));
      return out;
    }
    out.push(h("p", { class: "lead", text: "Теперь закрой «Пробу» (смахни вверх), включи авиарежим и открой её с экрана «Домой»." }));
    out.push(h("p", { class: "mut", text: "Страница сама отметит, если откроется без сети." }));
    out.push(btn("Начать заново", "ghost", function () { S.offStart = 0; save(); render(); }));
    return out;
  }

  /* ---------------------------------------------------------------- отчёт ≈ 20 КБ */
  var CRCT = (function () { var t = [], c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function utf8(s) { return new TextEncoder().encode(s); }
  function crc32(s) { var b = utf8(s), c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRCT[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return ((c ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, "0"); }
  var WORDS = [["你好", "nǐ hǎo", "привет"], ["谢谢", "xièxie", "спасибо"], ["不客气", "bú kèqi", "не за что"], ["多少钱", "duōshao qián", "сколько стоит"],
    ["老师", "lǎoshī", "учитель"], ["学生", "xuésheng", "студент"], ["汉语", "Hànyǔ", "китайский"], ["朋友", "péngyou", "друг"], ["吃饭", "chī fàn", "есть"],
    ["喝茶", "hē chá", "пить чай"], ["绿色", "lǜsè", "зелёный"], ["女儿", "nǚ'ér", "дочь"], ["对不起", "duìbuqǐ", "извините"], ["没关系", "méi guānxi", "ничего"],
    ["再见", "zàijiàn", "до свидания"], ["银行", "yínháng", "банк"]];
  function filler(target) { // строки как будущий прогресс: у каждой своя короткая сумма, в шапке — общая
    var rows = [], size = 0, i = 0;
    while (size < target || rows.length < 20) {
      var w = WORDS[i % WORDS.length], n = i + 1;
      var body = '{"n":' + n + ',"w":"hj1-' + pad2(1 + (i % 15)) + "-" + pad3(n) + '","h":"' + w[0] + '","p":"' + w[1] + '","r":"' + w[2] +
        '","a":"' + ["✓✓", "✓✗", "✗✓", "✓"][i % 4] + '","ms":[' + (900 + (i * 137) % 2100) + "," + (700 + (i * 89) % 1600) + "]}";
      var row = "#" + pad3(n) + " " + body + " ·" + crc32(body).slice(0, 4);
      rows.push(row); size += utf8(row).length + 1; i++;
    }
    var all = rows.join("\n"), sum = crc32(all);
    return "=== ПРОВЕРКА ВСТАВКИ · строк " + rows.length + " · байт " + utf8(all).length + " · контроль " + sum + " ===\n" + all + "\n=== КОНЕЦ · строк " + rows.length + " · контроль " + sum + " ===";
  }
  function playText(r) { return r ? (r.ok ? "ok" : "ОШИБКА " + r.why) + " " + sec(r.ms) + (r.ctx ? " (ctx " + r.ctx + ", " + r.rate + " Гц)" : "") : "—"; }
  function trialText(r) {
    if (!r) return "не пройдено";
    var s = r.sess || {}, p = r.play || {};
    var t = (ANS[r.ans] || r.ans) + " · пауза до «после» " + sec(r.gap) +
      " · режим: до " + (s.before || "?") + (s.pre ? ", перед записью поставили → " + s.pre : "") + ", в записи " + (s.rec || "?") +
      ", после записи " + (s.afterRec || "?") + (s.post ? " (поставили " + s.post + ")" : "") + ", при «после» " + (s.after || "?") +
      " · запись: " + (r.rec || r.micErr || "—") + " · звук «до»: " + playText(p.before) + ", «после»: " + playText(p.after);
    if (r.replays) t += " · переслушал " + r.replays + " (" + playText(p.again) + ")";
    if (r.decode) t += " · запись читается для тонов: " + (r.decode.ok ? "да, " + String(r.decode.dur).replace(".", ",") + " с, пик " + dbs(r.decode.peakDb) : "НЕТ " + r.decode.err);
    if (r.micErr) t += " · микрофон: " + r.micErr;
    return t;
  }
  var SWK = { install: "установка", activate: "включение", page: "открытие страницы", miss: "нет в памяти" };
  function swText(e) {
    var d = "";
    if (e.k === "page") d = e.from + (e.st ? " " + e.st : "") + (e.redir ? " (был ПЕРЕНАПРАВЛЕН)" : "") + ", " + e.ms + " мс" + (e.err ? ", ошибка " + e.err : "");
    else if (e.k === "install") d = (e.ok ? "ok, файлов " + e.n : "ОШИБКА " + e.err) + ", " + sec(e.ms);
    else if (e.k === "activate") d = "старых кэшей " + e.old + ", окон " + e.wins + ", перезагрузил " + e.moved;
    else d = (e.url || "") + " " + (e.err || "");
    return clock(e.t) + " " + (SWK[e.k] || e.k) + ": " + d + " · сеть " + (e.on ? "есть" : "НЕТ") + " · " + e.v;
  }
  function buildReport() {
    return Promise.all([readSwLog(), cacheStatus()]).then(function (x) {
      var sw = x[0], cs = x[1], L2 = [];
      L2.push("ПРОБА 2 · iPhone → Claude · " + dateStr(Date.now()) + " · версия " + VER);
      L2.push("Режим: " + (MODE === "home" ? "с экрана «Домой»" : "в Safari") + " · iOS " + iosText() + " · audioSession: " + (navigator.audioSession ? "есть" : "нет") + " · MediaRecorder: " + (window.MediaRecorder ? "есть" : "нет"));
      L2.push("");
      L2.push("ЗВУК ПОСЛЕ ЗАПИСИ — «до» и «после» в одном сравнении, между сравнениями страница перезапускалась");
      TRIALS.forEach(function (T, i) { L2.push((i + 1) + ". " + T.name + " → " + trialText(S.vol[i])); });
      L2.push("");
      L2.push("БЕЗ СЕТИ");
      L2.push("Итог: " + (S.off ? (S.off.ok ? "✓ " : "✗ ") + S.off.how : (S.offStart ? "начал в " + clock(S.offStart) + ", результата нет" : "не проверял")));
      L2.push("В памяти телефона: " + cs.n + " из " + cs.of + " файлов" + (cs.err ? " (" + cs.err + ")" : "") + (E.swErr ? " · регистрация service worker: " + E.swErr : ""));
      L2.push("Журнал service worker (последние " + Math.min(40, sw.length) + " из " + sw.length + "):");
      sw.slice(-40).forEach(function (e) { L2.push("  " + swText(e)); });
      L2.push("Открытия страницы:");
      S.launches.slice(-12).forEach(function (l) { L2.push("  " + clock(l.t) + " " + (l.mode === "home" ? "«Домой»" : "Safari") + " · сеть: " + netText(l) + " · через service worker: " + (l.ctl ? "да" : "нет") + " · " + l.v); });
      L2.push("");
      L2.push("ПОРЯДОК ДЕЙСТВИЙ");
      S.seq.slice(-60).forEach(function (s) { L2.push("  " + s); });
      L2.push("");
      L2.push("ТЕХНИЧЕСКИ");
      L2.push("строка браузера: " + UA);
      L2.push("экран " + screen.width + "×" + screen.height + " @" + (window.devicePixelRatio || 1) + "x; окно " + innerWidth + "×" + innerHeight + "; audioSession сейчас: " + sess());
      var head = L2.join("\n");
      return head + "\n\n" + filler(20000 - utf8(head).length - 200);
    });
  }
  function copyText(t, done) {
    function fallback() {
      var ta = h("textarea", { class: "out", readonly: true }); ta.value = t; doc.body.appendChild(ta);
      ta.select(); try { ta.setSelectionRange(0, t.length); } catch (e) {}
      var ok = false; try { ok = doc.execCommand("copy"); } catch (e) {}
      doc.body.removeChild(ta); done(ok);
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(function () { done(true); }, fallback); return; }
    } catch (e) {}
    fallback();
  }
  function vSend() {
    var out = [h("h1", { text: "Отчёт для Claude" }),
      h("p", { class: "lead", text: "Последний шаг: скопируй отчёт и вставь в чат Claude. Заодно проверим, доходит ли 20 КБ текста целиком." })];
    if (!E.report) {
      out.push(h("p", { class: "mut", text: "Готовлю отчёт…" }));
      if (!E.building) { E.building = true; buildReport().then(function (t) { E.report = t; E.building = false; render(); }, function (e) { E.report = "ОТЧЁТ НЕ СОБРАЛСЯ: " + errName(e); E.building = false; render(); }); }
      return out;
    }
    var kb = Math.round(utf8(E.report).length / 1024);
    out.push(btn(E.copied ? "Скопировать ещё раз" : "Скопировать для Claude (" + kb + " КБ)", E.copied ? "sec" : "", function () {
      copyText(E.report, function (ok) {
        E.copied = ok; if (ok) { S.copied++; logSeq("скопировал отчёт " + kb + " КБ"); save(); }
        E.showText = !ok; toast(ok ? "Скопировано ✓" : "Не скопировалось — выдели текст ниже и скопируй"); render();
      });
    }));
    if (E.copied) out.push(note("ok", "✓ Скопировано. Теперь: приложение Claude → Code → окно №1 «Китайский» → нажми в поле → «Вставить» → отправь. Готово!"));
    out.push(h("div", { class: "card" }, h("ol", { class: "steps" },
      h("li", { text: "Выключи авиарежим, VPN — как обычно." }),
      h("li", { text: "Приложение Claude → вкладка Code → окно №1 «Китайский»." }),
      h("li", { text: "Нажми в поле ввода → «Вставить» → отправь." }))));
    if (E.showText) { var ta = h("textarea", { class: "out", readonly: true }); ta.value = E.report; out.push(ta); }
    else out.push(btn("Показать текст отчёта", "ghost", function () { E.showText = true; render(); }));
    out.push(btn("Пройти пробу заново", "ghost", function () {
      if (!confirm("Начать пробу заново? Ответы сотрутся.")) return;
      var keep = S.launches; S = fresh(); S.launches = keep; save(); E = {}; render();
    }));
    return out;
  }

  /* ---------------------------------------------------------------- отрисовка */
  function render() {
    var v = $("view");
    v.innerHTML = "";
    var t = $("ttl"); if (t) t.textContent = S.step === "vol" ? "Проба 2 · звук" : (S.step === "off" ? "Проба 2 · без сети" : (S.step === "send" ? "Проба 2 · отчёт" : "Проба 2"));
    add(v, S.step === "vol" ? vVol() : (S.step === "off" ? vOff() : (S.step === "send" ? vSend() : vStart())));
  }
  offlineCheck();
  render();
})();
