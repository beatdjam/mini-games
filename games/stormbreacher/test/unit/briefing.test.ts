import { expect, test } from 'vitest';
import { LANG } from '@engine/core/index.ts';
import {
  BRIEFING_TARGET_SYMBOL,
  BRIEFING_TUNE,
  M1_BRIEFING,
  M1_BRIEFING_SQUAD_WAVE,
  M1_BRIEFING_WAVE_PATH,
} from '../../src/data/briefings.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import { TARGET_KINDS } from '../../src/data/types.ts';
import { briefingMap, linesOut, nextLineAt, symbolState } from '../../src/logic/briefing.ts';
import '../../src/i18n/ja.ts';
import '../../src/i18n/en.ts';

const path = M1.paths[M1_BRIEFING_WAVE_PATH] ?? [];
const map = briefingMap(M1B_HAND, path);

test('every briefing line has text in ja and en', () => {
  for (const code of ['ja', 'en']) {
    const ui = LANG[code].ui;
    for (const line of M1_BRIEFING) expect(ui[line.key], `${code} is missing "${line.key}"`).toBeTruthy();
  }
});

test('the lines start at 0 and come later and later, and one cycle is about 15 s', () => {
  expect(M1_BRIEFING[0]?.at).toBe(0);
  for (let i = 1; i < M1_BRIEFING.length; i++) {
    expect(M1_BRIEFING[i]?.at).toBeGreaterThan(M1_BRIEFING[i - 1]?.at ?? Infinity);
  }
  const last = M1_BRIEFING[M1_BRIEFING.length - 1];
  expect((last?.at ?? 0) + BRIEFING_TUNE.holdSec).toBeGreaterThanOrEqual(13);
  expect((last?.at ?? 0) + BRIEFING_TUNE.holdSec).toBeLessThanOrEqual(17);
});

test('every symbol a line shows is on the map, and every mark is shown by some line', () => {
  const onMap = new Set(map.marks.map(mark => mark.symbol));
  const shown = new Set(M1_BRIEFING.flatMap(line => line.show));
  for (const symbol of shown) expect(onMap.has(symbol), symbol).toBe(true);
  for (const symbol of onMap) expect(shown.has(symbol), symbol).toBe(true);
});

test("the sites are the map's targets, one for one, where the targets are", () => {
  const sites = map.marks.filter(mark => mark.shape === 'site');
  expect(sites).toHaveLength(M1B_HAND.targets.length);
  for (const kind of TARGET_KINDS) {
    const targets = M1B_HAND.targets.filter(target => target.kind === kind);
    const marks = sites.filter(mark => mark.target === kind);
    expect(marks.map(mark => mark.points[0])).toEqual(targets.map(target => ({ x: target.x, z: target.z })));
    for (const mark of marks) expect(mark.symbol).toBe(BRIEFING_TARGET_SYMBOL[kind]);
  }
  // every pillbox of the map is marked, the depot's guard (pillbox-3) too, and there is the one depot
  expect(sites.filter(mark => mark.target === 'pillbox')).toHaveLength(
    M1B_HAND.targets.filter(target => target.kind === 'pillbox').length,
  );
  expect(sites.filter(mark => mark.target === 'depot')).toHaveLength(1);
});

test("the squad dots are the wave's spawn points and the arrows start in the sea and end on the beach", () => {
  const dots = map.marks.filter(mark => mark.shape === 'dot').map(mark => mark.points[0]);
  expect(dots).toEqual(M1B_HAND.spawns[M1_BRIEFING_SQUAD_WAVE]);
  const wave1 = map.marks.find(mark => mark.symbol === 'wave1');
  const wave2 = map.marks.find(mark => mark.symbol === 'wave2');
  expect(wave1?.points.slice(1)).toEqual(path);
  expect(wave1?.points[0]?.z).toBeGreaterThan(M1B_HAND.bounds.maxZ);
  expect(wave2?.points.length).toBe(BRIEFING_TUNE.wave2Points);
  expect(wave2?.points[0]?.x).toBe((wave1?.points[0]?.x ?? 0) + BRIEFING_TUNE.wave2ShiftX);
  expect(map.bounds.maxZ).toBe(M1B_HAND.bounds.maxZ + BRIEFING_TUNE.seaMargin);
});

test("the terrain dots are the map's hedgehogs, seawall pieces and cliffs", () => {
  const wanted = M1B_HAND.props.filter(prop => ['hedgehog', 'seawall', 'cliff'].includes(prop.kind));
  expect(map.terrain).toHaveLength(wanted.length);
  expect(map.terrain.length).toBeGreaterThan(0);
});

test('lines come out by the time, and a symbol shows from its line and blinks while it is the latest', () => {
  expect(linesOut(M1_BRIEFING, 0)).toBe(1);
  expect(linesOut(M1_BRIEFING, 100)).toBe(M1_BRIEFING.length);
  expect(nextLineAt(M1_BRIEFING, 1)).toBe(M1_BRIEFING[1]?.at);
  expect(nextLineAt(M1_BRIEFING, M1_BRIEFING.length)).toBeNull();
  expect(symbolState(M1_BRIEFING, 0, 'battery')).toEqual({ shown: true, since: 0, latest: true });
  expect(symbolState(M1_BRIEFING, 0, 'depot').shown).toBe(false);
  const wave2Line = M1_BRIEFING.find(line => line.show.includes('wave2'));
  const after = symbolState(M1_BRIEFING, (wave2Line?.at ?? 0) + 0.1, 'wave2');
  expect(after).toEqual({ shown: true, since: wave2Line?.at, latest: true });
  expect(symbolState(M1_BRIEFING, 100, 'battery').latest).toBe(false);
});
