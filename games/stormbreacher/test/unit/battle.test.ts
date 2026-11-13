import { expect, test } from 'vitest';
import { createRng } from '@engine/core/index.ts';
import { BATTLE_TUNE, FX_TUNE, PLAY_BATTLE_TUNE, type FxTune } from '../../src/data/tune.ts';
import { newBattle, stepBattle, type BattleState } from '../../src/logic/battle.ts';
import { MAX_SOLDIERS } from '../../src/logic/crowd.ts';

const BOUNDS = { minX: -100, maxX: 100, minZ: -170, maxZ: 170 };
const MECH = { x: 0, z: 150 };
const DT = 1 / 60;

function tuneWith(changes: Partial<FxTune>): FxTune {
  return { ...FX_TUNE, ...changes };
}

// Runs the battle for `seconds`; gives back the state and the time of each shell.
function run(
  seed: number,
  seconds: number,
  tune: FxTune,
): { state: BattleState; shells: { t: number; x: number; z: number }[] } {
  const rng = createRng(seed);
  const state = newBattle(rng, BOUNDS, tune);
  const shells: { t: number; x: number; z: number }[] = [];
  for (let i = 1; i <= Math.round(seconds / DT); i++) {
    const frame = stepBattle(state, rng, DT, tune, MECH);
    if (frame.shell !== null) shells.push({ t: i * DT, x: frame.shell.x, z: frame.shell.z });
  }
  return { state, shells };
}

test('the same seed gives the same walkers and the same shells', () => {
  const a = run(7, 30, FX_TUNE);
  const b = run(7, 30, FX_TUNE);
  expect(a.shells.length).toBeGreaterThan(0);
  expect(a.shells).toEqual(b.shells);
  expect(a.state.crowd.soldiers).toEqual(b.state.crowd.soldiers);
  expect(run(8, 30, FX_TUNE).shells).not.toEqual(a.shells);
});

test('the main sortie puts out 20 allies a wave, in squads, and #view-fx keeps 300', () => {
  expect(PLAY_BATTLE_TUNE.allies).toBe(BATTLE_TUNE.allies);
  expect(BATTLE_TUNE.allies).toBe(20);
  expect(PLAY_BATTLE_TUNE.allyWaves).toBe(10);
  expect(PLAY_BATTLE_TUNE.allySpeed).toBe(3.5);
  expect(PLAY_BATTLE_TUNE.squads).toBe(BATTLE_TUNE.squads);
  expect(BATTLE_TUNE.squads).toBe(2);
  expect(PLAY_BATTLE_TUNE.squad).toBe(BATTLE_TUNE.squad);
  expect(BATTLE_TUNE.squad).toBe(5);
  expect(FX_TUNE.allies).toBe(300);
  expect(BATTLE_TUNE.allies).toBeLessThan(FX_TUNE.allies);
});

test('#view-fx brings its wave in scattered, with no squad and no nest to fall at', () => {
  const state = newBattle(createRng(1), BOUNDS, FX_TUNE, null, [{ x: 0, z: 147 }]);
  expect(state.crowd.soldiers).toHaveLength(FX_TUNE.allies);
  expect(state.crowd.soldiers.every(soldier => soldier.squad === 0 && soldier.fallAt === null)).toBe(true);
});

test('the first wave is tune.allies strong, and the first shell comes half an interval in', () => {
  const state = newBattle(createRng(1), BOUNDS, FX_TUNE);
  expect(state.crowd.soldiers).toHaveLength(FX_TUNE.allies);
  expect(state.crowd.waveT).toBe(FX_TUNE.allyWaves);
  const { shells } = run(1, 12, tuneWith({ allyDeathRate: 0 }));
  expect(shells[0].t).toBeCloseTo(FX_TUNE.shellEvery / 2, 1);
});

test('shells come every tune.shellEvery and fall between shellNear and shellFar of the mech', () => {
  const { shells } = run(3, 64, FX_TUNE);
  expect(shells).toHaveLength(6);
  for (let i = 1; i < shells.length; i++) expect(shells[i].t - shells[i - 1].t).toBeCloseTo(FX_TUNE.shellEvery, 1);
  for (const shell of shells) {
    const dist = Math.hypot(shell.x - MECH.x, shell.z - MECH.z);
    expect(dist).toBeGreaterThanOrEqual(FX_TUNE.shellNear - 1e-6);
    expect(dist).toBeLessThanOrEqual(FX_TUNE.shellFar + 1e-6);
  }
});

test('with shellEvery 0 no shell falls', () => {
  expect(run(3, 30, tuneWith({ shellEvery: 0 })).shells).toHaveLength(0);
});

test('a near shell shakes as much as shellShake says, a far one less', () => {
  const rng = createRng(2);
  const near = tuneWith({ shellNear: 5, shellFar: 5, shellEvery: 1 });
  const stateNear = newBattle(rng, BOUNDS, near);
  stateNear.shellT = 0;
  expect(stepBattle(stateNear, rng, DT, near, MECH).shell?.shake).toBeCloseTo(near.shellShake);
  const far = tuneWith({ shellNear: 50, shellFar: 50, shellEvery: 1 });
  const stateFar = newBattle(rng, BOUNDS, far);
  stateFar.shellT = 0;
  expect(stepBattle(stateFar, rng, DT, far, MECH).shell?.shake).toBeCloseTo((far.shellShake * 10) / 50);
});

test('the walkers never pass MAX_SOLDIERS, however long the battle goes', () => {
  const tune = tuneWith({ allies: 900, allyWaves: 0.5, allyDeathRate: 0 });
  const rng = createRng(4);
  const state = newBattle(rng, BOUNDS, tune);
  for (let i = 0; i < 60 * 20; i++) {
    stepBattle(state, rng, DT, tune, MECH);
    expect(state.crowd.soldiers.length).toBeLessThanOrEqual(MAX_SOLDIERS);
  }
});

test("a shell takes the soldiers near it into the frame's fallen, and #view-fx keeps them up", () => {
  const tune = tuneWith({
    allyDeathRate: 0,
    allyWaves: 0,
    allySpeed: 0,
    shellEvery: 1,
    shellNear: 5,
    shellFar: 5,
    shellFallRadius: 40,
    shellFallShare: 1,
  });
  const rng = createRng(6);
  const state = newBattle(rng, BOUNDS, tune);
  // the wave stands around the mech, inside the shell's circle
  for (const soldier of state.crowd.soldiers) {
    soldier.x = MECH.x;
    soldier.z = MECH.z;
  }
  let fell = 0;
  for (let i = 0; i < 60 * 2; i++) fell += stepBattle(state, rng, DT, tune, MECH).fell.length;
  expect(fell).toBeGreaterThan(0);

  const quiet = tuneWith({
    allyDeathRate: 0,
    allyWaves: 0,
    allySpeed: 0,
    shellEvery: 1,
    shellNear: 5,
    shellFar: 5,
    shellFallRadius: 0,
    shellFallShare: 1,
  });
  const quietRng = createRng(6);
  const quietState = newBattle(quietRng, BOUNDS, quiet);
  for (const soldier of quietState.crowd.soldiers) {
    soldier.x = MECH.x;
    soldier.z = MECH.z;
  }
  let keptUp = 0;
  for (let i = 0; i < 60 * 2; i++) keptUp += stepBattle(quietState, quietRng, DT, quiet, MECH).fell.length;
  expect(keptUp).toBe(0);
});

test('a battle made with a holdZ keeps the walkers there while held, and lets them go after', () => {
  const tune = tuneWith({ allyDeathRate: 0, allyWaves: 0, allySpeed: 10, shellEvery: 0 });
  const rng = createRng(5);
  const state = newBattle(rng, BOUNDS, tune, -6);
  expect(state.crowd.holdZ).toBe(-6);
  // 20 s walks the 176 m from the sea edge to the line at 10 m/s
  for (let i = 0; i < 60 * 20; i++) stepBattle(state, rng, DT, tune, MECH, true);
  expect(state.crowd.through).toBe(0);
  for (const soldier of state.crowd.soldiers) expect(soldier.z).toBeGreaterThanOrEqual(-6);

  for (let i = 0; i < 60 * 30; i++) stepBattle(state, rng, DT, tune, MECH, false);
  expect(state.crowd.through).toBe(tune.allies);
});
