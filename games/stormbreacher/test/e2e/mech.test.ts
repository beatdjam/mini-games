import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { CORES, MECH_COLORS, PARTS, WEAPON_LOOK, type MechBox } from '../../src/data/mech.ts';
import { PATTERN_IDS, PATTERNS, type PatternId } from '../../src/dev/mech/patterns.ts';
import { showMech } from '../../src/dev/views/mech.ts';
import { buildMechVisual, countMechDraws } from '../../src/view/mechModel.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

let savedUrl = '';

beforeAll(async () => {
  await page.viewport(1280, 720);
  savedUrl = location.href;
});

beforeEach(() => {
  document.getElementById('sbMechBar')?.remove();
});

afterAll(() => {
  history.replaceState(null, '', savedUrl);
});

const boxesOf = (id: PatternId): MechBox[] => {
  const build = PATTERNS[id].build;
  return [
    ...PARTS.legs[build.legs].boxes,
    ...CORES[build.core].boxes,
    ...PARTS.arms[build.arms].boxes,
    ...PARTS.back[build.back].boxes,
    ...PARTS.fcs[build.fcs].boxes,
    ...WEAPON_LOOK[build.main],
    ...WEAPON_LOOK[build.sub],
  ];
};

const boxCount = (boxes: readonly MechBox[]): number =>
  boxes.reduce((count, box) => count + (box.mirror === 'xz' ? 4 : box.mirror === 'x' ? 2 : 1), 0);

const colorCount = (boxes: readonly MechBox[]): number => new Set(boxes.map(box => box.color)).size;

const report = () =>
  JSON.parse(window.sbMechReport!()) as {
    pattern: string;
    spin: boolean;
    view: string;
    mech: { calls: number; triangles: number; boxes: number; weight: number };
    frame: { calls: number; triangles: number };
  };

test('a mech draws one call per colour it uses', () => {
  for (const id of PATTERN_IDS) {
    const boxes = boxesOf(id);
    const draws = countMechDraws(buildMechVisual(PATTERNS[id], 4));
    expect(draws.calls).toBe(colorCount(boxes));
    expect(draws.calls).toBeLessThanOrEqual(MECH_COLORS.length);
    expect(draws.triangles).toBe(12 * boxCount(boxes));
  }
});

test('all colours share one box geometry', () => {
  for (const id of PATTERN_IDS) {
    const geometries = new Set<THREE.BufferGeometry>();
    let meshes = 0;
    buildMechVisual(PATTERNS[id], 4).traverse(object => {
      const mesh = object as THREE.InstancedMesh;
      if (mesh.isInstancedMesh === true) {
        meshes++;
        geometries.add(mesh.geometry);
      }
    });
    expect(meshes).toBeGreaterThan(1);
    expect(geometries.size).toBe(1);
  }
});

test('the view opens, and number keys and buttons change the look', () => {
  const params = new URLSearchParams(location.search);
  params.set('pattern', 'b');
  params.delete('spin');
  params.delete('view');
  history.replaceState(null, '', `${location.pathname}?${params.toString()}${location.hash}`);
  showMech('#view-mech');
  expect(report().pattern).toBe('b');

  document.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }));
  expect(report().pattern).toBe('c');
  expect(new URLSearchParams(location.search).get('pattern')).toBe('c');

  document.dispatchEvent(new KeyboardEvent('keydown', { key: '4' }));
  expect(report().pattern).toBe('d');
  expect(new URLSearchParams(location.search).get('pattern')).toBe('d');

  const buttons = [...document.querySelectorAll<HTMLButtonElement>('#sbMechBar button')];
  const spin = buttons.find(node => node.textContent === '回転');
  const behind = buttons.find(node => node.textContent === '後ろから');
  if (!spin || !behind) throw new Error('missing #sbMechBar buttons');
  expect(report().spin).toBe(true);
  spin.click();
  expect(report().spin).toBe(false);
  expect(report().view).toBe('spin');
  behind.click();
  expect(report().view).toBe('behind');
});

test('the report counts the mech and the frame', () => {
  const params = new URLSearchParams(location.search);
  params.set('pattern', 'a');
  history.replaceState(null, '', `${location.pathname}?${params.toString()}${location.hash}`);
  showMech('#view-mech');
  const seen = report();
  expect(seen.mech.calls).toBeGreaterThan(0);
  expect(seen.mech.triangles).toBeGreaterThan(0);
  expect(seen.mech.boxes).toBeGreaterThan(0);
  expect(seen.mech.weight).toBeGreaterThan(0);
  expect(typeof seen.frame.calls).toBe('number');
  expect(typeof seen.frame.triangles).toBe('number');
});
