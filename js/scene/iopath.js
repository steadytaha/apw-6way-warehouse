// I/O path playback (R9b): a highlighted pallet travels dock -> conveyor -> bay -> lift deck -> tier -> shuttle -> lane (IN) or the reverse (OUT) with the stage times of report.io_path.
// The tracer is a marker on the carriers' own geometry (conveyor line, lift mast, aisle, lane); a label names the stage and shows the model seconds. It does not change the animation.
import { THREE } from './kit.js';

// R26d V7: the route is drawn as a 3D polyline (one tube per stage, four phase colours, numbered markers 1 to 9 that appear in step with the ghost pallet).
// Phases as in the story chart (chapters.js PHASE): Truck and dock, Conveyor and bay, Lift, Shuttle and lane (brighter variants of the ROLES for the 3D view).
const PHASE_OF = { forklift: 0, truck: 0, dock: 0, conveyor: 1, bay: 1, lift: 2, shuttle: 3 };
const PHASE_COLOR = (flow) => [0xb8c4d0, flow === 'OUT' ? 0x5a9bff : 0x2fd6a8, 0xa585ee, 0xffa83a];
const STAGE_COLOR = { forklift: 0xe0b020, conveyor: 0x1f8a70, bay: 0x6f7fdc, lift: 0xd9621f, shuttle: 0x2f5fb3 };

function labelTex() {
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 112;
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return { cv, t, g: cv.getContext('2d') };
}

export function createIOPath(rep, comp, host) {
  const io = rep.io_path;
  const world = comp.world, tz = world.tz;
  const grp = new THREE.Group(); grp.name = 'io path'; grp.visible = false; comp.world.root.add(grp);
  const marker = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.9, 0.85), new THREE.MeshBasicMaterial({ color: 0xffd23f, toneMapped: false }));
  const halo = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.25, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false }));
  const lt = labelTex();
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: lt.t, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
  sprite.scale.set(10, 1.75, 1); sprite.renderOrder = 40;
  const trailGeo = new THREE.BufferGeometry(); const trailPos = new THREE.BufferAttribute(new Float32Array(161 * 3), 3); trailPos.setUsage(THREE.DynamicDrawUsage); trailGeo.setAttribute('position', trailPos); trailGeo.setDrawRange(0, 0);
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, toneMapped: false, depthTest: false }));
  trail.renderOrder = 39; trail.frustumCulled = false;
  grp.add(marker, halo, sprite, trail);
  const pathGrp = new THREE.Group(); pathGrp.name = 'io polyline'; grp.add(pathGrp);
  const pathMats = [], pathSegs = [];
  function clearPath() { for (const o of [...pathGrp.children]) { pathGrp.remove(o); o.geometry && o.geometry.dispose(); } pathMats.forEach((m) => m.dispose()); pathMats.length = 0; pathSegs.length = 0; host.pathLabels && host.pathLabels(null); }
  function buildPath(r) {
    clearPath();
    const cols = PHASE_COLOR(r.flow), defs = [];
    r.stages.forEach((s, k) => {
      const col = cols[PHASE_OF[s.resource] ?? 3], a = v3(s.a), b = v3(s.b);
      const mat = new THREE.MeshBasicMaterial({ color: col, toneMapped: false, depthTest: false, transparent: true, opacity: 0.95 }); pathMats.push(mat);
      const len = a.distanceTo(b), seg = new THREE.Group(); seg.visible = false; seg.renderOrder = 38;
      if (len > 0.05) { const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, len, 8), mat); tube.position.copy(a).add(b).multiplyScalar(0.5); tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); tube.renderOrder = 38; seg.add(tube); }
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), mat); dot.position.copy(a); dot.renderOrder = 38; seg.add(dot);
      pathGrp.add(seg); pathSegs.push(seg);
      defs.push({ id: `path:${k}`, kind: 'path', text: String(k + 1), color: col, prio: 0.5, reveal: () => state.stage >= k, getPos: () => new THREE.Vector3(a.x, a.y + 0.8, a.z) });
    });
    host.pathLabels && host.pathLabels(defs);
  }
  const state = { running: false, mode: null, t: 0, route: null, stage: -1, done: null, follow: false };

  function route(mode) {
    const flow = mode === 'out' ? 'OUT' : 'IN', key = flow.toLowerCase();
    const c = comp.secs.find((x) => x.sim.trucks[key]) || comp.secs[0];
    const w = c.w, f = w.f, ox = c.s.origin.x, oy = c.s.origin.y;
    const dk = w.docks[key]; if (!dk) return null;
    const dockPos = [ox + dk.x, oy + dk.y], out = [dockPos[0] + dk.nx * 3.5, dockPos[1] + dk.ny * 3.5];
    const bay = (comp.zones.bays.find((b) => b.d.flow === flow && Math.hypot(b.d.x - dockPos[0], b.d.y - dockPos[1]) < 12) || comp.zones.bays.find((b) => b.d.flow === flow));
    const bayPos = bay ? [bay.d.rect.x + bay.d.rect.w / 2, bay.d.rect.y + bay.d.rect.h / 2] : dockPos;
    const lift = c.sim.lifts.find((l) => (flow === 'IN' ? l.group === 'IN' : l.group !== 'IN')) || c.sim.lifts[0];
    const lw = [f.wx(lift.spec.u, lift.spec.v) + ox, f.wy(lift.spec.u, lift.spec.v) + oy];
    const tier = Math.min(world.tiers - 1, 1), zc = w.convZ || 0.6;
    const lanes = w.lanes.filter((l) => l.tier === tier), ln = lanes.reduce((a, l) => { const p = f.pos(l.u, l.vNear, 0); const d = Math.hypot(p.x - (lw[0] - ox), -p.z - (lw[1] - oy)) + 0; return !a || d < a.d ? { l, d } : a; }, null).l;
    const lanePos = f.pos(ln.u, ln.vNear + ln.dir * 0.5 * ln.pitch, 0); const laneW = [lanePos.x + ox, -lanePos.z + oy];
    const P = {
      truck: [out[0], out[1], 1.3], dock: [dockPos[0], dockPos[1], zc], bay: [bayPos[0], bayPos[1], zc], 'lift deck (ground)': [lw[0], lw[1], zc], tier: [lw[0], lw[1], tz[tier] + w.ZR],
      'lift deck (tier)': [lw[0], lw[1], tz[tier] + w.ZR], shuttle: [lw[0] + 0.0, lw[1] + 0.0, tz[tier] + w.ZR + 0.15], lane: [laneW[0], laneW[1], tz[tier] + w.ZR],
    };
    // FIX (R18e): the OUT stages name 'lift (tier)' and 'bay conveyor' (scene report io_path.OUT); both were unmapped and drawn at the dock (old cause: `at()` fell back to P.dock).
    // 'lift (tier)' is the lift deck at tier level, 'bay conveyor' ends at the bay. An unknown endpoint now throws instead of using the dock point.
    P['lift (tier)'] = P['lift deck (tier)'];
    P['bay conveyor'] = P.bay;
    const at = (name) => {
      const p = P[name] || P[name.replace(/ \(.*\)/, '')];
      if (!p) throw new Error(`io_path: no position for stage endpoint "${name}" (${flow} path)`);
      return p;
    };
    const stages = io[flow].stages.map((s) => ({ ...s, a: at(s.from), b: at(s.to) }));
    const total = stages.reduce((a, s) => a + Math.max(0.5, s.time_s), 0);
    return { flow, stages, total, model: io[flow].total_s, tier };
  }

  function setLabel(txt, sub, col) {
    const g = lt.g; g.clearRect(0, 0, 640, 112);
    g.fillStyle = 'rgba(14,18,24,0.88)'; g.beginPath(); g.roundRect(4, 4, 632, 104, 22); g.fill();
    g.fillStyle = '#' + new THREE.Color(col).getHexString(); g.fillRect(4, 4, 12, 104);
    g.fillStyle = '#f4f6f8'; g.font = '600 34px system-ui, Segoe UI, sans-serif'; g.textBaseline = 'middle'; g.fillText(txt, 34, 38);
    g.fillStyle = '#aab4be'; g.font = '500 27px system-ui, Segoe UI, sans-serif'; g.fillText(sub, 34, 80);
    lt.t.needsUpdate = true;
  }
  const v3 = (p) => new THREE.Vector3(p[0], p[2], -p[1]);
  const pts = [];
  function place(p, stage, k) {
    marker.position.copy(v3(p)); marker.position.y += 0.45; halo.position.copy(v3(p)); halo.position.y = Math.max(0.05, p[2] - 0.1);
    sprite.position.copy(v3(p)); sprite.position.y += 3.2;
  }
  const api = {
    get running() { return state.running; }, get info() { return state.route && { flow: state.route.flow, stage: state.stage, stages: state.route.stages.map((s) => ({ id: s.id, label: s.label, time_s: s.time_s })), total_s: state.route.model }; },
    play(mode, opts = {}) {
      api.stop();
      if (!mode || !io) return null;
      const r = route(String(mode).toLowerCase()); if (!r) return null;
      state.route = r; state.t = 0; state.stage = -1; state.running = true; state.mode = mode; state.follow = !!opts.follow; state.span = opts.seconds || 16;
      buildPath(r); pts.length = 0; grp.visible = true; trailGeo.setDrawRange(0, 0);
      if (state.follow && host.followTarget) host.followTarget(() => marker.position.clone(), 24);
      host.invalidate(); return new Promise((res) => { state.done = res; });
    },
    stop() { if (!state.running && !grp.visible) return; state.running = false; grp.visible = false; clearPath(); if (state.done) { state.done(false); state.done = null; } host.invalidate(); },
    update(dt) {
      if (!state.running) return false;
      const r = state.route, k = r.total / state.span;               // model seconds per wall second
      state.t += dt * k;
      let acc = 0, i = 0;
      for (; i < r.stages.length; i++) { const d = Math.max(0.5, r.stages[i].time_s); if (state.t < acc + d) break; acc += d; }
      if (i >= r.stages.length) { state.running = false; if (state.done) { state.done(true); state.done = null; } setTimeout(() => { if (!state.running) { grp.visible = false; clearPath(); host.invalidate(); } }, 1500); return true; }
      const s = r.stages[i], d = Math.max(0.5, s.time_s), e = (state.t - acc) / d;
      const sm = e * e * (3 - 2 * e);
      const p = [0, 1, 2].map((j) => s.a[j] + (s.b[j] - s.a[j]) * sm);
      if (i !== state.stage) {
        state.stage = i; pathSegs.forEach((sg, q) => { sg.visible = q <= i; }); setLabel(`${i + 1}/${r.stages.length}  ${s.label}`, `${s.resource} · ${s.time_s.toFixed(1)} s (model)`, STAGE_COLOR[s.resource] || 0xffd23f);
        host.onStage && host.onStage({ flow: r.flow, index: i, stage: s });
      }
      place(p, i);
      pts.push(v3(p)); if (pts.length > 160) pts.shift(); pts.forEach((q, j) => trailPos.setXYZ(j, q.x, q.y, q.z)); trailPos.needsUpdate = true; trailGeo.setDrawRange(0, pts.length);
      return true;
    },
    dispose() { clearPath(); grp.parent && grp.parent.remove(grp); lt.t.dispose(); marker.geometry.dispose(); marker.material.dispose(); halo.geometry.dispose(); halo.material.dispose(); sprite.material.dispose(); trail.geometry.dispose(); trail.material.dispose(); },
  };
  return api;
}
