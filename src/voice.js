/* Голос Mira: русский голос Piper (Irina) работает прямо в браузере посетителя, отдельный сервер не нужен.
   Модель (~63 МБ) загружается один раз после нажатия «Голос» и кэшируется браузером. Синтез идёт в отдельном потоке.
   Звук играет через Web Audio (с лёгкой обработкой: тон выше, цифровой оттенок), а громкость отправляется роботу,
   чтобы рот двигался вместе с речью. Если голос недоступен, speak() возвращает false и страница использует голос браузера. */
(() => {
  const cfg = { pitch: 1.06, fx: 0.5, gain: 1.0 };
  let ac = null, an = null, td = null, fd = null, worker = null, ready = null, state = 'idle';
  let token = 0, raf = 0, send = () => {}, onstate = () => {}, nid = 0, cur = null;
  const pending = new Map();

  function setState(s, pct) { state = s; try { onstate({ state: s, pct }); } catch (_) {} }

  function unlock() {
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback'; /* звук и в беззвучном режиме iPhone */
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        ac = new AC(); an = ac.createAnalyser(); an.fftSize = 1024; an.connect(ac.destination);
        td = new Uint8Array(an.fftSize); fd = new Uint8Array(an.frequencyBinCount);
      }
      if (ac.state !== 'running') ac.resume();
      const b = ac.createBuffer(1, 1, 22050), s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0);
    } catch (_) {}
  }

  function call(msg) {
    return new Promise((resolve, reject) => { const id = ++nid; pending.set(id, { resolve, reject }); worker.postMessage({ ...msg, id }); });
  }
  /* загрузка модели; onState получает {state:'loading', pct} и {state:'ready'|'error'} */
  function prepare(cb) {
    if (cb) onstate = cb;
    if (ready) return ready;
    if (!window.Worker || !(window.AudioContext || window.webkitAudioContext)) { setState('error'); return (ready = Promise.resolve(false)); }
    setState('loading', 0);
    ready = new Promise((resolve) => {
      try {
        worker = new Worker('/vendor/piper/worker.js', { type: 'module' });
        worker.onmessage = (e) => {
          const m = e.data || {};
          if (m.type === 'progress') { if (m.total) setState('loading', Math.min(99, Math.round((m.loaded / m.total) * 100))); return; }
          const p = pending.get(m.id); if (!p) return; pending.delete(m.id);
          if (m.type === 'error') p.reject(new Error(m.message)); else p.resolve(m);
        };
        worker.onerror = () => { pending.forEach((p) => p.reject(new Error('worker'))); pending.clear(); };
        call({ type: 'init' }).then(() => { setState('ready'); resolve(true); }).catch(() => { setState('error'); resolve(false); });
      } catch (_) { setState('error'); resolve(false); }
    });
    return ready;
  }

  function prep(text) {
    return String(text || '')
      .replace(/https?:\/\/\S+/g, ' ').replace(/[*_`#>~|[\]{}<>]/g, ' ')
      .replace(/[\u{1F000}-\u{1FAFF}☀-➿️]/gu, ' ')
      .replace(/Compile Point/g, 'Компайл Поинт').replace(/Mira/g, 'Мира').replace(/ИИ/g, 'и-и')
      .replace(/\s+/g, ' ').trim();
  }
  function chunk(text) {
    const parts = text.match(/[^.!?…]+[.!?…]*\s*/g) || [text]; const out = []; let cur = '';
    parts.forEach((p) => { if ((cur + p).length > 150 && cur) { out.push(cur.trim()); cur = p; } else cur += p; });
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  async function synth(text) {
    const m = await call({ type: 'predict', text });
    const buf = await m.blob.arrayBuffer();
    return await new Promise((res, rej) => ac.decodeAudioData(buf, res, rej));
  }

  /* звук: тон выше (скорость растёт вместе с ним), лёгкий блеск и короткое «цифровое» эхо */
  function play(buffer, my) {
    return new Promise((resolve) => {
      const s = ac.createBufferSource(); s.buffer = buffer; s.playbackRate.value = cfg.pitch;
      const shelf = ac.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 4200; shelf.gain.value = 2;
      const g = ac.createGain(); g.gain.value = cfg.gain;
      s.connect(shelf); shelf.connect(g); g.connect(an);
      if (cfg.fx > 0.02) {
        const d = ac.createDelay(0.05); d.delayTime.value = 0.012 + 0.008 * cfg.fx;
        const fb = ac.createGain(); fb.gain.value = 0.25 * cfg.fx; const wet = ac.createGain(); wet.gain.value = 0.18 + 0.2 * cfg.fx;
        shelf.connect(d); d.connect(fb); fb.connect(d); d.connect(wet); wet.connect(an);
      }
      cur = s; s.onended = () => { if (cur === s) cur = null; resolve(my === token); };
      s.start();
    });
  }

  function level() {
    an.getByteTimeDomainData(td); let s = 0;
    for (let i = 0; i < td.length; i++) { const v = (td[i] - 128) / 128; s += v * v; }
    const rms = Math.sqrt(s / td.length); an.getByteFrequencyData(fd);
    const hz = ac.sampleRate / an.fftSize; let lo = 0, hi = 0;
    for (let i = 0; i < fd.length; i++) { const f = i * hz; if (f >= 100 && f < 1000) lo += fd[i]; else if (f >= 1500 && f < 5000) hi += fd[i]; }
    const lv = Math.min(1, Math.max(0, (rms - .012) / .16));
    return { open: Math.pow(lv, .7), w: Math.min(1.15, Math.max(.6, .7 + .45 * (hi / (hi + lo + 1)))) };
  }
  function tick(my) {
    if (my !== token) return;
    if (cur) { const l = level(); send({ type: 'mira-mouth', open: l.open, w: l.w, on: true }); }
    raf = requestAnimationFrame(() => tick(my));
  }
  function stop() {
    token++; cancelAnimationFrame(raf); raf = 0;
    try { if (cur) { const s = cur; cur = null; s.onended = null; s.stop(); } } catch (_) {}
    send({ type: 'mira-mouth', on: false });
  }

  /* озвучить текст; true — звук пошёл, false — голос ещё не готов или недоступен (нужен запасной голос) */
  async function speak(text, sender) {
    if (sender) send = sender;
    if (state !== 'ready' || !ac) return false;
    stop(); const my = ++token;
    const parts = chunk(prep(text)); if (!parts.length) return false;
    unlock();
    let started = false;
    try {
      let next = synth(parts[0]);
      for (let i = 0; i < parts.length; i++) {
        const buf = await next; if (my !== token) return true;
        next = i + 1 < parts.length ? synth(parts[i + 1]) : null; /* следующая фраза готовится, пока играет текущая */
        if (!started) { started = true; tick(my); }
        await play(buf, my); if (my !== token) return true;
      }
    } catch (_) { if (my === token) { stop(); } return started; }
    if (my === token) { send({ type: 'mira-mouth', on: false }); cancelAnimationFrame(raf); }
    return true;
  }

  window.miraVoice = { unlock, prepare, speak, stop, cfg, state: () => state, down: () => state === 'error' };
})();
