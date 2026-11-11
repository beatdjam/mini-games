import { expect, test } from 'vitest';
import { STATES } from '../../src/data/states.ts';

test('the state table lists every game state', () => {
  expect(Object.keys(STATES)).toEqual(['title', 'play', 'result']);
});
