/* Fibre-optic threads between the three the five large page blocks: bottom-right of one frame -> top-left of the next, bent with rounded corners. */
(() => {
  const hero = document.querySelector('main');
  const frames = hero ? [...hero.querySelectorAll(':scope > .block')] : [];
  if (!hero || frames.length < 2) return;
  frames.forEach((frame) => { const fog = document.createElement('div'); fog.className = 'block-fog'; fog.setAttribute('aria-hidden', 'true'); fog.innerHTML = '<i></i><i></i><i></i>'; frame.prepend(fog); });
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'fiber'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
  svg.innerHTML = '<defs><linearGradient id="fiber-tube" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7fe6f2"/><stop offset=".5" stop-color="#19b8d6"/><stop offset="1" stop-color="#0e93b4"/></linearGradient>'
    + '<filter id="fiber-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2"/></filter>'
    + '<filter id="fiber-spark" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="2.2"/></filter></defs>';
  hero.append(svg);
  const make = (tag, attrs = {}, parent) => { const el = document.createElementNS(ns, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); parent?.append(el); return el; };

  const links = frames.slice(0, -1).map((_, index) => {
    const group = make('g', { class: `link link-${index + 1}` }, svg);
    const paths = ['f-glow', 'f-tube', 'f-core', 'f-pulse', 'f-pulse-core'].map((cls) => make('path', { class: cls, pathLength: 1000 }, group));
    const ports = [0, 1].map(() => ({
      ring: make('circle', { class: 'f-ring', r: 7 }, group),
      port: make('circle', { class: 'f-port', r: 5.5 }, group),
      dot: make('circle', { class: 'f-dot', r: 2.3 }, group)
    }));
    ports[0].ring.classList.add('start'); ports[1].ring.classList.add('end');
    return { paths, ports };
  });

  const box = (el) => ({ left: el.offsetLeft, right: el.offsetLeft + el.offsetWidth, top: el.offsetTop, bottom: el.offsetTop + el.offsetHeight });
  const hr = { left: 0, top: 0 };
  function place(link, a, b) {
    const corner = 36; // keep clear of the frame's rounded corner
    let d, p1, p2, gap, r;
    if (b.left >= a.right - 2) {              // side by side: right edge (low) -> left edge (high)
      p1 = { x: a.right - hr.left, y: a.bottom - hr.top - corner };
      p2 = { x: b.left - hr.left, y: b.top - hr.top + corner };
      gap = p2.x - p1.x; r = Math.max(4, Math.min(18, gap / 2 - 3, Math.abs(p2.y - p1.y) / 2 - 1));
      const xm = (p1.x + p2.x) / 2, dir = p2.y < p1.y ? -1 : 1;
      d = `M${p1.x} ${p1.y}H${xm - r}Q${xm} ${p1.y} ${xm} ${p1.y + dir * r}V${p2.y - dir * r}Q${xm} ${p2.y} ${xm + r} ${p2.y}H${p2.x}`;
    } else {                                   // stacked: bottom edge (right) -> top edge (left)
      p1 = { x: a.right - hr.left - corner - 6, y: a.bottom - hr.top };
      p2 = { x: b.left - hr.left + corner + 6, y: b.top - hr.top };
      gap = p2.y - p1.y; r = Math.max(4, Math.min(18, gap / 2 - 3, Math.abs(p2.x - p1.x) / 2 - 1));
      const ym = (p1.y + p2.y) / 2, dir = p2.x < p1.x ? -1 : 1;
      d = `M${p1.x} ${p1.y}V${ym - r}Q${p1.x} ${ym} ${p1.x + dir * r} ${ym}H${p2.x - dir * r}Q${p2.x} ${ym} ${p2.x} ${ym + r}V${p2.y}`;
    }
    link.paths.forEach((path) => path.setAttribute('d', d));
    [p1, p2].forEach((p, i) => ['ring', 'port', 'dot'].forEach((k) => { link.ports[i][k].setAttribute('cx', p.x); link.ports[i][k].setAttribute('cy', p.y); }));
  }

  function layout() {
    links.forEach((link, i) => place(link, box(frames[i]), box(frames[i + 1])));
  }
  let queued = 0;
  const schedule = () => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; layout(); }); };
  new ResizeObserver(schedule).observe(hero);
  frames.forEach((frame) => new ResizeObserver(schedule).observe(frame));
  window.addEventListener('resize', schedule);
  window.addEventListener('load', schedule);
  document.fonts?.ready.then(schedule);
  layout();
  new IntersectionObserver((entries, observer) => { if (entries.some((e) => e.isIntersecting)) { setTimeout(() => svg.classList.add('on'), 500); observer.disconnect(); } }, { threshold: .02 }).observe(hero);
})();
