// Scene kit (B4): coordinate frame, seeded random numbers, materials from tokens, canvas textures, small geometry helpers.
// Everything physical comes from report.scene; this file only turns metres into three.js objects.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MATERIALS } from '../../design/tokens.js';

export { THREE };

// ---------------------------------------------------------------- random
/** mulberry32: small, fast, seedable. */
export function rng(seed) {
  let a = seed >>> 0;
  const f = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (n) => Math.floor(f() * n);
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  /** exponential waiting time with mean 1/rate */
  f.exp = (rate) => -Math.log(1 - f()) / rate;
  return f;
}

// ---------------------------------------------------------------- frame
/**
 * Canonical (u, v, z): u runs along the lane columns (the aisles), v across them, z up. The report gives world x (east), y (north);
 * `columns.axis` says whether u is x or y. three.js: x east, y up, z = -north.
 */
export function makeFrame(sc, origin) {
  const swap = sc.columns.axis === 'y';
  const ox = origin ? origin.x : 0, oy = origin ? origin.y : 0;        // R9b: a section placed in the building (world = local + origin); the composite frame uses it, section worlds sit in a translated group
  const f = {
    swap, ox, oy,
    wx: (u, v) => (swap ? v : u) + ox,
    wy: (u, v) => (swap ? u : v) + oy,
    pos(u, v, z, out) { return (out || new THREE.Vector3()).set((swap ? v : u) + ox, z, -((swap ? u : v) + oy)); },
    uOf: (x, y) => (swap ? y - oy : x - ox),
    vOf: (x, y) => (swap ? x - ox : y - oy),
    box(b) { return swap ? { u0: b.y0, u1: b.y1, v0: b.x0, v1: b.x1 } : { u0: b.x0, u1: b.x1, v0: b.y0, v1: b.y1 }; },
    /** three.js extents (x, y up, z) of a canonical size */
    size(su, sv, sz, out) { return (out || new THREE.Vector3()).set(swap ? sv : su, sz, swap ? su : sv); },
    /** three.js unit vector of a canonical direction */
    dir(du, dv, out) { return (out || new THREE.Vector3()).set(swap ? dv : du, 0, -(swap ? du : dv)); },
  };
  return f;
}

// ---------------------------------------------------------------- materials
export const tok = (name) => MATERIALS[name];

/** Standard material from a token entry; `over` overrides any property. */
export function matFrom(name, over = {}) {
  const t = MATERIALS[name];
  if (!t) throw new Error('unknown material token ' + name);
  const p = { color: t.color, roughness: t.roughness, metalness: t.metalness ?? 0, ...over };
  if (t.emissive != null) { p.emissive = t.emissive; p.emissiveIntensity = t.emissiveIntensity ?? 1; }
  if (t.opacity != null && over.opacity == null) { p.opacity = t.opacity; p.transparent = true; p.depthWrite = false; }
  return new THREE.MeshStandardMaterial(p);
}

// ---------------------------------------------------------------- textures
export function canvasTex(w, h, draw, { srgb = true, repeat = true, aniso = 4 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.userData.keep = true;      // shared across scenes (clones made by a world are owned by it)
  return t;
}
function speckle(g, w, h, n, amp, size, r) {
  for (let i = 0; i < n; i++) {
    const v = (r() - 0.5) * amp;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    g.fillRect(r() * w, r() * h, size, size);
  }
}

/** All procedural textures of the scene, created once. */
export function makeTextures(aniso = 4) {
  const r = rng(7);
  const T = {};
  // sealed concrete, one tile = 6 m with a 25 mm expansion joint on its edge
  T.concrete = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#c7c9c4'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 9000, 0.1, 3, r);
    for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.03})`; g.beginPath(); g.ellipse(r() * w, r() * h, 60 + r() * 90, 30 + r() * 60, r() * 3, 0, 6.3); g.fill(); }
    g.fillStyle = 'rgba(30,32,34,0.55)'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h);
  }, { aniso });
  T.asphalt = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#7d8084'; g.fillRect(0, 0, w, h); speckle(g, w, h, 8000, 0.3, 2, r); }, { aniso });
  // cladding: vertical ribs, one tile = 1 m
  T.cladding = canvasTex(128, 8, (g, w, h) => { for (let x = 0; x < w; x++) { const f = (x % 32) / 32; g.fillStyle = f < 0.12 ? '#ffffff' : f < 0.24 ? '#b4b9be' : '#e3e6e8'; g.fillRect(x, 0, 1, h); } }, { aniso });
  T.carton = canvasTex(128, 128, (g, w, h) => {      // faint tile pattern of cartons on a pallet, tinted per instance
    g.fillStyle = '#e8e2d6'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
      const x = i * w / 3, y = j * h / 4, s = 0.94 + r() * 0.06;
      g.fillStyle = `rgb(${Math.round(250 * s)},${Math.round(245 * s)},${Math.round(234 * s)})`; g.fillRect(x + 1.5, y + 1.5, w / 3 - 3, h / 4 - 3);
      g.fillStyle = 'rgba(150,120,80,0.28)'; g.fillRect(x + w / 6 - 3, y + 1.5, 6, h / 4 - 3);
    }
  }, { aniso });
  T.pallet = canvasTex(64, 64, (g, w, h) => {        // slots between boards, so a box reads as a pallet
    g.fillStyle = '#c9a070'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 600, 0.3, 1, r);
    g.fillStyle = 'rgba(40,25,10,0.7)'; g.fillRect(0, h * 0.6, w, h * 0.22);
    for (let k = 0; k < 3; k++) g.fillRect(k * (w / 3) + 2, h * 0.3, w / 3 - 4, h * 0.3);
  }, { aniso });
  // perforated grating (alpha), used for the channel and aisle decks
  T.grating = canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#a4acb3'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#8c949b'; g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, h);
    g.globalCompositeOperation = 'destination-out';
    for (let x = 0; x < w; x += 8) for (let y = 0; y < h; y += 8) g.fillRect(x + 2, y + 2, 4, 4);
  }, { aniso });
  T.hazard = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#f3ad1e'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2b2d2f';
    for (let i = -2; i < 6; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 + 8, 0); g.lineTo(i * 16 + 8 + h, h); g.lineTo(i * 16 + h, h); g.fill(); }
  }, { aniso });
  T.rollers = canvasTex(32, 32, (g, w, h) => {      // roller conveyor top: one roller per tile along v
    g.fillStyle = '#606970'; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#d5dbe0'); gr.addColorStop(0.5, '#8d969d'); gr.addColorStop(1, '#4d555b');
    g.fillStyle = gr; g.fillRect(0, 3, w, h - 6);
  }, { aniso });
  T.chain = canvasTex(16, 32, (g, w, h) => {
    g.fillStyle = '#2d3238'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#aab2b9'; for (let y = 0; y < h; y += 8) g.fillRect(2, y + 1, w - 4, 5);
  }, { aniso });
  T.hex = canvasTex(4, 4, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }, { aniso });
  return T;
}

// ---------------------------------------------------------------- geometry
/** Box of canonical size (su along u, sv along v, sz up) centred at canonical (cu, cv, cz) relative to the object origin. */
export function cbox(f, su, sv, sz, cu = 0, cv = 0, cz = 0) {
  const s = f.size(su, sv, sz);
  const p = f.pos(cu, cv, cz);
  return new THREE.BoxGeometry(s.x, s.y, s.z).translate(p.x, p.y, p.z);
}
export function wbox(sx, sy, sz, x = 0, y = 0, z = 0) { return new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z); }
export function merge(parts) {
  const geo = mergeGeometries(parts.map((g) => (g.index ? g : g)), false);
  parts.forEach((g) => g.dispose());
  return geo;
}
export function cyl(r, len, x, y, z, axis = 'y', seg = 12) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
  return g.translate(x, y, z);
}
export function scaleUV(g, a, b) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * a, uv.getY(i) * b); uv.needsUpdate = true; return g; }

/** Trapezoidal velocity profile: time to cover distance d from rest to rest (s) and distance covered after t seconds. */
export function travelTime(d, v, a) {
  if (d <= 1e-9) return 0;
  return d < v * v / a ? 2 * Math.sqrt(d / a) : d / v + v / a;
}
export function travelDist(d, v, a, t) {
  if (d <= 1e-9) return 0;
  const T = travelTime(d, v, a);
  if (t <= 0) return 0;
  if (t >= T) return d;
  if (d < v * v / a) return t <= T / 2 ? 0.5 * a * t * t : d - 0.5 * a * (T - t) ** 2;
  const ta = v / a;
  if (t <= ta) return 0.5 * a * t * t;
  if (t >= T - ta) return d - 0.5 * a * (T - t) ** 2;
  return 0.5 * v * ta + v * (t - ta);
}

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smooth01 = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

/** Disposes geometries, materials and textures below an object (shared ones flagged userData.keep are left alone). */
export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose();
    if (o.material) for (const m of [].concat(o.material)) {
      if (m.userData.keep) continue;
      for (const v of Object.values(m)) if (v && v.isTexture && !v.userData.keep) v.dispose();
      m.dispose();
    }
    if (o.isInstancedMesh) o.dispose();
  });
}
