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
    hint.innerHTML = '<span class="chev"><i></i><i></i><i></i></span><span class="mouse"><i></i></span><span class="hand"><svg viewBox="0 0 48 64" width="46" height="62"><defs><g id="mira-hand"><rect x="17" y="3" width="10" height="38" rx="5"/><rect x="11" y="31" width="31" height="28" rx="13"/><rect x="4" y="37" width="14" height="10" rx="5" transform="rotate(28 11 42)"/></g></defs><use href="#mira-hand" class="h-out"/><use href="#mira-hand" class="h-in"/><path class="h-line" d="M22 44h13M22 50h12"/></svg><i class="touch"></i></span><span class="hint-text"></span>';
    document.body.append(hint);
    const hintText = q('.hint-text', hint);
    const setHintText = () => { hintText.textContent = isMobile() ? 'Проведите вверх' : 'Листайте вниз'; hint.classList.toggle('desk', !isMobile()); };
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

    const blockOf = (el) => blocks.find((b) => b.contains(el));
    /* rectangle of a dock from layout offsets only: transforms of a block in the middle of a transition (or the
       browser toolbars of a phone) do not move the robot's target */
    function layoutRect(el) {
      const b = blockOf(el); if (!b) return null;
      let x = 0, y = 0, n = el;
      while (n && n !== b) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
      if (n !== b) return null;
      return { left: b.offsetLeft + b.clientLeft + x, top: b.offsetTop + b.clientTop + y, width: el.offsetWidth, height: el.offsetHeight };
    }
    function dockFor(step) {
      const s = STEPS[step];
      if (s.dock === 'hero') return heroDock;
      if (s.dock === 'perch') return isMobile() ? perches[0] : perches[s.card];
      if (s.dock === 'flow') return flowDock;
      if (s.dock === 'int') return isMobile() ? intDocks[0] : intDocks[s.card];
      return finalDock;
    }
    function measureBase() {
      const r = layoutRect(heroDock);
      if (r && r.width > 40 && r.height > 40 && (Math.abs(r.width - R.bw) > 1 || Math.abs(r.height - R.bh) > 1)) {
        R.bw = r.width; R.bh = r.height; bot.style.width = R.bw + 'px'; bot.style.height = R.bh + 'px';
      }
    }
    function targetOf(step) {
      const d = dockFor(step); if (!d) return null;
      const r = layoutRect(d); if (!r || r.height < 20) return null;
      const s = r.height / R.bh;
      return { x: r.left + r.width / 2 - R.bw * s / 2, y: r.top, s };
    }
    function goLive() {
      if (R.live) return;
      measureBase();
      const t = targetOf(0); if (!t) return;
      R.x = t.x; R.y = t.y; R.s = t.s; R.live = true;
      bot.classList.add('live'); botFrame.dataset.live = '1';
      bot.style.transform = `translate3d(${R.x}px,${R.y}px,0) scale(${R.s})`;
      setTimeout(() => { if (heroScene) heroScene.style.display = 'none'; }, 260);
    }
    function robotStep(now) {
      if (!R.live) return false;
      const t = targetOf(cur); if (!t) return false;
      const dt = Math.min(.05, (now - R.last) / 1000 || .016); R.last = now;
      const k = reduced ? 1 : 1 - Math.exp(-dt * 6.5);
      const dx = t.x - R.x, dy = t.y - R.y;
      const dist = Math.hypot(dx, dy) + Math.abs(t.s - R.s) * R.bh * .5;
      if (dist > R.maxDist) R.maxDist = dist;
      const prog = R.maxDist > 0 ? 1 - dist / R.maxDist : 1;
      const lift = reduced || R.maxDist < 60 ? 0 : Math.sin(Math.PI * clamp(prog, 0, 1)) * Math.min(70, R.maxDist * .12);
      R.x += dx * k; R.y += dy * k; R.s += (t.s - R.s) * k;
      const rotTarget = reduced ? 0 : clamp(dx * .01, -4, 4);
      R.rot += (rotTarget - R.rot) * Math.min(1, k * 1.2);
      bot.style.transform = `translate3d(${R.x.toFixed(1)}px,${(R.y - lift).toFixed(1)}px,0) scale(${R.s.toFixed(3)})`;
      botIn.style.transform = Math.abs(R.rot) < .05 ? '' : `rotate(${R.rot.toFixed(2)}deg)`;
      const moving = dist > .8;
      if (!moving) R.maxDist = 0;
      return moving;
    }

    /* ---------- step engine ----------
       The page itself never scrolls. One wheel swipe, one finger swipe, one key press or one tap moves exactly one step;
       the transition then runs by time, so nothing depends on scroll physics, momentum or the phone's browser bars. */
    let pos = 0, cur = 0, raf = 0, anim = null, dragging = false, lockUntil = 0, lastGo = 0, userMoved = false, arriveTimer = 0, hintTimer = 0;
    const hinted = {};
    const ease = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const flowActions = { 4: ['hi'], 5: ['think-start'], 6: ['think-stop', 'tails'], 7: ['wink'] };

    function showHint(ms) { hint.classList.add('show'); clearTimeout(hintTimer); if (ms) hintTimer = setTimeout(() => hint.classList.remove('show'), ms); }
    function hideHint() { hint.classList.remove('show'); clearTimeout(hintTimer); }

    function commit(step) {
      dots.forEach((d, i) => { d.classList.toggle('on', i === step); d.classList.toggle('same', STEPS[i].block === STEPS[step].block && i !== step); });
      const last = step === LAST;
      next.classList.toggle('up', last); next.setAttribute('aria-label', last ? 'Наверх' : 'Дальше');
      document.body.dataset.stageBlock = STEPS[step].block;
      const fs = STEPS[step].flow; theatre.dataset.fs = fs === undefined ? '' : String(fs);
      if (step > 0) goLive();
      clearTimeout(arriveTimer);
      arriveTimer = setTimeout(() => arrive(step), reduced ? 50 : 1000);
    }
    function arrive(step) {
      if (step !== cur || anim) return;
      if (flowActions[step] && typeof action === 'function' && R.live) flowActions[step].forEach((a) => action(a));
      if ((step === 1 || step === 2) && !hinted[step] && !chatOpen) { hinted[step] = 1; showHint(3800); }
    }
    function goTo(i, instant) {
      i = clamp(Math.round(i), 0, LAST); dragging = false;
      const changed = i !== cur;
      if (changed) { userMoved = true; hideHint(); }
      cur = i; if (changed || lastShownStep !== i) { lastShownStep = i; commit(i); }
      const from = pos, dist = Math.abs(i - from);
      if (reduced || instant || dist < .001) { anim = null; pos = i; lockUntil = 0; main.classList.remove('moving'); schedule(); return; }
      const now = performance.now(), dur = clamp(620 + dist * 80, 620, 1050);
      anim = { from, to: i, t0: now, dur }; lastGo = now; lockUntil = now + dur + 140; main.classList.add('moving'); schedule();
    }
    let lastShownStep = -1;
    const stepBy = (d) => goTo(cur + d);

    /* wheel / trackpad */
    let acc = 0, lastWheel = 0, prevAbs = 0;
    addEventListener('wheel', (e) => {
      if (chatOpen) return;
      const msg = e.target.closest && e.target.closest('.chat-messages');
      if (msg && msg.scrollHeight > msg.clientHeight + 2) return;
      e.preventDefault();
      const now = performance.now(); let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 32; else if (e.deltaMode === 2) dy *= innerHeight;
      const gap = now - lastWheel; lastWheel = now; const a = Math.abs(dy); const grew = a > prevAbs * 1.5 + 2; prevAbs = a;
      if (gap > 180) acc = 0;
      if (anim || now < lockUntil) { acc = 0; return; }
      // the tail of a trackpad swipe keeps sending shrinking events: only a new, stronger or later gesture counts
      if (now - lastGo < 1500 && gap < 120 && !grew) return;
      acc += dy;
      if (Math.abs(acc) >= 26) { const d = Math.sign(acc); acc = 0; stepBy(d); }
    }, { passive: false });

    /* finger: the block follows the finger a little, the decision is made when it is lifted */
    let ts = null;
    const inChat = (el) => el && el.closest && el.closest('.chat-messages, textarea, input, dialog');
    addEventListener('touchstart', (e) => {
      if (chatOpen || e.touches.length > 1 || inChat(e.target)) { ts = null; return; }
      const t = e.touches[0]; ts = { x: t.clientX, y: t.clientY, t: performance.now(), moved: false, vertical: false };
    }, { passive: true });
    addEventListener('touchmove', (e) => {
      if (!ts) return;
      const t = e.touches[0], dy = t.clientY - ts.y, dx = t.clientX - ts.x;
      if (!ts.moved) { if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return; ts.moved = true; ts.vertical = Math.abs(dy) > Math.abs(dx) * 1.1; }
      if (!ts.vertical) return;
      e.preventDefault();
      if (anim) return;
      dragging = true; pos = clamp(cur + clamp(-dy / (innerHeight * .6), -.42, .42), 0, LAST); schedule();
    }, { passive: false });
    const endTouch = (e) => {
      const s = ts; ts = null; if (!s || !s.moved || !s.vertical) return;
      if (anim) return;
      const ch = e.changedTouches && e.changedTouches[0]; if (!ch) { goTo(cur); return; }
      const dy = ch.clientY - s.y, v = dy / Math.max(1, performance.now() - s.t);
      if (dy < -38 || (v < -.3 && dy < -12)) stepBy(1); else if (dy > 38 || (v > .3 && dy > 12)) stepBy(-1); else goTo(cur);
    };
    addEventListener('touchend', endTouch, { passive: true });
    addEventListener('touchcancel', () => { const s = ts; ts = null; if (s && s.moved) goTo(cur); }, { passive: true });

    document.addEventListener('keydown', (e) => {
      if (chatOpen || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target; if (t && t.closest && t.closest('input,textarea,select,[contenteditable="true"],dialog')) return;
      const k = e.key; let to = null;
      if (k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) to = cur + 1;
      else if (k === 'ArrowUp' || k === 'PageUp' || (k === ' ' && e.shiftKey)) to = cur - 1;
      else if (k === 'Home') to = 0; else if (k === 'End') to = LAST;
      if (to === null) return;
      if (t && t.closest && t.closest('button,a') && k === ' ') return;
      e.preventDefault(); goTo(clamp(to, 0, LAST));
    });

    let resizeTimer = 0;
    addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { setHintText(); measureBase(); schedule(); }, 120); });
    mobileQuery.addEventListener('change', () => { setHintText(); measureBase(); schedule(); });
    /* the chat sheet follows the visible part of the screen when the phone keyboard is open */
    if (window.visualViewport) {
      const vv = window.visualViewport;
      const fit = () => { if (chatOpen && isMobile()) { chatPanel.style.height = vv.height + 'px'; chatPanel.style.top = vv.offsetTop + 'px'; chatPanel.style.bottom = 'auto'; } else { chatPanel.style.height = ''; chatPanel.style.top = ''; chatPanel.style.bottom = ''; } };
      vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit);
      new MutationObserver(fit).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    /* ---------- render ---------- */
    function setSceneOn(i, on) { scenes.forEach((s) => { if (blocks[i].contains(s)) s.classList.toggle('on', on); }); }
    const sceneState = [false, false, false, false, false];
    function render() {
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
        b.classList.toggle('is-off', op < .01);
        const on = op > .05; if (on !== sceneState[i]) { sceneState[i] = on; setSceneOn(i, on); }
      }
      cards.forEach((el, k) => { const d = pos - (1 + k); el.style.setProperty('--d', d.toFixed(3)); el.style.setProperty('--a', clamp(1 - Math.abs(d), 0, 1).toFixed(3)); });
      flowSteps.forEach((el, k) => { const d = pos - (4 + k); el.style.setProperty('--d', d.toFixed(3)); el.style.setProperty('--a', clamp(1 - Math.abs(d), 0, 1).toFixed(3)); });
      intCards.forEach((el, k) => { const d = pos - (8 + k); el.style.setProperty('--d', d.toFixed(3)); el.style.setProperty('--a', clamp(1 - Math.abs(d), 0, 1).toFixed(3)); });
    }
    function frame(now) {
      raf = 0;
      if (anim) {
        const x = clamp((now - anim.t0) / anim.dur, 0, 1);
        pos = anim.from + (anim.to - anim.from) * ease(x);
        if (x >= 1) { pos = anim.to; anim = null; main.classList.remove('moving'); }
      }
      render();
      const moving = robotStep(now);
      if (anim || dragging || moving) schedule();
    }
    function schedule() { if (!raf) raf = requestAnimationFrame(frame); }

    /* ---------- go ---------- */
    scrollTo({ top: 0, left: 0, behavior: 'instant' });
    measureBase(); render(); commit(0); lastShownStep = 0;
    setTimeout(() => { measureBase(); schedule(); }, 1500);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measureBase(); schedule(); });
    setTimeout(() => { if (!userMoved && !chatOpen) showHint(0); }, 1300);
    setInterval(() => { if (!userMoved && cur === 0 && !chatOpen && !hint.classList.contains('show')) showHint(6000); }, 8000);
    schedule();
    window.miraStage = { goTo, openChat, get step() { return cur; }, get pos() { return pos; } };
  }

  if (document.body.classList.contains('site-ready')) start();
  else window.addEventListener('mira-launch', () => setTimeout(start, 30), { once: true });
})();
