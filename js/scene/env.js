// Lighting rig and environment presets (B4): day / studio (R26d V7, replaces dusk) / lightsOut from tokens.js ENVIRONMENTS. One sun with one shadow map, hemisphere + ambient,
// a small procedural sky for image-based light, up to two pool lights in lightsOut, emissive luminaires (no real light per luminaire), FogExp2.
import { THREE, clamp } from './kit.js';
import { ENVIRONMENTS } from '../../design/tokens.js';

const ENV_INTENSITY = { day: 0.6, studio: 0.45, lightsOut: 0.34 };      // procedural sky intensity (spec: 0.6 in the day)
const STRIP_BASE = 3.0;                                              // lightStrip emissiveIntensity at dim level 1 (tokens.js)

let skyRT = null;
function skyTexture(renderer) {
  const sc = new THREE.Scene();
  const geo = new THREE.SphereGeometry(50, 24, 12);
  const n = geo.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const y = geo.attributes.position.getY(i) / 50;               // -1 .. 1
    if (y > 0) c.setRGB(0.72, 0.8, 0.9).lerp(new THREE.Color(0.35, 0.5, 0.8), Math.pow(y, 0.6)); else c.setRGB(0.55, 0.53, 0.48).lerp(new THREE.Color(0.25, 0.25, 0.25), -y);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  sc.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const panel = new THREE.MeshBasicMaterial({ color: 0xffffff }); panel.color.multiplyScalar(6);
  for (const [x, y, z] of [[-18, 30, 12], [20, 26, -14]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(14, 1, 9), panel); m.position.set(x, y, z); m.lookAt(0, 0, 0); sc.add(m); }
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(sc, 0.04, 0.1, 100);
  pm.dispose(); geo.dispose();
  skyRT = rt;
  return rt.texture;
}

export function createEnv(renderer, scene, world, { shadows = true, shadowSize = 2048 } = {}) {
  const B = world.sc.building;
  const diag = Math.hypot(B.L, B.W);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
  const amb = new THREE.AmbientLight(0xffffff, 0.3);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  const target = new THREE.Object3D(); target.position.set(B.L / 2, B.H * 0.3, -B.W / 2); sun.target = target;
  const rad = diag / 2 + 10;
  sun.castShadow = shadows;
  if (shadows) {
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    const c = sun.shadow.camera; c.left = -rad; c.right = rad; c.top = rad; c.bottom = -rad; c.near = 1; c.far = 600; c.updateProjectionMatrix();
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06;
    sun.shadow.autoUpdate = false; sun.shadow.needsUpdate = true;
  }
  const pools = [0, 1].map(() => { const p = new THREE.PointLight(0xdfeaff, 0, 7, 2); p.visible = false; return p; });
  scene.add(hemi, amb, sun, target, ...pools);
  const sky = skyTexture(renderer);
  scene.environment = sky;
  scene.fog = new THREE.FogExp2(0xdfe6ec, 0.0035);
  scene.background = new THREE.Color(0xdfe6ec);

  const cur = { bg: new THREE.Color(), fog: new THREE.Color(), fogD: 0, sky: new THREE.Color(), gnd: new THREE.Color(), hemiI: 1, sunC: new THREE.Color(), sunI: 1, sunP: new THREE.Vector3(), exp: 1, strips: 1, amb: 0.3, envI: 0.6, pool: 0, studio: 0 };
  const goal = { bg: new THREE.Color(), fog: new THREE.Color(), fogD: 0, sky: new THREE.Color(), gnd: new THREE.Color(), hemiI: 1, sunC: new THREE.Color(), sunI: 1, sunP: new THREE.Vector3(), exp: 1, strips: 1, amb: 0.3, envI: 0.6, pool: 0, studio: 0 };
  let name = 'day', changed = true;
  function define(n, g) {
    const e = ENVIRONMENTS[n];
    g.bg.set(e.background); g.fog.set(e.fog.color); g.fogD = e.fog.density; g.sky.set(e.hemi.sky); g.gnd.set(e.hemi.ground); g.hemiI = e.hemi.intensity;
    if (e.sun) { g.sunC.set(e.sun.color); g.sunI = e.sun.intensity; g.sunP.set(e.sun.position[0], e.sun.position[1], e.sun.position[2]); } else { g.sunI = 0; }
    g.exp = e.exposure; g.strips = e.interior.strips; g.amb = e.interior.ambient; g.envI = ENV_INTENSITY[n]; g.pool = e.interior.pool ? e.interior.pool.intensity : 0; g.studio = n === 'studio' ? 1 : 0;
  }
  function apply(c) {
    scene.background.copy(c.bg); scene.fog.color.copy(c.fog); scene.fog.density = c.fogD;
    hemi.color.copy(c.sky); hemi.groundColor.copy(c.gnd); hemi.intensity = c.hemiI;
    sun.color.copy(c.sunC); sun.intensity = c.sunI; sun.visible = c.sunI > 0.01;
    sun.position.set(target.position.x + c.sunP.x * (rad / 60), c.sunP.y * (rad / 60) + target.position.y, target.position.z + c.sunP.z * (rad / 60));
    renderer.toneMappingExposure = c.exp; amb.intensity = c.amb; scene.environmentIntensity = c.envI;
    if (world.lumMat) world.lumMat.emissiveIntensity = STRIP_BASE * c.strips;
    if (world.rooflightMat) world.rooflightMat.emissiveIntensity = 0.1 + 0.4 * (name === 'day' ? 1 : 0.3);
    // R26d V7: Studio dark = neutral dark floor (about #20242a) and pallets / cartons 1.2x brighter so the load reads against the dark room (old cause: in the dusk environment the grey-blue floor and the dim pallets blended)
    for (const fm of world.floorMats || []) fm.color.setScalar(1 - 0.78 * c.studio);
    for (const am of world.apronMats || []) am.color.setScalar(1 - 0.85 * c.studio);
    for (const sct of world.sections || []) { sct.w.studioBoost = 1 + 0.2 * c.studio; sct.w.applyDim(); }
    for (const p of pools) { p.intensity = c.pool; p.visible = c.pool > 0.5; }
  }
  const api = {
    sun, pools, get name() { return name; }, get changed() { return changed; },
    set(n, instant = false) {
      if (n === 'dusk') n = 'studio';               // saved preference of the old "Dusk" environment
      if (!ENVIRONMENTS[n]) throw new Error('unknown environment ' + n);
      name = n; define(n, goal);
      if (instant) { copy(cur, goal); apply(cur); }
      changed = true;
      if (shadows) sun.shadow.needsUpdate = true;
    },
    /** call every frame; returns true while the preset is still easing */
    update(dt) {
      const k = 1 - Math.exp(-dt * 7);
      let moving = false;
      const near = (a, b) => Math.abs(a - b) < 1e-3;
      for (const key of ['fogD', 'hemiI', 'sunI', 'exp', 'strips', 'amb', 'envI', 'pool', 'studio']) { if (!near(cur[key], goal[key])) { cur[key] += (goal[key] - cur[key]) * k; moving = true; } else cur[key] = goal[key]; }
      for (const key of ['bg', 'fog', 'sky', 'gnd', 'sunC']) { if (Math.abs(cur[key].r - goal[key].r) + Math.abs(cur[key].g - goal[key].g) + Math.abs(cur[key].b - goal[key].b) > 1e-3) { cur[key].lerp(goal[key], k); moving = true; } }
      if (cur.sunP.distanceTo(goal.sunP) > 1e-2) { cur.sunP.lerp(goal.sunP, k); moving = true; }
      if (moving || changed) { apply(cur); changed = moving; if (shadows && moving) sun.shadow.needsUpdate = true; }
      return moving;
    },
    /** pool lights follow world positions (lightsOut) */
    followPools(p0, p1) { if (p0) pools[0].position.copy(p0).setY(p0.y + 2.2); if (p1) pools[1].position.copy(p1).setY(p1.y + 2.2); },
    dispose() { scene.remove(hemi, amb, sun, target, ...pools); scene.environment = null; const rt = skyRT; skyRT = null; if (rt) rt.dispose(); sun.shadow.map && sun.shadow.map.dispose(); sun.dispose(); },
  };
  function copy(a, b) { for (const k of Object.keys(a)) { if (a[k] && a[k].copy) a[k].copy(b[k]); else a[k] = b[k]; } }
  define('day', goal); copy(cur, goal); apply(cur);
  void clamp;
  return api;
}
