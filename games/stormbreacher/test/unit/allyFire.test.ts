// The allies' fire that tells (SB-2301): who shoots, how often, what a hit takes and what it leaves alone. The pure cases
// build the small world the function asks for; the health and suppression are read from the game in the integration test,
// because it sets them on the enemy after the shot.
import { expect, test } from 'vitest';
import { ALLY_FIRE_TUNE, ALLY_TUNE } from '../../src/data/allies.ts';
import { ENEMIES, ENEMY_CHEST, type EnemyKind } from '../../src/data/enemies.ts';
import { newAlly, type AllyState } from '../../src/logic/allies.ts';
import { stepAllyFire, type AllyFireWorld } from '../../src/logic/allyFire.ts';
import { newEnemy, type EnemyState } from '../../src/logic/enemies.ts';

const DT = 1 / 60;

// An ally of the kit its id names (cover-b1 is a sniper, cover-b3 a scout), standing at the origin.
function allyOf(id: string): AllyState {
  return newAlly(
    id,
    [
      { x: 0, z: 0 },
      { x: 0, z: 1 },
    ],
    null,
  );
}

function foeAt(id: string, kind: EnemyKind, z: number): EnemyState {
  const enemy = newEnemy(id, 'ally-fire', kind, 0, z);
  enemy.awake = true;
  return enemy;
}

function worldOf(allies: AllyState[], enemies: EnemyState[]): AllyFireWorld {
  return { allies, enemies };
}

function shotsOver(world: AllyFireWorld, seconds: number): number {
  let shots = 0;
  for (let i = 0; i < Math.round(seconds / DT); i++) shots += stepAllyFire(world, DT).length;
  return shots;
}

test('a sniper fires every 2.4 s within 85 m and takes 0.35 of the target’s full health', () => {
  const sniper = allyOf('cover-b1');
  const target = foeAt('e-1', 'grunt', -60);
  const shots = stepAllyFire(worldOf([sniper], [target]), 0);
  expect(shots).toHaveLength(1);
  expect(shots[0].id).toBe('cover-b1');
  expect(shots[0].kit).toBe('sniper');
  expect(shots[0].enemy).toBe('e-1');
  expect(shots[0].damage).toBeCloseTo(ENEMIES.grunt.hp * ALLY_FIRE_TUNE.sniper.share, 6);
  expect(shots[0].from).toEqual({ x: 0, y: ALLY_TUNE.fireHeight, z: 0 });
  expect(shots[0].to).toEqual({ x: 0, y: ENEMIES.grunt.height * ENEMY_CHEST, z: -60 });
  expect(sniper.fireT).toBeCloseTo(ALLY_FIRE_TUNE.sniper.every, 6);

  // the 85 m reach, and no farther
  const near = allyOf('cover-b1');
  expect(stepAllyFire(worldOf([near], [foeAt('e-2', 'grunt', -84)]), 0)).toHaveLength(1);
  const far = allyOf('cover-b1');
  expect(stepAllyFire(worldOf([far], [foeAt('e-3', 'grunt', -86)]), 0)).toEqual([]);
});

test('a scout fires every 0.8 s within 55 m and takes 0.08 of the target’s full health', () => {
  const scout = allyOf('cover-b3');
  const target = foeAt('e-1', 'grunt', -54);
  const shots = stepAllyFire(worldOf([scout], [target]), 0);
  expect(shots).toHaveLength(1);
  expect(shots[0].kit).toBe('scout');
  expect(shots[0].damage).toBeCloseTo(ENEMIES.grunt.hp * ALLY_FIRE_TUNE.scout.share, 6);
  expect(scout.fireT).toBeCloseTo(ALLY_FIRE_TUNE.scout.every, 6);

  const near = allyOf('cover-b3');
  expect(stepAllyFire(worldOf([near], [foeAt('e-2', 'grunt', -54)]), 0)).toHaveLength(1);
  const far = allyOf('cover-b3');
  expect(stepAllyFire(worldOf([far], [foeAt('e-3', 'grunt', -56)]), 0)).toEqual([]);
});

test('the nearest enemy is the one shot', () => {
  const sniper = allyOf('cover-b1');
  const far = foeAt('far', 'grunt', -60);
  const near = foeAt('near', 'grunt', -30);
  const shots = stepAllyFire(worldOf([sniper], [far, near]), 0);
  expect(shots).toHaveLength(1);
  expect(shots[0].enemy).toBe('near');
});

test('a long frame fires every shot that came due', () => {
  const sniper = allyOf('cover-b1');
  const target = foeAt('e-1', 'grunt', -60);
  // 7.3 s is four sniper intervals: at 0, 2.4, 4.8 and 7.2 s
  expect(stepAllyFire(worldOf([sniper], [target]), 7.3)).toHaveLength(4);
});

test('the fallen, the sleeping, the dormant, the mid boss and a hidden defender are not shot', () => {
  const cases: { name: string; make: () => EnemyState }[] = [
    { name: 'dead', make: () => ({ ...foeAt('e', 'grunt', -40), hp: 0 }) },
    { name: 'not awake', make: () => ({ ...foeAt('e', 'grunt', -40), awake: false }) },
    { name: 'dormant', make: () => ({ ...foeAt('e', 'grunt', -40), dormant: true }) },
    { name: 'warden', make: () => foeAt('e', 'warden', -40) },
    { name: 'hidden defender', make: () => ({ ...foeAt('e', 'grunt', -40), post: 0, holdOut: false }) },
  ];
  for (const item of cases) {
    const sniper = allyOf('cover-b1');
    expect(shotsOver(worldOf([sniper], [item.make()]), 5), item.name).toBe(0);
  }
  // a defender that has stepped out is a target
  const sniper = allyOf('cover-b1');
  const out = { ...foeAt('e', 'grunt', -40), post: 0, holdOut: true };
  expect(shotsOver(worldOf([sniper], [out]), 1)).toBeGreaterThan(0);
});

test('an ally that has fallen does not shoot', () => {
  const sniper = allyOf('cover-b1');
  sniper.down = true;
  const target = foeAt('e-1', 'grunt', -40);
  expect(shotsOver(worldOf([sniper], [target]), 5)).toBe(0);
});
