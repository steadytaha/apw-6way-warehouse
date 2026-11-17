// Default camera tour (scene_spec section 6): 7 shots, about 75 s. B5 can use it as is or pass its own `shots` to scene.tour().
// Shot = { name, dur (s), env, shell, speed?, text (<= 8 words, number + unit from the report), from:{pos,target,fov}, to:{pos,target,fov}, orbit (deg), follow (fn -> three Vector3), onEnter(host) }.
// Camera positions are model coordinates in metres: x east, y north, z up.
import { fmtNum } from '../ui.js';

export function defaultShots(rep, world, sim) {
  const sc = rep.scene, B = sc.building, f = world.f, cy = sc.cycle, hd = rep.headline || {};
  const cx = B.L / 2, cyy = B.W / 2, diag = Math.hypot(B.L, B.W);
  const W = (u, v, z) => [f.wx(u, v), f.wy(u, v), z];
  // FIX (R9b): the tour read rep.scene.columns / world.modules[0] / one lift, so it threw on L / U / T footprints (no scene.columns, several blocks with their own axes). Every storage section
  // (block) now gets its own rack, lift and aisle shots built from that section's world; missing fields fall back to the block's rectangle centre or skip the shot.
  const tier = Math.min(2, world.tiers - 1), zt = world.tz[tier], zt4 = world.tz[Math.min(world.tiers - 1, 4)];
  const secs = (world.sections && world.sections.length ? world.sections : [{ w: world, s: { origin: { x: 0, y: 0 }, sc }, i: 0 }]).map((c) => {
    const ss = c.s.sc, ox = c.s.origin.x, oy = c.s.origin.y, ff = c.w.f, col = ss.columns || sc.columns || null;
    const mod = (c.w.modules || [])[0] || null;
    const bw = ss.building || B;
    const W = (u, v, z) => [ff.wx(u, v) + ox, ff.wy(u, v) + oy, z];
    const c0 = col ? col.start : 0.5, uLen = col ? col.length : (ss.orient === 'y' ? bw.W : bw.L) * 0.8;
    const av = mod ? (mod.a.v0 + mod.a.v1) / 2 : (ss.orient === 'y' ? bw.L : bw.W) / 2;
    const lift = (c.w.lifts || []).find((l) => l.group === 'IN') || (c.w.lifts || [])[0] || null;
    const pos = c.s.positions || (c.w.positions) || 0;
    return { W, c0, uLen, av, lift, ox, oy, pos, ok: !!col && !!mod };
  }).filter((x) => x.ok);
  const multi = secs.length > 1;
  const dock = world.docks.in || world.docks.out;
  const kpi = (k) => { for (const g of rep.groups || []) for (const r of g.kpis) if (r.key === k) return r.value; return null; };
  const util = kpi('queues.rho_shuttle');
  const dxy = dock ? [dock.nx, dock.ny] : [-1, 0];
  const out = [];
  out.push({ name: 'Exterior', dur: 10, env: 'studio', shell: 'closed',
    from: { pos: [cx + dxy[0] * diag * 1.45 + dxy[1] * diag * 0.5, cyy + dxy[1] * diag * 1.45 - dxy[0] * diag * 0.5, diag * 0.3], target: [cx, cyy, B.H * 0.35], fov: 36 },
    to: { pos: [cx + dxy[0] * diag * 0.85 + dxy[1] * diag * 0.35, cyy + dxy[1] * diag * 0.85 - dxy[0] * diag * 0.35, diag * 0.17], target: [cx, cyy, B.H * 0.4], fov: 36 },
    text: `${fmtNum(B.L, 0)} × ${fmtNum(B.W, 0)} × ${fmtNum(B.H, 0)} m building` });
  out.push({ name: 'Cut-away', dur: 10, env: 'day', shell: 'cut',
    from: { pos: [cx - diag * 0.55, cyy - diag * 0.75, B.H * 1.0], target: [cx, cyy, B.H * 0.3], fov: 38 }, to: { pos: [cx - diag * 0.55, cyy - diag * 0.75, B.H * 1.9], target: [cx, cyy, B.H * 0.25], fov: 38 }, orbit: 30,
    labels: ['lift', 'shuttle', 'rack'],
    text: `${fmtNum(hd.positions, 0)} positions, ${sc.tiers} tiers` });
  secs.slice(0, 3).forEach((v, k) => {
    const tag = multi ? `Block ${k + 1} of ${secs.length}: ` : '';
    out.push({ name: multi ? `Rack detail ${k + 1}` : 'Rack detail', dur: multi ? 8 : 12, env: 'lightsOut', shell: 'cut',
      from: { pos: v.W(v.c0 + 0.6, v.av, zt + 1.0), target: v.W(v.c0 + Math.min(14, v.uLen * 0.6), v.av, zt + 1.0), fov: 56 }, to: { pos: v.W(v.c0 + Math.min(9, v.uLen * 0.4), v.av, zt + 1.0), target: v.W(v.c0 + Math.min(24, v.uLen * 0.95), v.av, zt + 1.0), fov: 56 },
      text: multi ? `${tag}${fmtNum(v.pos, 0)} positions` : `Unit load, shuttle ${fmtNum(cy.v_shuttle, 1)} m/s` });   // FIX (R18e): "1,000 kg" removed (old cause: a pallet weight typed in the text; the report carries no weight and the unit load is 1,050 kg on slide 11)
    if (v.lift) out.push({ name: multi ? `Lift ${k + 1}` : 'Lift', dur: multi ? 7 : 10, env: 'lightsOut', shell: 'cut',
      from: { pos: v.W(v.lift.u + 7, v.lift.v - 6, 7), target: v.W(v.lift.u, v.lift.v, 8), fov: 40 }, to: { pos: v.W(v.lift.u + 7, v.lift.v - 6, 7), target: v.W(v.lift.u, v.lift.v, 8), fov: 40 }, orbit: 120,
      labels: ['lift'],
      text: `${tag}lift cycle ${fmtNum(cy.lift_s, 1)} s` });
    if (!multi || k === 0) out.push({ name: 'Aisle', dur: 10, env: 'lightsOut', shell: 'cut',
      from: { pos: v.W(v.c0 - 1.2, v.av, zt4 + 1.4), target: v.W(v.c0 + v.uLen * 0.8, v.av, zt4 + 1.4), fov: 62 }, to: { pos: v.W(v.c0 + 2, v.av, zt4 + 1.4), target: v.W(v.c0 + v.uLen * 0.8, v.av, zt4 + 1.4), fov: 62 },
      labels: ['shuttle'],
      text: `${sc.shuttles.total} ${sc.shuttles.policy === 'captive' ? 'block-captive' : 'pooled'} shuttles${util != null ? `, ${fmtNum(util * 100, 0)} % utilised` : ', utilisation n/a'}` });   // FIX (R18e): n/a instead of blank (old cause: empty text when the KPI is missing)
  });
  if (dock) {
    const lx = -dxy[1], ly = dxy[0];                       // along the wall
    out.push({ name: 'Dock', dur: 10, env: 'day', shell: 'cut',
      from: { pos: [dock.x - dxy[0] * 7 + lx * 3.5, dock.y - dxy[1] * 7 + ly * 3.5, 2.8], target: [dock.x + dxy[0] * 3, dock.y + dxy[1] * 3, 1.4], fov: 50 },
      to: { pos: [dock.x - dxy[0] * 3 + lx * 2.2, dock.y - dxy[1] * 3 + ly * 2.2, 2.2], target: [dock.x + dxy[0] * 6, dock.y + dxy[1] * 6, 1.2], fov: 56 },
      labels: ['dock'],
      text: `${fmtNum(cy.in_per_h, 0)} in, ${fmtNum(cy.out_per_h, 0)} out pallets/h` });
  }
  // R13a: tier-limit gauge shot (height ruler + the tier rule card) and, for several blocks, a shuttle transfer between two blocks
  const tr = rep.tier_rule;
  if (tr) {
    const bb = (sc.footprint && sc.footprint.bbox) || [0, 0, B.L, B.W], gx = bb[0] - 4.5, gy = bb[1] - 4.5, Hr = sc.tiers * sc.tier_pitch;
    out.push({ name: 'Tier limit', dur: 9, env: 'day', shell: 'open', onEnter: (host) => host.setTierGauge && host.setTierGauge(true),
      from: { pos: [gx - 16, gy - 16, Hr * 0.55], target: [gx, gy, Hr * 0.55], fov: 40 }, to: { pos: [gx - 12, gy - 20, Hr * 0.8], target: [gx, gy, Hr * 0.6], fov: 40 }, orbit: 25,
      text: `${tr.tiers} tiers, ${tr.binding || 'n/a'} binds` });   // FIX (R18e): n/a instead of the invented word "limit" (old cause: a fallback word, not a report value)
  }
  const xf = sim.transfers && sim.transfers.enabled ? sim.transfers.paths.values().next().value : null;
  if (multi && xf && xf.length) {
    const a = xf[0], b = xf[xf.length - 1], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    out.push({ name: 'Block transfer', dur: 14, env: 'day', shell: 'open', speed: 6, onEnter: (host) => { host.setTierGauge && host.setTierGauge(false); host.transfer && host.transfer(); },
      from: { pos: [mx - 14, my - 22, 17], target: [mx, my, 0.5], fov: 42 }, to: { pos: [mx + 10, my - 16, 13], target: [mx, my, 0.5], fov: 42 }, orbit: 20,
      text: sim.transfers.mode === 'J1' ? `${sc.shuttles.total} pooled shuttles cross between blocks` : 'Pallets cross between blocks on a conveyor' });
  }
  out.push({ name: 'Overview', dur: 13, env: 'day', shell: 'open',
    from: { pos: [cx, cyy - 0.5, diag * 1.1], target: [cx, cyy, 0], fov: 30 }, to: { pos: [cx - diag * 0.5, cyy - diag * 0.8, diag * 0.75], target: [cx, cyy, B.H * 0.2], fov: 38 },
    onEnter: (host) => { host.setABC(true); if (host.setTierGauge) host.setTierGauge(false); },
    labels: ['lift', 'dock'],
    text: `ABC classes, ${fmtNum(hd.bottleneck_moves_h, 0)} moves/h` });
  return out;
}
