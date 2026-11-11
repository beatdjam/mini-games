// The breakable props after chunkInstances has remade the matrices: a prop is found by its kind and its place, and
// breaking it rewrites one matrix in place, with no new mesh.
import * as THREE from 'three';
import { expect, test } from 'vitest';
import type { Prop } from '../../src/data/types.ts';
import {
  BROKEN_SCALE_Y,
  breakPropSlot,
  buildOutdoor,
  type OutdoorBuild,
  type PropSlot,
} from '../../src/view/outdoor.ts';

// 100 hedgehogs on a 10 x 10 grid from x -90..90 and z -50..40, all the same size.
function grid(): Prop[] {
  const items: Prop[] = [];
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      items.push({ kind: 'hedgehog', x: -90 + col * 20, z: -50 + row * 10, yaw: 0, scale: 1 });
    }
  }
  return items;
}

function build(): OutdoorBuild {
  const items = grid();
  items[0].breakable = true;
  items[99].breakable = true;
  return buildOutdoor(items, { chunk: 32, chunkMin: 3000 });
}

function instancedMeshes(group: THREE.Group): THREE.InstancedMesh[] {
  const meshes: THREE.InstancedMesh[] = [];
  group.traverse(child => {
    if (child instanceof THREE.InstancedMesh) meshes.push(child);
  });
  return meshes;
}

function matrixAt(slot: PropSlot): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  slot.mesh.getMatrixAt(slot.index, matrix);
  return matrix;
}

test('every breakable prop has a slot after the chunks are made', () => {
  const built = build();
  expect(built.slots.size).toBe(2);
  for (const [prop, slot] of built.slots) {
    const at = new THREE.Vector3().setFromMatrixPosition(matrixAt(slot));
    expect(Math.abs(at.x - prop.x)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(at.z - prop.z)).toBeLessThanOrEqual(0.01);
  }
});

test('breaking a slot lowers only that copy and adds no mesh', () => {
  const built = build();
  const meshes = instancedMeshes(built.group).length;
  const [first, second] = [...built.slots.values()];
  breakPropSlot(first);
  expect(instancedMeshes(built.group)).toHaveLength(meshes);
  const height = (slot: PropSlot): number => {
    const at = new THREE.Vector3(),
      turn = new THREE.Quaternion(),
      size = new THREE.Vector3();
    matrixAt(slot).decompose(at, turn, size);
    return size.y;
  };
  expect(height(first)).toBeCloseTo(BROKEN_SCALE_Y, 6);
  expect(height(second)).toBeCloseTo(1, 6);
});
