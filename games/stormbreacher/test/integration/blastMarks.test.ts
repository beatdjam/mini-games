// The lights over the blast points (SB-2022): none before a pillbox is shot once, none in a cutscene, dimmer as the mech
// nears and out inside the use reach, none in `map`, and one in `next` that moves on when its pillbox falls.
import { expect, test } from 'vitest';
import { MARKER_MODES, MARKER_TUNE, markerModeOfQuery } from '../../src/data/marker.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { blastMarks, markerAlpha } from '../../src/logic/blastMarks.ts';
import { suppressPillbox } from '../../src/logic/pillbox.ts';
import type { GameModel } from '../../src/logic/game.ts';
import { newPlayGame } from './playGame.ts';

const PILLBOX_1 = ['blast-pillbox-1-side', 'blast-pillbox-1-back'];
const PILLBOX_2 = ['blast-pillbox-2-side', 'blast-pillbox-2-back'];
const LINE_POINTS = ['l1-a', 'l1-b', 'l2-a', 'l2-b'];

function newGame(): GameModel {
  return newPlayGame({ ...M1B_HAND, spawns: {}, mines: [] });
}

function shoot(game: GameModel, id: string): void {
  const state = game.pillboxes.find(entry => entry.id === id);
  if (!state) throw new Error(`the game has no ${id}`);
  suppressPillbox(state);
}

function ids(game: GameModel, mode: (typeof MARKER_MODES)[number]): string[] {
  return blastMarks(game, mode)
    .map(mark => mark.id)
    .sort();
}

test('before a pillbox is shot once, only the lines’ points show a light; after it, its two points show too', () => {
  const game = newGame();
  expect(ids(game, 'dim')).toEqual([...LINE_POINTS].sort());
  shoot(game, 'pillbox-1');
  expect(ids(game, 'dim')).toEqual([...LINE_POINTS, ...PILLBOX_1].sort());
  // and the pillbox down takes its points' lights with it
  const target = game.targets.find(entry => entry.id === 'pillbox-1');
  if (!target) throw new Error('no pillbox-1');
  target.hp = 0;
  expect(ids(game, 'dim')).toEqual([...LINE_POINTS].sort());
});

test('the fortress’s bomb shows a light only once the mid boss is down (SB-1860)', () => {
  const game = newGame();
  expect(ids(game, 'dim')).not.toContain('fort-bomb');
  game.script.wardenDown = true;
  expect(ids(game, 'dim')).toContain('fort-bomb');
});

test('a cutscene shows no light, and the light is back when it ends', () => {
  const game = newGame();
  shoot(game, 'pillbox-1');
  game.script.cutscene = { id: 'landing', left: 5 };
  expect(blastMarks(game, 'dim')).toEqual([]);
  expect(blastMarks(game, 'next')).toEqual([]);
  game.script.cutscene = null;
  expect(blastMarks(game, 'dim').length).toBeGreaterThan(0);
});

test('the light dims from fadeStart down to nothing at fadeEnd', () => {
  expect(markerAlpha(MARKER_TUNE.fadeStart + 10)).toBe(1);
  expect(markerAlpha(MARKER_TUNE.fadeStart)).toBe(1);
  const middle = (MARKER_TUNE.fadeStart + MARKER_TUNE.fadeEnd) / 2;
  expect(markerAlpha(middle)).toBeCloseTo(0.5, 6);
  expect(markerAlpha(MARKER_TUNE.fadeEnd)).toBe(0);
  expect(markerAlpha(0)).toBe(0);

  const game = newGame();
  shoot(game, 'pillbox-1');
  const point = game.blasts.find(place => place.id === PILLBOX_1[0]);
  if (!point) throw new Error('no point');
  const alphaAt = (away: number): number => {
    game.mech.x = point.x;
    game.mech.z = point.z + away;
    return blastMarks(game, 'dim').find(mark => mark.id === point.id)?.alpha ?? -1;
  };
  expect(alphaAt(MARKER_TUNE.fadeStart + 1)).toBe(1);
  expect(alphaAt(middle)).toBeCloseTo(0.5, 6);
  expect(alphaAt(MARKER_TUNE.fadeEnd - 1)).toBe(0);
});

test('`map` shows no light on screen at all', () => {
  const game = newGame();
  shoot(game, 'pillbox-1');
  expect(blastMarks(game, 'map')).toEqual([]);
});

test('`next` shows one light, and it moves to the other pillbox when the first falls', () => {
  const game = newGame();
  shoot(game, 'pillbox-1');
  shoot(game, 'pillbox-2');
  // the mech stands by pillbox-2 (x 22), nearer it than pillbox-1 (x -33) and far from the lines
  game.mech.x = 22;
  game.mech.z = -10;
  const first = ids(game, 'next');
  expect(first).toHaveLength(1);
  expect(PILLBOX_2).toContain(first[0]);

  const target = game.targets.find(entry => entry.id === 'pillbox-2');
  if (!target) throw new Error('no pillbox-2');
  target.hp = 0;
  const second = ids(game, 'next');
  expect(second).toHaveLength(1);
  expect(PILLBOX_1).toContain(second[0]);

  // with no pillbox left standing and shot, the one light is the nearest point of a line
  const other = game.targets.find(entry => entry.id === 'pillbox-1');
  if (!other) throw new Error('no pillbox-1');
  other.hp = 0;
  const third = ids(game, 'next');
  expect(third).toHaveLength(1);
  expect(LINE_POINTS).toContain(third[0]);
});

test('`next` shows no pillbox point before the pillbox is shot', () => {
  const game = newGame();
  game.mech.x = 22;
  game.mech.z = 20;
  const only = ids(game, 'next');
  expect(only).toHaveLength(1);
  expect(LINE_POINTS).toContain(only[0]);
});

test('the URL names the way the lights show', () => {
  expect(markerModeOfQuery('?marker=dim')).toBe('dim');
  expect(markerModeOfQuery('?marker=map')).toBe('map');
  expect(markerModeOfQuery('?x=1&marker=next')).toBe('next');
  expect(markerModeOfQuery('?marker=other')).toBeNull();
  expect(markerModeOfQuery('')).toBeNull();
});
