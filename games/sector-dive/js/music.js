'use strict';
// ================= music (procedural BGM) =================
// Everything is synthesised with Web Audio; no music files. Each sector has its own style
// (key, scale, chord loop, tempo, patterns). Layers (pad / arp / bass / drums) fade in and out
// with the situation: quiet while exploring, full when enemies are on you. Boss fights play an
// arrangement of the sector's own style: same key and chords, faster, with driving bass and drums.
// A combat-only tension layer (pulsing ostinato, busy hats, dissonant stabs) fades in when enemies are on you.

const SCALES = {
  minor:    [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  locrian:  [0, 1, 3, 5, 6, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
};
// patterns are 16 steps (16th notes, one bar). arp: chord tone index (0-2, +3 = octave up), -1 rest.
// bass: 1 root, 2 fifth, 3 octave, 0 rest. kick / snare / hat / clank: 1 hit, 0 rest.
// drone: low sustained root + fifth; wind: filtered noise swells; echo: quieter repeat of arp notes (fake delay);
// oct: register shift in octaves (negative = darker). All progressions stay on minor / diminished chords.
const _ = -1;
const MUSIC_STYLES = {
  // base: dark ambient, a drone and the odd distant note
  BASE:  { bpm: 60, root: 38, scale: 'minor', prog: [0, 3, 0, 4], padWave: 'sawtooth', padCut: 420, drone: true, wind: true,
           arp: { wave: 'triangle', cut: 1200, echo: true, pat: [0, _, _, _, _, _, _, _, _, _, 2, _, _, _, _, _] } },
  // discarded data: cold and sparse, glassy notes ringing out with echoes, a slow heartbeat kick
  DATA:  { bpm: 92, root: 45, scale: 'minor', prog: [0, 3, 0, 4], padWave: 'sawtooth', padCut: 600, drone: true, oct: -1,
           arp: { wave: 'square', cut: 1300, echo: true, pat: [0, _, _, 2, _, _, 4, _, _, _, 1, _, _, 5, _, _] },
           bass: { wave: 'sawtooth', cut: 320, pat: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0] },
           kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0] },
  // smelting furnace: industrial; grinding low drone, metallic clanks, a heavy slow pulse
  FORGE: { bpm: 80, root: 40, scale: 'phrygian', prog: [0, 1, 0, 1], padWave: 'sawtooth', padCut: 380, drone: true, oct: -1,
           arp: { wave: 'sawtooth', cut: 700, pat: [0, _, _, _, _, _, _, _, 1, _, _, _, _, _, _, _] },
           bass: { wave: 'sawtooth', cut: 260, pat: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0] },
           kick: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0], snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
           clank: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0] },
  // deep noise: almost no melody; drones, noise swells and glitches
  NOISE: { bpm: 66, root: 37, scale: 'locrian', prog: [0, 1, 0, 4], padWave: 'sawtooth', padCut: 340, drone: true, wind: true, glitch: true, oct: -1,
           arp: { wave: 'square', cut: 900, echo: true, pat: [0, _, _, _, _, _, _, _, _, _, _, _, 4, _, _, _] },
           bass: { wave: 'triangle', cut: 260, pat: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
           kick: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], hat: [0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0] },
  // ruined town: desolate; wind and lonely single notes with long echoes
  RUIN:  { bpm: 72, root: 41, scale: 'minor', prog: [0, 5, 3, 4], padWave: 'triangle', padCut: 700, wind: true, oct: -1,
           arp: { wave: 'triangle', cut: 1400, echo: true, pat: [0, _, _, _, _, _, 2, _, _, _, _, _, 1, _, _, _] },
           bass: { wave: 'triangle', cut: 300, pat: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
           kick: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], snare: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0] },
  // kowloon: dark neon; low-register synth, slow four-on-the-floor
  KWLN:  { bpm: 100, root: 44, scale: 'minor', prog: [0, 3, 5, 4], padWave: 'sawtooth', padCut: 800, oct: -1,
           arp: { wave: 'sawtooth', cut: 1100, echo: true, pat: [0, _, 1, _, 2, _, 1, _, 0, _, 1, _, 4, _, 2, _] },
           bass: { wave: 'sawtooth', cut: 420, pat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0] },
           kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0] },
  // old city blocks: noir; sparse, mournful keys over a walking low bass
  CITY:  { bpm: 76, root: 43, scale: 'harmonic', prog: [0, 3, 4, 0], padWave: 'triangle', padCut: 900, oct: -1,
           arp: { wave: 'triangle', cut: 1600, echo: true, pat: [0, _, _, 2, _, _, _, _, 1, _, _, _, 4, _, _, _] },
           bass: { wave: 'triangle', cut: 380, pat: [1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 0, 3, 0, 0, 0] },
           kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0] },
};
// boss arrangement of a sector style: same key and chords, 25% faster, 16th-note arp with octave jumps,
// octave-bouncing 8th bass, full drums with 16th hats, and a chord stab on every downbeat
function bossArrangement(st) {
  return Object.assign({}, st, {
    bpm: Math.round(st.bpm * 1.3), boss: true, padCut: st.padCut * 1.3, drone: true,
    arp: { wave: st.arp.wave === 'triangle' ? 'square' : st.arp.wave, cut: st.arp.cut * 1.2, pat: [0, 1, 2, 3, 4, 2, 1, 3, 0, 1, 2, 3, 5, 4, 2, 1] },
    bass: { wave: 'sawtooth', cut: 520, pat: [1, 0, 3, 0, 1, 0, 3, 0, 1, 0, 3, 0, 2, 0, 3, 0] },
    kick: [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  });
}

// layer levels per situation
// tension: combat-only layer (pulsing 16th ostinato with a rising filter, busy hats, a dissonant stab)
const LAYER_MIX = {
  base:    { pad: 1, arp: 0.6, bass: 0, drums: 0, tension: 0 },
  explore: { pad: 1, arp: 0.7, bass: 0.35, drums: 0, tension: 0 },
  combat:  { pad: 0.7, arp: 0.8, bass: 1, drums: 1, tension: 1 },
  boss:    { pad: 0.8, arp: 1, bass: 1, drums: 1, tension: 0.7 },
};

const mus = { want: null, name: null, st: null, step: 0, next: 0, bus: null, layers: {}, mix: null, duck: 1, timer: null };
const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);

function musicInit() {
  if (!actx || mus.bus) return;
  mus.bus = actx.createGain(); mus.bus.gain.value = 0; mus.bus.connect(actx.destination);
  ['pad', 'arp', 'bass', 'drums', 'tension'].forEach(k => { const g = actx.createGain(); g.gain.value = 0; g.connect(mus.bus); mus.layers[k] = g; });
  mus.timer = setInterval(musicTick, 25);
  if (mus.want) { const w = mus.want; mus.want = null; setMusic(w.name, w.boss); }
}
// name: a sector code or 'BASE'; boss: play the sector's boss arrangement
function setMusic(name, boss) {
  const key = name + (boss ? ':boss' : '');
  if (!actx || !mus.bus) { mus.want = { name, boss }; return; }
  if (mus.name === key) return;
  const base = MUSIC_STYLES[name] || MUSIC_STYLES.DATA;
  mus.name = key; mus.st = boss ? bossArrangement(base) : base;
  mus.step = 0; mus.next = actx.currentTime + 0.08;
  setMusicMix(boss ? 'boss' : name === 'BASE' ? 'base' : 'explore');
  musicVolume();
}
function setMusicMix(kind) {
  if (!mus.bus || mus.mix === kind) return;
  mus.mix = kind;
  const m = LAYER_MIX[kind], t = actx.currentTime;
  for (const k in mus.layers) mus.layers[k].gain.setTargetAtTime(m[k], t, kind === 'combat' ? 0.4 : 1.2);
}
// overall BGM volume from the setting; duck = 0..1 (quieter while paused)
function musicVolume(duck) {
  if (duck !== undefined) mus.duck = duck;
  if (!mus.bus) return;
  mus.bus.gain.setTargetAtTime(0.2 * (save.settings.bgm ?? 0.6) * mus.duck, actx.currentTime, 0.3);
}
function musicTick() {
  const st = mus.st;
  if (!st || !actx || actx.state !== 'running') return;
  const stepDur = 60 / st.bpm / 4;
  if (mus.next < actx.currentTime - 0.3) mus.next = actx.currentTime + 0.05; // tab was in the background
  while (mus.next < actx.currentTime + 0.12) {
    playStep(st, mus.step, mus.next, stepDur);
    mus.next += stepDur; mus.step++;
  }
}

function chordOf(st, degree) {
  const sc = SCALES[st.scale], n = sc.length;
  return [0, 2, 4].map(k => sc[(degree + k) % n] + 12 * Math.floor((degree + k) / n));
}
function playStep(st, step, t, d) {
  const s = step % 16, bar = Math.floor(step / 16);
  const chord = chordOf(st, st.prog[bar % st.prog.length]), root = st.root + 12 * (st.oct || 0);
  if (s === 0) chord.forEach((c, i) => synthNote('pad', midiHz(root + 12 + c), t, d * 16, st.padWave, 0.045, 0.8, st.padCut, (i - 1) * 9));
  if (st.drone && s === 0 && bar % 2 === 0) [0, 7].forEach(iv => synthNote('pad', midiHz(st.root - 12 + iv), t, d * 32, 'sawtooth', 0.06, 1.5, 220, iv ? 6 : -6));
  if (st.wind && s === 0 && bar % 2 === 0) windSwell(t, d * 32);
  if (st.boss && s === 0) chord.forEach(c => synthNote('arp', midiHz(root + 24 + c), t, d * 2, 'sawtooth', 0.05, 0.005, 2200));
  const a = st.arp && st.arp.pat[s];
  if (a !== undefined && a >= 0) {
    const f = midiHz(root + 24 + chord[a % 3] + 12 * Math.floor(a / 3)), cut = st.arp.cut * rand(0.85, 1.15);
    synthNote('arp', f, t, d * 0.9, st.arp.wave, 0.065, 0.005, cut);
    if (st.arp.echo) { synthNote('arp', f, t + d * 3, d * 0.9, st.arp.wave, 0.025, 0.005, cut * 0.6); synthNote('arp', f, t + d * 6, d * 0.9, st.arp.wave, 0.01, 0.005, cut * 0.4); }
  }
  if (st.glitch && Math.random() < 0.06) synthNote('arp', midiHz(root + 36 + chord[randi(0, 2)] + randi(-1, 1)), t, d * 0.25, 'square', 0.03, 0.002, 4000);
  const bn = st.bass && st.bass.pat[s];
  if (bn) synthNote('bass', midiHz(root - 12 + chord[0] + [0, 0, 7, 12][bn]), t, d * 1.6, st.bass.wave, 0.13, 0.005, st.bass.cut);
  if (st.kick && st.kick[s]) drumKick(t);
  if (st.snare && st.snare[s]) drumNoise(t, 0.16, 0.16, 'bandpass', 1400);
  if (st.hat && st.hat[s]) drumNoise(t, 0.035, 0.05, 'highpass', 7000);
  if (st.clank && st.clank[s]) drumClank(t);
  // tension layer (silent unless the mix brings it up): always scheduled so it can fade in mid-bar
  const sweep = ((bar % 4) * 16 + s) / 64; // filter opens over 4 bars, then resets
  synthNote('tension', midiHz(root - 12 + chord[0] + (s % 4 === 2 ? 12 : 0)), t, d * 0.55, 'sawtooth', 0.05, 0.003, 300 + 1700 * sweep);
  if (s % 2 === 1) drumNoise(t, 0.025, 0.035, 'highpass', 8000, 'tension');
  if (s === 8 && bar % 2 === 1) [12, 13].forEach(iv => synthNote('tension', midiHz(root + 12 + chord[0] + iv), t, d * 3, 'square', 0.025, 0.01, 1500));
}
// metallic hit: two inharmonic square partials through a resonant bandpass, plus a noise tick
function drumClank(t) {
  [523, 797].forEach(fq => {
    const o = actx.createOscillator(), f = actx.createBiquadFilter(), g = actx.createGain();
    o.type = 'square'; o.frequency.value = fq * rand(0.97, 1.03);
    f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 8;
    g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(f); f.connect(g); g.connect(mus.layers.drums); o.start(t); o.stop(t + 0.4);
  });
  drumNoise(t, 0.05, 0.08, 'bandpass', 3500);
}
// wind: long noise swell with a slowly sweeping lowpass
function windSwell(t, dur) {
  const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  s.buffer = noiseBuf; s.loop = true; f.type = 'lowpass'; f.Q.value = 3;
  f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(900, t + dur * 0.5); f.frequency.linearRampToValueAtTime(250, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + dur * 0.4); g.gain.linearRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(mus.layers.pad); s.start(t); s.stop(t + dur + 0.1);
}
function synthNote(layer, freq, t, dur, wave, peak, att, cut, detune) {
  const o = actx.createOscillator(), f = actx.createBiquadFilter(), g = actx.createGain();
  o.type = wave; o.frequency.value = freq; if (detune) o.detune.value = detune;
  f.type = 'lowpass'; f.frequency.value = cut;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + att);
  g.gain.setTargetAtTime(0.0001, t + Math.max(att, dur * 0.7), dur * 0.25 + 0.02);
  o.connect(f); f.connect(g); g.connect(mus.layers[layer]);
  o.start(t); o.stop(t + dur + 1);
}
function drumKick(t) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.14);
  g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  o.connect(g); g.connect(mus.layers.drums); o.start(t); o.stop(t + 0.25);
}
function drumNoise(t, dur, vol, type, freq, layer) {
  const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(mus.layers[layer || 'drums']); s.start(t); s.stop(t + dur + 0.02);
}
// called every frame while playing: combat when a woken enemy is near or a boss is up
let musicCheckT = 0;
function updateMusic(dt) {
  if ((musicCheckT -= dt) > 0 || !mus.bus || !mus.st) return;
  musicCheckT = 0.5;
  if (mus.st.boss || mus.name === 'BASE') return;
  const fight = enemies.some(e => !e.dead && e.active && Math.hypot(e.x - P.x, e.z - P.z) < 30);
  setMusicMix(fight ? 'combat' : 'explore');
}
