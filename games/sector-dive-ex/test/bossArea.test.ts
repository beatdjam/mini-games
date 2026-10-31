// Smoke test for Sector Dive Extended, the boss area: its depth, the flag that keeps it out of the published build, and
// where each boss's room is. Boots the game page (setup.ts) once for this file (bootGame) and runs it through the real
// loop by hand. Each test makes the state it needs; the file passes on its own and in any order.
import { afterEach, beforeAll, expect, test } from 'vitest';
import { BIOMES } from '../src/data/biomes.ts';
import { BOSS_ORDER } from '../src/data/bosses.ts';
import { BOSS_ROOMS } from '../src/data/bossRooms.ts';
import { PER, BOSS_AREA_START_TIER } from '../src/data/progress.ts';
import { save } from '../src/core/save.ts';
import { bossAreaTierFor, bossRoomBiome, devBossArea } from '../src/core/bossArea.ts';
import { bossStageOf, firstStageOf, planOf, stageLabel } from '../src/core/stages.ts';
import { run, player } from '../src/actors/player.ts';
import { boss, enemies } from '../src/world/entities.ts';
import { building } from '../src/world/building.ts';
import { devSeed, level } from '../src/world/level.ts';
import { state } from '../src/flow/state.ts';
import { crossToFloor, endRun, goBase, startRun, startStage } from '../src/flow/run.ts';
import { resumeRun, suspendRun } from '../src/flow/suspend.ts';
import { W, tileCenter, tileIndex } from '@engine/world/tiles.ts';
import { wrapAngle, yawToward } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { bootGame, stateIs, tick } from './helpers.ts';

beforeAll(async () => {
  await bootGame();
  devBossArea(true); // not left to import.meta.env.DEV
});
afterEach(() => {
  devBossArea(true);
  devSeed(null);
  goBase();
  save.records.bossArea = null;
  save.shortcut = 0;
  save.startTier = 0;
});

test('bossAreaTierFor: D50 for a new save, the next milestone for one already past it', () => {
  expect(bossAreaTierFor(0, 0), 'a new save').toBe(49);
  expect(bossAreaTierFor(49, 49), 'a save that stops at D50').toBe(49);
  expect(bossAreaTierFor(50, 0), 'D51, started from the top').toBe(54);
  expect(bossAreaTierFor(60, 57), 'D58: the next milestone').toBe(59);
  expect(bossAreaTierFor(60, 54), 'a start on a milestone: the one after it').toBe(59);
  expect(bossAreaTierFor(60, 59), 'a start on the next milestone: the one after that').toBe(64);
});

test('settleBossArea: the first dive from the base settles the boss area once', () => {
  goBase();
  save.records.bossArea = null;
  save.shortcut = 0;
  save.startTier = 0;
  startRun(true);
  expect(save.records.bossArea, 'settled at D50').toEqual({ tier: 49, beaten: [] });
  goBase();
  save.startTier = 0; // (a deeper start would open the supply chip picks)
  save.shortcut = 60;
  startRun(true);
  expect(save.records.bossArea, 'already settled: left as it was').toEqual({ tier: 49, beaten: [] });
});

test('planOf: a depth is the boss area only where the save settled it', () => {
  save.records.bossArea = { tier: 49, beaten: [] };
  expect(planOf(49 * PER).area, 'the depth of the boss area').toBe(true);
  expect(planOf(48 * PER).area, 'the depth before it').toBe(false);
});

test('BOSS_ROOMS: every boss has a sector of its own, and all of them are sectors of the game', () => {
  expect(Object.keys(BOSS_ROOMS).sort(), 'the same eight bosses').toEqual([...BOSS_ORDER].sort());
  const codes = Object.values(BOSS_ROOMS),
    sectors = BIOMES.map(b => b.code);
  expect(new Set(codes).size, 'a sector each').toBe(codes.length);
  codes.forEach(code => expect(sectors, `${code} is a sector`).toContain(code));
  expect(bossRoomBiome('watcher').code, "the watcher's room is in DATA").toBe('DATA');
});

test('boss area off: a dive settles nothing and takes the building path as before', () => {
  devBossArea(false);
  goBase();
  save.records.bossArea = null;
  save.shortcut = 49;
  save.startTier = 49;
  startRun(true);
  expect(save.records.bossArea, 'not settled').toBeNull();
  expect(planOf(49 * PER).area, 'no boss area').toBe(false);
  expect(run.bld, 'the building is there').toBeTruthy();
  expect(level.floor, 'a floor of it').toBeGreaterThanOrEqual(0);
});

test('a deep start settles the area and leaves the supply chip picks open', () => {
  goBase();
  save.records.bossArea = null;
  save.shortcut = 60;
  save.startTier = 54;
  startRun(true);
  expect(save.records.bossArea, 'the next milestone above the start').toEqual({ tier: 59, beaten: [] });
  expect(run.startTier, 'the run starts where it was set to').toBe(54);
  expect(state, 'a supply chip pick is open').toBe('perk');
});

// a dive at the boss area's depth: the supply chip picks open first; tick(2) closes that screen and play goes on
function enterHallRun() {
  goBase();
  save.records.bossArea = { tier: BOSS_AREA_START_TIER, beaten: [] };
  save.shortcut = BOSS_AREA_START_TIER;
  save.startTier = BOSS_AREA_START_TIER;
  startRun(true);
  expect(state, 'the supply chip pick is open first').toBe('perk');
  tick(2);
}

test('a dive in the boss area starts in the hall', () => {
  enterHallRun();
  expect(run.area, 'the run is in the hall').toEqual({ at: 'hall' });
  expect(run.bld, 'not a floor of a building').toBeUndefined();
  expect(level.floor).toBe(-1);
  expect(level.rooms.length).toBe(1);
  expect(enemies.length, 'no enemy in the hall').toBe(0);
  expect(level.portals.map(p => p.kind).sort(), 'the way out and the terminal').toEqual(['extract', 'terminal']);
  expect(save.suspend?.run.area, 'the checkpoint keeps the hall').toEqual({ at: 'hall' });
  expect(save.suspend?.run.bld).toBeUndefined();
  expect(stageLabel(run.stage), 'the hall is named on screen').toBe(t('boss.hall'));
});

test('a run suspended in the hall resumes in the hall', () => {
  enterHallRun();
  suspendRun();
  resumeRun();
  expect(run.area, 'still in the hall').toEqual({ at: 'hall' });
  expect(level.floor, 'still a level of its own').toBe(-1);
  expect(run.bld, 'still no building').toBeUndefined();
  expect(enemies.length, 'still no enemy').toBe(0);
  expect(level.portals.map(p => p.kind).sort(), 'the gates are made again').toEqual(['extract', 'terminal']);
});

test('a boss room stage brings the hall back', () => {
  enterHallRun();
  run.stage = bossStageOf(BOSS_AREA_START_TIER);
  run.area = { at: 'hall' };
  startStage();
  expect(run.stage, 'back at the depth start').toBe(firstStageOf(BOSS_AREA_START_TIER));
  expect(stageLabel(run.stage), 'the hall is named on screen').toBe(t('boss.hall'));
});

test('boss area off: the boss area depth keeps the building', () => {
  devBossArea(false);
  goBase();
  save.records.bossArea = { tier: BOSS_AREA_START_TIER, beaten: [] };
  save.shortcut = BOSS_AREA_START_TIER;
  save.startTier = BOSS_AREA_START_TIER;
  startRun(true);
  tick(2);
  expect(planOf(BOSS_AREA_START_TIER * PER).area, 'no boss area').toBe(false);
  expect(run.bld, 'the building is there').toBeTruthy();
  expect(level.floor, 'a floor of it').toBeGreaterThanOrEqual(0);
});

// ---- the boss rooms: the lowest floor of the boss's sector building, entered by hand (no gate yet) ----
// a run in the crusher's room: the same start as the hall, then the room placed on the run by hand
function enterRoom() {
  enterHallRun();
  devSeed(1234); // the building is the same on every run of the file
  run.area = { at: 'room', boss: 'crusher' };
  startStage();
}
// the floor one up from the lowest, and the link that joins them
function upFromLowest(): { n: number; up: number } {
  const lowest = building!.plans.length - 1,
    n = building!.links.findIndex(l => l.lower === lowest || l.upper === lowest),
    l = building!.links[n]!;
  return { n, up: l.lower === lowest ? l.upper : l.lower };
}
const outsideHall = () => level.roomOf[tileIndex(player.x, player.z)] !== level.hall!.room;

test('a boss room starts on the lowest floor of its sector building, outside the hall door', () => {
  enterRoom();
  expect(run.stage, "the depth's boss stage").toBe(bossStageOf(BOSS_AREA_START_TIER));
  expect(run.bld?.tier, 'the building of the depth').toBe(BOSS_AREA_START_TIER);
  expect(run.bld?.boss, "the room's boss").toBe('crusher');
  expect(level.biome.code, "the crusher's sector").toBe('FORGE');
  expect(level.floor, 'the lowest floor').toBe(building!.plans.length - 1);
  expect(level.hall, 'its boss hall').toBeTruthy();
  expect(outsideHall(), 'starts in the corridor outside the hall door').toBe(true);
  const door = level.hall!.door,
    toDoor = yawToward(tileCenter(door % W) - player.x, tileCenter(Math.floor(door / W)) - player.z);
  expect(Math.abs(wrapAngle(player.yaw - toDoor)), 'facing the hall door').toBeLessThan(1e-6);
  expect(save.suspend?.run.area, 'the checkpoint keeps the room').toEqual({ at: 'room', boss: 'crusher' });
  tick(1);
  expect(stateIs('play'), 'the room starts in play, not in the boss fight').toBe(true);
  expect(boss, 'the boss has not come yet').toBeNull();
});

test('a run suspended in a boss room resumes in the same room, at the same entrance', () => {
  enterRoom();
  const seed = run.bld!.seed,
    at = tileIndex(player.x, player.z);
  suspendRun();
  resumeRun();
  expect(tileIndex(player.x, player.z), 'the same tile').toBe(at);
  expect(run.area, 'still the same room').toEqual({ at: 'room', boss: 'crusher' });
  expect(run.bld?.boss, 'the same building for the boss').toBe('crusher');
  expect(run.bld?.seed, 'the same seed').toBe(seed);
  expect(level.floor, 'the lowest floor again').toBe(building!.plans.length - 1);
  expect(level.hall, 'its boss hall').toBeTruthy();
  expect(outsideHall(), 'the same entrance outside the door').toBe(true);
});

test('a run suspended after going up a floor resumes at the lowest floor entrance', () => {
  enterRoom();
  const { n, up } = upFromLowest(),
    at = tileIndex(player.x, player.z);
  crossToFloor(n, up);
  expect(run.bld!.floor, 'one floor up').toBe(up);
  suspendRun();
  resumeRun();
  expect(run.bld!.floor, 'back on the lowest floor').toBe(building!.plans.length - 1);
  expect(run.bld!.at, 'at the hall door, not the stairwell').toBe(-1);
  expect(tileIndex(player.x, player.z), 'the same tile as the room began on').toBe(at);
});

test('going back to the hall from a boss room drops the building', () => {
  enterRoom();
  expect(run.bld, 'in the building first').toBeTruthy();
  run.area = { at: 'hall' };
  startStage();
  expect(run.bld, 'the building is dropped').toBeUndefined();
  expect(level.floor, 'a level of its own').toBe(-1);
  expect(level.rooms.length, 'the hall map').toBe(1);
  expect(stageLabel(run.stage), 'the hall is named on screen').toBe(t('boss.hall'));
});

test('a death in a boss room goes to the result screen and clears the checkpoint', () => {
  enterRoom();
  endRun('dead');
  expect(stateIs('result'), 'the result screen').toBe(true);
  expect(save.suspend, 'no checkpoint left').toBeNull();
});

test('boss area off: a room placed by hand is ignored and the building path stays', () => {
  devBossArea(false);
  goBase();
  devSeed(1234);
  save.records.bossArea = { tier: BOSS_AREA_START_TIER, beaten: [] };
  save.shortcut = BOSS_AREA_START_TIER;
  save.startTier = BOSS_AREA_START_TIER;
  startRun(true);
  tick(2);
  run.area = { at: 'room', boss: 'crusher' };
  startStage();
  expect(run.stage, 'the depth start as before').toBe(firstStageOf(BOSS_AREA_START_TIER));
  expect(level.floor, 'the top floor').toBe(0);
  expect(level.hall, 'no boss hall').toBeNull();
});
