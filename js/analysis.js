// Design analysis (R9b): the result screens that sit under the headline numbers. One tab strip, one panel at a time, every figure from the report or from a model call.
//   Fleet and lifts · Areas · Capacity and flow (max flow, push-to-max, docks and bays) · Staff and rules · Shapes · Team cases 1-4 · Service level · 7 vs 8 tiers · Growth · Contingency
// Tables that need extra model runs (team cases, service-level sweep, tiers) are loaded on first use with one worker call (`model.extras`) and cached per design.
// Nothing is computed here except formatting and the linear contingency scaling, which is labelled approximate on screen.
import { h, icon, fmtNum, fmtPct, eur, toast, announce, reducedMotion, dockCaseLabel, assumeBadge } from './ui.js';
import { state } from './store.js';
import { model } from './model.js';
import { hbars } from './story/charts.js';
import { ioStrip, areaBar, dockPlan, tierGauge } from './lead.js';

const num = (x, d = 0) => fmtNum(x, d);
const dim = (x) => fmtNum(x, 1).replace(/\.0$/, '');
const pct = (x, d) => (x == null ? 'n/a' : `${fmtPct(x * 100, d)} %`);
const MINUS = '−';
const eurS = (x) => (x == null ? 'n/a' : x < 0 ? `${MINUS}€ ${fmtNum(-x, 0)}` : eur(x));
// FIX (R21b): the sign follows the rounded value. Old cause: -0.3 moves/h printed "−0" in the growth table.
const signed = (x, d = 0, unit = '') => { if (x == null) return 'n/a'; const r = Math.round(Math.abs(x) * 10 ** d) / 10 ** d; return `${r > 0 ? (x > 0 ? '+' : MINUS) : ''}${fmtNum(Math.abs(x), d)}${unit ? ' ' + unit : ''}`; };
const DOCK_CASE = { U: 'U: both docks on one wall', I: 'I: docks on opposite walls', L: 'L: docks on adjacent walls', '2+2': '2+2: IN and OUT docks on two opposite walls', '1+2': '1+2: one IN dock, two OUT docks' };
const SHAPE_NAME = { rect: 'Rectangle', L: 'L-shape', U: 'U-shape', T: 'T-shape' };

// ---------------------------------------------------------------- inputs of the current design for follow-up model calls
const KEEP = ['t_board', 'abc_skew', 'h_vendor_max', 'f_io_lim', 'in_h', 'out_h', 'in_hours', 'out_hours', 'ops_share', 'reserve_share', 'area_placement', 'mezzanine', 'fire_strategy', 'level_of_service', 'case', 'abc', 'lift_mode', 'fleet_policy', 'tiers_max', 'front_turns', 'front_channel', 'roof'];
/** Fixed-warehouse inputs that rebuild the design shown (Fixed: the user's inputs; Optimal: the found building and rack plus the user's flows and options). */
export function designInputs(R, rep) {
  const d = (rep && rep.design) || {};
  if (R.mode === 'fixed' && (!state.view || state.view.index === 0)) return { ...R.payload };
  const p = { L: d.L, W: d.W, H: d.H };
  if (d.orient) p.orient = d.orient;
  if (d.depth) p.depth = String(d.depth); else if (d.modules && d.modules.length) p.depth = 'mixed';
  if (d.shape && d.shape !== 'rect') { p.shape = d.shape; if (d.shape_p) p.shape_params = JSON.stringify(d.shape_p); }
  if (d.dock_case) p.dock_case = d.dock_case;
  const src = R.payload || {};
  for (const k of KEEP) if (src[k] != null) p[k] = src[k];
  for (const k of ['in_h', 'out_h', 'in_hours', 'out_hours', 'ops_share', 'reserve_share', 'area_placement', 'fire_strategy', 'level_of_service']) if (p[k] == null && d[k] != null) p[k] = d[k];
  p.cap_target = src.cap_target != null ? src.cap_target : src.pallets != null ? src.pallets : d.cap_target;
  if (p.cap_target == null) delete p.cap_target;
  return p;
}

// ---------------------------------------------------------------- small builders
function table(cols, rows, { caption, rowClass } = {}) {
  return h('div.tbl-wrap', h('table.tbl', caption && h('caption.sr-only', caption),
    h('thead', h('tr', cols.map((c) => h('th', { scope: 'col', class: c.num ? 'num' : null }, c.label)))),
    h('tbody', rows.map((r) => h('tr', { class: rowClass ? rowClass(r) : null }, cols.map((c, i) => {
      const v = c.get ? c.get(r) : r[c.k];
      return i === 0 ? h('th', { scope: 'row' }, v) : h('td', { class: c.num ? 'num' : null }, v == null || v === '' ? '–' : v);
    }))))));
}
const kvs = (rows) => h('dl.kvs', rows.filter(Boolean).map(([l, v, note]) => h('div.kv', h('dt', l, note && assumeBadge(note)), h('dd.num', v))));
const note = (t) => h('p.cap.an-note', t);
// R26d V8: long "Why" paragraphs fold under their label (old: open prose under every card)
const reason = (label, text) => (text ? h('details.an-why-d', h('summary', label.replace(/:$/, '')), h('p.an-why', text)) : null);
// FIX (R17b): a missed target is shown in the calm warning tone. Old cause: chip.bad (alarm red) for every "no".
const okChip = (ok, yes, no) => h('span.chip.' + (ok ? 'ok' : 'warn'), icon(ok ? 'check' : 'info', 'sm'), ok ? yes : no);
const busy = (text) => h('div.an-busy', { role: 'status' }, h('span.dot'), text);
// FIX (R17b): raw exception text only inside a collapsed "Technical details". Old cause: the exception message was the whole panel.
const fail = (e) => h('div.card.an-err', { role: 'status' }, icon('info', 'sm'), h('div', h('span', 'This analysis could not be computed for this design. The rest of the page is not affected.'),
  h('details.dg-tech', h('summary', 'Technical details'), h('p', String((e && e.message) || e)))));

// ---------------------------------------------------------------- panels
function pFleet(c) {
  const f = c.rep.fleet || {}, hd = c.rep.headline || {};
  if (!c.rep.fleet) return h('p.muted', 'No fleet block for this design.');
  return h('div.an-grid',
    h('section.card.an-card', h('h3', 'Shuttles'),
      kvs([['Shuttles (pooled fleet)', num(f.N), null], ['Fleet policy', f.policy === 'pool' ? 'Pool: any shuttle serves any tier' : f.policy === 'captive' ? 'Captive: shuttles tied to tiers' : String(f.policy), null],
        // FIX (R18e): the plan utilisation limit is derived by the model (u plan 0.70 here, in policy_reason), not a fixed 60 %. Old cause: the 60 % text predates R12 (u_plan derived from Wq <= 0.10 E[S], cap 0.70).
        ['Shuttle utilisation', pct(f.u), 'The plan utilisation limit is derived from the shuttle wait (see the policy reason); the 80 % hard limit is an assumption.'], ['Tier-captive fleet, for comparison', num(f.captive_N), null],
        ['Wait for a shuttle (approximate)', f.shuttle_wait_s != null ? `${num(f.shuttle_wait_s, 0)} s` : null, 'Waits are approximate (about ±15 %).'],
        ['Block transfers seen in the 3D animation', (() => { const t = globalThis.APW && globalThis.APW.scene && globalThis.APW.scene.transfers; const n = Array.isArray(t) ? t.length : typeof t === 'number' ? t : null; return n == null ? null : num(n); })(), 'Observed in the running animation, not a model figure.'],
        ['Working at the plan flow', (f.active_shuttles ?? kpiVal(c.rep, 'fleet.pool.active_shuttles')) != null ? `${num(f.active_shuttles ?? kpiVal(c.rep, 'fleet.pool.active_shuttles'))} (${num(Math.max(0, f.N - (f.active_shuttles ?? kpiVal(c.rep, 'fleet.pool.active_shuttles'))))} parked)` : null, null],
        ['Availability with one shuttle down', kpiVal(c.rep, 'fleet.pool.avail_shuttle_n_minus_1') != null ? pct(kpiVal(c.rep, 'fleet.pool.avail_shuttle_n_minus_1'), 2) : null, 'Availability and repair times are assumptions.']]),
      reason('Why this policy:', f.policy_reason)),
    h('section.card.an-card', h('h3', 'Lifts'),
      kvs([['Lifts installed', `${num(f.lifts_installed)} (${num(f.lifts_working)} working, ${num(f.lifts_spare)} spare)`, null], ['Lift mode', f.lift_mode === 'M1' ? 'M1: the shuttle rides the lift' : f.lift_mode === 'M2' ? 'M2: hand-over at the lift' : String(f.lift_mode), null],
        ['Lift utilisation', pct(f.lift_rho), null], ['Lift stations per aisle', num(f.lift_stations), null], ['Wait at a lift (approximate)', f.lift_wait_s != null ? `${num(f.lift_wait_s, 0)} s` : null, 'Waits are approximate (about ±15 %).'],
        ['Sustainable flow', f.max_moves_h != null ? `${num(f.max_moves_h, 0)} moves/h` : null, null],
        ['Station availability with the spare', kpiVal(c.rep, 'fleet.pool.avail_lifts_station') != null ? pct(kpiVal(c.rep, 'fleet.pool.avail_lifts_station'), 2) : null, 'Availability and repair times are assumptions.']]),
      reason('Why this lift mode:', f.lift_mode_reason), reason('Why these lift positions:', f.lift_layout_reason)),
    h('section.card.an-card', h('h3', 'I/O path'), ioPath(c.rep.io_path)),
    note(`Every lift is a shuttle-carrying lift. Waits are labelled approximate; utilisation is the primary figure. Shuttle cycle ${hd.shuttle_cycle_s != null ? num(hd.shuttle_cycle_s, 1) + ' s' : 'n/a'}.`));
}
function ioPath(io) {
  if (!io || !io.IN) return h('p.muted', 'Not available for this design.');
  const one = (k, t) => h('div.an-path', h('h4', `${t}: ${num(io[k].total_with_wait_s ?? io[k].total_s, 0)} s`),
    // FIX (R18e): the stage seconds are read from time_s (the model's stage key). Old cause: s.s does not exist, so no stage showed its seconds.
    h('ol.an-steps', (io[k].stages || []).map((s) => h('li', h('span', s.label), s.time_s != null && h('small.num', `${num(s.time_s, 0)} s`)))));
  return h('div.an-two', one('IN', 'Pallet in'), one('OUT', 'Pallet out'));
}

function pAreas(c) {
  const a = c.rep.areas;
  if (!a) return h('p.muted', 'No areas block for this design.');
  const zones = a.zones || [];
  const sh = a.shares || {}, sm = a.sums || {};
  return h('div.an-stack',
    h('div.row.an-chips', okChip(a.feasible !== false, 'Areas fit', 'Areas do not fit'), h('span.chip', `Floor ${num(a.floor_m2)} m²`), h('span.chip', `Storage ${pct(sh.storage)} of the floor`), h('span.chip', `Reserve ${num(a.reserve_m2)} m² (${pct(sh.reserve_share)})`),
      a.annex && a.annex.m2 ? h('span.chip', `Annex ${num(a.annex.m2)} m², ${eur(a.annex.cost_eur)}`) : null),
    a.verdict_areas || a.verdict ? h('p.an-why', a.verdict_areas || a.verdict) : null,
    table([{ label: 'Area', get: (z) => z.name }, { label: 'Level', get: (z) => z.level }, { label: 'm²', num: true, get: (z) => num(z.m2, 0) }, { label: 'Share of floor', num: true, get: (z) => pct(z.share_of_floor, 1) }, { label: 'Sizing rule', get: (z) => z.rule }],
      zones, { caption: 'Functional areas with their sizing rule' }),
    kvs([['Rule-sized areas, all levels', sm.rule_all_m2 != null ? `${num(sm.rule_all_m2)} m²` : null], ['Operations budget (input)', sm.ops_budget_m2 != null ? `${num(sm.ops_budget_m2)} m²` : null], ['Staff mezzanine', a.mezzanine && a.mezzanine.on ? `${num(a.mezzanine.m2)} m²` : 'No'],
      // FIX (R13c): L / U / T areas carry no walkway.width_m (old text: "undefined m")
      ['Maintenance walkway', a.walkway ? `${a.walkway.width_m != null ? a.walkway.width_m + ' m, ' : 'in the shape blocks, '}${num(a.walkway.positions_lost)} positions lost` : null, 'The 0.8 m service walkway is an assumption.'],
      ['Fire strategy', a.fire ? `${a.fire['fire.strategy'] === 'o2_reduction' ? 'Oxygen reduction 15 vol %' : 'In-rack sprinklers'}, clearance ${a.fire['fire.clearance']} m, ${a.fire['fire.tiers']} tiers${a.fire['fire.tiers_clearance_rule'] != null && a.fire['fire.tiers_clearance_rule'] !== a.fire['fire.tiers'] ? ` (the clearance rule alone would allow ${a.fire['fire.tiers_clearance_rule']})` : a.fire['fire.tiers_clearance_rule'] != null ? ` (the clearance rule alone: ${a.fire['fire.tiers_clearance_rule']})` : ''}` : null, 'Fire clearances are assumptions from the research table.']]),
    a.fire && a.fire['fire.note'] ? note(a.fire['fire.note']) : null,
    a.seismic ? note(`Seismic: zone ${a.seismic.zone}, ag ${a.seismic.ag_g} g, rack cost +${num((a.seismic.rack_cost_factor - 1) * 100, 0)} % (assumption).`) : null);
}

function resourceBars(mf) {
  const r = mf.resources || {};
  const demand = mf.demand ? mf.demand.in_h + mf.demand.out_h : null;
  const items = Object.entries(r).map(([k, v]) => ({ label: ({ lifts: 'Lifts', shuttles: 'Shuttles', 'docks IN': 'IN docks', 'docks OUT': 'OUT docks', 'dock wall': 'Dock wall length' }[k] || k) + (k === (mf.binding_now || '') ? ' · binds' : ''), value: v.limit_moves_h, role: k === (mf.binding_now || '') ? 'bind' : ({ lifts: 'lift', shuttles: 'shuttle', 'docks IN': 'in', 'docks OUT': 'out' }[k] || 'structure') }));   // R24: resource role colours
  return hbars({ title: 'Capacity of each resource in moves per hour', fmt: (x) => num(x), unit: 'moves/h', ref: demand ? { value: demand, label: `plan flow ${num(demand)}` } : undefined, items });
}
function pFlow(c) {
  const mf = c.rep.max_flow, cap = c.rep.capacity, dk = c.rep.docks;
  if (!mf) return h('p.muted', 'No flow block for this design.');
  const push = mf.push || {};
  const out = h('div.an-stack');
  const pushBtn = h('button.btn.primary', { type: 'button', onclick: async () => {
    pushBtn.disabled = true; pushBtn.setAttribute('aria-busy', 'true');
    try { await c.pushToMax(); } catch (e) { toast('Push to maximum failed: ' + ((e && e.message) || e)); pushBtn.disabled = false; pushBtn.removeAttribute('aria-busy'); }
  } }, icon('gauge', 'sm'), c.rep.at_max ? 'Showing the maximum flow' : 'Push to maximum flow');
  if (c.rep.at_max) pushBtn.disabled = true;
  out.append(
    h('section.card.an-card', h('h3', 'Capacity verdict'),
      h('div.row.an-chips', okChip(cap && cap.ok, 'Stores the target', 'Stores less than the target'), cap && h('span.chip', `${num(cap.expected_stored)} pallets expected stored`), cap && h('span.chip', `${num(cap.positions)} positions, ${num(cap.required_positions)} needed`),
        cap && cap.stock != null ? h('span.chip', { title: 'Secondary figure: positions × 85 % fill. The verdict uses the expected stored pallets.' }, `Planned stock at 85 % fill ${num(cap.stock)} (secondary)`) : null),
      cap && h('p.an-why', cap.verdict), cap && !cap.ok && cap.shortfall_positions ? h('p.an-why', `Shortfall: ${num(cap.shortfall_positions)} positions. The card above lists what would change that, with the cost of each change.`) : null,
      cap && cap.avg_stock_honeycombing != null ? note(`Average stock with honeycombing: ${num(cap.avg_stock_honeycombing)} pallets (lane release is an assumption).`) : null),
    h('section.card.an-card', h('h3', 'Maximum flow'),
      h('div.row.an-chips', h('span.chip.acc', `Storage ${num(mf.storage.moves_h, 0)} moves/h`), mf.docks_wall ? h('span.chip.acc', `Docks (wall) ${num(mf.docks_wall.moves_h, 0)} moves/h`) : null, h('span.chip', `Binding now: ${mf.binding_now || 'n/a'}`),
        push.moves_h != null ? h('span.chip', `Push-to-max: ${num(push.moves_h, 0)} moves/h, binds on ${push.binding}`) : null),
      h('p.an-why', `Storage (lifts at ${pct(mf.storage.utilisation_limits ? mf.storage.utilisation_limits.lift_rho_max : 0.85, 0)}, shuttles at ${pct(mf.storage.utilisation_limits ? mf.storage.utilisation_limits.shuttle_u_max : 0.8, 0)}) binds on ${mf.storage.binding}. ${push.rule || ''}`),
      resourceBars(mf), h('div.row', pushBtn, push.in_h != null ? h('span.muted', `IN ${num(push.in_h, 0)} and OUT ${num(push.out_h, 0)} pallets/h at the limit`) : null),
      c.rep.at_max ? note('The figures on this page are now evaluated at the maximum flow; the bays were re-sized within the wall length.') : null),
    dk && h('section.card.an-card', h('h3', 'Dock and bay plan'),
      // FIX (R18e): bays are sized by Erlang-C (docks.bays_needed default). Old cause: the note named the pre-R18d1 Erlang-B loss-system rule.
      kvs([['Dock case', DOCK_CASE[dk.case] || dockCaseLabel(dk)], ['IN bays', num(dk.n_bays_in)], ['OUT bays', num(dk.n_bays_out)], ['Truck-bay service level, at least', pct(dk.level_of_service, 0), 'Erlang-C: probability that an arriving truck finds a free bay at once (team decision 2026-11-11).'],
        ['Trucks per hour (IN / OUT)', `${num(dk.trucks_per_h_in, 1)} / ${num(dk.trucks_per_h_out, 1)}`], ['Wall needed', dk.wall_need_m ? Object.entries(dk.wall_need_m).map(([w, m]) => `${w} ${dim(m)} m`).join(', ') : null],
        ['Pallets per truck', num(dk.pallets_per_truck)],
        // FIX (R21b, A4-14): the 22-pallet truck sensitivity (docks.sens_22_bays_in / _out) is shown when the report carries it (the model computes it but service._ROWS does not list it yet; absent now: no row, no invented value)
        ...(kpiVal(c.rep, 'docks.sens_22_bays_in') != null ? [['Bays for a 22-pallet truck (IN / OUT)', `${num(kpiVal(c.rep, 'docks.sens_22_bays_in'))} / ${num(kpiVal(c.rep, 'docks.sens_22_bays_out'))}`, 'The 24 pallets per truck are an assumption (24 t / 1.0 t).']] : [])]),
      dk.cases_compared && dk.cases_compared.length ? table([{ label: 'Dock case', get: (r) => r.case }, { label: 'Holds the capacity', get: (r) => (r.feasible ? 'Yes' : 'No') }, { label: 'Store or retrieve time (s)', num: true, get: (r) => num(r.F_io, 1) }, { label: 'Positions', num: true, get: (r) => num(r.positions) }],
        dk.cases_compared, { caption: 'Dock cases compared', rowClass: (r) => (r.case === dk.case ? 'is-best' : null) }) : null));
  return out;
}

function pStaff(c) {
  const st = c.rep.staff, ck = c.rep.checklist;
  return h('div.an-stack',
    st ? h('section.card.an-card', h('h3', 'Staff per shift'),
      h('div.row.an-chips', h('span.chip', `${num(st.per_shift_total)} per shift (peak)`), h('span.chip', `Largest shift ${num(st.largest_shift)}`), h('span.chip', `${num(st.shifts)} shifts, ${num(st.headcount_day_max)} people a day`), h('span.chip', `${num(st.forklifts)} forklifts`)),
      table([{ label: 'Role', get: (r) => r.role }, { label: 'Per shift', num: true, get: (r) => num(r.per_shift) }, { label: 'Where', get: (r) => r.where }, { label: 'Rule', get: (r) => r.rule }], st.table || [], { caption: 'Staff table' }),
      st.note ? note(st.note + ' Staff rules are assumptions (R0.1).') : null) : h('p.muted', 'No staff table for this design.'),
    ck && ck.length ? h('section.card.an-card', h('h3', 'Regulation checklist'),
      table([{ label: 'Regulation', get: (r) => r.regulation }, { label: 'What the model checks', get: (r) => r.model_checks }, { label: 'Status', get: (r) => h('span.chip.' + (r.status === 'checked' ? 'ok' : 'warn'), r.status) }], ck, { caption: 'Regulation checklist' }),
      note('The checklist shows which rules the model sizes against. It is not a compliance certificate: a licensed engineer signs off the design.')) : null);
}

// ---------------------------------------------------------------- R13b: tier rule, racks, cost bands, energy, ABC preset, t_board
/** Value of a model KPI by key (the KPI groups of the report carry every figure the model exports). */
const kpiVal = (rep, key) => { for (const g of rep.groups || []) for (const k of g.kpis) if (k.key === key) return k.value; return null; };
const yesNo = (b) => (b == null ? null : b ? 'Yes' : 'No');
const LIMIT_NAME = { user_cap: 'Your cap (maximum tiers)', vendor: 'Supplier height class', structure: 'Rack structure', fire: 'Fire clearance under the roof', height: 'Clear height of the building', lift_perf: 'Lift performance' };
const LIMIT_WHY = { user_cap: 'input', vendor: 'brochures, assumption', structure: 'assumption', fire: 'clearance rule, assumption', height: 'geometry', lift_perf: 'lift ride time, assumption' };

/** Racks of the design, one row per block and lane depth: racks, columns, lanes, pallets, SKUs, dimensions. Counts come from the scene block (columns, cross-aisles) and the
 *  walkway columns of the areas block; SKUs = pallets / unit loads per SKU (6, brief). */
export function rackRows(rep) {
  const sc = rep.scene;
  if (!sc || !sc.blocks || !sc.blocks.length) return null;
  const bi = sc.blocks_info || [], tiers = sc.tiers, pt = sc.pitch || {}, ld = sc.load || {};
  const rect = !rep.design || !rep.design.shape || rep.design.shape === 'rect';
  const walk = rect && rep.areas && rep.areas.walkway ? rep.areas.walkway.columns || 0 : 0;
  const inRect = (b, r) => { const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2; return cx >= r.x - 1e-6 && cx <= r.x + r.w + 1e-6 && cy >= r.y - 1e-6 && cy <= r.y + r.h + 1e-6; };
  const groups = new Map();
  for (const b of sc.blocks) {
    const info = bi.find((i) => inRect(b.box, i.rect)) || bi[0] || {};
    const key = `${info.id ?? 0}|${b.depth}`;
    if (!groups.has(key)) groups.set(key, { block: info.id ?? 0, depth: b.depth, racks: 0, cols: Math.max(0, (info.columns || (sc.columns && sc.columns.count) || 0) - (info.n_cross || 0) - walk) });
    groups.get(key).racks += 1;
  }
  const rows = [...groups.values()].map((g) => {
    const lanes = g.cols * tiers, pallets = lanes * g.depth, mod = (sc.modules || []).find((m) => m.depth === g.depth);
    return { ...g, tiers, lanes, pallets, skus: pallets / 6, length: g.cols * (pt.column || 0), width: mod ? mod.lane_length : null, height: tiers * (pt.tier || 0), total_pallets: pallets * g.racks };
  });
  const blocks = bi.map((i) => ({ block: i.id ?? 0, positions: i.positions })).filter((b) => b.positions != null);
  return { rows, blocks, gap_pallet: pt.column != null && ld.across != null ? pt.column - ld.across : null, gap_vert: pt.tier != null && ld.height != null ? pt.tier - ld.height : null,
    aisle: pt.aisle, front: pt.front, walk, rect };
}

function pRacks(c) {
  const rep = c.rep, tr = rep.tier_rule, pl = rep.plan || {}, cap = rep.capacity || {};
  const out = h('div.an-stack');
  if (tr) {
    const lims = Object.entries(tr.limits || {}).filter(([, x]) => x != null);
    const nx = tr.next || {};
    out.append(h('section.card.an-card', h('h3', 'Tier rule'),
      h('div.row.an-chips', h('span.chip.acc', `${num(tr.tiers)} tiers`), h('span.chip', `Binding limit: ${tr.binding}`), tr.tied && tr.tied.length > 1 ? h('span.chip', `Tied: ${tr.tied.join(', ')}`) : null,
        tr.tiers_soft != null && tr.tiers > tr.tiers_soft ? h('span.chip.warn', `Above the ${tr.tiers_soft}-tier marker`) : null),
      h('p.an-why', `The tier count is the smallest of six limits; the one that binds is reported. Tappia et al. (2016) show diminishing returns above about ${tr.tiers_soft || 7} tiers: it is a marker, not a hard cap.`),
      table([{ label: 'Limit', get: (r) => LIMIT_NAME[r[0]] || r[0] }, { label: 'Tiers allowed', num: true, get: (r) => (r[1] >= 30 ? 'no limit' : num(r[1])) }, { label: 'Basis', get: (r) => LIMIT_WHY[r[0]] || '' }, { label: 'Binds', get: (r) => (r[1] === tr.tiers ? 'Yes' : '') }],
        lims, { caption: 'Tier limits', rowClass: (r) => (r[1] === tr.tiers ? 'is-best' : null) }),
      note('Supplier height class, structure, fire clearance and lift performance are assumptions from the research register.')),
      h('section.card.an-card', h('h3', 'One more tier'),
        kvs([['Height needed for one more tier', nx.height_needed != null ? `${fmtNum(nx.height_needed, 2)} m` : null], ['Height missing', nx.height_short != null ? (nx.height_short > 0 ? `${fmtNum(nx.height_short, 2)} m` : 'fits') : null],
          ['Positions gained', nx.positions_gain != null ? pct(nx.positions_gain, 1) : null], ['Lift utilisation now / with one more tier', nx.rho_lift_now != null ? `${pct(nx.rho_lift_now, 1)} / ${pct(nx.rho_lift_next, 1)}` : null],
          ['Gain of the next tier over the last one', tr.gain_next != null ? pct(tr.gain_next, 1) : null], ['Diminishing returns', tr.diminishing == null ? null : tr.diminishing ? 'Yes: the next tier adds little' : 'Not yet']]),
        tr.mezzanine ? note(`Staff mezzanine: ${tr.mezzanine.better === 'mezzanine' ? 'better with the mezzanine' : 'better without it'}; it frees ${num(tr.mezzanine.gain_ground_m2 || 0)} m² of ground floor${tr.mezzanine.gain_positions ? ' and adds ' + num(tr.mezzanine.gain_positions) + ' positions' : ''}.`) : null));
  }
  out.append(h('section.card.an-card', h('h3', 'Stock'),
    kvs([['Pallet positions', num(cap.positions)], ['Expected stored (positions × lane fill)', cap.expected_stored != null ? num(cap.expected_stored) : pl['plan.expected_stored'] != null ? num(pl['plan.expected_stored']) : null, 'Honeycombing fill per lane depth is an assumption.'],
      ['Target', num(cap.target_pallets)], [`Positions needed to store the target (service level ${cap.cap_sl != null ? cap.cap_sl : 0.9})`, num(cap.required_positions), 'The capacity service level (0.90) and the stock variability (0) are assumptions.'],
      ['Average lane fill', pl['plan.lane_fill'] != null ? pct(pl['plan.lane_fill'], 1) : cap.lane_fill != null ? pct(cap.lane_fill, 1) : null, 'Honeycombing fill per lane depth is an assumption.'],
      ['Planned stock at 85 % fill (secondary)', num(cap.stock), 'The 85 % fill is an assumption.']]),
    cap.ok === false ? h('p.an-why', `The target is not reached: ${cap.verdict || ''}`) : null));
  const rk = rackRows(rep);
  if (rk) {
    out.append(h('section.card.an-card', h('h3', 'Rack capacity'),
      table([{ label: 'Rack group', get: (r) => `Block ${r.block + 1}, ${r.depth}-deep` }, { label: 'Racks', num: true, get: (r) => num(r.racks) }, { label: 'Columns', num: true, get: (r) => num(r.cols) }, { label: 'Tiers', num: true, get: (r) => num(r.tiers) },
        { label: 'Lanes per rack', num: true, get: (r) => num(r.lanes) }, { label: 'Pallets per rack (gross)', num: true, get: (r) => num(r.pallets) }, { label: 'SKUs per rack', num: true, get: (r) => num(r.skus, 0) },
        { label: 'Rack L × D × H (m)', num: true, get: (r) => `${fmtNum(r.length, 1)} × ${fmtNum(r.width, 1)} × ${fmtNum(r.height, 1)}` }, ],
        rk.rows, { caption: 'Racks of the design' }),
      rk.blocks.length ? table([{ label: 'Block', get: (b) => (b.block < 0 ? 'All blocks' : `Block ${b.block + 1}`) }, { label: 'Pallet positions, exact', num: true, get: (b) => num(b.positions) }], [...rk.blocks, { block: -1, positions: rk.blocks.reduce((a, b) => a + b.positions, 0) }], { caption: 'Positions per block' }) : null,
      kvs([['Gap between neighbouring pallets', rk.gap_pallet != null ? `${fmtNum(rk.gap_pallet, 2)} m` : null], ['Gap between stacked pallets', rk.gap_vert != null ? `${fmtNum(rk.gap_vert, 2)} m` : null], ['Aisle width', rk.aisle != null ? `${fmtNum(rk.aisle, 2)} m` : null], ['Front channel', rk.front != null ? `${fmtNum(rk.front, 2)} m` : null],
        ['Longitudinal flue space', kpiVal(rep, 'geometry.flue_long_mm') != null ? `${num(kpiVal(rep, 'geometry.flue_long_mm'))} mm, ${kpiVal(rep, 'geometry.flue_long_ok') ? 'meets the rule' : 'below the rule'}` : null],
        ['Transverse flue space', kpiVal(rep, 'geometry.flue_trans_mm') != null ? `${num(kpiVal(rep, 'geometry.flue_trans_mm'))} mm, ${kpiVal(rep, 'geometry.flue_trans_ok') ? 'meets the rule' : 'below the rule'}` : null]]),
      kpiVal(rep, 'fire.inrack_needed') ? kvs([['In-rack sprinklers', `${num(kpiVal(rep, 'fire.inrack_levels'))} levels, one every ${num(kpiVal(rep, 'fire.inrack_every_tiers'))} tiers`], ['In-rack heads clear of the load', yesNo(kpiVal(rep, 'fire.inrack_head_load_ok'))]]) : null,
      note('One lane holds one SKU of 6 unit loads. Per-block positions are exact counts from the layout (walkway columns, shafts and cross-aisles removed) and add up to the headline positions; the per-rack figures are gross. Dimensions are the same values as the rack drawing.')));
  }
  return out;
}

const hasNum = (x) => x != null && Number.isFinite(x);
function pCost(c) {
  const rep = c.rep, hd = rep.headline || {}, K = (k) => kpiVal(rep, k);
  const out = h('div.an-stack');
  const bands = [['Racks', 'cost.capex_pos_lo', null], ['Shuttles', 'cost.capex_shuttle_lo', null], ['Lifts', 'cost.capex_lift_lo', null], ['Conveyors', 'cost.capex_conv_lo', null], ['Chargers', 'cost.capex_charger_lo', null],
    ['Controls and WMS interface', 'cost.capex_ctrl_lo', 'cost.capex_ctrl_hi'], ['Installation and commissioning', 'cost.capex_inst_lo', 'cost.capex_inst_hi']].filter((r) => hasNum(K(r[1])));
  out.append(h('section.card.an-card', h('h3', 'CAPEX bands'),
    h('div.row.an-chips', h('span.chip.acc', `Low ${eur(hd.capex_low_eur)}`), h('span.chip.acc', `High ${eur(hd.capex_high_eur)}`), hasNum(hd.per_move_eur) ? h('span.chip', `€ ${fmtNum(hd.per_move_eur, 2)} per move`) : null),
    table([{ label: 'Item', get: (r) => r[0] }, { label: 'Low price case', num: true, get: (r) => eur(K(r[1])) }, { label: 'High price case', num: true, get: (r) => (r[2] && hasNum(K(r[2])) ? eur(K(r[2])) : '') }], bands, { caption: 'CAPEX items' }),
    note('One price table with a low and a high case; installation, controls and the seismic rack surcharge are assumptions. Items without a high value are shown for the low case only.')));
  const ann = [['Annual cost, low band', K('cost.total_lo')], ['Annual cost, high band', K('cost.total_hi')], ['Electricity at 0.20 €/kWh (low price case)', K('cost.elec_lo_total_lo')], ['Electricity at 0.30 €/kWh (low price case)', K('cost.elec_hi_total_lo')]].filter((r) => hasNum(r[1]));
  out.append(h('section.card.an-card', h('h3', 'Annual cost'), kvs(ann.map(([l, x]) => [l, `${eur(x)} / year`, 'Unit costs and the electricity price are assumptions (Eurostat band IB 2026-S1; 0.20 and 0.30 are the cases).'])),
    note('The annual cost is annuity + floor charge + energy + maintenance. The electricity rows keep everything else fixed.')));
  const o2 = K('energy.o2'), lo = K('energy.total_lo'), up = K('energy.total_hi');
  out.append(h('section.card.an-card', h('h3', 'Energy'),
    kvs([['Energy per day', hasNum(hd.energy_kwh_day) ? `${fmtNum(hd.energy_kwh_day, 1)} kWh` : null, 'Energy rates, charging losses and the PV yield are assumptions.'], ['Range with the energy module bounds', hasNum(lo) && hasNum(up) ? `${fmtNum(lo, 1)} to ${fmtNum(up, 1)} kWh` : null, 'The bounds come from assumption ranges of the energy module.'],
      ['Oxygen-reduction plant', hasNum(o2) ? (o2 > 0 ? `${fmtNum(o2, 1)} kWh/day` : 'Not used (in-rack sprinklers)') : null, 'Plant energy is an assumption (nitrogen generation 0.25 kWh/Nm³, no source found).'], ['CO₂ per year', hasNum(K('energy.co2_year_t')) ? `${fmtNum(K('energy.co2_year_t'), 1)} t` : null],
      // FIX (R21b, A5-11 / A5-14): the battery-bound high case and the CO₂ band are shown when the report carries them (not yet listed in the report rows: no row, no invented value)
      ...(hasNum(K('energy.total_hi_battery')) ? [['Upper bound with charging at the battery-data bound', `${fmtNum(K('energy.total_hi_battery'), 1)} kWh/day`, 'Charging at the battery-data bound is an assumption.']] : []),
      ...(hasNum(K('energy.co2_year_t_lo')) && hasNum(K('energy.co2_year_t_hi')) ? [['CO₂ per year, band', `${fmtNum(K('energy.co2_year_t_lo'), 1)} to ${fmtNum(K('energy.co2_year_t_hi'), 1)} t`, 'The grid emission factor is an assumption.']] : [])]),
    note('Choose oxygen reduction as the fire strategy to see the plant energy added to the balance.')));
  const ab = rep.abc || {};
  out.append(h('section.card.an-card', h('h3', 'ABC preset'),
    // FIX (R18e): the cycle gain key is abc.gain_U (idealised column-class zones, reporting only); abc.gain_I is not in the report. Old cause: key renamed by R18b / R18d2 policy split.
    kvs([['Skew preset (moves of A / B / C, %)', K('abc.skew_preset') || (rep.design && rep.design.abc ? '80/15/5' : 'ABC slotting is off'), 'The skew is industry specific (assumption).'], ['Distance saved by ABC columns (access index)', hasNum(ab.ia_gain) ? pct(ab.ia_gain, 1) : null], ['Shuttle cycle with class columns, U docks (idealised, reporting only)', hasNum(K('abc.gain_U')) ? pct(K('abc.gain_U'), 1) : null]]),
    // FIX (R18e): the Eder (2022) reading follows abc.skew_benchmark_text (+9 to +13 % at equal depth, +14 to +18 % with a depth change or aisle limit, a throughput gain). Old cause: the note read the 14-18 % figure as the whole benchmark and as a position cost.
    note('Eder (2022) benchmark: +9 to +13 % aisle throughput at equal lane depth, +14 to +18 % with a depth change or an aisle-length limit; a throughput gain, not a cost of positions. It is quoted for 60 / 30 / 10 orders only; at other skews the access-index gain above is the one to read.')));
  out.append(h('section.card.an-card', h('h3', 'Boarding time sensitivity'), lazy(c, (x) => {
    const t = x.t_board_sensitivity;
    if (!t || !t.ok) return h('p.an-why', (t && t.note) || 'No sensitivity for this design.');
    const cur = Number((c.R.payload || {}).t_board ?? 10);
    // FIX (R18e): removed the claim that 25 s "tends to" hand-over lifts and fewer shuttles; the example is M2 at every boarding time in the R18a run. Old cause: a hard-coded M1 / shuttle-count claim. Each row now shows what the model chose.
    return h('div.an-stack', h('p.an-why', 'The time an empty shuttle needs to drive onto or off a lift deck is an assumption (5 to 25 s). 25 s is the conservative row. Each row is a full model run; the table shows the lift mode and shuttle count the model chose at that time.'),
      table([{ label: 'Boarding time', get: (r) => `${num(r.t_board)} s` }, { label: 'Lift mode', get: (r) => r.lift_mode }, { label: 'N shuttles', num: true, get: (r) => (r.ok ? num(r.N) : '') }, { label: 'L lifts', num: true, get: (r) => (r.ok ? num(r.L) : '') },
        { label: 'Store or retrieve time (s)', num: true, get: (r) => (r.ok ? num(r.F_io_s, 1) : r.note) }, { label: 'Max flow (moves/h)', num: true, get: (r) => (r.ok ? num(r.max_flow_moves_h, 0) : '') }, { label: 'CAPEX', num: true, get: (r) => (r.ok ? eur(r.capex_eur) : '') }],
        t.rows, { caption: 'Boarding time sensitivity', rowClass: (r) => (Number(r.t_board) === cur ? 'is-best' : null) }));
  }, 'the boarding-time sensitivity')));
  return out;
}

// ---------------------------------------------------------------- shapes
function shapeRows(sc) {
  const rows = (sc.other_shapes && sc.other_shapes.rows) || [];
  const std = sc.rows || [];
  if (!rows.length) return std.map((r) => ({ ...r, kind: SHAPE_NAME[r.shape] || r.shape, text: r.label }));
  return rows.map((r, i) => ({ ...r, kind: SHAPE_NAME[r.shape] || r.shape, text: r.params ? Object.entries(r.params).filter(([k]) => !/^(Lx|Wy)$/.test(k)).map(([k, v]) => `${k} ${typeof v === 'number' ? dim(v) : v}`).join(', ') : '', i }));
}
function pShapes(c) {
  const wrap = h('div.an-stack');
  const sc = c.R.mode === 'optimal' && c.R.shapes ? c.R.shapes : null;
  if (!sc) {
    const run = h('button.btn.primary', { type: 'button', onclick: async () => {
      // FIX (R18e): the Optimal search takes about 10 to 15 s (opt.json search.seconds 13.9). Old cause: the "5 to 10 s" estimate predates the R18d2 speed numbers.
      run.disabled = true; wrap.append(busy('Searching rectangles and L / U / T footprints for this capacity target (about 10 to 15 s)'));
      try {
        const p = designInputs(c.R, c.rep);
        // FIX (R18e, A9-15): the target comes from the run's inputs or the report's capacity block; no silent 4,000. Old cause: `p.cap_target || 4000` searched for 4,000 pallets whenever the Fixed run had no target.
        const target = p.cap_target != null ? p.cap_target : (c.rep.capacity && c.rep.capacity.target_pallets != null ? c.rep.capacity.target_pallets : null);
        if (target == null) throw new Error('This design has no capacity target, so there is nothing to compare shapes against. Enter a capacity target in the inputs and run again.');
        const goal = { type: 'capacity', pallets: target };
        for (const k of ['in_h', 'out_h', 'in_hours', 'out_hours', 'ops_share', 'reserve_share', 'area_placement', 'fire_strategy', 'level_of_service', 'case', 'abc']) if (p[k] != null) goal[k] = p[k];
        goal.h_max = p.H;
        const o = await model.optimal(goal);
        c.R.shapes = o.shape_comparison; c.R.shapesBest = o.best; c.rerender();
      } catch (e) { wrap.replaceChildren(fail(e)); }
    } }, icon('search', 'sm'), 'Compare shapes for this capacity target');
    wrap.append(h('p.an-why', 'The shape comparison belongs to the Optimal search: it ranks rectangles and L, U and T footprints of the same floor area and flags the winner. Run it for the capacity target of this design.'), h('div.row', run));
    return wrap;
  }
  const rows = shapeRows(sc);
  const top = rows.slice(0, 8);
  const best = (r) => (sc.best_shape === r.shape && r.optimum) || r.optimum;
  const budget = /budget/i.test(sc.optimum_reason || '');             // budget goal: rank by positions within the budget, the chart shows CAPEX
  wrap.append(
    h('p.an-why', h('strong', 'Optimum: '), sc.optimum_reason || ''),
    hbars({ title: budget ? 'CAPEX of the best candidate per shape, low price case' : 'Annual cost of the best candidate per shape, € per year', fmt: (x) => eur(x), unit: '',
      items: top.filter((r) => (budget ? r.capex_low_eur : r.annual_eur) != null).map((r) => { const v = budget ? r.capex_low_eur : r.annual_eur; return { label: `${r.kind}${r.text ? ' (' + r.text + ')' : ''}`, value: v, text: eur(v), role: best(r) ? 'ink' : 'structure' }; }) }),
    table([{ label: 'Shape', get: (r) => h('span', r.kind, best(r) ? h('span.chip.ok', { style: 'margin-left:.5rem' }, 'Optimum') : null) }, { label: 'Parameters', get: (r) => r.text },
      { label: 'Floor m²', num: true, get: (r) => num(r.floor_m2) }, { label: 'Positions', num: true, get: (r) => num(r.positions) }, { label: budget ? 'Within budget' : 'Holds target', get: (r) => (budget ? (r.capex_low_eur != null && r.capex_low_eur <= (c.R.payload && c.R.payload.capex_eur || Infinity) ? 'Yes' : 'No') : r.capacity_ok == null ? '' : r.capacity_ok ? 'Yes' : 'No') },
      { label: 'Store or retrieve time (s)', num: true, get: (r) => num(r.F_io_s, 0) }, { label: 'CAPEX low – high', num: true, get: (r) => (r.capex_low_eur != null ? `${eur(r.capex_low_eur)} – ${eur(r.capex_high_eur)}` : '') }, { label: 'N / L', num: true, get: (r) => (r.shuttles != null ? `${r.shuttles} / ${r.lifts}` : '') }],
      top, { caption: 'Shape comparison, top candidates', rowClass: (r) => (best(r) ? 'is-best' : null) }),
    // FIX (R18e): candidates, screened and evaluated are three counts (n_candidates, n_screened, n_evaluated). Old cause: the note called all candidates "screened", so 3,093 looked screened and 872 were hidden.
    note(`${sc.other_shapes && sc.other_shapes.n_candidates != null ? num(sc.other_shapes.n_candidates) + ' candidates, ' + num(sc.other_shapes.n_screened) + ' screened, ' + num(sc.other_shapes.n_evaluated) + ' evaluated. ' : ''}Ranking by ${sc.ranking || 'annual cost'}. Cost values are assumptions (low / high price case); the store or retrieve time is the in-to-out path time.`));
  return wrap;
}

// ---------------------------------------------------------------- extras: team cases, service level, tiers
async function getExtras(c) {
  const p = designInputs(c.R, c.rep);
  const key = JSON.stringify(p);
  c.R.extras ||= new Map();
  if (!c.R.extras.has(key)) c.R.extras.set(key, model.extras(p));
  return c.R.extras.get(key);
}
function lazy(c, build, what) {
  const box = h('div.an-stack', busy(`Running ${what} on the model (about 5 to 15 s, the first time only)`));
  getExtras(c).then((x) => { box.replaceChildren(build(x)); announce(`${what} ready`); }, (e) => { c.R.extras && c.R.extras.clear(); box.replaceChildren(fail(e)); });
  return box;
}
const capCell = (r) => (r.capacity_ok ? 'Yes' : `No (${num(r.positions)} of ${num(r.required)})`);
function pTeam(c) {
  return lazy(c, (x) => {
    const t = x.team_cases;
    if (!t || !t.ok) return h('p.an-why', (t && t.note) || 'No team cases for this design.');
    const rows = t.rows;
    return h('div.an-stack',
      h('p.an-why', 'The four team configurations on the same building: Case 1 docks on opposite sides, Case 2 on the same side, Case 3 on adjacent sides (rectangle), Case 4 on adjacent sides with L-shaped racks.'),
      hbars({ title: 'Maximum flow by case, moves per hour', fmt: (v) => num(v), unit: 'moves/h', items: rows.filter((r) => r.ok).map((r) => ({ label: `Case ${r.case}: ${r.name}`, value: r.max_flow_moves_h || 0, role: 'structure' })) }),
      table([{ label: 'Case', get: (r) => `${r.case}: ${r.name}` }, { label: 'N shuttles', num: true, get: (r) => (r.ok ? num(r.N) : '') }, { label: 'L lifts', num: true, get: (r) => (r.ok ? num(r.L) : '') },
        { label: 'Positions', num: true, get: (r) => (r.ok ? num(r.positions) : '') }, { label: 'Holds target', get: (r) => (r.ok ? capCell(r) : r.note) }, { label: 'Store or retrieve time (s)', num: true, get: (r) => (r.ok ? num(r.F_io_s, 0) : '') },
        { label: 'Max flow (moves/h)', num: true, get: (r) => (r.ok ? num(r.max_flow_moves_h, 0) : '') }, { label: 'CAPEX', num: true, get: (r) => (r.ok ? eur(r.capex_eur) : '') }], rows, { caption: 'Team cases 1 to 4' }),
      rows.some((r) => r.ok && r.feasible === false && ((r.reasons && r.reasons.length) || r.note)) ? h('div.card.an-card', h('h3', 'Cases that do not hold'),
        h('ul.an-steps', rows.filter((r) => r.ok && r.feasible === false).map((r) => h('li', h('strong', `Case ${r.case}: `), (r.reasons || []).join('; ') || r.note || 'infeasible')))) : null,
      note((t.note || '') + ' Case 2 (same side) gets a conveyor loop in the picking area; its length and cost are assumptions.'));
  }, 'team cases 1 to 4');
}
function pService(c) {
  return lazy(c, (x) => {
    const t = x.service_level_sweep;
    if (!t || !t.ok) return h('p.an-why', (t && t.note) || 'No sweep for this design.');
    const cur = c.rep.docks ? c.rep.docks.level_of_service : null;
    return h('div.an-stack',
      h('p.an-why', 'Service level = the probability that an arriving truck finds a free bay (at least). A higher level needs more bays; each bay adds dock wall, apron and cost. Storage speed (shuttles and lifts) does not change with the level.'),
      hbars({ title: 'CAPEX by service level', fmt: (v) => eur(v), unit: '', items: t.rows.filter((r) => r.ok).map((r) => ({ label: pct(r.level_of_service, 0), value: r.capex_eur, text: eur(r.capex_eur), role: cur != null && Math.abs(r.level_of_service - cur) < 1e-6 ? 'ink' : 'structure' })) }),
      table([{ label: 'Service level, at least', get: (r) => `${fmtNum(r.level_of_service * 100, 0)} %` }, { label: 'IN bays', num: true, get: (r) => (r.ok ? num(r.bays_in) : '') }, { label: 'OUT bays', num: true, get: (r) => (r.ok ? num(r.bays_out) : '') },
        { label: 'N shuttles', num: true, get: (r) => (r.ok ? num(r.N) : '') }, { label: 'L lifts', num: true, get: (r) => (r.ok ? num(r.L) : '') }, { label: 'Positions', num: true, get: (r) => (r.ok ? num(r.positions) : '') }, { label: 'CAPEX', num: true, get: (r) => (r.ok ? eur(r.capex_eur) : r.note) }],
        t.rows, { caption: 'Service-level sweep', rowClass: (r) => (cur != null && Math.abs(r.level_of_service - cur) < 1e-6 ? 'is-best' : null) }),
      note(t.note));
  }, 'the service-level sweep');
}
function pTiers(c) {
  return lazy(c, (x) => {
    const t = x.tiers_sensitivity;
    if (!t || !t.ok) return h('p.an-why', (t && t.note) || 'No tier sensitivity for this design.');
    return h('div.an-stack',
      h('p.an-why', `Team note: check that the 7-tier maximum is considered. Rows compare a hard 7-tier limit with the tier rule (${num(c.rep.design && c.rep.design.tiers)} tiers here, binding limit: ${(c.rep.tier_rule && c.rep.tier_rule.binding) || 'n/a'}). Tappia et al. (2016) find diminishing returns above about 7 tiers, not a hard cap.`),
      table([{ label: 'Tiers', get: (r) => (r.tiers_max ? `Limit ${r.tiers_max}` : `Rule: ${r.tiers}`) }, { label: 'Positions', num: true, get: (r) => (r.ok ? num(r.positions) : '') }, { label: 'Holds target', get: (r) => (r.ok ? capCell(r) : r.note) },
        { label: 'N shuttles', num: true, get: (r) => (r.ok ? num(r.N) : '') }, { label: 'L lifts', num: true, get: (r) => (r.ok ? num(r.L) : '') }, { label: 'Max flow (moves/h)', num: true, get: (r) => (r.ok ? num(r.max_flow_moves_h, 0) : '') },
        { label: 'Binding', get: (r) => r.max_flow_binding }, { label: 'CAPEX', num: true, get: (r) => (r.ok ? eur(r.capex_eur) : '') }], t.rows, { caption: 'Seven tiers against the height rule' }),
      note('Fewer tiers hold fewer pallets in the same building but shorten lift rides; the table shows both effects.'));
  }, 'the tier sensitivity');
}

// ---------------------------------------------------------------- growth
function pGrowth(c) {
  const gs = (state.schema.growth && state.schema.growth.fields) || [];
  const cur = c.rep.design || {};
  const inputs = {};
  const out = h('div.an-stack');
  const fields = h('div.fields', gs.map((f) => {
    const id = 'gr-' + f.key;
    const base = f.key === 'new_in_h' ? cur.in_h : f.key === 'new_out_h' ? cur.out_h : cur.cap_target;
    const inp = h('input', { id, type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: base != null ? `now ${num(base)}` : '', 'aria-describedby': id + '-h' });
    inp.addEventListener('input', () => { inputs[f.key] = inp.value; });
    return h('div.field', h('label', { for: id }, f.label), h('div.inp', inp, h('span.u', f.unit)), h('div.msg', { id: id + '-h' }, f.help));
  }));
  const result = h('div.an-stack');
  const go = h('button.btn.primary', { type: 'button', onclick: async () => {
    const add = {};
    for (const f of gs) {
      const raw = String(inputs[f.key] ?? '').trim().replace(',', '.');
      if (raw === '') continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < f.min || n > f.max) { result.replaceChildren(h('p.msg.err', { role: 'alert' }, `${f.label} must be between ${f.min} and ${f.max} ${f.unit}.`)); return; }
      add[f.key] = n;
    }
    if (!Object.keys(add).length) { result.replaceChildren(h('p.msg.err', { role: 'alert' }, 'Enter at least one new absolute flow or a new capacity target. A multiplier is not accepted.')); return; }
    go.disabled = true; result.replaceChildren(busy('Computing the growth step'));
    try {
      const g = await model.growth({ ...designInputs(c.R, c.rep), ...add });
      result.replaceChildren(growthView(g, cur)); announce('Growth result ready');
    } catch (e) { result.replaceChildren(fail(e)); }
    go.disabled = false;
  } }, icon('expand', 'sm'), 'Compute growth');
  out.append(h('p.an-why', 'Growth is set with absolute flows: the new IN and the new OUT flow separately (for example 40 / 40 to 40 / 50, or 60 / 80), and optionally a new capacity target. The reserve floor is filled first; the building is extended only when the reserve is not enough.'), fields, h('div.row', go), result);
  return out;
}
// FIX (R18e): years_flow / years_stock are None with a status_* text when no shortfall shows in the horizon. Old cause: num(null) printed an empty value, the status text was never shown.
const yearsText = (y, st) => (y != null ? `${num(y, 1)} years` : `n/a (${st || 'no status given'})`);
function growthKeptAdded(lay) {
  const kp = lay.kept || {}, ad = lay.added || {};
  const yn = (b) => (b ? 'kept' : 'changed');
  return h('div.an-grid',
    h('section.card.an-card', h('h3', 'Kept from today'),
      kvs([['Building', kp.L != null ? `${dim(kp.L)} × ${dim(kp.W)} × ${dim(kp.H)} m` : null], ['Aisle direction', kp.orient != null ? `${kp.orient === 'x' ? 'along the length' : 'along the width'} (${yn(kp.orient_kept)})` : null],
        ['Dock case', kp.dock_case != null ? `${dockCaseLabel({ case: kp.dock_case })} (${yn(kp.dock_case_kept)})` : null], ['Lane depth', kp.lane_depth != null ? `${num(kp.lane_depth)}-deep` : null], ['Tiers', kp.tiers != null ? num(kp.tiers) : null]])),
    h('section.card.an-card', h('h3', 'Added'),
      kvs([['Building extension', ad.extension_m != null ? `${dim(ad.extension_m)} m` : null], ['Floor area added', ad.area_m2 != null ? `${num(ad.area_m2)} m²` : null], ['Tiers added', ad.tiers != null ? num(ad.tiers) : null], ['Pallet positions added', ad.positions != null ? num(ad.positions) : null]])));
}
function growthView(g, cur) {
  if (!g || g.ok === false) return h('div.card.an-err', { role: 'alert' }, (g && g.reasons && g.reasons.join(' ')) || 'Growth could not be computed.');
  const gr = g.growth;
  if (!gr) return h('div.card.an-err', { role: 'alert' }, (g.reasons || []).join(' ') || 'No growth result.');
  const route = g.route || gr.route;
  const used = route === 'reserve';
  const hd = h('div.row.an-chips', okChip(g.feasible !== false, 'Target met', 'Needs more than the plan'),
    // FIX (R18e): the model's route names are 'reserve' | 'extended' | 'none'. Old cause: the chip tested 'extend' / 'extension', so an extension showed "Route: extended".
    h('span.chip.acc', used ? 'The reserve was used' : route === 'extended' ? `The building is extended${gr.layout && gr.layout.extension_m ? ' by ' + dim(gr.layout.extension_m) + ' m' : ''}` : `Route: ${route}`));
  const rows = [];
  if (gr.N) rows.push(['Shuttles N', num(gr.N.before), num(gr.N.after), signed(gr.N.delta)]);
  if (gr.L) rows.push(['Lifts L', num(gr.L.before), num(gr.L.after), signed(gr.L.delta)]);
  if (gr.layout) rows.push(['Pallet positions', num(gr.layout.before.positions), num(gr.layout.after.positions), signed(gr.layout.after.positions - gr.layout.before.positions)]);
  else if (gr.positions_before != null) rows.push(['Pallet positions', num(gr.positions_before), num(gr.positions_after), signed(gr.positions_after - gr.positions_before)]);
  if (gr.energy) rows.push(['Energy (kWh/day)', num(gr.energy.kwh_day_before, 0), num(gr.energy.kwh_day_after, 0), signed(gr.energy.delta, 0)]);
  if (gr.throughput) rows.push(['Sustainable flow (moves/h)', num(gr.throughput.before_moves_h, 0), num(gr.throughput.after_moves_h, 0), signed(gr.throughput.after_moves_h - gr.throughput.before_moves_h, 0)]);
  return h('div.an-stack', hd, h('p.an-why', gr.why || ''),
    table([{ label: 'Figure', get: (r) => r[0] }, { label: 'Now', num: true, get: (r) => r[1] }, { label: 'After growth', num: true, get: (r) => r[2] }, { label: 'Change', num: true, get: (r) => r[3] }], rows, { caption: 'Growth deltas' }),
    gr.cost ? kvs([['Extra CAPEX (low / high price case)', `${eur(gr.cost.capex_low)} / ${eur(gr.cost.capex_high)}`, 'Unit costs are assumptions.'], ['Extra annual cost (low / high)', `${eurS(gr.cost.annual_low)} / ${eurS(gr.cost.annual_high)}`, 'Unit costs are assumptions.'],
      ['Cost per move after', gr.cost.per_move_after != null ? `€ ${fmtNum(gr.cost.per_move_after, 2)}` : null, 'Unit costs are assumptions.']]) : null,
    // FIX (R21b, G12): what stays and what is added (growth.layout.kept / added) and the dock years (time_to_need.years_docks). Old cause: the growth card showed the before / after table only.
    gr.layout && (gr.layout.kept || gr.layout.added) ? growthKeptAdded(gr.layout) : null,
    gr.time_to_need ? note(`Time to need at ${pct(gr.time_to_need.rate, 0)} yearly growth: flow ${yearsText(gr.time_to_need.years_flow, gr.time_to_need.status_flow)}, stock ${yearsText(gr.time_to_need.years_stock, gr.time_to_need.status_stock)}, docks ${yearsText(gr.time_to_need.years_docks, gr.time_to_need.status_docks)} (assumption).`) : null,
    gr.resilience ? note(`One shuttle down: utilisation ${pct(gr.resilience.u_one_shuttle_down, 0)} (${gr.resilience.one_shuttle_down_ok ? 'ok' : 'above the limit'}).`) : null);
}

// ---------------------------------------------------------------- contingency
export const CONTINGENCIES = [
  { id: 'shuttle', label: 'A shuttle is down', icon: 'shuttle' }, { id: 'lift', label: 'A lift is down', icon: 'layers' },
  { id: 'tier', label: 'A tier is locked out', icon: 'building' }, { id: 'dock', label: 'A dock bay is closed', icon: 'gauge' },
];
/** KPI deltas for a failure. Linear scaling of the model's utilisation figures (load / remaining units): approximate, labelled so on screen. */
export function contingencyRows(rep, kind) {
  const f = rep.fleet || {}, cap = rep.capacity || {}, mf = rep.max_flow || {}, dk = rep.docks || {};
  const N = f.N, Lw = f.lifts_working, Ls = f.lifts_spare || 0, tiers = (rep.design || {}).tiers;
  const R = [];
  if (kind === 'shuttle' && N > 1) {
    const u1 = f.u * N / (N - 1), lim = mf.storage && mf.storage.utilisation_limits ? mf.storage.utilisation_limits.shuttle_u_max : 0.8;
    R.push(['Shuttles in the pool', num(N), num(N - 1)], ['Shuttle utilisation', pct(f.u, 0), pct(u1, 0)], ['Within the 80 % limit', 'Yes', u1 <= lim ? 'Yes' : 'No'],
      ['Shuttle flow limit (moves/h)', mf.resources && mf.resources.shuttles ? num(mf.resources.shuttles.limit_moves_h, 0) : 'n/a', mf.resources && mf.resources.shuttles ? num(mf.resources.shuttles.limit_moves_h * (N - 1) / N, 0) : 'n/a']);
    return { rows: R, text: `One of ${N} pooled shuttles stops. The pool keeps serving every tier; utilisation rises from ${pct(f.u, 0)} to ${pct(u1, 0)}.`, ok: u1 <= lim };
  }
  if (kind === 'lift' && Lw) {
    const keep = Ls > 0, rho1 = keep ? f.lift_rho : f.lift_rho * Lw / Math.max(1, Lw - 1);
    R.push(['Working lifts', num(Lw), keep ? `${num(Lw)} (a spare takes over)` : num(Lw - 1)], ['Lift utilisation', pct(f.lift_rho, 0), pct(rho1, 0)], ['Within the 85 % limit', 'Yes', rho1 <= 0.85 ? 'Yes' : 'No'],
      ['Lift flow limit (moves/h)', mf.resources && mf.resources.lifts ? num(mf.resources.lifts.limit_moves_h, 0) : 'n/a', mf.resources && mf.resources.lifts ? num(keep ? mf.resources.lifts.limit_moves_h : mf.resources.lifts.limit_moves_h * (Lw - 1) / Lw, 0) : 'n/a']);
    return { rows: R, text: keep ? `A lift stops and a spare lift takes over its station after the switch-over; the figures hold.` : 'A lift stops and no spare is installed: the remaining lifts carry its moves.', ok: rho1 <= 0.85 };
  }
  if (kind === 'tier' && tiers > 1) {
    const stock = cap.expected_stored != null ? cap.expected_stored * (tiers - 1) / tiers : null, pos = cap.positions != null ? cap.positions * (tiers - 1) / tiers : null;
    R.push(['Tiers in service', num(tiers), num(tiers - 1)], ['Pallet positions', num(cap.positions), num(pos)], ['Expected stored', num(cap.expected_stored), num(stock)], ['Stores the capacity target', cap.ok ? 'Yes' : 'No', pos != null && cap.required_positions != null && pos >= cap.required_positions ? 'Yes' : 'No']);
    return { rows: R, text: 'One whole tier is locked out for maintenance: its positions leave the stock and the shuttles pool over the remaining tiers.', ok: pos != null && cap.required_positions != null && pos >= cap.required_positions };
  }
  if (kind === 'dock') {
    const nIn = dk.n_bays_in, nOut = dk.n_bays_out;
    R.push(['IN bays', num(nIn), num(Math.max(0, nIn - 1))], ['OUT bays', num(nOut), num(Math.max(0, nOut - 1))],
      // FIX (R18e): resources['docks IN'|'docks OUT'].limit_moves_h is the installed-bay capacity at rho 0.85 (R18d1), not the level-of-service flow. Old cause: the label said "limit" with no capacity meaning.
      ['IN dock capacity (moves/h)',mf.resources && mf.resources['docks IN'] ? num(mf.resources['docks IN'].limit_moves_h, 0) : 'n/a', mf.resources && mf.resources['docks IN'] ? num(mf.resources['docks IN'].limit_moves_h * (nIn - 1) / nIn, 0) : 'n/a'],
      ['OUT dock capacity (moves/h)',mf.resources && mf.resources['docks OUT'] ? num(mf.resources['docks OUT'].limit_moves_h, 0) : 'n/a', mf.resources && mf.resources['docks OUT'] ? num(mf.resources['docks OUT'].limit_moves_h * (nOut - 1) / nOut, 0) : 'n/a']);
    // FIX (R18e): the dock figures are installed-bay capacity, not the system limit; the system binding is max_flow.binding_now (lifts in the example). Old cause: the text used docks_planned.binding ("docks OUT"), which read as if the docks bound the system.
    return { rows: R, text: `One bay is closed: trucks queue longer and the dock capacity drops in proportion to the bays left. Binding today: ${mf.binding_now || 'n/a'}.`, ok: true };
  }
  return { rows: [], text: 'This failure does not apply to this design.', ok: true };
}
function pWhatIf(c) {
  const sc = () => globalThis.APW && globalThis.APW.scene;
  let kind = null;
  const out = h('div.an-stack'), res = h('div.an-stack');
  const chips = h('div.seg.an-seg', { role: 'radiogroup', 'aria-label': 'Failure to show' });
  const set = (k) => {
    kind = kind === k ? null : k;
    chips.querySelectorAll('button').forEach((b) => { const on = b.dataset.k === kind; b.setAttribute('aria-checked', on); b.tabIndex = on || (!kind && b.dataset.k === CONTINGENCIES[0].id) ? 0 : -1; });
    const api = sc();
    try { if (api && api.setContingency) api.setContingency(kind); } catch (e) { console.warn('[contingency] scene call failed', e); }
    if (!kind) { res.replaceChildren(h('p.muted', 'Pick a failure to see its effect on the numbers and in the 3D view.')); return; }
    const cr = contingencyRows(c.rep, kind);
    res.replaceChildren(h('p.an-why', cr.text), okChip(cr.ok, 'The design still copes', 'The design no longer copes'),
      table([{ label: 'Figure', get: (r) => r[0] }, { label: 'Normal', num: true, get: (r) => r[1] }, { label: 'With the failure', num: true, get: (r) => r[2] }], cr.rows, { caption: 'Contingency deltas' }),
      note('Approximate: the model\'s utilisation figures are scaled linearly with the units left (load divided by the remaining shuttles, lifts, tiers or bays). Repair times and availability are assumptions.'),
      api && api.setContingency ? null : note('The 3D view of this failure is not available in this build of the scene.'));
    announce(`${CONTINGENCIES.find((x) => x.id === kind).label}: ${cr.text}`);
  };
  CONTINGENCIES.forEach((x, i) => chips.append(h('button', { type: 'button', role: 'radio', 'data-k': x.id, 'aria-checked': 'false', tabindex: i === 0 ? '0' : '-1', onclick: () => set(x.id) }, icon(x.icon, 'sm'), x.label)));
  chips.addEventListener('keydown', (e) => {
    if (!/^Arrow/.test(e.key)) return; e.preventDefault();
    const ids = CONTINGENCIES.map((x) => x.id), i = Math.max(0, ids.indexOf(kind)), j = (i + (/Right|Down/.test(e.key) ? 1 : -1) + ids.length) % ids.length;
    set(ids[j]); chips.children[j].focus();
  });
  const clear = h('button.btn.ghost', { type: 'button', onclick: () => { if (kind) set(kind); } }, icon('x', 'sm'), 'Back to normal operation');
  out.append(h('p.an-why', 'Switch a failure on to see it in the 3D scene and its effect on the numbers.'), chips, res, h('div.row', clear));
  res.replaceChildren(h('p.muted', 'Pick a failure to see its effect on the numbers and in the 3D view.'));
  c.onLeave = () => { try { const api = sc(); if (api && api.setContingency) api.setContingency(null); } catch (e) { /* scene gone */ } };
  return out;
}

// ---------------------------------------------------------------- the tab strip
const LEADS = { fleet: (rep) => ioStrip(rep.io_path), areas: (rep) => areaBar(rep.areas), flow: (rep) => dockPlan(rep), racks: (rep) => tierGauge(rep) };
const TABS = [
  { id: 'fleet', label: 'Fleet and lifts', render: pFleet }, { id: 'areas', label: 'Areas', render: pAreas }, { id: 'flow', label: 'Capacity and flow', render: pFlow },
  { id: 'racks', label: 'Tiers and racks', render: pRacks }, { id: 'cost', label: 'Cost and energy', render: pCost }, { id: 'staff', label: 'Staff and rules', render: pStaff }, { id: 'shapes', label: 'Shapes', render: pShapes }, { id: 'team', label: 'Team cases 1–4', render: pTeam },
  { id: 'service', label: 'Service level', render: pService }, { id: 'tiers', label: '7 vs 8 tiers', render: pTiers }, { id: 'growth', label: 'Growth', render: pGrowth }, { id: 'whatif', label: 'Contingency', render: pWhatIf },
];
/** mountAnalysis({ R, rep, pushToMax() }) -> { el, destroy() }. `R` = state.result (extras and the shape comparison are cached on it). */
export function mountAnalysis(ctx) {
  const c = { ...ctx, onLeave: null };
  let cur = (state.analysisTab && TABS.some((t) => t.id === state.analysisTab)) ? state.analysisTab : 'fleet';
  const strip = h('div.an-tabs', { role: 'tablist', 'aria-label': 'Design analysis' });
  const panel = h('div.an-panel', { role: 'tabpanel', tabindex: '-1' });
  c.rerender = () => paint(false);
  function paint(animate = true) {
    if (c.onLeave) { c.onLeave(); c.onLeave = null; }
    strip.querySelectorAll('button').forEach((b) => { const on = b.dataset.id === cur; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
    const t = TABS.find((x) => x.id === cur);
    panel.setAttribute('aria-labelledby', 'an-tab-' + cur); panel.id = 'an-panel';
    let body;
    try { body = t.render(c); } catch (e) { console.error(e); body = fail(e); }
    // R26d V8: the first four tabs open with one drawing (the lead), the tables and prose follow
    try { const lead = LEADS[t.id] && LEADS[t.id](c.rep); if (lead) body = h('div.an-leadwrap', lead, body); } catch (e) { console.warn('[analysis] lead picture failed', e); }
    panel.replaceChildren(body);
    if (animate && !reducedMotion()) panel.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(0.2,0,0,1)' });
  }
  TABS.forEach((t) => strip.append(h('button.an-tab', { type: 'button', role: 'tab', id: 'an-tab-' + t.id, 'data-id': t.id, 'aria-controls': 'an-panel', onclick: () => { cur = t.id; state.analysisTab = cur; paint(); } }, t.label)));
  strip.addEventListener('keydown', (e) => {
    if (!/^(Arrow(Left|Right)|Home|End)$/.test(e.key)) return; e.preventDefault();
    const i = TABS.findIndex((t) => t.id === cur), n = TABS.length, j = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
    cur = TABS[j].id; state.analysisTab = cur; paint(); strip.children[j].focus();
  });
  paint(false);
  const el = h('section.card.an', { 'aria-labelledby': 'an-h' }, h('header.an-h', h('h2.sec-h#an-h', 'Design analysis'), h('p.cap', 'Fleet, areas, flow limits, docks, tiers and racks, cost and energy, staff, shapes, the four team cases, service level, growth and failures.')), strip, panel);
  return { el, destroy() { if (c.onLeave) c.onLeave(); } };
}
