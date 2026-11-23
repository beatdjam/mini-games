// The mid boss in the game (SB-1850): it comes out of the land gate after the yard's three waves, its front, flank and
// back take different shares of the same shots, a charge stopped by a wall opens its back, and its three seconds of smoke
// end in one `wardenDown`.
import { expect, test } from 'vitest';
import { ENEMIES } from '../../src/data/enemies.ts';
import { YARD_TUNE } from '../../src/data/fortress.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { WARDEN_TUNE } from '../../src/data/warden.ts';
import { newEnemy, type EnemyState } from '../../src/logic/enemies.ts';
import { step, type GameEvent, type GameInput, type GameModel } from '../../src/logic/game.ts';
import { newPlayGame } from './playGame.ts';

const DT = 1 / 60;
const IDLE: GameInput = {
  moveX: 0,
  moveZ: 0,
  turn: 0,
  jump: false,
  jumpHeld: false,
  boost: false,
  fire: false,
  sub: false,
};
const LONG = 15000;

// One step with nothing else on the field hurting the mech.
function run(game: GameModel, frames: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < frames; i++) {
    game.armor = MECH_TUNE.armor;
    game.barrages = [];
    game.shells = [];
    game.aimed = null;
    game.battery.on = false;
    game.mines = [];
    step(game, IDLE, DT);
    events.push(...game.events);
  }
  return events;
}

// A game with only the warden on an open field, the mech far enough away that its turning does not matter; its own phase
// is frozen in `stagger` with no exposure, so a test can hit one chosen side.
function fightAt(yaw: number): { game: GameModel; warden: EnemyState } {
  const game = newPlayGame(M1B_HAND);
  game.mech.x = 40;
  game.mech.z = 40;
  game.mech.y = 0;
  game.mech.grounded = true;
  game.rects = [];
  game.propBoxes = [];
  game.targets = [];
  game.enemies = [newEnemy('warden-1', 'warden', 'warden', 0, -30)];
  const warden = game.enemies[0];
  if (!warden.warden) throw new Error('the warden has no state');
  warden.yaw = yaw;
  warden.warden.phase = 'stagger';
  warden.warden.timer = 999;
  warden.warden.exposed = 0;
  return { game, warden };
}

// Fires `shots` autocannon rounds into the warden from `side` (1 is its front, -1 its back) and returns its health left.
function shootSide(yaw: number, side: 1 | -1, shots: number): number {
  const { game, warden } = fightAt(yaw);
  const z = warden.z - side * (ENEMIES.warden.radius + 4);
  for (let i = 0; i < shots; i++) {
    game.bullets.push({ weapon: 'autocannon', x: warden.x, y: 3, z, dx: 0, dy: 0, dz: side, left: 20 });
  }
  run(game, 1);
  return warden.hp;
}

const yardOf = (game: GameModel, wave: string) => game.enemies.filter(enemy => enemy.wave === wave);
const downYard = (game: GameModel, wave: string): void => {
  for (const enemy of yardOf(game, wave)) enemy.hp = 0;
};

test('the yard clearing the three waves sends the warden out of the land gate', () => {
  const game = newPlayGame(M1B_HAND);
  game.armor = MECH_TUNE.armor;
  game.mech.x = 0;
  game.mech.z = -80;
  game.mech.y = 0;
  game.mech.grounded = true;
  run(game, 1);
  expect(yardOf(game, 'yard-1')).toHaveLength(3);

  downYard(game, 'yard-1');
  run(game, 1);
  // yard-2 comes one gap after the cue that sent yard-1
  run(game, Math.round(60 * (YARD_TUNE.waveGapSec + 0.2)));
  expect(yardOf(game, 'yard-2')).toHaveLength(2);
  downYard(game, 'yard-2');
  run(game, 1);
  downYard(game, 'yard-3');
  const events = run(game, 1);

  const warden = yardOf(game, 'warden');
  expect(warden).toHaveLength(1);
  expect(warden[0]).toMatchObject({ kind: 'warden', hp: ENEMIES.warden.hp });
  expect({ x: warden[0].x, z: warden[0].z }).toEqual(M1B_HAND.spawns['warden'][0]);
  expect(game.script.spawned).toContain('warden');
  expect(
    events.some(event => event.kind === 'script' && event.event.kind === 'radio' && event.event.line === 'm1.warden'),
  ).toBe(true);
});

test('the same shots leave more health from the front than from the back', () => {
  const shots = 4;
  const front = shootSide(0, 1, shots);
  const back = shootSide(0, -1, shots);
  expect(front).toBeGreaterThan(back);
  // 10 a shot: a quarter from the front, double from the back
  expect(front).toBe(ENEMIES.warden.hp - shots * 10 * 0.25);
  expect(back).toBe(ENEMIES.warden.hp - shots * 10 * 2);
});

test('a charge stopped by a wall exposes the back for its stagger', () => {
  const game = newPlayGame(M1B_HAND);
  game.mech.x = 0;
  game.mech.z = 0;
  game.mech.y = 0;
  game.mech.grounded = true;
  game.propBoxes = [];
  game.targets = [];
  game.rects = [{ x: 0, z: -20, halfW: 20, halfD: 1, yaw: 0, top: 6 }];
  game.enemies = [newEnemy('warden-1', 'warden', 'warden', 0, -30)];
  const warden = game.enemies[0];
  if (!warden.warden) throw new Error('the warden has no state');
  warden.yaw = Math.PI;
  warden.warden.phase = 'charge';
  warden.warden.timer = 0;
  warden.warden.chargeLeft = 25;

  let exposedAt = -1;
  for (let i = 0; i < Math.round(2 / DT) && exposedAt < 0; i++) {
    run(game, 1);
    if ((warden.warden?.exposed ?? 0) > 0) exposedAt = i;
  }
  expect(exposedAt).toBeGreaterThanOrEqual(0);
  expect(warden.warden?.phase).toBe('stagger');
  expect(warden.warden?.exposed).toBeGreaterThan(1.9);
  // it stopped at the wall's face and did not go through
  expect(warden.z).toBeGreaterThan(-24);
});

test(
  'the warden smokes for three seconds and reports one `wardenDown`',
  () => {
    const { game, warden } = fightAt(0);
    warden.hp = 0;
    const downs: GameEvent[] = [];
    for (let i = 0; i < Math.round(4 / DT); i++) {
      game.armor = MECH_TUNE.armor;
      game.shells = [];
      step(game, IDLE, DT);
      downs.push(...game.events.filter(event => event.kind === 'wardenDown'));
      if (i < Math.round(2.5 / DT)) expect(game.events.some(event => event.kind === 'wardenDown')).toBe(false);
    }
    expect(downs).toHaveLength(1);
    expect(downs[0]).toMatchObject({ kind: 'wardenDown', id: 'warden-1', x: warden.x, z: warden.z });
  },
  LONG,
);

test('a shot from the front takes the back plate’s double while the warden is exposed', () => {
  const open = (exposed: number): number => {
    const { game, warden } = fightAt(0);
    if (!warden.warden) throw new Error('the warden has no state');
    warden.warden.exposed = exposed;
    const z = warden.z - (ENEMIES.warden.radius + 4);
    game.bullets.push({ weapon: 'autocannon', x: warden.x, y: 3, z, dx: 0, dy: 0, dz: 1, left: 20 });
    run(game, 1);
    return ENEMIES.warden.hp - warden.hp;
  };
  expect(open(0)).toBe(10 * WARDEN_TUNE.frontMul);
  expect(open(1)).toBe(10 * WARDEN_TUNE.backMul);
});

test('a charge that meets the mech takes charge.damage off its armour and pushes it aside once', () => {
  const game = newPlayGame(M1B_HAND);
  game.mech.x = 0;
  game.mech.z = -12;
  game.mech.y = 0;
  game.mech.grounded = true;
  game.rects = [];
  game.propBoxes = [];
  game.targets = [];
  game.enemies = [newEnemy('warden-1', 'warden', 'warden', 0, -30)];
  const warden = game.enemies[0];
  if (!warden.warden) throw new Error('the warden has no state');
  warden.yaw = Math.PI;
  warden.warden.phase = 'charge';
  warden.warden.timer = 0;
  warden.warden.chargeLeft = WARDEN_TUNE.charge.distance;
  let hits = 0;
  let pushedTo = -1;
  for (let i = 0; i < Math.round(2 / DT); i++) {
    game.shells = [];
    game.barrages = [];
    game.aimed = null;
    game.battery.on = false;
    game.mines = [];
    const before = game.armor;
    game.mech.x = pushedTo < 0 ? 0 : game.mech.x;
    game.mech.z = -12;
    step(game, IDLE, DT);
    if (game.armor < before) {
      hits++;
      expect(before - game.armor).toBe(WARDEN_TUNE.charge.damage);
      expect(game.events.some(event => event.kind === 'damaged' && event.amount === WARDEN_TUNE.charge.damage)).toBe(
        true,
      );
      pushedTo = Math.abs(game.mech.x);
    }
  }
  expect(hits).toBe(1);
  expect(pushedTo).toBeCloseTo(WARDEN_TUNE.charge.push, 3);
});

test('the game steps a warden through stepWarden only: it does not wake, and it does not fire during its walk-out', () => {
  const game = newPlayGame(M1B_HAND);
  game.mech.x = 0;
  game.mech.z = 0;
  game.mech.y = 0;
  game.mech.grounded = true;
  game.rects = [];
  game.propBoxes = [];
  game.targets = [];
  game.enemies = [newEnemy('warden-1', 'warden', 'warden', 0, -30)];
  const warden = game.enemies[0];
  let bullets = 0;
  for (let i = 0; i < Math.round((WARDEN_TUNE.walkOutSec - 0.3) / DT); i++) {
    run(game, 1);
    bullets += game.bullets.filter(bullet => 'enemy' in bullet && bullet.enemy === 'warden').length;
  }
  expect(warden.warden?.phase).toBe('walkout');
  expect(bullets).toBe(0);
  // stepEnemy is what sets `awake` (and what would have fired at this range), and it never ran
  expect(warden.awake).toBe(false);
});
