import { expect, test } from 'vitest';
import { newAssist, stepAssist, type AssistFoe, type AssistState } from '../../src/logic/assist.ts';

const FROM = { x: 0, z: -68 };
const EVERY = 8;

function foe(id: string, wave: string, x: number, z: number, hp = 20, y = 0): AssistFoe {
  return { id, wave, hp, x, z, y };
}

// The state the game starts the assist with: the first shot comes one interval after the cue.
function started(waves: readonly string[]): AssistState {
  const state = newAssist(waves);
  state.left = EVERY;
  return state;
}

// Steps the assist for `seconds` in 1/60 s frames and gives back the enemy each shot picked, with the time it fired at.
function play(waves: readonly string[], enemies: AssistFoe[], seconds: number): { at: number; id: string }[] {
  const state = started(waves);
  const shots: { at: number; id: string }[] = [];
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    const shot = stepAssist(state, enemies, FROM, EVERY, dt);
    if (shot === null) continue;
    shots.push({ at: (i + 1) * dt, id: shot.id });
    // what the game does with the pick: the enemy is down from here on
    const enemy = enemies.find(entry => entry.id === shot.id);
    if (enemy) enemy.hp = 0;
  }
  return shots;
}

test('the assist takes the nearest living enemy of the waves it names, and the next nearest after that', () => {
  const state = started(['yard-1']);
  const enemies = [
    foe('yard-1-1', 'yard-1', -22, -95),
    foe('yard-1-2', 'yard-1', 0, -100),
    foe('yard-1-3', 'yard-1', 22, -95),
  ];
  // (0, -100) is 32.1 m from the gate and (-22, -95) is 35.3 m
  const first = stepAssist(state, enemies, FROM, EVERY, EVERY);
  expect(first).toEqual({ id: 'yard-1-2', x: 0, z: -100 });
  if (first) enemies[1].hp = 0;
  const second = stepAssist(state, enemies, FROM, EVERY, EVERY);
  expect(second).toEqual({ id: 'yard-1-1', x: -22, z: -95 });
  if (second) enemies[0].hp = 0;
  expect(stepAssist(state, enemies, FROM, EVERY, EVERY)).toEqual({ id: 'yard-1-3', x: 22, z: -95 });
});

test('an enemy of a wave the assist does not name, or one already down, is left alone', () => {
  const state = started(['yard-1']);
  const enemies = [
    foe('b-squad-1', 'b-squad', 0, -70),
    foe('yard-1-1', 'yard-1', 20, -90, 0),
    foe('yard-2-1', 'yard-2', 2, -80),
  ];
  expect(stepAssist(state, enemies, FROM, EVERY, EVERY)).toBeNull();
});

test('an enemy still falling in from a wall is not picked until it stands on the ground', () => {
  const state = started(['fortress-drop']);
  const falling = foe('fortress-drop-1', 'fortress-drop', 0, -70, 20, 7);
  expect(stepAssist(state, [falling], FROM, EVERY, EVERY)).toBeNull();
  expect(stepAssist(state, [{ ...falling, y: 0 }], FROM, EVERY, EVERY)).toEqual({
    id: 'fortress-drop-1',
    x: 0,
    z: -70,
  });
});

test('with nothing to shoot the assist gives back nothing, and the next shot comes an interval later', () => {
  const state = started(['yard-1']);
  expect(stepAssist(state, [], FROM, EVERY, EVERY)).toBeNull();
  expect(state.left).toBe(EVERY);
  expect(stepAssist(state, [], FROM, EVERY, EVERY / 2)).toBeNull();
  expect(state.left).toBe(EVERY / 2);
  expect(stepAssist(state, [], FROM, EVERY, EVERY / 2 + 1e-9)).toBeNull();
});

test('the assist shoots one enemy each interval, and no shot comes before it', () => {
  const enemies = [
    foe('yard-1-1', 'yard-1', -22, -95),
    foe('yard-1-2', 'yard-1', 0, -100),
    foe('yard-1-3', 'yard-1', 22, -95),
  ];
  const shots = play(['yard-1'], enemies, 24.5);
  expect(shots.map(shot => shot.id)).toEqual(['yard-1-2', 'yard-1-1', 'yard-1-3']);
  for (let i = 0; i < shots.length; i++) {
    expect(shots[i].at).toBeGreaterThanOrEqual((i + 1) * EVERY - 1e-9);
    expect(shots[i].at).toBeLessThan((i + 1) * EVERY + 0.1);
  }
});

test('the same state and enemies give the same shots twice', () => {
  const enemies = [
    foe('yard-1-1', 'yard-1', -22, -95),
    foe('yard-1-2', 'yard-1', 0, -100),
    foe('yard-1-3', 'yard-1', 22, -95),
  ];
  const one = play(['yard-1', 'yard-2'], structuredClone(enemies), 20);
  const two = play(['yard-1', 'yard-2'], structuredClone(enemies), 20);
  expect(two).toEqual(one);
});

test('the assist has no line of sight: it takes the nearest enemy on the ground, walls or not', () => {
  const state = started(['yard-1', 'yard-2']);
  const enemies = [foe('yard-2-1', 'yard-2', 10, -118), foe('yard-1-1', 'yard-1', 22, -95)];
  expect(stepAssist(state, enemies, FROM, EVERY, EVERY)?.id).toBe('yard-1-1');
});
