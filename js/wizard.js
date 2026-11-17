// Input flows. Both are stepper wizards whose fields come from schema() (fixed.fields, optimal.goals / goal_fields / constraints).
// Only the grouping of fields into steps and the wording of the step introductions live here (presentation).
import { h, icon, fmtNum, riseIn, announce, $ } from './ui.js';
import { state, save, defaultRaw } from './store.js';
import { go } from './nav.js';
import { createPlanPreview } from './preview.js';
import { renderField, renderPlan, check, choiceLabel, WALLS, asPercent, PCT_KEYS } from './fields.js';

// ---------------------------------------------------------------- step definitions
const STEP_META = {
  building: { title: 'Building', lead: 'Length, width and clear height. This is all the model needs; everything after this step is optional.' },
  areas: { title: 'Shape and areas', lead: 'Footprint shape, tier limit, fire strategy and the share of floor kept for operations and for growth.', auto: 'Rectangle, 15 % operations, 15 % expansion reserve, areas inside, in-rack sprinklers, tiers from the height and the fire rule.' },
  // R26d V11 (team decision 2026-11-17): the 'Bays' and 'Lifts' steps are one step, 'Docks and lifts' (old: 8 steps with Review; now 7). The step id stays 'bays' (routes, saved state, review links).
  bays: { title: 'Docks and lifts', lead: 'Where the goods-in (IN) and goods-out (OUT) docks sit and where the lifts stand. Tap a wall on the plan to fix a dock; every lift carries a shuttle and the model decides how many.', auto: 'The model picks the dock case (U, I, L, 2+2, 1+2) with the best IN / OUT path that still holds the capacity, and searches aisle-head lifts (one or two ends), inner stations and cross-aisle lifts, and says why the winner wins.' },
  racks: { title: 'Racks', lead: 'Lane depth, aisle direction and ABC slotting of the pallet positions.' },
  flows: { title: 'Flows and service', lead: 'IN and OUT flows with their hours, the capacity target and the truck-bay service level.' },
  advanced: { title: 'Advanced', lead: 'Lift mode, fleet policy and model assumptions that normally stay at their defaults.' },
};
// FIX (R9b): the 'growth' step (scaling the brief flows by a factor) is gone with flow_scale; its place is the 'flows' step (absolute IN / OUT flows, hours, 'maximum'). Old cause: group 'options' was
// mapped to a step that scaled flows; the new schema has no multiplier (D7). Growth is a separate screen on the results page.
const GROUP_STEP = { building: 'building', docks: 'bays', rack: 'racks', options: 'flows', advanced: 'advanced', growth: 'flows' };
const KEY_STEP = {
  L: 'building', W: 'building', H: 'building',
  shape: 'areas', tiers_max: 'areas', area_placement: 'areas', mezzanine: 'areas', ops_share: 'areas', reserve_share: 'areas', fire_strategy: 'areas',
  in_wall: 'bays', in_pos: 'bays', out_wall: 'bays', out_pos: 'bays', dock_case: 'bays',
  depth: 'racks', orient: 'racks', abc: 'racks', abc_skew: 'racks',        // FIX (R13b): abc_skew, t_board, h_vendor_max, f_io_lim were missing here (R12 inputs)
  h_vendor_max: 'areas', f_io_lim: 'flows', t_board: 'advanced',
  lift_positions: 'bays', lift_kinds: 'bays', lift_k: 'bays', grid_k: 'bays',     // R26d V11: lifts share the docks step
  in_h: 'flows', out_h: 'flows', in_hours: 'flows', out_hours: 'flows', cap_target: 'flows', cap_sl: 'flows', stock_cv: 'advanced', push_to_max: 'flows', level_of_service: 'flows', case: 'flows',
  lift_mode: 'advanced', fleet_policy: 'advanced', front_turns: 'advanced', front_channel: 'advanced', roof: 'advanced',
};
const STEP_ORDER = ['building', 'areas', 'bays', 'racks', 'flows', 'advanced'];
const GOAL_LABEL = { pallets: 'Pallets', positions: 'Positions', capex_eur: 'CAPEX', annual_eur: 'Annual cost' };
// FIX (R18e, A9-8): 'shape' (any / rect / L / U / T) is a primary Optimal limit and the older allow_shapes switch is hidden (shape = rect says the same). Old cause: the Optimal wizard offered only the allow_shapes on / off switch, so L / U / T could not be asked for.
const PRIMARY_CONSTRAINTS = ['h_max', 'max_aspect', 'depths', 'shape'];
const OPT_HIDDEN = new Set(['allow_shapes']);
const OPT_SHAPE_HELP = 'any = the search compares rectangles with L, U and T footprints of the same floor area and takes the cheapest; rect = rectangles only; L, U or T = that footprint only (the best rectangle stays in the comparison). Footprints are screened at the same floor area; the winner is priced by the real annual cost.';
// FIX (R9a): the chain-conveyor lift is no user option any more (team #24, spec section 0.3: every lift is a shuttle-carrying lift). Old cause: lift_type was a wizard field
// (stale schema snapshot still offers 'chain'); the model keeps its legacy chain lift only as a labelled comparison row.
const HIDDEN_KEYS = new Set(['lift_type', 'shape_params']);       // shape_params has its own editor (areas step)
const DOCK_KEYS = ['in_wall', 'in_pos', 'out_wall', 'out_pos'];
const DOCKS = { in_wall: 'in_wall', in_pos: 'in_pos', out_wall: 'out_wall', out_pos: 'out_pos' };

export function fixedSteps() {
  const sc = state.schema.fixed;
  const by = {};
  for (const f of sc.fields) {
    if (HIDDEN_KEYS.has(f.key)) continue;
    const id = KEY_STEP[f.key] || 'advanced';
    (by[id] ||= []).push(asPercent(f));
  }
  const steps = STEP_ORDER.filter((id) => by[id]).map((id) => ({ id, ...(STEP_META[id] || { title: id }), optional: id !== 'building', fields: by[id] }));
  steps.push({ id: 'review', title: 'Review', lead: 'Check the inputs, then run the model.', optional: false, fields: [] });
  return steps;
}
export function optimalSteps() {
  const o = state.schema.optimal;
  return [
    { id: 'goal', title: 'Goal', lead: 'What should the design achieve?', optional: false, fields: o.goal_fields },
    { id: 'constraints', title: 'Limits', lead: 'Optional limits for the search: height, shape, lane depths, dock walls.', optional: true, fields: o.constraints.filter((f) => !HIDDEN_KEYS.has(f.key) && !OPT_HIDDEN.has(f.key)).map(asPercent) },
    { id: 'review', title: 'Review', lead: 'Check the goal, then run the search.', optional: false, fields: [] },
  ];
}
export const stepsFor = (mode) => (mode === 'fixed' ? fixedSteps() : optimalSteps());
export const stepOrder = (mode, id) => { const i = stepsFor(mode).findIndex((s) => s.id === id); return 2 + Math.max(0, i); };

// ---------------------------------------------------------------- state access
const S = (mode) => state[mode];
function ctxFor(mode, fields, onChange) {
  const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
  const st = S(mode);
  return {
    get: (k) => (k in st.vals ? st.vals[k] : defaultRaw(byKey[k] || {})),
    set: (k, v) => { st.vals[k] = v; save(); },
    changed: (k) => onChange && onChange(k),
  };
}
const fieldByKey = (fields, k) => fields.find((f) => f.key === k);

// ---------------------------------------------------------------- payloads (inputs for model.fixed / model.optimal)
function valueOf(f, raw) {
  const r = check(f, raw);
  if (!r.ok) return undefined;
  if (f.type === 'number') return r.value == null ? undefined : (f.pct ? Math.round(r.value * 10) / 1000 : r.value);        // percent shown, share sent
  if (f.type === 'text') return raw == null || String(raw).trim() === '' ? undefined : String(raw).trim();
  if (f.type === 'choice') return raw === 'auto' || raw === '' || raw == null ? undefined : String(raw);
  return raw;
}
export function fixedIssues() {
  const issues = [];
  const st = state.fixed;
  for (const s of fixedSteps()) {
    if (s.id === 'review') continue;
    if (s.optional && !st.manual[s.id]) continue;
    const ctx = ctxFor('fixed', s.fields);
    for (const f of s.fields) if ((f.type === 'number' || f.type === 'multi') && !check(f, ctx.get(f.key)).ok) issues.push({ step: s.id, title: s.title, f });
  }
  return issues;
}
export function buildFixedPayload() {
  const st = state.fixed;
  const p = {};
  for (const s of fixedSteps()) {
    if (s.id === 'review' || (s.optional && !st.manual[s.id])) continue;
    const ctx = ctxFor('fixed', s.fields);
    for (const f of s.fields) {
      if (s.id === 'bays' && DOCK_KEYS.includes(f.key)) { p[f.key] = f.type === 'number' ? Number(String(ctx.get(f.key)).replace(',', '.')) : ctx.get(f.key); continue; }
      const v = s.id === 'building' ? (f.type === 'number' ? check(f, ctx.get(f.key)).value : ctx.get(f.key)) : valueOf(f, ctx.get(f.key));
      if (v !== undefined) p[f.key] = f.key === 'n_lifts' ? Number(v) : v;
    }
  }
  // shape parameters come from the shape editor (areas step); only sent with the shape they belong to
  if (st.manual.areas && p.shape && p.shape !== 'rect') { const sp = shapeParams(st.vals); if (sp) p.shape_params = JSON.stringify(sp); }
  return p;
}
/** R17b: put a full set of fixed() inputs (a design's inputs plus a diagnosis patch) into the Fixed wizard, so "Edit inputs" shows what was applied.
 *  Steps that hold a changed key are marked "I'll set this"; the run itself uses the inputs as they are (the caller builds the job payload). */
export function loadFixedInputs(inputs) {
  const st = { vals: {}, manual: {} };
  const byKey = Object.fromEntries(state.schema.fixed.fields.map((f) => [f.key, f]));
  for (const [k, v] of Object.entries(inputs || {})) {
    const f = byKey[k];
    if (!f || v == null || HIDDEN_KEYS.has(k) && k !== 'shape_params') continue;
    const step = KEY_STEP[k] || 'advanced';
    if (f.type === 'number') st.vals[k] = String(PCT_KEYS.has(k) ? Math.round(Number(v) * 1000) / 10 : v);
    else if (f.type === 'bool') st.vals[k] = !!v;
    else if (f.type === 'multi') st.vals[k] = Array.isArray(v) ? v.map(String) : [String(v)];
    else st.vals[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (step !== 'building') st.manual[step] = true;
  }
  state.fixed = st;
  save();
}
export function optimalIssues() {
  const o = state.optimal, issues = [];
  const gf = goalField();
  if (!check(gf, o.vals[gf.key] ?? defaultRaw(gf)).ok) issues.push({ step: 'goal', title: 'Goal', f: gf });
  if (o.manual.constraints) {
    const fields = constraintFields();
    const ctx = ctxFor('optimal', fields);
    for (const f of fields) if ((f.type === 'number' || f.type === 'multi') && !check(f, ctx.get(f.key)).ok) issues.push({ step: 'constraints', title: 'Limits', f });
  }
  return issues;
}
export function buildOptimalPayload() {
  const o = state.optimal;
  const gf = goalField();
  const p = { type: o.goalType };
  p[gf.key] = check(gf, o.vals[gf.key] ?? defaultRaw(gf)).value;
  if (o.manual.constraints) {
    const fields = constraintFields();
    const ctx = ctxFor('optimal', fields);
    for (const f of fields) {
      if (f.key === 'objective' && o.goalType === 'budget') continue;
      let v;
      if (f.type === 'number') { v = check(f, ctx.get(f.key)).value; if (f.pct && v != null) v = Math.round(v * 10) / 1000; }
      else v = ctx.get(f.key);
      if (f.key === 'dock_case' && v === 'auto') continue;
      if (v != null && v !== '') p[f.key] = v;
    }
    if (o.docks) {
      for (const k of DOCK_KEYS) { const f = fieldByKey(state.schema.optimal.constraints, k); const raw = ctx.get(k); const val = raw === '' || raw == null ? (f.type === 'number' ? 0.5 : 'W') : raw; p[k] = f.type === 'number' ? Number(val) : val; }
    }
  }
  return p;
}
function goalOptions() {
  const g = state.schema.optimal.goals.find((x) => x.type === state.optimal.goalType) || state.schema.optimal.goals[0];
  return g.required[0].split('|');
}
function goalField() {
  const o = state.optimal;
  const keys = goalOptions();
  const key = keys.includes(o.goalKey[o.goalType]) ? o.goalKey[o.goalType] : keys[0];
  const base = state.schema.optimal.goal_fields.find((f) => f.key === key);
  return { ...base, required: true, label: base.label };
}
function constraintFields() {
  const cs = state.schema.optimal.constraints.filter((f) => !DOCK_KEYS.includes(f.key) && !HIDDEN_KEYS.has(f.key) && !OPT_HIDDEN.has(f.key)).map(asPercent).map((f) => (f.key === 'shape' ? { ...f, help: OPT_SHAPE_HELP } : f));
  return cs;
}

// ---------------------------------------------------------------- descriptions for the review step
function describe(f, raw) {
  if (f.type === 'number') { const r = check(f, raw); return r.value == null ? 'Model chooses' : `${fmtNum(r.value, 2).replace(/\.?0+$/, '')}${f.unit && f.unit !== '0..1' ? ' ' + f.unit : ''}`; }
  if (f.type === 'bool') return raw ? 'On' : 'Off';
  if (f.type === 'multi') return (raw || []).map((c) => choiceLabel(f.key, c)).join(', ') || 'None';
  return choiceLabel(f.key, raw ?? f.default);
}

// ---------------------------------------------------------------- the "fixed by the brief" side note
function briefNote() {
  const fl = state.schema.flows;
  const row = (a, b) => h('div.kv', h('dt', a), h('dd.num', b));
  const el = h('details.aside',
    h('summary', icon('info', 'sm'), 'Fixed by the brief'),
    h('dl',
      row('Flow IN', `${fl.in_per_h} pallets/h`), row('Flow OUT', `${fl.out_per_h} pallets/h`),
      row('Unit load', '850 × 1,250 × 1,700 mm, 1,000 kg'),
      row('Shuttle', '1.4 m/s, 0.5 m/s², 4 s turn, 25 s load / unload, 1,000 kg'),
      row('Lift', '1 m/s, 0.7 m/s², 1 s positioning'),
      row('Transfer', '25 s shuttle hand-over; 7 s at a conveyor'),
    ),
    h('p.cap', 'Source: APW brief, slides 11 and 12. The model keeps these constant.'));
  return el;
}

// ---------------------------------------------------------------- optional-step wrapper: "Let the model choose" / "I'll set this"
function optionalBlock(mode, step, buildInner, hint) {
  const st = state[mode];
  const inner = h('div.opt-inner');
  const reveal = h('div.reveal', h('div', inner));
  const hintEl = h('p.opt-hint.muted', hint);
  const seg = h('div.seg.block', { role: 'radiogroup', 'aria-label': `${step.title}: who decides` });
  const auto = h('button', { type: 'button', role: 'radio', onclick: () => set(false) }, 'Let the model choose');
  const manual = h('button', { type: 'button', role: 'radio', onclick: () => set(true) }, 'I’ll set this');
  seg.append(auto, manual);
  let built = null;
  function set(on, silent) {
    st.manual[step.id] = on; save();
    if (on && !built) { built = buildInner(); inner.append(built.el); }
    reveal.classList.toggle('open', on);
    reveal.toggleAttribute('inert', !on);
    hintEl.hidden = on;
    auto.setAttribute('aria-checked', !on); manual.setAttribute('aria-checked', on);
    auto.tabIndex = on ? -1 : 0; manual.tabIndex = on ? 0 : -1;
    if (!silent) updateNav();
  }
  seg.addEventListener('keydown', (e) => { if (/^Arrow/.test(e.key)) { e.preventDefault(); const on = !st.manual[step.id]; set(on); (on ? manual : auto).focus(); } });
  let updateNav = () => {};
  const el = h('div.opt', seg, hintEl, reveal);
  set(!!st.manual[step.id], true);
  return {
    el, setNav: (fn) => { updateNav = fn; },
    markManual: () => { if (!st.manual[step.id]) set(true); },
    validate: (show) => (!st.manual[step.id] ? true : built.validate(show)),
  };
}

// ---------------------------------------------------------------- step bodies
function fieldsBlock(mode, fields, onChange, opts = {}) {
  const ctx = ctxFor('fixed' === mode ? 'fixed' : 'optimal', fields, onChange);
  const rendered = fields.map((f) => renderField(f, ctx, opts));
  return {
    el: h('div.fields', rendered.map((r) => r.el)),
    ctx, rendered,
    validate: (show) => { let ok = true; for (const r of rendered) if (!r.validate(show) && ok) { ok = false; r.focus(); } return ok; },
  };
}

function buildingBody(step, nav) {
  const ctx = ctxFor('fixed', step.fields, () => { plan.redraw(); nav(); });
  const rendered = step.fields.map((f) => renderField(f, ctx));
  const dims = () => {
    const n = (k) => { const f = fieldByKey(step.fields, k); const r = check(f, ctx.get(k)); return r.ok ? r.value : f.default; };
    return { L: n('L'), W: n('W') };
  };
  const plan = renderPlan({ dims, keys: null, interactive: false });
  const grid = h('div.fields', rendered.slice(0, 3).map((r) => r.el));
  return {
    el: h('div', grid, h('div.plan-card', plan.el)),
    validate: (show) => { let ok = true; for (const r of rendered) if (!r.validate(show) && ok) { ok = false; r.focus(); } return ok; },
  };
}

// ---------------------------------------------------------------- shape editor (areas step): rect / L / U / T and their parameters
const SHAPE_DEF = {
  L: { help: 'L-shaped footprint inside the length × width box. a = thickness of the long leg (m, along the width), b = thickness of the short leg (m, along the length); the empty corner is the notch.',
    nums: [{ key: 'a', label: 'Long leg thickness a', unit: 'm' }, { key: 'b', label: 'Short leg thickness b', unit: 'm' }], pick: { key: 'notch', label: 'Empty corner', choices: ['NE', 'NW', 'SE', 'SW'], def: 'NE' } },
  U: { help: 'U-shaped footprint: a notch cut into one side. nw = notch width, nd = notch depth (m); the open side is where the notch faces.',
    nums: [{ key: 'nw', label: 'Notch width nw', unit: 'm' }, { key: 'nd', label: 'Notch depth nd', unit: 'm' }], pick: { key: 'side', label: 'Open side', choices: ['N', 'S', 'E', 'W'], def: 'N' } },
  T: { help: 'T-shaped footprint: a bar along one side and a stem. bar = bar thickness, stem = stem width (m); the bar side is where the bar lies.',
    nums: [{ key: 'bar', label: 'Bar thickness', unit: 'm' }, { key: 'stem', label: 'Stem width', unit: 'm' }], pick: { key: 'side', label: 'Bar side', choices: ['N', 'S', 'E', 'W'], def: 'N' } },
};
export function shapeParams(vals) {
  try { const o = JSON.parse(vals.shape_params || 'null'); return o && typeof o === 'object' ? o : null; } catch (e) { return null; }
}
function shapeEditor(shapeField, ctx, nav) {
  const holder = h('div.shape-params');
  const sketch = h('div.shape-sketch', { 'aria-hidden': 'true' });
  const shape = () => String(ctx.get('shape') || 'rect');
  const raw = () => shapeParams(state.fixed.vals) || {};
  const setP = (k, v) => {
    const o = raw();
    if (v === '' || v == null) delete o[k]; else o[k] = v;
    state.fixed.vals.shape_params = Object.keys(o).length ? JSON.stringify(o) : '';
    save(); drawSketch(); nav();
  };
  function drawSketch() {
    const sh = shape(); sketch.replaceChildren();
    if (sh === 'rect') return;
    const NS = 'http://www.w3.org/2000/svg', mk = (t, a) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };
    const num = (k, d) => { const n = Number(String(state.fixed.vals[k] ?? d).replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : d; };
    const Lm = num('L', 45), Wm = num('W', 30);
    const sc = Math.min(200 / Lm, 110 / Wm), w = Lm * sc, hh = Wm * sc, P = raw(), side = P.side || 'N';
    const svg = mk('svg', { viewBox: '0 0 220 130', class: 'shape-svg', role: 'img', 'aria-label': `${sh} footprint sketch` });
    svg.append(mk('rect', { x: 10, y: 10, width: w, height: hh, class: 'bbox' }));
    const cut = (x, y, ww, hw) => svg.append(mk('rect', { x: 10 + x, y: 10 + y, width: Math.max(0, ww), height: Math.max(0, hw), class: 'cut' }));
    const clamp = (v, d, m) => Math.min(Math.max(Number(v ?? d), 1), m);
    if (sh === 'L') {
      const a = clamp(P.a, Wm / 2, Wm - 1) * sc, b = clamp(P.b, Lm / 2, Lm - 1) * sc, n = P.notch || 'NE';
      cut(n.includes('E') ? b : 0, n.includes('N') ? 0 : a, w - b, hh - a);
    } else if (sh === 'U') {
      const X = side === 'N' || side === 'S' ? Lm : Wm, Y = side === 'N' || side === 'S' ? Wm : Lm;
      const nw = clamp(P.nw, X / 3, X - 2), nd = clamp(P.nd, Y / 2, Y - 1), off = (X - nw) / 2;
      const r = side === 'N' ? [off, 0, nw, nd] : side === 'S' ? [off, Y - nd, nw, nd] : side === 'E' ? [Y - nd, off, nd, nw] : [0, off, nd, nw];
      cut(r[0] * sc, r[1] * sc, r[2] * sc, r[3] * sc);
    } else if (sh === 'T') {
      const X = side === 'N' || side === 'S' ? Lm : Wm, Y = side === 'N' || side === 'S' ? Wm : Lm;
      const bar = clamp(P.bar, Y / 3, Y - 1), stem = clamp(P.stem, X / 3, X - 1), off = (X - stem) / 2;
      const rs = side === 'N' ? [[0, 0, off, Y - bar], [off + stem, 0, X - off - stem, Y - bar]] : side === 'S' ? [[0, bar, off, Y - bar], [off + stem, bar, X - off - stem, Y - bar]]
        : side === 'E' ? [[0, 0, Y - bar, off], [0, off + stem, Y - bar, X - off - stem]] : [[bar, 0, Y - bar, off], [bar, off + stem, Y - bar, X - off - stem]];
      rs.forEach((r) => cut(r[0] * sc, r[1] * sc, r[2] * sc, r[3] * sc));
    }
    sketch.append(svg);
  }
  function paint() {
    holder.replaceChildren(); const sh = shape();
    if (sh === 'rect') { sketch.replaceChildren(); return; }
    const def = SHAPE_DEF[sh];
    const fields = def.nums.map((n) => ({ key: n.key, label: n.label, unit: n.unit, type: 'number', default: null, required: false, help: 'Empty = the model default (two aisle modules per leg).', min: 3, max: 120, step: 0.5 }));
    const c = { get: (k) => (raw()[k] ?? ''), set: (k, v) => { const n = Number(String(v).replace(',', '.')); setP(k, v === '' ? '' : Number.isFinite(n) ? n : ''); }, changed: () => {} };
    const pickF = { key: 'shape_' + def.pick.key, label: def.pick.label, type: 'choice', default: def.pick.def, choices: def.pick.choices, help: '' };
    const pc = { get: () => raw()[def.pick.key] || def.pick.def, set: (k, v) => setP(def.pick.key, v), changed: () => {} };
    holder.append(h('p.msg', def.help), h('div.fields', fields.map((f) => renderField(f, c).el)), h('div.fields.one', renderField(pickF, pc).el));
    drawSketch();
  }
  const sf = renderField(shapeField, { get: ctx.get, set: ctx.set, changed: () => { paint(); nav(); } });
  paint();
  return { el: h('div.shape-ed', sf.el, h('div.shape-body', holder, sketch)), refresh: () => { sf.refresh(); paint(); } };
}

function areasBody(step, nav, markManual) {
  const shapeField = step.fields.find((f) => f.key === 'shape');
  const rest = step.fields.filter((f) => f.key !== 'shape');
  const fb = fieldsBlock('fixed', rest, () => { markManual(); nav(); });
  const ctx = ctxFor('fixed', step.fields, () => { markManual(); nav(); });
  const ed = shapeField ? shapeEditor(shapeField, ctx, () => { markManual(); nav(); }) : null;
  return { el: h('div', ed && ed.el, fb.el), validate: (show) => fb.validate(show) };
}

function baysBody(mode, fields, nav, onAny) {
  const keys = DOCKS;
  const ctx = ctxFor(mode, fields, () => { plan.redraw(); rendered.forEach((r) => r.refresh()); onAny && onAny(); nav(); });
  const dimsFrom = () => {
    if (mode !== 'fixed') return { L: 45, W: 30 };               // schematic plan: the search chooses the size
    const f = state.schema.fixed.fields;
    const vals = state.fixed.vals;
    const n = (k) => { const fd = fieldByKey(f, k); const r = check(fd, k in vals ? vals[k] : defaultRaw(fd)); return r.ok ? r.value : fd.default; };
    return { L: n('L'), W: n('W') };
  };
  const rendered = fields.map((f) => renderField(f, ctx));
  const plan = renderPlan({ dims: dimsFrom, schematic: mode !== 'fixed', keys, get: ctx.get, set: ctx.set, changed: () => { rendered.forEach((r) => r.refresh()); onAny && onAny(); nav(); }, interactive: true });
  const inF = rendered.filter((r) => DOCK_KEYS.includes(r.key) && r.key.startsWith('in_')), outF = rendered.filter((r) => DOCK_KEYS.includes(r.key) && r.key.startsWith('out_'));
  const otherF = rendered.filter((r) => !DOCK_KEYS.includes(r.key));
  return {
    el: h('div', plan.el, h('div.dock-fields', h('div.fields', inF.map((r) => r.el)), h('div.fields', outF.map((r) => r.el))),
      otherF.length ? h('div.fields.one', otherF.map((r) => r.el)) : null),
    validate: (show) => rendered.map((r) => r.validate(show)).every(Boolean),
  };
}

// ---------------------------------------------------------------- screens
export function mountWizard(mode, stepId) {
  const steps = stepsFor(mode);
  const idx = Math.max(0, steps.findIndex((s) => s.id === stepId));
  const step = steps[idx];
  state.mode = mode;
  const prefix = `/${mode}/`;
  const title = mode === 'fixed' ? 'Fixed warehouse' : 'Optimal warehouse';

  // stepper
  const buildingOk = () => (mode === 'fixed' ? !fixedIssues().some((i) => i.step === 'building') : !optimalIssues().some((i) => i.step === 'goal'));
  const stepper = h('ol.stepper', { 'aria-label': `${title}: steps` }, steps.map((s, i) => {
    const done = i < idx, cur = i === idx;
    const b = h('button.step' + (done ? '.done' : '') + (cur ? '.cur' : ''), { type: 'button', 'aria-current': cur ? 'step' : null, onclick: () => {
      if (i <= idx || buildingOk()) go(prefix + s.id);
    } },
      h('span.dot', done ? icon('check', 'sm') : String(i + 1)), h('span.l', s.title));
    return h('li', { class: 'stepper-li' }, b, i < steps.length - 1 && h('span.bar' + (done ? '.done' : ''), { 'aria-hidden': 'true' }));
  }));

  // body
  let body = null;
  const nextBtn = h('button.btn.primary', { type: 'button' }, 'Next', icon('next', 'sm'));
  const backBtn = h('button.btn', { type: 'button', onclick: () => (idx === 0 ? go('/choose') : go(prefix + steps[idx - 1].id)) }, icon('back', 'sm'), idx === 0 ? 'Choose' : 'Back');
  const issue = h('p.msg.err.nav-msg', { role: 'status', hidden: true });
  const pv = createPlanPreview({ mode, layers: ['building', 'docks', 'racks', 'lifts'], schematic: mode !== 'fixed' });
  const syncNav = () => {
    let ok = true;
    if (step.id === 'review') {
      const iss = mode === 'fixed' ? fixedIssues() : optimalIssues();
      ok = iss.length === 0;
      issue.hidden = ok;
      issue.textContent = ok ? '' : `Fix first: ${iss[0].f.label} (${iss[0].title}).`;
    } else if (step.id === 'building' || step.id === 'goal') {
      ok = buildingOk();
    }
    nextBtn.setAttribute('aria-disabled', !ok);
    pv.update();      // R26d V11: the live plan preview follows every field
  };
  nextBtn.addEventListener('click', () => {
    if (step.id === 'review') {
      const iss = mode === 'fixed' ? fixedIssues() : optimalIssues();
      if (iss.length) { go(prefix + iss[0].step); return; }
      state.job = { mode, payload: mode === 'fixed' ? buildFixedPayload() : buildOptimalPayload(), startedAt: Date.now() };
      save();
      go('/run');
      return;
    }
    if (body && body.validate && !body.validate(true)) { announce('Please correct the highlighted field.'); return; }
    go(prefix + steps[idx + 1].id);
  });
  if (step.id === 'review') { nextBtn.replaceChildren(icon('play', 'sm'), mode === 'fixed' ? 'Run the model' : 'Run the search'); nextBtn.classList.add('lg'); }

  // R26d V11: live plan preview on the right of every step (replaces the constants card, which is now a collapsed "Fixed by the brief" under it)
  const panel = h('section.panel');
  const head = h('header.panel-head', h('p.eyebrow', `Step ${idx + 1} of ${steps.length}`), h('h1', { tabindex: '-1' }, step.title), h('p.lead', step.lead));
  panel.append(head);

  if (mode === 'fixed') {
    if (step.id === 'building') body = buildingBody(step, syncNav);
    else if (step.id === 'review') body = reviewFixed();
    else {
      const make = () => {
        if (step.id === 'bays') return baysBody('fixed', step.fields, syncNav, () => blk.markManual());
        if (step.id === 'areas') return areasBody(step, syncNav, () => blk.markManual());
        const fb = fieldsBlock('fixed', step.fields, () => { blk.markManual(); syncNav(); });
        return fb;
      };
      const hint = step.auto || `The model picks ${step.fields.slice(0, 4).map((f) => f.label.toLowerCase()).join(', ')}${step.fields.length > 4 ? ' and more' : ''} for the best objective (shuttle cycle plus lift time plus wait per move).`;
      var blk = optionalBlock('fixed', step, make, hint);
      blk.setNav(syncNav);
      body = blk;
    }
  } else if (step.id === 'goal') body = goalBody(syncNav);
  else if (step.id === 'constraints') {
    var blk = optionalBlock('optimal', step, () => constraintsBody(syncNav, () => blk.markManual()),
      'Defaults: ' + PRIMARY_CONSTRAINTS.map((k) => fieldByKey(step.fields, k)).filter(Boolean).map((f) => `${f.label.toLowerCase()} ${describe(f, defaultRaw(f))}`).join('; ') + '.');
    blk.setNav(syncNav);
    body = blk;
  } else body = reviewOptimal();
  panel.append(body.el);
  panel.append(issue, h('footer.wz-nav', backBtn, nextBtn));

  const el = h('div.screen.wizard', h('div.wz-top', h('p.eyebrow.mode', icon(mode === 'fixed' ? 'building' : 'target', 'sm'), title), stepper),
    h('div.wz-grid', panel, h('aside.wz-aside', h('div.card.pv-card', h('p.eyebrow', 'Your inputs, as a plan'), pv.el), briefNote())));
  syncNav();
  riseIn([head, body.el, ...el.querySelectorAll('.wz-aside')]);
  return { el };
}

// ---------------------------------------------------------------- optimal: goal and constraints
function goalBody(nav) {
  const o = state.optimal;
  const wrap = h('div.goal');
  function paint() {
    wrap.replaceChildren();
    const goals = state.schema.optimal.goals;
    const types = h('div.goal-cards', { role: 'radiogroup', 'aria-label': 'Goal type' }, goals.map((g) => {
      const on = g.type === o.goalType;
      return h('button.goal-card', { type: 'button', role: 'radio', 'aria-checked': on, tabindex: on ? '0' : '-1', onclick: () => { o.goalType = g.type; save(); paint(); nav(); } },
        h('span.ic', icon(g.type === 'capacity' ? 'cube' : 'euro')), h('strong', g.title), h('span.muted', g.help));
    }));
    types.addEventListener('keydown', (e) => {
      if (!/^Arrow/.test(e.key)) return; e.preventDefault();
      const i = goals.findIndex((g) => g.type === o.goalType); const j = (i + (/Right|Down/.test(e.key) ? 1 : -1) + goals.length) % goals.length;
      o.goalType = goals[j].type; save(); paint(); nav(); wrap.querySelectorAll('.goal-card')[j].focus();
    });
    const keys = goalOptions();
    const unitSeg = keys.length > 1 && h('div.seg', { role: 'radiogroup', 'aria-label': 'Unit of the target' }, keys.map((k) => {
      const on = k === goalField().key;
      return h('button', { type: 'button', role: 'radio', 'aria-checked': on, onclick: () => { o.goalKey[o.goalType] = k; save(); paint(); nav(); } }, GOAL_LABEL[k] || k);
    }));
    const gf = goalField();
    const ctx = ctxFor('optimal', [gf], () => nav());
    const field = renderField(gf, ctx);
    body.validate = (show) => field.validate(show);
    wrap.append(types, h('div.goal-value', unitSeg, h('div.fields.one', field.el)));
  }
  const body = { el: wrap, validate: () => true };
  paint();
  return body;
}

function constraintsBody(nav, markManual) {
  const o = state.optimal;
  const all = constraintFields();
  const prim = PRIMARY_CONSTRAINTS.map((k) => fieldByKey(all, k)).filter(Boolean);
  const more = all.filter((f) => !PRIMARY_CONSTRAINTS.includes(f.key) && !(f.key === 'objective' && o.goalType === 'budget'));
  const a = fieldsBlock('optimal', prim, () => { markManual(); nav(); });
  const b = fieldsBlock('optimal', more, () => { markManual(); nav(); });
  const dockFields = state.schema.optimal.constraints.filter((f) => DOCK_KEYS.includes(f.key));
  // dock constraints default to the example (west wall, mid-length) when the switch is turned on
  const dockCtxFields = dockFields.map((f) => ({ ...f, default: f.type === 'number' ? 0.5 : 'W', choices: f.choices }));
  const dockHolder = h('div');
  const dockSw = h('input.sw-toggle', { type: 'checkbox', role: 'switch', id: 'dock-sw' });
  dockSw.checked = !!o.docks;
  const dockReveal = h('div.reveal' + (o.docks ? '.open' : ''), h('div', dockHolder));
  let dockBody = null;
  const showDocks = () => {
    if (o.docks && !dockBody) { dockBody = baysBody('optimal', dockCtxFields, nav, markManual); dockHolder.append(dockBody.el); }
    dockReveal.classList.toggle('open', o.docks); dockReveal.toggleAttribute('inert', !o.docks);
  };
  dockSw.addEventListener('change', () => { o.docks = dockSw.checked; save(); markManual(); showDocks(); nav(); });
  showDocks();
  const moreDet = h('details.more', h('summary', 'More limits'), b.el);
  return {
    el: h('div', a.el, h('div.dock-limit', h('label.switch-row', { for: 'dock-sw' }, dockSw, h('span', 'Fix the dock walls')), h('p.msg', 'With docks given the search also tries both aisle directions.'), dockReveal), moreDet),
    validate: (show) => { const r1 = a.validate(show), r2 = b.validate(show); if (!r2) moreDet.open = true; return r1 && r2; },
  };
}

// ---------------------------------------------------------------- review
function row(label, value, toStep, mode) {
  return h('div.rev-row', h('dt', label), h('dd', value), toStep && h('button.btn.ghost', { type: 'button', 'aria-label': `Edit ${label}`, onclick: () => go(`/${mode}/${toStep}`) }, icon('edit', 'sm'), 'Edit'));
}
function reviewFixed() {
  const st = state.fixed;
  const list = h('dl.review');
  const p = buildFixedPayload();
  for (const s of fixedSteps()) {
    if (s.id === 'review') continue;
    if (s.id === 'building') { list.append(row('Building', `${p.L} × ${p.W} × ${p.H} m`, 'building', 'fixed')); continue; }
    if (!st.manual[s.id]) { list.append(row(s.title, h('span.muted', 'Model chooses'), s.id, 'fixed')); continue; }
    const ctx = ctxFor('fixed', s.fields);
    const txt = s.id === 'bays'
      ? [`IN: ${WALLS[ctx.get('in_wall')]} wall at ${ctx.get('in_pos')}; OUT: ${WALLS[ctx.get('out_wall')]} wall at ${ctx.get('out_pos')}`].concat(s.fields.filter((f) => !DOCK_KEYS.includes(f.key)).map((f) => `${f.label}: ${describe(f, ctx.get(f.key))}`)).join(' · ')
      : s.fields.map((f) => `${f.label}: ${describe(f, ctx.get(f.key))}`).join(' · ');
    list.append(row(s.title, txt, s.id, 'fixed'));
  }
  return { el: h('div', h('div.card.review-card', list)), validate: () => true };
}
function reviewOptimal() {
  const o = state.optimal;
  const gf = goalField();
  const list = h('dl.review');
  const g = state.schema.optimal.goals.find((x) => x.type === o.goalType);
  list.append(row('Goal', `${g.title}: ${describe(gf, o.vals[gf.key] ?? defaultRaw(gf))}`, 'goal', 'optimal'));
  if (!o.manual.constraints) list.append(row('Limits', h('span.muted', 'Defaults'), 'constraints', 'optimal'));
  else {
    const p = buildOptimalPayload();
    const fields = constraintFields();
    const txt = fields.filter((f) => p[f.key] != null).map((f) => `${f.label}: ${describe(f, p[f.key])}`).join(' · ');
    list.append(row('Limits', txt + (o.docks ? ` · IN ${WALLS[p.in_wall]} ${p.in_pos}, OUT ${WALLS[p.out_wall]} ${p.out_pos}` : ''), 'constraints', 'optimal'));
  }
  return { el: h('div', h('div.card.review-card', list), h('p.cap.review-note', 'Search time is a few seconds. Capacity: the cheapest design that holds the target. Budget: the design with the most positions within it.')), validate: () => true };
}
