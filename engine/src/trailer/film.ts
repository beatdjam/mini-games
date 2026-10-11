import { clamp } from '../core/util.ts';
import { applySfxVolume, audioInit, setVolumes } from '../audio/audio.ts';
import { musicVolume } from '../audio/music.ts';
import { END_KEYS, parseScript } from './script.ts';
import type { Script, ScriptScene } from './script.ts';
// engine: films a trailer from its script (script.ts), one frame at a time, driven by tools/trailer/capture.mjs: the
// page runs on a virtual clock set up by that script, which also hands the page the script (window.__trailerScript).
// Each frame this starts the scene whose time it is, lets the game move the "player's" hands (TrailerGame), lays the
// caption, the flash or fade between scenes and the title card over the picture, then advances the clock by a frame
// (the game runs and draws) and waits for the screenshot. The sound is rendered alongside into an OfflineAudioContext
// and handed back as a WAV at the end. Dev only: a game loads it from its dev hooks (#trailer, #trailer-music)
export const FPS = 30;
// what a game gives the film: the words of its scenes and settings, and what they do
export interface TrailerGame {
  // what is wrong with the script in the game's words ("line N: ..."): unknown settings, places, actions
  check(script: Script): string[];
  // once, before the first frame (the settings; the page's own notices out of the way)
  begin(script: Script, musicOnly: boolean): void;
  // the first frame of a scene (not the title card): where it is, what stands there
  scene(scene: ScriptScene, n: number): void;
  // every frame of a scene, `t` seconds into it: the player's hands
  frame(scene: ScriptScene, t: number, dt: number): void;
  // every frame, after the film's own layers (s: seconds from the start): what the page's own animations would do
  // on the real clock
  paint?(s: number): void;
  // the first frame of the music pass: the music to play
  music(script: Script): void;
  // the title card's title as HTML (the plain text otherwise)
  title?(text: string): string;
  // the title card's background (CSS)
  cardBackground?: string;
}
interface FilmWindow {
  __trailerScript?: string;
  __audioSeconds: number;
  __off: OfflineAudioContext;
  __advance(ms: number): void;
  __shot(k: string): void;
  __audio(b64: string): void;
  __done(info: string): void;
  __ack?: () => void;
  __audioAck?: () => void;
}
const ease = (x: number) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const FLASH_IN = 0.08; // a flash comes up this fast before the cut (s)
const CAPTION_IN = [0.15, 0.4]; // a caption starts coming in this long after its scene starts, and takes this long
const CAPTION_OUT = 0.3; // and goes out this long before the next caption or the title card
const CARD_LINES: Record<string, number> = { line: 0.7, sub: 1.1, url: 1.4 }; // when the card's lines come in (s)
const CARD_CLOSE = 1.1; // the title's letters close up over this long (s)

function layer(id: string, css: string): HTMLDivElement {
  const d = document.createElement('div');
  d.id = id;
  d.style.cssText = css;
  document.body.appendChild(d);
  return d;
}
// how covered the picture is at `s` by the flashes and fades into the scenes, and with which colour
function veilAt(script: Script, s: number): [number, string] {
  let most = 0,
    colour = '#000';
  for (const sc of script.scenes) {
    const { kind, secs } = sc.enter,
      f = s - sc.start;
    let v = 0;
    if (kind === 'flash') v = f < -FLASH_IN || f > secs ? 0 : f < 0 ? (f + FLASH_IN) / FLASH_IN : 1 - ease(f / secs);
    else if (kind === 'fade') v = f < -secs || f > secs ? 0 : f < 0 ? (f + secs) / secs : 1 - f / secs;
    if (v > most) {
      most = v;
      colour = kind === 'flash' ? '#fff6e0' : '#000';
    }
  }
  return [most, colour];
}
// the caption on screen at `s`, and how much of it shows
function captionAt(script: Script, s: number): [string, number] {
  const n = script.scenes.findIndex(x => s < x.start + x.secs),
    sc = script.scenes[n];
  if (!sc || sc.end || !sc.caption) return ['', 0];
  // from the scene that brought it in, to the next scene that does not keep it
  let from = n;
  while (from > 0 && script.scenes[from]!.keep) from--;
  let until = n + 1;
  while (until < script.scenes.length && script.scenes[until]!.keep) until++;
  const t0 = script.scenes[from]!.start,
    t1 = script.scenes[until]?.start ?? script.total;
  return [sc.caption, Math.min(ease((s - t0 - CAPTION_IN[0]!) / CAPTION_IN[1]!), ease((t1 - s) / CAPTION_OUT))];
}
// the title card, put up when its part starts
function card(game: TrailerGame, sc: ScriptScene): HTMLDivElement {
  const o = layer(
      'trailerEnd',
      'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;align-content:center;gap:14px;text-align:center;' +
        `background:${game.cardBackground ?? 'radial-gradient(ellipse at 50% 45%,rgba(30,34,40,.94),rgba(5,8,12,.97) 65%)'}`,
    ),
    put = (key: string, css: string) => {
      const text = sc.lines.find(l => l.key === key)?.text;
      if (text === undefined) return;
      const d = document.createElement('div');
      d.className = `te-${key}`;
      d.style.cssText = css;
      if (key === 'title') d.innerHTML = game.title?.(text) ?? '';
      if (key !== 'title' || !game.title) d.textContent = text;
      o.appendChild(d);
    };
  put(
    'title',
    'font-family:var(--disp,sans-serif);font-weight:700;font-size:74px;letter-spacing:.5em;color:#d5e4ee;text-shadow:0 0 24px rgba(255,194,74,.35)',
  );
  put('line', 'font-size:24px;color:#d5e4ee;opacity:0');
  put('sub', 'font-size:15px;color:#7f94a6;letter-spacing:.08em;opacity:0');
  put(
    'url',
    'font-family:var(--disp,sans-serif);font-size:17px;color:#ffc24a;letter-spacing:.1em;margin-top:6px;opacity:0',
  );
  return o;
}
function paintCard(o: HTMLElement, e: number) {
  const title = o.querySelector<HTMLElement>('.te-title');
  if (title) title.style.letterSpacing = `${0.5 - 0.34 * ease(e / CARD_CLOSE)}em`;
  for (const key of END_KEYS) {
    const d = o.querySelector<HTMLElement>(`.te-${key}`);
    if (d && key in CARD_LINES) d.style.opacity = String(ease((e - CARD_LINES[key]!) / 0.5));
  }
}
// the frames to film: all, or ?tframes=N (the first N), ?tfrom=K (screenshots from frame K), ?tevery=M (every Mth),
// ?tscene=N (only the Nth part, from 1)
function frameRange(script: Script, firstFrames: number[]): { count: number; from: number; every: number } {
  const q = new URLSearchParams(location.search),
    n = +(q.get('tscene') || 0),
    all = Math.round(script.total * FPS);
  if (n >= 1 && n <= script.scenes.length)
    return { count: firstFrames[n] ?? all, from: firstFrames[n - 1]!, every: +(q.get('tevery') || 1) };
  return { count: +(q.get('tframes') || 0) || all, from: +(q.get('tfrom') || 0), every: +(q.get('tevery') || 1) };
}

export async function runTrailer(game: TrailerGame, musicOnly: boolean) {
  const w = window as unknown as FilmWindow,
    { script, errors } = parseScript(w.__trailerScript ?? '');
  if (!w.__trailerScript) errors.unshift('no script (tools/trailer/capture.mjs hands the page one)');
  else if (!errors.length) errors.push(...game.check(script));
  if (errors.length) {
    errors.forEach(e => console.error(`TRAILER error ${e}`));
    w.__done(`error: ${errors.length} problem(s) in the script`);
    return;
  }
  w.__audioSeconds = script.total + 1; // (the sound's context is made on first use: audioInit)
  game.begin(script, musicOnly);
  const cap = layer(
      'trailerCap',
      'position:fixed;z-index:9000;left:50%;top:62px;transform:translateX(-50%);padding:6px 18px;white-space:nowrap;opacity:0;' +
        'font-size:22px;letter-spacing:.08em;color:#fff3d6;background:rgba(5,8,12,.72);border-left:3px solid #ffc24a',
    ),
    veil = layer('trailerVeil', 'position:fixed;inset:0;z-index:10000;pointer-events:none;opacity:0');
  audioInit();
  setVolumes(musicOnly ? 0 : 1, musicOnly ? 1 : 0);
  applySfxVolume();
  musicVolume();
  const off = w.__off,
    dt = 1 / FPS,
    firstFrames = script.scenes.map(sc => Math.round(sc.start * FPS)),
    { count, from, every } = frameRange(script, firstFrames);
  let shot = 0,
    end: HTMLDivElement | null = null;
  const frame = async (k: number) => {
    const s = k * dt;
    if (musicOnly) {
      if (k === 0) game.music(script);
    } else {
      let n = 0;
      firstFrames.forEach((f, i) => {
        if (f <= k) n = i;
      });
      const sc = script.scenes[n]!;
      if (k === firstFrames[n]) {
        if (sc.end) end = card(game, sc);
        else game.scene(sc, n);
      }
      if (!sc.end) game.frame(sc, s - sc.start, dt);
      const [text, shown] = captionAt(script, s),
        [v, colour] = veilAt(script, s);
      cap.textContent = text;
      cap.style.opacity = String(shown);
      veil.style.background = colour;
      veil.style.opacity = String(v);
      if (end) paintCard(end, s - sc.start);
      game.paint?.(s);
    }
    w.__advance(1000 * dt);
    if (!musicOnly && k >= from && (k - from) % every === 0) {
      shot++;
      await new Promise<void>(r => {
        w.__ack = r;
        w.__shot(String(k));
      });
    }
  };
  for (let k = 1; k < count; k++)
    off.suspend(k * dt).then(async () => {
      await frame(k);
      off.resume();
    });
  await frame(0);
  console.log('TRAILER rendering', count, 'frames', musicOnly ? '(music)' : '(video)');
  const buf = await off.startRendering();
  await handBack(w, buf, count * dt);
  w.__done(`${count} frames, ${shot} shot`);
}
// the sound, as a 16-bit stereo WAV in base64, in pieces
async function handBack(w: FilmWindow, buf: AudioBuffer, secs: number) {
  const len = Math.min(buf.length, Math.ceil(secs * buf.sampleRate) + buf.sampleRate),
    ch = [buf.getChannelData(0), buf.getChannelData(1)],
    bytes = new Uint8Array(44 + len * 4),
    v = new DataView(bytes.buffer),
    str = (o: number, x: string) => {
      for (let i = 0; i < x.length; i++) bytes[o + i] = x.charCodeAt(i);
    };
  str(0, 'RIFF');
  v.setUint32(4, 36 + len * 4, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, buf.sampleRate, true);
  v.setUint32(28, buf.sampleRate * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, len * 4, true);
  for (let i = 0; i < len; i++)
    for (let c = 0; c < 2; c++) v.setInt16(44 + i * 4 + c * 2, clamp(ch[c]![i]!, -1, 1) * 32767, true);
  const piece = 3 * 256 * 1024;
  for (let o = 0; o < bytes.length; o += piece) {
    let bin = '';
    const part = bytes.subarray(o, o + piece);
    for (let i = 0; i < part.length; i += 0x8000) bin += String.fromCharCode(...part.subarray(i, i + 0x8000));
    await new Promise<void>(r => {
      w.__audioAck = r;
      w.__audio(btoa(bin));
    });
  }
}
