// The beach's layout: the same seed makes the same beach, and the counts and the edges are the ones the table says.
import { expect, test } from 'vitest';
import { createRng } from '@engine/core/index.ts';
import { LAYOUT, outdoorLayout, type OutdoorItem, type OutdoorKind } from '../../src/dev/outdoor/layout.ts';

function countByKind(items: OutdoorItem[]): Record<OutdoorKind, number> {
  const counts: Record<OutdoorKind, number> = {
    tile: 0,
    hedgehog: 0,
    block: 0,
    bunker: 0,
    seawall: 0,
    cliff: 0,
  };
  for (const item of items) counts[item.kind]++;
  return counts;
}

test('the same seed makes the same beach', () => {
  const first = outdoorLayout(createRng(7), 1);
  const second = outdoorLayout(createRng(7), 1);
  expect(second).toEqual(first);
});

test('density 1 puts the table’s count of each kind on the beach', () => {
  const counts = countByKind(outdoorLayout(createRng(7), 1));
  expect(counts.tile).toBe(LAYOUT.tile.count);
  expect(counts.hedgehog).toBe(600);
  expect(counts.block).toBe(300);
  expect(counts.bunker).toBe(20);
  expect(counts.seawall).toBe(50);
  expect(counts.cliff).toBe(40);
  expect(counts.tile).toBe(10_000);
});

test('density 0.5 halves the obstacles, not the ground or the seawall', () => {
  const counts = countByKind(outdoorLayout(createRng(7), 0.5));
  expect(counts.hedgehog).toBe(300);
  expect(counts.tile).toBe(10_000);
  expect(counts.seawall).toBe(50);
});

test('everything stands on the 400 x 400 m beach', () => {
  for (const item of outdoorLayout(createRng(7), 1)) {
    expect(item.x).toBeGreaterThanOrEqual(-200);
    expect(item.x).toBeLessThanOrEqual(200);
    expect(item.z).toBeGreaterThanOrEqual(-200);
    expect(item.z).toBeLessThanOrEqual(200);
  }
});
