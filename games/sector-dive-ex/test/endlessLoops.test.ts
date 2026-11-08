// Smoke test for ENDLESS's loops: how deep a later loop's depths count (scaledDepth), the start's bonus for the loops
// cleared, startNextLoop, the row a new loop's dive gets, and the values an old save is given. Boots the game page
// (setup.ts) once for this file; each test makes the state it needs.
import { afterEach, beforeAll, expect, test } from 'vitest';
import { clearStore, saveStore } from '@engine/core/index.ts';
import { BOSS_AREA_START_TIER } from '../src/data/progress.ts';
import { SAVE_KEY, basicW, defaultSave, devSetArcade, loadSaveFrom, newEndlessRecord, save } from '../src/core/save.ts';
import { loopsCleared, startNextLoop } from '../src/core/progress.ts';
import { progressOf, scaledDepth, startDmgMul, startMaxHp, supplyPicks } from '../src/core/rules.ts';
import { run } from '../src/actors/player.ts';
import { endRun, goBase, startRun } from '../src/flow/run.ts';
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
  save.loop = base.loop;
  save.bits = base.bits;
  save.up = base.up;
  save.loadout = base.loadout;
  save.stash = base.stash;
  save.shortcut = base.shortcut;
  save.startTier = base.startTier;
  save.peak = base.peak;
  save.best = base.best;
  save.runs = base.runs;
  save.records = base.records;
  save.suspend = null;
  save.continueFrom = null;
});

test('scaledDepth: ARCADE and loop 1 keep the depth scale up to the boss area, and grow at half of it past it', () => {
  save.loop = 1;
  expect([0, 1, 5, BOSS_AREA_START_TIER, 25, 26].map(scaledDepth)).toEqual([0, 2, 10, 48, 49, 50]);
  devSetArcade(true);
  expect([0, 1, 5, BOSS_AREA_START_TIER, 26].map(scaledDepth)).toEqual([0, 2.5, 12.5, 60, 65]);
});

test('supplyPicks: the loop 1 depths of the same strength (a later loop sets out with chips at DEPTH 1)', () => {
  save.loop = 1;
  expect([0, 1, 9, BOSS_AREA_START_TIER].map(supplyPicks), 'one a skipped depth up to the boss area').toEqual([
    0, 1, 9, 24,
  ]);
  expect(supplyPicks(26), 'past it, half').toBe(25);
  save.loop = 2;
  expect(supplyPicks(0), "loop 2's D1 is loop 1's D20").toBe(19);
  expect(supplyPicks(BOSS_AREA_START_TIER)).toBe(29);
  devSetArcade(true);
  expect(supplyPicks(3), 'ARCADE: as it was').toBe(3);
});

test('scaledDepth: a later loop starts and ends deeper, and stops getting stronger past the cap', () => {
  save.loop = 2;
  expect(scaledDepth(0), "loop 2's D1 is loop 1's D20").toBe(38);
  expect(scaledDepth(BOSS_AREA_START_TIER), "loop 2's D25 is loop 1's D30").toBe(58);
  expect(scaledDepth(25), 'past the boss area it grows at half the depth scale, as loop 1 does').toBe(59);
  save.loop = 3;
  expect(scaledDepth(0), "loop 3's D1 is 10 deeper").toBe(48);
  save.loop = 5;
  const five = [0, BOSS_AREA_START_TIER, 25].map(scaledDepth);
  save.loop = 6;
  expect([0, BOSS_AREA_START_TIER, 25].map(scaledDepth), 'loop 6 is as strong as loop 5').toEqual(five);
});

test('progressOf: loop 1 is unchanged; loop 2 starts at loop 1 D20 and ends at D30', () => {
  save.loop = 1;
  expect([0, 3, 4, 8, 12].map(progressOf)).toEqual([0, 4, 10, 20, 30]);
  save.loop = 2;
  expect(progressOf(0)).toBe(38 * 5);
  expect(progressOf(BOSS_AREA_START_TIER * 4)).toBe(58 * 5);
  expect(progressOf(25 * 4), 'past the boss area, half the depth scale').toBe(59 * 5);
});

test('the loops cleared add 10% each to the start HP and damage; loop 6 does not count; ARCADE gets none', () => {
  const cleared = (loop: number): ReturnType<typeof newEndlessRecord> => {
    const row = newEndlessRecord(false, 0, loop);
    row.titan = true;
    return row;
  };
  save.records.endless = [];
  expect(loopsCleared()).toBe(0);
  expect(startMaxHp(0)).toBe(100);
  expect(startDmgMul(0)).toBe(1);
  save.records.endless = [cleared(6)];
  expect(loopsCleared(), 'a loop past the cap does not count').toBe(0);
  expect(startMaxHp(0)).toBe(100);
  save.records.endless = [cleared(1), cleared(2), cleared(6)];
  expect(loopsCleared()).toBe(2);
  expect(startMaxHp(0), '100 HP x 1.2').toBe(120);
  expect(startDmgMul(0), 'x 1.2').toBeCloseTo(1.2, 9);
  devSetArcade(true);
  expect(loopsCleared(), 'ARCADE has no loops').toBe(0);
  expect(startMaxHp(0)).toBe(100);
  expect(startDmgMul(0)).toBe(1);
});

test('startNextLoop: the loop moves on; start depths, boss area and checkpoint go back, the rest stays', () => {
  save.loop = 1;
  save.bits = 1234;
  save.up.dmg = 7;
  save.loadout = [basicW('shotgun'), null];
  save.peak = 12;
  save.shortcut = 9;
  save.startTier = 6;
  save.records.cleared = true;
  save.records.bossArea = { tier: BOSS_AREA_START_TIER, beaten: ['crusher'] };
  save.suspend = { run: { stage: 3, route: [0] }, P: {} } as unknown as typeof save.suspend;
  const loadout = save.loadout,
    endless = save.records.endless,
    settings = save.settings;
  startNextLoop();
  expect(save.loop).toBe(2);
  expect([save.shortcut, save.startTier, save.records.bossArea, save.suspend]).toEqual([0, 0, null, null]);
  expect(save.bits).toBe(1234);
  expect(save.up.dmg).toBe(7);
  expect(save.loadout).toBe(loadout);
  expect(save.peak).toBe(12);
  expect(save.records.cleared).toBe(true);
  expect(save.records.endless).toBe(endless);
  expect(save.settings).toBe(settings);
});

test("a dive in the new loop gets its own row, loop 1's row left alone", () => {
  save.loop = 1;
  save.records.endless = [newEndlessRecord()];
  startRun();
  run.stage = 5;
  run.time = 10;
  run.kills = 2;
  endRun('extract');
  goBase();
  const first = save.records.endless.find(r => r.loop === 1)!;
  expect([first.dives, first.best]).toEqual([1, 6]);
  startNextLoop();
  startRun();
  run.stage = 8;
  run.time = 20;
  run.kills = 4;
  endRun('extract');
  const second = save.records.endless.find(r => r.loop === 2)!;
  expect([second.dives, second.deaths, second.best, second.kills]).toEqual([1, 0, 9, 4]);
  expect([first.dives, first.best, first.kills], 'loop 1 is unchanged').toEqual([1, 6, 2]);
});

test('an old save gets loop 1 and its loop 1 row the save TITAN clear', () => {
  const before = localStorage.getItem(SAVE_KEY);
  try {
    const old: Record<string, any> = {
      ...defaultSave(),
      records: {
        cleared: true,
        bossArea: null,
        bestTime: null,
        bestTimeContinued: null,
        bestTimeContinuedCount: null,
        endless: [
          {
            loop: 1,
            restriction: 'none',
            best: 10,
            sec: 1,
            titanSec: null,
            kills: 1,
            dives: 1,
            deaths: 0,
            partial: false,
          },
          {
            loop: 2,
            restriction: 'none',
            best: 3,
            sec: 2,
            titanSec: null,
            kills: 2,
            dives: 2,
            deaths: 0,
            partial: false,
          },
        ],
      },
    };
    delete old.loop;
    saveStore(SAVE_KEY, old);
    const loaded = loadSaveFrom(SAVE_KEY);
    expect(loaded.loop).toBe(1);
    expect(loaded.records.endless.map(r => r.titan)).toEqual([true, false]);
  } finally {
    restore(SAVE_KEY, before);
  }
});

test('an old save from before the records gets its partial row the save TITAN clear', () => {
  const before = localStorage.getItem(SAVE_KEY);
  try {
    const old: Record<string, any> = {
      ...defaultSave(),
      runs: 2,
      records: { cleared: true, bossArea: null, bestTime: null, bestTimeContinued: null, bestTimeContinuedCount: null },
    };
    delete old.loop;
    saveStore(SAVE_KEY, old);
    const loaded = loadSaveFrom(SAVE_KEY);
    expect(loaded.loop).toBe(1);
    expect(loaded.records.endless).toHaveLength(1);
    expect([loaded.records.endless[0]!.partial, loaded.records.endless[0]!.titan]).toEqual([true, true]);
  } finally {
    restore(SAVE_KEY, before);
  }
});
