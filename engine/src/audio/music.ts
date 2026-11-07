import { actx, bgmVolume } from './audioCore.ts';
import { musicState, playStep } from './musicInstruments.ts';
import type { MusicStyle } from './musicInstruments.ts';
import {
  BACKGROUND_GAP,
  BOSS_ARP_CUT_DEFAULT,
  BOSS_ARP_CUT_MUL,
  BOSS_BASS_CUT,
  BOSS_PAD_CUT_MUL,
  BOSS_TEMPO_MUL,
  BUS_GAIN,
  BUS_SMOOTH,
  LOOKAHEAD,
  MIX_FADE,
  RESYNC_DELAY,
  START_DELAY,
  STEPS_PER_BEAT,
  TICK_MS,
} from './musicTune.ts';
// engine: Procedural music player: plays a style (key, scale, chords, patterns) in layers whose mix follows the situation.
// Everything is synthesised with Web Audio; no music files. A game gives each area its own style (MUSIC_STYLES)
// (key, scale, chord loop, tempo, patterns). Layers (pad / arp / bass / drums) fade in and out
// with the situation: quiet while exploring, full when enemies are on you. Boss fights can play an
// arrangement of the area's own style: same key and chords, faster, with driving bass and drums.
// A combat-only tension layer (pulsing ostinato, busy hats, dissonant stabs) fades in when enemies are on you.
// The engine knows no style or mix names. The game fills MUSIC_STYLES and LAYER_MIX (Object.assign), sets MUSIC
// (the fallback style and which mix a name suits), and calls setMusic(name, boss) / setMusicMix(kind).
// style fields are described above; the mix is { pad, arp, bass, drums, tension } levels per situation

export const MUSIC_STYLES: Record<string, MusicStyle> = {},
  LAYER_MIX: Record<string, Record<string, number>> = {};
// what the game decides about names: the engine only looks them up
export interface MusicConfig {
  fallback: string | null; // style played for a name that has no style; null: such a name plays nothing
  mixOf(name: string, boss: boolean): string | null; // LAYER_MIX key that suits the name; null: leave the mix as it is
  fadeOf(mix: string): number; // time constant (s) of the layer fade when `mix` comes in
}
export const MUSIC: MusicConfig = { fallback: null, mixOf: () => null, fadeOf: () => MIX_FADE };
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

export type { MusicPart, MusicStyle } from './musicInstruments.ts';
export {
  chordOf,
  drumClank,
  drumKick,
  drumNoise,
  midiHz,
  musicState,
  playStep,
  synthNote,
  windSwell,
} from './musicInstruments.ts';
export { SCALES } from './musicTune.ts';
