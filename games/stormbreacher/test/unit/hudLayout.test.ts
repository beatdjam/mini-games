// ?hud= picks the HUD's placement (SB-2150, D in SB-2155): a, b, c or d, a capital letter read as the same letter,
// anything else the default a.
import { expect, test } from 'vitest';
import { DEFAULT_HUD_LAYOUT, HUD_LAYOUTS, hudLayoutFrom } from '../../src/data/hudLayout.ts';

test('hudLayoutFrom reads ?hud=a|b|c|d and keeps a as the default', () => {
  expect(hudLayoutFrom('?hud=a')).toBe('a');
  expect(hudLayoutFrom('?hud=b')).toBe('b');
  expect(hudLayoutFrom('?hud=c')).toBe('c');
  expect(hudLayoutFrom('?hud=d')).toBe('d');
  expect(hudLayoutFrom('?hud=A')).toBe('a');
  expect(hudLayoutFrom('?hud=C')).toBe('c');
  expect(hudLayoutFrom('?hud=D')).toBe('d');
});

test('hudLayoutFrom falls back to a for a missing or unknown value', () => {
  expect(hudLayoutFrom('')).toBe('a');
  expect(hudLayoutFrom('?enemies=grunt:4')).toBe('a');
  expect(hudLayoutFrom('?hud=z')).toBe('a');
  expect(hudLayoutFrom('?hud=')).toBe('a');
});

test('the four placements are a, b, c and d, and a is the default', () => {
  expect(HUD_LAYOUTS).toEqual(['a', 'b', 'c', 'd']);
  expect(DEFAULT_HUD_LAYOUT).toBe('a');
});
