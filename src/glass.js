/* Glass helper: edge-refraction maps (Chromium only) and a pointer-driven specular for every .glass element. */
(() => {
  const root = document.documentElement;
  const canRefract = /Chrome\/|Chromium\//.test(navigator.userAgent) && !/Firefox|FxiOS|CriOS/.test(navigator.userAgent) && !matchMedia('(max-width:700px), (pointer:coarse)').matches
    && window.CSS?.supports?.('backdrop-filter', 'url(#a) blur(1px)');
  const elements = [...document.querySelectorAll('.glass')];
  if (!elements.length) return;

  /* Displacement map for a rounded rectangle: neutral grey inside, bending only inside the bezel at the edge. */
  function lensMap(w, h, r, bezel) {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d'); const img = ctx.createImageData(w, h);
    const cx = w / 2, cy = h / 2, hx = cx - r, hy = cy - r;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = x + .5 - cx, dy = y + .5 - cy, qx = Math.abs(dx) - hx, qy = Math.abs(dy) - hy;
      let nx = 0, ny = 0, inside;
      if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy); nx = Math.sign(dx) * qx / l; ny = Math.sign(dy) * qy / l; inside = r - l; }
      else if (qx > qy) { nx = Math.sign(dx); inside = r - qx; }
      else { ny = Math.sign(dy); inside = r - qy; }
      let k = 0;
      if (inside >= 0 && inside < bezel) { const t = 1 - inside / bezel; k = t * t * (3 - 2 * t); }
      const i = (y * w + x) * 4;
      img.data[i] = 128 - nx * k * 127; img.data[i + 1] = 128 - ny * k * 127; img.data[i + 2] = 128; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0); return canvas.toDataURL();
  }

  let defs;
  if (canRefract) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true'); svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
    defs = document.createElementNS(ns, 'defs'); svg.append(defs); document.body.append(svg);
    root.classList.add('glass-refract');
  }

  function build(el, index) {
    if (!defs) return;
    const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
    if (!w || !h || (el._lw === w && el._lh === h)) return;
    el._lw = w; el._lh = h;
    const radius = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 20, w / 2, h / 2);
    const bezel = Math.min(radius * 1.1 + 6, Math.min(w, h) / 2);
    const id = `mira-lens-${index}`;
    let filter = defs.querySelector(`#${id}`);
    if (!filter) {
      filter = document.createElementNS(defs.namespaceURI, 'filter'); filter.id = id;
      filter.setAttribute('color-interpolation-filters', 'sRGB');
      defs.append(filter);
    }
    filter.setAttribute('x', '0'); filter.setAttribute('y', '0'); filter.setAttribute('width', '100%'); filter.setAttribute('height', '100%');
    filter.replaceChildren();
    const image = document.createElementNS(defs.namespaceURI, 'feImage');
    image.setAttribute('href', lensMap(w, h, radius, bezel)); image.setAttribute('x', '0'); image.setAttribute('y', '0');
    image.setAttribute('width', String(w)); image.setAttribute('height', String(h)); image.setAttribute('preserveAspectRatio', 'none'); image.setAttribute('result', 'map');
    const shift = document.createElementNS(defs.namespaceURI, 'feDisplacementMap');
    shift.setAttribute('in', 'SourceGraphic'); shift.setAttribute('in2', 'map'); shift.setAttribute('scale', String(Math.round(Math.min(34, bezel * 1.1))));
    shift.setAttribute('xChannelSelector', 'R'); shift.setAttribute('yChannelSelector', 'G');
    filter.append(image, shift);
    el.style.setProperty('--lens', `url(#${id})`);
  }

  elements.forEach((el, index) => {
    build(el, index);
    if (defs) new ResizeObserver(() => build(el, index)).observe(el);
  });

  /* Specular highlight follows the pointer. */
  let pending = null;
  function light(event) {
    pending = event; if (light.frame) return;
    light.frame = requestAnimationFrame(() => {
      light.frame = 0;
      for (const el of elements) {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${Math.max(-30, Math.min(130, (pending.clientX - r.left) / r.width * 100))}%`);
        el.style.setProperty('--my', `${Math.max(-60, Math.min(160, (pending.clientY - r.top) / r.height * 100))}%`);
      }
    });
  }
  window.addEventListener('pointermove', (event) => { if (event.pointerType !== 'touch') light(event); }, { passive: true });
})();
