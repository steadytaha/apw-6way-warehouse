// Moving things (B4): 6-way shuttle fleet (instanced), vertical lifts with chain conveyor, trucks, forklift and people, pooled pallets.
import { THREE, makeFrame, matFrom, tok, cbox, wbox, merge, cyl, scaleUV, clamp } from './kit.js';
import { ROLES } from '../../design/tokens.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3(), _a = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1), _sk = new THREE.Vector3(1, 1, 1);
const Y = new THREE.Vector3(0, 1, 0);

// ===================================================================== shuttle fleet
export const STATUS_COLOR = { ok: tok('statusOk').color, fault: tok('statusFault').color, charge: tok('statusCharge').color, idle: 0x3d6b66 };

/** n shuttles drawn with a handful of InstancedMeshes. Each shuttle state: {u, v, z, lift (0..1), turn (0..1), roll (m), status, ring (0..1)} in canonical coordinates. */
export function makeFleet(world, n) {
  const f = world.f, g = new THREE.Group(); g.name = 'fleet';
  const chassis = merge([cbox(f, 0.96, 0.72, 0.07, 0, 0, 0.06), cbox(f, 0.1, 0.72, 0.1, 0.43, 0, 0.1), cbox(f, 0.1, 0.72, 0.1, -0.43, 0, 0.1)]);
  const cover = merge([cbox(f, 0.88, 0.66, 0.05, 0, 0, 0.115), cbox(f, 0.8, 0.58, 0.02, 0, 0, 0.145)]);        // chamfer = stepped top
  const deck = cbox(f, 0.84, 0.62, 0.025, 0, 0, 0.1675);
  const wheelGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.035, 14);
  if (f.swap) wheelGeo.rotateX(Math.PI / 2); else wheelGeo.rotateZ(Math.PI / 2);
  const bar = cbox(f, 0.5, 0.025, 0.03, 0, 0.365, 0.1);
  const ring = new THREE.CylinderGeometry(0.62, 0.62, 0.012, 36, 1, true).translate(0, 0.19, 0);     // R26d V7: busy halo (old: r 0.2, only during the 4 s turn, hardly visible)
  const antenna = cyl(0.008, 0.16, 0.38, 0.24, -0.22, 'y', 6);

  const mk = (geo, mat, count, cast = false) => { const m = new THREE.InstancedMesh(geo, mat, count); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.castShadow = cast; m.frustumCulled = false; m.matrixAutoUpdate = false; g.add(m); return m; };
  // R26d V7: the shuttle is the brightest thing in the picture (team decision: realistic racks stay): cover in the shuttle role colour with a small emissive lift, deck lighter, so it reads against blue steel, orange beams and kraft pallets.
  // Old cause: warm-white cover (0xe6e8ea) on pale pallets had almost no contrast; measured by tools/qa_visual.py.
  const mC = world.own(matFrom('shuttleChassis')), mW = world.own(matFrom('shuttleCover', { color: 0xffb02e, emissive: 0xff8c00, emissiveIntensity: 0.3 })), mD = world.own(matFrom('shuttleCover', { color: 0xffd58a, emissive: 0xff9a00, emissiveIntensity: 0.15 })), mWh = world.own(matFrom('wheel'));
  const iChassis = mk(chassis, mC, n), iCover = mk(cover, mW, n), iDeck = mk(deck, mD, n);
  const iWheel = mk(wheelGeo, mWh, n * 8);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }); world.own(lightMat);
  const iBar = mk(bar, lightMat, n);
  const ringMat = world.own(new THREE.MeshBasicMaterial({ color: 0xffa83a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  const iRing = mk(ring, ringMat, n);
  const iAnt = mk(antenna, mC, n);
  iBar.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); iBar.instanceColor.setUsage(THREE.DynamicDrawUsage);
  const col = new THREE.Color();
  // wheel set: 4 per side, rotating with the set during the 4 s turn (the body stays)
  const wl = []; for (const su of [-1, 1]) for (const dv of [-0.27, -0.09, 0.09, 0.27]) wl.push([su * 0.42, dv]);
  const baseAxis = f.dir(1, 0, new THREE.Vector3());
  const axle = new THREE.Vector3();

  // FIX (R13a): the fleet drew exactly n shuttles (old cause: one fleet per block with a fixed count, so a shuttle could never leave its block); n is now the capacity (the whole pooled
  // fleet), the instance counts follow the shuttles the block holds at the moment, and `order[i]` names the shuttle of instance i (picking).
  // R26d V7: fading path trail of every moving shuttle (last ~3 s, one line strip = 1 draw call), a focus outline (inverted hull), a focus scale (visual only)
  const TK = 14, TSTEP = 0.2;
  const tPos = new Float32Array(n * (TK - 1) * 2 * 3), tCol = new Float32Array(n * (TK - 1) * 2 * 4);
  const tGeo = new THREE.BufferGeometry(); const tpa = new THREE.BufferAttribute(tPos, 3), tca = new THREE.BufferAttribute(tCol, 4); tpa.setUsage(THREE.DynamicDrawUsage); tca.setUsage(THREE.DynamicDrawUsage);
  tGeo.setAttribute('position', tpa); tGeo.setAttribute('color', tca); tGeo.setDrawRange(0, 0);
  const tMat = world.own(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, toneMapped: false, depthWrite: false }));
  const trail = new THREE.LineSegments(tGeo, tMat); trail.frustumCulled = false; trail.renderOrder = 8; g.add(trail);
  const hist = Array.from({ length: n }, () => []); let lastSample = -1e9, trailsOn = true, scaleK = 1, focus = null, lastStates = null, lastTime = 0;
  const outMat = world.own(new THREE.MeshBasicMaterial({ color: 0xffd23f, side: THREE.BackSide, toneMapped: false }));
  const outline = new THREE.Group(); outline.visible = false; outline.add(new THREE.Mesh(chassis, outMat), new THREE.Mesh(cover, outMat)); outline.scale.setScalar(1.35); g.add(outline);
  function sampleTrails(ns, time) {
    let segs = 0;
    for (let i = 0; i < ns; i++) {
      const hs = hist[i], s = lastStates[i]; f.pos(s.u, s.v, s.z + 0.22, _p);
      const last = hs[hs.length - 1];
      if (last && last.distanceTo(_p) > 4) hs.length = 0;                          // a jump (transfer, instance re-used by another shuttle): start a new trail
      hs.push(_p.clone()); if (hs.length > TK) hs.shift();
      for (let j = 1; j < hs.length; j++) {
        const a = hs[j - 1], b = hs[j]; if (a.distanceToSquared(b) < 1e-4) continue;   // standing still draws nothing
        const o = segs * 6, oc = segs * 8, al = j / hs.length;
        tPos.set([a.x, a.y, a.z, b.x, b.y, b.z], o);
        tCol.set([1, 0.66, 0.23, al * 0.15, 1, 0.66, 0.23, al * 0.9], oc); segs++;
      }
    }
    tGeo.setDrawRange(0, segs * 2); tpa.needsUpdate = true; tca.needsUpdate = true;
  }
  const order = [];
  function update(states, time) {
    const ns = Math.min(n, states.length);
    lastStates = states; lastTime = time;
    if (trailsOn && time - lastSample >= TSTEP) { lastSample = time; sampleTrails(ns, time); }
    order.length = 0;
    let fo = false;
    for (let i = 0; i < ns; i++) {
      const s = states[i]; order.push(s);
      f.pos(s.u, s.v, s.z, _p);
      if (s === focus) { fo = true; outline.position.copy(_p); outline.scale.setScalar(1.35 * scaleK); }
      _sk.set(scaleK, scaleK, scaleK);
      _m.compose(_p, _q.identity(), _sk);
      iChassis.setMatrixAt(i, _m); iCover.setMatrixAt(i, _m); iAnt.setMatrixAt(i, _m);
      _a.copy(_p); _a.y += 0.04 * s.lift;
      _m.compose(_a, _q.identity(), _sk); iDeck.setMatrixAt(i, _m);
      _m.compose(_p, _q.identity(), (s.ring > 0.01 || (s.actor && s.actor.busy)) ? _sk : _s.set(0.0001, 0.0001, 0.0001)); iRing.setMatrixAt(i, _m); _s.set(1, 1, 1);
      _m.compose(_p, _q.identity(), _sk); iBar.setMatrixAt(i, _m);
      let c = STATUS_COLOR[s.status] ?? STATUS_COLOR.ok;
      if (s.status === 'fault' && Math.floor(time) % 2 === 1) c = 0x330806;           // blinks at 1 Hz
      col.set(c); iBar.instanceColor.setXYZ(i, col.r, col.g, col.b);
      const phi = s.turn * Math.PI / 2, cs = Math.cos(phi), sn = Math.sin(phi);
      for (let k = 0; k < 8; k++) {
        const [lu, lv] = wl[k], uu = s.u + (lu * cs - lv * sn) * scaleK, vv = s.v + (lu * sn + lv * cs) * scaleK;
        f.pos(uu, vv, s.z + 0.045, _a);
        f.dir(cs, sn, axle).normalize();
        _q.setFromUnitVectors(baseAxis, axle);
        _q2.setFromAxisAngle(axle, s.roll / 0.045); _q2.multiply(_q);
        _m.compose(_a, _q2, _sk); iWheel.setMatrixAt(i * 8 + k, _m);
      }
    }
    for (const m of [iChassis, iCover, iDeck, iBar, iRing, iAnt]) { m.count = ns; m.instanceMatrix.needsUpdate = true; }
    iWheel.count = ns * 8; iWheel.instanceMatrix.needsUpdate = true;
    iBar.instanceColor.needsUpdate = true;
    outline.visible = fo;
  }
  return { group: g, update, pick: iChassis, count: n, order,
    /** visual scale of the shuttle bodies (1.25 in focus mode); trails on / off; the shuttle state to outline (or null) */
    setScale(k) { if (k !== scaleK) { scaleK = k; if (lastStates) update(lastStates, lastTime); } },
    setTrails(on) { trailsOn = !!on; trail.visible = trailsOn; if (!on) { hist.forEach((h2) => { h2.length = 0; }); tGeo.setDrawRange(0, 0); } },
    setFocus(s) { focus = s || null; if (lastStates) update(lastStates, lastTime); } };
}

// ===================================================================== lifts
export function makeLift(world, spec, idx) {
  const f = world.f, sc = world.sc, tiers = world.tiers, tz = world.tz;
  const g = new THREE.Group(); g.name = 'lift ' + spec.id;
  const hm = Math.max(sc.building.H - 0.5, tz[tz.length - 1] + 2.5);            // mast height
  const fw = 1.4, fd = 1.2;
  const post = (su, sv) => cbox(f, 0.12, 0.12, hm, su * (fw / 2 + 0.06), sv * (fd / 2 + 0.06), hm / 2);
  const ties = [];
  for (let z = 4.5; z < hm; z += 4.5) for (const sv of [-1, 1]) ties.push(cbox(f, fw + 0.24, 0.06, 0.06, 0, sv * (fd / 2 + 0.06), z)), ties.push(cbox(f, 0.06, fd + 0.24, 0.06, (fw / 2 + 0.06), 0, z));
  const mast = new THREE.Mesh(merge([post(-1, -1), post(1, -1), post(-1, 1), post(1, 1), ...ties]), world.own(matFrom('liftMast')));
  mast.castShadow = true; g.add(mast);
  // roller stubs at every tier landing, towards the aisle side(s)
  const stubs = [];
  const rackMid = sc.columns.start + sc.columns.length / 2;
  const dirs = spec.shaft ? [1, -1] : [spec.u < rackMid ? 1 : -1];             // roller stubs point into the aisle
  spec.stubDir = dirs[0];
  for (let t = 0; t < tiers; t++) for (const sgn of dirs) stubs.push(cbox(f, 0.8, fd - 0.2, 0.1, sgn * (fw / 2 + 0.4), 0, tz[t] + 0.08));
  const stubMesh = new THREE.Mesh(merge(stubs), world.own(matFrom('conveyorFrame'))); g.add(stubMesh);
  // yellow guarding cage up to 2.2 m (28 % mesh)
  const cageMat = world.own(matFrom('liftCage', { side: THREE.DoubleSide, color: 0x9468e0, opacity: 0.3 }));
  const cageParts = [cbox(f, fw + 0.4, 0.02, 2.2, 0, fd / 2 + 0.25, 1.1), cbox(f, fw + 0.4, 0.02, 2.2, 0, -(fd / 2 + 0.25), 1.1)];
  if (!spec.shaft) cageParts.push(cbox(f, 0.02, fd + 0.5, 2.2, fw / 2 + 0.2, 0, 1.1), cbox(f, 0.02, fd + 0.5, 2.2, -(fw / 2 + 0.2), 0, 1.1));
  g.add(new THREE.Mesh(merge(cageParts), cageMat));
  // R26d V7: violet tier ticks on the mast (one per tier landing), a focus outline box
  { const ticks = []; for (let t = 0; t < tiers; t++) ticks.push(cbox(f, fw + 0.3, 0.07, 0.14, 0, fd / 2 + 0.1, tz[t] + 0.3));
    g.add(new THREE.Mesh(merge(ticks), world.own(new THREE.MeshStandardMaterial({ color: 0x9468e0, emissive: 0x7a4fc4, emissiveIntensity: 0.6, roughness: 0.5 })))); }
  const outl = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(...f.size(fw + 1.0, fd + 1.0, hm).toArray())), world.own(new THREE.LineBasicMaterial({ color: 0xffd23f, toneMapped: false, depthTest: false })));
  outl.position.copy(f.pos(0, 0, hm / 2)); outl.visible = false; outl.renderOrder = 45; g.add(outl);
  // group colour ring at the base
  const gc = spec.group === 'IN' ? ROLES.in.hex : spec.group === 'OUT' ? ROLES.out.hex : ROLES.structure.hex;
  const ringMat = world.own(new THREE.MeshStandardMaterial({ color: gc, emissive: gc, emissiveIntensity: 0.5, roughness: 0.5 }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.22, 40).rotateX(-Math.PI / 2), ringMat); ring.position.y = 0.022; g.add(ring);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), world.own(new THREE.MeshBasicMaterial({ color: gc, toneMapped: false })));
  beacon.position.copy(f.pos(fw / 2 + 0.06, fd / 2 + 0.06, 2.3)); g.add(beacon);
  // carriage: yellow frame + chain conveyor (+ pallet seat at 0.16 above its level)
  const car = new THREE.Group(); car.name = 'carriage'; g.add(car);
  const frameM = world.own(matFrom('liftCarriage', { color: 0x9468e0, emissive: 0x5a2fb0, emissiveIntensity: 0.3 }));     // R26d V7: lift = violet role (old: safety yellow, no role)
  const frameGeo = merge([cbox(f, fw, 0.08, 0.1, 0, fd / 2 - 0.04, 0.05), cbox(f, fw, 0.08, 0.1, 0, -(fd / 2 - 0.04), 0.05), cbox(f, 0.1, fd, 0.1, fw / 2 - 0.05, 0, 0.05), cbox(f, 0.1, fd, 0.1, -(fw / 2 - 0.05), 0, 0.05),
    cbox(f, 0.05, 0.05, 0.3, fw / 2 - 0.1, fd / 2 - 0.1, 0.25), cbox(f, 0.05, 0.05, 0.3, fw / 2 - 0.1, -(fd / 2 - 0.1), 0.25)]);
  const fm = new THREE.Mesh(frameGeo, frameM); fm.castShadow = true; car.add(fm);
  if (spec.type === 'chain') {
    const chainTex = world.T.chain.clone(); chainTex.needsUpdate = true; chainTex.userData = {};
    const chainMat = world.own(new THREE.MeshStandardMaterial({ map: chainTex, roughness: 0.35, metalness: 0.9, color: 0xffffff }));
    const mkChain = (cv) => { const gg = cbox(f, fw - 0.2, 0.14, 0.06, 0, cv, 0.11); return scaleUV(gg, 6, 1); };
    const cm = new THREE.Mesh(merge([mkChain(-0.32), mkChain(0.32)]), chainMat); car.add(cm);
    spec.chainTex = chainTex;
  } else {
    car.add(new THREE.Mesh(merge([cbox(f, fw - 0.2, 0.08, 0.05, 0, 0.5, 0.1), cbox(f, fw - 0.2, 0.08, 0.05, 0, -0.5, 0.1)]), world.own(matFrom('rail'))));
  }
  const cw = new THREE.Mesh(cbox(f, 0.3, 0.3, 1.2, 0, 0, 0), world.own(matFrom('safetyBlack')));     // counterweight, moves opposite
  cw.position.copy(f.pos(-(fw / 2 + 0.06), 0, 0)); g.add(cw);
  const base = f.pos(spec.u, spec.v, 0); g.position.copy(base);
  const api = {
    spec, group: g, car, z: 0, hm, cw, outline: outl,
    setZ(z) { api.z = z; car.position.y = z; cw.position.y = Math.max(0.6, hm - z - 0.6); },
    get seatZ() { return api.z + world.ZR; },
    /** R9b contingency: a lift that is down shows a red beacon and a grey-red ring */
    setDown(on) { const c = on ? 0xb3261e : gc; ringMat.color.setHex(c); ringMat.emissive.setHex(c); beacon.material.color.setHex(c); api.down = !!on; },
  };
  api.setZ(world.convZ - 0.16);
  g.traverse((o) => { o.userData.lift = api; });
  return api;
}

// ===================================================================== pooled pallets
export function makePalletPool(world, n) {
  const g = new THREE.Group(); g.name = 'dynamic pallets';
  const base = new THREE.InstancedMesh(world.palletGeo, world.palletMat, n), load = new THREE.InstancedMesh(world.loadGeo, world.cartonMat, n);
  for (const m of [base, load]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.matrixAutoUpdate = false; m.receiveShadow = true; m.castShadow = false; g.add(m); }
  const c1 = new THREE.Color(tok('pallet').color), c2 = new THREE.Color(tok('carton').color);
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < n; i++) { base.setMatrixAt(i, hide); load.setMatrixAt(i, hide); base.setColorAt(i, c1); load.setColorAt(i, c2); }
  const items = new Array(n).fill(null), free = [];
  for (let i = n - 1; i >= 0; i--) free.push(i);
  const api = {
    group: g, items,
    alloc(abcColor) {
      const i = free.pop(); if (i == null) return null;
      const it = { i, u: 0, v: 0, z: 0, yaw: 0, shown: false };
      items[i] = it;
      if (abcColor != null) load.setColorAt(i, new THREE.Color(abcColor)); else load.setColorAt(i, c2);
      load.instanceColor.needsUpdate = true; return it;
    },
    release(it) { if (!it) return; items[it.i] = null; free.push(it.i); base.setMatrixAt(it.i, hide); load.setMatrixAt(it.i, hide); it.shown = false; },
    flush() {
      for (let i = 0; i < n; i++) {
        const it = items[i]; if (!it) continue;
        world.f.pos(it.u, it.v, it.z, _p); _q.setFromAxisAngle(Y, it.yaw || 0);
        _m.compose(_p, _q, _one); base.setMatrixAt(i, _m); load.setMatrixAt(i, _m);
      }
      base.instanceMatrix.needsUpdate = load.instanceMatrix.needsUpdate = true;
    },
  };
  return api;
}

// ===================================================================== truck (local frame: x = 0 at the trailer rear, +x towards the cab, z across)
export function makeTruck(world, which) {
  const g = new THREE.Group(); g.name = 'truck ' + which;
  const Ltr = 13.6, deck = 1.2, boxH = 2.7, W2 = 1.2;
  const white = world.own(matFrom('truckTrailer')), cabM = world.own(matFrom('truckCab', { color: which === 'in' ? 0x2f5f7a : 0x6f7480 })), dark = world.own(matFrom('shuttleChassis', { roughness: 0.7 }));
  const rub = world.own(matFrom('dockBumper')), glass = world.own(matFrom('glass')), chrome = world.own(matFrom('roller'));
  const add = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; g.add(m); return m; };
  add(merge([wbox(Ltr, 0.28, 0.9, Ltr / 2, 0.98, 0), wbox(Ltr, 0.08, 2.5, Ltr / 2, deck - 0.04, 0), wbox(0.12, 0.22, 2.3, -0.05, 0.5, 0)]), dark);
  // box body: open at the rear (docked), roof and sides
  add(merge([wbox(Ltr, 0.08, 2.55, Ltr / 2, deck + boxH, 0), wbox(0.08, boxH, 2.55, Ltr - 0.04, deck + boxH / 2, 0), wbox(Ltr, boxH, 0.06, Ltr / 2, deck + boxH / 2, W2 + 0.03), wbox(Ltr, boxH, 0.06, Ltr / 2, deck + boxH / 2, -(W2 + 0.03))]), white);
  const tail = new THREE.Mesh(wbox(0.04, 0.12, 0.3, -0.02, 0.85, 1.05), world.own(new THREE.MeshBasicMaterial({ color: 0xd8392b }))); g.add(tail);
  const xc = Ltr + 0.3;
  const sh = new THREE.Shape();
  sh.moveTo(0, 0); sh.lineTo(2.3, 0); sh.lineTo(2.3, 1.3); sh.lineTo(2.2, 2.75); sh.lineTo(2.02, 2.95); sh.lineTo(0.1, 2.95); sh.lineTo(0, 2.85); sh.closePath();
  add(new THREE.ExtrudeGeometry(sh, { depth: 2.4, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1, curveSegments: 1 }).translate(xc, 1.05, -1.2), cabM);
  add(wbox(0.03, 1.2, 2.2, xc + 2.32, 3.1, 0), glass, false);
  add(merge([wbox(6.2, 0.28, 0.9, Ltr - 0.6, 0.85, 0), wbox(0.3, 0.4, 2.45, xc + 2.32, 0.78, 0)]), dark);
  const wheels = [];
  for (const x of [3.0, 4.4, 5.8, Ltr - 1.5, Ltr + 2.0]) for (const z of [-1, 1]) {
    wheels.push(cyl(0.5, 0.3, x, 0.5, z * 1.0, 'z', 16));
  }
  add(merge(wheels), rub);
  const rims = []; for (const x of [3.0, 4.4, 5.8, Ltr - 1.5, Ltr + 2.0]) for (const z of [-1, 1]) rims.push(cyl(0.28, 0.32, x, 0.5, z * 1.0, 'z', 12));
  add(merge(rims), chrome);
  // load: pallets in the trailer, 2 across, rows of 1.1 m, filled from the cab side
  const rows = 12, n = rows * 2;
  const base = new THREE.InstancedMesh(world.palletGeo, world.palletMat, n), load = new THREE.InstancedMesh(world.loadGeo, world.cartonMat, n);
  const c2 = new THREE.Color(tok('carton').color), c1 = new THREE.Color(tok('pallet').color);
  const slotPos = (k) => { const r = rows - 1 - Math.floor(k / 2); return [0.8 + r * 1.1, deck, (k % 2 ? 0.6 : -0.6)]; };
  // canonical pallet geometry is built in the frame of the world; in the truck we place it with the world frame rotated (u -> truck z)
  const pal = new THREE.Group(); pal.name = 'truck load';
  const truckLoad = { base, load, n, slotPos, count: 0 };
  for (let k = 0; k < n; k++) {
    const [x, y, z] = slotPos(k);
    _p.set(x, y, z);
    // the pallet geometry has its 1.25 m side along canonical u; align u with the truck's z (across) in three space
    const yaw = world.f.swap ? 0 : Math.PI / 2;      // swap: u = three -z (already across); otherwise u = x, rotate to z
    _q.setFromAxisAngle(Y, yaw); if (world.f.swap) _s.set(1, 1, 0.95); else _s.set(0.95, 1, 1);
    _m.compose(_p, _q, _s); base.setMatrixAt(k, _m); load.setMatrixAt(k, _m); base.setColorAt(k, c1); load.setColorAt(k, c2);
  }
  _s.set(1, 1, 1);
  truckLoad.setCount = (c) => { truckLoad.count = clamp(Math.round(c), 0, n); base.count = load.count = truckLoad.count; };
  for (const m of [base, load]) { m.matrixAutoUpdate = false; m.frustumCulled = false; m.castShadow = false; pal.add(m); }
  g.add(pal);
  const api = { group: g, load: truckLoad, length: Ltr + 3, deckZ: deck, doorSlot: [-0.3, deck, 0] };
  truckLoad.setCount(0);
  return api;
}

// ===================================================================== forklift and people (static props for scale, exterior only)
export function makeProps(world) {
  const g = new THREE.Group(); g.name = 'props';
  const kit = propKit(world);
  return { group: g, ...kit };
}
/** R9b: forklift and person builders (placed by zones.js: one forklift at the docks, operators only in the manned zones) */
export function propKit(world) {
  const orange = world.own(matFrom('forklift')), dark = world.own(matFrom('shuttleChassis')), vest = world.own(matFrom('vest')), skin = world.own(matFrom('safetyWhite', { color: 0xc99b7b }));
  const makeForklift = () => {
  const fk = new THREE.Group();
  const body = merge([wbox(1.9, 0.75, 1.1, 0, 0.75, 0), wbox(0.9, 0.12, 1.0, -0.4, 1.9, 0), wbox(0.06, 1.15, 0.06, 0.2, 1.4, 0.5), wbox(0.06, 1.15, 0.06, 0.2, 1.4, -0.5), wbox(0.06, 1.15, 0.06, -0.9, 1.4, 0.5), wbox(0.06, 1.15, 0.06, -0.9, 1.4, -0.5)]);
  fk.add(new THREE.Mesh(body, orange));
  fk.add(new THREE.Mesh(merge([wbox(0.14, 3.0, 0.1, 1.15, 1.5, 0.4), wbox(0.14, 3.0, 0.1, 1.15, 1.5, -0.4), wbox(1.1, 0.05, 0.12, 1.7, 0.1, 0.35), wbox(1.1, 0.05, 0.12, 1.7, 0.1, -0.35)]), dark));
  fk.add(new THREE.Mesh(merge([cyl(0.33, 0.25, 0.6, 0.33, 0.55, 'z', 12), cyl(0.33, 0.25, 0.6, 0.33, -0.55, 'z', 12), cyl(0.27, 0.25, -0.7, 0.27, 0.5, 'z', 12), cyl(0.27, 0.25, -0.7, 0.27, -0.5, 'z', 12)]), dark));
  fk.traverse((o) => { o.castShadow = true; });
  return fk; };
  const person = () => {
    const p = new THREE.Group();
    p.add(new THREE.Mesh(merge([wbox(0.22, 0.8, 0.28, 0, 0.4, 0), wbox(0.28, 0.1, 0.1, 0, 0.8, 0)]), dark), new THREE.Mesh(wbox(0.34, 0.6, 0.24, 0, 1.1, 0), vest), new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8).translate(0, 1.55, 0), skin));
    p.traverse((o) => { o.castShadow = true; }); return p;
  };
  return { makeForklift, makePerson: person };
}
