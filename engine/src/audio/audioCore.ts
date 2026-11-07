// The audio state the effect synth and the music player share: moving it here keeps audio.ts out of the music files' imports.
// All null until the first tap / click (browsers only allow audio after one), or when Web Audio is missing.
export let actx: AudioContext | null = null;
export let noiseBuf: AudioBuffer | null = null;
export let bgmVolume = 0.6;
export const setActx = (ac: AudioContext | null) => (actx = ac);
export const setNoiseBuf = (buf: AudioBuffer | null) => (noiseBuf = buf);
export const setBgmVolume = (v: number) => (bgmVolume = v);
