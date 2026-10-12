import type { Enemy, WeaponItem } from '../data/types.ts';
import { clamp, el } from '@engine/core/util.ts';
import { setMusic, setMusicMix } from '@engine/audio/music.ts';
import { T, W, activeTileGrid, floorY, grid, hasLOS } from '@engine/world/tiles.ts';
import { lockDoor } from '@engine/world/doors.ts';
import { joy, setFireHeld } from '@engine/ui/input.ts';
import { runTrailer } from '@engine/trailer/film.ts';
import type { TrailerGame } from '@engine/trailer/film.ts';
import { FILM_SETTINGS, setting } from '@engine/trailer/script.ts';
import type { Script, ScriptLine, ScriptScene } from '@engine/trailer/script.ts';
import { BIOMES } from '../data/biomes.ts';
import { BOSS_TUNE } from '../data/bosses.ts';
import { ENEMY, ENEMY_TUNE } from '../data/enemies.ts';
import { WEAPONS } from '../data/weapons.ts';
import { save } from '../core/save.ts';
import { building, makeBuilding, roomDoors } from '../world/building.ts';
import type { Building, BuildingLink } from '../world/building.ts';
import { devSeed, level } from '../world/level.ts';
import { boss, enemies, spawnEnemy } from '../world/entities.ts';
import { devPlainLooks } from '../world/looks.ts';
import { useSparkLooks } from '../world/models/sparkLooks.ts';
import { devPlainGuns } from '../actors/viewmodel.ts';
import { player, run } from '../actors/player.ts';
import { controlState } from '../ui/input.ts';
import { cycleMap } from '../ui/hud.ts';
import { turnMap3D } from '../ui/map3d.ts';
import { changeLang } from '../ui/settings.ts';
import { ridingY } from '../flow/events.ts';
import { startRun, startStage } from '../flow/run.ts';
import { state } from '../flow/state.ts';
// Dev only: the words of Sector Dive Extended's trailer scripts (engine/src/trailer; how to write one and film it:
// tools/trailer/README.md), opened by tools/trailer/capture.mjs as #trailer / #trailer-music. A scene puts the
// player somewhere (`at`), in the old or new looks (`looks`), with a row of enemies in front (`enemies`), and moves
// their hands (`do`). The building places (stairs, lift, lockdown, boss, map3d) are all in one building of the
// `building` setting, one the script's places all fit in

// ---- the words ----
const SETTINGS = ['music', 'build', 'guns', 'building'];
const SCENE_KEYS = ['at', 'looks', 'enemies', 'do'];
// where a scene can be: a sector's start room, where the scene before was, or a place of the building
const BUILDING_PLACES = ['stairs', 'lift', 'lockdown', 'boss', 'map3d'];
// what the hands do, and the place each needs in the same scene (none: anywhere)
const ACTIONS: Record<string, string | null> = {
  stand: null,
  'look-around': null,
  walk: null,
  run: null,
  ride: 'lift',
  'turn-map': 'map3d',
  fight: null,
  boss: 'boss',
};
const codeOf = (code: string) => BIOMES.findIndex(b => b.code === code);
const lineOf = (sc: ScriptScene, key: string): ScriptLine | undefined => sc.lines.find(l => l.key === key);
const placeOf = (sc: ScriptScene): string | undefined => {
  const at = lineOf(sc, 'at');
  return at && (at.args[1] === 'start' ? 'start' : at.args[0]);
};

function check(script: Script): string[] {
  const bad: string[] = [],
    no = (l: ScriptLine, what: string) => bad.push(`line ${l.line}: ${what}`);
  for (const l of script.settings) {
    if (FILM_SETTINGS.includes(l.key)) continue;
    if (!SETTINGS.includes(l.key)) no(l, `no setting "${l.key}" (${[...FILM_SETTINGS, ...SETTINGS].join(', ')})`);
    else if ((l.key === 'music' || l.key === 'building') && codeOf(l.args[0] ?? '') < 0)
      no(l, `no sector "${l.args[0] ?? ''}" (${BIOMES.map(b => b.code).join(', ')})`);
    else if (l.key === 'music' && l.args[1] !== undefined && l.args[1] !== 'boss')
      no(l, 'music takes a sector and boss');
    else if (l.key === 'building' && l.named.boss && !BIOMES[codeOf(l.args[0]!)]!.bosses.includes(l.named.boss))
      no(l, `no boss "${l.named.boss}" in ${l.args[0]} (${BIOMES[codeOf(l.args[0]!)]!.bosses.join(', ')})`);
    else if (l.key === 'build' && !['strong', 'plain'].includes(l.args[0] ?? '')) no(l, 'build takes strong or plain');
    else if (l.key === 'guns')
      for (const g of l.args) if (!WEAPONS[g.split(':')[0]!]) no(l, `no gun "${g.split(':')[0]}"`);
  }
  script.scenes.forEach((sc, n) => {
    if (sc.end) return;
    if (n === 0 && !lineOf(sc, 'at')) bad.push(`line ${sc.line}: the first scene needs an at`);
    for (const l of sc.lines) {
      if (!SCENE_KEYS.includes(l.key)) no(l, `no "${l.key}" in a scene (${SCENE_KEYS.join(', ')}, in)`);
      else if (l.key === 'at') {
        const [where = '', what] = l.args;
        if (what === 'start') {
          if (codeOf(where) < 0) no(l, `no sector "${where}"`);
        } else if (where !== 'same' && !BUILDING_PLACES.includes(where))
          no(l, `no place "${l.text}" (<SECTOR> start, same, ${BUILDING_PLACES.join(', ')})`);
        else if (BUILDING_PLACES.includes(where) && !setting(script, 'building'))
          no(l, `${where} is a place of the building: the script needs a building setting`);
      } else if (l.key === 'looks' && !['old', 'new'].includes(l.args[0] ?? '')) no(l, 'looks takes old or new');
      else if (l.key === 'enemies' && !/^\d+$/.test(l.args[0] ?? ''))
        for (const t of l.args) if (!ENEMY[t]) no(l, `no enemy "${t}"`);
      if (l.key === 'do') {
        const need = ACTIONS[l.args[0] ?? ''];
        if (need === undefined) no(l, `no action "${l.args[0] ?? ''}" (${Object.keys(ACTIONS).join(', ')})`);
        else if (need && placeOf(sc) !== need) no(l, `${l.args[0]} needs "at ${need}" in its scene`);
      }
    }
  });
  return bad;
}

// ---- the building ----
// a building of the `building` setting that has the places the script uses: a stairwell, a lift that passes as many
// floors as asked, a lockdown room that is not on the bottom floor
function pickSeed(script: Script, b: ScriptLine): number {
  if (b.named.seed) return +b.named.seed;
  const biome = BIOMES[codeOf(b.args[0]!)]!,
    used = script.scenes.flatMap(sc => sc.lines.filter(l => l.key === 'at')),
    lift = used.find(l => l.args[0] === 'lift'),
    skip = lift?.named.skip ? +lift.named.skip : 0;
  for (let seed = 1; seed < 4000; seed++) {
    const m = makeBuilding(biome, b.named.boss ?? biome.bosses[0]!, seed);
    if (
      (!used.some(l => l.args[0] === 'stairs') || m.links[0]!.kind === 'stairs') &&
      (!lift || m.links.some(l => l.kind === 'elevator' && (!skip || l.lower - l.upper === skip))) &&
      (!used.some(l => l.args[0] === 'lockdown') || (m.lockdown && m.lockdown.floor !== m.plans.length - 1))
    )
      return seed;
  }
  throw new Error('trailer: no building has all the places of the script');
}
const dirOf = (d: number): [number, number] => [Math.abs(d) === 1 ? d : 0, Math.abs(d) === 1 ? 0 : Math.sign(d)];
const mid = (k: number): [number, number] => [((k % W) + 0.5) * T, (Math.floor(k / W) + 0.5) * T];
const beside = (k: number, ok: (t: number) => boolean = () => true): number =>
  [1, -1, W, -W].find(d => grid[k + d] === 1 && ok(k + d))!;
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

// ---- the film's state ----
let script: Script;
let started = false; // a run has been started
let shown: Building | null = null; // the building of the building places, once it is up
let sector = 0; // the sector of the start rooms (at <SECTOR> start; `same` rebuilds it)
let lift: BuildingLink | null = null;
let liftFrom = 0; // the tile the player steps onto the lift from
let fightRoom = -1;
let lockFrom: [number, number] | null = null; // the middle of the door the player walks into the lockdown room by
let target: Enemy | null = null;
let bossFought = false; // the boss of the scene has come out (once it is beaten, the hands rest)

// the player's guns and chips, from the settings
function settle() {
  const guns = setting(script, 'guns')?.args ?? ['shotgun', 'rail'];
  save.settings.autofire = true;
  save.settings.assist = 'strong';
  save.startTier = 0;
  save.up.chip = 0;
  save.loadout = guns.map((g): WeaponItem => {
    const [id, opt] = g.split(':');
    return { id: id!, r: 2, plus: 24, opts: opt ? [opt] : [] };
  });
}
// a practised player's build: the numbers a few depths of good chips give
function buff() {
  if (setting(script, 'build')?.args[0] === 'plain') return;
  player.extra = 3;
  player.chain = 2;
  player.dmgMul = 2.6;
  player.fireRate = 1.6;
  player.crit = 0.25;
  player.magMul = 2.5;
  player.reloadMul = 0.5;
  player.weapons[0]!.mag = 19;
}
// the start-room scenes: nobody wakes or fires, and the game's banner (the floor's name, across the middle) is hidden
const WAKE_TILES = ENEMY_TUNE.wakeTiles;
function showOnly(on: boolean) {
  save.settings.autofire = !on;
  (ENEMY_TUNE as { wakeTiles: number }).wakeTiles = on ? -1 : WAKE_TILES;
  el('#banner').style.visibility = on ? 'hidden' : '';
}
function start() {
  if (started) return;
  settle();
  startRun();
  started = true;
}
// a new building of a sector (the same one for the same seed), the player in its start room
function inSector(n: number) {
  run.route = [n];
  run.bld = undefined;
  startStage();
}
// to a floor of the building (a cut)
function goFloor(floor: number) {
  const st = run.bld!;
  st.floor = floor;
  st.at = floor ? building!.links.findIndex(l => l.upper === floor || l.lower === floor) : -1;
  startStage();
  buff();
}
// the building of the building places, made when the first of them comes
function upBuilding() {
  showOnly(false);
  if (shown && building === shown) return;
  const b = setting(script, 'building')!,
    n = codeOf(b.args[0]!);
  settle();
  devSeed(pickSeed(script, b));
  startRun();
  started = true;
  run.route = [n];
  run.bld = undefined;
  run.forceBoss = b.named.boss ?? BIOMES[n]!.bosses[0]!;
  startStage();
  run.forceBoss = undefined;
  run.bld!.supplied = true; // no supply picks at the boss door: the clip goes straight into the fight
  shown = building!;
  shown.plans.forEach(p => p.seen.fill(1)); // the maps show the whole building
}
const closeMap = () => {
  for (let n = 0; n < 3 && !el('#bigmap').hidden; n++) cycleMap();
};
// a row of sleeping enemies in front of the player, facing them
function lineUp(l: ScriptLine) {
  const types = /^\d+$/.test(l.args[0]!)
    ? BIOMES[sector]!.enemies.filter((t, i, all) => t !== 'shield' && all.indexOf(t) === i).slice(0, +l.args[0]!) // (a shield would fill the picture)
    : l.args;
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
const plainAll = (on: boolean) => {
  devPlainLooks(on);
  devPlainGuns(on);
  useSparkLooks();
};

// ---- the scenes ----
function place(at: ScriptLine) {
  const [where, what] = at.args;
  if (what === 'start') {
    start();
    showOnly(true); // (after start: its settle turns auto-fire on)
    if (at.named.seed) devSeed(+at.named.seed);
    sector = codeOf(where!);
    inSector(sector);
    shown = null;
  } else if (where === 'same') {
    const { x, z, yaw, pitch } = player;
    if (shown) goFloor(run.bld!.floor);
    else inSector(sector);
    Object.assign(player, { x, z, yaw, pitch });
    player.fy = floorY(x, z);
  } else if (where === 'stairs') {
    upBuilding();
    const s = shown!.links.find(l => l.kind === 'stairs')!,
      step = s.strip[1]! - s.strip[0]!;
    goFloor(s.upper);
    put(s.a + step, -step, -0.28); // above the landing, looking down the stairs
  } else if (where === 'lift') {
    upBuilding();
    const skip = at.named.skip ? +at.named.skip : 0;
    lift =
      shown!.links.find(l => l.kind === 'elevator' && (!skip || l.lower - l.upper === skip)) ??
      shown!.links.find(l => l.kind === 'elevator')!;
    goFloor(lift.upper);
    liftFrom = lift.a + beside(lift.a);
    put(liftFrom, lift.a - liftFrom);
  } else if (where === 'map3d') {
    if (!shown) {
      upBuilding();
      goFloor(0);
    }
    cycleMap();
    cycleMap(); // closed -> 2D -> 3D
  } else if (where === 'lockdown') {
    upBuilding();
    const ld = shown!.lockdown!;
    goFloor(ld.floor);
    fightRoom = ld.room;
    const door = roomDoors(shown!.plans[ld.floor]!.gen, ld.room).doors[0]!,
      inward = beside(door, t => level.roomOf[t] === ld.room);
    put(door - inward, inward); // in the corridor, facing the room's door
    lockFrom = mid(door);
    enemies.forEach(e => {
      if (e.room === ld.room) e.active = true;
    });
  } else if (where === 'boss') {
    upBuilding();
    goFloor(shown!.plans.length - 1);
    BOSS_TUNE.introTime = 1.0;
    const hall = level.hall!,
      inward = beside(hall.door, t => level.roomOf[t] === hall.room);
    put(hall.door - inward, inward, 0.1); // in front of the locked boss door
    enemies.slice().forEach(e => {
      e.active = false; // the floor's own enemies stay where they are
    });
  }
}
function scene(sc: ScriptScene) {
  closeMap();
  el('#alarm').classList.remove('on');
  target = null;
  bossFought = false;
  const looks = lineOf(sc, 'looks'),
    at = lineOf(sc, 'at'),
    row = lineOf(sc, 'enemies');
  if (at?.args[0] !== 'lockdown') lockFrom = null;
  if (looks) plainAll(looks.args[0] === 'old');
  if (at) place(at);
  if (row) lineUp(row);
}

// ---- the player's hands, each frame ----
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
// `t`: seconds into the scene, `s`: into the film (the head's turn goes on across a cut)
const HANDS: Record<string, (t: number, dt: number, s: number) => void> = {
  stand: still,
  // standing, the head turning slowly from side to side
  'look-around': (_t, dt, s) => {
    still();
    player.yaw += Math.sin(s * 1.1) * 0.22 * dt;
  },
  // a few steps forward
  walk: () => {
    setFireHeld(false);
    joy.x = 0;
    joy.y = -0.5;
  },
  // a dash, held on: running on, the head coming level
  run: (t, dt) => {
    setFireHeld(false);
    joy.x = 0;
    joy.y = t > 0.35 ? -1 : 0;
    if (Math.round(t * 30) === 15) controlState.dashReq = true;
    controlState.dashHeld = t > 0.5;
    player.pitch += ((t > 1.9 ? 0 : -0.28) - player.pitch) * Math.min(1, dt * 3);
  },
  // onto the lift's platform, then turn round to watch the floors go by through the shaft's opening
  ride: (_t, dt) => {
    setFireHeld(false);
    controlState.dashHeld = false;
    const l = lift!,
      [sx, sz] = mid(l.a),
      onPad = Math.hypot(player.x - sx, player.z - sz) < 0.5;
    joy.x = 0;
    joy.y = onPad || ridingY() !== null ? 0 : -0.8;
    if (onPad || ridingY() !== null) {
      // the opening on the floor being played: where the player came from, or the corridor of the floor arrived at
      const open = level.floor === l.upper ? liftFrom : l.a + beside(l.a),
        [ox, oz] = mid(open);
      aimAt(ox, player.fy + 1.6, oz, dt, 2.6);
    }
  },
  'turn-map': (t, dt) => {
    still();
    turnMap3D(0.55 * dt, (t < 1.2 ? 0.12 : -0.1) * dt);
  },
  // (after "at lockdown": through the door and well into the room first) aim at the nearest enemy and fire, strafing
  fight: (t, dt) => {
    if (lockFrom && t < 2.5 && Math.hypot(player.x - lockFrom[0], player.z - lockFrom[1]) < 2.5 * T) {
      // (the door shuts behind on the first step in: turning to fight any nearer to it, the player is left on its
      // doorstep)
      joy.x = 0;
      joy.y = -1;
      setFireHeld(false);
      return;
    }
    if (!target || target.dead || offAim(target.x, target.z) > FRONT + 0.4) target = nearest();
    if (target) aimAt(target.x, target.mesh.position.y, target.z, dt, 9);
    else {
      const left = enemies.filter(inSight).sort((u, v) => offAim(u.x, u.z) - offAim(v.x, v.z))[0],
        r = level.rooms[fightRoom];
      if (left) aimAt(left.x, left.mesh.position.y, left.z, dt, 4);
      else if (r) aimAt((r.x + r.w / 2) * T, 1, (r.y + r.h / 2) * T, dt, 3);
    }
    joy.x = Math.sin(t * 1.6) * 0.9;
    joy.y = Math.sin(t * 0.9) * 0.3;
    setFireHeld(!!target && offAim(target.x, target.z) < 0.25);
    if (Math.round(t * 30) === 72 || Math.round(t * 30) === 123) controlState.dashReq = true;
  },
  // a look at the locked boss door, it opens, in through it; then the fight, and standing still once it is beaten
  boss: (t, dt) => {
    const hall = level.hall!,
      b = boss;
    if (Math.round(t * 30) === 21) lockDoor(activeTileGrid().world, hall.door, false);
    if (bossFought && (!b || b.dead)) {
      still();
      return;
    }
    if (b && !b.dead) {
      bossFought = true;
      aimAt(b.x, b.mesh.position.y, b.z, dt, 6);
      const d = Math.hypot(b.x - player.x, b.z - player.z);
      joy.x = Math.sin(t * 1.3) * 0.9; // (side to side: circling one way, the player ends up behind a pillar)
      joy.y = clamp((8.5 - d) * 0.15, -0.6, 0.6);
      setFireHeld(!b.spawnT || b.spawnT <= 0);
    } else {
      joy.x = 0;
      // walk in until well inside the room, then stand and wait for the boss
      const r = level.rooms[hall.room]!,
        deep = Math.min(player.x - r.x * T, (r.x + r.w) * T - player.x, player.z - r.y * T, (r.y + r.h) * T - player.z);
      joy.y = t > 1.0 && deep < 10 ? -1 : 0;
      setFireHeld(false);
    }
  },
};
function frame(sc: ScriptScene, t: number, dt: number) {
  if (state !== 'play' || !player) {
    still();
    return;
  }
  player.hp = player.maxHp;
  player.inv = Math.max(player.inv, 0.2);
  HANDS[lineOf(sc, 'do')?.args[0] ?? 'stand']!(t, dt, sc.start + t);
}
// the lockdown's red frame pulses by the film's clock (the page's own animation runs on real time)
function paint(s: number) {
  const alarm = el('#alarm');
  alarm.style.animation = 'none';
  alarm.style.opacity = alarm.classList.contains('on') ? String(0.72 + 0.28 * Math.sin(s * 5.7)) : '0';
}
const escape = (s: string) => s.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
export const trailerGame: TrailerGame = {
  check,
  begin(s) {
    script = s;
    started = false;
    shown = null;
    changeLang(setting(s, 'lang')?.args[0] === 'en' ? 'en' : 'ja');
    el('#toast').style.display = 'none'; // hints and notices would cover the top of the picture
    el('#mapHint').style.display = 'none';
  },
  scene,
  frame,
  paint,
  music(s) {
    const m = setting(s, 'music');
    if (!m) return;
    setMusic(m.args[0]!, m.args[1] === 'boss');
    if (m.args[1] === 'boss') setMusicMix('boss');
  },
  // the logo's colours: the slash cyan, EX amber
  title: text =>
    escape(text)
      .replace('/', '<span style="color:#54e8ff">/</span>')
      .replace(/ EX$/, ' <span style="color:#ffc24a">EX</span>'),
  cardBackground: 'radial-gradient(ellipse at 50% 45%,rgba(52,40,16,.92),rgba(5,8,12,.97) 65%)',
};
export const filmTrailer = (musicOnly: boolean) => runTrailer(trailerGame, musicOnly);
