import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { CUTSCENE_SEC } from '../../src/data/script.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { WEAPONS } from '../../src/data/weapons.ts';
import { newGame, sendToScript, step, type GameInput, type GameModel } from '../../src/logic/game.ts';
import { newPlayGame } from './playGame.ts';
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

test('no mortar shell is warned of while the landing plays or the mech is on the craft, and one comes once it is off', () => {
  const game = newGame(M1B_HAND);
  let warned = 0;
  const run = (seconds: number): void => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      step(game, idle, 1 / 60);
      warned += game.events.filter(event => event.kind === 'shellWarn').length;
    }
  };
  run(CUTSCENE_SEC.landing - 0.1);
  expect(game.script.cutscene?.id).toBe('landing');
  expect(game.barrages.length).toBeGreaterThan(0);
  expect(warned).toBe(0);
  expect(game.armor).toBe(MECH_TUNE.armor);
  // past the cutscene the mech still waits on the deck, and the beach's mortar leaves the boat alone
  run(2);
  expect(game.script.cutscene).toBeNull();
  expect(game.mech.z).toBeGreaterThan(game.map.bounds.maxZ);
  expect(warned).toBe(0);
  // once it has walked down the ramp the barrage starts, and a shell is warned of
  game.mech.x = 0;
  game.mech.y = 0;
  game.mech.z = 160;
  run(8);
  expect(warned).toBeGreaterThan(0);
});

// A game past the landing, with the mech at the pillbox line and both pillboxes handed to the script as down: cp1 fires
// at once, and the wave2-lost cue 4 s after it.
function afterPillboxes(): GameModel {
  const game = newPlayGame(M1B_HAND);
  game.mech.x = 10;
  game.mech.z = -20;
  sendToScript(game, { kind: 'destroyed', target: 'pillbox-1' });
  sendToScript(game, { kind: 'destroyed', target: 'pillbox-2' });
  expect(game.script.fired.cp1).toBeDefined();
  return game;
}

// Runs frames until the game's cutscene is `id`; returns the script events seen on the way.
function runUntilCutscene(game: GameModel, id: string, seconds: number): string[] {
  const seen: string[] = [];
  for (let i = 0; i < 60 * seconds && game.script.cutscene?.id !== id; i++) {
    step(game, idle, DT);
    for (const out of scriptEvents(game)) seen.push(out.kind);
  }
  return seen;
}

test('wave2-sinks starts 4 s after cp1, holds the mech still, and ends with the radio, objective and drop done', () => {
  const game = afterPillboxes();
  runUntilCutscene(game, 'wave2-sinks', 4.5);
  expect(game.script.cutscene?.id).toBe('wave2-sinks');
  expect(game.script.time - (game.script.fired.cp1 ?? 0)).toBeGreaterThan(3.99);
  expect(game.script.time - (game.script.fired.cp1 ?? 0)).toBeLessThan(4.1);
  // the cue's other actions come in the same frame; the ally calls before it are still in the radio band or behind it
  expect(game.script.objective).toBe('take-seawall');
  expect([game.radio?.line ?? null, ...game.radioQueue.map(entry => entry.line)]).toContain('m1.wave2-lost');
  expect(game.enemies.some(enemy => enemy.wave === 'seawall-drop')).toBe(true);
  const start = { x: game.mech.x, y: game.mech.y, z: game.mech.z, yaw: game.mech.yaw };
  let shots = 0;
  for (let i = 0; i < 60 * (CUTSCENE_SEC['wave2-sinks'] - 1); i++) {
    step(game, pressing, DT);
    shots += game.events.filter(event => event.kind === 'shot').length;
  }
  expect(game.script.cutscene?.id).toBe('wave2-sinks');
  expect({ x: game.mech.x, y: game.mech.y, z: game.mech.z, yaw: game.mech.yaw }).toEqual(start);
  expect(shots).toBe(0);
  // once it is over the mech moves again
  for (let i = 0; i < 60 * 2 && game.script.cutscene !== null; i++) step(game, idle, DT);
  expect(game.script.cutscene).toBeNull();
  const z = game.mech.z;
  for (let i = 0; i < 30; i++) step(game, { ...idle, moveZ: 1 }, DT);
  expect(game.mech.z).toBeLessThan(z);
});

test('a skip of wave2-sinks leaves the script as watching it does', () => {
  const skipped = afterPillboxes();
  runUntilCutscene(skipped, 'wave2-sinks', 4.5);
  sendToScript(skipped, { kind: 'skip' });
  expect(skipped.script.cutscene).toBeNull();
  const watched = afterPillboxes();
  runUntilCutscene(watched, 'wave2-sinks', 4.5);
  for (let i = 0; i < 60 * (CUTSCENE_SEC['wave2-sinks'] + 1) && watched.script.cutscene !== null; i++)
    step(watched, idle, DT);
  expect(watched.script.cutscene).toBeNull();
  const { time: skippedTime, ...skippedRest } = skipped.script;
  const { time: watchedTime, ...watchedRest } = watched.script;
  expect(skippedTime).toBeLessThan(watchedTime);
  const withoutTimes = (s: typeof skippedRest) => ({ ...s, fired: Object.keys(s.fired).sort() });
  expect(withoutTimes(skippedRest)).toEqual(withoutTimes(watchedRest));
});

// A game at the end of M1: the guns and the magazine are handed to the script as down.
function afterMagazine(): GameModel {
  const game = newPlayGame(M1B_HAND);
  sendToScript(game, { kind: 'destroyed', target: 'main-gun-1' });
  sendToScript(game, { kind: 'destroyed', target: 'main-gun-2' });
  sendToScript(game, { kind: 'destroyed', target: 'magazine' });
  return game;
}

test('beach-held plays on the win, the game goes on until it ends, and a skip ends it the same way', () => {
  const game = afterMagazine();
  expect(game.script.cutscene).toEqual({ id: 'beach-held', left: CUTSCENE_SEC['beach-held'] });
  const time = game.script.time;
  const start = { x: game.mech.x, z: game.mech.z };
  for (let i = 0; i < 60 * (CUTSCENE_SEC['beach-held'] - 1); i++) step(game, pressing, DT);
  expect(game.script.time).toBeGreaterThan(time + 6); // the script's clock runs on, though the sortie is cleared
  expect(game.script.cutscene?.id).toBe('beach-held');
  expect({ x: game.mech.x, z: game.mech.z }).toEqual(start);
  for (let i = 0; i < 60 * 2 && game.script.cutscene !== null; i++) step(game, idle, DT);
  expect(game.script.cutscene).toBeNull();
  expect(game.cleared).toBe(true);
  expect(game.script.ended).toBe('cleared');
  // after it the game stops
  const clock = game.script.time;
  step(game, idle, DT);
  expect(game.script.time).toBe(clock);

  const skipped = afterMagazine();
  sendToScript(skipped, { kind: 'skip' });
  expect(skipped.script.cutscene).toBeNull();
  expect(skipped.cleared).toBe(true);
  expect(skipped.script.ended).toBe(game.script.ended);
  expect(Object.keys(skipped.script.fired).sort()).toEqual(Object.keys(game.script.fired).sort());
});

test('nothing takes armour off the mech while a cutscene plays', () => {
  const game = newGame(M1B_HAND);
  step(game, idle, DT);
  expect(game.script.cutscene).not.toBeNull();
  const y = game.mech.y + MECH_TUNE.chestHeight;
  game.bullets.push({ enemy: 'grunt', x: game.mech.x, y, z: game.mech.z - 20, dx: 0, dy: 0, dz: 1, left: 80 });
  for (let i = 0; i < 30; i++) step(game, idle, DT);
  expect(game.armor).toBe(MECH_TUNE.armor);
  expect(game.events.some(event => event.kind === 'damaged')).toBe(false);
});
