// The ground the overview camera shows (SB-2230): the view's four corners on the ground at a few screen aspects, the
// same corners through view/quarterCamera.ts' own ray, and the inside test with and without the margin.
import { expect, test } from 'vitest';
import { QUARTER_TUNE } from '../../src/data/tune.ts';
import { insideQuad, viewGround, type Quad } from '../../src/logic/viewGround.ts';
import { groundPoint, quarterPose } from '../../src/view/quarterCamera.ts';

const MECH = { x: 0, y: 0, z: 0 };
const NDC = [
  { x: -1, y: 1 },
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: -1 },
];

// The corners the hand calculation in the ticket gives, in the view's own order.
const EXPECTED: Record<string, readonly [number, number][]> = {
  '1.7777777777777777': [
    [-75.6, 8.4],
    [8.4, -75.6],
    [24.5, -7.9],
    [-7.9, 24.5],
  ],
  '2.3333333333333335': [
    [-88.7, 21.5],
    [21.5, -88.7],
    [29.6, -12.9],
    [-12.9, 29.6],
  ],
  '1': [
    [-57.2, -10],
    [-10, -57.2],
    [17.4, -0.8],
    [-0.8, 17.4],
  ],
};

test('the view cuts the ground at the corners the ticket works out', () => {
  for (const aspect of [1, 16 / 9, 21 / 9]) {
    const quad = viewGround(MECH, QUARTER_TUNE, aspect, 0);
    const expected = EXPECTED[String(aspect)];
    expect(expected, `aspect ${aspect}`).toBeDefined();
    quad.forEach((corner, i) => {
      expect(Math.abs(corner.x - expected[i][0]), `aspect ${aspect} corner ${i} x`).toBeLessThan(1);
      expect(Math.abs(corner.z - expected[i][1]), `aspect ${aspect} corner ${i} z`).toBeLessThan(1);
    });
  }
});

test('the view matches quarterCamera’s own ray, away from the origin too', () => {
  for (const feet of [MECH, { x: 13, y: 2.5, z: -7 }]) {
    const pose = quarterPose(feet, QUARTER_TUNE);
    const quad = viewGround(feet, QUARTER_TUNE, 16 / 9, 0);
    NDC.forEach((ndc, i) => {
      const theirs = groundPoint(pose, QUARTER_TUNE.fov, 16 / 9, ndc, feet.y);
      expect(theirs, `corner ${i}`).not.toBeNull();
      expect(Math.hypot(quad[i].x - theirs!.x, quad[i].z - theirs!.z), `corner ${i}`).toBeLessThan(1e-6);
    });
  }
});

test('a wider screen shows more ground', () => {
  const reach = (aspect: number) =>
    Math.max(...viewGround(MECH, QUARTER_TUNE, aspect, 0).map(q => Math.hypot(q.x, q.z)));
  expect(reach(21 / 9)).toBeGreaterThan(reach(16 / 9));
  expect(reach(16 / 9)).toBeGreaterThan(reach(1));
});

// The midpoint of a counterclockwise quad's side, moved `distance` outward.
function outsideOf(quad: Quad, side: number, distance: number): { x: number; z: number } {
  const a = quad[side];
  const b = quad[(side + 1) % quad.length];
  const ex = b.x - a.x;
  const ez = b.z - a.z;
  const len = Math.hypot(ex, ez);
  return {
    x: (a.x + b.x) / 2 + (ez / len) * distance,
    z: (a.z + b.z) / 2 + (-ex / len) * distance,
  };
}

test('insideQuad tells the inside, the outside and the margin apart', () => {
  const raw = viewGround(MECH, QUARTER_TUNE, 16 / 9, 0);
  const grown = viewGround(MECH, QUARTER_TUNE, 16 / 9, 8);
  const centroid = {
    x: raw.reduce((sum, q) => sum + q.x, 0) / raw.length,
    z: raw.reduce((sum, q) => sum + q.z, 0) / raw.length,
  };
  expect(insideQuad(raw, centroid.x, centroid.z)).toBe(true);
  expect(insideQuad(grown, centroid.x, centroid.z)).toBe(true);
  // 4 m outside a side is outside the raw quad but inside the one grown by 8 m; 12 m out is outside both
  const near = outsideOf(raw, 0, 4);
  expect(insideQuad(raw, near.x, near.z)).toBe(false);
  expect(insideQuad(grown, near.x, near.z)).toBe(true);
  const far = outsideOf(raw, 0, 12);
  expect(insideQuad(raw, far.x, far.z)).toBe(false);
  expect(insideQuad(grown, far.x, far.z)).toBe(false);
  // a corner itself counts as inside
  expect(insideQuad(raw, raw[0].x, raw[0].z)).toBe(true);
});

test('a corner above the horizon is put at the far limit, not left out', () => {
  const quad = viewGround(MECH, { ...QUARTER_TUNE, fov: 150 }, 16 / 9, 0);
  expect(quad).toHaveLength(4);
  for (const corner of quad) {
    expect(Number.isFinite(corner.x)).toBe(true);
    expect(Number.isFinite(corner.z)).toBe(true);
    expect(Math.hypot(corner.x, corner.z)).toBeLessThan(1000);
  }
});
