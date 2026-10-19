/* Голос Mira. Текст ответа режется на фразы, каждая фраза озвучивается на сервере (/api/tts) и играется здесь.
   Звук играет сама страница (так телефон разрешает его после нажатия кнопки «Голос»), а громкость звука
   отправляется роботу, чтобы рот двигался вместе с речью. Если сервис голоса не отвечает, возвращается false,
   и страница использует голос браузера. */
(() => {
  const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
  let au = null, ac = null, an = null, td = null, fd = null;
  let token = 0, raf = 0, downUntil = 0, send = () => {}, urls = [];

  function unlock() {
    try {
      if (!au) { au = new Audio(); au.preload = 'auto'; au.setAttribute('playsinline', ''); }
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          ac = new AC(); const src = ac.createMediaElementSource(au);
          an = ac.createAnalyser(); an.fftSize = 1024; src.connect(an); an.connect(ac.destination);
          td = new Uint8Array(an.fftSize); fd = new Uint8Array(an.frequencyBinCount);
        }
      }
      if (ac && ac.state !== 'running') ac.resume();
      au.src = SILENT; const p = au.play(); if (p && p.catch) p.catch(() => {});
    } catch (_) {}
  }

  function prep(text) {
    return String(text || '')
      .replace(/https?:\/\/\S+/g, ' ').replace(/[*_`#>~|[\]{}<>]/g, ' ')
      .replace(/[\u{1F000}-\u{1FAFF}☀-➿️]/gu, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function chunk(text) {
    const parts = text.match(/[^.!?…]+[.!?…]*\s*/g) || [text]; const out = []; let cur = '';
    parts.forEach((p) => { if ((cur + p).length > 150 && cur) { out.push(cur.trim()); cur = p; } else cur += p; });
    if (cur.trim()) out.push(cur.trim());
    return out.map((c) => c.slice(0, 400));
  }
  async function fetchOne(text, ms) {
    try {
      const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(ms) });
      if (!r.ok) return null;
      const b = await r.blob(); if (!b.size) return null;
      const u = URL.createObjectURL(b); urls.push(u); return u;
    } catch (_) { return null; }
  }

  function level() {
    if (!an) { const t = performance.now() / 1000; return { open: .3 + .45 * Math.abs(Math.sin(t * 11)) * Math.abs(Math.sin(t * 3.1 + 1)), w: 1 }; }
    an.getByteTimeDomainData(td); let s = 0;
    for (let i = 0; i < td.length; i++) { const v = (td[i] - 128) / 128; s += v * v; }
    const rms = Math.sqrt(s / td.length); an.getByteFrequencyData(fd);
    const hz = ac.sampleRate / an.fftSize; let lo = 0, hi = 0;
    for (let i = 0; i < fd.length; i++) { const f = i * hz; if (f >= 100 && f < 1000) lo += fd[i]; else if (f >= 1500 && f < 5000) hi += fd[i]; }
    const lv = Math.min(1, Math.max(0, (rms - .015) / .18));
    return { open: Math.pow(lv, .7), w: Math.min(1.15, Math.max(.6, .7 + .45 * (hi / (hi + lo + 1)))) };
  }
  function tick(my) {
    if (my !== token) return;
    if (au && !au.paused && !au.ended) { const l = level(); send({ type: 'mira-mouth', open: l.open, w: l.w, on: true }); }
    raf = requestAnimationFrame(() => tick(my));
  }
  function release() { cancelAnimationFrame(raf); raf = 0; urls.forEach((u) => URL.revokeObjectURL(u)); urls = []; }
  function stop() {
    token++; release();
    try { if (au) au.pause(); } catch (_) {}
    send({ type: 'mira-mouth', on: false });
  }
  function playUrl(u, my) {
    return new Promise((resolve) => {
      let done = false; const end = (ok) => { if (done) return; done = true; au.onended = au.onerror = null; resolve(ok); };
      au.onended = () => end(true); au.onerror = () => end(false);
      au.src = u; const p = au.play();
      if (p && p.catch) p.catch(() => end(false));
      const guard = setInterval(() => { if (my !== token) { clearInterval(guard); end(false); } else if (done) clearInterval(guard); }, 200);
    });
  }

  /* озвучить текст; true — звук пошёл, false — сервис недоступен (нужен запасной голос) */
  async function speak(text, sender) {
    if (sender) send = sender;
    if (!au || Date.now() < downUntil) return false;
    stop(); const my = ++token;
    const parts = chunk(prep(text)); if (!parts.length) return false;
    const jobs = parts.map((p, i) => fetchOne(p, i === 0 ? 14000 : 30000));
    const first = await jobs[0];
    if (my !== token) return true;
    if (!first) { downUntil = Date.now() + 120000; return false; }
    tick(my);
    let u = first;
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) u = await jobs[i];
      if (my !== token) return true;
      if (u) { const ok = await playUrl(u, my); if (!ok && my !== token) return true; }
    }
    if (my === token) { send({ type: 'mira-mouth', on: false }); release(); }
    return true;
  }

  window.miraVoice = { unlock, speak, stop, down: () => Date.now() < downUntil };
})();
