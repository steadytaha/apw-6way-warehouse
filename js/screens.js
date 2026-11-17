// Welcome and Choose screens.
import { h, icon, riseIn, fmtNum } from './ui.js';
import { model } from './model.js';
import { go } from './nav.js';
import { state } from './store.js';

export function mountWelcome() {
  const load = h('p.w-load.muted', { role: 'status' });
  const bar = h('i');
  const start = h('button.btn.primary.lg.pill', { type: 'button', 'data-autofocus': '', onclick: () => go('/choose') }, 'Start', icon('next', 'sm'));
  const retry = h('button.btn.ghost', { type: 'button', hidden: true, onclick: () => { model.restart(); model.ready.catch(() => {}); } }, 'Try again');
  const paint = () => {
    const m = model.phase;
    if (model.state === 'ready') { load.textContent = 'The model engine is ready.'; bar.style.transform = 'scaleX(1)'; retry.hidden = true; }
    else if (model.state === 'error') { load.textContent = model.error ? model.error.message : 'The model could not be loaded.'; retry.hidden = false; }
    else if (globalThis.APW_LAZY_MODEL && model.state === 'idle') { load.textContent = 'The model engine (about 6 MB, once) loads when you first run a design.'; bar.style.transform = 'scaleX(0)'; retry.hidden = true; }
    else { load.textContent = `Loading the model engine (about 6 MB, once)${m ? ': ' + m.label.toLowerCase() : ''} (${fmtNum((m ? m.fraction : 0) * 100, 0)} %). You can start now.`; bar.style.transform = `scaleX(${m ? Math.max(0.02, m.fraction) : 0.02})`; retry.hidden = true; }
  };
  const off1 = model.onLoad(paint), off2 = model.onState(paint);
  paint();
  const facts = h('ul.w-facts', ['Start from the default inputs or type your own building', 'Every figure traced to an analytic model', 'Runs in your browser, nothing leaves it'].map((t) => h('li', icon('check', 'sm'), t)));
  const el = h('div.screen.welcome',
    h('div.w-glow', { 'aria-hidden': 'true' }),
    h('p.eyebrow.w-eyebrow', 'Warehouse design service'),
    h('h1.display', { tabindex: '-1' }, 'Design a 6-way shuttle pallet store.'),
    h('p.w-promise', 'A warehouse-design service for 6-way shuttle pallet stores, built on our analytic model and the APW brief. Give a building or a target; get a design with its cycle times, lifts, fleet, energy and cost.'),
    h('div.w-cta', start, h('div.w-loadbox', h('div.run-total.slim', bar), load, retry)), facts);
  riseIn([...el.children].filter((c) => !c.classList.contains('w-glow')), { stagger: 70 });
  return { el, destroy() { off1(); off2(); } };
}

export function mountChoose() {
  const card = (cls, ic, title, line, chips, to) => h('button.choice', { type: 'button', onclick: () => go(to), 'aria-label': `${title}. ${line}` },
    h('span.ic', icon(ic)), h('h2', title), h('p', line), h('span.row.chips', chips.map((c) => h('span.chip', c))), h('span.choice-go', 'Continue', icon('next', 'sm')));
  const fx = state.schema.fixed.fields, goals = state.schema.optimal.goals;
  const el = h('div.screen.choose',
    h('header.page-head', h('p.eyebrow', 'Step 1'), h('h1', { tabindex: '-1' }, 'How do you want to start?'), h('p.lead', 'Two ways in, or a comparison of the three flow formats. You can change your mind at any time.')),
    h('div.choices.has3',
      card('fixed', 'building', 'Fixed warehouse', 'I know my building.', ['Length × width × height', 'Shape', 'Docks', 'Racks', 'Flows'], '/fixed/building'),
      card('opt', 'target', 'Optimal warehouse', 'Find the best design for a capacity target or a budget.', goals.map((g) => g.title).concat(['Limits']), '/optimal/goal'),
      // R25b: the three flow formats on the same inputs
      card('lay', 'layers', 'Compare flows', 'Set your inputs once; the model runs the I, U and L flow on them and shows the winner of every criterion.', ['I / U / L', 'Same inputs', 'Winner per criterion', 'Your priority'], '/compare')));
  riseIn([...el.querySelectorAll('header, .choice')], { stagger: 60 });
  return { el };
}
