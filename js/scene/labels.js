// Screen-space labels (R24 V4, Visual_plan 3.4): HTML chips laid over the canvas at the projected position of a 3D point, 13 px type whatever the camera distance
// (the old canvas sprites scaled with the camera distance and read 6 to 60 px). A greedy declutter (every 250 ms) keeps at most `max` labels (12 in the expanded view),
// highest priority first, never two overlapping and never one inside an "avoid" rectangle (the caption and chart panels of the guided demo). Priority: selected > story subject
// > resources > zones > people. A label is a colour dot (the role colour) plus words, so colour never carries the meaning alone.
// R26d V7: occlusion: a label whose point lies behind (or inside) a rack block, seen from the camera, is hidden (segment against the rack boxes, tested in the 250 ms pass; a label comes back at the next pass, so a flicker
// shorter than 0.25 s cannot happen). Old cause: labels behind the rack stayed visible and read as pointing at the wrong thing (audit E3). Kinds 'path' and 'shot' are never occluded.
import { THREE } from './kit.js';
import { h, reducedMotion } from '../ui.js';

export const PRIO = { selected: 0, subject: 1, resource: 2, zone: 3, people: 4 };
const hex = (c) => '#' + new THREE.Color(c).getHexString();

export function createLabels(stage, camera, { max = 8, maxFull = 12 } = {}) {
  const layer = h('div.sc-labels', { 'aria-hidden': 'true' });
  stage.append(layer);
  const items = new Map();                                   // id -> { def, el, w, hh, on, sx, sy }
  let filter = () => true, avoid = () => [], lastDecl = -1e9, full = false, occluders = [];
  const ray = new THREE.Ray(), hitP = new THREE.Vector3();
  const v = new THREE.Vector3();
  const noMotion = reducedMotion();

  function add(def) {
    const el = h('span.sc-label', { 'data-kind': def.kind || 'zone' }, h('i', { style: `background:${hex(def.color || 0x9aa4ad)}` }), def.text);
    layer.append(el);
    const it = { def, el, w: 0, hh: 0, on: false, sx: 0, sy: 0, vis: false };
    items.set(def.id, it);
    return it;
  }
  const clear = (kindPrefix) => { for (const [k, it] of [...items]) if (!kindPrefix || (it.def.kind || '').startsWith(kindPrefix)) { it.el.remove(); items.delete(k); } };

  /** Project every eligible label (cheap, every frame), decide who shows (every 250 ms or when forced). */
  function update(now, force) {
    const W = stage.clientWidth, H = stage.clientHeight;
    if (!W || !H) return;
    const cand = [];
    for (const it of items.values()) {
      if (!it.measured && it.el.offsetWidth) { it.w = it.el.offsetWidth; it.hh = it.el.offsetHeight; it.measured = true; }
      const ok = filter(it.def);
      it.elig = false;
      if (!ok) continue;
      v.copy(it.def.getPos()).project(camera);
      if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.02 || Math.abs(v.y) > 1.02) continue;
      it.sx = (v.x * 0.5 + 0.5) * W; it.sy = (-v.y * 0.5 + 0.5) * H; it.z = v.z; it.elig = true;
      cand.push(it);
    }
    for (const it of items.values()) if (it.elig) it.el.style.transform = `translate3d(${it.sx.toFixed(1)}px, ${it.sy.toFixed(1)}px, 0) translate(-50%, calc(-100% - 6px))`;
    if (!force && now - lastDecl < 250) return;
    lastDecl = now;
    const sr = stage.getBoundingClientRect();
    const av = avoid().map((r) => ({ x0: r.left - sr.left, y0: r.top - sr.top, x1: r.right - sr.left, y1: r.bottom - sr.top }));
    cand.sort((a, b) => (a.def.prio ?? PRIO.zone) - (b.def.prio ?? PRIO.zone) || a.z - b.z);
    const taken = [], cap = full ? maxFull : max;
    const camP = camera.position;
    const hidden = (it) => {
      if (!occluders.length || it.def.kind === 'path' || it.def.kind === 'shot') return false;
      const p = it.def.getPos(), dist = camP.distanceTo(p);
      ray.origin.copy(camP); ray.direction.copy(p).sub(camP).normalize();
      for (const b of occluders) { if (ray.intersectBox(b, hitP) && hitP.distanceTo(camP) < dist - 0.05) return true; }
      return false;
    };
    for (const it of cand) {
      it.occ = hidden(it);
      const r = { x0: it.sx - it.w / 2 - 2, x1: it.sx + it.w / 2 + 2, y0: it.sy - it.hh - 8, y1: it.sy + 2 };
      const hit = (q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0;
      const keep = !it.occ && taken.length < cap && r.x0 >= 0 && r.x1 <= W && r.y0 >= 0 && r.y1 <= H && !av.some(hit) && !taken.some(hit);
      it.show = keep; if (keep) taken.push(r);
    }
    for (const it of items.values()) {
      const on = !!(it.elig && it.show);
      if (on !== it.on) { it.on = on; it.el.classList.toggle('on', on); if (noMotion) it.el.style.transition = 'none'; }
    }
  }
  /** Labels now shown, as client rectangles (for checks). */
  const shown = () => [...items.values()].filter((it) => it.on).map((it) => ({ id: it.def.id, text: it.def.text, rect: it.el.getBoundingClientRect() }));
  return {
    add, clear, update, shown,
    setFilter(fn) { filter = fn || (() => true); lastDecl = -1e9; },
    setAvoid(fn) { avoid = fn || (() => []); lastDecl = -1e9; },
    setOccluders(boxes) { occluders = boxes || []; lastDecl = -1e9; },
    setFull(on) { full = !!on; lastDecl = -1e9; },
    get count() { return items.size; },
    dispose() { layer.remove(); items.clear(); },
  };
}
