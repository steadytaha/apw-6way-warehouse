// Transfer between storage blocks (R13a, team item 7). Two modes, chosen by the model (R12f): J1 = the pooled fleet crosses through the shared front channels (scene.shuttles.policy 'pool' and
// shape_info.drivable): shuttles are borrowed between blocks; J2 = block-captive fleets and a ground conveyor between the blocks (policy 'captive', transfer_mode J2): no shuttle crosses,
// pallets run on a roller conveyor between the blocks' lift decks at the model's cross share p_cross (observed in the animation, one seed).
// J1 text of the first version follows.
// The model gives the transfer time t_x and the cross share p_cross, not a path. The animation needs a drivable one, so (*assumption*, visual only): the shuttle changes to tier 1 by lift,
// leaves the block through its front channel and drives on the floor around the racks to the front channel of the other block; the receiving block's sim then takes it over.
// The floor path is the cheapest route (length + a turn penalty) over the free floor of the footprint (lane racks are obstacles). Nothing here changes a model figure; the observed number
// of transfers is counted and shown as "observed in animation".
import { THREE, merge, rng } from './kit.js';

const CELL = 0.25, TURN_COST = 3.0;           // grid cell (m) and the cost of a turn in metres of path (*assumption*: keeps the route to a few corners)

class Heap {                                  // binary min-heap of [cost, state]
  constructor() { this.a = []; }
  push(c, s) { const a = this.a; a.push([c, s]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, t = a[0], l = a.pop(); if (a.length) { a[0] = l; let i = 0; for (;;) { let m = i; const x = 2 * i + 1, y = x + 1; if (x < a.length && a[x][0] < a[m][0]) m = x; if (y < a.length && a[y][0] < a[m][0]) m = y; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return t; }
  get size() { return this.a.length; }
}

/** free-floor grid over the footprint: cells inside a footprint rectangle and outside every lane-rack box (world metres) */
function makeGrid(rects, racks, corridors = []) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) { x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]); x1 = Math.max(x1, r[0] + r[2]); y1 = Math.max(y1, r[1] + r[3]); }
  const nx = Math.ceil((x1 - x0) / CELL), ny = Math.ceil((y1 - y0) / CELL), free = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + (i + 0.5) * CELL, y = y0 + (j + 0.5) * CELL;
    let ok = rects.some((r) => x > r[0] + 0.1 && x < r[0] + r[2] - 0.1 && y > r[1] + 0.1 && y < r[1] + r[3] - 0.1);
    if (ok) for (const b of racks) if (x > b.x0 - 0.05 && x < b.x1 + 0.05 && y > b.y0 - 0.05 && y < b.y1 + 0.05) { ok = false; break; }
    if (!ok) for (const [ax, ay, bx, by] of corridors) { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, k = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)); if (Math.hypot(x - (ax + k * dx), y - (ay + k * dy)) < 0.5) { ok = true; break; } }     // J2: the block's own conveyor lines are open floor for the transfer conveyor
    free[j * nx + i] = ok ? 1 : 0;
  }
  const cellOf = (x, y) => [Math.max(0, Math.min(nx - 1, Math.floor((x - x0) / CELL))), Math.max(0, Math.min(ny - 1, Math.floor((y - y0) / CELL)))];
  return { x0, y0, nx, ny, free, cellOf, at: (i, j) => [x0 + (i + 0.5) * CELL, y0 + (j + 0.5) * CELL] };
}

/** nearest free cell to a start / goal cell (the channel point may sit on a rack's edge cell) */
function nearestFree(g, i, j) {
  if (g.free[j * g.nx + i]) return [i, j];
  for (let r = 1; r < 24; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
    const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < g.nx && b < g.ny && g.free[b * g.nx + a]) return [a, b];
  }
  return null;
}

/** cheapest path from any start point to any goal point: [{x, y}] corners (exact first and last point), or null. Multi-source Dijkstra on (cell, heading) with a turn penalty. */
function findPath(g, starts, goals) {
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1], N = g.nx * g.ny, dist = new Float32Array(N * 4).fill(Infinity), prev = new Int32Array(N * 4).fill(-1);
  const goalCells = new Map(), startOf = new Map(), h = new Heap();
  goals.forEach((p, k) => { const [ci, cj] = g.cellOf(p.x, p.y), c = nearestFree(g, ci, cj); if (c) goalCells.set(c[1] * g.nx + c[0], k); });
  starts.forEach((p, k) => {
    const [ci, cj] = g.cellOf(p.x, p.y), c = nearestFree(g, ci, cj); if (!c) return;
    const cell = c[1] * g.nx + c[0]; startOf.set(cell, k);
    for (let d = 0; d < 4; d++) { dist[cell * 4 + d] = 0; h.push(0, cell * 4 + d); }
  });
  let end = -1;
  while (h.size) {
    const [c, st] = h.pop(); if (c > dist[st]) continue;
    const cell = st >> 2, d = st & 3;
    if (goalCells.has(cell)) { end = st; break; }
    const i = cell % g.nx, j = (cell / g.nx) | 0;
    for (let nd = 0; nd < 4; nd++) {
      if (((nd + 2) & 3) === d) continue;                                   // no U-turn
      const a = i + DX[nd], b = j + DY[nd]; if (a < 0 || b < 0 || a >= g.nx || b >= g.ny || !g.free[b * g.nx + a]) continue;
      const nc = c + CELL + (nd === d ? 0 : TURN_COST), ns = (b * g.nx + a) * 4 + nd;
      if (nc < dist[ns]) { dist[ns] = nc; prev[ns] = st; h.push(nc, ns); }
    }
  }
  if (end < 0) return null;
  const cells = []; for (let st = end; st >= 0; st = prev[st]) cells.push(st);
  cells.reverse();
  const pts = cells.map((st) => { const cell = st >> 2; return { x: g.at(cell % g.nx, (cell / g.nx) | 0)[0], y: g.at(cell % g.nx, (cell / g.nx) | 0)[1], d: st & 3 }; });
  const corners = [pts[0]]; for (let k = 1; k + 1 < pts.length; k++) if (pts[k].d !== pts[k + 1].d) corners.push(pts[k]);      // a corner where the heading into a cell differs from the heading out of it
  corners.push(pts[pts.length - 1]);
  const s0 = starts[startOf.get(cells[0] >> 2)], g0 = goals[goalCells.get(end >> 2)];
  return [{ x: s0.x, y: s0.y }, ...corners.slice(1, -1).map((p) => ({ x: p.x, y: p.y })), { x: g0.x, y: g0.y }];
}

/**
 * secs: composite sections ({i, s:{origin, sc}, w, sim, grp}); info: buildSections result (rects). Returns the coordinator: tick(modelDt), force(), count, paths, group (floor marks).
 * hooks: onTransfer(detail) per finished transfer.
 */
export function createTransfers(rep, secs, info, parent, own, hooks = {}) {
  const out = { group: new THREE.Group(), count: 0, paths: new Map(), warnings: [], enabled: false, active: 0 };
  out.group.name = 'transfer floor routes'; parent.add(out.group);
  const served = secs.filter((c) => c.sim.lifts.length);
  const shp = rep.scene.shuttles || {}, si = (rep.design && rep.design.shape_info) || {};
  const j1 = shp.policy === 'pool' && si.drivable !== false;           // R12f: J1 only over a drivable link; else J2 ground conveyor and block-captive fleets
  out.mode = j1 ? 'J1' : 'J2'; out.unit = j1 ? 'shuttles' : 'pallets';
  if (served.length < 2) return Object.assign(out, { tick() {}, force() { return null; }, info: { mode: out.mode, reason: 'one block with lifts: no transfer' } });
  const wp = (c, u, v) => ({ x: c.w.f.wx(u, v) + c.s.origin.x, y: c.w.f.wy(u, v) + c.s.origin.y });                 // section frame -> world metres
  const fr = (c, x, y) => ({ u: c.w.f.uOf(x - c.s.origin.x, y - c.s.origin.y), v: c.w.f.vOf(x - c.s.origin.x, y - c.s.origin.y) });      // world metres -> section frame
  const racks = secs.flatMap((c) => c.s.sc.blocks.map((b) => ({ x0: b.box.x0 + c.s.origin.x, x1: b.box.x1 + c.s.origin.x, y0: b.box.y0 + c.s.origin.y, y1: b.box.y1 + c.s.origin.y })));
  const corridors = j1 ? [] : secs.flatMap((c) => c.w.conveyors.flatMap((cv) => cv.path.slice(1).map((q, k) => { const a = wp(c, cv.path[k][0], cv.path[k][1]), b = wp(c, q[0], q[1]); return [a.x, a.y, b.x, b.y]; })));
  const grid = makeGrid(info.rects, racks, corridors);
  // exit points: the centre line of every head / tail front channel at each aisle's centre line (the shuttle leaves an aisle onto the channel at tier 1)
  const exits = (c) => {
    const pts = [];
    for (const ch of c.w.channels.filter((x) => x.role === 'head' || x.role === 'tail')) for (const m of c.w.modules) pts.push(wp(c, (ch.c.u0 + ch.c.u1) / 2, (m.a.v0 + m.a.v1) / 2));
    return pts;
  };
  // J2: the transfer conveyor runs deck to deck (model: path / conveyor speed + dwell + 2 hand-overs): from a lift deck out along that block's conveyor, over free floor, in along the other block's
  // conveyor to its deck; the blocks' own conveyor lines count as open floor (rack lanes under them are kept empty)
  const liftPts = (c) => c.sim.lifts.map((l) => wp(c, l.spec.u, l.spec.v));
  const ex = new Map(served.map((c) => [c.i, j1 ? exits(c) : liftPts(c)]));
  const key = (a, b) => `${a.i}>${b.i}`;
  for (let a = 0; a < served.length; a++) for (let b = a + 1; b < served.length; b++) {
    const A = served[a], Bc = served[b], sa = ex.get(A.i), sb = ex.get(Bc.i);
    const p = sa.length && sb.length ? findPath(grid, sa, sb) : null;
    if (!p) { out.warnings.push(`blocks ${A.i} and ${Bc.i}: no free floor path between the front channels (block transfer not animated for this pair)`); continue; }
    out.paths.set(key(A, Bc), p); out.paths.set(key(Bc, A), p.slice().reverse());
  }
  out.enabled = out.paths.size > 0;
  // ---- floor marks: tape strip with two rails along every route (one per pair), visible from above
  const tape = own(new THREE.MeshBasicMaterial({ color: j1 ? 0x4f8cff : 0xe08a2a, transparent: true, opacity: 0.32, depthWrite: false, toneMapped: false })), railM = own(new THREE.MeshBasicMaterial({ color: j1 ? 0x9fb8ff : 0xffd29a, toneMapped: false }));
  const seen = new Set();
  for (const [k, p] of out.paths) {
    const [ai, bi] = k.split('>').map(Number); if (ai > bi || seen.has(k)) continue; seen.add(k);
    const strips = [], rails = [];
    for (let i = 0; i + 1 < p.length; i++) {
      const a = p[i], b = p[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y); if (len < 0.05) continue;
      const along = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const sx = along ? len + 0.9 : 0.9, sy = along ? 0.9 : len + 0.9;
      strips.push(new THREE.BoxGeometry(sx, 0.02, sy).translate(cx, 0.03, -cy));
      for (const o of [-0.34, 0.34]) rails.push(new THREE.BoxGeometry(along ? len + 0.9 : 0.05, 0.03, along ? 0.05 : len + 0.9).translate(cx + (along ? 0 : o), 0.04, -(cy + (along ? o : 0))));
    }
    if (strips.length) { const m1 = new THREE.Mesh(merge(strips), tape); m1.renderOrder = 3; const m2 = new THREE.Mesh(merge(rails), railM); out.group.add(m1, m2); }
  }
  if (j1) {
  // ---- the rebalancing rule (pooled fleet): a block with work waiting and no free shuttle borrows an idle shuttle of a block with no work waiting
  const T = () => secs[0].sim.time;
  const pts = (from, to) => { const p = out.paths.get(key(from, to)); return p ? p.map((q) => fr(from, q.x, q.y)) : null; };
  function launch(from, to, s) {
    const p = out.paths.get(key(from, to)); if (!p) return false;
    const local = p.map((q) => fr(from, q.x, q.y));
    to.incoming = (to.incoming || 0) + 1; out.active++;
    from.sim.startTransfer(s, local, (sh) => {
      const last = p[p.length - 1], prev = p[p.length - 2] || last, pos = fr(to, last.x, last.y);
      const alongX = Math.abs(last.x - prev.x) >= Math.abs(last.y - prev.y), axis = (alongX !== to.w.f.swap) ? 'u' : 'v';     // world x is u unless the block's columns run along y
      to.sim.addShuttle(sh, pos, axis);
      sh.f = to.w.f; sh.sec = to.i; to.incoming--; out.active--; out.count++;
      if (hooks.onTransfer) hooks.onTransfer({ from: from.i, to: to.i, shuttle: sh.gid, t: T() });
    });
    return true;
  }
  let acc = 0;
  const cooled = (s) => T() - (s.xferAt ?? -1e9) > 120;
  out.tick = (dt) => {
    acc += dt; if (acc < 1) return; acc = 0;
    if (!out.enabled || out.active >= 2) return;
    const L = served.map((c) => ({ c, ...c.sim.load() }));
    for (const r of L) {
      // FIX (R21b, G10): no per-block shuttle cap of our own. Old cause: a block took at most ceil(2.2 x working lifts) shuttles, a typed *assumption* ("N / lifts of the examples") that disagreed with the model
      // (Optimal U: pooled N = 11 against a cap of 9). The fleet is the model's pooled N; the rule stays: only a block with work waiting and no idle shuttle borrows, only from a block with no work
      // waiting and more than one shuttle, so the pool never exceeds N and a donor keeps one.
      if (!(r.demand > 0 && r.idle === 0) || r.c.incoming) continue;
      const donors = L.filter((x) => x !== r && x.idle > 0 && x.demand === 0 && x.size > 1 && out.paths.has(key(x.c, r.c))).sort((a, b) => b.idle - a.idle);
      for (const d of donors) { const s = d.c.sim.idleList().filter(cooled)[0]; if (s && launch(d.c, r.c, s)) return; }
    }
  };
  /** start one transfer now (demo, story): from the block with the most idle shuttles to another block, or between the given section indices */
  out.force = (fromI, toI) => {
    if (!out.enabled) return null;
    const L = served.map((c) => ({ c, idle: c.sim.idleList() }));
    const from = fromI != null ? L.find((x) => x.c.i === fromI) : L.filter((x) => x.idle.length && x.c.sim.shuttles.length > 1).sort((a, b) => b.idle.length - a.idle.length)[0];
    if (!from || !from.idle.length) return null;
    const to = toI != null ? served.find((c) => c.i === toI) : served.filter((c) => c !== from.c && out.paths.has(key(from.c, c))).sort((a, b) => a.sim.shuttles.length - b.sim.shuttles.length)[0];
    if (!to || !out.paths.has(key(from.c, to))) return null;
    const s = from.idle[0]; return launch(from.c, to, s) ? { from: from.c.i, to: to.i, shuttle: s.gid } : null;
  };
  }
  // ---- J2: pallets on the ground conveyor between blocks (captive fleets). Rate per ordered pair = p_cross x (IN + OUT) / number of ordered pairs (model: share of jobs that cross blocks)
  // FIX (R18e): the conveyor speed comes from the report only (old cause: a typed 0.5 stood in for a missing scene.cycle.v_conv, so a report without it ran an invented speed)
  const flows = [], vconv = rep.scene.cycle ? rep.scene.cycle.v_conv : undefined, R = rng(20261112);
  const polyLen = (p) => { let l = 0; for (let i = 0; i + 1 < p.length; i++) l += Math.hypot(p[i + 1].u - p[i].u, p[i + 1].v - p[i].v); return l; };
  const polyAt = (p, d) => { for (let i = 0; i + 1 < p.length; i++) { const l = Math.hypot(p[i + 1].u - p[i].u, p[i + 1].v - p[i].v); if (d <= l || i + 2 === p.length) { const k = l > 0 ? Math.min(1, d / l) : 0; return [p[i].u + (p[i + 1].u - p[i].u) * k, p[i].v + (p[i + 1].v - p[i].v) * k]; } d -= l; } return [p[p.length - 1].u, p[p.length - 1].v]; };
  // FIX (R18e): the J2 rate needs p_cross and the cycle rates from the report (old cause: a typed 0.3 stood in for a missing p_cross, so a report without it ran an invented flow)
  const cyc = rep.scene.cycle || {}, j2Ok = vconv > 0 && si.p_cross != null && cyc.in_per_h != null && cyc.out_per_h != null;
  if (!j1 && out.enabled && !j2Ok) out.warnings.push('J2 pallet flow not animated: scene.cycle.v_conv / in_per_h / out_per_h or design.shape_info.p_cross missing from the report (n/a)');
  if (!j1 && out.enabled && j2Ok) {
    const pc = si.p_cross, tot = (cyc.in_per_h + cyc.out_per_h) * pc / 3600, pairs = [...out.paths.keys()];
    for (const k of pairs) { const [ai, bi] = k.split('>').map(Number), from = secs.find((c) => c.i === ai), to = secs.find((c) => c.i === bi), p = out.paths.get(k);
      flows.push({ k, from, to, path: p.map((q) => fr(from, q.x, q.y)), rate: tot / pairs.length, next: R.exp(tot / pairs.length), items: [] }); }
    for (const f of flows) f.len = polyLen(f.path);
  }
  const spawn = (f) => { const it = f.from.pool.alloc(); if (!it) return null; const o = { it, s: 0, f }; f.items.push(o); return o; };
  const placeItem = (o) => { const [u, v] = polyAt(o.f.path, o.s); o.it.u = u; o.it.v = v; o.it.z = (o.f.from.w.convZ || 0.6) - 0.05; };
  const tickJ2 = (dt) => {
    for (const f of flows) {
      f.next -= dt; if (f.next <= 0) { f.next += R.exp(f.rate); if (!f.items.some((o) => o.s < 1.5)) spawn(f); }
      for (let i = f.items.length - 1; i >= 0; i--) {
        const o = f.items[i]; o.s += vconv * dt;
        if (o.s >= f.len) { f.from.pool.release(o.it); f.items.splice(i, 1); out.count++; if (hooks.onTransfer) hooks.onTransfer({ from: f.from.i, to: f.to.i, kind: 'conveyor', t: secs[0].sim.time }); }
        else placeItem(o);
      }
    }
  };
  if (!j1) {
    out.tick = (dt) => { if (out.enabled) tickJ2(dt); };
    out.force = (fromI, toI) => { const f = flows.find((x) => (fromI == null || x.from.i === fromI) && (toI == null || x.to.i === toI)) || flows[0]; const o = f && spawn(f); return o ? { from: f.from.i, to: f.to.i, kind: 'conveyor' } : null; };
  }
  out.info = { mode: out.mode, unit: out.unit, policy: shp.policy, transfer: si.transfer_mode, p_cross: si.p_cross, drivable: si.drivable };
  out.pathLength = (a, b) => { const p = out.paths.get(`${a}>${b}`); if (!p) return null; let l = 0; for (let i = 0; i + 1 < p.length; i++) l += Math.hypot(p[i + 1].x - p[i].x, p[i + 1].y - p[i].y); return l; };
  return out;
}
