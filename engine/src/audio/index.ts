// engine/audio: the public entry for the audio folder. Games import from here, not from the files inside.
// The names a game may use are re-exported below.

export {
  SFX,
  applySfxVolume,
  audioInit,
  audioNow,
  gunshot,
  noiseBurst,
  setVolumes,
  sfx,
  sweepTone,
  tone,
  unlockAudio,
} from './audio.ts';
export { actx } from './audioCore.ts';
export { LAYER_MIX, MUSIC, MUSIC_STYLES, musicInit, musicVolume, setMusic, setMusicMix } from './music.ts';
export { musicState, playStep } from './musicInstruments.ts';
