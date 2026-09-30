// Renders the SECTOR DIVE trailer frame by frame in headless Chrome (dev server needed: npx vite --port 8765).
//   node tools/trailer/capture.mjs <out-dir> video   frames as <out-dir>/f00000.jpg ... + the game's sound effects as sfx.wav
//   node tools/trailer/capture.mjs <out-dir> music   the trailer BGM only, as music.wav (no frames; fast)
// then tools/trailer/encode.sh <out-dir> puts them together into trailer.mp4.
// The page runs on a virtual clock (performance.now, timers and requestAnimationFrame are replaced, see SHIM), so every
// frame is exactly 1/30 s of game time however slowly this machine draws it. Sound goes to an OfflineAudioContext that
// renders up to each frame's time and waits there, so it lines up with the frames. What happens in the trailer is
// scripted in games/sector-dive/js/dev/trailer.ts (opened with #trailer / #trailer-music).
// Talks to Chrome over the DevTools protocol with Node's own WebSocket (Node 22+), so it needs no packages.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [outDir, pass = 'video'] = process.argv.slice(2);
if (!outDir || !['video', 'music'].includes(pass)) { console.error('usage: node tools/trailer/capture.mjs <out-dir> video|music'); process.exit(1); }
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://localhost:8765/';
// a phone held sideways (20:9); frames come out at W*DPR x H*DPR = 1920x864
const W = 1280, H = 576, DPR = 1.5;
fs.mkdirSync(outDir, { recursive: true });

// runs in the page before any of its scripts
const SHIM = `(() => {
  // virtual clock: nothing moves until the trailer script calls __advance(ms)
  let now = 0, nextId = 1, rafs = [];
  const timers = new Map(), t0 = Date.now();
  performance.now = () => now;
  Date.now = () => t0 + now;
  window.setTimeout = (fn, ms, ...a) => { const id = nextId++; timers.set(id, { t: now + Math.max(0, +ms || 0), fn, a }); return id; };
  window.setInterval = (fn, ms, ...a) => { const id = nextId++, every = Math.max(1, +ms || 0); timers.set(id, { t: now + every, fn, a, every }); return id; };
  window.clearTimeout = window.clearInterval = id => { timers.delete(id); };
  window.requestAnimationFrame = fn => { rafs.push(fn); return rafs.length; };
  window.cancelAnimationFrame = () => {};
  window.__advance = ms => {
    const end = now + ms;
    for (;;) {
      let id = null, tm = null;
      for (const [i, x] of timers) if (x.t <= end && (!tm || x.t < tm.t)) { id = i; tm = x; }
      if (!tm) break;
      now = Math.max(now, tm.t);
      if (tm.every) tm.t += tm.every; else timers.delete(id);
      try { typeof tm.fn === 'function' ? tm.fn(...tm.a) : 0; } catch (e) { console.error(e); }
    }
    now = end;
    const r = rafs; rafs = [];
    r.forEach(f => { try { f(now); } catch (e) { console.error(e); } });
  };
  // the same run every time
  let seed = 20261001;
  Math.random = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  // sound: one OfflineAudioContext long enough for the whole trailer. The game sees it through a proxy that always
  // reports 'running' (it is suspended between frames, and the music skips its tick while not running)
  window.__audioSeconds = 34;
  const Make = () => {
    if (!window.__off) {
      const off = window.__off = new OfflineAudioContext(2, Math.round(48000 * window.__audioSeconds), 48000);
      window.__offProxy = new Proxy(off, { get(t, k) {
        if (k === 'state') return 'running';
        if (k === 'resume' || k === 'suspend' || k === 'close') return () => Promise.resolve();
        const v = Reflect.get(t, k, t); return typeof v === 'function' ? v.bind(t) : v;
      } });
    }
    return window.__offProxy;
  };
  window.AudioContext = window.webkitAudioContext = function () { return Make(); };
})();`;

// ---- DevTools protocol ----
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trailer-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=0', `--user-data-dir=${userDir}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((res, rej) => {
  let buf = '';
  chrome.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); });
  chrome.on('exit', c => rej(new Error('chrome exited ' + c)));
});
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.addEventListener('open', r));
let msgId = 0; const pending = new Map(), listeners = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  else listeners.forEach(f => f(m));
});
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++msgId; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params, sessionId })); });

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const s = (m, p) => send(m, p, sessionId);
await s('Page.enable'); await s('Runtime.enable');
await s('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await s('Page.addScriptToEvaluateOnNewDocument', { source: SHIM });
for (const name of ['__shot', '__audio', '__done']) await s('Runtime.addBinding', { name });

let audioChunks = [], started = Date.now(), frames = 0;
const finished = new Promise(resolve => {
  listeners.push(async m => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = m.params.args.map(a => a.value ?? a.description ?? '').join(' ');
      if (m.params.type === 'error' || /^TRAILER/.test(text)) console.log(`[page ${m.params.type}] ${text}`);
    }
    if (m.method === 'Runtime.exceptionThrown') console.log('[page exception]', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method !== 'Runtime.bindingCalled') return;
    const { name, payload } = m.params;
    if (name === '__shot') {
      const k = +payload;
      const { data } = await s('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
      fs.writeFileSync(path.join(outDir, `f${String(k).padStart(5, '0')}.jpg`), Buffer.from(data, 'base64'));
      frames++;
      if (k % 30 === 0) console.log(`frame ${k} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
      await s('Runtime.evaluate', { expression: 'window.__ack && window.__ack()' });
    } else if (name === '__audio') {
      audioChunks.push(payload);
      await s('Runtime.evaluate', { expression: 'window.__audioAck && window.__audioAck()' });
    } else if (name === '__done') resolve(payload);
  });
});

// TFRAMES=N renders only the first N frames (a quick look)
const tf = process.env.TFRAMES ? `&tframes=${process.env.TFRAMES}` : '';
await s('Page.navigate', { url: `${BASE}games/sector-dive/?lang=ja${tf}#trailer${pass === 'music' ? '-music' : ''}-touch` });
const info = await finished;
// the page sends the rendered sound as base64 of a 16-bit stereo WAV
const wav = Buffer.from(audioChunks.join(''), 'base64');
fs.writeFileSync(path.join(outDir, pass === 'music' ? 'music.wav' : 'sfx.wav'), wav);
console.log(`done: ${frames} frames, ${(wav.length / 1024 / 1024).toFixed(1)} MB of sound, ${((Date.now() - started) / 1000).toFixed(0)} s. ${info}`);
ws.close();
await new Promise(r => { chrome.on('exit', r); chrome.kill(); });
try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) { /* Chrome may still be letting go of files */ }
