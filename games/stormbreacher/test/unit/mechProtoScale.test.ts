import { expect, test } from 'vitest';
import * as THREE from 'three';
import { animateProtoMech, buildProtoMech, countProtoDraws, setProtoOpacity } from '../../src/view/mechProtoModel.ts';

// The size of the rest pose's boxes: the shapes are built from ratios of the height, so a taller mech is the same mech.
function sizeOf(root: THREE.Object3D): THREE.Vector3 {
  const box = new THREE.Box3();
  root.traverse(object => {
    const mesh = object as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh !== true) return;
    mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox!);
  });
  return box.getSize(new THREE.Vector3());
}

test('the sortie mech keeps its shape at 8 m: the same draws, and every size doubles', () => {
  const small = buildProtoMech(4);
  const tall = buildProtoMech(8);
  expect(countProtoDraws(tall)).toEqual(countProtoDraws(small));
  const a = sizeOf(small);
  const b = sizeOf(tall);
  for (const axis of ['x', 'y', 'z'] as const) {
    expect(Number.isFinite(b[axis])).toBe(true);
    expect(b[axis]).toBeCloseTo(a[axis] * 2, 3);
  }
  expect(a.y).toBeGreaterThan(3.5);
  expect(a.y).toBeLessThan(4.6);
});

test('the bones stay finite as the motion runs at 8 m, and the fade and the flame reach every material', () => {
  const mech = buildProtoMech(8);
  const input = { speed: 8, grounded: true, boosting: true, landSpeed: null, fired: true };
  for (let i = 0; i < 120; i++) animateProtoMech(mech, input, 1 / 60);
  mech.traverse(object => {
    if ((object as THREE.Bone).isBone !== true) return;
    expect(Number.isFinite(object.rotation.x) && Number.isFinite(object.position.y)).toBe(true);
  });
  const flames: THREE.Mesh[] = [];
  mech.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh === true && (mesh as THREE.SkinnedMesh).isSkinnedMesh !== true) flames.push(mesh);
  });
  expect(flames.length).toBeGreaterThan(0);
  expect(flames.every(flame => flame.visible)).toBe(true);
  setProtoOpacity(mech, 0.35);
  const materials = new Set<THREE.Material>();
  mech.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh === true) materials.add(mesh.material as THREE.Material);
  });
  expect([...materials].every(material => material.transparent && material.opacity <= 0.35)).toBe(true);
  setProtoOpacity(mech, 1);
  const solid = [...materials].filter(material => !flames.some(flame => flame.material === material));
  expect(solid.every(material => !material.transparent && material.opacity === 1)).toBe(true);
});
