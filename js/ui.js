// Small UI toolkit: DOM helper, icons, number formats, motion helpers, theme, live region, toasts. No state here.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** h('div.card#id', {attrs, onclick}, child, 'text', ...) -> element. Strings become text nodes; false/null are skipped. */
export function h(tag, props, ...kids) {
  const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(tag);
  const el = document.createElement(m[1] || 'div');
  for (const t of m[2].match(/[.#][\w-]+/g) || []) { if (t[0] === '.') el.classList.add(t.slice(1)); else el.id = t.slice(1); }
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { kids.unshift(props); props = null; }
  for (const [k, v] of Object.entries(props || {})) {
    if (typeof v === 'boolean' && /^aria-/.test(k)) { el.setAttribute(k, String(v)); continue; }   // aria-checked={true} must read "true"
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}

// ---------------------------------------------------------------- icons (1.5 px line, 24 grid, currentColor)
const ICONS = {
  building: 'M4 21V9l8-5 8 5v12M4 21h16M9 21v-6h6v6M8 12h2M14 12h2',
  target: 'M20 12a8 8 0 1 1-16 0a8 8 0 0 1 16 0zM15.5 12a3.5 3.5 0 1 1-7 0a3.5 3.5 0 0 1 7 0zM12 2v3M12 19v3M2 12h3M19 12h3',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  warn: 'M12 4l9 16H3zM12 10v4.5M12 17.5v.1',
  sun: 'M16 12a4 4 0 1 1-8 0a4 4 0 0 1 8 0zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  system: 'M3 5h18v11H3zM8 20h8M12 16v4',
  back: 'M15 5l-7 7l7 7',
  next: 'M9 5l7 7l-7 7',
  x: 'M6 6l12 12M18 6L6 18',
  clock: 'M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0zM12 7v5l3 2',
  queue: 'M4 7h10M4 12h14M4 17h8',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  shuttle: 'M3 15h18v3H3zM6 15V9h12v6M7 18v1.5M17 18v1.5M9 12h6',
  gauge: 'M4 17a8 8 0 1 1 16 0M12 17l4-5',
  layers: 'M12 4l9 5l-9 5l-9-5zM3 14l9 5l9-5',
  bolt: 'M13 3L5 13h6l-1 8l8-10h-6z',
  euro: 'M17 6.5A6 6 0 0 0 7 9.5v5a6 6 0 0 0 10 3M5 10.5h8M5 13.5h8',
  shield: 'M12 3l8 3v6c0 4.5-3.2 7.8-8 9c-4.8-1.2-8-4.5-8-9V6z',
  expand: 'M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7',
  search: 'M18 11a7 7 0 1 1-14 0a7 7 0 0 1 14 0zM21 21l-5-5',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  plus: 'M12 5v14M5 12h14',
  down: 'M6 9l6 6l6-6',
  info: 'M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0zM12 11v5M12 8v.1',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  play: 'M7 4l13 8l-13 8z',
  pause: 'M8 5v14M16 5v14',
  doc: 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5',
};
export function icon(name, cls = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'i ' + cls);
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICONS[name] || ICONS.info);
  s.append(p);
  return s;
}

// ---------------------------------------------------------------- number formats (values come from the report, only formatted here)
const nf = (d) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const NF = { 0: nf(0), 1: nf(1), 2: nf(2) };
export const fmtNum = (x, d = 0) => (x == null || !Number.isFinite(x) ? 'n/a' : (NF[d] || nf(d)).format(x));

/** Percent text for p in percent (0..100): enough decimals that a value near 0 or 100 never rounds onto it (99.6, 99.995, 0.04).
 *  FIX (B6): availability 0.996 used to show as "100 %" (0 decimals above 10 %). */
export function fmtPct(p, minDec = null) {
  if (p == null || !Number.isFinite(p)) return 'n/a';
  const a = Math.abs(p);
  let d = a < 10 ? 1 : 0;
  if (a > 0 && a < 10) d = Math.max(1, Math.ceil(-Math.log10(a)));
  else if (a >= 90 && a < 100) d = Math.max(0, Math.ceil(-Math.log10(100 - a)));
  else if (a >= 100 && a < 100.0000001) d = 0;
  d = Math.min(4, d);
  if (minDec != null) d = Math.max(d, minDec);
  return fmtNum(p, d);
}

/** KPI row {value, unit, fmt} -> { text, unit } ; fmt = int | 1 | 2 | pct | eur | bool */
export function fmtKpi(r) {
  const v = r.value;
  if (v == null) return { text: 'n/a', unit: '' };
  switch (r.fmt) {
    case 'bool': return { text: v ? 'Yes' : 'No', unit: '' };
    case 'pct': return { text: fmtPct(v * 100), unit: '%' };
    case 'eur': return { text: fmtNum(v, 0), unit: r.unit === 'EUR' ? '€' : r.unit.replace('EUR', '€') };
    case 'int': return { text: fmtNum(v, 0), unit: r.unit };
    case '1': return { text: fmtNum(v, 1), unit: r.unit };
    case '2': return { text: fmtNum(v, 2), unit: r.unit };
    default: return { text: typeof v === 'number' ? fmtNum(v, 1) : String(v), unit: r.unit };
  }
}
// FIX (R18e, A9-4): the dock case as text. Old cause: with user-fixed bay walls the model reports docks.case = "" (no named case), so the print row read ", 3 IN and 4 OUT bays" and the analysis card showed a blank.
const WALL_NAME = { W: 'west', E: 'east', S: 'south', N: 'north' };
export function dockCaseLabel(dk) {
  if (!dk) return 'n/a';
  if (dk.case) return dk.case;
  const side = (arr) => (arr && arr.length ? arr.map(([w, p]) => `${WALL_NAME[w] || w} wall at ${fmtNum(p * 100, 0)} %`).join(' and ') : null);
  const i = side(dk.docks && dk.docks.IN), o = side(dk.docks && dk.docks.OUT);
  if (!i && !o) return 'n/a (no dock positions in the report)';
  return `user-fixed docks (IN ${i || 'n/a'}, OUT ${o || 'n/a'})`;
}
// R24 V1 (Visual_plan 1.4): the "assumption" mark is one small round A badge after the value; the note is the tooltip and the accessible name.
export function assumeBadge(note) {
  const t = 'Assumption: ' + (note || 'source or reason in the text');
  return h('span.tag-assume', { title: t, role: 'img', 'aria-label': t, tabindex: '0' }, 'A');
}
/** Dimensions with the multiplication sign: fmtDim(45, 30, 20) -> "45 × 30 × 20". */
export const fmtDim = (...v) => v.map((x) => (typeof x === 'number' ? fmtNum(x, Number.isInteger(x) ? 0 : 1) : String(x))).join(' × ');
/** Value + unit with a thin no-break space (U+202F), one rule for text built in JS. */
export const withUnit = (text, unit) => (unit ? `${text} ${unit}` : String(text));
export const eur = (x) => (x == null ? 'n/a' : '€ ' + fmtNum(x, 0));

// ---------------------------------------------------------------- motion
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE_OUT = 'cubic-bezier(0.2, 0, 0, 1)';
const EASE_IN = 'cubic-bezier(0.3, 0, 1, 1)';
export const DUR = { press: 120, fast: 200, base: 310, slow: 450, reveal: 800 };

/** Rise 12 px + fade for siblings, 60 ms stagger (total capped at 400 ms). Safe to call on removed nodes. */
export function riseIn(els, { dist = 12, dur = DUR.base, stagger = 60, delay = 0 } = {}) {
  els = [...els].filter(Boolean);
  const rm = reducedMotion();
  els.forEach((el, i) => {
    const d = delay + (rm ? 0 : Math.min(i * stagger, 400));
    el.animate(rm ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: `translateY(${dist}px)` }, { opacity: 1, transform: 'none' }],
      { duration: rm ? DUR.fast : dur, delay: d, easing: EASE_OUT, fill: 'backwards' });
  });
}
/** Screen change: leaves 24 px to the left (forward) or right (back) in 200 ms; the next enters from the opposite side in 310 ms. */
export function screenOut(el, dir) {
  if (!el) return Promise.resolve();
  const rm = reducedMotion();
  const x = dir === 'back' ? 24 : -24;
  const a = el.animate(rm ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${x}px)` }], { duration: rm ? 120 : DUR.fast, easing: EASE_IN, fill: 'forwards' });
  // FIX (R13b): in a background tab the document timeline does not tick, so `a.finished` never resolved and nav.render() hung
  // after `await screenOut(...)`: #/run and #/results stayed on the previous screen until the tab became visible. Skip the
  // animation when the tab is hidden and always resolve on a timer as well.
  if (document.hidden) { a.cancel(); return Promise.resolve(); }
  return Promise.race([a.finished.catch(() => {}), new Promise((res) => setTimeout(res, (rm ? 120 : DUR.fast) + 150))]);
}
export function screenIn(el, dir) {
  const rm = reducedMotion();
  const x = dir === 'back' ? -24 : 24;
  el.animate(rm ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: `translateX(${x}px)` }, { opacity: 1, transform: 'none' }], { duration: rm ? 120 : DUR.base, easing: EASE_OUT });
}
/** Count a number up to its value in 800 ms (ease-out). No motion: the value is set at once. */
export function countUp(el, to, format) {
  if (reducedMotion() || to == null || !Number.isFinite(to)) { el.textContent = format(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / DUR.reveal);
    el.textContent = format(to * (1 - Math.pow(1 - k, 3)));
    if (k < 1 && el.isConnected) requestAnimationFrame(step);
    else el.textContent = format(to);
  };
  requestAnimationFrame(step);
}

// ---------------------------------------------------------------- live region and toasts
let liveTimer = 0;
export function announce(text) {
  const el = $('#live');
  clearTimeout(liveTimer);
  el.textContent = '';
  liveTimer = setTimeout(() => { el.textContent = text; }, 40);
}
export function toast(text, ms = 4200) {
  const t = h('div.toast', { role: 'status' }, text);
  $('#toasts').append(t);
  setTimeout(() => { t.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.fast, fill: 'forwards' }).finished.then(() => t.remove(), () => t.remove()); }, ms);
}

// ---------------------------------------------------------------- theme: light / dark / system
const THEMES = ['system', 'light', 'dark'];
export function getTheme() {
  try { const t = localStorage.getItem('apw.theme'); return THEMES.includes(t) ? t : 'system'; } catch (e) { return 'system'; }
}
export function setTheme(t) {
  const root = document.documentElement;
  root.classList.add('theme-anim');
  if (t === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
  try { if (t === 'system') localStorage.removeItem('apw.theme'); else localStorage.setItem('apw.theme', t); } catch (e) { /* private mode */ }
  setTimeout(() => root.classList.remove('theme-anim'), 400);
  document.dispatchEvent(new CustomEvent('apw:theme', { detail: { theme: t } }));
}
export function nextTheme() { return THEMES[(THEMES.indexOf(getTheme()) + 1) % THEMES.length]; }
export function effectiveTheme() {
  const t = getTheme();
  return t === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : t;
}
export const themeLabel = { system: 'System', light: 'Light', dark: 'Dark' };
export const themeIcon = { system: 'system', light: 'sun', dark: 'moon' };
