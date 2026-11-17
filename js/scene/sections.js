// Sections (R9b): turns report.scene into storage sections the world builder understands.
// A rectangle is one section; an L / U / T / union footprint is one section per storage block (each with its own aisle axis).
// A section scene has the same shape as the old rectangle scene (building, columns, modules, blocks, channels, lifts, docks) in coordinates local to the block origin.
// Everything physical comes from the model; the constants below are the model's layout constants (params perim, front, aisle, lane pitch) used only where the shape scene
// does not carry them (listed as wished fields in the R9b report) and are tagged *assumption*.
const PERIM = 0.5, FRONT = 2.0, AISLE = 1.3, DEPTH_PITCH = 1.0, LANE_PITCH = 1.55, PITCH_BAY = 4.5;       // *assumption*: params.py values, not in the shape scene
const LOAD = { across: 1.25, along: 0.85, height: 1.7 };                                                     // *assumption*: slide-12 unit load, not in the shape scene
export const BAY_PITCH = PITCH_BAY;

const WALLS = ['S', 'N', 'W', 'E'];
const NRM = { W: [-1, 0], E: [1, 0], S: [0, -1], N: [0, 1] };

/** footprint rectangles [x, y, w, h] of the building in world metres */
export function footprintRects(sc) {
  if (sc.footprint && sc.footprint.rects) return sc.footprint.rects.map((r) => r.slice());
  return [[0, 0, sc.building.L, sc.building.W]];
}
export function insideFootprint(rects, x, y, eps = 1e-6) { return rects.some((r) => x > r[0] + eps && x < r[0] + r[2] - eps && y > r[1] + eps && y < r[1] + r[3] - eps); }

/** exterior wall segments of the union of rects: [{x0,y0,x1,y1,wall}] with wall = the outward direction (S, N, W, E); overlaps between rectangles are removed */
export function exteriorEdges(rects) {
  const out = [];
  for (const [x, y, w, h] of rects) {
    const sides = [['S', x, y, x + w, y], ['N', x, y + h, x + w, y + h], ['W', x, y, x, y + h], ['E', x + w, y, x + w, y + h]];
    for (const [wall, x0, y0, x1, y1] of sides) {
      const horiz = wall === 'S' || wall === 'N';
      let cuts = [[horiz ? x0 : y0, horiz ? x1 : y1]];
      for (const r of rects) {
        if (r[0] === x && r[1] === y && r[2] === w && r[3] === h) continue;
        // part of the edge that touches or is covered by another rectangle on the outward side
        const lo = horiz ? r[0] : r[1], hi = horiz ? r[0] + r[2] : r[1] + r[3];
        const sameLine = horiz ? (wall === 'S' ? Math.abs(r[1] + r[3] - y0) < 1e-6 || (r[1] < y0 - 1e-6 && r[1] + r[3] > y0 + 1e-6) : Math.abs(r[1] - y0) < 1e-6 || (r[1] < y0 - 1e-6 && r[1] + r[3] > y0 + 1e-6))
          : (wall === 'W' ? Math.abs(r[0] + r[2] - x0) < 1e-6 || (r[0] < x0 - 1e-6 && r[0] + r[2] > x0 + 1e-6) : Math.abs(r[0] - x0) < 1e-6 || (r[0] < x0 - 1e-6 && r[0] + r[2] > x0 + 1e-6));
        if (!sameLine) continue;
        const next = [];
        for (const [a, b] of cuts) { if (hi <= a || lo >= b) next.push([a, b]); else { if (lo > a) next.push([a, lo]); if (hi < b) next.push([hi, b]); } }
        cuts = next;
      }
      for (const [a, b] of cuts) if (b - a > 1e-3) out.push(horiz ? { x0: a, y0, x1: b, y1: y0, wall } : { x0, y0: a, x1: x0, y1: b, wall });
    }
  }
  return out;
}

/** doors of the building in world coordinates: [{flow, x, y, wall, nx, ny, s, w, h, idx}] from the model's bay / door rectangles (4.5 m pitch) */
export function buildDoors(sc, rects) {
  const raw = sc.door_rects || (sc.bays || []).map((b) => ({ flow: b.flow, x: b.x, y: b.y, w: b.w, h: b.h, wall: b.wall }));
  return raw.map((d, idx) => {
    const cx = d.x + d.w / 2, cy = d.y + d.h / 2, depth = Math.max(d.w, d.h);
    let wall = d.wall;
    if (!wall) for (const k of WALLS) { const [nx, ny] = NRM[k]; if (!insideFootprint(rects, cx + nx * (depth / 2 + 0.3), cy + ny * (depth / 2 + 0.3))) { wall = k; break; } }
    wall = wall || 'S';
    const [nx, ny] = NRM[wall];
    const x = wall === 'W' ? cx - depth / 2 : wall === 'E' ? cx + depth / 2 : cx, y = wall === 'S' ? cy - depth / 2 : wall === 'N' ? cy + depth / 2 : cy;
    const flow = String(d.flow).toUpperCase();
    return { idx, flow, x: wall === 'W' || wall === 'E' ? x : cx, y: wall === 'S' || wall === 'N' ? y : cy, wall, nx, ny, s: wall === 'W' || wall === 'E' ? cy : cx, w: d.w, h: d.h, rect: d };
  });
}

/** cross-aisle column indices for grid_k: after every k lane columns (model reason text: "grid every k columns, floor((nc-1)/(k+1)) cross-aisles") *assumption* */
export function crossColumns(nc, k) {
  const out = [];
  if (!k || k < 1) return out;
  for (let j = 1; j * (k + 1) - 1 < nc - 1 && j <= Math.floor((nc - 1) / (k + 1)); j++) out.push(j * (k + 1) - 1);
  return out;
}

function kindFractions(kinds, n) {
  const out = [];
  for (const k of String(kinds || '').split(',')) { const m = /cross@([0-9.]+)/.exec(k); if (m) out.push(parseFloat(m[1])); }
  return out.length ? out : (n ? [0.5] : []);
}

/** lifts of one section in section-local metres. `want` = [{group}] already assigned to this section */
function placeLifts(sec, want, fr, crossU) {
  const lifts = [];
  const nv = Math.max(1, want.length), A = sec.columns.axis;
  const ext = A === 'x' ? sec.building.W : sec.building.L;           // across the columns
  want.forEach((g, i) => {
    let u;
    if (crossU.length) u = crossU[Math.min(crossU.length - 1, Math.round(fr[i % fr.length] * (crossU.length - 1) + 1e-9))];
    else if (sec.channels.length) { const ch = sec.channels[0].box; u = A === 'x' ? (ch.x0 + ch.x1) / 2 : (ch.y0 + ch.y1) / 2; }
    else u = sec.columns.start - 1.0;
    const v = ext * (i + 1) / (nv + 1);
    lifts.push({ id: g.id, group: g.group, kind: g.kind, x: A === 'x' ? u : v, y: A === 'x' ? v : u, shaft: false, type: 'shuttle', spare: g.group === 'SPARE', approximate: false });
  });
  return lifts;
}

/** whole-scene helper: splits the working lifts over sections and assigns groups so that every section can take in and send out */
function assignLifts(report, nSec, weights) {
  const plan = report.plan || {};
  const nIn = plan['plan.lifts_in'] ?? 1, nOut = plan['plan.lifts_out'] ?? 1, nSp = plan['plan.lifts_spare'] ?? 0;
  const total = Math.max(nSec, (nIn + nOut + nSp) || 1);
  const groups = [];
  for (let i = 0; i < nIn; i++) groups.push('IN');
  for (let i = 0; i < nOut; i++) groups.push('OUT');
  for (let i = 0; i < nSp; i++) groups.push('SPARE');
  while (groups.length < total) groups.push('OUT');
  const sw = weights.reduce((a, b) => a + b, 0) || 1;
  const quota = weights.map((w) => Math.max(1, Math.floor(total * w / sw)));
  while (quota.reduce((a, b) => a + b, 0) < total) { let bi = 0; quota.forEach((q, i) => { if (weights[i] / q > weights[bi] / quota[bi]) bi = i; }); quota[bi]++; }
  while (quota.reduce((a, b) => a + b, 0) > total) { const i = quota.indexOf(Math.max(...quota)); if (quota[i] > 1) quota[i]--; else break; }
  const per = quota.map(() => []);
  // interleave groups: IN first to different sections so each section gets an IN lift
  const order = [...groups.filter((g) => g === 'IN'), ...groups.filter((g) => g === 'OUT'), ...groups.filter((g) => g === 'SPARE')];
  let n = 0;
  for (const g of order) {
    let s = (n++) % nSec, guard = 0;
    while (per[s].length >= quota[s] && guard++ < nSec) s = (s + 1) % nSec;
    per[s].push({ group: g });
  }
  per.forEach((arr, s) => {
    if (arr.length && !arr.some((x) => x.group === 'IN')) arr[0].group = 'IN';
    arr.forEach((x, i) => { x.id = `L${s + 1}.${i + 1}`; x.kind = plan['plan.lift_kinds']; });
  });
  return per;
}

/** nearest unused door of a flow for a section (reuse when all are used) */
function pickDoor(doors, flow, cx, cy, used) {
  const c = doors.filter((d) => d.flow === flow);
  if (!c.length) return null;
  const free = c.filter((d) => !used.has(d.idx)), pool = free.length ? free : c;
  pool.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
  used.add(pool[0].idx); return pool[0];
}


/** active shuttles of the pooled fleet: report.fleet.active_shuttles (R13a request: not in the report yet) or the KPI fleet.pool.active_shuttles, else all N (none parked) */
function activeOf(report, n) {
  const f = report.fleet && report.fleet.active_shuttles;
  if (f != null) return f;
  for (const g of report.groups || []) for (const k of g.kpis) if (k.key === 'fleet.pool.active_shuttles' && k.value != null) return k.value;
  return n;
}
const sub = (b, o) => ({ x0: b.x0 - o.x, x1: b.x1 - o.x, y0: b.y0 - o.y, y1: b.y1 - o.y });

/** FIX (R21b, G9): the ABC map of one block. L / U / T reports carry one map per block in scene.abc_cells.blocks[] (rows[tier] = one letter per column of the block, '-' = support column; ranking: tier first,
 *  then aisle time to the nearest working station of the block). Old cause: every block of an L / U / T was painted with the single rectangle-style map (column rank along one aisle, same for every block).
 *  A report that has blocks[] but no entry for this block is an error, not a silent fallback. */
function blockAbc(ac, bi, shape) {
  if (!ac || !shape || !Array.isArray(ac.blocks)) return ac;
  const b = ac.blocks.find((x) => x.block === bi.id);
  if (!b) throw new Error(`scene.abc_cells.blocks has no entry for block ${bi.id}`);
  return { ...ac, rows: b.rows, class_cells: b.class_cells, columns: b.columns, perBlock: true, head: b.head, axis: b.axis };
}

/** sections from the R10b scene fields (blocks_info, modules, blocks, channels, lifts, conveyors, load, pitch, abc_cells); see SCENE_DOC in apw/service.py */
function buildFromModel(report, out) {
  const sc = report.scene, B = sc.building, doors = out.doors, P = sc.pitch || {};
  const colPitch = P.column || LANE_PITCH;
  const shape = !!sc.storage_blocks;
  const used = { IN: new Set(), OUT: new Set() };
  const totalN = sc.shuttles.total || 1, wsum = sc.blocks_info.reduce((a, b) => a + (b.rect.w * b.rect.h), 0) || 1;
  out.warnings = [];
  sc.blocks_info.forEach((bi, k) => {
    const o = shape ? { x: bi.rect.x, y: bi.rect.y } : { x: 0, y: 0 };
    const A = bi.orient === 'y' ? 'y' : 'x';
    const cross = bi.cross_columns || [];
    const mods = shape ? sc.modules.filter((m) => m.block === bi.id) : sc.modules;
    const modules = mods.map((m, i) => ({ ...m, index: m.index != null ? m.index : i, aisle: sub(m.aisle, o), centre: shape ? m.centre : m.centre }));
    const blocksL = (shape ? sc.blocks.filter((b) => b.block === bi.id) : sc.blocks).map((b) => ({ ...b, box: sub(b.box, o) }));
    const channels = (shape ? sc.channels.filter((c) => c.block === bi.id) : (sc.channels || [])).map((c) => ({ ...c, box: sub(c.box, o) }));
    let vLo = Infinity, vHi = -Infinity;
    for (const b of blocksL) { const lo = A === 'x' ? b.box.y0 : b.box.x0, hi = A === 'x' ? b.box.y1 : b.box.x1; vLo = Math.min(vLo, lo); vHi = Math.max(vHi, hi); }
    for (const ci of cross) {
      const u0 = bi.column_start + ci * colPitch, u1 = u0 + colPitch;
      channels.push({ role: 'cross', box: A === 'x' ? { x0: u0, x1: u1, y0: vLo, y1: vHi } : { x0: vLo, x1: vHi, y0: u0, y1: u1 } });
    }
    const L = shape ? bi.rect.w : B.L, W = shape ? bi.rect.h : B.W;
    const sec = { building: { L, W, H: B.H }, orient: A, flow: sc.flow, tiers: sc.tiers, tier_pitch: sc.tier_pitch, tier_z: sc.tier_z, load: sc.load || LOAD, pitch: P,
      columns: { count: bi.columns, pitch: colPitch, start: bi.column_start, axis: A, length: bi.column_length, skip: [...cross, ...(bi.walkway_columns || [])], cross, store: Array.isArray(bi.store_columns) ? bi.store_columns.length : undefined }, shaft_cells: bi.shaft_cells, modules, blocks: blocksL, channels, zones: [], docks: {}, bays: [],
      conveyors: [], shuttles: { ...sc.shuttles, tier_captive: !shape && sc.shuttles.policy === 'captive' }, cycle: { ...sc.cycle }, storage_block: { x: 0, y: 0, w: L, h: W }, abc_cells: blockAbc(sc.abc_cells, bi, shape),
      head_high: (bi.head_sides || []).some((h) => h === 'N' || h === 'E') && !(bi.head_sides || []).some((h) => h === 'S' || h === 'W') };
    sec.lifts = (bi.lift_stations || []).map((l) => ({ id: l.id, group: l.group, kind: l.kind, role: l.role, x: l.x - o.x, y: l.y - o.y, shaft: l.role === 'shaft' || !!(sc.lifts.find((q) => q.id === l.id) || {}).shaft,   /* FIX (R18e): L / U / T reports mark an in-column lift by role 'shaft' (scene.lifts has no shaft flag there); old cause: shaft was always false for footprints, so the lift drew one roller side */ type: 'shuttle', spare: !!l.spare, approximate: false }));
    // conveyors of this block's lifts, local metres (dock wall -> dock point -> along the dock row -> lift deck)
    sec.conveyors = (sc.conveyors || []).filter((c) => c.block === bi.id || (!shape && c.block == null)).map((c) => ({ ...c, points: c.points.map((p) => ({ x: p.x - o.x, y: p.y - o.y })) }));
    if (shape) {
      const share = (bi.rect.w * bi.rect.h) / wsum;
      void share;
    }
    // docks: nearest door of the flow to the first point of the flow's conveyor (rectangle: the model's own docks)
    if (shape && (bi.lift_stations || []).length) {            // FIX (R13a): a block without lifts took a door (and a truck) it never serves
      for (const [flow, key] of [['IN', 'in'], ['OUT', 'out']]) {
        const c = (sc.conveyors || []).find((q) => q.block === bi.id && q.flow === flow);
        const ref = c ? c.points[0] : { x: bi.rect.x + bi.rect.w / 2, y: bi.rect.y + bi.rect.h / 2 };
        const d = pickDoor(doors, flow, ref.x, ref.y, used[flow]);
        if (d) {
          sec.docks[key] = { x: d.x - o.x, y: d.y - o.y, wall: d.wall, doorIdx: d.idx };
          const gap = c ? Math.hypot(c.points[0].x - d.x, c.points[0].y - d.y) : 0;
          if (gap > 3) out.warnings.push(`block ${bi.id} ${flow}: conveyor starts ${gap.toFixed(1)} m from the nearest ${flow} door (model field scene.conveyors[].points[0])`);
        }
      }
    } else sec.docks = sc.docks || {};
    out.sections.push({ id: k, origin: o, sc: sec, block: shape ? sc.storage_blocks[k] : null, positions: shape ? (sc.storage_blocks[k] || {}).positions || 1 : (report.headline ? report.headline.positions : 1), info: bi });
  });
  // fleet: the model gives the total N and the active count (fleet.pool.active_shuttles, R13a); the pooled fleet starts split over the blocks that have a lift station by positions, total
  // preserved (*assumption*: the model has no start position). FIX (R13a): a block without a lift station (U: the largest block has none in the model) got a shuttle that crashed the
  // animation (old cause: `L[i % 0]`); it has none now, and no flow of its own (its stock stays as stocked; reported in `warnings`). The parked shuttles (N - active) are taken from the
  // blocks with the most shuttles.
  const nActive = Math.max(1, Math.min(totalN, Math.round(activeOf(report, totalN))));
  out.nActive = nActive; out.nTotal = totalN;
  const withLift = out.sections.filter((s) => s.sc.lifts.length);
  out.sections.forEach((s) => { s.sc.shuttles.total = 0; s.sc.shuttles.in_service = 0; });
  out.sections.filter((s) => !s.sc.lifts.length).forEach((s) => out.warnings.push(`block ${s.id} has no lift station in the model: it is drawn stocked but not served in the animation (scene.blocks_info[].lift_stations is empty)`));
  if (withLift.length) {
    const sw = withLift.reduce((a, s) => a + s.positions, 0) || 1;
    withLift.forEach((s) => { s.sc.shuttles.total = Math.max(1, Math.floor(totalN * s.positions / sw)); });
    let sum = withLift.reduce((a, s) => a + s.sc.shuttles.total, 0), g = 0;
    while (sum !== totalN && g++ < 200) {
      const s = withLift.reduce((a, c) => (sum < totalN ? (c.positions / (c.sc.shuttles.total + 1) > a.positions / (a.sc.shuttles.total + 1) ? c : a) : (c.sc.shuttles.total > a.sc.shuttles.total ? c : a)));
      if (sum < totalN) { s.sc.shuttles.total++; sum++; } else if (s.sc.shuttles.total > 1) { s.sc.shuttles.total--; sum--; } else break;
    }
    withLift.forEach((s) => { s.sc.shuttles.in_service = s.sc.shuttles.total; });
    for (let parked = totalN - nActive; parked > 0; parked--) { const s = withLift.reduce((a, c) => (c.sc.shuttles.in_service > a.sc.shuttles.in_service ? c : a)); if (s.sc.shuttles.in_service > 1) s.sc.shuttles.in_service--; else break; }
  }
  if (!shape && out.sections[0]) { out.sections[0].sc.shuttles.total = totalN; out.sections[0].sc.shuttles.in_service = nActive; }
  return out;
}

/** section list for the report: [{id, origin:{x,y}, sc, block}] plus footprint, doors and the bounding box */
export function buildSections(report) {
  const sc = report.scene, rects = footprintRects(sc), doors = buildDoors(sc, rects), B = sc.building;
  const out = { rects, doors, building: B, shape: sc.shape || 'rect', sections: [], plan: report.plan || {} };
  const gridK = (report.plan || {})['plan.grid_k'] || 0;
  if (sc.blocks_info && sc.blocks_info.length) return buildFromModel(report, out);       // R10b: the model's own block, lift, conveyor and column fields (the code below is the fallback for older reports)
  if (!sc.storage_blocks) {                                   // rectangle: the scene is the one section (world coordinates, origin 0)
    const sec = JSON.parse(JSON.stringify(sc));
    const cross = crossColumns(sec.columns.count, gridK);
    sec.columns.skip = cross;
    const A = sec.columns.axis, c0 = sec.columns.start, cp = sec.columns.pitch;
    const mods = sec.modules;
    const vLo = Math.min(...sec.blocks.map((b) => (A === 'x' ? b.box.y0 : b.box.x0))), vHi = Math.max(...sec.blocks.map((b) => (A === 'x' ? b.box.y1 : b.box.x1)));
    sec.channels = sec.channels || [];
    for (const ci of cross) {
      const u0 = c0 + ci * cp, u1 = u0 + cp;
      sec.channels.push({ role: 'cross', box: A === 'x' ? { x0: u0, x1: u1, y0: vLo, y1: vHi } : { x0: vLo, x1: vHi, y0: u0, y1: u1 } });
    }
    const crossU = cross.map((ci) => c0 + (ci + 0.5) * cp);
    const lifts = sec.lifts || [];
    if (crossU.length && /cross@/.test((report.plan || {})['plan.lift_kinds'] || '')) {
      const fr = kindFractions((report.plan || {})['plan.lift_kinds'], 1);
      const want = lifts.map((l, i) => ({ group: l.group, id: l.id, kind: l.kind }));
      sec.lifts = placeLifts(sec, want, fr, crossU);
      // FIX (R9b): lifts sat in a row at the aisle heads (old cause: the model lists lift stations only by kind); now cross@f stations stand in the grid cross-aisles
      void mods;
    }
    sec.docks = sec.docks || {};
    out.sections.push({ id: 0, origin: { x: 0, y: 0 }, sc: sec, block: null, positions: report.headline ? report.headline.positions : 0 });
    out.cross = cross;
    return out;
  }
  const blocks = sc.storage_blocks;
  const per = assignLifts(report, blocks.length, blocks.map((b) => b.positions));
  const used = { IN: new Set(), OUT: new Set() };
  const fr = kindFractions((report.plan || {})['plan.lift_kinds'], 1);
  blocks.forEach((b, bi) => {
    const A = b.orient === 'y' ? 'y' : 'x';
    const extU = A === 'x' ? b.w : b.h, extV = A === 'x' ? b.h : b.w;
    let cols = b.columns;
    let free = extU - cols * LANE_PITCH - 2 * PERIM;
    if (free < FRONT - 0.3) { cols = Math.max(1, Math.floor((extU - 2 * PERIM - FRONT) / LANE_PITCH)); free = extU - cols * LANE_PITCH - 2 * PERIM; }
    // head end: towards the other blocks (shared front channel); a single block: towards the first dock
    const others = blocks.filter((_, j) => j !== bi);
    const tx = others.length ? others.reduce((a, o) => a + o.x + o.w / 2, 0) / others.length : (sc.dock_points && sc.dock_points.IN ? sc.dock_points.IN[0][0] : b.x);
    const ty = others.length ? others.reduce((a, o) => a + o.y + o.h / 2, 0) / others.length : (sc.dock_points && sc.dock_points.IN ? sc.dock_points.IN[0][1] : b.y);
    const mid = A === 'x' ? b.x + b.w / 2 : b.y + b.h / 2, tgt = A === 'x' ? tx : ty;
    const headLow = tgt < mid;
    const bothEnds = free >= 2 * FRONT - 0.3;
    const u0 = headLow || bothEnds ? PERIM + FRONT : PERIM;
    const uLen = cols * LANE_PITCH;
    const modW = b.modules.map((m) => 2 * m * DEPTH_PITCH + AISLE), sumW = modW.reduce((a, c) => a + c, 0), vOff = Math.max(PERIM, (extV - sumW) / 2);
    const bx = (u0_, u1_, v0_, v1_) => (A === 'x' ? { x0: u0_, x1: u1_, y0: v0_, y1: v1_ } : { x0: v0_, x1: v1_, y0: u0_, y1: u1_ });
    const modules = [], bl = []; let off = vOff;
    b.modules.forEach((m, i) => {
      const w = modW[i], yc = off + w / 2;
      modules.push({ index: i, depth: m, aisle: bx(u0, u0 + uLen, yc - AISLE / 2, yc + AISLE / 2), centre: yc, width: w, lane_length: m * DEPTH_PITCH });
      for (const side of [0, 1]) { const v0 = side === 0 ? yc - w / 2 : yc + AISLE / 2, v1 = side === 0 ? yc - AISLE / 2 : yc + w / 2; bl.push({ module: i, side, depth: m, box: bx(u0, u0 + uLen, v0, v1) }); }
      off += w;
    });
    const channels = [];
    if (headLow || bothEnds) channels.push({ role: 'head', box: bx(PERIM, PERIM + FRONT, 0, extV) });
    if (!headLow || bothEnds) channels.push({ role: 'tail', box: bx(extU - PERIM - FRONT, extU - PERIM, 0, extV) });
    const cross = crossColumns(cols, gridK);
    for (const ci of cross) channels.push({ role: 'cross', box: bx(u0 + ci * LANE_PITCH, u0 + (ci + 1) * LANE_PITCH, vOff, vOff + sumW) });
    const L = A === 'x' ? b.w : b.w, W = b.h;
    const sec = { building: { L, W, H: B.H }, orient: A, flow: sc.flow, tiers: sc.tiers, tier_pitch: sc.tier_pitch, tier_z: sc.tier_z, load: LOAD,
      columns: { count: cols, pitch: LANE_PITCH, start: u0, axis: A, length: uLen, skip: cross }, modules, blocks: bl, channels, zones: [], docks: {}, bays: [], conveyors: [],
      shuttles: { ...sc.shuttles }, cycle: { ...sc.cycle }, lifts: [], storage_block: { x: 0, y: 0, w: b.w, h: b.h } };
    const crossU = cross.map((ci) => u0 + (ci + 0.5) * LANE_PITCH);
    sec.lifts = placeLifts(sec, per[bi].length ? per[bi] : [{ group: 'IN', id: `L${bi + 1}.1`, kind: '' }], fr, crossU);
    // shuttles: the model's fleet split over the blocks by positions (the pooled transfer between blocks is not animated: *assumption*)
    const totalN = sc.shuttles.total || 1, sw = blocks.reduce((a, c) => a + c.positions, 0) || 1;
    sec.shuttles.total = Math.max(1, Math.round(totalN * b.positions / sw)); sec.shuttles.in_service = sec.shuttles.total;
    // docks: nearest unused door of each flow, local coordinates
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    for (const [flow, key] of [['IN', 'in'], ['OUT', 'out']]) {
      const d = pickDoor(doors, flow, cx, cy, used[flow]);
      if (d) sec.docks[key] = { x: d.x - b.x, y: d.y - b.y, wall: d.wall, doorIdx: d.idx };
    }
    out.sections.push({ id: bi, origin: { x: b.x, y: b.y }, sc: sec, block: b, positions: b.positions });
  });
  // fleet rounding: total equals the model's N
  const target = sc.shuttles.total || 1;
  let sum = out.sections.reduce((a, s) => a + s.sc.shuttles.total, 0), g = 0;
  while (sum !== target && g++ < 50) {
    const s = out.sections.reduce((a, c) => (sum < target ? (c.positions > a.positions ? c : a) : (c.sc.shuttles.total > a.sc.shuttles.total ? c : a)));
    if (sum < target) { s.sc.shuttles.total++; s.sc.shuttles.in_service++; sum++; } else if (s.sc.shuttles.total > 1) { s.sc.shuttles.total--; s.sc.shuttles.in_service--; sum--; } else break;
  }
  return out;
}
