'use strict';
// ================= music (procedural BGM) =================
// Everything is synthesised with Web Audio; no music files. Each sector has its own style
// (key, scale, chord loop, tempo, patterns). Layers (pad / arp / bass / drums) fade in and out
// with the situation: quiet while exploring, full when enemies are on you. Boss fights play an
// arrangement of the sector's own style: same key and chords, faster, with driving bass and drums.

const SCALES = {
  minor:    [0, 2, 3, 5, 7, 8, 10],
  dorian:   [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  locrian:  [0, 1, 3, 5, 6, 8, 10],
};
// patterns are 16 steps (16th notes, one bar). arp: chord tone index (0-2, +3 = octave up), -1 rest.
// bass: 1 root, 2 fifth, 3 octave, 0 rest. drums: 1 hit, 0 rest.
const _ = -1;
const MUSIC_STYLES = {
  BASE:  { bpm: 70, root: 45, scale: 'minor', prog: [0, 5, 2, 6], padWave: 'sawtooth', padCut: 900,
           arp: { wave: 'triangle', cut: 2400, pat: [0, _, _, _, _, _, 2, _, _, _, 1, _, _, _, _, _] } },
  DATA:  { bpm: 108, root: 45, scale: 'minor', prog: [0, 5, 2, 6], padWave: 'sawtooth', padCut: 1100,
           arp: { wave: 'square', cut: 2600, pat: [0, 1, 2, 4, 0, 1, 2, 4, 0, 1, 2, 4, 0, 1, 2, 4] },
           bass: { wave: 'sawtooth', cut: 500, pat: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0] },
           kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0] },
  FORGE: { bpm: 92, root: 40, scale: 'phrygian', prog: [0, 1, 0, 6], padWave: 'sawtooth', padCut: 700,
           arp: { wave: 'sawtooth', cut: 900, pat: [0, _, _, _, 1, _, _, _, 0, _, 2, _, _, _, _, _] },
           bass: { wave: 'sawtooth', cut: 380, pat: [1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 2, 0] },
           kick: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0], snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0] },
  NOISE: { bpm: 80, root: 42, scale: 'locrian', prog: [0, 1, 4, 2], padWave: 'sawtooth', padCut: 600, glitch: true,
           arp: { wave: 'square', cut: 1800, pat: [0, _, _, 2, _, _, _, _, 4, _, _, _, _, 1, _, _] },
           bass: { wave: 'triangle', cut: 400, pat: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0] },
           kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], hat: [0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1] },
  RUIN:  { bpm: 88, root: 50, scale: 'dorian', prog: [0, 3, 0, 6], padWave: 'triangle', padCut: 1400,
           arp: { wave: 'triangle', cut: 2200, pat: [0, _, 2, _, 1, _, 4, _, 0, _, 2, _, 1, _, 3, _] },
           bass: { wave: 'triangle', cut: 500, pat: [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0] },
           kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0], snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1] },
  KWLN:  { bpm: 116, root: 49, scale: 'minor', prog: [0, 5, 6, 4], padWave: 'sawtooth', padCut: 1500,
           arp: { wave: 'sawtooth', cut: 2000, pat: [0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 4, 2, 1, 2, 1] },
           bass: { wave: 'sawtooth', cut: 600, pat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 3, 0] },
           kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0] },
  CITY:  { bpm: 96, root: 43, scale: 'dorian', prog: [0, 3, 6, 4], padWave: 'triangle', padCut: 1600,
           arp: { wave: 'triangle', cut: 1800, pat: [0, _, _, 2, _, _, 1, _, _, _, 4, _, _, 2, _, _] },
           bass: { wave: 'triangle', cut: 450, pat: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0] },
           kick: [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0], snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0] },
};
// boss arrangement of a sector style: same key and chords, 25% faster, 16th-note arp with octave jumps,
// octave-bouncing 8th bass, full drums with 16th hats, and a chord stab on every downbeat
function bossArrangement(st) {
  return Object.assign({}, st, {
    bpm: Math.round(st.bpm * 1.25), boss: true, padCut: st.padCut * 1.4,
    arp: { wave: st.arp.wave === 'triangle' ? 'square' : st.arp.wave, cut: st.arp.cut * 1.3, pat: [0, 1, 2, 3, 4, 2, 1, 3, 0, 1, 2, 3, 5, 4, 2, 1] },
    bass: { wave: 'sawtooth', cut: 700, pat: [1, 0, 3, 0, 1, 0, 3, 0, 1, 0, 3, 0, 2, 0, 3, 0] },
    kick: [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  });
}

// layer levels per situation
const LAYER_MIX = {
  base:    { pad: 1, arp: 0.6, bass: 0, drums: 0 },
  explore: { pad: 1, arp: 0.7, bass: 0.35, drums: 0 },
  combat:  { pad: 0.8, arp: 1, bass: 1, drums: 1 },
  boss:    { pad: 0.9, arp: 1, bass: 1, drums: 1 },
};

const mus = { want: null, name: null, st: null, step: 0, next: 0, bus: null, layers: {}, mix: null, duck: 1, timer: null };
const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);

function musicInit() {
  if (!actx || mus.bus) return;
  mus.bus = actx.createGain(); mus.bus.gain.value = 0; mus.bus.connect(actx.destination);
  ['pad', 'arp', 'bass', 'drums'].forEach(k => { const g = actx.createGain(); g.gain.value = 0; g.connect(mus.bus); mus.layers[k] = g; });
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
  const chord = chordOf(st, st.prog[bar % st.prog.length]), root = st.root;
  if (s === 0) chord.forEach((c, i) => synthNote('pad', midiHz(root + 12 + c), t, d * 16, st.padWave, 0.05, 0.5, st.padCut, (i - 1) * 7));
  if (st.boss && s === 0) chord.forEach(c => synthNote('arp', midiHz(root + 24 + c), t, d * 2, 'sawtooth', 0.06, 0.005, 3000));
  const a = st.arp && st.arp.pat[s];
  if (a !== undefined && a >= 0) synthNote('arp', midiHz(root + 24 + chord[a % 3] + 12 * Math.floor(a / 3)), t, d * 0.9, st.arp.wave, 0.07, 0.005, st.arp.cut * rand(0.85, 1.15));
  if (st.glitch && Math.random() < 0.08) synthNote('arp', midiHz(root + 36 + chord[randi(0, 2)]), t, d * 0.3, 'square', 0.04, 0.002, 5000);
  const b = st.bass && st.bass.pat[s];
  if (b) synthNote('bass', midiHz(root - 12 + chord[0] + [0, 0, 7, 12][b]), t, d * 1.6, st.bass.wave, 0.12, 0.005, st.bass.cut);
  if (st.kick && st.kick[s]) drumKick(t);
  if (st.snare && st.snare[s]) drumNoise(t, 0.14, 0.2, 'bandpass', 1800);
  if (st.hat && st.hat[s]) drumNoise(t, 0.04, 0.07, 'highpass', 7000);
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
function drumNoise(t, dur, vol, type, freq) {
  const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(mus.layers.drums); s.start(t); s.stop(t + dur + 0.02);
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
