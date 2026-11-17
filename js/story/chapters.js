// Story chapters (B5, rebuilt in R9b for the 6-way model): one message sentence, one to three numbers and one small chart per item, plus the camera shots of the 3D scene.
// Every number comes from the report (KPI rows, headline, scene, fleet, max_flow, io_path, tier_rule, `story` block).
// FIX (R13b): the comparison with the slide-12 example (base report, delta texts, validation chapter, smallest-footprint search) is removed; the 12th chapter is now the tier rule.
// Sentences are built from the numbers and change when the numbers change, so no claim is hard-coded. Waits are labelled approximate.
import { fmtNum, fmtPct, eur, dockCaseLabel } from '../ui.js';
import { hbars, stack, line } from './charts.js';
import { capacityView, changeText } from '../diagnosis.js';

export const kpi = (rep, key) => {
  if (!rep) return null;
  for (const g of rep.groups || []) for (const r of g.kpis) if (r.key === key) return r.value;
  return null;
};
const pct = (x) => fmtPct(x * 100);
const num = (x, d = 0) => fmtNum(x, d);
const dim = (x) => fmtNum(x, 1).replace(/\.0$/, '');
const MINUS = '−';
const ASSUME = { abc: 'The 20 / 30 / 50 % column classes and 80 / 15 / 5 % of the moves are assumptions.', res: 'Availability and repair times are assumptions.', en: 'Energy rates, charging losses and the PV yield are assumptions.',
  cost: 'Unit costs are assumptions.', honey: 'The lane release and the resulting honeycombing fill are assumptions.' };

/** Kept for the callers; numbers carry no comparison any more (FIX (R13b): the slide-12 example comparison was removed). */
export const deltaText = () => '';

// FIX (R18e): the verb is part of the phrase (old cause: "The lifts is the tightest resource" from the singular verb after a plural subject)
const BIND = { lifts: 'The lifts are', shuttles: 'The shuttle fleet is', 'docks IN': 'The IN dock line is', 'docks OUT': 'The OUT dock line is', 'dock wall': 'The dock wall is' };
const SIDES = { U: 'the same side', I: 'opposite sides', L: 'adjacent sides' };
const CAUSE = { control: 'the control system', dock: 'the dock conveyor lines', tier: 'tier lock-outs', grid: 'the power grid', lift: 'the lifts' };

/** ", best N (P %)" for the short caption of a missed target, from the diagnosis block ('' when the report has no best-possible row). */
function capBest(rep) {
  const bp = (rep.diagnosis || {}).best_possible;
  return bp && !bp.reached_target && bp.expected_stored != null ? `, best ${fmtNum(bp.expected_stored, 0)} (${fmtNum(bp.share_of_target * 100, 0)} %)` : '';
}

/** R17b: the diagnosis in one sentence for the story: what the building can do at best and the top change that solves it. */
export function capGap(rep) {
  const dg = rep.diagnosis || {}, bp = dg.best_possible, cv = capacityView(rep);
  const top = (dg.options || []).find((o) => o.solves) || (dg.options || [])[0];
  const parts = [];
  if (bp && !bp.reached_target) parts.push(`the best it can do is ${num(bp.expected_stored)} pallets (${num(bp.share_of_target * 100)} % of the target) with ${bp.lane_pattern} lanes`);
  else if (cv.expectedStored != null) parts.push(`it stores ${num(cv.expectedStored)} pallets on average`);
  if (top) parts.push(`${top.solves ? 'a change that solves it' : 'the most helpful change'}: ${changeText(top).replace(/\s*\(.*$/, '')}${top.capex_delta_eur != null ? `, CAPEX ${top.capex_delta_eur >= 0 ? '+' : MINUS}€ ${Math.abs(top.capex_delta_eur) >= 1e6 ? fmtNum(Math.abs(top.capex_delta_eur) / 1e6, 1) + ' M' : fmtNum(Math.abs(top.capex_delta_eur) / 1e3, 0) + ' k'}` : ''}`);
  return parts.length ? parts.join('; ') : 'see the diagnosis on the results page';
}

function lanes(d) {
  if (d.depth) return `${d.depth}-deep lanes`;
  if (d.modules && d.modules.length) return `mixed lanes (${[...new Set(d.modules)].join(' + ')} deep)`;
  return 'lanes';
}
const sum = (a) => a.reduce((x, y) => x + (y || 0), 0);

/** R24 V5: the shuttle cycle parts in three groups, one resource colour each (old: five rows in the free series hues, blue next to the OUT blue). Sums come from the report's parts. */
function cycleGroups(parts) {
  const sumOf = (re, inv) => parts.filter((p) => (re.test(p.label) !== !!inv)).reduce((a, p) => a + (p.s || 0), 0);
  return [{ label: 'Load and unload', value: sumOf(/load/i), role: 'shuttle' }, { label: 'Travel (aisle, channel, lane)', value: parts.filter((p) => !/load|turn/i.test(p.label)).reduce((a, p) => a + (p.s || 0), 0), role: 'structure' },
    { label: 'Turns', value: sumOf(/turn/i), role: 'ink' }];
}

/** All chapters for a report. */
export function buildChapters(rep) {
  const d = rep.design, hd = rep.headline, sc = rep.scene, st = rep.story, cy = sc.cycle, fl = rep.fleet || {}, cap = rep.capacity || {}, mf = rep.max_flow || {}, io = rep.io_path;
  const k = (key) => kpi(rep, key);
  const flow = st.flow || sc.flow || 'U';
  const tot = sc.shuttles.total;                              // shuttles in total (one pooled fleet)
  // FIX (R18e): spare shuttles from the report, not assumed (old cause: text always said "including the spare"; the example has no spare shuttle, in_service = total = 9)
  const shSpare = tot - (sc.shuttles.in_service ?? tot);
  const ul = (mf.storage && mf.storage.utilisation_limits) || {};   // FIX (R18e): the utilisation caps come from the report (old cause: "85 %" and "80 %" were typed into the labels)
  const abcK = (pre) => k(pre + flow) ?? k(pre + 'U') ?? k(pre + 'I') ?? k(pre + 'L');
  const gainU = abcK('abc.gain_');
  const flowMoves = cy.in_per_h + cy.out_per_h;
  // FIX (R18e): installation added (old cause: the report's installation part was missing from the bars; the parts still sum below the headline CAPEX, see the report)
  const capexParts = [['Racks', 'cost.capex_pos_lo'], ['Shuttles', 'cost.capex_shuttle_lo'], ['Lifts', 'cost.capex_lift_lo'], ['Conveyors', 'cost.capex_conv_lo'],
    ['Controls', 'cost.capex_ctrl_lo'], ['Chargers', 'cost.capex_charger_lo'], ['Installation', 'cost.capex_inst_lo']].map(([label, key]) => ({ label, value: k(key) })).filter((x) => x.value != null);
  // FIX (R18e): the rest of the headline CAPEX (building, fire protection, anything the report does not list as a part) is shown as one bar computed from the report (headline CAPEX minus the listed parts). Old cause: the bars summed to 1.42 M against a headline of 2.62 M with no word on the gap.
  { const listed = capexParts.reduce((a, x) => a + x.value, 0), rest = hd.capex_low_eur != null ? hd.capex_low_eur - listed : null; if (rest != null && rest > 1) capexParts.push({ label: 'Building and the rest of the headline CAPEX', value: rest }); }
  capexParts.sort((a, b) => b.value - a.value);
  const depthN = d.depth ? Number(d.depth) : null;
  const ab = rep.abc || {};          // R10b: top-level abc block (is_*, honey_*, ia_*)
  // FIX (R18e): the layout sentence names the report's dock case (old cause: the cycle-flow letter U / I / L was turned into 'IN and OUT on the same side', which is wrong for the 2+2 example)
  const dockTxt = rep.docks && rep.docks.case ? `dock case ${rep.docks.case}` : dockCaseLabel(rep.docks);
  const bind = mf.binding_now || (mf.storage && mf.storage.binding);

  const C = [];
  C.push({
    id: 'challenge', title: 'The challenge', item: 'Brief', dur: 8,
    // FIX (R21b, A9-10): captions stay within about 3 words per second of chapter time (this one was 37 words in 8 s with the diagnosis sentence). The change that solves a missed target is on the results page (diagnosis card).
    msg: `${num(cy.in_per_h)} pallets in, ${num(cy.out_per_h)} out every hour through a ${dim(sc.building.L)} × ${dim(sc.building.W)} × ${dim(sc.building.H)} m building.${cap.ok === false ? ` Target ${num(cap.target_pallets)} pallets: not reachable${capBest(rep)}.` : ''}`,
    nums: [
      { label: 'Pallets in', value: cy.in_per_h, dec: 0, unit: 'pallets/h' },
      { label: 'Pallets out', value: cy.out_per_h, dec: 0, unit: 'pallets/h' },
      { label: 'Positions needed', value: cap.required_positions, dec: 0, unit: 'positions', note: 'To store the target with probability cap_sl (0.90, an assumption); the lane fill (honeycombing) is an assumption too.' },
    ],
    chart: () => hbars({ title: 'Pallet positions needed to store the target and built', fmt: (x) => num(x), unit: 'positions', items: [
      { label: `Needed to store ${num(cap.target_pallets)} pallets`, value: cap.required_positions, role: 'structure' }, { label: 'Built in this design', value: hd.positions, role: 'ink' }] }),
  });
  C.push({
    id: 'design', title: 'The design', item: 'Brief 1, 2', dur: 8,
    // FIX (R18e): "2,304 pallets" was wrong (2,304 are positions; 1,344 is the expected stored), the spare shuttle count is read from the report (old cause: "including the spare" typed in, no spare in the example)
    msg: `${d.tiers} tiers of ${lanes(d)} hold ${num(hd.positions)} pallet positions, served by ${hd.lifts} shuttle lifts${hd.lifts_working != null ? ` (${hd.lifts_working} working)` : ''} and ${tot} shuttles${shSpare > 0 ? ` (${shSpare} spare)` : ''}.`,
    nums: [
      { label: 'Pallet positions', value: hd.positions, dec: 0, unit: 'positions'},
      { label: 'Shuttle cycle', value: hd.shuttle_cycle_s, dec: 1, unit: 's', lower: true },
      { label: 'Shuttles in total', value: tot, dec: 0, unit: 'shuttles'},
    ],
    chart: () => stack({ title: 'Where one shuttle cycle goes', fmt: (x) => num(x, 1), unit: 's', totalText: `${num(sum(st.cycle_parts.map((p) => p.s)), 1)} s per cycle`,
      items: cycleGroups(st.cycle_parts) }),
  });
  // R24 V5 (team decision D1, 2026-11-17): 8 chapters (was 12). Resilience, throughput and growth are one chapter ("flow"), energy and cost one chapter ("cost"), shape / ABC and
  // density one chapter ("layout"); the tier rule is chapter 3. One sentence of at most 22 words per chapter, at most six chart rows, resource colours (tokens.css --role-*).
  const sat = (label, value, role, tone) => ({ label, value, role, tone });
  C.push({
    id: 'fleet', title: 'One fleet, any tier', item: 'Brief b', dur: 9,
    msg: `${tot} shuttles form one pool: any shuttle serves any of ${d.tiers} tiers (${fl.lift_mode === 'M1' ? 'it rides the lift' : fl.lift_mode === 'M2' ? 'hand-over at the lift' : 'lift mode ' + fl.lift_mode}). A tier-captive fleet needs ${fl.captive_N ?? 'more'}.`,
    nums: [
      { label: 'Shuttles in total', value: tot, dec: 0, unit: 'shuttles'},   // FIX (R18e): label matches the report (no spare is assumed)
      { label: 'Shuttle utilisation', value: fl.u, dec: 0, unit: '%', scale: 100},
      { label: 'Tier-captive fleet, for comparison', value: fl.captive_N, dec: 0, unit: 'shuttles', note: 'Fleet policy is evaluated per design: pool against tier-captive (Kumar 2014).' },
    ],
    chart: () => hbars({ title: 'Fleet size by dispatch policy', fmt: (x) => num(x), unit: 'shuttles', items: [
      { ...sat('Pooled fleet (this design)', tot, 'shuttle') }, sat('Tier-captive', fl.captive_N, 'structure', 0.75),
      sat('Roaming, idle-only dispatch', k('fleet.roaming_min_idle_only'), 'structure', 0.55), sat('Roaming, tier-matching', k('fleet.roaming_min_strict'), 'structure', 0.4)].filter((x) => x.value != null) }),
  });
  if (io && io.IN) {
    const stages = io.IN.stages || [];
    // four phases, each one resource colour (the nine steps stay in the chart's data table and the Fleet tab)
    const PHASE = [['Truck and dock', 'structure', ['forklift', 'truck', 'dock']], ['Conveyor and bay', 'in', ['conveyor', 'bay']], ['Lift', 'lift', ['lift']], ['Shuttle and lane', 'shuttle', ['shuttle']]];
    const phaseOf = (res) => (PHASE.find((p) => p[2].includes(res)) || PHASE[3]);
    const phases = PHASE.map(([label, role]) => ({ label, role, value: sum(stages.filter((x) => phaseOf(x.resource)[0] === label).map((x) => x.time_s)) }));
    C.push({
      id: 'iopath', title: 'From the truck to the lane', item: 'Brief 15', dur: 16,
      msg: `A pallet needs ${num(io.IN.total_with_wait_s ?? io.IN.total_s, 0)} s from truck to lane and ${num(io.OUT.total_with_wait_s ?? io.OUT.total_s, 0)} s back out, via dock, conveyor, lift and shuttle.`,
      nums: [
        { label: 'Path time IN', value: io.IN.total_with_wait_s ?? io.IN.total_s, dec: 0, unit: 's', lower: true },
        { label: 'Path time OUT', value: io.OUT.total_with_wait_s ?? io.OUT.total_s, dec: 0, unit: 's', lower: true },
        { label: 'Wait at the lift (approximate)', value: io.IN.queue_wait_s, dec: 0, unit: 's', note: 'Queue waits are approximate (about ±15 %); utilisation is the primary figure.' },
      ],
      chart: () => stack({ title: 'The IN path in four phases, model seconds', fmt: (x) => num(x, 1), unit: 's', totalText: `${num(io.IN.total_s, 0)} s without waiting`, items: phases }),
    });
  }
  const isLane = ab.is_lane ?? (depthN ? 1 / depthN : null);
  C.push({
    id: 'layout', title: 'Layout and density', item: 'Brief a', dur: 9, abc: true,
    msg: `${gainU != null && gainU < -0.005 ? `ABC columns cut the shuttle cycle by ${pct(-gainU)} %` : 'The layout, not ABC, sets the shuttle cycle'}; lanes fill ${pct(ab.honey_design)} % on average (honeycombing).`,
    nums: [
      { label: 'ABC effect', value: gainU, dec: 0, unit: '%', scale: 100, note: ASSUME.abc },
      { label: 'Lane fill with honeycombing', value: ab.honey_design, dec: 0, unit: '%', scale: 100, note: ASSUME.honey },
      { label: 'Selectivity of the lanes', value: isLane, dec: 2, unit: '', note: 'Selectivity (I_S) = pallets reachable without moving another / pallets in the lane = 1 / lane depth, positions-weighted (definition).' },
    ],
    chart: () => hbars({ title: 'Lane fill by lane depth (honeycombing with lane release)', fmt: (x) => `${num(x * 100, 1)} %`, unit: '', max: 1, items: [
      { label: '6-deep lanes', value: ab.honey_d6, text: `${num(ab.honey_d6 * 100, 1)} %`, role: 'structure', tone: 0.55 }, { label: '3-deep lanes', value: ab.honey_d3, text: `${num(ab.honey_d3 * 100, 1)} %`, role: 'structure', tone: 0.8 },
      { label: 'This design', value: ab.honey_design, text: `${num(ab.honey_design * 100, 1)} %`, role: 'ink' }].filter((x) => x.value != null) }),
  });
  // R10b: the throughput rows come from the pooled max-flow block (old per-flow values live in throughput.legacy_*)
  // FIX (R18e): the utilisation caps in the labels come from max_flow.storage.utilisation_limits (old cause: typed as "85 %" / "80 %"); the dock rows are the capacity of the installed bays (R18d1-D), not the level-of-service flow
  const pcs = (x) => (x == null ? '' : `, ${Math.round(x * 100)} %`);
  const ROLE_OF = { lifts: 'lift', shuttles: 'shuttle', 'docks IN': 'in', 'docks OUT': 'out' };
  const limits = [[`Lifts (pooled${pcs(ul.lift_rho_max)})`, 'throughput.limit_lift_out', 'lifts'], [`Shuttle fleet${pcs(ul.shuttle_u_max)}`, 'throughput.limit_shuttles', 'shuttles'], ['IN bays', 'throughput.limit_dock_in', 'docks IN'], ['OUT bays', 'throughput.limit_dock_out', 'docks OUT']]
    .map(([label, key, rk]) => ({ label: rk === bind ? `${label} · binds` : label, value: k(key), role: rk === bind ? 'bind' : ROLE_OF[rk] })).filter((x) => x.value != null);
  // FIX (R18e): years.stock is 0.0 when the target is not reached (the positions are already short of the target stock) and None when the report has no value; the text printed "full in 0.0 years" (old cause: 0.0 was shown as a number).
  // FIX (R21b, G12): the story tells years.system (the first of stock, lifts, shuttles and docks to reach its limit)
  const ySys = st.growth.years.system;
  C.push({
    id: 'flow', title: 'Flow, resilience and growth', item: 'Briefs c, e, f', dur: 10,
    msg: `${BIND[bind] || 'The bottleneck is'} the tightest resource: ${num(k('throughput.bottleneck'))} moves/h, ${num(k('throughput.m_star'), 2)} times the plan flow.`,
    nums: [
      { label: 'Bottleneck capacity', value: k('throughput.bottleneck'), dec: 0, unit: 'moves/h'},
      { label: 'Pallets held back per year', value: k('resilience.loss_now'), dec: 0, unit: 'pallets', lower: true, note: ASSUME.res },
      { label: 'Years until the first limit', value: ySys, dec: 1, unit: 'years', note: `The ${pct(st.growth.rate)} % yearly growth is an assumption.` },
    ],
    chart: () => hbars({ title: 'Capacity of each resource against the plan flow', fmt: (x) => num(x), unit: 'moves/h', ref: { value: flowMoves, label: `plan flow ${num(flowMoves)} moves/h` }, items: limits }),
  });
  // grouped CAPEX: one row per resource colour, everything else in one grey row
  const cx = (lab) => capexParts.filter((x) => x.label === lab).reduce((a, x) => a + x.value, 0);
  const capexTotal = hd.capex_low_eur != null ? hd.capex_low_eur : capexParts.reduce((a, x) => a + x.value, 0);
  const capexRows = [{ label: 'Racks', value: cx('Racks'), role: 'structure' }, { label: 'Shuttles', value: cx('Shuttles'), role: 'shuttle' }, { label: 'Lifts', value: cx('Lifts'), role: 'lift' }];
  capexRows.push({ label: 'Building and other', value: Math.max(0, capexTotal - capexRows.reduce((a, x) => a + x.value, 0)), role: 'ink' });
  C.push({
    id: 'cost', title: 'Cost and energy', item: 'Brief d', dur: 8,
    msg: `${eur(hd.capex_eur)} to build, ${eur(hd.annual_eur)} a year to run, ${num(k('energy.total'), 1)} kWh a day.`,
    nums: [
      { label: 'CAPEX', value: hd.capex_eur, dec: 0, unit: '€', lower: true, note: ASSUME.cost },
      { label: 'Annual cost', value: hd.annual_eur, dec: 0, unit: '€/year', lower: true, note: ASSUME.cost },
      { label: 'Energy per day', value: k('energy.total'), dec: 1, unit: 'kWh/day', lower: true, note: ASSUME.en },
    ],
    chart: () => hbars({ title: 'CAPEX by part', fmt: (x) => eur(x), unit: '', items: capexRows.map((x) => ({ ...x, text: eur(x.value) })) }),
  });
  C.splice(2, 0, tiersChapter(rep));
  return C;
}

/** Chapter 3: the tier rule (R12b). The tier count is the smallest of six limits; Tappia et al. (2016): diminishing returns above about 7 tiers, a marker and not a cap. */
function tiersChapter(rep) {
  const tr = rep.tier_rule, cap = rep.capacity || {}, pl = rep.plan || {}, nx = (tr && tr.next) || {};
  const NAME = { user_cap: 'Your cap', vendor: 'Supplier height class', structure: 'Rack structure', fire: 'Fire clearance', height: 'Clear height', lift_perf: 'Lift performance' };
  let msg;
  if (!tr) msg = `${rep.design.tiers} tiers fit in ${dim(rep.design.H)} m.`;
  else {
    // FIX (R21b, A9-10): 62 words in 9 s before; now within about 3 words per second. The capacity sentence (positions held against stored and needed) is dropped here: the challenge chapter says it and the numbers below carry the expected stored.
    msg = `${tr.tiers} tiers: ${tr.binding} binds. One more tier needs ${num(nx.height_needed, 1)} m${nx.height_short > 0 ? ` (${num(nx.height_short, 1)} m short)` : ''}.`;
    if (tr.tiers_soft != null) msg += ` Above ${tr.tiers_soft} tiers the gain shrinks.`;
  }
  const lims = tr ? Object.entries(tr.limits || {}).filter(([, x]) => x != null && x < 30).map(([key, x]) => ({ value: x, role: x === tr.tiers ? 'bind' : 'structure', tone: x === tr.tiers ? null : 0.7, label: (NAME[key] || key) + (x === tr.tiers ? ' · binds' : '') })) : [];
  return {
    id: 'tiers', title: 'How many tiers', item: 'Brief 1', dur: 9, msg,
    nums: [
      { label: 'Tiers', value: tr ? tr.tiers : rep.design.tiers, dec: 0, unit: 'tiers' },
      { label: 'Expected stored (positions × lane fill)', value: pl['plan.expected_stored'], dec: 0, unit: 'pallets', note: ASSUME.honey },
      { label: 'Gain of one more tier', value: nx.positions_gain, dec: 1, unit: '%', scale: 100 },
    ],
    chart: () => hbars({ title: 'Tiers allowed by each limit (the smallest binds)', fmt: (x) => num(x), unit: 'tiers', items: lims.length ? lims : [{ label: 'No tier rule in this report', value: 0, text: 'n/a', series: 5 }] }),
  };
}

/** Display value of a number spec (scale: 100 for fractions shown as %). */
export const numValue = (n) => (n.value == null ? null : n.value * (n.scale || 1));
export const numText = (n) => (n.value == null ? 'n/a' : n.unit === '%' ? fmtPct(numValue(n)) : fmtNum(numValue(n), n.dec || 0));

// ---------------------------------------------------------------- camera shots
/** Shots per chapter id. `api` = APW.scene. Shots reuse the default tour (scene_spec section 6) and add energy / growth / cost variants; the I/O chapter plays the pallet path. */
export function chapterShots(api, rep) {
  // FIX (R18e): a shot name falls back to its prefix (old cause: scene/shots.js names the shots per block on several-block scenes, "Rack detail 1", "Lift 2"; the exact match found nothing and the density / resilience / fleet shots lost their camera target)
  const defs = api.defaultShots(), by = (n) => defs.find((s) => s.name === n) || defs.find((s) => s.name.startsWith(n + ' '));
  const sc = rep.scene, B = sc.building, cx = B.L / 2, cyy = B.W / 2, diag = Math.hypot(B.L, B.W);
  const mk = (s, o = {}) => ({ ...s, text: '', ...o, onEnter: (host) => { if (host && host.setABC) host.setABC(!!o.abc); if (host && host.setTierGauge) host.setTierGauge(!!o.gauge);      // FIX (R13c): the tier-limit gauge was never switched on by the tiers chapter (old cause: no shot called setTierGauge; the host hook existed)
    if (o.after) o.after(host); } });
  const ext = by('Exterior'), cut = by('Cut-away'), rack = by('Rack detail'), lift = by('Lift'), aisle = by('Aisle'), dock = by('Dock'), over = by('Overview');
  const pick = (...xs) => xs.find(Boolean);
  const out = {};
  // R24 V5 (Visual_plan table 5): one subject per chapter, framed in the safe zone (the stage right of the caption panel), at most 3 labels. `subject` is checked by tools/qa_labels.py
  // through scene.subjectScreen(); `labels` are kinds ('lift', 'shuttle', 'rack', 'dock', 'zones') or {text, at: [x, y, z] in model metres}.
  const az = (deg, r, z) => { const a = (deg * Math.PI) / 180; return [cx + Math.cos(a) * r, cyy + Math.sin(a) * r, z]; };
  const dk = api.world && api.world.docks ? (api.world.docks.in || api.world.docks.out) : null;
  out.challenge = [mk(ext, { dur: 8, shell: 'cut', env: 'day', orbit: 28, labels: [], subject: 'building',       // R24 V3 / V5: opens on the cut-away building (old: the closed box and a close-up of its wall)
    from: { pos: az(-125, diag * 1.55, B.H * 1.3 + diag * 0.2), target: [cx, cyy, B.H * 0.2], fov: 34 }, to: { pos: az(-125, diag * 1.4, B.H * 1.2 + diag * 0.18), target: [cx, cyy, B.H * 0.2], fov: 34 } })];
  out.design = [mk(cut, { dur: 8, env: 'day', labels: ['lift', 'shuttle', 'rack'], subject: 'lift',
    from: { pos: az(-55, diag * 1.05, B.H * 1.05 + diag * 0.1), target: [cx, cyy, B.H * 0.35], fov: 36 }, to: { pos: az(-70, diag * 0.95, B.H * 1.1 + diag * 0.1), target: [cx, cyy, B.H * 0.35], fov: 36 } })];
  // the dock corner: truck, bay, lift and lane in one picture (old: a floor-level shot); the pallet path itself is traced by playIOPath
  const nx = dk ? dk.nx : -1, ny = dk ? dk.ny : 0, lx = -ny, ly = nx, bx = dk ? dk.x : 0, by2 = dk ? dk.y : cyy;
  const corner = dk ? { shell: 'open', from: { pos: [bx - nx * diag * 0.85 + lx * diag * 0.62, by2 - ny * diag * 0.85 + ly * diag * 0.62, B.H * 1.9], target: [bx + nx * diag * 0.4, by2 + ny * diag * 0.4, 3], fov: 42 },
    to: { pos: [bx - nx * diag * 0.75 + lx * diag * 0.52, by2 - ny * diag * 0.75 + ly * diag * 0.52, B.H * 1.7], target: [bx + nx * diag * 0.4, by2 + ny * diag * 0.4, 3], fov: 42 } } : {};
  out.iopath = [mk(pick(dock, over), { name: 'I/O path', dur: 16, env: 'day', labels: ['dock', 'lift'], subject: dk ? 'dock' : 'building', ...corner,
    after: () => { try { api.playIOPath && api.playIOPath('in', { seconds: 14 }); } catch (e) { console.warn('[story] playIOPath failed', e); } } })];
  // the fleet and the flow chapters look at the cut-away building from the other sides (the default Lift shot circles one lift at 7 m inside the rack, where only steel is in the picture; actors in focus are V7)
  const side = (deg, k = 1) => ({ from: { pos: az(deg, diag * 1.05 * k, B.H * 1.05 + diag * 0.1), target: [cx, cyy, B.H * 0.35], fov: 36 }, to: { pos: az(deg + 12, diag * 0.95 * k, B.H * 1.1 + diag * 0.1), target: [cx, cyy, B.H * 0.35], fov: 36 } });
  out.fleet = [mk(cut, { dur: 9, env: 'day', labels: ['shuttle', 'lift'], subject: 'lift', ...side(40) })];
  out.layout = [mk(over, { name: 'Lift stations', dur: 5, abc: true, labels: ['lift'], subject: 'lift',
      from: { pos: [cx, cyy - 0.5, diag * 1.05], target: [cx, cyy, 0], fov: 30 }, to: { pos: [cx, cyy - 0.5, diag * 1.0], target: [cx, cyy, 0], fov: 30 } }),
    mk(pick(rack, aisle), { dur: 4, abc: false, labels: ['rack'], subject: 'rack' })];
  out.flow = [mk(cut, { name: 'Flow', dur: 10, env: 'day', labels: ['lift', 'dock'], subject: 'lift', ...side(135) })];
  out.cost = [mk(cut, { name: 'Cost', dur: 8, env: 'day', labels: ['lift', 'shuttle'], subject: 'lift' })];
  { const bb = (sc.footprint && sc.footprint.bbox) || [0, 0, B.L, B.W], gx = bb[0] - 4.5, gy = bb[1] - 4.5, Hr = sc.tiers * sc.tier_pitch, tr = rep.tier_rule;
    out.tiers = [mk(pick(by('Tier limit'), cut), { name: 'Tiers', dur: 9, env: 'day', gauge: true, subject: { at: [gx, gy, Hr * 0.55] },      // FIX (R13c): the camera looked at the closed outer wall (old shot: Cut-away); the scene's own Tier limit shot shows the ruler
      labels: tr ? [{ text: `${tr.tiers} tiers`, at: [gx, gy, Hr], color: 0xc8401a }, { text: `${tr.binding} binds`, at: [gx, gy, Hr * 0.4], color: 0xc8401a }] : [] })]; }
  return out;
}
