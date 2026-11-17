// R9b scene API (globalThis.APW.scene, returned by mount(); the UI calls these):
//   setDesign(report)        rebuild the scene for another report in the same stage
//   setZonesVisible(bool)    functional-zone volumes, labels, reserve strip, bay marks (default on)
//   setWalls(bool)           partition walls around the zones (default off)
//   setContingency(kind|null) kind in 'shuttle' | 'lift' | 'tier' | 'dock': unit shown down (red / grey), the pool, the spare lift or the other docks take over
//   playIOPath(mode[, {follow, seconds}])  'in' | 'out': a marker runs dock > conveyor > bay > lift deck > tier > shuttle > lane (or back) with report.io_path stage times; returns a Promise;
//                            stopIOPath(), ioPath (state), document event 'apw:iopath' per stage
//   frameShape()             fits the whole footprint (rect, L, U, T) into the view
//   plus the older setView / setShell / setEnv / setSpeed / play / pause / setABC / follow / tour / stats / perf / snapshot
// 3D scene (B4) entry: mount(detail) builds the warehouse from report.scene, runs the animation and the camera, unmount() frees it.
// Loaded lazily by boot.js (three.js comes from the import map). Public API: globalThis.APW.scene (see README, B4 section).
import { THREE, makeTextures, disposeTree } from './kit.js';
import { buildComposite } from './composite.js';
import { createIOPath } from './iopath.js';
import { createRackInfo } from './racks.js';
import { createTierGauge } from './tiergauge.js';
import { createEnv } from './env.js';
import { createRig } from './rig.js';
import { createPanel } from './panel.js';
import { defaultShots } from './shots.js';
import { h, effectiveTheme } from '../ui.js';
import { BUDGET, TIME, ROLES } from '../../design/tokens.js';
import { createLabels } from './labels.js';

let renderer = null, TEX = null;
const prefs = { view: 'orbit', shell: 'cut', env: null, speed: null, abc: false, playing: null };
let current = null, lastDetail = null;
/** rebuild the scene for another report in the same stage (the UI passes the new report after every run) */
function setDesign(report) { if (!lastDetail) return null; const d = { ...lastDetail, report }; return mount(d); }

const mq = (q) => (typeof matchMedia === 'function' ? matchMedia(q).matches : false);
const isPhone = () => mq('(max-width: 40rem)');
const isReduced = () => mq('(prefers-reduced-motion: reduce)');

function getRenderer() {
  if (renderer) return renderer;
  const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
  r.info.autoReset = true;
  r.domElement.className = 'sc-canvas'; r.domElement.tabIndex = 0;
  renderer = r;
  return r;
}

export function webglOk() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}

export function mount(detail) {
  unmount();
  const rep = detail.report, stage = detail.slots.scene.querySelector('.slot-stage');
  if (!stage) return null;
  if (!rep.scene || !rep.scene.building) {
    stage.replaceChildren(h('div.sc-empty', h('strong', 'No 3D view'), h('span', 'This design has no layout to show. See the reasons above.')));
    return null;
  }
  const r = getRenderer();
  if (!TEX) TEX = makeTextures(Math.min(8, r.capabilities.getMaxAnisotropy()));
  current = createScene(detail, stage, r);
  lastDetail = detail;
  return current.api;
}
export function unmount() { if (current) { current.dispose(); current = null; } }

function createScene(detail, stage, r) {
  const rep = detail.report, sc = rep.scene;
  const phone = isPhone(), reduced = isReduced();
  const t0 = performance.now();
  // ---------------------------------------------------------------- build
  const scene = new THREE.Scene();
  // R9b: one composite = building + one section (world, fleet, lifts, pallets, trucks, animation) per storage block + functional zones; see composite.js
  const comp = buildComposite(rep, { scene, textures: TEX, small: phone });
  const { world, sim, liftApis, zones } = comp;
  const nShuttle = sc.shuttles.total;
  const fleets = comp.secs.map((c) => c.fleet);
  sim.prewarm(0);
  sim.sync(0);
  const buildMs = performance.now() - t0;

  // ---------------------------------------------------------------- stage DOM
  stage.classList.add('sc-stage'); stage.replaceChildren();
  const canvas = r.domElement; stage.append(canvas);
  canvas.setAttribute('aria-label', `3D model of the warehouse: ${rep.headline ? Math.round(rep.headline.positions) : ''} pallet positions, ${world.tiers} tiers, ${world.lifts.length} lifts, ${nShuttle} shuttles. Drag to orbit.`);
  canvas.setAttribute('role', 'img');
  const camera = new THREE.PerspectiveCamera(38, 1.6, 0.3, 1800);
  const labels = createLabels(stage, camera);          // R24 V4: screen-space labels (13 px, declutter), replaces the canvas sprites of zones.js
  const quality = { pixelRatio: Math.min(window.devicePixelRatio || 1, phone ? 1.5 : BUDGET.pixelRatioMax), shadows: !phone };
  const env = createEnv(r, scene, world, { shadows: quality.shadows, shadowSize: phone ? 1024 : BUDGET.shadowMapSize });
  r.shadowMap.enabled = quality.shadows;
  let dirty = true, running = false, lastT = 0, visible = true, full = false;
  let framesRendered = 0;   // FIX (R18e): counts render() calls; scene.perf() refuses to run before the first one (old cause: it silently measured nothing and returned zero draw calls)
  const invalidate = () => { dirty = true; start(); };
  const rig = createRig(camera, canvas, world, { reduced, onChange: invalidate });
  const speedInit = prefs.speed ?? (reduced ? 3 : TIME.speedupDefault);
  const st = { zones: prefs.zones ?? true, walls: prefs.walls ?? false, contingency: null, speed: speedInit, playing: prefs.playing ?? !reduced, view: 'orbit', shell: prefs.shell, envName: prefs.env, abc: prefs.abc };
  const autoEnv = () => (effectiveTheme() === 'dark' ? 'studio' : 'day');

  const api = {
    get info() { return { positions: world.positions, stock: world.stock, buildMs, drawCalls: r.info.render.calls, triangles: r.info.render.triangles }; },
    scene, world, sim, rig, renderer: r, comp,
    /** R24 V6: camera presets of the toolbar: orbit (overview), plan, section, lift (follows lift 1), docks (corner view), tiers (tier gauge) */
    preset(id) {
      if (id === 'orbit' || id === 'plan' || id === 'section') { api.setTierGauge(false); api.setView(id); return; }
      if (st.following) api.unfollow();
      if (st.view !== 'orbit') { st.view = 'orbit'; prefs.view = 'orbit'; panel.setView('orbit'); applyShell(); }
      panel.setView(id);
      if (id === 'lift') { api.setTierGauge(false); followEntity('lift', 0); return; }
      if (id === 'docks') { api.setTierGauge(false); const d = world.docks.in || world.docks.out, Bq = sc.building, dg = Math.hypot(Bq.L, Bq.W);
        if (d) rig.goToModel({ pos: [d.x - d.nx * dg * 0.7 + (-d.ny) * dg * 0.5, d.y - d.ny * dg * 0.7 + d.nx * dg * 0.5, Bq.H * 1.7], target: [d.x + d.nx * dg * 0.35, d.y + d.ny * dg * 0.35, 3], fov: 42 }); }
      if (id === 'tiers') { api.setTierGauge(true); const s = defaultShots(rep, world, sim).find((x) => x.name === 'Tier limit'); if (s) rig.goToModel(s.to); }
      applyShell(); invalidate();
    },
    setView(v) { st.view = v; prefs.view = v; st.following = null; setFocus(null); panel.follow(null); panel.setView(v); applyShell(); rig.setView(v); invalidate(); },
    setShell(m) { st.shell = m; prefs.shell = m; panel.setShell(m); applyShell(); invalidate(); },
    setEnv(n) { st.envName = n; prefs.env = n; panel.setEnv(n); env.set(n); invalidate(); scheduleThumbs(); },
    setSpeed(s) { st.speed = s; prefs.speed = s; panel.setSpeed(s); },
    play() { st.playing = true; prefs.playing = true; panel.setPlaying(true); invalidate(); },
    pause() { st.playing = false; prefs.playing = false; panel.setPlaying(false); invalidate(); },
    togglePlay() { st.playing ? api.pause() : api.play(); },
    toggleABC() { api.setABC(!st.abc); },
    /** R9b scene API (the UI calls these) */
    setDesign(report) { return setDesign(report); },
    setZonesVisible(on) { st.zones = !!on; prefs.zones = st.zones; zones.setVisible(st.zones); invalidate(); },
    setWalls(on) { st.walls = !!on; prefs.walls = st.walls; zones.setWalls(st.walls); invalidate(); },
    setContingency(kind) { const k = kind || null; st.contingency = k; prefs.contingency = k; const t = comp.setContingency(k); invalidate(); return t; },
    playIOPath(mode, opts) { const pr = ioPath.play(mode, opts); if (pr) { world.setDim(0.55); pr.then(() => { if (!focusSpec) world.setDim(1); invalidate(); }); } return pr; },
    /** R26d V7: one shuttle for a "shuttle on a lift" shot: the busy shuttle nearest to the first lift. Returns {get, focus(), release()}; `get` is the follow point for a tour shot. */
    pickShuttle() {
      if (pickMemo) return pickMemo;
      let s = null;     // the shuttle nearest to the first lift in plan (in the aisle in front of it, on its deck when it rides)
      const choose = () => { if (s) return s; const l0 = sim.lifts[0]; if (!l0) return (s = sim.shuttles[0]);
        const lp = l0.f.pos(l0.spec.u, l0.spec.v, 0).add(secOff(l0.sec)); let bd = Infinity;
        for (const c of sim.shuttles) { const q = c.f.pos(c.u, c.v, c.z).add(secOff(c.sec)); q.y = 0; const d2 = q.distanceToSquared(lp) - (c.actor && c.actor.busy ? 2 : 0); if (d2 < bd) { bd = d2; s = c; } }
        return s; };
      return (pickMemo = { get: () => { const c = choose(); return c.f.pos(c.u, c.v, c.z + 0.3).add(secOff(c.sec)); }, focus() { setFocus({ kind: 'shuttle', s: choose() }); }, release() { setFocus(null); } });
    },
    setFocusKind(kind) { if (!kind) setFocus(null); },
    stopIOPath() { ioPath.stop(); },
    get ioPath() { return ioPath.info; },
    frameShape() { rig.frameShape(); invalidate(); },
    get warnings() { return comp.warnings; },
    setABC(on) { st.abc = !!on; prefs.abc = st.abc; world.setABC(st.abc); panel.setABC(st.abc); invalidate(); },
    unfollow() { st.following = null; setFocus(null); panel.follow(null); rig.follow = null; rig.mode = st.view; applyShell(); invalidate(); },
    follow(kind, i) { followEntity(kind, i); },
    /** R13a: tier-limit gauge: height ruler beside the building (rack height used, building height, 7-tier marker, next tier ghost) + the tier rule card (needs report.tier_rule) */
    setTierGauge(on) { st.tiers = !!on && tierGauge.available; prefs.tiers = st.tiers; tierGauge.setVisible(st.tiers); panel.setTiers(st.tiers); },
    toggleTiers() { api.setTierGauge(!st.tiers); },
    get tierGauge() { return { available: tierGauge.available, visible: tierGauge.visible }; },
    /** R13a: racks of the design (one rack = one side of an aisle): lanes, pallets, SKUs, dimensions, gaps (same numbers as the hover card); showRack(i) opens the card */
    racks() { return rackInfo.racks.map(({ pick, centre, size, ...r }) => r); },
    showRack(i) { return rackInfo.showRack(i); },
    setRackInfo(on) { rackInfo.setEnabled(on); },
    /** R13a: send one idle shuttle from a block with spare shuttles to another block now (L / U / T pooled fleet); returns {from, to, shuttle} or null (one block, captive fleet, no idle shuttle) */
    transferShuttle(from, to) { return sim.transfers.force(from, to); },
    get transfers() { const t = sim.transfers; return { enabled: t.enabled, mode: t.mode, unit: t.unit, count: t.count, active: t.active, info: t.info, warnings: t.warnings }; },
    /** R24 V4: rectangles the labels must stay out of (the caption and chart panels of the guided demo): setLabelAvoid(() => [DOMRect, ...]); null clears. labelsShown() lists the visible labels. */
    setLabelAvoid(fn) { extraAvoid = fn || null; invalidate(); },
    labelsShown() { return labels.shown(); },
    /** R24 V5: keep the subject out from under the caption panel: the frame is shifted so the camera target lands in the free part of the stage ({left, bottom} = covered fractions of the stage) */
    setSafeInset(i) { inset = { left: (i && i.left) || 0, bottom: (i && i.bottom) || 0 }; applyInset(); },
    /** R24 V6: bounding box (client px) of the projected building box (footprint x height), for the control-overlap check of the results page */
    footprintScreen() {
      const rc = stage.getBoundingClientRect(), Bq = sc.building, pts = [];
      for (const x of [0, Bq.L]) for (const y of [0, Bq.W]) for (const z of [0, Bq.H]) pts.push(new THREE.Vector3(x, z, -y).project(camera));
      const xs = pts.map((q) => rc.left + (q.x * 0.5 + 0.5) * rc.width), ys = pts.map((q) => rc.top + (-q.y * 0.5 + 0.5) * rc.height);
      return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys), stage: { left: rc.left, top: rc.top, right: rc.right, bottom: rc.bottom } };
    },
    /** the subject of the current tour shot in client pixels, or null; stage = the stage rectangle */
    subjectScreen() {
      const T = rig.tour, shot = T && T.shots[T.i]; if (!shot || !shot.subject) return null;
      const p = subjectPos(shot.subject); if (!p) return null;
      const q = p.clone().project(camera), rc = stage.getBoundingClientRect();
      return { x: rc.left + (q.x * 0.5 + 0.5) * rc.width, y: rc.top + (-q.y * 0.5 + 0.5) * rc.height, behind: q.z > 1, stage: { left: rc.left, top: rc.top, right: rc.right, bottom: rc.bottom } };
    },
    toggleFull() { full = !full; labels.setFull(full); stage.classList.toggle('is-full', full); document.documentElement.classList.toggle('sc-lock', full); panel.setFull(full); resize(); },
    /** camera tour for B5. shots: see shots.js. Returns the tour controller ({next, prev, pause, resume, stop, on, promise}). */
    tour(shots, opts) { return rig.playTour(shots || defaultShots(rep, world, sim), tourHost, opts); },
    stopTour() { rig.stopTour(); },
    defaultShots() { return defaultShots(rep, world, sim); },
    stats() { return sim.stats(); },
    /** the running animation (R9a: for checks and for R9b hooks: sim.mode, sim.shuttles, sim.lifts, sim.convs) */
    get sim() { return sim; },
    snapshot() { render(); return canvas.toDataURL('image/png'); },
    // FIX (R18e): throws instead of returning a silent zero result when no frame has been rendered yet (old cause: benchmark() counted rAF ticks with no draw calls)
    perf(seconds = 3) { if (!framesRendered) throw new Error('scene.perf(): no frame has been rendered yet; mount the 3D scene and wait for its first frame (or call snapshot())'); return benchmark(seconds); },
  };
  const modelKpi = (key) => { for (const g of rep.groups || []) for (const k of g.kpis) if (k.key === key) return k.value; return null; };
  const ioPath = createIOPath(rep, comp, { invalidate, pathLabels: (defs) => { labels.clear('path'); if (defs) defs.forEach((d) => labels.add(d)); }, followTarget: (g, d) => { st.following = null; return rig.followTarget(g, d); }, onStage: (e) => document.dispatchEvent(new CustomEvent('apw:iopath', { detail: e })) });
  const panel = createPanel(stage, api, { reduced, view: st.view, shell: st.shell, env: st.envName || autoEnv(), speed: st.speed });
  panel.setPlaying(st.playing); panel.setSpeed(st.speed); panel.setABC(st.abc);
  if (prefs.tiers && tierGauge.available) { st.tiers = true; tierGauge.setVisible(true); panel.setTiers(true); }
  // R13a: rack info card (hover / tap one rack) and the tier-limit gauge (height ruler + card)
  const rackInfo = createRackInfo(rep, comp, stage, camera, canvas, { invalidate });
  const tierGauge = createTierGauge(rep, comp, stage, { invalidate });
  labels.setOccluders(rackInfo.racks.map((rk) => { rk.pick.updateWorldMatrix(true, false); return new THREE.Box3().setFromObject(rk.pick).expandByScalar(-0.3); }));   // R26d V7: labels behind a rack are hidden
  const modelNums = { util: modelKpi('queues.rho_shuttle'), // FIX (R13c): the model value next to the observed time per move was `cycles.shuttle` (126.7 s: the shuttle cycle of one lane without boarding and lift ride, a different quantity from the observed time per move, 215 s);
  // the comparable model figure is the service time per move of the pooled fleet, fleet.T_V_s (rho = lambda x T_V / N)
  // FIX (R18e): no fallback to other quantities when fleet.T_V_s is missing (old cause: `cycles.shuttle` / `cycle.shuttle_s` came back in, the quantity R13c had removed); the HUD shows n/a
  cycle: rep.fleet && rep.fleet.T_V_s != null ? rep.fleet.T_V_s : null };

  // ---------------------------------------------------------------- shell / environment helpers
  function facingWall() {
    const p = camera.position, c = rig.center;
    return Math.abs(p.x - c.x) / sc.building.L > Math.abs(p.z - c.z) / sc.building.W ? (p.x > c.x ? 'E' : 'W') : (p.z > c.z ? 'S' : 'N');
  }
  function applyShell() {
    let m = st.shell;
    if (st.view === 'plan' || st.view === 'section') m = 'open';
    if (st.following && m === 'closed') m = 'cut';
    if (st.following) m = 'open';                 // FIX (R9b): the follow camera sat inside the rack (old cause: only a shuttle follow opened the shell and sliced the tiers; a lift follow had neither)
    world.shell.set(m, facingWall(), true);
    applyClip();
    if (st.view === 'section') rig.sectionPose();
  }
  // clipping: section plane, or a tier slice (everything above the followed shuttle's tier is cut so the aisle can be seen from above)
  const slice = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  function applyClip() {
    if (st.view === 'section') r.clippingPlanes = [rig.clip];
    else if (st.following) { const fz = st.following.kind === 'shuttle' ? world.tz[sim.shuttles[st.following.i].tier] : (sim.lifts[st.following.i] ? sim.lifts[st.following.i].z : 0); slice.constant = fz + world.LEV * 0.93; r.clippingPlanes = [slice]; }
    else r.clippingPlanes = [];
  }
  const tourHost = {
    cut(shot, cb) { ioPath.stop(); if (!st.following) setFocus(null); setShotLabels(shot.labels);      // FIX (R13c): the dock-to-lane tracer of chapter 5 stayed on screen in later chapters (old cause: only the tracer's own end or an explicit stop removed it)
      if (rig.reduced) { panel.text(shot.text); cb(); return; } panel.fade(225, true); setTimeout(() => { cb(); panel.text(shot.text); panel.fade(225, false); invalidate(); }, 225); },
    setEnv(n) { env.set(n); panel.setEnv(n); applyShellFor(shotShell); },
    setShell(m) { shotShell = m; applyShellFor(m); },
    setSpeed(s) { api.setSpeed(s); },
    setABC(on) { api.setABC(on); },
    setTierGauge(on) { api.setTierGauge(on); },
    transfer() { api.transferShuttle(); },
  };
  let shotShell = 'cut';
  function applyShellFor(m) { world.shell.set(m, facingWall(), true); applyClip(); invalidate(); }
  const initialEnv = st.envName || autoEnv();
  env.set(initialEnv, true); panel.setEnv(initialEnv);
  if (st.abc) world.setABC(true);
  zones.setVisible(st.zones); zones.setWalls(st.walls);
  if (prefs.contingency) comp.setContingency(prefs.contingency);

  // ---------------------------------------------------------------- labels (R24 V4)
  // Resource labels exist for every lift, shuttle, the largest rack and the docks; which of them show is decided by the filter: outside a tour the zone labels (when zones are on) and the
  // lift labels; during a tour only what the shot lists in `labels` (kinds 'lift', 'shuttle', 'shuttle:3', 'rack', 'dock', 'zones', or {text, at: [x, y, z] in model metres, color, prio}).
  const secOff = (k) => comp.secs[k].grp.position;
  zones.labelDefs.forEach((d) => labels.add({ ...d, getPos: () => zones.group.localToWorld(d.pos.clone()) }));
  const topZ = sc.tiers * sc.tier_pitch + 0.6;
  sim.lifts.forEach((l, k) => labels.add({ id: `lift:${k}`, kind: 'lift', text: `Lift ${String(l.spec.id).replace(/^L/, '')}`, color: ROLES.lift.hex, prio: 2, getPos: () => l.f.pos(l.spec.u, l.spec.v, topZ).add(secOff(l.sec)) }));
  sim.shuttles.forEach((s, k) => labels.add({ id: `shuttle:${k}`, kind: 'shuttle', text: `Shuttle ${k + 1}`, color: ROLES.shuttle.hex, prio: 2, getPos: () => s.f.pos(s.u, s.v, s.z + 0.9).add(secOff(s.sec)) }));
  { const big = [...rackInfo.racks].sort((a, b) => b.pallets - a.pallets)[0];
    if (big) labels.add({ id: 'rack:0', kind: 'rack', text: 'Rack', color: ROLES.structure.hex, prio: 2.5, getPos: () => big.centre.clone().add(secOff(big.sec)).add(new THREE.Vector3(0, big.size.y / 2 + 0.8, 0)) }); }
  for (const [k, role] of [['in', ROLES.in.hex], ['out', ROLES.out.hex]]) { const d = world.docks[k];
    if (d) labels.add({ id: `dock:${k}`, kind: 'dock', text: `${k.toUpperCase()} dock`, color: role, prio: 2, getPos: () => new THREE.Vector3(d.x, 3.4, -d.y) }); }
  { const l0 = sim.lifts[0];
    if (l0) labels.add({ id: 'shuttle:near', kind: 'shuttle', text: 'Shuttle', color: ROLES.shuttle.hex, prio: 2, getPos: () => {       // the shuttle nearest to the first lift (the one the story talks about)
      const lp = l0.f.pos(l0.spec.u, l0.spec.v, 0).add(secOff(l0.sec)); let best = null, bd = Infinity;
      for (const s of sim.shuttles) { const q = s.f.pos(s.u, s.v, s.z + 0.9).add(secOff(s.sec)), dd = q.distanceToSquared(lp); if (dd < bd) { bd = dd; best = q; } }
      return best || lp; } }); }
  // R24 V5: the subject of a story shot (kind or {at}) as a three.js point; the check tools/qa_labels.py projects it and tests it against the safe zone
  function subjectPos(sub) {
    if (!sub) return null;
    if (typeof sub === 'object' && sub.at) return new THREE.Vector3(sub.at[0], sub.at[2], -sub.at[1]);
    if (sub === 'building') return new THREE.Vector3(sc.building.L / 2, sc.building.H * 0.4, -sc.building.W / 2);
    if (sub === 'shuttle') return api.pickShuttle().get();
    if (sub === 'lift') { const l = sim.lifts[0]; return l ? l.f.pos(l.spec.u, l.spec.v, topZ * 0.6).add(secOff(l.sec)) : null; }
    if (sub === 'rack') { const b = [...rackInfo.racks].sort((x, y) => y.pallets - x.pallets)[0]; return b ? b.centre.clone().add(secOff(b.sec)) : null; }
    if (sub === 'dock') { const d = world.docks.in || world.docks.out; return d ? new THREE.Vector3(d.x, 2, -d.y) : null; }
    return null;
  }
  let inset = { left: 0, bottom: 0 };
  function applyInset() {
    const W = stage.clientWidth, H = stage.clientHeight;
    if (W && H && (inset.left > 0 || inset.bottom > 0)) camera.setViewOffset(W, H, -inset.left * W / 2, inset.bottom * H / 2, W, H); else camera.clearViewOffset();
    camera.updateProjectionMatrix(); invalidate();
  }
  let shotSet = null, extraAvoid = null;
  labels.setAvoid(() => [panel.el.hud, panel.el.dock].filter((e) => e && !e.hidden).map((e) => e.getBoundingClientRect()).concat(extraAvoid ? extraAvoid() : []));   // the HUD and the control dock are never covered either
  function setShotLabels(list) {
    labels.clear('shot'); shotSet = null;
    if (!Array.isArray(list)) return;
    shotSet = new Set();
    list.forEach((e, i) => {
      if (typeof e === 'string') shotSet.add(e === 'shuttle' ? 'shuttle:near' : e);
      else if (e && e.at) labels.add({ id: `shot:${i}`, kind: 'shot', text: e.text, color: e.color ?? ROLES.structure.hex, prio: e.prio ?? 1, getPos: () => new THREE.Vector3(e.at[0], e.at[2], -e.at[1]) });
    });
  }
  labels.setFilter((d) => {
    if (d.kind === 'path') return !d.reveal || d.reveal();
    if (rig.tour) return d.kind === 'shot' || (shotSet && (shotSet.has(d.kind) || shotSet.has(d.id) || (d.kind === 'zone' && shotSet.has('zones'))));
    if (d.kind === 'path') return !d.reveal || d.reveal();             // R26d V7: numbered markers of the 3D pallet path
    return d.kind === 'lift' || (d.kind === 'zone' && st.zones);
  });

  // ---------------------------------------------------------------- R26d V7: focus mode (actors stand out on realistic racks)
  // Team decision (2026-11-17): the racks keep the real blue steel and orange beams, so the focus is made by other means: the rack steel and the load dim to 40 %, the focused shuttle is drawn 1.25x with a yellow
  // outline (a lift gets an outline box), and every shuttle leaves a fading trail. spec = {kind: 'shuttle', s} | {kind: 'lift', i} | null.
  let focusSpec = null, pickMemo = null;
  function setFocus(spec, dim = 0.4) {
    focusSpec = spec || null;
    fleets.forEach((fl) => { fl.setFocus(spec && spec.kind === 'shuttle' ? spec.s : null); fl.setScale(spec && spec.kind === 'shuttle' ? 1.25 : 1); });
    liftApis.forEach((l, k) => { l.outline.visible = !!spec && spec.kind === 'lift' && spec.i === k; });
    world.setDim(spec ? dim : 1); invalidate();
  }
  // follow a shuttle or lift
  function followEntity(kind, i) {
    let get, label, dist;
    if (kind === 'shuttle') { const s = sim.shuttles[i]; if (!s) return; get = () => s.f.pos(s.u, s.v, s.z + 0.3).add(comp.secs[s.sec].grp.position);      // FIX (R13a): the follow point lacked the block origin (old cause: section frames carry no origin)
      label = `Following shuttle ${i + 1}, upper tiers hidden`; dist = 9; }   // FIX (R9a): one pooled fleet, a shuttle has no fixed tier (old text: "on tier N")
    else { const l = sim.lifts[i]; if (!l) return; get = () => l.f.pos(l.spec.u, l.spec.v, l.z + 1.2).add(comp.secs[l.sec].grp.position); label = `Following lift ${l.spec.id} (${l.group.toLowerCase()})`; dist = 18; }
    st.following = { kind, i }; panel.follow(label); panel.hideHint();
    setFocus(kind === 'shuttle' ? { kind, s: sim.shuttles[i] } : { kind, i });
    applyShell();
    rig.followTarget(get, dist); invalidate();
  }
  // click / tap picking
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; panel.hideHint(); });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || rig.tour) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
    if (moved > 6 || dt > 500) return;
    const rc = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    let hs = [];
    // FIX (R13a): the instance id was turned into a fleet index by block offsets (old cause: a fixed fleet per block); with block transfers the shuttle of instance i is `fleet.order[i]`
    for (const c of comp.secs) { c.fleet.pick.computeBoundingSphere(); const h = ray.intersectObject(c.fleet.pick, false).map((x) => { const sh = c.fleet.order[x.instanceId]; x.gid = sh ? sh.gid : -1; return x; }).filter((x) => x.gid >= 0); hs = hs.concat(h); }
    hs.sort((a, b) => a.distance - b.distance);
    const hl = ray.intersectObjects(liftApis.map((l) => l.group), true);
    const dS = hs.length ? hs[0].distance : Infinity, dL = hl.length ? hl[0].distance : Infinity;
    if (dS === Infinity && dL === Infinity) { const rk = rackInfo.pickAt(e); if (rk && e.pointerType === 'touch') { rackInfo.show(rk, e.clientX, e.clientY); return; } if (st.following) api.unfollow(); return; }
    if (dS <= dL) followEntity('shuttle', hs[0].gid);
    else { let o = hl[0].object; while (o && !o.userData.lift) o = o.parent; const idx = liftApis.indexOf(o && o.userData.lift); if (idx >= 0) followEntity('lift', idx); }
  });
  canvas.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); api.togglePlay(); }
    else if (e.key === '1') api.setView('orbit'); else if (e.key === '2') api.setView('plan'); else if (e.key === '3') api.setView('section');
    else if (e.key === 'Escape') { if (full) api.toggleFull(); else if (st.following) api.unfollow(); }
  });
  document.addEventListener('keydown', onDocKey);
  function onDocKey(e) { if (e.key === 'Escape' && full) api.toggleFull(); }
  document.addEventListener('apw:theme', onTheme);
  const themeMq = matchMedia('(prefers-color-scheme: dark)'); themeMq.addEventListener('change', onTheme);
  function onTheme() { if (!st.envName) { const n = autoEnv(); env.set(n); panel.setEnv(n); invalidate(); scheduleThumbs(); } }

  // ---------------------------------------------------------------- size, visibility
  function resize() {
    const w = Math.max(160, stage.clientWidth), hh = Math.max(160, stage.clientHeight);
    r.setPixelRatio(quality.pixelRatio); r.setSize(w, hh, false);
    camera.aspect = w / hh; camera.updateProjectionMatrix(); applyInset();
    if (st.view === 'plan' && !rig.goal) rig.setView('plan', { instant: true });
    invalidate();
  }
  const ro = new ResizeObserver(resize); ro.observe(stage);
  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) invalidate(); }, { threshold: 0.01 }); io.observe(stage);
  document.addEventListener('visibilitychange', invalidate);

  // ---------------------------------------------------------------- loop
  // FIX (R18e): frame times kept as a window of the last 1 s of rendered frames, not the last 60 frames (old cause: 60 frames is 1 s only at 60 fps; at 30 fps the "1 s average" was 2 s)
  const frameWin = []; let frameWinT = 0; let degradeT = 0, degraded = 0, shadowT = 0, hudT = 0, idleT = 0;
  function render() { framesRendered++; r.render(scene, camera); }
  function tick(now) { try { tickBody(now); } catch (e) { console.error('[scene] frame error', e); window.__sceneErr = e; } }
  function tickBody(now) {
    // FIX (R18e): dt is always the wall time since the previous tick (old cause: the first tick after start() used a fixed 16 ms step, lastT was 0); the 0.1 s cap stays (see the note in start())
    const wall = Math.min(2, Math.max(0, (now - lastT) / 1000));
    const dt = Math.min(0.1, wall); lastT = now;
    // FIX (R18e, A9-7 / A9-16): the camera tour clock gets the wall time (stall cap 2 s); only the physics / sim step keeps the 0.1 s cap. Old cause: the tour clock was capped too, so at 2 fps the 109 s guided demo ran about 25 times too slow
    if (!visible || document.hidden) { stop(); return; }
    let active = dirty; dirty = false;
    if (rig.update(dt, wall)) active = true;
    if (env.update(dt)) active = true;
    world.shell.update(dt); if (world.shell.changed) { active = true; world.shell.changed = false; if (quality.shadows) env.sun.shadow.needsUpdate = true; }
    if (st.playing) {
      sim.step(dt * st.speed); sim.sync(now / 1000); active = true;
      if (st.following) applyClip();     // FIX (R9a): the followed shuttle changes tier by lift, the slice must follow it
      shadowT += dt; if (shadowT > 1 && quality.shadows) { env.sun.shadow.needsUpdate = true; shadowT = 0; }
      if (env.name === 'lightsOut') followPools();
    }
    if (rig.tour) active = true;
    if (ioPath.update(dt)) active = true;
    hudT += dt; if (hudT > 0.25) { hudT = 0; panel.hud(sim.stats(), modelNums); updateLOD(); }
    if (active) {
      render(); idleT = 0; labels.update(now);
      frameWin.push(dt); frameWinT += dt;
      while (frameWinT > 1 && frameWin.length > 1) frameWinT -= frameWin.shift();   // FIX (R18e): keep 1 s of frames (time, not count)
      adapt(dt);
    } else { idleT += dt; if (idleT > 0.5) stop(); }
  }
  // R26d V7: rack level of detail by distance (see world.setLOD); a 10 m margin keeps the level from flickering at a threshold; a large design (> 9,000 positions) never uses level 0
  function updateLOD() {
    const d = camera.position.distanceTo(rig.center) - 0.3 * Math.hypot(sc.building.L, sc.building.W), cur = world.lod;
    let lv = d > (cur >= 2 ? 140 : 160) ? 2 : d > (cur >= 1 ? 55 : 70) ? 1 : 0;
    if (world.positions > 9000) lv = Math.max(lv, d > 90 ? 2 : 1);
    if (lv !== cur) { world.setLOD(lv); invalidate(); }
  }
  const pa = new THREE.Vector3(), pb = new THREE.Vector3();
  function followPools() {
    const busy = sim.shuttles.filter((s) => s.actor.busy && s.status === 'ok');
    const s = (st.following && st.following.kind === 'shuttle' && sim.shuttles[st.following.i]) || busy[0] || sim.shuttles[0];
    const l = sim.lifts.find((x) => x.actor.busy) || sim.lifts[0];
    s.f.pos(s.u, s.v, s.z, pa); l.f.pos(l.spec.u, l.spec.v, l.z, pb);
    env.followPools(pa, pb);
  }
  function adapt(dt) {                                  // scene_spec section 5: degrade in order if the 1 s average stays below 48 fps for 2 s
    if (!st.playing || degraded >= 4) return;
    if (frameWinT < 0.5) return;                       // FIX (R18e): needs 0.5 s of frames (old: 30 frames, which is 0.5 s only at 60 fps)
    const avg = frameWinT / frameWin.length;
    if (1 / avg < BUDGET.adaptive.degradeBelowFps) degradeT += dt; else degradeT = 0;
    if (degradeT > 2) {
      degradeT = 0; degraded++;
      const step = BUDGET.adaptive.steps[degraded - 1];
      if (step === 'shadowOff') { quality.shadows = false; r.shadowMap.enabled = false; env.sun.castShadow = false; scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); }); }
      else if (step === 'pixelRatio1') { quality.pixelRatio = 1; resize(); }
      console.info('[scene] adaptive degrade:', step, 'avg fps', (1 / avg).toFixed(0));
    }
  }
  // FIX (R18e): the loop clock starts at start(), so the first tick measures real time (old cause: lastT = 0 made the first tick a fixed 16 ms step).
  // Note: dt is capped at 0.1 s per tick, so below 10 fps the sim clock runs slower than wall time (deliberate: no jumps after a stall); the camera tour clock uses wall time (R18e).
  function start() { if (running) return; running = true; lastT = performance.now(); r.setAnimationLoop(tick); }
  function stop() { if (!running) return; running = false; r.setAnimationLoop(null); }

  function benchmark(seconds) {                          // measured frames of the live loop (play on, orbit steady); resolves with fps and counters
    return new Promise((res) => {
      const was = st.playing; if (!was) api.play();
      const ts = []; const calls = [], tris = [];
      let last = performance.now(); const t0b = last;
      function f2(now) {
        ts.push(now - last); last = now; calls.push(r.info.render.calls); tris.push(r.info.render.triangles);
        if (now - t0b < seconds * 1000) requestAnimationFrame(f2);
        else {
          if (!was) api.pause();
          const sorted = [...ts.slice(5)].sort((a, b) => a - b), avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
          res({ fps: +(1000 / avg).toFixed(1), msAvg: +avg.toFixed(2), msP95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2), frames: sorted.length, drawCalls: Math.max(...calls), triangles: Math.max(...tris),
            geometries: r.info.memory.geometries, textures: r.info.memory.textures, positions: world.positions, buildMs: +buildMs.toFixed(0), pixelRatio: quality.pixelRatio });
        }
      }
      requestAnimationFrame(f2); invalidate();
    });
  }

  // R26d V7: preview pictures of the six camera presets: one small render per preset (192 x 108 on the live canvas, then the size is restored), made once after the scene has settled and again after a lighting change,
  // in an idle moment and never while the model runs (the 3D view only mounts with a finished report). The poses are set from the building size, independent of the presets' own camera moves.
  let thumbT = 0;
  function makeThumbs() {
    if (!framesRendered || degraded >= 4) return;
    const Bq = sc.building, cx = Bq.L / 2, cy = Bq.W / 2, dg = Math.hypot(Bq.L, Bq.W), d = world.docks.in || world.docks.out, l0 = sim.lifts[0];
    const lp = l0 ? l0.f.pos(l0.spec.u, l0.spec.v, 8).add(secOff(l0.sec)) : new THREE.Vector3(cx, 8, -cy);
    const T = (x, y, z) => new THREE.Vector3(x, z, -y);
    const poses = {
      orbit: [T(cx - dg * 0.5, cy - dg * 0.85, Bq.H * 1.75), T(cx, cy, Bq.H * 0.25), 38],
      plan: [T(cx, cy - 0.01, dg * 1.05), T(cx, cy, 0), 32],
      section: [T(cx, cy - dg * 1.05, Bq.H * 0.6), T(cx, cy, Bq.H * 0.45), 32],
      lift: [lp.clone().add(new THREE.Vector3(8, 1, 9)), lp.clone().setY(lp.y - 2), 42],
      docks: d ? [T(d.x - d.nx * dg * 0.7 - d.ny * dg * 0.5, d.y - d.ny * dg * 0.7 + d.nx * dg * 0.5, Bq.H * 1.7), T(d.x + d.nx * dg * 0.35, d.y + d.ny * dg * 0.35, 3), 42] : null,
      tiers: [T(cx - dg * 0.45, cy - dg * 0.8, Bq.H * 0.9), T(cx, cy, Bq.H * 0.45), 36],
    };
    const prevPR = r.getPixelRatio(), sz = r.getSize(new THREE.Vector2()), cam = new THREE.PerspectiveCamera(38, 16 / 9, 0.3, 1800), out = {};
    const clip = r.clippingPlanes; r.clippingPlanes = [];
    r.setPixelRatio(1); r.setSize(192, 108, false);
    for (const [id, p] of Object.entries(poses)) { if (!p) continue; cam.position.copy(p[0]); cam.fov = p[2]; cam.updateProjectionMatrix(); cam.lookAt(p[1]); r.render(scene, cam); out[id] = canvas.toDataURL('image/jpeg', 0.72); }
    r.setPixelRatio(prevPR); r.setSize(sz.x, sz.y, false); r.clippingPlanes = clip;
    panel.setThumbs(out); invalidate();
  }
  function scheduleThumbs(ms = 2800) {
    clearTimeout(thumbT);
    thumbT = setTimeout(() => { const run = () => { try { makeThumbs(); } catch (e) { console.warn('[scene] thumbnails failed', e); } }; (window.requestIdleCallback || ((fn) => setTimeout(fn, 50)))(run, { timeout: 2000 }); }, ms);
  }
  api.thumbs = makeThumbs;
  // first frame
  scheduleThumbs();
  resize();
  rig.setView(st.view, { instant: true });
  applyShell();
  if (st.view !== 'orbit') api.setView(st.view);
  globalThis.APW = Object.assign(globalThis.APW || {}, { scene: api });
  document.dispatchEvent(new CustomEvent('apw:scene', { detail: { api, report: rep } }));
  start();

  function dispose() {
    stop(); clearTimeout(thumbT); ro.disconnect(); io.disconnect();
    document.removeEventListener('keydown', onDocKey); document.removeEventListener('apw:theme', onTheme); document.removeEventListener('visibilitychange', invalidate); themeMq.removeEventListener('change', onTheme);
    document.documentElement.classList.remove('sc-lock');
    if (rig.tour) rig.stopTour();
    labels.dispose(); ioPath.dispose(); rackInfo.dispose(); tierGauge.dispose(); comp.dispose();
    rig.dispose(); panel.dispose(); env.dispose();
    r.clippingPlanes = [];
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    disposeTree(scene);
    world.aoTextures.forEach((t) => t.dispose());
    if (globalThis.APW && globalThis.APW.scene === api) globalThis.APW.scene = null;
  }
  return { api, dispose };
}
