'use strict';
// Sound effects synth (Web Audio)
let actx = null, master = null, noiseBuf = null;
const lastSfx = {};
function audioInit() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    // effects bus -> light compressor so layered shots stay punchy without clipping
    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.012; comp.release.value = 0.15;
    master = actx.createGain(); master.connect(comp); comp.connect(actx.destination); applySfxVolume();
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 1.2, actx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    musicInit(); // js/music.js
  } catch (e) { actx = null; }
}
function applySfxVolume() { if (master) master.gain.value = 0.32 * (save.settings.sfx ?? 1); }
function tone(freq, dur, type, vol, slide, delay) {
  if (!actx) return;
  const t = actx.currentTime + (delay || 0), o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, freq, delay) {
  if (!actx) return;
  const t = actx.currentTime + (delay || 0), s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur);
}
// ---- layered sound effects ----
// nz: filtered noise with a filter sweep f0 -> f1; ot: oscillator with a pitch sweep f0 -> f1.
// Gun shots stack a transient crack, a body, a low thump and a tail, with a little random pitch per shot.
function nz(t, dur, vol, type, f0, f1, q) {
  const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  s.buffer = noiseBuf; f.type = type; f.Q.value = q || 0.8;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1 || f0), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
function ot(t, type, f0, f1, dur, vol, att) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + (att || 0.002)); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function gunshot(o) {
  if (!actx) return;
  const t = actx.currentTime, r = rand(0.92, 1.08);
  nz(t, 0.02, o.crack, 'highpass', (o.crackF || 5000) * r, 3000);                    // transient crack
  nz(t, o.body, o.bodyVol, 'bandpass', o.bodyF * r, o.bodyF * (o.bodyEnd || 0.35), 1.2); // body
  ot(t, 'sine', o.thumpF * r, 35, o.thump, o.thumpVol);                                // low thump
  nz(t + 0.01, o.tail, o.tailVol, 'lowpass', (o.tailF || 2200) * r, 300);             // tail
}
function sfx(name, gap) {
  if (!actx) return; // no audio yet (before the first tap) or not supported
  const now = performance.now();
  if (gap && lastSfx[name] && now - lastSfx[name] < gap) return;
  lastSfx[name] = now; SFX[name]();
}
