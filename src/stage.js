/* One-screen stage.
   After the launch button the five blocks no longer scroll past: they sit on top of each other inside one fixed screen
   and are replaced in place while the page scroll only drives a progress value. The robot is a single separate layer that
   walks between "docks" inside the blocks. The same eleven steps are used on desktop and on the phone: on a phone
   a block shows one card at a time, on desktop all cards stay visible and the current one is highlighted. */
(() => {
  'use strict';
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const main = document.querySelector('main');
  const blocks = main ? [...main.children].filter((n) => n.classList.contains('block')) : [];
  if (blocks.length !== 5 || !('animate' in Element.prototype) || !CSS.supports('translate', '0 0')) return;

  const mobileQuery = matchMedia('(max-width: 820px)');
  const isMobile = () => mobileQuery.matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (v) => v * v * (3 - 2 * v);
  const safe = (fn) => { try { return fn(); } catch (e) { return null; } };

  // step -> block / dock / card index
  const STEPS = [
    { block: 0, dock: 'hero' },
    { block: 1, dock: 'perch', card: 0 }, { block: 1, dock: 'perch', card: 1 }, { block: 1, dock: 'perch', card: 2 },
    { block: 2, dock: 'flow', flow: 0 }, { block: 2, dock: 'flow', flow: 1 }, { block: 2, dock: 'flow', flow: 2 }, { block: 2, dock: 'flow', flow: 3 },
    { block: 3, dock: 'int', card: 0 }, { block: 3, dock: 'int', card: 1 },
    { block: 4, dock: 'final' },
  ];
  const LAST = STEPS.length - 1;
  const FIRST = [0, 1, 4, 8, 10], LASTS = [0, 3, 7, 9, 10];
  const NAMES = ['Знакомство', 'Кому нужна Mira', 'Как это работает', 'Где работает', 'Дайте проекту голос'];

  let started = false;
  function start() {
    if (started) return; started = true;
    root.classList.add('stage');

    const q = (sel, scope = document) => scope.querySelector(sel);
    const qa = (sel, scope = document) => [...scope.querySelectorAll(sel)];

    /* ---------- structure ---------- */
    const track = document.createElement('div'); track.className = 'stage-track';
    main.before(track); track.append(main);

    qa('.section-heading h2 br').forEach((br) => br.replaceWith(' '));
    const heroDock = q('.hero-dock');
    const perches = qa('.feature-grid .perch');
    const flowDock = q('.flow-dock');
    const intGrid = q('.integration-grid');
    const intDocks = [0, 1].map((i) => { const d = document.createElement('div'); d.className = 'int-perch'; d.style.setProperty('--k', i); intGrid.append(d); return d; });
    const finalSection = q('.final-section');
    const finalDock = document.createElement('div'); finalDock.className = 'final-dock'; finalSection.append(finalDock);
    const heroScene = q('.hero-dock .robot-scene');
    const chatPanel = q('#chat');
    const chatInput = q('#chat-input');
    const theatre = q('.conversation-theatre');
    const cards = qa('.feature');
    const flowSteps = qa('.flow-steps article');
    const intCards = qa('.integration-card');
    intCards.forEach((c, i) => c.style.setProperty('--k', i));
    const scenes = qa('.s3');

    /* conversation bubbles around the robot in block 03 */
    theatre.insertAdjacentHTML('beforeend',
      '<div class="st-bub st-b0"><b>Mira</b>Здравствуйте! Чем могу помочь?</div>'
      + '<div class="st-bub st-b1 st-user"><b>Посетитель</b>Хочу записаться на завтра</div>'
      + '<div class="st-bub st-b2"><b>Mira</b>Конечно. Какая услуга вас интересует?</div>'
      + '<div class="st-think" aria-hidden="true"><i></i><i></i><i></i></div>'
      + '<div class="st-card"><span>Обращение</span><strong>Запись на завтра</strong><p>Контакт посетитель оставил в разговоре. Mira предлагает передать обращение вам.</p></div>');

    /* progress rail + next/up button */
    const rail = document.createElement('nav'); rail.className = 'stage-rail'; rail.setAttribute('aria-label', 'Разделы страницы');
    const dots = STEPS.map((s, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'dot' + (i === FIRST[s.block] ? ' lead' : '');
      b.setAttribute('aria-label', NAMES[s.block] + (FIRST[s.block] === LASTS[s.block] ? '' : ', шаг ' + (i - FIRST[s.block] + 1)));
      b.title = NAMES[s.block]; b.addEventListener('click', () => goTo(i)); rail.append(b); return b;
    });
    const next = document.createElement('button'); next.type = 'button'; next.className = 'stage-next'; next.setAttribute('aria-label', 'Дальше');
    next.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 9.5l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    next.addEventListener('click', () => goTo(cur >= LAST ? 0 : cur + 1));
    rail.append(next);
    document.body.append(rail);

    /* scroll hint: a hand that swipes */
    const hint = document.createElement('div'); hint.className = 'stage-hint'; hint.setAttribute('aria-hidden', 'true');
    hint.innerHTML = '<span class="hand"><svg viewBox="0 0 48 64" width="46" height="62"><defs><g id="mira-hand"><rect x="17" y="3" width="10" height="38" rx="5"/><rect x="11" y="31" width="31" height="28" rx="13"/><rect x="4" y="37" width="14" height="10" rx="5" transform="rotate(28 11 42)"/></g></defs><use href="#mira-hand" class="h-out"/><use href="#mira-hand" class="h-in"/><path class="h-line" d="M22 44h13M22 50h12"/></svg><i class="touch"></i></span><span class="hint-text"></span>';
    document.body.append(hint);
    const hintText = q('.hint-text', hint);
    const setHintText = () => { hintText.textContent = isMobile() ? 'Проведите вверх' : 'Листайте вниз'; };
    setHintText();

    /* chat: on a phone it is a full-screen sheet opened from the first block */
    const close = document.createElement('button'); close.type = 'button'; close.className = 'chat-close'; close.setAttribute('aria-label', 'Закрыть чат');
    close.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>';
    q('.chat-header', chatPanel).append(close);
    let chatOpen = false;
    function setChat(open) {
      chatOpen = open; document.body.classList.toggle('chat-open', open);
      if (open) setTimeout(() => safe(() => chatInput.focus({ preventScroll: true })), 350);
      else safe(() => chatInput.blur());
    }
    close.addEventListener('click', () => setChat(false));
    function openChat() {
      if (isMobile()) { goTo(0, true); setChat(true); return; }
      if (cur !== 0) { goTo(0); setTimeout(() => safe(() => chatInput.focus({ preventScroll: true })), 700); } else safe(() => chatInput.focus({ preventScroll: true }));
    }
    chatPanel.scrollIntoView = openChat;
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && chatOpen) setChat(false); });

    /* anchors of the page header, the hero button and in-text links */
    const anchorStep = { '#top': 0, '#about': 1, '#flow': 4, '#connect': 8 };
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a) return;
      const h = a.getAttribute('href');
      if (h === '#chat') { e.preventDefault(); openChat(); }
      else if (h in anchorStep) { e.preventDefault(); goTo(anchorStep[h]); }
    });

    /* staggered entrance of the contents of a block, driven by --e (0..1) of that block */
    const stagger = [
      [],
      [['.section-heading h2', 0], ['.section-heading p', 1], ['.feature', 2], ['.demo-tour', 5]],
      [['.flow-layout .reveal h2', 0], ['.section-copy', 1], ['.text-link', 2], ['.conversation-theatre', 2], ['.flow-steps article', 1]],
      [['.section-heading h2', 0], ['.section-heading p', 1], ['.integration-card', 2], ['.settings-row', 4]],
      [['.final-section h2', 0], ['.final-section p', 1], ['.final-section .button', 2], ['.compile-link', 3], ['footer', 4]],
    ];
    stagger.forEach((list, bi) => list.forEach(([sel, base]) => qa(sel, blocks[bi]).forEach((el, k) => { el.dataset.st = ''; el.style.setProperty('--i', base + k); })));

    /* ---------- robot layer ---------- */
    const bot = document.createElement('div'); bot.className = 'stage-robot'; bot.setAttribute('aria-hidden', 'true');
    bot.innerHTML = '<div class="stage-robot-in"><iframe id="stage-frame" title="Mira" tabindex="-1" src="./Mira.html?embed=1"></iframe></div>';
    document.body.append(bot);
    const botIn = q('.stage-robot-in', bot), botFrame = q('#stage-frame', bot);
    const R = { x: 0, y: 0, s: 1, bw: 400, bh: 600, live: false, maxDist: 0, last: 0, rot: 0 };

    function dockFor(step) {
      const s = STEPS[step];
      if (s.dock === 'hero') return heroDock;
      if (s.dock === 'perch') return isMobile() ? perches[0] : perches[s.card];
      if (s.dock === 'flow') return flowDock;
      if (s.dock === 'int') return isMobile() ? intDocks[0] : intDocks[s.card];
      return finalDock;
    }
    function measureBase() {
      const r = (heroScene && heroScene.getBoundingClientRect().height ? heroScene : heroDock).getBoundingClientRect();
      if (r.width > 40 && r.height > 40) { R.bw = r.width; R.bh = r.height; bot.style.width = R.bw + 'px'; bot.style.height = R.bh + 'px'; }
    }
    function targetOf(step) {
      const d = dockFor(step); if (!d) return null;
      const r = d.getBoundingClientRect(); if (r.height < 20) return null;
      const s = r.height / R.bh;
      return { x: r.left + r.width / 2 - R.bw * s / 2, y: r.top, s };
    }
    function goLive() {
      if (R.live) return;
      const t = targetOf(0); if (!t) return;
      const hr = (heroScene || heroDock).getBoundingClientRect();
      R.x = hr.left; R.y = hr.top; R.s = hr.height ? hr.height / R.bh : 1; R.live = true;
      bot.classList.add('live'); botFrame.dataset.live = '1';
      bot.style.transform = `translate3d(${R.x}px,${R.y}px,0) scale(${R.s})`;
      setTimeout(() => { if (heroScene) heroScene.style.display = 'none'; }, 220);
    }
    function robotStep(now) {
      if (!R.live) return false;
      const t = targetOf(Math.round(targetPos)); if (!t) return false;
      const dt = Math.min(.05, (now - R.last) / 1000 || .016); R.last = now;
      const k = reduced ? 1 : 1 - Math.exp(-dt * 7.5);
      const dx = t.x - R.x, dy = t.y - R.y;
      const dist = Math.hypot(dx, dy) + Math.abs(t.s - R.s) * R.bh * .5;
      if (dist > R.maxDist) R.maxDist = dist;
      const prog = R.maxDist > 0 ? 1 - dist / R.maxDist : 1;
      const lift = reduced || R.maxDist < 60 ? 0 : Math.sin(Math.PI * clamp(prog, 0, 1)) * Math.min(90, R.maxDist * .16);
      R.x += dx * k; R.y += dy * k; R.s += (t.s - R.s) * k;
      const rotTarget = reduced ? 0 : clamp(dx * .022, -9, 9);
      R.rot += (rotTarget - R.rot) * Math.min(1, k * 1.4);
      bot.style.transform = `translate3d(${R.x.toFixed(2)}px,${(R.y - lift).toFixed(2)}px,0) scale(${R.s.toFixed(4)})`;
      botIn.style.transform = `rotate(${R.rot.toFixed(2)}deg)`;
      const moving = dist > .6 || Math.abs(R.rot) > .05;
      if (!moving) R.maxDist = 0;
      return moving;
    }

    /* ---------- scroll model ---------- */
    let stepPx = 520, vw = 0, vh = 0, pos = 0, targetPos = 0, cur = 0, lastSettled = 0, raf = 0, touching = false, idleTimer = 0, lastShown = -1, userMoved = false;
    function sizeTrack(force) {
      const w = innerWidth, h = innerHeight;
      if (force || w !== vw || Math.abs(h - vh) > 120) {
        vw = w; vh = h;
        stepPx = clamp(Math.round(h * (isMobile() ? .5 : .56)), 300, 620);
      }
      track.style.height = `calc(100svh + ${(LAST * stepPx)}px)`;
    }
    let tween = 0;
    function cancelTween() { if (tween) { cancelAnimationFrame(tween); tween = 0; } }
    function goTo(i, instant) {
      i = clamp(Math.round(i), 0, LAST); lastSettled = i; cancelTween();
      const to = i * stepPx, from = scrollY;
      if (reduced || instant || Math.abs(to - from) < 2) { scrollTo({ top: to, left: 0, behavior: 'instant' }); targetPos = i; schedule(); return; }
      const dur = clamp(520 + Math.abs(to - from) / stepPx * 110, 520, 1150), t0 = performance.now();
      const ease = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
      const tick = (now) => {
        const x = clamp((now - t0) / dur, 0, 1);
        scrollTo({ top: from + (to - from) * ease(x), left: 0, behavior: 'instant' });
        tween = x < 1 ? requestAnimationFrame(tick) : 0;
      };
      tween = requestAnimationFrame(tick);
    }
    function settle() {
      if (touching) { idleTimer = setTimeout(settle, 120); return; }
      const p = scrollY / stepPx, d = p - lastSettled;
      let i;
      if (Math.abs(d) < .06) i = lastSettled; else if (Math.abs(d) < 1) i = lastSettled + Math.sign(d); else i = Math.round(p);
      i = clamp(i, 0, LAST);
      if (Math.abs(scrollY - i * stepPx) > 1) goTo(i); else lastSettled = i;
    }
    function onScroll() {
      if (chatOpen) return;
      targetPos = clamp(scrollY / stepPx, 0, LAST);
      if (!userMoved && Math.abs(targetPos) > .02) { userMoved = true; hideHint(); }
      clearTimeout(idleTimer); idleTimer = setTimeout(settle, 150);
      schedule();
    }
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('wheel', () => { if (tween) { cancelTween(); lastSettled = clamp(Math.round(scrollY / stepPx), 0, LAST); } }, { passive: true });
    addEventListener('touchstart', () => { touching = true; cancelTween(); lastSettled = clamp(Math.round(scrollY / stepPx), 0, LAST); }, { passive: true });
    addEventListener('touchend', () => { touching = false; }, { passive: true });
    addEventListener('touchcancel', () => { touching = false; }, { passive: true });
    addEventListener('resize', () => { sizeTrack(); setHintText(); measureBase(); schedule(); });
    addEventListener('orientationchange', () => setTimeout(() => { sizeTrack(true); scrollTo({ top: lastSettled * stepPx, behavior: 'instant' }); schedule(); }, 250));
    mobileQuery.addEventListener('change', () => { sizeTrack(true); scrollTo({ top: lastSettled * stepPx, behavior: 'instant' }); schedule(); });
    document.addEventListener('keydown', (e) => {
      if (chatOpen || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target; if (t && (t.closest && t.closest('input,textarea,select,[contenteditable="true"],dialog'))) return;
      const k = e.key; let to = null;
      if (k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) to = cur + 1;
      else if (k === 'ArrowUp' || k === 'PageUp' || (k === ' ' && e.shiftKey)) to = cur - 1;
      else if (k === 'Home') to = 0; else if (k === 'End') to = LAST;
      if (to === null) return;
      if (t && t.closest && t.closest('button,a') && (k === ' ')) return;
      e.preventDefault(); goTo(clamp(to, 0, LAST));
    });

    function hideHint() { hint.classList.remove('show'); safe(() => sessionStorage.setItem('mira-hint', '1')); }
    setTimeout(() => { if (!userMoved && !safe(() => sessionStorage.getItem('mira-hint'))) hint.classList.add('show'); }, 2200);
    // if the visitor does nothing on the first screen the hint comes back once
    setTimeout(() => { if (!userMoved && cur === 0 && !chatOpen) hint.classList.add('show'); }, 14000);

    /* ---------- render ---------- */
    function setSceneOn(i, on) { scenes.forEach((s) => { if (blocks[i].contains(s)) s.classList.toggle('on', on); }); }
    const sceneState = [false, false, false, false, false];
    function render() {
      const mobile = isMobile();
      for (let i = 0; i < 5; i++) {
        const b = blocks[i];
        const x = clamp((pos - LASTS[i] - .08) / .5, 0, 1);
        const e = i === 0 ? 1 : clamp((pos - (FIRST[i] - 1) - .42) / .5, 0, 1);
        const E = smooth(e), X = smooth(x);
        const op = E * (1 - X);
        const ty = (1 - E) * 5 - X * 4, tz = -(1 - E) * 140 - X * 180, rx = -(1 - E) * 3 + X * 3;
        b.style.setProperty('--e', e.toFixed(3));
        b.style.opacity = op.toFixed(3);
        b.style.transform = op >= .999 ? 'none' : `translate3d(0,${ty.toFixed(2)}vh,${tz.toFixed(1)}px) rotateX(${rx.toFixed(2)}deg)`;
        b.style.visibility = op < .01 ? 'hidden' : 'visible';
        b.style.pointerEvents = op > .6 ? 'auto' : 'none';
        const on = op > .05; if (on !== sceneState[i]) { sceneState[i] = on; setSceneOn(i, on); }
      }
      // sub-steps inside the blocks
      cards.forEach((el, k) => { const d = pos - (1 + k); el.style.setProperty('--d', d.toFixed(3)); el.style.setProperty('--a', clamp(1 - Math.abs(d), 0, 1).toFixed(3)); });
      flowSteps.forEach((el, k) => { const d = pos - (4 + k); el.style.setProperty('--d', d.toFixed(3)); el.style.setProperty('--a', clamp(1 - Math.abs(d), 0, 1).toFixed(3)); });
      intCards.forEach((el, k) => { const d = pos - (8 + k); el.style.setProperty('--d', d.toFixed(3)); el.style.setProperty('--a', clamp(1 - Math.abs(d), 0, 1).toFixed(3)); });
      track.style.setProperty('--pos', pos.toFixed(3));
      const step = clamp(Math.round(pos), 0, LAST);
      if (step !== lastShown) { lastShown = step; onStep(step); }
    }
    const flowActions = { 4: ['hi'], 5: ['think-start'], 6: ['think-stop', 'tails'], 7: ['wink'] };
    function onStep(step) {
      cur = step;
      dots.forEach((d, i) => { d.classList.toggle('on', i === step); d.classList.toggle('same', STEPS[i].block === STEPS[step].block && i !== step); });
      const last = step === LAST;
      next.classList.toggle('up', last); next.setAttribute('aria-label', last ? 'Наверх' : 'Дальше');
      document.body.dataset.stageBlock = STEPS[step].block;
      const fs = STEPS[step].flow; theatre.dataset.fs = fs === undefined ? '' : String(fs);
      if (flowActions[step] && typeof action === 'function' && R.live) flowActions[step].forEach((a) => action(a));
      if (step > 0) goLive();
    }

    function frame(now) {
      raf = 0;
      const diff = targetPos - pos;
      pos = reduced || Math.abs(diff) < .0008 ? targetPos : pos + diff * .2;
      if (targetPos > .02) goLive();
      render();
      const moving = robotStep(now);
      if (pos !== targetPos || moving) schedule();
    }
    function schedule() { if (!raf) raf = requestAnimationFrame(frame); }

    /* ---------- go ---------- */
    toTopNow();
    function toTopNow() { scrollTo({ top: 0, left: 0, behavior: 'instant' }); }
    sizeTrack(true); measureBase();
    render(); lastShown = -1; render();
    setTimeout(() => { measureBase(); schedule(); }, 1500);
    setInterval(() => { if (!document.hidden) { measureBase(); schedule(); } }, 1200);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measureBase(); schedule(); });
    schedule();
    window.miraStage = { goTo, openChat, get step() { return cur; }, get pos() { return pos; } };
  }

  if (document.body.classList.contains('site-ready')) start();
  else window.addEventListener('mira-launch', () => setTimeout(start, 30), { once: true });
})();
