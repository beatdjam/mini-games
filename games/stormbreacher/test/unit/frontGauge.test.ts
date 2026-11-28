// The front gauge's pure side (SB-2270): the places on the gauge, the sectors' fills and the mech's isolation.
import { expect, test } from 'vitest';
import { M1_SECTORS, SUPPORT_TUNE } from '../../src/data/sectors.ts';
import { GAUGE_TUNE } from '../../src/data/tune.ts';
import { gaugeRatio, gaugeSpan, isolation, sectorFills } from '../../src/logic/frontGauge.ts';
import type { SectorPhase } from '../../src/logic/sectors.ts';

const SPAN = gaugeSpan(M1_SECTORS);

test('gaugeRatio runs from the sea’s edge to the land side and clamps outside it', () => {
  expect(SPAN).toEqual({ fromZ: 170, toZ: -255 });
  expect(gaugeRatio(SPAN.fromZ, SPAN.fromZ, SPAN.toZ)).toBe(0);
  expect(gaugeRatio(SPAN.toZ, SPAN.fromZ, SPAN.toZ)).toBe(1);
  expect(gaugeRatio(-42.5, SPAN.fromZ, SPAN.toZ)).toBeCloseTo(0.5, 10);
  // past either end stays at that end
  expect(gaugeRatio(SPAN.fromZ + 100, SPAN.fromZ, SPAN.toZ)).toBe(0);
  expect(gaugeRatio(SPAN.toZ - 100, SPAN.fromZ, SPAN.toZ)).toBe(1);
});

test('sectorFills runs the eleven sectors front to back with their widths’ share of the front', () => {
  const fills = sectorFills(
    M1_SECTORS.map((): SectorPhase => 'idle'),
    M1_SECTORS,
  );
  expect(fills).toHaveLength(11);
  expect(fills[0].from).toBe(0);
  expect(fills[fills.length - 1].to).toBe(1);
  // the sectors touch, so the boundaries are the same places as the next sector's sea-side edge
  for (let i = 1; i < fills.length; i++) expect(fills[i].from).toBeCloseTo(fills[i - 1].to, 10);
  // the 41, 67, 73, 29, 15, 15, 30, 25, 50, 50 and 30 m of M1's front, as shares of its 425 m
  const widths = fills.map(fill => fill.to - fill.from);
  const shares = [41, 67, 73, 29, 15, 15, 30, 25, 50, 50, 30];
  for (const [i, metres] of shares.entries()) expect(widths[i]).toBeCloseTo(metres / 425, 10);
});

test('a sector fills as enemy land, secured or stable by its phase', () => {
  const phases: SectorPhase[] = M1_SECTORS.map(() => 'idle');
  phases[1] = 'advancing';
  phases[2] = 'counter';
  phases[3] = 'stable';
  expect(
    sectorFills(phases, M1_SECTORS)
      .map(fill => fill.fill)
      .slice(0, 4),
  ).toEqual(['enemy', 'enemy', 'secured', 'stable']);
  // 'secured' lasts less than a frame, but a test may set it
  const secured: SectorPhase[] = M1_SECTORS.map(() => 'idle');
  secured[0] = 'secured';
  expect(sectorFills(secured, M1_SECTORS)[0].fill).toBe('secured');
});

test('isolation switches at warnGap and isolatedGap, and is near seaward of the front', () => {
  // the isolated gap is the infantry's support fire's reach, so a change there moves both
  expect(GAUGE_TUNE.isolatedGap).toBe(SUPPORT_TUNE.range);
  const front = 100;
  expect(isolation(front, front, GAUGE_TUNE)).toBe('near');
  expect(isolation(front + 10, front, GAUGE_TUNE)).toBe('near');
  expect(isolation(front - (GAUGE_TUNE.warnGap - 0.1), front, GAUGE_TUNE)).toBe('near');
  expect(isolation(front - GAUGE_TUNE.warnGap, front, GAUGE_TUNE)).toBe('warn');
  expect(isolation(front - (GAUGE_TUNE.isolatedGap - 0.1), front, GAUGE_TUNE)).toBe('warn');
  expect(isolation(front - GAUGE_TUNE.isolatedGap, front, GAUGE_TUNE)).toBe('isolated');
  expect(isolation(front - GAUGE_TUNE.isolatedGap - 20, front, GAUGE_TUNE)).toBe('isolated');
});
