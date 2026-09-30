import type { Enemy, WeaponItem } from '../data/types.ts';
import { $, clamp } from '../../../../engine/core/util.ts';
import { t } from '../../../../engine/core/i18n.ts';
import { clearWorld } from '../../../../engine/core/world.ts';
import { applySfxVolume, audioInit, setVolumes } from '../../../../engine/audio/audio.ts';
import { musicVolume, setMusic, setMusicMix } from '../../../../engine/audio/music.ts';
import { hasLOS } from '../../../../engine/world/tiles.ts';
import { joy, setFireHeld } from '../../../../engine/ui/input.ts';
import { BOSS_TUNE } from '../data/bosses.ts';
import { PER } from '../data/progress.ts';
import { save } from '../system/save.ts';
import { randomTileIn, rooms, startIdx } from '../world/level.ts';
import { boss, enemies, removeEnemyMesh, spawnEnemy } from '../world/entities.ts';
import { P, hurtEnemy, newWeapon, run } from '../actors/player.ts';
import { CTRL } from '../ui/input.ts';
import { changeLang } from '../ui/hud.ts';
import { goBase, openPerk, renderBase, show, showTab, startRun, startStage, state } from '../flow/game.ts';
// Dev only: the ~31 s trailer, driven one frame at a time by tools/trailer/capture.mjs (#trailer: the video with the
// game's sound effects, #trailer-music: the BGM track only). The page runs on a virtual clock set up by that script:
// each frame this sets the scene and the "player's" hands, then advances the clock by 1/30 s (the game runs and
// draws), then waits for the screenshot. Sound goes to an OfflineAudioContext that renders up to each frame and waits.
// Scenes: base screen -> a fight in a neon room (strafing, dashing, chain blasts) -> picking a rare chip -> buying
// upgrades at base -> the WATCHER boss (phase change, kill) -> title card.
const FPS = 30;
const w = window as any;
const SC = { base: 0, run: 3.2, chip: 13.2, up: 16.0, boss: 18.8, end: 27.6, total: 31.0 };

// ---- the scenes ----
const loadout: WeaponItem[] = [{ id: 'shotgun', r: 2, plus: 24, opts: ['rate'] }, { id: 'rail', r: 2, plus: 22, opts: ['pierce'] }];
// a practised player's build: the numbers a few depths of good chips give
function buff() {
  P.extra = 3; P.chain = 2; P.dmgMul = 2.6; P.fireRate = 1.6; P.crit = 0.25; P.spdMul = 1.35; P.magMul = 2; P.reloadMul = 0.6;
  P.weapons[0]!.mag = 99;
}
function clearEnemies() { enemies.slice().forEach(e => { e.dead = true; removeEnemyMesh(e); }); clearWorld('enemy'); }
function quietToast() { $('#toast').classList.remove('on'); }

function sceneBase() {
  Object.assign(save, { bits: 48210, best: 41, runs: 37, bossKills: 21, shortcut: 9, startTier: 9, peak: 9 });
  save.loadout = loadout.map(x => ({ ...x })) as any;
  save.stash = [{ id: 'smg', r: 2, plus: 21, opts: ['mag', 'reload'] }, { id: 'launcher', r: 1, plus: 18, opts: ['pierce'] }, { id: 'pistol', r: 2, plus: 16, opts: [] }] as any;
  save.up = { ...save.up, hp: 4, dmg: 3, spd: 2, dash: 2, gain: 3, stam: 2, kit: 1, chip: 0 };
  showTab('sortie'); renderBase();
}
let fightRoom = 0;
function sceneRun() {
  save.startTier = 0; save.up.chip = 0; save.settings.autofire = true; save.settings.assist = 'strong';
  startRun(); quietToast();
  run.route = [4]; run.stage = 5 * PER; startStage(); // D6, the neon walled city
  buff(); clearEnemies();
  // the biggest room other than the start: the fight happens there
  fightRoom = rooms.map((r, i) => ({ i, a: i === startIdx ? 0 : r.w * r.h })).sort((a, b) => b.a - a.a)[0]!.i;
  const r = rooms[fightRoom]!;
  P.x = (r.x + 1.5) * 4; P.z = (r.y + r.h / 2) * 4; P.yaw = -Math.PI / 2; P.pitch = 0; P.inv = 1;
  wave(['crawler', 'crawler', 'crawler', 'bomber', 'bomber', 'drone', 'drone', 'splitter']);
}
function wave(types: string[]) {
  const r = rooms[fightRoom]!;
  types.forEach(type => {
    let x = 0, z = 0;
    for (let k = 0; k < 30; k++) { [x, z] = randomTileIn(r); if (Math.hypot(x - P.x, z - P.z) > 9) break; }
    const e = spawnEnemy(type, x, z, fightRoom, 4); e.active = true;
  });
}
function sceneChip() {
  quietToast();
  // a pick with exactly one gold (rare) card
  for (let k = 0; k < 40; k++) { openPerk(t('perk.title')); if (document.querySelectorAll('#perkList .perk.rare').length === 1) break; }
}
function sceneUp() {
  goBase(); save.bits = 64880; showTab('up'); renderBase(); window.scrollTo(0, 0);
  document.querySelectorAll('.pane').forEach(p => { p.scrollTop = 0; });
}
function sceneBoss() {
  save.settings.autofire = true;
  startRun(); quietToast();
  run.route = [4]; run.stage = 2 * PER + PER - 1; run.forceBoss = 'watcher'; BOSS_TUNE.introTime = 1.0;
  startStage(); buff(); P.yaw = 0; P.pitch = 0.12;
}
function sceneEnd() {
  const o = document.createElement('div'); o.id = 'trailerEnd';
  o.style.cssText = 'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;align-content:center;gap:14px;text-align:center;opacity:0;'
    + 'background:radial-gradient(ellipse at 50% 45%,rgba(16,40,52,.92),rgba(5,8,12,.97) 65%)';
  o.innerHTML = `<div id="teLogo" style="font-family:var(--disp);font-weight:700;font-size:78px;letter-spacing:.5em;color:#d5e4ee;text-shadow:0 0 24px rgba(84,232,255,.35)">SECTOR<span style="color:#54e8ff">/</span>DIVE</div>
    <div id="teTag" style="font-size:24px;color:#d5e4ee;opacity:0">区画を潜り、戦利品を持ち帰れ。</div>
    <div id="teSub" style="font-size:15px;color:#7f94a6;letter-spacing:.08em;opacity:0">ローグライトFPS ／ ブラウザで無料プレイ・スマホ対応</div>
    <div id="teUrl" style="font-family:var(--disp);font-size:17px;color:#54e8ff;letter-spacing:.1em;margin-top:6px;opacity:0">beatdjam.github.io/mini-games</div>`;
  document.body.appendChild(o);
}

// ---- the player's hands, each frame ----
let target: Enemy | null = null;
const dashAt = [5.3, 7.6, 10.2, 12.1, 21.7, 23.0, 24.4, 25.6];
function nearest(): Enemy | null {
  let best: Enemy | null = null, bd = Infinity;
  for (const e of enemies) {
    if (e.dead || e.boss) continue;
    const d = Math.hypot(e.x - P.x, e.z - P.z);
    if (d < bd && d < 30 && hasLOS(P.x, P.z, e.x, e.z, P.fy + 1.6, e.mesh.position.y)) { best = e; bd = d; }
  }
  return best;
}
// turn smoothly toward a point, like a thumb on the right side of the screen
function aimAt(x: number, y: number, z: number, dt: number, rate: number) {
  const want = Math.atan2(-(x - P.x), -(z - P.z));
  const diff = Math.atan2(Math.sin(want - P.yaw), Math.cos(want - P.yaw));
  P.yaw += clamp(diff, -rate * dt, rate * dt) * Math.min(1, 0.35 + Math.abs(diff) * 2);
  const wantP = Math.atan2(y - (P.fy + 1.6), Math.hypot(x - P.x, z - P.z));
  P.pitch += (clamp(wantP, -0.5, 0.6) - P.pitch) * Math.min(1, dt * 8);
}
function hands(s: number, dt: number) {
  const inScene = (a: number, b: number) => s >= a && s < b;
  if (state === 'play' && P) { P.hp = P.maxHp; P.inv = Math.max(P.inv, 0.2); }
  dashAt.forEach(d => { if (s >= d && s - dt < d && state === 'play') CTRL.dashReq = true; });
  if (inScene(SC.run, SC.chip) && state === 'play') {
    if (!target || target.dead) target = nearest();
    if (target) aimAt(target.x, target.mesh.position.y, target.z, dt, 5.5);
    const k = s - SC.run;
    joy.x = Math.sin(k * 1.7) * 0.85; joy.y = k < 6 ? -0.25 : 0.1;
    if (k > 4.6 && k - dt <= 4.6) wave(['crawler', 'crawler', 'bomber', 'bomber', 'bomber', 'splitter', 'drone']);
    setFireHeld(false);
  } else if (inScene(SC.boss, SC.end) && state === 'play' && P) {
    const b = boss;
    if (b && !b.dead) {
      aimAt(b.x, b.mesh.position.y, b.z, dt, 4);
      const d = Math.hypot(b.x - P.x, b.z - P.z);
      joy.x = 0.9; joy.y = clamp((11 - d) * 0.15, -0.6, 0.6);
      setFireHeld(!b.spawnT || b.spawnT <= 0);
      bossHp(b, s);
    } else { joy.x = 0; joy.y = 0; setFireHeld(false); P.yaw += dt * 0.15; }
  } else { joy.x = 0; joy.y = 0; setFireHeld(false); }
}
// the boss's health follows the script (the phase change at about half, the kill on time); the shots still land
function bossHp(b: Enemy, s: number) {
  if (b.spawnT > 0) return;
  const lin = (a: number, bb: number, x: number, y: number) => x + (y - x) * clamp((s - a) / (bb - a), 0, 1);
  if (s < 23.6) b.hp = b.maxHp * lin(20.9, 23.6, 1, 0.52);
  else if (!b.phased) hurtEnemy(b, b.hp - b.maxHp * 0.49, false);
  else if (s < 26.4) b.hp = b.maxHp * lin(24.9, 26.4, 0.49, 0.03);
  else hurtEnemy(b, b.hp + 1, false);
}

// ---- the frame loop ----
const sceneAt: [number, () => void][] = [[SC.base, sceneBase], [SC.run, sceneRun], [SC.chip, sceneChip], [SC.up, sceneUp], [SC.boss, sceneBoss], [SC.end, sceneEnd]];
function uiScript(s: number, dt: number) {
  // chip scene: the rare card lights up, then gets picked
  const rare = document.querySelector<HTMLElement>('#perkList .perk.rare');
  if (rare && state === 'perk' && s >= 14.8) { rare.style.transform = 'scale(1.05)'; rare.style.boxShadow = '0 0 28px rgba(255,194,74,.6)'; }
  if (rare && state === 'perk' && s >= 15.5) { rare.click(); show(null); }
  // upgrades: buy a few
  [[16.9, 'dmg'], [17.5, 'hp'], [18.1, 'dmg']].forEach(([at, id]) => {
    if (s >= (at as number) && s - dt < (at as number)) document.querySelector<HTMLElement>(`[data-up="${id}"]`)?.click();
  });
  // title card: fades in, the logo closes up, then the lines
  const o = document.getElementById('trailerEnd');
  if (o) {
    const k = s - SC.end, ease = (x: number) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
    o.style.opacity = String(ease(k / 0.5));
    $('#teLogo').style.letterSpacing = `${0.5 - 0.32 * ease(k / 1.1)}em`;
    $('#teTag').style.opacity = String(ease((k - 0.7) / 0.5));
    $('#teSub').style.opacity = String(ease((k - 1.1) / 0.5));
    $('#teUrl').style.opacity = String(ease((k - 1.4) / 0.5));
  }
}
function musicScript(s: number, dt: number) {
  if (s === 0) setMusic('BASE');
  if (s >= SC.run && s - dt < SC.run) { setMusic('KWLN', true); setMusicMix('boss'); }
}

// frames to render: the whole trailer, or ?tframes=N for a quick look
export async function runTrailer(musicOnly: boolean) {
  changeLang('ja');
  audioInit();
  setVolumes(musicOnly ? 0 : 1, musicOnly ? 1 : 0); applySfxVolume(); musicVolume();
  const off: OfflineAudioContext = w.__off;
  const limit = +(new URLSearchParams(location.search).get('tframes') || 0);
  const N = limit || Math.round(SC.total * FPS), dt = 1 / FPS;
  const frame = async (k: number) => {
    const s = k * dt;
    if (musicOnly) musicScript(s, dt);
    else {
      sceneAt.forEach(([at, fn]) => { if (s >= at && s - dt < at) fn(); });
      if (k === 0) sceneBase();
      hands(s, dt); uiScript(s, dt);
    }
    w.__advance(1000 * dt);
    if (!musicOnly) await new Promise<void>(r => { w.__ack = r; w.__shot(String(k)); });
  };
  for (let k = 1; k < N; k++) off.suspend(k * dt).then(async () => { await frame(k); off.resume(); });
  await frame(0);
  console.log('TRAILER rendering', N, 'frames', musicOnly ? '(music)' : '(video)');
  const buf = await off.startRendering();
  // hand the sound back as a 16-bit stereo WAV, base64, in pieces
  const len = Math.min(buf.length, Math.ceil(N * dt * buf.sampleRate) + buf.sampleRate), ch = [buf.getChannelData(0), buf.getChannelData(1)];
  const bytes = new Uint8Array(44 + len * 4), v = new DataView(bytes.buffer);
  const str = (o: number, x: string) => { for (let i = 0; i < x.length; i++) bytes[o + i] = x.charCodeAt(i); };
  str(0, 'RIFF'); v.setUint32(4, 36 + len * 4, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, buf.sampleRate, true); v.setUint32(28, buf.sampleRate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, len * 4, true);
  for (let i = 0; i < len; i++) for (let c = 0; c < 2; c++) v.setInt16(44 + i * 4 + c * 2, clamp(ch[c]![i]!, -1, 1) * 32767, true);
  const piece = 3 * 256 * 1024;
  for (let o = 0; o < bytes.length; o += piece) {
    let bin = ''; const part = bytes.subarray(o, o + piece);
    for (let i = 0; i < part.length; i += 0x8000) bin += String.fromCharCode(...part.subarray(i, i + 0x8000));
    await new Promise<void>(r => { w.__audioAck = r; w.__audio(btoa(bin)); });
  }
  w.__done(`${N} frames`);
}
