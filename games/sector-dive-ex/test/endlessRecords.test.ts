// Smoke test for ENDLESS's records: one row for each loop and restriction (only loop 1 with no restriction for now),
// the row an old save gets, and what a dive and TITAN's first clear add to it. Boots the game page (setup.ts) once for
// this file; each test makes the state it needs.
import { afterEach, beforeAll, expect, test } from 'vitest';
import { clearStore, saveStore } from '@engine/core/index.ts';
import { BOSS_AREA_START_TIER } from '../src/data/progress.ts';
import { SAVE_KEY, defaultSave, devSetArcade, loadSaveFrom, save } from '../src/core/save.ts';
import { recordEndlessTitan } from '../src/core/progress.ts';
import { bossStageOf } from '../src/core/stages.ts';
import { run } from '../src/actors/player.ts';
import { boss } from '../src/world/entities.ts';
import { bossDown, spawnBoss } from '../src/actors/bosses/common.ts';
import { endRun, goBase, startRun, startStage } from '../src/flow/run.ts';
import { bootGame } from './helpers.ts';

beforeAll(async () => {
  devSetArcade(false);
  await bootGame();
});

const restore = (key: string, value: string | null) =>
  value === null ? clearStore(key) : localStorage.setItem(key, value);

afterEach(() => {
  devSetArcade(false);
  goBase();
  const base = defaultSave();
  save.bits = base.bits;
  save.up = base.up;
  save.loadout = base.loadout;
  save.stash = base.stash;
  save.shortcut = base.shortcut;
  save.startTier = base.startTier;
  save.best = base.best;
  save.runs = base.runs;
  save.records = base.records;
  save.suspend = null;
  save.continueFrom = null;
});

test('a fresh save has one row for loop 1 with no restriction', () => {
  const before = localStorage.getItem(SAVE_KEY);
  try {
    clearStore(SAVE_KEY);
    const fresh = loadSaveFrom(SAVE_KEY);
    expect(fresh.records.endless).toHaveLength(1);
    expect(fresh.records.endless[0]).toMatchObject({
      loop: 1,
      restriction: 'none',
      best: 0,
      sec: 0,
      titanSec: null,
      kills: 0,
      dives: 0,
      deaths: 0,
      partial: false,
    });
  } finally {
    restore(SAVE_KEY, before);
  }
});

test('an old save played before the records gets a partial row at its best', () => {
  const before = localStorage.getItem(SAVE_KEY);
  try {
    // the shape of a save from before the rows: records without endless
    saveStore(SAVE_KEY, {
      ...defaultSave(),
      runs: 4,
      best: 12,
      records: {
        cleared: false,
        bossArea: null,
        bestTime: null,
        bestTimeContinued: null,
        bestTimeContinuedCount: null,
      },
    });
    const loaded = loadSaveFrom(SAVE_KEY);
    expect(loaded.records.endless).toHaveLength(1);
    expect(loaded.records.endless[0]).toMatchObject({
      loop: 1,
      restriction: 'none',
      best: 12,
      sec: 0,
      titanSec: null,
      kills: 0,
      dives: 0,
      deaths: 0,
      partial: true,
    });
  } finally {
    restore(SAVE_KEY, before);
  }
});

test('two ENDLESS dives add their time and kills, and only a death counts as one', () => {
  startRun();
  run.stage = 9;
  run.time = 100.5;
  run.kills = 7;
  endRun('dead');
  goBase();
  startRun();
  run.stage = 12;
  run.time = 49.5;
  run.kills = 3;
  endRun('extract');
  const row = save.records.endless[0]!;
  expect(row.dives, 'a death and an extraction').toBe(2);
  expect(row.deaths, 'only the death').toBe(1);
  expect(row.sec, 'the two clocks added up').toBe(150);
  expect(row.kills, 'the two kill counts added up').toBe(10);
  expect(row.best, 'the deepest stage of the two (stage + 1)').toBe(13);
  expect(row.titanSec).toBeNull();
});

test('a give-up counts as a dive, not as a death', () => {
  startRun();
  run.time = 10;
  run.kills = 2;
  endRun('abandon');
  const row = save.records.endless[0]!;
  expect(row.dives).toBe(1);
  expect(row.deaths).toBe(0);
  expect([row.sec, row.kills]).toEqual([10, 2]);
});

test('TITAN time: the row so far plus the dive up to the clear, entered only once', () => {
  startRun(true);
  save.records.endless[0]!.sec = 120;
  run.stage = bossStageOf(BOSS_AREA_START_TIER);
  run.area = { at: 'room', boss: 'titan' };
  startStage();
  run.time = 30;
  spawnBoss('titan');
  bossDown(boss!);
  const row = save.records.endless[0]!;
  expect(row.titanSec).toBe(150);
  recordEndlessTitan(999);
  expect(row.titanSec, 'a later clear does not overwrite it').toBe(150);
});

test('a partial row keeps no TITAN time', () => {
  const row = save.records.endless[0]!;
  row.partial = true;
  row.sec = 50;
  recordEndlessTitan(10);
  expect(row.titanSec).toBeNull();
});

test('ARCADE dives leave the ENDLESS rows alone', () => {
  save.records.endless[0]!.sec = 10;
  devSetArcade(true);
  startRun(true);
  run.stage = 3;
  run.time = 99;
  run.kills = 9;
  endRun('dead');
  const row = save.records.endless[0]!;
  expect([row.sec, row.kills, row.dives, row.deaths]).toEqual([10, 0, 0, 0]);
});
