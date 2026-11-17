// Animation driven by the report (B4, reworked R9a): one pooled shuttle fleet (every shuttle can serve every tier and changes tier by lift), L shuttle-carrying lifts,
// IN / OUT arrivals at the model flows (Poisson, fixed seed). A pallet is always on a conveyor, on a lift deck or on a shuttle; the only moves between two carriers are
// the hand-overs (shuttle <-> deck, conveyor <-> deck, conveyor <-> shuttle) while both carriers stand still next to each other.
// Lift mode comes from the model (scene.shuttles.lift_mode): M2 = the shuttle hands the pallet to the deck and stays on its tier; M1 = the shuttle rides the lift with the pallet.
// All times are model seconds; the caller scales wall time by the speed-up. Canonical frame (u, v, z) as in kit.js.
// Nothing here recomputes a model KPI: observed values are counted and shown as "observed in animation".
import { rng, travelTime, travelDist, clamp, smooth01 } from './kit.js';

class Actor {
  constructor() { this.steps = []; this.i = 0; this.t = 0; this.busy = false; this.busyT = 0; this.waitT = 0; this.onDone = null; }
  plan(steps) { this.steps = steps; this.i = 0; this.t = 0; this.busy = true; }
  advance(dt) {
    if (!this.busy) return;
    this.busyT += dt;
    let left = dt;
    while (left > 1e-9 && this.i < this.steps.length) {
      const s = this.steps[this.i];
      if (!s.on) { s.on = true; if (s.start) s.start(); }
      if (s.until) {
        if (s.until()) { if (s.end) s.end(); this.i++; this.t = 0; continue; }
        // FIX (R13c): time spent queueing for a lift or a free conveyor is counted apart (waitT); the model's shuttle utilisation (rho = lambda x service time / N) counts service only, the animation counted the wait as busy (0.75 observed against 0.65 on the example, 0.56 without the wait)
        if (s.wait) this.waitT += left;
        return;
      }
      const rem = s.dur - this.t;
      if (left < rem) { this.t += left; if (s.upd) s.upd(this.t); return; }
      left -= rem; if (s.upd) s.upd(s.dur); if (s.end) s.end(); this.i++; this.t = 0;
    }
    if (this.i >= this.steps.length) { this.busy = false; this.busyT -= left; if (this.onDone) this.onDone(); }
  }
}

const polyLen = (p) => { let L = 0; for (let i = 0; i + 1 < p.length; i++) L += Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]); return L; };
function polyAt(p, s) {
  for (let i = 0; i + 1 < p.length; i++) {
    const l = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
    if (s <= l || i + 2 === p.length) { const k = l > 0 ? clamp(s / l, 0, 1) : 0; return [p[i][0] + (p[i + 1][0] - p[i][0]) * k, p[i][1] + (p[i + 1][1] - p[i][1]) * k]; }
    s -= l;
  }
  return p[p.length - 1];
}

export function createSim(world, rep, parts, opt = {}) {
  const sc = rep.scene, C = sc.cycle, tz = world.tz, tiers = world.tiers, ZR = world.ZR, R = rng(opt.seed || 424242);
  const { fleet, liftApis, pool, trucks } = parts;
  // FIX (R13a): the scene of an L / U / T footprint has no kinematics in `cycle` (old cause: every step time was NaN, shuttles finished jobs in 3 s with NaN utilisation); the slide-11
  // values (scene.cycle of a rectangle carries the same numbers) are used for missing fields, `t_board` (R12: 10 s, empty shuttle drives on / off the deck, *assumption*) comes from
  // scene.cycle.t_board when the model sends it (request), else 10 s.
  const KIN = { v_shuttle: 1.4, a_shuttle: 0.5, turn_s: 4, load_s: 25, v_lift: 1, a_lift: 0.7, transfer_s: 25, t_board: 10 };
  const kinMissing = Object.keys(KIN).filter((k) => !(C[k] > 0));
  if (kinMissing.length) console.warn('[scene] scene.cycle lacks ' + kinMissing.join(', ') + ': slide-11 values used for these (R12f sends all of them)');
  const K = (k) => (C[k] > 0 ? C[k] : KIN[k]);
  const vS = K('v_shuttle'), aS = K('a_shuttle'), TURN = K('turn_s'), LOAD = K('load_s'), vL = K('v_lift'), aL = K('a_lift'), HAND = K('transfer_s'), TBOARD = K('t_board'), POS = 1;
  const CONVX = 7;                                            // conveyor <-> deck / shuttle transfer, s (assumption: slide 11, 7 s with a conveyor)
  const convZ = world.convZ - 0.05, zConv = world.convZ - ZR;
  const lanes = world.lanes, modules = world.modules, channels = world.channels.map((c) => ({ cu: (c.c.u0 + c.c.u1) / 2, ...c.c }));
  const avOf = (m) => (modules[m].a.v0 + modules[m].a.v1) / 2;
  const useABC = !!(rep.design && rep.design.abc);

  // FIX (R9a): the lift mode was never read (old cause: every lift was a chain lift that pushed the pallet onto a landing stub and the pallet moved alone while the
  // shuttle waited). Now scene.shuttles.lift_mode decides: M1 = shuttle rides the lift with its pallet, M2 = shuttle hands the pallet to the deck and stays on its tier.
  const shp = sc.shuttles || {};
  const modeKnown = shp.lift_mode === 'M1' || shp.lift_mode === 'M2';
  const MODE = shp.lift_mode === 'M1' ? 'M1' : 'M2';          // M3 (comparison only) and a missing field fall back to M2
  if (!modeKnown) console.warn(`[scene] scene.shuttles.lift_mode is "${shp.lift_mode}": animating M2 (hand-over at the lift deck)`);
  // FIX (R13a): L / U / T reports say 'captive' for block-captive fleets (J2, R12f): the fleet is pooled over the tiers inside the block; only a rectangle's tier-captive policy pins a shuttle to its home tier
  // (old cause: every 'captive' was read as tier-captive, so tiers without a home shuttle were never served and OUT stayed at 0)
  const pooled = !shp.tier_captive;

  // ------------------------------------------------------------ lanes by tier
  const byTier = Array.from({ length: tiers }, () => []);
  const lockedTier = new Set();                              // R9b contingency: a tier locked out (no stock taken from it, none put into it)
  lanes.forEach((l) => byTier[l.tier].push(l));
  const abcW = [0.8, 0.15, 0.05];
  function pickLane(tier, want, lift) {                    // want: 'free' (room) | 'stock' (a pallet)
    const arr = byTier[tier]; if (!arr.length || lockedTier.has(tier)) return null;
    const ok = (l) => !l.blocked && (want === 'free' ? l.count < l.depth : l.count > 0) && reach(l, lift) && !l.busy;
    for (let k = 0; k < 24; k++) {
      let l;
      if (useABC) { const r = R(); const cl = r < abcW[0] ? 0 : r < abcW[0] + abcW[1] ? 1 : 2; l = arr[R.int(arr.length)]; if (world.clsOf(l) !== cl) continue; } else l = arr[R.int(arr.length)];
      if (ok(l)) return l;
    }
    const cand = arr.filter(ok); return cand.length ? cand[R.int(cand.length)] : null;
  }
  function reach(l, lift) { return channels.length > 0 || Math.abs(avOf(l.mod) - lift.spec.v) < 1.05; }
  const spare = (t, want) => !lockedTier.has(t) && byTier[t].some((l) => !l.blocked && (want === 'free' ? l.count < l.depth : l.count > 0));

  // ------------------------------------------------------------ conveyors (one path per lift, shared dock end)
  const convs = world.conveyors.map((c, i) => ({ i, lift: c.lift, group: c.group, path: c.path, len: polyLen(c.path), items: [] }));
  // FIX (R9b): the belt ran at 0.6 m/s (old cause: a hard-coded animation value); the model's conveyor speed is 0.5 m/s (io_path basis, params conv speed), read from scene.cycle.v_conv when given
  const CONV_V = C.v_conv || 0.5, GAP = 1.5;

  // ------------------------------------------------------------ lifts (all shuttle-carrying; group = which dock line the lift's conveyor serves)
  const L = liftApis.map((api, k) => ({ api, spec: api.spec, k, group: api.spec.group, actor: new Actor(), z: api.z, conv: convs[k], owner: null, q: 0, n: 0 }));
  L.forEach((l) => { l.conv.l = l; l.stubDir = l.spec.stubDir || 1; });
  const inLifts = L.filter((l) => l.group === 'IN');
  const outCap = L.filter((l) => l.group !== 'IN');            // OUT lines and the spare lift (its conveyor runs to the OUT dock)
  const outLifts = outCap.length ? outCap : L;
  const centerOf = (l) => ({ u: l.spec.u, v: l.spec.v });
  const landOf = (l) => ({ u: l.spec.u + l.stubDir * 1.1, v: l.spec.v });     // M2: the shuttle stops on the tier roller stub next to the deck
  const setLiftZ = (l, z) => { l.z = z; l.api.setZ(z); };
  function vmove(l, z1) {                                    // the start height is read when the step starts, not when the job is planned
    let z0 = 0, d = 0;
    return { dur: 0, start() { z0 = l.z; d = Math.abs(z1 - z0); this.dur = travelTime(d, vL, aL); }, upd: (t) => setLiftZ(l, z0 + Math.sign(z1 - z0) * travelDist(d, vL, aL, t)), end: () => setLiftZ(l, z1) };
  }
  const chooseLift = (cands, tier) => {                      // fewest queued jobs first, then the deck nearest to the tier
    let best = null, bs = 1e12;
    for (const l of cands) { if (l.down) continue; const v = l.q * 1000 + Math.abs(l.z - tz[tier]); if (v < bs) { bs = v; best = l; } }
    if (!best) best = cands[0];
    best.q++; return best;
  };
  const releaseLift = (l) => { l.owner = null; l.q = Math.max(0, l.q - 1); };

  // ------------------------------------------------------------ pallets (pool items). A pallet is only ever on a conveyor, on a lift deck, on a shuttle or between two of them during a hand-over.
  const ents = new Set();
  function newPallet() {
    const it = pool.alloc(); if (!it) return null;
    const e = { it, state: 'new', tier: -1, born: T };
    ents.add(e); return e;
  }
  function killPallet(e) { pool.release(e.it); ents.delete(e); }
  function placeEnt(e) {
    const it = e.it;
    switch (e.state) {
      case 'conv': { const [u, v] = polyAt(e.conv.path, e.s); it.u = u; it.v = v; it.z = convZ; break; }
      case 'xfer': { const k = smooth01(e.k); it.u = e.a[0] + (e.b[0] - e.a[0]) * k; it.v = e.a[1] + (e.b[1] - e.a[1]) * k; it.z = e.za + (e.zb - e.za) * k; break; }
      case 'lift': it.u = e.lift.spec.u; it.v = e.lift.spec.v; it.z = e.lift.z + ZR; break;
      case 'shuttle': it.u = e.sh.u; it.v = e.sh.v; it.z = e.sh.z + ZR + 0.04 * e.sh.lift; break;
      default: break;
    }
  }

  // ------------------------------------------------------------ shuttles: one pooled fleet, spread over the tiers at the start
  const nIn = shp.in_service != null ? shp.in_service : shp.total, nTot = shp.total;
  const S = [];
  for (let i = 0; i < nTot; i++) {
    const spareOne = i >= nIn, tier = spareOne ? 0 : Math.min(tiers - 1, Math.floor((i + 0.5) * tiers / Math.max(1, nIn)));
    const hl = L[i % L.length], ld = landOf(hl), slot = Math.floor(i / L.length);
    // FIX (R13a): the shuttles beyond `in_service` (fleet.pool.active_shuttles < N) were drawn as 'charge' but still took jobs (old cause: `idle` listed every shuttle that was not busy);
    // they are now parked (`parked`) and take no job until an active shuttle fails (see step()) or a contingency wakes them.
    const s = { i, tier, home: tier, spare: spareOne, parked: spareOne, u: ld.u + hl.stubDir * 1.3 * slot, v: ld.v, z: tz[tier], lift: 0, turn: 0, roll: 0, status: spareOne ? 'charge' : 'idle', ring: 0, axis: 'v', actor: new Actor(), jobs: 0, cur: null };
    S.push(s);
  }
  const outQ = [];                                            // requested retrievals: tier of the wanted pallet

  function stepsMove(s, p0, p1) {
    const d = Math.hypot(p1.u - p0.u, p1.v - p0.v); let last = 0;
    return { dur: travelTime(d, vS, aS), start: () => { s.status = 'ok'; }, upd: (t) => { const x = travelDist(d, vS, aS, t), k = d > 0 ? x / d : 0; s.u = p0.u + (p1.u - p0.u) * k; s.v = p0.v + (p1.v - p0.v) * k; s.roll += x - last; last = x; },
      end: () => { s.u = p1.u; s.v = p1.v; s.roll += d - last; } };
  }
  function stepsTurn(s, to) {
    const a = to === 'u' ? 0 : 1, b = to === 'u' ? 1 : 0;
    return { dur: TURN, start: () => { s.ring = 1; }, upd: (t) => { s.turn = a + (b - a) * smooth01(t / TURN); }, end: () => { s.turn = b; s.ring = 0; } };
  }
  /** appends moves (with the 4 s turns where the axis changes) along the waypoints; returns the final position */
  function pushRoute(s, steps, from, pts, state) {
    let p = { u: from.u, v: from.v };
    for (const q of pts) {
      const du = q.u - p.u, dv = q.v - p.v;
      if (Math.hypot(du, dv) < 0.02) continue;
      const ax = Math.abs(du) >= Math.abs(dv) ? 'u' : 'v';
      if (ax !== state.axis) { steps.push(stepsTurn(s, ax)); state.axis = ax; }
      steps.push(stepsMove(s, p, q)); p = { u: q.u, v: q.v };
    }
    return p;
  }
  function networkPoints(a, b) {                             // a, b on the aisle / channel network
    if (Math.abs(a.v - b.v) < 1.05) return [b];
    let ch = null, best = 1e9;
    for (const c of channels) { const d = Math.abs(a.u - c.cu) + Math.abs(b.u - c.cu); if (d < best) { best = d; ch = c; } }
    if (!ch) return null;
    const pts = [];
    if (Math.abs(a.u - ch.cu) > 0.6) pts.push({ u: ch.cu, v: a.v });
    pts.push({ u: ch.cu, v: b.v });
    if (Math.abs(b.u - ch.cu) > 0.6) pts.push(b);
    return pts;
  }
  function route(s, steps, state, from, to) {                // from / to: {u, v, lane?}
    const pts = []; let a = { u: from.u, v: from.v };
    if (from.lane) { a = { u: from.lane.u, v: avOf(from.lane.mod) }; pts.push(a); }
    const target = to.lane ? { u: to.lane.u, v: avOf(to.lane.mod) } : { u: to.u, v: to.v };
    const mid = networkPoints(a, target); if (!mid) return null;
    pts.push(...mid);
    if (to.lane) pts.push({ u: to.lane.u, v: to.v });
    pushRoute(s, steps, from, pts, state);
    return { u: to.u, v: to.v, lane: to.lane };
  }
  const slotV = (l, j) => l.vNear + l.dir * (j + 0.5) * l.pitch;
  const handle = (s, dur, lift0, lift1, end) => ({ dur, start: () => { s.status = 'ok'; }, upd: (t) => { s.lift = lift0 + (lift1 - lift0) * smooth01(t / dur); }, end: () => { s.lift = lift1; if (end) end(); } });
  const stats = { inDone: 0, outDone: 0, cycles: 0, cycleSum: 0, moves: 0, dual: 0, dualSum: 0 };
  let T = 0;

  // ------------------------------------------------------------ step builders shared by the jobs
  /** the shuttle takes the lift (waits while another shuttle owns it) and, if given, starts the lift's own plan at that moment */
  const acquire = (l, s, plan) => ({
    wait: true,
    start: () => { s.status = 'ok'; },
    until: () => { if (l.owner && l.owner !== s) return false; l.owner = s; if (plan) { l.actor.onDone = null; l.actor.plan(plan()); } return true; },
  });
  const waitLift = (l) => ({ wait: true, until: () => !l.actor.busy });
  const liftTo = (l, z) => ({ dur: 0, start: () => { l.actor.onDone = null; l.actor.plan([vmove(l, z)]); } });
  /** the shuttle stands on the deck; the deck carries it (and its pallet) to z; the shuttle's z follows the deck */
  const rideStep = (s, l, z, tier) => ({
    start: () => { s.status = 'ok'; l.actor.onDone = null; l.actor.plan([vmove(l, z)]); },
    until: () => { s.z = l.z; return !l.actor.busy; },
    end: () => { s.z = z; if (tier != null) s.tier = tier; },
  });
  /** pallet e moves between two carriers that stand still next to each other (hand-over); s is the shuttle involved (its deck lifts or lowers) */
  const handOver = (s, e, dur, l0, l1, setup, done) => ({
    dur, start: () => { s.status = 'ok'; if (e) { setup(); e.state = 'xfer'; e.k = 0; } },
    upd: (t) => { if (e) e.k = t / dur; s.lift = l0 + (l1 - l0) * smooth01(t / dur); },
    end: () => { s.lift = l1; if (done) done(); },
  });
  /** R13a: the empty shuttle drives on (or off) the lift deck, t_board (R12; model: 2 x t_board per tier change) */
  const boardStep = (s) => ({ dur: TBOARD, start: () => { s.status = 'ok'; } });
  /** tier change of an empty shuttle: ride a lift from the shuttle's tier to tier t; returns the shuttle's position afterwards (centre of that lift) */
  function tierChange(s, steps, state, cur, t, only) {
    const a = s.tier, l = chooseLift(only || L, a);
    steps.push(acquire(l, s), liftTo(l, tz[a]));
    cur = route(s, steps, state, cur, centerOf(l)) || cur;
    steps.push(waitLift(l), boardStep(s), rideStep(s, l, tz[t], t), boardStep(s), { dur: 0, end: () => releaseLift(l) });
    return { u: l.spec.u, v: l.spec.v };
  }
  const headOf = (e) => e.state === 'conv' && !e.taken && e.s >= e.conv.len - 0.02;
  const convFree = (c) => !c.items.some((x) => x.state === 'conv' && x.s > c.len - GAP);

  // ------------------------------------------------------------ jobs (one shuttle, one pallet at a time)
  function startJob(s, steps, state, cur, t0, claim) {
    s.cur = cur.lane ? { u: cur.u, v: cur.v, lane: cur.lane } : { u: cur.u, v: cur.v };
    s.axis = state.axis; s.jobs++;
    const w0 = s.actor.waitT;
    s.actor.onDone = () => {
      stats.cycles++; stats.cycleSum += T - t0 - (s.actor.waitT - w0); stats.moves++;      // FIX (R13c): without the queueing time (compared with the model's service time per move)
      s.status = 'idle'; claim.forEach((fn) => fn());
    };
    s.actor.plan(steps);
  }

  /** IN: pallet from the head of an IN conveyor to a free lane of tier t */
  function jobIn(s, l, e, t) {
    // FIX (R13a): with every lift of a group down (a block with one lift per group) `chooseLift` returned undefined and the frame loop threw; no job starts without a live lift
    if (s.tier !== t && !L.some((x) => !x.down)) return false;
    const lane = pickLane(t, 'free', l); if (!lane) return false;
    e.taken = true; lane.busy = true; l.q++;
    const steps = [], state = { axis: s.axis }, c = l.conv; let cur = s.cur || { u: s.u, v: s.v };
    const j = lane.depth - lane.count - 1;
    const takePallet = () => { c.items.splice(c.items.indexOf(e), 1); };
    const deposit = handle(s, LOAD, 1, 0, () => { lane.count++; world.paintLane(lane); killPallet(e); lane.busy = false; stats.inDone++; });
    if (MODE === 'M1') {
      // the shuttle rides the lift down to the conveyor, takes the pallet there and rides up with it
      const a = s.tier;
      steps.push(acquire(l, s), liftTo(l, tz[a]));
      cur = route(s, steps, state, cur, centerOf(l)) || cur;
      steps.push(waitLift(l), boardStep(s), rideStep(s, l, zConv, null));
      steps.push(handOver(s, e, HAND, 0, 1,
        () => { takePallet(); e.a = polyAt(c.path, c.len); e.b = [s.u, s.v]; e.za = convZ; e.zb = s.z + ZR + 0.04; },
        () => { e.state = 'shuttle'; e.sh = s; }));
      steps.push(rideStep(s, l, tz[t], t), boardStep(s), { dur: 0, end: () => releaseLift(l) });
      cur = centerOf(l);
    } else {
      // M2: the lift fetches the pallet; the shuttle waits on its tier at the landing and takes it from the deck
      const land = landOf(l);
      const plan = () => [vmove(l, zConv),
        { dur: CONVX, start: () => { takePallet(); e.state = 'xfer'; e.a = polyAt(c.path, c.len); e.b = [l.spec.u, l.spec.v]; e.za = convZ; e.zb = l.z + ZR; e.k = 0; }, upd: (x) => { e.k = x / CONVX; }, end: () => { e.state = 'lift'; e.lift = l; } },
        { dur: POS }, vmove(l, tz[t])];
      steps.push(acquire(l, s, plan));                      // the IN lift fetches the pallet and waits at tier t while the shuttle changes tier
      if (s.tier !== t) cur = tierChange(s, steps, state, cur, t, outCap.length ? outCap : L.filter((x) => x !== l));
      cur = route(s, steps, state, cur, land) || cur;
      steps.push(waitLift(l));
      steps.push(handOver(s, e, HAND, 0, 1,
        () => { e.a = [l.spec.u, l.spec.v]; e.b = [s.u, s.v]; e.za = l.z + ZR; e.zb = s.z + ZR + 0.04; },
        () => { e.state = 'shuttle'; e.sh = s; }));
      steps.push({ dur: 0, end: () => releaseLift(l) });
      cur = { u: land.u, v: land.v };
    }
    cur = route(s, steps, state, cur, { u: lane.u, v: slotV(lane, j), lane }) || cur;
    steps.push(deposit);
    cur = { u: lane.u, v: slotV(lane, j), lane };
    startJob(s, steps, state, cur, T, [() => { lane.busy = false; }]);
    return true;
  }

  /** OUT: pallet from a lane of tier t to the OUT conveyor */
  function jobOut(s, t) {
    if (!outLifts.some((x) => !x.down) || (s.tier !== t && !L.some((x) => !x.down))) return false;     // FIX (R13a): see jobIn
    const lane = pickLane(t, 'stock', outLifts[0]); if (!lane) return false;
    lane.busy = true;
    const steps = [], state = { axis: s.axis }; let cur = s.cur || { u: s.u, v: s.v };
    const ol = chooseLift(outLifts, t), c = ol.conv;
    if (s.tier !== t) cur = tierChange(s, steps, state, cur, t);
    const j = lane.depth - lane.count;
    cur = route(s, steps, state, cur, { u: lane.u, v: slotV(lane, j), lane }) || cur;
    let e = null;
    steps.push(handle(s, LOAD, 0, 1, () => {
      lane.count--; world.paintLane(lane); lane.busy = false;
      e = newPallet(); if (e) { e.state = 'shuttle'; e.sh = s; e.tier = t; }
    }));
    cur = { u: lane.u, v: slotV(lane, j), lane };
    const onConv = () => { if (!e) return; e.state = 'conv'; e.conv = c; e.s = c.len; e.out = true; c.items.push(e); };
    if (MODE === 'M1') {
      // the shuttle rides the lift down with its pallet, puts it on the conveyor (25 s) and rides back up to the tier that has work
      steps.push(acquire(ol, s), liftTo(ol, tz[t]));
      cur = route(s, steps, state, cur, centerOf(ol)) || cur;
      steps.push(waitLift(ol), boardStep(s), rideStep(s, ol, zConv, null), { wait: true, until: () => convFree(c) });
      steps.push(handOver(s, e, HAND, 1, 0, () => { e.a = [s.u, s.v]; e.b = polyAt(c.path, c.len); e.za = s.z + ZR + 0.04; e.zb = convZ; }, onConv));
      const back = { t };
      steps.push({ dur: 0, start: () => { back.t = outQ.length ? outQ[0] : t; } });
      steps.push({ start: () => { s.status = 'ok'; ol.actor.onDone = null; ol.actor.plan([vmove(ol, tz[back.t])]); }, until: () => { s.z = ol.z; return !ol.actor.busy; }, end: () => { s.z = tz[back.t]; s.tier = back.t; } });
      steps.push(boardStep(s), { dur: 0, end: () => releaseLift(ol) });
      cur = centerOf(ol);
    } else {
      // M2: the shuttle hands the pallet to the deck on its own tier (25 s) and stays there; the deck takes it down to the conveyor (7 s)
      const land = landOf(ol);
      steps.push(acquire(ol, s, () => [vmove(ol, tz[t])]));
      cur = route(s, steps, state, cur, land) || cur;
      steps.push(waitLift(ol));
      steps.push(handOver(s, e, HAND, 1, 0,
        () => { e.a = [s.u, s.v]; e.b = [ol.spec.u, ol.spec.v]; e.za = s.z + ZR + 0.04; e.zb = ol.z + ZR; },
        () => { if (e) { e.state = 'lift'; e.lift = ol; } }));
      steps.push({ dur: 0, end: () => {
        ol.actor.onDone = () => releaseLift(ol);
        ol.actor.plan([vmove(ol, zConv), { until: () => convFree(c) },
          { dur: CONVX, start: () => { if (!e) return; e.state = 'xfer'; e.a = [ol.spec.u, ol.spec.v]; e.b = polyAt(c.path, c.len); e.za = ol.z + ZR; e.zb = convZ; e.k = 0; }, upd: (x) => { if (e) e.k = x / CONVX; }, end: onConv }]);
      } });
      cur = { u: land.u, v: land.v };
    }
    // counted when the pallet reaches the conveyor (the dock removal counts the truck load separately)
    startJob(s, steps, state, cur, T, [() => { lane.busy = false; }]);
    return true;
  }

  // ------------------------------------------------------------ dispatcher: jobs go to the nearest idle shuttle (pooled) or to the home-tier shuttle (captive)
  let preferIn = true;
  const canServe = (s, t) => pooled || s.spare || s.home === t;
  const nearest = (idle, t) => { let b = null, bd = 1e9; for (const s of idle) { if (!canServe(s, t)) continue; const d = Math.abs(s.tier - t); if (d < bd) { bd = d; b = s; } } return b; };
  function assign() {
    let idle = S.filter((x) => !x.actor.busy && !x.down && !x.parked && !x.xfer);   // FIX (R13a): parked and transferring shuttles take no job
    if (!idle.length) return;
    const tryIn = () => {
      for (const l of inLifts) {
        if (l.q >= 2) continue;
        const e = l.conv.items.find(headOf); if (!e) continue;
        const ts = []; for (let t = 0; t < tiers; t++) if (spare(t, 'free')) ts.push(t);
        if (!ts.length) continue;
        // assumption (animation): the storage assignment picks the tier of an idle shuttle when that tier has room, otherwise a random tier with room
        const home = idle.filter((x) => ts.includes(x.tier) && canServe(x, x.tier));
        const t = home.length ? home[R.int(home.length)].tier : ts[R.int(ts.length)], s = nearest(idle, t); if (!s) continue;
        if (jobIn(s, l, e, t)) return s;
      }
      return null;
    };
    const tryOut = () => {
      while (outQ.length) {
        const t = outQ[0], s = nearest(idle, t); if (!s) return null;
        outQ.shift();
        if (jobOut(s, t)) return s;
      }
      return null;
    };
    for (let k = 0; k < S.length; k++) {
      const s = preferIn ? (tryIn() || tryOut()) : (tryOut() || tryIn());
      preferIn = !preferIn;
      if (!s) break;
      idle = idle.filter((x) => x !== s);
      if (!idle.length) break;
    }
  }

  // ------------------------------------------------------------ conveyors, arrivals, trucks
  const dockIn = world.docks.in, dockOut = world.docks.out;
  const tr = {};
  function mkTruck(kind, dock, api) {
    if (!dock || !api) return null;
    const o = { kind, dock, api, d: 0.7, state: 'docked', t: 0, count: kind === 'in' ? 24 : 0, open: 1, cap: 24 };
    api.load.setCount(o.count);
    return o;
  }
  tr.in = mkTruck('in', dockIn, trucks && trucks.in); tr.out = mkTruck('out', dockOut, trucks && trucks.out);
  const FAR = 95, DRIVE = 40, SWAP = 70;
  function stepTruck(o, dt) {
    if (!o) return;
    if (o.down && o.state === 'docked') { o.state = 'leaving'; o.t = 0; }
    if (o.down && o.state === 'away') o.t = 0;
    const open = o.state === 'docked' ? 1 : 0; o.open += clamp(open - o.open, -dt / 10, dt / 10);
    if (o.state === 'leaving') { o.t += dt; o.d = 0.7 + (FAR - 0.7) * smooth01(o.t / DRIVE); if (o.t >= DRIVE) { o.state = 'away'; o.t = 0; } }
    else if (o.state === 'away') { o.t += dt; if (o.t >= SWAP) { o.state = 'arriving'; o.t = 0; o.count = o.kind === 'in' ? o.cap : 0; o.api.load.setCount(o.count); } }
    else if (o.state === 'arriving') { o.t += dt; o.d = FAR - (FAR - 0.7) * smooth01(o.t / DRIVE); if (o.t >= DRIVE) { o.state = 'docked'; o.t = 0; o.d = 0.7; } }
    else if (o.state === 'docked') {
      if (o.kind === 'in' && o.count <= 0 && o.open > 0.99 && pendingIn === 0) { o.state = 'leaving'; o.t = 0; }
      if (o.kind === 'out' && o.count >= o.cap) { o.state = 'leaving'; o.t = 0; }
    }
    const dk = o.dock; o.api.group.visible = o.d < FAR - 1;
    o.api.group.position.set(dk.x + dk.nx * o.d, 0, -(dk.y + dk.ny * o.d));
    o.api.group.rotation.y = Math.atan2(dk.ny, dk.nx);
    if (dk.door) { dk.door.position.y = dk.doorY0 + o.open * (3.2 - 0.12); }
    if (dk.leveller) dk.leveller.rotation.x = -0.08 * o.open;
    if (dk.light) dk.light.material.color.setHex(o.state === 'docked' ? 0x31865c : 0x9e3c3c);
  }
  let pendingIn = 0;
  const inConvs = convs.filter((c) => c.group === 'IN');
  let nextIn = R.exp(sc.cycle.in_per_h / 3600), nextOut = R.exp(sc.cycle.out_per_h / 3600);
  // first arrivals soon, so the scene is alive at once
  // FIX (R13a): a block without flow (no lift station) got a first arrival after 8 s anyway (old cause: min(Infinity, 8)); no flow now means no arrivals
  nextIn = sc.cycle.in_per_h > 0 && inLifts.length ? Math.min(nextIn, 8) : Infinity; nextOut = sc.cycle.out_per_h > 0 && L.length ? Math.min(nextOut, 15) : Infinity;
  function stepFlows(dt) {
    nextIn -= dt; nextOut -= dt;
    if (nextIn <= 0) { nextIn += R.exp(sc.cycle.in_per_h / 3600); if (tr.in && tr.in.down && parts.divert && parts.divert('in')) { /* sent to another dock */ } else pendingIn++; }
    if (nextOut <= 0) { nextOut += R.exp(sc.cycle.out_per_h / 3600); const cand = []; for (let t = 0; t < tiers; t++) if (spare(t, 'stock')) cand.push(t); if (cand.length && outQ.length < 40) outQ.push(cand[R.int(cand.length)]); }
    // release inbound pallets from the docked truck onto the least loaded IN conveyor
    if (pendingIn > 0 && tr.in && tr.in.state === 'docked' && tr.in.open > 0.99 && tr.in.count > 0 && inConvs.length) {
      const live = inConvs.filter((c0) => !c0.l.down); if (!live.length) { /* every IN lift is down */ } else {
      const c = live.reduce((a, b) => (a.items.length <= b.items.length ? a : b));
      if (!c.items.some((e) => e.s < GAP)) {
        const e = newPallet(); if (e) { e.state = 'conv'; e.conv = c; e.s = 0; e.out = false; c.items.push(e); pendingIn--; tr.in.count--; tr.in.api.load.setCount(tr.in.count); }
      }
      }
    }
    for (const c of convs) {
      const isIn = c.group === 'IN';
      c.items.sort((a, b) => (isIn ? b.s - a.s : a.s - b.s));
      let prev = null;
      for (const e of c.items) {
        if (e.state !== 'conv') continue;
        if (!e.out) { const lim = prev ? prev.s - GAP : c.len; e.s = Math.min(e.s + CONV_V * dt, lim, c.len); }
        else { const lim = prev ? prev.s + GAP : 0; e.s = Math.max(e.s - CONV_V * dt, lim, 0); }
        prev = e;
      }
      if (!isIn) {
        const e = c.items.find((x) => x.state === 'conv' && x.s <= 0.02);
        if (e && tr.out && tr.out.state === 'docked' && tr.out.open > 0.99 && tr.out.count < tr.out.cap) {
          c.items.splice(c.items.indexOf(e), 1); killPallet(e); tr.out.count++; tr.out.api.load.setCount(tr.out.count); stats.outDone++;
        }
      }
    }
  }

  // ------------------------------------------------------------ main step
  function step(dt) {
    const h = 0.25, n = Math.max(1, Math.ceil(dt / h)), d = dt / n;
    for (let k = 0; k < n; k++) {
      T += d;
      stepFlows(d);
      for (const t of Object.values(tr)) stepTruck(t, d);
      for (const s of S) if (s.wantDown && !s.actor.busy) { s.down = true; s.wantDown = false; s.status = 'fault'; }
      for (const l of L) if (l.wantDown && !l.actor.busy && !l.owner) { l.down = true; l.wantDown = false; l.api.setDown && l.api.setDown(true); const ix = inLifts.indexOf(l); if (ix >= 0) inLifts.splice(ix, 1); const ox = outCap.indexOf(l); if (ox >= 0) outCap.splice(ox, 1); const sp = L.find((x) => x.group === 'SPARE' && !x.down); if (sp) { sp.group = ix >= 0 ? 'IN' : sp.group; if (ix >= 0) inLifts.push(sp); } }
      for (const l of L) l.actor.advance(d);
      for (const s of S) s.actor.advance(d);
      // R13a: a failed active shuttle is replaced by a parked one; finished block-to-block transfers leave this block (the receiving block adds the shuttle)
      for (const s of S) if (s.down && !s.replaced) { const p = S.find((x) => x.parked); if (p) { p.parked = false; p.status = 'idle'; s.replaced = true; } }
      if (handoffs.length) for (const hd of handoffs.splice(0)) { const ix = S.indexOf(hd.s); if (ix >= 0) { S.splice(ix, 1); stats.xferOut++; } hd.done(hd.s); }
      assign();
    }
    for (const e of ents) placeEnt(e);
  }
  /** wall-clock hook: also renders the dynamic pieces */
  function sync(time) {
    pool.flush();
    fleet.update(S, time);
  }
  /** warm start: the warm-up counts for utilisation and cycle samples (a longer window), the pallet counters and the clock start at 0 */
  function prewarm(sec) { for (let t = 0; t < sec; t += 0.5) step(0.5); resetClock(); }
  let clockT = 0;
  // ------------------------------------------------------------ R13a: shuttle transfer between blocks (pooled fleet, J1: through the shared channels)
  // A shuttle changes to tier 1 by lift, drives to the exit point on this block's front channel and along `pts` (this block's frame) to the front channel of the next block; the
  // caller (composite.js) then adds it to that block's sim. The crossing is on the floor (tier 1), see composite.js; times are the shuttle kinematics, not a model value.
  const handoffs = [];
  stats.xferOut = 0; stats.xferIn = 0;
  function startTransfer(s, pts, done) {
    const steps = [], state = { axis: s.axis }; let cur = s.cur || { u: s.u, v: s.v };
    if (s.tier !== 0) cur = tierChange(s, steps, state, cur, 0);
    cur = route(s, steps, state, cur, { u: pts[0].u, v: pts[0].v }) || cur;
    pushRoute(s, steps, { u: pts[0].u, v: pts[0].v }, pts.slice(1), state);
    s.xfer = true; s.xferAt = T; s.status = 'ok';
    s.actor.onDone = () => { s.status = 'idle'; handoffs.push({ s, done }); };
    s.actor.plan(steps);
    return true;
  }
  function addShuttle(s, pos, axis) {
    s.actor = new Actor(); s.u = pos.u; s.v = pos.v; s.z = tz[0]; s.tier = 0; s.lift = 0; s.ring = 0; s.axis = axis; s.turn = axis === 'u' ? 1 : 0;
    s.cur = { u: pos.u, v: pos.v }; s.status = 'idle'; s.parked = false; s.down = false; s.xfer = false; s.xferAt = T; S.push(s); stats.xferIn++;
  }
  const idleList = () => S.filter((x) => !x.actor.busy && !x.down && !x.wantDown && !x.parked && !x.xfer);
  function load() {                                           // work waiting vs shuttles free: the rebalancing rule of composite.js reads this
    let inHeads = 0; for (const l of inLifts) if (l.q < 2 && l.conv.items.some(headOf)) inHeads++;
    return { demand: outQ.length + inHeads, idle: idleList().length, size: S.filter((x) => !x.parked).length, total: S.length };
  }
  function resetClock() { stats.inDone = stats.outDone = 0; stats.xferOut = stats.xferIn = 0; clockT = T; }
  // ------------------------------------------------------------ R9b contingency: shuttle, lift, tier or dock down (the pool and the spare lift take over)
  const cont = { kind: null };
  function setContingency(kind, pick = {}) {
    for (const s of S) { s.down = false; s.wantDown = false; s.replaced = false; if (s.spare && !s.actor.busy && !s.xfer) { s.parked = true; s.status = 'charge'; } if (s.status === 'fault') s.status = 'idle'; }
    for (const l of L) { if (l.down) { l.api.setDown && l.api.setDown(false); } l.down = false; l.wantDown = false; }
    inLifts.length = 0; outCap.length = 0;
    L.forEach((l) => { if (l.spec.group === 'IN') l.group = 'IN'; else if (l.spec.group === 'SPARE') l.group = 'SPARE'; else l.group = l.spec.group; });
    inLifts.push(...L.filter((l) => l.group === 'IN')); outCap.push(...L.filter((l) => l.group !== 'IN'));
    lockedTier.clear();
    for (const o of Object.values(tr)) if (o) o.down = false;
    cont.kind = kind || null; cont.target = null;
    if (kind === 'shuttle') { const s = S.find((x) => !x.spare) || S[0]; if (s) { s.wantDown = true; cont.target = { kind, i: s.i }; } }
    else if (kind === 'lift') { const l = L.find((x) => x.group !== 'SPARE') || L[0]; if (l) { l.wantDown = true; cont.target = { kind, i: l.k }; } }
    else if (kind === 'tier') { const t = pick.tier != null ? pick.tier : Math.min(tiers - 1, 1); lockedTier.add(t); cont.target = { kind, tier: t }; }
    else if (kind === 'dock') { const o = tr.in || tr.out; if (o) { o.down = true; cont.target = { kind, dock: o.kind }; } }
    return cont.target;
  }
  const util = (arr, noWait) => { const el = Math.max(1, T); return arr.length ? arr.reduce((a, x) => a + x.actor.busyT - (noWait ? x.actor.waitT : 0), 0) / (arr.length * el) : null; };
  return {
    kinMissing, tBoard: TBOARD, step, sync, prewarm, resetClock, startTransfer, addShuttle, load, idleList, setContingency, contingency: cont, addIn() { pendingIn++; }, lockedTier, shuttles: S, lifts: L, convs, trucks: tr, mode: MODE, modeFromModel: modeKnown, pallets: ents,
    get time() { return T; }, get elapsed() { return T - clockT; },
    stats() {
      return { t: T - clockT, inDone: stats.inDone, outDone: stats.outDone, shuttleUtil: util(S.filter((s) => !s.spare && !s.parked), true), shuttleUtilWithWait: util(S.filter((s) => !s.spare && !s.parked)), liftInUtil: util(inLifts), liftOutUtil: util(outLifts),
        cycleObs: stats.moves >= 6 ? stats.cycleSum / stats.moves : null, cycles: stats.cycles, dual: stats.dual, pendingOut: outQ.length, pendingIn, xferOut: stats.xferOut, xferIn: stats.xferIn };
    },
  };
}
