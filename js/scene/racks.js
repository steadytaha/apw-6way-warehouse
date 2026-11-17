// Rack info (R13a, brief item 4): hover (or tap) one rack of the 3D view to read its lanes, pallets, SKUs, dimensions and gaps. One rack = one side of a shuttle aisle (the same unit as
// figures/rack_dimensions.html). Numbers come from the scene payload: pitch {column, position, tier, aisle, front}, load, modules[].depth / lane_length, columns {count, skip}, tiers.
// The SKU count uses 6 unit loads per SKU (slide 12, sourced); lane columns are the model's `blocks_info[].store_columns` (R12f). Nothing here changes the model.
import { THREE } from './kit.js';
import { h, fmtNum } from '../ui.js';

const SKU_UNITS = 6;           // unit loads per SKU (slide 12, sourced)

/** list of racks of the composite: [{id, label, sec, block, mod, side, box (world centre / size), lanes, pallets, skus, dims, gaps, pitches}] */
export function buildRackTable(rep, comp) {
  const sc = rep.scene, P = sc.pitch || {}, ld = sc.load || { across: 1.25, along: 0.85, height: 1.7 };
  const out = [];
  comp.secs.forEach((c) => {
    const w = c.w, f = w.f, tiers = w.tiers, nc = c.s.sc.columns.count, skip = (c.s.sc.columns.skip || []).length;
    w.blocks.forEach((b, bi) => {
      const mod = w.modules[b.module], depth = b.depth, cols = c.s.sc.columns.store != null ? c.s.sc.columns.store : Math.max(0, nc - skip);
      const laneLen = ((c.s.sc.modules || []).find((m) => m.index === b.module) || {}).lane_length || depth * (P.position || 0.95) + 0.3;
      const sizeU = b.u1 - b.u0, sizeV = b.v1 - b.v0, cu = (b.u0 + b.u1) / 2, cv = (b.v0 + b.v1) / 2, Hr = tiers * (sc.tier_pitch || P.tier || 2.25);
      const own = w.lanes.filter((l) => l.b === bi), lanes = own.length, pallets = own.reduce((x, l) => x + l.depth, 0), shaftLanes = cols * tiers - lanes;     // lanes as built: store columns x tiers minus the lift-shaft lanes of the model (shaft_cells)
      const aisleNo = (comp.secs.length > 1 ? `B${c.i + 1} · ` : '') + `aisle ${b.module + 1}`;
      out.push({
        id: `${c.i}.${bi}`, label: `${aisleNo}, side ${b.side === 0 ? 'A' : 'B'}`, sec: c.i, bi, module: b.module, side: b.side, depth,
        centre: f.pos(cu, cv, Hr / 2), size: f.size(sizeU, sizeV, Hr), cols, tiers, lanes, pallets, shaftLanes, skus: pallets / SKU_UNITS,
        dims: { length: nc * (P.column || 1.55), lane: laneLen, height: Hr }, nc, skip,
        gaps: { across: (P.column || 1.55) - ld.across, along: (P.position || 0.95) - ld.along, vertical: (sc.tier_pitch || P.tier || 2.25) - ld.height },
        pitches: { column: P.column, position: P.position, tier: sc.tier_pitch || P.tier, aisle: P.aisle, front: P.front },
      });
    });
  });
  return out;
}

export function createRackInfo(rep, comp, stage, camera, canvas, host) {
  const racks = buildRackTable(rep, comp);
  const picks = [], byObj = new Map();
  const pm = new THREE.MeshBasicMaterial({ visible: false });
  racks.forEach((r) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(r.size.x, r.size.y, r.size.z), pm);
    m.position.copy(r.centre); m.visible = false; m.name = 'rack pick ' + r.id;
    comp.secs[r.sec].grp.add(m); m.updateMatrixWorld(true); picks.push(m); byObj.set(m, r); r.pick = m;
  });
  const hlGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), hlMat = new THREE.LineBasicMaterial({ color: 0xffd23f, toneMapped: false, depthTest: false, transparent: true, opacity: 0.95 });
  const hl = new THREE.LineSegments(hlGeo, hlMat); hl.visible = false; hl.renderOrder = 45; hl.frustumCulled = false; comp.world.root.add(hl);
  const tip = h('div.sc-tip.sc-glass', { role: 'status', 'aria-live': 'polite', hidden: true });
  stage.append(tip);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let cur = null, enabled = true;
  const stored = (r) => { let n = 0; for (const l of comp.secs[r.sec].w.lanes) if (l.b === r.bi) n += l.count; return n; };
  const row = (k, v) => `<div class="sc-kv"><span>${k}</span><span>${v}</span></div>`;
  const m2 = (x) => fmtNum(x, 2), m1 = (x) => fmtNum(x, 1);
  function html(r) {
    const s = stored(r);
    return `<strong>Rack ${r.label}</strong>`
      + row('Lanes', `${r.cols} columns × ${r.tiers} tiers${r.shaftLanes > 0 ? ' − ' + r.shaftLanes + ' (lift shaft)' : ''} = ${fmtNum(r.lanes, 0)}`)
      + row('Pallets', `${fmtNum(r.lanes, 0)} lanes × ${r.depth} deep = ${fmtNum(r.pallets, 0)}`)
      + row('SKUs', `${fmtNum(r.pallets, 0)} ÷ ${SKU_UNITS} = ${fmtNum(r.skus, 0)}`)
      + row('Stored now', `${fmtNum(s, 0)} (${fmtNum(100 * s / Math.max(1, r.pallets), 0)} %)`)
      + row('Size L × D × H', `${m1(r.dims.length)} × ${m1(r.dims.lane)} × ${m1(r.dims.height)} m`)
      + row('Gaps across / along / up', `${m2(r.gaps.across)} / ${m2(r.gaps.along)} / ${m2(r.gaps.vertical)} m`)
      + row('Pitch column / position / tier', `${m2(r.pitches.column)} / ${m2(r.pitches.position)} / ${m2(r.pitches.tier)} m`)
      + `<div class="sc-note">One rack = one side of an aisle. 1 SKU = ${SKU_UNITS} unit loads (slide 12). Gaps and pitches: model parameters (assumption).</div>`;
  }
  function show(r, x, y) {
    if (!r) { cur = null; hl.visible = false; tip.hidden = true; host.invalidate(); return; }
    if (r !== cur) {
      cur = r; tip.innerHTML = html(r);
      const g = comp.secs[r.sec].grp; hl.position.copy(r.centre).add(g.position); hl.scale.set(r.size.x, r.size.y, r.size.z); hl.visible = true; host.invalidate();
    } else if (Math.random() < 0.1) tip.innerHTML = html(r);
    tip.hidden = false;
    const rc = stage.getBoundingClientRect(), tw = tip.offsetWidth || 280, th = tip.offsetHeight || 150;
    let px = x - rc.left + 14, py = y - rc.top + 14;
    if (px + tw > rc.width - 8) px = x - rc.left - tw - 14; if (py + th > rc.height - 8) py = y - rc.top - th - 14;
    tip.style.left = Math.max(6, px) + 'px'; tip.style.top = Math.max(6, py) + 'px';
  }
  function hit(e) {
    const rc = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    const hs = ray.intersectObjects(picks, false); return hs.length ? byObj.get(hs[0].object) : null;
  }
  let pend = null;
  function onMove(e) {
    if (!enabled || e.buttons || e.pointerType === 'touch') return;
    pend = e; if (pend._raf) return;
    requestAnimationFrame(() => { const ev = pend; pend = null; if (!ev || !enabled) return; show(hit(ev), ev.clientX, ev.clientY); });
    pend._raf = true;
  }
  const onLeave = () => show(null);
  canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerleave', onLeave);
  return {
    racks, get current() { return cur; },
    setEnabled(on) { enabled = !!on; if (!enabled) show(null); },
    /** show the info card of a rack (tap, story): index into `racks` */
    showRack(i, x, y) { const r = racks[i]; if (r) show(r, x ?? stage.getBoundingClientRect().left + 40, y ?? stage.getBoundingClientRect().top + 60); return r; },
    pickAt: (e) => hit(e), show,
    dispose() { canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerleave', onLeave); tip.remove(); hl.parent && hl.parent.remove(hl); hlGeo.dispose(); hlMat.dispose(); picks.forEach((m) => { m.geometry.dispose(); m.parent && m.parent.remove(m); }); pm.dispose(); },
  };
}
