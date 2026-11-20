import { expect, test } from 'vitest';
import * as THREE from 'three';
import { DROID_PARTS, DROID_TUNE, type DroidDetail } from '../../src/data/droids.ts';
import { SOLDIER_POSE } from '../../src/data/soldiers.ts';
import { buildDroidGeometries } from '../../src/view/droidModel.ts';
import { selectNearSoldiers, writeDroid, type DroidMeshes } from '../../src/view/droidPose.ts';

const CAPACITY = 2;

// The triangles a part's merged geometry holds (every shape is non-indexed).
function triangles(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  return (index === null ? geometry.getAttribute('position').count : index.count) / 3;
}

function droidMeshes(detail: DroidDetail = 'near'): DroidMeshes {
  const geometries = buildDroidGeometries(detail);
  const materials = [new THREE.MeshLambertMaterial(), new THREE.MeshBasicMaterial()];
  return {
    bodies: new THREE.InstancedMesh(geometries.body, materials, CAPACITY),
    heads: new THREE.InstancedMesh(geometries.head, materials, CAPACITY),
  };
}

// The lowest point a part's shape reaches once the pose's matrix is applied.
function lowestY(mesh: THREE.InstancedMesh, index: number): number {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  const positions = mesh.geometry.getAttribute('position');
  const vertex = new THREE.Vector3();
  let low = Infinity;
  for (let i = 0; i < positions.count; i++)
    low = Math.min(low, vertex.fromBufferAttribute(positions, i).applyMatrix4(matrix).y);
  return low;
}

// The middle of a part once the pose's matrix is applied.
function middleY(mesh: THREE.InstancedMesh, index: number): number {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  return new THREE.Vector3().setFromMatrixPosition(matrix).y;
}

test('a standing droid rests its soles on the ground', () => {
  const meshes = droidMeshes();
  writeDroid(meshes, 0, 2.5, 0.4, -7, 0.7, 0);
  expect(Math.abs(lowestY(meshes.bodies, 0) - 0.4)).toBeLessThan(0.001);
});

test('the far form rests its soles on the ground too', () => {
  const meshes = droidMeshes('far');
  writeDroid(meshes, 0, 2.5, 0.4, -7, 0.7, 0);
  expect(Math.abs(lowestY(meshes.bodies, 0) - 0.4)).toBeLessThan(0.001);
});

test('a waiting droid keeps its soles within a centimetre of the ground', () => {
  const meshes = droidMeshes();
  writeDroid(meshes, 0, 2.5, 0.4, -7, 0.7, 0, 1);
  expect(Math.abs(lowestY(meshes.bodies, 0) - 0.4)).toBeLessThan(0.01);
});

test('a fallen droid lies with its body at the dead height', () => {
  const meshes = droidMeshes();
  writeDroid(meshes, 0, 2.5, 0.4, -7, 0.7, 1);
  expect(Math.abs(middleY(meshes.bodies, 0) - (0.4 + SOLDIER_POSE.bodyDeadY))).toBeLessThan(0.001);
});

test('a fallen droid keeps the bottom of its head above the ground', () => {
  const meshes = droidMeshes();
  writeDroid(meshes, 0, 2.5, 0.4, -7, 0.7, 1);
  expect(lowestY(meshes.heads, 0)).toBeGreaterThanOrEqual(0.4);
});

test('the droid model builds a painted and a lit group for the body and the head in both forms', () => {
  for (const detail of ['near', 'far'] as const) {
    const { body, head } = buildDroidGeometries(detail);
    for (const part of [body, head]) {
      expect(part.groups.map(group => group.materialIndex)).toEqual([0, 1]);
      for (const group of part.groups) expect(group.count).toBeGreaterThan(0);
    }
  }
});

// SB-2085: the close form carries the layered armour, round joints and the detailed rifle within 4,000 triangles; the far
// form keeps 2084's 796 for the crowd.
test('the close droid stays within its budget and the far one keeps the old weight', () => {
  const near = buildDroidGeometries('near');
  const far = buildDroidGeometries('far');
  const nearTriangles = triangles(near.body) + triangles(near.head);
  const farTriangles = triangles(far.body) + triangles(far.head);
  expect(nearTriangles).toBeGreaterThanOrEqual(3000);
  expect(nearTriangles).toBeLessThanOrEqual(4000);
  expect(farTriangles).toBeLessThanOrEqual(796);
});

test('both forms put three lit eyes on the face', () => {
  for (const detail of ['near', 'far'] as const) {
    const eyes = DROID_PARTS[detail].head
      .filter(shape => shape.material === 'glow' && shape.at[2] < -0.1)
      .reduce((count, shape) => count + (shape.mirror === true ? 2 : 1), 0);
    expect(eyes).toBe(3);
  }
});

// SB-2085: the close form is for the soldiers within 25 m of the camera, and the far form for the rest.
test('a soldier inside the close distance takes the near form and one outside the far form', () => {
  const inside = { x: 10, z: 0 };
  const outside = { x: DROID_TUNE.nearDistance + 5, z: 0 };
  const near = selectNearSoldiers([inside, outside], { x: 0, y: 0, z: 0 });
  expect(near).toEqual([0]);
  const far = [0, 1].filter(index => !near.includes(index));
  expect(far).toEqual([1]);
});

test('past the cap the nearest soldiers take the close form, nearest first', () => {
  const soldiers = [
    { x: 10, z: 0 },
    { x: 1, z: 0 },
    { x: 5, z: 0 },
    { x: 0.5, z: 0 },
  ];
  expect(selectNearSoldiers(soldiers, { x: 0, y: 0, z: 0 }, DROID_TUNE.nearDistance, 2)).toEqual([3, 1]);
});
