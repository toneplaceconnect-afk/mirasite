// 3D-сцены в блоках: запускаются, когда видны на экране, и слегка наклоняются за курсором.
(() => {
  const scenes = [...document.querySelectorAll('.s3')];
  if (!scenes.length) return;
  scenes.forEach((s) => s.classList.add('s3-js'));
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (!document.documentElement.classList.contains('stage')) e.target.classList.toggle('on', e.isIntersecting); }), { threshold: 0.15 });
  scenes.forEach((s) => io.observe(s));
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  scenes.forEach((s) => {
    const host = s.closest('.feature, .integration-card') || s;
    let frame = 0, px = 0, py = 0;
    host.addEventListener('pointermove', (e) => {
      const r = s.getBoundingClientRect();
      px = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2)));
      py = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 2)));
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; s.style.setProperty('--px', px.toFixed(3)); s.style.setProperty('--py', py.toFixed(3)); });
    });
    host.addEventListener('pointerleave', () => { s.style.setProperty('--px', 0); s.style.setProperty('--py', 0); });
  });
})();
