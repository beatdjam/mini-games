// The pillbox's model (SB-2050): one shape of 5,000 to 10,000 triangles that stays on the 12 x 6 x 8 m hit box, carries
// a vertex colour for every vertex, and is built the same every time.
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { TARGET_SIZE } from '../../src/data/props.ts';
import { pillboxGeometry } from '../../src/view/pillboxModel.ts';

test('the pillbox is 5,000 to 10,000 triangles and one shape', () => {
  const geometry = pillboxGeometry();
  const triangles = geometry.getAttribute('position').count / 3;
  expect(triangles).toBeGreaterThanOrEqual(5000);
  expect(triangles).toBeLessThanOrEqual(10000);
  expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
});

test('the pillbox stays within a few percent of the hit box, and is built the same each time', () => {
  const a = pillboxGeometry();
  const b = pillboxGeometry();
  expect(Array.from(a.getAttribute('position').array)).toEqual(Array.from(b.getAttribute('position').array));
  a.computeBoundingBox();
  const size = a.boundingBox?.getSize(new THREE.Vector3());
  const box = TARGET_SIZE.pillbox;
  expect(size?.x ?? 0).toBeGreaterThan(box.w * 0.97);
  expect(size?.x ?? 0).toBeLessThan(box.w * 1.03);
  expect(size?.y ?? 0).toBeGreaterThan(box.h * 0.97);
  expect(size?.y ?? 0).toBeLessThan(box.h * 1.03);
  expect(size?.z ?? 0).toBeGreaterThan(box.d * 0.97);
  expect(size?.z ?? 0).toBeLessThan(box.d * 1.04);
});
