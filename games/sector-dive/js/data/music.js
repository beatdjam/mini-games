import { LAYER_MIX, MUSIC_STYLES } from '../../../../engine/audio/music.js';
// Music: per-sector styles and the layer mix (the player is engine/audio/music.js, which also holds SCALES)
// patterns are 16 steps (16th notes, one bar). arp: chord tone index (0-2, +3 = octave up), -1 rest.
// bass: 1 root, 2 fifth, 3 octave, 0 rest. kick / snare / hat / clank: 1 hit, 0 rest.
// drone: low sustained root + fifth; wind: filtered noise swells; echo: quieter repeat of arp notes (fake delay);
// oct: register shift in octaves (negative = darker). All progressions stay on minor / diminished chords.
export const _ = -1;
Object.assign(MUSIC_STYLES, {
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
});
// layer levels per situation
// tension: combat-only layer (pulsing 16th ostinato with a rising filter, busy hats, a dissonant stab)
Object.assign(LAYER_MIX, {
  base:    { pad: 1, arp: 0.6, bass: 0, drums: 0, tension: 0 },
  explore: { pad: 1, arp: 0.7, bass: 0.35, drums: 0, tension: 0 },
  combat:  { pad: 0.7, arp: 0.8, bass: 1, drums: 1, tension: 1 },
  boss:    { pad: 0.8, arp: 1, bass: 1, drums: 1, tension: 0.7 },
});
