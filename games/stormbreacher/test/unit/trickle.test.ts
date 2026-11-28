// The front's trickle (SB-2230): where it comes out, when it stops, and what it counts. The world here is the small
// one the function asks for, built by hand.
import type { Rng } from '@engine/core/index.ts';
import { expect, test } from 'vitest';
import { ENEMIES, type EnemyKind } from '../../src/data/enemies.ts';
import { FORTRESS_TUNE } from '../../src/data/fortress.ts';
import { M1_SECTORS, SECTOR_TUNE } from '../../src/data/sectors.ts';
import { TRICKLE_TUNE, TRICKLE_WAVE } from '../../src/data/trickle.ts';
import { QUARTER_TUNE } from '../../src/data/tune.ts';
import type { MapBounds } from '../../src/data/types.ts';
import { rectDistance, type GroundRect } from '../../src/logic/collide.ts';
import { seed, stream } from '../../src/logic/rng.ts';
import { newSectors, type SectorPhase } from '../../src/logic/sectors.ts';
import { frontSector, newTrickle, stepTrickle, type TrickleFoe, type TrickleWorld } from '../../src/logic/trickle.ts';
import { insideQuad, viewGround } from '../../src/logic/viewGround.ts';

const DT = 1 / 60;
const BEACH = M1_SECTORS[0];
const LINE1 = M1_SECTORS[1];
const BOUNDS: MapBounds = { minX: -100, maxX: 100, minZ: -300, maxZ: 170 };
const RADIUS = ENEMIES[TRICKLE_TUNE.kind].radius;

function stateWith(phases: readonly SectorPhase[]) {
  const state = newSectors();
  // the sectors behind the ones given are still the enemy's
  state.phase = M1_SECTORS.map((_, i): SectorPhase => phases[i] ?? 'idle');
  return state;
}

function foe(kind: EnemyKind, z: number, options: { wave?: string; hp?: number; dormant?: boolean } = {}): TrickleFoe {
  return {
    wave: options.wave ?? 'line1-hold',
    kind,
    z,
    hp: options.hp ?? ENEMIES[kind].hp,
    dormant: options.dormant ?? false,
  };
}

// A beach in the scripted enemies' hands: one nest is alive in the beach, which opens the idle window.
function world(options: Partial<TrickleWorld> = {}): TrickleWorld {
  return {
    mech: { x: 0, y: 0, z: 166 },
    enemies: [foe('emplacement', 147, { wave: 'b-emplacements' })],
    targets: [],
    rects: [],
    bounds: BOUNDS,
    sectors: stateWith(['idle', 'idle', 'idle', 'idle']),
    flags: [],
    wardenDown: false,
    paused: false,
    ...options,
  };
}

// One frame with the wait run out, so a spawn may come now.
function spawnWith(w: TrickleWorld, rng: Rng, state = newTrickle(M1_SECTORS.length)) {
  state.t = 0;
  return stepTrickle(state, w, rng, DT);
}

function spawnNow(w: TrickleWorld, state = newTrickle(M1_SECTORS.length)) {
  return spawnWith(w, stream('trickle'), state);
}

// An rng that gives back the middle of every range and records the ranges, so the draws' order can be read.
function recordingRng(): { rng: Rng; calls: [number, number][] } {
  const calls: [number, number][] = [];
  const mid = (a: number, b: number): number => {
    calls.push([a, b]);
    return (a + b) / 2;
  };
  return {
    calls,
    rng: { next: () => 0.5, rand: mid, randi: (a, b) => Math.floor(mid(a, b + 1)), pick: a => a[0], shuffle: a => a },
  };
}

// The sectors that keep the old band: all but the three with their own rectangles.
const OLD_BAND = M1_SECTORS.filter(sector => sector.spawn === undefined);
const SPAWN_SECTORS = M1_SECTORS.filter(sector => sector.spawn !== undefined);

// The fortress's walls as rectangles: the sea and land walls either side of their gates, and the two side walls.
const WALLS: GroundRect[] = [];
for (const sign of [-1, 1]) {
  const halfW = (FORTRESS_TUNE.outerW - FORTRESS_TUNE.seaGate) / 4;
  WALLS.push({
    x: sign * (FORTRESS_TUNE.seaGate / 2 + halfW),
    z: FORTRESS_TUNE.seaWallZ,
    halfW,
    halfD: FORTRESS_TUNE.wallT / 2,
    yaw: 0,
  });
  const landHalfW = (FORTRESS_TUNE.outerW - FORTRESS_TUNE.landGate) / 4;
  WALLS.push({
    x: sign * (FORTRESS_TUNE.landGate / 2 + landHalfW),
    z: FORTRESS_TUNE.landWallZ,
    halfW: landHalfW,
    halfD: FORTRESS_TUNE.wallT / 2,
    yaw: 0,
  });
  WALLS.push({
    x: sign * FORTRESS_TUNE.wallX,
    z: FORTRESS_TUNE.yardZ,
    halfW: FORTRESS_TUNE.wallT / 2,
    halfD: FORTRESS_TUNE.yardD / 2,
    yaw: 0,
  });
}
WALLS.push({
  x: 0,
  z: FORTRESS_TUNE.landWallZ,
  halfW: FORTRESS_TUNE.landGate / 2,
  halfD: FORTRESS_TUNE.wallT / 2,
  yaw: 0,
});

test('the trickle comes out of sight, far from the mech, clear of the rects and inside the bounds', () => {
  const rects: GroundRect[] = [{ x: 20, z: 100, halfW: 8, halfD: 6, yaw: 0.3 }];
  const w = world({ rects });
  const sight = viewGround(w.mech, QUARTER_TUNE, TRICKLE_TUNE.viewAspect, 0);
  for (let n = 1; n <= 300; n++) {
    seed(n);
    const point = spawnNow(w);
    expect(point, `seed ${n}`).not.toBeNull();
    const { x, z } = point!;
    expect(insideQuad(sight, x, z), `seed ${n} in sight`).toBe(false);
    expect(Math.hypot(x - w.mech.x, z - w.mech.z), `seed ${n} too near`).toBeGreaterThanOrEqual(TRICKLE_TUNE.minDist);
    for (const rect of rects) expect(rectDistance(rect, x, z), `seed ${n} rect`).toBeGreaterThan(RADIUS);
    expect(x, `seed ${n} x`).toBeGreaterThanOrEqual(BOUNDS.minX + RADIUS);
    expect(x, `seed ${n} x`).toBeLessThanOrEqual(BOUNDS.maxX - RADIUS);
    expect(z, `seed ${n} z`).toBeGreaterThanOrEqual(BOUNDS.minZ + RADIUS);
    expect(z, `seed ${n} z`).toBeLessThanOrEqual(BOUNDS.maxZ - RADIUS);
  }
});

// A world with one sector in front and no enemy in the way, so only the point's drawing decides the test.
function sectorWorld(index: number, mechZ = 166): TrickleWorld {
  return world({
    mech: { x: 0, y: 0, z: mechZ },
    enemies: [],
    sectors: stateWith(M1_SECTORS.map((_, i): SectorPhase => (i === index ? 'advancing' : 'stable'))),
  });
}

// A world with one sector idle in front and no scripted enemy in it, for the sector's own goals (SB-2283).
function idleSectorWorld(index: number, options: Partial<TrickleWorld> = {}): TrickleWorld {
  return world({
    enemies: [],
    sectors: stateWith(M1_SECTORS.map((_, i): SectorPhase => (i === index ? 'idle' : 'stable'))),
    ...options,
  });
}

test('a sector without a spawn zone draws the old band in the old order', () => {
  for (const index of OLD_BAND.filter(sector => sector.budget > 0).map(sector => M1_SECTORS.indexOf(sector))) {
    const { rng, calls } = recordingRng();
    const point = spawnWith(sectorWorld(index), rng);
    const sector = M1_SECTORS[index];
    expect(point, sector.id).not.toBeNull();
    expect(calls, sector.id).toEqual([
      [0, TRICKLE_TUNE.spawnDepth],
      [-TRICKLE_TUNE.spawnSpread, TRICKLE_TUNE.spawnSpread],
      [TRICKLE_TUNE.intervalMin, TRICKLE_TUNE.intervalMax],
    ]);
    expect(point!.z, sector.id).toBe(sector.landZ - TRICKLE_TUNE.spawnBack - TRICKLE_TUNE.spawnDepth / 2);
    expect(point!.x, sector.id).toBe(0);
  }
});

test('a sector with spawn zones picks a rectangle by area, then draws x and z inside it', () => {
  const index = M1_SECTORS.findIndex(sector => sector.id === 'cband');
  const zones = M1_SECTORS[index].spawn!;
  const total = zones.reduce((sum, zone) => sum + (zone.maxX - zone.minX) * (zone.maxZ - zone.minZ), 0);
  const { rng, calls } = recordingRng();
  const point = spawnWith(sectorWorld(index), rng);
  const second = zones[1];
  expect(point).not.toBeNull();
  expect(calls).toEqual([
    [0, total],
    [second.minX, second.maxX],
    [second.minZ, second.maxZ],
    [TRICKLE_TUNE.intervalMin, TRICKLE_TUNE.intervalMax],
  ]);
  expect(point!.x).toBe((second.minX + second.maxX) / 2);
  expect(point!.z).toBe((second.minZ + second.maxZ) / 2);
});

test('the spawn zones keep every point inside them and out of the fortress walls', () => {
  for (const sector of SPAWN_SECTORS) {
    const index = M1_SECTORS.indexOf(sector);
    const zones = sector.spawn!;
    let found = 0;
    for (let n = 1; n <= 300; n++) {
      seed(n);
      const point = spawnNow(sectorWorld(index));
      if (point === null) continue;
      found++;
      expect(
        zones.some(
          zone => point.x >= zone.minX && point.x <= zone.maxX && point.z >= zone.minZ && point.z <= zone.maxZ,
        ),
        `${sector.id} seed ${n}`,
      ).toBe(true);
      for (const wall of WALLS) {
        expect(rectDistance(wall, point.x, point.z), `${sector.id} seed ${n} wall`).toBeGreaterThan(0);
      }
    }
    expect(found, sector.id).toBeGreaterThan(250);
  }
});

test('a point inside the view is dropped from a spawn zone as well', () => {
  const index = M1_SECTORS.findIndex(sector => sector.id === 'cband');
  const w = sectorWorld(index, -47);
  const sight = viewGround(w.mech, QUARTER_TUNE, TRICKLE_TUNE.viewAspect, TRICKLE_TUNE.viewMargin);
  // the left end of the band is in the view from the cband's middle, so the draws below would pass through it
  expect(insideQuad(sight, -40, -47)).toBe(true);
  let found = 0;
  for (let n = 1; n <= 300; n++) {
    seed(n);
    const point = spawnNow(w);
    if (point === null) continue;
    found++;
    expect(insideQuad(sight, point.x, point.z), `seed ${n} in sight`).toBe(false);
  }
  expect(found).toBeGreaterThan(0);
});

test('no point found spends nothing and waits retryT', () => {
  seed(1);
  // one great rect over the whole spawn band: nowhere is clear
  const w = world({ rects: [{ x: 0, z: 80, halfW: 500, halfD: 500, yaw: 0 }] });
  const state = newTrickle(M1_SECTORS.length);
  state.t = 0;
  expect(stepTrickle(state, w, stream('trickle'), DT)).toBeNull();
  expect(state.spent[0]).toBe(0);
  expect(state.t).toBe(TRICKLE_TUNE.retryT);
});

test('the living infantry is capped; nests, the mid boss and dormant soldiers are not counted', () => {
  const advancing = stateWith(['advancing', 'idle', 'idle', 'idle']);
  // eleven living riflemen fill the cap
  const full = world({
    sectors: advancing,
    enemies: Array.from({ length: TRICKLE_TUNE.maxAlive }, () => foe('grunt', 100)),
  });
  expect(spawnNow(full)).toBeNull();
  // ten riflemen, a nest, the boss and a dormant rifleman leave room for one
  const room = world({
    sectors: advancing,
    enemies: [
      ...Array.from({ length: TRICKLE_TUNE.maxAlive - 1 }, () => foe('grunt', 100)),
      foe('emplacement', 100),
      foe('warden', 100),
      foe('grunt', 100, { dormant: true }),
    ],
  });
  expect(spawnNow(room)).not.toBeNull();
});

test('the sector’s budget runs the trickle out', () => {
  seed(2);
  const w = world();
  const state = newTrickle(M1_SECTORS.length);
  let count = 0;
  for (let i = 0; i < BEACH.budget + 20; i++) if (spawnNow(w, state) !== null) count++;
  expect(count).toBe(BEACH.budget);
  expect(state.spent[0]).toBe(BEACH.budget);
  // time alone does not bring another
  for (let i = 0; i < 600; i++) expect(stepTrickle(state, w, stream('trickle'), DT)).toBeNull();
});

test('securing a sector stops its trickle and hands the next sector the front', () => {
  seed(3);
  const sectors = stateWith(['advancing', 'idle', 'idle', 'idle']);
  const w = world({ sectors, enemies: [foe('grunt', 100, { wave: 'line1-hold' })] });
  const state = newTrickle(M1_SECTORS.length);
  state.spent[0] = 3;
  sectors.phase[0] = 'secured';
  const point = spawnNow(w, state);
  expect(point).not.toBeNull();
  expect(point!.sector).toBe(1);
  expect(state.spent[0]).toBe(3); // the beach's budget is left as it was
  expect(state.spent[1]).toBe(1);
  expect(point!.z).toBeLessThanOrEqual(LINE1.landZ - TRICKLE_TUNE.spawnBack);
  expect(point!.z).toBeGreaterThanOrEqual(LINE1.landZ - TRICKLE_TUNE.spawnBack - TRICKLE_TUNE.spawnDepth);
});

test('with every sector secured nothing comes out', () => {
  const w = world({ sectors: stateWith(M1_SECTORS.map((): SectorPhase => 'stable')) });
  expect(spawnNow(w)).toBeNull();
});

test('while the front sector is idle the trickle only fills in behind its scripted enemies', () => {
  seed(4);
  const empty = world({ enemies: [] });
  expect(spawnNow(empty)).toBeNull();
  // an enemy beyond the beach, past its sea margin, does not open the window
  const elsewhere = world({ enemies: [foe('grunt', BEACH.seaZ + 20, { wave: 'line1-hold' })] });
  expect(spawnNow(elsewhere)).toBeNull();
  // one in the beach does
  const inside = world({ enemies: [foe('grunt', 140, { wave: 'b-emplacements' })] });
  expect(spawnNow(inside)).not.toBeNull();
  // while the sector is advancing the window does not apply
  const advancing = world({ enemies: [], sectors: stateWith(['advancing', 'idle', 'idle', 'idle']) });
  expect(spawnNow(advancing)).not.toBeNull();
});

// SB-2283: a sector's standing goals keep the idle window open, as the pillboxes did on the pillbox line.
test('while the front sector is idle its standing goals keep the trickle coming', () => {
  const pillboxes = M1_SECTORS.findIndex(sector => sector.id === 'pillboxes');
  expect(spawnNow(idleSectorWorld(pillboxes, { targets: [{ kind: 'pillbox', hp: 1 }] }))).not.toBeNull();
  expect(spawnNow(idleSectorWorld(pillboxes, { targets: [{ kind: 'pillbox', hp: 0 }] }))).toBeNull();

  const gate = M1_SECTORS.findIndex(sector => sector.id === 'gate');
  expect(spawnNow(idleSectorWorld(gate, { targets: [{ kind: 'fortressGun', hp: 1 }] }))).not.toBeNull();
  expect(spawnNow(idleSectorWorld(gate, { targets: [{ kind: 'fortressGun', hp: 0 }] }))).toBeNull();

  const magazine = M1_SECTORS.findIndex(sector => sector.id === 'magazine');
  const guns = [
    { kind: 'gun', hp: 1 },
    { kind: 'gun', hp: 0 },
  ];
  expect(spawnNow(idleSectorWorld(magazine, { targets: guns }))).not.toBeNull();
  expect(spawnNow(idleSectorWorld(magazine, { targets: guns.map(gun => ({ ...gun, hp: 0 })) }))).toBeNull();
  // the magazine itself is not a goal of the sector
  expect(spawnNow(idleSectorWorld(magazine, { targets: [{ kind: 'magazine', hp: 1 }] }))).toBeNull();

  const yard = M1_SECTORS.findIndex(sector => sector.id === 'yard');
  const flags = ['yard-1-clear', 'yard-2-clear', 'yard-3-clear'];
  const inside = { x: 0, y: 0, z: M1_SECTORS[yard].seaZ - SECTOR_TUNE.enterDepth - 1 };
  expect(anySpawn(idleSectorWorld(yard, { mech: inside }))).toBe(true);
  expect(anySpawn(idleSectorWorld(yard, { mech: inside, flags }))).toBe(false);
});

// SB-2286: the yard's trap is its own, so the trickle does not shut the yard in before the mech has gone in.
test('the yard keeps its trickle back until the mech is in it', () => {
  const yard = M1_SECTORS.findIndex(sector => sector.id === 'yard');
  const sector = M1_SECTORS[yard];
  const outside = { x: 0, y: 0, z: sector.seaZ - SECTOR_TUNE.enterDepth + 1 };
  const inside = { x: 0, y: 0, z: sector.seaZ - SECTOR_TUNE.enterDepth - 1 };
  expect(anySpawn(idleSectorWorld(yard, { mech: outside })), 'mech outside').toBe(false);
  expect(anySpawn(idleSectorWorld(yard, { mech: inside })), 'mech inside').toBe(true);
  // a sector without the flag keeps coming out while idle, wherever the mech is
  const magazine = M1_SECTORS.findIndex(entry => entry.id === 'magazine');
  expect(M1_SECTORS[magazine].trickleOnEntry).toBeUndefined();
});

// Whether a point comes out in some seed's draw (a point near the mech or in its view is dropped, so one seed may not).
function anySpawn(w: TrickleWorld): boolean {
  for (let n = 1; n <= 60; n++) {
    seed(n);
    if (spawnNow(w) !== null) return true;
  }
  return false;
}

test('nothing comes out while paused', () => {
  const w = world({ paused: true });
  const state = newTrickle(M1_SECTORS.length);
  state.t = 0;
  expect(stepTrickle(state, w, stream('trickle'), DT)).toBeNull();
  expect(state.spent[0]).toBe(0);
});

test('the wait after an enemy is the interval of the tune', () => {
  seed(5);
  const state = newTrickle(M1_SECTORS.length);
  const point = spawnNow(world(), state);
  expect(point).not.toBeNull();
  expect(state.t).toBeGreaterThanOrEqual(TRICKLE_TUNE.intervalMin);
  expect(state.t).toBeLessThanOrEqual(TRICKLE_TUNE.intervalMax);
});

test('the front is the first sector that is not yet secured', () => {
  expect(frontSector(['idle', 'idle', 'idle', 'idle'])).toBe(0);
  expect(frontSector(['stable', 'secured', 'counter', 'advancing'])).toBe(3);
  expect(frontSector(['secured', 'stable', 'stable', 'stable'])).toBeNull();
});

test('the trickle’s wave is not one the map or mission waves name', () => {
  expect(TRICKLE_WAVE).toBe('trickle');
});
