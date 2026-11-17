// Live plan preview (R26d V10 / V11): a small top-view drawing of the inputs as they stand: building and footprint shape, the IN / OUT docks, the racks (hatched, schematic), the lift
// heads and, on the run screen, the shuttles. It draws what the user typed (or the default) and nothing the model computes: no number comes from here, the hatching is a schematic
// ("racks fill the building"), and a layer the user has not set is not drawn. One component for every wizard step and for the run screen (layers appear module by module).
import { h } from './ui.js';
import { state } from './store.js';

const NS = 'http://www.w3.org/2000/svg';
const S = (t, a = {}, ...kids) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) if (v != null) e.setAttribute(k, v); kids.flat().forEach((c) => c != null && e.append(c)); return e; };
const VW = 360, VH = 236, M = 30;

/** Value of an input as the user sees it now: typed value, else the schema default. */
function val(mode, key) {
  const st = mode === 'optimal' ? state.optimal : state.fixed;
  if (st.vals && key in st.vals && st.vals[key] !== '') return st.vals[key];
  const f = ((state.schema && state.schema[mode === 'optimal' ? 'optimal' : 'fixed'].fields) || []).find((x) => x.key === key);
  return f ? f.default : null;
}
const nval = (mode, key, d) => { const n = Number(String(val(mode, key) ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : d; };
const shapeP = () => { try { const o = JSON.parse((state.fixed.vals || {}).shape_params || 'null'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };

/** Polygon (building units) of the footprint: rect, or the bounding box minus the notch (same rules as the shape sketch of the wizard). */
function footprint(L, W, shape) {
  const P = shapeP(), cl = (v, d, m) => Math.min(Math.max(Number(v ?? d), 1), m);
  const R = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];            // y down (north at the top)
  if (shape === 'L') {
    const a = cl(P.a, W / 2, W - 1), b = cl(P.b, L / 2, L - 1), n = P.notch || 'NE';
    const east = n.includes('E'), north = n.includes('N');          // the notch (L - b) x (W - a) is cut out of this corner (same rule as the shape sketch of the wizard)
    if (east && north) return [[0, 0], [b, 0], [b, W - a], [L, W - a], [L, W], [0, W]];
    if (!east && north) return [[L - b, 0], [L, 0], [L, W], [0, W], [0, W - a], [L - b, W - a]];
    if (east && !north) return [[0, 0], [L, 0], [L, a], [b, a], [b, W], [0, W]];
    return [[0, 0], [L, 0], [L, W], [L - b, W], [L - b, a], [0, a]];
  }
  if (shape === 'U') {
    const side = P.side || 'N', horiz = side === 'N' || side === 'S', X = horiz ? L : W, Y = horiz ? W : L;
    const nw = cl(P.nw, X / 3, X - 2), nd = cl(P.nd, Y / 2, Y - 1), off = (X - nw) / 2;
    if (side === 'N') return [[0, 0], [off, 0], [off, nd], [off + nw, nd], [off + nw, 0], [L, 0], [L, W], [0, W]];
    if (side === 'S') return [[0, 0], [L, 0], [L, W], [off + nw, W], [off + nw, W - nd], [off, W - nd], [off, W], [0, W]];
    if (side === 'E') return [[0, 0], [L, 0], [L, off], [L - nd, off], [L - nd, off + nw], [L, off + nw], [L, W], [0, W]];
    return [[0, 0], [L, 0], [L, W], [0, W], [0, off + nw], [nd, off + nw], [nd, off], [0, off]];
  }
  if (shape === 'T') {
    const side = P.side || 'N', horiz = side === 'N' || side === 'S', X = horiz ? L : W, Y = horiz ? W : L;
    const bar = cl(P.bar, Y / 3, Y - 1), stem = cl(P.stem, X / 3, X - 1), off = (X - stem) / 2;
    if (side === 'S') return [[0, 0], [L, 0], [L, bar], [off + stem, bar], [off + stem, W], [off, W], [off, bar], [0, bar]];   // same convention as the sketch: the bar lies opposite the named side
    if (side === 'N') return [[off, 0], [off + stem, 0], [off + stem, W - bar], [L, W - bar], [L, W], [0, W], [0, W - bar], [off, W - bar]];
    if (side === 'E') return [[0, off], [L - bar, off], [L - bar, 0], [L, 0], [L, W], [L - bar, W], [L - bar, off + stem], [0, off + stem]];
    return [[0, 0], [bar, 0], [bar, off], [L, off], [L, off + stem], [bar, off + stem], [bar, W], [0, W]];
  }
  return R(0, 0, L, W);
}

/**
 * createPlanPreview({ mode: 'fixed' | 'optimal', layers: ['building', 'docks', 'racks', 'lifts', 'fleet'] | null (all) , schematic })
 * -> { el, update(), setLayers(list) }. `schematic` (Optimal: the search chooses the size): dashed outline, no dimensions, the docks only when the user fixed them.
 */
export function createPlanPreview({ mode = 'fixed', layers = null, schematic = false, forceLifts = false } = {}) {
  let on = layers ? new Set(layers) : null;
  const has = (k) => !on || on.has(k);
  const svg = S('svg', { viewBox: `0 0 ${VW} ${VH}`, class: 'pv-svg', role: 'img', preserveAspectRatio: 'xMidYMid meet', 'aria-label': 'Plan of the building as entered' });
  const cap = h('p.pv-cap.muted', { 'aria-live': 'polite' });
  const el = h('figure.pv', svg, cap);
  const uid = 'pv' + Math.random().toString(36).slice(2, 7);

  function dockPoint(g, wall, pos) {
    if (wall === 'W') return { x: g.x0, y: g.y0 + g.h * (1 - pos) };
    if (wall === 'E') return { x: g.x0 + g.w, y: g.y0 + g.h * (1 - pos) };
    if (wall === 'S') return { x: g.x0 + g.w * pos, y: g.y0 + g.h };
    return { x: g.x0 + g.w * pos, y: g.y0 };
  }
  function update() {
    const m = mode === 'optimal' ? 'optimal' : 'fixed';
    const L = m === 'fixed' ? nval('fixed', 'L', 45) : 45, W = m === 'fixed' ? nval('fixed', 'W', 30) : 30;
    const shape = m === 'fixed' ? String(val('fixed', 'shape') || 'rect') : 'rect';
    const s = Math.min((VW - 2 * M) / L, (VH - 2 * M) / W), w = L * s, hh = W * s, x0 = (VW - w) / 2, y0 = (VH - hh) / 2, g = { x0, y0, w, h: hh };
    const poly = footprint(L, W, shape).map(([x, y]) => [x0 + x * s, y0 + y * s]);
    const pts = poly.map((p) => p.join(',')).join(' ');
    svg.replaceChildren();
    const orient = String(val(m, 'orient') || 'auto'), alongX = orient === 'x' ? true : orient === 'y' ? false : L >= W;
    const defs = S('defs', {}, S('clipPath', { id: uid + 'c' }, S('polygon', { points: pts })),
      S('pattern', { id: uid + 'h', width: alongX ? 6 : 9, height: alongX ? 9 : 6, patternUnits: 'userSpaceOnUse' }, S('rect', { width: 20, height: 20, fill: 'none' }), alongX ? S('rect', { x: 0, y: 0, width: 6, height: 5, class: 'pv-rack-cell' }) : S('rect', { x: 0, y: 0, width: 5, height: 6, class: 'pv-rack-cell' })));
    svg.append(defs, S('polygon', { points: pts, class: 'pv-bld' + (schematic ? ' dashed' : '') }));
    if (has('racks')) {
      const ins = 7;
      svg.append(S('rect', { x: x0 + ins, y: y0 + ins, width: Math.max(1, w - 2 * ins), height: Math.max(1, hh - 2 * ins), fill: `url(#${uid}h)`, 'clip-path': `url(#${uid}c)`, class: 'pv-racks' }));
    }
    if (!schematic && has('building')) {
      svg.append(S('text', { x: x0 + w / 2, y: y0 + hh + 16, 'text-anchor': 'middle', class: 'pv-dim' }, `${String(Math.round(L * 10) / 10).replace(/\.0$/, '')} m`),
        S('text', { x: x0 - 10, y: y0 + hh / 2, 'text-anchor': 'middle', class: 'pv-dim', transform: `rotate(-90 ${x0 - 10} ${y0 + hh / 2})` }, `${String(Math.round(W * 10) / 10).replace(/\.0$/, '')} m`));
    }
    let docksSet = 0;
    if (has('docks')) {
      const fixedDocks = m === 'fixed' ? true : (state.optimal.docks === true);
      const ks = [['in', 'IN'], ['out', 'OUT']];
      const pts2 = ks.map(([k]) => { const wall = String(val(m, k + '_wall') || ''), pos = Number(String(val(m, k + '_pos') ?? '0.5').replace(',', '.')); return fixedDocks && wall ? { ...dockPoint(g, wall, Math.min(1, Math.max(0, Number.isFinite(pos) ? pos : 0.5))), wall } : null; });
      if (pts2[0] && pts2[1] && Math.hypot(pts2[0].x - pts2[1].x, pts2[0].y - pts2[1].y) < 30) { const along = (pts2[1].wall === 'W' || pts2[1].wall === 'E') ? [0, 30] : [30, 0]; pts2[1] = { ...pts2[1], x: pts2[1].x + along[0], y: pts2[1].y + along[1] }; }
      ks.forEach(([k, txt], i) => { const p = pts2[i]; if (!p) return; docksSet++;
        svg.append(S('g', { class: 'pv-dock ' + k, transform: `translate(${p.x} ${p.y})` }, S('rect', { x: -17, y: -10, width: 34, height: 20, rx: 10 }), S('text', { 'text-anchor': 'middle', y: 4.5 }, txt))); });
    }
    if (has('lifts') && (forceLifts || String(val(m, 'lift_positions') || 'auto') === 'heads')) {
      // aisle heads: lift stations sit at the end of the aisles, drawn on the short-side edge, schematic
      const n = 3;
      for (let i = 0; i < n; i++) { const t = (i + 1) / (n + 1), x = alongX ? x0 + 6 : x0 + w * t, y = alongX ? y0 + hh * t : y0 + 6; svg.append(S('rect', { x: x - 5, y: y - 5, width: 10, height: 10, rx: 2, class: 'pv-lift' })); }
    }
    if (has('fleet') && has('lifts')) {
      for (let i = 0; i < 5; i++) { const t = (i + 1) / 6, x = alongX ? x0 + w * (0.3 + 0.08 * i) : x0 + w * t, y = alongX ? y0 + hh * t : y0 + hh * (0.3 + 0.08 * i); svg.append(S('circle', { cx: x, cy: y, r: 3.2, class: 'pv-shuttle' })); }
    }
    const parts = [m === 'fixed' ? `${shape === 'rect' ? 'Rectangle' : shape + '-shape'}` : 'Size chosen by the search'];
    parts.push(docksSet ? 'docks as entered' : 'docks chosen by the model');
    cap.textContent = parts.join(', ') + '. Schematic: the racks and lifts are drawn after the run.';
    if (on && (on.has('racks') || on.has('fleet'))) cap.textContent = parts.join(', ') + '. Schematic drawing of the inputs, not the result.';
  }
  update();
  return { el, update, setLayers(list) { on = list ? new Set(list) : null; update(); } };
}
