// Hash router with spring-style screen transitions. Back / forward buttons work because every screen change is a hash change.
//   route(/^\/fixed\/(\w+)$/, { order: (p) => 10, guard: (p) => redirectPathOrNull, mount: (p) => ({ el, destroy }) })
import { $, screenIn, screenOut } from './ui.js';

const routes = [];
let cur = null;           // { el, destroy }
let curOrder = -1;
let seq = 0;
let listeners = [];

export function route(re, def) { routes.push({ re, ...def }); }
export function onRoute(fn) { listeners.push(fn); }
export const path = () => location.hash.replace(/^#/, '') || '/';

export function go(to, { replace = false } = {}) {
  const target = '#' + to;
  if (location.hash === target || (to === '/' && !location.hash)) { render(); return; }
  if (replace) location.replace(target); else location.hash = target;
}

export async function render() {
  const my = ++seq;
  const p = path();
  let hit = null;
  for (const r of routes) { const m = r.re.exec(p); if (m) { hit = { r, params: m.slice(1) }; break; } }
  if (!hit) { go('/', { replace: true }); return; }
  const redirect = hit.r.guard ? hit.r.guard(hit.params) : null;
  if (redirect) { go(redirect, { replace: true }); return; }
  const order = hit.r.order(hit.params);
  const dir = order >= curOrder ? 'forward' : 'back';
  const old = cur;
  cur = null;
  const main = $('#main');
  if (old) {
    await screenOut(old.el, dir);
    try { old.destroy && old.destroy(); } catch (e) { console.error(e); }
    old.el.remove();
  }
  if (my !== seq) return;                         // a newer navigation took over while this one was leaving
  curOrder = order;
  const screen = hit.r.mount(hit.params, { dir });
  cur = screen;
  main.replaceChildren(screen.el);
  window.scrollTo(0, 0);
  screenIn(screen.el, dir);
  const focus = screen.el.querySelector('[data-autofocus]') || screen.el.querySelector('h1, h2');
  if (focus) { if (!focus.hasAttribute('tabindex') && !/^(INPUT|BUTTON|SELECT|A)$/.test(focus.tagName)) focus.setAttribute('tabindex', '-1'); focus.focus({ preventScroll: true }); }
  listeners.forEach((fn) => fn(p));
}

export function start() {
  addEventListener('hashchange', render);
  render();
}
