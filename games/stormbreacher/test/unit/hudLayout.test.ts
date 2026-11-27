// ?hud= picks the HUD's placement (SB-2150, D in SB-2155, E and F in SB-2159): a to f, a capital letter read as the
// same letter, anything else the default a.
import { expect, test } from 'vitest';
import { DEFAULT_HUD_LAYOUT, HUD_LAYOUTS, hudLayoutFrom } from '../../src/data/hudLayout.ts';

test('hudLayoutFrom reads ?hud=a|b|c|d|e|f and keeps a as the default', () => {
  expect(hudLayoutFrom('?hud=a')).toBe('a');
  expect(hudLayoutFrom('?hud=b')).toBe('b');
  expect(hudLayoutFrom('?hud=c')).toBe('c');
  expect(hudLayoutFrom('?hud=d')).toBe('d');
  expect(hudLayoutFrom('?hud=e')).toBe('e');
  expect(hudLayoutFrom('?hud=f')).toBe('f');
  expect(hudLayoutFrom('?hud=A')).toBe('a');
  expect(hudLayoutFrom('?hud=C')).toBe('c');
  expect(hudLayoutFrom('?hud=D')).toBe('d');
  expect(hudLayoutFrom('?hud=E')).toBe('e');
  expect(hudLayoutFrom('?hud=F')).toBe('f');
});

test('hudLayoutFrom falls back to a for a missing or unknown value', () => {
  expect(hudLayoutFrom('')).toBe('a');
  expect(hudLayoutFrom('?enemies=grunt:4')).toBe('a');
  expect(hudLayoutFrom('?hud=z')).toBe('a');
  expect(hudLayoutFrom('?hud=')).toBe('a');
});

test('the six placements are a to f, and a is the default', () => {
  expect(HUD_LAYOUTS).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  expect(DEFAULT_HUD_LAYOUT).toBe('a');
});
