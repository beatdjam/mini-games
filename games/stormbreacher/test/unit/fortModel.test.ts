// The fortress's models (SB-2052): a wall piece of 1,000 to 3,000 triangles, the nest of 5,000 to 10,000, and the shutter's
// plate and its winding machine. Each is one shape that carries a vertex colour for every vertex, stays on its box, and is
// built the same every time.
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { M1_SHUTTERS } from '../../src/data/battery.ts';
import { PROP_SIZE, TARGET_SIZE } from '../../src/data/props.ts';
import { fortGunGeometry } from '../../src/view/fortGunModel.ts';
import { fortWallGeometry } from '../../src/view/fortWallModel.ts';
import { SHUTTER_HOUSING_HEIGHT, shutterHousingGeometry, shutterPlateGeometry } from '../../src/view/shutterModel.ts';

const triangles = (geometry: THREE.BufferGeometry): number => geometry.getAttribute('position').count / 3;

function sizeOf(geometry: THREE.BufferGeometry): { size: THREE.Vector3; box: THREE.Box3 } {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox ?? new THREE.Box3();
  return { size: box.getSize(new THREE.Vector3()), box };
}

test('a wall piece is 1,000 to 3,000 triangles, one shape with a colour on every vertex', () => {
  const geometry = fortWallGeometry();
  expect(triangles(geometry)).toBeGreaterThanOrEqual(1000);
  expect(triangles(geometry)).toBeLessThanOrEqual(3000);
  expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
});

test('a wall piece fills its 12 x 12 x 6 m box and is built the same each time', () => {
  const a = fortWallGeometry();
  const b = fortWallGeometry();
  expect(Array.from(a.getAttribute('position').array)).toEqual(Array.from(b.getAttribute('position').array));
  const { size } = sizeOf(a);
  const box = PROP_SIZE.fortWall;
  expect(size.x).toBeGreaterThan(box.w * 0.97);
  expect(size.x).toBeLessThan(box.w * 1.01);
  expect(size.y).toBeGreaterThan(box.h * 0.97);
  expect(size.y).toBeLessThan(box.h * 1.01);
  expect(size.z).toBeGreaterThan(box.d * 0.97);
  expect(size.z).toBeLessThan(box.d * 1.01);
});

test('the nest is 5,000 to 10,000 triangles and fills its 16 x 10 x 6 m box', () => {
  const geometry = fortGunGeometry();
  expect(triangles(geometry)).toBeGreaterThanOrEqual(5000);
  expect(triangles(geometry)).toBeLessThanOrEqual(10000);
  expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
  const { size } = sizeOf(geometry);
  const box = TARGET_SIZE.fortressGun;
  expect(size.x).toBeGreaterThan(box.w * 0.97);
  expect(size.x).toBeLessThan(box.w * 1.01);
  expect(size.y).toBeGreaterThan(box.h * 0.97);
  expect(size.y).toBeLessThan(box.h * 1.01);
  expect(size.z).toBeGreaterThan(box.d * 0.97);
  expect(size.z).toBeLessThan(box.d * 1.01);
  const again = fortGunGeometry();
  expect(Array.from(again.getAttribute('position').array)).toEqual(Array.from(geometry.getAttribute('position').array));
});

test('the guns of the nest end at the seaward face, at 0.7 of the box height', () => {
  const geometry = fortGunGeometry();
  const at = geometry.getAttribute('position');
  const box = TARGET_SIZE.fortressGun;
  let tip = -Infinity;
  let tipHeight = 0;
  for (let i = 0; i < at.count; i++) {
    // the guns: the parts of the nest above the deck's lip
    if (at.getY(i) > 5 && at.getZ(i) > tip) {
      tip = at.getZ(i);
      tipHeight = at.getY(i);
    }
  }
  expect(tip).toBeCloseTo(box.d / 2, 1);
  expect(Math.abs(tipHeight - box.h * 0.7)).toBeLessThan(1.2);
});

test('each shutter plate keeps the size the table gives and carries its colours, and its machine stands on the top edge', () => {
  for (const def of M1_SHUTTERS) {
    const plate = shutterPlateGeometry(def.w, def.h, def.d);
    expect(plate.getAttribute('color').count).toBe(plate.getAttribute('position').count);
    expect(triangles(plate)).toBeGreaterThan(1000);
    const { size, box } = sizeOf(plate);
    expect(size.y).toBeCloseTo(def.h, 1);
    expect(box.min.y).toBeCloseTo(-def.h / 2, 1);
    expect(size.x).toBeGreaterThanOrEqual(def.w);
    expect(size.x).toBeLessThan(def.w + 1);
    const housing = shutterHousingGeometry(def.w, def.d);
    expect(housing.getAttribute('color').count).toBe(housing.getAttribute('position').count);
    const machine = sizeOf(housing);
    expect(machine.box.min.y).toBeCloseTo(0, 2);
    expect(machine.box.max.y).toBeGreaterThanOrEqual(SHUTTER_HOUSING_HEIGHT);
    expect(machine.box.max.y).toBeLessThan(SHUTTER_HOUSING_HEIGHT + 1);
  }
});
