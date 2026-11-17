// R25b: "Compare flows" view (replaces the R22c "Dock layouts" view, E1-E6 of R25_brief.md).
// The user sets one set of inputs; the model (service.compare_flows) runs the three flow formats I (IN / OUT on opposite walls), U (same wall) and L (adjacent walls, rectangular racks)
// on them. The view shows three columns (plan, key numbers, winner badges), the winner per criterion, and a recommendation by a priority that switches without a new run
// (the result holds the recommendation of every priority). Every number comes from the result; this file only formats and lays out. The default 65 x 40 x 20 m result is
// model/compare_data.js (generated at build time by tools/compare_data.py), so the view opens with numbers; Run recomputes in the browser.
import { h, icon, riseIn, fmtNum, fmtDim, announce } from './ui.js';
import { go } from './nav.js';
import { state, save, defaultRaw } from './store.js';
import { model, ModelError } from './model.js';
import { renderField, renderPlan, check, asPercent } from './fields.js';
import { scenePlan } from './scene/fallback.js';
import { loadFixedInputs } from './wizard.js';
import { problemCard } from './diagnosis.js';
import { openLightbox, svgItem, zoomHint } from './zoom.js';
import pre from '../model/compare_data.js';

const FLOWS = ['I', 'U', 'L'];
const FLOW_SHORT = { I: 'opposite walls', U: 'same wall', L: 'adjacent walls' };
// the inputs the user sets first (E2); every other Fixed input sits under "More inputs"
const GROUPS = [
  { id: 'building', title: 'Building', keys: ['L', 'W', 'H'] },
  { id: 'flows', title: 'Flows', keys: ['in_h', 'out_h', 'in_hours', 'out_hours'] },
  { id: 'service', title: 'Service and capacity', keys: ['level_of_service', 'cap_target'] },
  { id: 'structure', title: 'Structure and fire', keys: ['tiers_max', 'fire_strategy', 'ops_share', 'reserve_share'] },
];
const MAIN = new Set(GROUPS.flatMap((g) => g.keys));
// owned by the flow format (docks, rectangular racks) or by the form itself: not offered under "More inputs"
const NOT_OFFERED = new Set(['in_wall', 'in_pos', 'out_wall', 'out_pos', 'dock_case', 'shape', 'shape_params', 'lift_type', 'options', 'champions']);
// badge words (presentation only; which flow wins comes from the result)
const WIN_WORD = { capex: 'Lowest CAPEX', annual: 'Lowest annual cost', machines: 'Fewest machines', storage: 'Most storage', f_io: 'Shortest F_io', flow: 'Highest max flow', energy: 'Lowest energy',
  resilience: 'Most resilient', abc: 'Best ABC gain', tier: 'Fewest tier changes', expansion: 'Longest to full' };
const OPP = { W: 'E', E: 'W', N: 'S', S: 'N' };
const C = () => state.compare;

// ---------------------------------------------------------------- dock defaults (drawing only; the model owns the real mapping, `qa_compare.py` checks both agree)
function defaultBays(flow, L, W) {
  if (flow === 'I') return { in_wall: 'W', in_pos: 0.5, out_wall: 'E', out_pos: 0.5 };
  if (flow === 'U') { const w = L >= W ? 'S' : 'W'; return { in_wall: w, in_pos: 0.25, out_wall: w, out_pos: 0.75 }; }
  return { in_wall: 'W', in_pos: 0.5, out_wall: 'S', out_pos: 0.5 };
}
/** The user moved one dock of a flow: keep the flow format (I opposite, U same wall, L adjacent) by moving the partner dock's wall when needed. */
function setWall(flow, dock, wall) {
  const b = C().bays[flow], eff = { ...defaultBays(flow, dim('L'), dim('W')), ...b };
  const other = dock === 'in' ? 'out' : 'in', ok = `${other}_wall`;
  b[`${dock}_wall`] = wall;
  if (flow === 'I') b[ok] = OPP[wall];
  else if (flow === 'U') b[ok] = wall;
  else if (eff[ok] === wall || eff[ok] === OPP[wall]) b[ok] = wall === 'W' || wall === 'E' ? 'S' : 'W';
}

// ---------------------------------------------------------------- inputs -> payload
const dim = (k) => { const v = Number(String(C().vals[k] ?? pre.payload.inputs[k]).replace(',', '.')); return Number.isFinite(v) && v > 0 ? v : pre.payload.inputs[k]; };
function fieldList() {
  const all = state.schema.fixed.fields.filter((f) => !NOT_OFFERED.has(f.key)).map(asPercent);
  const by = Object.fromEntries(all.map((f) => [f.key, f]));
  return { by, more: all.filter((f) => !MAIN.has(f.key)) };
}
/** Raw form values -> model inputs. Only what differs from the model default is sent, so the untouched form equals the precomputed default. */
export function buildPayload() {
  const { by, more } = fieldList();
  const inputs = {}, issues = [];
  for (const f of [...GROUPS.flatMap((g) => g.keys.map((k) => by[k])).filter(Boolean), ...more]) {
    const k = f.key, raw = k in C().vals ? C().vals[k] : defaultRaw(f);
    const req = ['L', 'W', 'H'].includes(k);
    if (f.type === 'number') {
      const r = check(f, raw);
      if (!r.ok) { issues.push({ f, msg: r.msg }); continue; }
      if (r.value == null) continue;
      if (!req && r.value === f.default) continue;
      inputs[k] = f.pct ? Math.round(r.value * 10) / 1000 : r.value;
    } else if (f.type === 'choice') {
      if (raw === 'auto' || raw === '' || raw == null || String(raw) === String(f.default)) continue;
      inputs[k] = String(raw);
    } else if (f.type === 'bool') {
      if (!!raw !== !!f.default) inputs[k] = !!raw;
    } else if (f.type === 'text') {
      if (raw != null && String(raw).trim() !== '') inputs[k] = String(raw).trim();
    }
  }
  const bays = {};
  for (const f of FLOWS) if (Object.keys(C().bays[f]).length) bays[f] = { ...C().bays[f] };
  return { inputs, bays, issues };
}
const sortObj = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
const canon = (p) => JSON.stringify({ inputs: sortObj(p.inputs || {}), bays: sortObj(Object.fromEntries(Object.entries(p.bays || {}).map(([k, v]) => [k, sortObj(v)]))) });

// ---------------------------------------------------------------- number formats (unit of the criterion comes with the result)
const money = (x) => (x == null ? 'n/a' : x >= 1e6 ? `€ ${fmtNum(x / 1e6, 2)} M` : `€ ${fmtNum(x / 1e3, 0)} k`);
const DEC = { EUR: 0, 'EUR/year': 0, count: 0, pallets: 0, s: 1, 'moves/h': 1, 'kWh/day': 1, '%': 1, share: 3, years: 1 };
function fmtCrit(unit, v) {
  if (v == null) return 'n/a';
  if (unit === 'EUR' || unit === 'EUR/year') return money(v);
  return fmtNum(v, DEC[unit] ?? 1) + (unit === '%' ? ' %' : unit === 'count' || unit === 'share' ? '' : ' ' + unit);
}
const trimNum = (x, d) => String(+Number(x).toFixed(d));
/** The tie band exactly as the rules table holds it (no rounding): 0.5 %, 1.0 pp, 0.01, 0.25 years. */
const tieText = (c) => (c.tie_band_kind === 'rel' ? `within ${trimNum(c.tie_band * 100, 2)} % of the best` : !c.tie_band ? 'equal'
  : c.unit === '%' ? `within ${Number(c.tie_band).toFixed(1)} pp of the best` : c.unit === 'share' ? `within ${trimNum(c.tie_band, 3)} of the best` : `within ${trimNum(c.tie_band, 3)} ${c.unit} of the best`);

// ---------------------------------------------------------------- open one flow in the existing results / 3D view
export function openReport(res, flow) {
  const rep = res.flows[flow].report;
  const inputs = { ...res.inputs, ...res.bays[flow] };
  loadFixedInputs(inputs);
  state.mode = 'fixed';
  state.job = null;
  state.result = { mode: 'fixed', report: rep, alternatives: [], search: null, payload: inputs, champions: null, shapes: null };
  state.view = { index: 0, report: rep };
  state.altCache = new Map();
  save();
  go('/results');
}

// ---------------------------------------------------------------- mount
export function mountCompare() {
  const cs = C();
  for (const k of ['L', 'W', 'H']) if (!(k in cs.vals)) cs.vals[k] = String(pre.payload.inputs[k]);
  if (!cs.result) { cs.result = pre.result; cs.payload = pre.payload; cs.pre = true; }
  const { by, more } = fieldList();
  let running = null;                       // { t0, timer, flows: {I: 'wait'|'run'|'done'} }
  let runError = null;
  const fieldHandles = [], planHandles = [];

  // ---- inputs panel
  const stale = h('p.chip.warn.cmp-stale', { hidden: true, role: 'status' });
  const ctx = { get: (k) => (k in cs.vals ? cs.vals[k] : defaultRaw((by[k]) || more.find((f) => f.key === k) || {})), set: (k, v) => { cs.vals[k] = v; save(); }, changed: (k) => { if (k === 'L' || k === 'W') planHandles.forEach((p) => p.redraw()); markStale(); } };
  const fld = (f) => { const x = renderField(f, ctx); fieldHandles.push(x); return x.el; };
  const group = (g) => h('fieldset.cmp-group', h('legend', g.title), h('div.fields', g.keys.map((k) => by[k]).filter(Boolean).map(fld)));
  const moreBox = h('details.cmp-more', h('summary', 'More inputs (all other Fixed inputs, model defaults)'), h('div.fields', more.map(fld)));
  const planCard = (f) => {
    const user = () => cs.bays[f];
    const p = renderPlan({ dims: () => ({ L: dim('L'), W: dim('W') }), keys: { in_wall: 'in_wall', in_pos: 'in_pos', out_wall: 'out_wall', out_pos: 'out_pos' }, interactive: true,
      get: (k) => String(k in user() ? user()[k] : defaultBays(f, dim('L'), dim('W'))[k]),
      set: (k, v) => { if (k.endsWith('_wall')) setWall(f, k.startsWith('in') ? 'in' : 'out', v); else user()[k] = Number(v); save(); },
      changed: () => { p.redraw(); markStale(); } });
    planHandles.push(p);
    const reset = h('button.btn.ghost.cmp-small', { type: 'button', onclick: () => { cs.bays[f] = {}; save(); p.redraw(); markStale(); } }, 'Reset docks');
    return h('div.cmp-plan', { 'data-flow': f }, h('div.cmp-plan-h', h('span.lay-n', f), h('div', h('strong', `${f} flow`), h('small.muted', FLOW_SHORT[f]))), p.el, reset);
  };
  const runBtn = h('button.btn.primary', { type: 'button', 'data-run': '', onclick: () => run() }, icon('play', 'sm'), 'Run comparison');
  const resetBtn = h('button.btn.ghost', { type: 'button', onclick: () => {
    cs.vals = { L: String(pre.payload.inputs.L), W: String(pre.payload.inputs.W), H: String(pre.payload.inputs.H) }; cs.bays = { I: {}, U: {}, L: {} }; save();
    fieldHandles.forEach((x) => x.refresh()); planHandles.forEach((p) => p.redraw()); markStale();
  } }, 'Reset to defaults');
  const issuesBox = h('div.cmp-issues', { role: 'alert', hidden: true });
  const panel = h('section.card.cmp-panel', { 'aria-labelledby': 'cmp-h-in' },
    h('h2.sec-h#cmp-h-in', 'Your inputs'),
    h('p.muted', `Defaults: the ${fmtDim(pre.payload.inputs.L, pre.payload.inputs.W, pre.payload.inputs.H)} m building, the slide-12 flows (IN 40, OUT 60 pallets per hour), a 4,000-pallet target. Everything else is the model default.`),
    GROUPS.map(group),
    h('h3.sub-h', 'Dock positions per flow'),
    h('p.muted', 'Tap or drag a wall on a plan to move that dock. The flow format stays: I keeps the docks on opposite walls, U on one wall, L on adjacent walls.'),
    h('div.cmp-plans', FLOWS.map(planCard)),
    moreBox, issuesBox,
    h('div.cmp-actions', runBtn, resetBtn, stale));

  // ---- result area
  const resultBox = h('div.cmp-result', { 'aria-live': 'off' });

  function markStale() {
    const p = buildPayload();
    const same = canon(p) === canon(cs.payload || { inputs: {}, bays: {} });
    cs.stale = !same;
    stale.hidden = same || !!running;
    stale.textContent = 'The inputs changed since this result. Press Run to update it.';
    resultBox.classList.toggle('is-stale', !same);
    if (p.issues.length) { issuesBox.hidden = false; issuesBox.replaceChildren(...p.issues.map((i) => h('p.msg.err', i.msg))); } else issuesBox.hidden = true;
  }

  // ---- running
  function paintRunning() {
    const cols = FLOWS.map((f) => {
      const bar = h('i');
      const st = h('small.muted', { role: 'status' });
      const el = h('article.cmp-col.is-running', { 'data-flow': f }, h('header', h('span.lay-n', f), h('h3', `${f} flow`, h('small.muted', ' ' + FLOW_SHORT[f]))), h('div.cmp-skel', { 'aria-hidden': 'true' }), st, h('div.run-total.slim', bar));
      return { f, el, bar, st };
    });
    const info = h('p.cmp-runinfo.muted', { role: 'status' });
    const cancel = h('button.btn', { type: 'button', onclick: () => { model.cancel(); finishRun(); } }, icon('x', 'sm'), 'Cancel');
    resultBox.replaceChildren(h('div.cmp-head', h('h2.sec-h', 'Running the three flows'), cancel), info, h('div.cmp-cols', cols.map((c) => c.el)));
    const paint = () => {
      const s = (performance.now() - running.t0) / 1000;
      const loading = model.state !== 'ready';
      info.textContent = loading ? `Loading the model engine (about 6 MB, once)${model.phase ? ' (' + fmtNum(model.phase.fraction * 100, 0) + ' %)' : ''}, then the three flows run one after the other. ${fmtNum(s, 0)} s`
        : `All three flows are evaluated on the same inputs. This takes some seconds in the browser. ${fmtNum(s, 0)} s elapsed.`;
      for (const c of cols) {
        const sv = running.flows[c.f];
        c.el.dataset.state = sv;
        c.st.textContent = loading ? 'Waiting for the model engine' : sv === 'done' ? 'Done' : sv === 'run' ? 'Evaluating this flow' : sv === 'wait' ? 'Evaluating' : '';
        c.el.classList.toggle('idle', sv === 'wait' || loading);
      }
    };
    running.paint = paint; paint();
  }
  function finishRun() { if (running) { clearInterval(running.timer); running = null; } runBtn.disabled = false; markStale(); }

  async function run() {
    if (running) return;
    const p = buildPayload();
    if (p.issues.length) { markStale(); const f = fieldHandles.find((x) => !x.validate(true)); if (f) f.focus(); return; }
    runError = null;
    running = { t0: performance.now(), flows: { I: 'wait', U: 'wait', L: 'wait' }, timer: setInterval(() => running && running.paint && running.paint(), 500) };
    runBtn.disabled = true; stale.hidden = true;
    paintRunning();
    announce('Comparing the three flows.');
    const onProgress = ({ step }) => {                      // events arrive only when the model reports them; the per-column state follows them, otherwise all three stay "evaluating"
      const m = /(?:^|\b)([IUL])(?:\b|$)/.exec(String(step));
      if (!m || !running) return;
      FLOWS.forEach((f, i) => { running.flows[f] = i < FLOWS.indexOf(m[1]) ? 'done' : i === FLOWS.indexOf(m[1]) ? 'run' : 'wait'; });
      running.paint();
    };
    try {
      const res = await model.compare({ inputs: p.inputs, bays: p.bays, priority: cs.priority }, onProgress);
      if (!res || res.ok === false) throw Object.assign(new Error('compare failed'), { reasons: (res && res.errors) || ['the model did not accept these inputs'] });
      cs.result = res; cs.payload = { inputs: p.inputs, bays: p.bays }; cs.pre = false; cs.ranMs = Math.round(performance.now() - running.t0);
      finishRun(); paintResult(); announce('The comparison is ready.');
    } catch (e) {
      if (e instanceof ModelError && e.code === 'cancelled') { finishRun(); paintResult(); return; }
      runError = e; finishRun(); paintResult();
    }
  }

  // ---- result
  function winnersOf(res, f) { return Object.entries(res.winners).filter(([, w]) => w.flows.includes(f)).map(([k, w]) => ({ k, w })); }

  function planFigure(res, f, gallery) {
    const rep = res.flows[f].report;
    let svg = null;
    try { svg = scenePlan(rep); } catch (e) { console.warn('[compare] plan not available:', e && e.message); }
    if (!svg) return h('p.muted.cmp-noplan', 'No plan for this flow.');
    const label = `Flow ${f}, plan`;
    const b = h('button.lay-zoom.cmp-zoom', { type: 'button', 'aria-label': `Zoom: ${label}`, onclick: () => {
      const items = gallery.map((g) => svgItem(g.svg, `Flow ${g.f}, plan: ${FLOW_SHORT[g.f]}`)), at = gallery.findIndex((g) => g.f === f);
      openLightbox(items, Math.max(0, at), b);
    } }, svg, zoomHint());
    gallery.push({ f, svg });
    return b;
  }

  function column(res, f, gallery) {
    const fl = res.flows[f], b = fl.block;
    const head = h('header', h('span.lay-n', f), h('h3', `${f} flow`, h('small.muted', ' ' + FLOW_SHORT[f])), h('span.chip.ok.cmp-rec', { hidden: true }, icon('check', 'sm'), 'Recommended'));
    if (!b) {
      const why = (fl.report && fl.report.diagnosis && fl.report.diagnosis.summary) || fl.excluded || 'no result';
      return h('article.cmp-col.is-bad', { 'data-flow': f }, head, h('p.chip.bad', icon('warn', 'sm'), 'No result'), h('p', why), fl.report && (fl.report.reasons || []).length ? h('ul.cmp-reasons', fl.report.reasons.slice(0, 3).map((r) => h('li', r))) : null);
    }
    const kv = (k, v, title) => h('div.cmp-kv', h('dt', k), h('dd', title ? { title } : null, v));
    const wins = winnersOf(res, f);
    const loss = b.resilience.loss_one_lift_pct;
    return h('article.cmp-col', { 'data-flow': f, 'data-flow-ok': b.target_met ? '1' : '0' }, head,
      planFigure(res, f, gallery),
      fl.excluded ? h('p.chip.warn.cmp-excl', icon('warn', 'sm'), fl.excluded) : null,
      h('div.cmp-wins', { 'aria-label': `Criteria won by flow ${f}` }, wins.length ? wins.map(({ k, w }) => h('span.chip.acc.cmp-win', { 'data-win': k, title: w.tie ? 'Tied within the band: ' + w.flows.join(', ') : '' }, icon('check', 'sm'), WIN_WORD[k] || w.label, w.tie ? ' (tie)' : '')) : h('span.muted', 'Wins no criterion')),
      h('dl.cmp-kvs',
        kv('Positions', `${fmtNum(b.positions)} (${fmtNum(b.expected_stored)} expected stored)`),
        kv('Racks', `${b.rack.lane_depth}-deep lanes, ${b.rack.tiers} tiers, aisles along ${b.rack.aisle_direction}`),
        kv('Doors', `${b.doors.in} IN + ${b.doors.out} OUT`),
        kv('Lifts', `${b.lifts.working} working + ${b.lifts.spare} spare at ${b.lifts.n_stations} station${b.lifts.n_stations > 1 ? 's' : ''}`, b.lifts.reason),
        kv('Shuttles', `${b.shuttles} (${b.fleet_policy})`, b.fleet_reason),
        kv('Lift mode', b.lift_mode, b.lift_mode_reason),
        kv('F_io', `${fmtNum(b.f_io_s, 1)} s`),
        kv('Max flow', `${fmtNum(b.max_flow.moves_h, 1)} moves/h, bound by ${b.max_flow.binding}`),
        kv('One lift down', `${fmtNum(b.resilience.flow_one_lift_down, 1)} moves/h (${loss > 0 ? '−' + fmtNum(loss, 1) + ' %' : 'no loss'})`),
        kv('Energy', `${fmtNum(b.energy.kwh_day, 1)} kWh/day`),
        kv('CAPEX', `${money(b.capex_low)} to ${money(b.capex_high)}`),
        kv('Annual cost', `${money(b.annual)} (low case)`)),
      h('button.btn.lay-open', { type: 'button', 'data-open': f, onclick: () => openReport(res, f) }, 'Open full report', icon('next', 'sm')));
  }

  function criteriaTable(res) {
    const present = FLOWS.filter((f) => res.flows[f] && res.flows[f].block);
    return h('div.lay-tablewrap', { tabindex: '0', role: 'region', 'aria-label': 'Winner per criterion' },
      h('table.lay-table.cmp-table',
        h('caption.sr-only', 'Winner per criterion. The winning flow of each row is marked.'),
        h('thead', h('tr', h('th', { scope: 'col' }, 'Criterion'), FLOWS.map((f) => h('th', { scope: 'col' }, `${f} flow`)), h('th', { scope: 'col' }, 'Tie band'))),
        h('tbody', Object.entries(res.winners).map(([k, w]) => h('tr', { 'data-crit': k },
          h('th', { scope: 'row' }, w.label, h('small.muted', w.better === 'lower' ? ' (lower is better)' : ' (higher is better)')),
          FLOWS.map((f) => {
            const win = w.flows.includes(f);
            return h('td', { class: win ? 'win' : '', 'data-win': win ? '1' : null }, f in w.values ? [win ? icon('check', 'sm') : null, h('span.sr-only', win ? 'Winner: ' : ''), fmtCrit(w.unit, w.values[f])] : (present.includes(f) ? 'n/a' : 'excluded'));
          }),
          h('td.why-moved', tieText(w)))))));
  }

  function rulesBox(res) {
    const pr = res.rules.priorities;
    return h('details.lay-details.cmp-rules', h('summary', 'How the winner and the recommendation are chosen'),
      h('p.muted', res.rules.scope),
      h('p.muted', 'A flow whose value lies within the tie band of the best counts as a tie (all tied flows win). The priorities rank the flows like this:'),
      h('ul', Object.entries(pr).map(([k, p]) => h('li', h('strong', p.label + '. '), p.score ? `Rank sum of ${p.score.map((c) => res.rules.criteria[c].label.toLowerCase()).join(', ')}; ties go to ${p.then.map((c) => res.rules.criteria[c].label.toLowerCase()).join(', then ')}.`
        : `Best ${res.rules.criteria[p.primary].label.toLowerCase()}; ties go to ${p.then.map((c) => res.rules.criteria[c].label.toLowerCase()).join(', then ')}.`))),
      h('h4.sub-h', 'Tie bands'),
      h('p.muted', 'Source of every band and of the priority rules: ', h('strong', res.rules.source || 'team decision (2026-11-17)'), '. These are chosen conventions, not measured quantities.'),
      h('ul.cmp-bands', Object.values(res.rules.criteria).map((c) => h('li', h('strong', c.label + ': '), tieText(c), c.reason ? ` (${c.reason})` : ''))));
  }

  function paintResult() {
    const res = cs.result;
    if (runError) {
      const reasons = runError.reasons || [runError instanceof ModelError && runError.code === 'timeout' ? 'The run took too long and was stopped.' : 'The model engine reported a problem. Your inputs are kept.'];
      resultBox.replaceChildren(problemCard({ title: 'The comparison could not finish.', lead: 'Nothing was lost: adjust the inputs and run again.', reasons, technical: runError.message || String(runError),
        actions: [h('button.btn.primary', { type: 'button', onclick: () => { runError = null; run(); } }, 'Try again')] }));
      return;
    }
    const gallery = [];
    const cols = h('div.cmp-cols', FLOWS.filter((f) => res.flows[f]).map((f) => column(res, f, gallery)));
    const recBox = h('section.card.cmp-rec-card', { 'aria-labelledby': 'cmp-h-rec' });
    const seg = h('div.seg.cmp-prio', { role: 'radiogroup', 'aria-labelledby': 'cmp-h-rec' });
    const prios = Object.keys(res.recommendations);
    const btns = prios.map((k) => h('button', { type: 'button', role: 'radio', 'data-prio': k, onclick: () => pick(k) }, res.rules.priorities[k].label.replace(/ \(.*\)$/, ''), h('b.cmp-prio-f', ' ' + (res.recommendations[k].flow || '-'))));
    seg.append(...btns);
    seg.addEventListener('keydown', (e) => {
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      const i = (prios.indexOf(cs.priority) + d + prios.length) % prios.length;
      pick(prios[i]); btns[i].focus();
    });
    function pick(k) { cs.priority = k; save(); paintRec(); announce(`Priority ${res.rules.priorities[k].label}: flow ${res.recommendations[k].flow}.`); }
    function paintRec() {
      const rec = res.recommendations[cs.priority] || res.recommendation;
      btns.forEach((b) => { const on = b.dataset.prio === cs.priority; b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; });
      cols.querySelectorAll('.cmp-col').forEach((c) => { const on = c.dataset.flow === rec.flow; c.classList.toggle('is-rec', on); const chip = c.querySelector('.cmp-rec'); if (chip) chip.hidden = !on; });
      recBox.replaceChildren(h('h2.sec-h#cmp-h-rec', 'Recommendation by your priority'), seg,
        h('div.cmp-rec-line', { 'data-rec': rec.flow || '' }, rec.flow ? [h('span.cmp-rec-flow', rec.flow), h('div', h('strong', `${rec.flow} flow (${FLOW_SHORT[rec.flow]})`), rec.runner_up ? h('span.muted', `, runner-up ${rec.runner_up}`) : null,
          h('p.cmp-reason', rec.reason), rec.scope && rec.scope !== 'all requirements met' ? h('p.chip.warn', icon('warn', 'sm'), rec.scope) : null)] : h('p', rec.reason)));
    }
    const meta = cs.pre ? 'Default result, computed when the demo was built.' : `Computed in your browser${cs.ranMs ? ' in ' + fmtNum(cs.ranMs / 1000, 1) + ' s' : ''}.`;
    resultBox.replaceChildren(...[
      h('div.cmp-head', h('h2.sec-h', 'Result for ', fmtDim(res.inputs.L, res.inputs.W, res.inputs.H), ' m'), h('p.muted.cmp-meta', meta)),
      res.target_met_by && res.target_met_by.length < FLOWS.length ? h('p.chip.warn', icon('warn', 'sm'), res.target_met_by.length ? `Only ${res.target_met_by.join(', ')} reach the capacity target; the others are shown but not ranked.` : 'No flow reaches the capacity target; the flows are ranked among their best results.') : null,
      recBox, cols,
      h('h3.sub-h', 'Winner per criterion'), criteriaTable(res), rulesBox(res)].filter(Boolean));
    paintRec();
    resultBox.classList.toggle('is-stale', cs.stale);
  }

  const el = h('div.screen.compare',
    h('header.page-head', h('p.eyebrow', 'Compare flows'), h('h1', { tabindex: '-1' }, 'I, U or L: which flow suits your building?'),
      h('p.lead', 'Set the building, the flows and the docks once. The model runs three flow formats on the same inputs: I (IN and OUT on opposite walls), U (both on one wall) and L (adjacent walls). '
        + 'You see the winner of every criterion, and a recommendation for the priority you pick. Numbers come from our parametric model, not from a vendor quote.')),
    panel, resultBox,
    h('div.lay-foot', h('button.btn.ghost', { type: 'button', onclick: () => go('/choose') }, icon('back', 'sm'), 'Back to the start')));
  paintResult();
  markStale();
  riseIn([...el.querySelectorAll('header.page-head, .cmp-panel, .cmp-result')], { stagger: 50 });
  return { el, destroy() { if (running) { clearInterval(running.timer); running = null; } } };
}
