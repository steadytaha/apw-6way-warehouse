/* APW model worker: Pyodide + the apw package, off the main thread.
 *
 * Classic worker (importScripts), so it also runs from a Blob URL when the single-file build is opened from disk.
 *
 * Protocol (main -> worker)
 *   {cmd: 'init', files: {path: text}, pyodideVersion?}      once; the worker then loads Pyodide and imports apw.service
 *   {id, cmd: 'schema' | 'fixed' | 'optimal' | 'growth' | 'extras' | 'diagnose' | 'champions' | 'compare', payload}         model calls (queued until the model is ready)
 * Protocol (worker -> main)
 *   {type: 'load', phase, fraction, label, ms}                 load progress: phase = download | init | files | import | ready
 *   {type: 'ready', timings: {download_ms, init_ms, files_ms, import_ms, total_ms}, pyodideVersion}
 *   {type: 'load-error', error: {message, stack}}
 *   {id, progress: {step, fraction}}                            model progress (module by module)
 *   {id, ok: true, result, ms} | {id, ok: false, error: {type, message, trace}}
 * The model runs synchronously inside one call, so a running call cannot be interrupted: the client terminates the worker instead.
 */
'use strict';

const DEFAULT_PYODIDE = '0.26.4';       // exact version, released 2024-09; Python 3.12
const RUNTIME_DIR = '/apw_runtime';

const BOOT = `
import json, sys
if "${RUNTIME_DIR}" not in sys.path:
    sys.path.insert(0, "${RUNTIME_DIR}")
from apw import service as _service

# FIX (R20a, replaces the R18e hook): fixed() and optimal() build the ranked diagnosis options (model re-runs: 6 to 7 s in CPython, about 1.5 times that in Pyodide) before they return, for every
# design that misses a requirement (the slide-12 example always does). The first result must not wait for them: fixed / optimal get the model input options = False (light diagnosis: status and
# limits, options_computed false) and the 'diagnose' command computes the options on demand. Old cause: this file swapped the private function service._full_diagnosis (a hook that could break silently).
def _light(payload):
    if not isinstance(payload, dict):
        raise ValueError("fixed / optimal need an input object")
    return dict(payload, options=False)

# FIX (R20d): a Fixed run also leaves the KPI champions out (champions False: 30 % of its time); the 'champions' command returns them afterwards for the compare section.
def _light_fixed(payload):
    return dict(_light(payload), champions=False)

# R25b: 'compare' = service.compare_flows (I / U / L on the same inputs). payload = {inputs, bays?, flows?, priority?}. The model returns the winners and the recommendation of every priority,
# so the demo switches priority without a second run. Progress: passed on as the progress argument when compare_flows takes that argument (the demo shows a per-column state when events arrive,
# otherwise an indeterminate bar); no model value is touched here.
def _compare(payload, prog):
    import inspect
    if not isinstance(payload, dict) or not isinstance(payload.get("inputs"), dict):
        raise ValueError("compare needs {inputs: {...}}")
    kw = dict(bays=payload.get("bays") or None, priority=payload.get("priority") or "balanced")
    if payload.get("flows"):
        kw["flows"] = tuple(payload["flows"])
    if "progress" in inspect.signature(_service.compare_flows).parameters:
        kw["progress"] = prog
    return _service.compare_flows(dict(payload["inputs"]), **kw)

def _apw_call(cmd, payload_json, cb):
    payload = json.loads(payload_json) if payload_json else None
    def prog(step, fraction):
        cb(step, fraction)
    if cmd == "schema":
        out = _service.schema()
    elif cmd == "fixed":
        out = _service.fixed(_light_fixed(payload), prog)
    elif cmd == "optimal":
        out = _service.optimal(_light(payload), prog)
    elif cmd == "growth":
        out = _service.growth(payload, prog)
    elif cmd == "diagnose":
        # FIX (R17b): the full diagnosis (limits, best possible, computed options) of a fixed building on demand, for reports that carry only the light block (champions)
        out = _service.diagnose(payload)
    elif cmd == "champions":
        out = _service.champions(payload)
    elif cmd == "compare":
        out = _compare(payload, prog)
    elif cmd == "extras":
        # R9b: team cases 1-4, service-level sweep, 7 vs rule tiers (each is a few full layout runs)
        out = {}
        for i, (name, fn) in enumerate((("Team cases 1-4", _service.team_cases), ("Service-level sweep", _service.service_level_sweep), ("Tiers sensitivity", _service.tiers_sensitivity), ("Boarding time sensitivity", _service.t_board_sensitivity))):    # FIX (R13b): t_board row added
            cb(name, i / 4.0)
            out[fn.__name__] = fn(payload)
        cb("Done", 1.0)
    else:
        raise ValueError("unknown command " + repr(cmd))
    return json.dumps(out, allow_nan=False)
`;

let apwCall = null;
let readyPromise = null;
let pyodideVersion = DEFAULT_PYODIDE;

function post(msg) { self.postMessage(msg); }
const now = () => (self.performance ? self.performance.now() : Date.now());

function phase(name, fraction, label, t0) {
  post({ type: 'load', phase: name, fraction, label, ms: Math.round(now() - t0) });
}

async function load(files, version) {
  const t0 = now();
  pyodideVersion = version || DEFAULT_PYODIDE;
  // FIX (R18e, A9-9): two sources for the Python runtime, tried in order. Old cause: one CDN (jsDelivr) and no second source, so a blocked or flaky CDN ended the load.
  const sources = [new URL('../pyodide/', self.location.href).href];      // FIX (R26c): self-hosted; old cause: jsDelivr then unpkg
  const timings = {};
  let py = null, lastErr = null, t1 = now();
  for (let i = 0; i < sources.length && !py; i++) {
    const base = sources[i];
    try {
      // 1. download: pyodide.js (the loader); the wasm and the standard library follow in step 2 (loadPyodide fetches them)
      phase('download', 0.05, i ? 'Downloading the Python runtime (second source)' : 'Downloading the Python runtime', t0);
      importScripts(base + 'pyodide.js');
      timings.download_ms = Math.round(now() - t0);
      // 2. init: fetch + compile pyodide.asm.wasm, unpack the standard library
      phase('init', 0.2, 'Starting Python', t0);
      t1 = now();
      py = await self.loadPyodide({ indexURL: base });
      timings.source = base;
    } catch (e) { lastErr = e; py = null; }
  }
  if (!py) throw new Error('The Python runtime could not be loaded from this site: ' + String((lastErr && lastErr.message) || lastErr) + '. Check the internet connection (a proxy or firewall may block them), then retry.');
  timings.init_ms = Math.round(now() - t1);

  // 3. files: write the apw sources into the virtual file system
  phase('files', 0.8, 'Loading the warehouse model', t0);
  const t2 = now();
  const enc = new TextEncoder();
  const made = new Set();
  for (const [path, text] of Object.entries(files)) {
    const full = `${RUNTIME_DIR}/${path}`;
    const dir = full.slice(0, full.lastIndexOf('/'));
    if (!made.has(dir)) { py.FS.mkdirTree(dir); made.add(dir); }
    py.FS.writeFile(full, enc.encode(text));
  }
  timings.files_ms = Math.round(now() - t2);

  // 4. import: apw.service and everything below it (+ the call wrapper)
  phase('import', 0.9, 'Preparing the model', t0);
  const t3 = now();
  py.runPython(BOOT);
  apwCall = py.globals.get('_apw_call');
  timings.import_ms = Math.round(now() - t3);

  timings.total_ms = Math.round(now() - t0);
  phase('ready', 1, 'Ready', t0);
  post({ type: 'ready', timings, pyodideVersion });
}

function describe(err) {
  const text = String((err && err.message) || err);
  const lines = text.trim().split('\n');
  return { type: (err && err.type) || (err && err.name) || 'Error', message: lines[lines.length - 1] || text, trace: text };
}

async function handle(m) {
  try {
    await readyPromise;
  } catch (e) {
    post({ id: m.id, ok: false, error: { type: 'LoadError', message: 'the model did not load', trace: '' } });
    return;
  }
  post({ id: m.id, started: true });          // FIX (R18e): the client arms the call's time limit now (see model.js _armTimer)
  const t0 = now();
  try {
    const onProgress = (step, fraction) => post({ id: m.id, progress: { step: String(step), fraction: Number(fraction) } });
    const json = apwCall(m.cmd, m.payload === undefined || m.payload === null ? '' : JSON.stringify(m.payload), onProgress);
    post({ id: m.id, ok: true, result: JSON.parse(json), ms: Math.round(now() - t0) });
  } catch (e) {
    post({ id: m.id, ok: false, error: describe(e) });
  }
}

self.onmessage = (ev) => {
  const m = ev.data || {};
  if (m.cmd === 'init') {
    if (readyPromise) return;
    readyPromise = load(m.files || {}, m.pyodideVersion);
    readyPromise.catch((e) => post({ type: 'load-error', error: { message: String((e && e.message) || e), stack: String((e && e.stack) || '') } }));
    return;
  }
  if (['schema', 'fixed', 'optimal', 'growth', 'extras', 'diagnose', 'champions', 'compare'].includes(m.cmd)) {
    if (!readyPromise) { post({ id: m.id, ok: false, error: { type: 'LoadError', message: 'worker was not initialised', trace: '' } }); return; }
    handle(m);
    return;
  }
  post({ id: m.id, ok: false, error: { type: 'ValueError', message: 'unknown command ' + m.cmd, trace: '' } });
};
