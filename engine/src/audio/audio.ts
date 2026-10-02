import { rand } from '../core/util.ts';
import { musicInit } from './music.ts';
// engine: Sound effects synth (Web Audio): layered noise / oscillator helpers, a gunshot voice, sfx(name) plays SFX[name] from the game
// all null until the first tap / click (browsers only allow audio after one), or when Web Audio is missing
export let actx: AudioContext | null = null;
let master: GainNode | null = null;
export let noiseBuf: AudioBuffer | null = null;
export const lastSfx: Record<string, number> = {};
export function audioInit() {
  if (actx) {
    if (actx.state === 'suspended') actx.resume();
    return;
  }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ac = (actx = new Ctx());
    // effects bus -> light compressor so layered shots stay punchy without clipping
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.012;
    comp.release.value = 0.15;
    const m = (master = ac.createGain());
    m.connect(comp);
    comp.connect(ac.destination);
    applySfxVolume();
    const nb = (noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.2, ac.sampleRate));
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    musicInit(); // engine/src/audio/music.ts
  } catch (e) {
    actx = null;
  }
}
// call once at start-up. Browsers start audio only from a user gesture, and on phones a touch's pointerdown
// doesn't count (its pointerup / touchend does), so every kind of input tries again until audio is actually running
export function unlockAudio() {
  const evs = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'];
  const tryUnlock = () => {
    audioInit();
    if (actx && actx.state === 'running') evs.forEach(ev => document.removeEventListener(ev, tryUnlock, true));
  };
  evs.forEach(ev => document.addEventListener(ev, tryUnlock, true));
}
// the game sets these from its settings (0..1)
// sound recipes by name, filled by the game: SFX.name = () => { ... }
export const SFX: Record<string, () => void> = {};
let sfxVolume = 1;
export let bgmVolume = 0.6;
export function setVolumes(sfx: number, bgm: number) {
  sfxVolume = sfx;
  bgmVolume = bgm;
}
export function applySfxVolume() {
  if (master) master.gain.value = 0.32 * sfxVolume;
}
export function tone(freq: number, dur: number, type: OscillatorType, vol: number, slide?: number, delay?: number) {
  if (!actx || !master) return;
  const t = actx.currentTime + (delay || 0),
    o = actx.createOscillator(),
    g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}
export function noise(dur: number, vol: number, freq: number, delay?: number) {
  if (!actx || !master) return;
  const t = actx.currentTime + (delay || 0),
    s = actx.createBufferSource(),
    f = actx.createBiquadFilter(),
    g = actx.createGain();
  s.buffer = noiseBuf;
  f.type = 'lowpass';
  f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f);
  f.connect(g);
  g.connect(master);
  s.start(t);
  s.stop(t + dur);
}
// ---- layered sound effects ----
// noiseBurst: filtered noise with a filter sweep f0 -> f1; sweepTone: oscillator with a pitch sweep f0 -> f1.
// Gun shots stack a transient crack, a body, a low thump and a tail, with a little random pitch per shot.
export function noiseBurst(
  t: number,
  dur: number,
  vol: number,
  type: BiquadFilterType,
  f0: number,
  f1?: number,
  q?: number,
) {
  if (!actx || !master) return;
  const s = actx.createBufferSource(),
    f = actx.createBiquadFilter(),
    g = actx.createGain();
  s.buffer = noiseBuf;
  f.type = type;
  f.Q.value = q || 0.8;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, f1 || f0), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f);
  f.connect(g);
  g.connect(master);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}
export function sweepTone(
  t: number,
  type: OscillatorType,
  f0: number,
  f1: number,
  dur: number,
  vol: number,
  att?: number,
) {
  if (!actx || !master) return;
  const o = actx.createOscillator(),
    g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + (att || 0.002));
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}
// the four layers of a shot: volumes, lengths (s) and frequencies (Hz); r is a random pitch factor per shot
export interface GunshotSpec {
  crack: number;
  crackF?: number;
  body: number;
  bodyVol: number;
  bodyF: number;
  bodyEnd?: number;
  thump: number;
  thumpVol: number;
  thumpF: number;
  tail: number;
  tailVol: number;
  tailF?: number;
}
export function gunshot(o: GunshotSpec) {
  if (!actx) return;
  const t = actx.currentTime,
    r = rand(0.92, 1.08);
  noiseBurst(t, 0.02, o.crack, 'highpass', (o.crackF || 5000) * r, 3000); // transient crack
  noiseBurst(t, o.body, o.bodyVol, 'bandpass', o.bodyF * r, o.bodyF * (o.bodyEnd || 0.35), 1.2); // body
  sweepTone(t, 'sine', o.thumpF * r, 35, o.thump, o.thumpVol); // low thump
  noiseBurst(t + 0.01, o.tail, o.tailVol, 'lowpass', (o.tailF || 2200) * r, 300); // tail
}
// the audio clock (s) for sound recipes; 0 before audio starts
export const audioNow = (): number => (actx ? actx.currentTime : 0);
export function sfx(name: string, gap?: number) {
  if (!actx) return; // no audio yet (before the first tap) or not supported
  const now = performance.now();
  if (gap && lastSfx[name] && now - lastSfx[name] < gap) return;
  lastSfx[name] = now;
  SFX[name]();
}
