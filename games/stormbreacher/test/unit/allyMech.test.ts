import { expect, test } from 'vitest';
import { allyDetailBoxes, type AllyShape } from '../../src/data/allies.ts';
import { buildAllyMech } from '../../src/view/allies.ts';
import { countMechDraws } from '../../src/view/mechModel.ts';

// The ally's detail boxes join the mech's colour meshes, so the model draws once per colour (6), however many boxes it
// has. A node test has no canvas: the paint is null and the material keeps the palette's colour alone.
const placedBoxes = (shape: AllyShape): number =>
  allyDetailBoxes(shape).reduce((count, box) => count + (box.mirror === 'xz' ? 4 : box.mirror === 'x' ? 2 : 1), 0);

test("the ally's draw calls are its colours' count (6), running or wrecked", () => {
  for (const shape of ['run', 'wreck'] as const) {
    expect(countMechDraws(buildAllyMech(shape)).calls).toBe(6);
  }
});

test('the ally keeps its own boxes: 8 boxes (13 placed) running, 6 (8 placed) wrecked', () => {
  expect(allyDetailBoxes('run')).toHaveLength(8);
  expect(placedBoxes('run')).toBe(13);
  expect(allyDetailBoxes('wreck')).toHaveLength(6);
  expect(placedBoxes('wreck')).toBe(8);
});
