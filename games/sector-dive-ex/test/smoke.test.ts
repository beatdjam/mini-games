// Smoke test for Sector Dive Extended: boots the game page (setup.ts) and runs its parts through the real loop by hand.
// The tests share one game state and run in order; some checks depend on how many random numbers the earlier ones used.
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { Group, Matrix4, Vector3 } from 'three';
import type { InstancedMesh } from 'three';
import type { Boss, GameState, MortarShell, Pickup, RunState, Snapshot } from '../src/data/types.ts';
import { createRng, distXZ, el, rand } from '@engine/core/util.ts';
import { clearWorld, query } from '@engine/core/world.ts';
import { lang, t } from '@engine/core/i18n.ts';
import { SFX, actx, audioInit } from '@engine/audio/audio.ts';
import {
  MUSIC_STYLES,
  musicState,
  musicInit,
  musicVolume,
  playStep,
  setMusic,
  setMusicMix,
} from '@engine/audio/music.ts';
import { V3, camera, scene } from '@engine/render/render.ts';
import { clearPool } from '@engine/world/projectiles.ts';
import {
  H,
  SIDE_STEP,
  STEP,
  T,
  W,
  activeTileGrid,
  SINK_EDGE,
  SINK_FLOOR,
  blocked,
  computeFlow,
  cover,
  floorY,
  flowDir,
  grid,
  hasLOS,
  hgt,
  isSolid,
  moveCircle,
  passable,
  ramp,
  tileCenter,
  tileIndex,
  walkable,
} from '@engine/world/tiles.ts';
import { joy, setFireHeld } from '@engine/ui/input.ts';
import { SETTINGS } from '@engine/ui/settings.ts';
import { actionDown, bindKey, changedBindings, exportBindings, keysOf, resetBindings } from '@engine/ui/keymap.ts';
import { encodeStore } from '@engine/core/store.ts';
import { isTouch } from '@engine/core/util.ts';
import { applyLayout, buttonLayout, openLayoutEditor } from '@engine/ui/touchlayout.ts';
import { SPLIT_FAN, SPLIT_MAX, WEAPONS, WEAPON_ORDER } from '../src/data/weapons.ts';
import { COVER_H, EYE, HALL_H, PLAT_H, WALL_H } from '../src/data/level.ts';
import { VIEWMODELS } from '../src/data/viewmodels.ts';
import { gunLook, hasGunLook } from '../src/world/models/gunLooks.ts';
import { ELITE_TYPES, ENEMY_TUNE } from '../src/data/enemies.ts';
import { BOSS_META, BOSS_ORDER, BOSS_TUNE } from '../src/data/bosses.ts';
import { BIOMES } from '../src/data/biomes.ts';
import { foodCourtRoom } from '../src/world/looks/mall/rooms.ts';
import { ISLAND_MIN_AREA } from '../src/world/looks/mall/islands.ts';
import { hospRoomKinds, waitingRoom } from '../src/world/looks/hosp/rooms.ts';
import { HOSP_KINDS, KIND_WAITING } from '../src/world/looks/hosp/shared.ts';
import { groundOf } from '../src/world/meshParts.ts';
import { facesWest, lookOf, variantOf, wallPic, WALL_PLAIN_SHARE } from '../src/world/looks.ts';
import { floorSides, wallSide } from '@engine/world/walls.ts';
import {
  DEPTH_HP_GROWTH,
  DEPTH_HP_LATE,
  KIT_MAX,
  LEVEL_DMG_MUL,
  isMilestone,
  PER,
  TUNE,
  UPGRADES,
  levelCost,
  milestoneBelow,
} from '../src/data/progress.ts';
import { openLevelUp } from '../src/screens/levelup.ts';
import { PERKS } from '../src/data/perks.ts';
import {
  SAVE_KEY,
  basicW,
  defaultSave,
  exportSave,
  importSave,
  importSaveCheck,
  persist,
  save,
} from '../src/core/save.ts';
import {
  supplyPlus,
  supplyRarity,
  perkName,
  pickDrop,
  levelOf,
  nextLevelCost,
  progressOf,
  readiness,
  readinessScore,
  sellValue,
  startDmgMul,
} from '../src/core/rules.ts';
import {
  buildFixedLevel,
  buildLevel,
  floorDrawn,
  followersOnTheWay,
  level,
  reveal,
  roomSpot,
  enterFloor,
  showBuilding,
  showNeighbourFloors,
  stashedRoomCount,
} from '../src/world/level.ts';
import { hazardState } from '../src/world/hazards.ts';
import { generateLevel } from '../src/world/levelGen.ts';
import type { GeneratedLevel } from '../src/world/levelGen.ts';
import { makePortal, makeTerminal } from '../src/world/portals.ts';
import {
  addPickup,
  boss,
  eBullets,
  enemies,
  isShielded,
  nearPickup,
  pBullets,
  removeEnemyMesh,
  setBoss,
  spawnEnemy,
  spawnPBullet,
  spawnWave,
} from '../src/world/entities.ts';
import { applyLevelPoint, currentWeapon, player, newPlayer, run, setPlayer, setRun } from '../src/actors/player.ts';
import { critChance, fillMag, rollWeapon, magSize, newWeapon, shotDamage, weaponStats } from '../src/actors/weapons.ts';
import { damagePlayer, explode, kitHealAmount, hurtEnemy } from '../src/actors/combat.ts';
import { MORTAR_BLAST_R } from '../src/actors/mortar.ts';
import { difficultyAt, damageScaleAt, stageInfo, stageLabel } from '../src/core/stages.ts';
import { RUNNING_SPREAD, findTarget, fire, shotId } from '../src/actors/firing.ts';
import { arenaRoom, bossDifficulty, minionCount, spawnBoss, spawnMinion } from '../src/actors/bosses/common.ts';
import { KEY_ACTIONS } from '../src/data/controls.ts';
import { setKeyBindings } from '../src/core/progress.ts';
import { applyKeyBindings, controlState, equipNearby, stowNearby } from '../src/ui/input.ts';
import { bigmap, cycleMap, hitDirs, map3dWanted, toggleMap, toggleMap3D, updateHud } from '../src/ui/hud.ts';
import { changeLang, renderGuide } from '../src/ui/settings.ts';
import {
  endRun,
  goBase,
  nextStage,
  pickEnemyType,
  startPractice,
  startRun,
  startStage,
  useLink,
  crossToFloor,
} from '../src/flow/run.ts';
import {
  BUILDING_V,
  FLOORS_RANGE,
  FLOOR_H,
  LAST_GAP,
  building,
  devCourtOpen,
  makeBuilding,
  makeRoute,
  packSeen,
  roomDoors,
  roomsOnWay,
  setBuilding,
} from '../src/world/building.ts';
import type { Building } from '../src/world/building.ts';
import { WINDOW_ORDER } from '@engine/render/windows.ts';
import { ridingY, supplyChips } from '../src/flow/events.ts';
import { parseScript } from '@engine/trailer/script.ts';
import { trailerGame } from '../src/dev/trailer.ts';
import sampleTrailer from '../trailers/2026-10-05.txt?raw';
import { isDoorLocked } from '@engine/world/doors.ts';
import { tileMapFromRows } from '@engine/world/tilemap.ts';
import * as THREE from 'three';
import { dressAtrium, dressYard } from '../src/world/yardProps.ts';
import { DOOR_PASS } from '@engine/world/tiles.ts';
import { buildingShell, outsideBlocks, shellOf } from '../src/world/looks/outside.ts';
import type { TileMapData } from '@engine/world/dungeon.ts';
import { floorNear, overHead, raised } from '../src/world/looks/props.ts';
import { setState, show, state } from '../src/flow/state.ts';
import { discardSuspended, resumeRun, suspendRun } from '../src/flow/suspend.ts';
import { openPerk } from '../src/screens/perk.ts';
import { pause, statsHTML } from '../src/screens/pause.ts';
import { markers } from '../src/ui/minimap.ts';
import { renderBase, showTab, weaponStatText } from '../src/screens/base.ts';
import { shareData, shareText } from '../src/ui/share.ts';
import { updatePBullets } from '../src/actors/bullets.ts';
import { time, update, updatePickups } from '../src/flow/update.ts';
import { LOOP, runSystems } from '@engine/core/loop.ts';
import { TRACK_LOG } from '@engine/core/analytics.ts';
import { FEEDBACK_FORM } from '@engine/core/feedback.ts';
import { COLOR } from '../src/data/colors.ts';

const stateIs = (s: GameState) => state === s; // a call, so TypeScript does not keep the narrowing of an earlier state check
const tick = (n: number) => {
  for (let k = 0; k < n; k++) {
    if (state !== 'play') {
      show(null);
      setState('play');
    }
    player.hp = player.maxHp;
    player.inv = 1;
    update(1 / 60);
  }
};

beforeAll(async () => {
  await import('../src/main.ts');
  await new Promise(r => setTimeout(r, 300)); // the start-up timers
  startRun();
  setFireHeld(true);
});

// run every sector (floor + each boss candidate) once
BIOMES.forEach((b, bi) => {
  test(`floor ${b.code}`, () => {
    run.route = [bi];
    run.stage = bi * PER + 1;
    startStage();
    tick(120);
    const n0 = enemies.length;
    // walk the player through the level to exercise movement over ramps/decks
    for (let k = 0; k < 120; k++) {
      joy.y = -1;
      player.yaw += 0.05;
      tick(1);
    }
    joy.y = 0;
    enemies.slice().forEach(e => hurtEnemy(e, 1e6, false));
    tick(30);
    console.log(
      'floor',
      b.code,
      'enemies',
      n0,
      'fy',
      player.fy.toFixed(2),
      'raised',
      hgt.filter(h => h > 0).length,
      'ramps',
      ramp.filter(r => r >= 0).length,
      'haz',
      level.hazardTiles.filter(Boolean).length,
    );
  });
  b.bosses.forEach(kind => {
    test(`boss ${b.code} ${kind}`, () => {
      // a new building of this sector with this boss, then its boss room on the lowest floor
      run.stage = bi * PER;
      run.bld = undefined;
      run.forceBoss = kind;
      startStage();
      run.forceBoss = undefined;
      goToFloor(building!.plans.length - 1);
      run.stage = bi * PER + PER - 1; // the boss stage, as once the player has walked into the boss room
      setBoss(null);
      enemies.slice().forEach(e => {
        e.dead = true;
        removeEnemyMesh(e);
      });
      clearWorld('enemy');
      spawnBoss(kind);
      boss!.spawnT = 0;
      tick(400);
      if (boss && boss.invuln) {
        enemies.filter(e => !e.boss).forEach(e => hurtEnemy(e, 1e6, false));
        tick(20);
      }
      const had = !!boss;
      if (boss) hurtEnemy(boss, boss.hp + 1, false);
      tick(60);
      expect(had, 'boss spawned').toBe(true);
    });
  });
});

test('ledge: stepping off a raised deck leaves nothing stuck or half inside', () => {
  // a ramp, a 3x3 deck and open floor beside it
  const rows = ['##########', '#>===....#', '#>===....#', '#>===....#', '##########'];
  run.route = [5];
  run.stage = 26;
  buildFixedLevel(BIOMES[5], { rows, rooms: [{ x: 1, y: 1, w: 8, h: 3 }], start: 0, exit: 0 });
  let tested = 0,
    stuck = 0,
    inside = 0;
  for (let k = 0; k < W * H; k++) {
    const i = k % W,
      j = (k / W) | 0;
    if (i > W - 4 || grid[k] !== 1 || hgt[k] !== PLAT_H || ramp[k] >= 0 || cover[k]) continue;
    if (!walkable(k + 1) || hgt[k + 1] !== 0 || !walkable(k + 2) || hgt[k + 2] !== 0) continue;
    for (const who of ['player', 'enemy']) {
      const o: { x: number; z: number; fy: number; vy?: number; r?: number } =
        who === 'player' ? player : spawnEnemy('crawler', 0, 0, -1, 1);
      o.x = (i + 1) * T - 0.2;
      o.z = (j + 0.5) * T;
      o.fy = PLAT_H;
      o.vy = 0;
      for (let t = 0; t < 60; t++) {
        moveCircle(o, 0.15, 0, o.r || player.r);
        const g2 = floorY(o.x, o.z);
        o.fy = who === 'player' ? Math.max(g2, o.fy - 0.2) : g2;
      }
      const x0 = o.x;
      moveCircle(o, 0.3, 0, o.r || player.r);
      tested++;
      if (o.x <= x0 && !blocked(x0 + 0.3, o.z, o.r || player.r)) stuck++;
      if (floorY(o.x - (o.r || player.r) + 0.02, o.z) > o.fy + STEP) inside++;
    }
  }
  if (tested !== 6) throw new Error('ledge: expected 6 cases, ran ' + tested);
  if (stuck || inside) throw new Error('ledge check failed');
});
test('progress: depth start = depth*5, boss = depth*5+4 regardless of PER', () => {
  startRun();
  tick(5);
  if (
    progressOf(0) !== 0 ||
    progressOf(PER - 1) !== 4 ||
    progressOf(PER) !== 5 ||
    stageLabel(PER - 1) !== 'D1 BOSS' ||
    stageLabel(PER) !== 'D2 1/' + (PER - 1)
  )
    throw new Error('prog/label ' + [progressOf(PER - 1), progressOf(PER), stageLabel(PER - 1), stageLabel(PER)]);
});
test('shield: front wears the shield, back hurts, then it breaks', () => {
  run.route = [3];
  run.stage = PER * 3 + 1;
  startStage();
  enemies.slice().forEach(e => {
    e.dead = true;
    removeEnemyMesh(e);
  });
  clearWorld('enemy');
  const [sx, sz] = roomSpot(level.rooms[level.startIdx]);
  const e = spawnEnemy('shield', sx, sz, -1, 1);
  if (!isShielded(e)) throw new Error('shield fields');
  e.face = 0;
  e.mesh.rotation.y = 0; // facing +z
  const shoot = (dir: number) => {
    spawnPBullet(new V3(sx, e.fy! + 1.6, sz + dir * 2.5), new V3(0, 0, -dir), 60, 20, 0, 0, 0xffffff, 0, {});
    updatePBullets(0.1);
  }; // above rubble height
  const hp0 = e.hp,
    sh0 = e.shieldHp;
  shoot(1); // from the front
  if (!(e.shieldHp < sh0 && e.hp === hp0)) throw new Error('shield front ' + [e.shieldHp, sh0, e.hp, hp0]);
  shoot(-1); // from behind
  if (!(e.hp < hp0)) throw new Error('shield back');
  for (let k = 0; k < 20 && e.shieldHp > 0; k++) shoot(1);
  if (e.shieldHp > 0 || e.stun <= 0) throw new Error('shield break');
  const hp1 = e.hp;
  shoot(1);
  if (!(e.hp < hp1)) throw new Error('after break');
  removeEnemyMesh(e);
  clearWorld('enemy');
});
test('rocket: the enemy it strikes takes its direct share on top of the blast', () => {
  enemies.slice().forEach(e => {
    e.dead = true;
    removeEnemyMesh(e);
  });
  clearWorld('enemy');
  const was = { crit: player.crit, hp: player.hp, maxHp: player.maxHp };
  player.crit = 0;
  player.hp = 1e6;
  player.maxHp = 1e6;
  const [sx, sz] = roomSpot(level.rooms[level.startIdx]);
  const e = spawnEnemy('brute', sx, sz, -1, 1);
  e.hp = 1e6;
  // a rocket of 10 from 2.5 m in front, with and without the direct share; what the blast does is the same both times
  const hit = (direct: number) => {
    const hp0 = e.hp;
    spawnPBullet(new V3(sx, e.fy! + 1.2, sz + 2.5), new V3(0, 0, -1), 60, 10, 0, 5, 0xffffff, 0, { direct });
    updatePBullets(0.1);
    return hp0 - e.hp;
  };
  const plain = hit(0),
    struck = hit(0.5);
  expect(plain, 'the blast hurts').toBeGreaterThan(0);
  expect(struck - plain).toBeCloseTo(5);
  removeEnemyMesh(e);
  clearWorld('enemy');
  Object.assign(player, was);
});
test('split-shot fan squeezes into SPLIT_FAN.max', () => {
  pBullets.forEach(b => {
    b.alive = false;
  });
  const keep = player.weapons[player.cur];
  player.weapons[player.cur] = newWeapon('rail', 0);
  player.extra = 25;
  player.pitch = 0;
  fire();
  const hs = pBullets
    .filter(b => b.alive)
    .map(b => {
      const l = Math.hypot(b.vx, b.vz);
      return [b.vx / l, b.vz / l];
    });
  let span = 0; // the extra rounds also get up to ±0.02 of random spread on top of the fan
  hs.forEach(a =>
    hs.forEach(b => {
      span = Math.max(span, Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1])));
    }),
  );
  player.weapons[player.cur] = keep;
  player.extra = 0;
  pBullets.forEach(b => {
    b.alive = false;
    b.mesh.visible = false;
  });
  if (hs.length !== 26 || span > SPLIT_FAN.max + 0.045 || span < SPLIT_FAN.max * 0.7)
    throw new Error('split fan ' + hs.length + ' ' + span);
});
test('fast gun fires more than once a frame and a full pool reuses the oldest round', () => {
  const keep = player.weapons[player.cur];
  player.weapons[player.cur] = newWeapon('smg', 0);
  player.weapons[player.cur]!.mag = 1e5;
  player.fireRate = 4.03;
  player.extra = 10;
  player.reloadT = 0;
  player.fireCd = 0;
  const s0 = shotId;
  tick(60);
  const shots = shotId - s0;
  const last = pBullets.filter(b => b.alive && b.shot === shotId).length;
  // fill the whole pool with rounds in flight, then shoot: the new shot's rounds must still all be there
  for (let k = 0; k < 600; k++)
    spawnPBullet(new V3(player.x, 50, player.z), new V3(0, 1, 0), 1, 1, 0, 0, 0xffffff, 0, {});
  player.fireCd = 0;
  fire();
  const fresh = pBullets.filter(b => b.alive && b.shot === shotId).length;
  if (fresh !== 11) throw new Error('full pool dropped the shot: ' + fresh + ' of 11 rounds');
  player.weapons[player.cur] = keep;
  player.fireRate = 1;
  player.extra = 0;
  player.fireCd = 0;
  pBullets.forEach(b => {
    b.alive = false;
    b.mesh.visible = false;
  });
  const want = 1 / (WEAPONS.smg.rate / 4.03); // about 65 a second, more than the 60 frames
  if (shots < want - 2 || shots > want + 2 || last !== 11)
    throw new Error('fast gun ' + shots + ' shots (want ' + want.toFixed(1) + '), last shot ' + last + ' rounds');
});
test('a kit picked up with the kits full is used on the spot', () => {
  const keep = [player.kits, player.maxHp, player.hp];
  player.kits = KIT_MAX;
  player.maxHp = 500;
  player.hp = 100;
  addPickup('kit', player.x, player.z);
  updatePickups(1 / 60);
  updatePickups(1 / 60);
  const healed = player.hp - 100,
    want = kitHealAmount();
  [player.kits, player.maxHp, player.hp] = keep;
  if (healed !== want || want !== 125) throw new Error('kit on the spot healed ' + healed + ' (want ' + want + ')');
});
test("base weapon cards ignore the current run's chips", () => {
  const w = { id: 'shotgun', r: 1, plus: 3, opts: ['rate'] },
    before = weaponStatText(w),
    keep = player,
    dm = player.dmgMul;
  player.dmgMul *= 5;
  player.extra += 3;
  const during = weaponStatText(w);
  player.dmgMul = dm;
  player.extra -= 3;
  if (before !== during || player !== keep || !/\d/.test(before))
    throw new Error('base weapon stats moved with the run: ' + before + ' / ' + during);
});
test('watcher: drones at 75% and 40%', () => {
  startPractice('watcher');
  tick(10);
  if (!boss) spawnBoss('watcher');
  boss!.spawnT = 0;
  boss!.phased = true;
  const drones = () => enemies.filter(o => !o.boss && !o.dead && o.type === 'drone').length;
  boss!.hp = boss!.maxHp * 0.7;
  tick(2);
  const a1 = drones();
  boss!.hp = boss!.maxHp * 0.35;
  tick(2);
  const a2 = drones();
  if (a1 !== 2 || a2 !== 5) throw new Error('watcher drones ' + a1 + ' ' + a2);
  endRun('abandon');
});
test('crusher: hurt below half in its jump, it changes phase once it is down, not in the air', () => {
  startPractice('crusher');
  tick(10);
  if (!boss) spawnBoss('crusher');
  const K = BOSS_META.crusher.tune,
    c = boss as Boss & { st: string };
  c.spawnT = 0;
  c.st = 'slam';
  c.timer = K.slamTime;
  tick(Math.ceil(K.slamTime * 20)); // a third of the way up
  expect(c.mesh.position.y, 'in the air').toBeGreaterThan(1);
  hurtEnemy(c, c.hp - c.maxHp * 0.4, false);
  expect(c.phased, 'not while in the air').toBeFalsy();
  tick(Math.ceil(K.slamTime * 60) + 2);
  expect(c.phased, 'once it has landed').toBe(true);
  expect(c.spawnT, 'the burst runs on the ground').toBeGreaterThan(0);
  endRun('abandon');
});
test('crusher: fires fans as it walks; enraged, a second charge follows the first and only that one stuns', () => {
  startPractice('crusher');
  tick(10);
  if (!boss) spawnBoss('crusher');
  const K = BOSS_META.crusher.tune,
    c = boss as Boss & { st: string; fireT: number; chained: boolean },
    shots = () => eBullets.filter(b => b.alive).length;
  c.spawnT = 0;
  c.phased = true;
  // walking: one fan after walkFireFirst, the next walkFire later
  c.st = 'idle';
  c.timer = 10;
  c.fireT = K.walkFireFirst;
  clearPool(eBullets);
  tick(Math.ceil(K.walkFireFirst * 60) + 2);
  expect(shots(), 'the first fan').toBe(K.walkFan[0]);
  tick(Math.ceil(K.walkFire * 60));
  expect(shots(), 'the second fan').toBe(K.walkFan[0] * 2);
  // while a shockwave spreads it holds its fire
  clearPool(eBullets);
  c.fireT = 0.01;
  spawnWave(c.x, c.z, 0.01, 50, 0, COLOR.amber);
  tick(30);
  expect(shots(), 'no fan while a wave spreads').toBe(0);
  query('wave').forEach(w => {
    w.dead = true;
  });
  tick(3);
  expect(shots(), 'the fan once the wave is gone').toBe(K.walkFan[0]);
  // not enraged: the charge ends in the stun
  const charge = () => {
    c.st = 'charge';
    c.timer = 0;
    tick(1);
  };
  charge();
  expect(c.st, 'a charge ends in the stun').toBe('stun');
  // enraged: the first charge is followed by a second (no stun), and that one ends in the stun
  c.hp = c.maxHp * 0.4;
  charge();
  expect([c.st, c.chained], 'the first of the pair turns round').toEqual(['tele', true]);
  tick(Math.ceil(K.chainTele * 60) + 2);
  expect(c.st, 'and charges again').toBe('charge');
  charge();
  expect([c.st, c.chained], 'the second ends in the stun').toEqual(['stun', false]);
  endRun('abandon');
});
test('scaling: additive damage chips, compounding health, practice depth', () => {
  const p0 = newPlayer(save.loadout),
    base = p0.dmgMul,
    od = PERKS.find(x => x.id === 'overload')!;
  od.apply(p0, od.v);
  od.apply(p0, od.v);
  if (Math.abs(p0.dmgMul - (base + 0.4)) > 1e-9) throw new Error('additive chips ' + p0.dmgMul);
  const perk = (n: string) => PERKS.find(x => x.id === n)!;
  for (let k = 0; k < 6; k++) ['crit', 'reload', 'mag'].forEach(n => perk(n).apply(p0, perk(n).rv!));
  if (Math.abs(p0.reloadMul - 0.4) > 1e-9 || Math.abs(p0.magMul - 2.5) > 1e-9)
    throw new Error('caps ' + p0.reloadMul + ' ' + p0.magMul);
  const keepP = player;
  setPlayer(p0);
  const cc = critChance();
  setPlayer(keepP);
  // split-shot: full-hit total must go up by exactly 20% for a single-shot weapon and for the shotgun alike
  {
    const keep = player;
    setPlayer(newPlayer(save.loadout));
    ['rail', 'shotgun'].forEach(id => {
      const w = newWeapon(id, 0),
        a = weaponStats(w);
      player.extra = 1;
      const b = weaponStats(w);
      player.extra = 0;
      if (Math.abs((b.perHit * b.hits) / (a.perHit * a.hits) - 1.2) > 1e-9) throw new Error('split ' + id);
    });
    // split-shot stops being offered at SPLIT_MAX; the launcher fires 3 rockets at most and the rest of the
    // +20%s goes into each rocket (the total stays 1 + 0.2 x chips)
    const sp = PERKS.find(x => x.id === 'split')!;
    player.extra = SPLIT_MAX;
    if (!sp.maxed!(player)) throw new Error('split cap');
    player.extra = 5;
    const lw = newWeapon('launcher', 0),
      ls = weaponStats(lw);
    player.extra = 0;
    const l0 = weaponStats(lw);
    if (ls.hits !== 3 || Math.abs((ls.perHit * ls.hits) / l0.perHit - 2) > 1e-9)
      throw new Error('launcher split ' + ls.hits + ' ' + ls.perHit / l0.perHit);

    setPlayer(keep);
  }
  if (cc !== TUNE.critCap) throw new Error('crit cap ' + cc);
  setRun({ stage: PER - 1, route: [0] } as RunState);
  const b1 = bossDifficulty();
  setRun({ stage: 2 * PER + PER - 1, route: [0] } as RunState);
  const b3 = bossDifficulty();
  if (Math.abs(b1 - 1.33 * BOSS_TUNE.hpMul) > 1e-9 || Math.abs(b3 / b1 - BOSS_TUNE.growth * BOSS_TUNE.growth) > 1e-6)
    throw new Error('boss scaling ' + b1 + ' ' + b3);
  if (Math.abs(difficultyAt(0) - ENEMY_TUNE.hpMul) > 1e-9) throw new Error('enemy hp base ' + difficultyAt(0));
  // the per-depth factor slides from the early rate down to the late one (GROWTH_SLIDE) and never goes back up
  const bossAt = (d: number) => {
    setRun({ stage: (d - 1) * PER + PER - 1, route: [0] } as RunState);
    return bossDifficulty();
  };
  const slides = (at: (d: number) => number, early: number, late: number, what: string) => {
    const r = Array.from({ length: 18 }, (_, i) => at(i + 2) / at(i + 1)); // D1->D2 .. D18->D19
    if (Math.abs(r[0]! - early) > 1e-6 || Math.abs(r[r.length - 1]! - late) > 1e-6)
      throw new Error(what + ' ends ' + r[0] + ' ' + r[r.length - 1]);
    if (r.some((v, i) => i && v > r[i - 1]! + 1e-9))
      throw new Error(what + ' rate went up ' + r.map(v => v.toFixed(3)));
  };
  slides(bossAt, BOSS_TUNE.growth, BOSS_TUNE.lateGrowth, 'boss growth');
  slides(d => difficultyAt((d - 1) * PER), DEPTH_HP_GROWTH, DEPTH_HP_LATE, 'enemy growth');
  // values that grow with depth: hazard floors and your own rockets hit like enemies do (damageScaleAt),
  // a med kit heals a share of max HP once that is more than kitHeal
  setRun({ stage: 13 * PER, route: [0] } as RunState);
  if (Math.abs(damageScaleAt(0) - 1) > 1e-9 || !(damageScaleAt(13 * PER) > 3))
    throw new Error('damage scale ' + damageScaleAt(13 * PER));
  {
    const keep = player;
    setPlayer(newPlayer(save.loadout));
    player.maxHp = 100;
    const a = kitHealAmount();
    player.maxHp = 500;
    const b = kitHealAmount();
    setPlayer(keep);
    if (a !== TUNE.kitHeal || b !== Math.round(500 * TUNE.kitHealPct)) throw new Error('kit heal ' + a + ' ' + b);
  }
  startPractice('trinity', 2);
  tick(5);
  if (stageLabel(run.stage) !== 'D3 BOSS') throw new Error('practice depth ' + stageLabel(run.stage));
  endRun('abandon');
});
test('pickup: stow goes to the bag, equip swaps with the weapon in hand', () => {
  startRun();
  tick(5);
  clearWorld('pickup');
  player.weapons = [newWeapon('pistol', 0, true), newWeapon('smg', 0)];
  player.cur = 0;
  player.bag = [null, null, null, null];
  const drop = (id: string) => {
    addPickup('weapon', player.x, player.z, { w: newWeapon(id, 1) });
    updatePickups(0);
  };
  drop('rail');
  stowNearby();
  if (!player.bag[0] || player.bag[0].id !== 'rail') throw new Error('stow');
  drop('shotgun');
  equipNearby();
  if (
    player.weapons[0]!.id !== 'shotgun' ||
    !query<Pickup>('pickup').some(p => p.kind === 'weapon' && p.w!.id === 'pistol')
  )
    throw new Error('equip swap');
  player.bag = [newWeapon('smg', 0), newWeapon('smg', 0), newWeapon('smg', 0), newWeapon('smg', 0)];
  clearWorld('pickup');
  drop('launcher');
  stowNearby();
  if (player.bag.some(w => w?.id === 'launcher') || !nearPickup) throw new Error('stow into a full bag');
  endRun('abandon');
});
test('pickup prompt: the buttons follow slot changes made while it is up (bag screen)', () => {
  startRun();
  tick(5);
  clearWorld('pickup');
  player.weapons = [newWeapon('pistol', 0, true), null];
  player.cur = 0;
  player.bag = [null, null, null, null];
  addPickup('weapon', player.x, player.z, { w: newWeapon('rail', 1) });
  updatePickups(0);
  updateHud();
  if (el('#btnStow').textContent !== t('hud.btnStow', { n: 4 }))
    throw new Error('stow label ' + el('#btnStow').textContent);
  if (el('#btnEquip').textContent !== t('hud.btnEquip2')) throw new Error('equip label');
  // what the bag screen does: fill a bag slot, then put a weapon in slot 2 (one change at a time)
  player.bag[0] = newWeapon('smg', 0);
  updateHud();
  if (el('#btnStow').textContent !== t('hud.btnStow', { n: 3 }))
    throw new Error('stale stow label ' + el('#btnStow').textContent);
  player.weapons[1] = newWeapon('smg', 0);
  updateHud();
  if (el('#btnEquip').textContent !== t('hud.btnSwap')) throw new Error('stale equip label');
  endRun('abandon');
});
test('viewmodels: no two parts have a flat face in the same place (it would flicker)', () => {
  // each part as an axis-aligned box; a cylinder is round on its sides, so only its end caps (along z) count
  const bounds = (p: (string | number)[]) => {
    const n = p.map(Number);
    return p[0] === 'cyl'
      ? { cyl: true, lo: [n[4] - n[1], n[5] - n[1], n[6] - n[2] / 2], hi: [n[4] + n[1], n[5] + n[1], n[6] + n[2] / 2] }
      : {
          cyl: false,
          lo: [n[5] - n[1] / 2, n[6] - n[2] / 2, n[7] - n[3] / 2],
          hi: [n[5] + n[1] / 2, n[6] + n[2] / 2, n[7] + n[3] / 2],
        };
  };
  const clash: string[] = [];
  for (const [id, def] of Object.entries(VIEWMODELS)) {
    const bs = def.parts.map(bounds);
    for (let a = 0; a < bs.length; a++)
      for (let b = a + 1; b < bs.length; b++)
        for (let ax = 0; ax < 3; ax++) {
          if ((bs[a].cyl || bs[b].cyl) && ax !== 2) continue;
          for (const side of ['lo', 'hi'] as const) {
            if (Math.abs(bs[a][side][ax] - bs[b][side][ax]) > 1e-9) continue;
            const others = [0, 1, 2].filter(k => k !== ax);
            if (others.every(k => Math.min(bs[a].hi[k], bs[b].hi[k]) - Math.max(bs[a].lo[k], bs[b].lo[k]) > 1e-9))
              clash.push(`${id} parts ${a}/${b} ${'xyz'[ax]} ${side}`);
          }
        }
  }
  expect(clash).toEqual([]);
});
test('gun looks: every weapon has one, and no two of its parts have a flat face in the same place', () => {
  const clash: string[] = [];
  for (const id of WEAPON_ORDER) {
    expect(hasGunLook(id), id).toBe(true);
    const g = gunLook(id, 0xffffff);
    expect(g.userData.tip && g.userData.flash && g.userData.pos, `${id}: what the game reads from a gun`).toBeTruthy();
    // each part as an axis-aligned box; a cylinder only counts by its end caps (along z); tilted parts are left out
    const bs = g.children.flatMap(c => {
      const geo = (c as THREE.Mesh).geometry as THREE.BufferGeometry & { parameters?: Record<string, number> },
        q = geo?.parameters,
        at = c.position;
      if (!q || geo.type === 'SphereGeometry') return [];
      const cyl = geo.type === 'CylinderGeometry';
      if (!cyl && c.rotation.x !== 0) return [];
      const half = cyl ? [q.radiusTop!, q.radiusTop!, q.height! / 2] : [q.width! / 2, q.height! / 2, q.depth! / 2],
        mid = [at.x, at.y, at.z];
      return [{ cyl, lo: mid.map((v, k) => v - half[k]!), hi: mid.map((v, k) => v + half[k]!) }];
    });
    for (let a = 0; a < bs.length; a++)
      for (let b = a + 1; b < bs.length; b++)
        for (let ax = 0; ax < 3; ax++) {
          if ((bs[a]!.cyl || bs[b]!.cyl) && ax !== 2) continue;
          for (const side of ['lo', 'hi'] as const) {
            if (Math.abs(bs[a]![side][ax]! - bs[b]![side][ax]!) > 1e-9) continue;
            const others = [0, 1, 2].filter(k => k !== ax);
            if (
              others.every(k => Math.min(bs[a]!.hi[k]!, bs[b]!.hi[k]!) - Math.max(bs[a]!.lo[k]!, bs[b]!.lo[k]!) > 1e-9)
            )
              clash.push(`${id} parts ${a}/${b} ${'xyz'[ax]} ${side}`);
          }
        }
  }
  expect(clash).toEqual([]);
});
test('map: an enemy on a seen tile shows, asleep or awake; one on a tile not seen does not', () => {
  startRun();
  tick(3);
  enemies.slice().forEach(e => {
    e.dead = true;
    removeEnemyMesh(e);
  });
  clearWorld('enemy');
  const [cx, cz] = roomSpot(level.rooms[level.startIdx]);
  const e = spawnEnemy('crawler', cx, cz, -1, 1),
    shown = () => markers(false).some(m => m.shape === 'dot' && m.x === e.x && m.z === e.z);
  e.active = false; // asleep
  level.seen[tileIndex(e.x, e.z)] = 1;
  expect(shown(), 'asleep on a seen tile').toBe(true);
  level.seen[tileIndex(e.x, e.z)] = 0;
  expect(shown(), 'on a tile not seen').toBe(false);
  endRun('abandon');
});
test('chain blast: one kill in a tight cluster does not cascade', () => {
  startRun();
  tick(3);
  enemies.slice().forEach(e => {
    e.dead = true;
    removeEnemyMesh(e);
  });
  clearWorld('enemy');
  player.chain = 3;
  const [cx, cz] = roomSpot(level.rooms[level.startIdx]);
  const line = [0, 2.8, 5.6, 8.4].map(dx => spawnEnemy('crawler', cx + dx, cz, -1, 1)); // each 2.8m apart, blast radius 4
  line.forEach(e => (e.hp = 1)); // any blast that touches one kills it
  hurtEnemy(line[0], 1e6, false);
  const alive = line.filter(e => !e.dead).length;
  if (alive !== 2) throw new Error('chain cascade: alive ' + alive);
  endRun('abandon');
});
test('chain blast: as big as the enemy that blew up, whatever the damage chips; no wider than 4.5 m', () => {
  startRun();
  tick(3);
  enemies.slice().forEach(e => {
    e.dead = true;
    removeEnemyMesh(e);
  });
  clearWorld('enemy');
  player.chain = 1;
  const [cx, cz] = roomSpot(level.rooms[level.startIdx]);
  // what a brute beside it loses when this one is killed (a blast may crit: the smallest of a few)
  const lossBy = (type: string): number => {
    const losses: number[] = [];
    for (let n = 0; n < 8; n++) {
      const small = spawnEnemy(type, cx, cz, -1, 1),
        big = spawnEnemy('brute', cx + 0.5, cz, -1, 1);
      hurtEnemy(small, 1e6, false);
      losses.push((big.maxHp - big.hp) / small.maxHp);
      big.hp = 1e9; // (not blown up in turn by the next kill)
      [small, big].forEach(e => {
        e.dead = true;
        removeEnemyMesh(e);
      });
      clearWorld('enemy');
    }
    return Math.min(...losses);
  };
  expect(lossBy('crawler'), 'a share of the health of the one killed').toBeCloseTo(0.3, 5);
  expect(lossBy('brute')).toBeCloseTo(0.3, 5);
  player.dmgMul = 10;
  expect(lossBy('crawler'), 'damage chips do not count').toBeCloseTo(0.3, 5);
  // the radius stops growing at 4.5 m: with many chips, an enemy 6.5 m off is not touched, one 3.5 m off is
  player.dmgMul = 1;
  player.chain = 20;
  const dead = spawnEnemy('crawler', cx, cz, -1, 1),
    near = spawnEnemy('brute', cx + 3.5, cz, -1, 1),
    far = spawnEnemy('brute', cx, cz + 6.5, -1, 1);
  [near, far].forEach(e => {
    e.maxHp = 1e9;
    e.hp = 1e9;
  });
  hurtEnemy(dead, 1e6, false);
  expect(near.hp < near.maxHp && far.hp === far.maxHp).toBe(true);
  endRun('abandon');
});
test('shortcut supply: 2 picks at DEPTH 3, chips applied supplyTimes times', () => {
  const keep = [save.shortcut, save.startTier, save.up.chip];
  save.shortcut = 2;
  save.startTier = 2;
  save.up.chip = 0;
  goBase();
  startRun();
  tick(3);
  const pick = (id: string) => {
    const cards = [...document.querySelectorAll<HTMLElement>('#perkList .perk')];
    const c = cards.find(b => b.querySelector('.pn')!.textContent!.includes(perkName(id))) || cards[0]!;
    c.click();
  };
  if (!document.querySelector('#perkList .pn')!.textContent!.includes('×' + TUNE.supplyTimes))
    throw new Error('supply card label');
  pick('overload');
  pick('overload');
  [save.shortcut, save.startTier, save.up.chip] = keep;
  // a capped chip (pierce, crit, reload, magazine) stops once maxed: after 3-4 of the supplyTimes, or after 2 when
  // the card is the rare version (the cards are random, so the wanted chip is not always among them)
  if (run.perks.length < 4 || run.perks.length > 2 * TUNE.supplyTimes)
    throw new Error('supply picks ' + run.perks.length);
  // the heal chip is never a supply pick; stamina regen and pickup range add up per chip instead of multiplying
  for (let k = 0; k < 40; k++) {
    openPerk('test', 'loadout', undefined, TUNE.supplyTimes);
    if ([...document.querySelectorAll('#perkList .pn')].some(n => n.textContent!.includes(perkName('repair'))))
      throw new Error('repair offered as supply');
  }
  show(null);
  setState('play');
  {
    const keep = player;
    setPlayer(newPlayer(save.loadout));
    const r0 = player.stRegen,
      sp = PERKS.find(x => x.id === 'sprint')!,
      mg = PERKS.find(x => x.id === 'magnet')!;
    for (let k = 0; k < 5; k++) {
      sp.apply(player, sp.v);
      mg.apply(player, mg.v);
    }
    const regen = player.stRegen - r0,
      range = player.magnet;
    // the stamina regen stops at its cap (without one, a dash was back in a moment and the player dashed without end)
    for (let k = 0; k < 20; k++) sp.apply(player, sp.rv!);
    const capped = player.stRegen === TUNE.staminaRegenCap && sp.maxed!(player);
    setPlayer(keep);
    if (Math.abs(regen - 5 * sp.v * TUNE.staminaRegen) > 1e-9 || Math.abs(range - 5) > 1e-9)
      throw new Error('additive chips ' + regen + ' ' + range);
    if (!capped) throw new Error('the stamina regen has a cap');
  }
  // deep drops: rarer on the whole, but not all ★★★
  {
    const rs = Array.from({ length: 400 }, () => rollWeapon(100).r),
      top = rs.filter(r => r === 2).length / rs.length;
    if (!(top > 0.4 && top < 0.7) || !rs.includes(0)) throw new Error('deep rarity ' + top);
  }
  endRun('abandon');
  goBase();
});
test("the start chips' pick: the camera is already on the player, not where the base's backdrop left it", () => {
  const keep = save.up.chip;
  save.up.chip = 1;
  goBase();
  // where the backdrop could have left the camera (flow/attract.ts)
  camera.position.set(-50, 1, -50);
  camera.rotation.set(-0.05, 2, 0);
  startRun();
  save.up.chip = keep;
  expect(stateIs('perk')).toBe(true);
  expect(Math.hypot(camera.position.x - player.x, camera.position.z - player.z)).toBeLessThan(1e-6);
  expect(camera.rotation.y).toBeCloseTo(player.yaw);
  document.querySelector<HTMLElement>('#perkList .perk')!.click();
  endRun('abandon');
  goBase();
});
test('rare chips show up gold; deep sectors favour tougher enemy types', () => {
  startRun();
  tick(3);
  const keep = TUNE.rareChipChance;
  TUNE.rareChipChance = 1;
  openPerk('test');
  const rareCards = document.querySelectorAll('#perkList .perk.rare').length;
  TUNE.rareChipChance = keep;
  player.hp = 1; // so a healing chip also visibly changes something
  const before = JSON.stringify(player);
  document.querySelector<HTMLElement>('#perkList .perk.rare')!.click();
  if (!rareCards || JSON.stringify(player) === before || !run.perks[run.perks.length - 1].endsWith('+'))
    throw new Error('rare chip');
  player.crit = TUNE.critCap;
  player.reloadMul = 0.4;
  player.magMul = 2.5;
  player.pierce = 3;
  for (let k = 0; k < 30; k++) {
    openPerk('test');
    const names = [...document.querySelectorAll('#perkList .pn')].map(n => n.textContent),
      maxedNames = ['crit', 'reload', 'mag', 'pierce'].map(id => perkName(id));
    if (names.some(n => maxedNames.some(m => n.replace(/^★ /, '').replace(/\+$/, '') === m)))
      throw new Error('maxed chip offered ' + names);
  }
  show(null);
  setState('play');
  let elite = 0;
  for (let k = 0; k < 400; k++) if (ELITE_TYPES.includes(pickEnemyType(BIOMES[3], 10))) elite++;
  let elite0 = 0;
  for (let k = 0; k < 400; k++) if (ELITE_TYPES.includes(pickEnemyType(BIOMES[3], 0))) elite0++;
  if (!(elite > elite0)) throw new Error('elite bias ' + elite0 + ' ' + elite);
  endRun('abandon');
});
test('autofire target: a fogged enemy is not picked, a close one is', () => {
  startRun();
  tick(3);
  enemies.slice().forEach(e => {
    e.dead = true;
    removeEnemyMesh(e);
  });
  clearWorld('enemy');
  (scene.fog as THREE.Fog).near = 2;
  (scene.fog as THREE.Fog).far = 20; // visibleRange = 12.8
  grid.fill(1);
  hgt.fill(0);
  ramp.fill(-1);
  cover.fill(0); // open floor so only distance matters
  activeTileGrid().world.door?.fill(0);
  player.x = (W * T) / 2;
  player.z = (H * T) / 2;
  player.yaw = 0;
  player.pitch = 0;
  player.fy = 0;
  camera.position.set(player.x, EYE, player.z);
  camera.rotation.set(0, 0, 0);
  const far = spawnEnemy('crawler', player.x, player.z - 20, -1, 1);
  far.mesh.position.set(far.x, EYE, far.z);
  const t1 = findTarget();
  far.z = player.z - 8;
  far.mesh.position.set(far.x, EYE, far.z);
  const t2 = findTarget();
  if (t1 || !t2) throw new Error('fog target ' + !!t1 + ' ' + !!t2);
  endRun('abandon');
});
test('shotgun knockback once per shot; launcher gets half the magazine chips', () => {
  startRun();
  tick(3);
  enemies.slice().forEach(e => {
    e.dead = true;
    removeEnemyMesh(e);
  });
  clearWorld('enemy');
  grid.fill(1);
  hgt.fill(0);
  ramp.fill(-1);
  cover.fill(0);
  activeTileGrid().world.door?.fill(0); // a building floor has doors: none in the way here
  player.x = (W * T) / 2;
  player.z = (H * T) / 2;
  player.fy = 0;
  const e = spawnEnemy('brute', player.x, player.z - 4, -1, 50);
  e.fy = 0;
  e.mesh.position.set(e.x, 1.1, e.z);
  const z0 = e.z;
  for (let k = 0; k < 8; k++)
    spawnPBullet(new V3(player.x + rand(-0.2, 0.2), 1.1, player.z), new V3(0, 0, -1), 65, 1, 0, 0, 0xffffff, 0, {
      kb: WEAPONS.shotgun.kb,
      shot: 999,
    });
  updatePBullets(0.1);
  const pushed = z0 - e.z;
  if (!(pushed > 0.5 && pushed < WEAPONS.shotgun!.kb! + 0.05)) throw new Error('knockback ' + pushed);
  player.magMul = 2.5;
  if (magSize(newWeapon('launcher', 0)) > 5 || magSize(newWeapon('smg', 0)) < 110)
    throw new Error('mag chips ' + magSize(newWeapon('launcher', 0)));
  endRun('abandon');
});
test('every type drops regardless of unlocks; base weapons are issued for the start depth', () => {
  const keepU = save.unlocked,
    keepL = save.loadout,
    keepS = [save.shortcut, save.startTier];
  save.unlocked = { pistol: true };
  const ids = new Set();
  for (let k = 0; k < 400; k++) ids.add(pickDrop());
  if (ids.size !== WEAPON_ORDER.length) throw new Error('drop pool should have every type: ' + [...ids]);
  save.loadout = [basicW('rail'), null];
  const got: number[] = [];
  for (const tier of [0, 9]) {
    save.shortcut = tier;
    save.startTier = tier;
    startRun();
    tick(2);
    const w = player.weapons[0]!;
    // (★ at DEPTH 1, ★★ at DEPTH 10: supplyRarity)
    if (w.id !== 'rail' || w.r !== supplyRarity(tier) || w.r !== (tier ? 1 : 0) || !w.basic)
      throw new Error('issued basic ' + JSON.stringify(w));
    got.push(w.plus || 0);
    endRun('abandon');
  }
  save.unlocked = keepU;
  save.loadout = keepL;
  [save.shortcut, save.startTier] = keepS;
  persist();
  // (DEPTH 10: what drops there, a little under it)
  if (got[0] !== 0 || got[1] !== supplyPlus(progressOf(9 * PER)) || !(got[1]! > 5)) throw new Error('issued + ' + got);
});
test('milestones: dying goes back to the last one passed, coming back keeps the depth; old mods are paid back', () => {
  if ([0, 3, 4, 8, 9, 13, 14].map(milestoneBelow).join() !== '0,0,4,4,9,9,14') throw new Error('milestones');
  const keepS = [save.shortcut, save.startTier];
  save.shortcut = 12;
  save.startTier = 12;
  startRun();
  endRun('dead');
  const dead = [save.shortcut, save.startTier];
  save.shortcut = 12;
  save.startTier = 12;
  startRun();
  endRun('extract');
  const back = save.shortcut;
  [save.shortcut, save.startTier] = keepS;
  goBase();
  if (dead.join() !== '9,9' || back !== 12) throw new Error('milestone ' + dead + ' ' + back);
  // a save from before the issue: its base weapons' mods come back as bits (+1 50, +2 75, ★★ 300)
  const old = { ...defaultSave(), bits: 5, mods: { pistol: { plus: 2, r: 1 } } } as Record<string, unknown>;
  delete old.supplyV;
  if (!importSave(encodeStore('SDX1', old))) throw new Error('old save code');
  const paid = [save.bits, Object.keys(save.mods).length];
  el('#btnWipe').click();
  el('#btnWipeGo').click();
  if (paid.join() !== [5 + 50 + 75 + 300, 0].join()) throw new Error('mods paid back ' + paid);
});
test('splitter killed by a chain blast or a rocket: both halves survive', () => {
  startRun();
  tick(3);
  enemies.slice().forEach(e => {
    e.dead = true;
    removeEnemyMesh(e);
  });
  clearWorld('enemy');
  grid.fill(1);
  hgt.fill(0);
  ramp.fill(-1);
  cover.fill(0);
  activeTileGrid().world.door?.fill(0); // a building floor has doors: none in the way here
  const cx = (W * T) / 2,
    cz = (H * T) / 2;
  player.chain = 3;
  player.dmgMul = 10;
  let s = spawnEnemy('splitter', cx, cz, -1, 1);
  hurtEnemy(s, 1e6, false);
  const a1 = enemies.filter(e => !e.dead && !e.boss && e.type === 'mini').length;
  player.chain = 0;
  s = spawnEnemy('splitter', cx + 10, cz, -1, 1);
  explode(s.x, 1, s.z, 5, 1e6, COLOR.fire, true);
  const a2 = enemies.filter(e => !e.dead && !e.boss && e.type === 'mini').length;
  if (a1 !== 2 || a2 !== 4) throw new Error('splitter halves ' + a1 + ' ' + a2);
  endRun('abandon');
});
test('knockback: a rocket pushes what walks away, never a turret bolted to the floor', () => {
  startRun();
  tick(3);
  enemies.slice().forEach(e => {
    e.dead = true;
    removeEnemyMesh(e);
  });
  clearWorld('enemy');
  grid.fill(1);
  hgt.fill(0);
  ramp.fill(-1);
  cover.fill(0);
  activeTileGrid().world.door?.fill(0);
  const cx = (W * T) / 2,
    cz = (H * T) / 2,
    // the blast between them, 2 m from each
    walker = spawnEnemy('brute', cx - 2, cz, -1, 1),
    turret = spawnEnemy('turret', cx + 2, cz, -1, 1),
    bastions = spawnEnemy('bturret', cx, cz + 2, -1, 1);
  explode(cx, 1, cz, 5, 1, COLOR.fire, true);
  expect(walker.x, 'the brute is pushed').toBeLessThan(cx - 2.5);
  expect([turret.x, turret.z], 'the turret stays').toEqual([cx + 2, cz]);
  expect([bastions.x, bastions.z], "BASTION's turret stays").toEqual([cx, cz + 2]);
  endRun('abandon');
});
test('mortar: a round puts a ring where the player stood, then hurts only whoever is still in it', () => {
  // two rounds on an open floor: in the first the player stays put, in the second steps out of the ring
  const lands = (stepOut: number) => {
    startRun();
    tick(3);
    enemies.slice().forEach(e => {
      e.dead = true;
      removeEnemyMesh(e);
    });
    clearWorld('enemy');
    clearWorld('shell');
    grid.fill(1);
    hgt.fill(0);
    ramp.fill(-1);
    cover.fill(0);
    activeTileGrid().world.door?.fill(0);
    const cx = (W * T) / 2,
      cz = (H * T) / 2;
    player.x = cx;
    player.z = cz;
    player.fy = floorY(cx, cz);
    const m = spawnEnemy('mortar', cx, cz + 12, -1, 1);
    m.active = true;
    m.cd = 0;
    for (let k = 0; k < 30 && !m.shots; k++) update(1 / 60);
    expect(m.shots, 'the mortar fired').toBe(1);
    const shell = query<MortarShell>('shell')[0]!;
    expect(shell, 'a round is in the air').toBeTruthy();
    expect([shell.tx, shell.tz], "aimed at the player's feet").toEqual([cx, cz]);
    expect(shell.mesh.children.length, 'the round, the ring and its fill').toBe(3);
    expect(shell.fill.scale.x, 'the ring has barely begun to fill').toBeLessThan(0.5);
    // the mortar dies; the round still falls
    m.dead = true;
    removeEnemyMesh(m);
    clearWorld('enemy');
    player.x += stepOut;
    player.hp = 1e6;
    player.maxHp = 1e6;
    player.inv = 0;
    const hp0 = player.hp;
    update(0.7);
    expect(shell.dead, 'still flying halfway').toBeFalsy();
    expect(shell.fill.scale.x, 'the ring is about half full').toBeGreaterThan(MORTAR_BLAST_R * 0.3);
    for (let k = 0; k < 60 && !shell.dead; k++) update(1 / 60);
    expect(shell.dead, 'it landed').toBe(true);
    const lost = hp0 - player.hp;
    endRun('abandon');
    return { lost, dmg: shell.dmg };
  };
  const hit = lands(0);
  expect(hit.lost, 'standing in the ring').toBe(hit.dmg);
  expect(lands(MORTAR_BLAST_R + 0.5).lost, 'outside the ring').toBe(0);
});
test('repair drone: mends the most worn enemy near it, then the next, and flies off from the player', () => {
  // on an open floor: a worn brute and a slightly worn shield, both held where they are, and a repair drone by them
  startRun();
  tick(3);
  enemies.slice().forEach(e => {
    e.dead = true;
    removeEnemyMesh(e);
  });
  clearWorld('enemy');
  grid.fill(1);
  hgt.fill(0);
  ramp.fill(-1);
  cover.fill(0);
  activeTileGrid().world.door?.fill(0);
  const cx = (W * T) / 2,
    cz = (H * T) / 2;
  player.x = cx;
  player.z = cz;
  player.fy = floorY(cx, cz);
  player.hp = 1e6;
  player.maxHp = 1e6;
  const b = spawnEnemy('brute', cx, cz + 20, -1, 1),
    s = spawnEnemy('shield', cx + 4, cz + 20, -1, 1),
    m = spawnEnemy('medic', cx, cz + 25, -1, 1);
  for (const e of [b, s, m]) e.active = true;
  b.stun = 1e6;
  s.stun = 1e6;
  b.hp = b.maxHp * 0.4;
  s.hp = s.maxHp * 0.9;
  tick(12);
  expect(m.patient, 'the brute is the more worn').toBe(b);
  expect(m.laser!.visible, 'the beam is on').toBe(true);
  const hp0 = b.hp;
  tick(60);
  expect((b.hp - hp0) / b.maxHp, 'about a tenth of its hit points a second').toBeGreaterThan(0.08);
  expect((b.hp - hp0) / b.maxHp).toBeLessThan(0.12);
  b.hp = b.maxHp;
  tick(42);
  expect(m.patient, 'the brute is whole: on to the shield').toBe(s);
  s.hp = s.maxHp;
  tick(42);
  expect(m.patient, 'nothing left to mend').toBeNull();
  expect(m.laser!.visible, 'the beam is off').toBe(false);
  player.x = m.x;
  player.z = m.z - 4;
  const d0 = distXZ(player, m);
  tick(30);
  expect(distXZ(player, m), 'it flies away from the player').toBeGreaterThan(d0 + 1);
  expect(m.hp, 'it was never hurt').toBe(m.maxHp);
  endRun('abandon');
});
// HOIST in the boss arena: the boss ready to act, its trolley over the middle, nothing else in the arena
type HoistTest = Boss & {
  st: string;
  gunT: number;
  cargo: { x: number; fill: { material: { opacity: number } } } | null;
};
function hoistReady(): HoistTest {
  startPractice('hoist');
  tick(10);
  if (!boss) spawnBoss('hoist');
  const h = boss as HoistTest;
  h.spawnT = 0;
  h.phased = true; // (the phase change has its own test)
  h.timer = 1e6;
  h.gunT = 1e6; // (the guns have their own test)
  h.x = h.cx;
  h.z = h.cz;
  joy.x = 0;
  joy.y = 0;
  setFireHeld(false);
  player.maxHp = 1e6;
  player.hp = 1e6;
  player.inv = 0;
  return h;
}
test('hoist: the trolley trails the player at a steady speed along each axis', () => {
  const K = BOSS_META.hoist.tune,
    h = hoistReady();
  player.x = h.cx + 15;
  player.z = h.cz - 12;
  h.st = 'chase';
  const frames = 60;
  for (let k = 0; k < frames; k++) update(1 / 60);
  expect(h.x - h.cx, 'x: a second of chase').toBeCloseTo(K.chase, 0);
  expect(h.cz - h.z, 'z: the same').toBeCloseTo(K.chase, 0);
  expect(h.mesh.position.y, 'the magnet hangs 4 to 5 m up').toBeGreaterThan(4);
  expect(h.mesh.position.y).toBeLessThan(5);
  endRun('abandon');
});
test('hoist: a load hangs over the player with a shadow that fills, then falls and hurts only whoever is in the ring', () => {
  const K = BOSS_META.hoist.tune;
  const drop = (stepOut: number) => {
    const h = hoistReady();
    player.x = h.cx + 6;
    player.z = h.cz + 6;
    h.x = player.x;
    h.z = player.z;
    h.st = 'approach';
    h.timer = K.approachMax;
    update(1 / 60);
    expect(h.st, 'the load is up').toBe('hang');
    expect(h.cargo, 'with its shadow').toBeTruthy();
    const faint = h.cargo!.fill.material.opacity,
      hp0 = player.hp;
    for (let k = 0; k < (K.warn * 60) / 2; k++) update(1 / 60);
    expect(h.cargo!.fill.material.opacity, 'the shadow fills').toBeGreaterThan(faint);
    expect(player.hp, 'nothing falls yet').toBe(hp0);
    player.x += stepOut;
    for (let k = 0; k < 180 && h.st !== 'chase'; k++) update(1 / 60);
    expect(h.st, 'it fell and landed').toBe('chase');
    expect(h.cargo, 'the load is gone').toBeNull();
    const lost = hp0 - player.hp,
      dmg = h.dmg * K.dropDmg;
    endRun('abandon');
    return { lost, dmg };
  };
  const hit = drop(0);
  expect(hit.lost, 'standing in the ring').toBeCloseTo(hit.dmg, 6);
  // (well outside: the crawler that the broken load lets out lands 1.6 m from its middle, any way round)
  expect(drop(K.shadowR + 2.5).lost, 'outside the ring').toBe(0);
});
test('hoist: the magnet drags the player toward the point under it, and the load falls there', () => {
  const K = BOSS_META.hoist.tune,
    h = hoistReady();
  player.x = h.cx - 12;
  player.z = h.cz;
  h.st = 'wind';
  h.timer = K.pullWind;
  const d0 = distXZ(player, h);
  for (let k = 0; k < Math.ceil((K.pullWind + 1) * 60); k++) update(1 / 60);
  expect(h.st, 'a second into the pull').toBe('pull');
  expect(d0 - distXZ(player, h), 'dragged about pullSpeed metres').toBeGreaterThan(K.pullSpeed * 0.8);
  expect(player.x, 'toward the magnet').toBeGreaterThan(h.cx - 12);
  for (let k = 0; k < 4 * 60 && h.st !== 'hang'; k++) update(1 / 60);
  expect(h.st, 'then the load').toBe('hang');
  expect(h.cargo!.x, 'under the magnet').toBe(h.x);
  expect(distXZ(player, h), 'and the player is under it').toBeLessThan(K.shadowR);
  endRun('abandon');
});
test('hoist: a load that breaks lets a crawler out, two below half health, up to the cap of minions', () => {
  const K = BOSS_META.hoist.tune;
  const land = (hpShare: number, others: number) => {
    const h = hoistReady(),
      crawlers = () => enemies.filter(o => !o.boss && !o.dead && o.type === 'crawler').length;
    h.hp = h.maxHp * hpShare;
    player.x = h.cx + 10;
    player.z = h.cz - 10;
    for (let k = 0; k < others; k++) spawnMinion('crawler', h.cx - 10 - k, h.cz + 10);
    const before = crawlers();
    h.st = 'approach';
    h.timer = 0;
    for (let k = 0; k < 240 && !(h.st === 'chase' && !h.cargo); k++) update(1 / 60);
    const out = crawlers() - before;
    endRun('abandon');
    return out;
  };
  expect(land(0.4, 0), 'two out').toBe(K.crawlers);
  expect(land(0.4, K.minionCap - 1), 'room for one').toBe(1);
  expect(land(0.4, K.minionCap), 'at the cap').toBe(0);
  expect(land(1, 0), 'above half health: one').toBe(K.crawlers1);
});
test('hoist: the guns under the magnet fire a fan at the player while it trails, a wider one below half health', () => {
  const K = BOSS_META.hoist.tune;
  const fan = (hpShare: number) => {
    const h = hoistReady();
    h.hp = h.maxHp * hpShare;
    player.x = h.cx + 10;
    player.z = h.cz;
    clearPool(eBullets);
    const alive = () => eBullets.filter(b => b.alive).length;
    h.st = 'chase';
    h.gunT = 0.5;
    for (let k = 0; k < 20; k++) update(1 / 60);
    const early = alive();
    for (let k = 0; k < 20; k++) update(1 / 60);
    const n = alive();
    h.st = 'wind'; // (the magnet lights to pull: the guns hold their fire)
    h.timer = 1;
    h.gunT = 0;
    const before = alive();
    update(1 / 60);
    const quiet = alive() - before;
    endRun('abandon');
    return { early, n, quiet };
  };
  const calm = fan(1);
  expect(calm.early, 'not before its time').toBe(0);
  expect(calm.n, 'one fan').toBe(K.gunN);
  expect(calm.quiet, 'not while it pulls').toBe(0);
  expect(fan(0.4).n, 'a wider one below half health').toBe(K.gunNEnr);
});
test('hoist: when it goes down the load and the pull are gone, the magnet falls and the crane stays where it stopped', () => {
  const h = hoistReady();
  player.x = h.cx + 5;
  player.z = h.cz + 5;
  h.x = player.x;
  h.z = player.z;
  h.st = 'approach';
  h.timer = 0;
  update(1 / 60);
  expect(h.st, 'a load is up').toBe('hang');
  hurtEnemy(h, h.hp + 1, false);
  const crane = query('crane');
  expect(crane.length, 'the crane and the fallen magnet').toBe(2);
  const magnet = crane[1]!.mesh as Group,
    from = magnet.position.y;
  for (let k = 0; k < 90; k++) update(1 / 60);
  expect(magnet.position.y, 'the magnet came down').toBeLessThan(from - 2);
  expect(magnet.position.y, 'and lies on the floor').toBeLessThan(floorY(h.x, h.z) + 1.5);
  expect(query('crane').length, 'the crane is still there').toBe(2);
  expect(level.portals.length, 'practice: the way home').toBe(1);
  endRun('extract');
});
test('music: every style and its boss arrangement can be scheduled', () => {
  audioInit();
  musicInit();
  if (!musicState.bus) throw new Error('music bus');
  Object.keys(MUSIC_STYLES).forEach(name => {
    [false, true].forEach(boss => {
      if (boss && name === 'BASE') return;
      setMusic(name, boss);
      if (!musicState.st || musicState.name !== name + (boss ? ':boss' : '')) throw new Error('setMusic ' + name);
      for (let k = 0; k < 64; k++) playStep(musicState.st, k, actx!.currentTime + k * 0.01, 0.1);
      const mix = boss ? 'boss' : name === 'BASE' ? 'base' : 'explore';
      if (musicState.mix !== mix) throw new Error('music mix ' + name + ' ' + musicState.mix);
    });
  });
  setMusic('NOWHERE'); // a name with no style plays DATA, mixed like a sector
  if (musicState.st !== MUSIC_STYLES.DATA || musicState.mix !== 'explore') throw new Error('music fallback');
  setMusicMix('combat');
  setMusicMix('explore');
  musicVolume(0.4);
  musicVolume(1);
  Object.keys(SFX).forEach(k => SFX[k]()); // every effect builds its node graph without errors
});
test('boss entrance and phase change: invulnerable while appearing and in the burst', () => {
  startPractice('trinity');
  tick(3);
  if (!boss) spawnBoss('trinity');
  const hp0 = boss!.hp;
  hurtEnemy(boss!, 100, false);
  if (boss!.hp !== hp0) throw new Error('hurt during intro');
  tick(Math.ceil(BOSS_TUNE.introTime * 60) + 5);
  hurtEnemy(boss!, boss!.maxHp * 0.6, false);
  if (!boss!.phased || !(boss!.spawnT > 0)) throw new Error('phase change');
  const hp1 = boss!.hp;
  hurtEnemy(boss!, 100, false);
  if (boss!.hp !== hp1) throw new Error('hurt during phase change');
  endRun('abandon');
});
test('boss entrance: every boss appears where it starts to move (no jump once it acts)', () => {
  BOSS_ORDER.forEach(kind => {
    startPractice(kind);
    tick(3);
    if (!boss) spawnBoss(kind);
    const b = boss!;
    expect(b.intro, kind).toBe(true);
    tick(2);
    const a = b.mesh.position.clone();
    while (b.spawnT > 0) tick(1);
    tick(1);
    const moved = Math.hypot(b.mesh.position.x - a.x, b.mesh.position.z - a.z);
    expect(moved, `${kind}: from where it appeared to where it first acts (m)`).toBeLessThan(0.5);
    endRun('abandon');
  });
});
test('boss practice: fight, win, go home; the save does not change', () => {
  const before = JSON.stringify(save);
  BOSS_ORDER.forEach(kind => {
    startPractice(kind);
    tick(120);
    if (!boss) spawnBoss(kind);
    boss!.spawnT = 0;
    if (boss!.name.indexOf(BOSS_META[kind]!.name.split(' ')[0]) !== 0)
      throw new Error('wrong boss ' + kind + ' ' + boss!.name);
    if (boss!.invuln) {
      enemies.filter(e => !e.boss).forEach(e => hurtEnemy(e, 1e6, false));
      tick(20);
    }
    spawnWave(boss!.x, boss!.z, 11, 18, 10, COLOR.orange); // a shockwave still spreading when the boss falls
    hurtEnemy(boss!, boss!.hp + 1, false);
    if (query('wave').length) throw new Error('shockwave outlived the boss ' + kind);
    tick(30);
    if (level.portals.length !== 1 || level.portals[0].kind !== 'extract') throw new Error('practice portal ' + kind);
    endRun('extract');
  });
  const after = JSON.stringify(save);
  if (before !== after) throw new Error('practice changed the save');
});
test('checkpoint: saved at stage start, deleted when the run ends', () => {
  startRun();
  tick(5);
  show(null);
  setState('play');
  if (!save.suspend || save.suspend.run.stage !== run.stage) throw new Error('checkpoint at stage start');
  const bits0 = save.suspend.run.bits;
  run.bits += 999;
  if (save.suspend.run.bits !== bits0) throw new Error('checkpoint changed mid-stage');
  nextStage();
  if (save.suspend.run.stage !== run.stage) throw new Error('checkpoint on next stage');
  endRun('dead');
  if (save.suspend) throw new Error('checkpoint survived the end of the run');
  goBase();
  startRun();
  tick(5); // leave a run going for the next check
});
test('feedback: hidden without a form; with one, the result screen opens it filled in', () => {
  const keepForm = { ...FEEDBACK_FORM },
    keepOpen = window.open,
    opened: string[] = [];
  window.open = ((u: string) => {
    opened.push(u);
    return null;
  }) as typeof window.open;
  try {
    FEEDBACK_FORM.url = '';
    goBase();
    if (!el('#btnFeedbackBase').hidden) throw new Error('feedback shown without a form');
    Object.assign(FEEDBACK_FORM, {
      url: 'https://docs.google.com/forms/d/e/test/viewform',
      game: '1',
      build: '2',
      info: '3',
    });
    startRun();
    tick(5);
    run.perks = ['split', 'split', 'rapid+'];
    endRun('extract');
    if (el('#btnFeedbackRes').hidden) throw new Error('feedback button on the result screen');
    el('#btnFeedbackRes').click();
    const info = new URL(opened[0]!).searchParams.get('entry.3') || '';
    if (
      !info.includes('result=extract') ||
      !info.includes('splitx2') ||
      !info.includes('rapid+') ||
      new URL(opened[0]!).searchParams.get('entry.1') !== 'sector-dive-ex'
    )
      throw new Error('feedback info ' + info);
    goBase();
    if (el('#btnFeedbackBase').hidden) throw new Error('feedback link on the base screen');
    el('#btnFeedbackBase').click();
    if (!(new URL(opened[1]!).searchParams.get('entry.3') || '').startsWith('from=base'))
      throw new Error('feedback base info');
  } finally {
    Object.assign(FEEDBACK_FORM, keepForm);
    window.open = keepOpen;
  }
  goBase();
  startRun();
  tick(5);
});
test('result chips: counted, most first, order folded underneath', () => {
  goBase();
  startRun();
  tick(5);
  run.perks = ['rapid', 'split', 'split+', 'split', 'overload+'];
  endRun('extract');
  const want = t('res.chips', {
    n: 5,
    list: [
      t('common.countRare', { name: perkName('split'), n: 3, r: 1 }),
      perkName('rapid'),
      perkName('overload+'),
    ].join(t('common.sep')),
  });
  if (el('#resChips').textContent !== want) throw new Error('result chips ' + el('#resChips').textContent);
  if (
    el('#resOrder').hidden ||
    el<HTMLDetailsElement>('#resOrder').open ||
    el('#resOrderList').textContent !== run.perks.map(perkName).join(t('common.sep'))
  )
    throw new Error('result chip order');
  goBase();
  startPractice('crusher', 0);
  tick(5);
  endRun('abandon');
  if (!el('#resOrder').hidden) throw new Error('chip order after practice');
  goBase();
  startRun();
  tick(5);
});
test('current stats: rarity damage, real magazine, chips counted', () => {
  const keep = player.weapons[player.cur];
  player.weapons[player.cur] = newWeapon('launcher', 2);
  player.magMul = 2.5;
  run.perks = ['mag', 'mag', 'mag+'];
  const rows = new Map(
    [...new DOMParser().parseFromString(statsHTML(), 'text/html').querySelectorAll('.reslist div')].map(d => [
      d.querySelector('dt')!.textContent,
      d.querySelector('dd')!.textContent,
    ]),
  );
  const pc = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
  const dmg = rows.get(t('stats.dmg')),
    mag = rows.get(t('stats.mag')),
    html = statsHTML();
  player.weapons[player.cur] = keep;
  player.magMul = 1;
  if (
    dmg !== pc(player.dmgMul * player.lvlDmg * 1.55 - 1) ||
    mag !== pc(5 / 3 - 1) /* 3 rounds x (1 + 1.5 x 0.5) = 5.25 -> 5, not +150% */ ||
    !html.includes(t('common.countRare', { name: perkName('mag'), n: 3, r: 1 }))
  )
    throw new Error('stats ' + [dmg, mag]);
});
test('share: shown after a real run, hidden after practice; text fits X', () => {
  goBase();
  startRun();
  tick(5);
  run.bosses = ['watcher'];
  run.perks = ['overload', 'overload', 'rapid+'];
  endRun('extract');
  if (
    el('#btnShare').hidden ||
    !shareData ||
    shareData.bosses[0] !== BOSS_META.watcher.short ||
    shareData.chips[0] !== t('common.count', { name: perkName('overload'), n: 2 })
  )
    throw new Error('share data');
  if (!shareText(shareData).includes('#SectorDiveEX') || !shareText(shareData).includes(BOSS_META.watcher.short))
    throw new Error('share text');
  el('#btnShare').click();
  if (el('#sharePanel').hidden) throw new Error('share panel on PC');
  goBase();
  startPractice('crusher', 0);
  tick(5);
  endRun('abandon');
  if (!el('#btnShare').hidden) throw new Error('share shown after practice');
  // a deep run beats many bosses: the post counts them per kind and stays within X's 280 (CJK counts 2, the URL 23)
  const xLen = (s: string) => {
    const [body, url] = [s.slice(0, s.lastIndexOf('\n')), s.slice(s.lastIndexOf('\n') + 1)];
    return [...body].reduce((n, c) => n + (c.charCodeAt(0) > 0x10ff ? 2 : 1), 0) + 1 + (url ? 23 : 0);
  };
  const many = {
    ...shareData!,
    bosses: Array.from({ length: 30 }, (_, i) => BOSS_META[BOSS_ORDER[i % BOSS_ORDER.length]!]!.short),
  };
  const keepLang = lang,
    lens: number[] = [];
  for (const code of ['ja', 'en']) {
    changeLang(code);
    const s = shareText({
      ...many,
      bosses: many.bosses.map((_, i) => BOSS_META[BOSS_ORDER[i % BOSS_ORDER.length]!]!.short),
    });
    lens.push(xLen(s));
    if (!s.includes('30')) throw new Error('boss count missing ' + s);
  }
  changeLang(keepLang);
  if (lens.some(n => n > 280)) throw new Error('share text too long ' + lens);
  goBase();
  startRun();
  tick(5);
  // switching the language from the pause screen rewrites the stats panel and the stage label
  {
    const other = lang === 'ja' ? 'en' : 'ja';
    pause();
    changeLang(other);
    const ok =
      el('#pauseChips').innerHTML.includes(t('stats.title')) &&
      el('#stageLbl').textContent!.includes(stageInfo(run.stage).biome.name);
    changeLang(keepLang);
    show(null);
    setState('play');
    if (!ok) throw new Error('pause screen kept the old language');
  }
});
test('analytics: the flow above sent its events', () => {
  if (TRACK_LOG.some(e => e.params.game !== 'sector-dive-ex')) throw new Error('analytics: game id missing');
  const ev = TRACK_LOG.map(e => e.name + ':' + (e.params.result ?? e.params.method ?? ''));
  for (const want of [
    'dive_start:',
    'level_start:',
    'level_end:extract',
    'level_end:dead',
    'share:panel',
    'practice_start:',
    'practice_end:abandon',
  ])
    if (!ev.includes(want)) throw new Error('analytics event ' + want + ' / ' + ev.slice(-12).join(' '));
  if (
    TRACK_LOG.some(
      e =>
        (e.name === 'level_start' || e.name === 'level_end') &&
        e.params.stage_role !== 'normal' &&
        e.params.stage_role !== 'boss',
    )
  )
    throw new Error('analytics: stage_role');
});
test('suspend -> resume -> suspend -> discard', () => {
  // the lowest floor of the building (stage 2 of the depth), reached by one of its stairs or lifts
  run.route = [0];
  run.stage = 0;
  // (a building of its own: one left by an earlier test is of another sector, and built again from its seed for this
  // one it may come out with another number of floors than its state has)
  run.bld = undefined;
  startStage();
  goToFloor(building!.plans.length - 1);
  tick(30);
  const seedWas = run.bld!.seed,
    stageWas = run.stage;
  suspendRun();
  if (!save.suspend || state !== 'base') throw new Error('suspend failed');
  resumeRun();
  tick(60);
  if (run.stage !== stageWas || (save.suspend as Snapshot | null)?.run.stage !== stageWas)
    throw new Error('resume failed');
  if (run.bld!.seed !== seedWas || level.floor !== building!.plans.length - 1 || !level.hall)
    throw new Error('not the same building');
  suspendRun();
  discardSuspended();
  if (save.suspend || !stateIs('result')) throw new Error('discard failed');
});
test('pause: abandoning the dive asks once', () => {
  goBase();
  startRun();
  tick(5);
  pause();
  const btn = el<HTMLButtonElement>('#btnAbandon');
  expect(btn.textContent).toBe(t('pause.abandon'));
  btn.click();
  expect(stateIs('pause'), 'the first click only asks').toBe(true);
  expect(btn.textContent).toBe(t('pause.abandonGo'));
  // leaving the pause screen and coming back starts over
  show(null);
  setState('play');
  pause();
  expect(btn.textContent).toBe(t('pause.abandon'));
  btn.click();
  btn.click();
  expect(stateIs('result')).toBe(true);
});
test('boss hints: shown when the boss is met for the first time, and in practice', () => {
  const shown = () => el('#toast').textContent === t('boss.crusherHint');
  goBase();
  startRun();
  tick(5);
  delete save.bossSeen.crusher;
  el('#toast').textContent = '';
  spawnBoss('crusher');
  expect(shown(), 'the first time').toBe(true);
  endRun('abandon');
  goBase();
  startRun();
  tick(5);
  el('#toast').textContent = '';
  spawnBoss('crusher');
  expect(shown(), 'met before').toBe(false);
  endRun('abandon');
  goBase();
  startPractice('crusher');
  tick(120);
  if (!boss) {
    el('#toast').textContent = '';
    spawnBoss('crusher');
  }
  expect(shown(), 'in practice').toBe(true);
  endRun('abandon');
});
test('wipe: data wipe resets the save', () => {
  goBase();
  save.bits = 999;
  save.up.hp = 3;
  el('#btnWipe').click();
  el('#btnWipeGo').click();
  if (save.bits !== 0 || save.up.hp !== 0 || !el('#dlgWipe').hidden) throw new Error('wipe failed');
});
test('hit direction: a hit from behind shows the arc, one from in front does not', () => {
  goBase();
  startRun();
  tick(5);
  player.yaw = 0;
  player.hp = 1e6;
  player.maxHp = 1e6;
  hitDirs.forEach(d => {
    d.t = 0;
  });
  player.inv = 0;
  damagePlayer(1, { x: player.x, z: player.z - 8 });
  if (hitDirs.some(d => d.t > 0)) throw new Error('hit arc shown for a hit from the front');
  player.inv = 0;
  damagePlayer(1, { x: player.x + 3, z: player.z + 8 });
  if (!hitDirs.some(d => d.t > 0)) throw new Error('no hit arc for a hit from behind');
  goBase();
});
test('gates: one opening underfoot waits until the player steps off and back', () => {
  goBase();
  startRun();
  tick(5);
  run.stage = PER - 1; // as after the boss: an onward gate leads to the next depth
  const st = run.stage;
  makePortal(player.x, player.z, 0xffffff, 'next', '');
  tick(30);
  if (run.stage !== st) throw new Error('gate took the player right away');
  tick(60);
  if (run.stage !== st) throw new Error('gate took the player without stepping off');
  player.x += 3;
  tick(2);
  player.x -= 3;
  tick(2);
  if (run.stage !== st + 1) throw new Error('gate did not work after stepping off and back');
  goBase();
});
test('save codes: round trip, a bad code is refused', () => {
  save.bits = 777;
  save.up.dmg = 2;
  persist();
  const code = exportSave();
  save.bits = 1;
  save.up.dmg = 0;
  persist();
  if (importSaveCheck(code.slice(0, -1) + (code.endsWith('0') ? '1' : '0')) || importSave('SDX1:abc.00000000'))
    throw new Error('bad save code accepted');
  if (!importSave(code) || save.bits !== 777 || save.up.dmg !== 2) throw new Error('save code round trip');
  el('#btnExport').click();
  if (el('#savePanel').hidden || !el<HTMLTextAreaElement>('#saveCode').value.startsWith('SDX1:'))
    throw new Error('export panel');
  el('#btnExport').click();
  if (!el('#savePanel').hidden) throw new Error('export panel toggle');
  el('#btnWipe').click();
  el('#btnWipeGo').click();
});
test('readiness: easy at DEPTH 1, harder deeper; levels make it easier', () => {
  // (a plain handgun reads 1.75 against the fixed yardstick READY_REF_DPS: DEPTH 1 is "comfortable")
  const fresh = [0, 1, 2, 4].map(n => readiness(n));
  if (fresh[0] !== 1 || fresh.some((r, i) => i && r < fresh[i - 1]!)) throw new Error('readiness fresh ' + fresh);
  const s0 = readinessScore(2);
  save.up.dmg = 6;
  save.up.hp = 6;
  save.loadout = [basicW('rail'), null];
  const s1 = readinessScore(2);
  if (!(s1 > s0)) throw new Error('readiness upgrades ' + s0 + ' ' + s1);
});
test('level: one price for every point, a little more each level; armour and output have no cap', () => {
  const keepUp = { ...save.up },
    keepBits = save.bits;
  if (levelCost(0) !== 80 || !(levelCost(1) > levelCost(0)) || levelCost(10) !== Math.round(80 * 1.2 ** 10))
    throw new Error('level cost');
  for (const id of ['hp', 'dmg']) if (isFinite(UPGRADES.find(u => u.id === id)!.max)) throw new Error('capped ' + id);
  // two levels from the base: the same price on any row, the next one dearer; the points go where they were put
  for (const k of Object.keys(save.up)) save.up[k] = 0;
  save.bits = 1000;
  goBase();
  showTab('up');
  renderBase();
  const c0 = nextLevelCost();
  document.querySelector<HTMLButtonElement>('[data-up="hp"]')!.click();
  const c1 = nextLevelCost();
  document.querySelector<HTMLButtonElement>('[data-up="dmg"]')!.click();
  const got = [save.up.hp, save.up.dmg, levelOf(), save.bits];
  // a point with a cap reached cannot be bought
  save.up.choice = 1;
  renderBase();
  const full = document.querySelector<HTMLButtonElement>('[data-up="choice"]')!.disabled;
  Object.assign(save.up, keepUp);
  save.bits = keepBits;
  renderBase();
  if (got.join() !== [1, 1, 2, 1000 - c0 - c1].join() || !(c1 > c0) || !full) throw new Error('level buy ' + got);
});
test('level: none while a dive is suspended; the chip offers keep the count the dive set out with', () => {
  const keepUp = { ...save.up },
    keepBits = save.bits;
  goBase();
  startRun();
  const set = run.choice;
  save.up.choice = 1; // as if bought at the base while this dive was out
  const live = run.choice;
  endRun('abandon');
  save.up.choice = keepUp.choice;
  // a suspended dive: the rows cannot be bought, and a click does nothing
  save.bits = 1000;
  save.suspend = { run: { stage: 0, route: [0] }, P: {} } as unknown as typeof save.suspend;
  goBase();
  showTab('up');
  renderBase();
  const btn = document.querySelector<HTMLButtonElement>('[data-up="hp"]')!,
    off = btn.disabled;
  btn.disabled = false;
  btn.click();
  const hp = save.up.hp;
  save.suspend = null;
  Object.assign(save.up, keepUp);
  save.bits = keepBits;
  renderBase();
  if (set !== (keepUp.choice || 0) || live !== set || !off || hp !== keepUp.hp)
    throw new Error('suspended level ' + [set, live, off, hp]);
});
test("level: a milestone level-up spends the dive's bits, counts at once, and keeps the save's bits", () => {
  const keepUp = { ...save.up },
    keepBits = save.bits;
  goBase();
  startRun();
  tick(2);
  run.bits = 1000;
  const hp0 = player.maxHp,
    cost = nextLevelCost();
  openLevelUp();
  const open = stateIs('perk') && el('#scrPerk').dataset.mode === 'level';
  document.querySelector<HTMLButtonElement>('#perkList [data-level="hp"]')!.click();
  const got = [player.maxHp - hp0, 1000 - run.bits, save.up.hp! - (keepUp.hp || 0), save.bits === keepBits];
  el('#perkDone').click();
  const closed = stateIs('play');
  endRun('abandon');
  Object.assign(save.up, keepUp);
  save.bits = keepBits;
  persist();
  if (!open || !closed || got.join() !== [15, cost, 1, true].join()) throw new Error('milestone level ' + got);
  if (![4, 9, 14].every(isMilestone) || isMilestone(5) || isMilestone(0)) throw new Error('isMilestone');
});
test('level: a point in output multiplies the damage, apart from the chips (so it counts as much with many chips)', () => {
  const keepUp = { ...save.up };
  goBase();
  startRun();
  tick(2);
  const w = currentWeapon(),
    def = WEAPONS[w.id]!,
    dmg0 = shotDamage(def, w);
  applyLevelPoint(player, 'dmg');
  const one = shotDamage(def, w) / dmg0;
  player.dmgMul += 10; // a deep dive's chips
  const many = shotDamage(def, w);
  applyLevelPoint(player, 'dmg');
  const oneMore = shotDamage(def, w) / many;
  endRun('abandon');
  Object.assign(save.up, keepUp);
  expect(one).toBeCloseTo(LEVEL_DMG_MUL, 9);
  expect(oneMore, 'with chips, a point is worth the same').toBeCloseTo(LEVEL_DMG_MUL, 9);
  expect(startDmgMul(10)).toBeCloseTo(Math.pow(LEVEL_DMG_MUL, 10), 9);
});
test("level: a milestone's terminal opens on stepping onto it, sells the bag's weapons, and not again until stepped off", () => {
  goBase();
  startRun();
  tick(5);
  const bits0 = run.bits;
  const w = newWeapon('smg', 0);
  player.bag[0] = w;
  makeTerminal(player.x, player.z, 0xffffff, '');
  tick(90);
  const underfoot = stateIs('play');
  player.x += 3;
  tick(2);
  player.x -= 3;
  update(1 / 60);
  const open = stateIs('perk') && el('#scrPerk').dataset.mode === 'level' && !el('#sellList').hidden;
  document.querySelector<HTMLButtonElement>('#sellList [data-sell="0"]')!.click();
  const sold = [run.bits - bits0 === sellValue(w), player.bag[0] === null, el('#sellList').hidden];
  el('#perkDone').click();
  update(1 / 60);
  const stays = stateIs('play');
  endRun('abandon');
  if (!underfoot) throw new Error('terminal opened underfoot');
  if (!open) throw new Error('terminal did not open');
  if (sold.join() !== [true, true, true].join()) throw new Error('terminal sell ' + sold);
  if (!stays) throw new Error('terminal opened again without stepping off');
});
test('level: a save from before it has the reboot folded into its points', () => {
  const old = {
    ...defaultSave(),
    up: { hp: 2, dmg: 1, spd: 0, dash: 0, stam: 0, gain: 0, kit: 0, chip: 0 },
    pres: { count: 3, pts: 2, up: { gain: 1, hp: 3, funds: 1, relic: 0, choice: 1, dmg: 8, vit: 0 } },
    canReboot: true,
    bits: 5,
  } as Record<string, unknown>;
  delete old.levelV;
  if (!importSave(encodeStore('SDX1', old))) throw new Error('old save code');
  const got = [save.up.hp, save.up.dmg, save.up.choice, save.levelV, 'pres' in save, save.bits];
  el('#btnWipe').click();
  el('#btnWipeGo').click();
  // (armour 2 + its +10 HP x 3 = 2 points; output 1 + its +5% x 8 = 5 points)
  if (got.join() !== [4, 6, 1, 1, false, 5].join()) throw new Error('old save ' + got);
});
test('trooper: 3-round bursts, hit spheres at head, chest and legs', () => {
  goBase();
  startRun();
  // an open boss arena without pillars (a run's own boss room is inside a building floor: as boss practice gets one)
  run.practice = true;
  run.t0 = performance.now();
  run.stage = PER - 1;
  run.forceBoss = 'trinity';
  startStage();
  show(null);
  setState('play');
  player.hp = 1e6;
  player.maxHp = 1e6;
  enemies.forEach(o => {
    o.dead = true;
    removeEnemyMesh(o);
  });
  const e = spawnEnemy('trooper', player.x, player.z - 7, -1, 1);
  e.active = true;
  e.cd = 0;
  for (let k = 0; k < 30; k++) update(1 / 60); // 0.5 s: one burst (3 rounds, 0.13 s apart)
  const shots = e.shots,
    [head, chest, legs] = e.parts!.map(q => q.p.y);
  run.forceBoss = undefined;
  run.practice = false; // ends as the ordinary run it was started as
  endRun('abandon');
  goBase();
  if (shots !== 3 || !(head > chest && chest > legs))
    throw new Error('trooper burst ' + shots + ' spheres ' + [head, chest, legs]);
});
test('hazard floors: none in the start room, off at the start of an area', () => {
  goBase();
  startRun();
  for (const route of [1, 4])
    for (let k = 0; k < 30; k++) {
      run.route = [route];
      run.stage = (k % 6) * PER + (k % 3);
      startStage();
      const R = level.rooms[level.startIdx]!;
      for (let j = R.y - 1; j <= R.y + R.h; j++)
        for (let i = R.x - 1; i <= R.x + R.w; i++)
          if (level.hazardTiles[j * W + i])
            throw new Error(`hazard in the start room: route ${route} stage ${run.stage} tile ${i},${j}`);
      if (hazardState() === 'on') throw new Error('hazards live at the start of an area');
    }
  endRun('abandon');
  goBase();
});
test('readiness: a strong loadout still gets harder the deeper you start', () => {
  const strong = { weapons: [{ id: 'shotgun', r: 2, plus: 37, opts: [] }], dmg: 1.48, hp: 200 };
  const deep = [6, 9, 13, 19].map(n => readinessScore(n, strong));
  if (deep.some((v, i) => i && v >= deep[i - 1]!)) throw new Error('readiness deep ' + deep.map(v => v.toFixed(2)));
  el('#btnWipe').click();
  el('#btnWipeGo').click();
});
test('touch layout editor: the edit is kept', () => {
  const s0 = buttonLayout('dash').s;
  openLayoutEditor('base');
  if (!stateIs('layout') || el('#layoutBar').hidden) throw new Error('layout editor open');
  document.querySelector<HTMLElement>('[data-lbact="plus"]')!.click();
  document.querySelector<HTMLElement>('[data-lbact="done"]')!.click();
  if (state !== 'base' || Math.abs(buttonLayout('dash').s - (s0 + 0.1)) > 1e-9)
    throw new Error('layout editor ' + buttonLayout('dash').s);
  save.settings.layout = {};
  applyLayout();
});

// reachability: from the start room, can the player walk into every room (and back to the start)?
describe('reachability', () => {
  beforeAll(() => {
    startRun();
    tick(10);
  });
  BIOMES.forEach((b, bi) => {
    test(`reach ${b.code}`, () => {
      let bad = 0,
        back = 0;
      for (let n = 0; n < 25; n++) {
        run.route = [bi];
        run.stage = bi * PER;
        buildLevel(b, false);
        const reach = (from: number) => {
          const seenT = new Uint8Array(W * H),
            q = [from];
          seenT[from] = 1;
          while (q.length) {
            const c = q.pop()!,
              ci = c % W,
              cj = (c / W) | 0;
            [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ].forEach(([a, bb], sd) => {
              const ni = ci + a,
                nj = cj + bb;
              if (isSolid(ni, nj)) return;
              const nn = nj * W + ni;
              if (!seenT[nn] && passable(c, nn, sd)) {
                seenT[nn] = 1;
                q.push(nn);
              }
            });
          }
          return seenT;
        };
        const [sx, sz] = roomSpot(level.rooms[level.startIdx]),
          st = tileIndex(sx, sz),
          fwdR = reach(st);
        level.rooms.forEach(r => {
          const [x, z] = roomSpot(r),
            k = tileIndex(x, z);
          if (!fwdR[k]) bad++;
          else if (!reach(k)[st]) back++;
        });
      }
      console.log('reach', b.code, 'unreachable rooms', bad, 'one-way rooms', back);
    });
  });
});

test('the same seed builds the same level', () => {
  const snap = () => ({ rooms: JSON.stringify(level.rooms), grid: Array.from(grid), start: level.startIdx });
  buildLevel(BIOMES[1], false, null, 1234);
  const a = snap();
  buildLevel(BIOMES[1], false, null, 1234);
  expect(snap()).toEqual(a);
  expect(level.seed).toBe(1234);
});

// A pin on generation: the same seed must keep giving the same maps, rooms and start. Changing the generator or the
// order it draws random numbers in changes these on purpose, and then the numbers here are updated with it.
function levelHash(gen: GeneratedLevel): string {
  const M = gen.maps;
  const maps = [M.grid, M.hgt, M.ramp, M.cover, gen.hazard, M.roomOf].map(a => Array.from(a).join(','));
  const text = maps.join('|') + JSON.stringify(gen.rooms) + gen.startIdx;
  let h = 2166136261; // FNV-1a
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16);
}
test('generation is pinned: the same seed gives the same level', () => {
  const got: Record<string, string> = {};
  BIOMES.forEach(b => {
    got[b.code] = levelHash(generateLevel(b, false, null, createRng(1234)));
  });
  BOSS_ORDER.forEach(k => {
    got['arena ' + k] = levelHash(generateLevel(BIOMES[0], true, k, createRng(1234)));
  });
  expect(got).toEqual({
    DATA: '31230a44',
    FORGE: 'a37e213e',
    NOISE: 'f514cc1b',
    RUIN: 'ea80ade1',
    KWLN: '9b86bedd',
    CITY: 'd1432964',
    MALL: '2c496622',
    HOSP: 'c933e16e',
    'arena watcher': 'b566d42b',
    'arena crusher': 'b566d42b',
    'arena hoist': 'dc3f981b', // (no pillars, as TRINITY's)
    'arena core': 'dc3f981b',
    'arena phantom': 'b566d42b',
    'arena trinity': 'dc3f981b',
    'arena bastion': 'dc3f981b',
  });
});

// ---- PC key bindings: every action runs through the engine's bindings (engine/src/ui/keymap.ts) ----
describe('key bindings', () => {
  // from the page body, so the event passes the document and the window like a real key press does
  const keyEvent = (type: 'keydown' | 'keyup', code: string, repeat = false) =>
    document.body.dispatchEvent(new KeyboardEvent(type, { code, repeat, bubbles: true, cancelable: true }));
  const press = (code: string) => {
    keyEvent('keydown', code);
    keyEvent('keyup', code);
  };
  // how far holding `code` for a moment moves the player
  const moveBy = (code: string) => {
    const x = player.x,
      z = player.z;
    keyEvent('keydown', code);
    tick(8);
    keyEvent('keyup', code);
    return distXZ({ x, z }, player);
  };
  // a play state where weapons, kits and the map can be tried
  const freshPlay = () => {
    startRun();
    tick(5);
    clearWorld('pickup');
    player.weapons = [newWeapon('pistol', 0, true), newWeapon('smg', 0)];
    player.cur = 0;
    player.bag = [null, null, null, null];
    player.reloadT = 0;
    controlState.dashReq = false;
  };
  const toPlay = () => {
    show(null);
    setState('play');
  };
  const guideTexts = () => Array.from(document.querySelectorAll('#guide dd'), d => d.textContent);
  const keyCell = (action: string, slot: number) =>
    el('#keysList').querySelector<HTMLElement>(`[data-key-action="${action}"][data-slot="${slot}"]`)!;
  const savedKeys = () => JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}').settings.keys;

  beforeAll(() => {
    setFireHeld(false); // the file's start-up holds fire; these tests press fire by key
    resetBindings();
    freshPlay();
  });

  test('the default bindings are the keys the game always had', () => {
    const want: Record<string, string[]> = {
      forward: ['KeyW', 'ArrowUp'],
      back: ['KeyS', 'ArrowDown'],
      left: ['KeyA', 'ArrowLeft'],
      right: ['KeyD', 'ArrowRight'],
      dash: ['Space', 'ShiftLeft'],
      fire: ['KeyF'],
      swap: ['KeyQ'],
      slot1: ['Digit1'],
      slot2: ['Digit2'],
      reload: ['KeyR'],
      stow: ['KeyE'],
      equip: ['KeyG'],
      kit: ['KeyH'],
      map: ['KeyM'],
      map3d: ['KeyN'],
      bag: ['Tab', 'KeyI'],
      pause: ['Escape', 'KeyP'],
    };
    expect(KEY_ACTIONS.map(a => a.id)).toEqual(Object.keys(want));
    for (const [action, keys] of Object.entries(want)) expect(keysOf(action), action).toEqual(keys);
    expect(save.settings.keys, 'a new save keeps no keys: every action is on its default').toEqual({});
  });

  test('default keys: move, fire, dash, weapons, reload and kit work as before', () => {
    freshPlay();
    for (const code of ['KeyW', 'ArrowUp', 'KeyS', 'ArrowDown', 'KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight'])
      expect(moveBy(code), code).toBeGreaterThan(0.2);
    expect(moveBy('KeyZ'), 'an unbound key').toBeLessThan(0.01);
    // fire: F held shoots
    const shots = shotId;
    keyEvent('keydown', 'KeyF');
    tick(3);
    keyEvent('keyup', 'KeyF');
    expect(shotId).toBeGreaterThan(shots);
    // dash: Space, either Shift
    for (const code of ['Space', 'ShiftLeft', 'ShiftRight']) {
      controlState.dashReq = false;
      press(code);
      expect(controlState.dashReq, code).toBe(true);
    }
    // switch weapon: Q, 2, 1
    press('KeyQ');
    expect(player.cur).toBe(1);
    press('KeyQ');
    expect(player.cur).toBe(0);
    press('Digit2');
    expect(player.cur).toBe(1);
    press('Digit1');
    expect(player.cur).toBe(0);
    // reload
    player.weapons[0]!.mag = 1;
    press('KeyR');
    expect(player.reloadT).toBeGreaterThan(0);
    player.reloadT = 0;
    // med kit
    player.kits = 1;
    player.hp = player.maxHp - 50;
    press('KeyH');
    expect(player.kits).toBe(0);
    // map
    expect(bigmap.hidden).toBe(true);
    press('KeyM');
    expect(bigmap.hidden).toBe(false);
    press('KeyM');
    expect(bigmap.hidden).toBe(true);
    // the 3D map (in a building): N opens it, N again turns back to the 2D page, M closes
    if (level.floor >= 0) {
      press('KeyN');
      expect(map3dWanted()).toBe(true);
      press('KeyN');
      expect(!bigmap.hidden && !map3dWanted()).toBe(true);
      press('KeyM');
      expect(bigmap.hidden).toBe(true);
    }
  });

  test('default keys: pick up (G swap, E to bag), bag (Tab, I, Esc closes) and pause (Esc, P)', () => {
    freshPlay();
    player.weapons = [newWeapon('pistol', 0, true), null];
    addPickup('weapon', player.x, player.z, { w: newWeapon('rail', 1) });
    updatePickups(0);
    press('KeyG');
    expect(player.weapons[1]?.id).toBe('rail');
    addPickup('weapon', player.x, player.z, { w: newWeapon('smg', 1) });
    updatePickups(0);
    press('KeyE');
    expect(player.bag.filter(Boolean).length).toBe(1);
    // the bag: Tab and I open and close, Esc closes
    for (const [open, close] of [
      ['Tab', 'Tab'],
      ['KeyI', 'KeyI'],
      ['Tab', 'Escape'],
      ['KeyI', 'Escape'],
    ] as const) {
      toPlay();
      press(open);
      expect(state, open).toBe('bag');
      press(close);
      expect(state, `${open} then ${close}`).toBe('play');
    }
    // pause: Esc and P
    for (const code of ['Escape', 'KeyP']) {
      toPlay();
      press(code);
      expect(state, code).toBe('pause');
    }
    toPlay();
    // Tab's browser default (moving focus) is stopped, in play and in the bag
    expect(keyEvent('keydown', 'Tab')).toBe(false);
    keyEvent('keyup', 'Tab');
    expect(keyEvent('keydown', 'Tab')).toBe(false);
    keyEvent('keyup', 'Tab');
    toPlay();
  });

  test('the controls list is built from the bindings', () => {
    renderGuide();
    const g = guideTexts();
    expect(g[0]).toBe('W A S D');
    expect(g[2]).toContain('F');
    expect(g[3]).toBe(
      lang === 'ja'
        ? 'Space / Shift（スタミナ消費、短い無敵。押し続けると走る）'
        : 'Space / Shift (uses stamina, brief invulnerability; hold to keep running)',
    );
    expect(g[5]).toContain('Q / 1 / 2');
    expect(g[7]).toBe('H');
    expect(g[8]).toBe('Tab / I');
    expect(g[10]).toBe('Esc / P');
    for (const code of ['ja', 'en']) {
      changeLang(code);
      expect(
        guideTexts().some(x => /[{}]/.test(x ?? '')),
        `${code}: a placeholder is left`,
      ).toBe(false);
    }
    changeLang('ja');
  });

  test('changing a binding: the new key works, the old key does nothing', () => {
    freshPlay();
    bindKey('reload', 0, 'KeyV');
    player.weapons[0]!.mag = 1;
    press('KeyR');
    expect(player.reloadT, 'the old key').toBe(0);
    press('KeyV');
    expect(player.reloadT, 'the new key').toBeGreaterThan(0);
    player.reloadT = 0;
    bindKey('forward', 0, 'KeyT');
    expect(moveBy('KeyW'), 'the old move key').toBeLessThan(0.01);
    expect(moveBy('KeyT'), 'the new move key').toBeGreaterThan(0.2);
    expect(moveBy('ArrowUp'), 'the other key of the action stays').toBeGreaterThan(0.2);
    // firing and the bag follow too
    bindKey('fire', 0, 'KeyJ');
    const shots = shotId;
    keyEvent('keydown', 'KeyF');
    tick(3);
    keyEvent('keyup', 'KeyF');
    expect(shotId, 'the old fire key').toBe(shots);
    keyEvent('keydown', 'KeyJ');
    tick(3);
    keyEvent('keyup', 'KeyJ');
    expect(shotId, 'the new fire key').toBeGreaterThan(shots);
    bindKey('bag', 0, 'KeyB');
    press('Tab');
    expect(state, 'Tab no longer opens the bag').toBe('play');
    press('KeyB');
    expect(state).toBe('bag');
    press('KeyB');
    expect(state, 'the new key closes it').toBe('play');
    expect(actionDown('forward')).toBe(false);
    resetBindings();
  });

  test('a key given to a second action leaves the first', () => {
    freshPlay();
    expect(bindKey('kit', 0, 'KeyR')).toBe('reload');
    expect(keysOf('reload')).toEqual([]);
    player.weapons[0]!.mag = 1;
    press('KeyR');
    expect(player.reloadT, 'R is the kit now').toBe(0);
    player.kits = 1;
    player.hp = player.maxHp - 50;
    press('KeyR');
    expect(player.kits).toBe(0);
    resetBindings();
  });

  test('Esc pauses even when the pause keys are changed', () => {
    freshPlay();
    toPlay();
    bindKey('pause', 0, 'KeyK');
    expect(keysOf('pause')).toEqual(['KeyK', 'KeyP']);
    press('Escape');
    expect(state, 'Esc still pauses').toBe('pause');
    toPlay();
    press('KeyK');
    expect(state, 'and so does the new key').toBe('pause');
    resetBindings();
    toPlay();
  });

  test('the controls list shows the changed keys', () => {
    bindKey('reload', 0, 'KeyV');
    bindKey('dash', 1, 'KeyC');
    renderGuide();
    const g = guideTexts();
    expect(g[4]).toMatch(/^V/);
    expect(g[3]).toMatch(/^Space \/ C/);
    resetBindings();
    renderGuide();
  });

  test('the key settings dialog: click a key, press a new one; Esc cancels; reset', () => {
    toPlay();
    show(null);
    setState('base');
    renderBase();
    const open = document.querySelector<HTMLElement>('[data-settings="base"] [data-action="keys"]');
    expect(open, 'the button is in the settings').not.toBeNull();
    open!.click();
    expect(el('#dlgKeys').hidden).toBe(false);
    expect(el('#keysList').querySelectorAll('.keyrow').length).toBe(KEY_ACTIONS.length);
    expect(keyCell('reload', 0).textContent).toBe('R');
    expect(keyCell('reload', 1).textContent).toBe(t('keys.none'));
    // click, then the cell waits
    keyCell('reload', 0).click();
    expect(keyCell('reload', 0).textContent).toBe(t('keys.press'));
    // Esc cancels: nothing changes, and the dialog stays open
    expect(keyEvent('keydown', 'Escape')).toBe(false);
    keyEvent('keyup', 'Escape');
    expect(el('#dlgKeys').hidden).toBe(false);
    expect(keyCell('reload', 0).textContent).toBe('R');
    expect(keysOf('reload')).toEqual(['KeyR']);
    // a key press is the answer, and it does nothing else (Tab would have moved the focus, Space would have clicked)
    keyCell('reload', 0).click();
    expect(keyEvent('keydown', 'KeyV')).toBe(false);
    keyEvent('keyup', 'KeyV');
    expect(keysOf('reload')).toEqual(['KeyV']);
    expect(keyCell('reload', 0).textContent).toBe('V');
    expect(savedKeys().reload).toEqual(['KeyV']);
    // the second slot
    keyCell('reload', 1).click();
    keyEvent('keydown', 'Tab');
    keyEvent('keyup', 'Tab');
    expect(keysOf('reload')).toEqual(['KeyV', 'Tab']);
    expect(keysOf('bag'), 'Tab was taken from the bag').toEqual(['KeyI']);
    expect(el('#keysMsg').textContent).toBe(
      t('keys.moved', { key: 'Tab', action: KEY_ACTIONS.find(a => a.id === 'bag')!.name }),
    );
    // the right-hand Shift is the Shift key
    keyCell('dash', 1).click();
    keyEvent('keydown', 'ShiftRight');
    keyEvent('keyup', 'ShiftRight');
    expect(keysOf('dash')).toEqual(['Space', 'ShiftLeft']);
    // the held key that clicked a cell (auto-repeat) is not an answer
    keyCell('map', 0).click();
    keyEvent('keydown', 'Enter', true);
    expect(keysOf('map')).toEqual(['KeyM']);
    keyEvent('keydown', 'KeyN');
    keyEvent('keyup', 'KeyN');
    expect(keysOf('map')).toEqual(['KeyN']);
    // the controls list shows the new key
    expect(guideTexts()[4]).toMatch(/^V/);
    // reset
    el('#btnKeysReset').click();
    expect(save.settings.keys, 'nothing is changed: nothing is saved').toEqual({});
    expect(keysOf('reload')).toEqual(['KeyR']);
    expect(keysOf('bag')).toEqual(['Tab', 'KeyI']);
    expect(keyCell('reload', 0).textContent).toBe('R');
    expect(savedKeys()).toEqual({});
    // Esc closes the dialog when nothing is waiting, and so does the button
    keyEvent('keydown', 'Escape');
    keyEvent('keyup', 'Escape');
    expect(el('#dlgKeys').hidden).toBe(true);
    open!.click();
    el('#btnKeysClose').click();
    expect(el('#dlgKeys').hidden).toBe(true);
  });

  test('the dialog also opens from the pause screen', () => {
    freshPlay();
    pause();
    const open = document.querySelector<HTMLElement>('[data-settings="pause"] [data-action="keys"]');
    expect(open).not.toBeNull();
    open!.click();
    expect(el('#dlgKeys').hidden).toBe(false);
    keyCell('map', 0).click();
    keyEvent('keydown', 'Escape'); // cancel, not "resume" or anything else
    keyEvent('keyup', 'Escape');
    expect(state).toBe('pause');
    el('#btnKeysClose').click();
    expect(state).toBe('pause');
    toPlay();
  });

  test('the key settings button is for PC only', () => {
    const item = SETTINGS.items.find(i => i.key === 'keys')!;
    const layout = SETTINGS.items.find(i => i.key === 'layout')!;
    expect(item.show!()).toBe(!isTouch);
    expect(item.show!()).toBe(!layout.show!());
  });

  test('the bindings are saved, read back at start-up, and old saves get the defaults', () => {
    bindKey('reload', 0, 'KeyV');
    bindKey('stow', 1, 'KeyC');
    setKeyBindings(changedBindings()); // what the dialog does after a change
    persist();
    expect(save.settings.keys, 'only the changed actions are saved').toEqual({
      reload: ['KeyV'],
      stow: ['KeyE', 'KeyC'],
    });
    // a restart: the engine starts on defaults and takes the save's bindings
    const stored = exportBindings();
    expect(savedKeys()).toEqual(save.settings.keys);
    resetBindings();
    applyKeyBindings();
    expect(exportBindings()).toEqual(stored);
    expect(keysOf('reload')).toEqual(['KeyV']);
    // through a save code
    const code = exportSave();
    resetBindings();
    expect(importSave(code)).toBe(true);
    applyKeyBindings();
    expect(keysOf('reload')).toEqual(['KeyV']);
    expect(keysOf('stow')).toEqual(['KeyE', 'KeyC']);
    // a save from before the key settings existed: default keys
    const old = JSON.parse(JSON.stringify(save));
    delete old.settings.keys;
    expect(importSave(encodeStore('SDX1', old))).toBe(true);
    expect(save.settings.keys).toEqual(defaultSave().settings.keys);
    applyKeyBindings();
    expect(keysOf('reload')).toEqual(['KeyR']);
    expect(keysOf('forward')).toEqual(['KeyW', 'ArrowUp']);
    // a save with a broken value does not stop the others
    old.settings.keys = { reload: 'KeyV', kit: ['KeyU'], nothing: ['KeyZ'] };
    expect(importSave(encodeStore('SDX1', old))).toBe(true);
    applyKeyBindings();
    expect(keysOf('reload')).toEqual(['KeyR']);
    expect(keysOf('kit')).toEqual(['KeyU']);
  });

  test('wiping the data puts the keys back to the defaults', () => {
    bindKey('reload', 0, 'KeyV');
    setKeyBindings(changedBindings());
    persist();
    el('#btnWipe').click();
    el('#btnWipeGo').click();
    expect(keysOf('reload')).toEqual(['KeyR']);
    expect(save.settings.keys).toEqual({});
    expect(guideTexts()[4]).toMatch(/^R/);
  });
});

// the screen stays awake for the whole dive (practice and resume too) and is let go on the base and result screens
describe('screen wake lock', () => {
  const held: { released: boolean }[] = []; // the locks the stand-in navigator.wakeLock handed out
  const heldNow = () => held.filter(l => !l.released).length;
  const settle = () => new Promise(r => setTimeout(r, 0)); // lets the request promises resolve
  beforeAll(() => {
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: () => {
          const lock = {
            released: false,
            release: () => {
              lock.released = true;
              return Promise.resolve();
            },
          };
          held.push(lock);
          return Promise.resolve(lock);
        },
      },
    });
    goBase();
  });
  afterAll(() => {
    Reflect.deleteProperty(navigator, 'wakeLock');
  });
  test('startRun on, endRun off', async () => {
    startRun();
    await settle();
    expect(heldNow()).toBe(1);
    endRun('abandon');
    await settle();
    expect(heldNow()).toBe(0);
    goBase();
  });
  test('startPractice on, endRun off', async () => {
    startPractice('watcher');
    await settle();
    expect(heldNow()).toBe(1);
    endRun('abandon');
    await settle();
    expect(heldNow()).toBe(0);
    goBase();
  });
  test('suspendRun off, resumeRun on, back at the base off', async () => {
    startRun();
    await settle();
    expect(heldNow()).toBe(1);
    suspendRun();
    await settle();
    expect(save.suspend).not.toBeNull();
    expect(heldNow()).toBe(0);
    resumeRun();
    await settle();
    expect(heldNow()).toBe(1);
    endRun('abandon');
    await settle();
    expect(heldNow()).toBe(0);
    goBase();
    await settle();
    expect(heldNow()).toBe(0);
  });
});

// a weapon new to the player (a drop, the loadout) comes with the full magazine of its options and the chips, not
// the bare WEAPONS[id].mag. At the end of the file: rollWeapon draws random numbers
test('a dropped weapon and the loadout come fully loaded, options and chips included', () => {
  setPlayer(newPlayer(save.loadout));
  player.magMul = 1.8; // magazine chips
  for (let k = 0; k < 30; k++) {
    const w = rollWeapon(30);
    expect(w.mag, w.id).toBe(magSize(w));
  }
  const smg = fillMag(newWeapon('smg', 1, false, 0, ['mag', 'mag']));
  expect(smg.mag).toBe(magSize(smg));
  expect(smg.mag, 'more than the bare magazine').toBeGreaterThan(WEAPONS.smg.mag * 1.8);
  // equipping it keeps that magazine
  player.weapons = [newWeapon('pistol', 0, true), smg];
  player.cur = 1;
  expect(player.weapons[player.cur]!.mag).toBe(magSize(smg));
  // the loadout: no chips yet, the option counts
  const opted = newWeapon('smg', 1, false, 0, ['mag']);
  const p = newPlayer([opted, null]);
  expect(p.weapons[0]!.mag).toBeGreaterThan(WEAPONS.smg.mag);
  expect(p.weapons[0]!.mag).toBe(fillMag(newWeapon('smg', 1, false, 0, ['mag']), 1).mag);
  expect(newPlayer([newWeapon('smg', 1), null]).weapons[0]!.mag, 'no option: the bare magazine').toBe(WEAPONS.smg.mag);
  setPlayer(null);
});

// ---- the building: floors, stairwells and lifts, the boss room, the lockdown ----
// kills what is alive in a room right now (a splitter's halves are left for the next call)
const killRoom = (room: number) =>
  enemies.filter(e => e.room === room && !e.dead).forEach(e => hurtEnemy(e, 1e6, false));
// puts the player on a building floor as if they had come down to it by a stairwell or lift (the start room on floor 0)
function goToFloor(floor: number) {
  run.bld!.floor = floor;
  run.bld!.at = floor ? building!.links.findIndex(l => l.upper === floor || l.lower === floor) : -1;
  startStage();
  player.hp = 1e6;
  player.maxHp = 1e6;
  tick(2);
}
// puts the player in the middle of a tile of the floor being played, standing on its ground
function putOnTile(k: number) {
  player.x = ((k % W) + 0.5) * T;
  player.z = (Math.floor(k / W) + 0.5) * T;
  player.fy = floorY(player.x, player.z);
  player.vy = 0;
}
test('building: rooms lie between where one stairwell or lift lets you off and the next', () => {
  // (from the start room for the first one; the shortest way goes through 2 rooms, or 1 where no place gives more)
  const counts: number[] = [];
  // (some seed gives a way through no room in every sector now and then, 1 or 2 ways in 100: of these 40 seeds, the
  // sectors are dealt out from the first, which keeps clear of them)
  for (let seed = 1; seed <= 40; seed++) {
    const b = makeBuilding(BIOMES[(seed - 1) % BIOMES.length]!, 'watcher', seed);
    b.links.forEach((l, n) => {
      const floor = b.route[n]!,
        d = b.plans[floor]!.gen,
        on = (x: typeof l) => (floor === x.upper ? x.a : x.b),
        r = d.rooms[d.startIdx],
        from = n ? on(b.links[n - 1]!) : Math.floor(r!.y + r!.h / 2) * d.W + Math.floor(r!.x + r!.w / 2),
        rooms = roomsOnWay(d, from, on(l), n ? -1 : d.startIdx);
      expect(rooms, `seed ${seed} link ${n}`).toBeGreaterThanOrEqual(1);
      counts.push(rooms);
    });
  }
  expect(counts.filter(c => c >= 2).length / counts.length, '2 rooms or more').toBeGreaterThan(0.85);
});
test('building: a courtyard, an atrium with galleries or a yard seen from balconies (both in the old downtown)', () => {
  const city = BIOMES.find(x => x.code === 'CITY')!;
  for (const open of [false, true]) {
    devCourtOpen(open);
    for (let seed = 1; seed <= 20; seed++) {
      const b = makeBuilding(city, city.bosses[0]!, seed),
        c = b.court!,
        at = `${open ? 'yard' : 'atrium'} seed ${seed}`;
      expect(c, at).not.toBeNull();
      expect(c.open, at).toBe(open);
      expect(c.lower - c.upper, `${at}: through two floors or more`).toBeGreaterThanOrEqual(1);
      expect(c.lower, `${at}: not on the lowest floor (the boss room is higher than a floor)`).toBeLessThan(
        b.plans.length - 1,
      );
      b.plans.forEach((p, floor) => {
        const on = floor >= c.upper && floor <= c.lower,
          { W: w, maps } = p.gen;
        expect(!!p.court, `${at} floor ${floor}`).toBe(on);
        if (!on) return;
        // the open middle is walked on only on an atrium's lowest floor; everywhere else it is a hole (solid)
        const ground = !open && floor === c.lower;
        // (a yard's bridge aside: see the next test)
        for (const k of c.tiles) {
          const walked = ground || p.court!.bridge.includes(k);
          expect(maps.grid[k], `${at} floor ${floor} tile ${k}`).toBe(walked ? 1 : 0);
          expect(p.voids[k], `${at} floor ${floor}: nothing drawn in the hole`).toBe(walked ? 0 : 1);
        }
        if (open) {
          for (const k of p.court!.balcony) expect(maps.grid[k], `${at} floor ${floor} balcony ${k}`).toBe(1);
        } else {
          // a gallery all round the hole
          const ring = new Set(c.tiles.flatMap(k => [k - 1, k + 1, k - w, k + w]).filter(k => !c.tiles.includes(k)));
          for (const k of ring) expect(maps.grid[k], `${at} floor ${floor} gallery ${k}`).toBe(1);
        }
      });
    }
  }
  devCourtOpen(null);
  // the other sectors have the one kind that fits them
  const kinds: Record<string, boolean> = {
    KWLN: true,
    RUIN: true,
    FORGE: false,
    NOISE: false,
    DATA: false,
    MALL: false,
    HOSP: false,
  };
  for (const biome of BIOMES.filter(x => x.code !== 'CITY'))
    for (let seed = 1; seed <= 20; seed++) {
      const c = makeBuilding(biome, biome.bosses[0]!, seed).court;
      if (c) expect(c.open, `${biome.code} seed ${seed}`).toBe(kinds[biome.code]);
    }
});
test('building: a yard is looked at from a balcony, walked along on one side, or crossed by a bridge', () => {
  const city = BIOMES.find(x => x.code === 'CITY')!,
    seen = { balcony: 0, walk: 0, bridge: 0 };
  for (const shape of ['balcony', 'walk', 'bridge', null] as const) {
    devCourtOpen(true, shape);
    for (let seed = 1; seed <= 20; seed++) {
      const b = makeBuilding(city, city.bosses[0]!, seed),
        c = b.court!,
        side = Math.sqrt(c.tiles.length);
      for (let floor = c.upper; floor <= c.lower; floor++) {
        const p = b.plans[floor]!,
          { W: w, maps } = p.gen,
          { balcony, bridge } = p.court!,
          at = `${shape} seed ${seed} floor ${floor}`,
          beside = (k: number) => [k - 1, k + 1, k - w, k + w].some(t => c.tiles.includes(t)),
          // which shape this floor got: a bridge's far end may find no way on, and the floor keeps the lookout
          got = bridge.length ? 'bridge' : balcony.length > 3 ? 'walk' : 'balcony';
        if (shape === null) seen[got]++;
        else if (shape !== 'bridge') expect(got, at).toBe(shape);
        else expect(got, at).not.toBe('walk');
        if (got === 'walk') {
          // the whole of one side, and one of its corners or both (where the floor goes on)
          expect(balcony.filter(beside).length, at).toBe(side);
          expect(balcony.length - side, `${at}: corners`).toBeGreaterThanOrEqual(1);
          const line = new Set(
            balcony.map(k => (Math.abs(balcony[1]! - balcony[0]!) === 1 ? Math.floor(k / w) : k % w)),
          );
          expect(line.size, `${at}: a straight walk`).toBe(1);
        } else {
          expect(balcony.length, at).toBe(got === 'bridge' ? 6 : 3);
          for (const k of balcony) expect(beside(k), `${at} balcony ${k}`).toBe(true);
        }
        if (got === 'bridge') {
          // straight across, from one lookout's middle to the other's; walked on under the open sky
          expect(bridge.length, at).toBe(side);
          const step = bridge[1]! - bridge[0]!;
          expect([1, w], at).toContain(Math.abs(step));
          bridge.forEach((k, n) => expect(k, at).toBe(bridge[0]! + n * step));
          expect(bridge[0]! - step, at).toBe(balcony[1]);
          expect(bridge[side - 1]! + step, at).toBe(balcony[4]);
          for (const k of bridge) expect(maps.grid[k] === 1 && p.noCeil[k] === 1 && !p.voids[k], at).toBe(true);
        }
      }
    }
  }
  devCourtOpen(null);
  for (const [shape, n] of Object.entries(seen)) expect(n, `${shape} by the dice`).toBeGreaterThan(5);
});
test('building: an atrium is passed through, and above its ground a bridge may cross it', () => {
  const city = BIOMES.find(x => x.code === 'CITY')!;
  let bridges = 0,
    floors = 0,
    deadEnds = 0;
  devCourtOpen(false);
  for (let seed = 1; seed <= 30; seed++) {
    const b = makeBuilding(city, city.bosses[0]!, seed),
      c = b.court!;
    for (let floor = c.upper; floor <= c.lower; floor++) {
      const p = b.plans[floor]!,
        { W: w, maps } = p.gen,
        { bridge } = p.court!,
        at = `seed ${seed} floor ${floor}`,
        // the ways in: floor in the wall round the gallery (the ring of tiles two out from the hole)
        i0 = (c.tiles[0]! % w) - 2,
        j0 = Math.floor(c.tiles[0]! / w) - 2,
        ring = Array.from({ length: 49 }, (_, n) => (j0 + Math.floor(n / 7)) * w + i0 + (n % 7)).filter(
          (_, n) => n % 7 === 0 || n % 7 === 6 || n < 7 || n >= 42,
        ),
        ways = ring.filter(k => maps.grid[k] === 1).length;
      floors++;
      expect(ways, `${at}: a way in`).toBeGreaterThanOrEqual(1);
      if (ways < 2) deadEnds++;
      if (!bridge.length) continue;
      bridges++;
      expect(floor, `${at}: not on the ground`).toBeLessThan(c.lower);
      // straight through the middle of the well, from the gallery to the gallery
      expect(bridge.length, at).toBe(3);
      const step = bridge[1]! - bridge[0]!;
      expect([1, w], at).toContain(Math.abs(step));
      expect(bridge[2], at).toBe(bridge[0]! + 2 * step);
      expect(bridge[1], `${at}: the middle tile`).toBe(c.tiles[4]);
      for (const k of [bridge[0]! - step, ...bridge, bridge[2]! + step])
        expect(maps.grid[k], `${at} tile ${k}`).toBe(1);
      for (const k of bridge) expect(p.voids[k], at).toBe(0);
    }
  }
  devCourtOpen(null);
  expect(bridges, 'some floors have a bridge').toBeGreaterThan(5);
  expect(bridges, 'not every floor').toBeLessThan(floors);
  // a second way in, on the far side or round the corner, nearly always found
  expect(deadEnds / floors, 'galleries with one way in only').toBeLessThan(0.05);
});
test("building: an atrium's ground is a room of its floor, with enemies in it", () => {
  const city = BIOMES.find(x => x.code === 'CITY')!;
  devCourtOpen(false);
  for (let seed = 1; seed <= 20; seed++) {
    const b = makeBuilding(city, city.bosses[0]!, seed),
      c = b.court!,
      d = b.plans[c.lower]!.gen,
      w = d.W,
      room = d.rooms.length - 1,
      at = `seed ${seed}`,
      // the middle and the gallery round it
      ground = new Set(c.tiles.flatMap(k => [-w - 1, -w, -w + 1, -1, 0, 1, w - 1, w, w + 1].map(o => k + o)));
    expect(d.rooms[room]!.w * d.rooms[room]!.h, at).toBe(ground.size);
    for (const k of ground) expect(d.maps.roomOf[k], `${at} tile ${k}`).toBe(room);
    // its ways in are corridors, not doors: never the lockdown room
    expect(roomDoors(d, room).closable, at).toBe(false);
    // on the floors above, the gallery is no room
    for (let floor = c.upper; floor < c.lower; floor++)
      for (const k of ground) expect(b.plans[floor]!.gen.maps.roomOf[k], `${at} floor ${floor}`).toBe(-1);
  }
  // in a run, enemies wait there as in any other room
  // (a building of the old downtown has one when a place fits, as nearly all do)
  for (let k = 0; k < 10; k++) {
    goBase();
    startRun();
    run.route = [BIOMES.indexOf(city)];
    run.bld = undefined;
    startStage();
    if (building!.court) break;
  }
  goToFloor(building!.court!.lower);
  const room = level.rooms.length - 1;
  expect(level.roomCount[room]).toBeGreaterThan(0);
  expect(enemies.filter(e => e.room === room && !e.dead).length).toBe(level.roomCount[room]);
  devCourtOpen(null);
});
test('building: the mall has a galleria, a long atrium with a gallery round it, ways in, bridges and a room on its ground', () => {
  const mall = BIOMES.find(x => x.code === 'MALL')!;
  let galleries = 0,
    floors = 0,
    single = 0,
    bridges = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const b = makeBuilding(mall, mall.bosses[0]!, seed),
      c = b.court;
    // (where no long place fits it is the square atrium: rare in the mall)
    if (!c || c.w === c.h) continue;
    galleries++;
    const at = `seed ${seed}`,
      W = b.plans[0]!.gen.W,
      is = c.tiles.map(k => k % W),
      js = c.tiles.map(k => Math.floor(k / W)),
      i0 = Math.min(...is),
      j0 = Math.min(...js),
      alongZ = c.h > c.w,
      length = Math.max(c.w, c.h);
    expect(Math.min(c.w, c.h), `${at}: 3 wide`).toBe(3);
    expect(length, `${at}: 7 or 9 long`).toBeGreaterThanOrEqual(7);
    expect(c.tiles.length, at).toBe(c.w * c.h);
    expect(Math.max(...is) - i0 + 1, at).toBe(c.w);
    expect(Math.max(...js) - j0 + 1, at).toBe(c.h);
    expect(c.open, at).toBe(false);
    expect(c.lower, `${at}: not on the lowest floor`).toBeLessThan(b.plans.length - 1);
    for (let floor = c.upper; floor <= c.lower; floor++) {
      const p = b.plans[floor]!,
        { maps } = p.gen,
        where = `${at} floor ${floor}`;
      // a gallery all round the hole, and the hole is a hole but on the ground
      for (let j = j0 - 1; j <= j0 + c.h; j++)
        for (let i = i0 - 1; i <= i0 + c.w; i++) {
          const k = j * W + i,
            hole = c.tiles.includes(k);
          if (!hole) expect(maps.grid[k], `${where} gallery ${i},${j}`).toBe(1);
          else if (floor < c.lower && !p.court!.bridge.includes(k))
            expect(maps.grid[k], `${where} hole ${i},${j}`).toBe(0);
        }
      // the ways in: floor in the wall round the gallery
      let ways = 0;
      for (let j = j0 - 2; j <= j0 + c.h + 1; j++)
        for (let i = i0 - 2; i <= i0 + c.w + 1; i++)
          if ((i < i0 - 1 || i > i0 + c.w || j < j0 - 1 || j > j0 + c.h) && maps.grid[j * W + i] === 1) ways++;
      floors++;
      expect(ways, `${where}: a way in`).toBeGreaterThanOrEqual(1);
      if (ways < 2) single++;
      const { bridge } = p.court!;
      if (!bridge.length) continue;
      bridges++;
      expect(floor, `${where}: not on the ground`).toBeLessThan(c.lower);
      // across the short way, from gallery to gallery, near the middle of the length
      expect(bridge.length, where).toBe(3);
      const along = bridge.map(k => (alongZ ? Math.floor(k / W) - j0 : (k % W) - i0));
      expect(new Set(along).size, `${where}: straight across`).toBe(1);
      expect(Math.abs(along[0]! - (length - 1) / 2), `${where}: near the middle`).toBeLessThanOrEqual(
        Math.floor(length / 4),
      );
      for (const k of bridge) expect(p.voids[k], where).toBe(0);
    }
    // the ground (the hole and the gallery round it) is a room with enemies
    const d = b.plans[c.lower]!.gen,
      room = d.rooms.length - 1;
    expect(d.rooms[room]!.w * d.rooms[room]!.h, at).toBe((c.w + 2) * (c.h + 2));
    for (let j = j0 - 1; j <= j0 + c.h; j++)
      for (let i = i0 - 1; i <= i0 + c.w; i++) expect(d.maps.roomOf[j * W + i], `${at} ground ${i},${j}`).toBe(room);
    expect(roomDoors(d, room).closable, at).toBe(false);
  }
  expect(galleries, 'nearly every mall building has one').toBeGreaterThan(30);
  expect(bridges, 'some floors have a bridge').toBeGreaterThan(5);
  expect(single / floors, 'galleries with one way in only').toBeLessThan(0.1);
});
test('building: the mall food court is a plaza two steps down inside an aisle of ground, and one walks down and up', () => {
  const mall = BIOMES.find(x => x.code === 'MALL')!;
  let courts = 0,
    bottoms = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const b = makeBuilding(mall, mall.bosses[0]!, seed);
    b.plans.forEach((p, floor) => {
      const room = foodCourtRoom(p);
      if (room < 0) return;
      courts++;
      const { maps, W: w, hazard } = p.gen,
        r = p.gen.rooms[room]!,
        ground = groundOf(maps),
        where = `seed ${seed} floor ${floor}`;
      expect(r.plat, `${where}: no deck in the food court`).toBeFalsy();
      for (let j = r.y; j < r.y + r.h; j++)
        for (let i = r.x; i < r.x + r.w; i++) {
          const k = j * w + i;
          if (maps.grid[k] !== 1) continue;
          const rim = i === r.x || j === r.y || i === r.x + r.w - 1 || j === r.y + r.h - 1;
          if (rim) expect(ground(k), `${where}: ${i},${j} by the wall stays on the ground`).toBeGreaterThanOrEqual(0);
          if (ground(k) >= 0) continue;
          // (a sunk tile is plain floor or cover: no door, ramp, hazard floor or link tile)
          expect([maps.door?.[k] ?? 0, maps.ramp[k]! >= 0 ? 1 : 0, hazard[k], p.noFloor[k], p.voids[k]], where).toEqual(
            [0, 0, 0, 0, 0],
          );
          if (ground(k) === SINK_FLOOR) bottoms++;
          // every neighbour (corners too) is a step away at most, so the bottom never meets the ground
          for (const o of [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1])
            if (maps.grid[k + o] === 1 && maps.ramp[k + o]! < 0)
              expect(Math.abs(ground(k + o) - ground(k)), `${where}: ${i},${j} + ${o}`).toBeLessThanOrEqual(
                -SINK_EDGE + 1e-6,
              );
        }
    });
  }
  expect(courts, 'a food court on most floors').toBeGreaterThan(40);
  expect(bottoms, 'with a bottom').toBeGreaterThan(300);
  // in a run: from the aisle down to the bottom and up again, on the legs and by the flow field
  const room = { floor: -1, aisle: -1, bottom: -1 };
  for (let tries = 0; tries < 10 && room.floor < 0; tries++) {
    goBase();
    startRun();
    run.route = [BIOMES.indexOf(mall)];
    run.bld = undefined;
    startStage();
    building!.plans.forEach((p, floor) => {
      const n = foodCourtRoom(p);
      if (room.floor >= 0 || n < 0) return;
      const { maps, W: w } = p.gen,
        r = p.gen.rooms[n]!,
        bottom = maps.hgt.findIndex((h, k) => h === SINK_FLOOR && maps.roomOf[k] === n);
      if (bottom < 0) return;
      // the aisle: a ground tile of the room's rim, floor all the way to the first step in
      const aisle = (r.y + 1) * w + r.x;
      if (maps.hgt[aisle] === 0 && maps.grid[aisle] === 1) Object.assign(room, { floor, aisle, bottom });
    });
  }
  expect(room.floor, 'a food court to walk in').toBeGreaterThanOrEqual(0);
  goToFloor(room.floor);
  const walk = (from: number, to: number) => {
    const o = {
      x: tileCenter(from % W),
      z: tileCenter(Math.floor(from / W)),
      fy: floorY(tileCenter(from % W), tileCenter(Math.floor(from / W))),
    };
    computeFlow(to % W, Math.floor(to / W));
    for (let n = 0; n < 600 && tileIndex(o.x, o.z) !== to; n++) {
      const d = flowDir(o.x, o.z);
      expect(d, 'a way on').not.toBeNull();
      moveCircle(o, d![0] * 0.2, d![1] * 0.2, 0.4);
      o.fy = floorY(o.x, o.z);
    }
    return o;
  };
  const down = walk(room.aisle, room.bottom);
  expect([tileIndex(down.x, down.z), down.fy]).toEqual([room.bottom, SINK_FLOOR]);
  const up = walk(room.bottom, room.aisle);
  expect([tileIndex(up.x, up.z), up.fy]).toEqual([room.aisle, 0]);
});
test('building: no door has floor beside it (a corridor to a stairwell or lift never passes a door)', () => {
  // a door stands across a corridor: floor before and behind it, wall on its two sides
  for (let seed = 1; seed <= 40; seed++) {
    const b = makeBuilding(BIOMES[seed % BIOMES.length]!, 'watcher', seed);
    b.plans.forEach((p, floor) => {
      const { W: w, maps } = p.gen;
      maps.door?.forEach((v, k) => {
        if (!v) return;
        // (the other half of a door 2 tiles wide is floor beside it, but it is a door)
        const open = (t: number) => maps.grid[t] === 1 && !maps.door![t],
          alongX = open(k - 1) || open(k + 1),
          alongZ = open(k - w) || open(k + w);
        expect(alongX && alongZ, `seed ${seed} floor ${floor} door ${k}`).toBe(false);
      });
    });
  }
});
test('building: nothing hangs on a wall that is not drawn (open down to a stairwell), in any sector', () => {
  // seeds whose buildings hand a wall prop a place on such a wall (in the walled city, floors 2, 0 and 1)
  for (const biome of BIOMES)
    for (const seed of [1, 3, 14]) {
      const b = makeBuilding(biome, biome.bosses[0]!, seed);
      b.plans.forEach((plan, floor) => {
        const g = new Group(),
          W = plan.gen.W,
          m = new Matrix4(),
          p = new Vector3();
        lookOf(biome)!.props(plan, g, createRng(seed + floor));
        g.children.forEach(c => {
          const mesh = c as InstancedMesh;
          for (let n = 0; n < mesh.count; n++) {
            mesh.getMatrixAt(n, m);
            p.setFromMatrixPosition(m);
            // the tile the thing is over, and how far it is from the tile's middle: a thing on a wall is pushed out
            // to within half a metre of that wall, a thing on the ceiling or a light on the ground is not. (A long
            // thing's end may be as far along its wall as that, so it counts as hanging on either wall: one of
            // them must be drawn)
            const i = Math.floor(p.x / T),
              j = Math.floor(p.z / T),
              dx = p.x - (i + 0.5) * T,
              dz = p.z - (j + 0.5) * T,
              walls: number[] = [];
            if (Math.abs(dx) >= T / 2 - 0.5) walls.push(j * W + i + Math.sign(dx));
            if (Math.abs(dz) >= T / 2 - 0.5) walls.push((j + Math.sign(dz)) * W + i);
            if (p.y < 0.1 || !walls.length) continue;
            expect(
              walls.every(k => plan.voids[k]),
              `${biome.code} seed ${seed} floor ${floor} tile ${i},${j}`,
            ).toBe(false);
          }
        });
      });
    }
});
test('building: a sector with corridors 2 wide has doors 2 tiles wide, so a room that can be shut (a lockdown)', () => {
  const city = BIOMES.find(x => x.gen.corridorW === 2)!;
  for (const seed of [31, 62, 93]) {
    const b = makeBuilding(city, city.bosses[0]!, seed);
    expect(b.lockdown, `seed ${seed}`).not.toBeNull();
    const p = b.plans[b.lockdown!.floor]!,
      door = p.gen.maps.door!,
      doors = roomDoors(p.gen, b.lockdown!.room).doors;
    // every door tile of the room has its other half beside it, or is a door 1 wide (the corridor to the boss room)
    for (const k of doors)
      expect([k - 1, k + 1, k - p.gen.W, k + p.gen.W].filter(t => door[t]).length, `door ${k}`).toBeLessThanOrEqual(1);
  }
});
test('building: the same seed gives the same three floors, joined at the same places, the boss room lowest', () => {
  const a = makeBuilding(BIOMES[0]!, 'watcher', 1234),
    b = makeBuilding(BIOMES[0]!, 'watcher', 1234),
    maps = (x: typeof a) => x.plans.map(p => Array.from(p.gen.maps.grid).join('')).join('|');
  expect(maps(a)).toBe(maps(b));
  expect(JSON.stringify([a.links, a.lockdown])).toBe(JSON.stringify([b.links, b.lockdown]));
  expect(maps(makeBuilding(BIOMES[0]!, 'watcher', 1235))).not.toBe(maps(a));
  expect(a.plans.map(p => !!p.hall).join()).toBe(a.plans.map((_, n) => n === a.plans.length - 1).join());
  expect(a.plans.map(p => p.gen.startIdx >= 0).join()).toBe(a.plans.map((_, n) => n === 0).join());
  // over many seeds: buildings of 3, 4 and 5 floors, and routes that go back up on the way down
  const many = Array.from({ length: 60 }, (_, n) => makeBuilding(BIOMES[0]!, 'watcher', n + 1));
  expect([...new Set(many.map(b => b.plans.length))].sort().join()).toBe('3,4,5');
  expect(
    many.some(b => b.route.some((f, n) => n > 0 && f < b.route[n - 1]!)),
    'a route that climbs',
  ).toBe(true);
  // 5 floors: the three floors between are taken in any order (a lift goes up to 3 floors)
  const five = new Set(Array.from({ length: 200 }, (_, n) => makeRoute(5, createRng(n + 1)).join('')));
  expect([...five].sort()).toEqual(['01234', '01324', '02134', '02314', '03124', '03214']);
  expect(new Set(Array.from({ length: 50 }, (_, n) => makeRoute(4, createRng(n + 1)).join(''))).size).toBe(2);
  expect(
    many.some(b => b.links.some(l => l.lower - l.upper === 2)),
    'a lift past a floor',
  ).toBe(true);
  for (const biome of BIOMES)
    for (let seed = 1; seed <= 25; seed++) {
      const kind = biome.bosses[seed % biome.bosses.length]!,
        bld = makeBuilding(biome, kind, seed),
        at = `${biome.code} seed ${seed}`,
        last = bld.plans[bld.plans.length - 1]!,
        hall = last.gen.rooms[last.hall!.room]!;
      expect(`${hall.w}x${hall.h}`, at).toBe('12x12');
      expect(last.gen.rooms.length - 1, at).toBeGreaterThanOrEqual(3);
      expect(last.gen.rooms.length - 1, at).toBeLessThanOrEqual(4);
      // the boss's pillars stand where they do in a boss arena (2 tiles in from the corners)
      expect(last.gen.maps.grid[(hall.y + 2) * last.gen.W + hall.x + 2], at).toBe(BOSS_META[kind]!.pillars ? 0 : 1);
      // the route: every floor once, from the top to the lowest, never more than two floors at a step
      const F = bld.plans.length;
      expect(F >= FLOORS_RANGE[0] && F <= FLOORS_RANGE[1], at).toBe(true);
      expect(bld.route.slice().sort().join(), at).toBe(bld.plans.map((_, n) => n).join());
      expect(bld.route[0] === 0 && bld.route[F - 1] === F - 1, at).toBe(true);
      // one stairwell or lift per step of the route, joining exactly those two floors
      expect(bld.links.length, at).toBe(F - 1);
      // the floors FLOOR_H apart, but the lowest LAST_GAP under the one above it (its boss room is taller)
      expect(
        bld.grounds
          .slice(1)
          .map((g, n) => bld.grounds[n]! - g)
          .join(),
        at,
      ).toBe([...Array(F - 2).fill(FLOOR_H), LAST_GAP].join());
      bld.links.forEach((l, n) => {
        expect([l.upper, l.lower].join(), at).toBe([bld.route[n]!, bld.route[n + 1]!].sort().join());
        expect(l.lower - l.upper, at).toBeLessThanOrEqual(l.kind === 'stairs' ? 1 : 3);
      });
      for (const l of bld.links) {
        const up = bld.plans[l.upper]!.gen.maps,
          lo = bld.plans[l.lower]!.gen.maps;
        if (l.kind === 'elevator') {
          // one tile, floor on the two floors it stops at, wall on a floor it only passes
          expect(l.strip.length === 1 && up.grid[l.a] === 1 && lo.grid[l.a] === 1 && l.a === l.b, at).toBe(true);
          for (let n = l.upper + 1; n < l.lower; n++) {
            expect(bld.plans[n]!.gen.maps.grid[l.a], at).toBe(0);
            expect(bld.plans[n]!.voids[l.a] && bld.plans[n]!.noCeil[l.a], `${at}: an open shaft`).toBeTruthy();
          }
          continue;
        }
        // the lower floor: the foot on the ground, ramps one RISE after the other (as many as the gap needs), the
        // landing at the next floor
        const gap = bld.grounds[l.upper]! - bld.grounds[l.lower]!,
          ramps = gap / 2;
        expect(l.strip.length, at).toBe(ramps + 3);
        expect(
          l.strip.every(k => lo.grid[k] === 1),
          at,
        ).toBe(true);
        expect(l.strip.map(k => lo.hgt[k]).join(), at).toBe(
          [0, ...Array.from({ length: ramps }, (_, n) => n * 2), gap, gap].join(),
        );
        expect(l.strip.map(k => (lo.ramp[k]! >= 0 ? 1 : 0)).join(), at).toBe([0, ...Array(ramps).fill(1), 0, 0].join());
        // the upper floor: only the landing is floor, on its ground; the same two tiles
        expect(l.strip.map(k => up.grid[k]).join(), at).toBe([...Array(ramps + 1).fill(0), 1, 1].join());
        expect(up.hgt[l.a] === 0 && up.hgt[l.b] === 0, at).toBe(true);
        expect([l.b, l.a].join(), at).toBe(l.strip.slice(-2).join());
        // drawn open: no wall over the stairs on the upper floor, no ceiling over them on the lower floor
        const upPlan = bld.plans[l.upper]!,
          loPlan = bld.plans[l.lower]!;
        expect(
          l.strip.slice(0, -2).every(k => upPlan.voids[k]),
          at,
        ).toBe(true);
        expect(
          l.strip.every(k => loPlan.noCeil[k]),
          at,
        ).toBe(true);
      }
      // no two doors one right after the other along a corridor; the boss room keeps its door
      bld.plans.forEach(p => {
        const door = p.gen.maps.door;
        door?.forEach((v, k) => {
          if (!v) return;
          // along the corridor: the axis with floor that is not door on it (the other half of a door 2 tiles wide
          // is beside it, across the corridor)
          const grid = p.gen.maps.grid,
            step = [1, p.gen.W].find(st => [k - st, k + st].some(t => grid[t] === 1 && !door[t]))!;
          for (const n of [1, 2]) expect(door[k + step * n], at).toBeFalsy();
        });
      });
      expect(last.gen.maps.door![last.hall!.door], at).toBe(1);
      // no hazard floor on a door, in the boss room, or on a stairwell or lift
      bld.plans.forEach(p => {
        p.gen.maps.door?.forEach((v, k) => expect(v && p.gen.hazard[k], at).toBeFalsy());
      });
      for (let j = hall.y; j < hall.y + hall.h; j++)
        for (let i = hall.x; i < hall.x + hall.w; i++) expect(last.gen.hazard[j * last.gen.W + i], at).toBe(0);
      for (const l of bld.links)
        for (const k of l.strip) for (const n of [l.upper, l.lower]) expect(bld.plans[n]!.gen.hazard[k], at).toBe(0);
      // the lockdown room can be shut, and is not the start room or the boss room
      const ld = bld.lockdown;
      if (!ld) continue;
      const plan = bld.plans[ld.floor]!;
      expect(roomDoors(plan.gen, ld.room).closable, at).toBe(true);
      expect(ld.room !== plan.gen.startIdx && ld.room !== plan.hall?.room, at).toBe(true);
    }
});
test('building run: a cleared room stays empty across floors and a resume; the checkpoint follows the floor', () => {
  // a building whose top floor has at least two ordinary rooms with enemies (one to empty, one to wound an enemy in):
  // on a small top floor the lockdown room can leave fewer
  const plainRooms = () => {
    const ld0 = building!.lockdown;
    return level.roomCount.filter((n, idx) => n > 0 && !(ld0 && ld0.floor === 0 && ld0.room === idx)).length;
  };
  for (let k = 0; k < 40; k++) {
    goBase();
    startRun();
    tick(5);
    if (plainRooms() >= 2) break;
  }
  player.hp = 1e6;
  player.maxHp = 1e6;
  expect(level.floor).toBe(0);
  expect(run.bld!.step).toBe(0);
  expect(run.stage % PER).toBe(0);
  expect(level.portals.length, 'no gate: the floors are joined by stairwells and lifts').toBe(0);
  // empty one room (not the lockdown room: that one sends waves)
  const ld = building!.lockdown,
    room = level.roomCount.findIndex((n, idx) => n > 0 && !(ld && ld.floor === 0 && ld.room === idx));
  for (let k = 0; k < 6 && level.roomCount[room]! > 0; k++) killRoom(room);
  expect(run.bld!.cleared[0]).toContain(room);
  // a wounded enemy and a dropped kit are left behind on this floor
  const hurt = enemies.find(e => !e.dead && e.room !== room && e.hp > 2)!,
    hpLeft = hurt.hp - 1;
  hurtEnemy(hurt, 1, false);
  const [kx, kz] = roomSpot(level.rooms[level.startIdx]!),
    kit = addPickup('kit', kx + 3, kz),
    countsWas = level.roomCount.join();
  // the first step of the route: its stairwell or lift leads to the route's second floor
  const n = 0,
    next = building!.route[1]!,
    arrive = building!.links[n]!;
  useLink(n);
  tick(5);
  expect(enemies.includes(hurt) || query<Pickup>('pickup').includes(kit), 'the floor left took them along').toBe(false);
  expect(level.floor).toBe(next);
  expect(run.bld!.step, 'the second floor of the route, whichever floor that is').toBe(1);
  expect(stageLabel(run.stage)).toBe(`D${run.bld!.tier + 1} 2/${run.bld!.floors}`);
  // the top-left label also says which floor of the building this is, counted from the top
  expect(el('#stageLbl').textContent).toContain(` ${next + 1}F`);
  expect(progressOf(run.stage), 'the strength follows the route').toBeCloseTo(run.bld!.tier * 5 + 4 / run.bld!.floors);
  expect(tileIndex(player.x, player.z), 'the player stands where the link ends on this floor').toBe(arrive.b);
  // at the top of a stairwell that is a floor above this floor's ground; on a lift's platform it is the ground
  expect(player.fy).toBeCloseTo(arrive.kind === 'stairs' ? building!.grounds[0]! - building!.grounds[next]! : 0);
  expect((save.suspend as Snapshot | null)?.run.bld?.floor, 'the checkpoint is on the new floor').toBe(next);
  expect(level.startIdx, 'no start room down here').toBe(-1);
  tick(120);
  expect(level.floor, 'standing there changes nothing').toBe(next);
  useLink(n);
  tick(5);
  expect(level.floor).toBe(0);
  expect(level.roomCount[room]).toBe(0);
  expect(
    enemies.some(e => e.room === room && !e.dead),
    'the cleared room is still empty',
  ).toBe(false);
  expect(
    level.roomCount.some(c => c > 0),
    'the other rooms have their enemies',
  ).toBe(true);
  // the floor is as it was left: the same enemies (the wounded one still wounded), the kit still lying there
  expect(level.roomCount.join()).toBe(countsWas);
  expect(enemies.includes(hurt) && !hurt.dead).toBe(true);
  expect(hurt.hp).toBeCloseTo(hpLeft);
  expect(hurt.mesh.parent, 'drawn again').toBeTruthy();
  expect(query<Pickup>('pickup').includes(kit)).toBe(true);
  // suspending and resuming builds the same floor again, with the room still cleared and the map as it was explored
  // when the checkpoint was saved
  const gridWas = Array.from(grid).join(''),
    seenWas = (save.suspend as Snapshot | null)!.run.bld!.seen!;
  expect(seenWas.length).toBe(building!.plans.length);
  expect(
    building!.plans[0]!.seen.some(v => v === 1),
    'something of the top floor has been seen',
  ).toBe(true);
  suspendRun();
  building!.plans.forEach(p => p.seen.fill(0)); // (the building in memory is the same object here: make sure the map is read back)
  setBuilding(null);
  resumeRun();
  expect(packSeen(building!).join(), 'the explored map came back').toBe(seenWas.join());
  tick(5);
  expect(Array.from(grid).join('')).toBe(gridWas);
  expect(level.roomCount[room]).toBe(0);
});
test('building: a yard is open to the sky (no floor above it has floor over it)', () => {
  devCourtOpen(true);
  for (const biome of BIOMES)
    for (let seed = 1; seed <= 20; seed++) {
      const b = makeBuilding(biome, biome.bosses[0]!, seed),
        c = b.court;
      if (!c?.open) continue;
      const W = b.plans[0]!.gen.W,
        is = c.tiles.map(k => k % W),
        js = c.tiles.map(k => Math.floor(k / W));
      // (the open middle and the wall round it)
      for (let f = 0; f < c.upper; f++)
        for (let j = Math.min(...js) - 1; j <= Math.max(...js) + 1; j++)
          for (let i = Math.min(...is) - 1; i <= Math.max(...is) + 1; i++)
            expect(b.plans[f]!.gen.maps.grid[j * W + i], `${biome.code} seed ${seed} floor ${f} tile ${i},${j}`).toBe(
              0,
            );
    }
  devCourtOpen(null);
});
test('building: the layout a seed gives is that of BUILDING_V', () => {
  // A few buildings of every sector (the maps and the floor heights), as one number. When this fails, the same seed gives another building now: raise
  // BUILDING_V in src/world/building.ts (a run suspended before is then fitted onto the new building), and put the new
  // version and number here
  devCourtOpen(null);
  let h = 2166136261; // FNV-1a
  const mix = (text: string) => {
    for (let k = 0; k < text.length; k++) h = Math.imul(h ^ text.charCodeAt(k), 16777619) >>> 0;
  };
  for (const biome of BIOMES)
    for (const seed of [1, 2, 3]) {
      const b = makeBuilding(biome, biome.bosses[0]!, seed);
      b.plans.forEach(p => mix(Array.from(p.gen.maps.grid).join('') + Array.from(p.gen.maps.hgt).join()));
      mix(JSON.stringify([b.route, b.links.map(l => [l.kind, l.upper, l.lower, l.a, l.b]), b.lockdown, !!b.court]));
    }
  expect(`v${BUILDING_V} ${h.toString(16)}`).toBe('v6 38e80132');
});
test('mall: the big rooms have islands of cover, and one can still walk to every doorway of the room', () => {
  devCourtOpen(null);
  const mall = BIOMES.find(b => b.code === 'MALL')!;
  let islands = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const b = makeBuilding(mall, mall.bosses[0]!, seed);
    b.plans.forEach((p, floor) => {
      const { W, maps, rooms } = p.gen,
        food = foodCourtRoom(p),
        at = `seed ${seed} floor ${floor}`;
      rooms.forEach((r, n) => {
        const mine = p.islands.filter(s => s.i >= r.x && s.i < r.x + r.w && s.j >= r.y && s.j < r.y + r.h);
        islands += mine.length;
        if (!mine.length) return;
        // (only a big room with nothing special in it, and 1 to 3 islands, two tiles from the walls, each of waist-high cover)
        expect(r.w * r.h, `${at} room ${n}`).toBeGreaterThanOrEqual(ISLAND_MIN_AREA);
        expect([r.plat, n === p.gen.startIdx, n === p.hall?.room, n === food], `${at} room ${n}`).toEqual([
          undefined,
          false,
          false,
          false,
        ]);
        expect(mine.length).toBeLessThanOrEqual(3);
        for (const s of mine) {
          expect(s.w * s.h).toBeGreaterThanOrEqual(2);
          expect(s.w * s.h).toBeLessThanOrEqual(4);
          expect(s.i - r.x, `${at} room ${n}`).toBeGreaterThanOrEqual(2);
          expect(s.j - r.y, `${at} room ${n}`).toBeGreaterThanOrEqual(2);
          expect(r.x + r.w - (s.i + s.w), `${at} room ${n}`).toBeGreaterThanOrEqual(2);
          expect(r.y + r.h - (s.j + s.h), `${at} room ${n}`).toBeGreaterThanOrEqual(2);
          for (let j = s.j; j < s.j + s.h; j++)
            for (let i = s.i; i < s.i + s.w; i++) {
              expect([maps.cover[j * W + i], maps.hgt[j * W + i]], `${at} room ${n}`).toEqual([
                1,
                Math.fround(COVER_H),
              ]);
              expect(p.gen.hazard[j * W + i]).toBe(0);
            }
        }
        // the doorways of the room (the room's floor tiles with a floor tile outside the room next to them) are all joined
        // by walking over the room's tiles that are not cover
        const inside = (k: number) =>
            k % W >= r.x && k % W < r.x + r.w && ((k / W) | 0) >= r.y && ((k / W) | 0) < r.y + r.h,
          free = (k: number) => inside(k) && maps.grid[k] === 1 && !maps.cover[k],
          doorways: number[] = [];
        for (let j = r.y; j < r.y + r.h; j++)
          for (let i = r.x; i < r.x + r.w; i++) {
            const k = j * W + i;
            if (free(k) && [1, -1, W, -W].some(o => !inside(k + o) && maps.grid[k + o] === 1)) doorways.push(k);
          }
        expect(doorways.length, `${at} room ${n}`).toBeGreaterThan(0);
        const seen = new Set<number>(doorways.slice(0, 1)),
          queue = doorways.slice(0, 1);
        for (let q = 0; q < queue.length; q++)
          for (const o of [1, -1, W, -W]) {
            const k = queue[q]! + o;
            if (free(k) && !seen.has(k)) {
              seen.add(k);
              queue.push(k);
            }
          }
        expect(
          doorways.every(k => seen.has(k)),
          `${at} room ${n}: the doorways are not all joined`,
        ).toBe(true);
      });
    });
  }
  expect(islands).toBeGreaterThan(30);
  // (the other sectors have none; the hospital's are tested below)
  for (const biome of BIOMES.filter(x => x.code !== 'MALL' && x.code !== 'HOSP'))
    expect(makeBuilding(biome, biome.bosses[0]!, 1).plans.every(p => !p.islands.length)).toBe(true);
});
test('hospital: the rooms have kinds, the biggest is the waiting hall, and the islands leave the room walkable', () => {
  devCourtOpen(null);
  const hosp = BIOMES.find(b => b.code === 'HOSP')!,
    kindsSeen = new Set<number>();
  let islands = 0,
    halls = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const b = makeBuilding(hosp, hosp.bosses[0]!, seed);
    b.plans.forEach((p, floor) => {
      const { W, maps, rooms } = p.gen,
        kinds = hospRoomKinds(p),
        waiting = waitingRoom(p),
        at = `seed ${seed} floor ${floor}`;
      expect(kinds.length).toBe(rooms.length);
      kinds.forEach((kind, n) => {
        kindsSeen.add(kind);
        expect(kind, `${at} room ${n}`).toBeGreaterThanOrEqual(-1);
        expect(kind, `${at} room ${n}`).toBeLessThan(HOSP_KINDS);
        // (the start room and the operating theatre have no kind)
        if (n === p.gen.startIdx || n === p.hall?.room) expect(kind, `${at} room ${n}`).toBe(-1);
        if (kind === KIND_WAITING) expect(n, `${at} room ${n}`).toBe(waiting);
      });
      if (waiting >= 0) {
        halls++;
        const r = rooms[waiting]!;
        expect(r.w * r.h).toBeGreaterThanOrEqual(48);
        expect(rooms.every((o, n) => n === waiting || kinds[n] === -1 || o.plat || o.w * o.h <= r.w * r.h)).toBe(true);
      }
      p.islands.forEach(s => {
        islands++;
        const n = maps.roomOf[s.j * W + s.i]!;
        expect(kinds[n], `${at} room ${n}`).toBeGreaterThanOrEqual(0);
      });
      // one can walk from any free tile of a room that has islands to every other
      rooms.forEach((r, n) => {
        if (!p.islands.some(s => maps.roomOf[s.j * W + s.i] === n)) return;
        const free: number[] = [];
        for (let j = r.y; j < r.y + r.h; j++)
          for (let i = r.x; i < r.x + r.w; i++)
            if (maps.grid[j * W + i] === 1 && !maps.cover[j * W + i]) free.push(j * W + i);
        const reached = new Set<number>(free.slice(0, 1)),
          queue = free.slice(0, 1);
        for (let q = 0; q < queue.length; q++)
          for (const o of [1, -1, W, -W]) {
            const k = queue[q]! + o;
            if (free.includes(k) && !reached.has(k)) {
              reached.add(k);
              queue.push(k);
            }
          }
        expect(reached.size, `${at} room ${n}: the free floor is cut in two`).toBe(free.length);
      });
    });
  }
  expect(islands).toBeGreaterThan(10);
  expect(halls).toBeGreaterThan(10);
  // (every kind comes up somewhere)
  for (let kind = 0; kind < HOSP_KINDS; kind++) expect(kindsSeen.has(kind), `kind ${kind}`).toBe(true);
});
test('resume: a run saved on a building laid out another way goes on at the same step of the route', () => {
  goBase();
  startRun();
  tick(5);
  useLink(0);
  tick(5);
  const route = building!.route,
    arrive = building!.links[0]!;
  expect(run.bld!.step).toBe(1);
  // the checkpoint as an older layout left it: no version, the stairwell or lift it came by and the rooms out of range
  const saved = (save.suspend as Snapshot | null)!.run.bld!;
  delete saved.v;
  saved.at = 99;
  saved.cleared = saved.cleared.map(() => [98, 99]);
  saved.seen = ['broken'];
  suspendRun();
  setBuilding(null);
  resumeRun();
  tick(5);
  const st = run.bld!;
  expect(st.v).toBe(BUILDING_V);
  expect([st.step, st.floor, level.floor]).toEqual([1, route[1], route[1]]);
  expect(tileIndex(player.x, player.z), 'where the first step of the route lets the player off').toBe(arrive.b);
  // the top floor counts as done: every room, so its rooms give no chips again; the floor played now is not entered yet
  expect(st.cleared[0]!.length).toBe(building!.plans[0]!.gen.rooms.length);
  expect(st.visited[0]).toBe(true);
  expect(st.cleared[route[1]!]).toEqual([]);
  expect(
    level.roomCount.some(n => n > 0),
    'the floor has its enemies',
  ).toBe(true);
  expect(
    building!.plans.filter((_, floor) => floor !== route[1]).every(p => p.seen.every(v => v === 0)),
    'the map starts unexplored (but where the player stands now)',
  ).toBe(true);
});
test('stairwell: walking over the landing changes the floor without moving the player in the world', () => {
  // a run whose building has a stairwell (about half the steps of a route are one)
  for (let k = 0; k < 40 && !building!.links.some(x => x.kind === 'stairs'); k++) {
    goBase();
    startRun();
    tick(2);
  }
  const l = building!.links.find(x => x.kind === 'stairs')!,
    stepOf = (floor: number) => building!.route.indexOf(floor);
  goToFloor(l.upper);
  enemies.slice().forEach(e => hurtEnemy(e, 1e6, false));
  const S = l.strip,
    [foot, top, l1, l2] = [S[0]!, S[S.length - 3]!, S[S.length - 2]!, S[S.length - 1]!],
    gap = building!.grounds[l.upper]! - building!.grounds[l.lower]!;
  // on the upper floor the far landing tile changes nothing
  putOnTile(l2);
  tick(2);
  expect(level.floor).toBe(l.upper);
  // at the stairwell the floor below is drawn (it is seen down the stairs)
  // (another stairwell or lift of this floor may be near too, so the other floors are not checked)
  expect(floorDrawn(l.upper) && floorDrawn(l.lower)).toBe(true);
  expect(player.fy).toBeCloseTo(0);
  // the tile nearer the stairs is the lower floor's: its ground is a floor below, so the player is the gap above it
  putOnTile(l1);
  tick(2);
  expect(level.floor).toBe(l.lower);
  expect(player.fy, 'the same height in the world').toBeCloseTo(gap);
  expect(floorY(player.x, player.z)).toBeCloseTo(gap);
  expect(run.bld!.step).toBe(stepOf(l.lower));
  // down the ramps to the foot
  putOnTile(top);
  tick(2);
  expect(player.fy).toBeGreaterThan(gap - 2.01);
  expect(player.fy).toBeLessThan(gap);
  putOnTile(foot);
  tick(2);
  expect(level.floor).toBe(l.lower);
  expect(player.fy).toBeCloseTo(0);
  // and back up: the far landing tile is the upper floor's
  putOnTile(l1);
  tick(2);
  expect(level.floor, 'still the lower floor on the near tile').toBe(l.lower);
  putOnTile(l2);
  tick(2);
  expect(level.floor).toBe(l.upper);
  expect(player.fy).toBeCloseTo(0);
  expect(run.bld!.step).toBe(stepOf(l.upper));
});
test('running: the dash held on after a dash keeps the player fast and drains stamina until it is let go', () => {
  // a long straight corridor, the player walking along it (the stick pushed forward)
  const rows = ['#'.repeat(64), '#' + '.'.repeat(62) + '#', '#'.repeat(64)];
  goBase();
  startRun();
  tick(2);
  buildFixedLevel(BIOMES[0]!, { rows, rooms: [{ x: 1, y: 1, w: 62, h: 1 }], start: 0, exit: 0 });
  const walk = (frames: number) => {
    const from = player.x;
    tick(frames);
    return Math.abs(player.x - from);
  };
  player.x = 2 * T;
  player.z = 1.5 * T;
  player.fy = 0;
  player.yaw = -Math.PI / 2; // facing +x
  joy.y = -1;
  tick(2);
  const plain = walk(30);
  expect(plain).toBeGreaterThan(1);
  // a dash, the button held: after the dash the player runs
  player.st = player.stMax;
  controlState.dashHeld = true;
  controlState.dashReq = true;
  tick(Math.ceil(TUNE.dashTime * 60) + 2);
  expect(player.sprint).toBe(true);
  const st0 = player.st,
    run1 = walk(30);
  expect(run1 / plain, 'sprintSpeed times as far').toBeCloseTo(TUNE.sprintSpeed, 1);
  expect(st0 - player.st, 'half a second of sprintCost').toBeCloseTo(TUNE.sprintCost * 0.5, 0);
  // let go: back to walking, and the stamina refills after the usual delay
  controlState.dashHeld = false;
  tick(1);
  expect(player.sprint).toBe(false);
  expect(walk(30) / plain).toBeCloseTo(1, 1);
  tick(60);
  expect(player.st).toBeGreaterThan(st0 - TUNE.sprintCost * 0.5);
  // holding the button on its own (no new press) does not run
  controlState.dashHeld = true;
  expect(walk(30) / plain).toBeCloseTo(1, 1);
  // shooting on the run scatters the rounds, even from a rail gun (which is steady when walking)
  const keep = player.weapons[player.cur];
  player.weapons[player.cur] = newWeapon('rail', 0);
  player.extra = 0;
  player.pitch = 0;
  const widest = () => {
    let most = 0;
    for (let k = 0; k < 40; k++) {
      pBullets.forEach(b => {
        b.alive = false;
      });
      player.fireCd = 0;
      player.reloadT = 0;
      player.weapons[player.cur]!.mag = 4;
      fire();
      const b = pBullets.find(x => x.alive)!;
      most = Math.max(most, Math.abs(Math.atan2(b.vz, b.vx))); // the player faces +x
    }
    return most;
  };
  joy.y = 0; // standing still for the shots: only the running state differs
  player.sprint = true;
  player.dashT = 0;
  expect(widest(), 'running').toBeGreaterThan(RUNNING_SPREAD * 0.6);
  player.sprint = false;
  // (the muzzle sits beside the eye, so a straight shot is a hair off the facing direction)
  expect(widest(), 'not running: straight').toBeLessThan(RUNNING_SPREAD * 0.3);
  joy.y = -1;
  player.weapons[player.cur] = keep;
  // touch: held for a moment, the run goes on after the button is let go, until the stick comes back
  controlState.dashHeld = false;
  tick(2);
  player.st = player.stMax;
  player.stDelay = 9;
  joy.id = 1;
  controlState.dashHeld = true;
  controlState.dashReq = true;
  tick(Math.ceil(TUNE.dashTime * 60) + 20);
  controlState.dashHeld = false;
  tick(20);
  expect(player.sprint, 'still running with the thumb off the button').toBe(true);
  joy.y = -0.3;
  tick(2);
  expect(player.sprint, 'the stick came back: walking').toBe(false);
  joy.y = -1;
  // a short press does not latch: the run ends with the button
  player.st = player.stMax;
  controlState.dashHeld = true;
  controlState.dashReq = true;
  tick(Math.ceil(TUNE.dashTime * 60) + 2);
  controlState.dashHeld = false;
  tick(2);
  expect(player.sprint, 'a short press: no run').toBe(false);
  joy.id = null;
  // too little stamina for a dash: no dash, but holding on still runs on what is left
  controlState.dashHeld = false;
  tick(2);
  player.st = TUNE.dashCost - 5;
  player.stDelay = 9; // no refill during the check
  controlState.dashHeld = true;
  controlState.dashReq = true;
  tick(1);
  expect(player.dashT, 'no dash').toBeLessThanOrEqual(0);
  expect(player.sprint).toBe(true);
  expect(walk(30) / plain).toBeCloseTo(TUNE.sprintSpeed, 1);
  // it stops when the stamina is gone
  controlState.dashHeld = false;
  tick(2);
  controlState.dashHeld = true;
  player.st = TUNE.dashCost + 2;
  controlState.dashReq = true;
  tick(Math.ceil(TUNE.dashTime * 60) + 2);
  expect(player.sprint).toBe(true);
  tick(60);
  expect(player.sprint, 'out of stamina').toBe(false);
  controlState.dashHeld = false;
  joy.y = 0;
  // a run in a building again, for the tests below
  goBase();
  startRun();
  tick(2);
});
test('map: what lies behind a wall stays off the map until the player has a line to it', () => {
  const b = building!,
    mid = (k: number): [number, number] => [((k % W) + 0.5) * T, (Math.floor(k / W) + 0.5) * T];
  let checked = 0;
  b.plans.forEach((plan, floor) => {
    goToFloor(floor);
    // a corridor tile to stand on, and a floor tile inside the map's reveal circle (4 tiles) with a wall between the
    // two. (From a corridor: standing in a room opens the whole room, whatever is in the way.) Any floor has such a
    // pair: wherever two corridors, or a corridor and a room, lie a wall apart
    let from = -1,
      hidden = -1;
    for (let q = 0; q < W * H && hidden < 0; q++) {
      if (grid[q] !== 1 || level.roomOf[q]! >= 0) continue;
      for (let dj = -4; dj <= 4 && hidden < 0; dj++)
        for (let di = -4; di <= 4 && hidden < 0; di++) {
          const k = q + dj * W + di;
          if (di * di + dj * dj > 16 || k < 0 || k >= W * H || grid[k] !== 1) continue;
          if (hasLOS(...mid(q), ...mid(k))) continue;
          from = q;
          hidden = k;
        }
    }
    if (hidden < 0) return;
    checked++;
    plan.seen.fill(0);
    reveal(from % W, Math.floor(from / W));
    expect(plan.seen[from], 'the tile stood on is on the map').toBe(1);
    expect(plan.seen[hidden], `floor ${floor}: the tile behind the wall is not`).toBe(0);
    reveal(hidden % W, Math.floor(hidden / W));
    expect(plan.seen[hidden], 'standing on it puts it on the map').toBe(1);
  });
  expect(checked, 'every floor has a wall with floor on both sides').toBe(b.plans.length);
  goToFloor(0);
});
test('dash: in long frames (20 fps) a dash still goes up a stairwell', () => {
  const b = building!,
    stairs = b.links.find(l => l.kind === 'stairs');
  if (!stairs) return; // a building without a stairwell: nothing to climb
  goToFloor(stairs.lower);
  const step = stairs.strip[1]! - stairs.strip[0]!,
    di = Math.abs(step) === 1 ? step : 0,
    dj = Math.abs(step) === 1 ? 0 : Math.sign(step);
  putOnTile(stairs.strip[0]!);
  const from = { x: player.x, z: player.z };
  player.dashT = TUNE.dashTime;
  player.ddx = di;
  player.ddz = dj;
  for (let k = 0; k < 4; k++) runSystems(0.05);
  // 0.2 s of dash is about 4.9 m; stopped at the first metre of the ramp it would be about 2.4 m
  expect(Math.hypot(player.x - from.x, player.z - from.z), 'how far the dash went').toBeGreaterThan(4);
  expect(player.fy, 'and it climbed').toBeGreaterThan(1);
  goToFloor(0);
});
test('followers: an awake enemy close behind comes down the stairwell after the player and still counts for its room', () => {
  const b = building!,
    l = b.links.find(x => x.kind === 'stairs');
  if (!l) return; // a building without a stairwell: nobody can follow
  goToFloor(l.upper);
  // nobody else on the floor (twice over: a splitter leaves its halves, awake)
  for (let k = 0; k < 3; k++) enemies.slice().forEach(e => hurtEnemy(e, 1e6, false));
  tick(1);
  expect(enemies.filter(e => !e.dead).length).toBe(0);
  const l1 = l.strip[l.strip.length - 2]!,
    l2 = l.strip[l.strip.length - 1]!,
    behind = l2 + (l2 - l1), // the upper floor's corridor, one tile past the landing
    // (not the lockdown room: cleared from another floor before its lockdown, it is not marked cleared)
    room = level.rooms.findIndex(
      (_, r) => r !== level.startIdx && !(b.lockdown?.floor === l.upper && b.lockdown.room === r),
    );
  putOnTile(l2);
  tick(2);
  // the last enemy of a room of this floor, awake, two tiles behind the player
  const e = spawnEnemy('crawler', ((behind % W) + 0.5) * T, (Math.floor(behind / W) + 0.5) * T, room, 1);
  e.active = true;
  level.roomCount[room] = 1;
  run.bld!.cleared[l.upper] = run.bld!.cleared[l.upper]!.filter(r => r !== room);
  putOnTile(l1);
  tick(1);
  expect(level.floor, 'the player is on the floor below').toBe(l.lower);
  expect(enemies.includes(e), 'the enemy is off the field, on its way').toBe(false);
  expect(followersOnTheWay()).toBe(1);
  expect(stashedRoomCount(l.upper)![room], 'its room is not cleared yet').toBe(1);
  tick(150);
  expect(enemies.includes(e), 'it came out on this floor').toBe(true);
  expect(followersOnTheWay()).toBe(0);
  expect(e.floor, 'it still belongs to the floor above').toBe(l.upper);
  const pickups = query('pickup').length;
  hurtEnemy(e, 1e6, false);
  expect(stashedRoomCount(l.upper)![room], 'killed here, its room above is cleared').toBe(0);
  expect(run.bld!.cleared[l.upper]).toContain(room);
  expect(query('pickup').length, 'and the reward dropped here').toBeGreaterThan(pickups);
  // a lift leaves the enemies behind
  const lift = b.links.find(x => x.kind === 'elevator');
  if (lift) {
    goToFloor(lift.upper);
    const near = spawnEnemy('crawler', player.x + 1, player.z, -1, 1);
    near.active = true;
    tick(1);
    crossToFloor(b.links.indexOf(lift), lift.lower);
    expect(followersOnTheWay(), 'nobody follows a lift').toBe(0);
  }
  goToFloor(0);
});
test('followers: one left behind on another floor goes back to its own room when the player leaves that floor', () => {
  const b = building!,
    l = b.links.find(x => x.kind === 'stairs');
  if (!l) return;
  goToFloor(l.upper);
  for (let k = 0; k < 3; k++) enemies.slice().forEach(e => hurtEnemy(e, 1e6, false));
  tick(1);
  const l1 = l.strip[l.strip.length - 2]!,
    l2 = l.strip[l.strip.length - 1]!,
    behind = l2 + (l2 - l1),
    room = level.rooms.findIndex(
      (_, r) => r !== level.startIdx && !(b.lockdown?.floor === l.upper && b.lockdown.room === r),
    );
  putOnTile(l2);
  tick(2);
  const e = spawnEnemy('crawler', ((behind % W) + 0.5) * T, (Math.floor(behind / W) + 0.5) * T, room, 1);
  e.active = true;
  level.roomCount[room] = 1;
  run.bld!.cleared[l.upper] = run.bld!.cleared[l.upper]!.filter(r => r !== room);
  putOnTile(l1);
  tick(150);
  expect(level.floor).toBe(l.lower);
  expect(enemies.includes(e), 'it followed the player down').toBe(true);
  // the player shakes it off (it is no longer close behind) and goes back up
  e.active = false;
  crossToFloor(b.links.indexOf(l), l.upper);
  tick(1);
  expect(level.floor).toBe(l.upper);
  expect(enemies.includes(e), 'it is back on its own floor').toBe(true);
  expect(level.roomOf[tileIndex(e.x, e.z)], 'in its own room').toBe(room);
  expect(e.active, 'asleep').toBe(false);
  expect(level.roomCount[room]).toBe(1);
  const pickups = query('pickup').length;
  hurtEnemy(e, 1e6, false);
  expect(run.bld!.cleared[l.upper], 'killed there, the room is cleared as usual').toContain(room);
  expect(query('pickup').length).toBeGreaterThan(pickups);
  goToFloor(0);
});
test("boss room: only the enemies in it count as the boss's minions, and it is the room the boss calls them into", () => {
  const b = building!,
    last = b.plans.length - 1;
  goToFloor(last);
  const hall = level.rooms[level.hall!.room]!;
  // the floor's other rooms have their enemies: none of them is a minion
  expect(enemies.filter(e => !e.dead).length, 'enemies on the floor').toBeGreaterThan(0);
  expect(minionCount(), 'none of them in the boss room').toBe(0);
  expect(arenaRoom(), 'the room the boss fights in is the boss room, not the first room of the floor').toBe(hall);
  // one called into the boss room is counted
  const m = spawnMinion('drone', (hall.x + hall.w / 2) * T, (hall.y + hall.h / 2) * T);
  expect(minionCount()).toBe(1);
  hurtEnemy(m, 1e6, false);
  goToFloor(0);
});
test('boss room: the floor above stands over its top, so the floors are drawn there as anywhere else', () => {
  const b = building!,
    last = b.plans.length - 1,
    hall = b.plans[last]!.hall!,
    r = b.plans[last]!.gen.rooms[hall.room]!;
  // the room is HALL_H high, and the floor above stands a floor's thickness over it, as it does over WALL_H elsewhere
  expect(b.grounds[last - 1]! - b.grounds[last]! - HALL_H).toBe(FLOOR_H - WALL_H);
  goToFloor(last);
  // the stairwell or lift that comes down to this floor: next to it the floors above are drawn
  const link = b.links.find(l => l.lower === last)!;
  putOnTile(link.strip[0]!);
  // (a lift's other floors show only while it is ridden)
  showNeighbourFloors(b, player.x, player.z, link.kind === 'elevator' ? b.links.indexOf(link) : null);
  expect(floorDrawn(link.upper), 'by the way down, the floor above shows').toBe(true);
  // in the boss room its own floor is drawn, the same as in any room (no floor is hidden for it any more)
  putOnTile((r.y + 1) * W + r.x + 1);
  showNeighbourFloors(b, player.x, player.z, null);
  expect(floorDrawn(last)).toBe(true);
  goToFloor(0);
});
test('neighbour floors: by a stairwell they show; by a lift only while it is ridden', () => {
  const b = building!,
    n = level.floor,
    lift = b.links.findIndex(l => l.kind === 'elevator' && (l.upper === n || l.lower === n)),
    stairs = b.links.findIndex(l => l.kind === 'stairs' && (l.upper === n || l.lower === n));
  if (lift >= 0) {
    const l = b.links[lift]!,
      other = l.upper === n ? l.lower : l.upper;
    putOnTile(l.strip[0]!);
    showNeighbourFloors(b, player.x, player.z, null);
    expect(floorDrawn(other), 'standing by the lift: its shaft is walled in').toBe(false);
    showNeighbourFloors(b, player.x, player.z, lift);
    expect(floorDrawn(other), 'riding it').toBe(true);
  }
  if (stairs >= 0) {
    const l = b.links[stairs]!;
    putOnTile(l.strip[0]!);
    showNeighbourFloors(b, player.x, player.z, null);
    expect(floorDrawn(l.upper === n ? l.lower : l.upper), 'by the stairwell').toBe(true);
  }
  expect(lift >= 0 || stairs >= 0, 'this floor has a way on').toBe(true);
});
test('big map: the map key opens and closes it, the 3D map key turns to the 3D page, a tap cycles', () => {
  goToFloor(0);
  const flat = el<HTMLCanvasElement>('#bigmap'),
    solid = el<HTMLCanvasElement>('#bigmap3d'),
    pages = () => [flat.hidden, solid.hidden];
  expect(pages()).toEqual([true, true]);
  // the keys
  toggleMap();
  tick(2);
  expect(pages()).toEqual([false, true]);
  expect(el('#mapHint').hidden).toBe(false);
  toggleMap3D();
  tick(2);
  expect(pages(), 'the 3D page lies over the 2D one').toEqual([false, false]);
  expect(map3dWanted()).toBe(true);
  // the game stands still while the 3D map is up: the loop is in the map's own mode, where no system of the dive runs
  expect(LOOP.mode()).toBe('map');
  const clock = time,
    enemyAt = enemies
      .filter(e => !e.dead)
      .map(e => `${e.x},${e.z}`)
      .join();
  enemies.forEach(e => {
    e.active = true;
  });
  for (let k = 0; k < 30; k++) runSystems(1 / 60);
  expect(time, 'the dive clock has not moved').toBe(clock);
  expect(
    enemies
      .filter(e => !e.dead)
      .map(e => `${e.x},${e.z}`)
      .join(),
    'nor has any enemy',
  ).toBe(enemyAt);
  expect(solid.hidden, 'the map is still drawn').toBe(false);
  // while the 3D page is up the move keys turn the map: the player stands still
  const at = [player.x, player.z].join();
  joy.y = -1;
  tick(20);
  joy.y = 0;
  expect(isTouch || [player.x, player.z].join() === at, 'no walking with the 3D map up (PC)').toBe(true);
  // more of the building seen: the map is made again without trouble
  building!.plans.forEach(p => p.seen.fill(1));
  tick(2);
  toggleMap3D();
  tick(2);
  expect(pages(), 'back to the 2D page').toEqual([false, true]);
  toggleMap3D();
  toggleMap();
  tick(2);
  expect(pages(), 'the map key closes it from the 3D page too').toEqual([true, true]);
  expect(map3dWanted()).toBe(false);
  expect(LOOP.mode(), 'the game runs again').toBe('play');
  // straight to the 3D page from closed
  toggleMap3D();
  tick(2);
  expect(pages()).toEqual([false, false]);
  toggleMap();
  // a tap (touch): closed, 2D, 3D, closed
  cycleMap();
  tick(2);
  expect(pages()).toEqual([false, true]);
  cycleMap();
  tick(2);
  expect(pages()).toEqual([false, false]);
  cycleMap();
  tick(2);
  expect(pages()).toEqual([true, true]);
});
test('lift: standing on the platform rides to its other floor and back, past a floor when it is a long one', () => {
  // once with any lift, and once with one that passes a floor (in a building that has one)
  for (const long of [false, true]) {
    const want = (x: { kind: string; upper: number; lower: number }) =>
      x.kind === 'elevator' && (!long || x.lower - x.upper === 2);
    for (let k = 0; k < 60 && !building!.links.some(want); k++) {
      goBase();
      startRun();
      tick(2);
    }
    const l = building!.links.find(want)!,
      span = l.lower - l.upper,
      ride = Math.ceil(2.2 * 60 * span) + 40; // frames of a ride, with some to spare
    goToFloor(l.upper);
    enemies.slice().forEach(e => hurtEnemy(e, 1e6, false));
    // arriving on the platform does not start a ride: step off first
    const off = [1, -1, W, -W].map(d => l.a + d).find(k => grid[k] === 1)!;
    putOnTile(off);
    tick(2);
    putOnTile(l.a);
    tick(20);
    expect(ridingY(), 'the wait is not over').toBe(null);
    tick(40);
    expect(ridingY(), 'riding down').toBeLessThan(0);
    expect(level.floor).toBe(l.upper);
    const before = player.fy;
    player.x += 3; // the rider cannot walk off
    tick(1);
    expect(tileIndex(player.x, player.z)).toBe(l.a);
    expect(player.fy).toBeLessThan(before);
    if (long) {
      // half way: about a floor down, with the floor passed and both ends drawn
      tick(Math.ceil(2.2 * 60) - 60);
      expect(player.fy).toBeLessThan(-FLOOR_H * 0.6);
      expect([l.upper, l.upper + 1, l.lower].every(floorDrawn)).toBe(true);
    }
    tick(ride);
    expect(ridingY()).toBe(null);
    expect(level.floor).toBe(l.lower);
    expect(player.fy).toBeCloseTo(0);
    expect(tileIndex(player.x, player.z)).toBe(l.a);
    // it does not leave again until the player has stepped off and back on
    tick(120);
    expect(level.floor).toBe(l.lower);
    putOnTile([1, -1, W, -W].map(d => l.a + d).find(k => grid[k] === 1)!);
    tick(2);
    putOnTile(l.a);
    tick(40);
    expect(ridingY(), 'riding up').toBeGreaterThan(0);
    tick(ride);
    expect(level.floor).toBe(l.upper);
    expect(player.fy).toBeCloseTo(0);
  }
});
test('boss room: its door goes on the map when the player looks at it from the corridor, not before', () => {
  goToFloor(building!.plans.length - 1);
  const hall = level.hall!,
    step = [1, -1, W, -W].find(d => level.roomOf[hall.door + d] === hall.room)!,
    from = hall.door - step; // the corridor tile in front of the door
  player.x = ((from % W) + 0.5) * T;
  player.z = (Math.floor(from / W) + 0.5) * T;
  player.fy = floorY(player.x, player.z);
  // (yaw 0 faces -z)
  const facing = Math.abs(step) === 1 ? Math.atan2(-step, 0) : Math.atan2(0, -Math.sign(step));
  player.yaw = facing + Math.PI;
  level.seen[hall.door] = 0; // (it may have been in sight where the floor starts)
  tick(2);
  expect(level.seen[hall.door], 'standing at it with the back turned').toBe(0);
  player.yaw = facing;
  tick(1);
  expect(level.seen[hall.door], 'looking at it').toBe(1);
});
test('boss room: its door opens for a player who waits at it; walking in starts the boss stage', () => {
  goToFloor(building!.plans.length - 1);
  const hall = level.hall!,
    world = activeTileGrid().world,
    r = level.rooms[hall.room]!,
    tier = stageInfo(run.stage).tier;
  expect(isDoorLocked(world, hall.door), 'locked at first').toBe(true);
  expect(
    enemies.some(e => e.room === hall.room),
    'no enemy waits in the boss room',
  ).toBe(false);
  enemies.slice().forEach(e => hurtEnemy(e, 1e6, false));
  // the corridor tile in front of the door, and the room tile two steps inside
  const step = [1, -1, W, -W].find(d => grid[hall.door + d] === 1 && level.roomOf[hall.door + d] === hall.room)!,
    put = (k: number) => {
      player.x = ((k % W) + 0.5) * T;
      player.z = (Math.floor(k / W) + 0.5) * T;
      player.fy = floorY(player.x, player.z);
    };
  put(hall.door - step);
  tick(30);
  expect(isDoorLocked(world, hall.door), 'half a second is not enough').toBe(true);
  tick(90);
  expect(isDoorLocked(world, hall.door), 'it opens after the wait').toBe(false);
  expect(run.bld!.step, 'still the last floor of the route').toBe(run.bld!.floors - 1);
  // the rooms of the other floors were never cleared: walking in gives the pre-boss supply for them, about 0.18 chips
  // a room, one pick after another
  const owed = supplyChips(),
    chipsHad = run.perks.length;
  expect(owed, 'rooms are left on the floors above').toBeGreaterThan(0);
  put(hall.door + step * 2);
  update(1 / 60);
  expect(run.bld!.supplied).toBe(true);
  for (let k = 0; k < owed; k++) {
    expect(stateIs('perk'), `supply pick ${k + 1} of ${owed}`).toBe(true);
    document.querySelector<HTMLElement>('#perkList .perk')!.click();
  }
  expect(stateIs('play')).toBe(true);
  expect(run.perks.length).toBe(chipsHad + owed);
  expect(supplyChips(), 'given once').toBe(0);
  tick(3);
  expect(run.stage, 'the boss stage of this depth').toBe(tier * PER + PER - 1);
  expect(isDoorLocked(world, hall.door), 'shut behind the player').toBe(true);
  // an enemy waiting in another room of the floor has nothing to do with the fight
  const other = level.rooms.findIndex((_, idx) => idx !== hall.room),
    [ox, oz] = roomSpot(level.rooms[other]!),
    bystander = spawnEnemy('crawler', ox, oz, other, 1);
  level.roomCount[other] = 1;
  // the boss stands in the middle of the room (it arrives by a timer in the game; the test brings it)
  spawnBoss(run.bld!.boss);
  expect(boss!.cx).toBeCloseTo((r.x + r.w / 2) * T);
  expect(boss!.cz).toBeCloseTo((r.y + r.h / 2) * T);
  tick(200);
  // a shielded boss (bastion) first loses what shields it
  if (boss!.invuln) {
    enemies.filter(e => !e.boss && e !== bystander).forEach(e => hurtEnemy(e, 1e6, false));
    tick(20);
  }
  hurtEnemy(boss!, boss!.hp + 1, false);
  tick(2);
  expect(level.portals.map(p => p.kind).sort()).toEqual(expect.arrayContaining(['extract', 'next']));
  expect(
    level.portals.some(p => p.kind === 'terminal'),
    "a milestone's boss leaves a terminal",
  ).toBe(isMilestone(tier));
  expect(isDoorLocked(world, hall.door), 'the way back opens again').toBe(false);
  expect(bystander.dead, 'the enemies in the other rooms are still there').toBeFalsy();
  // after the supply the rooms of this building drop no chips, however often one is cleared
  const chipsLying = () => query<Pickup>('pickup').filter(q => q.kind === 'chip').length,
    lying = chipsLying();
  hurtEnemy(bystander, 1e6, false);
  for (let k = 0; k < 12; k++) {
    const again = spawnEnemy('crawler', ox, oz, other, 1);
    level.roomCount[other] = 1;
    hurtEnemy(again, 1e6, false);
  }
  expect(chipsLying(), 'no chip from a room after the supply').toBe(lying);
  // up to the floor above and back: the boss stays down, the room open with its gates, and forward still leads on
  const last = run.bld!.floor,
    down = building!.links.findIndex(l => l.lower === last),
    up = building!.links[down]!.upper;
  crossToFloor(down, up);
  tick(2);
  expect(stageInfo(run.stage).sub, 'up a floor: no longer the boss stage').not.toBe(PER - 1);
  crossToFloor(down, last);
  tick(2);
  expect(run.stage, 'back: the boss stage again').toBe(tier * PER + PER - 1);
  expect(isDoorLocked(activeTileGrid().world, hall.door), 'the door is open').toBe(false);
  expect(level.portals.map(p => p.kind).sort()).toEqual(expect.arrayContaining(['extract', 'next']));
  expect(
    level.portals.some(p => p.kind === 'terminal'),
    "a milestone's terminal stands again too",
  ).toBe(isMilestone(tier));
  put(hall.door + step * 2);
  tick(200);
  expect(boss, 'walking into the room brings no boss').toBeFalsy();
  // onward: the next depth is a new building, from its top floor
  const seedWas = run.bld!.seed;
  nextStage();
  tick(2);
  expect(stageInfo(run.stage).tier).toBe(tier + 1);
  expect(level.floor).toBe(0);
  expect(run.bld!.seed).not.toBe(seedWas);
  expect(run.bld!.tier).toBe(tier + 1);
});
test('lockdown: the room does not shut on a player still in its doorway (they could walk back out of it)', () => {
  // runs until a building has a lockdown room (most do)
  for (let k = 0; k < 20; k++) {
    goBase();
    startRun();
    tick(2);
    if (building!.lockdown) break;
  }
  const ld = building!.lockdown!;
  goToFloor(ld.floor);
  const world = activeTileGrid().world,
    doors = roomDoors(building!.plans[ld.floor]!.gen, ld.room).doors,
    locked = () => doors.some(k => isDoorLocked(world, k));
  // the room's tile just inside one of its doors, and the way from that tile to the door
  const door = doors[0]!,
    [di, dj] = SIDE_STEP.find(([a, b]) => level.roomOf[door + a + b * W] === ld.room)!,
    inside = door + di + dj * W,
    stand = (fromDoor: number) => {
      // (fromDoor = metres into the room from the edge of the door's tile)
      player.x = ((door % W) + 0.5) * T + di * (T / 2 + fromDoor);
      player.z = (Math.floor(door / W) + 0.5) * T + dj * (T / 2 + fromDoor);
      player.fy = floorY(player.x, player.z);
    };
  stand(0.2);
  tick(3);
  expect(level.roomOf[tileIndex(player.x, player.z)], 'on a tile of the room').toBe(ld.room);
  expect(tileIndex(player.x, player.z)).toBe(inside);
  expect(locked(), 'not shut: the player is still in the doorway').toBe(false);
  stand(T / 2);
  tick(3);
  expect(locked(), 'shut once the player is clear of the door').toBe(true);
  goBase();
});
test('lockdown: it waits for an enemy holding a door open, and a player who gets out past it is not left outside', () => {
  for (let k = 0; k < 20; k++) {
    goBase();
    startRun();
    tick(2);
    if (building!.lockdown) break;
  }
  const ld = building!.lockdown!;
  goToFloor(ld.floor);
  const world = activeTileGrid().world,
    doors = roomDoors(building!.plans[ld.floor]!.gen, ld.room).doors,
    locked = () => doors.some(k => isDoorLocked(world, k)),
    alarm = () => el('#alarm').classList.contains('on'),
    door = doors[0]!,
    [di, dj] = SIDE_STEP.find(([a, b]) => level.roomOf[door + a + b * W] === ld.room)!,
    at = (k: number): [number, number] => [((k % W) + 0.5) * T, (Math.floor(k / W) + 0.5) * T],
    put = (x: number, z: number) => {
      player.x = x;
      player.z = z;
      player.fy = floorY(x, z);
    };
  // an awake enemy stands in the doorway (one that does not move), so the door is open when the room shuts
  const guard = spawnEnemy('turret', ...at(door), ld.room, 1);
  guard.active = true;
  level.roomCount[ld.room]!++;
  tick(30);
  expect(world.doorOpen![door], 'the enemy has opened the door').toBe(1);
  put(...roomSpot(level.rooms[ld.room]!));
  tick(30);
  expect(locked(), 'locked with the player inside').toBe(true);
  expect(world.doorOpen![door], 'the door cannot shut on the enemy in it').toBeGreaterThanOrEqual(DOOR_PASS);
  expect(alarm(), 'no lockdown while a door is open').toBe(false);
  // the player walks out through it, two tiles down the corridor
  put(...at(door - 2 * (di + dj * W)));
  tick(3);
  expect(locked(), 'outside: the room is open again').toBe(false);
  // the enemy is gone; back inside, the doors shut and then the lockdown starts
  guard.dead = true;
  level.roomCount[ld.room]!--;
  put(...roomSpot(level.rooms[ld.room]!));
  tick(30);
  expect(locked(), 'back inside: shut again').toBe(true);
  expect(
    doors.every(k => world.doorOpen![k] === 0),
    'every door is shut',
  ).toBe(true);
  expect(alarm(), 'the lockdown is on').toBe(true);
  goBase();
});
test('lockdown: the room shuts, two waves come, then it opens and leaves a chip', () => {
  // runs until a building has a lockdown room (most do)
  for (let k = 0; k < 20; k++) {
    goBase();
    startRun();
    tick(2);
    if (building!.lockdown) break;
  }
  const ld = building!.lockdown!;
  goToFloor(ld.floor);
  const world = activeTileGrid().world,
    doors = roomDoors(building!.plans[ld.floor]!.gen, ld.room).doors,
    locked = () => doors.every(k => isDoorLocked(world, k)),
    chips = () => query<Pickup>('pickup').filter(p => p.kind === 'chip').length;
  expect(doors.length).toBeGreaterThan(0);
  expect(locked(), 'open until the player walks in').toBe(false);
  const [x, z] = roomSpot(level.rooms[ld.room]!);
  player.x = x;
  player.z = z;
  player.fy = floorY(x, z);
  tick(2);
  expect(locked(), 'shut with the player inside').toBe(true);
  // the lockdown starts once the doors are shut: one left open (an enemy near it, the player's own way in) takes
  // 0.4 s to close
  tick(30);
  expect(el('#alarm').classList.contains('on'), 'the red frame is up').toBe(true);
  expect(el('#alarmText').textContent).toContain('1/3');
  // the room's own enemies, then two waves: after each of the first three clears there are enemies again
  let waves = 0;
  const chipsWas = chips();
  for (let k = 0; k < 20 && !run.bld!.ld; k++) {
    for (let n = 0; n < 6 && level.roomCount[ld.room]! > 0 && !run.bld!.ld; n++) {
      const before = enemies.filter(e => e.room === ld.room && !e.dead).length;
      killRoom(ld.room);
      // a wave arrived when the room has enemies that were not there before the kills
      if (!run.bld!.ld && enemies.filter(e => e.room === ld.room && !e.dead && e.active).length >= 2 && before > 0)
        waves++;
    }
  }
  expect(run.bld!.ld, 'the lockdown is over').toBe(1);
  expect(el('#alarm').classList.contains('on'), 'the red frame is gone').toBe(false);
  expect(waves, 'waves came before it ended').toBeGreaterThanOrEqual(2);
  expect(locked(), 'open again').toBe(false);
  expect(doors.some(k => isDoorLocked(world, k))).toBe(false);
  expect(run.bld!.cleared[ld.floor]).toContain(ld.room);
  // the reward: a chip whose choices are all rare and a weapon of the second rarity or better
  const reward = query<Pickup>('pickup');
  expect(chips(), 'one chip to pick up').toBe(chipsWas + 1);
  expect(reward.filter(q => q.kind === 'chip' && q.rare).length).toBe(1);
  expect(
    reward.some(q => q.kind === 'weapon' && q.w!.r >= 1),
    'and a weapon',
  ).toBe(true);
  openPerk('test', undefined, undefined, 1, true);
  const cards = [...document.querySelectorAll('#perkList .perk')];
  expect(cards.length > 0 && cards.every(c => c.classList.contains('rare')), 'an all-rare pick').toBe(true);
  show(null);
  setState('play');
  // every other room of the building has its enemies: a lockdown takes no ordinary fight away (the room before the
  // boss and the start room aside)
  building!.plans.forEach((p, floor) => {
    goToFloor(floor);
    p.gen.rooms.forEach((_, room) => {
      const empty = room === p.gen.startIdx || room === p.hall?.room || run.bld!.cleared[floor]!.includes(room);
      expect(level.roomCount[room]! > 0, `floor ${floor} room ${room}`).toBe(!empty);
    });
  });
  goBase();
});
test("wall pictures: a window only on the building's outside wall, a glass partition only on a thin wall", () => {
  const d = tileMapFromRows(['#######', '#..#..#', '#######', '#######', '#.....#', '#######']),
    at = (i: number, j: number) => j * d.W + i;
  expect(wallSide(d, at(0, 1)), 'the map edge behind it').toBe('outer');
  expect(wallSide(d, at(1, 0)), 'the map edge behind it').toBe('outer');
  expect(wallSide(d, at(3, 1)), 'a room right behind it, on both sides').toBe('inner');
  expect(wallSide(d, at(1, 2)), 'a room further behind it').toBeNull();
  expect(wallSide(d, at(3, 2)), 'seen from no floor').toBeNull();
  // a picture of `outer` on any other wall, and one of `inner` on any other wall, gives way to the plain one
  const all = Array.from({ length: 12 }, (_, n) => n + 1),
    pic = (k: number, sides: { outer?: number[]; inner?: number[] }) => wallPic(d, k, 13, undefined, sides);
  for (const k of [at(0, 1), at(1, 0), at(3, 1), at(1, 2)]) {
    const v = variantOf(k, 13, WALL_PLAIN_SHARE),
      side = wallSide(d, k);
    expect(pic(k, { outer: all }), `tile ${k}`).toBe(side === 'outer' ? v : 0);
    expect(pic(k, { inner: all }), `tile ${k}`).toBe(side === 'inner' ? v : 0);
    expect(pic(k, {}), `tile ${k}: no sides, as it was`).toBe(v);
  }
  // the evening sun is toward -x: the wall on a room's -x side faces west (its window lets the sun in), not the others
  expect(facesWest(d, at(0, 1))).toBe(true);
  expect(facesWest(d, at(6, 1))).toBe(false);
  expect(facesWest(d, at(1, 0))).toBe(false);
  // a window one sees out of is only ever on the building's outside wall or on a yard (what is behind any other wall
  // is the building, not the view)
  for (const biome of BIOMES) {
    const look = lookOf(biome);
    for (const v of Object.keys(look?.outside?.panes ?? {}))
      expect(look!.wallSides?.outer, `${biome.code} picture ${v}`).toContain(Number(v));
  }
});
test('outside: the buildings across the street stand clear of the building, and only faces that can be seen', () => {
  // a building 10 by 8 tiles in the middle of a 30-tile map
  const w = 30,
    h = 30,
    inside = new Uint8Array(w * h).map((_, k) =>
      k % w >= 10 && k % w < 20 && ((k / w) | 0) >= 11 && ((k / w) | 0) < 19 ? 1 : 0,
    ),
    style = {
      high: [
        [14, 30],
        [40, 60],
      ] as [[number, number], [number, number]],
      facades: 3,
      roofs: 2,
    },
    blocks = outsideBlocks(inside, w, h, style, createRng(7));
  expect(blocks.length).toBeGreaterThan(20);
  expect(outsideBlocks(inside, w, h, style, createRng(7)), 'the same rng, the same blocks').toEqual(blocks);
  const [bx0, bx1, bz0, bz1] = [10 * T, 20 * T, 11 * T, 19 * T];
  for (const b of blocks) {
    // the street: no block nearer the building than 5 tiles
    const gap = Math.max(bx0 - b.x1, b.x0 - bx1, bz0 - b.z1, b.z0 - bz1);
    expect(gap).toBeGreaterThanOrEqual(5 * T - 1e-6);
    expect(b.top).toBeGreaterThanOrEqual(14);
    expect(b.top).toBeLessThanOrEqual(60);
    // no face turned away from the building: a block wholly east of it has no face looking east (side 0)
    if (b.x0 >= bx1) expect(b.sides).not.toContain(0);
    if (b.x1 <= bx0) expect(b.sides).not.toContain(1);
    if (b.z0 >= bz1) expect(b.sides).not.toContain(2);
    if (b.z1 <= bz0) expect(b.sides).not.toContain(3);
  }
  // a block straight across the street to the west shows the building its east face
  const across = blocks.find(b => b.x1 <= bx0 && b.x1 > bx0 - 6 * T && b.z0 >= bz0 && b.z1 <= bz1);
  if (across) expect(across.sides).toContain(0);
});
test("outside: the building's own walls, floor by floor: faces on its outline, a roof where the floor above leaves off", () => {
  // a 6 by 1 strip of tiles: the top floor the middle two, the floor under it all six (it stands out on both sides)
  const w = 6,
    h = 1,
    top = shellOf(k => k === 2 || k === 3, w, h),
    low = shellOf(() => true, w, h),
    boxes = buildingShell([top, low], w, h, 8),
    of = (floorBottom: number, i: number) => boxes.find(b => b.bottom === floorBottom && b.x0 === i * T);
  expect(Array.from(top), 'with the walls round it').toEqual([0, 1, 1, 1, 1, 0]);
  // the top floor (bottom 8): a face out at its ends, a roof everywhere, no underside where the floor under holds it
  expect(of(8, 1)!.sides).toContain(1);
  expect(of(8, 1)!.noRoof).toBe(false);
  expect(of(8, 1)!.under).toBe(false);
  // the floor under it (bottom 0): no roof under the top floor, a roof (a terrace) beyond it
  expect(of(0, 2)!.noRoof).toBe(true);
  expect(of(0, 0)!.noRoof).toBe(false);
  // a tile with nothing to show is not built (inside the outline, covered, held up)
  expect(boxes.filter(b => b.bottom === 0 && b.x0 === 2 * T && !b.sides.length && b.noRoof && !b.under)).toEqual([]);
});
test('outside: a window one sees out of looks past the whole building, or on to a yard', () => {
  devCourtOpen(true);
  let windows = 0;
  // (the ruins' one: a window was on the tile at a balcony's end, seen from the balcony)
  for (const [code, seed, boss] of [
    ['CITY', 3],
    ['CITY', 6],
    ['CITY', 9],
    ['RUIN', 1128278361, 'phantom'],
  ] as const) {
    const biome = BIOMES.find(x => x.code === code)!,
      look = lookOf(biome)!,
      b = makeBuilding(biome, boss ?? biome.bosses[0]!, seed),
      W = b.plans[0]!.gen.W,
      H = b.plans[0]!.gen.H,
      anyFloor = (k: number) => b.plans.some(p => p.gen.maps.grid[k] === 1 || !!p.voids[k]);
    b.plans.forEach((p, floor) => {
      const d = p.gen,
        yard = b.court?.open && floor <= b.court.lower ? new Set(b.court.tiles) : new Set<number>();
      d.maps.grid.forEach((v, k) => {
        if (v || p.voids[k] || !look.outside!.panes[wallPic(d, k, look.walls.length, look.laneWalls, look.wallSides)])
          return;
        windows++;
        // straight out from each floor that sees it: no floor of any floor before the edge, unless a yard comes first.
        // On the yard's edge, the yard right behind each face (not the tile at a balcony's end, seen along the yard)
        const onYard = [1, -1, W, -W].some(o => yard.has(k + o));
        // (and not on a tile that is floor on another floor: under or over it, the building runs out past the window)
        if (!onYard) expect(anyFloor(k), `seed ${seed} floor ${floor} wall ${k} under a floor`).toBe(false);
        for (const [di, dj] of floorSides(d, k)) {
          if (onYard) expect(yard.has(k - dj * W - di), `seed ${seed} floor ${floor} wall ${k} on the yard`).toBe(true);
          let i = (k % W) - di,
            j = Math.floor(k / W) - dj;
          for (; i >= 0 && j >= 0 && i < W && j < H; i -= di, j -= dj) {
            const t = j * W + i;
            if (yard.has(t)) break;
            expect(anyFloor(t), `seed ${seed} floor ${floor} wall ${k}`).toBe(false);
          }
        }
      });
    });
  }
  devCourtOpen(null);
  expect(windows).toBeGreaterThan(0);
});
test('outside: a window on a yard shows the yard itself, its walls out to the glass, and only while one is in sight', () => {
  const city = BIOMES.find(x => x.code === 'CITY')!,
    look = lookOf(city)!;
  // a building with a window one sees out of right on its yard: the wall tile, the step from it to the floor
  let found: { b: Building; floor: number; k: number; o: number } | null = null;
  for (let seed = 1; seed < 300 && !found; seed++) {
    const b = makeBuilding(city, city.bosses[0]!, seed),
      c = b.court;
    if (!c?.open) continue;
    b.plans.forEach((p, floor) => {
      const d = p.gen,
        g = d.maps.grid;
      g.forEach((v, k) => {
        if (found || v || p.voids[k]) return;
        if (!look.outside!.panes[wallPic(d, k, look.walls.length, look.laneWalls, look.wallSides)]) return;
        const o = [1, -1, d.W, -d.W].find(o => g[k + o] === 1 && c.tiles.includes(k - o));
        if (o !== undefined) found = { b, floor, k, o };
      });
    });
  }
  expect(found, 'such a window in some building').not.toBeNull();
  const { b, floor, k, o } = found!,
    W = b.plans[0]!.gen.W,
    [di, dj] = Math.abs(o) === 1 ? [o, 0] : [0, Math.sign(o)];
  showBuilding(b);
  enterFloor(b, floor);
  const copies: THREE.Mesh[] = [];
  scene.traverse(m => {
    if (
      (m as THREE.Mesh).isMesh &&
      m.renderOrder > WINDOW_ORDER &&
      m.renderOrder < WINDOW_ORDER + 1 &&
      !(m as THREE.InstancedMesh).isInstancedMesh
    )
      copies.push(m as THREE.Mesh);
  });
  expect(copies.length, 'the yard is copied for its windows').toBeGreaterThan(0);
  const shown = () =>
    copies.some(m => {
      for (let q: THREE.Object3D | null = m; q; q = q.parent) if (!q.visible) return false;
      return true;
    });
  // standing in front of the window, looking at it, then away
  const x = ((k % W) + 0.5 + di) * T,
    z = (Math.floor(k / W) + 0.5 + dj) * T;
  camera.position.set(x, EYE, z);
  camera.rotation.set(0, Math.atan2(di, dj), 0);
  showNeighbourFloors(b, x, z, null);
  expect(shown(), 'looking at it').toBe(true);
  camera.rotation.set(0, Math.atan2(-di, -dj), 0);
  showNeighbourFloors(b, x, z, null);
  expect(shown(), 'looking away').toBe(false);
  // the copies stand where the yard and what stands round it do (not moved: the walls that run away from the glass
  // keep their windows where the rooms behind them have theirs), but the yard's ground reaches a tile further toward
  // the floor, out to the glass
  const moved = new Set(
    copies.map(m => {
      let q: THREE.Object3D = m;
      while (q.parent!.parent!.parent !== scene) q = q.parent!;
      return `${Math.round(q.position.x * 100) / 100},${Math.round(q.position.z * 100) / 100}`;
    }),
  );
  expect([...moved]).toEqual(['0,0']);
  const side = Math.sqrt(b.court!.tiles.length) * T,
    longer = di ? [side + T, side] : [side, side + T];
  expect(
    copies.some(m => {
      const p = (m.geometry as THREE.PlaneGeometry).parameters;
      return p?.width === longer[0] && p?.height === longer[1];
    }),
    'the ground a tile longer toward the window',
  ).toBe(true);
});
test('props: what hangs overhead clears the head of someone on a raised floor under it or next to it', () => {
  // a 4 by 3 map: ground, a ramp up toward +x, a walkway 2 m up, ground; the row under it walls
  const d = {
    W: 4,
    H: 2,
    maps: {
      grid: new Uint8Array([1, 1, 1, 1, 0, 0, 0, 0]),
      hgt: new Float32Array([0, 0, 2, 0, 0, 0, 0, 0]),
      ramp: new Int8Array([-1, 0, -1, -1, -1, -1, -1, -1]),
    },
  } as unknown as TileMapData;
  expect(floorNear(d, 0, 0), 'next to the ramp: its top end').toBe(2);
  expect(floorNear(d, 2, 0)).toBe(2);
  expect(floorNear(d, 3, 0), 'next to the walkway').toBe(2);
  expect(overHead(3.5, 0), 'over the ground: where it was').toBe(3.5);
  expect(overHead(3.5, 2), 'a metre over the eye on the walkway').toBeCloseTo(2 + EYE + 1);
  expect(overHead(5.9, 2), 'never up into the ceiling').toBeLessThan(WALL_H);
  expect(raised(d, { i: 1, j: 0 }) && raised(d, { i: 2, j: 0 }) && !raised(d, { i: 3, j: 0 })).toBe(true);
});
test('courtyard: what hangs in an atrium has the same colours whatever yard was dressed before it', () => {
  const well = { cx: 20, cz: 20, wide: 12, deep: 12, ground: -16, sky: 0, decks: [] },
    colours = (g: THREE.Group) =>
      g.children.flatMap(o =>
        o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial ? [o.material.color.getHex()] : [],
      ),
    dressed = () => {
      const g = new THREE.Group();
      dressAtrium(g, 'FORGE', well);
      return colours(g);
    };
  const fresh = dressed();
  expect(fresh.length).toBeGreaterThan(0);
  dressYard(new THREE.Group(), 'downtown', [], well, 8, 0x404040); // a dark yard's shade
  expect(dressed()).toEqual(fresh);
});
test('trailer: the sample script reads with the game words; a word the game does not have is named by its line', () => {
  const { script, errors } = parseScript(sampleTrailer);
  expect([...errors, ...trailerGame.check(script)]).toEqual([]);
  expect(script.total, 'the trailer of 2026-10-05, with the boss beaten').toBeCloseTo(36.2);
  const bad = parseScript(
    [
      'music NOPE',
      'guns shotgun laser',
      'scene 1',
      '  at KWLN start',
      '  enemies crawler dragon',
      '  do jump',
      'scene 1',
      '  at stairs',
      '  do ride',
      'scene 1',
      '  looks shiny',
      '  wave hello',
    ].join('\n'),
  ).script;
  expect(
    trailerGame
      .check(bad)
      .map(e => e.split(':')[0])
      .sort(),
  ).toEqual(['line 1', 'line 11', 'line 12', 'line 2', 'line 5', 'line 6', 'line 8', 'line 9'].sort());
});
