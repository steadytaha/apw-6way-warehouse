// Guided demo / present mode (B5). A full-screen layer over the 3D stage that runs the story chapters in sequence with their camera shots
// (`scene.tour`), captions, count-up numbers, a small chart and a progress rail. Controls: Space pause / play, arrows previous / next chapter,
// R recording mode, Esc close. Recording mode hides every control and the scene HUD, frames the stage 16:9 and waits (paused at the start) until
// Space is pressed, so the team can start a screen recording first. Reduced motion: no camera flights (the scene cuts), content cross-fades only.
import { h, icon, countUp, reducedMotion, riseIn, assumeBadge } from '../ui.js';
import { numText, numValue, deltaText } from './chapters.js';
import { drawIn } from './charts.js';

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function openPresent({ api, stage, chapters, shots, autoplay, startAt = 0, onClose, onChapter }) {
  const reduced = reducedMotion();
  const FADE = reduced ? 0 : 225;                                    // the scene cuts at the middle of its 450 ms crossfade; captions swap then
  const wasFull = stage.classList.contains('is-full');
  if (!wasFull) api.toggleFull();
  stage.classList.add('pr-on');

  const chs = () => chapters();
  const n = chs().length;
  const flat = [];
  chs().forEach((c, ci) => (shots[c.id] || []).forEach((s) => flat.push({ ci, shot: s })));
  const starts = []; let total = 0;
  flat.forEach((f) => { starts.push(total); total += f.shot.dur; });
  const chStart = chs().map((c, ci) => starts[flat.findIndex((f) => f.ci === ci)]);
  const chDur = chs().map((c, ci) => flat.filter((f) => f.ci === ci).reduce((a, f) => a + f.shot.dur, 0));

  let idx = startAt, tour = null, startIdx = 0, paused = !autoplay, ended = false, rec = false, closed = false, token = 0, swapT = 0, raf = 0, started = false;

  // ---- DOM
  const kick = h('p.pr-kick'), msg = h('p.pr-msg'), nums = h('div.pr-nums'), chartBox = h('div.pr-chart', { 'aria-label': 'Chart' });
  const cap = h('div.pr-cap', { 'aria-live': 'polite' }, kick, msg, nums);
  // R24 V5: one solid caption panel on the left (80 % surface, was a gradient scrim over the picture) holds kicker, sentence, numbers and the chart; the scene is shifted into the free part (setSafeInset)
  const panel = h('div.pr-panel', cap, chartBox);
  const segs = chs().map((c, i) => h('button.pr-seg', { type: 'button', 'aria-label': `Chapter ${i + 1}: ${c.title}`, title: c.title, onclick: () => playFrom(i, { paused }) }, h('i')));
  const rail = h('div.pr-rail', { role: 'group', 'aria-label': 'Chapters' }, segs);
  const time = h('span.pr-time.num', `0:00 / ${mmss(total)}`);
  const btnPrev = h('button.icon-btn', { type: 'button', 'aria-label': 'Previous chapter', title: 'Previous chapter (Left arrow)', onclick: () => step(-1) }, icon('back'));
  const btnPlay = h('button.icon-btn.pr-play', { type: 'button', onclick: toggle });
  const btnNext = h('button.icon-btn', { type: 'button', 'aria-label': 'Next chapter', title: 'Next chapter (Right arrow)', onclick: () => step(1) }, icon('next'));
  const btnRec = h('button.chip.pr-recbtn', { type: 'button', 'aria-pressed': 'false', title: 'Recording mode (R): no controls, 16:9 frame, starts when you press Space', onclick: () => setRec(!rec) }, icon('cube', 'sm'), 'Recording mode');
  const btnClose = h('button.icon-btn', { type: 'button', 'aria-label': 'Close the demo', title: 'Close (Esc)', onclick: () => close() }, icon('x'));
  const bar = h('div.pr-bar.sc-glass', { role: 'toolbar', 'aria-label': 'Demo controls' }, h('div.pr-ctl', btnPrev, btnPlay, btnNext), rail, time, btnRec, btnClose);
  // R24 V3: the first frame of a recording is the open-building shot of chapter 1 (slow orbit) under a title card; FIX (R24 V3): the card was only 'Press Space to start' over the closed box
  const arm = h('div.pr-arm', h('strong.pr-arm-t', 'APW 6-way store'), h('span.pr-arm-s', 'Press Space to start'));
  const root = h('div.pr', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Guided demo', tabindex: '-1' }, panel, bar, arm);
  stage.append(root);
  root.focus({ preventScroll: true });
  // R24 V4: scene labels stay out of the caption, the chart card and the control bar (old cause: zone names sat under the caption, A9-10)
  try { api.setLabelAvoid(() => [panel, bar, arm].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0)); } catch (e) { /* older scene without labels */ }

  function setPlayIcon() {
    const label = ended ? 'Replay the demo' : paused ? 'Play' : 'Pause';
    btnPlay.replaceChildren(icon(ended || paused ? 'play' : 'pause'));
    btnPlay.setAttribute('aria-label', label); btnPlay.title = label + ' (Space)';
    root.dataset.paused = String(paused);
    root.dataset.armed = String(rec && paused && !started);
  }

  // ---- caption content
  function numCell(nm) {
    const v = numValue(nm), f = (x) => numText({ ...nm, value: x / (nm.scale || 1) });
    const el = h('span.num.pr-nv', v == null ? 'n/a' : f(v));
    if (v != null) countUp(el, v, f);
    const dt = deltaText(nm);
    return h('div.pr-num', h('span.pr-nl', nm.label, nm.note && assumeBadge(nm.note)), h('span.pr-nn', el, h('small', nm.unit)), dt && h('span.pr-nd', dt));
  }
  function swap(ci) {
    if (closed) return;
    const c = chs()[ci], chart = c.chart();
    kick.textContent = `${ci + 1} / ${n}  ·  ${c.title}`;
    msg.textContent = c.msg;
    nums.replaceChildren(...c.nums.map(numCell));
    chartBox.replaceChildren(chart); chartBox.setAttribute('aria-label', 'Chart: ' + c.title);
    riseIn([kick, msg, nums, chartBox], { stagger: 60, dist: 14 });
    drawIn(chart, { delay: 250 });
    segs.forEach((s, i) => { if (i === ci) s.setAttribute('aria-current', 'step'); else s.removeAttribute('aria-current'); });
    fitSafe();
    if (onChapter) onChapter(ci);
  }

  // R24 V5: the covered part of the stage (caption panel on the left, or a bottom sheet on a narrow stage, plus the control bar) is passed to the scene so the subject lands in the free part
  function fitSafe() {
    if (closed) return;
    try {
      const sr = stage.getBoundingClientRect(), pr = panel.getBoundingClientRect(), br = bar.getBoundingClientRect();
      if (!sr.width || !sr.height) return;
      const sheet = pr.width > sr.width * 0.9;
      const barH = rec ? 0 : Math.max(0, sr.bottom - br.top) / sr.height;
      api.setSafeInset({ left: sheet ? 0 : Math.max(0, pr.right - sr.left) / sr.width, bottom: Math.max(barH, sheet ? Math.max(0, sr.bottom - pr.top) / sr.height : 0) });
    } catch (e) { /* older scene without setSafeInset */ }
  }
  const roFit = new ResizeObserver(fitSafe); roFit.observe(stage);

  // ---- playing
  function playFrom(ci, o = {}) {
    clearTimeout(swapT);
    token++; const my = token;
    idx = Math.max(0, Math.min(n - 1, ci)); ended = false;
    startIdx = flat.findIndex((f) => f.ci === idx);
    const list = flat.slice(startIdx);
    tour = api.tour(list.map((f) => f.shot));
    tour.on((ev) => {
      if (my !== token || closed) return;
      if (ev.type === 'shot') {
        const f = list[ev.index];
        if (f.ci !== idx) { idx = f.ci; clearTimeout(swapT); swapT = setTimeout(() => swap(idx), FADE); }
      } else if (ev.type === 'end') { ended = true; paused = true; setPlayIcon(); }
    });
    paused = !!o.paused;
    if (paused) { tour.pause(); api.pause(); } else { tour.resume(); if (!reduced) api.play(); started = true; }     // R24 V3 (D3): with reduced motion the simulation stays paused, the Play button of the 3D view starts it
    swapT = setTimeout(() => swap(idx), FADE);
    setPlayIcon();
  }
  function toggle() {
    if (ended) { started = true; playFrom(0, { paused: false }); return; }
    if (!tour) return;
    paused = !paused;
    if (paused) { tour.pause(); api.pause(); } else { tour.resume(); if (!reduced) api.play(); started = true; }
    setPlayIcon();
  }
  function step(dir) {
    if (dir > 0 && idx >= n - 1) { return; }
    playFrom(idx + dir, { paused });
  }

  // ---- recording mode
  function setRec(on) {
    rec = on; stage.classList.toggle('pr-rec', on); root.classList.toggle('rec', on); btnRec.setAttribute('aria-pressed', String(on)); requestAnimationFrame(fitSafe);
    document.documentElement.classList.toggle('pr-rec-on', on);
    if (on) {
      started = false; playFrom(0, { paused: true });
      try { const de = document.documentElement, p = de.requestFullscreen && de.requestFullscreen(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* fullscreen is optional */ }
    } else if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); }
    setPlayIcon();
  }
  const onFs = () => { if (!document.fullscreenElement && rec && !closed) setRec(false); };
  document.addEventListener('fullscreenchange', onFs);

  // ---- keyboard (capture phase: the scene's own Escape / Space / digit keys must not fire while the demo is open)
  function onKey(e) {
    if (closed) return;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.key === 'Escape') { stop(); close(); return; }
    if (e.code === 'Space') { stop(); toggle(); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { stop(); step(1); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { stop(); step(-1); return; }
    if (e.key === 'r' || e.key === 'R') { stop(); setRec(!rec); return; }
    if (/^[123]$/.test(e.key)) { e.stopPropagation(); return; }
    if (e.key === 'Tab' && !rec) {                                    // keep the focus inside the layer
      const f = [...root.querySelectorAll('button')].filter((b) => b.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (!root.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  document.addEventListener('keydown', onKey, true);

  // ---- progress rail
  function frame() {
    if (closed) return;
    const T = tour;
    let elapsed = 0;
    if (ended) elapsed = total;
    else if (T && T.i >= 0) { const fi = startIdx + T.i; elapsed = (starts[fi] ?? 0) + Math.min(T.t || 0, flat[fi] ? flat[fi].shot.dur : 0); }
    segs.forEach((s, i) => { const k = chDur[i] ? Math.max(0, Math.min(1, (elapsed - chStart[i]) / chDur[i])) : 0; s.firstChild.style.transform = `scaleX(${k.toFixed(3)})`; });
    time.textContent = `${mmss(elapsed)} / ${mmss(total)}`;
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  function close({ silent } = {}) {
    if (closed) return;
    closed = true; token++;
    cancelAnimationFrame(raf); clearTimeout(swapT);
    document.removeEventListener('keydown', onKey, true); document.removeEventListener('fullscreenchange', onFs);
    document.documentElement.classList.remove('pr-rec-on');
    try { api.setLabelAvoid(null); api.setSafeInset(null); } catch (e) { /* scene gone */ }
    roFit.disconnect();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    stage.classList.remove('pr-on', 'pr-rec');
    root.remove();
    if (!silent) {
      try { api.stopTour(); api.setABC(false); if (!wasFull && stage.classList.contains('is-full')) api.toggleFull(); if (!reduced) api.play(); } catch (e) { /* the scene is gone */ }
      if (onClose) onClose();
    }
  }

  playFrom(startAt, { paused: !autoplay });
  setPlayIcon();
  return { close, setRec, toggle };
}
