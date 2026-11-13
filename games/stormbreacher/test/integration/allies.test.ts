import { expect, test } from 'vitest';
import { ALLY_TUNE } from '../../src/data/allies.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import type { AllyState } from '../../src/logic/allies.ts';
import {
  newGame,
  retryFromCheckpoint,
  sendToScript,
  step,
  type GameEvent,
  type GameInput,
  type GameModel,
} from '../../src/logic/game.ts';
import { seed } from '../../src/logic/rng.ts';
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
const PLACE = M1.places['beach-mid'];

// Runs `frames` frames; gives back every event, in order.
function run(game: GameModel, input: GameInput, frames: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < frames; i++) {
    step(game, input, DT);
    events.push(...game.events);
  }
  return events;
}

const downs = (events: GameEvent[]) => events.filter(event => event.kind === 'allyDown');

// Breaks both pillboxes, which fires cp1: the checkpoint, and the two allies that go on with the infantry.
function breakPillboxes(game: GameModel): void {
  for (const id of ['pillbox-1', 'pillbox-2']) {
    const target = game.targets.find(t => t.id === id);
    if (!target) throw new Error(`the map has no ${id}`);
    target.hp = 0;
    sendToScript(game, { kind: 'destroyed', target: id });
  }
}

function allyById(allies: readonly AllyState[], id: string): AllyState {
  const ally = allies.find(entry => entry.id === id);
  if (!ally) throw new Error(`the sortie has no ally "${id}"`);
  return ally;
}

test('the beach cue puts the buddy out at the start, standing until the cutscene is over', () => {
  const game = newGame(M1B_HAND);
  step(game, IDLE, 0);
  expect(game.allies).toHaveLength(1);
  const buddy = game.allies[0];
  expect(buddy.id).toBe('buddy');
  const start = { x: buddy.x, z: buddy.z };
  expect(start.z).toBeGreaterThan(160);
  run(game, IDLE, 60);
  expect(game.script.cutscene).not.toBeNull();
  expect({ x: buddy.x, z: buddy.z }).toEqual(start);
  expect(buddy.down).toBe(false);
});

test('the buddy runs landward, and falls to the mortar at beach-mid once', () => {
  const game = newPlayGame(M1B_HAND);
  const buddy = game.allies[0];
  const events = run(game, IDLE, 60);
  expect(buddy.z).toBeLessThan(166 - ALLY_TUNE.speed / 2);
  expect(downs(events)).toHaveLength(0);
  events.push(...run(game, IDLE, 60 * 20));
  expect(buddy.down).toBe(true);
  expect(downs(events)).toEqual([{ kind: 'allyDown', id: 'buddy', x: buddy.x, z: buddy.z, by: 'mortar' }]);
  expect(Math.hypot(buddy.x - PLACE.x, buddy.z - PLACE.z)).toBeLessThanOrEqual(ALLY_TUNE.arrive);
  // fallen, it stays where it is and reports nothing more
  const at = { x: buddy.x, z: buddy.z };
  expect(downs(run(game, IDLE, 120))).toHaveLength(0);
  expect({ x: buddy.x, z: buddy.z }).toEqual(at);
});

test('the buddy takes no part in the mech, the shots or the shells: the game goes the same without it', () => {
  const play = (withBuddy: boolean) => {
    seed(11);
    const game = newPlayGame(M1B_HAND);
    if (!withBuddy) game.allies = [];
    // the mech walks along the buddy's way and fires all the while
    const events = run(game, { ...IDLE, moveZ: 1, fire: true }, 60 * 12);
    return { game, events: events.filter(event => event.kind !== 'allyDown') };
  };
  const a = play(true);
  const b = play(false);
  expect(a.game.allies[0].down).toBe(true);
  expect(a.game.mech).toEqual(b.game.mech);
  expect(a.game.armor).toBe(b.game.armor);
  expect(a.game.bullets).toEqual(b.game.bullets);
  expect(a.game.targets).toEqual(b.game.targets);
  expect(a.events).toEqual(b.events);
});

test('a shot passing through the buddy goes on, and the mech stands where the buddy stands', () => {
  const game = newPlayGame(M1B_HAND);
  const buddy = game.allies[0];
  game.mech.x = buddy.x;
  game.mech.z = buddy.z;
  game.bullets.push({
    weapon: game.main.id,
    x: buddy.x,
    y: 1.5,
    z: buddy.z + 1,
    dx: 0,
    dy: 0,
    dz: -1,
    left: 100,
  });
  run(game, IDLE, 1);
  expect(game.events.filter(event => event.kind === 'hit')).toHaveLength(0);
  expect(game.bullets).toHaveLength(1);
  expect(game.bullets[0].z).toBeLessThan(buddy.z + 1);
});

test('cp1 puts out the two allies that go on with the infantry, and both run past z -50', () => {
  const game = newPlayGame(M1B_HAND);
  run(game, IDLE, 60);
  breakPillboxes(game);
  const advance = ['advance-1', 'advance-2'].map(id => allyById(game.allies, id));
  // the wave2-sinks cutscene holds them for a few seconds; 30 s covers it and the run to the end of the way
  run(game, IDLE, 60 * 30);
  for (const ally of advance) expect(ally.z).toBeLessThan(-50);
  // no fate, so they stand at the end of the way and do not fall
  expect(advance.every(ally => ally.down === false)).toBe(true);
});

test('going back to the checkpoint brings the buddy back as the checkpoint kept it', () => {
  const game = newPlayGame(M1B_HAND);
  run(game, IDLE, 60);
  // cp1 is taken while the buddy is still running
  breakPillboxes(game);
  const kept = structuredClone(allyById(game.allies, 'buddy'));
  expect(kept.down).toBe(false);
  expect(allyById(game.checkpoint?.allies ?? [], 'buddy')).toEqual(kept);
  run(game, IDLE, 60 * 20);
  expect(allyById(game.allies, 'buddy').down).toBe(true);

  const again = retryFromCheckpoint(game);
  const keptAgain = allyById(again.allies, 'buddy');
  expect(keptAgain).toEqual(kept);
  expect(keptAgain).not.toBe(game.checkpoint?.allies.find(ally => ally.id === 'buddy'));
  expect(again.allies.map(ally => ally.id)).toEqual(expect.arrayContaining(['advance-1', 'advance-2']));
  // it runs on from there and falls once more
  expect(downs(run(again, IDLE, 60 * 20))).toHaveLength(1);
  // and the checkpoint itself still holds the buddy running
  expect(allyById(game.checkpoint?.allies ?? [], 'buddy')).toEqual(kept);
});
