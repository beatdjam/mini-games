// Films a trailer script frame by frame in headless Chrome (the dev server must be up; tools/trailer/trailer.mjs
// starts one). Usually run through `npm run trailer` (tools/trailer/README.md).
//   node tools/trailer/capture.mjs <script.txt> <out-dir> video   frames as <out-dir>/f00000.jpg ... + the game's sound effects as sfx.wav
//   node tools/trailer/capture.mjs <script.txt> <out-dir> music   the music only, as music.wav (no frames; fast)
// The page runs on a virtual clock (performance.now, timers and requestAnimationFrame are replaced, see SHIM), so every
// frame is exactly 1/30 s of game time however slowly this machine draws it. Sound goes to an OfflineAudioContext that
// renders up to each frame's time and waits there, so it lines up with the frames. The script is handed to the page
// (window.__trailerScript) and filmed by engine/src/trailer/film.ts with the game's words (src/dev/trailer.ts of the
// game, opened with #trailer / #trailer-music).
// Talks to Chrome over the DevTools protocol with Node's own WebSocket (Node 22+), so it needs no packages.
// Env: CHROME (the browser), GL (swiftshader: software, the same picture anywhere, slow; metal etc.: the GPU), BASE
// (the dev server), TFRAMES / TFROM / TEVERY / TSCENE (only part of it, see engine/src/trailer/film.ts frameRange)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { readScript } from './settings.mjs';

const [scriptFile, outDir, pass = 'video'] = process.argv.slice(2);
if (!scriptFile || !outDir || !['video', 'music'].includes(pass)) {
  console.error('usage: node tools/trailer/capture.mjs <script.txt> <out-dir> video|music');
  process.exit(1);
}
let script;
try {
  script = readScript(scriptFile);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
const { source, game: GAME, width: W, height: H, scale: DPR, touch, lang, total } = script;

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (fs.existsSync(mac)) return mac;
  try {
    const p = createRequire(import.meta.url)('playwright').chromium.executablePath();
    if (fs.existsSync(p)) return p;
  } catch {
    // no playwright browser: the one of this container below
  }
  return '/opt/pw-browsers/chromium';
}
const CHROME = findChrome();
const GL = process.env.GL || (process.platform === 'darwin' ? 'metal' : 'swiftshader');
const BASE = process.env.BASE || 'http://localhost:8765/';
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy;
fs.mkdirSync(outDir, { recursive: true });

// runs in the page before any of its scripts
const SHIM = `window.__trailerScript = ${JSON.stringify(source)};
(() => {
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
  const tick = ms => {
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
  };
  window.__tick = tick;
  window.__advance = ms => {
    tick(ms);
    const r = rafs; rafs = [];
    r.forEach(f => { try { f(now); } catch (e) { console.error(e); } });
  };
  // the same run every time
  let seed = 20261001;
  Math.random = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  // sound: one OfflineAudioContext as long as the film. The game sees it through a proxy that always reports
  // 'running' (it is suspended between frames, and the music skips its tick while not running)
  window.__audioSeconds = ${Math.ceil(total) + 1};
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
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-sandbox',
    `--use-angle=${GL}`,
    ...(GL === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : []),
    '--hide-scrollbars',
    // (behind a proxy, as the environment says: without it a web font the page asks for can hang the page's load)
    ...(PROXY ? [`--proxy-server=${PROXY}`] : []),
    '--autoplay-policy=no-user-gesture-required',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDir}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
const wsUrl = await new Promise((res, rej) => {
  let buf = '';
  chrome.stderr.on('data', d => {
    buf += d;
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) res(m[1]);
  });
  chrome.on('error', e =>
    rej(new Error(`could not start Chrome (${CHROME}): ${e.message}. Set CHROME to the browser`)),
  );
  chrome.on('exit', c => rej(new Error('chrome exited ' + c)));
});
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.addEventListener('open', r));
let msgId = 0;
const pending = new Map(),
  listeners = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
  } else listeners.forEach(f => f(m));
});
const send = (method, params = {}, sessionId) =>
  new Promise((res, rej) => {
    const id = ++msgId;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const s = (m, p) => send(m, p, sessionId);
await s('Page.enable');
await s('Runtime.enable');
await s('Emulation.setDeviceMetricsOverride', {
  width: W,
  height: H,
  deviceScaleFactor: DPR,
  mobile: touch,
  ...(touch && { screenOrientation: { type: W > H ? 'landscapePrimary' : 'portraitPrimary', angle: W > H ? 90 : 0 } }),
});
if (touch) await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await s('Page.addScriptToEvaluateOnNewDocument', { source: SHIM });
for (const name of ['__shot', '__audio', '__done']) await s('Runtime.addBinding', { name });

let audioChunks = [],
  started = Date.now(),
  frames = 0,
  failed = false,
  quiet = 0; // watch periods without a word from the page
let finish;
const finished = new Promise(resolve => {
  finish = why => {
    failed = true;
    resolve(why);
  };
  listeners.push(async m => {
    if (m.sessionId !== sessionId) return;
    quiet = 0;
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = m.params.args.map(a => a.value ?? a.description ?? '').join(' ');
      if (/^TRAILER error/.test(text)) console.log(text.replace(/^TRAILER error /, 'script: '));
      else if (m.params.type === 'error' || /^TRAILER/.test(text)) console.log(`[page ${m.params.type}] ${text}`);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      console.log(
        '[page exception]',
        m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text,
      );
      if (/trailer/i.test(m.params.exceptionDetails.exception?.description ?? '')) {
        failed = true;
        resolve('the page stopped');
      }
    }
    if (m.method !== 'Runtime.bindingCalled') return;
    const { name, payload } = m.params;
    if (name === '__shot') {
      const k = +payload;
      const { data } = await s('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
      fs.writeFileSync(path.join(outDir, `f${String(k).padStart(5, '0')}.jpg`), Buffer.from(data, 'base64'));
      frames++;
      if (frames % 30 === 0) console.log(`frame ${k} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
      await s('Runtime.evaluate', { expression: 'window.__ack && window.__ack()' });
    } else if (name === '__audio') {
      audioChunks.push(payload);
      await s('Runtime.evaluate', { expression: 'window.__audioAck && window.__audioAck()' });
    } else if (name === '__done') {
      if (/^error/.test(payload)) failed = true;
      resolve(payload);
    }
  });
});

const q = new URLSearchParams({ lang });
for (const [env, key] of [
  ['TFRAMES', 'tframes'],
  ['TFROM', 'tfrom'],
  ['TEVERY', 'tevery'],
  ['TSCENE', 'tscene'],
])
  if (process.env[env]) q.set(key, process.env[env]);
await s('Page.navigate', { url: `${BASE}games/${GAME}/?${q}#trailer${pass === 'music' ? '-music' : ''}` });
// (a page that never starts filming: the wrong address, a game without the trailer's hook, an error on load)
const watch = setInterval(() => {
  if (++quiet > 24)
    finish(
      `nothing from the page for 2 minutes: is the dev server at ${BASE} the one of this repository, and does games/${GAME} have #trailer?`,
    );
}, 5000);
const info = await finished;
clearInterval(watch);
if (!failed) {
  // the page sends the rendered sound as base64 of a 16-bit stereo WAV
  const wav = Buffer.from(audioChunks.join(''), 'base64');
  fs.writeFileSync(path.join(outDir, pass === 'music' ? 'music.wav' : 'sfx.wav'), wav);
  console.log(
    `done: ${frames} frames, ${(wav.length / 1024 / 1024).toFixed(1)} MB of sound, ${((Date.now() - started) / 1000).toFixed(0)} s. ${info}`,
  );
} else console.log(info);
ws.close();
await new Promise(r => {
  chrome.on('exit', r);
  chrome.kill();
});
try {
  fs.rmSync(userDir, { recursive: true, force: true });
} catch {
  // Chrome may still be letting go of files
}
process.exit(failed ? 1 : 0);
