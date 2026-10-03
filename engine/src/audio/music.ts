import { rand, randi } from '../core/util.ts';
import { actx, bgmVolume, noiseBuf } from './audio.ts';
// engine: Procedural music player: plays a style (key, scale, chords, patterns) in layers whose mix follows the situation.
// Everything is synthesised with Web Audio; no music files. A game gives each area its own style (MUSIC_STYLES)
// (key, scale, chord loop, tempo, patterns). Layers (pad / arp / bass / drums) fade in and out
// with the situation: quiet while exploring, full when enemies are on you. Boss fights can play an
// arrangement of the area's own style: same key and chords, faster, with driving bass and drums.
// A combat-only tension layer (pulsing ostinato, busy hats, dissonant stabs) fades in when enemies are on you.
// The engine knows no style or mix names. The game fills MUSIC_STYLES and LAYER_MIX (Object.assign), sets MUSIC
// (the fallback style and which mix a name suits), and calls setMusic(name, boss) / setMusicMix(kind).
// style fields are described above; the mix is { pad, arp, bass, drums, tension } levels per situation

// ---- tuning: times are seconds (s), pitches Hz, "steps" are 16th notes, peaks are gain levels ----
const STEPS_PER_BAR = 16; // 16th-note steps in one bar
const STEPS_PER_BEAT = 4; // 16th notes in one quarter-note beat
const SLOW_LAYER_BARS = 2; // drone and wind restart every this many bars and last as long
const TICK_MS = 25; // how often the scheduler runs (ms)
const LOOKAHEAD = 0.12; // notes are scheduled up to this far ahead of the audio clock (s)
const BACKGROUND_GAP = 0.3; // the schedule is this far behind the audio clock: the tab was in the background (s)
const RESYNC_DELAY = 0.05; // after a background gap, the schedule restarts this far ahead (s)
const START_DELAY = 0.08; // a newly chosen style starts this far ahead (s)
const BUS_GAIN = 0.2; // music bus level at BGM volume 1 with no duck
const BUS_SMOOTH = 0.3; // time constant of bus volume changes (s)
const MIX_FADE = 1.2; // time constant of the layer fade when a mix comes in, unless MUSIC.fadeOf says otherwise (s)

// boss arrangement (bossArrangement)
const BOSS_TEMPO_MUL = 1.3; // bpm multiplier
const BOSS_PAD_CUT_MUL = 1.3; // pad cutoff multiplier
const BOSS_ARP_CUT_MUL = 1.2; // arp cutoff multiplier
const BOSS_ARP_CUT_DEFAULT = 1500; // arp cutoff when the sector style has no arp (Hz)
const BOSS_BASS_CUT = 520; // bass cutoff (Hz)
const BOSS_STAB_PEAK = 0.05; // chord stab on every downbeat
const BOSS_STAB_ATTACK = 0.005; // (s)
const BOSS_STAB_STEPS = 2; // length (steps)
const BOSS_STAB_CUT = 2200; // (Hz)

// pad, drone and wind (all on the pad layer)
const PAD_PEAK = 0.045;
const PAD_ATTACK = 0.8; // (s)
const PAD_DETUNE = 9; // detune between neighbouring chord voices (cents)
const DRONE_INTERVALS = [0, 7]; // drone notes above the key root (semitones): root and fifth
const DRONE_PEAK = 0.06;
const DRONE_ATTACK = 1.5; // (s)
const DRONE_CUT = 220; // (Hz)
const DRONE_DETUNE = 6; // the fifth is detuned up and the root down by this much (cents)
const WIND_Q = 3; // lowpass resonance
const WIND_CUT_START = 300; // lowpass sweeps start -> peak (at half the length) -> end (Hz)
const WIND_CUT_PEAK = 900;
const WIND_CUT_END = 250;
const WIND_PEAK = 0.05;
const WIND_PEAK_AT = 0.4; // the swell peaks at this fraction of its length
const WIND_STOP_PAD = 0.1; // the noise source stops this long after the swell (s)

// arp and glitch (arp layer)
const ARP_PEAK = 0.065;
const ARP_ATTACK = 0.005; // (s)
const ARP_STEPS = 0.9; // note length (steps)
const ARP_CUT_JITTER_MIN = 0.85; // each note's cutoff is multiplied by a random factor in this range
const ARP_CUT_JITTER_MAX = 1.15;
// echoes of an arp note with echo: delay (steps), peak, cutoff multiplier
const ARP_ECHOES = [
  { delay: 3, peak: 0.025, cutMul: 0.6 },
  { delay: 6, peak: 0.01, cutMul: 0.4 },
];
const GLITCH_PROB = 0.06; // chance per step
const GLITCH_PEAK = 0.03;
const GLITCH_ATTACK = 0.002; // (s)
const GLITCH_STEPS = 0.25; // note length (steps)
const GLITCH_CUT = 4000; // (Hz)

// bass
const BASS_INTERVALS = [0, 0, 7, 12]; // semitones above the chord root, by pattern value (1 root, 2 fifth, 3 octave)
const BASS_PEAK = 0.13;
const BASS_ATTACK = 0.005; // (s)
const BASS_STEPS = 1.6; // note length (steps)

// drums (drum layer)
const KICK_F_START = 130; // the kick's pitch falls from START to END over KICK_SWEEP (Hz, s)
const KICK_F_END = 40;
const KICK_SWEEP = 0.14;
const KICK_VOL = 0.45;
const KICK_LEN = 0.22; // (s)
const KICK_STOP = 0.25; // the oscillator stops this long after the hit (s)
const SNARE_LEN = 0.16; // (s)
const SNARE_VOL = 0.16;
const SNARE_FREQ = 1400; // bandpass centre (Hz)
const HAT_LEN = 0.035; // (s)
const HAT_VOL = 0.05;
const HAT_FREQ = 7000; // highpass cutoff (Hz)
const CLANK_PARTIALS = [523, 797]; // inharmonic square partials (Hz)
const CLANK_PITCH_MIN = 0.97; // each partial's pitch is multiplied by a random factor in this range
const CLANK_PITCH_MAX = 1.03;
const CLANK_CUT = 2400; // bandpass centre (Hz)
const CLANK_Q = 8;
const CLANK_VOL = 0.08;
const CLANK_LEN = 0.35; // (s)
const CLANK_STOP = 0.4; // the oscillators stop after this (s)
const CLANK_TICK_LEN = 0.05; // noise tick on top of the partials (s)
const CLANK_TICK_VOL = 0.08;
const CLANK_TICK_FREQ = 3500; // bandpass centre (Hz)
const DRUM_NOISE_STOP_PAD = 0.02; // a noise hit's source stops this long after its envelope (s)

// tension layer
const TENSION_PEAK = 0.05;
const TENSION_ATTACK = 0.003; // (s)
const TENSION_STEPS = 0.55; // ostinato note length (steps)
const TENSION_CUT_MIN = 300; // the ostinato's cutoff opens from MIN by RANGE over TENSION_SWEEP_BARS bars (Hz)
const TENSION_CUT_RANGE = 1700;
const TENSION_SWEEP_BARS = 4;
const TENSION_HAT_LEN = 0.025; // (s)
const TENSION_HAT_VOL = 0.035;
const TENSION_HAT_FREQ = 8000; // highpass cutoff (Hz)
const TENSION_STAB_STEP = 8; // step in the bar where the stab plays, on odd bars
const TENSION_STAB_INTERVALS = [12, 13]; // semitones above the chord root: an octave and a minor ninth (dissonant)
const TENSION_STAB_PEAK = 0.025;
const TENSION_STAB_ATTACK = 0.01; // (s)
const TENSION_STAB_STEPS = 3; // length (steps)
const TENSION_STAB_CUT = 1500; // (Hz)

// synthNote envelope: it decays from NOTE_DECAY_AT of the length, with a time constant of NOTE_DECAY_TC of the length
// plus NOTE_DECAY_TC_MIN (s); the oscillator stops NOTE_STOP_PAD after the length (s)
const NOTE_DECAY_AT = 0.7;
const NOTE_DECAY_TC = 0.25;
const NOTE_DECAY_TC_MIN = 0.02;
const NOTE_STOP_PAD = 1;

export interface MusicPart {
  wave: OscillatorType;
  cut: number;
  pat: number[];
  echo?: boolean;
}
export interface MusicStyle {
  bpm: number;
  root: number;
  scale: string;
  prog: number[];
  oct?: number;
  padWave: OscillatorType;
  padCut: number;
  drone?: boolean;
  wind?: boolean;
  glitch?: boolean;
  boss?: boolean;
  arp?: MusicPart;
  bass?: MusicPart;
  kick?: number[];
  snare?: number[];
  hat?: number[];
  clank?: number[];
}
export const MUSIC_STYLES: Record<string, MusicStyle> = {},
  LAYER_MIX: Record<string, Record<string, number>> = {};
// what the game decides about names: the engine only looks them up
export interface MusicConfig {
  fallback: string | null; // style played for a name that has no style; null: such a name plays nothing
  mixOf(name: string, boss: boolean): string | null; // LAYER_MIX key that suits the name; null: leave the mix as it is
  fadeOf(mix: string): number; // time constant (s) of the layer fade when `mix` comes in
}
export const MUSIC: MusicConfig = { fallback: null, mixOf: () => null, fadeOf: () => MIX_FADE };
export const SCALES: Record<string, number[]> = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
};
// boss arrangement of a sector style: same key and chords, 30% faster (BOSS_TEMPO_MUL), 16th-note arp with octave jumps,
// octave-bouncing 8th bass, full drums with 16th hats, and a chord stab on every downbeat
export function bossArrangement(st: MusicStyle): MusicStyle {
  return Object.assign({}, st, {
    bpm: Math.round(st.bpm * BOSS_TEMPO_MUL),
    boss: true,
    padCut: st.padCut * BOSS_PAD_CUT_MUL,
    drone: true,
    arp: {
      wave: !st.arp || st.arp.wave === 'triangle' ? 'square' : st.arp.wave,
      cut: (st.arp ? st.arp.cut : BOSS_ARP_CUT_DEFAULT) * BOSS_ARP_CUT_MUL,
      pat: [0, 1, 2, 3, 4, 2, 1, 3, 0, 1, 2, 3, 5, 4, 2, 1],
    },
    bass: { wave: 'sawtooth', cut: BOSS_BASS_CUT, pat: [1, 0, 3, 0, 1, 0, 3, 0, 1, 0, 3, 0, 2, 0, 3, 0] },
    kick: [1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  });
}

export const musicState: {
  want: { name: string; boss?: boolean } | null;
  name: string | null;
  st: MusicStyle | null;
  step: number;
  next: number;
  bus: GainNode | null;
  layers: Record<string, GainNode>;
  mix: string | null;
  duck: number;
  timer: ReturnType<typeof setInterval> | null;
} = { want: null, name: null, st: null, step: 0, next: 0, bus: null, layers: {}, mix: null, duck: 1, timer: null };
export const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

export function musicInit() {
  const ac = actx;
  if (!ac || musicState.bus) return;
  const bus = ac.createGain();
  musicState.bus = bus;
  bus.gain.value = 0;
  bus.connect(ac.destination);
  ['pad', 'arp', 'bass', 'drums', 'tension'].forEach(k => {
    const g = ac.createGain();
    g.gain.value = 0;
    g.connect(bus);
    musicState.layers[k] = g;
  });
  musicState.timer = setInterval(musicTick, TICK_MS);
  if (musicState.want) {
    const w = musicState.want;
    musicState.want = null;
    setMusic(w.name, w.boss);
  }
}
// name: a MUSIC_STYLES key (an unknown name plays MUSIC.fallback, or nothing without one); boss: play its boss arrangement.
// The mix is MUSIC.mixOf(name, boss)
export function setMusic(name: string, boss?: boolean) {
  const key = name + (boss ? ':boss' : '');
  if (!actx || !musicState.bus) {
    musicState.want = { name, boss };
    return;
  }
  if (musicState.name === key) return;
  const base = MUSIC_STYLES[name] || (MUSIC.fallback === null ? undefined : MUSIC_STYLES[MUSIC.fallback]);
  if (!base) return;
  musicState.name = key;
  musicState.st = boss ? bossArrangement(base) : base;
  musicState.step = 0;
  musicState.next = actx.currentTime + START_DELAY;
  const mix = MUSIC.mixOf(name, !!boss);
  if (mix !== null) setMusicMix(mix);
  musicVolume();
}
export function setMusicMix(kind: string) {
  if (!actx || !musicState.bus || musicState.mix === kind) return;
  const m = LAYER_MIX[kind];
  if (!m) return; // the game has no such mix
  musicState.mix = kind;
  const t = actx.currentTime,
    fade = MUSIC.fadeOf(kind);
  for (const k in musicState.layers) musicState.layers[k].gain.setTargetAtTime(m[k] ?? 0, t, fade);
}
// overall BGM volume from the setting; duck = 0..1 (quieter while paused)
export function musicVolume(duck?: number) {
  if (duck !== undefined) musicState.duck = duck;
  if (!actx || !musicState.bus) return;
  musicState.bus.gain.setTargetAtTime(BUS_GAIN * bgmVolume * musicState.duck, actx.currentTime, BUS_SMOOTH);
}
export function musicTick() {
  const st = musicState.st;
  if (!st || !actx || actx.state !== 'running') return;
  const stepDur = 60 / st.bpm / STEPS_PER_BEAT;
  if (musicState.next < actx.currentTime - BACKGROUND_GAP) musicState.next = actx.currentTime + RESYNC_DELAY;
  while (musicState.next < actx.currentTime + LOOKAHEAD) {
    playStep(st, musicState.step, musicState.next, stepDur);
    musicState.next += stepDur;
    musicState.step++;
  }
}

export function chordOf(st: MusicStyle, degree: number): number[] {
  const sc = SCALES[st.scale],
    n = sc.length;
  return [0, 2, 4].map(k => sc[(degree + k) % n] + 12 * Math.floor((degree + k) / n));
}
// what a step's layer functions need: the step in its bar, the chord of the bar and the pitch of the key
interface StepCtx {
  st: MusicStyle;
  s: number; // step in the bar
  bar: number;
  chord: number[]; // MIDI notes of the bar's chord
  root: number; // MIDI note of the key's tonic, shifted by the style's octave
  t: number; // start time of the step (s)
  d: number; // length of a step (s)
}
export function playStep(st: MusicStyle, step: number, t: number, d: number) {
  const bar = Math.floor(step / STEPS_PER_BAR);
  const c: StepCtx = {
    st,
    s: step % STEPS_PER_BAR,
    bar,
    chord: chordOf(st, st.prog[bar % st.prog.length]),
    root: st.root + 12 * (st.oct || 0),
    t,
    d,
  };
  // the order matters: playArp, playGlitch and the drums draw random numbers
  playPad(c);
  playDrone(c);
  playBossStab(c);
  playArp(c);
  playGlitch(c);
  playBass(c);
  playDrums(c);
  playTension(c);
}
// the chord, held for the whole bar
function playPad({ st, s, chord, root, t, d }: StepCtx) {
  if (s !== 0) return;
  chord.forEach((c, i) =>
    synthNote(
      'pad',
      midiHz(root + 12 + c),
      t,
      d * STEPS_PER_BAR,
      st.padWave,
      PAD_PEAK,
      PAD_ATTACK,
      st.padCut,
      (i - 1) * PAD_DETUNE,
    ),
  );
}
// low drone and wind swell, restarted every SLOW_LAYER_BARS bars (both sound on the pad layer)
function playDrone({ st, s, bar, t, d }: StepCtx) {
  if (s !== 0 || bar % SLOW_LAYER_BARS !== 0) return;
  const len = d * STEPS_PER_BAR * SLOW_LAYER_BARS;
  if (st.drone)
    DRONE_INTERVALS.forEach(iv =>
      synthNote(
        'pad',
        midiHz(st.root - 12 + iv),
        t,
        len,
        'sawtooth',
        DRONE_PEAK,
        DRONE_ATTACK,
        DRONE_CUT,
        iv ? DRONE_DETUNE : -DRONE_DETUNE,
      ),
    );
  if (st.wind) windSwell(t, len);
}
// boss: a chord stab on every downbeat
function playBossStab({ st, s, chord, root, t, d }: StepCtx) {
  if (!st.boss || s !== 0) return;
  chord.forEach(c =>
    synthNote(
      'arp',
      midiHz(root + 24 + c),
      t,
      d * BOSS_STAB_STEPS,
      'sawtooth',
      BOSS_STAB_PEAK,
      BOSS_STAB_ATTACK,
      BOSS_STAB_CUT,
    ),
  );
}
// arp note from the pattern (a value past the chord's three notes goes up an octave), with its echoes
function playArp({ st, s, chord, root, t, d }: StepCtx) {
  const arp = st.arp;
  const a = arp && arp.pat[s];
  if (!arp || a === undefined || a < 0) return;
  const f = midiHz(root + 24 + chord[a % 3] + 12 * Math.floor(a / 3));
  const cut = arp.cut * rand(ARP_CUT_JITTER_MIN, ARP_CUT_JITTER_MAX);
  synthNote('arp', f, t, d * ARP_STEPS, arp.wave, ARP_PEAK, ARP_ATTACK, cut);
  if (arp.echo)
    ARP_ECHOES.forEach(e =>
      synthNote('arp', f, t + d * e.delay, d * ARP_STEPS, arp.wave, e.peak, ARP_ATTACK, cut * e.cutMul),
    );
}
// rare short high blip
function playGlitch({ st, chord, root, t, d }: StepCtx) {
  if (st.glitch && Math.random() < GLITCH_PROB)
    synthNote(
      'arp',
      midiHz(root + 36 + chord[randi(0, 2)] + randi(-1, 1)),
      t,
      d * GLITCH_STEPS,
      'square',
      GLITCH_PEAK,
      GLITCH_ATTACK,
      GLITCH_CUT,
    );
}
function playBass({ st, s, chord, root, t, d }: StepCtx) {
  const bass = st.bass;
  const bn = bass && bass.pat[s];
  if (!bass || !bn) return;
  synthNote(
    'bass',
    midiHz(root - 12 + chord[0] + BASS_INTERVALS[bn]),
    t,
    d * BASS_STEPS,
    bass.wave,
    BASS_PEAK,
    BASS_ATTACK,
    bass.cut,
  );
}
function playDrums({ st, s, t }: StepCtx) {
  if (st.kick && st.kick[s]) drumKick(t);
  if (st.snare && st.snare[s]) drumNoise(t, SNARE_LEN, SNARE_VOL, 'bandpass', SNARE_FREQ);
  if (st.hat && st.hat[s]) drumNoise(t, HAT_LEN, HAT_VOL, 'highpass', HAT_FREQ);
  if (st.clank && st.clank[s]) drumClank(t);
}
// tension layer (silent unless the mix brings it up): always scheduled so it can fade in mid-bar
function playTension({ s, bar, chord, root, t, d }: StepCtx) {
  const sweep = ((bar % TENSION_SWEEP_BARS) * STEPS_PER_BAR + s) / (TENSION_SWEEP_BARS * STEPS_PER_BAR); // filter opens over the sweep, then resets
  synthNote(
    'tension',
    midiHz(root - 12 + chord[0] + (s % 4 === 2 ? 12 : 0)),
    t,
    d * TENSION_STEPS,
    'sawtooth',
    TENSION_PEAK,
    TENSION_ATTACK,
    TENSION_CUT_MIN + TENSION_CUT_RANGE * sweep,
  );
  if (s % 2 === 1) drumNoise(t, TENSION_HAT_LEN, TENSION_HAT_VOL, 'highpass', TENSION_HAT_FREQ, 'tension');
  if (s === TENSION_STAB_STEP && bar % 2 === 1)
    TENSION_STAB_INTERVALS.forEach(iv =>
      synthNote(
        'tension',
        midiHz(root + 12 + chord[0] + iv),
        t,
        d * TENSION_STAB_STEPS,
        'square',
        TENSION_STAB_PEAK,
        TENSION_STAB_ATTACK,
        TENSION_STAB_CUT,
      ),
    );
}
// metallic hit: two inharmonic square partials through a resonant bandpass, plus a noise tick
export function drumClank(t: number) {
  const ac = actx;
  if (!ac) return;
  CLANK_PARTIALS.forEach(fq => {
    const o = ac.createOscillator(),
      f = ac.createBiquadFilter(),
      g = ac.createGain();
    o.type = 'square';
    o.frequency.value = fq * rand(CLANK_PITCH_MIN, CLANK_PITCH_MAX);
    f.type = 'bandpass';
    f.frequency.value = CLANK_CUT;
    f.Q.value = CLANK_Q;
    g.gain.setValueAtTime(CLANK_VOL, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + CLANK_LEN);
    o.connect(f);
    f.connect(g);
    g.connect(musicState.layers.drums);
    o.start(t);
    o.stop(t + CLANK_STOP);
  });
  drumNoise(t, CLANK_TICK_LEN, CLANK_TICK_VOL, 'bandpass', CLANK_TICK_FREQ);
}
// wind: long noise swell with a slowly sweeping lowpass
export function windSwell(t: number, dur: number) {
  if (!actx) return;
  const s = actx.createBufferSource(),
    f = actx.createBiquadFilter(),
    g = actx.createGain();
  s.buffer = noiseBuf;
  s.loop = true;
  f.type = 'lowpass';
  f.Q.value = WIND_Q;
  f.frequency.setValueAtTime(WIND_CUT_START, t);
  f.frequency.linearRampToValueAtTime(WIND_CUT_PEAK, t + dur * 0.5);
  f.frequency.linearRampToValueAtTime(WIND_CUT_END, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(WIND_PEAK, t + dur * WIND_PEAK_AT);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  s.connect(f);
  f.connect(g);
  g.connect(musicState.layers.pad);
  s.start(t);
  s.stop(t + dur + WIND_STOP_PAD);
}
export function synthNote(
  layer: string,
  freq: number,
  t: number,
  dur: number,
  wave: OscillatorType,
  peak: number,
  att: number,
  cut: number,
  detune?: number,
) {
  if (!actx) return;
  const o = actx.createOscillator(),
    f = actx.createBiquadFilter(),
    g = actx.createGain();
  o.type = wave;
  o.frequency.value = freq;
  if (detune) o.detune.value = detune;
  f.type = 'lowpass';
  f.frequency.value = cut;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + att);
  g.gain.setTargetAtTime(0.0001, t + Math.max(att, dur * NOTE_DECAY_AT), dur * NOTE_DECAY_TC + NOTE_DECAY_TC_MIN);
  o.connect(f);
  f.connect(g);
  g.connect(musicState.layers[layer]);
  o.start(t);
  o.stop(t + dur + NOTE_STOP_PAD);
}
export function drumKick(t: number) {
  if (!actx) return;
  const o = actx.createOscillator(),
    g = actx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(KICK_F_START, t);
  o.frequency.exponentialRampToValueAtTime(KICK_F_END, t + KICK_SWEEP);
  g.gain.setValueAtTime(KICK_VOL, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + KICK_LEN);
  o.connect(g);
  g.connect(musicState.layers.drums);
  o.start(t);
  o.stop(t + KICK_STOP);
}
export function drumNoise(t: number, dur: number, vol: number, type: BiquadFilterType, freq: number, layer?: string) {
  if (!actx) return;
  const s = actx.createBufferSource(),
    f = actx.createBiquadFilter(),
    g = actx.createGain();
  s.buffer = noiseBuf;
  f.type = type;
  f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f);
  f.connect(g);
  g.connect(musicState.layers[layer || 'drums']);
  s.start(t);
  s.stop(t + dur + DRUM_NOISE_STOP_PAD);
}
