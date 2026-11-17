// Tier-limit gauge (R13a, brief item 5): a height ruler next to the building (rack height used vs building height, the 7-tier diminishing-returns marker, the next tier as a ghost that
// pokes through the roof when the building is too low) and an info card with the tier rule of R12 (report.tier_rule): the six limits, the binding one, the next-tier effect.
// Numbers: report.tier_rule {tiers, binding, tied, limits {user_cap, vendor, structure, fire, height, lift_perf}, tiers_soft, next {tiers, height_needed, height_short, positions_gain,
// rho_lift_now, rho_lift_next}, gain_next, diminishing, mezzanine}, scene.tier_pitch, building.H. Nothing is recomputed here.
import { THREE } from './kit.js';
import { h, fmtNum } from '../ui.js';

const LIMIT_NAMES = { fire: 'Fire clearance', height: 'Clear height', vendor: 'Vendor maximum', structure: 'Structure', lift_perf: 'Lift performance', user_cap: 'Input cap (tiers_max)' };

function sprite(text, sub, color, scale) {
  const cv = document.createElement('canvas'); cv.width = 720; cv.height = 150;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(16,20,26,0.86)'; g.beginPath(); g.roundRect(4, 4, 712, 142, 24); g.fill();
  g.fillStyle = '#' + new THREE.Color(color).getHexString(); g.fillRect(4, 4, 14, 142);
  g.fillStyle = '#f4f6f8'; g.font = '600 44px system-ui, Segoe UI, sans-serif'; g.textBaseline = 'middle'; g.fillText(text, 38, 52);
  g.fillStyle = '#b4bec8'; g.font = '500 33px system-ui, Segoe UI, sans-serif'; g.fillText(sub, 38, 104);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
  sp.scale.set(scale * 4.8, scale, 1); sp.renderOrder = 42; return sp;
}

export function createTierGauge(rep, comp, stage, host) {
  const tr = rep.tier_rule, sc = rep.scene, B = sc.building, LEV = sc.tier_pitch, tiers = sc.tiers;
  const g = new THREE.Group(); g.name = 'tier gauge'; g.visible = false;
  const mats = [], geos = [], own = (m) => { mats.push(m); return m; }, geo = (x) => { geos.push(x); return x; };
  let card = null;
  if (tr) {
    const Hr = tiers * LEV, H = B.H, nx = tr.next || {};
    // ruler position: outside the south-west corner of the bounding box (x west, y south, three.js z = -y)
    const bb = (sc.footprint && sc.footprint.bbox) || [0, 0, B.L, B.W], X = bb[0] - 4.5, Z = -(bb[1] - 4.5);
    const box = (w, hh, d, x, y, z, mat) => { const m = new THREE.Mesh(geo(new THREE.BoxGeometry(w, hh, d)), mat); m.position.set(X + x, y, Z + z); g.add(m); return m; };
    const blue = own(new THREE.MeshBasicMaterial({ color: 0x4f8cff, transparent: true, opacity: 0.85, toneMapped: false }));
    const grey = own(new THREE.MeshBasicMaterial({ color: 0x9aa4ad, transparent: true, opacity: 0.7, toneMapped: false }));
    const amber = own(new THREE.MeshBasicMaterial({ color: 0xe0b020, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }));
    const short = (nx.height_short || 0) > 0;
    const ghostMat = own(new THREE.MeshBasicMaterial({ color: short ? 0xd9482b : 0x31a56c, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false }));
    box(0.5, Hr, 0.5, 0, Hr / 2, 0, blue);                                         // rack height used
    for (let t = 0; t <= tiers; t++) box(1.3, 0.06, 0.12, 0.3, t * LEV, 0, blue);   // one tick per tier level
    box(0.14, H, 0.14, 1.1, H / 2, 0, grey); box(1.6, 0.12, 1.6, 1.1, H, 0, grey); // building height with a cap plate at the eaves
    if (H > Hr) box(0.5, H - Hr, 0.5, 0, Hr + (H - Hr) / 2, 0, amber);              // headroom above the top tier
    const top = Hr + LEV; box(0.9, LEV, 0.9, 0, Hr + LEV / 2, 0, ghostMat);          // the next tier (ghost): red when it does not fit under the roof
    box(1.7, 0.08, 1.7, 0, top, 0, ghostMat);
    const soft = tr.tiers_soft;
    if (soft && soft <= tiers + 1) { const ring = new THREE.Mesh(geo(new THREE.RingGeometry(1.1, 1.4, 40).rotateX(-Math.PI / 2)), own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, toneMapped: false }))); ring.position.set(X, soft * LEV, Z); g.add(ring); }
    const lab = (txt, sub, col, y, sc_ = 1.5) => { const s = sprite(txt, sub, col, sc_); s.position.set(X + 5.2, y, Z); g.add(s); return s; };
    lab(`${tiers} tiers · rack ${fmtNum(Hr, 1)} m`, `binding: ${tr.binding || 'n/a'}`, 0x4f8cff, Hr - 0.8);
    lab(`Building ${fmtNum(H, 1)} m`, `headroom ${fmtNum(H - Hr, 2)} m above tier ${tiers}`, 0x9aa4ad, H + 1.6);
    if (nx.tiers) lab(`Tier ${nx.tiers} needs ${fmtNum(nx.height_needed, 2)} m`, short ? `${fmtNum(nx.height_short, 2)} m short: it does not fit` : 'fits under the roof', short ? 0xd9482b : 0x31a56c, top + 2.2);
    if (soft) lab(`${soft}-tier marker`, 'above it: diminishing returns', 0xffffff, soft * LEV - 1.6, 1.2);
    // info card (HTML)
    const lim = tr.limits || {}, tied = new Set(tr.tied || []);
    const key2name = { fire: 'fire clearance', height: 'clear height', vendor: 'vendor', structure: 'structure', lift_perf: 'lift performance', user_cap: 'user cap' };
    const rows = Object.keys(LIMIT_NAMES).map((k) => {
      const v = lim[k], bind = tied.has(key2name[k]) || (tr.binding && String(tr.binding).toLowerCase().startsWith(key2name[k]));
      return `<div class="sc-lim${bind ? ' is-bind' : ''}"><span>${bind ? '▶ ' : ''}${LIMIT_NAMES[k]}</span><span>${v == null ? 'none' : fmtNum(v, 0) + ' tiers'}</span></div>`;
    }).join('');
    const nxTxt = nx.tiers ? `Next tier (${nx.tiers}): needs ${fmtNum(nx.height_needed, 2)} m${short ? `, ${fmtNum(nx.height_short, 2)} m short` : ''}; positions ${nx.positions_gain != null ? '+' + fmtNum(100 * nx.positions_gain, 1) + ' %' : 'n/a'}${tr.gain_next != null ? `, throughput ${tr.gain_next >= 0 ? '+' : ''}${fmtNum(100 * tr.gain_next, 1)} %` : ''}${tr.diminishing ? ' (diminishing returns)' : ''}` : '';
    const mz = tr.mezzanine && tr.mezzanine.height_ok ? `Mezzanine: ${tr.mezzanine.better === 'mezzanine' ? 'used' : 'not better'} (ground area ${tr.mezzanine.gain_ground_m2 != null ? '+' + fmtNum(tr.mezzanine.gain_ground_m2, 0) + ' m²' : 'n/a'}, positions ${tr.mezzanine.gain_positions != null ? (tr.mezzanine.gain_positions >= 0 ? '+' : '') + fmtNum(tr.mezzanine.gain_positions, 0) : 'n/a'})` : '';
    card = h('div.sc-tiers.sc-glass', { hidden: true, role: 'group', 'aria-label': 'Tier limit' });
    card.innerHTML = `<strong>Tier limit: ${tiers} tiers (binding: ${tr.binding || 'n/a'})</strong><div class="sc-lims">${rows}</div>`
      + `<div>Rack ${fmtNum(Hr, 1)} m of ${fmtNum(H, 1)} m building (${tiers} × ${fmtNum(LEV, 2)} m); 7-tier marker ${tr.tiers_soft}${tiers > tr.tiers_soft ? ' (exceeded)' : ''}</div><div>${nxTxt}</div>${mz ? `<div>${mz}</div>` : ''}`
      + '<div class="sc-note">Tier rule of the model (R12); the 7-tier marker follows Tappia et al. (2016): more tiers give diminishing returns, not a hard cap.</div>';
    stage.append(card);
  }
  comp.world.root.add(g);
  return {
    available: !!tr, group: g,
    setVisible(on) { g.visible = !!on && !!tr; if (card) card.hidden = !g.visible; host.invalidate(); },
    get visible() { return g.visible; },
    dispose() { g.parent && g.parent.remove(g); geos.forEach((x) => x.dispose()); mats.forEach((m) => m.dispose()); g.traverse((o) => { if (o.material && o.material.map) o.material.map.dispose(); }); if (card) card.remove(); },
  };
}
