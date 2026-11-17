// Composite (R9b): builds the whole 3D model from report.scene: building shell, one world + fleet + lifts + pallet pool + trucks + animation per storage section
// (a rectangle is one section, an L / U / T footprint has one per block), the functional zones, and presents them to index.js / rig.js / shots.js / env.js as ONE world and ONE sim.
import { THREE, makeFrame } from './kit.js';
import { buildWorld } from './world.js';
import { makeFleet, makeLift, makePalletPool, makeTruck, propKit } from './vehicles.js';
import { createSim } from './sim.js';
import { buildSections } from './sections.js';
import { buildFootprintShell } from './footprint.js';
import { buildZones } from './zones.js';
import { createTransfers } from './transfer.js';

export function buildComposite(rep, { scene, textures, small }) {
  const sc = rep.scene, B = sc.building;
  const info = buildSections(rep);
  const isShape = !!sc.storage_blocks;
  const root = new THREE.Group(); root.name = 'composite'; scene.add(root);
  const mats = [];
  const ownC = (m) => { mats.push(m); return m; };
  // FIX (R13a): a block without a lift station keeps no flow (old cause: flows were shared by positions over every block)
  const wsum = info.sections.reduce((a, s) => a + (s.sc.lifts.length ? (s.positions || 1) : 0), 0) || 1;
  // building shell
  let fp = null;
  if (isShape) { fp = buildFootprintShell(info.rects, info.doors, B, textures, ownC); root.add(fp.root); }
  const secs = [];
  info.sections.forEach((s, i) => {
    const share = s.sc.lifts.length ? (s.positions || 1) / wsum : 0;
    if (isShape) s.sc.cycle = { ...s.sc.cycle, in_per_h: sc.cycle.in_per_h * share, out_per_h: sc.cycle.out_per_h * share };
    const grp = new THREE.Group(); grp.name = 'section ' + i; grp.position.set(s.origin.x, 0, -s.origin.y); root.add(grp);
    const w = buildWorld(rep, { textures, small: small || info.sections.length > 2, sc: s.sc, rackOnly: isShape });
    grp.add(w.root);
    if (isShape) for (const k of ['in', 'out']) {                               // the door leaf, leveller and light of the shared shell belong to this section's dock
      const d = w.docks[k]; const o = d && fp.doorObjs.get(s.sc.docks[k].doorIdx); if (o) Object.assign(d, o);
    }
    const fleet = makeFleet(w, isShape ? info.nTotal : s.sc.shuttles.total); grp.add(fleet.group);        // R13a: capacity = the whole pooled fleet (a shuttle can move into this block)
    const liftApis = w.lifts.map((l, j) => makeLift(w, l, j)); liftApis.forEach((l) => grp.add(l.group));
    const pool = makePalletPool(w, isShape ? 90 : 160); grp.add(pool.group);
    const trucks = {};
    for (const k of ['in', 'out']) if (w.docks[k]) { trucks[k] = makeTruck(w, k); grp.add(trucks[k].group); }
    const repS = { ...rep, scene: s.sc };
    secs.push({ s, i, grp, w, fleet, liftApis, pool, trucks, repS, share });
  });
  const sims = [];
  secs.forEach((c) => {
    c.sim = createSim(c.w, c.repS, { fleet: c.fleet, liftApis: c.liftApis, pool: c.pool, trucks: c.trucks, divert: (kind) => divert(c, kind) }, { seed: 20261104 + c.i * 77 });
    sims.push(c.sim);
  });
  function divert(from, kind) {                                  // an arrival whose dock is down goes to the next section with a working dock
    for (const c of secs) if (c !== from && c.sim.trucks[kind] && !c.sim.trucks[kind].down) { c.sim.addIn(); return true; }
    return false;
  }
  const prim = secs[0].w;
  const shuttles = [], lifts = [], liftApis = [], fleetOf = [];
  secs.forEach((c) => {
    c.sim.shuttles.forEach((s) => { s.f = c.w.f; s.sec = c.i; s.gid = shuttles.length; fleetOf.push([c, s.i]); shuttles.push(s); });
    c.sim.lifts.forEach((l) => { l.f = c.w.f; l.sec = c.i; lifts.push(l); liftApis.push(c.liftApis[l.k]); });
  });
  // world docks (world coordinates) for the camera shots and the I/O path
  const docksW = {};
  for (const k of ['in', 'out']) { const d = info.doors.find((x) => x.flow === k.toUpperCase()); if (d) docksW[k] = { x: d.x, y: d.y, wall: d.wall, nx: d.nx, ny: d.ny, s: d.s }; }
  const shell = isShape ? fp.shell : prim.shell;
  const zonesApi = buildZones(rep, info, prim, { makeForklift: propKit(prim).makeForklift, makePerson: propKit(prim).makePerson });
  root.add(zonesApi.group);
  const transferEvents = [];
  const transfers = createTransfers(rep, secs, info, root, ownC, { onTransfer: (d) => { transferEvents.push(d); document.dispatchEvent(new CustomEvent('apw:transfer', { detail: d })); } });
  (transfers.warnings || []).forEach((w) => info.warnings.push(w));
  const f0 = makeFrame(secs[0].s.sc, secs[0].s.origin);
  const world = {
    root, sc: { ...sc, columns: secs[0].s.sc.columns, building: B }, f: f0, blocks: prim.blocks, modules: prim.modules, tz: prim.tz, tiers: prim.tiers, LEV: prim.LEV, ZR: prim.ZR,
    shell, sections: secs, info,
    setABC(on) { secs.forEach((c) => c.w.setABC(on)); }, abc: false,
    setDim(k) { secs.forEach((c) => c.w.setDim(k)); }, dim: 1, setLOD(lv) { secs.forEach((c) => c.w.setLOD(lv)); }, get lod() { return secs[0].w.lod; }, floorMats: [...(isShape && fp ? [fp.floorMat] : secs.map((c) => c.w.floorMat))].filter(Boolean), apronMats: [...(isShape && fp ? [fp.apronMat] : secs.map((c) => c.w.apronMat))].filter(Boolean),   // R26d V7
    lifts: secs.flatMap((c) => c.w.lifts), docks: docksW, convZ: prim.convZ,
    aoTextures: secs.flatMap((c) => c.w.aoTextures), mats: [...mats, ...secs.flatMap((c) => c.w.mats)],
    get positions() { return secs.reduce((a, c) => a + c.w.positions, 0); }, get stock() { return secs.reduce((a, c) => a + c.w.stock, 0); },
    lumMat: prim.lumMat, rooflightMat: isShape ? fp.rooflightMat : prim.rooflightMat,
  };
  world.positions;
  // ---- one sim view
  const sum = (k) => sims.reduce((a, s) => a + (s.stats()[k] || 0), 0);
  const wavg = (k) => { let n = 0, d = 0; sims.forEach((s) => { const v = s.stats()[k]; if (v != null) { n += v; d++; } }); return d ? n / d : null; };
  const sim = {
    sims, shuttles, lifts, mode: sims[0].mode, modeFromModel: sims[0].modeFromModel,
    get convs() { return sims.flatMap((s) => s.convs); }, get pallets() { return new Set(sims.flatMap((s) => [...s.pallets])); },
    get trucks() { const o = {}; secs.forEach((c) => { for (const [k, v] of Object.entries(c.sim.trucks)) if (v) o[k + c.i] = v; }); return o; },
    get transfers() { return transfers; },
    get time() { return sims[0].time; }, get elapsed() { return sims[0].elapsed; },
    step(dt) { const h = 0.5, n = Math.max(1, Math.ceil(dt / h)); for (let k = 0; k < n; k++) { sims.forEach((s) => s.step(dt / n)); transfers.tick(dt / n); } }, sync(t) { sims.forEach((s) => s.sync(t)); }, prewarm(sec) { for (let t = 0; t < sec; t += 0.5) { sims.forEach((s) => s.step(0.5)); transfers.tick(0.5); } sims.forEach((s) => s.resetClock()); transfers.count = 0; },       // FIX (R13a): the warm-up runs through the block coordinator (transfers happen in it)
    stats() {
      const st = sims.map((s) => s.stats());
      return { t: st[0].t, inDone: sum('inDone'), outDone: sum('outDone'), shuttleUtil: wavg('shuttleUtil'), liftInUtil: wavg('liftInUtil'), liftOutUtil: wavg('liftOutUtil'),
        cycleObs: wavg('cycleObs'), cycles: sum('cycles'), dual: sum('dual'), pendingOut: sum('pendingOut'), pendingIn: sum('pendingIn'), xfer: transfers.enabled ? transfers.count : null, xferUnit: transfers.unit || null };
    },
  };
  sim.prewarm(420);
  // ---- contingency: visual state + the rerouting in the sims
  const slabs = secs.map((c) => {
    const b = c.s.sc.columns, A = b.axis, ext = A === 'x' ? [c.s.sc.building.L, c.s.sc.building.W] : [c.s.sc.building.L, c.s.sc.building.W];
    const m = new THREE.Mesh(new THREE.PlaneGeometry(ext[0], ext[1]), ownC(new THREE.MeshBasicMaterial({ color: 0xb3261e, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })));
    m.rotation.x = -Math.PI / 2; m.position.set(ext[0] / 2, 0, -ext[1] / 2); m.visible = false; m.renderOrder = 6; c.grp.add(m); return m;
  });
  const cont = { kind: null, target: null };
  function setContingency(kind) {
    cont.kind = kind || null; cont.target = null;
    slabs.forEach((m) => { m.visible = false; });
    zonesApi.setDockDown('IN', false); zonesApi.setDockDown('OUT', false);
    secs.forEach((c, i) => {
      const t = c.sim.setContingency(i === 0 || kind === 'tier' ? kind : null, { tier: Math.min(world.tiers - 1, 1) });
      if (i === 0) cont.target = t;
      if (kind === 'tier') { slabs[i].visible = true; slabs[i].position.y = world.tz[t.tier] + 0.14; }
    });
    if (kind === 'dock') { const o = secs[0].sim.trucks.in ? 'IN' : 'OUT'; zonesApi.setDockDown(o, true); cont.target = { kind, dock: o.toLowerCase() }; }
    return cont;
  }
  { const pl = (rep.plan || {})['plan.lifts_installed'], nl = secs.reduce((a, x) => a + x.s.sc.lifts.length, 0); if (pl != null && pl !== nl) info.warnings = [...(info.warnings || []), `scene lists ${nl} lift stations, plan.lifts_installed is ${pl} (scene.blocks_info[].lift_stations vs plan)`]; }
  (info.warnings || []).forEach((w) => console.warn('[scene] model field:', w));
  return { warnings: info.warnings || [], world, sim, secs, shuttles, fleetOf, liftApis, zones: zonesApi, info, fp, cont, setContingency, dispose() { zonesApi.dispose(); } };
}
