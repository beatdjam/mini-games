import { rand, randi } from '../core/util.ts';
import { actx, noiseBuf } from './audioCore.ts';
import {
  ARP_ATTACK,
  ARP_CUT_JITTER_MAX,
  ARP_CUT_JITTER_MIN,
  ARP_ECHOES,
  ARP_PEAK,
  ARP_STEPS,
  BASS_ATTACK,
  BASS_INTERVALS,
  BASS_PEAK,
  BASS_STEPS,
  BOSS_STAB_ATTACK,
  BOSS_STAB_CUT,
  BOSS_STAB_PEAK,
  BOSS_STAB_STEPS,
  CLANK_CUT,
  CLANK_LEN,
  CLANK_PARTIALS,
  CLANK_PITCH_MAX,
  CLANK_PITCH_MIN,
  CLANK_Q,
  CLANK_STOP,
  CLANK_TICK_FREQ,
  CLANK_TICK_LEN,
  CLANK_TICK_VOL,
  CLANK_VOL,
  DRONE_ATTACK,
  DRONE_CUT,
  DRONE_DETUNE,
  DRONE_INTERVALS,
  DRONE_PEAK,
  DRUM_NOISE_STOP_PAD,
  GLITCH_ATTACK,
  GLITCH_CUT,
  GLITCH_PEAK,
  GLITCH_PROB,
  GLITCH_STEPS,
  HAT_FREQ,
  HAT_LEN,
  HAT_VOL,
  KICK_F_END,
  KICK_F_START,
  KICK_LEN,
  KICK_STOP,
  KICK_SWEEP,
  KICK_VOL,
  NOTE_DECAY_AT,
  NOTE_DECAY_TC,
  NOTE_DECAY_TC_MIN,
  NOTE_STOP_PAD,
  PAD_ATTACK,
  PAD_DETUNE,
  PAD_PEAK,
  SCALES,
  SLOW_LAYER_BARS,
  SNARE_FREQ,
  SNARE_LEN,
  SNARE_VOL,
  STEPS_PER_BAR,
  TENSION_ATTACK,
  TENSION_CUT_MIN,
  TENSION_CUT_RANGE,
  TENSION_HAT_FREQ,
  TENSION_HAT_LEN,
  TENSION_HAT_VOL,
  TENSION_PEAK,
  TENSION_STAB_ATTACK,
  TENSION_STAB_CUT,
  TENSION_STAB_INTERVALS,
  TENSION_STAB_PEAK,
  TENSION_STAB_STEP,
  TENSION_STAB_STEPS,
  TENSION_STEPS,
  TENSION_SWEEP_BARS,
  WIND_CUT_END,
  WIND_CUT_PEAK,
  WIND_CUT_START,
  WIND_PEAK,
  WIND_PEAK_AT,
  WIND_Q,
  WIND_STOP_PAD,
} from './musicTune.ts';
// engine: the instruments of the procedural music player: one step's layers (pad / arp / bass / drums / tension)
// and the synth voices they play on. The player in music.ts decides the style and the mix.
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
