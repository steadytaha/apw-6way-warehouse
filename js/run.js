// Run screen: module-by-module progress. The rows follow the worker's progress events (a module is done when its event arrived);
// each row stays active at least MIN_MS so the sequence can be followed, capped at CAP_MS in total once the result is known.
import { h, icon, fmtKpi, announce, reducedMotion } from './ui.js';
import { state } from './store.js';
import { model, ModelError } from './model.js';
import { go } from './nav.js';
import { problemCard } from './diagnosis.js';
import { createPlanPreview } from './preview.js';

const MIN_MS = 520, CAP_MS = 9000;

export const MODULES = [
  { name: 'Geometry', icon: 'building', desc: 'Tiers, aisle modules and pallet positions that fit the building.', kpi: ['layout.positions', 'rack holds'] },
  { name: 'Cycle times', icon: 'clock', desc: 'Shuttle and lift travel with the brief kinematics.', kpi: ['cycles.shuttle', 'shuttle cycle'] },
  { name: 'Queues', icon: 'queue', desc: 'Waiting at the lifts and for a free shuttle (approximate).', kpi: ['queues.wait_L1', 'lift wait, approx.'] },
  { name: 'Layout', icon: 'grid', desc: 'Lift stations, lift mode and placement against the dock positions.', kpi: ['layout.lifts', 'lifts'] },
  { name: 'Fleet', icon: 'shuttle', desc: 'One pooled shuttle fleet, sized by the work, and its chargers.', kpi: ['energy.n_shuttles', 'shuttles'] },
  // FIX (R18e): exact flow keys abc.gain_U / _I / _L (was any abc.gain_* prefix, which would also catch abc.gain_share_*). Old cause: the row was blank when the dock case has no cycle-effect row (fixed_L, 1+2 docks: no abc.gain_* key).
  { name: 'ABC classes', icon: 'layers', desc: 'Fast movers near the lifts and what it saves.', kpi: [(k) => /^abc\.gain_[UIL]$/.test(k), 'cycle effect'], na: 'the report has no cycle-effect row for this dock case' },
  { name: 'Throughput', icon: 'gauge', desc: 'Which part limits the moves per hour.', kpi: ['throughput.bottleneck', 'bottleneck'] },
  { name: 'Expansion', icon: 'expand', desc: 'Headroom for growth and the next steps.', kpi: ['expansion.ratio_stock', 'stock headroom'] },
  { name: 'Energy', icon: 'bolt', desc: 'Daily energy of lifts, shuttles, conveyors, lighting.', kpi: ['energy.total', 'per day'] },
  { name: 'Cost', icon: 'euro', desc: 'CAPEX, annual cost and cost per pallet move.', kpi: ['service.capex_eur', 'CAPEX'] },
  { name: 'Resilience', icon: 'shield', desc: 'What a lift or shuttle stop costs.', kpi: ['resilience.one_lift_rho', 'one lift alone'] },
];
const PRE = {
  fixed: { name: 'Free inputs', icon: 'search', desc: 'The model fills in what you left open and picks the best candidate.' },
  optimal: { name: 'Search', icon: 'search', desc: 'Compares footprint shapes, lane depths and lift placements against the goal.' },
};

function kpiValue(report, spec) {
  if (!report || !report.groups) return null;
  const [key, label] = spec;
  for (const g of report.groups) for (const r of g.kpis) {
    if (typeof key === 'function' ? key(r.key) : r.key === key) { const f = fmtKpi(r); return { label, text: f.text, unit: f.unit }; }
  }
  return null;
}

export function mountRun() {
  const job = state.job;
  const rows = [{ ...PRE[job.mode], pre: true }, ...MODULES];
  const total = rows.length;
  const reduce = reducedMotion();
  const minMs = reduce ? 140 : MIN_MS;

  let active = 0, activeSince = null, finished = false, aborted = false, result = null, failure = null, revealed = false;
  const reported = new Set();
  const runStart = performance.now();

  // R26d V10: the plan on the right fills in module by module (building and docks at once; racks after Geometry, lift heads after Layout, shuttles after Fleet); schematic, not the result
  const pv = createPlanPreview({ mode: job.mode, layers: ['building', 'docks'], schematic: job.mode !== 'fixed', forceLifts: true });
  // ---- DOM
  const pct = h('span.num.run-pct', '0');
  const bar = h('div.run-total', h('i'));
  const loadLine = h('p.run-load.muted', { hidden: true });
  const loadBar = h('i');
  const loadWrap = h('div.run-loadwrap', { hidden: true }, loadLine, h('div.run-total.slim', loadBar));
  const list = h('ol.prog', { 'aria-label': 'Model modules' }, rows.map((r, i) => {
    const li = h('li.pending', { 'data-i': i },
      h('span.m', icon('check')), h('span.ic', icon(r.icon, 'sm')),
      h('span.t', h('b', r.name), h('small', r.desc)), h('span.v.num'),
      h('span.pb', { 'aria-hidden': 'true' }, h('i')));
    return li;
  }));
  const status = h('p.run-status.muted', { role: 'status' });
  const cancel = h('button.btn', { type: 'button', onclick: () => { abort(); go('/' + job.mode + '/review'); } }, icon('x', 'sm'), 'Cancel');
  const errBox = h('div.card.run-error', { hidden: true, role: 'alert' });
  const title = job.mode === 'fixed' ? 'Evaluating your warehouse' : 'Searching the best warehouse';
  const el = h('div.screen.run',
    h('header.run-head', h('p.eyebrow', icon(job.mode === 'fixed' ? 'building' : 'target', 'sm'), job.mode === 'fixed' ? 'Fixed warehouse' : 'Optimal warehouse'),
      h('h1', { tabindex: '-1' }, title),
      h('div.run-pctline', h('span.run-pctwrap', pct, h('span.pc', '%')), bar), status),
    h('div.run-grid', h('div.run-main', loadWrap, list), h('aside.run-aside', h('div.card.pv-card', h('p.eyebrow', 'The plan fills in'), pv.el))), errBox, h('div.run-actions', cancel));
  const items = [...list.children];

  // ---- model load display (the model may still be loading when the user arrives here)
  const off = model.onLoad((m) => {
    if (model.state === 'ready') { loadWrap.hidden = true; return; }
    loadWrap.hidden = false;
    loadLine.hidden = false;
    loadLine.textContent = `Loading the model engine (about 6 MB, once): ${m.label}`;
    loadBar.style.transform = `scaleX(${m.fraction || 0.02})`;
  });

  function setStatus(i) {
    const msg = i >= total ? 'Done' : `Step ${i + 1} of ${total}: ${rows[i].name}`;
    status.textContent = msg;
    announce(msg);
  }
  function activate(i) {
    active = i; activeSince = null;
    pv.setLayers(['building', 'docks'].concat(i >= 2 ? ['racks'] : [], i >= 5 ? ['lifts'] : [], i >= 6 ? ['fleet'] : []));
    if (i >= total) return;
    const li = items[i];
    li.className = 'act';
    li.setAttribute('aria-current', 'step');
    const fill = li.querySelector('.pb i');
    fill.style.transition = 'none'; fill.style.transform = 'scaleX(0)';
    requestAnimationFrame(() => { fill.style.transition = `transform ${minMs * 3}ms var(--ease-out)`; fill.style.transform = 'scaleX(0.9)'; });
    li.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    setStatus(i);
  }
  function complete(i) {
    const li = items[i];
    li.className = 'done';
    li.removeAttribute('aria-current');
    const fill = li.querySelector('.pb i');
    fill.style.transition = `transform 160ms var(--ease-out)`; fill.style.transform = 'scaleX(1)';
    const spec = rows[i].kpi;
    const rep = result && (job.mode === 'fixed' ? result : result.best);
    const val = spec && kpiValue(rep, spec);
    if (val) li.querySelector('.v').replaceChildren(h('small', val.label), ' ', val.text, val.unit ? ' ' + val.unit : '');
    // FIX (R18e): a figure the report does not carry shows n/a with its reason (title). Old cause: the row stayed blank, which reads as a missing value.
    else if (spec) li.querySelector('.v').replaceChildren(h('small', { title: rows[i].na || 'this figure is not in the report' }, spec[1]), ' ', 'n/a');
    else if (i === 0) li.querySelector('.v').textContent = '';
  }
  function paintPct(frac) {
    const p = Math.round(Math.min(1, frac) * 100);
    pct.textContent = String(p);
    bar.firstChild.style.transform = `scaleX(${Math.min(1, frac)})`;
    bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuenow', p); bar.setAttribute('aria-valuemin', 0); bar.setAttribute('aria-valuemax', 100); bar.setAttribute('aria-label', 'Overall progress');
  }

  function isReported(i) {
    if (result) return true;
    return i === 0 ? reported.size > 0 : reported.has(rows[i].name);
  }
  const timer = setInterval(tick, 70);
  function tick() {
    if (aborted || revealed) return;
    const now = performance.now();
    if (failure) { clearInterval(timer); return; }
    if (active < total) {
      if (activeSince == null) { if (model.state === 'ready') activeSince = now; else { paintPct(active / total); return; } }
      const slow = result && now - runStart > CAP_MS;                    // total stays within the cap once the numbers are in
      if (isReported(active) && (slow || now - activeSince >= minMs)) { complete(active); activate(active + 1); }
      const part = Math.min(0.9, (now - (activeSince || now)) / (minMs * 3));
      paintPct((active + (active < total ? part * 0.5 : 0)) / total);
    }
    if (active >= total && result && !revealed) {
      revealed = true; clearInterval(timer); paintPct(1);
      setTimeout(finish, reduce ? 60 : 380);
    }
  }
  activate(0);

  // ---- the model call
  const onProgress = ({ step }) => { if (MODULES.some((m) => m.name === step)) reported.add(step); };
  const call = job.mode === 'fixed' ? model.fixed(job.payload, onProgress) : model.optimal(job.payload, onProgress);
  call.then((res) => {
    if (aborted) return;
    finished = true;
    if (job.mode === 'fixed') {
      // FIX (R17b): inputs the model cannot take and searches without a design get a calm panel with the reasons and what to try. Old cause: a bare "inputs were not accepted" / "No design found" with the raw list.
      if (res.ok === false) return fail('These inputs cannot be evaluated yet.', res.reasons, res.diagnosis);
      result = res;
    } else {
      if (!res.best) return fail('No design fits all the limits yet.', res.reasons || [], res.diagnosis);
      result = res;
    }
  }).catch((e) => {
    if (aborted || (e instanceof ModelError && e.code === 'cancelled')) return;
    // raw exception text only in the collapsed technical details
    fail('The model could not finish this run.', [e instanceof ModelError && e.code === 'timeout' ? 'The run took too long and was stopped; a smaller building or fewer free choices usually helps.' : 'The model engine reported a problem. Your inputs are kept.'],
      null, (e instanceof ModelError ? e.message : String(e)) + (e && e.code === 'python' && e.detail && e.detail.trace ? String.fromCharCode(10) + String(e.detail.trace).split(String.fromCharCode(10)).slice(-4).join(String.fromCharCode(10)) : ''));
  });

  function fail(msg, reasons, diag, technical) {
    failure = msg;
    clearInterval(timer);
    errBox.hidden = false; errBox.classList.add('calm');
    const rs = (diag && diag.reasons && diag.reasons.length ? diag.reasons : reasons) || [];
    const dup = diag && diag.summary && rs.some((r) => String(diag.summary).toLowerCase().includes(String(r).toLowerCase()) || String(r).toLowerCase().includes(String(diag.summary).toLowerCase()));
    const lead = diag && diag.summary && !dup ? diag.summary.charAt(0).toUpperCase() + diag.summary.slice(1) : 'Nothing was lost: adjust the inputs and run again.';
    const raw = technical || (diag && diag.technical) || null;
    errBox.replaceChildren(problemCard({ title: msg, lead, reasons: diag && diag.reasons && diag.reasons.length ? diag.reasons : reasons, technical: raw,
      actions: [h('button.btn.primary', { type: 'button', onclick: () => { go('/' + job.mode + '/review'); } }, icon('back', 'sm'), 'Back to the inputs'),
        h('button.btn', { type: 'button', onclick: () => { if (model.state === 'error') model.restart(); go('/run'); } }, 'Try again')] }));
    status.textContent = msg; announce(msg);
    const cur = items[active]; if (cur) cur.className = 'pending';
    cancel.hidden = true;
    errBox.focus && errBox.setAttribute('tabindex', '-1');
  }
  function finish() {
    if (aborted) return;
    const rep = job.mode === 'fixed' ? result : result.best;
    state.result = { mode: job.mode, report: rep, alternatives: job.mode === 'optimal' ? result.alternatives : [], search: result.search || null, payload: job.payload,
      champions: job.mode === 'optimal' ? result.champions || null : null,
      shapes: job.mode === 'optimal' ? result.shape_comparison || null : null };      // R9b: the shape comparison of the search (Shapes tab)
    state.view = { index: 0, report: rep };
    state.altCache = new Map();
    state.job = null;
    go('/results', { replace: true });
  }
  function abort() {
    if (aborted) return;
    aborted = true; clearInterval(timer); off();
    if (!finished && !failure) model.cancel();
  }
  document.addEventListener('keydown', onKey);
  function onKey(e) { if (e.key === 'Escape' && !revealed) { abort(); go('/' + job.mode + '/review'); } }
  return { el, destroy() { document.removeEventListener('keydown', onKey); abort(); off(); } };
}
