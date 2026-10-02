import type { Enemy, WeaponItem } from '../data/types.ts';
import type * as THREE from 'three';
import { $, clamp } from '../../../../engine/core/util.ts';
import { t } from '../../../../engine/core/i18n.ts';
import { actx, applySfxVolume, audioInit, master, setVolumes, sfxVolume } from '../../../../engine/audio/audio.ts';
import { runSystems } from '../../../../engine/core/loop.ts';
import { musicVolume, setMusic, setMusicMix } from '../../../../engine/audio/music.ts';
import { hasLOS } from '../../../../engine/world/tiles.ts';
import { joy, setFireHeld } from '../../../../engine/ui/input.ts';
import { BOSS_TUNE } from '../data/bosses.ts';
import { PER } from '../data/progress.ts';
import { save } from '../system/save.ts';
import { rooms, startIdx } from '../world/level.ts';
import { boss, enemies } from '../world/entities.ts';
import { P, run } from '../actors/player.ts';
import { CTRL } from '../ui/input.ts';
import { changeLang } from '../ui/hud.ts';
import { goBase, openPerk, renderBase, show, showTab, startRun, startStage, state } from '../flow/game.ts';
// Dev only: the ~31 s trailer, driven one frame at a time by tools/trailer/capture.mjs (#trailer: the video with the
// game's sound effects, #trailer-music: the BGM track only). The page runs on a virtual clock set up by that script:
// each frame this sets the scene and the "player's" hands, then advances the clock by 1/30 s (the game runs and
// draws), then waits for the screenshot. Sound goes to an OfflineAudioContext that renders up to each frame and waits.
// Scenes: base screen -> fights in two areas (a cut between them; only the enemies the game placed; strafing, dashing,
// chain blasts) -> picking a rare chip -> buying upgrades at base -> three boss fights cut together (WATCHER's entrance,
// CRUSHER mid-fight, TRINITY's last moments and the kill; nobody's health is touched: a clip that starts mid-fight
// really plays the fight up to there, off camera) -> a flash into the title card.
const FPS = 30;
const w = window as any;
const SC = { base: 0, run: 3.2, run2: 8.4, chip: 13.2, up: 16.0, boss: 18.8, boss2: 21.4, boss3: 24.5, end: 27.6, total: 31.0 };
// the last clip cuts in once the fight has brought TRINITY this low, so that the kill lands about a second before the
// title card (measured with ?tboss=1, which logs the boss's health each half second)
const KILL_FROM = 0.08;

// ---- the scenes ----
const loadout: WeaponItem[] = [{ id: 'shotgun', r: 2, plus: 24, opts: ['rate'] }, { id: 'rail', r: 2, plus: 22, opts: ['pierce'] }];
// a practised player's build: the numbers a few depths of good chips give
function buff() {
  P.extra = 3; P.chain = 2; P.dmgMul = 2.6; P.fireRate = 1.6; P.crit = 0.25; P.spdMul = 1.35; P.magMul = 2.5; P.reloadMul = 0.5;
  P.weapons[0]!.mag = 19;
}
function quietToast() { $('#toast').classList.remove('on'); }

function sceneBase() {
  Object.assign(save, { bits: 48210, best: 41, runs: 37, bossKills: 21, shortcut: 9, startTier: 9, peak: 9 });
  save.loadout = loadout.map(x => ({ ...x })) as any;
  save.stash = [{ id: 'smg', r: 2, plus: 21, opts: ['mag', 'reload'] }, { id: 'launcher', r: 1, plus: 18, opts: ['pierce'] }, { id: 'pistol', r: 2, plus: 16, opts: [] }] as any;
  save.up = { ...save.up, hp: 4, dmg: 3, spd: 2, dash: 2, gain: 3, stam: 2, kit: 1, chip: 0 };
  showTab('sortie'); renderBase();
}
let fightRoom = 0;
// Only the enemies the game itself put in the area (no extra spawns): the player steps into the room with the most
// of them, at one end, looking down its long side, and they notice (shooting one wakes the whole room anyway)
function enterFight(route: number, stage: number) {
  run.route = [route]; run.stage = stage; startStage(); buff();
  const count = (i: number) => enemies.filter(e => e.room === i && !e.dead).length;
  fightRoom = rooms.map((r, i) => ({ i, n: i === startIdx ? -1 : count(i) * 10 + r.w * r.h / 10 })).sort((a, b) => b.n - a.n)[0]!.i;
  const r = rooms[fightRoom]!, long = r.w >= r.h;
  P.x = (long ? r.x + 0.6 : r.x + r.w / 2) * 4; P.z = (long ? r.y + r.h / 2 : r.y + 0.6) * 4;
  P.yaw = long ? -Math.PI / 2 : Math.PI; P.pitch = 0; P.inv = 1;
  enemies.forEach(e => { if (e.room === fightRoom) e.active = true; });
  target = null;
}
function sceneRun() {
  save.startTier = 0; save.up.chip = 0; save.settings.autofire = true; save.settings.assist = 'strong';
  startRun(); quietToast();
  enterFight(4, 5 * PER); // D6 1/3, the neon walled city
}
// a cut to another area (an edit, not something the game does): D6 2/3 in the smelter
function sceneRun2() { quietToast(); enterFight(1, 5 * PER + 1); }
function sceneChip() {
  quietToast();
  // a pick with exactly one gold (rare) card
  for (let k = 0; k < 40; k++) { openPerk(t('perk.title')); if (document.querySelectorAll('#perkList .perk.rare').length === 1) break; }
}
function sceneUp() {
  save.suspend = null; // the fight's checkpoint would show as a RESUME bar
  goBase(); save.bits = 64880; showTab('up'); renderBase();
  document.querySelector('[data-up]')?.closest('.sec')?.scrollIntoView(); // the upgrade list at the top of the screen
}
// a boss arena at depth D<tier+1> (the fights are cuts: each clip starts its own stage)
function enterBoss(route: number, kind: string, tier = 2) {
  run.route = [route]; run.stage = tier * PER + PER - 1; run.forceBoss = kind; BOSS_TUNE.introTime = 1.0;
  startStage(); buff(); P.yaw = 0; P.pitch = 0.12; quietToast();
}
// play the fight on without filming it (no drawing, sound muted) until done() or maxS seconds; a cut that starts
// mid-fight. The sounds of that stretch all start at the same instant, so the effects fade back in after the cut
function offCamera(s: number, done: () => boolean, maxS: number) {
  const dt = 1 / FPS;
  if (master) master.gain.value = 0;
  filming.off = true;
  for (let i = 0; i < maxS * FPS && !done(); i++) { hands(s, dt); w.__tick(1000 * dt); runSystems(dt); }
  filming.off = false;
  if (master && actx) {
    const g = master.gain, now = actx.currentTime;
    g.cancelScheduledValues(now); g.setValueAtTime(0, now); g.linearRampToValueAtTime(0.32 * sfxVolume, now + 0.6);
  }
  if (bossLog) console.log('TRAILER off camera', boss ? (boss.hp / boss.maxHp).toFixed(3) : 'no boss');
}
const bossUp = () => !!boss && !boss.dead && !(boss.spawnT > 0);
function sceneBoss() {
  save.settings.autofire = true;
  save.loadout = loadout.map(x => ({ ...x })) as any; // the first run took them out of the base
  startRun();
  enterBoss(4, 'watcher'); // its entrance, in the walled city
}
function sceneBoss2() {
  enterBoss(1, 'crusher', 4); // in the smelter, a few seconds into the fight (D5: it must still be up when the clip ends)
  offCamera(SC.boss2, () => bossUp() && boss!.hp < boss!.maxHp * 0.8, 40);
}
function sceneBoss3() {
  enterBoss(4, 'trinity', 8); // TRINITY's last moments (a deeper, tougher one, so the end takes a moment)
  // (cut in with a loaded gun, not in the middle of a reload)
  offCamera(SC.boss3, () => bossUp() && boss!.hp < boss!.maxHp * KILL_FROM && P.reloadT <= 0 && P.weapons[P.cur]!.mag >= 10, 90);
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
  const f = document.createElement('div'); f.id = 'teFlash'; // the cut from the kill to the card
  f.style.cssText = 'position:fixed;inset:0;z-index:10000;pointer-events:none;background:#e8fbff;opacity:0';
  document.body.appendChild(f);
}

// ---- the player's hands, each frame ----
let target: Enemy | null = null;
// a fight scene with nothing left in sight to shoot
const inSight = (e: Enemy) => !e.dead && !e.boss && Math.hypot(e.x - P.x, e.z - P.z) < 30 && hasLOS(P.x, P.z, e.x, e.z, P.fy + 1.6, e.mesh.position.y);
function fightCleared(s: number) {
  return s >= SC.run && s < SC.chip && state === 'play' && !enemies.some(inSight);
}
const dashAt = [5.3, 7.6, 10.2, 12.1, 21.7, 23.0, 24.9, 25.6];
// the next target: the enemy closest to the crosshair (a little weight on distance), in sight and in front; one that
// runs round behind is let go rather than chased (turning on the spot after crawlers looks clumsy)
const FRONT = 1.1;
function nearest(): Enemy | null {
  let best: Enemy | null = null, bd = Infinity;
  for (const e of enemies) {
    if (!inSight(e) || offAim(e.x, e.z) > FRONT) continue;
    const score = offAim(e.x, e.z) + Math.hypot(e.x - P.x, e.z - P.z) * 0.02;
    if (score < bd) { best = e; bd = score; }
  }
  return best;
}
function offAim(x: number, z: number) { const want = Math.atan2(-(x - P.x), -(z - P.z)); return Math.abs(Math.atan2(Math.sin(want - P.yaw), Math.cos(want - P.yaw))); }
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
  dashAt.forEach(d => { if (Math.round(s * FPS) === Math.round(d * FPS) && state === 'play') CTRL.dashReq = true; });
  if (inScene(SC.run, SC.chip) && state === 'play') {
    if (!target || target.dead || offAim(target.x, target.z) > FRONT + 0.4) target = nearest();
    const r = rooms[fightRoom]!;
    if (target) aimAt(target.x, target.mesh.position.y, target.z, dt, 9);
    else {
      // nothing in front: turn calmly toward whatever is left in sight, else face the room, not a wall
      const left = enemies.filter(inSight).sort((u, v) => offAim(u.x, u.z) - offAim(v.x, v.z))[0];
      if (left) aimAt(left.x, left.mesh.position.y, left.z, dt, 3);
      else aimAt((r.x + r.w / 2) * 4, 1, (r.y + r.h / 2) * 4, dt, 3);
    }
    const k = s - SC.run;
    joy.x = Math.sin(k * 1.4) * 0.9; joy.y = Math.sin(k * 0.8) * 0.3; // strafe, a step in and a step back
    setFireHeld(!!target && offAim(target.x, target.z) < 0.25);
  } else if (inScene(SC.boss, SC.end) && state === 'play' && P) {
    const b = boss;
    if (b && !b.dead) {
      // TRINITY's bodies orbit the middle of the arena: aim at the one nearest the crosshair and keep further out
      const bodies: THREE.Object3D[] | undefined = b.bodies;
      const at = bodies ? bodies.map(o => o.position).sort((u, v) => offAim(u.x, u.z) - offAim(v.x, v.z))[0]! : { x: b.x, y: b.mesh.position.y, z: b.z };
      aimAt(at.x, at.y, at.z, dt, 6);
      const d = Math.hypot(b.x - P.x, b.z - P.z);
      joy.x = 0.9; joy.y = clamp(((bodies ? 10 : 8.5) - d) * 0.15, -0.6, 0.6);
      setFireHeld(!b.spawnT || b.spawnT <= 0);
      if (bossLog && !filming.off && Math.round(s * FPS) % 15 === 0) console.log('TRAILER boss', s.toFixed(1), (b.hp / b.maxHp).toFixed(3), b.phased ? 'phased' : '');
    } else { joy.x = 0; joy.y = 0; setFireHeld(false); } // no boss: hold still (no idle camera drift)
  } else { joy.x = 0; joy.y = 0; setFireHeld(false); }
}
let bossLog = false;
const filming = { off: false };

// ---- the frame loop ----
const sceneAt: [number, () => void][] = [[SC.base, sceneBase], [SC.run, sceneRun], [SC.run2, sceneRun2], [SC.chip, sceneChip], [SC.up, sceneUp], [SC.boss, sceneBoss], [SC.boss2, sceneBoss2], [SC.boss3, sceneBoss3], [SC.end, sceneEnd]];
function uiScript(s: number, dt: number) {
  // chip scene: the rare card lights up, then gets picked
  const rare = document.querySelector<HTMLElement>('#perkList .perk.rare');
  if (rare && state === 'perk' && s >= 14.8) { rare.style.transform = 'scale(1.05)'; rare.style.boxShadow = '0 0 28px rgba(255,194,74,.6)'; }
  if (rare && state === 'perk' && s >= 15.5) { rare.click(); show(null); }
  // upgrades: buy a few
  [[16.9, 'dmg'], [17.5, 'hp'], [18.1, 'dmg']].forEach(([at, id]) => {
    if (Math.round(s * FPS) === Math.round((at as number) * FPS)) document.querySelector<HTMLElement>(`[data-up="${id}"]`)?.click();
  });
  // title card: a flash, the card under it, the logo closes up, then the lines
  const o = document.getElementById('trailerEnd');
  if (o) {
    const k = s - SC.end, ease = (x: number) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
    $('#teFlash').style.opacity = String(k < 0.1 ? 0.9 * k / 0.1 : 0.9 * (1 - ease((k - 0.1) / 0.6)));
    o.style.opacity = k < 0.1 ? '0' : '1';
    $('#teLogo').style.letterSpacing = `${0.5 - 0.32 * ease(k / 1.1)}em`;
    $('#teTag').style.opacity = String(ease((k - 0.7) / 0.5));
    $('#teSub').style.opacity = String(ease((k - 1.1) / 0.5));
    $('#teUrl').style.opacity = String(ease((k - 1.4) / 0.5));
  }
}
function musicScript(s: number, dt: number) {
  if (s === 0) setMusic('BASE');
  if (Math.round(s * FPS) === Math.round(SC.run * FPS)) { setMusic('KWLN', true); setMusicMix('boss'); }
}

// frames to render: the whole trailer, or ?tframes=N (?tfrom=K: screenshots from frame K only, ?tevery=M: every Mth) for a quick look
export async function runTrailer(musicOnly: boolean) {
  changeLang('ja');
  $('#toast').style.display = 'none'; // hints and notices would cover the top of the picture
  audioInit();
  setVolumes(musicOnly ? 0 : 1, musicOnly ? 1 : 0); applySfxVolume(); musicVolume();
  const off: OfflineAudioContext = w.__off;
  const q = new URLSearchParams(location.search); bossLog = q.has('tboss');
  const limit = +(q.get('tframes') || 0), from = +(q.get('tfrom') || 0), every = +(q.get('tevery') || 1);
  const N = limit || Math.round(SC.total * FPS), dt = 1 / FPS;
  // the script's clock runs ahead of the film's when a fight's room is cleared early: the next scene comes at once
  // (the video comes out that much shorter; the BGM pass has no cuts and is trimmed to the video's length)
  let ahead = 0, clearK = -1, shot = 0;
  const frame = async (k: number) => {
    let sk = k + ahead;
    if (!musicOnly && fightCleared(sk * dt)) {
      if (clearK < 0) clearK = sk;
      else if (sk - clearK >= Math.round(0.3 * FPS)) { // a beat on the last kill, then the cut
        ahead += Math.round((sk * dt < SC.run2 ? SC.run2 : SC.chip) * FPS) - sk; sk = k + ahead; clearK = -1;
        console.log(`TRAILER room cleared: cut at frame ${k}, ${ahead} frames ahead`);
      }
    } else clearK = -1;
    if (sk >= N) return; // the film has ended
    const s = sk * dt;
    if (musicOnly) musicScript(s, dt);
    else {
      sceneAt.forEach(([at, fn]) => { if (sk === Math.round(at * FPS)) fn(); }); // by frame number: s - dt < at can hold on two frames
      if (sk === 0) sceneBase();
      hands(s, dt); uiScript(s, dt);
    }
    w.__advance(1000 * dt);
    if (!musicOnly && k >= from && (k - from) % every === 0) { shot++; await new Promise<void>(r => { w.__ack = r; w.__shot(String(k)); }); }
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
  w.__done(`${N - ahead} frames (${ahead} cut after cleared rooms), ${shot} shot`);
}
