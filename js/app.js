// APW demo app (B3): routes, top bar (theme, model status), model preload.
import { $, h, icon, getTheme, setTheme, nextTheme, themeLabel, themeIcon, fmtNum } from './ui.js';
import { state, load } from './store.js';
import { model } from './model.js';
import { route, start, go } from './nav.js';
import { mountWelcome, mountChoose } from './screens.js';
import { mountWizard, stepOrder } from './wizard.js';
import { mountRun } from './run.js';
import { mountCompare } from './compare.js';
import { mountResults } from './results.js';
import './scene/boot.js';
import './story/story.js';

load();

// R26b: hosted site (demo/build_site.py sets globalThis.APW_LAZY_MODEL in index.html): the Python model (Pyodide, about 6 MB) loads on the first Run, not at start-up. Release builds keep the early preload.
if (/[?&]eager(&|$)/.test(location.search)) globalThis.APW_LAZY_MODEL = false;     // ?eager: QA and the release behaviour (preload at start-up)
const LAZY = !!globalThis.APW_LAZY_MODEL;

route(/^\/$/, { order: () => 0, mount: mountWelcome });
route(/^\/choose$/, { order: () => 1, mount: mountChoose });
route(/^\/(fixed|optimal)\/(\w+)$/, { order: ([m, s]) => stepOrder(m, s), mount: ([m, s]) => mountWizard(m, s) });
route(/^\/compare$/, { order: () => 1, mount: mountCompare });   // R25b: Compare flows (I / U / L on the same inputs); replaces the R22c Dock layouts view
route(/^\/run$/, { order: () => 20, guard: () => (state.job ? null : state.mode ? `/${state.mode}/review` : '/choose'), mount: mountRun });
route(/^\/results$/, { order: () => 21, guard: () => (state.result ? null : '/choose'), mount: mountResults });

// ---- theme button
const themeBtn = $('#theme-btn');
function paintTheme() {
  const t = getTheme();
  themeBtn.replaceChildren(icon(themeIcon[t]));
  themeBtn.setAttribute('aria-label', `Theme: ${themeLabel[t]}. Switch to ${themeLabel[nextTheme()]}`);
  themeBtn.title = `Theme: ${themeLabel[t]}`;
}
themeBtn.addEventListener('click', () => { setTheme(nextTheme()); paintTheme(); });
paintTheme();

// ---- model status chip
const chip = $('#model-chip');
let hideTimer = 0;
function paintChip() {
  clearTimeout(hideTimer);
  chip.dataset.state = model.state;
  chip.className = 'chip model-chip' + (model.state === 'ready' ? ' ok' : model.state === 'error' ? ' bad' : '');
  chip.hidden = false;
  if (LAZY && model.state === 'idle') { chip.hidden = true; return; }         // R26b: hosted site, the model has not been asked for yet
  if (model.state === 'loading' || model.state === 'idle') {
    const m = model.phase;
    chip.replaceChildren(h('span.dot'), m ? `Model ${fmtNum(m.fraction * 100, 0)} %` : 'Model loading');
    chip.setAttribute('aria-label', 'Model engine loading');
    chip.disabled = true;
  } else if (model.state === 'ready') {
    chip.replaceChildren(icon('check', 'sm'), 'Model ready');
    chip.setAttribute('aria-label', 'Model engine ready'); chip.disabled = true;
    hideTimer = setTimeout(() => { chip.hidden = true; }, 4000);
  } else {
    chip.replaceChildren(icon('warn', 'sm'), 'Model failed. Retry');
    chip.setAttribute('aria-label', 'Model engine failed to load. Retry'); chip.disabled = false;
  }
}
chip.addEventListener('click', () => { if (model.state === 'error') { model.restart(); preload(); } });
model.onLoad(paintChip);
model.onState(paintChip);
paintChip();

// ---- preload the model at once; swap in the live schema when it is there (the build-time snapshot serves the forms until then)
function preload() {
  model.ready.then(() => model.schema()).then((s) => {
    if (JSON.stringify(s) !== JSON.stringify(state.schema)) console.warn('schema_snapshot.js is older than the model; run demo/build.py. Using the live schema.');
    state.schema = s; state.schemaLive = true;
  }).catch((e) => console.warn('model load failed:', e && e.message));
}
if (!LAZY) preload();

$('#brand').addEventListener('click', (e) => { e.preventDefault(); go('/'); });
start();
