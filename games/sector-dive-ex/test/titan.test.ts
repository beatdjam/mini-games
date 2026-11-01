// Smoke test for Sector Dive Extended, TITAN: its three stages. Boots the game page (setup.ts) once for this file
// (bootGame) and fights it in boss practice. Each test makes the state it needs.
import { beforeAll, afterEach, expect, test } from 'vitest';
import type { Boss } from '../src/data/types.ts';
import { el } from '@engine/core/util.ts';
import { BOSS_META, BOSS_TUNE } from '../src/data/bosses.ts';
import { devBossArea } from '../src/core/bossArea.ts';
import { SAVE_KEY, save, saveKeyFor } from '../src/core/save.ts';
import { currentWeapon, player } from '../src/actors/player.ts';
import { wDmgMul } from '../src/actors/weapons.ts';
import { rushDamage, setRushBuild } from '../src/dev/views/bossRush.ts';
import { hurtEnemy } from '../src/actors/combat.ts';
import { spawnBoss } from '../src/actors/bosses/common.ts';
import { boss } from '../src/world/entities.ts';
import { level } from '../src/world/level.ts';
import { endRun, goBase, startPractice } from '../src/flow/run.ts';
import { renderBase } from '../src/screens/base.ts';
import { update } from '../src/flow/update.ts';
import { bootGame, tick } from './helpers.ts';

type Titan = Boss & {
  st: string;
  face: number;
  pick: number;
  stripped: boolean;
  revived: boolean;
  beam: { visible: boolean };
  ringAt: { visible: boolean };
};
const K = BOSS_META.titan.tune;
const titan = () => boss as Titan;
beforeAll(async () => {
  await bootGame();
  devBossArea(true);
});
afterEach(() => {
  devBossArea(true);
  goBase();
});
// TITAN in boss practice, past its entrance, with the player `side` of it (1: in front, -1: behind)
function meet(side = 1) {
  startPractice('titan');
  tick(3);
  if (!boss) spawnBoss('titan');
  player.maxHp = 1e6;
  player.hp = 1e6;
  while (titan().spawnT > 0) tick(1);
  stand(side);
}
function stand(side: number) {
  const e = titan();
  player.x = e.x + Math.sin(e.face) * 6 * side;
  player.z = e.z + Math.cos(e.face) * 6 * side;
}
// the damage one hit does to the first stage from where the player stands
function hitFor(dmg: number) {
  const e = titan(),
    hp = e.hp;
  hurtEnemy(e, dmg, false);
  return hp - e.hp;
}

test('first stage: the armour in front takes little, the back takes more', () => {
  meet(1);
  expect(hitFor(100), 'from in front').toBeCloseTo(100 * K.armourMul);
  stand(-1);
  expect(hitFor(100), 'from behind').toBeCloseTo(100 * K.backMul);
  endRun('abandon');
});

test('one hit does not go past the second stage; there the armour is off', () => {
  meet(-1);
  hurtEnemy(titan(), titan().maxHp * 10, false);
  const e = titan();
  expect(e.dead, 'still up').toBeFalsy();
  expect(e.hp, 'just below the boundary').toBeGreaterThan(0);
  expect(e.hp).toBeLessThan(e.maxHp * BOSS_TUNE.phases[0]!);
  expect(e.phase, 'the second stage').toBe(1);
  while (e.spawnT > 0) tick(1);
  tick(1);
  expect(e.stripped, 'the armour is off').toBe(true);
  stand(1);
  expect(hitFor(100), 'the usual damage, from in front too').toBeCloseTo(100);
  endRun('abandon');
});

test('at no health it falls and takes nothing, then gets up with a little health in the red bar', () => {
  meet(-1);
  const e = titan();
  hurtEnemy(e, e.maxHp, false);
  while (e.spawnT > 0) tick(1);
  hurtEnemy(e, e.maxHp, false);
  expect(boss, 'not down yet').toBe(e);
  expect(e.st, 'fallen').toBe('fallen');
  expect(e.hp, 'the bar is empty').toBe(0);
  expect(level.portals.length, 'no way out yet').toBe(0);
  hurtEnemy(e, e.maxHp, false);
  expect(e.dead, 'nothing hurts it where it lies').toBeFalsy();
  while (!e.revived) tick(1);
  expect(e.hp, "the third stage's health").toBeCloseTo(e.maxHp * K.reviveHp);
  expect(el('#bossFill').classList.contains('revived'), 'the bar is red').toBe(true);
  hurtEnemy(e, e.maxHp, false);
  expect(e.dead, 'its last stage running out brings it down').toBe(true);
  expect(boss, 'gone').toBeNull();
  expect(level.portals.length, 'the way home').toBe(1);
  endRun('extract');
});

test('second stage: the grab catches a player in front, holds them and throws them', () => {
  meet(-1);
  const e = titan();
  hurtEnemy(e, e.maxHp, false);
  while (e.spawnT > 0) tick(1);
  e.st = 'lunge';
  e.timer = K.lungeTime;
  e.face = 0;
  player.x = e.x;
  player.z = e.z + 3;
  player.inv = 0;
  update(1 / 60); // (tick would make the player untouchable first)
  expect(e.st, 'caught').toBe('hold');
  while (e.st === 'hold') tick(1);
  expect(e.st, 'thrown, and it walks on').toBe('walk');
  expect(player.z - e.z, 'thrown away from it').toBeGreaterThan(K.holdAt);
  endRun('abandon');
});

test('the practice list has TITAN only once it is beaten', () => {
  goBase();
  save.records.cleared = false;
  renderBase();
  expect(el('#bossList').innerHTML, 'before').not.toContain('data-practice="titan"');
  save.records.cleared = true;
  renderBase();
  expect(el('#bossList').innerHTML, 'after').toContain('data-practice="titan"');
  save.records.cleared = false;
});

test('the way in to play the boss area: a save of its own, only on the dev server', () => {
  expect(saveKeyFor('#bossrush', true), 'its own').not.toBe(SAVE_KEY);
  expect(saveKeyFor('#bossrush-new', true), 'its own').toBe(saveKeyFor('#bossrush', true));
  expect(saveKeyFor('', true), 'any other page: the real one').toBe(SAVE_KEY);
  expect(saveKeyFor('#bossrush', false), 'the published game: the real one').toBe(SAVE_KEY);
});

test('#bossrush: the player is set from the real save, the damage grown to the depth', () => {
  goBase();
  startPractice('crusher');
  tick(1);
  setRushBuild(49);
  const whole = player.dmgMul * player.lvlDmg * wDmgMul(currentWeapon());
  expect(whole, 'the stats multiplier').toBeCloseTo(rushDamage(49));
  expect(rushDamage(49), 'the damage the boss area is tuned for').toBe(3000);
  expect(player.fireRate, 'the rest of the build').toBeCloseTo(9.66);
  expect(player.maxHp).toBe(1160);
  expect(currentWeapon().id).toBe('shotgun');
  endRun('abandon');
});
