// R17b: the diagnosis card. Replaces every bare "not feasible" / raw error with: the status in plain words, what limits the design,
// the best possible with the given inputs, ranked changes (each computed by the model, with an Apply button) and, collapsed, the technical text.
// Numbers come from `report.diagnosis` (apw/diagnosis.py); this file only words and lays them out.
import { h, icon, fmtNum, fmtPct, toast } from './ui.js';

const cap1 = (s) => { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); };
const n0 = (x) => fmtNum(x, 0);

/** Status in plain words. tone: ok | warn | calm. Never an alarm tone: a design that does not reach a target is information, not an error. */
export function statusInfo(rep) {
  const dg = (rep && rep.diagnosis) || null;
  const status = dg && dg.status ? dg.status : rep && rep.feasible ? 'ok' : 'needs_changes';
  const capLim = dg && (dg.limits || []).find((l) => l.key === 'capacity' && !l.ok);
  const target = rep && rep.capacity && rep.capacity.target_pallets;
  const dims = rep && rep.design && rep.design.L ? `${fmtNum(rep.design.L, 1).replace(/\.0$/, '')} × ${fmtNum(rep.design.W, 1).replace(/\.0$/, '')} m` : null;
  const T = {
    ok: { tone: 'ok', ic: 'check', title: 'Meets every requirement', chip: 'Meets the requirements' },
    ok_with_warnings: { tone: 'ok', ic: 'check', title: 'Works, with notes', chip: 'Works, with notes' },
    needs_changes: dg && dg.options_computed === false
      // FIX (R18e, speed): the light diagnosis (options not computed yet) cannot tell 'reachable with a change' from 'not reachable'; it says only that a requirement is missed. Old cause: the first result always showed the options-based wording.
      ? { tone: 'warn', ic: 'info', title: 'Requirements not met as set', chip: 'Not met as set' }
      : { tone: 'warn', ic: 'info', title: 'Reachable with a change', chip: 'Reachable with a change' },
    not_reachable: { tone: 'warn', ic: 'info', title: capLim && target ? `${dims ? 'This building' : 'This design'} cannot hold ${n0(target)} pallets with the brief data` : 'Not reachable in this building with the brief data', chip: 'Not reachable here' },
  };
  return { status, ...(T[status] || T.needs_changes) };
}

/** Capacity as expected stored against the pallets required at the capacity service level (R17a). */
export function capacityView(rep) {
  const c = (rep && rep.capacity) || {}, hd = (rep && rep.headline) || {};
  const exp = c.expected_stored != null ? c.expected_stored : hd.expected_stored;
  const target = c.target_pallets;
  return { expectedStored: exp, target, positions: c.positions != null ? c.positions : hd.positions, required: c.required_positions != null ? c.required_positions : hd.required_positions,
    planned: c.planned_stock != null ? c.planned_stock : c.stock != null ? c.stock : hd.planned_stock, sl: c.cap_sl != null ? c.cap_sl : hd.cap_sl, ok: c.ok != null ? !!c.ok : hd.capacity_ok, fill: c.lane_fill,
    share: exp != null && target ? exp / target : null };
}

const eurK = (x) => {
  if (x == null || !Number.isFinite(x)) return 'n/a';
  const a = Math.abs(x), s = x < 0 ? '−' : '+';
  if (a >= 1e6) return `${s}€ ${fmtNum(a / 1e6, 1)} M`;
  if (a < 500) return '±€ 0';
  return `${s}€ ${fmtNum(a / 1e3, 0)} k`;
};
const signed = (x) => (x == null ? '' : (x >= 0 ? '+' : '−') + n0(Math.abs(x)));
const fmtVal = (l, x) => (x == null ? 'n/a' : l.unit === 'moves/h' ? fmtNum(x, 0) : n0(x));

function limitsTable(limits) {
  const rows = limits.filter((l) => l.key !== 'evaluation');
  if (!rows.length) return null;
  const mk = (l) => {
    const hasNum = l.required != null && l.achieved != null;
    // bar: how much of the requirement the design reaches (capped at 100 %); the tone is calm (accent when met, warning when short)
    const frac = hasNum && l.required > 0 ? Math.max(0, Math.min(1, l.achieved / l.required)) : null;
    const bar = frac == null ? null : h('span.lim-bar', { role: 'img', 'aria-label': `${Math.round(frac * 100)} % of the requirement` }, h('i', { style: `width:${Math.round(frac * 100)}%` }));
    return h('li.lim' + (l.ok ? '.ok' : '.short'),
      h('div.lim-top', h('span.lim-ic', icon(l.ok ? 'check' : 'info', 'sm')), h('strong.lim-name', l.name),
        h('span.lim-state', l.ok ? 'Met' : 'Falls short')),
      hasNum ? h('div.lim-nums.num', h('span', h('small', 'required '), `${fmtVal(l, l.required)} ${l.unit || ''}`.trim()), h('span', h('small', 'achieved '), `${fmtVal(l, l.achieved)} ${l.unit || ''}`.trim()),
        l.gap != null && l.gap > 0 ? h('span.lim-gap', h('small', 'gap '), fmtVal(l, l.gap)) : null) : null,
      bar, l.binding ? h('p.lim-bind', h('small', 'Binds: '), l.binding) : null, l.text && !/[?]/.test(l.text) ? h('p.lim-text', cap1(l.text)) : null);       // a text with '?' placeholders (the layout could not be built) is left out; the numbers above stay
  };
  return h('ul.lims', rows.map(mk));
}

function bestBlock(bp, onApply, busy) {
  if (!bp) return null;
  const share = bp.share_of_target;
  return h('section.dg-sec', { 'aria-labelledby': 'dg-best' },
    h('h3.dg-h', { id: 'dg-best' }, 'Best possible with your inputs'),
    h('p.dg-lead', bp.reached_target ? 'The target is within reach with these settings.' : 'This is the most the building can do with the data as given. It is computed, not estimated.'),
    h('div.dg-best',
      h('div.dg-big.num', n0(bp.expected_stored), h('small', ' pallets expected stored')),
      share != null ? h('div.dg-share', h('span.lim-bar', { role: 'img', 'aria-label': `${Math.round(share * 100)} % of the target` }, h('i', { style: `width:${Math.round(Math.min(1, share) * 100)}%` })), h('small', `${fmtPct(share * 100)} % of the target`)) : null,
      h('div.row.dg-chips', h('span.chip', `${n0(bp.positions)} positions`), h('span.chip', bp.lane_pattern || ''), h('span.chip', `${bp.tiers} tiers`),
        h('span.chip', bp.fire_strategy === 'o2_reduction' ? 'Oxygen reduction' : 'In-rack sprinklers'), bp.max_flow_moves_h != null ? h('span.chip', `${n0(bp.max_flow_moves_h)} moves/h at most`) : null)),
    bp.patch && Object.keys(bp.patch).length ? applyBtn('Use these settings', bp.patch, onApply, busy, 'the best possible settings') : null);
}

function applyBtn(label, patch, onApply, busy, what) {
  const b = h('button.btn.primary.dg-apply', { type: 'button', 'aria-label': `Apply: ${what}, then re-run the model`, onclick: async () => {
    if (busy.v) return;
    busy.v = true; b.setAttribute('aria-busy', 'true'); b.disabled = true;
    try { await onApply(patch); } catch (e) { toast('Could not apply: ' + ((e && e.message) || e)); busy.v = false; b.disabled = false; b.removeAttribute('aria-busy'); }
  } }, icon('play', 'sm'), label);
  return b;
}

// A combination option arrives as "depth = 3, reserve_share = 0.0 ..." from the model: worded for people here.
export function changeText(o) {   // FIX (R18e): exported for the story / print text (old cause: capGap printed the model's raw 'combination: shape = rect, shape_params = None ...')
  if (o.id !== 'combined' || !o.patch) return cap1(o.change);
  const p = o.patch, bits = [];
  if (p.depth != null) bits.push(p.depth === 'mixed' ? 'mixed 6 + 3 lanes' : `${p.depth}-deep lanes`);
  if (p.fire_strategy) bits.push(p.fire_strategy === 'o2_reduction' ? 'oxygen reduction' : 'in-rack sprinklers');
  if (p.reserve_share != null) bits.push(`reserve share ${fmtNum(p.reserve_share * 100, 0)} %`);
  if (p.ops_share != null) bits.push(`ops share ${fmtNum(p.ops_share * 100, 0)} %`);
  if (p.shape) bits.push(p.shape === 'rect' ? 'rectangular footprint' : `${p.shape} footprint`);
  if (p.H != null) bits.push(`clear height ${fmtNum(p.H, 1)} m`);
  return cap1('Combination: ' + bits.join(', '));
}

function optionItem(o, onApply, busy) {
  const ef = o.effect || {}, solves = !!o.solves;
  const nums = [];
  if (ef.expected_stored != null) nums.push(h('span.chip', `${n0(ef.expected_stored)} pallets stored${ef.expected_stored_gain ? ` (${signed(ef.expected_stored_gain)})` : ''}`));
  if (ef.positions != null) nums.push(h('span.chip', `${n0(ef.positions)} positions${ef.required_positions != null ? `, ${n0(ef.required_positions)} needed` : ''}`));
  if (ef.L && ef.W && !o.inside_building) nums.push(h('span.chip', `${fmtNum(ef.L, 1).replace(/\.0$/, '')} × ${fmtNum(ef.W, 1).replace(/\.0$/, '')} m`));
  return h('li.opt' + (solves ? '.solves' : ''),
    h('div.opt-main',
      h('div.opt-top', h('span.opt-rank.num', String(o.rank)), h('strong.opt-change', changeText(o)),
        h('span.chip.' + (solves ? 'ok' : 'warn'), icon(solves ? 'check' : 'info', 'sm'), solves ? 'Solves it' : (ef.expected_stored_gain || 0) > 0 ? 'Helps, not enough' : 'No gain on its own'),
        h('span.chip', o.inside_building ? 'Inside the building' : 'Changes the building')),
      h('div.row.opt-nums', nums),
      h('p.opt-cost.num', h('small', 'CAPEX '), eurK(o.capex_delta_eur), h('small', '  ·  annual '), eurK(o.annual_delta_eur))),
    applyBtn('Apply', o.patch || {}, onApply, busy, o.change));
}

function optionsBlock(dg, ctx) {
  const holder = h('section.dg-sec', { 'aria-labelledby': 'dg-opts' }, h('h3.dg-h', { id: 'dg-opts' }, 'What you can change'));
  const paint = (d) => {
    holder.replaceChildren(h('h3.dg-h', { id: 'dg-opts' }, 'What you can change'));
    const opts = d.options || [];
    if (d.options_computed === false) {
      // FIX (R18e, speed): the options (model re-runs, about 3 to 8 s in CPython, about 3 times that in Pyodide) are never part of the first result; they load here, with a running clock, either by the button or by themselves
      // shortly after the card is on screen (ctx.autoLoad). Old cause: fixed() computed them before the first result, so a not-reachable design (the example) waited for them.
      const b = h('button.btn', { type: 'button' }, icon('search', 'sm'), 'Show options');
      const run = async () => {
        if (b.disabled) return;
        b.disabled = true; b.setAttribute('aria-busy', 'true');
        const t0 = Date.now(), tick = () => { b.textContent = `Computing the options… ${Math.round((Date.now() - t0) / 1000)} s`; };
        tick(); const timer = setInterval(tick, 1000);
        try { const full = await ctx.loadOptions(); if (full) { ctx.dg = full; if (ctx.onFull) ctx.onFull(full); else paint(full); } else { b.disabled = false; b.removeAttribute('aria-busy'); b.textContent = 'Show options'; toast('The options could not be computed.'); } }
        catch (e) { b.disabled = false; b.removeAttribute('aria-busy'); b.textContent = 'Show options'; toast('The options could not be computed.'); }
        finally { clearInterval(timer); }
      };
      b.addEventListener('click', run);
      holder.append(h('p.dg-lead', 'Each option is a model re-run with its cost; it takes a few seconds (the first result above does not wait for it).'), b);
      if (ctx.autoLoad && !ctx.autoStarted) { ctx.autoStarted = true; setTimeout(() => { if (b.isConnected) run(); }, 400); }
      return;
    }
    if (!opts.length) { holder.append(h('p.dg-lead', (d.reasons && d.reasons.length ? 'The model found no single change that closes the gap. ' : '') + 'Try a different building size, lane depth or fire strategy in the inputs.')); return; }
    holder.append(h('p.dg-lead', 'Ranked: changes that solve it come first, cheapest first. Every option is a model re-run; the costs are changes against your current design.'), h('ol.opts', opts.map((o) => optionItem(o, ctx.onApply, ctx.busy))));
  };
  paint(dg);
  return holder;
}

/** R24 V6: the status pills of the results page, one per checked requirement (capacity, flow, docks, tiers, areas): [{name, ok}]. Words carry the state as well as the colour. */
export function limitPills(rep) {
  const dg = rep && rep.diagnosis;
  return ((dg && dg.limits) || []).filter((l) => l.key !== 'evaluation').map((l) => ({ name: String(l.name || l.key).replace(/\s*\(.*\)\s*$/, ''), ok: !!l.ok }));
}

/** The lead sentence of the diagnosis (also the verdict line under the status title of the results page). */
export function diagLead(rep) {
  const dg = rep && rep.diagnosis;
  if (!dg) return '';
  return diagLeadOf(dg);
}
function diagLeadOf(dg) {
  const lead = dg.status === 'ok' ? 'The design meets every requirement the model checks.' : dg.status === 'ok_with_warnings' ? 'The design meets the requirements; the notes below are worth a look.'
    : dg.best_possible && !dg.best_possible.reached_target && dg.best_possible.share_of_target < 1 ? `With the given data the best this building can do is ${n0(dg.best_possible.expected_stored)} pallets (${fmtPct(dg.best_possible.share_of_target * 100)} % of the target). The sections below show what limits it and what would change that.`
      : dg.best_possible && dg.best_possible.share_of_target >= 1 ? `The inputs as set miss a requirement, but this building could store ${n0(dg.best_possible.expected_stored)} pallets (${fmtPct(dg.best_possible.share_of_target * 100)} % of the target) with other settings. The sections below show what limits it and what to change.`
      : dg.status === 'needs_changes' && dg.options_computed === false ? 'This design misses a requirement as set. The limits below say which; the model is working out what would change that.'
      : dg.status === 'needs_changes' ? 'This design misses a requirement as set, and the model found a change that fixes it.' : cap1(dg.summary || '');
  return lead;
}

/** The card. ctx = { onApply(patch) -> Promise, loadOptions() -> Promise<diagnosis>, startOpen, compact (no header: the verdict block above says it) }. */
export function diagnosisCard(rep, ctx) {
  const dg = rep && rep.diagnosis;
  if (!dg) return null;
  const st = statusInfo(rep);
  const c = { ...ctx, dg, busy: { v: false } };
  const lead = diagLeadOf(dg);
  const limits = limitsTable(dg.limits || []);
  const tech = [];
  if (rep.reasons && rep.reasons.length) tech.push(h('p', h('strong', 'Model reasons: '), rep.reasons.join('; ')));
  if (dg.reasons && dg.reasons.length && JSON.stringify(dg.reasons) !== JSON.stringify(rep.reasons)) tech.push(h('p', h('strong', 'Diagnosis reasons: '), dg.reasons.join('; ')));
  if (dg.technical) tech.push(h('p', h('strong', 'Technical: '), h('code', String(dg.technical))));
  if (dg.summary && !(dg.status === 'ok' || dg.status === 'ok_with_warnings')) tech.push(h('p', h('strong', 'Model summary: '), dg.summary));
  const good = dg.status === 'ok' || dg.status === 'ok_with_warnings';
  const failing = (dg.limits || []).filter((l) => !l.ok);
  const el = h('section.card.diag.tone-' + st.tone, { 'aria-labelledby': 'dg-title' },
    c.compact ? null : h('header.dg-head', h('span.dg-ic', icon(st.ic)), h('div', h('h2', { id: 'dg-title' }, st.title), h('p.dg-lead', lead))),
    good ? h('details.dg-more', { open: !!c.startOpen }, h('summary', 'Requirement check'), limits) : h('section.dg-sec', { 'aria-labelledby': 'dg-lim' }, h('h3.dg-h', { id: 'dg-lim' }, 'What limits this design'), limits),
    good ? null : bestBlock(dg.best_possible, c.onApply, c.busy),
    good ? null : optionsBlock(dg, c),
    tech.length ? h('details.dg-tech', h('summary', 'Technical details'), ...tech) : null);
  el.dataset.status = st.status; el.dataset.failing = failing.map((l) => l.key).join(',');
  return el;
}

/** A calm panel for inputs the model could not take (run screen): reasons in plain words, technical text collapsed. */
export function problemCard({ title, lead, reasons, technical, actions }) {
  return h('section.card.diag.tone-warn.dg-problem', { role: 'status', 'aria-labelledby': 'dg-ptitle' },
    h('header.dg-head', h('span.dg-ic', icon('info')), h('div', h('h2', { id: 'dg-ptitle', tabindex: '-1' }, title), lead ? h('p.dg-lead', lead) : null)),
    reasons && reasons.length ? h('ul.dg-reasons', reasons.map((r) => h('li', cap1(String(r).replace(/^input: /, ''))))) : null,
    h('div.row.dg-actions', actions || []),
    technical ? h('details.dg-tech', h('summary', 'Technical details'), h('pre', String(technical))) : null);
}
