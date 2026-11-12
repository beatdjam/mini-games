import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { CUTSCENE_SEC } from '../../src/data/script.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { WEAPONS } from '../../src/data/weapons.ts';
import { newGame, sendToScript, step, type GameInput, type GameModel } from '../../src/logic/game.ts';
import type { ScriptOut } from '../../src/logic/script.ts';

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
const pressing: GameInput = {
  ...idle,
  moveZ: 1,
  turn: 0.1,
  jump: true,
  jumpHeld: true,
  boost: true,
  fire: true,
  sub: true,
};

function scriptEvents(game: GameModel): ScriptOut[] {
  return game.events.flatMap(event => (event.kind === 'script' ? [event.event] : []));
}

// Runs frames of input until the landing is over; returns the events it saw.
function runUntilOver(game: GameModel, input: GameInput): string[] {
  const seen: string[] = [];
  for (let i = 0; i < 60 * (CUTSCENE_SEC.landing + 2) && game.script.cutscene !== null; i++) {
    step(game, input, DT);
    for (const out of scriptEvents(game)) seen.push(out.kind);
  }
  return seen;
}

// A game whose first step has started the landing, with the mech where it began.
function landing(): GameModel {
  const game = newGame(M1B_HAND);
  step(game, idle, 0);
  return game;
}

test('a sortie starts the landing, and the mech neither moves nor shoots while it plays', () => {
  const game = landing();
  expect(game.script.cutscene).toEqual({ id: 'landing', left: CUTSCENE_SEC.landing });
  const start = { x: game.mech.x, y: game.mech.y, z: game.mech.z, yaw: game.mech.yaw };
  let shots = 0;
  for (let i = 0; i < 60 * (CUTSCENE_SEC.landing - 1); i++) {
    step(game, pressing, DT);
    shots += game.events.filter(event => event.kind === 'shot').length;
  }
  expect(game.script.cutscene).not.toBeNull();
  expect({ x: game.mech.x, y: game.mech.y, z: game.mech.z, yaw: game.mech.yaw }).toEqual(start);
  expect(shots).toBe(0);
  expect(game.main.ammo).toBe(WEAPONS[game.main.id].ammo);
});

test('after the landing ends by itself the mech moves and shoots', () => {
  const game = landing();
  const seen = runUntilOver(game, idle);
  expect(seen).toContain('cutsceneEnd');
  const z = game.mech.z;
  let shots = 0;
  for (let i = 0; i < 30; i++) {
    step(game, { ...idle, moveZ: 1, fire: true }, DT);
    shots += game.events.filter(event => event.kind === 'shot').length;
  }
  expect(game.mech.z).toBeLessThan(z);
  expect(shots).toBeGreaterThan(0);
});

test('a skip ends the landing at once, and the script is the same as after watching it', () => {
  const skipped = landing();
  step(skipped, idle, DT);
  sendToScript(skipped, { kind: 'skip' });
  expect(skipped.script.cutscene).toBeNull();
  expect(scriptEvents(skipped).map(event => event.kind)).toContain('cutsceneEnd');
  expect(skipped.script.fired.beach).toBeDefined();

  const watched = landing();
  runUntilOver(watched, idle);
  expect(watched.script.cutscene).toBeNull();
  // the script's clock differs by the seconds watched; every other part of its state is the same
  const { time: skippedTime, ...skippedRest } = skipped.script;
  const { time: watchedTime, ...watchedRest } = watched.script;
  expect(skippedTime).toBeLessThan(watchedTime);
  const withoutTimes = (s: typeof skippedRest) => ({ ...s, fired: Object.keys(s.fired).sort() });
  expect(withoutTimes(skippedRest)).toEqual(withoutTimes(watchedRest));
});

test('no mortar shell is warned of while the landing plays, and the barrage starts once it is over', () => {
  const game = newGame(M1B_HAND);
  let warned = 0;
  for (let t = 0; t < CUTSCENE_SEC.landing - 0.1; t += 1 / 60) {
    step(game, idle, 1 / 60);
    warned += game.events.filter(event => event.kind === 'shellWarn').length;
  }
  expect(game.script.cutscene?.id).toBe('landing');
  expect(game.barrages.length).toBeGreaterThan(0);
  expect(warned).toBe(0);
  expect(game.armor).toBe(MECH_TUNE.armor);
  for (let t = 0; t < 8; t += 1 / 60) {
    step(game, idle, 1 / 60);
    warned += game.events.filter(event => event.kind === 'shellWarn').length;
  }
  expect(game.script.cutscene).toBeNull();
  expect(warned).toBeGreaterThan(0);
});
