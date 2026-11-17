// Compare (R13b): KPI champions. One column per design from the model key `champions` (Fixed: report.champions, Optimal: result.champions): the best design and the
// winner of each key figure (lowest CAPEX, annual cost, energy, highest max flow, most pallets stored); a design that wins several is one column with several labels.
// Rows are the key KPIs; the winner of a row is highlighted (values within 0.5 % are a tie, not a win); each column carries its one-line reason and a button that opens it.
// FIX (R13b): the comparison with the slide-12 example (and its background evaluation) is removed.
import { h, fmtNum, eur, assumeBadge } from '../ui.js';

const SHAPE = { rect: 'Rectangle', L: 'L-shape', U: 'U-shape', T: 'T-shape' };
const MODE = { M1: 'M1: shuttle rides the lift', M2: 'M2: hand-over at the lift' };
const TIE = 0.005;                          // values within 0.5 % of the best are a tie
// FIX (R18e): the bare ' tie' tag had no explanation (old cause: a tooltip or caption was missing); the text now says what the tie means
const TIE_TEXT = 'Tie: this value is within 0.5 % of the best value in its row and is shared by two or more designs. No single design wins that row, so no column is marked best on it.';
const dimsOf = (g) => (g && g.L != null ? `${fmtNum(g.L, 1).replace(/\.0$/, '')} × ${fmtNum(g.W, 1).replace(/\.0$/, '')} × ${fmtNum(g.H, 1).replace(/\.0$/, '')} m` : '');
const ok = (x) => x != null && Number.isFinite(x);

const ROWS = [
  { id: 'positions', label: 'Pallet positions', unit: 'positions', get: (c) => c.headline.positions, fmt: (x) => fmtNum(x, 0), best: 'max' },
  { id: 'stored', label: 'Expected stored', unit: 'pallets', get: (c) => c.expected_stored, fmt: (x) => fmtNum(x, 0), best: 'max', note: 'Positions × lane fill; the lane fill (honeycombing) is an assumption.' },
  { id: 'fio', label: 'Time to store or retrieve one pallet', unit: 's', get: (c) => c.headline.F_io_s, fmt: (x) => fmtNum(x, 1), best: 'min' },
  { id: 'flow', label: 'Maximum flow', unit: 'moves/h', get: (c) => c.max_flow, fmt: (x) => fmtNum(x, 0), best: 'max',
    sub: (c) => [c.max_flow_binding ? `binds on ${c.max_flow_binding}` : '',
      ok(c.max_flow_storage) ? `storage limit ${fmtNum(c.max_flow_storage, 1)}${c.max_flow_storage_binding ? ' · ' + String(c.max_flow_storage_binding).replace(/^storage:\s*/, '') + ' bind' : ''}${ok(c.max_flow_lifts) ? `; lifts ${fmtNum(c.max_flow_lifts, 0)}` : ''}${ok(c.max_flow_shuttles) ? `, shuttles ${fmtNum(c.max_flow_shuttles, 0)}` : ''}` : ''].filter(Boolean).join(' · ') },
  { id: 'capex', label: 'CAPEX, low price case', unit: '', get: (c) => c.headline.capex_low_eur ?? c.headline.capex_eur, fmt: (x) => eur(x), best: 'min', note: 'Unit costs are assumptions.',
    sub: (c) => (ok(c.headline.capex_high_eur) ? `high case ${eur(c.headline.capex_high_eur)}` : '') },
  { id: 'annual', label: 'Annual cost', unit: '€/year', get: (c) => c.annual_eur ?? c.headline.annual_eur, fmt: (x) => fmtNum(x, 0), best: 'min', note: 'Unit costs are assumptions.' },
  { id: 'energy', label: 'Energy', unit: 'kWh/day', get: (c) => c.energy_kwh_day, fmt: (x) => fmtNum(x, 1), best: 'min', note: 'Energy rates are assumptions.' },
  { id: 'shuttles', label: 'Shuttles', unit: '', get: (c) => c.headline.shuttles, fmt: (x) => fmtNum(x, 0), best: 'min' },
  { id: 'lifts', label: 'Lifts', unit: '', get: (c) => c.headline.lifts, fmt: (x) => fmtNum(x, 0), best: 'min' },
  { id: 'tiers', label: 'Tiers', unit: '', get: (c) => c.design.tiers, fmt: (x) => fmtNum(x, 0), best: null },
  { id: 'mode', label: 'Lift mode', unit: '', get: (c) => c.design.lift_mode, fmt: (x) => MODE[x] || String(x), best: null, text: true },
  { id: 'shape', label: 'Shape', unit: '', get: (c) => c.design.shape || 'rect', fmt: (x) => SHAPE[x] || String(x), best: null, text: true },
];

/** Verdict per row: { win: index | null, tie: [indices] }. */
export function verdict(row, vals) {
  const idx = vals.map((v, i) => (ok(v) ? i : -1)).filter((i) => i >= 0);
  if (!row.best || idx.length < 2) return { win: null, tie: [] };
  const best = row.best === 'max' ? Math.max(...idx.map((i) => vals[i])) : Math.min(...idx.map((i) => vals[i]));
  const near = idx.filter((i) => Math.abs(vals[i] - best) <= TIE * Math.abs(best || 1));
  if (near.length === idx.length) return { win: null, tie: [] };            // all equal: nothing to highlight
  return near.length === 1 ? { win: near[0], tie: [] } : { win: null, tie: near };
}

export function buildCompare(S) {
  const d = S.d;
  const root = h('section.cmp', { id: 'compare', tabindex: '-1', 'aria-labelledby': 'cmp-h' });
  const intro = h('p.muted');
  const tableBox = h('div.cmp-box');
  root.append(h('div.cmp-head', h('h2.sec-h', { id: 'cmp-h' }, 'Compare designs'), intro), tableBox);

  // PERF (R20d): the champions of a Fixed run arrive after the first result (`apw:champions`); the entries are rebuilt from `d.champions` then
  const makeEnts = () => {
  let ents = Array.isArray(d.champions) ? d.champions.filter((c) => c && c.headline && c.design) : [];
  if (!ents.length && S.rep && S.rep.headline) {                      // the model sent no champions: the design on screen alone
    // FIX (R18e): the on-screen entry carries the same max_flow_* fields as a model champion, read from the current report (rep.max_flow.storage / binding_now / resources.*); the old entry had none of them, so its flow line was empty (old cause: the fields were not mapped)
    const mf = S.rep.max_flow || {}, res = mf.resources || {};
    ents = [{ kpi: 'best', kpis: ['best'], labels: ['Your design'], why: 'The design on screen', meets_target: S.rep.capacity ? S.rep.capacity.ok : null, headline: S.rep.headline, design: S.rep.design,
      expected_stored: S.rep.plan && S.rep.plan['plan.expected_stored'], energy_kwh_day: S.rep.headline.energy_kwh_day, annual_eur: S.rep.headline.annual_eur, max_flow: S.rep.headline.max_flow_moves_h,
      max_flow_binding: mf.binding_now, max_flow_storage: mf.storage && mf.storage.moves_h, max_flow_storage_binding: mf.storage && mf.storage.binding,
      max_flow_lifts: res.lifts && res.lifts.limit_moves_h, max_flow_shuttles: res.shuttles && res.shuttles.limit_moves_h }];
  }
  return ents;
  };
  let ents = makeEnts();
  const current = (e) => (d.viewChamp ? d.viewChamp.kpi === e.kpi : (e.kpis || [e.kpi]).includes('best') && d.index === 0);
  let snap = { heads: [], rows: [] };

  function paint() {
    intro.textContent = ents.length > 1
      ? `${ents.length} designs: the best overall and the winner of each key figure. A design that wins several figures is one column. The best value of each row is marked; values within 0.5 % count as a tie.`
      // FIX (R13c): Fixed L / U / T reports the best design only (the lift search covers rectangles); the old text said no other design wins, which reads as a finding
      : (d.mode === 'fixed' && S.rep && S.rep.design && S.rep.design.shape && S.rep.design.shape !== 'rect'
        ? 'Only the best design is shown. For an L, U or T footprint the Fixed run does not search other lift placements for the whole building; use Search (it compares shapes) or a rectangle to see the winners of each key figure.'
        : 'Only the best design is available: no other design wins a key figure.');
    const head = h('tr', h('th', { scope: 'col' }, h('span.sr-only', 'Measure')), ents.map((e, i) => {
      const cur = current(e);
      const open = h('button.btn.ghost.cmp-open', { type: 'button', disabled: cur || !d.openDesign, onclick: () => d.openDesign(e) }, cur ? 'On screen' : (e.kpis || [e.kpi]).includes('best') ? 'Back to the best' : 'Open this design');
      return h('th', { scope: 'col' }, h('span.cmp-ent', h('i.cmp-dot.c' + ((i % 5) + 1)), (e.labels && e.labels.length ? e.labels : [e.label]).join(' · ')),
        h('span.cap.cmp-dim', [dimsOf(e.design), e.design.desc].filter(Boolean).join(' · ')),
        e.meets_target === false ? h('span.chip.warn.cmp-badge', 'Stores less than the target') : null,
        e.why ? h('span.cap.cmp-why', e.why) : null, open);
    }));
    let anyTie = false;
    const body = ROWS.map((row) => {
      const vals = ents.map((e) => { const v = row.get(e); return v == null || (!row.text && !Number.isFinite(v)) ? null : v; });
      const vd = row.text ? { win: null, tie: [] } : verdict(row, vals);
      if (vd.tie.length) anyTie = true;
      return h('tr', h('th', { scope: 'row' }, row.label, row.note && assumeBadge(row.note)),
        ents.map((e, i) => {
          const v = vals[i], lab = (e.labels && e.labels[0]) || e.label || '';
          if (v == null) return h('td', { 'data-label': lab }, h('span.cmp-v.muted', 'n/a'));
          const win = vd.win === i, tie = vd.tie.includes(i);
          const sub = row.sub ? row.sub(e) : '';
          return h('td', { 'data-label': lab, class: win ? 'best' : tie ? 'tie' : null },
            h('span.cmp-v.num', row.fmt(v), !row.text && row.id !== 'capex' && row.unit && h('small', ' ' + row.unit), win && h('span.sr-only', ' (best)'), tie && h('small.cmp-tie', { title: TIE_TEXT }, ' tie')),
            sub ? h('span.cap', sub) : null);
        }));
    });
    snap = { heads: ents.map((e) => (e.labels && e.labels.length ? e.labels : [e.label]).join(' · ')),
      rows: ROWS.map((row) => [row.label + (row.unit && row.id !== 'capex' ? ' (' + row.unit + ')' : ''), ents.map((e) => { const v = row.get(e); return v == null || (!row.text && !Number.isFinite(v)) ? 'n/a' : row.fmt(v); })]) };
    // FIX (R18e): the sentence named the docks as the binding limit of every column, which is only true when the data says so; now it names the binding limit and the flow range from the champion data, and shows only when every column has the same binding (old cause: the docks no longer bind the example, lifts and shuttles do)
    const bind = ents.length > 1 && ents[0].max_flow_binding && ents.every((e) => e.max_flow_binding === ents[0].max_flow_binding) ? ents[0].max_flow_binding : null;
    const flows = ents.map((e) => e.max_flow).filter(ok);
    const notes = [h('p.cap', 'Best value of each row in bold. Costs and energy rest on assumptions.'),
      anyTie ? h('p.cap', TIE_TEXT) : null,
      bind && flows.length ? h('p.cap', `The maximum flow binds on ${bind} in every column (${fmtNum(Math.min(...flows), 0)} to ${fmtNum(Math.max(...flows), 0)} moves/h); the storage limit in the second line of the Maximum flow row shows the headroom behind it.`) : null];
    // the design opened from a column: the model re-chooses the dock layout for the given inputs, so its numbers can differ slightly
    const vc = d.viewChamp;
    if (vc && S.rep && S.rep.headline) {
      const a = S.rep.headline, b = vc.headline;
      const diff = a.positions !== b.positions || Math.abs((a.capex_eur || 0) - (b.capex_low_eur ?? b.capex_eur ?? 0)) > 1 || Math.abs((a.F_io_s || 0) - (b.F_io_s || 0)) > 0.05;
      if (diff) notes.push(h('p.cap.cmp-diff', 'The design on screen was rebuilt from the inputs of its column; the model chose the dock layout again, so its numbers differ slightly from the column.'));
    }
    tableBox.replaceChildren(h('table.cmp-table', h('thead', head), h('tbody', body)), ...notes.filter(Boolean));
  }
  paint();
  const onChampions = (e) => {
    if (!root.isConnected) { document.removeEventListener('apw:champions', onChampions); return; }
    if (!e.detail || e.detail.report !== S.rep) return;
    d.champions = e.detail.champions;
    ents = makeEnts();
    paint();
  };
  document.addEventListener('apw:champions', onChampions);
  return { el: root, update: paint, ready: () => Promise.resolve(), snapshot: () => snap };
}
