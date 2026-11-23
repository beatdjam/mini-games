// The mid boss's own step: the phases and their telegraphs, the charge stopped by a wall, the armour's three sides, the
// three seconds of smoke and the one `down`.
import { expect, test } from 'vitest';
import { createRng } from '@engine/core/index.ts';
import { ENEMIES } from '../../src/data/enemies.ts';
import { WARDEN_TUNE } from '../../src/data/warden.ts';
import type { GroundRect } from '../../src/logic/collide.ts';
import { newEnemy, type EnemyState, type EnemyWorld } from '../../src/logic/enemies.ts';
import { newWarden, restartWarden, stepWarden, wardenDamageMul } from '../../src/logic/warden.ts';

const DT = 1 / 60;
const OPEN: EnemyWorld = {
  rects: [],
  propBoxes: [],
  bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 },
  nav: null,
  others: [],
};

// Within a frame of `want` seconds (a count of whole frames cannot be nearer than that).
const withinFrame = (seconds: number, want: number): void => {
  expect(Math.abs(seconds - want)).toBeLessThanOrEqual(DT + 1e-9);
};

const mechAt = (x: number, z: number): { x: number; y: number; z: number } => ({ x, y: 0, z });

function wardenAt(x = 0, z = -30): EnemyState {
  return newEnemy('warden-1', 'warden', 'warden', x, z);
}

test('a burst first telegraphs for burstTelegraph, then fires its shots interval apart', () => {
  const enemy = wardenAt();
  const state = enemy.warden;
  if (!state) throw new Error('the warden has no state');
  state.phase = 'burst';
  state.burstLeft = WARDEN_TUNE.burst.shots;
  state.timer = WARDEN_TUNE.burstTelegraph;
  const rng = createRng(3);
  const frames: number[] = [];
  for (let i = 0; i < Math.round(2 / DT) && frames.length < WARDEN_TUNE.burst.shots; i++) {
    const out = stepWarden(state, enemy, mechAt(0, 0), OPEN, DT, rng);
    for (let n = 0; n < out.shots.length; n++) frames.push(i);
  }
  expect(frames).toHaveLength(WARDEN_TUNE.burst.shots);
  // the first step already counted, so the first shot comes a frame short of the telegraph
  withinFrame((frames[0] + 1) * DT, WARDEN_TUNE.burstTelegraph);
  for (let i = 1; i < frames.length; i++) {
    withinFrame((frames[i] - frames[i - 1]) * DT, WARDEN_TUNE.burst.interval);
  }
  expect(state.burstLeft).toBe(0);
  expect(state.timer).toBeCloseTo(WARDEN_TUNE.burstRest, 6);
});

test('a charge crouches for charge.telegraph and then runs the way it faces', () => {
  const enemy = wardenAt(0, -30);
  enemy.yaw = Math.PI; // its front points at the mech at (0, 0)
  const state = enemy.warden;
  if (!state) throw new Error('the warden has no state');
  state.phase = 'charge';
  state.timer = WARDEN_TUNE.charge.telegraph;
  state.chargeLeft = WARDEN_TUNE.charge.distance;
  const start = enemy.z;
  const rng = createRng(1);
  let runFrame = -1;
  for (let i = 0; i < Math.round(1.5 / DT) && runFrame < 0; i++) {
    stepWarden(state, enemy, mechAt(0, 0), OPEN, DT, rng);
    if (enemy.z > start + 1e-6) runFrame = i;
  }
  expect(runFrame).toBeGreaterThanOrEqual(0);
  withinFrame((runFrame + 1) * DT, WARDEN_TUNE.charge.telegraph);
  // one frame of the run moves it by charge.speed * dt
  expect(enemy.z).toBeCloseTo(start + WARDEN_TUNE.charge.speed * DT, 3);
});

test('a wall stops the charge and exposes the back plate for charge.stagger seconds', () => {
  const wall: GroundRect = { x: 0, z: -20, halfW: 20, halfD: 1, yaw: 0, top: 6 };
  const world: EnemyWorld = { ...OPEN, rects: [wall] };
  const enemy = wardenAt(0, -30);
  enemy.yaw = Math.PI;
  const state = enemy.warden;
  if (!state) throw new Error('the warden has no state');
  state.phase = 'charge';
  state.timer = 0;
  state.chargeLeft = WARDEN_TUNE.charge.distance;
  const rng = createRng(1);
  let frames = 0;
  while (state.exposed === 0 && frames < Math.round(2 / DT)) {
    stepWarden(state, enemy, mechAt(0, 0), world, DT, rng);
    frames++;
  }
  expect(state.phase).toBe('stagger');
  expect(state.exposed).toBeCloseTo(WARDEN_TUNE.charge.stagger, 6);
  // it stays exposed for the full stagger, then chooses again
  for (let i = 0; i < Math.round(WARDEN_TUNE.charge.stagger / DT) - 1; i++) {
    stepWarden(state, enemy, mechAt(0, 0), world, DT, rng);
  }
  expect(state.exposed).toBeGreaterThan(0);
  for (let i = 0; i < 3 && String(state.phase) === 'stagger'; i++) {
    stepWarden(state, enemy, mechAt(0, 0), world, DT, rng);
  }
  expect(state.exposed).toBeLessThan(1e-9);
  expect(state.phase).not.toBe('stagger');
});

test('the armour takes a quarter from the front, the whole from the flank and double from behind', () => {
  // yaw 0 has its front toward -z, so a shot flying +z hits the front, one flying -z hits the back
  expect(wardenDamageMul(0, 0, 1, false)).toBe(WARDEN_TUNE.frontMul);
  expect(wardenDamageMul(0, 1, 0, false)).toBe(WARDEN_TUNE.sideMul);
  expect(wardenDamageMul(0, -1, 0, false)).toBe(WARDEN_TUNE.sideMul);
  expect(wardenDamageMul(0, 0, -1, false)).toBe(WARDEN_TUNE.backMul);
  // while it is exposed every side takes the back plate's share
  expect(wardenDamageMul(0, 0, 1, true)).toBe(WARDEN_TUNE.backMul);
  expect(wardenDamageMul(Math.PI, 0, -1, true)).toBe(WARDEN_TUNE.backMul);
});

test('the second phase brings the shoulder mortars, the first only charges', () => {
  const enemy = wardenAt();
  const state = enemy.warden;
  if (!state) throw new Error('the warden has no state');
  const atRest = (): void => {
    state.phase = 'burst';
    state.burstLeft = 0;
    state.timer = 0;
    state.mortarT = 0;
  };
  // over the halfway mark: a charge
  enemy.hp = ENEMIES.warden.hp * 0.6;
  atRest();
  stepWarden(state, enemy, mechAt(0, 0), OPEN, DT, createRng(1));
  expect(state.phase).toBe('charge');
  // at or under it: a mortar, whose shells all warn for the table's seconds
  enemy.hp = ENEMIES.warden.hp * WARDEN_TUNE.phase2At;
  atRest();
  stepWarden(state, enemy, mechAt(0, 0), OPEN, DT, createRng(1));
  expect(state.phase).toBe('mortar');
  let shells: ReturnType<typeof stepWarden>['shells'] = [];
  let landedAt = -1;
  for (let i = 0; i < Math.round((WARDEN_TUNE.burstTelegraph + 0.1) / DT); i++) {
    const out = stepWarden(state, enemy, mechAt(0, 0), OPEN, DT, createRng(1));
    if (out.shells.length > 0 && landedAt < 0) landedAt = i;
    shells = shells.concat(out.shells);
  }
  expect(shells).toHaveLength(WARDEN_TUNE.mortar.count);
  // the shells are put out once the shoulder light has shone for its telegraph; each warning ring then counts `warn`
  withinFrame((landedAt + 1) * DT, WARDEN_TUNE.burstTelegraph);
  for (const shell of shells) {
    expect(shell.warn).toBe(WARDEN_TUNE.mortar.warn);
    expect(shell.left).toBe(WARDEN_TUNE.mortar.warn);
    expect(shell.radius).toBe(WARDEN_TUNE.mortar.radius);
    expect(shell.damage).toBe(WARDEN_TUNE.mortar.damage);
  }
});

test('three seconds of smoke, then one `down` and nothing more', () => {
  const enemy = wardenAt();
  const state = enemy.warden;
  if (!state) throw new Error('the warden has no state');
  enemy.hp = 0;
  let downs = 0;
  let frames = 0;
  while (downs === 0 && frames < Math.round((WARDEN_TUNE.dieSec + 1) / DT)) {
    downs += stepWarden(state, enemy, mechAt(0, 0), OPEN, DT, createRng(1)).down ? 1 : 0;
    frames++;
    if (downs === 0) expect(state.phase).toBe('dying');
  }
  expect(downs).toBe(1);
  expect(frames * DT).toBeCloseTo(WARDEN_TUNE.dieSec, 1);
  for (let i = 0; i < 300; i++) {
    expect(stepWarden(state, enemy, mechAt(0, 0), OPEN, DT, createRng(1)).down).toBe(false);
  }
});

test('the same seed gives the same shots and the same state', () => {
  const play = (): { state: unknown; shots: number } => {
    const enemy = wardenAt();
    const state = enemy.warden;
    if (!state) throw new Error('the warden has no state');
    const rng = createRng(7);
    let shots = 0;
    for (let i = 0; i < Math.round(8 / DT); i++) {
      shots += stepWarden(state, enemy, mechAt(0, 0), OPEN, DT, rng).shots.length;
    }
    return { state, shots };
  };
  const first = play();
  const second = play();
  expect(second.shots).toBe(first.shots);
  expect(second.state).toEqual(first.state);
});

test('the burst’s damage lives only in ENEMIES.warden', () => {
  expect(ENEMIES.warden.damage).toBe(6);
  expect('damage' in WARDEN_TUNE.burst).toBe(false);
  expect(Object.keys(WARDEN_TUNE.burst).sort()).toEqual(['interval', 'shots']);
});

test('a new warden walks out without shooting for its walkOutSec', () => {
  const enemy = wardenAt();
  const state = newWarden();
  expect(state).toEqual({
    phase: 'walkout',
    timer: WARDEN_TUNE.walkOutSec,
    burstLeft: 0,
    chargeLeft: 0,
    exposed: 0,
    mortarT: 0,
    rammed: false,
    called: false,
    dying: 0,
  });
  let shots = 0;
  for (let i = 0; i < Math.round((WARDEN_TUNE.walkOutSec - 0.1) / DT); i++) {
    shots += stepWarden(state, enemy, mechAt(0, 0), OPEN, DT, createRng(1)).shots.length;
  }
  expect(shots).toBe(0);
  expect(state.phase).toBe('walkout');
});

test('a charge that meets the mech strikes it once, with the direction of the run', () => {
  const enemy = wardenAt(0, -30);
  enemy.yaw = Math.PI;
  const state = enemy.warden;
  if (!state) throw new Error('the warden has no state');
  state.phase = 'charge';
  state.timer = 0;
  state.chargeLeft = WARDEN_TUNE.charge.distance;
  const rng = createRng(1);
  const rams: { dx: number; dz: number }[] = [];
  for (let i = 0; i < Math.round(2 / DT); i++) {
    const out = stepWarden(state, enemy, mechAt(0, -10), OPEN, DT, rng);
    if (out.ram) rams.push(out.ram);
  }
  expect(rams).toHaveLength(1);
  expect(rams[0].dx).toBeCloseTo(0, 6);
  expect(rams[0].dz).toBeCloseTo(1, 6);
});

test('a charge that misses the mech strikes nothing', () => {
  const enemy = wardenAt(0, -30);
  enemy.yaw = Math.PI;
  const state = enemy.warden;
  if (!state) throw new Error('the warden has no state');
  state.phase = 'charge';
  state.timer = 0;
  state.chargeLeft = WARDEN_TUNE.charge.distance;
  const rng = createRng(1);
  for (let i = 0; i < Math.round(2 / DT); i++) {
    expect(stepWarden(state, enemy, mechAt(20, -10), OPEN, DT, rng).ram).toBeNull();
  }
});

test('restarting puts a half-done burst, charge, stagger or volley back to a rest, and leaves the walk-out and the fall', () => {
  for (const phase of ['burst', 'charge', 'stagger', 'mortar'] as const) {
    const state = newWarden();
    state.phase = phase;
    state.burstLeft = 2;
    state.chargeLeft = 9;
    state.exposed = 1;
    state.rammed = true;
    state.called = true;
    restartWarden(state);
    expect(state).toMatchObject({
      phase: 'burst',
      burstLeft: 0,
      timer: WARDEN_TUNE.burstRest,
      chargeLeft: 0,
      exposed: 0,
      mortarT: WARDEN_TUNE.mortarEvery,
      rammed: false,
      called: true,
    });
  }
  const walking = newWarden();
  restartWarden(walking);
  expect(walking).toEqual(newWarden());
  const dying = { ...newWarden(), phase: 'dying' as const, dying: 1.5 };
  restartWarden(dying);
  expect(dying).toMatchObject({ phase: 'dying', dying: 1.5 });
});
