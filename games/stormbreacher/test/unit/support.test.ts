// The infantry's support fire (SB-2240): who shoots, how often, what a hit takes and suppresses, and what it leaves
// alone. The pure cases build the small world the function asks for; the damage and suppression are read from the game,
// because it sets them on the enemy after the shot.
import { expect, test } from 'vitest';
import { createRng } from '@engine/core/index.ts';
import { ENEMIES } from '../../src/data/enemies.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { SECTOR_TUNE, SUPPORT_TUNE } from '../../src/data/sectors.ts';
import { newCrowd, type Crowd, type Soldier } from '../../src/logic/crowd.ts';
import { newEnemy, type EnemyState } from '../../src/logic/enemies.ts';
import { seed } from '../../src/logic/rng.ts';
import { stepSupport, supportDamage, type SupportWorld } from '../../src/logic/support.ts';
import { step, type GameInput, type GameModel } from '../../src/logic/game.ts';
import { newPlayGame } from '../integration/playGame.ts';

const DT = 1 / 60;
const HOLD = SECTOR_TUNE.startHoldZ;
const idle: GameInput = {
  moveX: 0,
  moveZ: 0,
  turn: 0,
  jump: false,
  jumpHeld: false,
  boost: false,
  fire: false,
  sub: false,
};

function soldierAt(x: number, z: number): Soldier {
  return { x, z, yaw: 0, alive: true, deadT: 0, phase: 0, squad: 0, fallAt: null, waited: true };
}

function crowdOf(count: number): Crowd {
  const crowd = newCrowd();
  crowd.holdZ = HOLD;
  crowd.soldiers = Array.from({ length: count }, (_, i) => soldierAt(i * 0.1, HOLD));
  return crowd;
}

function foeAt(z: number): EnemyState {
  const enemy = newEnemy('e-1', 'w', 'grunt', 0, z);
  enemy.awake = true;
  return enemy;
}

function worldOf(count: number, enemies: EnemyState[]): SupportWorld {
  return { battle: { crowd: crowdOf(count) }, enemies, supportT: 0, hold: { holdZ: HOLD, held: true } };
}

function shotsOver(count: number, seconds: number): number {
  const world = worldOf(count, [foeAt(HOLD - 30)]);
  const rng = createRng(1);
  let shots = 0;
  for (let i = 0; i < Math.round(seconds / DT); i++) shots += stepSupport(world, rng, DT).length;
  return shots;
}

test('with no soldier at the hold line the infantry does not shoot', () => {
  const world = worldOf(0, [foeAt(HOLD - 30)]);
  const rng = createRng(1);
  for (let i = 0; i < 600; i++) expect(stepSupport(world, rng, DT)).toEqual([]);
  expect(world.supportT).toBe(0);
});

test('an enemy beyond the range is not shot', () => {
  const world = worldOf(6, [foeAt(HOLD - SUPPORT_TUNE.range - 1)]);
  const rng = createRng(1);
  for (let i = 0; i < 600; i++) expect(stepSupport(world, rng, DT)).toEqual([]);
});

test('six and twenty-four arrived soldiers fire at the factor and the shooters’ cap', () => {
  // 6 * clamp(6 / 12) / ((1.1 + 1.7) / 2) a second
  expect(shotsOver(6, 30) / 30).toBeCloseTo((6 * 0.5) / 1.4, 1);
  // the twenty-four are capped at twelve shooters and reach the top factor
  expect(shotsOver(24, 30) / 30).toBeCloseTo((12 * SUPPORT_TUNE.maxFactor) / 1.4, 1);
});

// A game after the landing with the battle layer held at the water's edge and no enemies of its own, so the test sees
// only the enemy it puts out.
function fieldGame(): GameModel {
  seed(7);
  const game = newPlayGame(M1B_HAND);
  game.sectors = null;
  game.trickle = null;
  game.armor = Number.MAX_SAFE_INTEGER;
  game.battle.crowd.holdZ = HOLD;
  game.battle.crowd.soldiers.forEach((soldier, i) => {
    soldier.alive = i < 12;
    soldier.z = HOLD;
    soldier.x = 0;
  });
  game.enemies = [];
  game.supportT = 0;
  return game;
}

test('a hit takes the share of the target’s health and suppresses it for suppressSec', () => {
  const game = fieldGame();
  const target = newEnemy('support-target', 'support', 'grunt', 0, HOLD - 40);
  target.awake = true;
  game.enemies.push(target);
  const full = target.hp;
  step(game, idle, DT);
  // twelve arrived soldiers make the factor 1
  expect(target.hp).toBeCloseTo(full - supportDamage(full, 1), 6);
  expect(target.suppressT).toBeCloseTo(SUPPORT_TUNE.suppressSec, 6);
  const shot = game.events.find(event => event.kind === 'supportFire');
  expect(shot).toBeDefined();
  if (shot !== undefined && shot.kind === 'supportFire') {
    expect(shot.from).toEqual({ x: 0, z: HOLD });
    expect(shot.to.z).toBeCloseTo(target.z, 6);
    expect(shot.to.y).toBeCloseTo(ENEMIES.grunt.height * 0.7, 6);
  }
});

test('a pillbox in range is not shot', () => {
  const game = fieldGame();
  game.targets = [
    {
      id: 'pillbox-test',
      kind: 'pillbox',
      hp: 100,
      box: { minX: -2, maxX: 2, minY: 0, maxY: 4, minZ: HOLD - 50, maxZ: HOLD - 45 },
      yaw: 0,
    },
  ];
  for (let i = 0; i < 300; i++) step(game, idle, DT);
  expect(game.events.some(event => event.kind === 'supportFire')).toBe(false);
  expect(game.targets[0].hp).toBe(100);
});
