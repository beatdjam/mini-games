// Smoke test for ENDLESS's restriction challenges: starting and ending one, the strength it plays at, the row it
// records, the five restrictions that are open ('weapon', 'kit', 'pick', 'hurt' and 'fail') and the bonus their clears give.
// Boots the game page (setup.ts) once for this file; each test makes the state it needs.
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { el } from '@engine/core/util.ts';
import { query } from '@engine/core/world.ts';
import { floorY } from '@engine/world/tiles.ts';
import { clearStore, saveStore } from '@engine/core/store.ts';
import type { Pickup } from '../src/data/types.ts';
import { BOSS_AREA_START_TIER, LOOP_TUNE, RESTRICTION_TUNE, TUNE } from '../src/data/progress.ts';
import { WEAPONS } from '../src/data/weapons.ts';
import { SAVE_KEY, basicW, defaultSave, devSetArcade, loadSaveFrom, newEndlessRecord, save } from '../src/core/save.ts';
import {
  canStartChallenge,
  challengeStrengthMax,
  endChallenge,
  equipWeapon,
  loopsCleared,
  recordEndlessTitan,
  restrictionKey,
  setSuspend,
  startChallenge,
} from '../src/core/progress.ts';
import { pickDrop, restrictionBonus, scaledDepth, startDmgMul, startMaxHp } from '../src/core/rules.ts';
import { damagePlayer, hurtEnemy } from '../src/actors/combat.ts';
import { player, run } from '../src/actors/player.ts';
import { newWeapon, shotDamage } from '../src/actors/weapons.ts';
import { addPickup, boss, spawnEnemy } from '../src/world/entities.ts';
import { spawnBoss } from '../src/actors/bosses/common.ts';
import { openPerk } from '../src/screens/perk.ts';
import { openLevelUp } from '../src/screens/levelup.ts';
import { endRun, goBase, startRun } from '../src/flow/run.ts';
import { building } from '../src/world/building.ts';
import { level, roomSpot } from '../src/world/level.ts';
import { bootGame, enterBuilding, goToFloor, killRoom, tick } from './helpers.ts';

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
  save.unlocked = base.unlocked;
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

// ---- the two restrictions that came in after the first two ----
test('a weapon challenge needs an unlocked kind and sets out with that one basic weapon', () => {
  save.records.endless = [cleared(1), cleared(2)];
  save.unlocked = { pistol: true };
  expect(startChallenge('weapon', 1, 'shotgun'), 'not unlocked').toBe(false);
  expect(startChallenge('weapon', 1, 'nope'), 'not a kind').toBe(false);
  expect(startChallenge('weapon', 1), 'no kind').toBe(false);
  save.unlocked.shotgun = true;
  save.loadout = [basicW('smg'), basicW('rail')];
  const main = save.loadout;
  expect(startChallenge('weapon', 1, 'shotgun')).toBe(true);
  expect(save.challenge).toMatchObject({ restriction: 'weapon', strength: 1, weapon: 'shotgun' });
  expect(save.challenge!.main.loadout, 'the main loadout is set aside').toBe(main);
  expect(save.loadout.map(w => w?.id ?? null)).toEqual(['shotgun', null]);
  expect(save.loadout[0]!.basic, 'the basic one').toBe(true);
  for (let i = 0; i < 20; i++) expect(pickDrop(), 'only the chosen kind drops').toBe('shotgun');
  equipWeapon(0, basicW('pistol'));
  expect(save.loadout[0]!.id, 'another kind cannot be equipped').toBe('shotgun');
  equipWeapon(1, basicW('shotgun'));
  expect(save.loadout[1]!.id, 'the chosen kind can').toBe('shotgun');
  expect(restrictionKey(save.challenge)).toBe('weapon:shotgun');
  expect(endChallenge()).toBe(true);
  expect(save.loadout, 'the main loadout comes back').toBe(main);
});

test("endChallenge puts a weapon challenge's picked weapons in the stash", () => {
  save.records.endless = [cleared(1)];
  save.unlocked.shotgun = true;
  save.loadout = [basicW('pistol'), basicW('smg')];
  const main = save.loadout;
  expect(startChallenge('weapon', 1, 'shotgun')).toBe(true);
  const picked = newWeapon('rail', 1, false, 2);
  save.loadout[1] = picked;
  save.stash = [];
  expect(endChallenge()).toBe(true);
  expect(save.loadout, 'the main loadout comes back').toBe(main);
  expect(save.stash, 'the picked weapon goes into the stash').toContain(picked);
});

test('a weapon challenge records under weapon:<kind>', () => {
  save.records.endless = [cleared(1), cleared(2)];
  save.unlocked.shotgun = true;
  expect(startChallenge('weapon', 2, 'shotgun')).toBe(true);
  startRun();
  run.stage = 9;
  run.time = 10;
  run.kills = 3;
  endRun('extract');
  const row = save.records.endless.find(r => r.loop === 2 && r.restriction === 'weapon:shotgun')!;
  expect(row, 'the row is keyed by the kind').toBeTruthy();
  expect([row.dives, row.best, row.kills]).toEqual([1, 10, 3]);
});

test("a weapon clear adds its bonus to that kind's damage alone", () => {
  save.records.endless = [cleared(1)];
  startRun();
  const shotgun = basicW('shotgun'),
    pistol = basicW('pistol');
  const shotgun0 = shotDamage(WEAPONS.shotgun, shotgun),
    pistol0 = shotDamage(WEAPONS.pistol, pistol),
    dmg0 = startDmgMul(0);
  const row = newEndlessRecord(false, 0, 2, 'weapon:shotgun');
  row.titan = true;
  save.records.endless.push(row);
  expect(restrictionBonus('weapon').weaponDmg).toEqual({ shotgun: 0.08 });
  expect(restrictionBonus().dmg, 'the weapon bonus is not the whole damage').toBe(0);
  expect(shotDamage(WEAPONS.shotgun, shotgun)).toBeCloseTo(shotgun0 * 1.08, 9);
  expect(shotDamage(WEAPONS.pistol, pistol), 'another kind is unchanged').toBeCloseTo(pistol0, 9);
  expect(startDmgMul(0), 'the start damage is unchanged').toBeCloseTo(dmg0, 9);
});

test('a kit challenge sets out with one kit and leaves the terminal out', () => {
  save.records.endless = [cleared(1)];
  save.up.kit = 2;
  startRun();
  expect(player.kits, 'no challenge: the level counts').toBe(TUNE.kitStart + 2);
  openLevelUp();
  expect(document.querySelector('#perkList [data-level="kit"]'), 'no challenge: the kit level is there').not.toBeNull();
  el('#perkDone').click();
  goBase();
  setSuspend(null);
  expect(startChallenge('kit', 1)).toBe(true);
  startRun();
  expect(player.kits, 'a kit challenge: only the start kit').toBe(TUNE.kitStart);
  openLevelUp();
  expect(document.querySelector('#perkList [data-level="kit"]'), 'a kit challenge: no kit level').toBeNull();
  expect(document.querySelector('#perkList [data-level="hp"]'), 'the other levels are still there').not.toBeNull();
  el('#perkDone').click();
});

test('a kit challenge leaves the med kits out of a kill', () => {
  save.records.endless = [cleared(1)];
  const original = Math.random,
    random = vi.spyOn(Math, 'random');
  const kits = () => query<Pickup>('pickup').filter(p => !p.dead && p.kind === 'kit').length;
  try {
    startRun();
    query<Pickup>('pickup').forEach(p => (p.dead = true));
    random.mockReturnValue(0); // the kit drop's die comes up
    hurtEnemy(spawnEnemy('crawler', player.x + 2, player.z, -1, 1), 1e6, false);
    random.mockImplementation(original);
    expect(kits(), 'no challenge: a kill can drop a kit').toBe(1);
    goBase();
    setSuspend(null);
    expect(startChallenge('kit', 1)).toBe(true);
    startRun();
    query<Pickup>('pickup').forEach(p => (p.dead = true));
    random.mockReturnValue(0);
    hurtEnemy(spawnEnemy('crawler', player.x + 2, player.z, -1, 1), 1e6, false);
    random.mockImplementation(original);
    expect(kits(), 'a kit challenge: no kit from a kill').toBe(0);
  } finally {
    random.mockRestore();
  }
});

test('a kit challenge leaves the med kits out of a cleared room', () => {
  save.records.endless = [cleared(1)];
  const original = Math.random,
    random = vi.spyOn(Math, 'random');
  const roomToClear = () => {
    const hall = building!.plans[level.floor]?.hall?.room,
      ld = building!.lockdown;
    return level.roomCount.findIndex(
      (n, i) => n > 0 && i !== hall && !(ld && ld.floor === level.floor && ld.room === i),
    );
  };
  const alive = (kind: Pickup['kind']) => query<Pickup>('pickup').filter(p => !p.dead && p.kind === kind).length;
  try {
    enterBuilding();
    let room = roomToClear();
    expect(room, 'a room to clear').toBeGreaterThanOrEqual(0);
    query<Pickup>('pickup').forEach(p => (p.dead = true));
    random.mockReturnValue(1); // no kill kit, and the room's chip roll fails
    killRoom(room);
    random.mockImplementation(original);
    expect(alive('kit'), 'no challenge: the room gives a kit').toBe(1);
    expect(alive('bit'), 'the room gives its bits').toBeGreaterThan(0);
    goBase();
    setSuspend(null);
    expect(startChallenge('kit', 1)).toBe(true);
    enterBuilding();
    room = roomToClear();
    expect(room, 'a room to clear').toBeGreaterThanOrEqual(0);
    query<Pickup>('pickup').forEach(p => (p.dead = true));
    random.mockReturnValue(1);
    killRoom(room);
    random.mockImplementation(original);
    expect(alive('kit'), 'a kit challenge: no kit from a room').toBe(0);
    expect(alive('bit'), 'the bits stay').toBeGreaterThan(0);
  } finally {
    random.mockRestore();
  }
});

test('a kit challenge leaves the med kits out of a supplied lockdown reward', () => {
  save.records.endless = [cleared(1)];
  setSuspend(null);
  expect(startChallenge('kit', 1)).toBe(true);
  enterBuilding(b => !!b.lockdown);
  const ld = building!.lockdown!;
  goToFloor(ld.floor);
  run.bld!.supplied = true; // after the pre-boss supply the chip's place would be a kit
  query<Pickup>('pickup').forEach(p => (p.dead = true));
  const [x, z] = roomSpot(level.rooms[ld.room]!);
  player.x = x;
  player.z = z;
  player.fy = floorY(x, z);
  tick(2);
  tick(30);
  for (let k = 0; k < 20 && !run.bld!.ld; k++)
    for (let n = 0; n < 6 && level.roomCount[ld.room]! > 0 && !run.bld!.ld; n++) killRoom(ld.room);
  expect(run.bld!.ld, 'the lockdown is over').toBe(1);
  const lying = query<Pickup>('pickup').filter(p => !p.dead);
  expect(
    lying.some(p => p.kind === 'kit'),
    'a kit challenge: no kit',
  ).toBe(false);
  expect(
    lying.some(p => p.kind === 'weapon'),
    'the weapon is still there',
  ).toBe(true);
});

test('a kit challenge still gets the boss reward kit', () => {
  save.records.endless = [cleared(1)];
  setSuspend(null);
  expect(startChallenge('kit', 1)).toBe(true);
  startRun();
  query<Pickup>('pickup').forEach(p => (p.dead = true));
  spawnBoss('watcher');
  tick(200);
  hurtEnemy(boss!, boss!.hp + 1, false);
  tick(2);
  expect(
    query<Pickup>('pickup').some(p => !p.dead && p.kind === 'kit'),
    'the boss still leaves a kit',
  ).toBe(true);
});

test('fail: a death ends the challenge and brings the main loop back; coming home does not', () => {
  save.records.endless = [cleared(1)];
  save.shortcut = 6;
  save.startTier = 6;
  expect(startChallenge('fail', 1)).toBe(true);
  startRun();
  endRun('extract');
  expect(save.challenge?.restriction, 'coming home keeps it going').toBe('fail');
  goBase();
  startRun();
  endRun('dead');
  expect(save.challenge, 'a death ends it').toBeNull();
  expect([save.shortcut, save.startTier], "the main loop's start depths are back").toEqual([6, 6]);
  const row = save.records.endless.find(r => r.restriction === 'fail' && r.loop === 1)!;
  expect([row.dives, row.deaths], 'both dives are in its row').toEqual([2, 1]);
});

test('fail: its clears give the thickest bonus (damage and max HP, 0.05 a loop)', () => {
  save.records.endless = [cleared(1), cleared(2), cleared(2, 'fail')];
  expect(restrictionBonus('fail')).toMatchObject({ dmg: 0.1, hp: 0.1 });
});
