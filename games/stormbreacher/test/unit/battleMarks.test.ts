// The look of the infantry's being under fire (SB-2272), as the pure functions of view/battleMarks.ts: the mark turns
// from amber to red with the soldier's health, keeps the tune's size, and a second hit inside sparkGap does not spark.
import { expect, test } from 'vitest';
import { FEEDBACK_COLOR } from '../../src/data/colors.ts';
import { FEEDBACK_TUNE } from '../../src/data/tune.ts';
import { markColor, markSize, sparkReady } from '../../src/view/battleMarks.ts';

function green(color: number): number {
  return (color >> 8) & 0xff;
}

test('a full soldier’s mark is amber and turns to red as its health falls', () => {
  expect(markColor(1)).toBe(FEEDBACK_COLOR.mark);
  expect(markColor(FEEDBACK_TUNE.markRedShare)).toBe(FEEDBACK_COLOR.markHit);
  expect(markColor(0)).toBe(FEEDBACK_COLOR.markHit);
  // a soldier that is only aimed at keeps the whole health and so the amber
  expect(markColor(1)).toBe(FEEDBACK_COLOR.mark);
});

test('the mark’s colour moves one way with the health share', () => {
  const shares = [FEEDBACK_TUNE.markRedShare, 0.6, 0.7, 0.8, 0.9, 1];
  const greens = shares.map(share => green(markColor(share)));
  for (let i = 1; i < greens.length; i++) expect(greens[i]).toBeGreaterThan(greens[i - 1]);
});

test('the mark is the size the tune asks for', () => {
  expect(markSize()).toBe(FEEDBACK_TUNE.markSize);
});

test('a second spark inside sparkGap is held back', () => {
  expect(sparkReady(null, 10)).toBe(true);
  expect(sparkReady(10, 10)).toBe(false);
  expect(sparkReady(10, 10 + FEEDBACK_TUNE.sparkGap / 2)).toBe(false);
  expect(sparkReady(10, 10 + FEEDBACK_TUNE.sparkGap)).toBe(true);
});
