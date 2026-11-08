import { expect, test } from 'vitest';
import { DOOR_OPENINGS, STATIONS, courseBoxes } from '../../src/dev/course.ts';

const boxes = courseBoxes({ ceil: 18 });

test('the course has boxes with real sizes', () => {
  expect(boxes.length).toBeGreaterThan(0);
  for (const b of boxes) {
    expect(b.w).toBeGreaterThan(0);
    expect(b.d).toBeGreaterThan(0);
    expect(b.h).toBeGreaterThan(0);
  }
});

test('the door wall has three openings through it', () => {
  for (const opening of DOOR_OPENINGS) {
    const x = STATIONS.door.x + opening.x;
    const y = opening.h / 2;
    // a line along z through the opening's middle: no box may cover that x and y
    const hit = boxes.some(b => {
      const bottom = b.y ?? 0;
      return x > b.x - b.w / 2 && x < b.x + b.w / 2 && y > bottom && y < bottom + b.h;
    });
    expect(hit, `the ${opening.w} x ${opening.h} m opening is clear`).toBe(false);
  }
});

test('the hall ceiling starts at 18 m', () => {
  const ceilings = boxes.filter(b => b.kind === 'ceiling');
  expect(ceilings.length).toBeGreaterThan(0);
  for (const ceiling of ceilings) expect(ceiling.y).toBe(18);
});
