// Static and slow world (B4): floor, rack steel, pallets, aisle decks, shell with cut-away, docks, conveyors, luminaires.
// Built from `report.scene` only. Canonical frame: u along the lane columns, v across them, z up (see kit.js makeFrame).
import { THREE, rng, makeFrame, matFrom, tok, cbox, wbox, merge, scaleUV, cyl, clamp } from './kit.js';
import { ROLES } from '../../design/tokens.js';

const PH = 0.144;        // pallet height (m), spec
const ZR = 0.16;         // pallet seating height above the tier level (rail top)
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _d = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

/** Growable list of box instances in canonical coordinates. */
class Packer {
  constructor(f) { this.f = f; this.arr = []; this.n = 0; }
  box(u0, u1, v0, v1, z0, z1) {
    const f = this.f;
    f.pos((u0 + u1) / 2, (v0 + v1) / 2, (z0 + z1) / 2, _p); f.size(Math.abs(u1 - u0), Math.abs(v1 - v0), Math.abs(z1 - z0), _s);
    _m.compose(_p, _q.identity(), _s); this.arr.push(..._m.elements); this.n++;
  }
  /** thin member between two canonical points */
  /** unit-height upright geometry placed at (u, v), centre height zc, scaled to height sy */
  at(u, v, zc, sy) {
    this.f.pos(u, v, zc, _p); _s.set(1, sy, 1);
    _m.compose(_p, _q.identity(), _s); this.arr.push(..._m.elements); this.n++;
  }
  bar(u0, v0, z0, u1, v1, z1, t) {
    const f = this.f;
    f.pos(u0, v0, z0, _p); f.pos(u1, v1, z1, _d); _d.sub(_p); const len = _d.length();
    _p.addScaledVector(_d, 0.5); _q.setFromUnitVectors(Y, _d.normalize()); _s.set(t, len, t);
    _m.compose(_p, _q, _s); this.arr.push(..._m.elements); this.n++;
  }
  mesh(material, { cast = false, receive = false, geo } = {}) {
    const m = new THREE.InstancedMesh(geo || new THREE.BoxGeometry(1, 1, 1), material, Math.max(1, this.n));
    m.instanceMatrix.array.set(this.arr.slice(0, this.n * 16)); m.count = this.n;
    m.instanceMatrix.needsUpdate = true; m.castShadow = cast; m.receiveShadow = receive;
    m.computeBoundingSphere(); m.matrixAutoUpdate = false;
    return m;
  }
}

export function buildWorld(rep, opt) {
  const sc = opt.sc || rep.scene, f = makeFrame(sc), T = opt.textures, small = !!opt.small, rackOnly = !!opt.rackOnly;   // R9b: a section scene (block of an L / U / T footprint) builds only its rack, lifts, docks and conveyors
  const B = sc.building, tiers = sc.tiers, LEV = sc.tier_pitch, tz = sc.tier_z;
  const nc = sc.columns.count, cp = sc.columns.pitch, c0 = sc.columns.start, uLen = sc.columns.length;
  const ld = sc.load, CH = ld.height - PH;
  const root = new THREE.Group(); root.name = 'world';
  const mats = [];                          // materials owned by this world
  const own = (m) => { mats.push(m); return m; };
  // FIX (R13a): positions counted every column (old cause: cross-aisle and walkway columns have no lane); the model's store_columns (scene.blocks_info) are the lane columns
  const nStore = sc.columns.store != null ? sc.columns.store : nc - (sc.columns.skip || []).length;
  const positions = sc.blocks.reduce((a, b) => a + nStore * b.depth * tiers, 0) - (sc.shaft_cells ? sc.shaft_cells.reduce((a, c) => a + tiers * ((sc.modules.find((m) => m.index === c.module) || {}).depth || 0), 0) : 0);
  const big = positions > 9000 || small;
  const world = { root, f, sc, mats, own, T, tiers, LEV, tz, ZR, PH, CH, load: ld, positions, big };

  // ---------------------------------------------------------------- lifts: spread those that share a spot along the channel
  const lifts = sc.lifts.map((l) => ({ ...l, u: f.uOf(l.x, l.y), v: f.vOf(l.x, l.y) }));
  const groups = new Map();
  lifts.forEach((l) => { const k = Math.round(l.u * 2) + ':' + Math.round(l.v * 2); (groups.get(k) || groups.set(k, []).get(k)).push(l); });
  for (const g of groups.values()) if (g.length > 1) g.forEach((l, i) => { l.v += (i - (g.length - 1) / 2) * 1.6; });
  world.lifts = lifts;
  const shafts = new Set(lifts.filter((l) => l.shaft).map((l) => l.module + ':' + l.column));   // lane columns the lift shaft takes (both sides, every tier)
  // FIX (R9b): grid cross-aisles were not drawn (old cause: the scene had no field for grid_k); the columns in sc.columns.skip are cross-aisles (no lane, no rail)
  const skipCol = new Set(sc.columns.skip || []);
  // FIX (R13a): a lift shaft took the column on both sides of its aisle (old cause: the scene had no shaft cells); the model's `shaft_cells` (R12f) name one lane per shaft (side 0, all tiers); a second shaft in the same
  // cell takes the other side so the drawn lanes equal the counted positions
  const shaftKeys = new Set();
  for (const c of sc.shaft_cells || []) { let side = c.side || 0; if (shaftKeys.has(`${c.module}:${c.column}:${side}`)) side = 1 - side; shaftKeys.add(`${c.module}:${c.column}:${side}`); }
  const lost = (mod, i, side) => (sc.shaft_cells ? shaftKeys.has(`${mod}:${i}:${side}`) : shafts.has(mod + ':' + i)) || skipCol.has(i);

  // ---------------------------------------------------------------- docks, doors, conveyors (world coordinates)
  const NRM = { W: [-1, 0], E: [1, 0], S: [0, -1], N: [0, 1] };
  const docks = {};
  for (const k of ['in', 'out']) { const d = sc.docks[k]; if (d) docks[k] = { ...d, nx: NRM[d.wall][0], ny: NRM[d.wall][1], s: (d.wall === 'W' || d.wall === 'E') ? d.y : d.x }; }
  if (docks.in && docks.out && docks.in.wall === docks.out.wall && Math.abs(docks.in.s - docks.out.s) < 4.6) {
    const mid = (docks.in.s + docks.out.s) / 2;
    docks.in.s = mid - 2.4; docks.out.s = mid + 2.4;
  }
  for (const d of Object.values(docks)) {
    if (!rackOnly) {
      d.x = d.wall === 'W' ? 0 : d.wall === 'E' ? B.L : d.s;
      d.y = d.wall === 'S' ? 0 : d.wall === 'N' ? B.W : d.s;
    }
    d.u = f.uOf(d.x, d.y); d.v = f.vOf(d.x, d.y);
  }
  world.docks = docks;
  // conveyor path in canonical coordinates from the dock to each lift
  // R10b: the model's conveyor routes (scene.conveyors: dock wall -> dock point -> along the dock row -> lift deck) when present; the last point follows the spread lift position.
  // The Manhattan route below is the fallback for reports without the field.
  const conv = lifts.map((l) => {
    const mc = (sc.conveyors || []).find((c) => c.lift === l.id);
    if (mc && mc.points && mc.points.length > 1) {
      const pts = mc.points.map((p) => [f.uOf(p.x, p.y), f.vOf(p.x, p.y)]); pts[pts.length - 1] = [l.u, l.v];
      return { lift: l.id, group: mc.flow || (l.group === 'IN' ? 'IN' : 'OUT'), path: pts, fromModel: true };
    }
    const d = docks[l.group === 'IN' ? 'in' : 'out'] || docks.in || docks.out;
    if (!d) return { lift: l.id, group: l.group, path: [[l.u, l.v], [l.u + 0.01, l.v]] };
    const wallX = d.wall === 'W' || d.wall === 'E';
    const lx = f.wx(l.u, l.v), ly = f.wy(l.u, l.v);            // lift position after spreading, world
    const m2 = wallX ? { x: lx, y: d.y } : { x: d.x, y: ly };    // run along the wall's inward axis first
    const pts = [[d.x, d.y], [m2.x, m2.y], [lx, ly]].map(([x, y]) => [f.uOf(x, y), f.vOf(x, y)]);
    return { lift: l.id, group: l.group, path: pts };
  });
  world.conveyors = conv;
  // lane slots hit by a conveyor on the ground tier are left empty (visual only)
  const hitsConveyor = (u, v, hu, hv) => conv.some((c) => { for (let i = 0; i + 1 < c.path.length; i++) {
    const [a0, b0] = c.path[i], [a1, b1] = c.path[i + 1];
    if (u >= Math.min(a0, a1) - hu - 0.55 && u <= Math.max(a0, a1) + hu + 0.55 && v >= Math.min(b0, b1) - hv - 0.55 && v <= Math.max(b0, b1) + hv + 0.55) return true;
  } return false; });

  const lineMat = own(matFrom('safetyWhite', { roughness: 0.9 }));
  const hazMat = own(new THREE.MeshStandardMaterial({ map: T.hazard, roughness: 0.75 }));
  if (!rackOnly) {
  // ---------------------------------------------------------------- floor and yard
  const floorMat = own(matFrom('floor', { color: 0xffffff, map: T.concrete, roughness: 0.62 }));
  const ft = T.concrete.clone(); ft.repeat.set(B.L / 6, B.W / 6); ft.needsUpdate = true; ft.userData = {}; floorMat.map = ft;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(B.L, B.W), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(B.L / 2, 0.004, -B.W / 2); floor.receiveShadow = true; floor.name = 'floor';
  root.add(floor);
  const apronMat = own(matFrom('floorApron', { color: 0xffffff, map: T.asphalt }));
  const at = T.asphalt.clone(); at.repeat.set(60, 60); at.needsUpdate = true; at.userData = {}; apronMat.map = at;
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), apronMat);
  apron.rotation.x = -Math.PI / 2; apron.position.set(B.L / 2, -0.01, -B.W / 2); apron.receiveShadow = true; root.add(apron);
  world.floorMat = floorMat; world.apronMat = apronMat;

  // yard bay lines and apron stripes near the docks
  const flat = (cx, cy, sx, sy, mat, y = 0.012) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sy), mat); m.rotation.x = -Math.PI / 2; m.position.set(cx, y, -cy); m.receiveShadow = true; root.add(m); return m; };
  for (const d of Object.values(docks)) {
    const along = d.wall === 'W' || d.wall === 'E';
    const px = d.x + d.nx * 7.5, py = d.y + d.ny * 7.5;
    for (const sgn of [-1, 1]) flat(px + (along ? 0 : sgn * 1.9), py + (along ? sgn * 1.9 : 0), along ? 15 : 0.12, along ? 0.12 : 15, lineMat, -0.005);
    // hazard stripe along the inside of the dock door
    const hz = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(along ? 0.5 : 3.6, along ? 3.6 : 0.5), along ? 1 : 7, along ? 7 : 1), hazMat);
    hz.rotation.x = -Math.PI / 2; hz.position.set(d.x - d.nx * 0.55, 0.014, -(d.y - d.ny * 0.55)); root.add(hz);
  }
  }
  for (const l of lifts) {                       // hazard frame around each lift cage
    const t = 0.18, hw = 0.95, hh = 0.85;
    for (const [du, dv, su, sv] of [[0, hh, hw * 2, t], [0, -hh, hw * 2, t], [hw, 0, t, hh * 2], [-hw, 0, t, hh * 2]]) {
      const g = new THREE.PlaneGeometry(f.swap ? sv : su, f.swap ? su : sv); scaleUV(g, 3, 0.4);
      const m = new THREE.Mesh(g, hazMat); m.rotation.x = -Math.PI / 2; const p = f.pos(l.u + du, l.v + dv, 0.016); m.position.copy(p); root.add(m);
    }
  }

  // ---------------------------------------------------------------- rack: lanes, steel
  const modules = sc.modules.map((m) => ({ ...m, a: f.box(m.aisle) }));
  const blocks = sc.blocks.map((b) => { const bb = f.box(b.box); return { ...b, ...bb, aisleMod: modules[b.module], pitch: (bb.v1 - bb.v0) / b.depth, dir: b.side === 0 ? -1 : 1, vNear: b.side === 0 ? bb.v1 : bb.v0 }; });
  world.blocks = blocks; world.modules = modules;

  const post = new Packer(f), beams = new Packer(f), rails = new Packer(f), braces = new Packer(f), guards = new Packer(f), strips = new Packer(f);
  const Hr = tiers * LEV;
  for (const b of blocks) {
    const rows = []; for (let r = 0; r < b.depth; r += 2) rows.push(r); rows.push(b.depth);
    const vr = (r) => b.vNear + b.dir * r * b.pitch;
    for (const r of rows) for (let i = 0; i <= nc; i++) {
      post.at(c0 + i * cp, vr(r), (Hr + 0.1) / 2, Hr + 0.1);
      if (r === 0 || i === 0) guards.box(c0 + i * cp - 0.07, c0 + i * cp + 0.07, vr(r) - 0.07, vr(r) + 0.07, 0, 0.4);     // column guards: aisle side and front channel side
    }
    for (let i = 0; i <= nc; i++) for (let k = 0; k + 1 < rows.length; k++) {
      const va = vr(rows[k]), vb = vr(rows[k + 1]), uu = c0 + i * cp;
      for (let t = 0; t < tiers; t += (big ? 2 : 1)) {
        const z0 = t * LEV + 0.2, z1 = Math.min(Hr, (t + (big ? 2 : 1)) * LEV) - 0.1;
        if ((t + k + i) % 2) braces.bar(uu, va, z0, uu, vb, z1, 0.035); else braces.bar(uu, va, z1, uu, vb, z0, 0.035);
      }
    }
    for (let t = 0; t < tiers; t++) {
      for (const r of rows) beams.box(c0, c0 + uLen, vr(r) - 0.025, vr(r) + 0.025, tz[t] + 0.02, tz[t] + 0.12);
      for (let i = 0; i < nc; i++) {
        if (lost(b.module, i, b.side)) continue;
        const uc = c0 + (i + 0.5) * cp;
        for (const sgn of [-1, 1]) rails.box(uc + sgn * 0.5 - 0.03, uc + sgn * 0.5 + 0.03, Math.min(b.vNear, b.vNear + b.dir * b.depth * b.pitch), Math.max(b.vNear, b.vNear + b.dir * b.depth * b.pitch), tz[t] + 0.12, tz[t] + ZR);
      }
    }
  }
  // aisle rails (along u) and channel rails (along v) on every tier
  const decks = [];
  for (const m of modules) for (let t = 0; t < tiers; t++) {
    const vc = (m.a.v0 + m.a.v1) / 2;
    for (const sgn of [-1, 1]) rails.box(m.a.u0, m.a.u1, vc + sgn * 0.5 - 0.03, vc + sgn * 0.5 + 0.03, tz[t] + 0.12, tz[t] + ZR);
    decks.push({ u0: m.a.u0, u1: m.a.u1, v0: m.a.v0, v1: m.a.v1, z: tz[t] + 0.11 });
  }
  const chans = sc.channels.map((c) => ({ ...c, c: f.box(c.box) }));
  world.channels = chans;
  for (const ch of chans) for (let t = 0; t < tiers; t++) {
    const uc = (ch.c.u0 + ch.c.u1) / 2;
    for (const sgn of [-1, 1]) rails.box(uc + sgn * 0.5 - 0.03, uc + sgn * 0.5 + 0.03, ch.c.v0, ch.c.v1, tz[t] + 0.12, tz[t] + ZR);
    decks.push({ u0: ch.c.u0, u1: ch.c.u1, v0: ch.c.v0, v1: ch.c.v1, z: tz[t] + 0.11 });
    // beam under the channel deck, so it reads as a platform edge
    beams.box(ch.c.u0, ch.c.u0 + 0.05, ch.c.v0, ch.c.v1, tz[t] + 0.02, tz[t] + 0.12);
    beams.box(ch.c.u1 - 0.05, ch.c.u1, ch.c.v0, ch.c.v1, tz[t] + 0.02, tz[t] + 0.12);
  }
  // grating decks merged into one mesh
  const gratingMat = own(new THREE.MeshStandardMaterial({ map: T.grating, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.4, color: 0xffffff }));
  if (decks.length) {
    const parts = decks.map((d) => {
      const gw = f.swap ? d.v1 - d.v0 : d.u1 - d.u0, gh = f.swap ? d.u1 - d.u0 : d.v1 - d.v0;
      const g = scaleUV(new THREE.PlaneGeometry(gw, gh), gw / 0.5, gh / 0.5);
      g.rotateX(-Math.PI / 2); const p = f.pos((d.u0 + d.u1) / 2, (d.v0 + d.v1) / 2, d.z); return g.translate(p.x, p.y, p.z);
    });
    const dm = new THREE.Mesh(merge(parts), gratingMat); dm.receiveShadow = true; dm.name = 'decks'; root.add(dm);
  }

  // open-back C profile 90 x 70 mm with returns (spec); height 1, scaled per instance
  const postGeo = merge([cbox(f, 0.02, 0.09, 1, 0.025, 0, 0), cbox(f, 0.07, 0.02, 1, 0, 0.035, 0), cbox(f, 0.07, 0.02, 1, 0, -0.035, 0)]);
  const mUp = own(matFrom('rackUpright')), mBrace = own(matFrom('rackBrace')), mBeam = own(matFrom('rackBeam')), mProt = own(matFrom('rackProtector')), mRail = own(matFrom('rail'));
  const steel = new THREE.Group(); steel.name = 'steel';
  steel.add(post.mesh(mUp, { cast: true, geo: postGeo }), braces.mesh(mBrace), beams.mesh(mBeam, { cast: true, receive: true }), rails.mesh(mRail), guards.mesh(mProt));
  root.add(steel);
  world.counts = { posts: post.n, braces: braces.n, beams: beams.n, rails: rails.n };

  // floor contact AO under every block (baked canvas gradient)
  const aoCache = new Map();
  const aoTex = (w, d) => {
    const key = Math.round(w) + 'x' + Math.round(d);
    if (aoCache.has(key)) return aoCache.get(key);
    const pxm = 12, W = Math.max(8, Math.round((w + 1.2) * pxm)), Hh = Math.max(8, Math.round((d + 1.2) * pxm)), cv = document.createElement('canvas');
    cv.width = W; cv.height = Hh; const g = cv.getContext('2d');
    const img = g.createImageData(W, Hh);
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const dx = Math.max(0.6 - x / pxm, x / pxm - (W / pxm - 0.6), 0), dy = Math.max(0.6 - y / pxm, y / pxm - (Hh / pxm - 0.6), 0);
      const dist = Math.hypot(dx, dy), a = dist <= 0 ? 0.4 : Math.max(0, 0.4 * (1 - dist / 0.6) ** 2);
      const i = (y * W + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 0; img.data[i + 3] = a * 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; aoCache.set(key, t); return t;
  };
  const aoMats = [];
  for (const b of blocks) {
    const w = b.u1 - b.u0, d = b.v1 - b.v0, tex = aoTex(f.swap ? d : w, f.swap ? w : d);
    const mat = own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false })); aoMats.push(mat);
    const m = new THREE.Mesh(new THREE.PlaneGeometry((f.swap ? d : w) + 1.2, (f.swap ? w : d) + 1.2), mat);
    m.rotation.x = -Math.PI / 2; m.position.copy(f.pos((b.u0 + b.u1) / 2, (b.v0 + b.v1) / 2, 0.008)); m.renderOrder = 1; root.add(m);
  }
  world.aoTextures = [...aoCache.values()];

  // ---------------------------------------------------------------- lanes and pallets
  const lanes = [];
  const tg = Math.max(1, Math.ceil(tiers / 4));
  const maxChunks = 28;
  let groupsPerBlock = tg;
  if (blocks.length * tg > maxChunks) groupsPerBlock = 1;
  const tiersPerGroup = Math.ceil(tiers / groupsPerBlock);
  const chunks = [];
  // FIX (R17b): the drawn pallets follow the expected stored pallets (positions x lane fill, honeycombing), the figure the capacity verdict uses. Old cause: planned stock at 85 % fill, which drew 1,958 pallets in the 2,304-position example that stores 1,344.
  // FIX (R18e): the drawn fill is the expected stored share only (old cause: the planned `headline.stock` was the fallback for a missing expected_stored, and a missing headline fell back to a typed 0.85; both are now replaced by an explicit no-pallets draw with a warning)
  const hl = rep.headline || {}, fillOk = hl.positions > 0 && hl.expected_stored != null;
  if (!fillOk) console.warn('[scene] headline.expected_stored / positions missing: no pallets drawn (n/a)');
  const fill = fillOk ? clamp(hl.expected_stored / hl.positions, 0, 1) : 0;
  const R = rng(20261104);
  blocks.forEach((b, bi) => {
    for (let g = 0; g < groupsPerBlock; g++) {
      const t0 = g * tiersPerGroup, t1 = Math.min(tiers, t0 + tiersPerGroup);
      chunks.push({ block: bi, t0, t1, n: 0, lanes: [] });
    }
  });
  const chunkOf = (bi, t) => chunks[bi * groupsPerBlock + Math.floor(t / tiersPerGroup)];
  blocks.forEach((b, bi) => {
    for (let t = 0; t < tiers; t++) for (let i = 0; i < nc; i++) {
      if (lost(b.module, i, b.side)) continue;
      const u = c0 + (i + 0.5) * cp, ch = chunkOf(bi, t);
      // FIX (R13a): ground-tier lanes under a conveyor were not built (old cause: visual-only `continue`, so drawn positions fell short of the model's count, 2,196 of 2,304 on the example); the lane is built and kept empty (`blocked`)
      const blocked = t === 0 && hitsConveyor(u, b.vNear + b.dir * b.depth * b.pitch / 2, ld.across / 2, b.depth * b.pitch / 2);
      const lane = { blocked, id: lanes.length, b: bi, mod: b.module, side: b.side, col: i, tier: t, depth: b.depth, u, vNear: b.vNear, dir: b.dir, pitch: b.pitch, count: 0, chunk: ch, first: ch.n, sku: R() };
      ch.n += b.depth; ch.lanes.push(lane); lanes.push(lane);
    }
  });
  world.lanes = lanes; world.chunks = chunks;
  // expected stored pallets: lanes filled from the back; counts adjusted to the stored total of the report
  const usable = lanes.filter((l) => !l.blocked);
  const total = Math.round(fill * usable.reduce((a, l) => a + l.depth, 0));
  let have = 0;
  for (const l of usable) { const x = clamp(fill + (R() - 0.5) * 0.9, 0, 1); l.count = Math.round(x * l.depth); have += l.count; }
  for (let guard = 0; have !== total && guard < 200000; guard++) {
    const l = usable[R.int(usable.length)];
    if (have < total && l.count < l.depth) { l.count++; have++; } else if (have > total && l.count > 0) { l.count--; have--; }
  }
  world.stock = have;

  // geometry of one pallet (base) and one load
  const nBoxes = big ? 1 : 4;
  const baseGeo = nBoxes === 1 ? cbox(f, ld.across, ld.along, PH, 0, 0, PH / 2)
    : merge([cbox(f, ld.across, ld.along * 0.98, 0.03, 0, 0, PH - 0.015), ...[-1, 0, 1].map((k) => cbox(f, 0.14, ld.along, 0.09, k * (ld.across / 2 - 0.07), 0, 0.045 + 0.0))]);
  const loadGeo = cbox(f, ld.across - 0.04, ld.along - 0.04, CH, 0, 0, PH + CH / 2);
  const palletMat = own(matFrom('pallet', { color: 0xffffff }));
  const cartonMat = own(matFrom('carton', { color: 0xffffff, map: T.carton }));
  world.palletGeo = baseGeo; world.loadGeo = loadGeo; world.palletMat = palletMat; world.cartonMat = cartonMat;
  const woodC = new THREE.Color(tok('pallet').color), cartC = new THREE.Color(tok('carton').color);
  for (const ch of chunks) {
    const n = Math.max(1, ch.n);
    ch.base = new THREE.InstancedMesh(baseGeo, palletMat, n); ch.load = new THREE.InstancedMesh(loadGeo, cartonMat, n);
    for (const m of [ch.base, ch.load]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.receiveShadow = true; m.matrixAutoUpdate = false; m.count = ch.n; root.add(m); }
    ch.base.name = 'pallets'; ch.load.name = 'loads';
  }
  const _zs = new THREE.Vector3(0, 0, 0);
  const col = new THREE.Color();
  // ABC class of a storage cell (column, tier). FIX (R9b): the class came from the column only (distance to the nearest lift), so C pallets sat on the same low tiers as A and
  // A was spread over every tier. Now the access score is the lift distance (share of the aisle length) plus the tier height (share of the rack height), equal weights, ranked
  // over all cells: 20 % A, 30 % B, 50 % C of the positions (ABC rule of the model: 20/30/50 % positions) so A sits low and near the lifts. *assumption*: the report has no cell map.
  const dist = (u) => Math.min(...lifts.map((l) => Math.abs(u - l.u)), 1e9);
  const cellScore = (c, t) => dist(c0 + (c + 0.5) * cp) / Math.max(1, uLen) + 1.2 * (t / Math.max(1, tiers - 1));
  const clsMap = new Map();
  if (sc.abc_cells && sc.abc_cells.rows && sc.abc_cells.rows.length) {
    // R10b: the model's access-index map (tier first, then aisle time to the nearest station): one letter per lane column, column 0 at the aisle head; valid for every aisle
    const rows = sc.abc_cells.rows, laneCols = []; for (let c = 0; c < nc; c++) if (!skipCol.has(c)) laneCols.push(c);
    // FIX (R21b, G9): a per-block map (L / U / T, scene.abc_cells.blocks[]) is indexed by the block's own column number (support columns are '-' and carry no lanes); the single map of a rectangle
    // is one letter per lane column, column 0 at the aisle head.
    const perBlock = !!sc.abc_cells.perBlock;
    laneCols.forEach((c, rank0) => {
      const rank = perBlock ? c : sc.head_high ? laneCols.length - 1 - rank0 : rank0;
      for (let t = 0; t < tiers; t++) { const row = rows[Math.min(t, rows.length - 1)] || ''; const ch = row[Math.min(rank, row.length - 1)] || 'C'; clsMap.set(c * 64 + t, ch === 'A' ? 0 : ch === 'B' ? 1 : 2); }
    });
  } else {
  const cells = [];
  for (let c = 0; c < nc; c++) { if (skipCol.has(c)) continue; for (let t = 0; t < tiers; t++) cells.push({ c, t, s: cellScore(c, t) }); }
  cells.sort((a, b) => a.s - b.s);
  cells.forEach((x, r) => clsMap.set(x.c * 64 + x.t, r < cells.length * 0.2 ? 0 : r < cells.length * 0.5 ? 1 : 2));
  }
  const clsOf = (lane) => clsMap.get(lane.col * 64 + lane.tier) ?? 2;
  const cls = [];
  const abcCol = [tok('abcA').color, tok('abcB').color, tok('abcC').color].map((c) => new THREE.Color(c));
  world.abc = false; world.cls = cls; world.clsOf = clsOf;
  world.slotPos = (lane, j, out) => f.pos(lane.u, lane.vNear + lane.dir * (j + 0.5) * lane.pitch, world.tz[lane.tier] + ZR, out);
  function paintSlot(lane, j) {
    const ch = lane.chunk, idx = lane.first + j, occ = j >= lane.depth - lane.count;
    if (!occ) { world.slotPos(lane, j, _p); _m.compose(_p, _q.identity(), _zs); ch.base.setMatrixAt(idx, _m); ch.load.setMatrixAt(idx, _m); return; }
    const rr = rng((lane.id * 131 + j * 17 + lane.count * 7) | 0);
    world.slotPos(lane, j, _p);
    _p.x += (rr() - 0.5) * 0.016; _p.z += (rr() - 0.5) * 0.016;
    _q.setFromAxisAngle(Y, (rr() - 0.5) * 0.052); _s.set(1, 1, 1);
    _m.compose(_p, _q, _s); ch.base.setMatrixAt(idx, _m); ch.load.setMatrixAt(idx, _m);
    const shade = 1 - 0.35 * (lane.depth > 1 ? j / (lane.depth - 1) : 0), lj = 1 + (lane.sku - 0.5) * 0.16;
    col.copy(woodC).multiplyScalar((0.94 + rr() * 0.12) * shade); ch.base.setColorAt(idx, col);
    if (world.abc) col.copy(abcCol[clsOf(lane)]); else { col.copy(cartC); col.offsetHSL((lane.sku - 0.5) * 0.04, 0, (lane.sku - 0.5) * 0.1); }
    col.multiplyScalar(shade * (world.abc ? 1 : lj)); ch.load.setColorAt(idx, col);
  }
  function paintAll() {
    for (const l of lanes) for (let j = 0; j < l.depth; j++) paintSlot(l, j);
    for (const ch of chunks) { for (const m of [ch.base, ch.load]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); } }
  }
  paintAll();
  world.paintLane = (lane) => { for (let j = 0; j < lane.depth; j++) paintSlot(lane, j); const ch = lane.chunk; for (const m of [ch.base, ch.load]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } };
  world.setABC = (on) => { world.abc = !!on; paintAll(); };

  // ---------------------------------------------------------------- luminaires (emissive strips, no real light each)
  const lum = new Packer(f);
  const zl = B.H - 1.0;
  for (const m of modules) { const vc = (m.a.v0 + m.a.v1) / 2; for (let u = m.a.u0 + 3; u < m.a.u1; u += 6) lum.box(u - 0.6, u + 0.6, vc - 0.08, vc + 0.08, zl, zl + 0.05); }
  if (lum.n) {
    const lumMat = own(matFrom('lightStrip')); world.lumMat = lumMat;
    const lm = lum.mesh(lumMat); lm.name = 'luminaires'; root.add(lm);
  }

  // ---------------------------------------------------------------- conveyors (roller, +0.6 m)
  const convMat = own(new THREE.MeshStandardMaterial({ map: T.rollers.clone(), roughness: 0.4, metalness: 0.6, color: 0xffffff }));
  convMat.map.needsUpdate = true; convMat.map.userData = {}; world.convMat = convMat;
  const convFrame = own(matFrom('conveyorFrame'));
  const convHeight = 0.6;
  world.convZ = convHeight;
  const done = new Set();
  conv.forEach((c) => {
    for (let i = 0; i + 1 < c.path.length; i++) {
      const [a0, b0] = c.path[i], [a1, b1] = c.path[i + 1];
      const key = [a0, b0, a1, b1].map((x) => x.toFixed(2)).join(',');
      if (done.has(key) || (Math.abs(a1 - a0) + Math.abs(b1 - b0)) < 0.05) continue; done.add(key);
      const len = Math.hypot(a1 - a0, b1 - b0), along = Math.abs(a1 - a0) > Math.abs(b1 - b0);
      const su = along ? len + 1.0 : 1.0, sv = along ? 1.0 : len + 1.0;
      const top = new THREE.Mesh(scaleUV(cbox(f, su, sv, 0.05, 0, 0, 0), along ? su / 0.16 : 1, along ? 1 : sv / 0.16), convMat);
      top.position.copy(f.pos((a0 + a1) / 2, (b0 + b1) / 2, convHeight - 0.08)); top.receiveShadow = true; root.add(top);
      const side = (k) => (along ? cbox(f, su, 0.06, 0.2, 0, k * 0.5, -0.04) : cbox(f, 0.06, sv, 0.2, k * 0.5, 0, -0.04));
      const frm = new THREE.Mesh(merge([side(-1), side(1)]), convFrame);
      frm.position.copy(f.pos((a0 + a1) / 2, (b0 + b1) / 2, convHeight - 0.08)); root.add(frm);
    }
  });

  // ---------------------------------------------------------------- shell with cut-away
  if (!rackOnly) buildShell(world, own, T, docks);
  return world;
}

// ===================================================================== shell
function buildShell(world, own, T, docks) {
  const { root, sc } = world, B = sc.building;
  const wallBase = matFrom('wallPanel', { color: 0xffffff, map: T.cladding, side: THREE.DoubleSide });
  const roofBase = matFrom('roof', { side: THREE.DoubleSide });
  const plinthMat = own(matFrom('wallPlinth'));
  const doorMat = own(matFrom('dockDoor'));
  const shelterMat = own(matFrom('dockBumper', { roughness: 0.9 }));
  const dark = own(matFrom('safetyBlack'));
  const shell = { walls: {}, cut: 'closed', tweens: new Map(), mats: [] };
  const H = B.H;
  const doorW = 3.0, doorH = 3.2;
  const wallDef = {
    S: { len: B.L, pos: (s) => [s, 0], rot: 0 },
    N: { len: B.L, pos: (s) => [s, B.W], rot: 0 },
    W: { len: B.W, pos: (s) => [0, s], rot: Math.PI / 2 },
    E: { len: B.W, pos: (s) => [B.L, s], rot: Math.PI / 2 },
  };
  for (const [w, d] of Object.entries(wallDef)) {
    const mat = wallBase.clone(); own(mat); shell.mats.push(mat);
    const g = new THREE.Group(); g.name = 'wall' + w;
    const openings = Object.values(docks).filter((k) => k.wall === w).map((k) => k.s - 0 ).sort((a, b) => a - b);
    const cuts = []; let prev = 0;
    for (const c of openings) { cuts.push([prev, c - doorW / 2]); prev = c + doorW / 2; }
    cuts.push([prev, d.len]);
    const seg = (a, b, y0, y1) => {
      if (b - a < 0.01) return;
      const geo = scaleUV(new THREE.BoxGeometry(b - a, y1 - y0, 0.18), b - a, 1);
      const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true;
      const [px, py] = d.pos((a + b) / 2);
      m.position.set(px, (y0 + y1) / 2, -py); m.rotation.y = d.rot; g.add(m);
    };
    const plinthSeg = (a, b) => {
      if (b - a < 0.01) return;
      const pl = new THREE.Mesh(new THREE.BoxGeometry(b - a, 1.0, 0.22), plinthMat);
      const [qx, qy] = d.pos((a + b) / 2); pl.position.set(qx, 0.5, -qy); pl.rotation.y = d.rot; pl.receiveShadow = true; root.add(pl);
    };
    for (const [a, b] of cuts) { seg(a, b, 1.0, H); plinthSeg(a, b); }
    for (const c of openings) seg(c - doorW / 2, c + doorW / 2, doorH, H);   // lintel above each door opening
    // doors: sectional panel that rises when open
    for (const [k, dk] of Object.entries(docks)) if (dk.wall === w) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.06), doorMat);
      const [dx, dy] = d.pos(dk.s); door.position.set(dx, doorH / 2, -dy); door.rotation.y = d.rot; door.castShadow = true;
      g.add(door); dk.door = door; dk.doorY0 = door.position.y; dk.doorOpen = 0;
      // shelter frame, bumpers, hinged leveller (outside)
      const fr = new THREE.Group(); fr.position.set(dk.x + dk.nx * 0.55, 0, -(dk.y + dk.ny * 0.55)); fr.rotation.y = Math.atan2(dk.nx, -dk.ny); root.add(fr);
      for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.28, doorH + 0.4, 0.9), shelterMat); p.position.set(sx * (doorW / 2 + 0.2), (doorH + 0.4) / 2, 0); fr.add(p); }
      const top = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.8, 0.3, 0.9), shelterMat); top.position.set(0, doorH + 0.25, 0); fr.add(top);
      for (const sx of [-1, 1]) { const bp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.18), dark); bp.position.set(sx * 1.0, 1.0, 0.1 * 0 + 0.1); fr.add(bp); }
      const lev = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.07, 1.8), own(matFrom('leveller'))); lev.position.set(0, 0.95, 0.9); lev.userData.hinge = true; fr.add(lev); dk.leveller = lev;
      fr.updateMatrixWorld();
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.06), own(new THREE.MeshBasicMaterial({ color: 0x31865c }))); light.position.set(doorW / 2 + 0.6, doorH - 0.3, 0.5); fr.add(light); dk.light = light;
      const bol = merge([cyl(0.1, 1.0, doorW / 2 + 0.9, 0.5, 2.3, 'y', 8), cyl(0.1, 1.0, -(doorW / 2 + 0.9), 0.5, 2.3, 'y', 8)]);
      fr.add(new THREE.Mesh(bol, own(matFrom('safetyYellow'))));
    }
    shell.walls[w] = { group: g, mat }; root.add(g);
  }
  // roof with parapet and rooflights
  const rm = roofBase; own(rm); shell.mats.push(rm);
  const roof = new THREE.Group(); roof.name = 'roof';
  const slab = new THREE.Mesh(new THREE.BoxGeometry(B.L + 0.5, 0.3, B.W + 0.5), rm); slab.position.set(B.L / 2, H + 0.15, -B.W / 2); slab.castShadow = true; slab.receiveShadow = true; roof.add(slab);
  for (const [sx, sy, px, py] of [[B.L + 0.5, 0.5, B.L / 2, 0], [B.L + 0.5, 0.5, B.L / 2, B.W], [0.5, B.W, 0, B.W / 2], [0.5, B.W, B.L, B.W / 2]]) {
    const pm = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.6, sy), rm); pm.position.set(px, H + 0.6, -py); pm.castShadow = true; roof.add(pm);
  }
  const lightMat = own(new THREE.MeshStandardMaterial({ color: 0xcfe6f2, emissive: 0xbfe0f0, emissiveIntensity: 0.35, roughness: 0.2, transparent: true, opacity: 0.8 }));
  world.rooflightMat = lightMat;
  for (let k = 1; k <= 4; k++) { const rl = new THREE.Mesh(new THREE.BoxGeometry(Math.min(8, B.L * 0.12), 0.1, Math.min(2.4, B.W * 0.08)), lightMat); rl.position.set(B.L * k / 5, H + 0.34, -B.W / 2); roof.add(rl); }
  shell.walls.roof = { group: roof, mat: rm };
  root.add(roof);
  world.shell = shell;

  const setOpacity = (key, a) => {
    const w = shell.walls[key]; w.mat.opacity = a; w.mat.transparent = a < 0.999; w.mat.depthWrite = a > 0.5; w.group.visible = a > 0.01;
    if (key === 'roof') lightMat.opacity = 0.8 * a;
    w.group.traverse((o) => { if (o.isMesh && o.material !== w.mat) { /* doors share their own material, fade by visibility */ } });
  };
  for (const k of Object.keys(shell.walls)) shell.walls[k].a = 1;
  // targets per mode; `facing` is the wall that looks towards the camera when the cut is chosen
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
  shell.update = (dt) => {          // 600 ms fade
    if (!shell.goal) return;
    for (const k of Object.keys(shell.goal)) {
      const w = shell.walls[k], g = shell.goal[k];
      if (Math.abs(w.a - g) > 1e-3) { w.a += clamp((g - w.a), -dt / 0.6, dt / 0.6); if (Math.abs(w.a - g) < 1e-3) w.a = g; setOpacity(k, w.a); shell.changed = true; }
    }
  };
  shell.set('closed', 'S', false);
}
