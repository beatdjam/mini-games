// The front's trickle (SB-2230): where it comes out, when it stops, and what it counts. The world here is the small
// one the function asks for, built by hand.
import { expect, test } from 'vitest';
import { ENEMIES, type EnemyKind } from '../../src/data/enemies.ts';
import { M1_SECTORS } from '../../src/data/sectors.ts';
import { TRICKLE_TUNE, TRICKLE_WAVE } from '../../src/data/trickle.ts';
import { QUARTER_TUNE } from '../../src/data/tune.ts';
import type { MapBounds } from '../../src/data/types.ts';
import { rectDistance, type GroundRect } from '../../src/logic/collide.ts';
import { seed, stream } from '../../src/logic/rng.ts';
import { newSectors, type SectorPhase } from '../../src/logic/sectors.ts';
import { frontSector, newTrickle, stepTrickle, type TrickleFoe, type TrickleWorld } from '../../src/logic/trickle.ts';
import { insideQuad, viewGround } from '../../src/logic/viewGround.ts';

const DT = 1 / 60;
const BEACH = M1_SECTORS[0];
const LINE1 = M1_SECTORS[1];
const BOUNDS: MapBounds = { minX: -100, maxX: 100, minZ: -300, maxZ: 170 };
const RADIUS = ENEMIES[TRICKLE_TUNE.kind].radius;

function stateWith(phases: readonly SectorPhase[]) {
  const state = newSectors();
  state.phase = [...phases];
  return state;
}

function foe(kind: EnemyKind, z: number, options: { wave?: string; hp?: number; dormant?: boolean } = {}): TrickleFoe {
  return {
    wave: options.wave ?? 'line1-hold',
    kind,
    z,
    hp: options.hp ?? ENEMIES[kind].hp,
    dormant: options.dormant ?? false,
  };
}

// A beach in the scripted enemies' hands: one nest is alive in the beach, which opens the idle window.
function world(options: Partial<TrickleWorld> = {}): TrickleWorld {
  return {
    mech: { x: 0, y: 0, z: 166 },
    enemies: [foe('emplacement', 147, { wave: 'b-emplacements' })],
    targets: [],
    rects: [],
    bounds: BOUNDS,
    sectors: stateWith(['idle', 'idle', 'idle', 'idle']),
    paused: false,
    ...options,
  };
}

// One frame with the wait run out, so a spawn may come now.
function spawnNow(w: TrickleWorld, state = newTrickle(M1_SECTORS.length)) {
  state.t = 0;
  return stepTrickle(state, w, stream('trickle'), DT);
}

test('the trickle comes out of sight, far from the mech, clear of the rects and inside the bounds', () => {
  const rects: GroundRect[] = [{ x: 20, z: 100, halfW: 8, halfD: 6, yaw: 0.3 }];
  const w = world({ rects });
  const sight = viewGround(w.mech, QUARTER_TUNE, TRICKLE_TUNE.viewAspect, 0);
  for (let n = 1; n <= 300; n++) {
    seed(n);
    const point = spawnNow(w);
    expect(point, `seed ${n}`).not.toBeNull();
    const { x, z } = point!;
    expect(insideQuad(sight, x, z), `seed ${n} in sight`).toBe(false);
    expect(Math.hypot(x - w.mech.x, z - w.mech.z), `seed ${n} too near`).toBeGreaterThanOrEqual(TRICKLE_TUNE.minDist);
    for (const rect of rects) expect(rectDistance(rect, x, z), `seed ${n} rect`).toBeGreaterThan(RADIUS);
    expect(x, `seed ${n} x`).toBeGreaterThanOrEqual(BOUNDS.minX + RADIUS);
    expect(x, `seed ${n} x`).toBeLessThanOrEqual(BOUNDS.maxX - RADIUS);
    expect(z, `seed ${n} z`).toBeGreaterThanOrEqual(BOUNDS.minZ + RADIUS);
    expect(z, `seed ${n} z`).toBeLessThanOrEqual(BOUNDS.maxZ - RADIUS);
  }
});

test('no point found spends nothing and waits retryT', () => {
  seed(1);
  // one great rect over the whole spawn band: nowhere is clear
  const w = world({ rects: [{ x: 0, z: 80, halfW: 500, halfD: 500, yaw: 0 }] });
  const state = newTrickle(M1_SECTORS.length);
  state.t = 0;
  expect(stepTrickle(state, w, stream('trickle'), DT)).toBeNull();
  expect(state.spent[0]).toBe(0);
  expect(state.t).toBe(TRICKLE_TUNE.retryT);
});

test('the living infantry is capped; nests, the mid boss and dormant soldiers are not counted', () => {
  const advancing = stateWith(['advancing', 'idle', 'idle', 'idle']);
  // eleven living riflemen fill the cap
  const full = world({
    sectors: advancing,
    enemies: Array.from({ length: TRICKLE_TUNE.maxAlive }, () => foe('grunt', 100)),
  });
  expect(spawnNow(full)).toBeNull();
  // ten riflemen, a nest, the boss and a dormant rifleman leave room for one
  const room = world({
    sectors: advancing,
    enemies: [
      ...Array.from({ length: TRICKLE_TUNE.maxAlive - 1 }, () => foe('grunt', 100)),
      foe('emplacement', 100),
      foe('warden', 100),
      foe('grunt', 100, { dormant: true }),
    ],
  });
  expect(spawnNow(room)).not.toBeNull();
});

test('the sector’s budget runs the trickle out', () => {
  seed(2);
  const w = world();
  const state = newTrickle(M1_SECTORS.length);
  let count = 0;
  for (let i = 0; i < BEACH.budget + 20; i++) if (spawnNow(w, state) !== null) count++;
  expect(count).toBe(BEACH.budget);
  expect(state.spent[0]).toBe(BEACH.budget);
  // time alone does not bring another
  for (let i = 0; i < 600; i++) expect(stepTrickle(state, w, stream('trickle'), DT)).toBeNull();
});

test('securing a sector stops its trickle and hands the next sector the front', () => {
  seed(3);
  const sectors = stateWith(['advancing', 'idle', 'idle', 'idle']);
  const w = world({ sectors, enemies: [foe('grunt', 100, { wave: 'line1-hold' })] });
  const state = newTrickle(M1_SECTORS.length);
  state.spent[0] = 3;
  sectors.phase[0] = 'secured';
  const point = spawnNow(w, state);
  expect(point).not.toBeNull();
  expect(point!.sector).toBe(1);
  expect(state.spent[0]).toBe(3); // the beach's budget is left as it was
  expect(state.spent[1]).toBe(1);
  expect(point!.z).toBeLessThanOrEqual(LINE1.landZ - TRICKLE_TUNE.spawnBack);
  expect(point!.z).toBeGreaterThanOrEqual(LINE1.landZ - TRICKLE_TUNE.spawnBack - TRICKLE_TUNE.spawnDepth);
});

test('with every sector secured nothing comes out', () => {
  const w = world({ sectors: stateWith(M1_SECTORS.map((): SectorPhase => 'stable')) });
  expect(spawnNow(w)).toBeNull();
});

test('while the front sector is idle the trickle only fills in behind its scripted enemies', () => {
  seed(4);
  const empty = world({ enemies: [] });
  expect(spawnNow(empty)).toBeNull();
  // an enemy beyond the beach, past its sea margin, does not open the window
  const elsewhere = world({ enemies: [foe('grunt', BEACH.seaZ + 20, { wave: 'line1-hold' })] });
  expect(spawnNow(elsewhere)).toBeNull();
  // one in the beach does
  const inside = world({ enemies: [foe('grunt', 140, { wave: 'b-emplacements' })] });
  expect(spawnNow(inside)).not.toBeNull();
  // while the sector is advancing the window does not apply
  const advancing = world({ enemies: [], sectors: stateWith(['advancing', 'idle', 'idle', 'idle']) });
  expect(spawnNow(advancing)).not.toBeNull();
});

test('nothing comes out while paused', () => {
  const w = world({ paused: true });
  const state = newTrickle(M1_SECTORS.length);
  state.t = 0;
  expect(stepTrickle(state, w, stream('trickle'), DT)).toBeNull();
  expect(state.spent[0]).toBe(0);
});

test('the wait after an enemy is the interval of the tune', () => {
  seed(5);
  const state = newTrickle(M1_SECTORS.length);
  const point = spawnNow(world(), state);
  expect(point).not.toBeNull();
  expect(state.t).toBeGreaterThanOrEqual(TRICKLE_TUNE.intervalMin);
  expect(state.t).toBeLessThanOrEqual(TRICKLE_TUNE.intervalMax);
});

test('the front is the first sector that is not yet secured', () => {
  expect(frontSector(['idle', 'idle', 'idle', 'idle'])).toBe(0);
  expect(frontSector(['stable', 'secured', 'counter', 'advancing'])).toBe(3);
  expect(frontSector(['secured', 'stable', 'stable', 'stable'])).toBeNull();
});

test('the trickle’s wave is not one the map or mission waves name', () => {
  expect(TRICKLE_WAVE).toBe('trickle');
});
