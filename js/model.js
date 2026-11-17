// APW model client: the Pyodide worker behind a small promise API (B2).
//
//   import { model } from './model.js';
//   model.onLoad(({ phase, fraction, label }) => ...);   // welcome-screen load progress
//   await model.ready;                                   // starts the worker on first use
//   const schema = await model.schema();
//   const rep    = await model.fixed({ L: 45, W: 30, H: 20 }, ({ step, fraction }) => ...);
//   const out    = await model.optimal({ type: 'capacity', pallets: 4000 }, onProgress);
//   model.cancel();                                      // stops a running call (the worker restarts on the next call)
//
// Errors are ModelError with a code: 'load' | 'load-timeout' | 'timeout' | 'cancelled' | 'python' | 'worker'.
// An infeasible design is NOT an error: it is a report with feasible = false.
// Numbers come from the report only; nothing here computes model values.

// FIX (R26b): the 2.2 MB model bundle is imported when the worker starts, not when the page loads. Old cause: a static import put it into the first download, so the hosted site paid for it before any Run.
import snapshot from '../model/schema_snapshot.js';

// FIX (R21b, A7-11): the demo sends only input keys the model knows. Old cause: service.fixed dropped unknown keys without a word (a typo, or a key of the optimal / growth forms, read as "no change");
// since R21a-3 the report lists them in `unknown_inputs`. Known = the schema fields of the Fixed form + the control keys of apw.service (_FIXED_CONTROL_KEYS, keep in step).
const CONTROL_KEYS = ['options', 'champions', 'extras', 'progress', '_hint', 'chain', 'n_lifts', 'in_lift', 'out_lift', 'support_columns', 'budget', 'pallets', 'shape_goal', 'case', 'flows', 'abc', 'push_to_max', 'shape_params', 'lift_kinds'];
const keysOf = (schema) => new Set([...schema.fixed.fields.map((f) => f.key), ...CONTROL_KEYS]);

export class ModelError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.name = 'ModelError';
    this.code = code;
    this.detail = detail || null;
  }
}

export const TIMEOUTS = { load: 120000, schema: 20000, fixed: 90000, optimal: 240000, growth: 90000, extras: 240000, diagnose: 120000, champions: 120000, compare: 240000 };   // ms (Pyodide is about 3x slower than CPython)

function makeWorker() {
  const inline = globalThis.__APW_INLINE__;            // set by the single-file build
  if (inline && inline.worker) {
    const url = URL.createObjectURL(new Blob([inline.worker], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.__blobUrl = url;
    return w;
  }
  return new Worker(new URL('../model/worker.js', import.meta.url));
}

export class ModelClient {
  constructor({ timeouts = {}, pyodideVersion } = {}) {
    this.timeouts = { ...TIMEOUTS, ...timeouts };
    this.pyodideVersion = pyodideVersion;
    this.state = 'idle';           // idle | loading | ready | error
    this.phase = null;             // last load event
    this.timings = null;           // load timings from the worker, ms
    this.error = null;             // ModelError when state is 'error'
    this._worker = null;
    this.knownKeys = keysOf(snapshot);   // replaced by the live schema() when it is read
    this._ready = null;
    this._pending = new Map();
    this._seq = 0;
    this._loadListeners = new Set();
    this._stateListeners = new Set();
  }

  /** Subscribe to load progress ({phase, fraction, label, ms}); returns an unsubscribe function. A late subscriber gets the last event. */
  onLoad(fn) {
    this._loadListeners.add(fn);
    if (this.phase) fn(this.phase);
    return () => this._loadListeners.delete(fn);
  }

  /** Subscribe to state changes ('idle' | 'loading' | 'ready' | 'error'). */
  onState(fn) {
    this._stateListeners.add(fn);
    return () => this._stateListeners.delete(fn);
  }

  _setState(s, error = null) {
    this.state = s;
    this.error = error;
    for (const fn of this._stateListeners) fn(s, error);
  }

  /** Promise that resolves when the model is loaded; starts the worker on first use. After an error, call restart(). */
  get ready() {
    if (!this._ready) this._ready = this._start();
    return this._ready;
  }

  _start() {
    this._setState('loading');
    this.phase = null;
    return new Promise((resolve, reject) => {
      let worker;
      try {
        worker = makeWorker();
      } catch (e) {
        const err = new ModelError('worker', 'Web Workers are not available here: ' + e.message);
        this._setState('error', err);
        reject(err);
        return;
      }
      this._worker = worker;
      const fail = (err) => {
        // FIX (R18e, A9-9): one automatic retry of a failed load (a fresh worker) before the error state. Old cause: the first failure ended in the error chip at once.
        if (!this._retried && (err.code === 'load' || err.code === 'load-timeout')) {
          this._retried = true; this._teardown();
          this._start().then(resolve, reject);
          return;
        }
        this._teardown();
        this._setState('error', err);
        reject(err);
      };
      const timer = setTimeout(() => fail(new ModelError('load-timeout', `The model did not load within ${this.timeouts.load / 1000} s (check the internet connection to cdn.jsdelivr.net and unpkg.com).`)), this.timeouts.load);
      worker.onerror = (ev) => { clearTimeout(timer); fail(new ModelError('worker', 'The model worker failed: ' + (ev.message || 'unknown error'))); };
      worker.onmessageerror = () => { clearTimeout(timer); fail(new ModelError('worker', 'The model worker sent an unreadable message')); };
      worker.onmessage = (ev) => {
        const m = ev.data || {};
        if (m.type === 'load') {
          this.phase = m;
          for (const fn of this._loadListeners) fn(m);
        } else if (m.type === 'ready') {
          clearTimeout(timer);
          this.timings = m.timings;
          this.pyodideVersion = m.pyodideVersion;
          this._setState('ready');
          resolve(this);
        } else if (m.type === 'load-error') {
          clearTimeout(timer);
          fail(new ModelError('load', 'The model could not be loaded: ' + m.error.message, m.error));
        } else if (m.id !== undefined) {
          this._answer(m);
        }
      };
      import('../model/apw_bundle.js').then((b) => worker.postMessage({ cmd: 'init', files: b.default, pyodideVersion: this.pyodideVersion }),
        (e) => { clearTimeout(timer); fail(new ModelError('load', 'The model files could not be loaded: ' + ((e && e.message) || e))); });
    });
  }

  _answer(m) {
    const p = this._pending.get(m.id);
    if (!p) return;
    if (m.started) { this._armTimer(m.id, p); return; }
    if (m.progress) {
      if (p.onProgress) { try { p.onProgress(m.progress); } catch (e) { console.error(e); } }
      return;
    }
    clearTimeout(p.timer);
    this._pending.delete(m.id);
    if (m.ok) p.resolve(m.result);
    else p.reject(new ModelError('python', m.error.message, m.error));
  }

  // FIX (R18e): a call's time limit runs from the moment the worker STARTS it, not from the moment it was sent. Old cause: the schema call (20 s limit) was sent while a long optimal run was still executing in the same worker (Python cannot be interrupted, calls run one at a time); its timer expired, tore the worker down and rejected the optimal run too ("The run took too long", seen at 22 s).
  _armTimer(id, p) {
    clearTimeout(p.timer);
    p.timer = setTimeout(() => {
      // a stuck run cannot be stopped from inside: replace the worker, the next call loads a fresh one
      const err = new ModelError('timeout', `The model took longer than ${p.limit / 1000} s and was stopped.`);
      this._teardown();
      this._rejectAll(err);
      this._ready = null;
      this._setState('idle');
    }, p.limit);
  }

  _teardown() {
    if (this._worker) {
      this._worker.terminate();
      if (this._worker.__blobUrl) URL.revokeObjectURL(this._worker.__blobUrl);
      this._worker = null;
    }
  }

  _rejectAll(err) {
    for (const [id, p] of this._pending) { clearTimeout(p.timer); p.reject(err); }
    this._pending.clear();
  }

  /** Discard the worker and start a fresh one on the next call (use after an error, or to stop a running call). */
  restart() {
    this._teardown();
    this._rejectAll(new ModelError('cancelled', 'The model call was cancelled'));
    this._ready = null;
    this._retried = false;          // FIX (R18e): a manual restart gets its own automatic retry
    this.phase = null;
    this._setState('idle');
  }

  /** Stop a running call. The Python run cannot be interrupted, so the worker is replaced (reload takes a few seconds). */
  cancel() {
    if (this._pending.size) this.restart();
  }

  async _call(cmd, payload, onProgress) {
    await this.ready;
    const id = ++this._seq;
    return new Promise((resolve, reject) => {
      const limit = this.timeouts[cmd];
      this._pending.set(id, { resolve, reject, onProgress, timer: 0, limit });     // the timer is armed by the worker's 'started' message
      this._worker.postMessage({ id, cmd, payload });
    });
  }

  schema() { return this._call('schema').then((s) => { if (s && s.fixed) this.knownKeys = keysOf(s); return s; }); }
  /** Split a Fixed request into the keys the model knows and the rest (the rest is never sent; it is reported, see `_known`). */
  splitKnown(inputs) {
    const clean = {}, dropped = [];
    for (const [k, v] of Object.entries(inputs || {})) { if (this.knownKeys.has(k)) clean[k] = v; else dropped.push(k); }
    if (dropped.length) console.warn('[model] input keys the model does not know were not sent:', dropped.join(', '));
    return { clean, dropped: dropped.sort() };
  }
  /** Run a Fixed-type call with the known keys only; the dropped keys join `report.unknown_inputs` so the result screen can show them. */
  async _known(cmd, inputs, onProgress) {
    const { clean, dropped } = this.splitKnown(inputs);
    const out = await this._call(cmd, clean, onProgress);
    if (dropped.length && out && typeof out === 'object' && !Array.isArray(out)) out.unknown_inputs = [...new Set([...(out.unknown_inputs || []), ...dropped])].sort();
    return out;
  }
  fixed(inputs, onProgress) { return this._known('fixed', inputs, onProgress); }
  optimal(goal, onProgress) { return this._call('optimal', goal || {}, onProgress); }
  /** Growth delta (R9b): inputs of the current building plus new_in_h / new_out_h (absolute pallets per hour) and / or new_cap_target. */
  growth(inputs, onProgress) { return this._call('growth', inputs || {}, onProgress); }
  /** R17b: the full diagnosis block (limits, best possible, ranked options with input patches) of a fixed building. */
  diagnose(inputs, onProgress) { return this._known('diagnose', inputs, onProgress); }
  /** R20d: the KPI champions of a fixed building ({ champions: [...], warning }), computed after the first result (the Fixed run leaves them out). */
  champions(inputs, onProgress) { return this._known('champions', inputs, onProgress); }
  /** R25b: the three flow formats I / U / L on the same inputs: { inputs, bays?, priority? } -> service.compare_flows (reports, winners, recommendation of every priority). The inputs go through the known-key filter. */
  async compare({ inputs, bays, priority, flows } = {}, onProgress) {
    const { clean, dropped } = this.splitKnown(inputs);
    const out = await this._call('compare', { inputs: clean, bays: bays || {}, priority: priority || 'balanced', ...(flows ? { flows } : {}) }, onProgress);
    if (dropped.length && out && typeof out === 'object') out.unknown_inputs = dropped;
    return out;
  }
  /** Team cases 1-4, service-level sweep and 7-tier sensitivity of a building: { team_cases, service_level_sweep, tiers_sensitivity }. */
  extras(inputs, onProgress) { return this._known('extras', inputs, onProgress); }
}

export const model = new ModelClient();
export default model;
