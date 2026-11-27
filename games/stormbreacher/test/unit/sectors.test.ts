// The sectors of M1's front (SB-2210): a sector is cleared when the mech is in it and no enemy is left, and secured when
// enough infantry has reached its hold line. The world here is the small one the functions ask for, built by hand.
import { expect, test } from 'vitest';
import { LANG } from '@engine/core/index.ts';
import { M1_SECTORS, SECTOR_TUNE } from '../../src/data/sectors.ts';
import { newCrowd, type Soldier } from '../../src/logic/crowd.ts';
import {
  arrivedSoldiers,
  newSectors,
  sectorHold,
  stepSectors,
  type SectorWorld,
  type SectorsState,
} from '../../src/logic/sectors.ts';
import '../../src/i18n/ja.ts';
import '../../src/i18n/en.ts';

const BEACH = M1_SECTORS[0];
const PILLBOXES = M1_SECTORS[3];

function soldierAt(z: number, alive = true): Soldier {
  return { x: 0, z, yaw: 0, alive, deadT: 0, phase: 0, squad: 0, fallAt: null, waited: false };
}

function world(options: {
  mechZ?: number;
  enemies?: readonly { z: number; hp: number }[];
  targets?: readonly { kind: string; hp: number }[];
  soldiers?: readonly Soldier[];
}): SectorWorld {
  const crowd = newCrowd();
  crowd.soldiers = [...(options.soldiers ?? [])];
  return {
    mech: { z: options.mechZ ?? 0 },
    enemies: options.enemies ?? [],
    targets: options.targets ?? [],
    battle: { crowd },
  };
}

function phases(state: SectorsState): string[] {
  return [...state.phase];
}

// A state with the first three sectors secured, for the pillbox line's own tests.
function atPillboxes(): SectorsState {
  return { phase: ['secured', 'secured', 'secured', 'idle'] };
}

test('the mech has to go in before a sector is cleared', () => {
  const state = newSectors();
  const seaward = world({ mechZ: BEACH.seaZ - SECTOR_TUNE.enterDepth + 1 });
  expect(stepSectors(state, seaward)).toEqual([]);
  expect(state.phase[0]).toBe('idle');
});

test('a living enemy in the sector keeps it from being cleared', () => {
  const state = newSectors();
  const mechZ = BEACH.seaZ - SECTOR_TUNE.enterDepth - 1;
  expect(stepSectors(state, world({ mechZ, enemies: [{ z: 140, hp: 1 }] }))).toEqual([]);
  expect(state.phase[0]).toBe('idle');
  expect(stepSectors(state, world({ mechZ, enemies: [{ z: 140, hp: 0 }] }))).toEqual([
    { kind: 'sectorCleared', sector: 'beach' },
  ]);
  expect(state.phase[0]).toBe('advancing');
});

test('an enemy just seaward of the sector’s edge still counts, one past the margin does not', () => {
  const mechZ = BEACH.seaZ - SECTOR_TUNE.enterDepth - 1;
  const inside = newSectors();
  expect(stepSectors(inside, world({ mechZ, enemies: [{ z: BEACH.seaZ + SECTOR_TUNE.seaMargin, hp: 1 }] }))).toEqual(
    [],
  );
  const outside = newSectors();
  expect(
    stepSectors(outside, world({ mechZ, enemies: [{ z: BEACH.seaZ + SECTOR_TUNE.seaMargin + 1, hp: 1 }] })),
  ).toEqual([{ kind: 'sectorCleared', sector: 'beach' }]);
});

test('an enemy inland of the sector is not counted', () => {
  const state = newSectors();
  const mechZ = BEACH.seaZ - SECTOR_TUNE.enterDepth - 1;
  expect(stepSectors(state, world({ mechZ, enemies: [{ z: BEACH.landZ - 1, hp: 1 }] }))).toEqual([
    { kind: 'sectorCleared', sector: 'beach' },
  ]);
});

test('the pillbox line counts the pillboxes that still stand', () => {
  const mechZ = PILLBOXES.seaZ - SECTOR_TUNE.enterDepth - 1;
  const standing = atPillboxes();
  expect(stepSectors(standing, world({ mechZ, targets: [{ kind: 'pillbox', hp: 1 }] }))).toEqual([]);
  expect(standing.phase[3]).toBe('idle');
  const down = atPillboxes();
  expect(stepSectors(down, world({ mechZ, targets: [{ kind: 'pillbox', hp: 0 }] }))).toEqual([
    { kind: 'sectorCleared', sector: 'pillboxes' },
  ]);
});

test('a sector behind the front is not judged until the one before it is secured', () => {
  const state: SectorsState = { phase: ['advancing', 'idle', 'idle', 'idle'] };
  const mechZ = M1_SECTORS[1].seaZ - SECTOR_TUNE.enterDepth - 1;
  expect(stepSectors(state, world({ mechZ, soldiers: [] }))).toEqual([]);
  expect(phases(state)).toEqual(['advancing', 'idle', 'idle', 'idle']);
});

test('too few arrived soldiers do not secure the sector', () => {
  const state: SectorsState = { phase: ['advancing', 'idle', 'idle', 'idle'] };
  const holdZ = BEACH.holdZ;
  const near = holdZ + SECTOR_TUNE.arriveBand;
  const soldiers = [
    ...Array.from({ length: 5 }, () => soldierAt(near - 1)),
    ...Array.from({ length: 5 }, () => soldierAt(near + 1)),
  ];
  expect(stepSectors(state, world({ soldiers }))).toEqual([]);
  expect(state.phase[0]).toBe('advancing');
  // min(arriveMax 11, ceil(10 * 0.6) = 6): the sixth soldier at the line secures it
  soldiers[5].z = near;
  expect(stepSectors(state, world({ soldiers }))).toEqual([{ kind: 'sectorSecured', sector: 'beach' }]);
  expect(state.phase[0]).toBe('secured');
});

test('the dead are not counted as arrived, and a wiped-out crowd secures nothing', () => {
  const holdZ = BEACH.holdZ;
  const near = holdZ + SECTOR_TUNE.arriveBand;
  const crowd = newCrowd();
  crowd.soldiers = [soldierAt(near, true), soldierAt(near, false), soldierAt(near, false)];
  expect(arrivedSoldiers(crowd, holdZ)).toHaveLength(1);
  const wiped = newSectors();
  wiped.phase[0] = 'advancing';
  expect(stepSectors(wiped, world({ soldiers: [soldierAt(near, false)] }))).toEqual([]);
  expect(wiped.phase[0]).toBe('advancing');
});

test('the hold starts at the water’s edge and follows the last cleared sector', () => {
  const fresh = newSectors();
  expect(sectorHold(fresh)).toEqual({ holdZ: SECTOR_TUNE.startHoldZ, held: true });
  fresh.phase[0] = 'advancing';
  expect(sectorHold(fresh)).toEqual({ holdZ: BEACH.holdZ, held: true });
  fresh.phase[0] = 'secured';
  expect(sectorHold(fresh).holdZ).toBe(BEACH.holdZ);
  fresh.phase[1] = 'advancing';
  expect(sectorHold(fresh).holdZ).toBe(M1_SECTORS[1].holdZ);
  fresh.phase[2] = 'advancing';
  fresh.phase[3] = 'advancing';
  expect(sectorHold(fresh)).toEqual({ holdZ: PILLBOXES.holdZ, held: true });
  fresh.phase[3] = 'secured';
  expect(sectorHold(fresh)).toEqual({ holdZ: PILLBOXES.holdZ, held: false });
});

test('every sector line has text in ja and en', () => {
  const keys = ['m1.sector-cleared', 'm1.sector-secured'];
  for (const code of ['ja', 'en']) {
    for (const key of keys) expect(LANG[code].ui[key], `${code} is missing "${key}"`).toBeTruthy();
  }
});
