import type { Enemy, WeaponItem } from '../data/types.ts';
import { clamp, el } from '@engine/core/util.ts';
import { applySfxVolume, audioInit, setVolumes } from '@engine/audio/audio.ts';
import { musicVolume, setMusic, setMusicMix } from '@engine/audio/music.ts';
import { T, W, activeTileGrid, floorY, grid, hasLOS } from '@engine/world/tiles.ts';
import { lockDoor } from '@engine/world/doors.ts';
import { joy, setFireHeld } from '@engine/ui/input.ts';
import { BIOMES } from '../data/biomes.ts';
import { BOSS_TUNE } from '../data/bosses.ts';
import { ENEMY_TUNE } from '../data/enemies.ts';
import { save } from '../core/save.ts';
import { building, makeBuilding, roomDoors } from '../world/building.ts';
import type { BuildingLink } from '../world/building.ts';
import { devSeed, level } from '../world/level.ts';
import { boss, enemies, spawnEnemy } from '../world/entities.ts';
import { devPlainLooks } from '../world/looks.ts';
import { useSparkLooks } from '../world/sparkLooks.ts';
import { devPlainGuns } from '../actors/viewmodel.ts';
import { player, run } from '../actors/player.ts';
import { controlState } from '../ui/input.ts';
import { cycleMap } from '../ui/hud.ts';
import { turnMap3D } from '../ui/map3d.ts';
import { changeLang } from '../ui/settings.ts';
import { ridingY } from '../flow/events.ts';
import { startRun, startStage } from '../flow/run.ts';
import { state } from '../flow/state.ts';
// Dev only: the ~27 s trailer of what Sector Dive Extended adds, driven one frame at a time by
// tools/trailer/capture.mjs (#trailer: the video with the game's sound effects, #trailer-music: the BGM track only).
// The page runs on a virtual clock set up by that script: each frame this sets the scene and the "player's" hands,
// then advances the clock by 1/30 s (the game runs and draws), then waits for the screenshot.
// Scenes (cuts between them; each puts the player where the scene starts): running down a stairwell onto the floor
// below -> a lift that passes a floor -> the 3D map of the building turning -> a lockdown (the room shuts, waves) ->
// the boss door opens, the boss room, the boss arrives -> a flash into the title card.
const FPS = 30;
interface TrailerWindow {
  __off: OfflineAudioContext;
  __advance(ms: number): void;
  __shot(k: string): void;
  __audio(b64: string): void;
  __done(info: string): void;
  __ack?: () => void;
  __audioAck?: () => void;
}
const w = window as unknown as TrailerWindow;
// old: the plain looks (what Sector Dive looks like); fresh: the same room and enemies with the looks; sec1-3: a
// second each in three more sectors; then what the building adds
const LEAD = 8.2; // the seconds the looks take before the scenes of the building
const SC = {
  old: 0,
  fresh: 2.3,
  sec1: 5.2,
  sec2: 6.2,
  sec3: 7.2,
  stairs: LEAD,
  lift: LEAD + 3.4,
  map: LEAD + 9.6,
  lock: LEAD + 12.6,
  boss: LEAD + 17.8,
  end: LEAD + 23.8,
  total: LEAD + 27.0,
};
const SHOW_SEED = 7; // the building the looks are shown in
const TOUR = ['FORGE', 'DATA', 'CITY']; // the sectors of sec1-3
const SECTOR = 4; // the neon walled city
const BOSS = 'watcher';
const CAPS: [number, string][] = [
  [SC.old, 'これまでの Sector Dive'],
  [SC.fresh, '見た目を一新'],
  [SC.sec1, 'セクターごとに違う景色'],
  [SC.stairs, '上下につながるステージ'],
  [SC.map, '建物まるごとの立体マップ'],
  [SC.lock, '閉じ込められて戦う部屋'],
  [SC.boss, '最下階にボス'],
];

// ---- the building ----
// a building of this sector that has what the scenes need: stairs first, a lift that passes a floor, a lockdown room
function pickSeed(): number {
  for (let seed = 1; seed < 4000; seed++) {
    const b = makeBuilding(BIOMES[SECTOR]!, BOSS, seed);
    if (
      b.links[0]!.kind === 'stairs' &&
      b.links.some(l => l.kind === 'elevator' && l.lower - l.upper === 2) &&
      b.lockdown &&
      b.lockdown.floor !== b.plans.length - 1
    )
      return seed;
  }
  throw new Error('trailer: no building fits');
}
const loadout: WeaponItem[] = [
  { id: 'shotgun', r: 2, plus: 24, opts: ['rate'] },
  { id: 'rail', r: 2, plus: 22, opts: ['pierce'] },
];
// a practised player's build: the numbers a few depths of good chips give
function buff() {
  player.extra = 3;
  player.chain = 2;
  player.dmgMul = 2.6;
  player.fireRate = 1.6;
  player.crit = 0.25;
  player.magMul = 2.5;
  player.reloadMul = 0.5;
  player.weapons[0]!.mag = 19;
}
// to a floor of the building (a cut), then to a tile of it, looking along `look` (a step of tiles)
function goFloor(floor: number) {
  const st = run.bld!;
  st.floor = floor;
  st.at = floor ? building!.links.findIndex(l => l.upper === floor || l.lower === floor) : -1;
  startStage();
  buff();
}
const dirOf = (d: number): [number, number] => [Math.abs(d) === 1 ? d : 0, Math.abs(d) === 1 ? 0 : Math.sign(d)];
const mid = (k: number): [number, number] => [((k % W) + 0.5) * T, (Math.floor(k / W) + 0.5) * T];
function put(tile: number, look: number, pitch = 0) {
  [player.x, player.z] = mid(tile);
  player.fy = floorY(player.x, player.z);
  player.vy = 0;
  const [dx, dz] = dirOf(look);
  player.yaw = Math.atan2(-dx, -dz);
  player.pitch = pitch;
  player.tile = -1;
  player.sprint = false;
  controlState.dashHeld = false;
}
const beside = (k: number, ok: (t: number) => boolean = () => true): number =>
  [1, -1, W, -W].find(d => grid[k + d] === 1 && ok(k + d))!;

// ---- the scenes ----
// a row of sleeping enemies in front of the player, facing them
function lineUp(types: string[]) {
  types.forEach((type, n) => {
    const side = (n - (types.length - 1) / 2) * 2.5,
      d = 6,
      e = spawnEnemy(
        type,
        player.x - Math.sin(player.yaw) * d + Math.cos(player.yaw) * side,
        player.z - Math.cos(player.yaw) * d - Math.sin(player.yaw) * side,
        -1,
        1,
      );
    e.face = player.yaw;
    e.mesh.rotation.y = player.yaw;
  });
}
const SHOWN = ['crawler', 'drone', 'turret', 'trooper'];
function settle() {
  save.settings.autofire = true;
  save.settings.assist = 'strong';
  save.startTier = 0;
  save.up.chip = 0;
  save.loadout = loadout.map(x => ({ ...x }));
}
// a new building of a sector (the same one for the same sector, by the seed), the player in its start room
function inSector(code: string) {
  run.route = [BIOMES.findIndex(b => b.code === code)];
  run.bld = undefined;
  startStage();
}
const plainAll = (on: boolean) => {
  devPlainLooks(on);
  devPlainGuns(on);
  useSparkLooks();
};
// the scenes of the looks: nobody fires or wakes, and the game's own banner (the floor's name, across the middle) is
// out of the way
const WAKE_TILES = ENEMY_TUNE.wakeTiles;
function showOnly(on: boolean) {
  save.settings.autofire = !on;
  (ENEMY_TUNE as { wakeTiles: number }).wakeTiles = on ? -1 : WAKE_TILES;
  el('#banner').style.visibility = on ? 'hidden' : '';
}
function sceneOld() {
  settle();
  showOnly(true);
  plainAll(true);
  devSeed(SHOW_SEED);
  startRun();
  inSector(BIOMES[SECTOR]!.code);
  lineUp(SHOWN);
}
function sceneFresh() {
  const { x, z, yaw } = player;
  plainAll(false);
  inSector(BIOMES[SECTOR]!.code);
  player.x = x;
  player.z = z;
  player.yaw = yaw;
  lineUp(SHOWN);
}
const sceneTour = (n: number) => () => {
  inSector(TOUR[n]!);
  lineUp(
    BIOMES.find(b => b.code === TOUR[n])!
      .enemies.filter((t, i, all) => t !== 'shield' && all.indexOf(t) === i) // (its shield would fill the picture)
      .slice(0, 3),
  );
};
let stairs: BuildingLink, lift: BuildingLink;
let liftFrom = 0; // the tile the player steps onto the lift from
let fightRoom = -1;
function sceneStairs() {
  settle();
  showOnly(false);
  devSeed(pickSeed());
  startRun();
  // the same building, in the sector the trailer is filmed in
  run.route = [SECTOR];
  run.bld = undefined;
  run.forceBoss = BOSS;
  startStage();
  run.forceBoss = undefined;
  run.bld!.supplied = true; // no supply picks at the boss door: the clip goes straight into the fight
  const b = building!;
  stairs = b.links[0]!;
  lift = b.links.find(l => l.kind === 'elevator' && l.lower - l.upper === 2)!;
  b.plans.forEach(p => p.seen.fill(1)); // the maps show the whole building
  goFloor(stairs.upper);
  const step = stairs.strip[1]! - stairs.strip[0]!;
  put(stairs.a + step, -step, -0.28); // above the landing, looking down the stairs
}
function sceneLift() {
  goFloor(lift.upper);
  liftFrom = lift.a + beside(lift.a);
  put(liftFrom, lift.a - liftFrom);
}
function sceneMap() {
  cycleMap();
  cycleMap(); // closed -> 2D -> 3D
}
let lockFrom: number[] = [0, 0]; // the middle of the door the player walks in through
function sceneLock() {
  if (!el('#bigmap').hidden) cycleMap();
  const ld = building!.lockdown!;
  goFloor(ld.floor);
  fightRoom = ld.room;
  const door = roomDoors(building!.plans[ld.floor]!.gen, ld.room).doors[0]!,
    inward = beside(door, t => level.roomOf[t] === ld.room);
  put(door - inward, inward); // in the corridor, facing the room's door
  lockFrom = mid(door);
  enemies.forEach(e => {
    if (e.room === ld.room) e.active = true;
  });
  target = null;
}
function sceneBoss() {
  el('#alarm').classList.remove('on');
  const last = building!.plans.length - 1;
  goFloor(last);
  BOSS_TUNE.introTime = 1.0;
  const hall = level.hall!,
    inward = beside(hall.door, t => level.roomOf[t] === hall.room);
  put(hall.door - inward, inward, 0.1); // in front of the locked boss door
  enemies.slice().forEach(e => {
    e.active = false; // the floor's own enemies stay where they are
  });
}
function sceneEnd() {
  const o = document.createElement('div');
  o.id = 'trailerEnd';
  o.style.cssText =
    'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;align-content:center;gap:14px;text-align:center;opacity:0;' +
    'background:radial-gradient(ellipse at 50% 45%,rgba(52,40,16,.92),rgba(5,8,12,.97) 65%)';
  o.innerHTML = `<div id="teLogo" style="font-family:var(--disp);font-weight:700;font-size:74px;letter-spacing:.5em;color:#d5e4ee;text-shadow:0 0 24px rgba(255,194,74,.35)">SECTOR<span style="color:#54e8ff">/</span>DIVE <span style="color:#ffc24a">EX</span></div>
    <div id="teTag" style="font-size:24px;color:#d5e4ee;opacity:0">最下階のボスを倒しに降りる</div>
    <div id="teSub" style="font-size:15px;color:#7f94a6;letter-spacing:.08em;opacity:0">Sector Dive の実験的な拡張版 ／ ブラウザで無料プレイ・スマホ対応</div>
    <div id="teUrl" style="font-family:var(--disp);font-size:17px;color:#ffc24a;letter-spacing:.1em;margin-top:6px;opacity:0">beatdjam.github.io/mini-games</div>`;
  document.body.appendChild(o);
  const f = document.createElement('div');
  f.id = 'teFlash'; // the cut from the fight to the card
  f.style.cssText = 'position:fixed;inset:0;z-index:10000;pointer-events:none;background:#fff6e0;opacity:0';
  document.body.appendChild(f);
}

// ---- the player's hands, each frame ----
let target: Enemy | null = null;
const inSight = (e: Enemy) =>
  !e.dead &&
  !e.boss &&
  Math.hypot(e.x - player.x, e.z - player.z) < 30 &&
  hasLOS(player.x, player.z, e.x, e.z, player.fy + 1.6, e.mesh.position.y);
function offAim(x: number, z: number) {
  const want = Math.atan2(-(x - player.x), -(z - player.z));
  return Math.abs(Math.atan2(Math.sin(want - player.yaw), Math.cos(want - player.yaw)));
}
const FRONT = 1.1;
function nearest(): Enemy | null {
  let best: Enemy | null = null,
    bd = Infinity;
  for (const e of enemies) {
    if (!inSight(e) || offAim(e.x, e.z) > FRONT) continue;
    const score = offAim(e.x, e.z) + Math.hypot(e.x - player.x, e.z - player.z) * 0.02;
    if (score < bd) {
      best = e;
      bd = score;
    }
  }
  return best;
}
// turn smoothly toward a point, like a thumb on the right side of the screen
function aimAt(x: number, y: number, z: number, dt: number, rate: number) {
  const want = Math.atan2(-(x - player.x), -(z - player.z));
  const diff = Math.atan2(Math.sin(want - player.yaw), Math.cos(want - player.yaw));
  player.yaw += clamp(diff, -rate * dt, rate * dt) * Math.min(1, 0.35 + Math.abs(diff) * 2);
  const wantP = Math.atan2(y - (player.fy + 1.6), Math.hypot(x - player.x, z - player.z));
  player.pitch += (clamp(wantP, -0.5, 0.6) - player.pitch) * Math.min(1, dt * 8);
}
const still = () => {
  joy.x = 0;
  joy.y = 0;
  setFireHeld(false);
};
function hands(s: number, dt: number) {
  const at = (a: number, b: number) => s >= a && s < b,
    onFrame = (t: number) => Math.round(s * FPS) === Math.round(t * FPS);
  if (state !== 'play' || !player) {
    still();
    return;
  }
  player.hp = player.maxHp;
  player.inv = Math.max(player.inv, 0.2);
  if (at(SC.old, SC.sec1)) {
    // standing in front of the row, the head turning slowly along it (the same turn before and after the change)
    still();
    player.yaw += Math.sin((s - SC.old) * 1.1) * 0.22 * dt;
  } else if (at(SC.sec1, SC.stairs)) {
    // a few steps toward the row in each sector
    setFireHeld(false);
    joy.x = 0;
    joy.y = -0.5;
  } else if (at(SC.stairs, SC.lift)) {
    // a dash, held on: running down the stairs and out onto the floor below, the head coming level
    const k = s - SC.stairs;
    setFireHeld(false);
    joy.x = 0;
    joy.y = k > 0.35 ? -1 : 0;
    if (onFrame(SC.stairs + 0.5)) controlState.dashReq = true;
    controlState.dashHeld = k > 0.5;
    player.pitch += ((k > 1.9 ? 0 : -0.28) - player.pitch) * Math.min(1, dt * 3);
  } else if (at(SC.lift, SC.map)) {
    // onto the platform, then turn round to watch the floors go by through the shaft's opening
    setFireHeld(false);
    controlState.dashHeld = false;
    const [sx, sz] = mid(lift.a),
      onPad = Math.hypot(player.x - sx, player.z - sz) < 0.5;
    joy.x = 0;
    joy.y = onPad || ridingY() !== null ? 0 : -0.8;
    if (onPad || ridingY() !== null) {
      // the opening on the floor being played: where the player came from, or the corridor of the floor arrived at
      const open = level.floor === lift.upper ? liftFrom : lift.a + beside(lift.a),
        [ox, oz] = mid(open);
      aimAt(ox, player.fy + 1.6, oz, dt, 2.6);
    }
  } else if (at(SC.map, SC.lock)) {
    still();
    turnMap3D(0.55 * dt, (s - SC.map < 1.2 ? 0.12 : -0.1) * dt);
  } else if (at(SC.lock, SC.boss)) {
    const k = s - SC.lock,
      r = level.rooms[fightRoom]!;
    if (k < 2.5 && Math.hypot(player.x - lockFrom[0]!, player.z - lockFrom[1]!) < 2.5 * T) {
      // through the door and well into the room (the door shuts behind on the first step in: turning to fight
      // any nearer to it, the player is left on its doorstep)
      joy.x = 0;
      joy.y = -1;
      setFireHeld(false);
      return;
    }
    if (!target || target.dead || offAim(target.x, target.z) > FRONT + 0.4) target = nearest();
    if (target) aimAt(target.x, target.mesh.position.y, target.z, dt, 9);
    else {
      const left = enemies.filter(inSight).sort((u, v) => offAim(u.x, u.z) - offAim(v.x, v.z))[0];
      if (left) aimAt(left.x, left.mesh.position.y, left.z, dt, 4);
      else aimAt((r.x + r.w / 2) * T, 1, (r.y + r.h / 2) * T, dt, 3);
    }
    joy.x = Math.sin(k * 1.6) * 0.9;
    joy.y = Math.sin(k * 0.9) * 0.3;
    setFireHeld(!!target && offAim(target.x, target.z) < 0.25);
    if (onFrame(SC.lock + 2.4) || onFrame(SC.lock + 4.1)) controlState.dashReq = true;
  } else if (at(SC.boss, SC.end)) {
    const k = s - SC.boss,
      hall = level.hall!,
      b = boss;
    // a look at the locked door, it opens, in through it; then the fight
    if (onFrame(SC.boss + 0.7)) lockDoor(activeTileGrid().world, hall.door, false);
    if (b && !b.dead) {
      aimAt(b.x, b.mesh.position.y, b.z, dt, 6);
      const d = Math.hypot(b.x - player.x, b.z - player.z);
      joy.x = 0.9;
      joy.y = clamp((8.5 - d) * 0.15, -0.6, 0.6);
      setFireHeld(!b.spawnT || b.spawnT <= 0);
    } else {
      joy.x = 0;
      // walk in until well inside the room, then stand and wait for the boss
      const r = level.rooms[hall.room]!,
        deep = Math.min(player.x - r.x * T, (r.x + r.w) * T - player.x, player.z - r.y * T, (r.y + r.h) * T - player.z);
      joy.y = k > 1.0 && deep < 10 ? -1 : 0;
      setFireHeld(false);
    }
  } else still();
}

// ---- the frame loop ----
const sceneAt: [number, () => void][] = [
  [SC.old, sceneOld],
  [SC.fresh, sceneFresh],
  [SC.sec1, sceneTour(0)],
  [SC.sec2, sceneTour(1)],
  [SC.sec3, sceneTour(2)],
  [SC.stairs, sceneStairs],
  [SC.lift, sceneLift],
  [SC.map, sceneMap],
  [SC.lock, sceneLock],
  [SC.boss, sceneBoss],
  [SC.end, sceneEnd],
];
function uiScript(s: number) {
  const ease = (x: number) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
  // the caption of the scene: in, held, out before the cut
  const cap = el('#trailerCap'),
    n = CAPS.filter(([from]) => s >= from).length - 1,
    [from, text] = CAPS[n] ?? [0, ''],
    until = n + 1 < CAPS.length ? CAPS[n + 1]![0] : SC.end,
    k = s - from;
  cap.textContent = text;
  cap.style.opacity = s >= SC.end ? '0' : String(Math.min(ease((k - 0.15) / 0.4), ease((until - s) / 0.3)));
  // the change of looks: a white flash over the cut
  const fl = el('#trailerFlash'),
    f = s - SC.fresh;
  fl.style.opacity = String(f < -0.08 || f > 0.7 ? 0 : f < 0 ? (f + 0.08) / 0.08 : 1 - ease(f / 0.7));
  // the lockdown's red frame pulses by the film's clock (the page's own animation runs on real time)
  const alarm = el('#alarm');
  alarm.style.animation = 'none';
  alarm.style.opacity = alarm.classList.contains('on') ? String(0.72 + 0.28 * Math.sin(s * 5.7)) : '0';
  // title card: a flash, the card under it, the logo closes up, then the lines
  const o = document.getElementById('trailerEnd');
  if (o) {
    const e = s - SC.end;
    el('#teFlash').style.opacity = String(e < 0.1 ? (0.9 * e) / 0.1 : 0.9 * (1 - ease((e - 0.1) / 0.6)));
    o.style.opacity = e < 0.1 ? '0' : '1';
    el('#teLogo').style.letterSpacing = `${0.5 - 0.34 * ease(e / 1.1)}em`;
    el('#teTag').style.opacity = String(ease((e - 0.7) / 0.5));
    el('#teSub').style.opacity = String(ease((e - 1.1) / 0.5));
    el('#teUrl').style.opacity = String(ease((e - 1.4) / 0.5));
  }
}
function musicScript(s: number) {
  if (s === 0) {
    setMusic(BIOMES[SECTOR]!.code, true);
    setMusicMix('boss');
  }
}

// frames to render: the whole trailer, or ?tframes=N (?tfrom=K: screenshots from frame K only, ?tevery=M: every Mth) for a quick look
export async function runTrailer(musicOnly: boolean) {
  changeLang('ja');
  el('#toast').style.display = 'none'; // hints and notices would cover the top of the picture
  el('#mapHint').style.display = 'none';
  const cap = document.createElement('div');
  cap.id = 'trailerCap';
  cap.style.cssText =
    'position:fixed;z-index:9000;left:50%;top:62px;transform:translateX(-50%);padding:6px 18px;white-space:nowrap;opacity:0;' +
    'font-size:22px;letter-spacing:.08em;color:#fff3d6;background:rgba(5,8,12,.72);border-left:3px solid #ffc24a';
  document.body.appendChild(cap);
  const flash = document.createElement('div');
  flash.id = 'trailerFlash';
  flash.style.cssText = 'position:fixed;inset:0;z-index:8999;pointer-events:none;background:#fff6e0;opacity:0';
  document.body.appendChild(flash);
  audioInit();
  setVolumes(musicOnly ? 0 : 1, musicOnly ? 1 : 0);
  applySfxVolume();
  musicVolume();
  const off = w.__off;
  const q = new URLSearchParams(location.search);
  const limit = +(q.get('tframes') || 0),
    from = +(q.get('tfrom') || 0),
    every = +(q.get('tevery') || 1);
  const N = limit || Math.round(SC.total * FPS),
    dt = 1 / FPS;
  let shot = 0;
  const frame = async (k: number) => {
    const s = k * dt;
    if (musicOnly) musicScript(s);
    else {
      sceneAt.forEach(([at, fn]) => {
        if (k === Math.round(at * FPS)) fn();
      });
      hands(s, dt);
      uiScript(s);
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
  for (let k = 1; k < N; k++)
    off.suspend(k * dt).then(async () => {
      await frame(k);
      off.resume();
    });
  await frame(0);
  console.log('TRAILER rendering', N, 'frames', musicOnly ? '(music)' : '(video)');
  const buf = await off.startRendering();
  // hand the sound back as a 16-bit stereo WAV, base64, in pieces
  const len = Math.min(buf.length, Math.ceil(N * dt * buf.sampleRate) + buf.sampleRate),
    ch = [buf.getChannelData(0), buf.getChannelData(1)];
  const bytes = new Uint8Array(44 + len * 4),
    v = new DataView(bytes.buffer);
  const str = (o: number, x: string) => {
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
  w.__done(`${N} frames, ${shot} shot`);
}
