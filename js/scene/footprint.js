// Building shell of a non-rectangular footprint (R9b): floor slabs, exterior walls with a door per bay, roof, cut-away shell with the same API as the rectangle shell in world.js
// (shell.set(mode, facing, animate), shell.update(dt), shell.walls, shell.changed). Built from the footprint rectangles and the door list of sections.js.
import { THREE, matFrom, scaleUV, clamp } from './kit.js';
import { exteriorEdges } from './sections.js';

const DOOR_W = 3.0, DOOR_H = 3.2;

export function buildFootprintShell(rects, doors, B, T, own) {
  const root = new THREE.Group(); root.name = 'footprint';
  const floorMat = own(matFrom('floor', { color: 0xffffff, map: T.concrete.clone(), roughness: 0.62 })); floorMat.map.needsUpdate = true; floorMat.map.userData = {};
  floorMat.map.repeat.set(1 / 6, 1 / 6);
  for (const [x, y, w, h] of rects) {
    const g = scaleUV(new THREE.PlaneGeometry(w, h), w / 6, h / 6);
    const m = new THREE.Mesh(g, floorMat); m.rotation.x = -Math.PI / 2; m.position.set(x + w / 2, 0.004, -(y + h / 2)); m.receiveShadow = true; m.name = 'floor'; root.add(m);
  }
  floorMat.map.repeat.set(1, 1);
  const apronMat = own(matFrom('floorApron', { color: 0xffffff, map: T.asphalt.clone() })); apronMat.map.repeat.set(60, 60); apronMat.map.needsUpdate = true; apronMat.map.userData = {};
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), apronMat);
  apron.rotation.x = -Math.PI / 2; apron.position.set(B.L / 2, -0.01, -B.W / 2); apron.receiveShadow = true; root.add(apron);

  const wallBase = matFrom('wallPanel', { color: 0xffffff, map: T.cladding, side: THREE.DoubleSide });
  const plinthMat = own(matFrom('wallPlinth')), doorMat = own(matFrom('dockDoor')), shelterMat = own(matFrom('dockBumper', { roughness: 0.9 }));
  const levMat = own(matFrom('leveller'));
  const shell = { walls: {}, cut: 'closed', mats: [], root };
  const H = B.H, edges = exteriorEdges(rects);
  const groups = {};
  for (const w of ['S', 'N', 'W', 'E']) { const mat = wallBase.clone(); own(mat); shell.mats.push(mat); groups[w] = { group: new THREE.Group(), mat }; groups[w].group.name = 'wall' + w; root.add(groups[w].group); shell.walls[w] = groups[w]; }
  const doorObjs = new Map();
  const doorsOn = (e) => doors.filter((d) => d.wall === e.wall && (e.y0 === e.y1 ? Math.abs(d.y - e.y0) < 0.8 && d.s >= e.x0 - 1e-6 && d.s <= e.x1 + 1e-6 : Math.abs(d.x - e.x0) < 0.8 && d.s >= e.y0 - 1e-6 && d.s <= e.y1 + 1e-6));
  for (const e of edges) {
    const g = groups[e.wall], horiz = e.y0 === e.y1;
    const a0 = horiz ? e.x0 : e.y0, a1 = horiz ? e.x1 : e.y1, c = horiz ? e.y0 : e.x0;
    const opens = doorsOn(e).map((d) => d.s).sort((p, q) => p - q);
    const place = (m, s) => { m.position.set(horiz ? s : c, m.position.y, -(horiz ? c : s)); m.rotation.y = horiz ? 0 : Math.PI / 2; };
    const seg = (s0, s1, y0, y1, mat, thick, sink) => {
      if (s1 - s0 < 0.01) return;
      const m = new THREE.Mesh(scaleUV(new THREE.BoxGeometry(s1 - s0, y1 - y0, thick), s1 - s0, 1), mat); m.castShadow = true; m.receiveShadow = true;
      m.position.y = (y0 + y1) / 2; place(m, (s0 + s1) / 2); (sink || g.group).add(m);
    };
    let prev = a0;
    for (const o of opens) { seg(prev, o - DOOR_W / 2, 1.0, H, g.mat, 0.18); seg(prev, o - DOOR_W / 2, 0, 1.0, plinthMat, 0.22, root); prev = o + DOOR_W / 2; seg(o - DOOR_W / 2, o + DOOR_W / 2, DOOR_H, H, g.mat, 0.18); }
    seg(prev, a1, 1.0, H, g.mat, 0.18); seg(prev, a1, 0, 1.0, plinthMat, 0.22, root);
    for (const d of doorsOn(e)) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.06), doorMat); leaf.position.y = DOOR_H / 2; place(leaf, d.s); leaf.castShadow = true; g.group.add(leaf);
      const fr = new THREE.Group(); fr.position.set(d.x + d.nx * 0.55, 0, -(d.y + d.ny * 0.55)); fr.rotation.y = Math.atan2(d.nx, -d.ny); root.add(fr);
      for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.28, DOOR_H + 0.4, 0.9), shelterMat); p.position.set(sx * (DOOR_W / 2 + 0.2), (DOOR_H + 0.4) / 2, 0); fr.add(p); }
      const top = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W + 0.8, 0.3, 0.9), shelterMat); top.position.set(0, DOOR_H + 0.25, 0); fr.add(top);
      const lev = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.07, 1.8), levMat); lev.position.set(0, 0.95, 0.9); fr.add(lev);
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.06), own(new THREE.MeshBasicMaterial({ color: 0x31865c }))); light.position.set(DOOR_W / 2 + 0.6, DOOR_H - 0.3, 0.5); fr.add(light);
      doorObjs.set(d.idx, { door: leaf, doorY0: leaf.position.y, leveller: lev, light, frame: fr });
    }
  }
  // roof: one slab per rectangle (a plain lid, rooflights over each)
  const roofMat = own(matFrom('roof', { side: THREE.DoubleSide })); shell.mats.push(roofMat);
  const roof = new THREE.Group(); roof.name = 'roof';
  const lightMat = own(new THREE.MeshStandardMaterial({ color: 0xcfe6f2, emissive: 0xbfe0f0, emissiveIntensity: 0.35, roughness: 0.2, transparent: true, opacity: 0.8 }));
  for (const [x, y, w, h] of rects) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, h), roofMat); slab.position.set(x + w / 2, H + 0.15, -(y + h / 2)); slab.castShadow = true; slab.receiveShadow = true; roof.add(slab);
    for (let k = 1; k <= 3; k++) { const rl = new THREE.Mesh(new THREE.BoxGeometry(Math.min(8, w * 0.12), 0.1, Math.min(2.4, h * 0.08)), lightMat); rl.position.set(x + w * k / 4, H + 0.34, -(y + h / 2)); roof.add(rl); }
  }
  root.add(roof); shell.walls.roof = { group: roof, mat: roofMat };
  const setOpacity = (key, a) => { const w = shell.walls[key]; w.mat.opacity = a; w.mat.transparent = a < 0.999; w.mat.depthWrite = a > 0.5; w.group.visible = a > 0.01; if (key === 'roof') lightMat.opacity = 0.8 * a; };
  for (const k of Object.keys(shell.walls)) shell.walls[k].a = 1;
  shell.targets = (mode, facing) => {
    const t = { roof: 1, S: 1, N: 1, W: 1, E: 1 };
    if (mode === 'roof') t.roof = 0;
    if (mode === 'cut') { t.roof = 0; t[facing || 'S'] = 0; }
    if (mode === 'open') { t.roof = 0; t.S = t.N = t.W = t.E = 0; }
    return t;
  };
  shell.set = (mode, facing, animate = true) => {
    shell.cut = mode; shell.goal = shell.targets(mode, facing);
    if (!animate) for (const k of Object.keys(shell.goal)) { shell.walls[k].a = shell.goal[k]; setOpacity(k, shell.walls[k].a); }
  };
  shell.update = (dt) => {
    if (!shell.goal) return;
    for (const k of Object.keys(shell.goal)) {
      const w = shell.walls[k], g = shell.goal[k];
      if (Math.abs(w.a - g) > 1e-3) { w.a += clamp(g - w.a, -dt / 0.6, dt / 0.6); if (Math.abs(w.a - g) < 1e-3) w.a = g; setOpacity(k, w.a); shell.changed = true; }
    }
  };
  shell.set('closed', 'S', false);
  return { root, shell, doorObjs, rooflightMat: lightMat };
}
