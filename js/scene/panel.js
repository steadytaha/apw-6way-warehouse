// Scene overlay (B4): HUD (clock, speed-up, counts, observed vs model), control dock (view, shell, light, play, speed, ABC), follow chip, tour text and crossfade.
// Glass layers follow style_guide section 6. All figures carry units; "observed in animation" and "model" are labelled.
import { h, icon, fmtNum } from '../ui.js';
import { TIME, ROLES } from '../../design/tokens.js';

const clock = (s) => { s = Math.max(0, Math.floor(s)); const hh = Math.floor(s / 3600), mm = Math.floor(s / 60) % 60, ss = s % 60; return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`; };

function seg(label, items, onPick, cur) {
  const box = h('div.seg.sc-seg', { role: 'radiogroup', 'aria-label': label });
  const btns = items.map(([id, text, title]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(id === cur), title: title || text, 'data-id': id, onclick: () => pick(id) }, text));
  box.append(...btns);
  function pick(id) { set(id); onPick(id); }
  function set(id) { btns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === String(id)))); }
  box.addEventListener('keydown', (e) => {
    if (!/^Arrow/.test(e.key)) return; e.preventDefault();
    const i = btns.findIndex((b) => b.getAttribute('aria-checked') === 'true'), j = (i + (/Right|Down/.test(e.key) ? 1 : -1) + btns.length) % btns.length;
    btns[j].focus(); pick(btns[j].dataset.id);
  });
  return { el: box, set };
}

export function createPanel(stage, api, init) {
  const speeds = TIME.speedupChoices;
  // R24 V6: the HUD is one chip ("29 % busy · 119 s per move"); the observed-against-model rows open on hover, focus or tap
  const hudSum = h('span.sc-hud-sum.num', 'Starting…');
  const hud = h('div.sc-hud.sc-glass', { role: 'group', 'aria-label': 'Animation readout', tabindex: '0', title: 'Observed in the animation, without the wait for a lift. Hover, focus or tap for the model values.' }, h('div.sc-hud-chip', icon('clock', 'sm'), hudSum),
    h('div.sc-hud-row', h('span.sc-k', 'Model time'), h('span.num.sc-time', '0:00:00'), h('span.chip.acc.sc-speed', '6×')),
    h('div.sc-hud-row.sc-moves', h('span.sc-k', 'Pallets moved'), h('span.num.sc-io', 'IN 0 · OUT 0')),
    h('div.sc-hud-row.sc-xfer', { hidden: true }, h('span.sc-k', 'Block transfers'), h('span.num.sc-xfer-n', '0'), h('span.sc-tag.sc-xfer-u', 'shuttles, observed')),
    h('div.sc-hud-row', h('span.sc-k', 'Shuttle busy'), h('span.num.sc-util', 'n/a'), h('span.sc-tag', 'observed, no lift wait')),
    h('div.sc-hud-row.sc-model', h('span.sc-k', ''), h('span.num.sc-util-m', ''), h('span.sc-tag', 'model')),
    h('div.sc-hud-row', h('span.sc-k', 'Time per move'), h('span.num.sc-cyc', 'n/a'), h('span.sc-tag', 'observed, no wait')),
    h('div.sc-hud-row.sc-model', h('span.sc-k', ''), h('span.num.sc-cyc-m', ''), h('span.sc-tag', 'model')));
  hud.addEventListener('click', () => hud.classList.toggle('open'));
  const follow = h('div.sc-follow.sc-glass', { hidden: true, role: 'status' }, h('span.sc-follow-t', ''), h('button.sc-x', { type: 'button', 'aria-label': 'Stop following', onclick: () => api.unfollow() }, icon('x', 'sm')));
  const full = h('button.icon-btn.sc-full.sc-glass', { type: 'button', 'aria-label': 'Expand 3D view', 'aria-pressed': 'false', onclick: () => api.toggleFull() }, icon('expand', 'sm'));
  const play = h('button.btn.sc-play', { type: 'button', 'aria-label': 'Pause animation', 'aria-pressed': 'true', onclick: () => api.togglePlay() }, icon('play', 'sm'), h('span', 'Pause'));
  // R24 V6: camera presets (left toolbar, icon + word) replace the 3D / Plan / Section segment; thumbnails are V7 / later
  const PRESETS = [['orbit', 'Overview', 'building'], ['plan', 'Plan', 'grid'], ['section', 'Section', 'layers'], ['lift', 'Lift', 'gauge'], ['docks', 'Docks', 'target'], ['tiers', 'Tiers', 'layers']];
  const pbtn = PRESETS.map(([id, text, ic]) => h('button.sc-preset', { type: 'button', 'data-id': id, 'aria-pressed': String(id === init.view), title: text + ' view', 'aria-label': text + ' view', onclick: () => api.preset(id) }, icon(ic, 'sm'), h('i.sc-thumb', { 'aria-hidden': 'true' }), h('span', text)));      // R26d V7: .sc-thumb gets the rendered preview (setThumbs)
  const presets = h('div.sc-presets.sc-glass', { role: 'toolbar', 'aria-label': 'Camera presets' }, pbtn);
  const view = { set(v) { pbtn.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === v))); } };
  // legend: one source (ROLES), collapsible, five rows
  const LEG = [['shuttle', 'shuttle'], ['lift', 'gauge'], ['in', 'next'], ['out', 'back'], ['structure', 'grid']];
  const legend = h('details.sc-legend.sc-glass', { open: !matchMedia('(max-width: 40rem)').matches }, h('summary', 'Legend'),
    h('ul', LEG.map(([r, ic]) => h('li', h('i', { style: `background:var(${ROLES[r].css})` }), icon(ic, 'sm'), h('span', r === 'structure' ? 'Rack' : ROLES[r].label)))));
  const shell = seg('Building shell', [['closed', 'Closed'], ['cut', 'Cut-away'], ['open', 'Open']], (v) => api.setShell(v), init.shell);
  const light = seg('Lighting', [['day', 'Day'], ['studio', 'Studio dark'], ['lightsOut', 'Lights out']], (v) => api.setEnv(v), init.env);
  const spd = seg('Animation speed', speeds.map((s) => [s, s + '×', `${s} times real time`]), (v) => api.setSpeed(Number(v)), init.speed);
  const abc = h('button.chip.sc-abc', { type: 'button', 'aria-pressed': 'false', title: 'Colour loads by ABC class (20 / 30 / 50 % of the columns nearest the lifts, assumption)', onclick: () => api.toggleABC() }, 'ABC colours');
  const tiers = h('button.chip.sc-tiers-btn', { type: 'button', 'aria-pressed': 'false', title: 'Tier limit: rack height vs building height, binding limit, next tier', onclick: () => api.toggleTiers() }, 'Tier limit');
  const more = h('button.chip.sc-more', { type: 'button', 'aria-expanded': 'false' }, 'Options', icon('down', 'sm'));
  const dock = h('div.sc-dock.sc-glass', { role: 'toolbar', 'aria-label': '3D view controls' },
    h('div.sc-grp', init.reduced ? h('span.chip.sc-reduced', { title: 'Your system asks for reduced motion: the animation is paused, press Play to run it. The guided demo advances by cuts.' }, 'Motion reduced') : null, play, more), h('div.sc-grp.sc-grp-more', shell.el), h('div.sc-grp.sc-grp-more', light.el), h('div.sc-grp.sc-grp-more', spd.el, abc, tiers));
  more.addEventListener('click', () => { const on = dock.classList.toggle('open'); more.setAttribute('aria-expanded', String(on)); });
  const fade = h('div.sc-fade', { 'aria-hidden': 'true' });
  const text = h('div.sc-text', { 'aria-live': 'polite' });
  const hint = h('div.sc-hint', 'Drag to orbit, scroll to zoom, click a shuttle or lift to follow it');
  stage.append(hud, presets, legend, follow, full, dock, fade, text, hint);
  const q = (s) => hud.querySelector(s);
  const el = { time: q('.sc-time'), speed: q('.sc-speed'), io: q('.sc-io'), util: q('.sc-util'), utilM: q('.sc-util-m'), cyc: q('.sc-cyc'), cycM: q('.sc-cyc-m'), modelRows: hud.querySelectorAll('.sc-model'), xferRow: q('.sc-xfer'), xferN: q('.sc-xfer-n'), xferU: q('.sc-xfer-u') };
  let hintT = setTimeout(() => hint.classList.add('off'), 6000);
  return {
    el: { hud, dock, fade, text, follow, presets, legend },
    /** R26d V7: preview pictures of the camera presets ({id: dataURL}), shown in wide stages */
    setThumbs(map) { pbtn.forEach((b) => { const u = map[b.dataset.id]; const t = b.querySelector('.sc-thumb'); if (u && t) { t.style.backgroundImage = `url(${u})`; b.classList.add('has-thumb'); } }); },
    setView: view.set, setShell: shell.set, setEnv: light.set, setSpeed(v) { spd.set(v); el.speed.textContent = v + '×'; },
    setPlaying(on) { play.setAttribute('aria-pressed', String(on)); play.setAttribute('aria-label', on ? 'Pause animation' : 'Play animation'); play.lastChild.textContent = on ? 'Pause' : 'Play'; },
    setABC(on) { abc.setAttribute('aria-pressed', String(on)); },
    setTiers(on) { tiers.setAttribute('aria-pressed', String(!!on)); },
    setFull(on) { full.setAttribute('aria-pressed', String(on)); full.setAttribute('aria-label', on ? 'Close expanded 3D view' : 'Expand 3D view'); },
    hud(st, model) {
      el.time.textContent = clock(st.t);
      hudSum.textContent = st.shuttleUtil == null && st.cycleObs == null ? 'Starting…' : `${st.shuttleUtil == null ? 'n/a' : fmtNum(st.shuttleUtil * 100, 0) + ' %'} busy · ${st.cycleObs == null ? 'n/a' : fmtNum(st.cycleObs, 0) + ' s'} per move`;
      el.io.textContent = `IN ${fmtNum(st.inDone, 0)} · OUT ${fmtNum(st.outDone, 0)}`;
      el.xferRow.hidden = st.xfer == null; if (st.xfer != null) { el.xferN.textContent = fmtNum(st.xfer, 0); el.xferU.textContent = (st.xferUnit === 'pallets' ? 'pallets on the block conveyor' : 'shuttles') + ', observed'; }
      el.util.textContent = st.shuttleUtil == null ? 'n/a' : fmtNum(st.shuttleUtil * 100, 0) + ' %';
      el.cyc.textContent = st.cycleObs == null ? 'n/a' : fmtNum(st.cycleObs, 0) + ' s';
      el.utilM.textContent = model.util == null ? 'n/a' : fmtNum(model.util * 100, 0) + ' %';   // FIX (R18e): n/a instead of blank when the report lacks the value (old cause: blank text read as "no value shown")
      el.cycM.textContent = model.cycle == null ? 'n/a' : fmtNum(model.cycle, 1) + ' s';
    },
    follow(textStr) { follow.hidden = !textStr; follow.firstChild.textContent = textStr || ''; },
    text(s) { text.textContent = s || ''; text.classList.toggle('on', !!s); },
    fade(ms, on) { fade.style.transition = `opacity ${ms}ms var(--ease-inout)`; fade.style.opacity = on ? '1' : '0'; },
    hideHint() { clearTimeout(hintT); hint.classList.add('off'); },
    dispose() { clearTimeout(hintT); [hud, presets, legend, follow, full, dock, fade, text, hint].forEach((n) => n.remove()); },
  };
}
