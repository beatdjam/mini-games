import { describe, expect, test } from 'vitest';
import { CHARGE_TUNE } from '../../src/data/charge.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import type { BlastPlace } from '../../src/data/types.ts';
import { blastPropIndexes } from '../../src/logic/blasts.ts';
import {
  retryFromCheckpoint,
  sendToScript,
  step,
  type GameEvent,
  type GameInput,
  type GameModel,
} from '../../src/logic/game.ts';
import { newPlayGame } from './playGame.ts';
import { restoreSuspend, suspendOf } from '../../src/logic/suspend.ts';

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

// The hand map without the six nests: every test here stands the mech in b-line while a fuse burns, and the nests would
// take armour the tests count.
function newBlastGame(): GameModel {
  const spawns = { ...M1B_HAND.spawns };
  delete spawns['b-emplacements'];
  return newPlayGame({ ...M1B_HAND, spawns });
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
    const game = newBlastGame();
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
    // the hit faces from the mech toward the charge: the mech stood sea-side of it, so the direction is landward (-z)
    expect(blown.find(event => event.kind === 'damaged')).toMatchObject({ fromX: 0, fromZ: -1 });
    expect(game.armor).toBe(MECH_TUNE.armor - CHARGE_TUNE.damage);
    expect(game.charges).toEqual([]);
  });

  test('a mech that walks out of the blast takes no damage', () => {
    const game = newBlastGame();
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
    const game = newBlastGame();
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
    const game = newBlastGame();
    quiet(game);
    standAt(game, blastOf(game, 'l1-b'));
    // the control: the same triggers without use do fire, so the check below cannot pass on a weapon that is empty
    const ammo = game.main.ammo;
    const subAmmo = game.sub.ammo;
    for (let i = 0; i < 80; i++) step(game, { ...idle, fire: true, sub: true }, DT);
    expect(game.main.ammo).toBeLessThan(ammo);
    expect(game.sub.ammo).toBeLessThan(subAmmo);
    const armed = { main: game.main.ammo, sub: game.sub.ammo };
    for (let i = 0; i < 80; i++) step(game, { ...use, fire: true, sub: true }, DT);
    expect(game.main.ammo).toBe(armed.main);
    expect(game.sub.ammo).toBe(armed.sub);
  });
});

describe('checkpoint and retry', () => {
  test('a planted charge and its fuse are kept by the checkpoint and go on after the retry', () => {
    const game = newBlastGame();
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
    const game = newBlastGame();
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

// Plants l1-b, steps well out of its blast and waits for the charge to blow.
function blowL1B(game: GameModel) {
  const blast = blastOf(game, 'l1-b');
  standAt(game, blast);
  runUntil(game, use, 200, () => game.events.some(event => event.kind === 'planted'));
  game.mech.z = blast.z + CHARGE_TUNE.blastRadius + 5;
  const blown = runUntil(game, idle, Math.ceil((CHARGE_TUNE.fuse + 0.5) / DT), () =>
    game.events.some(event => event.kind === 'blast'),
  );
  return { blast, blown };
}

// Walks the mech landward at x through the open hole of line 1; true when it comes out the other side.
function walkThroughL1(game: GameModel, x: number): boolean {
  game.mech.x = x;
  game.mech.y = 0;
  game.mech.z = 150;
  game.mech.grounded = true;
  game.mech.yaw = 0;
  for (let i = 0; i < 600; i++) {
    step(game, { ...idle, moveZ: 1 }, DT);
    if (game.mech.z < 126) return true;
  }
  return false;
}

describe('a blast opens its line', () => {
  test('the same hedgehogs leave rects, propBoxes and propRefs, and the mech walks through the hole', () => {
    const game = newBlastGame();
    quiet(game);
    game.armor = 1e9;
    const props = new Set(blastPropIndexes(game.map, blastOf(game, 'l1-b')));
    expect(props.size).toBeGreaterThan(0);
    const boxesBefore = game.propRefs.length;
    const rectsBefore = game.rects.length;

    const { blast } = blowL1B(game);
    expect(game.blasts.find(place => place.id === blast.id)?.blasted).toBe(true);
    expect(game.propRefs.some(index => props.has(index))).toBe(false);
    expect(game.propRefs.length).toBeLessThan(boxesBefore);
    expect(game.rects.length).toBe(rectsBefore - props.size);
    // the map is the closed line still: only the game's own arrays were opened
    expect(game.map.props.filter((_prop, index) => props.has(index))).toHaveLength(props.size);

    expect(walkThroughL1(game, blast.x)).toBe(true);
  });

  test('a blasted point cannot be planted on again', () => {
    const game = newBlastGame();
    quiet(game);
    game.armor = 1e9;
    const { blast } = blowL1B(game);

    standAt(game, blast);
    const events: GameEvent[] = [];
    for (let i = 0; i < 200; i++) {
      step(game, use, DT);
      events.push(...game.events);
    }
    expect(events.some(event => event.kind === 'planted')).toBe(false);
    expect(game.charges).toEqual([]);
    expect(game.plant).toBeNull();
  });

  test('the checkpoint keeps the line open, so a retry starts with the hole still there', () => {
    const game = newBlastGame();
    quiet(game);
    game.armor = 1e9;
    const props = new Set(blastPropIndexes(game.map, blastOf(game, 'l1-b')));
    const { blast } = blowL1B(game);
    takeCp1(game);
    expect(game.checkpoint?.blasts.find(place => place.id === blast.id)?.blasted).toBe(true);

    game.armor = 0;
    game.downed = true;
    const again = retryFromCheckpoint(game);
    expect(again.blasts.find(place => place.id === blast.id)?.blasted).toBe(true);
    expect(again.propRefs.some(index => props.has(index))).toBe(false);
    expect(walkThroughL1(again, blast.x)).toBe(true);
  });

  test('a suspend keeps the hole the real blast opened, with the three arrays in step', () => {
    const game = newBlastGame();
    quiet(game);
    game.armor = 1e9;
    const { blast } = blowL1B(game);
    const counts = { refs: game.propRefs.length, boxes: game.propBoxes.length, rects: game.rects.length };
    const back = restoreSuspend(suspendOf(game));
    if (!back) throw new Error('the suspend did not read back');
    expect(back.blasts.find(place => place.id === blast.id)?.blasted).toBe(true);
    // the real openBlastHole removed a box and a rect for each hedgehog, so a suspend that kept only some of them shows
    expect(back.propRefs).toHaveLength(counts.refs);
    expect(back.propBoxes).toHaveLength(counts.boxes);
    expect(back.rects).toHaveLength(counts.rects);
    expect(walkThroughL1(back, blast.x)).toBe(true);
  });
});
