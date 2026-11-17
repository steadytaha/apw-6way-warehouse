// R25b: zoom lightbox, moved from the retired "Dock layouts" view (R24-B, V9). One dialog for the whole page. Keyboard: Esc closes, + / - zoom, 0 fits, arrows pan (zoomed) or switch image (fitted), Tab stays inside.
// Pointer: wheel zoom at the cursor, drag to pan, two-finger pinch, double tap / double click toggles fit <-> 3x. No library.
import { h } from './ui.js';

const ZMIN = 1, ZMAX = 8;
let lb = null;

export function closeLightbox() {
  if (!lb) return;
  const { root, back, onKey, onHash } = lb;
  document.removeEventListener('keydown', onKey, true);
  removeEventListener('hashchange', onHash);
  root.remove();
  document.body.classList.remove('lay-lb-open');
  lb = null;
  if (back && back.isConnected) back.focus();
}

/** items: [{ src, w, h, title, kind }]; start: index. `back` = element to refocus on close. */
export function openLightbox(items, start, back) {
  closeLightbox();
  const st = { i: start, z: 1, x: 0, y: 0 };
  const img = h('img.lay-lb-img', { alt: '', draggable: 'false' });
  const stage = h('div.lay-lb-stage', { tabindex: '0', 'aria-label': 'Zoomable image. Plus and minus zoom, arrow keys move, zero fits.' }, img);
  const cap = h('p.lay-lb-cap', { id: 'lay-lb-cap' });
  const zl = h('span.lay-lb-zl', { 'aria-live': 'polite' });
  const btn = (label, ic, fn, extra = '') => h('button.lay-lb-btn' + extra, { type: 'button', 'aria-label': label, title: label, onclick: fn }, ic);
  const txt = (t) => h('span', { 'aria-hidden': 'true' }, t);
  const prev = btn('Previous image', txt('\u2039'), () => step(-1)), next = btn('Next image', txt('\u203a'), () => step(1));
  const closeB = btn('Close (Esc)', txt('\u00d7'), closeLightbox, '.close');
  const bar = h('div.lay-lb-bar', prev, next, h('span.lay-lb-sep'), btn('Zoom out (-)', txt('\u2212'), () => zoomBy(1 / 1.4)), zl, btn('Zoom in (+)', txt('+'), () => zoomBy(1.4)),
    h('button.lay-lb-btn.txt', { type: 'button', onclick: () => fit() }, 'Fit'), h('span.lay-lb-sep'), closeB);
  const root = h('div.lay-lb', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'lay-lb-cap' }, h('div.lay-lb-top', cap, bar), stage,
    h('p.lay-lb-help', 'Scroll or pinch to zoom, drag to move, double tap to toggle, Esc to close.'));

  const size = () => {
    const r = stage.getBoundingClientRect(), it = items[st.i];
    const f = Math.min(r.width / it.w, r.height / it.h);               // fitted size = 1 x
    return { r, bw: it.w * f, bh: it.h * f };
  };
  const clamp = () => {
    const { r, bw, bh } = size();
    const mx = Math.max(0, (bw * st.z - r.width) / 2), my = Math.max(0, (bh * st.z - r.height) / 2);
    st.x = Math.min(mx, Math.max(-mx, st.x)); st.y = Math.min(my, Math.max(-my, st.y));
  };
  const apply = () => {
    clamp();
    const { bw, bh } = size();
    img.style.width = bw + 'px'; img.style.height = bh + 'px';
    img.style.transform = `translate(${st.x}px, ${st.y}px) scale(${st.z})`;
    zl.textContent = Math.round(st.z * 100) + ' %';
    root.dataset.zoom = st.z.toFixed(2);
    stage.classList.toggle('zoomed', st.z > 1.001);
  };
  const show = () => {
    const it = items[st.i];
    img.src = it.src; img.alt = it.title;
    cap.textContent = it.title + (items.length > 1 ? `  (${st.i + 1} of ${items.length})` : '');
    prev.disabled = next.disabled = items.length < 2;
    st.z = 1; st.x = 0; st.y = 0; apply();
  };
  const step = (d) => { if (items.length > 1) { st.i = (st.i + d + items.length) % items.length; show(); } };
  const fit = () => { st.z = 1; st.x = 0; st.y = 0; apply(); };
  // zoom about a point (px, py relative to the stage centre) so the point under the cursor stays put
  const zoomAt = (f, px = 0, py = 0) => {
    const z2 = Math.min(ZMAX, Math.max(ZMIN, st.z * f)), k = z2 / st.z;
    st.x = px - (px - st.x) * k; st.y = py - (py - st.y) * k; st.z = z2; apply();
  };
  const zoomBy = (f) => zoomAt(f);

  const pts = new Map(); let pinch0 = null, moved = false, lastTap = 0;
  const rel = (e) => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2]; };
  stage.addEventListener('wheel', (e) => { e.preventDefault(); const [px, py] = rel(e); zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), px, py); }, { passive: false });
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = false;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: st.z }; }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const o = pts.get(e.pointerId);
    if (pts.size === 2 && pinch0) {
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const r = stage.getBoundingClientRect(), cx = (a[0] + b[0]) / 2 - r.left - r.width / 2, cy = (a[1] + b[1]) / 2 - r.top - r.height / 2;
      zoomAt((pinch0.z * d / pinch0.d) / st.z, cx, cy); moved = true; return;
    }
    const dx = e.clientX - o[0], dy = e.clientY - o[1];
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (Math.abs(dx) + Math.abs(dy) > 1) moved = true;
    if (st.z > 1.001) { st.x += dx; st.y += dy; apply(); }
  });
  const up = (e) => {
    const wasOne = pts.size === 1;
    pts.delete(e.pointerId); if (pts.size < 2) pinch0 = null;
    if (wasOne && !moved && e.type === 'pointerup') {                      // tap: second tap within 350 ms toggles fit <-> 3 x at the tap point
      const t = performance.now();
      if (t - lastTap < 350) { const [px, py] = rel(e); if (st.z > 1.001) fit(); else zoomAt(3, px, py); lastTap = 0; } else lastTap = t;
    }
  };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeLightbox(); return; }
    if (e.key === 'Tab') {                                               // focus trap
      const f = [...root.querySelectorAll('button:not(:disabled), [tabindex="0"]')];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!root.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      return;
    }
    const onBtn = document.activeElement && document.activeElement.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ');
    if (onBtn) return;
    const pan = 80;
    if (e.key === '+' || e.key === '=') zoomBy(1.4);
    else if (e.key === '-' || e.key === '_') zoomBy(1 / 1.4);
    else if (e.key === '0') fit();
    else if (e.key.startsWith('Arrow')) {
      if (st.z > 1.001) { if (e.key === 'ArrowLeft') st.x += pan; else if (e.key === 'ArrowRight') st.x -= pan; else if (e.key === 'ArrowUp') st.y += pan; else st.y -= pan; apply(); }
      else if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowRight') step(1);
    } else return;
    e.preventDefault();
  };
  const onHash = () => closeLightbox();
  root.addEventListener('click', (e) => { if (e.target === root) closeLightbox(); });
  document.addEventListener('keydown', onKey, true);
  addEventListener('hashchange', onHash);
  addEventListener('resize', apply);
  document.body.append(root);
  document.body.classList.add('lay-lb-open');
  lb = { root, back, onKey, onHash };
  show();
  stage.focus();
}


/** A live SVG (the plan of a report) as a lightbox item: the computed colours are written into a copy, so the image looks the same outside the page's style sheet. */
export function svgItem(svg, title, alt) {
  const copy = svg.cloneNode(true);
  const src = [svg, ...svg.querySelectorAll('*')], dst = [copy, ...copy.querySelectorAll('*')];
  src.forEach((s, i) => { const cs = getComputedStyle(s); for (const p of ['fill', 'stroke', 'stroke-width', 'opacity']) dst[i].style.setProperty(p, cs.getPropertyValue(p)); dst[i].removeAttribute('class'); });
  const vb = svg.getAttribute('viewBox').split(/\s+/).map(Number), w = 1000, hh = Math.round(w * vb[3] / vb[2]);
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); copy.setAttribute('width', w); copy.setAttribute('height', hh);
  copy.removeAttribute('role'); copy.removeAttribute('aria-label');
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', vb[0]); bg.setAttribute('y', vb[1]); bg.setAttribute('width', vb[2]); bg.setAttribute('height', vb[3]); bg.setAttribute('fill', '#f4f4f5');
  copy.insertBefore(bg, copy.firstChild);
  return { src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(copy)), w, h: hh, title, alt: alt || title };
}

/** The small "Zoom" magnifier mark (24 grid, 1.5 px line). */
export function zoomHint() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'i lay-pic'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', 'M16 16l5 5M17 10.5a6.5 6.5 0 1 1-13 0a6.5 6.5 0 0 1 13 0zM8 10.5h5M10.5 8v5'); s.append(p);
  return h('span.lay-zoom-hint', { 'aria-hidden': 'true' }, s, 'Zoom');
}
