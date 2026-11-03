// Smoke test for Sector Dive Extended, ARCADE's dive: the eight sectors from DEPTH 1, the boss of each sector, the gates
// after a boss, the boss area at DEPTH 9, TITAN's clear with its time, and the progress a dive leaves behind. Boots the
// game page (setup.ts) once for this file (bootGame); each test makes the state it needs, and ENDLESS is put back so the
// other files see the game it was
import { afterEach, beforeAll, expect, test } from 'vitest';
import { BIOMES } from '../src/data/biomes.ts';
import { BOSS_ROOMS, BOSS_ROOM_ORDER } from '../src/data/bossRooms.ts';
import { ARCADE_DEPTHS } from '../src/data/progress.ts';
import { saveStore } from '@engine/core/store.ts';
import { t } from '@engine/core/i18n.ts';
import { runSystems } from '@engine/core/loop.ts';
import { el } from '@engine/core/util.ts';
import { SAVE_KEY, defaultSave, devSetArcade, isArcade, loadSaveFrom, save } from '../src/core/save.ts';
import { arcadeBossOf } from '../src/core/bossArea.ts';
import { recordBestTime } from '../src/core/progress.ts';
import { RUN_END } from '../src/core/rules.ts';
import { bossStageOf, firstStageOf } from '../src/core/stages.ts';
import { run } from '../src/actors/player.ts';
import { boss } from '../src/world/entities.ts';
import { level } from '../src/world/level.ts';
import { setState, state } from '../src/flow/state.ts';
import { endRun, goBase, startRun, startStage } from '../src/flow/run.ts';
import { checkpoint, resumeRun, suspendRun } from '../src/flow/suspend.ts';
import { bossDown, spawnBoss } from '../src/actors/bosses/common.ts';
import { bootGame, tick } from './helpers.ts';

beforeAll(async () => {
  devSetArcade(true);
  await bootGame();
});

afterEach(() => {
  devSetArcade(false);
  goBase();
  const base = defaultSave();
  save.bits = base.bits;
  save.up = base.up;
  save.unlocked = base.unlocked;
  save.loadout = base.loadout;
  save.stash = base.stash;
  save.shortcut = base.shortcut;
  save.startTier = base.startTier;
  save.peak = base.peak;
  save.records.bossArea = base.records.bossArea;
  save.records.cleared = base.records.cleared;
  save.records.bestTime = base.records.bestTime;
  save.suspend = null;
});

// a dive already in the boss area, in TITAN's room, with the boss down: the run ends as the game ends it
function beatTitan(sec: number) {
  run.stage = bossStageOf(ARCADE_DEPTHS);
  run.area = { at: 'room', boss: 'titan' };
  startStage();
  run.time = sec;
  spawnBoss('titan');
  bossDown(boss!);
}

test('a dive sets out from DEPTH 1, whatever the save was set to', () => {
  devSetArcade(true);
  save.startTier = 5;
  save.shortcut = 6;
  startRun(true);
  expect(isArcade()).toBe(true);
  expect(run.startTier, 'not save.startTier').toBe(0);
  expect(run.stage).toBe(firstStageOf(0));
  expect(save.startTier, 'the reset puts the start depth back too').toBe(0);
  expect(save.records.bossArea, 'the boss area is the depth after the eight sectors').toEqual({
    tier: ARCADE_DEPTHS,
    beaten: [],
  });
});

test('each sector building has the boss whose room is there', () => {
  devSetArcade(true);
  startRun(true);
  const route = [...run.route];
  expect(new Set(BIOMES.map(arcadeBossOf)), 'a boss for each of the eight sectors').toEqual(new Set(BOSS_ROOM_ORDER));
  for (let tier = 0; tier < ARCADE_DEPTHS; tier++) {
    run.stage = firstStageOf(tier);
    run.area = undefined;
    run.bld = undefined;
    startStage();
    const sector = BIOMES[route[tier]!]!;
    expect(run.bld!.boss, `D${tier + 1} ${sector.code}`).toBe(arcadeBossOf(sector));
    expect(BOSS_ROOMS[run.bld!.boss], `${sector.code}'s room`).toBe(sector.code);
  }
});

test('a boss is followed by a terminal and no way home', () => {
  devSetArcade(true);
  startRun(true);
  run.stage = bossStageOf(1); // not a milestone: ENDLESS puts no terminal here
  startStage();
  spawnBoss(run.bld!.boss);
  bossDown(boss!);
  expect(level.portals.map(p => p.kind).sort(), 'forward and a terminal').toEqual(['next', 'terminal']);
  expect(
    level.portals.some(p => p.kind === 'extract'),
    'no way back to the base',
  ).toBe(false);
});

test('ENDLESS: a boss keeps the way home, and a terminal only at a milestone', () => {
  devSetArcade(false);
  startRun(true);
  run.stage = bossStageOf(1);
  startStage();
  spawnBoss(run.bld!.boss);
  bossDown(boss!);
  expect(level.portals.map(p => p.kind).sort(), 'not a milestone').toEqual(['extract', 'next']);
  goBase();
  startRun(true);
  run.stage = bossStageOf(3);
  startStage();
  spawnBoss(run.bld!.boss);
  bossDown(boss!);
  expect(level.portals.map(p => p.kind).sort(), 'a milestone').toEqual(['extract', 'next', 'terminal']);
});

test('the boss area is at DEPTH 9, and its hall has no way home', () => {
  devSetArcade(true);
  startRun(true);
  expect(save.records.bossArea?.tier).toBe(ARCADE_DEPTHS);
  run.stage = firstStageOf(ARCADE_DEPTHS);
  startStage();
  expect(run.area, 'in the hall').toEqual({ at: 'hall' });
  expect(
    level.portals.filter(p => p.kind === 'extract'),
    'no way back to the base',
  ).toEqual([]);
  expect(level.portals.filter(p => p.kind === 'room').length, 'the eight rooms').toBe(8);
  expect(
    level.portals.some(p => p.kind === 'terminal'),
    'the terminal stays',
  ).toBe(true);
});

test('TITAN ends the dive with a clear, its time and a record', () => {
  devSetArcade(true);
  save.unlocked.smg = true;
  startRun(true);
  save.records.bossArea!.beaten = [...BOSS_ROOM_ORDER];
  save.bits = 500;
  save.up.hp = 9;
  save.shortcut = 9;
  run.perks = ['rapid', 'rapid'];
  beatTitan(754);
  expect(state).toBe('result');
  expect(el('#resTitle').textContent).toBe(t('res.clear'));
  expect(RUN_END.clear.badge).toBe('CLEARED');
  expect(save.records.cleared, 'the clear stays in the save').toBe(true);
  expect(save.records.bestTime, 'the fastest clear so far').toBe(754);
  const rows = el('#resList').textContent!;
  expect(rows).toContain(t('res.timeV', { m: 12, s: 34 }));
  expect(rows).toContain(t('res.newRecord'));
  expect(rows, 'no bits brought back').not.toContain(t('res.bits'));
  expect(rows, 'no weapons brought back').not.toContain(t('res.keptWeapons'));
  // the dive's own gains are dropped; the unlocks and the records stay
  expect(save.bits).toBe(0);
  expect(save.up.hp).toBe(0);
  expect(save.loadout, 'the basic handgun').toEqual(defaultSave().loadout);
  expect(save.stash).toEqual([]);
  expect(save.shortcut).toBe(0);
  expect(save.startTier).toBe(0);
  expect(save.peak).toBe(0);
  expect(save.records.bossArea).toBeNull();
  expect(save.suspend).toBeNull();
  expect(save.unlocked.smg, 'the unlocks stay').toBe(true);
});

test('a slower clear leaves the fastest time alone', () => {
  devSetArcade(true);
  startRun(true);
  beatTitan(120);
  expect(save.records.bestTime).toBe(120);
  goBase();
  startRun(true);
  beatTitan(300);
  expect(save.records.bestTime, 'the faster one stands').toBe(120);
  expect(el('#resList').textContent).not.toContain(t('res.newRecord'));
  expect(save.records.cleared, 'still cleared').toBe(true);
});

test('bestTime: only a faster dive takes the record', () => {
  save.records.bestTime = null;
  expect(recordBestTime(120), 'the first clear').toBe(true);
  expect(recordBestTime(120), 'the same time again').toBe(false);
  expect(recordBestTime(60), 'a faster one').toBe(true);
  expect(save.records.bestTime).toBe(60);
});

test('a lost dive keeps no progress and no shortcut', () => {
  devSetArcade(true);
  startRun(true);
  save.bits = 400;
  save.up.dmg = 5;
  save.shortcut = 7;
  save.peak = 7;
  save.startTier = 6;
  endRun('dead');
  expect(state).toBe('result');
  expect(save.bits).toBe(0);
  expect(save.up.dmg).toBe(0);
  expect(save.shortcut, 'not even the milestone below').toBe(0);
  expect(save.startTier).toBe(0);
  expect(save.peak).toBe(0);
  expect(save.records.bossArea).toBeNull();
  expect(save.suspend).toBeNull();
  const rows = el('#resList').textContent!;
  expect(rows, 'no bits row').not.toContain(t('res.bits'));
  expect(rows, 'no shortcut row').not.toContain(t('res.shortcut'));
});

test('the clock runs only while the game is played', () => {
  devSetArcade(true);
  startRun(true);
  tick(60);
  const played = run.time!;
  expect(played).toBeGreaterThan(0.9);
  setState('pause');
  runSystems(1 / 60);
  runSystems(1 / 60);
  runSystems(1 / 60);
  expect(run.time, 'a pause leaves the clock alone').toBe(played);
  setState('play');
  tick(60);
  expect(run.time!).toBeGreaterThan(played + 0.9);
});

test('a suspended dive keeps its clock', () => {
  devSetArcade(true);
  startRun(true);
  run.time = 42;
  checkpoint();
  suspendRun();
  resumeRun();
  expect(run.time, 'the checkpoint keeps the time').toBe(42);
  expect(run.startTier).toBe(0);
  expect(save.records.bossArea?.tier, 'the boss area is settled again').toBe(ARCADE_DEPTHS);
});

test('a save from before the time record reads bestTime as null', () => {
  saveStore(SAVE_KEY, { ...defaultSave(), records: { cleared: true, bossArea: null } });
  const loaded = loadSaveFrom(SAVE_KEY);
  expect(loaded.records.bestTime).toBeNull();
  expect(loaded.records.cleared, 'the rest of the records is as it was').toBe(true);
});
