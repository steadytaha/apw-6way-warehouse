// APW demo platform: design tokens for JavaScript / three.js (B1). Contract for B2-B6.
// Colours are sRGB hex numbers; with three.js r152+ pass them to Color as-is (ColorManagement converts to linear).
// Keep in sync with tokens.css and scene_spec.md. RAL values are indicative sRGB conversions.

// ---------- 3D materials ----------
// Each entry: { color, roughness, metalness, [emissive, emissiveIntensity, opacity, note] }
// Rule: no albedo above 0xe8 or below 0x14 per channel; metalness only on bare or galvanised steel.
export const MATERIALS = {
  // rack
  rackUpright:   { color: 0x1f5a96, roughness: 0.48, metalness: 0.15, note: 'RAL 5010/5017 family, powder coat' },
  rackBrace:     { color: 0x1f5a96, roughness: 0.52, metalness: 0.15, note: 'same blue, slightly lighter via vertex tint' },
  rackBeam:      { color: 0xe4580c, roughness: 0.42, metalness: 0.15, note: 'RAL 2004 pure orange' },
  rackProtector: { color: 0xf3ad1e, roughness: 0.6,  metalness: 0.0,  note: 'RAL 1003 signal yellow, column foot guard' },
  rail:          { color: 0xa9b1b8, roughness: 0.38, metalness: 0.85, note: 'galvanised zinc, shuttle running rail' },
  railPallet:    { color: 0x8f98a0, roughness: 0.45, metalness: 0.8,  note: 'upper rail that carries the pallet' },
  mesh:          { color: 0x6c757d, roughness: 0.6,  metalness: 0.6,  opacity: 0.35, note: 'fall-protection mesh, transparent' },

  // shuttle (hero)
  shuttleCover:  { color: 0xe6e8ea, roughness: 0.38, metalness: 0.1,  note: 'warm white cover, readable in dark lanes' },
  shuttleChassis:{ color: 0x2f353b, roughness: 0.55, metalness: 0.4 },
  shuttleDeck:   { color: 0x4a525a, roughness: 0.7,  metalness: 0.5,  note: 'lifting platform' },
  wheel:         { color: 0x15171a, roughness: 0.85, metalness: 0.0 },
  statusOk:      { color: 0x19c2a0, emissive: 0x19c2a0, emissiveIntensity: 2.2, roughness: 0.4, metalness: 0, note: 'light bar when moving' },
  statusFault:   { color: 0xff3b30, emissive: 0xff3b30, emissiveIntensity: 2.5, roughness: 0.4, metalness: 0, note: 'blinking, as on real shuttles' },
  statusCharge:  { color: 0xf3ad1e, emissive: 0xf3ad1e, emissiveIntensity: 1.6, roughness: 0.4, metalness: 0 },

  // lift and conveyors
  liftMast:      { color: 0x3a4149, roughness: 0.5,  metalness: 0.55 },
  liftCarriage:  { color: 0xf3ad1e, roughness: 0.5,  metalness: 0.2,  note: 'safety yellow frame, moving part' },
  liftCage:      { color: 0xf3ad1e, roughness: 0.6,  metalness: 0.2,  opacity: 0.28, note: 'guarding mesh' },
  chain:         { color: 0x9aa3ab, roughness: 0.35, metalness: 0.9 },
  conveyorFrame: { color: 0x6b747c, roughness: 0.55, metalness: 0.5 },
  roller:        { color: 0xb9c0c6, roughness: 0.3,  metalness: 0.8 },

  // pallet and load
  pallet:        { color: 0xb88a5a, roughness: 0.92, metalness: 0.0,  note: 'dry pine, jitter +/-6 % lightness per instance' },
  carton:        { color: 0xc49a66, roughness: 0.85, metalness: 0.0,  note: 'jitter per SKU' },
  wrap:          { color: 0xdbe6ee, roughness: 0.12, metalness: 0.0,  opacity: 0.42, note: 'stretch film, clearcoat-like gloss' },
  // ABC overlay (replaces carton colour in ABC view)
  abcA: { color: 0xc43d2f, roughness: 0.8, metalness: 0 },
  abcB: { color: 0xd9a02a, roughness: 0.8, metalness: 0 },
  abcC: { color: 0x4f86b6, roughness: 0.8, metalness: 0 },

  // building and ground
  floor:         { color: 0xb4b6b2, roughness: 0.58, metalness: 0.0,  note: 'sealed power-floated concrete, roughness noise 0.5-0.7' },
  floorApron:    { color: 0x8d9094, roughness: 0.92, metalness: 0.0,  note: 'asphalt yard' },
  wallPanel:     { color: 0xe2e5e8, roughness: 0.55, metalness: 0.3,  note: 'sandwich panel, RAL 9002/7035 family' },
  wallPlinth:    { color: 0x6f767d, roughness: 0.6,  metalness: 0.3 },
  roof:          { color: 0xc9ced2, roughness: 0.55, metalness: 0.35 },
  glass:         { color: 0x1b2833, roughness: 0.06, metalness: 0.4,  opacity: 0.55 },
  dockDoor:      { color: 0xdfe3e6, roughness: 0.5,  metalness: 0.4 },
  dockBumper:    { color: 0x1a1a1a, roughness: 0.95, metalness: 0.0 },
  leveller:      { color: 0x7a838b, roughness: 0.5,  metalness: 0.7 },

  // safety marks (ISO 3864 family, indicative)
  safetyYellow:  { color: 0xf3ad1e, roughness: 0.75, metalness: 0 },
  safetyBlack:   { color: 0x2b2d2f, roughness: 0.8,  metalness: 0 },
  safetyOrange:  { color: 0xd05d29, roughness: 0.75, metalness: 0,    note: 'warning, medium risk' },
  safetyGreen:   { color: 0x31865c, roughness: 0.75, metalness: 0 },
  safetyRed:     { color: 0x9e3c3c, roughness: 0.75, metalness: 0 },
  safetyWhite:   { color: 0xe6e9e7, roughness: 0.75, metalness: 0 },
  lightStrip:    { color: 0xfff4e0, emissive: 0xfff4e0, emissiveIntensity: 3.0, roughness: 0.5, metalness: 0, note: 'DALI-2 luminaire; intensity scaled by dim level' },

  // trucks and people
  truckCab:      { color: 0xdfe3e6, roughness: 0.4, metalness: 0.3 },
  truckTrailer:  { color: 0xeceeef, roughness: 0.55, metalness: 0.25 },
  forklift:      { color: 0xe8a317, roughness: 0.45, metalness: 0.2 },
  vest:          { color: 0xd4e021, roughness: 0.8, metalness: 0 },
};

// ---------- scene environments ----------
// Light theme -> 'day'; dark theme -> 'dusk' (can be overridden per camera shot).
export const ENVIRONMENTS = {
  day: {
    background: 0xdfe6ec, fog: { color: 0xdfe6ec, density: 0.0035 },
    hemi: { sky: 0xe6eef7, ground: 0x8d8a7c, intensity: 0.9 },
    sun: { color: 0xfff1dc, intensity: 2.4, position: [-60, 90, 50], shadow: true },
    exposure: 1.0, toneMapping: 'ACESFilmic', interior: { strips: 0.55, ambient: 0.35 },
  },
  dusk: {
    background: 0x141c26, fog: { color: 0x141c26, density: 0.0055 },
    hemi: { sky: 0x3b4d66, ground: 0x1a1b1f, intensity: 0.5 },
    sun: { color: 0xffc08a, intensity: 0.7, position: [-80, 22, 60], shadow: true },
    exposure: 1.05, toneMapping: 'ACESFilmic', interior: { strips: 1.0, ambient: 0.2 },
  },
  lightsOut: {   // interior-only hero: strips dimmed to standby except near moving vehicles
    background: 0x0b0d10, fog: { color: 0x0b0d10, density: 0.012 },
    hemi: { sky: 0x2a3340, ground: 0x0e0f11, intensity: 0.28 },
    sun: null,
    exposure: 1.1, toneMapping: 'ACESFilmic', interior: { strips: 0.12, ambient: 0.08, pool: { color: 0xdfeaff, intensity: 18, distance: 7, decay: 2 } },
  },
};

// ---------- motion ----------
// Apple-style spring: { response (s), damping (ratio) }. Derived physics (mass 1):
//   stiffness = (2*pi/response)^2 ; dampingCoef = 4*pi*ratio/response.
export const SPRINGS = {
  smooth:  { response: 0.40, damping: 1.0 },   // default: move, reposition, screen change
  snappy:  { response: 0.28, damping: 1.0 },   // buttons, toggles, chips
  gentle:  { response: 0.60, damping: 1.0 },   // large surfaces, camera dolly
  lively:  { response: 0.40, damping: 0.8 },   // momentum only (flick, throw)
  sheet:   { response: 0.30, damping: 0.8 },   // drawer / sheet release
};
export function springPhysics({ response, damping }) {
  const stiffness = (2 * Math.PI / response) ** 2;
  return { stiffness, damping: (4 * Math.PI * damping) / response, mass: 1 };
}
// Motion One / Framer Motion options: animate(el, {y:0}, motionSpring('smooth'))
export function motionSpring(name) { const s = SPRINGS[name]; return { type: 'spring', ...springPhysics(s) }; }
// Critically damped step response, usable for numeric tweens in the render loop (value 0..1).
export function springStep(name, t) {
  const { response, damping } = SPRINGS[name], w = 2 * Math.PI / response;
  if (damping >= 1) return 1 - (1 + w * t) * Math.exp(-w * t);
  const wd = w * Math.sqrt(1 - damping * damping);
  return 1 - Math.exp(-damping * w * t) * (Math.cos(wd * t) + (damping * w / wd) * Math.sin(wd * t));
}

export const DURATIONS = { press: 120, fast: 200, base: 310, slow: 450, bounce: 600, reveal: 800, stagger: 60 }; // ms
export const EASE = {
  out: [0.2, 0, 0, 1], in: [0.3, 0, 1, 1], inOut: [0.4, 0, 0.2, 1],
};

// Module run choreography (step B4/B5 reads this).
export const RUN = {
  modules: ['geometry', 'cycles', 'queues', 'layout', 'fleet', 'throughput', 'abc', 'energy', 'cost', 'resilience', 'expansion'],
  minModuleMs: 520,        // each module row shows for at least this long, even if Pyodide is faster
  maxTotalMs: 9000,        // cap the whole theatre
  stateDurations: { pending: 0, active: 450, done: 310 },
};

// ---------- 3D performance budget ----------
export const BUDGET = {
  targetFps: 60, minFps: 45,
  maxDrawCalls: 250, maxTriangles: 1.5e6, shadowMapSize: 2048, pixelRatioMax: 2,
  adaptive: { degradeBelowFps: 48, steps: ['aoOff', 'shadowOff', 'pixelRatio1', 'fogOnlyNoBloom'] },
};

// ---------- 3D time scaling ----------
// Animation uses model cycle times (seconds) divided by SPEEDUP. Real motion: shuttle 1.4 m/s, lift 1 m/s.
export const TIME = { speedupDefault: 6, speedupChoices: [1, 3, 6, 12, 30] };

// ---------- resource roles (R24 V1, Visual_plan 1.2): one meaning each, in the scene, charts, chips and legend ----------
// css = the custom property in tokens.css (light / dark values live there); light / dark = the same values for scripts; hex = the number the 3D scene uses.
// Contrast (WCAG, vs #ffffff / #1a1c20) is checked by tools/contrast_check.py. Redundant cue = what says the same without colour.
export const ROLES = {
  in:        { label: 'IN flow',   css: '--role-in',        light: '#00805f', dark: '#3cc9a0', hex: 0x00805f, cue: 'arrow in, label "IN"' },
  out:       { label: 'OUT flow',  css: '--role-out',       light: '#0a5fd0', dark: '#6fa8ff', hex: 0x0a5fd0, cue: 'arrow out, label "OUT"' },
  shuttle:   { label: 'Shuttle',   css: '--role-shuttle',   light: '#c76a00', dark: '#ffa83a', hex: 0xc76a00, cue: 'shuttle icon, halo ring when busy' },
  lift:      { label: 'Lift',      css: '--role-lift',      light: '#7a4fc4', dark: '#b69cff', hex: 0x7a4fc4, cue: 'lift icon, tower shape' },
  bind:      { label: 'Binding limit', css: '--role-bind',  light: '#c8401a', dark: '#ff7a52', hex: 0xc8401a, cue: '"binds" badge with a lock icon' },
  structure: { label: 'Structure', css: '--role-structure', light: '#667788', dark: '#9aa8b8', hex: 0x667788, cue: 'none (neutral)' },
};
// Spare lift (grey in the 3D lift groups) = structure role.
