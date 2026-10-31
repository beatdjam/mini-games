// Smoke test for Sector Dive Extended, the boss area: its depth, the flag that keeps it out of the published build, and
// where each boss's room is. Boots the game page (setup.ts) once for this file (bootGame) and runs it through the real
// loop by hand. Each test makes the state it needs; the file passes on its own and in any order.
import { afterEach, beforeAll, expect, test } from 'vitest';
import { BIOMES } from '../src/data/biomes.ts';
import { BOSS_ORDER } from '../src/data/bosses.ts';
import { BOSS_ROOMS } from '../src/data/bossRooms.ts';
import { PER } from '../src/data/progress.ts';
import { save } from '../src/core/save.ts';
import { bossAreaTierFor, bossRoomBiome, devBossArea } from '../src/core/bossArea.ts';
import { planOf } from '../src/core/stages.ts';
import { run } from '../src/actors/player.ts';
import { level } from '../src/world/level.ts';
import { state } from '../src/flow/state.ts';
import { goBase, startRun } from '../src/flow/run.ts';
import { bootGame } from './helpers.ts';

beforeAll(async () => {
  await bootGame();
  devBossArea(true); // not left to import.meta.env.DEV
});
afterEach(() => {
  devBossArea(true);
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
