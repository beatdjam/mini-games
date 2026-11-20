// #view-arena's ?enemies= list: a count is capped per kind, so a mistyped number cannot freeze the page.
import { expect, test } from 'vitest';
import { MAX_PER_KIND, mixOf } from '../../src/dev/arenaMix.ts';

test('?enemies= asks for no more than MAX_PER_KIND of one kind', () => {
  expect(MAX_PER_KIND).toBe(20);
  expect(mixOf('grunt:1000000')).toHaveLength(MAX_PER_KIND);
  expect(mixOf('grunt:20,assault:3')).toHaveLength(MAX_PER_KIND + 3);
  expect(mixOf('grunt:5')).toHaveLength(5);
});
