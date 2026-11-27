import { expect, test } from 'vitest';
import * as THREE from 'three';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { mechSeeThrough } from '../../src/view/mechFade.ts';
import { buildProtoMech, setProtoOpacity } from '../../src/view/mechProtoModel.ts';
import { cameraBoxesOfRect, screenRect } from '../../src/view/camera.ts';

test('cameraBoxesOfRect turns a rect into a box up to its top', () => {
  const withTop = cameraBoxesOfRect({ x: 0, z: 0, halfW: 2, halfD: 1, yaw: 0, top: 3 });
  expect(withTop[0].min.toArray()).toEqual([-2, 0, -1]);
  expect(withTop[0].max.toArray()).toEqual([2, 3, 1]);
  const open = cameraBoxesOfRect({ x: 0, z: 0, halfW: 2, halfD: 1, yaw: 0 });
  expect(open[0].min.y).toBe(0);
  expect(open[0].max.y).toBe(100);
});

test('cameraBoxesOfRect follows a ramp up in steps instead of filling the air over its low end', () => {
  const boxes = cameraBoxesOfRect({ x: 0, z: 0, halfW: 4, halfD: 9, yaw: 0, top: 6, ramp: true });
  expect(boxes.length).toBeGreaterThan(1);
  const low = boxes.filter(box => box.min.z >= 8);
  const high = boxes.filter(box => box.max.z <= -8);
  expect(low.length).toBeGreaterThan(0);
  expect(high.length).toBeGreaterThan(0);
  expect(Math.max(...low.map(box => box.max.y))).toBeLessThan(1);
  expect(Math.max(...high.map(box => box.max.y))).toBeCloseTo(6, 6);
});

// A camera at the origin looking down -z, on a 1000x500 screen (aspect 2, vertical fov 60).
function lookingDownZ(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(60, 2, 0.1, 1000);
  cam.updateMatrixWorld();
  return cam;
}

const aabb = (minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number) => ({
  minX,
  maxX,
  minY,
  maxY,
  minZ,
  maxZ,
});

test('a box in front of the camera gets a rectangle round it', () => {
  const rect = screenRect(aabb(-2, 2, -2, 2, -21, -19), lookingDownZ(), 1000, 500);
  if (!rect) throw new Error('the box is in view');
  expect(rect.left + rect.width / 2).toBeCloseTo(500, 6);
  expect(rect.top + rect.height / 2).toBeCloseTo(250, 6);
  expect(rect.width).toBeGreaterThan(0);
  expect(rect.height).toBeGreaterThan(0);
  expect(rect.width).toBeCloseTo(rect.height, 6); // a square of metres is a square of pixels
});

test('a box to the right lands on the right half of the screen', () => {
  const rect = screenRect(aabb(8, 10, -1, 1, -21, -19), lookingDownZ(), 1000, 500);
  if (!rect) throw new Error('the box is in view');
  expect(rect.left).toBeGreaterThan(500);
});

test('a box behind the camera has no rectangle', () => {
  expect(screenRect(aabb(-2, 2, -2, 2, 19, 21), lookingDownZ(), 1000, 500)).toBeNull();
});

test('a box with a corner behind the camera has no rectangle', () => {
  expect(screenRect(aabb(-2, 2, -2, 2, -10, 10), lookingDownZ(), 1000, 500)).toBeNull();
});

test('a box off the screen has no rectangle', () => {
  expect(screenRect(aabb(200, 202, -1, 1, -21, -19), lookingDownZ(), 1000, 500)).toBeNull();
});

test('a box that runs off the screen is cut to the screen', () => {
  const rect = screenRect(aabb(5, 200, -1, 1, -21, -19), lookingDownZ(), 1000, 500);
  if (!rect) throw new Error('the box is in view');
  expect(rect.left + rect.width).toBeCloseTo(1000, 6);
});

test('a camera nearer than fadeDist turns the mech see-through', () => {
  const mech = { x: 0, y: 0, z: 0 };
  const chestY = mech.y + MECH_TUNE.chestHeight;
  const open = new THREE.Vector3(mech.x, chestY, mech.z + MECH_TUNE.fadeDist + 1);
  expect(mechSeeThrough(open, mech)).toBe(false);

  const near = new THREE.Vector3(mech.x, chestY, mech.z + MECH_TUNE.fadeDist - 1);
  expect(mechSeeThrough(near, mech)).toBe(true);

  const model = buildProtoMech(MECH_TUNE.height);
  const opacityOf = (): number[] => {
    const list: number[] = [];
    model.traverse(object => {
      const mesh = object as THREE.SkinnedMesh;
      if (mesh.isSkinnedMesh === true) list.push((mesh.material as THREE.Material).opacity);
    });
    return list;
  };
  expect(opacityOf().every(opacity => opacity === 1)).toBe(true);
  setProtoOpacity(model, mechSeeThrough(near, mech) ? MECH_TUNE.fadeOpacity : 1);
  expect(opacityOf().every(opacity => opacity === MECH_TUNE.fadeOpacity)).toBe(true);
});
