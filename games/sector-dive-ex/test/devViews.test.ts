import { expect, test } from 'vitest';
import type { DevView } from '../src/dev/views/view.ts';
import { findDevView } from '../src/dev/views/view.ts';

const views: DevView[] = [
  { hash: '#view-', match: 'starts', name: 'a sector', run: () => {} },
  { hash: '#view-items', match: 'is', name: 'the things on the floor', run: () => {} },
  { hash: '#view-fx', match: 'starts', name: 'a weapon firing', run: () => {} },
  { hash: '#sfx', match: 'is', name: 'every sound effect', run: () => {} },
];

test('dev views: the longest hash that matches wins', () => {
  expect(findDevView(views, '#view-items')).toBe(views[1]);
});

test('dev views: a pose after a sector name is the plain sector view', () => {
  expect(findDevView(views, '#view-KWLN-b')).toBe(views[0]);
});

test('dev views: a longer start of a hash is chosen over a shorter one', () => {
  expect(findDevView(views, '#view-fx-rail')).toBe(views[2]);
});

test('dev views: an exact hash does not answer a longer one', () => {
  expect(findDevView(views, '#sfx')).toBe(views[3]);
  expect(findDevView(views, '#sfx1')).toBeNull();
});

test('dev views: the order of the table does not decide', () => {
  expect(findDevView([...views].reverse(), '#view-items')).toBe(views[1]);
  expect(findDevView([...views].reverse(), '#view-fx-rail')).toBe(views[2]);
});

test('dev views: a hash no view answers is null', () => {
  expect(findDevView(views, '#view')).toBeNull();
  expect(findDevView(views, '')).toBeNull();
});
