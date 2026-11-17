// Small SVG charts for the story (B5). Rules from the dataviz skill: bars for comparisons (flat base, 4 px rounded data end), a stacked bar for parts of
// a whole (2 px gaps), a line for the growth ladder (2 px line, 8 px markers with a surface ring), one axis, direct labels, series in the fixed order
// --viz-1..5 (class c1..c5), text in text tokens (never the series colour), a legend whenever there are two or more series, and a hidden data table for
// screen readers. Every chart is a <figure class="ch">; the SVG scales with its width (viewBox 340 wide, so 13 px text stays 13 px at 340 px).
// Only numbers handed in are drawn; nothing is computed here except geometry.
import { h, reducedMotion } from '../ui.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 340;
const sv = (tag, a = {}, ...kids) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(a)) if (v != null && v !== false) e.setAttribute(k, v);
  kids.flat().forEach((c) => { if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c))); });
  return e;
};
const tt = (s) => sv('title', {}, s);
// R24 V5: an item may carry a resource `role` (in, out, shuttle, lift, bind, structure: tokens.css --role-*) and a `tone` (0..1 opacity of that role, for the steps inside a group);
// without a role the fixed series order c1..c5 applies. One hue never stands for two items of one legend.
const colourOf = (it, i, pre) => (it.role ? `${pre} r-${it.role}` : `${pre} c${(it.series || (i % 5 + 1))}`);
const toneStyle = (it) => (it.tone != null ? `opacity:${it.tone}` : null);

/** Bar with a flat base and a 4 px rounded data end. */
function barPath(x, y, w, hh, r = 4) {
  if (w <= 0) return '';
  r = Math.min(r, w, hh / 2);
  return `M${x} ${y}h${w - r}a${r} ${r} 0 0 1 ${r} ${r}v${hh - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - r)}z`;
}
function figure(svg, title, rows) {
  return h('figure.ch', { 'data-chart': title },
    svg,
    h('table.sr-only', h('caption', title), h('tbody', rows.map(([a, b]) => h('tr', h('th', { scope: 'row' }, a), h('td', b))))));
}
function legend(series, x0, y0) {
  const g = sv('g', { class: 'ch-legend' });
  let x = x0;
  series.forEach((s) => {
    g.append(sv('rect', { x, y: y0 - 9, width: 10, height: 10, rx: 2, class: `ch-sw c${s.series}` }), sv('text', { class: 'ch-l', x: x + 15, y: y0 }, s.label));
    x += 15 + s.label.length * 6.4 + 14;
  });
  return g;
}

/** Horizontal bars, one row per item: label and value on top, bar below. items: [{label, value, text?, series?}]. ref: {value, label}. */
export function hbars({ title, items, fmt, unit = '', max, ref }) {
  const rowH = 38, top = ref ? 20 : 0;
  const mx = max || Math.max(...items.map((i) => i.value || 0), ref ? ref.value : 0, 1e-9);
  const H = top + items.length * rowH - 4;
  const svg = sv('svg', { class: 'ch-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': title });
  items.forEach((it, i) => {
    const y = top + i * rowH, val = it.value || 0, w = val > 0 ? Math.max(3, (val / mx) * W) : 0;
    const txt = it.text ?? `${fmt(val)}${unit ? ' ' + unit : ''}`;
    svg.append(sv('text', { class: 'ch-l', x: 0, y: y + 12 }, it.label), sv('text', { class: 'ch-v num', x: W, y: y + 12, 'text-anchor': 'end' }, txt),
      sv('rect', { class: 'ch-track', x: 0, y: y + 19, width: W, height: 10, rx: 5 }),
      sv('path', { class: colourOf({ ...it, series: it.series || 1 }, 0, 'ch-bar'), style: toneStyle(it), d: barPath(0, y + 19, w, 10) }, tt(`${it.label}: ${txt}`)));
  });
  if (ref && ref.value > 0 && ref.value <= mx) {
    const x = (ref.value / mx) * W, end = x > W * 0.55;
    svg.append(sv('line', { class: 'ch-ref', x1: x, x2: x, y1: 14, y2: H }), sv('text', { class: 'ch-l', x: end ? x - 4 : x + 4, y: 10, 'text-anchor': end ? 'end' : 'start' }, ref.label));
  }
  return figure(svg, title, items.map((i) => [i.label, i.text ?? `${fmt(i.value || 0)} ${unit}`]));
}

/** One stacked bar (parts of a whole) with a legend that carries the values. items: [{label, value}]. */
export function stack({ title, items, fmt, unit = '', totalText, shareFmt }) {
  const sum = items.reduce((a, i) => a + (i.value || 0), 0) || 1;
  const gap = 2, rowH = 21, H = 52 + items.length * rowH;
  const svg = sv('svg', { class: 'ch-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': title });
  let x = 0;
  const live = items.filter((i) => i.value > 0);
  live.forEach((it, k) => {
    const w = (it.value / sum) * (W - gap * (live.length - 1));
    const idx = items.indexOf(it);
    svg.append(sv('rect', { class: colourOf(it, idx, 'ch-bar'), style: toneStyle(it), x, y: 0, width: Math.max(1, w), height: 26, rx: k === 0 || k === live.length - 1 ? 4 : 2 }, tt(`${it.label}: ${fmt(it.value)} ${unit}`)));
    x += w + gap;
  });
  if (totalText) svg.append(sv('text', { class: 'ch-v num', x: W, y: 44, 'text-anchor': 'end' }, totalText));
  items.forEach((it, i) => {
    const y = 68 + i * rowH - (totalText ? 0 : 20);
    svg.append(sv('rect', { class: colourOf(it, i, 'ch-sw'), style: toneStyle(it), x: 0, y: y - 9, width: 10, height: 10, rx: 2 }), sv('text', { class: 'ch-l', x: 16, y }, it.label),
      sv('text', { class: 'ch-v num', x: W, y, 'text-anchor': 'end' }, `${fmt(it.value)} ${unit} · ${shareFmt ? shareFmt(it.value / sum) : Math.round((it.value / sum) * 100) + ' %'}`));
  });
  svg.setAttribute('viewBox', `0 0 ${W} ${totalText ? H : H - 20}`);
  return figure(svg, title, items.map((i) => [i.label, `${fmt(i.value)} ${unit}`]));
}

/** Grouped vertical bars. groups: [{label, mark?, bars:[{series, value, text}]}], series: [{series, label}]. */
export function groupBars({ title, groups, series, fmt, unit = '' }) {
  const H = 196, base = 150, top = 38, ph = base - top;
  const mx = Math.max(...groups.flatMap((g) => g.bars.map((b) => b.value || 0)), 1e-9);
  const svg = sv('svg', { class: 'ch-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': title });
  svg.append(legend(series, 0, 10));
  const gw = W / groups.length, bw = 34, gp = 6;
  groups.forEach((g, gi) => {
    const cx = gw * gi + gw / 2, n = g.bars.length, x0 = cx - (n * bw + (n - 1) * gp) / 2;
    if (g.mark) svg.append(sv('rect', { class: 'ch-hi', x: gw * gi + 4, y: top - 14, width: gw - 8, height: base - top + 52, rx: 10 }));
    g.bars.forEach((b, bi) => {
      const hh = Math.max(2, ((b.value || 0) / mx) * ph), x = x0 + bi * (bw + gp), y = base - hh;
      const txt = b.text ?? fmt(b.value);
      svg.append(sv('path', { class: `ch-bar c${b.series} ch-vbar`, d: `M${x} ${base}v${-(hh - 4)}a4 4 0 0 1 4 -4h${bw - 8}a4 4 0 0 1 4 4v${hh - 4}z` }, tt(`${g.label}, ${series.find((s) => s.series === b.series).label}: ${txt} ${unit}`)),
        sv('text', { class: 'ch-v num', x: x + bw / 2, y: y - 5, 'text-anchor': 'middle' }, txt));
    });
    svg.append(sv('text', { class: `ch-l${g.mark ? ' ch-strong' : ''}`, x: cx, y: base + 18, 'text-anchor': 'middle' }, g.label));
    if (g.mark) svg.append(sv('text', { class: 'ch-l', x: cx, y: base + 34, 'text-anchor': 'middle' }, g.mark));
  });
  svg.append(sv('line', { class: 'ch-axis', x1: 0, x2: W, y1: base, y2: base }));
  return figure(svg, title, groups.flatMap((g) => g.bars.map((b) => [`${g.label}, ${series.find((s) => s.series === b.series).label}`, `${b.text ?? fmt(b.value)} ${unit}`])));
}

/** Line with markers over steps (the expansion ladder). points: [{label, value}]; ref: {value, label}. */
export function line({ title, points, fmt, unit = '', ref, xLabel }) {
  const H = 200, L = 6, R = 12, T = 22, B = 34, pw = W - L - R, ph = H - T - B;
  const mx = Math.max(...points.map((p) => p.value || 0), ref ? ref.value : 0) * 1.12 || 1;
  const X = (i) => L + (points.length === 1 ? pw / 2 : (i / (points.length - 1)) * pw), Y = (v) => T + ph - (v / mx) * ph;
  const svg = sv('svg', { class: 'ch-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': title });
  [0, 0.5, 1].forEach((f) => svg.append(sv('line', { class: f === 0 ? 'ch-axis' : 'ch-grid', x1: L, x2: W - R, y1: T + ph - f * ph, y2: T + ph - f * ph })));
  if (ref && ref.value <= mx) svg.append(sv('line', { class: 'ch-ref', x1: L, x2: W - R, y1: Y(ref.value), y2: Y(ref.value) }), sv('text', { class: 'ch-l', x: W - R, y: Y(ref.value) - 5, 'text-anchor': 'end' }, ref.label));
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.value).toFixed(1)}`).join('');
  svg.append(sv('path', { class: 'ch-line c1', d, pathLength: 1 }));
  points.forEach((p, i) => {
    const first = i === 0, last = i === points.length - 1;
    svg.append(sv('circle', { class: 'ch-dot c1', cx: X(i), cy: Y(p.value), r: 4.5 }, tt(`${p.label}: ${fmt(p.value)} ${unit}`)));
    if (first || last) svg.append(sv('text', { class: 'ch-v num', x: first ? X(i) : X(i) - 2, y: Y(p.value) + (first ? 20 : -10), 'text-anchor': first ? 'start' : 'end' }, `${fmt(p.value)} ${unit}`));
  });
  svg.append(sv('text', { class: 'ch-l', x: L, y: H - 8 }, xLabel || 'Expansion steps'), sv('text', { class: 'ch-l', x: W - R, y: H - 8, 'text-anchor': 'end' }, `0 to ${points.length - 1}`));
  return figure(svg, title, points.map((p, i) => [`${i ? 'Step ' + i + ': ' : 'Today: '}${p.label}`, `${fmt(p.value)} ${unit}`]));
}

/** Draw-in motion for a chart that just appeared: bars grow from their base, the line is drawn. No motion under reduced motion. */
export function drawIn(root, { delay = 0 } = {}) {
  if (reducedMotion() || !root) return;
  const ease = 'cubic-bezier(0.2, 0, 0, 1)';
  root.querySelectorAll('.ch-bar:not(.ch-vbar)').forEach((el, i) => el.animate([{ transform: 'scaleX(0)' }, { transform: 'none' }], { duration: 600, delay: delay + Math.min(i * 50, 250), easing: ease, fill: 'backwards' }));
  root.querySelectorAll('.ch-vbar').forEach((el, i) => el.animate([{ transform: 'scaleY(0)' }, { transform: 'none' }], { duration: 600, delay: delay + Math.min(i * 50, 250), easing: ease, fill: 'backwards' }));
  root.querySelectorAll('.ch-line').forEach((el) => el.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 700, delay, easing: ease, fill: 'backwards' }));
  root.querySelectorAll('.ch-dot').forEach((el, i) => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: delay + 350 + Math.min(i * 40, 300), fill: 'backwards' }));
}
