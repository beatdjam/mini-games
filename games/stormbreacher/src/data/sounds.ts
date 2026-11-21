// The sound table: every value the synth uses, named here so the view/sound.ts recipes have no numbers of their own. All values are provisional and get tuned by listening at #view-sound. There is no music: SOUND_VOLUME.bgm is 0.

// The sounds the game can play. The first fifteen answer a frame's events (the fist's hit and miss among them); wave
// and distantBoom are the beach's ambience.
export type SoundName =
  | 'autocannon'
  | 'heavyGun'
  | 'impactDirt'
  | 'impactArmor'
  | 'meleeHit'
  | 'meleeMiss'
  | 'explosionSmall'
  | 'explosionLarge'
  | 'explosionHeavy'
  | 'shellWarn'
  | 'shellLand'
  | 'enemyGun'
  | 'mechHit'
  | 'charge'
  | 'radio'
  | 'downed'
  | 'wave'
  | 'distantBoom';

// Every name, in the order #view-sound lists them.
export const SOUND_NAMES: readonly SoundName[] = [
  'autocannon',
  'heavyGun',
  'impactDirt',
  'impactArmor',
  'meleeHit',
  'meleeMiss',
  'explosionSmall',
  'explosionLarge',
  'explosionHeavy',
  'shellWarn',
  'shellLand',
  'enemyGun',
  'mechHit',
  'charge',
  'radio',
  'downed',
  'wave',
  'distantBoom',
];

// One layer of a sound. A tone is an oscillator that may sweep from f0 to f1; a noise is filtered white noise whose filter
// may sweep from f0 to f1. `at` delays the layer from the start of the sound (s); `att` is a tone's attack (s).
export interface ToneLayer {
  kind: 'tone';
  type: 'sine' | 'square' | 'sawtooth' | 'triangle';
  f0: number; // start frequency (Hz)
  f1: number; // end frequency (Hz)
  dur: number; // length (s)
  vol: number; // level before the distance gain (0..1)
  at?: number; // delay from the sound's start (s)
  att?: number; // attack (s)
}

export interface NoiseLayer {
  kind: 'noise';
  type: 'lowpass' | 'highpass' | 'bandpass';
  f0: number; // filter start (Hz)
  f1: number; // filter end (Hz)
  dur: number; // length (s)
  vol: number; // level before the distance gain (0..1)
  q?: number; // filter resonance
  at?: number; // delay from the sound's start (s)
}

export type SoundLayer = ToneLayer | NoiseLayer;

// The layers of each sound, played together from audioNow(). A shot stacks a crack, a body, a low thump and a tail; an
// explosion stacks a low thump, a body and debris that arrives a little later.
export const SOUND_LAYERS: Record<SoundName, readonly SoundLayer[]> = {
  autocannon: [
    { kind: 'noise', type: 'highpass', f0: 6200, f1: 2600, dur: 0.025, vol: 0.42 },
    { kind: 'noise', type: 'bandpass', f0: 1900, f1: 600, dur: 0.07, vol: 0.28, q: 1.2 },
    { kind: 'tone', type: 'sine', f0: 120, f1: 38, dur: 0.07, vol: 0.22 },
    { kind: 'noise', type: 'lowpass', f0: 2200, f1: 320, dur: 0.16, vol: 0.09, at: 0.012 },
  ],
  heavyGun: [
    { kind: 'noise', type: 'highpass', f0: 4200, f1: 1900, dur: 0.03, vol: 0.5 },
    { kind: 'noise', type: 'bandpass', f0: 1050, f1: 260, dur: 0.18, vol: 0.45, q: 1.1 },
    { kind: 'tone', type: 'sine', f0: 88, f1: 28, dur: 0.22, vol: 0.58 },
    { kind: 'noise', type: 'lowpass', f0: 1600, f1: 220, dur: 0.45, vol: 0.18, at: 0.02 },
    { kind: 'noise', type: 'bandpass', f0: 900, f1: 300, dur: 0.5, vol: 0.08, q: 2, at: 0.16 },
  ],
  impactDirt: [
    { kind: 'noise', type: 'bandpass', f0: 1300, f1: 450, dur: 0.07, vol: 0.26, q: 1 },
    { kind: 'tone', type: 'sine', f0: 110, f1: 45, dur: 0.08, vol: 0.18 },
    { kind: 'noise', type: 'lowpass', f0: 900, f1: 180, dur: 0.18, vol: 0.12, at: 0.01 },
  ],
  // A round on the armour: a crack, the ring of the plate (narrow noise at the metal's own band, not a pitch), and the
  // thump of the hit. The ring is two bands so the plate answers with more than one note.
  impactArmor: [
    { kind: 'noise', type: 'highpass', f0: 5200, f1: 3200, dur: 0.022, vol: 0.3 },
    { kind: 'noise', type: 'bandpass', f0: 2600, f1: 2300, dur: 0.13, vol: 0.3, q: 7 },
    { kind: 'noise', type: 'bandpass', f0: 3900, f1: 3500, dur: 0.08, vol: 0.14, q: 9 },
    { kind: 'tone', type: 'sine', f0: 140, f1: 55, dur: 0.1, vol: 0.22 },
    { kind: 'tone', type: 'triangle', f0: 1180, f1: 880, dur: 0.14, vol: 0.04 },
  ],
  meleeHit: [
    // a heavy blow on armour: a metal crack, a ringing body and a low thump under it
    { kind: 'noise', type: 'highpass', f0: 3600, f1: 1600, dur: 0.04, vol: 0.4 },
    { kind: 'noise', type: 'bandpass', f0: 1500, f1: 520, dur: 0.14, vol: 0.5, q: 1.6 },
    { kind: 'tone', type: 'square', f0: 310, f1: 120, dur: 0.18, vol: 0.16 },
    { kind: 'tone', type: 'sine', f0: 82, f1: 30, dur: 0.24, vol: 0.55 },
    { kind: 'noise', type: 'lowpass', f0: 1100, f1: 180, dur: 0.32, vol: 0.16, at: 0.02 },
  ],
  meleeMiss: [
    // the air of an empty swing: a light whoosh with no metal in it
    { kind: 'noise', type: 'bandpass', f0: 700, f1: 1700, dur: 0.13, vol: 0.18, q: 0.9 },
    { kind: 'noise', type: 'lowpass', f0: 500, f1: 900, dur: 0.1, vol: 0.09, at: 0.01 },
  ],
  explosionSmall: [
    { kind: 'tone', type: 'sine', f0: 100, f1: 30, dur: 0.4, vol: 0.5 },
    { kind: 'noise', type: 'lowpass', f0: 1300, f1: 140, dur: 0.45, vol: 0.42 },
    { kind: 'noise', type: 'highpass', f0: 3000, f1: 1400, dur: 0.05, vol: 0.22 },
    { kind: 'noise', type: 'bandpass', f0: 1600, f1: 400, dur: 0.4, vol: 0.1, q: 2, at: 0.14 },
  ],
  explosionLarge: [
    { kind: 'tone', type: 'sine', f0: 72, f1: 20, dur: 0.9, vol: 0.75 },
    { kind: 'noise', type: 'lowpass', f0: 1500, f1: 80, dur: 0.7, vol: 0.55 },
    { kind: 'noise', type: 'highpass', f0: 3500, f1: 1500, dur: 0.07, vol: 0.28 },
    { kind: 'noise', type: 'bandpass', f0: 1100, f1: 260, dur: 0.5, vol: 0.16, q: 1.8, at: 0.2 },
    { kind: 'noise', type: 'lowpass', f0: 800, f1: 120, dur: 0.9, vol: 0.09, at: 0.5 },
    { kind: 'noise', type: 'bandpass', f0: 600, f1: 180, dur: 0.8, vol: 0.06, q: 2, at: 0.9 },
  ],
  // the milestone's heavier blast (SB-2010): lower and longer than explosionLarge, with the ground's own rumble
  explosionHeavy: [
    { kind: 'tone', type: 'sine', f0: 52, f1: 16, dur: 1.4, vol: 0.85 },
    { kind: 'tone', type: 'triangle', f0: 38, f1: 14, dur: 1.1, vol: 0.2, at: 0.04 },
    { kind: 'noise', type: 'lowpass', f0: 1100, f1: 60, dur: 1.1, vol: 0.62 },
    { kind: 'noise', type: 'highpass', f0: 3000, f1: 1200, dur: 0.08, vol: 0.26 },
    { kind: 'noise', type: 'bandpass', f0: 900, f1: 200, dur: 0.8, vol: 0.18, q: 1.6, at: 0.24 },
    { kind: 'noise', type: 'lowpass', f0: 620, f1: 90, dur: 1.4, vol: 0.12, at: 0.65 },
  ],
  // The incoming mortar: the air over the falling shell, a falling narrow band of noise with the wind around it. Only a
  // breath of tone sits inside the band so the drop has a pitch without turning into an alarm.
  shellWarn: [
    { kind: 'noise', type: 'bandpass', f0: 1700, f1: 360, dur: 1.5, vol: 0.85, q: 3.2 },
    { kind: 'noise', type: 'lowpass', f0: 2600, f1: 280, dur: 1.6, vol: 0.2, at: 0.02 },
    { kind: 'tone', type: 'sine', f0: 460, f1: 120, dur: 1.4, vol: 0.05, at: 0.05, att: 0.35 },
  ],
  shellLand: [
    { kind: 'tone', type: 'sine', f0: 62, f1: 18, dur: 1, vol: 0.8 },
    { kind: 'noise', type: 'lowpass', f0: 1800, f1: 70, dur: 0.85, vol: 0.62 },
    { kind: 'noise', type: 'highpass', f0: 3400, f1: 1200, dur: 0.09, vol: 0.3 },
    { kind: 'noise', type: 'bandpass', f0: 1300, f1: 240, dur: 0.6, vol: 0.18, q: 1.7, at: 0.18 },
    { kind: 'noise', type: 'lowpass', f0: 700, f1: 100, dur: 0.9, vol: 0.1, at: 0.5 },
    { kind: 'noise', type: 'bandpass', f0: 900, f1: 200, dur: 0.7, vol: 0.08, q: 2, at: 0.9 },
  ],
  enemyGun: [
    { kind: 'noise', type: 'highpass', f0: 4300, f1: 2200, dur: 0.022, vol: 0.26 },
    { kind: 'noise', type: 'bandpass', f0: 1650, f1: 550, dur: 0.055, vol: 0.18, q: 1.2 },
    { kind: 'tone', type: 'sine', f0: 145, f1: 50, dur: 0.06, vol: 0.13 },
    { kind: 'noise', type: 'lowpass', f0: 1300, f1: 300, dur: 0.1, vol: 0.05, at: 0.01 },
  ],
  // The mech taking a round: heavier and closer than impactArmor. A deep thump and a low body, one dull clank, and a saw
  // that falls away under it as the frame groans.
  mechHit: [
    { kind: 'tone', type: 'sine', f0: 88, f1: 30, dur: 0.24, vol: 0.42 },
    { kind: 'noise', type: 'lowpass', f0: 1400, f1: 160, dur: 0.22, vol: 0.34 },
    { kind: 'noise', type: 'bandpass', f0: 2100, f1: 1200, dur: 0.12, vol: 0.16, q: 3 },
    { kind: 'tone', type: 'sawtooth', f0: 120, f1: 50, dur: 0.28, vol: 0.1, att: 0.02 },
  ],
  // Work on the charge: a latch, then ticks that come faster as the hold goes on. The ticks are short filtered noise so
  // the work reads as metal on metal, not as a countdown beep.
  charge: [
    { kind: 'noise', type: 'highpass', f0: 4200, f1: 2600, dur: 0.02, vol: 0.22 },
    { kind: 'noise', type: 'bandpass', f0: 1900, f1: 900, dur: 0.06, vol: 0.3, q: 2 },
    { kind: 'tone', type: 'triangle', f0: 300, f1: 140, dur: 0.09, vol: 0.22 },
    { kind: 'noise', type: 'bandpass', f0: 3400, f1: 3200, dur: 0.02, vol: 0.35, q: 2, at: 0.12 },
    { kind: 'noise', type: 'bandpass', f0: 3400, f1: 3200, dur: 0.02, vol: 0.35, q: 2, at: 0.2 },
    { kind: 'noise', type: 'bandpass', f0: 3400, f1: 3200, dur: 0.02, vol: 0.35, q: 2, at: 0.26 },
    { kind: 'noise', type: 'bandpass', f0: 3400, f1: 3200, dur: 0.02, vol: 0.35, q: 2, at: 0.3 },
  ],
  // The radio opening: a band-limited burst of noise (the voice band) and a shorter squelch on top. There is no tone: the
  // burst alone is the radio, so no beep can stand in for it.
  radio: [
    { kind: 'noise', type: 'bandpass', f0: 2400, f1: 1400, dur: 0.09, vol: 0.55, q: 2.2 },
    { kind: 'noise', type: 'bandpass', f0: 1200, f1: 700, dur: 0.16, vol: 0.3, q: 2.5, at: 0.02 },
    { kind: 'noise', type: 'highpass', f0: 3800, f1: 2600, dur: 0.04, vol: 0.5, at: 0.01 },
  ],
  // The mech going down: a deeper, longer blast than explosionLarge, debris over it, and the machine winding down on a
  // saw that falls under the boom.
  downed: [
    { kind: 'tone', type: 'sine', f0: 62, f1: 16, dur: 1.4, vol: 0.72 },
    { kind: 'noise', type: 'lowpass', f0: 1800, f1: 60, dur: 1.2, vol: 0.65 },
    { kind: 'noise', type: 'highpass', f0: 3200, f1: 1200, dur: 0.08, vol: 0.45 },
    { kind: 'noise', type: 'bandpass', f0: 1000, f1: 220, dur: 0.8, vol: 0.45, q: 1.8, at: 0.16 },
    { kind: 'tone', type: 'sawtooth', f0: 170, f1: 24, dur: 1.3, vol: 0.14, att: 0.12 },
    { kind: 'noise', type: 'lowpass', f0: 700, f1: 70, dur: 1.1, vol: 0.18, at: 0.35 },
  ],
  wave: [
    { kind: 'noise', type: 'lowpass', f0: 600, f1: 160, dur: 0.9, vol: 0.5 },
    { kind: 'noise', type: 'lowpass', f0: 500, f1: 130, dur: 0.9, vol: 0.4, at: 0.45 },
    { kind: 'noise', type: 'lowpass', f0: 420, f1: 110, dur: 0.9, vol: 0.32, at: 0.9 },
    { kind: 'noise', type: 'lowpass', f0: 340, f1: 90, dur: 0.9, vol: 0.24, at: 1.35 },
    { kind: 'noise', type: 'lowpass', f0: 280, f1: 80, dur: 0.9, vol: 0.16, at: 1.8 },
  ],
  distantBoom: [
    { kind: 'tone', type: 'sine', f0: 55, f1: 20, dur: 0.6, vol: 0.45 },
    { kind: 'noise', type: 'lowpass', f0: 700, f1: 60, dur: 0.6, vol: 0.35 },
    { kind: 'noise', type: 'lowpass', f0: 450, f1: 70, dur: 0.5, vol: 0.12, at: 0.2 },
  ],
};

// How many of one sound a single frame may play; the rest are dropped in the order the events came (a burst of machine-gun
// fire or many hits would otherwise pile up into one loud crack).
export const SOUND_FRAME_LIMIT: Record<SoundName, number> = {
  autocannon: 2,
  heavyGun: 1,
  impactDirt: 2,
  impactArmor: 2,
  meleeHit: 1,
  meleeMiss: 1,
  explosionSmall: 2,
  explosionLarge: 1,
  explosionHeavy: 1,
  shellWarn: 2,
  shellLand: 2,
  enemyGun: 2,
  mechHit: 1,
  charge: 1,
  radio: 1,
  downed: 1,
  wave: 1,
  distantBoom: 1,
};

// Distance attenuation: full level and pitch nearer than `near`, `minGain` and `farPitch` from `far` on. Lowering the
// frequencies is what makes a distant sound muffled as well as quiet.
export const SOUND_DISTANCE = {
  near: 12, // m
  far: 200, // m
  minGain: 0.12, // level at far and beyond
  farPitch: 0.55, // frequency scale at far and beyond
};

// The effects bus level (0..1) and the music level. There is no music, so bgm stays 0.
export const SOUND_VOLUME = { sfx: 0.75, bgm: 0 };

// The level trim of the six rebuilt sounds (impactArmor, shellWarn, mechHit, charge, radio, downed), so they sit with
// the shots, explosions and ambience instead of standing out. playSound multiplies every layer by it; a sound not listed
// plays at 1. Downed stays a step above the other explosions, as its scene is the sortie's end.
export const SOUND_TRIM: Partial<Record<SoundName, number>> = {
  impactArmor: 1,
  shellWarn: 0.9,
  mechHit: 0.95,
  charge: 0.9,
  radio: 0.85,
  downed: 1.1,
};

// The beach's ambience: a wave swell now and then, and a distant gun far off at an uneven interval. These draw from a
// generator of their own with a fixed seed, never logic/rng.ts's stream, so neither the game's random sequence nor the
// sound changes from run to run.
export const SOUND_AMBIENT = {
  seed: 0x5b0a4d13, // the ambience's own seed; the same sortie sounds the same every time
  waveEvery: { min: 2.6, max: 3.4 }, // s between wave swells
  boomEvery: { min: 4, max: 11 }, // s between distant shots
  firstBoom: 1.5, // s from the sortie's start to the first distant shot
  boomDistance: { min: 90, max: 200 }, // m, used only to pick the distant shot's gain and pitch
  waveGain: 0.16,
  wavePitch: 0.8,
  boomGain: 0.9, // multiplied by the distance's gain
};
