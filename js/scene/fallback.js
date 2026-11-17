// 2D plan of the store (SVG): the fallback when WebGL or the three.js CDN is not available, and the first paint before the 3D scene is ready.
// Moved here from results.js (B3 placeholder); reads report.scene only.
export function scenePlan(rep) {
  const sc = rep.scene;
  if (!sc || !sc.building) return null;
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const { L, W } = sc.building;
  const svg = mk('svg', { viewBox: `${-2} ${-2} ${L + 4} ${W + 4}`, class: 'scene-plan', role: 'img', 'aria-label': `Top view of the store: ${sc.modules.length} aisle modules, ${sc.lifts.length} lifts.` });
  svg.append(mk('rect', { x: 0, y: 0, width: L, height: W, class: 'sp-bld' }));
  const box = (b, cls) => mk('rect', { x: b.x0, y: W - b.y1, width: b.x1 - b.x0, height: b.y1 - b.y0, class: cls });
  (sc.channels || []).forEach((c) => svg.append(box(c.box, 'sp-ch')));
  (sc.blocks || []).forEach((b) => svg.append(box(b.box, 'sp-rack')));
  (sc.modules || []).forEach((m) => svg.append(box(m.aisle, 'sp-aisle')));
  (sc.lifts || []).forEach((l) => svg.append(mk('circle', { cx: l.x, cy: W - l.y, r: Math.max(0.7, Math.min(L, W) * 0.022), class: 'sp-lift' + (l.spare ? ' spare' : '') })));
  // FIX (R18e): dock squares for L / U / T reports (old cause: only scene.docks was read; the footprint reports carry scene.dock_points {IN: [[x, y]], OUT: [[x, y], ...]} and no scene.docks, so no dock was drawn)
  const docks = sc.docks ? Object.entries(sc.docks).map(([k, d]) => [k, d.x, d.y]) : Object.entries(sc.dock_points || {}).flatMap(([k, pts]) => pts.map(([x, y]) => [k, x, y]));
  for (const [k, x, y] of docks) svg.append(mk('rect', { x: x - 1.2, y: W - y - 1.2, width: 2.4, height: 2.4, class: 'sp-dock ' + k.toLowerCase() }));
  return svg;
}
