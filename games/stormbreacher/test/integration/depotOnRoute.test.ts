// The depot on the way (SB-2046): there is no question and no penalty. Walking into the hollow brings the guard out, and
// breaking the depot eases the shelling; walking past it costs nothing, and the fortress gate opens either way.
import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { newPlayGame } from './playGame.ts';
import { sendToScript, step, type GameEvent, type GameInput } from '../../src/logic/game.ts';
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

// The script to cp1, then the 10 s after it (the shelling starts).
function toTheShelling(): ScriptState {
  const state = newScript(M1);
  stepScript(state, M1, 0);
  scriptInput(state, M1, { kind: 'skip' });
  scriptInput(state, M1, { kind: 'ashore' });
  scriptInput(state, M1, { kind: 'enter', area: 'b-line' });
  scriptInput(state, M1, { kind: 'blast', id: 'l1-b' });
  scriptInput(state, M1, { kind: 'destroyed', target: 'pillbox-1' });
  scriptInput(state, M1, { kind: 'destroyed', target: 'pillbox-2' });
  return state;
}

const labels = (outs: readonly ScriptOut[]): string[] =>
  outs.map(event => (event.kind === 'flag' ? `flag:${event.name}` : event.kind));

test('no question is asked: ten seconds after cp1 only the shelling starts', () => {
  const state = toTheShelling();
  const outs = stepScript(state, M1, 10.1);
  expect(outs.some(event => event.kind === 'spawn' && event.wave === 'shelling')).toBe(true);
  expect(outs.some(event => event.kind === 'radio')).toBe(false);
  expect(outs.some(event => event.kind === 'flag')).toBe(false);
  expect(state.fired['depot-ask']).toBeUndefined();
  expect(state.fired['depot-ask-radio']).toBeUndefined();
});

test('walking into the depot hollow brings the guard out and marks the depot, before or after the shelling starts', () => {
  for (const wait of [0, 10.1]) {
    const state = toTheShelling();
    if (wait > 0) stepScript(state, M1, wait);
    const go = scriptInput(state, M1, { kind: 'enter', area: 'depot-approach' });
    expect(go.some(event => event.kind === 'spawn' && event.wave === 'depot-guard')).toBe(true);
    expect(go.some(event => event.kind === 'map')).toBe(true);
  }
});

test('a depot already down brings no guard out', () => {
  const state = toTheShelling();
  scriptInput(state, M1, { kind: 'destroyed', target: 'depot' });
  const go = scriptInput(state, M1, { kind: 'enter', area: 'depot-approach' });
  expect(go.some(event => event.kind === 'spawn')).toBe(false);
});

test('breaking the depot raises its flag and the leader says so', () => {
  const state = toTheShelling();
  scriptInput(state, M1, { kind: 'enter', area: 'depot-approach' });
  const down = scriptInput(state, M1, { kind: 'destroyed', target: 'depot' });
  expect(labels(down)).toEqual(['flag:depot-down', 'radio']);
  expect(state.flags).toContain('depot-down');
});

test('walking past the depot costs nothing and the gate opens either way', () => {
  for (const depotDown of [false, true]) {
    const state = toTheShelling();
    if (depotDown) scriptInput(state, M1, { kind: 'destroyed', target: 'depot' });
    stepScript(state, M1, 10.1);
    const approach = scriptInput(state, M1, { kind: 'enter', area: 'fortress-approach' });
    // only the nest's wake-up flag (SB-2045)
    expect(labels(approach)).toEqual(['flag:fortress-gun-awake']);
    const gate = scriptInput(state, M1, { kind: 'enter', area: 'fortress-gate' });
    expect(gate.some(event => event.kind === 'checkpoint')).toBe(true);
  }
});

test('the gate opens even before the shelling starts', () => {
  const state = toTheShelling();
  const gate = scriptInput(state, M1, { kind: 'enter', area: 'fortress-gate' });
  expect(gate.some(event => event.kind === 'checkpoint')).toBe(true);
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
