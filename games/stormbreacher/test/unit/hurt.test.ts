import { expect, test } from 'vitest';
import { HURT_TUNE, type HurtTune } from '../../src/data/tune.ts';
import { armorLoss, hurtAngle, hurtBlast, hurtDamage, hurtEdge, hurtStep, type HurtView } from '../../src/view/hurt.ts';

// The parts of a built view the pure steps write to. The unit tests run without a page, so the elements are plain
// objects with the style fields the steps use.
function viewStub(): HurtView {
  const edges = Array.from({ length: 8 }, () => ({ style: { opacity: '' } }));
  const filterValues: Record<string, string> = {};
  return {
    root: null,
    edges,
    flash: { style: { opacity: '' } },
    armorTint: { style: { opacity: '' } },
    armorFilter: {
      style: {
        opacity: '',
        setProperty(name: string, value: string) {
          filterValues[name] = value;
        },
      },
      filterValues,
    },
    edgeLeft: Array.from({ length: 8 }, () => 0),
    flashLeft: 0,
    flashTop: 0,
    width: HURT_TUNE.edgeWidth,
    dark: -1,
    drain: -1,
    lit: Array.from({ length: 8 }, () => -1),
    white: -1,
  } as unknown as HurtView;
}

const filterOf = (view: HurtView): Record<string, string> =>
  (view.armorFilter as unknown as { filterValues: Record<string, string> }).filterValues;

// (fromX, fromZ) is the way from the mech toward the shot's source, as the `damaged` event carries it. The mech starts
// facing -z and its right is +x, so front is (0, -1), right (1, 0), back (0, 1) and left (-1, 0).
test('the edge direction is the way a shot came from, from the mech’s front and to the right', () => {
  expect(hurtAngle(0, -1, 0)).toBeCloseTo(0);
  expect(hurtAngle(1, 0, 0)).toBeCloseTo(90);
  expect(hurtAngle(0, 1, 0)).toBeCloseTo(180);
  expect(hurtAngle(-1, 0, 0)).toBeCloseTo(270);
});

test('the edge direction turns with the mech’s yaw', () => {
  const yaw = Math.PI / 2; // facing -x, so the right is -z and the left is +z
  expect(hurtAngle(-1, 0, yaw)).toBeCloseTo(0);
  expect(hurtAngle(0, -1, yaw)).toBeCloseTo(90);
  expect(hurtAngle(1, 0, yaw)).toBeCloseTo(180);
  expect(hurtAngle(0, 1, yaw)).toBeCloseTo(270);
});

test('the eight edges are centred on the front, the right, the back and the left', () => {
  expect(hurtEdge(0)).toBe(0);
  expect(hurtEdge(45)).toBe(1);
  expect(hurtEdge(90)).toBe(2);
  expect(hurtEdge(180)).toBe(4);
  expect(hurtEdge(270)).toBe(6);
  expect(hurtEdge(315)).toBe(7);
  expect(hurtEdge(350)).toBe(0);
  expect(hurtEdge(-90)).toBe(6);
});

test('the edge darkens only below the armour the table names, and most at no armour', () => {
  expect(armorLoss(HURT_TUNE.armorDarkFrom, HURT_TUNE)).toBe(0);
  expect(armorLoss(1, HURT_TUNE)).toBe(0);
  expect(armorLoss(0, HURT_TUNE)).toBe(1);
  expect(armorLoss(-1, HURT_TUNE)).toBe(1);
  // the table's values are read as they are: 0.4 down to 0.1 is 3/4 of the way to the darkest
  const tune: HurtTune = { ...HURT_TUNE, armorDarkFrom: 0.4 };
  expect(armorLoss(0.1, tune)).toBeCloseTo(0.75);
  // a table that starts at 0 has no in-between: only no armour at all is dark
  const none: HurtTune = { ...HURT_TUNE, armorDarkFrom: 0 };
  expect(armorLoss(0.5, none)).toBe(0);
  expect(armorLoss(0, none)).toBe(1);
});

test('a blast whites the screen only inside the table’s distance, and a nearer one wins', () => {
  const view = viewStub();
  hurtBlast(view, HURT_TUNE.flashNear, 0, { x: 0, z: 0 });
  expect(view.flashLeft).toBe(0);
  hurtBlast(view, HURT_TUNE.flashNear + 1, 0, { x: 0, z: 0 });
  expect(view.flashLeft).toBe(0);

  hurtBlast(view, HURT_TUNE.flashNear / 2, 0, { x: 0, z: 0 });
  expect(view.flashLeft).toBe(HURT_TUNE.flashFade);
  expect(view.flashTop).toBeCloseTo(HURT_TUNE.flashAlpha / 2);

  // a stronger blast replaces the white; a weaker one does not shorten or dim it
  hurtBlast(view, 0, 0, { x: 0, z: 0 });
  expect(view.flashTop).toBeCloseTo(HURT_TUNE.flashAlpha);
  hurtBlast(view, HURT_TUNE.flashNear / 2, 0, { x: 0, z: 0 });
  expect(view.flashTop).toBeCloseTo(HURT_TUNE.flashAlpha);
});

test('a hit on the same edge starts its fade again', () => {
  const view = viewStub();
  hurtDamage(view, 1, 0, 0);
  expect(view.edgeLeft[2]).toBe(HURT_TUNE.edgeFade);
  view.edgeLeft[2] = 0.1;
  hurtDamage(view, 1, 0, 0);
  expect(view.edgeLeft[2]).toBe(HURT_TUNE.edgeFade);
  // another direction is lit as well, not moved
  hurtDamage(view, 0, -1, 0);
  expect(view.edgeLeft[0]).toBe(HURT_TUNE.edgeFade);
  expect(view.edgeLeft[2]).toBe(HURT_TUNE.edgeFade);
});

test('the edge fades out over the table’s seconds, not over a number of frames', () => {
  const view = viewStub();
  hurtDamage(view, 1, 0, 0);
  hurtStep(view, HURT_TUNE.edgeFade / 2, 1);
  expect(Number(view.edges[2].style.opacity)).toBeCloseTo(HURT_TUNE.edgeAlpha / 2);
  expect(Number(view.edges[6].style.opacity)).toBe(0);
  hurtStep(view, HURT_TUNE.edgeFade / 2, 1);
  expect(Number(view.edges[2].style.opacity)).toBe(0);
});

test('the colour drain is on a layer of its own, so the armour’s darkness does not weaken it', () => {
  const view = viewStub();
  hurtStep(view, 0, 0); // no armour
  // the dark ring is at its strongest, but the layer that drains keeps opacity 1 and asks for the table's full drain
  expect(Number(view.armorTint.style.opacity)).toBeCloseTo(HURT_TUNE.armorDarkMax);
  expect((view.armorFilter.style as unknown as { opacity: string }).opacity).toBe('');
  expect(filterOf(view)['backdrop-filter']).toBe(`saturate(${1 - HURT_TUNE.armorDrain})`);
});
