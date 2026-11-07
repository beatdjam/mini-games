// ---- tuning: times are seconds (s), pitches Hz, "steps" are 16th notes, peaks are gain levels ----
export const STEPS_PER_BAR = 16; // 16th-note steps in one bar
export const STEPS_PER_BEAT = 4; // 16th notes in one quarter-note beat
export const SLOW_LAYER_BARS = 2; // drone and wind restart every this many bars and last as long
export const TICK_MS = 25; // how often the scheduler runs (ms)
export const LOOKAHEAD = 0.12; // notes are scheduled up to this far ahead of the audio clock (s)
export const BACKGROUND_GAP = 0.3; // the schedule is this far behind the audio clock: the tab was in the background (s)
export const RESYNC_DELAY = 0.05; // after a background gap, the schedule restarts this far ahead (s)
export const START_DELAY = 0.08; // a newly chosen style starts this far ahead (s)
export const BUS_GAIN = 0.2; // music bus level at BGM volume 1 with no duck
export const BUS_SMOOTH = 0.3; // time constant of bus volume changes (s)
export const MIX_FADE = 1.2; // time constant of the layer fade when a mix comes in, unless MUSIC.fadeOf says otherwise (s)

// boss arrangement (bossArrangement)
export const BOSS_TEMPO_MUL = 1.3; // bpm multiplier
export const BOSS_PAD_CUT_MUL = 1.3; // pad cutoff multiplier
export const BOSS_ARP_CUT_MUL = 1.2; // arp cutoff multiplier
export const BOSS_ARP_CUT_DEFAULT = 1500; // arp cutoff when the sector style has no arp (Hz)
export const BOSS_BASS_CUT = 520; // bass cutoff (Hz)
export const BOSS_STAB_PEAK = 0.05; // chord stab on every downbeat
export const BOSS_STAB_ATTACK = 0.005; // (s)
export const BOSS_STAB_STEPS = 2; // length (steps)
export const BOSS_STAB_CUT = 2200; // (Hz)

// pad, drone and wind (all on the pad layer)
export const PAD_PEAK = 0.045;
export const PAD_ATTACK = 0.8; // (s)
export const PAD_DETUNE = 9; // detune between neighbouring chord voices (cents)
export const DRONE_INTERVALS = [0, 7]; // drone notes above the key root (semitones): root and fifth
export const DRONE_PEAK = 0.06;
export const DRONE_ATTACK = 1.5; // (s)
export const DRONE_CUT = 220; // (Hz)
export const DRONE_DETUNE = 6; // the fifth is detuned up and the root down by this much (cents)
export const WIND_Q = 3; // lowpass resonance
export const WIND_CUT_START = 300; // lowpass sweeps start -> peak (at half the length) -> end (Hz)
export const WIND_CUT_PEAK = 900;
export const WIND_CUT_END = 250;
export const WIND_PEAK = 0.05;
export const WIND_PEAK_AT = 0.4; // the swell peaks at this fraction of its length
export const WIND_STOP_PAD = 0.1; // the noise source stops this long after the swell (s)

// arp and glitch (arp layer)
export const ARP_PEAK = 0.065;
export const ARP_ATTACK = 0.005; // (s)
export const ARP_STEPS = 0.9; // note length (steps)
export const ARP_CUT_JITTER_MIN = 0.85; // each note's cutoff is multiplied by a random factor in this range
export const ARP_CUT_JITTER_MAX = 1.15;
// echoes of an arp note with echo: delay (steps), peak, cutoff multiplier
export const ARP_ECHOES = [
  { delay: 3, peak: 0.025, cutMul: 0.6 },
  { delay: 6, peak: 0.01, cutMul: 0.4 },
];
export const GLITCH_PROB = 0.06; // chance per step
export const GLITCH_PEAK = 0.03;
export const GLITCH_ATTACK = 0.002; // (s)
export const GLITCH_STEPS = 0.25; // note length (steps)
export const GLITCH_CUT = 4000; // (Hz)

// bass
export const BASS_INTERVALS = [0, 0, 7, 12]; // semitones above the chord root, by pattern value (1 root, 2 fifth, 3 octave)
export const BASS_PEAK = 0.13;
export const BASS_ATTACK = 0.005; // (s)
export const BASS_STEPS = 1.6; // note length (steps)

// drums (drum layer)
export const KICK_F_START = 130; // the kick's pitch falls from START to END over KICK_SWEEP (Hz, s)
export const KICK_F_END = 40;
export const KICK_SWEEP = 0.14;
export const KICK_VOL = 0.45;
export const KICK_LEN = 0.22; // (s)
export const KICK_STOP = 0.25; // the oscillator stops this long after the hit (s)
export const SNARE_LEN = 0.16; // (s)
export const SNARE_VOL = 0.16;
export const SNARE_FREQ = 1400; // bandpass centre (Hz)
export const HAT_LEN = 0.035; // (s)
export const HAT_VOL = 0.05;
export const HAT_FREQ = 7000; // highpass cutoff (Hz)
export const CLANK_PARTIALS = [523, 797]; // inharmonic square partials (Hz)
export const CLANK_PITCH_MIN = 0.97; // each partial's pitch is multiplied by a random factor in this range
export const CLANK_PITCH_MAX = 1.03;
export const CLANK_CUT = 2400; // bandpass centre (Hz)
export const CLANK_Q = 8;
export const CLANK_VOL = 0.08;
export const CLANK_LEN = 0.35; // (s)
export const CLANK_STOP = 0.4; // the oscillators stop after this (s)
export const CLANK_TICK_LEN = 0.05; // noise tick on top of the partials (s)
export const CLANK_TICK_VOL = 0.08;
export const CLANK_TICK_FREQ = 3500; // bandpass centre (Hz)
export const DRUM_NOISE_STOP_PAD = 0.02; // a noise hit's source stops this long after its envelope (s)

// tension layer
export const TENSION_PEAK = 0.05;
export const TENSION_ATTACK = 0.003; // (s)
export const TENSION_STEPS = 0.55; // ostinato note length (steps)
export const TENSION_CUT_MIN = 300; // the ostinato's cutoff opens from MIN by RANGE over TENSION_SWEEP_BARS bars (Hz)
export const TENSION_CUT_RANGE = 1700;
export const TENSION_SWEEP_BARS = 4;
export const TENSION_HAT_LEN = 0.025; // (s)
export const TENSION_HAT_VOL = 0.035;
export const TENSION_HAT_FREQ = 8000; // highpass cutoff (Hz)
export const TENSION_STAB_STEP = 8; // step in the bar where the stab plays, on odd bars
export const TENSION_STAB_INTERVALS = [12, 13]; // semitones above the chord root: an octave and a minor ninth (dissonant)
export const TENSION_STAB_PEAK = 0.025;
export const TENSION_STAB_ATTACK = 0.01; // (s)
export const TENSION_STAB_STEPS = 3; // length (steps)
export const TENSION_STAB_CUT = 1500; // (Hz)

// synthNote envelope: it decays from NOTE_DECAY_AT of the length, with a time constant of NOTE_DECAY_TC of the length
// plus NOTE_DECAY_TC_MIN (s); the oscillator stops NOTE_STOP_PAD after the length (s)
export const NOTE_DECAY_AT = 0.7;
export const NOTE_DECAY_TC = 0.25;
export const NOTE_DECAY_TC_MIN = 0.02;
export const NOTE_STOP_PAD = 1;

export const SCALES: Record<string, number[]> = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
};
