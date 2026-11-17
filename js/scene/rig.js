// Camera rig (B4): orbit / plan / section / follow views with critically damped springs (SPRINGS in tokens.js), interruptible by the user,
// and a tour player for B5: scene.tour(shots). Model coordinates in shots: x east, y north, z up (metres); converted to three.js here.
import { THREE, clamp } from './kit.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SPRINGS } from '../../design/tokens.js';

const toThree = (a) => new THREE.Vector3(a[0], a[2], -a[1]);
const omega = (name) => 2 * Math.PI / SPRINGS[name].response;
const ease = (x) => { x = clamp(x, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); };     // smootherstep: used for dollies of a few seconds

/** exact step of a critically damped spring on one number */
function spring1(x, v, g, w, dt) { const dx = x - g, c = v + w * dx, e = Math.exp(-w * dt); return [g + (dx + c * dt) * e, (v - c * w * dt) * e]; }

export function createRig(camera, dom, world, { reduced = false, onChange = () => {} } = {}) {
  const B = world.sc.building, f = world.f;
  const diag = Math.hypot(B.L, B.W, B.H);
  const center = new THREE.Vector3(B.L / 2, B.H * 0.32, -B.W / 2);
  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true; controls.dampingFactor = 0.09;
  controls.minDistance = 3; controls.maxDistance = diag * 3.2; controls.maxPolarAngle = Math.PI * 0.495;
  controls.zoomToCursor = false; controls.screenSpacePanning = true;
  controls.target.copy(center);
  controls.listenToKeyEvents(dom);
  const rig = { camera, controls, mode: 'orbit', center, diag, goal: null, vel: null, follow: null, tour: null, reduced, clip: new THREE.Plane(new THREE.Vector3(1, 0, 0), 0), saved: null };
  const pose = () => ({ pos: camera.position.clone(), tgt: controls.target.clone(), fov: camera.fov });
  const vel = { p: new THREE.Vector3(), t: new THREE.Vector3(), fov: 0 };

  // FIX (R9b): the default pose assumed a rectangle starting at the origin (old cause: B.L / B.W only); it now fits the bounding sphere of the footprint rectangles of any shape
  // (L, U, T, union) to the view for the current aspect, so frameShape() and the first frame see the whole building.
  const fitBox = () => {
    const rects = (world.info && world.info.rects) || [[0, 0, B.L, B.W]];
    const x0 = Math.min(...rects.map((r) => r[0])), y0 = Math.min(...rects.map((r) => r[1])), x1 = Math.max(...rects.map((r) => r[0] + r[2])), y1 = Math.max(...rects.map((r) => r[1] + r[3]));
    return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
  };
  rig.defaultPose = () => {
    const bx = fitBox(), asp = camera.aspect || 1.6, fov = 38, vf = THREE.MathUtils.degToRad(fov), hf = 2 * Math.atan(Math.tan(vf / 2) * asp);
    const rad = 0.5 * Math.hypot(bx.w, bx.h, B.H * 0.9), dist = (rad / Math.sin(Math.min(vf, hf) / 2)) * 1.3;      // R24 V6: was 1.04 (the building filled 93 % of the stage width, under the controls); now about 70 %
    const c = new THREE.Vector3(bx.cx, B.H * 0.32, -bx.cy); center.copy(c);
    const d = new THREE.Vector3(-0.5, 0.62, 0.95).normalize().multiplyScalar(dist);
    return { pos: c.clone().add(d), tgt: c, fov };
  };
  /** frames the whole footprint (any shape) from the default three-quarter view */
  rig.frameShape = () => { if (rig.tour) rig.stopTour(); if (rig.mode !== 'orbit') rig.setView('orbit'); else rig.animateTo(rig.defaultPose(), 'smooth'); };
  /** R24 V6: fly (or cut, with reduced motion) to a pose given in model metres {pos, target, fov} from the orbit mode (camera presets) */
  rig.goToModel = (p) => { if (rig.tour) rig.stopTour(); if (rig.mode !== 'orbit') rig.setView('orbit', { instant: true }); rig.mode = 'orbit'; return rig.animateTo({ pos: toThree(p.pos), tgt: toThree(p.target), fov: p.fov || 38 }, 'gentle'); };
  rig.planPose = () => {
    const asp = camera.aspect || 1.6, fov = 28;
    const bx = fitBox();
    const h = Math.max(bx.h * 1.12, (bx.w * 1.12) / asp), d = h / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)));
    const t = new THREE.Vector3(bx.cx, 0, -bx.cy);
    return { pos: new THREE.Vector3(t.x, d, t.z + d * 0.0015), tgt: t, fov };
  };
  // section: a plane across the lane columns through the middle of the rack; looks along +u at the cut face
  rig.sectionPose = () => {
    const c = world.sc.columns, uCut = c.start + c.length * 0.45;
    const vMid = (Math.min(...world.blocks.map((b) => b.v0)) + Math.max(...world.blocks.map((b) => b.v1))) / 2;
    const vSpan = Math.max(...world.blocks.map((b) => b.v1)) - Math.min(...world.blocks.map((b) => b.v0));
    const dirU = f.dir(1, 0, new THREE.Vector3());
    rig.clip.set(dirU.clone(), -dirU.dot(f.pos(uCut, vMid, 0)));          // keeps the side the camera looks at
    const asp = camera.aspect || 1.6, fov = 24;
    const h = Math.max(B.H * 1.45, (vSpan * 1.5) / asp), d = h / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)));      // R24 V6: margins 1.15 -> 1.45 / 1.5 (the section filled the stage under the preset toolbar)
    const t = f.pos(uCut, vMid, B.H * 0.5);
    return { pos: t.clone().addScaledVector(dirU, -d), tgt: t, fov };
  };

  // ---- spring motion towards a goal pose; the user can take over at any time
  rig.animateTo = (g, spr = 'smooth') => new Promise((resolve) => {
    if (rig.reduced || g.instant) { apply(g); resolve(); return; }
    rig.goal = { ...g, spr, resolve };
    vel.p.set(0, 0, 0); vel.t.set(0, 0, 0); vel.fov = 0;
    onChange();
  });
  function apply(g) {
    camera.position.copy(g.pos); controls.target.copy(g.tgt);
    if (g.fov) { camera.fov = g.fov; camera.updateProjectionMatrix(); }
    controls.update(); onChange();
  }
  controls.addEventListener('start', () => {
    if (rig.tour) return;
    if (rig.goal) { const r = rig.goal.resolve; rig.goal = null; r && r(); }
    if (rig.follow && rig.followLocked) { /* the user orbits around the followed object: keep following */ }
  });
  controls.addEventListener('change', () => onChange());

  rig.setView = (mode, { instant = false } = {}) => {
    if (rig.tour) rig.stopTour();
    const prev = rig.mode;
    if (prev === 'orbit' || prev === 'follow') rig.saved = pose();
    rig.mode = mode; rig.follow = null;
    controls.enableRotate = mode !== 'plan' && mode !== 'section';
    controls.maxPolarAngle = mode === 'orbit' || mode === 'follow' ? Math.PI * 0.495 : Math.PI;
    controls.minPolarAngle = mode === 'plan' ? 0 : 0;
    controls.screenSpacePanning = true;
    let g;
    if (mode === 'orbit') g = rig.saved && rig.saved.pos.distanceTo(center) < diag * 4 && prev !== 'orbit' ? rig.saved : rig.defaultPose();
    else if (mode === 'plan') g = rig.planPose();
    else g = rig.sectionPose();
    return rig.animateTo({ ...g, instant }, 'smooth');
  };
  /** follow a moving thing: getPos() returns its three.js position; dist = camera distance */
  rig.followTarget = (getPos, dist = 16) => {
    if (rig.tour) rig.stopTour();
    if (rig.mode === 'orbit') rig.saved = pose();
    rig.mode = 'follow'; controls.enableRotate = true; controls.maxPolarAngle = Math.PI * 0.495;
    rig.follow = { get: getPos, dist, last: getPos().clone(), arriving: true };
    const p = getPos(), dir = camera.position.clone().sub(controls.target).setY(0).normalize();
    if (dir.lengthSq() < 0.1) dir.set(0.5, 0, 0.9).normalize();
    return rig.animateTo({ pos: p.clone().addScaledVector(dir, dist * 0.55).setY(p.y + dist * 0.9), tgt: p.clone(), fov: 38, track: true }, 'smooth');
  };

  // ---- tour
  rig.playTour = (shots, host, { loop = false } = {}) => {
    if (rig.tour) rig.stopTour();
    const T = { shots, i: -1, t: 0, paused: false, host, loop, listeners: new Set(), done: null, cut: 0 };
    const p = new Promise((res) => { T.done = res; });
    rig.tour = T; rig.mode = 'tour'; controls.enabled = false; rig.follow = null;
    const startShot = (i) => {
      T.i = i; T.t = 0; const s = shots[i];
      // FIX (R9b): cutDone was reset to false AFTER host.cut() had called back (with reduced motion the callback runs synchronously and set it true first), so the tour never
      // left the first shot; the flag is now cleared before the call.
      T.cutDone = false;
      host.cut(s, () => {                                    // after the 450 ms crossfade of the cut
        if (s.env) host.setEnv(s.env);
        if (s.shell) host.setShell(s.shell);
        if (s.speed) host.setSpeed(s.speed);
        if (s.onEnter) s.onEnter(host);
        T.cutDone = true;
      });
      T.listeners.forEach((fn) => fn({ type: 'shot', index: i, shot: s }));
    };
    T.next = () => { if (T.i + 1 < shots.length) startShot(T.i + 1); else if (T.loop) startShot(0); else rig.stopTour(true); };
    T.prev = () => startShot(Math.max(0, T.i - 1));
    T.on = (fn) => { T.listeners.add(fn); return () => T.listeners.delete(fn); };
    T.pause = () => { T.paused = true; }; T.resume = () => { T.paused = false; };
    T.promise = p;
    startShot(0);
    return T;
  };
  rig.stopTour = (finished = false) => {
    const T = rig.tour; if (!T) return;
    rig.tour = null; rig.mode = 'orbit'; controls.enabled = true;
    controls.target.copy(controls.target); controls.update();
    T.listeners.forEach((fn) => fn({ type: finished ? 'end' : 'stop' })); if (T.done) T.done(finished);
  };
  function tourPose(s, e) {
    const from = s.from || s.to, to = s.to || s.from;
    const a = { pos: toThree(from.pos), tgt: toThree(from.target), fov: from.fov || 38 }, b = { pos: toThree(to.pos), tgt: toThree(to.target), fov: to.fov || a.fov };
    if (rig.reduced) return b;
    const out = { pos: a.pos.clone().lerp(b.pos, e), tgt: a.tgt.clone().lerp(b.tgt, e), fov: a.fov + (b.fov - a.fov) * e };
    if (s.orbit) {
      const ang = THREE.MathUtils.degToRad(s.orbit) * e, off = out.pos.clone().sub(out.tgt);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), ang); out.pos.copy(out.tgt).add(off);
    }
    if (s.follow) { const p = s.follow(); out.tgt.copy(p); out.pos.copy(p).add(new THREE.Vector3(0.6, 0.45, 0.9).normalize().multiplyScalar(s.followDist || 14)); }
    return out;
  }

  rig.update = (dt, wall) => {
    let moving = false;
    const T = rig.tour;
    if (T) {
      const s = T.shots[T.i];
      if (!T.paused && T.cutDone) T.t += (wall != null ? wall : dt);        // FIX (R18e, A9-7): tour clock in wall time (old cause: the capped sim dt)
      const e = ease(T.t / s.dur);
      const g = tourPose(s, e);
      camera.position.copy(g.pos); controls.target.copy(g.tgt); camera.lookAt(g.tgt);
      if (Math.abs(camera.fov - g.fov) > 1e-3) { camera.fov = g.fov; camera.updateProjectionMatrix(); }
      if (T.t >= s.dur && !T.paused) T.next();
      return true;
    }
    if (rig.goal) {
      const g = rig.goal, w = omega(g.spr);
      if (g.track && rig.follow) { const p = rig.follow.get(); g.tgt = p.clone(); const dir = g.pos.clone().sub(rig.follow.last).setY(0).normalize(); void dir; g.pos = g.pos.clone().add(p.clone().sub(rig.follow.last)); rig.follow.last.copy(p); }
      const sp = (cur, v, goal) => { const o = []; for (const k of ['x', 'y', 'z']) { const [x, vv] = spring1(cur[k], v[k], goal[k], w, dt); cur[k] = x; v[k] = vv; o.push(x); } };
      sp(camera.position, vel.p, g.pos); sp(controls.target, vel.t, g.tgt);
      if (g.fov) { const [x, v] = spring1(camera.fov, vel.fov, g.fov, w, dt); camera.fov = x; vel.fov = v; camera.updateProjectionMatrix(); }
      camera.lookAt(controls.target);
      const near = camera.position.distanceTo(g.pos) < 0.05 && controls.target.distanceTo(g.tgt) < 0.05 && vel.p.lengthSq() < 1e-4 && (!g.fov || Math.abs(camera.fov - g.fov) < 0.05);
      if (near) { camera.position.copy(g.pos); controls.target.copy(g.tgt); if (g.fov) { camera.fov = g.fov; camera.updateProjectionMatrix(); } const r = g.resolve; rig.goal = null; if (rig.follow) rig.follow.arriving = false; if (r) r(); }
      moving = true;
    } else if (rig.follow) {
      const p = rig.follow.get(), d = p.clone().sub(rig.follow.last);
      const k = 1 - Math.exp(-dt * 8);
      const step = d.multiplyScalar(1);                        // keep the view offset: move camera and target with the object
      camera.position.add(step); controls.target.add(step); rig.follow.last.copy(p); void k;
      moving = true;
    }
    if (controls.update()) moving = true;
    return moving;
  };
  rig.dispose = () => { controls.dispose(); };
  return rig;
}
