// App state in memory; the last inputs are mirrored to localStorage (best effort, never required).
import snapshot from '../model/schema_snapshot.js';

const KEY = 'apw.inputs.v1';

export const state = {
  schema: snapshot,            // build-time snapshot of schema(); replaced by the live one when the worker is ready
  schemaLive: false,
  mode: null,                  // 'fixed' | 'optimal'
  fixed: { vals: {}, manual: {} },                       // vals[key] raw input; manual[stepId] true = "I'll set this"
  optimal: { goalType: 'capacity', goalKey: { capacity: 'pallets', budget: 'capex_eur' }, vals: {}, manual: {}, docks: false },
  compare: { vals: {}, bays: { I: {}, U: {}, L: {} }, priority: 'balanced', result: null, payload: null, stale: false },   // R25b: inputs of the Compare flows view (raw strings, like fixed.vals), the dock changes the user made per flow, the chosen priority, the result shown
  job: null,                   // { mode, payload, startedAt } while a run is pending
  result: null,                // { mode, report, alternatives, search, inputs }
  view: null,                  // currently shown report (best or a selected alternative)
};

export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!s) return;
    if (s.fixed) Object.assign(state.fixed, { vals: s.fixed.vals || {}, manual: s.fixed.manual || {} });
    if (s.compare) Object.assign(state.compare, { vals: s.compare.vals || {}, bays: { I: {}, U: {}, L: {}, ...(s.compare.bays || {}) }, priority: s.compare.priority || 'balanced' });
    if (s.optimal) Object.assign(state.optimal, { goalType: s.optimal.goalType || 'capacity', goalKey: { ...state.optimal.goalKey, ...(s.optimal.goalKey || {}) },
      vals: s.optimal.vals || {}, manual: s.optimal.manual || {}, docks: !!s.optimal.docks });
  } catch (e) { /* no storage or bad JSON: start fresh */ }
}
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ fixed: state.fixed, optimal: state.optimal, compare: { vals: state.compare.vals, bays: state.compare.bays, priority: state.compare.priority } })); } catch (e) { /* storage blocked */ }
}

/** Field default as a string/boolean/array suitable for the form. */
export function defaultRaw(f) {
  const d = f.default;
  if (f.type === 'number') return d == null ? '' : String(d);
  if (f.type === 'multi') return Array.isArray(d) ? [...d] : [];
  if (f.type === 'bool') return !!d;
  return d == null ? '' : String(d);
}
export function resetInputs() {
  state.fixed = { vals: {}, manual: {} };
  state.optimal = { goalType: 'capacity', goalKey: { capacity: 'pallets', budget: 'capex_eur' }, vals: {}, manual: {}, docks: false };
  state.compare.vals = {}; state.compare.bays = { I: {}, U: {}, L: {} };
  save();
}
