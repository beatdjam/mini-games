// The beach's air after the review of SB-1440: the pools are built once, the grade belongs to a built map, the fires
// stay within the table's cap, a full pool drops a new part instead of taking a live one, a puff shrinks away before
// its life ends, and the air waits while the sortie is paused.
import * as THREE from 'three';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { runSystems } from '@engine/core/index.ts';
import { scene } from '@engine/render/index.ts';
import { ATMOSPHERE_FIRES, ATMOSPHERE_TUNE } from '../../src/data/atmosphere.ts';
import type { MapDef } from '../../src/data/types.ts';
import {
  atmosphereCounts,
  buildAtmosphere,
  burnAtmosphere,
  drawAtmosphere,
  freeOf,
  gradeFilterCss,
  plumeFade,
  removeAtmosphere,
} from '../../src/view/atmosphere.ts';

const BOUNDS = { minX: -120, maxX: 120, minZ: -170, maxZ: 190 };
const MAP: MapDef = { id: 'test', bounds: BOUNDS, props: [], targets: [], spawns: {} };
const MESH_NAMES = ['plume', 'flame', 'glow', 'haze'].map(kind => `sb-atmosphere-${kind}`);

function named(name: string): THREE.Object3D[] {
  const found: THREE.Object3D[] = [];
  scene.traverse(object => {
    if (object.name === name) found.push(object);
  });
  return found;
}

function plumeY(): number {
  const mesh = scene.getObjectByName('sb-atmosphere-plume');
  if (!(mesh instanceof THREE.InstancedMesh)) throw new Error('the scene has no plume pool');
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(0, matrix);
  return matrix.elements[13];
}

beforeEach(() => {
  removeAtmosphere();
});

afterEach(() => {
  removeAtmosphere();
});

test('building the air twice leaves one set of pools in the scene', () => {
  buildAtmosphere(MAP);
  buildAtmosphere(MAP);
  expect(named('sbAtmosphere')).toHaveLength(1);
  for (const name of MESH_NAMES) expect(named(name)).toHaveLength(1);
});

test('taking the air out leaves no group, pool or live part', () => {
  buildAtmosphere(MAP);
  burnAtmosphere(500, 500);
  drawAtmosphere(0.1);
  expect(atmosphereCounts().puffs).toBeGreaterThan(0);
  removeAtmosphere();
  expect(named('sbAtmosphere')).toHaveLength(0);
  for (const name of MESH_NAMES) expect(named(name)).toHaveLength(0);
  expect(atmosphereCounts()).toEqual({ puffs: 0, flames: 0, fires: 0 });
});

test('a pool takes the first dead slot and drops the new part when every slot is live', () => {
  expect(freeOf([{ live: true }, { live: false }, { live: true }], 0)).toBe(1);
  expect(freeOf([{ live: true }, { live: true }, { live: false }], 1)).toBe(2);
  expect(freeOf([{ live: false }], 0)).toBe(0);
  expect(freeOf([{ live: true }, { live: true }, { live: true }], 2)).toBe(-1);
});

test('the fires broken in play stay within burnFires and do not light the same place twice', () => {
  buildAtmosphere(MAP);
  for (let i = 0; i < 10; i++) burnAtmosphere(300 + i * 3, 0);
  expect(atmosphereCounts().fires).toBe(ATMOSPHERE_FIRES.length + ATMOSPHERE_TUNE.burnFires);

  buildAtmosphere(MAP);
  burnAtmosphere(500, 500);
  burnAtmosphere(500.5, 500.4);
  expect(atmosphereCounts().fires).toBe(ATMOSPHERE_FIRES.length + 1);
});

test('the steady columns and six fires broken in play never put more than plumeCap puffs on screen', () => {
  buildAtmosphere(MAP);
  for (let i = 0; i < 6; i++) burnAtmosphere(300 + i * 5, 0);
  let most = 0;
  for (let i = 0; i < 1400; i++) {
    drawAtmosphere(0.05);
    most = Math.max(most, atmosphereCounts().puffs);
  }
  expect(most).toBeLessThanOrEqual(ATMOSPHERE_TUNE.plumeCap);
  expect(atmosphereCounts().puffs).toBeLessThanOrEqual(ATMOSPHERE_TUNE.plumeCap);
});

test('a puff keeps its size until the last fifth and shrinks away by the end', () => {
  expect(plumeFade(0)).toBe(1);
  expect(plumeFade(0.8)).toBe(1);
  expect(plumeFade(0.9)).toBeCloseTo(0.5);
  expect(plumeFade(1)).toBe(0);
});

test('the grade is empty at 0 and names its three terms above it', () => {
  const kept = ATMOSPHERE_TUNE.grade;
  try {
    ATMOSPHERE_TUNE.grade = 0;
    expect(gradeFilterCss()).toBe('');
    ATMOSPHERE_TUNE.grade = 1;
    expect(gradeFilterCss()).toMatch(/saturate\(0\.84/);
    expect(gradeFilterCss()).toMatch(/contrast\(1\.14/);
    expect(gradeFilterCss()).toMatch(/sepia\(0\.1/);
  } finally {
    ATMOSPHERE_TUNE.grade = kept;
  }
});

test('the air moves in the sortie and the title but waits while the sortie is paused', () => {
  buildAtmosphere(MAP);
  runSystems(0, 'play');
  const atStart = plumeY();
  runSystems(1, 'paused');
  expect(plumeY()).toBe(atStart);
  runSystems(1, 'title');
  expect(plumeY()).toBeGreaterThan(atStart);
});
