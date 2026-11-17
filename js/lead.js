// Lead pictures of the analysis tabs (R26d V8): each of the first four tabs opens with one drawing, the prose and tables follow below it.
//   Fleet and lifts -> the pallet path as a strip (nine steps in four phases), Areas -> the floor split of the functional areas, Capacity and flow -> the plan of docks and bays,
//   Tiers and racks -> the tier gauge (rack height against building height, next tier). Every length and share is read from the report (io_path stage seconds, areas.zones, scene,
//   tier_rule); the drawings only turn those numbers into widths and heights. Nothing is computed here.
import { h, fmtNum, fmtPct } from './ui.js';
import { scenePlan } from './scene/fallback.js';

const NS = 'http://www.w3.org/2000/svg';
const S = (t, a = {}, ...kids) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) if (v != null) e.setAttribute(k, v); kids.flat().forEach((c) => c != null && e.append(c)); return e; };

// Same four phases and roles as the story chart (chapters.js PHASE) and the 3D path (scene/iopath.js).
const PHASES = [
  { label: 'Truck and dock', role: 'structure', res: ['forklift', 'truck', 'dock'] },
  { label: 'Conveyor and bay', role: 'in', res: ['conveyor', 'bay'] },
  { label: 'Lift', role: 'lift', res: ['lift'] },
  { label: 'Shuttle and lane', role: 'shuttle', res: ['shuttle'] },
];
const phaseOf = (res) => Math.max(0, PHASES.findIndex((p) => p.res.includes(res)));

/** The IN and OUT path as two strips, segment width = stage seconds, number = step, colour = phase (word legend under it). */
export function ioStrip(io) {
  if (!io || !io.IN) return null;
  const row = (flow, title) => {
    const d = io[flow]; if (!d || !d.stages) return null;
    const tot = d.stages.reduce((a, s) => a + Math.max(0.5, s.time_s || 0), 0);
    const seg = d.stages.map((s, i) => {
      const p = PHASES[phaseOf(s.resource)], w = Math.max(0.5, s.time_s || 0) / tot;
      return h('li.ls-seg', { style: `flex:${(w * 100).toFixed(3)} 1 0; background:var(--role-${p.role})`, title: `${i + 1}. ${s.label}: ${fmtNum(s.time_s || 0, 0)} s (${p.label})` }, h('span', String(i + 1)));
    });
    return h('div.ls-row', h('p.ls-title', h('b', title), h('span.muted', ` ${fmtNum(d.total_with_wait_s ?? d.total_s, 0)} s`)), h('ol.ls-strip', { 'aria-label': `${title}: ${d.stages.map((s) => s.label).join(', ')}` }, seg));
  };
  const used = new Set(['IN', 'OUT'].flatMap((f) => (io[f] ? io[f].stages.map((s) => phaseOf(s.resource)) : [])));
  return h('figure.lead.lead-strip', h('figcaption.lead-cap', 'The path of one pallet, split into the model\'s steps. Width = time in the step.'),
    row('IN', 'Pallet in'), row('OUT', 'Pallet out'),
    h('ul.ls-legend', PHASES.map((p, i) => used.has(i) && h('li', h('i', { style: `background:var(--role-${p.role})` }), p.label))));
}

/** Floor split of the functional areas: one bar, width = share of the floor, the four biggest named. */
export function areaBar(a) {
  const zones = ((a && a.zones) || []).filter((z) => z.m2 > 0);
  if (!zones.length) return null;
  const tot = zones.reduce((s, z) => s + z.m2, 0);
  const named = [...zones].sort((x, y) => y.m2 - x.m2).slice(0, 4).map((z) => z.name);
  const bar = h('ol.la-bar', { 'aria-label': 'Floor split of the functional areas' }, zones.map((z, i) => h('li.la-seg', { style: `flex:${(z.m2 / tot * 100).toFixed(3)} 1 0; --k:${30 + (i % 6) * 11}%`, title: `${z.name}: ${fmtNum(z.m2, 0)} m² (${fmtPct(z.share_of_floor != null ? z.share_of_floor * 100 : z.m2 / tot * 100, 1)} %)` })));
  return h('figure.lead.lead-areas', h('figcaption.lead-cap', 'How the floor is split. Width = area; hover a block for its name.'), bar,
    h('ul.ls-legend', named.map((n, i) => h('li', h('i', { style: `background:color-mix(in srgb, var(--accent) ${30 + (zones.findIndex((z) => z.name === n) % 6) * 11}%, var(--surface-2))` }), n))));
}

/** The plan of docks, bays and racks (the 2D scene plan the results page already draws). */
export function dockPlan(rep) {
  let svg = null;
  try { svg = scenePlan(rep); } catch (e) { return null; }
  if (!svg) return null;
  return h('figure.lead.lead-plan', h('figcaption.lead-cap', 'Top view: docks, truck bays and the rack block.'), h('div.lead-plan-box', svg));
}

/** The tier gauge: the tiers stacked against the building height, the next tier as a ghost (red when it does not fit under the roof), the 7-tier marker. */
export function tierGauge(rep) {
  const sc = rep.scene, tr = rep.tier_rule;
  if (!sc || !sc.building || !sc.tiers || !sc.tier_pitch) return null;
  const H = sc.building.H, P = sc.tier_pitch, n = sc.tiers, Hr = n * P, nx = (tr && tr.next) || {};
  const top = Math.max(H, Hr + P) * 1.04, VH = 250, y0 = 12, k = (VH - y0 - 8) / top, ground = y0 + top * k;
  const X = 74, TW = 70;
  const yOf = (m) => ground - m * k;
  const short = (nx.height_short || 0) > 0;
  const svg = S('svg', { viewBox: '0 0 330 ' + (ground + 14), class: 'lead-gauge-svg', role: 'img', 'aria-label': `Tier gauge: ${n} tiers, rack ${fmtNum(Hr, 1)} m of a ${fmtNum(H, 1)} m building` });
  for (let t = 0; t < n; t++) svg.append(S('rect', { x: X, y: yOf((t + 1) * P) + 1, width: TW, height: P * k - 2, rx: 2, class: 'lg-tier' }));
  svg.append(S('rect', { x: X, y: yOf(Hr + P), width: TW, height: P * k, rx: 2, class: 'lg-ghost' + (short ? ' bad' : '') }));
  svg.append(S('line', { x1: X - 12, x2: X + TW + 60, y1: yOf(H), y2: yOf(H), class: 'lg-roof' }), S('line', { x1: X - 12, x2: X + TW + 12, y1: ground, y2: ground, class: 'lg-floor' }));
  const lab = (x, y, txt, cls = '') => S('text', { x, y, class: 'lg-t ' + cls }, txt);
  svg.append(lab(X + TW + 8, yOf(H) - 5, `Building ${fmtNum(H, 1)} m`), lab(X - 8, yOf(Hr / 2) + 4, `${n} tiers`, 'end'), lab(X - 8, yOf(Hr / 2) + 20, `rack ${fmtNum(Hr, 1)} m`, 'end'));
  if (nx.tiers) svg.append(lab(X + TW + 8, yOf(Hr + P / 2) + 4, short ? `Tier ${nx.tiers}: ${fmtNum(nx.height_short, 1)} m short` : `Tier ${nx.tiers} fits`, short ? 'bad' : ''));
  const soft = tr && tr.tiers_soft;
  if (soft && soft <= n + 1) svg.append(S('line', { x1: X - 6, x2: X + TW + 6, y1: yOf(soft * P), y2: yOf(soft * P), class: 'lg-soft' }), lab(X + TW + 8, yOf(soft * P) + 4, `${soft}-tier marker`, 'soft'));
  return h('figure.lead.lead-gauge', h('figcaption.lead-cap', `Rack height against the building${tr && tr.binding ? `; the limit that binds: ${tr.binding}` : ''}.`), svg);
}
