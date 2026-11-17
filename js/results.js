// Results shell: design summary, feasibility, headline numbers, KPI groups, alternatives, and the slots for the 3D scene (B4) and the story (B5).
// Every number comes from the report; this file only formats and lays out.
import { h, icon, fmtKpi, fmtNum, fmtPct, eur, riseIn, countUp, announce, toast, assumeBadge } from './ui.js';
import { state, resetInputs } from './store.js';
import { model } from './model.js';
import { go } from './nav.js';
import { WALLS } from './fields.js';
import { scenePlan } from './scene/fallback.js';
import { mountAnalysis, designInputs } from './analysis.js';
import { diagnosisCard, statusInfo, capacityView, diagLead, limitPills } from './diagnosis.js';
import { loadFixedInputs } from './wizard.js';

const GROUP_ICON = { capacity: 'building', layout: 'grid', cycles: 'clock', fleet: 'shuttle', throughput: 'gauge', abc: 'layers', energy: 'bolt', cost: 'euro', resilience: 'shield', expansion: 'expand' };
// Presentation flags only: which figures rest on a model assumption (the report does not carry such a flag).
export const ASSUME_GROUP = {
  cost: 'Unit costs are assumptions (Tappia 2015 table, low / high case).',
  energy: 'Energy rates, charging losses and the PV yield are assumptions.',
  resilience: 'Availability and repair times are assumptions.',
  abc: 'The 20 / 30 / 50 % column classes and 80 / 15 / 5 % of the moves are assumptions.',
};
// FIX (R18e): keys follow the current report. Old cause: 'geometry.expected_stored', 'geometry.required_positions' and 'geometry.avg_stock' are not report keys any more (plan.expected_stored, plan.required, geometry.avg_stock_gross), so their notes never matched.
// story/print.js reads this map too (it walks the raw report groups), so the keys must be the report's own.
export const ASSUME_KEY = {
  'service.stock': 'The 85 % fill is an assumption.',
  'plan.expected_stored': 'The fill per lane depth (honeycombing) and the 0.90 capacity service level are assumptions.',
  'cycles.front_turns': 'The 4 s turn rule is an assumption (C27).',
  'cycles.front_channel': 'Front-channel riding is a design decision (2026-11-04).',
  'plan.required': 'The capacity service level (0.90) and the stock variability (0) are assumptions.',
};
// FIX (R17b): capacity rows are worded for the expected-stored reading (R17a). Old cause: the labels still said "scaled brief target" and planned stock at 85 % fill was the headline.
// FIX (R18e): keys renamed to plan.required and plan.feasible (plan.feasible is the "target met" flag). Old cause: geometry.required_positions / geometry.capacity_ok are no longer in the report, so these labels never applied.
export const KPI_LABEL = {
  'service.stock': 'Planned stock at 85 % fill (secondary)',
  'plan.required': 'Positions needed to store the target',
  'plan.feasible': 'Stores the capacity target',
};
// R17b / R17a-2: the model's legacy whole-building module block (3,024 pallets for the 2,304-position example, against 1,344 expected stored) stays hidden; plan.volume_utilisation is shown.
// FIX (R18e): the renamed legacy keys are hidden (*_gross), and every legacy.* key with them (kpiHidden). Old cause: the set held geometry.avg_stock, a key R18a renamed, so geometry.avg_stock_gross showed as a 3,024-pallet row.
export const KPI_HIDE = new Set(['geometry.avg_stock_gross', 'geometry.stock_gross', 'geometry.volume_utilisation_gross']);
export function kpiHidden(key) { return KPI_HIDE.has(key) || String(key).startsWith('legacy.'); }
const FIRST_ROWS = 6;

export function summaryLine(rep) {
  const d = rep.design || {};
  const lanes = d.depth ? `${d.depth}-deep lanes` : d.modules && d.modules.length ? `mixed lanes (${d.modules.join(' + ')})` : null;
  return [d.L != null && `${fmtNum(d.L, 1).replace(/\.0$/, '')} × ${fmtNum(d.W, 1).replace(/\.0$/, '')} × ${fmtNum(d.H, 1).replace(/\.0$/, '')} m`, lanes,
    d.tiers != null && `${d.tiers} tiers`, rep.headline && rep.headline.lifts != null && `${rep.headline.lifts} ${d.lift_type || ''} lifts`.replace('  ', ' '),
    rep.headline && rep.headline.shuttles != null && `${rep.headline.shuttles} shuttles`].filter(Boolean).join(' · ');
}

function headlineCards(rep, animate) {
  const hd = rep.headline || {};
  const defs = [
    ['Pallet positions', hd.positions, (x) => fmtNum(x, 0), 'positions'],
    ['Expected stored', hd.expected_stored, (x) => fmtNum(x, 0), 'pallets', 'Positions × lane fill (honeycombing); the fill per lane depth is an assumption.'],
    ['Positions needed', hd.required_positions, (x) => fmtNum(x, 0), 'for the target', `To store the capacity target with probability ${hd.cap_sl != null ? hd.cap_sl : 0.9} (assumption, the same level as the truck-bay service level).`],
    ['Shuttles (pooled fleet)', hd.shuttles, (x) => fmtNum(x, 0), 'shuttles'],   // FIX (R18e): was 'incl. spare'; the spare is a lift, the shuttles are one pool
    
    ['Lifts installed', hd.lifts, (x) => fmtNum(x, 0), 'lifts'],
    ['Maximum flow', hd.max_flow_moves_h, (x) => fmtNum(x, 0), rep.max_flow && rep.max_flow.binding_now ? `moves/h, ${rep.max_flow.binding_now} bind` : 'moves/h', 'The system limit: the lowest of the lifts, the shuttles and the docks; the resource named is the one that binds. Utilisation limits are assumptions.'],   // FIX (R18e): the binding resource is shown with the headline (old cause: the tile gave the number only, the binding resource sat in the analysis tab)
    ['CAPEX', hd.capex_eur, (x) => fmtNum(x, 0), '€', 'Unit costs are assumptions.'],
    ['Energy', hd.energy_kwh_day, (x) => fmtNum(x, 1), 'kWh/day', 'Energy rates are assumptions.'],
  ];
  return h('div.kpis', defs.map(([label, val, f, unit, note]) => {
    const n = h('span.n.num', val == null ? 'n/a' : f(val));
    if (animate && val != null) countUp(n, val, f);
    return h('div.card.kpi', h('div.l', label, note && assumeBadge(note)), h('div.nn', n, val != null && h('small', unit)));
  }));
}

// R24 V6 (Visual_plan 2, "Results top"): the answer first. A verdict (status + one sentence), five requirement pills with icon and word, four tiles, then the 3D stage.
const eurM = (x) => (x == null ? 'n/a' : Math.abs(x) >= 1e6 ? `€ ${fmtNum(x / 1e6, 2)} M` : `€ ${fmtNum(x / 1e3, 0)} k`);
function verdictBlock(rep, st) {
  const hd = rep.headline || {}, cv = capacityView(rep), mf = rep.max_flow || {};
  const pills = limitPills(rep);
  const tile = (label, value, sub, tone, note) => h('div.card.res-tile' + (tone ? '.' + tone : ''), h('div.l', label, note && assumeBadge(note)), h('div.nn', h('span.num', value)), sub && h('div.cap', sub));
  return h('section.res-verdict.tone-' + st.tone, { 'aria-label': 'Result at a glance' },
    h('div.rv-head', h('span.dg-ic', icon(st.ic)), h('div', h('h2.rv-title', st.title), h('p.rv-lead', diagLead(rep) || summaryLine(rep)))),
    pills.length ? h('ul.rv-pills', pills.map((p) => h('li.chip.' + (p.ok ? 'ok' : 'warn'), icon(p.ok ? 'check' : 'warn', 'sm'), p.name, h('span.rv-state', p.ok ? 'Met' : 'Falls short')))) : null,
    h('div.res-tiles',
      tile('Pallet positions', fmtNum(hd.positions, 0), cv.required != null ? `of ${fmtNum(cv.required, 0)} needed for the target` : null, cv.ok === false ? 'short' : null, 'Positions needed to store the target with probability cap_sl (0.90, an assumption); lane fill is an assumption too.'),
      tile('Shuttles + lifts', `${fmtNum(hd.shuttles, 0)} + ${fmtNum(hd.lifts, 0)}`, hd.lifts_working != null ? `${fmtNum(hd.lifts_working, 0)} lifts working, the rest spare` : 'one pooled shuttle fleet'),
      tile('Maximum flow', fmtNum(hd.max_flow_moves_h, 0), mf.binding_now ? `moves/h, ${mf.binding_now} bind` : 'moves/h', null, 'The system limit: the lowest of the lifts, the shuttles and the docks.'),
      tile('Investment', eurM(hd.capex_eur), hd.annual_eur != null ? `${eurM(hd.annual_eur)} a year to run` : null, null, 'Unit costs are assumptions.')));
}

function groupCard(g, rep) {
  let rows = g.kpis.filter((r) => !kpiHidden(r.key)).map((r) => (KPI_LABEL[r.key] ? { ...r, label: KPI_LABEL[r.key] } : r));
  if (g.id === 'capacity' && rep) {
    const cv = capacityView(rep);
    if (cv.expectedStored != null) {      // the capacity group leads with the figure the verdict is based on
      // FIX (R18e): the leading row replaces the report's plan.expected_stored row (same value, capacity.expected_stored) instead of a second row; the service level is read from capacity.cap_sl. Old cause: the report now carries plan.expected_stored, so the figure showed twice; the injected keys were not report keys.
      rows = rows.filter((r) => r.key !== 'plan.expected_stored');
      const at = rows.findIndex((r) => r.key === 'layout.positions');
      rows.splice(at + 1, 0, { key: 'plan.expected_stored', label: 'Expected stored (positions × lane fill)', value: cv.expectedStored, unit: 'pallets', fmt: 'int' },
        ...(cv.sl != null ? [{ key: 'capacity.cap_sl', label: 'Capacity service level', value: cv.sl, unit: '', fmt: '2' }] : []));
    }
  }
  if (!rows.length) return null;
  const mk = (r) => {
    const f = fmtKpi(r);
    const note = ASSUME_KEY[r.key] || ASSUME_GROUP[g.id];
    return h('div.kv', h('dt', r.label, note && assumeBadge(note)), h('dd.num', f.text, f.unit && h('span.u', ' ' + f.unit)));
  };
  const first = rows.slice(0, FIRST_ROWS), rest = rows.slice(FIRST_ROWS);
  const more = rest.length ? h('div.reveal', h('div', h('dl.kvs', rest.map(mk)))) : null;
  const btn = more && h('button.btn.ghost.more-btn', { type: 'button', 'aria-expanded': 'false', onclick: () => {
    const open = more.classList.toggle('open'); btn.setAttribute('aria-expanded', open); more.toggleAttribute('inert', !open);
    btn.firstChild.textContent = open ? 'Show fewer' : `Show ${rest.length} more`;
  } }, h('span', `Show ${rest.length} more`), icon('down', 'sm'));
  if (more) more.setAttribute('inert', '');
  return h('section.card.group', { 'aria-labelledby': 'g-' + g.id },
    h('header.group-h', h('span.ic', icon(GROUP_ICON[g.id] || 'info', 'sm')), h('h3', { id: 'g-' + g.id }, g.title), h('span.cap', `brief item ${g.item}`)),
    h('dl.kvs', first.map(mk)), more, btn, ASSUME_GROUP[g.id] && h('p.cap.group-note', ASSUME_GROUP[g.id]));
}

export function mountResults() {
  const R = state.result;
  const isOpt = R.mode === 'optimal';
  const main = h('div.res-main');
  let first = true, analysis = null;
  const altBusy = { v: false };

  function setView(index, report) {
    state.view = { index, report };
    paint();
  }

  // full report of alternative i (>= 1) as a Fixed warehouse with the same building, rack and lifts; cached, one call per alternative (also used by the story's compare table)
  const inflight = new Map();
  function evalAlt(i) {
    if (state.altCache.has(i)) return Promise.resolve(state.altCache.get(i));
    if (inflight.has(i)) return inflight.get(i);
    // FIX (R9b): the alternative is rebuilt from its building, aisle direction, lane depth and dock case plus the user's flows and options (designInputs).
    // Old cause: the payload carried chain-lift era inputs (lift_type, n_lifts, in_lift, out_lift, flow_scale) the integrated model ignores, and no lane depth for mixed racks.
    const alt = R.alternatives[i - 1], dm = /(\d)-deep/.exec(String(alt.label || ''));
    const p = designInputs({ ...R, mode: 'optimal' }, { design: { ...alt.design, depth: dm ? Number(dm[1]) : null, modules: dm ? null : [6, 3] } });
    const q = model.fixed(p).then((rep) => { state.altCache.set(i, rep); inflight.delete(i); return rep; }, (e) => { inflight.delete(i); throw e; });
    inflight.set(i, q);
    return q;
  }

  // Push to maximum flow: the same design re-evaluated at the maximum flow (bays re-sized within the wall length, installed shuttles kept). "Back to plan flow" returns to the report before.
  async function pushToMax() {
    const rep0 = state.view.report;
    const rep = await model.fixed({ ...designInputs(R, rep0), push_to_max: true });
    if (rep.ok === false) throw new Error((rep.reasons || ['not accepted']).join(' '));
    state.view = { index: state.view.index, report: rep, planReport: state.view.planReport || rep0 };
    paint();
    toast('Evaluated at the maximum flow.');
  }

  async function pick(i) {
    if (altBusy.v || state.view.index === i) return;
    if (i === 0) { setView(0, R.report); return; }
    const alt = R.alternatives[i - 1];
    if (state.altCache.has(i)) { setView(i, state.altCache.get(i)); return; }
    altBusy.v = true; paint();
    try {
      const rep = await evalAlt(i);
      if (rep.headline && alt.headline && rep.headline.positions !== alt.headline.positions) toast('Re-evaluated as a Fixed warehouse: positions differ slightly from the search card.');
      altBusy.v = false;
      setView(i, rep);
    } catch (e) {
      altBusy.v = false; paint();
      toast('This alternative could not be evaluated: ' + (e.message || e));
    }
  }

  // R13b: open any design of the compare table (a KPI champion, given as the fixed inputs of the design) as a Fixed warehouse; the best design returns to the search result
  async function openDesign(entry) {
    const isBest = (entry.kpis || [entry.kpi]).includes('best');
    if (isBest) { setView(0, R.report); return; }
    if (altBusy.v) return;
    altBusy.v = true;
    const inputs = { ...entry.inputs }, label = entry.label;
    if (inputs.shape_params && typeof inputs.shape_params === 'object') inputs.shape_params = JSON.stringify(inputs.shape_params);       // FIX (R13b): the service takes the L / U / T parameters as a JSON string; old cause: the champion object was passed as it is and the shape was ignored
    try {
      const rep = await model.fixed({ ...inputs });
      if (rep.ok === false) throw new Error((rep.reasons || ['not accepted']).join(' '));
      altBusy.v = false;
      state.view = { index: -1, report: rep, label, champ: entry };
      paint();
      toast(`Showing: ${label || 'selected design'}.`);
    } catch (e) { altBusy.v = false; toast('This design could not be opened: ' + (e.message || e)); }
  }

  function altCards() {
    const items = [{ label: R.report.label || 'Best design', why: 'Best for the goal', headline: R.report.headline, design: R.report.design, feasible: R.report.feasible }, ...R.alternatives];
    const box = h('div.alts', { role: 'radiogroup', 'aria-label': 'Design alternatives' }, items.map((a, i) => {
      const on = state.view.index === i;
      const hd = a.headline || {}, d = a.design || {};
      return h('button.alt', { type: 'button', role: 'radio', 'aria-checked': on, tabindex: on ? '0' : '-1', 'aria-busy': altBusy.v && !on ? 'false' : null, onclick: () => pick(i) },
        h('span.alt-top', h('strong', i === 0 ? 'Best' : `Option ${i + 1}`), !a.feasible && h('span.chip.warn', 'Below the requirements')),
        h('span.alt-name', String(a.label || '').replace(/^Best: /, '').replace(/^(\d+)$/, '$1-deep, D/W best')), h('span.muted.alt-why', a.why || ''),
        h('span.alt-nums.num', `${fmtNum(d.L, 1).replace(/\.0$/, '')} × ${fmtNum(d.W, 1).replace(/\.0$/, '')} × ${fmtNum(d.H, 1).replace(/\.0$/, '')} m`),
        h('span.alt-nums.num', `${fmtNum(hd.positions, 0)} positions`), h('span.alt-nums.num', `${eur(hd.capex_eur)} CAPEX`), h('span.alt-nums.num', `${eur(hd.annual_eur)}/year`));
    }));
    box.addEventListener('keydown', (e) => {
      if (!/^Arrow/.test(e.key)) return; e.preventDefault();
      const n = items.length, j = (state.view.index + (/Right|Down/.test(e.key) ? 1 : -1) + n) % n;
      pick(j).then(() => { const b = main.querySelectorAll('.alt')[j]; b && b.focus(); });
    });
    return box;
  }

  // R17b: inputs that rebuild the design on screen (Fixed: the wizard inputs; Optimal: the found building and rack; a champion: its own inputs)
  function baseInputs() {
    const v = state.view;
    if (v.champ && v.champ.inputs) { const i = { ...v.champ.inputs }; if (i.shape_params && typeof i.shape_params === 'object') i.shape_params = JSON.stringify(i.shape_params); return i; }
    return { ...designInputs(R, v.report) };
  }
  // "Apply": the diagnosis patch goes on top of the inputs of the design on screen; the Fixed wizard takes the result (Edit inputs shows it) and the model re-runs.
  async function applyPatch(patch) {
    const inputs = { ...baseInputs(), ...patch };
    for (const k of Object.keys(inputs)) if (inputs[k] == null) delete inputs[k];
    loadFixedInputs(inputs);
    state.mode = 'fixed';
    state.job = { mode: 'fixed', payload: inputs, startedAt: Date.now() };
    go('/run');
  }
  // FIX (R18e, speed): one options run per report (a repaint reuses it) and the full diagnosis is stored on the report, so the story and the print read the same options. Old cause: every card start asked the model again and the story never saw the options.
  const optRuns = new WeakMap();
  const loadOptions = () => {
    const rep = state.view.report;
    if (!optRuns.has(rep)) optRuns.set(rep, model.diagnose(baseInputs()).then((full) => { if (full) rep.diagnosis = full; return full; }).catch((e) => { optRuns.delete(rep); throw e; }));
    return optRuns.get(rep);
  };

  // PERF (R20d): a Fixed run returns without the KPI champions (`champions_pending`); they are computed once per report after the first result and the compare section is rebuilt (`apw:champions`)
  const champRuns = new WeakMap();
  const loadChampions = () => {
    const rep = R.report;
    if (champRuns.has(rep)) return;
    champRuns.set(rep, model.champions(R.payload).then((out) => {
      rep.champions = (out && out.champions) || [];
      rep.champions_pending = false;
      if (out && out.warning) console.warn('[champions]', out.warning);
      if (state.result !== R) return;                                  // the user already left this result
      if (globalThis.APW && globalThis.APW.current) globalThis.APW.current.champions = rep.champions;
      document.dispatchEvent(new CustomEvent('apw:champions', { detail: { report: rep, champions: rep.champions } }));
    }).catch((e) => { champRuns.delete(rep); rep.champions_pending = false; console.warn('[champions] not available:', e && e.message); }));
  };

  function paint() {
    const rep = state.view.report;
    const animate = first;
    const parts = [];
    // header
    const feas = rep.feasible;
    const st = statusInfo(rep);
    const hollow = !rep.design || rep.design.L == null;           // a report that could not be built (failure report): the diagnosis card is all there is
    const head = h('header.res-head',
      h('div.res-title', h('p.eyebrow', icon(isOpt ? 'target' : 'building', 'sm'), isOpt ? 'Optimal warehouse' : 'Fixed warehouse'),
        h('h1', { tabindex: '-1', 'data-autofocus': first ? '' : null }, isOpt || state.view.index < 0 ? (state.view.index === 0 ? 'Best design' : state.view.index < 0 ? (state.view.label || 'Selected design') : `Option ${state.view.index + 1}`) : 'Your warehouse'),
        h('p.callout.res-sum', summaryLine(rep)), rep.label && !/^(Best: )?\d+$/.test(String(rep.label)) && h('p.cap', 'Rack pattern: ' + String(rep.label).replace(/^Best: /, ''))),
      h('div.res-actions', h('button.btn', { type: 'button', onclick: () => go(`/${R.mode}/review`) }, icon('edit', 'sm'), 'Edit inputs'),
        h('button.btn', { type: 'button', onclick: () => { resetInputs(); state.result = null; state.view = null; go('/choose'); } }, icon('plus', 'sm'), 'New design')));
    parts.push(head);
    // R24 V6: the status chip row is the verdict block now (status, sentence, pills, tiles); the busiest-lift chip stays as a small line under it
    const chips = h('div.row.res-chips', hollow ? h('span.chip.' + st.tone, icon(st.ic, 'sm'), st.chip) : null,
      rep.headline && rep.headline.rho_max != null && h('span.chip', `Busiest lift, at plan flow ${fmtPct(rep.headline.rho_max * 100)} %`));
    let verdict = hollow ? null : verdictBlock(rep, st);
    if (verdict) parts.push(verdict);
    parts.push(chips);
    if (state.view.planReport) parts.push(h('div.card.res-max', { role: 'status' }, icon('gauge', 'sm'), h('span', 'This page shows the design at its maximum flow.'),
      h('button.btn', { type: 'button', onclick: () => { const pr = state.view.planReport; state.view = { index: state.view.index, report: pr }; paint(); } }, 'Back to the plan flow')));
    // FIX (R17b): the red "Why this is not feasible" box is the diagnosis card (what limits, best possible, what to change, Apply). Old cause: a bare list of the model's raw reasons.
    // FIX (R18e, speed): when the options arrive the card and the status chip are rebuilt from the full diagnosis (old cause: the light status 'Not met as set' would have stayed)
    const cardCtx = { onApply: applyPatch, loadOptions, startOpen: false, autoLoad: !isOpt, onFull: () => {
      const nst = statusInfo(rep), old = chips.querySelector('.chip'), card = main.querySelector('section.diag');
      if (hollow && old) old.replaceWith(h('span.chip.' + nst.tone, icon(nst.ic, 'sm'), nst.chip));
      if (verdict && verdict.isConnected) { const nv = verdictBlock(rep, nst); verdict.replaceWith(nv); verdict = nv; }     // R24 V6: the verdict, the pills and the summary of the card follow the full diagnosis
      if (card) card.replaceWith(diagnosisCard(rep, { ...cardCtx, autoLoad: false, compact: !hollow }));
    } };
    const diagEl = diagnosisCard(rep, { ...cardCtx, compact: !hollow });
    if (hollow) parts.push(diagEl);
    // FIX (R21b, A7-11): the model's "unknown input keys ignored" note is shown as its own technical warning (rep.unknown_inputs, plus any key the demo itself dropped before sending); it is not repeated in the notes.
    const notes = (rep.warnings || []).filter((w) => !String(w).startsWith('unknown input keys ignored'));
    const notesEls = [];
    if (notes.length) notesEls.push(h('details.card.res-warn', h('summary', icon('warn', 'sm'), `${notes.length} note${notes.length > 1 ? 's' : ''} from the model`), h('ul', notes.map((w) => h('li', w)))));
    if (rep.unknown_inputs && rep.unknown_inputs.length) notesEls.push(h('details.card.res-warn.res-unknown', h('summary', icon('warn', 'sm'), 'Technical: input keys the model does not know'),
      h('p', 'These keys were not used: ', h('code', rep.unknown_inputs.join(', ')), '. They are not part of the Fixed inputs, so they had no effect on this result.')));
    if (isOpt && R.search && R.search.candidates != null) notesEls.push(h('p.cap', `Search: ${fmtNum(R.search.candidates, 0)} candidate designs, ${fmtNum(R.search.layouts_evaluated, 0)} layouts evaluated${R.search.seconds != null ? ` in ${fmtNum(R.search.seconds, 1)} s` : ''}.`));
    if (hollow) parts.push(...notesEls);
    if (hollow) { main.replaceChildren(...parts.filter(Boolean)); announce(`${st.title}.`); first = false; return; }
    // slots for B4 / B5 (R24 V6: the 3D stage follows the verdict directly; the diagnosis details, notes and the full headline numbers come after it)
    const sceneSlot = h('section.slot.slot-scene', { 'data-slot': 'scene', 'aria-label': '3D scene' });
    // FIX (R9b): a scene the 2D plan cannot read (for example an L / U / T footprint without `modules`) no longer stops the page. Old cause: scenePlan threw on sc.modules.length.
    let plan = null;
    try { plan = scenePlan(rep); } catch (e) { console.warn('[results] 2D plan not available for this scene:', e && e.message); }
    sceneSlot.append(h('div.slot-stage', plan, h('div.glass-note', h('strong', '3D walkthrough'), h('span', 'Loading the 3D view…'))));
    const storySlot = h('section.slot.slot-story', { 'data-slot': 'story', 'aria-label': 'Story and tour' },
      h('div.card.slot-card', icon('play'), h('div', h('strong', 'Story and guided tour'), h('p.muted', 'Loading the story…'))));
    parts.push(h('div.slots', sceneSlot, storySlot));
    if (diagEl) parts.push(h('details.card.res-diag', { open: false }, h('summary', icon('info', 'sm'), 'What limits this design and what you can change'), diagEl));
    parts.push(...notesEls);
    parts.push(headlineCards(rep, animate));
    if (analysis) analysis.destroy();
    analysis = rep.feasible || rep.fleet ? mountAnalysis({ R, rep, pushToMax }) : null;
    if (analysis) parts.push(analysis.el);
    // alternatives
    if (isOpt && R.alternatives.length) parts.push(h('section.alts-wrap', h('h2.sec-h', 'Alternatives'), h('p.muted', 'Select a design to see all its numbers. Options are evaluated as a Fixed warehouse with the same building and rack.'), altCards(),
      altBusy.v ? h('p.cap', { role: 'status' }, 'Evaluating this option…') : null));
    // KPI groups
    if (rep.groups && rep.groups.length) parts.push(h('section.groups-wrap', h('h2.sec-h', 'All figures'), h('div.groups', rep.groups.map((g) => groupCard(g, rep)).filter(Boolean)),
      h('p.cap', 'Figures marked ', assumeBadge('source or reason in the tooltip'), ' rest on assumptions of the model; hover or focus the mark for the reason. Flows, load and kinematics are fixed by the brief.')));
    main.replaceChildren(...parts.filter(Boolean));
    if (animate) riseIn(main.children, { stagger: 60 });
    announce(`${isOpt ? 'Best design' : 'Result'}: ${summaryLine(rep)}. ${st.title}.`);
    first = false;
    const detail = { report: rep, mode: R.mode, index: state.view.index, slots: { scene: sceneSlot, story: storySlot }, search: R.search,
      champions: (R.mode === 'fixed' ? R.report.champions : R.champions) || null, viewChamp: state.view.champ || null, best: R.report, alternatives: R.alternatives || [], altCache: state.altCache, evalAlt, openDesign, payload: R.payload };
    globalThis.APW = Object.assign(globalThis.APW || {}, { current: detail });
    document.dispatchEvent(new CustomEvent('apw:report', { detail }));
  }

  const el = h('div.screen.results', main);
  paint();
  if (R.mode === 'fixed' && R.report && R.report.champions_pending) loadChampions();
  return { el, destroy() { if (analysis) analysis.destroy(); document.dispatchEvent(new CustomEvent('apw:leave')); if (globalThis.APW) globalThis.APW.current = null; } };
}
