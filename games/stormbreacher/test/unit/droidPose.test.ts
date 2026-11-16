import { expect, test } from 'vitest';
import * as THREE from 'three';
import { SOLDIER_POSE } from '../../src/data/soldiers.ts';
import { buildDroidGeometries } from '../../src/view/droidModel.ts';
import { writeDroid, type DroidMeshes } from '../../src/view/droidPose.ts';

const CAPACITY = 2;

function droidMeshes(): DroidMeshes {
  const geometries = buildDroidGeometries();
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

test('the droid model builds a painted and a lit group for the body and the head', () => {
  const { body, head } = buildDroidGeometries();
  for (const part of [body, head]) {
    expect(part.groups.map(group => group.materialIndex)).toEqual([0, 1]);
    for (const group of part.groups) expect(group.count).toBeGreaterThan(0);
  }
});
