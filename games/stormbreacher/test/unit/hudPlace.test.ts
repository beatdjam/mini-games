// The screen places a following HUD part uses (SB-2150): ndc to px, and keeping the part inside the screen.
import { expect, test } from 'vitest';
import { keepInside, ndcToScreen } from '../../src/view/hudPlace.ts';

test('ndcToScreen maps the middle and the corners', () => {
  expect(ndcToScreen({ x: 0, y: 0 }, 1280, 720)).toEqual({ x: 640, y: 360 });
  expect(ndcToScreen({ x: -1, y: 1 }, 1280, 720)).toEqual({ x: 0, y: 0 });
  expect(ndcToScreen({ x: 1, y: 1 }, 1280, 720)).toEqual({ x: 1280, y: 0 });
  expect(ndcToScreen({ x: -1, y: -1 }, 1280, 720)).toEqual({ x: 0, y: 720 });
  expect(ndcToScreen({ x: 1, y: -1 }, 1280, 720)).toEqual({ x: 1280, y: 720 });
});

test('keepInside leaves a box already inside alone', () => {
  expect(keepInside({ x: 100, y: 120 }, 150, 24, { width: 1280, height: 720 }, 8)).toEqual({ x: 100, y: 120 });
});

test('keepInside pushes a box back from each edge by the margin', () => {
  expect(keepInside({ x: -20, y: 100 }, 150, 24, { width: 1280, height: 720 }, 8)).toEqual({ x: 8, y: 100 });
  expect(keepInside({ x: 100, y: -20 }, 150, 24, { width: 1280, height: 720 }, 8)).toEqual({ x: 100, y: 8 });
  expect(keepInside({ x: 1270, y: 700 }, 150, 24, { width: 1280, height: 720 }, 8)).toEqual({ x: 1122, y: 688 });
});

test('keepInside pins a box larger than the screen to the top left margin', () => {
  expect(keepInside({ x: 0, y: 0 }, 2000, 1000, { width: 1280, height: 720 }, 8)).toEqual({ x: 8, y: 8 });
});
