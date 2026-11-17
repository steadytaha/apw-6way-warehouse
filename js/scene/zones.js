// Functional zones (R9b, D23): translucent volumes with labels from the zone rectangles, optional partition walls, mezzanine slab, reserve strip (empty floor), walkway on the
// cross-aisles, charging area, bays at the 4.5 m door pitch, the picking conveyor loop of dock case U, one forklift at the docks and operators in the manned zones.
// All coordinates are world metres (x east, y north) -> three.js (x, z up, -y). Zone rectangles come from report.scene.zones (areas.plan); nothing here recomputes areas.
import { THREE, matFrom, tok, merge, wbox } from './kit.js';
import { ROLES } from '../../design/tokens.js';

const GROUP_COLOR = { in: ROLES.in.hex, out: ROLES.out.hex, tech: 0x8f6fd0, staff: 0x3f9d8f, other: 0x9aa4ad };
const MANNED = new Set(['receiving', 'qa', 'consolidation', 'staging', 'workshop', 'control_room', 'offices', 'break_room', 'changing']);
const ZH = 3.0, MZ_Z = 3.4, MZ_H = 3.0;       // ground zone volume height, mezzanine floor level and clear height (net height 3.0 m needed, areas.mezzanine note)

// FIX (R24 V4): zone, bay and loop names were canvas sprites that scaled with the camera distance (6 to 60 px on screen, unreadable from the overview, huge in close-ups).
// They are now descriptors {id, kind, text, color, prio, pos (three.js, group space)} that index.js hands to the screen-space label layer (labels.js: 13 px, declutter).
const nameOf = (text) => String(text);

export function buildZones(rep, secInfo, world, opt = {}) {
  const sc = rep.scene, plan = rep.plan || {};
  const g = new THREE.Group(); g.name = 'zones';
  const volumes = new THREE.Group(), walls = new THREE.Group(), floors = new THREE.Group(), static_ = new THREE.Group();
  walls.visible = false; walls.name = 'zone walls'; volumes.name = 'zone volumes';
  g.add(volumes, walls, floors, static_);
  const labelDefs = [];
  const mats = [], geos = [];
  const own = (m) => { mats.push(m); return m; };
  const flat = (x, y, w, h, z, mat) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.rotation.x = -Math.PI / 2; m.position.set(x + w / 2, z, -(y + h / 2)); m.receiveShadow = true; return m; };
  const outline = (x, y, w, h, z, color, parent, op = 0.9) => {
    const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]].map(([a, b]) => new THREE.Vector3(a, z, -b));
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), own(new THREE.LineBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false })));
    parent.add(l); return l;
  };
  // R26d V7 (draw calls): zone volumes and their outlines are merged per colour / opacity, the bays per flow, the static props per material (old: one mesh per zone volume, per outline line, per bay, per prop part:
  // 124 draw calls on the example). Nothing is picked or animated here; the bays of one flow share a material because setDockDown fades a whole flow.
  const volAcc = new Map(), lineAcc = new Map();
  const accVol = (geo, col, op) => { const k = col + '|' + op; if (!volAcc.has(k)) volAcc.set(k, { col, op, geos: [] }); volAcc.get(k).geos.push(geo); };
  const accLines = (pts, col, op) => { const k = col + '|' + op; if (!lineAcc.has(k)) lineAcc.set(k, { col, op, v: [] }); const a = lineAcc.get(k).v; for (let i = 0; i + 1 < pts.length; i++) a.push(pts[i], pts[i + 1]); };
  const rectPts = (x, y, w, h, z) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]].map(([a, b]) => new THREE.Vector3(a, z, -b));
  const zones = (sc.zones || []).filter((z) => z.rect && z.rect.w > 0.2 && z.rect.h > 0.2);
  const zoneObjs = {};
  for (const z of zones) {
    const r = z.rect, col = z.key === 'charging' || z.key === 'forklift_charging' ? 0xe0b020 : (GROUP_COLOR[z.group] || GROUP_COLOR.other);
    const mezz = z.level === 'mezzanine';
    const z0 = mezz ? MZ_Z : 0.02, h = mezz ? MZ_H : ZH;
    accVol(new THREE.BoxGeometry(r.w - 0.06, h, r.h - 0.06).translate(r.x + r.w / 2, z0 + h / 2, -(r.y + r.h / 2)), col, mezz ? 0.13 : 0.11);
    accLines(rectPts(r.x + 0.03, r.y + 0.03, r.w - 0.06, r.h - 0.06, z0 + h), col, 0.8); accLines(rectPts(r.x + 0.03, r.y + 0.03, r.w - 0.06, r.h - 0.06, z0 + 0.02), col, 0.6);
    if (mezz) {                                            // mezzanine slab above the dock zone (areas.mezzanine: fits above the in-side dock zone)
      const slab = new THREE.Mesh(new THREE.BoxGeometry(r.w, 0.22, r.h), own(matFrom('wallPlinth', { color: 0xc4cad1 }))); slab.position.set(r.x + r.w / 2, MZ_Z - 0.11, -(r.y + r.h / 2)); slab.castShadow = true; slab.receiveShadow = true; static_.add(slab);
      for (const [px, py] of [[r.x + 0.15, r.y + 0.15], [r.x + r.w - 0.15, r.y + 0.15], [r.x + 0.15, r.y + r.h - 0.15], [r.x + r.w - 0.15, r.y + r.h - 0.15]]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.2, MZ_Z - 0.2, 0.2), own(matFrom('rackUpright'))); c.position.set(px, (MZ_Z - 0.2) / 2, -py); static_.add(c); }
    } else if (z.key === 'charging' || z.key === 'forklift_charging') {
      const f = flat(r.x, r.y, r.w, r.h, 0.03, own(new THREE.MeshBasicMaterial({ color: 0xe0b020, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false }))); floors.add(f);
    }
    // partition walls (toggle): thin translucent panels on the four sides
    const wm = own(new THREE.MeshStandardMaterial({ color: 0xd9dee3, transparent: true, opacity: 0.42, roughness: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    for (const [cx, cy, sx, sy] of [[r.x + r.w / 2, r.y, r.w, 0.1], [r.x + r.w / 2, r.y + r.h, r.w, 0.1], [r.x, r.y + r.h / 2, 0.1, r.h], [r.x + r.w, r.y + r.h / 2, 0.1, r.h]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, h, sy), wm); m.position.set(cx, z0 + h / 2, -cy); walls.add(m);
    }
    labelDefs.push({ id: 'zone:' + z.key, kind: 'zone', text: nameOf(z.name.replace(/ \(.*\)$/, '')), color: col, prio: 3 + (mezz ? 0.2 : 0) - Math.min(0.9, (r.w * r.h) / 4000), pos: new THREE.Vector3(r.x + r.w / 2, z0 + h + 0.8, -(r.y + r.h / 2)) });
    zoneObjs[z.key] = { z, vol: null, col };
  }
  for (const { col, op, geos } of volAcc.values()) { const m = new THREE.Mesh(merge(geos), own(new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, toneMapped: false }))); m.renderOrder = 5; volumes.add(m); }
  for (const { col, op, v } of lineAcc.values()) volumes.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(v), own(new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false }))));
  // reserve strip: empty floor (no racks, no pallets) with a dashed outline and a label
  const rv = sc.reserve;
  if (rv && rv.w > 0.5 && rv.h > 0.5) {
    floors.add(flat(rv.x, rv.y, rv.w, rv.h, 0.025, own(new THREE.MeshBasicMaterial({ color: 0x6fae8a, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false }))));
    const l = outline(rv.x + 0.1, rv.y + 0.1, rv.w - 0.2, rv.h - 0.2, 0.05, 0x6fae8a, floors, 0.95);
    const dash = new THREE.LineDashedMaterial({ color: 0x6fae8a, dashSize: 0.8, gapSize: 0.5 }); l.material = own(dash); l.computeLineDistances();
    labelDefs.push({ id: 'zone:reserve', kind: 'zone', text: 'Expansion reserve (empty floor)', color: 0x6fae8a, prio: 3.1, pos: new THREE.Vector3(rv.x + rv.w / 2, 1.2, -(rv.y + rv.h / 2)) });
  }
  // walkway on the cross-aisles (0.8 m clear, areas.walkway) and along the aisle heads
  const walkMat = own(new THREE.MeshBasicMaterial({ color: 0x2fb36f, toneMapped: false }));
  const rails = [];
  for (const s of secInfo.sections) {
    const ox = s.origin.x, oy = s.origin.y;
    for (const ch of s.sc.channels || []) if (ch.role === 'cross') {
      const b = ch.box, along = (b.y1 - b.y0) > (b.x1 - b.x0);
      const w = 0.8, len = along ? b.y1 - b.y0 : b.x1 - b.x0, cx = ox + (b.x0 + b.x1) / 2, cy = oy + (b.y0 + b.y1) / 2;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(along ? w : len, along ? len : w), walkMat); m.rotation.x = -Math.PI / 2; m.position.set(cx, 0.145, -cy); m.renderOrder = 3; static_.add(m);
      for (const sg of [-1, 1]) rails.push(wbox(along ? 0.05 : len, 0.05, along ? len : 0.05, cx + (along ? sg * (w / 2 + 0.02) : 0), 1.0, -(cy + (along ? 0 : sg * (w / 2 + 0.02)))));
    }
  }
  if (rails.length) { const m = new THREE.Mesh(merge(rails.map((r2) => r2)), own(matFrom('safetyYellow'))); m.position.set(0, 0, 0); static_.add(m); }
  // bays at the 4.5 m door pitch: a marked floor rectangle per bay with its number, IN green, OUT blue
  const bayObjs = [];
  const cnt = { IN: 0, OUT: 0 };
  const bayMat = {}, bayOl = {}, bayGeo = { IN: [], OUT: [] }, bayLines = { IN: [], OUT: [] };
  for (const fl of ['IN', 'OUT']) { const col = fl === 'IN' ? ROLES.in.hex : ROLES.out.hex;
    bayMat[fl] = own(new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.34, depthWrite: false, toneMapped: false }));
    bayOl[fl] = own(new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.95, depthWrite: false })); }
  for (const d of secInfo.doors) {
    const r = d.rect, col = d.flow === 'IN' ? ROLES.in.hex : ROLES.out.hex;
    bayGeo[d.flow].push(new THREE.PlaneGeometry(r.w - 0.2, r.h - 0.2).rotateX(-Math.PI / 2).translate(r.x + 0.1 + (r.w - 0.2) / 2, 0.03, -(r.y + 0.1 + (r.h - 0.2) / 2)));
    const pts = rectPts(r.x + 0.1, r.y + 0.1, r.w - 0.2, r.h - 0.2, 0.04); for (let i = 0; i + 1 < pts.length; i++) bayLines[d.flow].push(pts[i], pts[i + 1]);
    cnt[d.flow]++;
    labelDefs.push({ id: `bay:${d.flow}${cnt[d.flow]}`, kind: 'zone', text: `${d.flow} ${cnt[d.flow]}`, color: col, prio: 3.5, pos: new THREE.Vector3(r.x + r.w / 2, 0.9, -(r.y + r.h / 2)) });
    bayObjs.push({ d, mat: bayMat[d.flow], ol: { material: bayOl[d.flow] }, col });
  }
  for (const fl of ['IN', 'OUT']) if (bayGeo[fl].length) {
    const m = new THREE.Mesh(merge(bayGeo[fl]), bayMat[fl]); m.receiveShadow = true; floors.add(m);
    floors.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(bayLines[fl]), bayOl[fl]));
  }
  // picking conveyor loop for dock case U (IN and OUT on the same side): around the staging zone, inset 1.1 m. *assumption*: the loop is drawn from the staging zone
  // rectangle; the model has no loop field yet (R10 `areas`, listed in the R9b report)
  let loop = null;
  const pl = sc.picking_loop;                                  // R10b: the model's loop (on, rect = bounding box of the picking and consolidation zones, length_m); the zone derivation is the fallback
  if (pl ? pl.on : (plan['plan.dock_case'] === 'U' || (rep.docks && rep.docks.case === 'U'))) {
    const st = zoneObjs.staging && zoneObjs.staging.z.rect, co = zoneObjs.consolidation && zoneObjs.consolidation.z.rect;
    const rr = pl && pl.rect ? pl.rect : st && co ? { x: Math.min(st.x, co.x), y: Math.min(st.y, co.y), w: Math.max(st.x + st.w, co.x + co.w) - Math.min(st.x, co.x), h: Math.max(st.y + st.h, co.y + co.h) - Math.min(st.y, co.y) } : st || co;
    if (rr && rr.w > 4 && rr.h > 4) {
      const i = 1.1, x0 = rr.x + i, y0 = rr.y + i, x1 = rr.x + rr.w - i, y1 = rr.y + rr.h - i;
      const frame = own(matFrom('conveyorFrame')), top = own(matFrom('roller'));
      const parts = [], tops = [];
      for (const [ax, ay, bx, by] of [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]]) {
        const horiz = ay === by, len = Math.abs(horiz ? bx - ax : by - ay) + 0.8;
        tops.push(wbox(horiz ? len : 0.8, 0.06, horiz ? 0.8 : len, (ax + bx) / 2, 0.6, -(ay + by) / 2));
        parts.push(wbox(horiz ? len : 0.8, 0.22, horiz ? 0.8 : len, (ax + bx) / 2, 0.45, -(ay + by) / 2));
        for (const px of [ax, bx]) parts.push(wbox(0.1, 0.45, 0.1, horiz ? px : ax, 0.225, -(horiz ? ay : px === ax ? ay : by)));
      }
      const a = new THREE.Mesh(merge(tops), top); const b = new THREE.Mesh(merge(parts), frame); a.castShadow = b.castShadow = true; static_.add(a, b);
      const len = pl && pl.length_m ? pl.length_m : 2 * ((x1 - x0) + (y1 - y0));
      loop = { x: rr.x, y: rr.y, w: rr.w, h: rr.h, length_m: len };
      labelDefs.push({ id: 'zone:loop', kind: 'zone', text: `Picking conveyor loop (${len.toFixed(0)} m)`, color: ROLES.out.hex, prio: 3.2, pos: new THREE.Vector3(rr.x + rr.w / 2, 2.2, -(rr.y + rr.h / 2)) });
    }
  }
  // props: one forklift at the docks (outside the automated block), operators only in the manned zones
  const props = new THREE.Group(); props.name = 'props'; g.add(props);
  const forklift = opt.makeForklift && opt.makeForklift();
  const inDoor = secInfo.doors.find((d) => d.flow === 'IN') || secInfo.doors[0];
  if (forklift && inDoor) {
    const px = inDoor.x + inDoor.nx * 6 + (inDoor.nx ? 0 : 5), py = inDoor.y + inDoor.ny * 6 + (inDoor.ny ? 0 : 5);
    forklift.position.set(px, 0, -py); forklift.rotation.y = Math.atan2(inDoor.ny, inDoor.nx) + Math.PI; props.add(forklift);
  }
  if (opt.makePerson) for (const z of zones) if (MANNED.has(z.key)) {
    const r = z.rect, mezz = z.level === 'mezzanine', n = z.key === 'staging' ? 2 : 1;
    for (let k = 0; k < n; k++) { const p = opt.makePerson(); p.position.set(r.x + r.w * (0.35 + 0.3 * k), mezz ? MZ_Z : 0, -(r.y + r.h * 0.5)); p.rotation.y = 0.7 + k * 1.9; props.add(p); }
  }
  // static props (forklift, operators): baked into one mesh per material
  { props.updateMatrixWorld(true); const byMat = new Map();
    props.traverse((o) => { if (!o.isMesh) return; const gm = o.geometry.clone().applyMatrix4(o.matrixWorld); const k = o.material; if (!byMat.has(k)) byMat.set(k, []); byMat.get(k).push(gm); });
    props.clear();
    for (const [mat, geos] of byMat) { const m = new THREE.Mesh(merge(geos), mat); m.castShadow = true; m.matrixAutoUpdate = true; props.add(m); } }
  const api = {
    group: g, zones: zoneObjs, bays: bayObjs, loop, mats, labelDefs,
    setVisible(on) { volumes.visible = on; floors.visible = on; },
    setWalls(on) { walls.visible = !!on; },
    setDockDown(flow, on) { for (const b of bayObjs) if (b.d.flow === flow) { b.mat.color.setHex(on ? 0x9aa0a6 : b.col); b.ol.material.color.setHex(on ? 0xb3261e : b.col); } },
    dispose() { mats.forEach((m) => m.dispose()); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map) o.material.map.dispose(); }); },
  };
  return api;
}
