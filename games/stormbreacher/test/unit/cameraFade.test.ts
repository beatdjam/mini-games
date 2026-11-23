// Low props and the camera (SB-2048): a prop under CAMERA_TUNE.wallHeight between the camera and the mech does not pull the
// camera in, and turns see-through instead; a tall wall pulls the camera in as before.
import * as THREE from 'three';
import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { CAMERA_TUNE } from '../../src/data/tune.ts';
import type { MapDef, Prop } from '../../src/data/types.ts';
import { cameraBlockers } from '../../src/logic/mapShapes.ts';
import { cameraBoxesOfRect, cameraPose, followCamera, type CameraState } from '../../src/view/camera.ts';
import {
  addFadeProp,
  dropFade,
  fadeOpacityOf,
  fadeStep,
  lowRects,
  newFadeSet,
  type FadeSet,
} from '../../src/view/fade.ts';
import { buildOutdoor } from '../../src/view/outdoor.ts';
import { PROP_SIZE } from '../../src/data/props.ts';

const DT = 1 / 60;
const SETTLE = 90; // frames; the camera settles at its place
const MECH_Z = 0; // the mech stands at the origin facing -z, so the camera is behind it (+z)

const mapWith = (props: Prop[]): MapDef => ({
  ...M1B_HAND,
  bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
  props,
  targets: [],
  mines: [],
});

// The walls the camera gets for a map, and the boxes of its low props.
function split(map: MapDef): { walls: THREE.Box3[]; low: THREE.Box3[] } {
  const rects = cameraBlockers(map);
  const isLow = lowRects(map, rects.length, CAMERA_TUNE);
  const boxes = rects.map(cameraBoxesOfRect);
  return { walls: boxes.filter((_, i) => !isLow[i]).flat(), low: boxes.filter((_, i) => isLow[i]).flat() };
}

// The camera after SETTLE frames with the mech standing still, and the last pose.
function settle(walls: THREE.Box3[]): { dist: number; pulled: boolean; open: number; pos: THREE.Vector3 } {
  let state: CameraState | null = null;
  let last = cameraPose({ x: 0, y: 0, z: MECH_Z, yaw: 0 }, 0, CAMERA_TUNE, walls);
  for (let frame = 0; frame < SETTLE; frame++) {
    last = cameraPose({ x: 0, y: 0, z: MECH_Z, yaw: 0 }, 0, CAMERA_TUNE, walls);
    state = followCamera(state, last, DT, CAMERA_TUNE);
  }
  return { dist: last.dist, pulled: last.pulled, open: last.openDist, pos: state!.pos };
}

// A prop of `kind` between the mech and its camera (+z): its front face stands 3 m behind the mech.
const between = (kind: Prop['kind']): Prop => ({ kind, x: 0, z: MECH_Z + 3 + PROP_SIZE[kind].d / 2, yaw: 0, scale: 1 });

test('a low prop between the camera and the mech does not change the camera', () => {
  const open = settle(split(mapWith([])).walls);
  const crafts = split(mapWith([])).walls.length; // the landing crafts are always walls
  for (const kind of ['hedgehog', 'block', 'wreck', 'lowWall'] as const) {
    const { walls, low } = split(mapWith([between(kind)]));
    expect(low.length, kind).toBe(1);
    expect(walls.length, kind).toBe(crafts);
    const got = settle(walls);
    expect(got.pulled, kind).toBe(false);
    expect(got.dist, kind).toBeCloseTo(open.dist, 9);
    expect(got.pos.distanceTo(open.pos), kind).toBeLessThan(1e-9);
  }
});

test('a tall wall between them still pulls the camera in', () => {
  const open = settle(split(mapWith([])).walls);
  const crafts = split(mapWith([])).walls.length;
  for (const kind of ['fortWall', 'seawall', 'bunker', 'cliff'] as const) {
    const { walls, low } = split(mapWith([between(kind)]));
    expect(low.length, kind).toBe(0);
    expect(walls.length, kind).toBeGreaterThan(crafts);
    const got = settle(walls);
    expect(got.pulled, kind).toBe(true);
    expect(got.dist, kind).toBeLessThan(open.dist);
  }
});

test('the split follows the prop height including its scale', () => {
  // a seawall is 6 m: at 0.9 it falls under the line, a hedgehog at 2.1 times is 6.3 m and becomes a wall
  expect(PROP_SIZE.seawall.h * 0.9).toBeLessThan(CAMERA_TUNE.wallHeight);
  const small = split(mapWith([{ kind: 'seawall', x: 0, z: 4, yaw: 0, scale: 0.9 }]));
  expect(small.low.length).toBe(1);
  const big = split(mapWith([{ kind: 'hedgehog', x: 0, z: 4, yaw: 0, scale: 2.1 }]));
  expect(big.walls.length).toBe(split(mapWith([])).walls.length + 1);
  // a wallHeight of 0 makes every prop a wall, the way the camera was before
  expect(lowRects(mapWith([between('block')]), 1, { wallHeight: 0 })).toEqual([false]);
});

// The built props and the fade set over them.
function built(props: Prop[]): { fade: FadeSet; group: THREE.Group; lows: THREE.Box3[] } {
  const map = mapWith(props);
  const outdoor = buildOutdoor(props, { chunk: 32, chunkMin: 3000 });
  const fade = newFadeSet(outdoor.group, outdoor.slots);
  const rects = cameraBlockers(map);
  const isLow = lowRects(map, rects.length, CAMERA_TUNE);
  const lows: THREE.Box3[] = [];
  rects.forEach((rect, i) => {
    if (!isLow[i]) return;
    const box = cameraBoxesOfRect(rect)[0];
    lows.push(box);
    addFadeProp(fade, i, props[i], box);
  });
  return { fade, group: outdoor.group, lows };
}

const CAMERA = new THREE.Vector3(0, 3, 8);
const CHEST = new THREE.Vector3(0, 2, 0);
const ASIDE = new THREE.Vector3(30, 3, 8); // a camera that has the prop nowhere near the line to the chest

function run(fade: FadeSet, from: THREE.Vector3, seconds: number): void {
  for (let frame = 0; frame < Math.round(seconds / DT); frame++) fadeStep(fade, from, CHEST, DT, CAMERA_TUNE);
}

function copyOf(group: THREE.Group, kind: string, index: number): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  group.traverse(child => {
    if (child instanceof THREE.InstancedMesh && child.name === kind) child.getMatrixAt(index, matrix);
  });
  return matrix;
}

test('a prop between the camera and the mech fades to fadeOpacity, and comes back when the line is clear', () => {
  const { fade, group } = built([between('block'), { kind: 'block', x: 40, z: 0, yaw: 0, scale: 1 }]);
  const [hidden, clear] = fade.props;
  const before = copyOf(group, 'block', 0);
  run(fade, CAMERA, 1);
  expect(hidden.amount).toBe(1);
  expect(fadeOpacityOf(fade, hidden)).toBeCloseTo(CAMERA_TUNE.fadeOpacity, 6);
  expect(clear.amount).toBe(0);
  expect(fadeOpacityOf(fade, clear)).toBe(1);
  // the solid copy is shrunk to nothing where it stands, its twin is the one drawn
  expect(copyOf(group, 'block', 0).elements.slice(0, 3)).toEqual([0, 0, 0]);
  const twin = fade.ghosts.get('block');
  expect(twin?.mesh.visible).toBe(true);
  expect(twin?.mesh.material).toMatchObject({ transparent: true });
  run(fade, ASIDE, 1);
  expect(hidden.amount).toBe(0);
  expect(fadeOpacityOf(fade, hidden)).toBe(1);
  expect(copyOf(group, 'block', 0).equals(before)).toBe(true);
  expect(twin?.mesh.visible).toBe(false);
});

test('the fade is gradual, in both directions', () => {
  const { fade } = built([between('wreck')]);
  const [prop] = fade.props;
  const seen: number[] = [];
  for (let frame = 0; frame < 30; frame++) {
    fadeStep(fade, CAMERA, CHEST, DT, CAMERA_TUNE);
    seen.push(fadeOpacityOf(fade, prop));
  }
  expect(seen[0]).toBeGreaterThan(CAMERA_TUNE.fadeOpacity);
  expect(seen[0]).toBeLessThan(1);
  for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeLessThanOrEqual(seen[i - 1]);
  expect(seen[seen.length - 1]).toBeCloseTo(CAMERA_TUNE.fadeOpacity, 6);
  const back: number[] = [];
  for (let frame = 0; frame < 30; frame++) {
    fadeStep(fade, ASIDE, CHEST, DT, CAMERA_TUNE);
    back.push(fadeOpacityOf(fade, prop));
  }
  expect(back[0]).toBeLessThan(1);
  expect(back[back.length - 1]).toBe(1);
});

test('a camera that has gone inside a low prop fades it', () => {
  const { fade, lows } = built([between('block')]);
  const inside = lows[0].getCenter(new THREE.Vector3());
  run(fade, inside, 1);
  expect(fade.props[0].amount).toBe(1);
});

test('props of one kind share one twin, so the draws do not grow with the number that fade', () => {
  const props: Prop[] = [0, 1, 2, 3].map(i => ({ kind: 'hedgehog', x: i * 0.5 - 1, z: 4, yaw: 0, scale: 1 }) as Prop);
  const { fade, group } = built(props);
  run(fade, CAMERA, 1);
  expect(fade.props.every(item => item.amount === 1)).toBe(true);
  expect(fade.ghosts.size).toBe(1);
  let meshes = 0;
  group.traverse(child => {
    if (child instanceof THREE.InstancedMesh) meshes++;
  });
  // the hedgehogs' own mesh and the one twin
  expect(meshes).toBe(2);
});

test('a prop that breaks while it fades goes back to its place first', () => {
  const { fade, group } = built([between('block')]);
  const before = copyOf(group, 'block', 0);
  run(fade, CAMERA, 1);
  dropFade(fade, 0);
  expect(copyOf(group, 'block', 0).equals(before)).toBe(true);
  expect(fade.props.length).toBe(0);
  expect(fade.ghosts.get('block')?.mesh.visible).toBe(false);
});
