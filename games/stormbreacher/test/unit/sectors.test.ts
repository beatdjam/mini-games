// The sectors of M1's front (SB-2210, SB-2220): a sector is cleared when the mech is in it and no enemy is left,
// secured when enough infantry has reached its hold line, then counterattacked once before it is stable. The world here
// is the small one the functions ask for, built by hand.
import { expect, test } from 'vitest';
import { LANG } from '@engine/core/index.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1_SECTORS, SECTOR_TUNE } from '../../src/data/sectors.ts';
import { newCrowd, type Soldier } from '../../src/logic/crowd.ts';
import {
  arrivedSoldiers,
  newSectors,
  sectorHold,
  stepSectors,
  type SectorEvent,
  type SectorPhase,
  type SectorWorld,
  type SectorsState,
} from '../../src/logic/sectors.ts';
import '../../src/i18n/ja.ts';
import '../../src/i18n/en.ts';

const BEACH = M1_SECTORS[0];
const PILLBOXES = M1_SECTORS[3];
const BLASTS = M1B_HAND.blasts ?? [];
const LINE1_Z = BLASTS.find(point => point.id === 'l1-a')?.line ?? 0;

function soldierAt(z: number, alive = true): Soldier {
  return { x: 0, z, yaw: 0, alive, deadT: 0, phase: 0, squad: 0, fallAt: null, waited: false };
}

function world(options: {
  mechZ?: number;
  enemies?: readonly { id?: string; z: number; hp: number }[];
  targets?: readonly { kind: string; hp: number }[];
  soldiers?: readonly Soldier[];
  rects?: SectorWorld['rects'];
}) {
  const crowd = newCrowd();
  crowd.soldiers = [...(options.soldiers ?? [])];
  return {
    mech: { z: options.mechZ ?? 0 },
    enemies: (options.enemies ?? []).map((enemy, i) => ({ id: enemy.id ?? `enemy-${i}`, z: enemy.z, hp: enemy.hp })),
    targets: options.targets ?? [],
    rects: options.rects ?? [],
    battle: { crowd },
  };
}

function stateWith(phases: SectorPhase[]): SectorsState {
  const state = newSectors();
  state.phase = [...phases];
  return state;
}

// A state with the first three sectors stable, for the pillbox line's own tests.
function atPillboxes(): SectorsState {
  return stateWith(['stable', 'stable', 'stable', 'idle']);
}

// The soldiers at the beach's hold line, as many as asked for.
function atTheLine(count: number): Soldier[] {
  const z = BEACH.holdZ + SECTOR_TUNE.arriveBand - 1;
  return Array.from({ length: count }, () => soldierAt(z));
}

// Secures the beach from a state that is advancing and gives back the state and the event kinds.
function secureBeach(count = 10): { state: SectorsState; kinds: string[] } {
  const state = stateWith(['advancing', 'idle', 'idle', 'idle']);
  const events = stepSectors(state, world({ soldiers: atTheLine(count) }), 1 / 60);
  return { state, kinds: events.map(event => event.kind) };
}

// Puts out every enemy of the beach's counterattack, with ids as game.ts gives them, and gives back its world.
function runBeachCounter(state: SectorsState, dt = SECTOR_TUNE.counterEvery): ReturnType<typeof world> {
  const seen = world({});
  for (let frame = 0; frame < BEACH.counter * 4; frame++) {
    for (const event of stepSectors(state, seen, dt)) {
      if (event.kind !== 'sectorSpawn') continue;
      const id = `counter-beach-${state.counterIds[0].length + 1}`;
      state.counterIds[0].push(id);
      seen.enemies.push({ id, z: event.z, hp: 1 });
    }
    if (state.counterIds[0].length >= BEACH.counter) break;
  }
  return seen;
}

test('the mech has to go in before a sector is cleared', () => {
  const state = newSectors();
  const seaward = world({ mechZ: BEACH.seaZ - SECTOR_TUNE.enterDepth + 1 });
  expect(stepSectors(state, seaward, 1 / 60)).toEqual([]);
  expect(state.phase[0]).toBe('idle');
});

test('a living enemy in the sector keeps it from being cleared', () => {
  const state = newSectors();
  const mechZ = BEACH.seaZ - SECTOR_TUNE.enterDepth - 1;
  expect(stepSectors(state, world({ mechZ, enemies: [{ z: 140, hp: 1 }] }), 1 / 60)).toEqual([]);
  expect(state.phase[0]).toBe('idle');
  expect(stepSectors(state, world({ mechZ, enemies: [{ z: 140, hp: 0 }] }), 1 / 60)).toEqual([
    { kind: 'sectorCleared', sector: 'beach' },
  ]);
  expect(state.phase[0]).toBe('advancing');
});

test('an enemy just seaward of the sector’s edge still counts, one past the margin does not', () => {
  const mechZ = BEACH.seaZ - SECTOR_TUNE.enterDepth - 1;
  const inside = newSectors();
  expect(
    stepSectors(inside, world({ mechZ, enemies: [{ z: BEACH.seaZ + SECTOR_TUNE.seaMargin, hp: 1 }] }), 1 / 60),
  ).toEqual([]);
  const outside = newSectors();
  expect(
    stepSectors(outside, world({ mechZ, enemies: [{ z: BEACH.seaZ + SECTOR_TUNE.seaMargin + 1, hp: 1 }] }), 1 / 60),
  ).toEqual([{ kind: 'sectorCleared', sector: 'beach' }]);
});

test('an enemy inland of the sector is not counted', () => {
  const state = newSectors();
  const mechZ = BEACH.seaZ - SECTOR_TUNE.enterDepth - 1;
  expect(stepSectors(state, world({ mechZ, enemies: [{ z: BEACH.landZ - 1, hp: 1 }] }), 1 / 60)).toEqual([
    { kind: 'sectorCleared', sector: 'beach' },
  ]);
});

test('the pillbox line counts the pillboxes that still stand', () => {
  const mechZ = PILLBOXES.seaZ - SECTOR_TUNE.enterDepth - 1;
  const standing = atPillboxes();
  expect(stepSectors(standing, world({ mechZ, targets: [{ kind: 'pillbox', hp: 1 }] }), 1 / 60)).toEqual([]);
  expect(standing.phase[3]).toBe('idle');
  const down = atPillboxes();
  expect(stepSectors(down, world({ mechZ, targets: [{ kind: 'pillbox', hp: 0 }] }), 1 / 60)).toEqual([
    { kind: 'sectorCleared', sector: 'pillboxes' },
  ]);
});

test('a sector behind the front is not judged until the one before it is stable', () => {
  const state = stateWith(['advancing', 'idle', 'idle', 'idle']);
  const mechZ = M1_SECTORS[1].seaZ - SECTOR_TUNE.enterDepth - 1;
  expect(stepSectors(state, world({ mechZ, soldiers: [] }), 1 / 60)).toEqual([]);
  expect(state.phase).toEqual(['advancing', 'idle', 'idle', 'idle']);
});

test('the next sector is not judged while the one before it is still counterattacking', () => {
  const state = stateWith(['counter', 'idle', 'idle', 'idle']);
  state.counterLeft[0] = 1;
  state.counterT[0] = 10;
  const mechZ = M1_SECTORS[1].seaZ - SECTOR_TUNE.enterDepth - 1;
  expect(stepSectors(state, world({ mechZ }), 1 / 60)).toEqual([]);
  expect(state.phase[1]).toBe('idle');
});

test('a stable sector lets the next one be judged', () => {
  const state = stateWith(['stable', 'idle', 'idle', 'idle']);
  const mechZ = M1_SECTORS[1].seaZ - SECTOR_TUNE.enterDepth - 1;
  expect(stepSectors(state, world({ mechZ }), 1 / 60)).toEqual([{ kind: 'sectorCleared', sector: 'line1' }]);
});

test('too few arrived soldiers do not secure the sector', () => {
  const state = stateWith(['advancing', 'idle', 'idle', 'idle']);
  const holdZ = BEACH.holdZ;
  const near = holdZ + SECTOR_TUNE.arriveBand;
  const soldiers = [
    ...Array.from({ length: 5 }, () => soldierAt(near - 1)),
    ...Array.from({ length: 5 }, () => soldierAt(near + 1)),
  ];
  expect(stepSectors(state, world({ soldiers }), 1 / 60)).toEqual([]);
  expect(state.phase[0]).toBe('advancing');
  // min(arriveMax 11, ceil(10 * 0.6) = 6): the sixth soldier at the line secures it
  soldiers[5].z = near;
  expect(stepSectors(state, world({ soldiers }), 1 / 60).map(event => event.kind)).toEqual([
    'sectorSecured',
    'sectorCounter',
  ]);
  expect(state.phase[0]).toBe('counter');
});

test('securing a sector starts its counterattack and records the soldiers that arrived', () => {
  const { state, kinds } = secureBeach();
  expect(kinds).toEqual(['sectorSecured', 'sectorCounter']);
  expect(state.phase[0]).toBe('counter');
  expect(state.counterLeft[0]).toBe(BEACH.counter);
  expect(state.arrived[0]).toBe(10);
});

test('the counterattack puts out one enemy every counterEvery and as many as the sector has', () => {
  const { state } = secureBeach();
  const spawns: Extract<SectorEvent, { kind: 'sectorSpawn' }>[] = [];
  const seen = world({});
  let calls = 0;
  for (let frame = 0; frame < BEACH.counter * 2; frame++) {
    calls += 1;
    for (const event of stepSectors(state, seen, SECTOR_TUNE.counterEvery)) {
      if (event.kind !== 'sectorSpawn') continue;
      spawns.push(event);
      // as game.ts does: remember the id of each enemy put out
      const id = `counter-beach-${state.counterIds[0].length + 1}`;
      state.counterIds[0].push(id);
      seen.enemies.push({ id, z: event.z, hp: 1 });
    }
    if (spawns.length === BEACH.counter) break;
  }
  expect(spawns).toHaveLength(BEACH.counter);
  expect(calls).toBe(BEACH.counter);
  expect(state.counterLeft[0]).toBe(0);
});

test('a counterattack still standing keeps the sector from being stable; all down makes it stable', () => {
  const { state } = secureBeach();
  const seen = runBeachCounter(state);
  expect(stepSectors(state, seen, 1 / 60)).toEqual([]);
  expect(state.phase[0]).toBe('counter');
  for (const enemy of seen.enemies) enemy.hp = 0;
  expect(stepSectors(state, seen, 1 / 60)).toEqual([{ kind: 'sectorStable', sector: 'beach', weak: false }]);
  expect(state.phase[0]).toBe('stable');
});

test('fewer arrived soldiers than weakArrived make a weak hold', () => {
  const { state } = secureBeach(SECTOR_TUNE.weakArrived - 2);
  const seen = runBeachCounter(state);
  for (const enemy of seen.enemies) enemy.hp = 0;
  expect(stepSectors(state, seen, 1 / 60)).toEqual([{ kind: 'sectorStable', sector: 'beach', weak: true }]);
  expect(state.weak[0]).toBe(true);
});

test('a counterattack point on a ground rect moves clear of it', () => {
  const state = stateWith(['counter', 'idle', 'idle', 'idle']);
  state.counterLeft[0] = BEACH.counter;
  state.counterT[0] = SECTOR_TUNE.counterEvery;
  const z = BEACH.landZ - SECTOR_TUNE.counterBack;
  const first = -SECTOR_TUNE.counterSpread;
  const rect = { x: first, z, halfW: 0.5, halfD: 0.5, yaw: 0 };
  const events = stepSectors(state, world({ rects: [rect] }), SECTOR_TUNE.counterEvery);
  expect(events).toEqual([{ kind: 'sectorSpawn', sector: 'beach', x: first + 2, z }]);
});

test('the dead are not counted as arrived, and a wiped-out crowd secures nothing', () => {
  const holdZ = BEACH.holdZ;
  const near = holdZ + SECTOR_TUNE.arriveBand;
  const crowd = newCrowd();
  crowd.soldiers = [soldierAt(near, true), soldierAt(near, false), soldierAt(near, false)];
  expect(arrivedSoldiers(crowd, holdZ)).toHaveLength(1);
  const wiped = stateWith(['advancing', 'idle', 'idle', 'idle']);
  expect(stepSectors(wiped, world({ soldiers: [soldierAt(near, false)] }), 1 / 60)).toEqual([]);
  expect(wiped.phase[0]).toBe('advancing');
});

test('the hold starts at the water’s edge and follows the last cleared sector', () => {
  const open = BLASTS.filter(point => point.line !== null).map(point => point.id);
  const fresh = newSectors();
  expect(sectorHold(fresh, open, BLASTS)).toEqual({ holdZ: SECTOR_TUNE.startHoldZ, held: true });
  fresh.phase[0] = 'advancing';
  expect(sectorHold(fresh, open, BLASTS)).toEqual({ holdZ: BEACH.holdZ, held: true });
  fresh.phase[0] = 'secured';
  expect(sectorHold(fresh, open, BLASTS).holdZ).toBe(BEACH.holdZ);
  fresh.phase[1] = 'advancing';
  expect(sectorHold(fresh, open, BLASTS).holdZ).toBe(M1_SECTORS[1].holdZ);
  fresh.phase[2] = 'advancing';
  fresh.phase[3] = 'advancing';
  expect(sectorHold(fresh, open, BLASTS)).toEqual({ holdZ: PILLBOXES.holdZ, held: true });
  fresh.phase[3] = 'secured';
  expect(sectorHold(fresh, open, BLASTS)).toEqual({ holdZ: PILLBOXES.holdZ, held: false });
});

test('a still-closed defence line keeps the infantry before it and the sector unsecured until a blast opens it', () => {
  const state = stateWith(['advancing', 'idle', 'idle', 'idle']);
  expect(LINE1_Z).toBe(137);
  const waitZ = LINE1_Z + SECTOR_TUNE.lineMargin;
  expect(sectorHold(state, [], BLASTS).holdZ).toBe(waitZ);
  expect(sectorHold(state, ['l1-a'], BLASTS).holdZ).toBe(BEACH.holdZ);
  // At the closed line they are not at the beach's hold line, so the beach is not secured.
  const waiting = Array.from({ length: SECTOR_TUNE.arriveMax }, () => soldierAt(waitZ));
  expect(stepSectors(state, world({ soldiers: waiting }), 1 / 60)).toEqual([]);
  expect(state.phase[0]).toBe('advancing');
  // Once they have walked through the hole to the beach's hold line, they secure it.
  const arrived = Array.from({ length: SECTOR_TUNE.arriveMax }, () => soldierAt(BEACH.holdZ));
  expect(stepSectors(state, world({ soldiers: arrived }), 1 / 60).map(event => event.kind)).toEqual([
    'sectorSecured',
    'sectorCounter',
  ]);
});

test('every sector line has text in ja and en', () => {
  const keys = [
    'm1.sector-cleared',
    'm1.sector-line-closed',
    'm1.sector-secured',
    'm1.sector-counter',
    'm1.sector-stable',
    'm1.sector-weak',
  ];
  for (const code of ['ja', 'en']) {
    for (const key of keys) expect(LANG[code].ui[key], `${code} is missing "${key}"`).toBeTruthy();
  }
});

test('a counterattack point covered after ten moves still comes out, at the last point tried', () => {
  const { state } = secureBeach();
  // one rect wide enough to cover every point the ten moves try
  const wall = { x: 0, z: BEACH.landZ - SECTOR_TUNE.counterBack, halfW: 500, halfD: 5, yaw: 0 };
  const seen = world({ rects: [wall] });
  state.counterT[0] = 0;
  const events = stepSectors(state, seen, 1 / 60);
  const spawn = events.find(event => event.kind === 'sectorSpawn');
  expect(spawn).toEqual({
    kind: 'sectorSpawn',
    sector: 'beach',
    x: -SECTOR_TUNE.counterSpread + 20,
    z: BEACH.landZ - SECTOR_TUNE.counterBack,
  });
  expect(state.counterLeft[0]).toBe(BEACH.counter - 1);
});
