// The battery's pure functions (SB-200): a main gun shoots the mech by distance, line and interval, and a shutter opens
// once the targets it waits for are down.
import { expect, test } from 'vitest';
import { createRng } from '@engine/core/index.ts';
import { GUN_TUNE, M1_SHUTTERS } from '../../src/data/battery.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { newBattery, newShutters, openShutters, shuttered, stepGun } from '../../src/logic/battery.ts';
import type { Aabb } from '../../src/logic/fire.ts';

const DT = 1 / 60;
// a gun like the hand map's: 14 wide and deep, 8 high, at the origin
const GUN_BOX: Aabb = { minX: -7, maxX: 7, minY: 0, maxY: 8, minZ: -7, maxZ: 7 };
const NEAR = { x: 0, y: 0, z: 40 };
const FAR = { x: 0, y: 0, z: GUN_TUNE.range + 10 };

// Steps the gun for `seconds` and returns the times (s) it shot at.
function shotsOf(mech: { x: number; y: number; z: number }, blockers: Aabb[], seconds: number, seed = 1): number[] {
  const gun = { id: 'g', wait: GUN_TUNE.interval };
  const rng = createRng(seed);
  const at: number[] = [];
  for (let i = 1; i <= Math.round(seconds / DT); i++) {
    if (stepGun(gun, GUN_BOX, mech, blockers, DT, rng)) at.push(i * DT);
  }
  return at;
}

test('a gun shoots once an interval at a mech in range, with nothing between', () => {
  const at = shotsOf(NEAR, [], GUN_TUNE.interval * 3 + 0.1);
  expect(at).toHaveLength(3);
  at.forEach((time, i) => expect(time).toBeCloseTo(GUN_TUNE.interval * (i + 1), 1));
});

test('a gun does not shoot a mech past its range, and shoots when it comes in', () => {
  expect(shotsOf(FAR, [], GUN_TUNE.interval * 4)).toHaveLength(0);
  expect(shotsOf({ ...FAR, z: GUN_TUNE.range - 1 }, [], GUN_TUNE.interval + 0.1)).toHaveLength(1);
});

test('a gun holds fire while a box is between it and the mech', () => {
  const wall: Aabb = { minX: -20, maxX: 20, minY: 0, maxY: 30, minZ: 20, maxZ: 22 };
  expect(shotsOf(NEAR, [wall], GUN_TUNE.interval * 4)).toHaveLength(0);
  // a wall to the side does not
  const aside: Aabb = { ...wall, minX: 30, maxX: 60 };
  expect(shotsOf(NEAR, [aside], GUN_TUNE.interval + 0.1)).toHaveLength(1);
});

test('a shot leaves in front of the gun’s box, aimed at the mech within the spread', () => {
  const gun = { id: 'g', wait: 0 };
  const shot = stepGun(gun, GUN_BOX, NEAR, [], DT, createRng(3));
  if (!shot) throw new Error('the gun did not shoot');
  expect(shot.z).toBeGreaterThan(GUN_BOX.maxZ);
  expect(shot.y).toBeCloseTo(GUN_BOX.maxY * GUN_TUNE.muzzle);
  expect(Math.hypot(shot.dx, shot.dy, shot.dz)).toBeCloseTo(1);
  const want = { dx: NEAR.x - shot.x, dy: NEAR.y + MECH_TUNE.chestHeight - shot.y, dz: NEAR.z - shot.z };
  const len = Math.hypot(want.dx, want.dy, want.dz);
  const cos = (shot.dx * want.dx + shot.dy * want.dy + shot.dz * want.dz) / len;
  expect(Math.acos(Math.min(1, cos)) * (180 / Math.PI)).toBeLessThanOrEqual(GUN_TUNE.spread + 1e-6);
  expect(gun.wait).toBe(GUN_TUNE.interval);
});

test('the same seed aims the same shots', () => {
  const run = (): number[] => {
    const gun = { id: 'g', wait: 0 };
    const rng = createRng(5);
    const out: number[] = [];
    for (let i = 0; i < 200; i++) {
      const shot = stepGun(gun, GUN_BOX, NEAR, [], DT, rng);
      if (shot) out.push(shot.dx, shot.dy, shot.dz);
    }
    return out;
  };
  expect(run().length).toBeGreaterThan(6);
  expect(run()).toEqual(run());
});

test('a battery has a gun for each target of kind gun, all off', () => {
  const battery = newBattery([
    { id: 'main-gun-1', kind: 'gun' },
    { id: 'depot', kind: 'depot' },
    { id: 'main-gun-2', kind: 'gun' },
  ]);
  expect(battery.on).toBe(false);
  expect(battery.guns.map(gun => gun.id)).toEqual(['main-gun-1', 'main-gun-2']);
});

test('the magazine’s shutter is shut and opens only when both main guns are down', () => {
  expect(M1_SHUTTERS.map(def => [def.target, def.opensWhen])).toEqual([['magazine', ['main-gun-1', 'main-gun-2']]]);
  const shutters = newShutters(['main-gun-1', 'main-gun-2', 'magazine']);
  expect(shuttered(shutters, 'magazine')).toBe(true);
  expect(shuttered(shutters, 'main-gun-1')).toBe(false);
  expect(openShutters(shutters, id => (id === 'main-gun-1' ? 0 : 200))).toEqual([]);
  expect(shuttered(shutters, 'magazine')).toBe(true);
  expect(openShutters(shutters, () => 0)).toEqual(['magazine']);
  expect(shuttered(shutters, 'magazine')).toBe(false);
  // once open it is not reported again
  expect(openShutters(shutters, () => 0)).toEqual([]);
});

test('a map without the magazine has no shutter', () => {
  expect(newShutters(['main-gun-1'])).toEqual([]);
});
