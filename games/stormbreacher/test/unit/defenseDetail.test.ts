// The defence works and targets after SB-1470: every shape the shared surface materials draw carries a vertex colour,
// so a part with its own colour is not drawn black by the material's vertexColors. These read the built geometry, not
// the functions that fill it.
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { DEFENSE_DETAIL } from '../../src/data/defenses.ts';
import type { Prop, PropKind, TargetKind, TargetPlace } from '../../src/data/types.ts';
import { buildOutdoor, buildTargets, chamferBoxGeometry } from '../../src/view/outdoor.ts';

const KINDS: PropKind[] = [
  'hedgehog',
  'block',
  'bunker',
  'seawall',
  'cliff',
  'crater',
  'wreck',
  'lowWall',
  'stairs',
  'ramp',
];
const TARGETS: TargetKind[] = ['pillbox', 'depot', 'gun', 'magazine'];

function props(): Prop[] {
  return KINDS.map((kind, i) => ({ kind, x: i * 20, z: 0, yaw: 0, scale: 1 }));
}

function targets(): TargetPlace[] {
  return TARGETS.map((kind, i) => ({ id: `t${i}`, kind, x: i * 20, z: 40, yaw: 0 }));
}

function colorMatchesPosition(geometry: THREE.BufferGeometry): [number, number] {
  const at = geometry.getAttribute('position');
  const color = geometry.getAttribute('color');
  if (!(color instanceof THREE.BufferAttribute)) return [at.count, -1];
  return [at.count, color.count];
}

test('every prop shape carries a vertex colour for each of its positions', () => {
  const group = buildOutdoor(props(), { chunk: 0, chunkMin: 0 }).group;
  expect(group.children.length).toBe(KINDS.length);
  for (const mesh of group.children) {
    if (!(mesh instanceof THREE.InstancedMesh)) continue;
    const [positions, colors] = colorMatchesPosition(mesh.geometry);
    expect(colors, `${mesh.name} carries no colour`).toBe(positions);
  }
});

test('every target shape carries a vertex colour for each of its positions', () => {
  const group = buildTargets(targets());
  expect(group.children.length).toBe(TARGETS.length);
  for (const mesh of group.children) {
    if (!(mesh instanceof THREE.Mesh)) continue;
    const [positions, colors] = colorMatchesPosition(mesh.geometry);
    expect(colors, `${mesh.name} carries no colour`).toBe(positions);
  }
});

// The height of the flat face on the +x side: its vertices sit at the box's half width (the corners included).
function sideFaceHeight(geometry: THREE.BufferGeometry, halfWidth: number): number {
  const at = geometry.getAttribute('position');
  let low = Infinity;
  let high = -Infinity;
  for (let i = 0; i < at.count; i++) {
    if (Math.abs(at.getX(i) - halfWidth) > 1e-6) continue;
    low = Math.min(low, at.getY(i));
    high = Math.max(high, at.getY(i));
  }
  return high - low;
}

test('the bunker’s chamfer is cut back to fit the roof’s thickness, and the body keeps the table’s value', () => {
  const D = DEFENSE_DETAIL.bunker;
  // the roof is 0.8 m thick and the table's bevel is 0.55 m, more than half of it: without the cut-back the side face
  // is 0.002 m tall and the roof reads as a wedge; the cut-back to 0.24 of the thickness leaves 0.52 of it
  const roof = chamferBoxGeometry(D.roofW, D.roofH, D.roofD, D.bevel);
  roof.computeBoundingBox();
  const size = new THREE.Vector3();
  roof.boundingBox?.getSize(size);
  expect(size.x).toBeCloseTo(D.roofW, 6);
  expect(size.y).toBeCloseTo(D.roofH, 6);
  expect(size.z).toBeCloseTo(D.roofD, 6);
  expect(sideFaceHeight(roof, D.roofW / 2)).toBeCloseTo(D.roofH * 0.52, 6);
  // the body is big enough for the full 0.55 m bevel, so its shape does not change
  const body = chamferBoxGeometry(D.bodyW, D.bodyH, D.bodyD, D.bevel);
  expect(sideFaceHeight(body, D.bodyW / 2)).toBeCloseTo(D.bodyH - D.bevel * 2, 6);
});
