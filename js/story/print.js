// Printable report (B5): builds #print-report (hidden on screen) with the design summary, the chapters, the compare table, every KPI table and the
// assumptions list, then calls window.print(). The print stylesheet (css/story.css) hides the app and shows only this block, in the light theme.
import { h, fmtKpi, fmtNum, eur, dockCaseLabel } from '../ui.js';
import { summaryLine, ASSUME_GROUP, ASSUME_KEY, kpiHidden } from '../results.js';
import { numText } from './chapters.js';
import { rackRows } from '../analysis.js';
import { statusInfo, capacityView } from '../diagnosis.js';
import { capGap } from './chapters.js';

const row = (a, b, c) => h('tr', h('th', { scope: 'row' }, a), h('td.num', b), c != null && h('td', c));
// FIX (R18e): printed values go through txt() so a missing report key shows "n/a", never "undefined" or "NaN" (old cause: raw template interpolation of report keys)
const txt = (x) => (x == null || x === '' || (typeof x === 'number' && !Number.isFinite(x)) ? 'n/a' : String(x));
// FIX (R18e): signed cost delta; a missing delta shows "n/a" (old cause: null >= 0 is true, so a null delta printed as "+ € 0")
const signedEur = (x) => (x == null || !Number.isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '-') + eur(Math.abs(x)));

export function printReport(S) {
  const rep = S.rep, d = rep.design, hd = rep.headline, sc = rep.scene, cy = sc.cycle;
  document.getElementById('print-report')?.remove();
  const when = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const lanes = d.depth ? `${d.depth}-deep lanes` : `mixed lanes (${(d.modules || []).join(' + ')})`;

  const designRows = [
    ['Building (L × W × H)', `${fmtNum(d.L, 1)} × ${fmtNum(d.W, 1)} × ${fmtNum(d.H, 1)} m`], ['Aisle direction', d.orient === 'y' ? 'north-south' : 'east-west'], ['Rack', `${txt(d.tiers)} tiers, ${lanes}`],
    ['Pallet positions', `${fmtNum(hd.positions, 0)} positions`], ['Lifts', `${txt(hd.lifts)} shuttle lifts${rep.fleet ? ` (${txt(rep.fleet.lifts_working)} working, ${txt(rep.fleet.lifts_spare)} spare), lift mode ${txt(rep.fleet.lift_mode)}` : ''}`], ['Shuttles (pooled fleet)', txt(hd.shuttles)],
    ['Fleet policy', rep.fleet ? `${rep.fleet.policy === 'pool' ? 'one pooled fleet, any tier' : txt(rep.fleet.policy)} (${String(rep.fleet.policy_reason || '').slice(0, 110)}${String(rep.fleet.policy_reason || '').length > 110 ? ' …' : ''})` : 'n/a'],
    ['Footprint', d.shape && d.shape !== 'rect' ? `${d.shape}-shape in a ${fmtNum(d.L, 1)} × ${fmtNum(d.W, 1)} m box` : 'rectangle'], ['ABC storage', d.abc ? 'on' : 'off'],
    ['Dock case, bays', rep.docks ? `${dockCaseLabel(rep.docks)}, ${txt(rep.docks.n_bays_in)} IN and ${txt(rep.docks.n_bays_out)} OUT bays, service level at least ${fmtNum(rep.docks.level_of_service * 100, 0)} %` : 'n/a'],
  ];
  const fixedRows = [
    ['Pallets in / out', `${fmtNum(cy.in_per_h, 0)} / ${fmtNum(cy.out_per_h, 0)} pallets/h`], ['Shuttle speed, acceleration', `${fmtNum(cy.v_shuttle, 1)} m/s, ${fmtNum(cy.a_shuttle, 1)} m/s²`],
    ['Shuttle turn, load / unload', `${fmtNum(cy.turn_s, 0)} s, ${fmtNum(cy.load_s, 0)} s`], ['Lift speed, acceleration', `${fmtNum(cy.v_lift, 1)} m/s, ${fmtNum(cy.a_lift, 1)} m/s²`],
    ['Lift transfer', `${fmtNum(cy.transfer_s, 0)} s`],
  ];
  // FIX (R18e): a chapter number without a unit printed "undefined" after the value (old cause: n.unit was interpolated raw)
  const chapters = S.chapters.map((c, i) => h('section.pr-ch', h('h3', `${i + 1}. ${c.title}`, h('span.cap', c.item ? ` ${c.item}` : null)), h('p.pr-msg', c.msg),
    h('table.pr-t', h('tbody', c.nums.map((n) => row(n.label, `${numText(n)} ${n.unit || ''}`)))), c.chart()));
  const groups = (rep.groups || []).filter((g) => g.kpis.some((r) => !kpiHidden(r.key))).map((g) => h('section.pr-g', h('h3', `${g.title}`, h('span.cap', ` brief item ${g.item}`)),
    h('table.pr-t', h('tbody', g.kpis.filter((r) => !kpiHidden(r.key)).map((r) => {   // FIX (R18e): hidden legacy rows stay out of the print too (old cause: geometry.avg_stock_gross printed 3,024 pallets)
       const f = fmtKpi(r); const as = ASSUME_KEY[r.key] || ASSUME_GROUP[g.id]; return row(txt(r.label) + (as ? ' *' : ''),`${f.text} ${f.unit || ''}`); })))));
  const ar = rep.areas;
  const areas = ar && ar.zones ? h('section', h('h2', 'Functional areas'), h('p.cap', String(ar.verdict_areas || ar.verdict || '')),
    h('table.pr-t', h('tbody', ar.zones.map((z) => row(txt(z.name) + (z.level ? ` (${z.level})` : ''),`${fmtNum(z.m2, 0)} m²`, z.rule))))) : null;
  // R13b: tier rule and rack capacity table (R12 keys)
  const tr = rep.tier_rule, rk = rackRows(rep), nxt = (tr && tr.next) || {};
  const tiersSec = tr ? h('section', h('h2', 'Tier rule'), h('p.cap', `${txt(tr.tiers)} tiers; binding limit: ${txt(tr.binding)}${tr.tied && tr.tied.length > 1 ? ' (tied: ' + tr.tied.join(', ') + ')' : ''}. Tappia et al. (2016): diminishing returns above about ${tr.tiers_soft || 7} tiers, a marker and not a hard cap.`),
    h('table.pr-t', h('tbody', [...Object.entries(tr.limits || {}).filter(([, x]) => x != null).map(([k, x]) => row('Limit: ' + k.replace('_', ' '), x >= 30 ? 'no limit' : `${x} tiers`)),
      ['Height needed for one more tier', nxt.height_needed != null ? `${fmtNum(nxt.height_needed, 2)} m` : 'n/a'], ['Positions gained by one more tier', nxt.positions_gain != null ? `${fmtNum(nxt.positions_gain * 100, 1)} %` : 'n/a'],
      ['Capacity: expected stored against positions needed', (() => { const cv = capacityView(rep); return cv.expectedStored != null ? `${fmtNum(cv.expectedStored, 0)} pallets stored; ${fmtNum(cv.required, 0)} positions needed for ${fmtNum(cv.target, 0)} pallets at service level ${txt(cv.sl)} *` : 'n/a'; })()],   // FIX (R18e): the service level was a hard-coded 0.9 when the report had none (old cause: an invented number); now n/a
      ['Expected stored (positions x lane fill)', rep.plan && rep.plan['plan.expected_stored'] != null ? `${fmtNum(rep.plan['plan.expected_stored'], 0)} pallets` : 'n/a']].map((r) => (Array.isArray(r) ? row(r[0], r[1]) : r))))) : null;
  const racksSec = rk ? h('section', h('h2', 'Rack capacity'), h('table.pr-t', h('thead', h('tr', ['Rack group', 'Racks', 'Columns', 'Lanes / rack', 'Pallets / rack', 'SKUs / rack', 'L x D x H (m)'].map((x) => h('th', x)))),
    h('tbody', rk.rows.map((r) => h('tr', h('th', { scope: 'row' }, `Block ${r.block + 1}, ${r.depth}-deep`), [r.racks, r.cols, r.lanes, r.pallets, fmtNum(r.skus, 0), `${fmtNum(r.length, 1)} × ${fmtNum(r.width, 1)} × ${fmtNum(r.height, 1)}`].map((x) => h('td.num', String(x))))))),
    h('p.cap', `Gap between pallets ${fmtNum(rk.gap_pallet, 2)} m, between stacked pallets ${fmtNum(rk.gap_vert, 2)} m, aisle ${fmtNum(rk.aisle, 2)} m.`)) : null;
  const cs = S.cmp && S.cmp.snapshot();
  const cmp = cs && cs.rows.length ? h('section.pr-cmp', h('h2', 'Comparison'), h('table.pr-t', h('thead', h('tr', h('th', ''), cs.heads.map((x) => h('th', x)))),
    h('tbody', cs.rows.map(([a, vals]) => h('tr', h('th', { scope: 'row' }, a), vals.map((v) => h('td.num', v))))))) : null;
  const assume = [...new Set([...(rep.groups || []).filter((g) => g.kpis.length && ASSUME_GROUP[g.id]).map((g) => ASSUME_GROUP[g.id]),
    ...(rep.groups || []).flatMap((g) => g.kpis.map((r) => ASSUME_KEY[r.key]).filter(Boolean))])];

  // R17b: the diagnosis in the report: what limits the design, the best possible, the top options (no section when the design meets everything)
  const dg = rep.diagnosis;
  const diagSec = dg && dg.status !== 'ok' && dg.status !== 'ok_with_warnings' ? h('section', h('h2', 'Diagnosis: ' + statusInfo(rep).title),
    h('p.cap', (g => g.charAt(0).toUpperCase() + g.slice(1))(capGap(rep)) + '.'),
    h('table.pr-t', h('tbody', (dg.limits || []).filter((l) => l.key !== 'evaluation').map((l) => row(txt(l.name), l.required != null ? `${fmtNum(l.achieved, 0)} of ${fmtNum(l.required, 0)} ${l.unit || ''}` : (l.ok ? 'met' : 'short'), l.ok ? 'Met' : 'Falls short')))),
    (dg.options || []).length ? h('table.pr-t', h('thead', h('tr', ['Change', 'Solves it', 'CAPEX', 'Annual'].map((x) => h('th', x)))),
      // FIX (R18e): a missing solves / delta / change shows n/a (old cause: null deltas printed as "+ € 0", a missing change printed nothing)
      h('tbody', dg.options.slice(0, 5).map((o) => h('tr', h('th', { scope: 'row' }, txt(o.change)), h('td', o.solves == null ? 'n/a' : o.solves ? 'Yes' : 'No'), h('td.num', signedEur(o.capex_delta_eur)), h('td.num', signedEur(o.annual_delta_eur)))))) : null) : null;
  const root = h('div#print-report', { 'data-theme': 'light' },
    h('header', h('p.cap', `APW Warehouse Designer · ${when}`), h('h1', d.L ? 'Warehouse design report' : 'Report'), h('p.pr-sum', summaryLine(rep)),
      h('p.cap', `${S.d.mode === 'optimal' ? 'Optimal warehouse' : 'Fixed warehouse'}${rep.label && !/^(Best: )?\d+$/.test(String(rep.label)) ? ' · rack pattern ' + String(rep.label).replace(/^Best: /, '') : ''}. ${statusInfo(rep).title}.`)),
    h('section', h('h2', 'Design summary'), h('table.pr-t', h('tbody', designRows.map(([a, b]) => row(a, b)))),
      h('table.pr-t', h('tbody', [['CAPEX', eur(hd.capex_eur)], ['Annual cost', eur(hd.annual_eur) + ' / year'], ['Cost per pallet move', '€ ' + fmtNum(hd.per_move_eur, 2)],
        ['Maximum flow', fmtNum(hd.max_flow_moves_h, 0) + ' moves/h' + (rep.max_flow && rep.max_flow.storage ? ` (storage ${fmtNum(rep.max_flow.storage.moves_h, 0)}, binds on ${txt(rep.max_flow.binding_now)})` : '')], /* FIX (R18e): guard rep.max_flow.storage and binding_now (old cause: raw access, "binds on undefined" if the key was missing) */ ['Energy', fmtNum(hd.energy_kwh_day, 1) + ' kWh/day']].map(([a, b]) => row(a, b))))),
    diagSec, areas, tiersSec, racksSec, h('section', h('h2', 'Story'), chapters), cmp, h('section', h('h2', 'All figures'), groups),
    h('section', h('h2', 'Fixed by the brief'), h('table.pr-t', h('tbody', fixedRows.map(([a, b]) => row(a, b))))),
    h('section', h('h2', 'Assumptions'), h('p.cap', 'Figures marked * rest on these assumptions of the model.'), h('ul', assume.map((a) => h('li', a))),
      h('p.cap', 'Model: APW parametric model, service version ' + txt(rep.model_version && rep.model_version.service) + '. Brief: Advanced Project Work, Digital Warehousing and Transportation.')));
  document.body.append(root);
  const old = document.title;
  document.title = `APW warehouse design ${fmtNum(d.L, 0)}x${fmtNum(d.W, 0)}x${fmtNum(d.H, 0)}`;
  const done = () => { document.title = old; removeEventListener('afterprint', done); };
  addEventListener('afterprint', done);
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}
