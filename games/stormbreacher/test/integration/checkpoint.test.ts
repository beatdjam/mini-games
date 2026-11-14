import { describe, expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { WEAPONS } from '../../src/data/weapons.ts';
import {
  newGame,
  restartGame,
  retryFromCheckpoint,
  sendToScript,
  step,
  type GameInput,
  type GameModel,
} from '../../src/logic/game.ts';
import { newPlayGame } from './playGame.ts';
import { restoreCheckpoint } from '../../src/logic/script.ts';

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
const walk: GameInput = { ...idle, moveZ: 1 };

function run(game: GameModel, input: GameInput, frames: number): void {
  for (let i = 0; i < frames; i++) step(game, input, DT);
}

// Breaks both pillboxes, which is what takes cp1.
function takeCp1(game: GameModel): void {
  for (const id of ['pillbox-1', 'pillbox-2']) {
    const target = game.targets.find(t => t.id === id);
    if (!target) throw new Error(`the map has no ${id}`);
    target.hp = 0;
    sendToScript(game, { kind: 'destroyed', target: id });
  }
}

// A game that walked, met the B line's squad and then took cp1.
function atCp1(): GameModel {
  const game = newPlayGame(M1B_HAND);
  run(game, walk, 30);
  sendToScript(game, { kind: 'enter', area: 'b-line' });
  // the nests would shoot the mech on the way; this test reads the checkpoint's copy
  game.enemies = game.enemies.filter(enemy => enemy.wave !== 'b-emplacements');
  run(game, walk, 30);
  takeCp1(game);
  return game;
}

// What the game changes after cp1: the mech walks on, the depot and an enemy fall, and the armour and weapons are spent.
function playOn(game: GameModel): void {
  run(game, walk, 60);
  const depot = game.targets.find(t => t.id === 'depot');
  if (!depot) throw new Error('the map has no depot');
  depot.hp = 0;
  sendToScript(game, { kind: 'destroyed', target: 'depot' });
  game.enemies[0].hp = 0;
  game.armor = 0;
  game.downed = true;
  game.main.ammo = 0;
  game.main.wait = 3;
  game.sub.ammo = 1;
}

describe('checkpoint', () => {
  test('there is none until the script takes one; the pillboxes down take cp1', () => {
    const game = newPlayGame(M1B_HAND);
    expect(game.checkpoint).toBeNull();
    run(game, idle, 5);
    expect(game.checkpoint).toBeNull();
    takeCp1(game);
    expect(game.checkpoint?.id).toBe('cp1');
    expect(game.script.checkpoint?.id).toBe('cp1');
  });

  test('the copy leaves out the events, the bullets in flight and the checkpoint itself', () => {
    const game = atCp1();
    game.bullets.push({ enemy: 'grunt', x: 0, y: 1, z: 0, dx: 0, dy: 0, dz: 1, left: 10 });
    takeCp1(game);
    const copy = game.checkpoint;
    if (!copy) throw new Error('no checkpoint');
    expect('events' in copy).toBe(false);
    expect('bullets' in copy).toBe(false);
    expect('checkpoint' in copy).toBe(false);
    expect(copy.map).toBe(game.map);
    expect(copy.mission).toBe(game.mission);
  });

  test('a retry puts the mech, the clock, the enemies and the targets back as they were at the checkpoint', () => {
    const game = atCp1();
    const mech = { x: game.mech.x, z: game.mech.z, yaw: game.mech.yaw };
    const time = game.time;
    const enemies = structuredClone(game.enemies);
    const targets = structuredClone(game.targets);
    expect(enemies.length).toBeGreaterThan(0);
    playOn(game);
    expect(game.mech.z).not.toBe(mech.z);
    const again = retryFromCheckpoint(game);
    expect(again.mech.x).toBe(mech.x);
    expect(again.mech.z).toBe(mech.z);
    expect(again.mech.yaw).toBe(mech.yaw);
    expect(again.time).toBe(time);
    expect(again.enemies).toEqual(enemies);
    expect(again.enemies.every(enemy => enemy.hp > 0)).toBe(true);
    expect(again.targets).toEqual(targets);
    expect(again.targets.find(t => t.id === 'depot')?.hp).toBeGreaterThan(0);
    expect(again.script.destroyed).not.toContain('depot');
    expect(again.bullets).toEqual([]);
  });

  test('a retry fills the armour and both weapons and clears downed', () => {
    const game = atCp1();
    playOn(game);
    const again = retryFromCheckpoint(game);
    expect(again.armor).toBe(MECH_TUNE.armor);
    expect(again.downed).toBe(false);
    expect(again.cleared).toBe(false);
    expect(again.main.ammo).toBe(WEAPONS[again.main.id].ammo);
    expect(again.sub.ammo).toBe(WEAPONS[again.sub.id].ammo);
    expect(again.main.wait).toBe(0);
    expect(again.aimTarget).toBeNull();
  });

  test('a retry counts and reports where it began from', () => {
    const game = atCp1();
    expect(game.retries).toBe(0);
    const again = retryFromCheckpoint(game);
    expect(again.retries).toBe(1);
    expect(again.events).toEqual([{ kind: 'retried', from: 'cp1' }]);
  });

  test('the script is the one restoreCheckpoint gives', () => {
    const game = atCp1();
    playOn(game);
    expect(retryFromCheckpoint(game).script).toEqual(restoreCheckpoint(game.script));
  });

  test('going down twice goes back to the same place', () => {
    const game = atCp1();
    const mech = { x: game.mech.x, z: game.mech.z };
    const time = game.time;
    playOn(game);
    const first = retryFromCheckpoint(game);
    playOn(first);
    const second = retryFromCheckpoint(first);
    expect(second.retries).toBe(2);
    expect(second.mech.x).toBe(mech.x);
    expect(second.mech.z).toBe(mech.z);
    expect(second.time).toBe(time);
    expect(second.checkpoint?.id).toBe('cp1');
    expect(second.targets.find(t => t.id === 'depot')?.hp).toBeGreaterThan(0);
  });

  test('the game goes on after a retry, and so does the script', () => {
    const game = atCp1();
    playOn(game);
    const again = retryFromCheckpoint(game);
    const z = again.mech.z;
    const time = again.time;
    run(again, walk, 30);
    expect(again.mech.z).not.toBe(z);
    expect(again.time).toBeGreaterThan(time);
    // cp1 was taken in the checkpoint, so wave2-lost fires 4 s later
    run(again, idle, 60 * 5);
    expect(again.script.fired['wave2-lost']).toBeDefined();
    expect(again.script.objective).toBe('take-seawall');
  });

  test('the checkpoint does not change with what the retried game does', () => {
    const game = atCp1();
    const before = structuredClone(game.checkpoint);
    const again = retryFromCheckpoint(game);
    playOn(again);
    again.enemies.push(...structuredClone(again.enemies));
    again.script.flags.push('x');
    again.rects.length = 0;
    again.propBoxes.length = 0;
    again.breakables.length = 0;
    run(again, walk, 30);
    expect(again.checkpoint).toBe(game.checkpoint);
    expect(game.checkpoint).toEqual(before);
    // and a second retry still gets the original
    const third = retryFromCheckpoint(again);
    expect(third.enemies).toEqual(before?.enemies);
    expect(third.rects).toEqual(before?.rects);
  });

  test('retrying without a checkpoint is refused', () => {
    expect(() => retryFromCheckpoint(newGame(M1B_HAND))).toThrow('no checkpoint');
  });
});

describe('restart', () => {
  test('a restart is a new game with only the retry count and the event different', () => {
    const game = atCp1();
    playOn(game);
    const again = restartGame(game);
    const fresh = newGame(M1B_HAND);
    expect(again.retries).toBe(1);
    expect(again.events).toEqual([{ kind: 'retried', from: null }]);
    expect({ ...again, retries: 0, events: [] }).toEqual(fresh);
    expect(again.checkpoint).toBeNull();
  });

  test('the retry count keeps growing across restarts', () => {
    expect(restartGame(restartGame(newGame(M1B_HAND))).retries).toBe(2);
  });
});
