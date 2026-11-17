// Story (B5): fills the story slot of the results screen. A chapter navigator with one card per brief item (message, numbers,
// one small chart, a linked camera shot), the guided demo / present mode (present.js), the KPI comparison (compare.js) and the
// printable report (print.js). FIX (R13b): the slide-12 example is no longer evaluated or compared; it is an ordinary input. Listens to `apw:report` / `apw:leave` / `apw:scene`; everything is built from the report.
import { h, icon, countUp, riseIn, reducedMotion, toast, announce } from '../ui.js';
import { buildChapters, chapterShots, numText, numValue } from './chapters.js';
import { drawIn } from './charts.js';
import { openPresent } from './present.js';
import { buildCompare } from './compare.js';
import { printReport } from './print.js';

let S = null;      // state of the mounted story

document.addEventListener('apw:report', (e) => mount(e.detail));
document.addEventListener('apw:leave', teardown);
document.addEventListener('apw:scene', (e) => {
  if (!S || e.detail.report !== S.rep) return;
  S.api = e.detail.api;
  // FIX (R9b): harmless guard only. Old cause: scene/shots.js threw on L / U / T scenes without `columns` and that error broke the page; the scene now builds per-block shots (R9b-scene), so the guard should never fire.
  try { S.shots = chapterShots(S.api, S.rep); } catch (err) { S.shots = null; console.warn('[story] camera shots not available for this footprint:', err && err.message); }
  const stage = S.d.slots.scene.querySelector('.slot-stage');
  stage.addEventListener('pointerdown', () => { if (!S.present && S.api && S.api.rig.tour) S.api.stopTour(); }, true);     // the user takes over from a chapter shot
  paintButtons();
});

function teardown() {
  if (S && S.present) S.present.close({ silent: true });
  S = null;
}

function mount(d) {
  teardown();
  const slot = d.slots.story, rep = d.report;
  slot.replaceChildren();
  if (!rep.story || !rep.scene) {       // FIX (R9b): an infeasible design still gets its story (its reasons are shown above); old cause: story hidden unless feasible
    slot.append(h('div.card.st-empty', icon('info'), h('div', h('strong', 'No story for this design'), h('p.muted', 'The story needs a design with a layout. See the reasons above.'))));
    return;
  }
  S = { d, rep, idx: 0, api: null, present: null, shots: null, chapters: [] };
  if (S.api) S.shots = chapterShots(S.api, rep);
  build();
}

function build() {
  const { d, rep } = S;
  S.chapters = buildChapters(rep);
  const slot = d.slots.story;
  S.el = {};
  const n = S.chapters.length, secs = S.chapters.reduce((a, c) => a + c.dur, 0);
  S.el.play = h('button.btn.primary.lg', { type: 'button', onclick: () => present(true) }, icon('play', 'sm'), 'Play the demo');
  S.el.present = h('button.btn', { type: 'button', onclick: () => present(false) }, icon('expand', 'sm'), 'Present');
  S.el.compare = h('button.btn', { type: 'button', onclick: () => { const c = document.getElementById('compare'); if (c) { c.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }); c.focus({ preventScroll: true }); } } }, icon('layers', 'sm'), 'Compare');
  S.el.print = h('button.btn', { type: 'button', title: 'Download the report as a printable page (PDF through the print dialog)', 'aria-label': 'Download report', onclick: doPrint }, icon('doc', 'sm'), 'Report');
  S.el.nav = h('div.st-nav', { role: 'tablist', 'aria-label': 'Story chapters' }, S.chapters.map((c, i) => h('button.st-tab', {
    type: 'button', role: 'tab', id: 'st-tab-' + i, 'aria-selected': String(i === S.idx), 'aria-controls': 'st-panel', tabindex: i === S.idx ? '0' : '-1', title: c.title, 'aria-label': `Chapter ${i + 1}: ${c.title}`,
    onclick: () => select(i, { fly: true }),
  }, h('span.num', String(i + 1)))));
  S.el.nav.addEventListener('keydown', (e) => {
    if (!/^(Arrow(Left|Right|Up|Down)|Home|End)$/.test(e.key)) return; e.preventDefault();
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (S.idx + (/Right|Down/.test(e.key) ? 1 : -1) + n) % n;
    select(j, { fly: true }); S.el.nav.children[j].focus();
  });
  S.el.panel = h('div.st-panel', { role: 'tabpanel', id: 'st-panel', 'aria-live': 'polite', 'aria-labelledby': 'st-tab-' + S.idx });
  slot.replaceChildren(h('div.card.st', h('header.st-h', h('h2', 'The story'), h('p.cap', `${n} chapters, one per brief item. The demo runs them in about ${Math.round(secs)} s.`)),
    h('div.st-actions', S.el.play, S.el.present, S.el.compare, S.el.print), S.el.nav, S.el.panel));
  paintButtons();
  paintChapter(true);
  // compare section, full width under the scene and the story
  const wrap = slot.closest('.slots');
  if (wrap) { S.cmp = buildCompare(S); wrap.after(S.cmp.el); }
}

function paintButtons() {
  if (!S || !S.el) return;
  const ready = !!S.api && !!S.shots;
  for (const b of [S.el.play, S.el.present]) { b.disabled = !ready; b.title = ready ? '' : 'The 3D view or its camera shots are not available for this design yet'; }
}

// ---------------------------------------------------------------- one chapter card
function select(i, { fly } = {}) {
  if (!S) return;
  S.idx = i;
  [...S.el.nav.children].forEach((b, j) => { b.setAttribute('aria-selected', String(j === i)); b.tabIndex = j === i ? 0 : -1; });
  S.el.panel.setAttribute('aria-labelledby', 'st-tab-' + i);
  paintChapter(true);
  if (fly && S.api && S.shots) {
    try { S.api.tour(S.shots[S.chapters[i].id]); } catch (err) { console.warn('[story] shot failed', err); }
  }
}

export function numberBlock(n, { animate = false } = {}) {
  const v = numValue(n), f = (x) => numText({ ...n, value: x / (n.scale || 1) });
  const el = h('span.num.st-nv', v == null ? 'n/a' : f(v));
  if (animate && v != null) countUp(el, v, f);
  return h('div.st-num', h('span.st-nl', n.label, n.note && h('span.tag-assume', { title: n.note }, 'assumption')),
    h('span.st-nn', el, v != null && h('small', n.unit)));
}

function paintChapter(animate) {
  const c = S.chapters[S.idx], n = S.chapters.length;
  const chart = c.chart();
  const body = [
    h('p.st-kick', `Chapter ${S.idx + 1} of ${n} · ${c.item}`),
    h('h3.st-title', c.title),
    h('p.st-msg', c.msg),
    h('div.st-nums', c.nums.map((x) => numberBlock(x, { animate }))),
    h('div.st-chart', chart),
    h('div.st-foot',
      h('button.btn.ghost', { type: 'button', onclick: () => select((S.idx + n - 1) % n, { fly: true }) }, icon('back', 'sm'), 'Previous'),
      h('button.btn.ghost', { type: 'button', disabled: !S.api, onclick: () => select(S.idx, { fly: true }) }, icon('cube', 'sm'), 'Show in 3D'),
      h('button.btn.ghost', { type: 'button', onclick: () => select((S.idx + 1) % n, { fly: true }) }, 'Next', icon('next', 'sm'))),
  ];
  S.el.panel.replaceChildren(...body.filter(Boolean));
  if (animate) { riseIn(S.el.panel.children, { stagger: 40 }); drawIn(chart, { delay: 150 }); }
  if (animate) announce(`Chapter ${S.idx + 1}: ${c.title}. ${c.msg}`);
}

// ---------------------------------------------------------------- actions
function present(autoplay) {
  if (!S || !S.api) { toast('The 3D view is not ready yet.'); return; }
  const stage = S.d.slots.scene.querySelector('.slot-stage');
  stage.scrollIntoView({ block: 'start', behavior: 'auto' });
  const my = S;
  my.present = openPresent({
    api: my.api, stage, chapters: () => my.chapters, shots: my.shots, autoplay, startAt: 0,
    onClose: () => { if (S === my) { my.present = null; select(my.idx, { fly: false }); (autoplay ? my.el.play : my.el.present).focus({ preventScroll: true }); } },
    onChapter: (i) => { my.idx = i; },
  });
}

async function doPrint() {
  if (!S) return;
  S.el.print.disabled = true;
  try { await (S.cmp && S.cmp.ready()); } catch (e) { /* print without the comparison */ }
  S.el.print.disabled = false;
  if (!S) return;
  printReport(S);
}
