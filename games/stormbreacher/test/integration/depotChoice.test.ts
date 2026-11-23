// The depot choice (SB-1820): walking into the hollow and breaking the depot keeps the friends alive and halves the
// shelling's pace, while walking straight on costs one ally and one squad. The two areas do not overlap, so the first one
// the mech enters is the answer.
import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { newPlayGame } from './playGame.ts';
import { sendToScript, step, type GameEvent, type GameInput, type GameModel } from '../../src/logic/game.ts';
import { newScript, scriptInput, stepScript, type ScriptOut, type ScriptState } from '../../src/logic/script.ts';
import { seed } from '../../src/logic/rng.ts';

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

type Warned = Extract<GameEvent, { kind: 'shellWarn' }>;

// The script to cp1, then the leader's 10 s question.
function toTheQuestion(): ScriptState {
  const state = newScript(M1);
  stepScript(state, M1, 0);
  scriptInput(state, M1, { kind: 'skip' });
  scriptInput(state, M1, { kind: 'ashore' });
  scriptInput(state, M1, { kind: 'enter', area: 'b-line' });
  scriptInput(state, M1, { kind: 'blast', id: 'l1-b' });
  scriptInput(state, M1, { kind: 'destroyed', target: 'pillbox-1' });
  scriptInput(state, M1, { kind: 'destroyed', target: 'pillbox-2' });
  stepScript(state, M1, 10);
  return state;
}

const labels = (outs: readonly ScriptOut[]): string[] =>
  outs.map(event => {
    switch (event.kind) {
      case 'flag':
        return `flag:${event.name}`;
      case 'loss':
        return `loss:${event.allies}/${event.squads}`;
      case 'allyFall':
        return `allyFall:${event.id}:${event.by}`;
      default:
        return event.kind;
    }
  });

test('the depot hollow fires its own cue and takes the loss away', () => {
  const state = toTheQuestion();
  const go = scriptInput(state, M1, { kind: 'enter', area: 'depot-approach' });
  expect(go.some(event => event.kind === 'spawn' && event.wave === 'depot-guard')).toBe(true);
  expect(labels(go)).toContain('flag:depot-taken');

  const down = scriptInput(state, M1, { kind: 'destroyed', target: 'depot' });
  expect(labels(down)).toEqual(['flag:depot-down', 'radio']);
  expect(state.flags).toContain('depot-down');
  expect(state.flags).toContain('depot-taken');

  // past the hollow the straight-on answer does not fire
  const approach = scriptInput(state, M1, { kind: 'enter', area: 'fortress-approach' });
  // only the nest's wake-up flag (SB-2045)
  expect(labels(approach)).toEqual(['flag:fortress-gun-awake']);
  expect(state.flags).not.toContain('fortress-skip');
});

test('walking straight on fires the loss and the ally falls 1.5 s later', () => {
  const state = toTheQuestion();
  const go = scriptInput(state, M1, { kind: 'enter', area: 'fortress-approach' });
  expect(labels(go)).toContain('loss:1/1');
  expect(labels(go)).toContain('allyMove');
  expect(state.flags).toContain('fortress-skip');

  const early = stepScript(state, M1, 1);
  expect(early.some(event => event.kind === 'allyFall')).toBe(false);
  const fall = stepScript(state, M1, 0.6);
  expect(fall.some(event => event.kind === 'allyFall' && event.id === 'cover-b3')).toBe(true);
});

test('the game counts the skipped ally and the squad, and the depot run keeps both', () => {
  const play = (depot: boolean): GameModel => {
    const game = newPlayGame(M1B_HAND);
    sendToScript(game, { kind: 'enter', area: 'b-line' });
    for (const id of ['pillbox-1', 'pillbox-2']) {
      const target = game.targets.find(item => item.id === id);
      if (!target) throw new Error(`the map has no ${id}`);
      target.hp = 0;
      sendToScript(game, { kind: 'destroyed', target: id });
    }
    // a little past the 10 s (the script's clock runs a few frames behind): the question has been asked and the walked-before areas are forgotten
    for (let i = 0; i < 60 * 11; i++) step(game, idle, DT);
    game.enemies = [];
    if (depot) {
      sendToScript(game, { kind: 'enter', area: 'depot-approach' });
      const target = game.targets.find(item => item.id === 'depot');
      if (!target) throw new Error('the map has no depot');
      target.hp = 0;
      sendToScript(game, { kind: 'destroyed', target: 'depot' });
    }
    sendToScript(game, { kind: 'enter', area: 'fortress-approach' });
    for (let i = 0; i < 60 * 2; i++) step(game, idle, DT);
    return game;
  };

  const skip = play(false);
  expect(skip.losses).toEqual({ allies: 1, squads: 1 });
  expect(skip.allies.find(ally => ally.id === 'cover-b3')?.down).toBe(true);

  const go = play(true);
  expect(go.losses).toEqual({ allies: 0, squads: 0 });
  expect(go.allies.find(ally => ally.id === 'cover-b3')?.down).toBe(false);
});

// The shells of the shelling over `sec`, from the same seed and the same first 10 s: the depot's flag makes them rarer.
function shellCount(sec: number, depotDown: boolean): number {
  seed(7);
  const game = newPlayGame(M1B_HAND);
  sendToScript(game, { kind: 'enter', area: 'b-line' });
  for (const id of ['pillbox-1', 'pillbox-2']) {
    const target = game.targets.find(item => item.id === id);
    if (!target) throw new Error(`the map has no ${id}`);
    target.hp = 0;
    sendToScript(game, { kind: 'destroyed', target: id });
  }
  for (let i = 0; i < 60 * 11; i++) step(game, idle, DT);
  // only the shelling is read; the mech stands in its reach and cannot go down
  game.barrages = game.barrages.filter(barrage => barrage.kind === 'shelling');
  game.shells = [];
  game.aimed = null;
  game.enemies = [];
  game.armor = MECH_TUNE.armor * 100;
  game.mech.x = 0;
  game.mech.y = 0;
  game.mech.z = -40;
  game.mech.yaw = 0;
  if (depotDown) game.script.flags.push('depot-down');
  let warned = 0;
  for (let i = 0; i < sec / DT; i++) {
    step(game, idle, DT);
    warned += game.events.filter((event): event is Warned => event.kind === 'shellWarn').length;
  }
  return warned;
}

test('the depot makes the same seconds of shelling rarer', { timeout: 30000 }, () => {
  // 80 s of 5 s shells is sixteen, of 8 s shells ten
  const broken = shellCount(80, true);
  const whole = shellCount(80, false);
  expect(whole).toBeGreaterThanOrEqual(15);
  expect(whole / broken).toBeGreaterThan(1.4);
  expect(whole / broken).toBeLessThan(1.8);
});

// The answer is walked after the question: an area the mech passed before it does not answer it (SB-1820 review).
test('an area passed before the question does not answer it', () => {
  const state = newScript(M1);
  stepScript(state, M1, 0);
  scriptInput(state, M1, { kind: 'skip' });
  scriptInput(state, M1, { kind: 'ashore' });
  scriptInput(state, M1, { kind: 'enter', area: 'b-line' });
  scriptInput(state, M1, { kind: 'blast', id: 'l1-b' });
  scriptInput(state, M1, { kind: 'destroyed', target: 'pillbox-1' });
  scriptInput(state, M1, { kind: 'destroyed', target: 'pillbox-2' });
  scriptInput(state, M1, { kind: 'enter', area: 'fortress-approach' });
  scriptInput(state, M1, { kind: 'enter', area: 'depot-approach' });
  const asked = stepScript(state, M1, 10.1);
  expect(labels(asked)).toContain('flag:depot-asked');
  expect(labels(asked)).not.toContain('loss:1/1');
  expect(state.flags).not.toContain('fortress-skip');
  expect(state.flags).not.toContain('depot-taken');
  // walking in after the question answers it
  const go = scriptInput(state, M1, { kind: 'enter', area: 'depot-approach' });
  expect(labels(go)).toContain('flag:depot-taken');
});

test('the game: the mech that walked on before the question answers only by walking in again', () => {
  const game = newPlayGame(M1B_HAND);
  sendToScript(game, { kind: 'enter', area: 'b-line' });
  for (const id of ['pillbox-1', 'pillbox-2']) {
    const target = game.targets.find(item => item.id === id);
    if (!target) throw new Error(`the map has no ${id}`);
    target.hp = 0;
    sendToScript(game, { kind: 'destroyed', target: id });
  }
  game.enemies = [];
  game.mech.x = 0;
  game.mech.z = -60; // inside fortress-approach, two seconds into the ten
  for (let i = 0; i < 60 * 2; i++) step(game, idle, DT);
  expect(game.script.entered).toContain('fortress-approach');
  game.mech.z = 100; // and out again before the question
  game.barrages = [];
  for (let i = 0; i < 60 * 9; i++) step(game, idle, DT);
  const askedAt = game.script.fired['depot-ask'];
  expect(askedAt).toBeDefined();
  expect(game.script.fired['fortress-go']).toBeUndefined();
  expect(game.losses).toEqual({ allies: 0, squads: 0 });
  game.mech.z = -60;
  game.mech.x = 0;
  game.armor = MECH_TUNE.armor * 100;
  for (let i = 0; i < 3; i++) step(game, idle, DT);
  const wentAt = game.script.fired['fortress-go'];
  expect(wentAt).toBeDefined();
  expect((wentAt ?? 0) - (askedAt ?? 0)).toBeGreaterThan(0.5);
  expect(game.losses).toEqual({ allies: 1, squads: 1 });
});

// The depot may fall in the 10 s before the question: the leader does not ask, but the flag and the shelling still start.
test('a depot already down is not asked about', () => {
  const state = newScript(M1);
  stepScript(state, M1, 0);
  scriptInput(state, M1, { kind: 'skip' });
  scriptInput(state, M1, { kind: 'ashore' });
  scriptInput(state, M1, { kind: 'enter', area: 'b-line' });
  scriptInput(state, M1, { kind: 'blast', id: 'l1-b' });
  scriptInput(state, M1, { kind: 'destroyed', target: 'pillbox-1' });
  scriptInput(state, M1, { kind: 'destroyed', target: 'pillbox-2' });
  scriptInput(state, M1, { kind: 'destroyed', target: 'depot' });
  const asked = stepScript(state, M1, 10.1);
  expect(labels(asked)).toContain('flag:depot-asked');
  expect(asked.some(event => event.kind === 'spawn' && event.wave === 'shelling')).toBe(true);
  expect(asked.some(event => event.kind === 'radio')).toBe(false);
  // the gate waits for the question, so it is not stuck
  const gate = scriptInput(state, M1, { kind: 'enter', area: 'fortress-gate' });
  expect(gate.some(event => event.kind === 'checkpoint')).toBe(true);
});

test('the two answers’ areas do not overlap', () => {
  const depot = M1.areas['depot-approach'];
  const fortress = M1.areas['fortress-approach'];
  const overlapX = Math.abs(depot.x - fortress.x) < (depot.w + fortress.w) / 2;
  const overlapZ = Math.abs(depot.z - fortress.z) < (depot.d + fortress.d) / 2;
  expect(overlapX && overlapZ).toBe(false);
});
