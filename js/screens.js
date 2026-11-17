// Welcome and Choose screens.
import { h, icon, riseIn, fmtNum } from './ui.js';
import { model } from './model.js';
import { go } from './nav.js';
import { state } from './store.js';
import { HERO_SRC } from './hero.js';
import hero from '../model/hero_data.js';

export function mountWelcome() {
  const load = h('p.w-load.muted', { role: 'status' });
  const bar = h('i');
  const start = h('button.btn.primary.lg.pill', { type: 'button', 'data-autofocus': '', onclick: () => go('/choose') }, 'Start', icon('next', 'sm'));
  const retry = h('button.btn.ghost', { type: 'button', hidden: true, onclick: () => { model.restart(); model.ready.catch(() => {}); } }, 'Try again');
  const paint = () => {
    const m = model.phase;
    if (model.state === 'ready') { load.textContent = 'The calculation engine is ready.'; bar.style.transform = 'scaleX(1)'; retry.hidden = true; }
    else if (model.state === 'error') { load.textContent = model.error ? model.error.message : 'The model could not be loaded.'; retry.hidden = false; }
    else if (globalThis.APW_LAZY_MODEL && model.state === 'idle') { load.textContent = 'The calculation engine (about 6 MB, once) loads when you first run a design.'; bar.style.transform = 'scaleX(0)'; retry.hidden = true; }
    else { load.textContent = `Preparing the calculation engine (about 10 s the first time)${m ? ': ' + m.label.toLowerCase() : ''} (${fmtNum((m ? m.fraction : 0) * 100, 0)} %). You can start now.`; bar.style.transform = `scaleX(${m ? Math.max(0.02, m.fraction) : 0.02})`; retry.hidden = true; }
  };
  const off1 = model.onLoad(paint), off2 = model.onState(paint);
  paint();
  const facts = h('ul.w-facts', ['Start from the default inputs or type your own building', 'Every figure traced to an analytic model', 'Runs in your browser, nothing leaves it'].map((t) => h('li', icon('check', 'sm'), t)));
  // R26d V10: the right half is a still of the 3D example (inlined, about 80 kB) with three numbers from the model run of that example (model/hero_data.js, generated at build time)
  const stat = (n, t) => h('li', h('b.num', n), h('span', t));
  const figure = h('figure.w-hero', h('img', { src: HERO_SRC, alt: 'Cut-away 3D view of the example store: racks with pallets, lifts, and two trucks at the docks', width: 878, height: 558, decoding: 'async' }),
    h('figcaption', h('span.w-hero-cap', `The example: ${fmtNum(hero.L, 0)} × ${fmtNum(hero.W, 0)} × ${fmtNum(hero.H, 0)} m`),
      h('ul.w-stats', stat(fmtNum(hero.positions, 0), 'pallet positions'), stat(fmtNum(hero.shuttles, 0), 'shuttles'), stat(fmtNum(hero.max_flow_moves_h, 0), 'moves per hour'))));
  const text = h('div.w-text',
    h('p.eyebrow.w-eyebrow', 'Warehouse design service'),
    h('h1.display', { tabindex: '-1' }, 'Design a 6-way shuttle pallet store.'),
    h('p.w-promise', 'A warehouse-design service for 6-way shuttle pallet stores, built on our analytic model and the APW brief. Give a building or a target; get a design with its cycle times, lifts, fleet, energy and cost.'),
    h('div.w-cta', start, h('div.w-loadbox', h('div.run-total.slim', bar), load, retry)), facts);
  const el = h('div.screen.welcome', h('div.w-glow', { 'aria-hidden': 'true' }), text, figure);
  riseIn([...text.children, figure], { stagger: 70 });
  return { el, destroy() { off1(); off2(); } };
}

export function mountChoose() {
  // R26d V10: each card shows a small drawing of what you get and one "what you get" line (drawings: schematic pictograms, no model numbers)
  const NS = 'http://www.w3.org/2000/svg';
  const mini = (kind) => {
    const e = (t, a) => { const n = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) n.setAttribute(k, v); return n; };
    const svg = e('svg', { viewBox: '0 0 120 48', class: 'choice-pic', 'aria-hidden': 'true' });
    const bld = (x, w, dash) => { svg.append(e('rect', { x, y: 6, width: w, height: 36, rx: 3, class: 'cp-bld' + (dash ? ' dashed' : '') })); for (let i = 0; i < 4; i++) svg.append(e('rect', { x: x + 6, y: 12 + i * 8, width: w - 12, height: 4, class: 'cp-rack' })); };
    const pill = (x, y, c) => svg.append(e('rect', { x, y, width: 9, height: 6, rx: 3, class: 'cp-dock ' + c }));
    if (kind === 'fixed') { bld(18, 84); pill(14, 21, 'in'); pill(97, 21, 'out'); }
    else if (kind === 'opt') { bld(18, 84, true); svg.append(e('circle', { cx: 60, cy: 24, r: 7, class: 'cp-target' }), e('circle', { cx: 60, cy: 24, r: 2.5, class: 'cp-target f' })); }
    else { for (const [i, x] of [4, 44, 84].entries()) { svg.append(e('rect', { x, y: 8, width: 32, height: 28, rx: 2, class: 'cp-bld' })); const pi = [[0, 15, 28, 15], [10, 5, 18, 5], [0, 12, 14, 30]][i]; pill(x + pi[0] - 2, 8 + pi[1] - 3, 'in'); pill(x + pi[2] - 2, 8 + pi[3] - 3, 'out'); } }
    return svg;
  };
  const card = (cls, ic, title, line, chips, to, pic, gets) => h('button.choice', { type: 'button', onclick: () => go(to), 'aria-label': `${title}. ${line} ${gets}` },
    h('span.choice-top', h('span.ic', icon(ic)), mini(pic)), h('h2', title), h('p', line), h('p.choice-gets', h('b', 'What you get: '), gets), h('span.row.chips', chips.map((c) => h('span.chip', c))), h('span.choice-go', 'Continue', icon('next', 'sm')));
  const fx = state.schema.fixed.fields, goals = state.schema.optimal.goals;
  const el = h('div.screen.choose',
    h('header.page-head', h('p.eyebrow', 'Step 1'), h('h1', { tabindex: '-1' }, 'How do you want to start?'), h('p.lead', 'Two ways in, or a comparison of the three flow formats. You can change your mind at any time.')),
    h('div.choices.has3',
      card('fixed', 'building', 'Fixed warehouse', 'I know my building.', ['Length × width × height', 'Shape', 'Docks', 'Racks', 'Flows'], '/fixed/building', 'fixed', 'the full design of that building: positions, shuttles, lifts, max flow, energy, cost, with a 3D view.'),
      card('opt', 'target', 'Optimal warehouse', 'Find the best design for a capacity target or a budget.', goals.map((g) => g.title).concat(['Limits']), '/optimal/goal', 'opt', 'the building and rack the model finds for your target, with the runners-up.'),
      // R25b: the three flow formats on the same inputs
      card('lay', 'layers', 'Compare flows', 'Set your inputs once; the model runs the I, U and L flow on them and shows the winner of every criterion.', ['I / U / L', 'Same inputs', 'Winner per criterion', 'Your priority'], '/compare', 'cmp', 'three plans side by side and the winner of every criterion.')));
  riseIn([...el.querySelectorAll('header, .choice')], { stagger: 60 });
  return { el };
}
