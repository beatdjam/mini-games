import { describe, expect, test } from 'vitest';
import { CHARGE_TUNE } from '../../src/data/charge.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import type { BlastPlace } from '../../src/data/types.ts';
import {
  retryFromCheckpoint,
  sendToScript,
  step,
  type GameEvent,
  type GameInput,
  type GameModel,
} from '../../src/logic/game.ts';
import { newPlayGame } from './playGame.ts';

const DT = 1 / 60;
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
const use: GameInput = { ...idle, use: true };

function blastOf(game: GameModel, id: string): BlastPlace {
  const blast = game.blasts.find(place => place.id === id);
  if (!blast) throw new Error(`the map has no ${id}`);
  return blast;
}

// Stands the mech 2 m sea-side of the point, inside reach and clear of the hedgehogs.
function standAt(game: GameModel, blast: BlastPlace): void {
  game.mech.x = blast.x;
  game.mech.y = 0;
  game.mech.z = blast.z + 2;
  game.mech.grounded = true;
}

// Keeps the mortar's shells out of a test that only counts a charge's damage.
function quiet(game: GameModel): void {
  game.barrages = [];
  game.shells = [];
}

function runUntil(game: GameModel, input: GameInput, frames: number, done: () => boolean): GameEvent[] {
  const seen: GameEvent[] = [];
  for (let i = 0; i < frames; i++) {
    step(game, input, DT);
    seen.push(...game.events);
    if (done()) return seen;
  }
  throw new Error(`the game did not reach the state in ${frames} frames`);
}

// Destroys both pillboxes, which is the script's checkpoint cp1.
function takeCp1(game: GameModel): void {
  for (const id of ['pillbox-1', 'pillbox-2']) {
    const target = game.targets.find(place => place.id === id);
    if (!target) throw new Error(`the map has no ${id}`);
    target.hp = 0;
    sendToScript(game, { kind: 'destroyed', target: id });
  }
}

describe('planting and blowing a charge', () => {
  test('holding use by l1-b plants it, and the blast hurts a mech that stayed close', () => {
    const game = newPlayGame(M1B_HAND);
    quiet(game);
    const blast = blastOf(game, 'l1-b');
    standAt(game, blast);

    const planted = runUntil(game, use, 200, () => game.events.some(event => event.kind === 'planted'));
    expect(planted.find(event => event.kind === 'planted')).toEqual({
      kind: 'planted',
      id: 'l1-b',
      x: blast.x,
      z: blast.z,
    });
    expect(game.plant).toBeNull();
    expect(game.charges).toHaveLength(1);
    // the same frame's stepBlasts already took the first dt off the new fuse
    expect(game.charges[0].left).toBeGreaterThan(CHARGE_TUNE.fuse - 0.05);
    expect(game.charges[0].left).toBeLessThanOrEqual(CHARGE_TUNE.fuse);

    game.armor = MECH_TUNE.armor;
    const blown = runUntil(game, idle, Math.ceil((CHARGE_TUNE.fuse + 0.5) / DT), () =>
      game.events.some(event => event.kind === 'blast'),
    );
    expect(blown.find(event => event.kind === 'blast')).toEqual({
      kind: 'blast',
      id: 'l1-b',
      x: blast.x,
      z: blast.z,
      hit: true,
    });
    expect(blown.some(event => event.kind === 'damaged' && event.amount === CHARGE_TUNE.damage)).toBe(true);
    expect(game.armor).toBe(MECH_TUNE.armor - CHARGE_TUNE.damage);
    expect(game.charges).toEqual([]);
  });

  test('a mech that walks out of the blast takes no damage', () => {
    const game = newPlayGame(M1B_HAND);
    quiet(game);
    const blast = blastOf(game, 'l1-b');
    standAt(game, blast);
    runUntil(game, use, 200, () => game.events.some(event => event.kind === 'planted'));

    game.mech.z = blast.z - (CHARGE_TUNE.blastRadius + 5);
    game.armor = MECH_TUNE.armor;
    const blown = runUntil(game, idle, Math.ceil((CHARGE_TUNE.fuse + 0.5) / DT), () =>
      game.events.some(event => event.kind === 'blast'),
    );
    expect(blown.find(event => event.kind === 'blast')).toMatchObject({ id: 'l1-b', hit: false });
    expect(blown.some(event => event.kind === 'damaged')).toBe(false);
    expect(game.armor).toBe(MECH_TUNE.armor);
  });

  test('a hit during the hold does not put it back to zero', () => {
    const game = newPlayGame(M1B_HAND);
    quiet(game);
    standAt(game, blastOf(game, 'l1-b'));

    for (let i = 0; i < 30; i++) step(game, use, DT);
    expect(game.plant?.hold).toBeGreaterThan(0);
    game.bullets.push({
      enemy: 'grunt',
      x: game.mech.x + 0.5,
      y: game.mech.y + MECH_TUNE.chestHeight,
      z: game.mech.z,
      dx: -1,
      dy: 0,
      dz: 0,
      left: 50,
    });

    let damaged = false;
    let held = game.plant?.hold ?? 0;
    for (let i = 0; i < 200; i++) {
      step(game, use, DT);
      if (game.events.some(event => event.kind === 'damaged')) damaged = true;
      if (game.plant !== null) {
        expect(game.plant.hold).toBeGreaterThanOrEqual(held - 1e-9);
        held = game.plant.hold;
      }
      if (game.charges.length > 0) break;
    }
    expect(damaged).toBe(true);
    expect(game.charges).toHaveLength(1);
  });

  test('holding use shoots nothing', () => {
    const game = newPlayGame(M1B_HAND);
    quiet(game);
    standAt(game, blastOf(game, 'l1-b'));
    const ammo = game.main.ammo;
    const subAmmo = game.sub.ammo;
    for (let i = 0; i < 10; i++) step(game, { ...use, fire: true, sub: true }, DT);
    expect(game.main.ammo).toBe(ammo);
    expect(game.sub.ammo).toBe(subAmmo);
  });
});

describe('checkpoint and retry', () => {
  test('a planted charge and its fuse are kept by the checkpoint and go on after the retry', () => {
    const game = newPlayGame(M1B_HAND);
    quiet(game);
    standAt(game, blastOf(game, 'l1-b'));
    runUntil(game, use, 200, () => game.events.some(event => event.kind === 'planted'));
    takeCp1(game);
    expect(game.checkpoint?.charges).toHaveLength(1);
    const kept = game.checkpoint?.charges[0].left ?? 0;

    for (let i = 0; i < 30; i++) step(game, idle, DT);
    game.armor = 0;
    game.downed = true;
    const again = retryFromCheckpoint(game);
    expect(again.charges).toHaveLength(1);
    expect(again.charges[0].left).toBeCloseTo(kept, 6);

    const frames = Math.ceil((again.charges[0].left + 0.5) / DT);
    const blown = runUntil(again, idle, frames, () => again.events.some(event => event.kind === 'blast'));
    expect(blown.some(event => event.kind === 'blast')).toBe(true);
  });

  test('a hold under way is kept by the checkpoint and finishes after the retry', () => {
    const game = newPlayGame(M1B_HAND);
    quiet(game);
    standAt(game, blastOf(game, 'l1-b'));
    for (let i = 0; i < 30; i++) step(game, use, DT);
    const held = game.plant?.hold ?? 0;
    expect(held).toBeGreaterThan(0);
    takeCp1(game);
    expect(game.checkpoint?.plant?.hold).toBeCloseTo(held, 6);

    game.armor = 0;
    game.downed = true;
    const again = retryFromCheckpoint(game);
    expect(again.plant?.blast).toBe('l1-b');
    expect(again.plant?.hold).toBeCloseTo(held, 6);
    runUntil(again, use, 200, () => again.events.some(event => event.kind === 'planted'));
    expect(again.charges).toHaveLength(1);
  });
});
