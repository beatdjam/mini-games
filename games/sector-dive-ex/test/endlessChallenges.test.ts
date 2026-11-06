// Smoke test for ENDLESS's restriction challenges: starting and ending one, the strength it plays at, the row it
// records, the two effects that are open ('hurt' and 'pick') and the bonus its clears give. Boots the game page
// (setup.ts) once for this file; each test makes the state it needs.
import { afterEach, beforeAll, expect, test } from 'vitest';
import { clearStore, saveStore } from '@engine/core/store.ts';
import { BOSS_AREA_START_TIER, LOOP_TUNE, RESTRICTION_TUNE } from '../src/data/progress.ts';
import { SAVE_KEY, basicW, defaultSave, devSetArcade, loadSaveFrom, newEndlessRecord, save } from '../src/core/save.ts';
import {
  canStartChallenge,
  challengeStrengthMax,
  endChallenge,
  loopsCleared,
  recordEndlessTitan,
  setSuspend,
  startChallenge,
} from '../src/core/progress.ts';
import { restrictionBonus, scaledDepth, startDmgMul, startMaxHp } from '../src/core/rules.ts';
import { damagePlayer } from '../src/actors/combat.ts';
import { player, run } from '../src/actors/player.ts';
import { addPickup } from '../src/world/entities.ts';
import { openPerk } from '../src/screens/perk.ts';
import { endRun, goBase, startRun } from '../src/flow/run.ts';
import { bootGame, tick } from './helpers.ts';

beforeAll(async () => {
  devSetArcade(false);
  await bootGame();
});

const restore = (key: string, value: string | null) =>
  value === null ? clearStore(key) : localStorage.setItem(key, value);

// a row of `loop` with `restriction` cleared (TITAN down)
const cleared = (loop: number, restriction = 'none') => {
  const row = newEndlessRecord(false, 0, loop, restriction);
  row.titan = true;
  return row;
};

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
  save.challenge = base.challenge;
});

test('a challenge needs a cleared loop; its strength is the deepest clear up to the cap', () => {
  save.records.endless = [newEndlessRecord()];
  expect(challengeStrengthMax()).toBe(0);
  expect(canStartChallenge()).toBe(false);
  expect(startChallenge('hurt', 1), 'no loop cleared').toBe(false);
  save.records.endless = [cleared(1), cleared(2)];
  goBase(); // a run in progress has a checkpoint in the save, which stops a challenge
  setSuspend(null);
  expect(challengeStrengthMax()).toBe(2);
  expect(canStartChallenge()).toBe(true);
  save.records.endless = [cleared(7)];
  expect(challengeStrengthMax(), 'up to LOOP_TUNE.cap').toBe(LOOP_TUNE.cap);
  save.records.endless = [cleared(1)];
  save.suspend = { run: { stage: 0, route: [0] }, P: {} } as unknown as typeof save.suspend;
  expect(canStartChallenge(), 'no start with a suspended dive').toBe(false);
});

test('startChallenge keeps the main loop aside and returns it on endChallenge', () => {
  save.records.endless = [cleared(1), cleared(2)];
  save.bits = 1234;
  save.up.dmg = 7;
  save.loadout = [basicW('shotgun'), null];
  save.shortcut = 6;
  save.startTier = 3;
  save.records.bossArea = { tier: BOSS_AREA_START_TIER, beaten: ['crusher'] };
  const area = save.records.bossArea,
    loadout = save.loadout;
  expect(startChallenge('hurt', 2)).toBe(true);
  expect(save.challenge).toMatchObject({ restriction: 'hurt', strength: 2 });
  expect(save.challenge!.main).toMatchObject({ shortcut: 6, startTier: 3, suspend: null });
  expect(save.challenge!.main.bossArea).toBe(area);
  expect([save.shortcut, save.startTier, save.records.bossArea, save.suspend]).toEqual([0, 0, null, null]);
  expect(save.loop, 'the loop stays').toBe(1);
  expect(save.bits, 'the bits stay').toBe(1234);
  expect(save.up.dmg, 'the level stays').toBe(7);
  expect(save.loadout, 'the weapons stay').toBe(loadout);
  expect(endChallenge()).toBe(true);
  expect(save.challenge).toBeNull();
  expect([save.shortcut, save.startTier, save.records.bossArea, save.suspend]).toEqual([6, 3, area, null]);
});

test('startChallenge takes only a ready restriction and a strength within the cleared loops', () => {
  save.records.endless = [cleared(1), cleared(2)];
  expect(startChallenge('weapon', 1), "'weapon' is not open yet").toBe(false);
  expect(startChallenge('hurt', 0)).toBe(false);
  expect(startChallenge('hurt', 3), 'past the cleared loops').toBe(false);
  expect(save.challenge).toBeNull();
});

test('endChallenge waits while a dive is suspended', () => {
  save.records.endless = [cleared(1)];
  expect(startChallenge('hurt', 1)).toBe(true);
  save.suspend = { run: { stage: 0, route: [0] }, P: {} } as unknown as typeof save.suspend;
  expect(endChallenge()).toBe(false);
  expect(save.challenge).not.toBeNull();
  save.suspend = null;
  expect(endChallenge()).toBe(true);
});

test("scaledDepth uses the challenge's strength, not the loop being played", () => {
  save.records.endless = [cleared(1), cleared(3)];
  const depths = [0, BOSS_AREA_START_TIER, 25];
  save.loop = 3;
  const loop3 = depths.map(scaledDepth);
  save.loop = 1;
  const loop1 = depths.map(scaledDepth);
  expect(startChallenge('hurt', 3)).toBe(true);
  expect(depths.map(scaledDepth), 'strength 3 is loop 3').toEqual(loop3);
  expect(endChallenge()).toBe(true);
  expect(startChallenge('hurt', 1)).toBe(true);
  expect(depths.map(scaledDepth), 'strength 1 is loop 1').toEqual(loop1);
});

test("a challenge dive writes its own (strength, restriction) row and leaves the main loop's alone", () => {
  save.records.endless = [cleared(1), cleared(2)];
  expect(startChallenge('hurt', 2)).toBe(true);
  startRun();
  run.stage = 9;
  run.time = 10;
  run.kills = 3;
  endRun('extract');
  const row = save.records.endless.find(r => r.loop === 2 && r.restriction === 'hurt')!;
  expect([row.dives, row.deaths, row.best, row.kills]).toEqual([1, 0, 10, 3]);
  const main = save.records.endless.find(r => r.loop === 2 && r.restriction === 'none')!;
  expect([main.dives, main.kills], 'the main loop row is untouched').toEqual([0, 0]);
});

test('a TITAN clear in a challenge row does not clear the loop', () => {
  save.records.endless = [cleared(1), cleared(2)];
  const before = loopsCleared();
  expect(startChallenge('hurt', 2)).toBe(true);
  recordEndlessTitan(5);
  expect(loopsCleared()).toBe(before);
});

test('hurt doubles the damage taken while it is played, and only then', () => {
  save.records.endless = [cleared(1)];
  startRun();
  player.hp = player.maxHp;
  player.inv = 0;
  damagePlayer(10);
  expect(player.hp).toBe(player.maxHp - 10);
  goBase();
  setSuspend(null);
  expect(startChallenge('hurt', 1)).toBe(true);
  startRun();
  player.hp = player.maxHp;
  player.inv = 0;
  damagePlayer(10);
  expect(player.hp).toBe(player.maxHp - 10 * RESTRICTION_TUNE.hurtMul);
});

test('pick leaves one chip card', () => {
  save.records.endless = [cleared(1)];
  expect(startChallenge('pick', 1)).toBe(true);
  startRun();
  openPerk('test');
  expect(document.querySelectorAll('#perkList .perk')).toHaveLength(1);
});

test('restriction clears add their value times the strength to the start, and to the bits picked up', () => {
  save.records.endless = [cleared(1), cleared(2, 'hurt'), cleared(3, 'pick')];
  expect(restrictionBonus()).toEqual({ dmg: 0.06, hp: 0.06, bits: 0.09 });
  expect(restrictionBonus('hurt')).toEqual({ dmg: 0.06, hp: 0.06, bits: 0 });
  expect(restrictionBonus('pick')).toEqual({ dmg: 0, hp: 0, bits: 0.09 });
  // 1 + loop 1's 0.1 + the hurt clear's 0.06 (they add up rather than multiply)
  expect(startMaxHp(0)).toBe(Math.round(100 * 1.16));
  expect(startDmgMul(0)).toBeCloseTo(1.16, 9);
  // the same (restriction, strength) row cleared again does not add a second time
  expect(startChallenge('hurt', 1)).toBe(true);
  recordEndlessTitan(1);
  const before = restrictionBonus('hurt');
  recordEndlessTitan(2);
  recordEndlessTitan(3);
  expect(restrictionBonus('hurt')).toEqual(before);
  devSetArcade(true);
  expect(restrictionBonus(), 'ARCADE gets no restriction bonus').toEqual({ dmg: 0, hp: 0, bits: 0 });
});

test('the bits picked up carry the pick bonus', () => {
  startRun();
  const plain = addPickup('bit', player.x, player.z, { value: 100 });
  player.x = plain.x;
  player.z = plain.z;
  run.bits = 0;
  tick(1);
  const without = run.bits;
  goBase();
  save.records.endless = [cleared(1, 'pick')];
  startRun();
  const boosted = addPickup('bit', player.x, player.z, { value: 100 });
  player.x = boosted.x;
  player.z = boosted.z;
  run.bits = 0;
  tick(1);
  expect(without).toBeGreaterThan(0);
  expect(run.bits).toBeCloseTo(without * 1.03, 6);
});

test('an old save without a challenge reads as none', () => {
  const before = localStorage.getItem(SAVE_KEY);
  try {
    const old: Record<string, any> = { ...defaultSave() };
    delete old.challenge;
    saveStore(SAVE_KEY, old);
    expect(loadSaveFrom(SAVE_KEY).challenge).toBeNull();
  } finally {
    restore(SAVE_KEY, before);
  }
});
