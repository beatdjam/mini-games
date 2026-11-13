import { expect, test } from 'vitest';
import { rng, seed, stream } from '../../src/logic/rng.ts';

// the first values of a generator: what a seed must give again
const first = (n: number): number[] => {
  seed(7);
  const r = rng();
  return Array.from({ length: n }, () => r.next());
};

test('the seed makes the same sequence', () => {
  const a = first(3);
  const b = first(3);
  expect(a).toEqual(b);
});

test('a stream gets a different sequence from the seed', () => {
  seed(7);
  const fromStream = stream('field').next();
  const fromMain = rng().next();
  expect(fromStream).not.toBe(fromMain);
});

test('the allyFx stream gets its own sequence', () => {
  seed(7);
  const fromAllyFx = stream('allyFx').next();
  seed(7);
  const fromField = stream('field').next();
  expect(fromAllyFx).not.toBe(fromField);
});
