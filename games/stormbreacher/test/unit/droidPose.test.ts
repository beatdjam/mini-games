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

// SB-2085: the close form carries the layered armour, round joints and the detailed rifle within 4,000 triangles; SB-2087
// keeps the far form light, under 860 for the crowd.
test('the close droid stays within its budget and the far one stays light', () => {
  const near = buildDroidGeometries('near');
  const far = buildDroidGeometries('far');
  const nearTriangles = triangles(near.body) + triangles(near.head);
  const farTriangles = triangles(far.body) + triangles(far.head);
  expect(nearTriangles).toBeGreaterThanOrEqual(3000);
  expect(nearTriangles).toBeLessThanOrEqual(4000);
  expect(farTriangles).toBeLessThanOrEqual(860);
});

// SB-2087: the head sits down to a 1.47 m top, and both forms show a long lit visor on a face in place of the white box.
test('both forms keep the 1.47 m head top and a long lit visor on the face', () => {
  for (const detail of ['near', 'far'] as const) {
    const { head } = buildDroidGeometries(detail);
    const positions = head.getAttribute('position');
    let top = -Infinity;
    for (let i = 0; i < positions.count; i++) top = Math.max(top, positions.getY(i));
    expect(Math.abs(DROID_TUNE.height - (SOLDIER_POSE.headY + top))).toBeLessThan(0.005);

    const face = DROID_PARTS[detail].head.filter(shape => shape.material === 'glow' && shape.at[2] < -0.1);
    expect(face.length).toBeGreaterThan(0);
    const visor = face.reduce((widest, shape) => ((shape.size?.[0] ?? 0) > (widest.size?.[0] ?? 0) ? shape : widest));
    expect(visor.size?.[0] ?? 0).toBeGreaterThan(visor.size?.[1] ?? 0);
  }
});

type Shape = (typeof DROID_PARTS)['near']['head'][number];

// The lowest and highest y a shape reaches, before any taper.
const bottomOf = (shape: Shape): number => shape.at[1] - (shape.size?.[1] ?? 0) / 2;
const topOf = (shape: Shape): number => shape.at[1] + (shape.size?.[1] ?? 0) / 2;

// SB-2087: the face is a dark plate with the visor set in front of it, and the white armour is the shell behind it.
test('the face is a dark plate in front of the white shell, with the visor inside its width', () => {
  for (const detail of ['near', 'far'] as const) {
    const head = DROID_PARTS[detail].head;
    const faces = head.filter(shape => shape.material === 'frame' && shape.size !== undefined && shape.at[2] < -0.1);
    expect(faces.length).toBeGreaterThan(0);
    const face = faces[0];
    const faceFront = face.at[2] - (face.size?.[2] ?? 0) / 2;
    const armor = head.filter(shape => shape.material === 'armor' && shape.size !== undefined);
    expect(armor.length).toBeGreaterThan(0);
    // no white shape reaches the face's front, so the face is never painted white
    for (const shape of armor) expect(shape.at[2] - (shape.size?.[2] ?? 0) / 2).toBeGreaterThan(faceFront);
    const visors = head.filter(shape => shape.material === 'glow' && shape.at[2] < faceFront + 0.02);
    expect(visors.length).toBeGreaterThan(0);
    for (const visor of visors) {
      expect(visor.at[2] - (visor.size?.[2] ?? 0) / 2).toBeLessThan(faceFront);
      expect((visor.size?.[0] ?? 0) / 2 + Math.abs(visor.at[0])).toBeLessThanOrEqual((face.size?.[0] ?? 0) / 2);
      expect(bottomOf(visor)).toBeGreaterThanOrEqual(bottomOf(face));
      expect(topOf(visor)).toBeLessThanOrEqual(topOf(face));
    }
  }
});

// SB-2087: the neck shows no longer than half the helmet shell's height, and is wide enough not to read as a thin pole.
test('the neck shows no longer than half the shell is tall and is wide against the head', () => {
  const headRise = SOLDIER_POSE.headY - SOLDIER_POSE.bodyY;
  for (const detail of ['near', 'far'] as const) {
    const { body, head } = DROID_PARTS[detail];
    const neck = body.find(shape => shape.at[0] === 0 && Math.abs(shape.at[1] - 0.575) < 1e-9);
    const collar = body.find(
      shape => shape.material === 'armor' && shape.at[0] === 0 && shape.at[1] > 0.5 && shape.at[1] < 0.57,
    );
    expect(neck).toBeDefined();
    expect(collar).toBeDefined();
    // the chest's top the neck comes out of: the top of the white collar
    const chestTop = collar ? topOf(collar) : 0;
    const core = head.filter(
      shape => shape.material === 'frame' && (shape.size?.[0] ?? 0) >= 0.15 && shape.at[2] > -0.1,
    );
    const headBottom = headRise + Math.min(...core.map(bottomOf));
    const armor = head.filter(shape => shape.material === 'armor' && shape.size !== undefined);
    const shellHeight = Math.max(...armor.map(topOf)) - Math.min(...armor.map(bottomOf));
    expect(headBottom - chestTop).toBeLessThanOrEqual(shellHeight * 0.5);
    const neckWidth = neck?.kind === 'tube' ? (neck.radius ?? 0) * 2 : (neck?.size?.[0] ?? 0);
    const headWidth = Math.max(...core.map(shape => shape.size?.[0] ?? 0));
    expect(neckWidth).toBeGreaterThanOrEqual(headWidth * 0.6);
  }
});

// SB-2087: the lit parts are the visor, not an extra point in front of it, and the head's shell is white.
test('the head has one lit visor in front and a white shell', () => {
  for (const detail of ['near', 'far'] as const) {
    const head = DROID_PARTS[detail].head;
    expect(head.filter(shape => shape.material === 'glow' && shape.at[2] < -0.1)).toHaveLength(1);
    expect(head.some(shape => shape.material === 'armor')).toBe(true);
  }
});

// SB-2085: the close form is for the soldiers within DROID_TUNE.nearDistance of the camera, and the far form for the rest.
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
