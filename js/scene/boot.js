// Scene boot (B4): listens to the results screen (apw:report / apw:leave), loads the 3D module lazily (three.js comes from the import map)
// and falls back to the 2D plan when WebGL or the CDN is not available. Importing this file costs nothing: three.js is fetched on the first results page.
import { h } from '../ui.js';

let lib = null;

// FIX (R21b, G11): three.js comes from jsDelivr, or from unpkg when jsDelivr cannot be reached. Old cause: one static import map entry (jsDelivr only), so a blocked CDN ended in the 2D fallback.
// An import map cannot list a second source, so the map is written here, once, before the first module that imports 'three' is loaded (scene/index.js is loaded lazily and
// is the first one). Needs a browser that accepts an import map added after start-up (Chrome 133+, Firefox 108+, Safari 17+); otherwise the import fails and the 2D plan is shown with the reason.
const THREE_VERSION = '0.186.0';
const THREE_SOURCES = [['jsDelivr', `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/`], ['unpkg', `https://unpkg.com/three@${THREE_VERSION}/`]];
// R26b: Subresource Integrity for the pinned three.js files (sha384 of the files at 0.186.0; identical on jsDelivr and unpkg, checked 2026-11-17). Browsers that support `integrity` in import maps
// (Chrome 127+, Safari 18+, Firefox 138+) refuse a changed file; older ones ignore the key. Change the version -> recompute these four hashes (openssl dgst -sha384 -binary | openssl base64 -A).
const THREE_SRI = { 'build/three.module.js': 'sha384-m8JoFX52V6NGv2usipnlLJKnJfL7IE8dbniPDDCSGSQv3Hm4n6PjfV6syVwfuoRc', 'build/three.core.js': 'sha384-mdKeCwPEcbDvzaxwhm+MVuLoMou+E7jQqrs4tmu/n8HBYPGI1kZt0MkJxlMR4zFM',
  'examples/jsm/controls/OrbitControls.js': 'sha384-LSqANrugPGTgf0eYsQTloqKWy926dOOXo2iZ9y6wLMIDEQoU9AaCLJF1Vcc7oJXr', 'examples/jsm/utils/BufferGeometryUtils.js': 'sha384-Rm97j4mcjlLkGsYC2LX3nZG9VU2R8lgK0QE+DmBr4thue+H7J+SHm+68If2ZLBVg' };
let threeSource = null;
async function reachable(url, ms = 6000) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try { await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: ac.signal }); return true; } catch (e) { return false; } finally { clearTimeout(t); }
}
async function ensureThreeMap() {
  if (threeSource) return threeSource;
  for (const [name, base] of THREE_SOURCES) {
    if (!(await reachable(base + 'build/three.module.js'))) { console.warn(`[scene] three.js is not reachable on ${name}`); continue; }
    const s = document.createElement('script');
    s.type = 'importmap';
    s.textContent = JSON.stringify({ imports: { three: base + 'build/three.module.js', 'three/addons/': base + 'examples/jsm/' }, integrity: Object.fromEntries(Object.entries(THREE_SRI).map(([f, v]) => [base + f, v])) });
    document.head.append(s);
    threeSource = name;
    return name;
  }
  throw new Error('three.js is not reachable on cdn.jsdelivr.net or unpkg.com');
}
globalThis.APW = Object.assign(globalThis.APW || {}, { threeSource: () => threeSource });
const load = () => (lib || (lib = ensureThreeMap().then(() => import('./index.js'))));

document.addEventListener('apw:report', async (e) => {
  const d = e.detail, slot = d.slots && d.slots.scene;
  if (!slot) return;
  const stage = slot.querySelector('.slot-stage');
  const note = (msg) => { const n = stage && stage.querySelector('.glass-note'); if (n) n.replaceChildren(h('strong', '3D view not available'), h('span', msg)); };
  try {
    const m = await load();
    if (!(globalThis.APW && globalThis.APW.current === d) || !slot.isConnected) return;     // the user already moved on
    if (!m.webglOk()) { note('This browser has no WebGL. The top view of the design is shown instead.'); return; }
    m.mount(d);
  } catch (err) {
    console.warn('[scene] 3D view failed:', err);
    lib = null;
    // FIX (R21b, G11): the reason is told (old cause: a generic text for every failure)
    note(`The 3D library could not be loaded (${(err && err.message) || 'unknown error'}; it needs the internet once, from jsDelivr or unpkg). The top view is shown instead.`);
  }
});
document.addEventListener('apw:leave', () => { if (lib) lib.then((m) => m.unmount()).catch(() => {}); });
