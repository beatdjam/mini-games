import { expect, test } from 'vitest';
import { reticleAt } from '../../src/view/hudParts.ts';

// The dot is placed as a share of the reticle's box: the cursor's normalized point (-1 to 1, + up), null at the centre.
test('reticleAt turns the cursor into percentages of the reticle box', () => {
  expect(reticleAt({ x: 1, y: 1 })).toEqual({ left: '100%', top: '0%' });
  expect(reticleAt({ x: -1, y: -1 })).toEqual({ left: '0%', top: '100%' });
  expect(reticleAt(null)).toEqual({ left: '50%', top: '50%' });
});
