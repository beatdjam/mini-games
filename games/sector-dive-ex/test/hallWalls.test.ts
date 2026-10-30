// The numbers a sector gives its boss room's walls and floors (hallWalls.ts): the hall's pictures come after the
// sector's own, and the lists the hall's props use point at them. A sector's values must stay what they were.
import { expect, test } from 'vitest';
import type { RoomFloors, RoomWalls } from '../src/world/looks/common.ts';
import { hallWallNumbers } from '../src/world/looks/hallWalls.ts';
import {
  DATA_HALL_FLOORS,
  DATA_HALL_MAP,
  DATA_HALL_PLAIN,
  DATA_HALL_RACKS,
  DATA_HALL_WALLS,
} from '../src/world/looks/data/hall.ts';
import {
  DATA_ALL_WALLS,
  DATA_HALL_PLAIN_WALLS,
  DATA_HALL_RACK_WALLS,
  DATA_ROOM_FLOORS,
  DATA_ROOM_WALLS,
} from '../src/world/looks/data/pictures.ts';
import {
  FORGE_HALL_FLOORS,
  FORGE_HALL_MAP,
  FORGE_HALL_MOUTHS,
  FORGE_HALL_PLAIN,
  FORGE_HALL_STORES,
  FORGE_HALL_TAPS,
  FORGE_HALL_WALLS,
} from '../src/world/looks/forge/hall.ts';
import {
  FORGE_ALL_WALLS,
  FORGE_HALL_MOUTH_WALLS,
  FORGE_HALL_PLAIN_WALLS,
  FORGE_HALL_STORE_WALLS,
  FORGE_HALL_TAP_WALLS,
  FORGE_ROOM_FLOORS,
  FORGE_ROOM_WALLS,
} from '../src/world/looks/forge/pictures.ts';
import {
  KWLN_HALL_FLOORS,
  KWLN_HALL_HANGING,
  KWLN_HALL_MAP,
  KWLN_HALL_SHRINE,
  KWLN_HALL_SIGNED,
  KWLN_HALL_WALLS,
} from '../src/world/looks/kwln/hall.ts';
import {
  KWLN_ALL_WALLS,
  KWLN_HALL_HANGING_WALLS,
  KWLN_HALL_SHRINE_WALLS,
  KWLN_HALL_SIGNED_WALLS,
  KWLN_ROOM_FLOORS,
  KWLN_ROOM_WALLS,
} from '../src/world/looks/kwln/pictures.ts';
import {
  NOISE_HALL_CABINETS,
  NOISE_HALL_FLOORS,
  NOISE_HALL_MAP,
  NOISE_HALL_PLAIN,
  NOISE_HALL_WALLS,
} from '../src/world/looks/noise/hall.ts';
import {
  NOISE_ALL_WALLS,
  NOISE_HALL_CABINET_WALLS,
  NOISE_HALL_PLAIN_WALLS,
  NOISE_ROOM_FLOORS,
  NOISE_ROOM_WALLS,
} from '../src/world/looks/noise/pictures.ts';
import {
  RUIN_HALL_FLOORS,
  RUIN_HALL_LIT,
  RUIN_HALL_MAP,
  RUIN_HALL_STAGE,
  RUIN_HALL_WALLS,
} from '../src/world/looks/ruin/hall.ts';
import {
  RUIN_ALL_WALLS,
  RUIN_HALL_LIT_WALLS,
  RUIN_HALL_STAGE_WALLS,
  RUIN_ROOM_FLOORS,
  RUIN_ROOM_WALLS,
} from '../src/world/looks/ruin/pictures.ts';

// one sector's hall, as it is exported to the rest of the look
interface Sector {
  walls: RoomWalls;
  floors: RoomFloors;
  map: number[];
  hallWalls: readonly unknown[];
  hallFloors: readonly unknown[];
  all: number;
  floorCount: number; // the sector's own floor pictures (not exported: fixed here)
  tags: [number[], number[]][]; // the hall's props: the picture n of the hall, and the numbers exported for it
}
function check(S: Sector): void {
  const plain = S.walls.plain;
  expect(S.walls.hall).toEqual(S.map.map(n => plain + n));
  expect(S.walls.common).toEqual(Array.from({ length: plain }, (_, n) => n));
  expect(S.walls.shops).toEqual([]);
  expect(S.walls.ground).toEqual([]);
  expect(S.walls.fronts).toEqual([]);
  expect(S.floors.plain).toBe(S.floorCount);
  expect(S.floors.shops).toEqual([]);
  expect(S.floors.hall).toEqual(Array.from({ length: S.hallFloors.length }, (_, n) => S.floors.plain + n));
  expect(S.all).toBe(plain + S.hallWalls.length);
  for (const [source, walls] of S.tags) expect(walls).toEqual(source.map(n => plain + n));
}

test('hall wall numbers put the hall pictures after the sector', () => {
  const got = hallWallNumbers({ first: 3, walls: 2, map: [1, 0, 1], floors: 4, hallFloors: 2 });
  expect(got.roomWalls.plain).toBe(3);
  expect(got.roomWalls.common).toEqual([0, 1, 2]);
  expect(got.roomWalls.shops).toEqual([]);
  expect(got.roomWalls.ground).toEqual([]);
  expect(got.roomWalls.fronts).toEqual([]);
  expect(got.roomWalls.hall).toEqual([4, 3, 4]);
  expect(got.roomFloors).toEqual({ plain: 4, shops: [], hall: [4, 5] });
  expect(got.all).toBe(5);
  expect(got.wall(0)).toBe(3);
});

test('hall wall numbers of RUIN', () => {
  check({
    walls: RUIN_ROOM_WALLS,
    floors: RUIN_ROOM_FLOORS,
    map: RUIN_HALL_MAP,
    hallWalls: RUIN_HALL_WALLS,
    hallFloors: RUIN_HALL_FLOORS,
    all: RUIN_ALL_WALLS,
    floorCount: 6,
    tags: [
      [RUIN_HALL_STAGE, RUIN_HALL_STAGE_WALLS],
      [RUIN_HALL_LIT, RUIN_HALL_LIT_WALLS],
    ],
  });
});

test('hall wall numbers of FORGE', () => {
  check({
    walls: FORGE_ROOM_WALLS,
    floors: FORGE_ROOM_FLOORS,
    map: FORGE_HALL_MAP,
    hallWalls: FORGE_HALL_WALLS,
    hallFloors: FORGE_HALL_FLOORS,
    all: FORGE_ALL_WALLS,
    floorCount: 4,
    tags: [
      [FORGE_HALL_MOUTHS, FORGE_HALL_MOUTH_WALLS],
      [FORGE_HALL_TAPS, FORGE_HALL_TAP_WALLS],
      [FORGE_HALL_PLAIN, FORGE_HALL_PLAIN_WALLS],
      [FORGE_HALL_STORES, FORGE_HALL_STORE_WALLS],
    ],
  });
});

test('hall wall numbers of NOISE', () => {
  check({
    walls: NOISE_ROOM_WALLS,
    floors: NOISE_ROOM_FLOORS,
    map: NOISE_HALL_MAP,
    hallWalls: NOISE_HALL_WALLS,
    hallFloors: NOISE_HALL_FLOORS,
    all: NOISE_ALL_WALLS,
    floorCount: 5,
    tags: [
      [NOISE_HALL_CABINETS, NOISE_HALL_CABINET_WALLS],
      [NOISE_HALL_PLAIN, NOISE_HALL_PLAIN_WALLS],
    ],
  });
});

test('hall wall numbers of KWLN', () => {
  check({
    walls: KWLN_ROOM_WALLS,
    floors: KWLN_ROOM_FLOORS,
    map: KWLN_HALL_MAP,
    hallWalls: KWLN_HALL_WALLS,
    hallFloors: KWLN_HALL_FLOORS,
    all: KWLN_ALL_WALLS,
    floorCount: 3,
    tags: [
      [KWLN_HALL_SHRINE, KWLN_HALL_SHRINE_WALLS],
      [KWLN_HALL_SIGNED, KWLN_HALL_SIGNED_WALLS],
      [KWLN_HALL_HANGING, KWLN_HALL_HANGING_WALLS],
    ],
  });
});

test('hall wall numbers of DATA', () => {
  check({
    walls: DATA_ROOM_WALLS,
    floors: DATA_ROOM_FLOORS,
    map: DATA_HALL_MAP,
    hallWalls: DATA_HALL_WALLS,
    hallFloors: DATA_HALL_FLOORS,
    all: DATA_ALL_WALLS,
    floorCount: 5,
    tags: [
      [DATA_HALL_RACKS, DATA_HALL_RACK_WALLS],
      [DATA_HALL_PLAIN, DATA_HALL_PLAIN_WALLS],
    ],
  });
});
