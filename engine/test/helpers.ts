import { expect } from 'vitest';
import { type TileWorld } from '../src/world/tiles.ts';
import { tileMapFromRows } from '../src/world/tilemap.ts';
import { type FloorLink, type Floors, createFloors } from '../src/world/floors.ts';

// Engine tests (Vitest, in Chromium: npm test). The page elements the engine expects are made by engine/test/setup.ts.
// eq / near / ok keep the short messages the tests were written with
export const eq = (a: unknown, b: unknown, what?: string) => expect(a, what).toBe(b);
export const near = (a: number, b: number, eps = 1e-9, what?: string) =>
  expect(Math.abs(a - b), what ?? `expected ~${b}, got ${a}`).toBeLessThanOrEqual(eps);
export const ok = (cond: unknown, what?: string) => expect(cond, what).toBeTruthy();
// a TileWorld (with its own flow arrays) from rows of text
export function worldFromRows(rows: string[], deckH?: number): TileWorld {
  const m = tileMapFromRows(rows, deckH === undefined ? {} : { deckH }),
    n = m.W * m.H;
  return {
    W: m.W,
    H: m.H,
    grid: m.maps.grid,
    hgt: m.maps.hgt,
    ramp: m.maps.ramp,
    cover: m.maps.cover,
    flow: new Int16Array(n),
    flowQ: new Int32Array(n),
    door: m.maps.door,
    doorOpen: m.maps.doorOpen,
  };
}

// floors from rows of text, one per floor, the ground of floor n at 10 * n m
export function floorsFromRows(floors: string[][], links: FloorLink[], deckH?: number): Floors {
  return createFloors(
    floors.map(rows => worldFromRows(rows, deckH)),
    floors.map((_, n) => 10 * n),
    links,
  );
}
export const spot = (floor: number, i: number, j: number) => ({ floor, i, j });
export const reached = (r: Uint8Array[], floor: number) => Array.from(r[floor]).join('');
// floor 0: a corridor with stairs at its east end and a lift at its west end. floor 1: a loop with a shut door,
// the stairs come out at its north-west corner, the lift at its south-east corner. floor 2: joined to nothing
export function crossFloors() {
  const stairs: FloorLink = { kind: 'stairs', a: spot(0, 5, 1), b: spot(1, 1, 1) },
    lift: FloorLink = { kind: 'elevator', a: spot(0, 1, 1), b: spot(1, 5, 3) },
    f = floorsFromRows(
      [
        ['#######', '#.....#', '#######'],
        ['#######', '#.+...#', '#.###.#', '#.....#', '#######'],
        ['####', '#..#', '####'],
      ],
      [stairs, lift],
    );
  return { f, stairs, lift };
}
