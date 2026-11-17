// Schema-driven form fields, validation from schema bounds, and the interactive dock plan.
import { h, fmtNum, assumeBadge } from './ui.js';
import { state } from './store.js';

export const WALLS = { W: 'West', E: 'East', N: 'North', S: 'South' };
const CHOICE_LABELS = {
  depth: { auto: 'Auto', 6: '6-deep', 3: '3-deep', 2: '2-deep', mixed: 'Mixed 6 + 3' },
  depths: { 6: '6-deep', 3: '3-deep', 2: '2-deep', mixed: 'Mixed 6 + 3' },
  orient: { auto: 'Auto', x: 'Along length', y: 'Along width' },
  // FIX (R18e): the lift_type label map is removed. Old cause: no lift_type input is in the schema any more (R9a: every lift is a shuttle lift), so the map was keyed by a name no field carries.
  shape: { any: 'Any (the search chooses)', rect: 'Rectangle', L: 'L-shape', U: 'U-shape', T: 'T-shape' },      // FIX (R18e): labels for the Fixed and the Optimal shape input
  front_turns: { none: 'None', aisle: 'Aisle', both: 'Both' },
  objective: { annual: 'Annual cost', capex: 'CAPEX' },
  case: { low: 'Low prices', high: 'High prices' },
  abc_skew: { '80/15/5': '80 / 15 / 5', '60/30/10': '60 / 30 / 10', '20/80': 'Pareto 20 / 80', '40/30/30': 'Flat 40 / 30 / 30' },   // FIX (R21b, A4-16): the flat preset of the model (R21a)      // R13b: moves of classes A / B / C
  fire_strategy: { in_rack: 'In-rack sprinklers', o2_reduction: 'Oxygen reduction' },
};
// R17b: plain-language help for the capacity inputs (the model's help text names the step that added them). Both values are assumptions of the model.
export const HELP_OVERRIDE = {
  cap_target: 'Pallets the warehouse must hold. The check counts the pallets the lanes really store (positions × lane fill, honeycombing), not the positions alone; the report gives the verdict, the positions needed and what would close a gap.',
  cap_sl: 'How sure the capacity check must be that the target pallets fit: 0.90 means the lanes hold the target with probability 90 % (same level as the truck-bay service level, an assumption). 0.50 = the expected stored pallets must reach the target. The honeycombing of lanes (one SKU = 6 unit loads) sets the spread; with thousands of lanes it adds only a few percent of positions.',
  stock_cv: 'Day-to-day variation of the stock level around the target, as a share (0.10 = 10 %). 0 means the stock is always exactly the target (an assumption: the brief gives no stock profile). A higher value asks for more positions.',
};
export function choiceLabel(key, c) {
  if (CHOICE_LABELS[key] && CHOICE_LABELS[key][c] != null) return CHOICE_LABELS[key][c];
  if (WALLS[c] && /wall$/.test(key)) return WALLS[c];
  if (c === 'auto') return 'Auto';
  if (/^\d+$/.test(String(c))) return String(c);
  const s = String(c).replace(/[:_]/g, ' · ').replace(/\s+/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
/** R9b: inputs the model takes as a share 0..1 are shown as percent (80-99 %, 15 %). Returns the field with percent bounds; `toModel` divides by 100. */
export const PCT_KEYS = new Set(['level_of_service', 'ops_share', 'reserve_share']);
export function asPercent(f) {
  if (!PCT_KEYS.has(f.key) || f.pct) return f;
  const r = (x) => (x == null ? x : Math.round(x * 1000) / 10);
  return { ...f, pct: true, unit: '%', min: r(f.min), max: r(f.max), step: 1, default: r(f.default) };
}
const unitOf = (f) => (f.unit === '0..1' ? '0–1' : f.unit || '');
const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);

/** Validate a raw value against the schema field. -> { ok, value, msg } ; value is null for an empty optional number. */
export function check(f, raw) {
  if (f.type === 'number') {
    const s = String(raw ?? '').trim().replace(',', '.');
    if (s === '') return f.required ? { ok: false, value: null, msg: `Enter the ${lc(f.label)}.` } : { ok: true, value: null };
    const n = Number(s);
    if (!Number.isFinite(n)) return { ok: false, value: null, msg: 'Enter a number.' };
    const u = f.unit && f.unit !== '0..1' ? ' ' + f.unit : '';
    const lo = f.min, hi = f.max;
    if ((lo != null && n < lo) || (hi != null && n > hi)) {
      const range = lo != null && hi != null ? `between ${fmtNum(lo, 2).replace(/\.00$/, '')} and ${fmtNum(hi, 2).replace(/\.00$/, '')}${u}` : lo != null ? `at least ${lo}${u}` : `at most ${hi}${u}`;
      return { ok: false, value: n, msg: `${f.label} must be ${range}.` };
    }
    if (f.step === 1 && !Number.isInteger(n)) return { ok: false, value: n, msg: `${f.label} must be a whole number.` };
    return { ok: true, value: n };
  }
  if (f.type === 'multi') return raw && raw.length ? { ok: true, value: raw } : { ok: false, value: null, msg: 'Pick at least one option.' };
  return { ok: true, value: raw };
}

let uid = 0;
/** One field. ctx = { get(key), set(key, raw), changed() }. -> { el, validate(show) -> bool, focus() } */
export function renderField(f, ctx, { labelOverride } = {}) {
  const id = `f${++uid}-${f.key}`;
  const helpId = id + '-h';
  // FIX (R13b): fields whose help names an assumption carry the same 'assumption' tag as the result pages (the model writes *assumption* in the help text). Old cause: the tag was missing in the wizard.
  const isAssume = /assumption/i.test(HELP_OVERRIDE[f.key] || f.help || '');
  const label = isAssume && !labelOverride ? h('span', f.label, ' ', assumeBadge('this value is an assumption of the model; the source or the reason is in the text below')) : (labelOverride || f.label);
  // FIX (R9a): the field help names the reason for the height bound (team #26). Source: schema().height_bound.reason; the live schema already puts it into the help text,
  // this adds it when only the older build-time snapshot is loaded. HOOK (R9b): if the model renames height_bound, change it here only.
  const hb = (f.key === 'H' || f.key === 'h_max') && state.schema && state.schema.height_bound;
  // R9b: model help strings that still say 'base design' are reworded (no example comparison, R13b)
  const clean = (t) => String(HELP_OVERRIDE[f.key] || t || '').replace(/^R\d+[a-z]?:?\s+/, '').replace(/[*]assumption[*]/gi, 'assumption').replace(/\bthe base design\b/gi, 'the defaults').replace(/\bbase design\b/gi, 'defaults');   // FIX (R13b): the regexes held a backspace character instead of \b, so nothing was cleaned
  const helpText = hb && hb.reason && !(f.help || '').includes(hb.reason.slice(0, 24)) ? `${f.help || ''} Height bound: ${hb.reason}${hb.assumption ? ' (assumption)' : ''}`.trim() : clean(f.help);
  const help = h('div.msg', { id: helpId }, helpText);
  let touched = false;
  let el, focusEl, update;
  const showMsg = (r) => {
    const bad = touched && !r.ok;
    help.textContent = bad ? r.msg : helpText;
    help.classList.toggle('err', bad);
    help.setAttribute('role', bad ? 'alert' : 'note');
    if (wrap) wrap.classList.toggle('err', bad);
    if (focusEl) focusEl.setAttribute('aria-invalid', bad ? 'true' : 'false');
  };
  let wrap = null;

  if (f.type === 'number') {
    const input = h('input', { id, type: 'text', inputmode: f.step && f.step < 1 ? 'decimal' : 'numeric', autocomplete: 'off', value: ctx.get(f.key) ?? '', 'aria-describedby': helpId, spellcheck: 'false' });
    focusEl = input;
    wrap = h('div.inp', input, unitOf(f) && h('span.u', unitOf(f)));
    input.addEventListener('input', () => { touched = true; ctx.set(f.key, input.value); showMsg(check(f, input.value)); ctx.changed(f.key); });
    input.addEventListener('blur', () => { touched = true; showMsg(check(f, input.value)); });
    el = h('div.field', h('label', { for: id }, label), wrap, help);
    update = () => { if (document.activeElement !== input) input.value = ctx.get(f.key) ?? ''; showMsg(check(f, input.value)); };
  } else if (f.type === 'choice') {
    const choices = f.choices;
    const cur = () => String(ctx.get(f.key) ?? f.default ?? '');
    if (choices.length <= 5) {
      const seg = h('div.seg.block', { role: 'radiogroup', 'aria-labelledby': id + '-l', 'aria-describedby': helpId });
      const btns = choices.map((c) => h('button', { type: 'button', role: 'radio', 'data-v': c, onclick: () => pick(c) }, choiceLabel(f.key, c)));
      seg.append(...btns);
      const paint = () => btns.forEach((b) => { const on = b.dataset.v === cur(); b.setAttribute('aria-checked', on); b.tabIndex = on ? 0 : -1; });
      const pick = (c) => { ctx.set(f.key, String(c)); paint(); ctx.changed(f.key); };
      seg.addEventListener('keydown', (e) => {
        const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!k) return;
        e.preventDefault();
        const i = (choices.map(String).indexOf(cur()) + k + choices.length) % choices.length;
        pick(choices[i]); btns[i].focus();
      });
      focusEl = btns[0];
      el = h('div.field', h('div.lbl', { id: id + '-l' }, label), seg, help);
      update = () => paint();
    } else {
      const sel = h('select.sel', { id, 'aria-describedby': helpId }, choices.map((c) => h('option', { value: c }, choiceLabel(f.key, c))));
      sel.addEventListener('change', () => { ctx.set(f.key, sel.value); ctx.changed(f.key); });
      focusEl = sel;
      el = h('div.field', h('label', { for: id }, label), h('div.sel-wrap', sel), help);
      update = () => { sel.value = String(ctx.get(f.key) ?? f.default ?? choices[0]); };
    }
  } else if (f.type === 'bool') {
    const cb = h('input.sw-toggle', { type: 'checkbox', id, role: 'switch', 'aria-describedby': helpId });
    cb.addEventListener('change', () => { ctx.set(f.key, cb.checked); ctx.changed(f.key); });
    focusEl = cb;
    el = h('div.field', h('label.switch-row', { for: id }, cb, h('span', label)), help);
    update = () => { cb.checked = !!ctx.get(f.key); };
  } else if (f.type === 'multi') {
    const cur = () => ctx.get(f.key) || [];
    const box = h('div.chips-multi', { role: 'group', 'aria-labelledby': id + '-l', 'aria-describedby': helpId });
    const btns = f.choices.map((c) => h('button', { type: 'button', 'data-v': c, onclick: () => {
      const s = new Set(cur().map(String));
      if (s.has(String(c))) s.delete(String(c)); else s.add(String(c));
      ctx.set(f.key, f.choices.filter((x) => s.has(String(x))));
      touched = true; paint(); ctx.changed(f.key);
    } }, choiceLabel(f.key, c)));
    box.append(...btns);
    const paint = () => { btns.forEach((b) => b.setAttribute('aria-pressed', cur().map(String).includes(b.dataset.v))); showMsg(check(f, cur())); };
    focusEl = btns[0];
    el = h('div.field', h('div.lbl', { id: id + '-l' }, label), box, help);
    update = paint;
  } else if (f.type === 'text') {
    // R9b: free-text inputs (lift_kinds). Shape parameters have their own editor in the wizard.
    const input = h('input', { id, type: 'text', autocomplete: 'off', value: ctx.get(f.key) ?? '', 'aria-describedby': helpId, spellcheck: 'false' });
    focusEl = input;
    wrap = h('div.inp', input);
    input.addEventListener('input', () => { ctx.set(f.key, input.value); ctx.changed(f.key); });
    el = h('div.field', h('label', { for: id }, label), wrap, help);
    update = () => { if (document.activeElement !== input) input.value = ctx.get(f.key) ?? ''; };
  } else {
    el = h('div.field', h('div.lbl', label));
    update = () => {};
  }
  update();
  return {
    el,
    key: f.key,
    refresh: update,
    validate(show = true) {
      const r = check(f, ctx.get(f.key));
      if (show) { touched = true; showMsg(r); }
      return r.ok;
    },
    focus() { focusEl && focusEl.focus(); },
  };
}

// ---------------------------------------------------------------- dock plan
const svgNS = 'http://www.w3.org/2000/svg';
const S = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  kids.forEach((k) => e.append(k));
  return e;
};
const round05 = (x) => Math.round(Math.min(1, Math.max(0, x)) * 20) / 20;

/** Plan view of the building with IN / OUT docks. Tap or drag on the plan to place the active dock on the nearest wall.
 *  opts = { dims() -> {L, W}, keys: {in_wall, in_pos, out_wall, out_pos} | null, get(key), set(key, raw), changed(), interactive }  */
export function renderPlan(opts) {
  const VW = 360, VH = 236, M = 38;
  const svg = S('svg', { viewBox: `0 0 ${VW} ${VH}`, class: 'plan-svg', role: 'img', tabindex: opts.interactive ? '0' : '-1', preserveAspectRatio: 'xMidYMid meet' });
  let active = 'in';
  const info = h('div.plan-info');
  const flow = h('span.chip.acc');
  const wrap = h('div.plan');
  const pickSeg = h('div.seg', { role: 'radiogroup', 'aria-label': 'Dock to place' });
  const bIn = h('button', { type: 'button', role: 'radio', onclick: () => { active = 'in'; draw(); } }, 'Place IN dock');
  const bOut = h('button', { type: 'button', role: 'radio', onclick: () => { active = 'out'; draw(); } }, 'Place OUT dock');
  pickSeg.append(bIn, bOut);
  // FIX (R9a): the OUT radio could not be reached with the keyboard (old cause: roving tabindex gave OUT tabindex -1 but the group had no arrow-key handler, so only IN worked)
  pickSeg.addEventListener('keydown', (e) => {
    if (!/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return;
    e.preventDefault();
    active = active === 'in' ? 'out' : 'in'; draw(); (active === 'in' ? bIn : bOut).focus();
  });
  if (opts.interactive) wrap.append(h('div.row.plan-top', pickSeg, flow));
  wrap.append(svg, info);

  const geo = () => {
    const d = opts.dims();
    const L = Math.max(1, d.L), W = Math.max(1, d.W);
    const s = Math.min((VW - 2 * M) / L, (VH - 2 * M) / W);
    const w = L * s, hh = W * s;
    return { L, W, s, x0: (VW - w) / 2, y0: (VH - hh) / 2, w, h: hh };
  };
  const dockPt = (g, wall, pos) => {
    if (wall === 'W') return { x: g.x0, y: g.y0 + g.h * (1 - pos), nx: -1, ny: 0 };
    if (wall === 'E') return { x: g.x0 + g.w, y: g.y0 + g.h * (1 - pos), nx: 1, ny: 0 };
    if (wall === 'S') return { x: g.x0 + g.w * pos, y: g.y0 + g.h, nx: 0, ny: 1 };
    return { x: g.x0 + g.w * pos, y: g.y0, nx: 0, ny: -1 };
  };
  const val = (k) => (opts.keys ? opts.get(opts.keys[k]) : null);

  function draw() {
    const g = geo();
    svg.replaceChildren();
    svg.append(S('rect', { x: g.x0, y: g.y0, width: g.w, height: g.h, rx: 4, class: 'plan-bld' }));
    // dimension labels (inside the outline, so they never collide with the wall letters)
    if (!opts.schematic) {
      svg.append(S('text', { x: g.x0 + g.w / 2, y: g.y0 + g.h - 8, 'text-anchor': 'middle', class: 'plan-dim' }, `${fmtNum(g.L, 1).replace(/\.0$/, '')} m`));
      svg.append(S('text', { x: g.x0 + 12, y: g.y0 + g.h / 2, 'text-anchor': 'middle', class: 'plan-dim', transform: `rotate(-90 ${g.x0 + 12} ${g.y0 + g.h / 2})` }, `${fmtNum(g.W, 1).replace(/\.0$/, '')} m`));
    }
    if (opts.keys) {
      if (opts.interactive) {
        for (const [w, p] of Object.entries({ W: [g.x0, g.y0, g.x0, g.y0 + g.h], E: [g.x0 + g.w, g.y0, g.x0 + g.w, g.y0 + g.h], N: [g.x0, g.y0, g.x0 + g.w, g.y0], S: [g.x0, g.y0 + g.h, g.x0 + g.w, g.y0 + g.h] })) {
          svg.append(S('line', { x1: p[0], y1: p[1], x2: p[2], y2: p[3], class: 'plan-wall' }));
          const lx = w === 'W' ? g.x0 - 9 : w === 'E' ? g.x0 + g.w + 9 : g.x0 + g.w / 2;
          const ly = w === 'N' ? g.y0 - 8 : w === 'S' ? g.y0 + g.h + 15 : g.y0 + g.h / 2 + 4;
          if (w === 'N' || w === 'S') svg.append(S('text', { x: lx, y: ly, 'text-anchor': 'middle', class: 'plan-wl' }, w));
          else svg.append(S('text', { x: lx, y: ly, 'text-anchor': 'middle', class: 'plan-wl' }, w));
        }
      }
      const iw = val('in_wall'), ow = val('out_wall');
      const ip = parseFloat(val('in_pos')), op = parseFloat(val('out_pos'));
      const a = Number.isFinite(ip) ? dockPt(g, iw, Math.min(1, Math.max(0, ip))) : null;
      let b = Number.isFinite(op) ? dockPt(g, ow, Math.min(1, Math.max(0, op))) : null;
      if (a && b && Math.hypot(a.x - b.x, a.y - b.y) < 30) {                       // same spot: draw OUT beside IN
        const along = a.nx ? { x: 0, y: 1 } : { x: 1, y: 0 };
        b = { ...b, x: b.x + along.x * 30, y: b.y + along.y * 30 };
      }
      const mark = (pt, txt, cls, on) => {
        if (!pt) return;
        const gx = S('g', { class: 'plan-dock ' + cls + (on ? ' on' : ''), transform: `translate(${pt.x} ${pt.y})` });
        gx.append(S('rect', { x: -17, y: -10, width: 34, height: 20, rx: 10 }), S('text', { 'text-anchor': 'middle', y: 4.5 }, txt));
        svg.append(gx);
      };
      mark(a, 'IN', 'in', active === 'in' && opts.interactive);
      mark(b, 'OUT', 'out', active === 'out' && opts.interactive);
      const sameWall = iw === ow, opp = { W: 'E', E: 'W', N: 'S', S: 'N' }[iw] === ow;
      flow.textContent = sameWall ? 'U flow (same wall)' : opp ? 'I flow (opposite walls)' : 'L flow (adjacent walls)';
      info.textContent = `IN: ${WALLS[iw] || '-'} wall, ${Number.isFinite(ip) ? fmtNum(ip, 2) : '-'}.  OUT: ${WALLS[ow] || '-'} wall, ${Number.isFinite(op) ? fmtNum(op, 2) : '-'}.  Position runs ${'south to north on west and east walls, west to east on north and south walls'}.`;
      svg.setAttribute('aria-label', `Plan of the building, ${fmtNum(g.L, 1)} by ${fmtNum(g.W, 1)} metres. IN dock on the ${WALLS[iw]} wall at ${val('in_pos')}, OUT dock on the ${WALLS[ow]} wall at ${val('out_pos')}.`);
      bIn.setAttribute('aria-checked', active === 'in'); bOut.setAttribute('aria-checked', active === 'out');
      bIn.tabIndex = active === 'in' ? 0 : -1; bOut.tabIndex = active === 'out' ? 0 : -1;
    } else {
      svg.append(S('text', { x: g.x0 + g.w / 2, y: g.y0 + g.h / 2 + 4, 'text-anchor': 'middle', class: 'plan-area' }, `${fmtNum(g.L * g.W, 0)} m²`));
      info.textContent = `Aspect ${fmtNum(Math.max(g.L, g.W) / Math.min(g.L, g.W), 2)} : 1`;
      svg.setAttribute('aria-label', `Plan of the building, ${fmtNum(g.L, 1)} by ${fmtNum(g.W, 1)} metres.`);
    }
  }

  function place(ev) {
    const g = geo();
    const r = svg.getBoundingClientRect();
    const sc = Math.min(r.width / VW, r.height / VH);
    const ox = (r.width - VW * sc) / 2, oy = (r.height - VH * sc) / 2;
    const x = (ev.clientX - r.left - ox) / sc, y = (ev.clientY - r.top - oy) / sc;
    // FIX (R9a): the nearest wall is now the nearest wall segment (old cause: distance to the infinite wall line, so a tap beside the building picked a far wall)
    const dx = (lo, hi, v) => Math.max(lo - v, 0, v - hi), dy = dx;
    const d = { W: Math.hypot(Math.abs(x - g.x0), dy(g.y0, g.y0 + g.h, y)), E: Math.hypot(Math.abs(x - (g.x0 + g.w)), dy(g.y0, g.y0 + g.h, y)),
      N: Math.hypot(Math.abs(y - g.y0), dx(g.x0, g.x0 + g.w, x)), S: Math.hypot(Math.abs(y - (g.y0 + g.h)), dx(g.x0, g.x0 + g.w, x)) };
    const wall = Object.keys(d).sort((a, b) => d[a] - d[b])[0];
    const pos = wall === 'W' || wall === 'E' ? round05(1 - (y - g.y0) / g.h) : round05((x - g.x0) / g.w);
    set(wall, pos);
  }
  const K = (which, part) => opts.keys[`${which}_${part}`];
  function set(wall, pos) {
    opts.set(K(active, 'wall'), wall);
    opts.set(K(active, 'pos'), String(pos));
    draw();
    opts.changed();
  }
  if (opts.interactive && opts.keys) {
    let down = false;
    svg.addEventListener('pointerdown', (e) => { down = true; try { svg.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ } place(e); });
    svg.addEventListener('pointermove', (e) => { if (down) place(e); });
    svg.addEventListener('pointerup', () => { down = false; });
    svg.addEventListener('pointercancel', () => { down = false; });
    svg.addEventListener('keydown', (e) => {
      const dv = { ArrowRight: [1, 'E'], ArrowUp: [1, 'N'], ArrowLeft: [-1, 'W'], ArrowDown: [-1, 'S'] }[e.key];
      if (!dv) return;
      e.preventDefault();
      const wall = val(active + '_wall'), pos = parseFloat(val(active + '_pos')) || 0;
      const horizontal = wall === 'N' || wall === 'S';
      if (horizontal && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) set(wall, round05(pos + 0.05 * dv[0]));
      else if (!horizontal && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) set(wall, round05(pos + 0.05 * dv[0]));
    });
  }
  draw();
  return { el: wrap, redraw: draw };
}
