// Smoke test for Sector Dive Extended, the building: layout of floors, courtyards, atriums, the mall and the hospital. Boots the game page (setup.ts) once for this file (bootGame) and runs it through the real loop by hand.
// Each test makes the state it needs; the file passes on its own and in any order (the dice are seeded where a test depends on them).
import { beforeAll, expect, test } from 'vitest';
import { Group, Matrix4, Vector3 } from 'three';
import type { InstancedMesh } from 'three';
import type { Enemy, Pickup, Snapshot } from '../src/data/types.ts';
import { createRng, el } from '@engine/core/util.ts';
import { query } from '@engine/core/world.ts';
import {
  T,
  W,
  SINK_EDGE,
  SINK_FLOOR,
  computeFlow,
  floorY,
  flowDir,
  grid,
  moveCircle,
  tileCenter,
  tileIndex,
} from '@engine/world/tiles.ts';
import { COVER_H } from '../src/data/level.ts';
import { BOSS_META } from '../src/data/bosses.ts';
import { BIOMES } from '../src/data/biomes.ts';
import { foodCourtRoom } from '../src/world/looks/mall/rooms.ts';
import { ISLAND_MIN_AREA } from '../src/world/looks/mall/islands.ts';
import { hospRoomKinds, waitingRoom } from '../src/world/looks/hosp/rooms.ts';
import { HOSP_KINDS, KIND_WAITING } from '../src/world/looks/hosp/shared.ts';
import { groundOf } from '../src/world/meshParts.ts';
import { lookOf } from '../src/world/looks.ts';
import { PER } from '../src/data/progress.ts';
import { save } from '../src/core/save.ts';
import { progressOf } from '../src/core/rules.ts';
import { level, roomSpot } from '../src/world/level.ts';
import { addPickup, enemies } from '../src/world/entities.ts';
import { player, run } from '../src/actors/player.ts';
import { hurtEnemy } from '../src/actors/combat.ts';
import { stageLabel } from '../src/core/stages.ts';
import { goBase, startRun, startStage, useLink } from '../src/flow/run.ts';
import {
  BUILDING_V,
  FLOORS_RANGE,
  FLOOR_H,
  LAST_GAP,
  building,
  devCourtOpen,
  makeBuilding,
  makeRoute,
  packSeen,
  roomDoors,
  roomsOnWay,
  setBuilding,
} from '../src/world/building.ts';
import { resumeRun, suspendRun } from '../src/flow/suspend.ts';
import { tick, bootGame, killRoom, goToFloor, enterBuilding } from './helpers.ts';

beforeAll(bootGame);

test('building: rooms lie between where one stairwell or lift lets you off and the next', () => {
  // (from the start room for the first one; the shortest way goes through 2 rooms, or 1 where no place gives more)
  const counts: number[] = [];
  // (some seed gives a way through no room in every sector now and then, 1 or 2 ways in 100: of these 40 seeds, the
  // sectors are dealt out from the first, which keeps clear of them)
  for (let seed = 1; seed <= 40; seed++) {
    const b = makeBuilding(BIOMES[(seed - 1) % BIOMES.length]!, 'watcher', seed);
    b.links.forEach((l, n) => {
      const floor = b.route[n]!,
        d = b.plans[floor]!.gen,
        on = (x: typeof l) => (floor === x.upper ? x.a : x.b),
        r = d.rooms[d.startIdx],
        from = n ? on(b.links[n - 1]!) : Math.floor(r!.y + r!.h / 2) * d.W + Math.floor(r!.x + r!.w / 2),
        rooms = roomsOnWay(d, from, on(l), n ? -1 : d.startIdx);
      expect(rooms, `seed ${seed} link ${n}`).toBeGreaterThanOrEqual(1);
      counts.push(rooms);
    });
  }
  expect(counts.filter(c => c >= 2).length / counts.length, '2 rooms or more').toBeGreaterThan(0.85);
});
test('building: a courtyard, an atrium with galleries or a yard seen from balconies (both in the old downtown)', () => {
  const city = BIOMES.find(x => x.code === 'CITY')!;
  for (const open of [false, true]) {
    devCourtOpen(open);
    for (let seed = 1; seed <= 20; seed++) {
      const b = makeBuilding(city, city.bosses[0]!, seed),
        c = b.court!,
        at = `${open ? 'yard' : 'atrium'} seed ${seed}`;
      expect(c, at).not.toBeNull();
      expect(c.open, at).toBe(open);
      expect(c.lower - c.upper, `${at}: through two floors or more`).toBeGreaterThanOrEqual(1);
      expect(c.lower, `${at}: not on the lowest floor (the boss room is higher than a floor)`).toBeLessThan(
        b.plans.length - 1,
      );
      b.plans.forEach((p, floor) => {
        const on = floor >= c.upper && floor <= c.lower,
          { W: w, maps } = p.gen;
        expect(!!p.court, `${at} floor ${floor}`).toBe(on);
        if (!on) return;
        // the open middle is walked on only on an atrium's lowest floor; everywhere else it is a hole (solid)
        const ground = !open && floor === c.lower;
        // (a yard's bridge aside: see the next test)
        for (const k of c.tiles) {
          const walked = ground || p.court!.bridge.includes(k);
          expect(maps.grid[k], `${at} floor ${floor} tile ${k}`).toBe(walked ? 1 : 0);
          expect(p.voids[k], `${at} floor ${floor}: nothing drawn in the hole`).toBe(walked ? 0 : 1);
        }
        if (open) {
          for (const k of p.court!.balcony) expect(maps.grid[k], `${at} floor ${floor} balcony ${k}`).toBe(1);
        } else {
          // a gallery all round the hole
          const ring = new Set(c.tiles.flatMap(k => [k - 1, k + 1, k - w, k + w]).filter(k => !c.tiles.includes(k)));
          for (const k of ring) expect(maps.grid[k], `${at} floor ${floor} gallery ${k}`).toBe(1);
        }
      });
    }
  }
  devCourtOpen(null);
  // the other sectors have the one kind that fits them
  const kinds: Record<string, boolean> = {
    KWLN: true,
    RUIN: true,
    FORGE: false,
    NOISE: false,
    DATA: false,
    MALL: false,
    HOSP: false,
  };
  for (const biome of BIOMES.filter(x => x.code !== 'CITY'))
    for (let seed = 1; seed <= 20; seed++) {
      const c = makeBuilding(biome, biome.bosses[0]!, seed).court;
      if (c) expect(c.open, `${biome.code} seed ${seed}`).toBe(kinds[biome.code]);
    }
});
test('building: a yard is looked at from a balcony, walked along on one side, or crossed by a bridge', () => {
  const city = BIOMES.find(x => x.code === 'CITY')!,
    seen = { balcony: 0, walk: 0, bridge: 0 };
  for (const shape of ['balcony', 'walk', 'bridge', null] as const) {
    devCourtOpen(true, shape);
    for (let seed = 1; seed <= 20; seed++) {
      const b = makeBuilding(city, city.bosses[0]!, seed),
        c = b.court!,
        side = Math.sqrt(c.tiles.length);
      for (let floor = c.upper; floor <= c.lower; floor++) {
        const p = b.plans[floor]!,
          { W: w, maps } = p.gen,
          { balcony, bridge } = p.court!,
          at = `${shape} seed ${seed} floor ${floor}`,
          beside = (k: number) => [k - 1, k + 1, k - w, k + w].some(t => c.tiles.includes(t)),
          // which shape this floor got: a bridge's far end may find no way on, and the floor keeps the lookout
          got = bridge.length ? 'bridge' : balcony.length > 3 ? 'walk' : 'balcony';
        if (shape === null) seen[got]++;
        else if (shape !== 'bridge') expect(got, at).toBe(shape);
        else expect(got, at).not.toBe('walk');
        if (got === 'walk') {
          // the whole of one side, and one of its corners or both (where the floor goes on)
          expect(balcony.filter(beside).length, at).toBe(side);
          expect(balcony.length - side, `${at}: corners`).toBeGreaterThanOrEqual(1);
          const line = new Set(
            balcony.map(k => (Math.abs(balcony[1]! - balcony[0]!) === 1 ? Math.floor(k / w) : k % w)),
          );
          expect(line.size, `${at}: a straight walk`).toBe(1);
        } else {
          expect(balcony.length, at).toBe(got === 'bridge' ? 6 : 3);
          for (const k of balcony) expect(beside(k), `${at} balcony ${k}`).toBe(true);
        }
        if (got === 'bridge') {
          // straight across, from one lookout's middle to the other's; walked on under the open sky
          expect(bridge.length, at).toBe(side);
          const step = bridge[1]! - bridge[0]!;
          expect([1, w], at).toContain(Math.abs(step));
          bridge.forEach((k, n) => expect(k, at).toBe(bridge[0]! + n * step));
          expect(bridge[0]! - step, at).toBe(balcony[1]);
          expect(bridge[side - 1]! + step, at).toBe(balcony[4]);
          for (const k of bridge) expect(maps.grid[k] === 1 && p.noCeil[k] === 1 && !p.voids[k], at).toBe(true);
        }
      }
    }
  }
  devCourtOpen(null);
  for (const [shape, n] of Object.entries(seen)) expect(n, `${shape} by the dice`).toBeGreaterThan(5);
});
test('building: an atrium is passed through, and above its ground a bridge may cross it', () => {
  const city = BIOMES.find(x => x.code === 'CITY')!;
  let bridges = 0,
    floors = 0,
    deadEnds = 0;
  devCourtOpen(false);
  for (let seed = 1; seed <= 30; seed++) {
    const b = makeBuilding(city, city.bosses[0]!, seed),
      c = b.court!;
    for (let floor = c.upper; floor <= c.lower; floor++) {
      const p = b.plans[floor]!,
        { W: w, maps } = p.gen,
        { bridge } = p.court!,
        at = `seed ${seed} floor ${floor}`,
        // the ways in: floor in the wall round the gallery (the ring of tiles two out from the hole)
        i0 = (c.tiles[0]! % w) - 2,
        j0 = Math.floor(c.tiles[0]! / w) - 2,
        ring = Array.from({ length: 49 }, (_, n) => (j0 + Math.floor(n / 7)) * w + i0 + (n % 7)).filter(
          (_, n) => n % 7 === 0 || n % 7 === 6 || n < 7 || n >= 42,
        ),
        ways = ring.filter(k => maps.grid[k] === 1).length;
      floors++;
      expect(ways, `${at}: a way in`).toBeGreaterThanOrEqual(1);
      if (ways < 2) deadEnds++;
      if (!bridge.length) continue;
      bridges++;
      expect(floor, `${at}: not on the ground`).toBeLessThan(c.lower);
      // straight through the middle of the well, from the gallery to the gallery
      expect(bridge.length, at).toBe(3);
      const step = bridge[1]! - bridge[0]!;
      expect([1, w], at).toContain(Math.abs(step));
      expect(bridge[2], at).toBe(bridge[0]! + 2 * step);
      expect(bridge[1], `${at}: the middle tile`).toBe(c.tiles[4]);
      for (const k of [bridge[0]! - step, ...bridge, bridge[2]! + step])
        expect(maps.grid[k], `${at} tile ${k}`).toBe(1);
      for (const k of bridge) expect(p.voids[k], at).toBe(0);
    }
  }
  devCourtOpen(null);
  expect(bridges, 'some floors have a bridge').toBeGreaterThan(5);
  expect(bridges, 'not every floor').toBeLessThan(floors);
  // a second way in, on the far side or round the corner, nearly always found
  expect(deadEnds / floors, 'galleries with one way in only').toBeLessThan(0.05);
});
test("building: an atrium's ground is a room of its floor, with enemies in it", () => {
  const city = BIOMES.find(x => x.code === 'CITY')!;
  devCourtOpen(false);
  for (let seed = 1; seed <= 20; seed++) {
    const b = makeBuilding(city, city.bosses[0]!, seed),
      c = b.court!,
      d = b.plans[c.lower]!.gen,
      w = d.W,
      room = d.rooms.length - 1,
      at = `seed ${seed}`,
      // the middle and the gallery round it
      ground = new Set(c.tiles.flatMap(k => [-w - 1, -w, -w + 1, -1, 0, 1, w - 1, w, w + 1].map(o => k + o)));
    expect(d.rooms[room]!.w * d.rooms[room]!.h, at).toBe(ground.size);
    for (const k of ground) expect(d.maps.roomOf[k], `${at} tile ${k}`).toBe(room);
    // its ways in are corridors, not doors: never the lockdown room
    expect(roomDoors(d, room).closable, at).toBe(false);
    // on the floors above, the gallery is no room
    for (let floor = c.upper; floor < c.lower; floor++)
      for (const k of ground) expect(b.plans[floor]!.gen.maps.roomOf[k], `${at} floor ${floor}`).toBe(-1);
  }
  // in a run, enemies wait there as in any other room
  // (a building of the old downtown has one when a place fits, as nearly all do)
  for (let k = 0; k < 10; k++) {
    goBase();
    startRun();
    run.route = [BIOMES.indexOf(city)];
    run.bld = undefined;
    startStage();
    if (building!.court) break;
  }
  goToFloor(building!.court!.lower);
  const room = level.rooms.length - 1;
  expect(level.roomCount[room]).toBeGreaterThan(0);
  expect(enemies.filter(e => e.room === room && !e.dead).length).toBe(level.roomCount[room]);
  devCourtOpen(null);
});
test('building: the mall has a galleria, a long atrium with a gallery round it, ways in, bridges and a room on its ground', () => {
  const mall = BIOMES.find(x => x.code === 'MALL')!;
  let galleries = 0,
    floors = 0,
    single = 0,
    bridges = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const b = makeBuilding(mall, mall.bosses[0]!, seed),
      c = b.court;
    // (where no long place fits it is the square atrium: rare in the mall)
    if (!c || c.w === c.h) continue;
    galleries++;
    const at = `seed ${seed}`,
      W = b.plans[0]!.gen.W,
      is = c.tiles.map(k => k % W),
      js = c.tiles.map(k => Math.floor(k / W)),
      i0 = Math.min(...is),
      j0 = Math.min(...js),
      alongZ = c.h > c.w,
      length = Math.max(c.w, c.h);
    expect(Math.min(c.w, c.h), `${at}: 3 wide`).toBe(3);
    expect(length, `${at}: 7 or 9 long`).toBeGreaterThanOrEqual(7);
    expect(c.tiles.length, at).toBe(c.w * c.h);
    expect(Math.max(...is) - i0 + 1, at).toBe(c.w);
    expect(Math.max(...js) - j0 + 1, at).toBe(c.h);
    expect(c.open, at).toBe(false);
    expect(c.lower, `${at}: not on the lowest floor`).toBeLessThan(b.plans.length - 1);
    for (let floor = c.upper; floor <= c.lower; floor++) {
      const p = b.plans[floor]!,
        { maps } = p.gen,
        where = `${at} floor ${floor}`;
      // a gallery all round the hole, and the hole is a hole but on the ground
      for (let j = j0 - 1; j <= j0 + c.h; j++)
        for (let i = i0 - 1; i <= i0 + c.w; i++) {
          const k = j * W + i,
            hole = c.tiles.includes(k);
          if (!hole) expect(maps.grid[k], `${where} gallery ${i},${j}`).toBe(1);
          else if (floor < c.lower && !p.court!.bridge.includes(k))
            expect(maps.grid[k], `${where} hole ${i},${j}`).toBe(0);
        }
      // the ways in: floor in the wall round the gallery
      let ways = 0;
      for (let j = j0 - 2; j <= j0 + c.h + 1; j++)
        for (let i = i0 - 2; i <= i0 + c.w + 1; i++)
          if ((i < i0 - 1 || i > i0 + c.w || j < j0 - 1 || j > j0 + c.h) && maps.grid[j * W + i] === 1) ways++;
      floors++;
      expect(ways, `${where}: a way in`).toBeGreaterThanOrEqual(1);
      if (ways < 2) single++;
      const { bridge } = p.court!;
      if (!bridge.length) continue;
      bridges++;
      expect(floor, `${where}: not on the ground`).toBeLessThan(c.lower);
      // across the short way, from gallery to gallery, near the middle of the length
      expect(bridge.length, where).toBe(3);
      const along = bridge.map(k => (alongZ ? Math.floor(k / W) - j0 : (k % W) - i0));
      expect(new Set(along).size, `${where}: straight across`).toBe(1);
      expect(Math.abs(along[0]! - (length - 1) / 2), `${where}: near the middle`).toBeLessThanOrEqual(
        Math.floor(length / 4),
      );
      for (const k of bridge) expect(p.voids[k], where).toBe(0);
    }
    // the ground (the hole and the gallery round it) is a room with enemies
    const d = b.plans[c.lower]!.gen,
      room = d.rooms.length - 1;
    expect(d.rooms[room]!.w * d.rooms[room]!.h, at).toBe((c.w + 2) * (c.h + 2));
    for (let j = j0 - 1; j <= j0 + c.h; j++)
      for (let i = i0 - 1; i <= i0 + c.w; i++) expect(d.maps.roomOf[j * W + i], `${at} ground ${i},${j}`).toBe(room);
    expect(roomDoors(d, room).closable, at).toBe(false);
  }
  expect(galleries, 'nearly every mall building has one').toBeGreaterThan(30);
  expect(bridges, 'some floors have a bridge').toBeGreaterThan(5);
  expect(single / floors, 'galleries with one way in only').toBeLessThan(0.1);
});
test('building: the mall food court is a plaza two steps down inside an aisle of ground, and one walks down and up', () => {
  const mall = BIOMES.find(x => x.code === 'MALL')!;
  let courts = 0,
    bottoms = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const b = makeBuilding(mall, mall.bosses[0]!, seed);
    b.plans.forEach((p, floor) => {
      const room = foodCourtRoom(p);
      if (room < 0) return;
      courts++;
      const { maps, W: w, hazard } = p.gen,
        r = p.gen.rooms[room]!,
        ground = groundOf(maps),
        where = `seed ${seed} floor ${floor}`;
      expect(r.plat, `${where}: no deck in the food court`).toBeFalsy();
      for (let j = r.y; j < r.y + r.h; j++)
        for (let i = r.x; i < r.x + r.w; i++) {
          const k = j * w + i;
          if (maps.grid[k] !== 1) continue;
          const rim = i === r.x || j === r.y || i === r.x + r.w - 1 || j === r.y + r.h - 1;
          if (rim) expect(ground(k), `${where}: ${i},${j} by the wall stays on the ground`).toBeGreaterThanOrEqual(0);
          if (ground(k) >= 0) continue;
          // (a sunk tile is plain floor or cover: no door, ramp, hazard floor or link tile)
          expect([maps.door?.[k] ?? 0, maps.ramp[k]! >= 0 ? 1 : 0, hazard[k], p.noFloor[k], p.voids[k]], where).toEqual(
            [0, 0, 0, 0, 0],
          );
          if (ground(k) === SINK_FLOOR) bottoms++;
          // every neighbour (corners too) is a step away at most, so the bottom never meets the ground
          for (const o of [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1])
            if (maps.grid[k + o] === 1 && maps.ramp[k + o]! < 0)
              expect(Math.abs(ground(k + o) - ground(k)), `${where}: ${i},${j} + ${o}`).toBeLessThanOrEqual(
                -SINK_EDGE + 1e-6,
              );
        }
    });
  }
  expect(courts, 'a food court on most floors').toBeGreaterThan(40);
  expect(bottoms, 'with a bottom').toBeGreaterThan(300);
  // in a run: from the aisle down to the bottom and up again, on the legs and by the flow field
  const room = { floor: -1, aisle: -1, bottom: -1 };
  for (let tries = 0; tries < 10 && room.floor < 0; tries++) {
    goBase();
    startRun();
    run.route = [BIOMES.indexOf(mall)];
    run.bld = undefined;
    startStage();
    building!.plans.forEach((p, floor) => {
      const n = foodCourtRoom(p);
      if (room.floor >= 0 || n < 0) return;
      const { maps, W: w } = p.gen,
        r = p.gen.rooms[n]!,
        bottom = maps.hgt.findIndex((h, k) => h === SINK_FLOOR && maps.roomOf[k] === n);
      if (bottom < 0) return;
      // the aisle: a ground tile of the room's rim, floor all the way to the first step in
      const aisle = (r.y + 1) * w + r.x;
      if (maps.hgt[aisle] === 0 && maps.grid[aisle] === 1) Object.assign(room, { floor, aisle, bottom });
    });
  }
  expect(room.floor, 'a food court to walk in').toBeGreaterThanOrEqual(0);
  goToFloor(room.floor);
  const walk = (from: number, to: number) => {
    const o = {
      x: tileCenter(from % W),
      z: tileCenter(Math.floor(from / W)),
      fy: floorY(tileCenter(from % W), tileCenter(Math.floor(from / W))),
    };
    computeFlow(to % W, Math.floor(to / W));
    for (let n = 0; n < 600 && tileIndex(o.x, o.z) !== to; n++) {
      const d = flowDir(o.x, o.z);
      expect(d, 'a way on').not.toBeNull();
      moveCircle(o, d![0] * 0.2, d![1] * 0.2, 0.4);
      o.fy = floorY(o.x, o.z);
    }
    return o;
  };
  const down = walk(room.aisle, room.bottom);
  expect([tileIndex(down.x, down.z), down.fy]).toEqual([room.bottom, SINK_FLOOR]);
  const up = walk(room.bottom, room.aisle);
  expect([tileIndex(up.x, up.z), up.fy]).toEqual([room.aisle, 0]);
});
test('building: no door has floor beside it (a corridor to a stairwell or lift never passes a door)', () => {
  // a door stands across a corridor: floor before and behind it, wall on its two sides
  for (let seed = 1; seed <= 40; seed++) {
    const b = makeBuilding(BIOMES[seed % BIOMES.length]!, 'watcher', seed);
    b.plans.forEach((p, floor) => {
      const { W: w, maps } = p.gen;
      maps.door?.forEach((v, k) => {
        if (!v) return;
        // (the other half of a door 2 tiles wide is floor beside it, but it is a door)
        const open = (t: number) => maps.grid[t] === 1 && !maps.door![t],
          alongX = open(k - 1) || open(k + 1),
          alongZ = open(k - w) || open(k + w);
        expect(alongX && alongZ, `seed ${seed} floor ${floor} door ${k}`).toBe(false);
      });
    });
  }
});
test('building: nothing hangs on a wall that is not drawn (open down to a stairwell), in any sector', () => {
  // seeds whose buildings hand a wall prop a place on such a wall (in the walled city, floors 2, 0 and 1)
  for (const biome of BIOMES)
    for (const seed of [1, 3, 14]) {
      const b = makeBuilding(biome, biome.bosses[0]!, seed);
      b.plans.forEach((plan, floor) => {
        const g = new Group(),
          W = plan.gen.W,
          m = new Matrix4(),
          p = new Vector3();
        lookOf(biome)!.props(plan, g, createRng(seed + floor));
        g.children.forEach(c => {
          const mesh = c as InstancedMesh;
          for (let n = 0; n < mesh.count; n++) {
            mesh.getMatrixAt(n, m);
            p.setFromMatrixPosition(m);
            // the tile the thing is over, and how far it is from the tile's middle: a thing on a wall is pushed out
            // to within half a metre of that wall, a thing on the ceiling or a light on the ground is not. (A long
            // thing's end may be as far along its wall as that, so it counts as hanging on either wall: one of
            // them must be drawn)
            const i = Math.floor(p.x / T),
              j = Math.floor(p.z / T),
              dx = p.x - (i + 0.5) * T,
              dz = p.z - (j + 0.5) * T,
              walls: number[] = [];
            if (Math.abs(dx) >= T / 2 - 0.5) walls.push(j * W + i + Math.sign(dx));
            if (Math.abs(dz) >= T / 2 - 0.5) walls.push((j + Math.sign(dz)) * W + i);
            if (p.y < 0.1 || !walls.length) continue;
            expect(
              walls.every(k => plan.voids[k]),
              `${biome.code} seed ${seed} floor ${floor} tile ${i},${j}`,
            ).toBe(false);
          }
        });
      });
    }
});
test('building: a sector with corridors 2 wide has doors 2 tiles wide, so a room that can be shut (a lockdown)', () => {
  const city = BIOMES.find(x => x.gen.corridorW === 2)!;
  for (const seed of [31, 62, 93]) {
    const b = makeBuilding(city, city.bosses[0]!, seed);
    expect(b.lockdown, `seed ${seed}`).not.toBeNull();
    const p = b.plans[b.lockdown!.floor]!,
      door = p.gen.maps.door!,
      doors = roomDoors(p.gen, b.lockdown!.room).doors;
    // every door tile of the room has its other half beside it, or is a door 1 wide (the corridor to the boss room)
    for (const k of doors)
      expect([k - 1, k + 1, k - p.gen.W, k + p.gen.W].filter(t => door[t]).length, `door ${k}`).toBeLessThanOrEqual(1);
  }
});
test('building: the same seed gives the same three floors, joined at the same places, the boss room lowest', () => {
  const a = makeBuilding(BIOMES[0]!, 'watcher', 1234),
    b = makeBuilding(BIOMES[0]!, 'watcher', 1234),
    maps = (x: typeof a) => x.plans.map(p => Array.from(p.gen.maps.grid).join('')).join('|');
  expect(maps(a)).toBe(maps(b));
  expect(JSON.stringify([a.links, a.lockdown])).toBe(JSON.stringify([b.links, b.lockdown]));
  expect(maps(makeBuilding(BIOMES[0]!, 'watcher', 1235))).not.toBe(maps(a));
  expect(a.plans.map(p => !!p.hall).join()).toBe(a.plans.map((_, n) => n === a.plans.length - 1).join());
  expect(a.plans.map(p => p.gen.startIdx >= 0).join()).toBe(a.plans.map((_, n) => n === 0).join());
  // over many seeds: buildings of 3, 4 and 5 floors, and routes that go back up on the way down
  const many = Array.from({ length: 60 }, (_, n) => makeBuilding(BIOMES[0]!, 'watcher', n + 1));
  expect([...new Set(many.map(b => b.plans.length))].sort().join()).toBe('3,4,5');
  expect(
    many.some(b => b.route.some((f, n) => n > 0 && f < b.route[n - 1]!)),
    'a route that climbs',
  ).toBe(true);
  // 5 floors: the three floors between are taken in any order (a lift goes up to 3 floors)
  const five = new Set(Array.from({ length: 200 }, (_, n) => makeRoute(5, createRng(n + 1)).join('')));
  expect([...five].sort()).toEqual(['01234', '01324', '02134', '02314', '03124', '03214']);
  expect(new Set(Array.from({ length: 50 }, (_, n) => makeRoute(4, createRng(n + 1)).join(''))).size).toBe(2);
  expect(
    many.some(b => b.links.some(l => l.lower - l.upper === 2)),
    'a lift past a floor',
  ).toBe(true);
  for (const biome of BIOMES)
    for (let seed = 1; seed <= 25; seed++) {
      const kind = biome.bosses[seed % biome.bosses.length]!,
        bld = makeBuilding(biome, kind, seed),
        at = `${biome.code} seed ${seed}`,
        last = bld.plans[bld.plans.length - 1]!,
        hall = last.gen.rooms[last.hall!.room]!;
      expect(`${hall.w}x${hall.h}`, at).toBe('12x12');
      expect(last.gen.rooms.length - 1, at).toBeGreaterThanOrEqual(3);
      expect(last.gen.rooms.length - 1, at).toBeLessThanOrEqual(4);
      // the boss's pillars stand where they do in a boss arena (2 tiles in from the corners)
      expect(last.gen.maps.grid[(hall.y + 2) * last.gen.W + hall.x + 2], at).toBe(BOSS_META[kind]!.pillars ? 0 : 1);
      // the route: every floor once, from the top to the lowest, never more than two floors at a step
      const F = bld.plans.length;
      expect(F >= FLOORS_RANGE[0] && F <= FLOORS_RANGE[1], at).toBe(true);
      expect(bld.route.slice().sort().join(), at).toBe(bld.plans.map((_, n) => n).join());
      expect(bld.route[0] === 0 && bld.route[F - 1] === F - 1, at).toBe(true);
      // one stairwell or lift per step of the route, joining exactly those two floors
      expect(bld.links.length, at).toBe(F - 1);
      // the floors FLOOR_H apart, but the lowest LAST_GAP under the one above it (its boss room is taller)
      expect(
        bld.grounds
          .slice(1)
          .map((g, n) => bld.grounds[n]! - g)
          .join(),
        at,
      ).toBe([...Array(F - 2).fill(FLOOR_H), LAST_GAP].join());
      bld.links.forEach((l, n) => {
        expect([l.upper, l.lower].join(), at).toBe([bld.route[n]!, bld.route[n + 1]!].sort().join());
        expect(l.lower - l.upper, at).toBeLessThanOrEqual(l.kind === 'stairs' ? 1 : 3);
      });
      for (const l of bld.links) {
        const up = bld.plans[l.upper]!.gen.maps,
          lo = bld.plans[l.lower]!.gen.maps;
        if (l.kind === 'elevator') {
          // one tile, floor on the two floors it stops at, wall on a floor it only passes
          expect(l.strip.length === 1 && up.grid[l.a] === 1 && lo.grid[l.a] === 1 && l.a === l.b, at).toBe(true);
          for (let n = l.upper + 1; n < l.lower; n++) {
            expect(bld.plans[n]!.gen.maps.grid[l.a], at).toBe(0);
            expect(bld.plans[n]!.voids[l.a] && bld.plans[n]!.noCeil[l.a], `${at}: an open shaft`).toBeTruthy();
          }
          continue;
        }
        // the lower floor: the foot on the ground, ramps one RISE after the other (as many as the gap needs), the
        // landing at the next floor
        const gap = bld.grounds[l.upper]! - bld.grounds[l.lower]!,
          ramps = gap / 2;
        expect(l.strip.length, at).toBe(ramps + 3);
        expect(
          l.strip.every(k => lo.grid[k] === 1),
          at,
        ).toBe(true);
        expect(l.strip.map(k => lo.hgt[k]).join(), at).toBe(
          [0, ...Array.from({ length: ramps }, (_, n) => n * 2), gap, gap].join(),
        );
        expect(l.strip.map(k => (lo.ramp[k]! >= 0 ? 1 : 0)).join(), at).toBe([0, ...Array(ramps).fill(1), 0, 0].join());
        // the upper floor: only the landing is floor, on its ground; the same two tiles
        expect(l.strip.map(k => up.grid[k]).join(), at).toBe([...Array(ramps + 1).fill(0), 1, 1].join());
        expect(up.hgt[l.a] === 0 && up.hgt[l.b] === 0, at).toBe(true);
        expect([l.b, l.a].join(), at).toBe(l.strip.slice(-2).join());
        // drawn open: no wall over the stairs on the upper floor, no ceiling over them on the lower floor
        const upPlan = bld.plans[l.upper]!,
          loPlan = bld.plans[l.lower]!;
        expect(
          l.strip.slice(0, -2).every(k => upPlan.voids[k]),
          at,
        ).toBe(true);
        expect(
          l.strip.every(k => loPlan.noCeil[k]),
          at,
        ).toBe(true);
      }
      // no two doors one right after the other along a corridor; the boss room keeps its door
      bld.plans.forEach(p => {
        const door = p.gen.maps.door;
        door?.forEach((v, k) => {
          if (!v) return;
          // along the corridor: the axis with floor that is not door on it (the other half of a door 2 tiles wide
          // is beside it, across the corridor)
          const grid = p.gen.maps.grid,
            step = [1, p.gen.W].find(st => [k - st, k + st].some(t => grid[t] === 1 && !door[t]))!;
          for (const n of [1, 2]) expect(door[k + step * n], at).toBeFalsy();
        });
      });
      expect(last.gen.maps.door![last.hall!.door], at).toBe(1);
      // no hazard floor on a door, in the boss room, or on a stairwell or lift
      bld.plans.forEach(p => {
        p.gen.maps.door?.forEach((v, k) => expect(v && p.gen.hazard[k], at).toBeFalsy());
      });
      for (let j = hall.y; j < hall.y + hall.h; j++)
        for (let i = hall.x; i < hall.x + hall.w; i++) expect(last.gen.hazard[j * last.gen.W + i], at).toBe(0);
      for (const l of bld.links)
        for (const k of l.strip) for (const n of [l.upper, l.lower]) expect(bld.plans[n]!.gen.hazard[k], at).toBe(0);
      // the lockdown room can be shut, and is not the start room or the boss room
      const ld = bld.lockdown;
      if (!ld) continue;
      const plan = bld.plans[ld.floor]!;
      expect(roomDoors(plan.gen, ld.room).closable, at).toBe(true);
      expect(ld.room !== plan.gen.startIdx && ld.room !== plan.hall?.room, at).toBe(true);
    }
});
test('building run: a cleared room stays empty across floors and a resume; the checkpoint follows the floor', () => {
  // a building whose top floor has at least two ordinary rooms with enemies (one to empty, and one outside it to wound
  // an enemy in): on a small top floor the lockdown room can leave fewer
  const plainRooms = () => {
      const ld0 = building!.lockdown;
      return level.roomCount.filter((n, idx) => n > 0 && !(ld0 && ld0.floor === 0 && ld0.room === idx)).length;
    },
    // empty one room (not the lockdown room: that one sends waves)
    roomToEmpty = () => {
      const ld0 = building!.lockdown;
      return level.roomCount.findIndex((n, idx) => n > 0 && !(ld0 && ld0.floor === 0 && ld0.room === idx));
    },
    mended = (e: Enemy) =>
      enemies.some(o => !o.dead && !o.boss && o.def.medic && o.room === e.room && o.floor === e.floor),
    // the enemy to wound once the room is empty: outside it, with hp to spare, and no repair drone in its room
    // (hurting it wakes its room, and a drone there would mend it)
    woundedOutside = (room: number) => enemies.find(e => !e.dead && e.room !== room && e.hp > 2 && !mended(e));
  enterBuilding(() => plainRooms() >= 2 && woundedOutside(roomToEmpty()) !== undefined);
  tick(3);
  player.hp = 1e6;
  player.maxHp = 1e6;
  expect(level.floor).toBe(0);
  expect(run.bld!.step).toBe(0);
  expect(run.stage % PER).toBe(0);
  expect(level.portals.length, 'no gate: the floors are joined by stairwells and lifts').toBe(0);
  // empty one room (not the lockdown room: that one sends waves)
  const room = roomToEmpty();
  expect(room, 'an ordinary room with enemies to empty (not the lockdown room)').toBeGreaterThanOrEqual(0);
  for (let k = 0; k < 6 && level.roomCount[room]! > 0; k++) killRoom(room);
  expect(run.bld!.cleared[0]).toContain(room);
  // a wounded enemy and a dropped kit are left behind on this floor (in a room with no repair drone: hurting it wakes
  // its room, and a drone there would mend it)
  const hurt = woundedOutside(room)!;
  expect(hurt, 'a wounded enemy outside the emptied room, away from a repair drone').toBeTruthy();
  const hpLeft = hurt.hp - 1;
  hurtEnemy(hurt, 1, false);
  const [kx, kz] = roomSpot(level.rooms[level.startIdx]!),
    kit = addPickup('kit', kx + 3, kz),
    countsWas = level.roomCount.join();
  // the first step of the route: its stairwell or lift leads to the route's second floor
  const n = 0,
    next = building!.route[1]!,
    arrive = building!.links[n]!;
  useLink(n);
  tick(5);
  expect(enemies.includes(hurt) || query<Pickup>('pickup').includes(kit), 'the floor left took them along').toBe(false);
  expect(level.floor).toBe(next);
  expect(run.bld!.step, 'the second floor of the route, whichever floor that is').toBe(1);
  expect(stageLabel(run.stage)).toBe(`D${run.bld!.tier + 1} 2/${run.bld!.floors}`);
  // the top-left label also says which floor of the building this is, counted from the top
  expect(el('#stageLbl').textContent).toContain(` ${next + 1}F`);
  expect(progressOf(run.stage), 'the strength follows the route').toBeCloseTo(run.bld!.tier * 5 + 4 / run.bld!.floors);
  expect(tileIndex(player.x, player.z), 'the player stands where the link ends on this floor').toBe(arrive.b);
  // at the top of a stairwell that is a floor above this floor's ground; on a lift's platform it is the ground
  expect(player.fy).toBeCloseTo(arrive.kind === 'stairs' ? building!.grounds[0]! - building!.grounds[next]! : 0);
  expect((save.suspend as Snapshot | null)?.run.bld?.floor, 'the checkpoint is on the new floor').toBe(next);
  expect(level.startIdx, 'no start room down here').toBe(-1);
  tick(120);
  expect(level.floor, 'standing there changes nothing').toBe(next);
  useLink(n);
  tick(5);
  expect(level.floor).toBe(0);
  expect(level.roomCount[room]).toBe(0);
  expect(
    enemies.some(e => e.room === room && !e.dead),
    'the cleared room is still empty',
  ).toBe(false);
  expect(
    level.roomCount.some(c => c > 0),
    'the other rooms have their enemies',
  ).toBe(true);
  // the floor is as it was left: the same enemies (the wounded one still wounded), the kit still lying there
  expect(level.roomCount.join()).toBe(countsWas);
  expect(enemies.includes(hurt) && !hurt.dead).toBe(true);
  expect(hurt.hp).toBeCloseTo(hpLeft);
  expect(hurt.mesh.parent, 'drawn again').toBeTruthy();
  expect(query<Pickup>('pickup').includes(kit)).toBe(true);
  // suspending and resuming builds the same floor again, with the room still cleared and the map as it was explored
  // when the checkpoint was saved
  const gridWas = Array.from(grid).join(''),
    seenWas = (save.suspend as Snapshot | null)!.run.bld!.seen!;
  expect(seenWas.length).toBe(building!.plans.length);
  expect(
    building!.plans[0]!.seen.some(v => v === 1),
    'something of the top floor has been seen',
  ).toBe(true);
  suspendRun();
  building!.plans.forEach(p => p.seen.fill(0)); // (the building in memory is the same object here: make sure the map is read back)
  setBuilding(null);
  resumeRun();
  expect(packSeen(building!).join(), 'the explored map came back').toBe(seenWas.join());
  tick(5);
  expect(Array.from(grid).join('')).toBe(gridWas);
  expect(level.roomCount[room]).toBe(0);
});
test('building: a yard is open to the sky (no floor above it has floor over it)', () => {
  devCourtOpen(true);
  for (const biome of BIOMES)
    for (let seed = 1; seed <= 20; seed++) {
      const b = makeBuilding(biome, biome.bosses[0]!, seed),
        c = b.court;
      if (!c?.open) continue;
      const W = b.plans[0]!.gen.W,
        is = c.tiles.map(k => k % W),
        js = c.tiles.map(k => Math.floor(k / W));
      // (the open middle and the wall round it)
      for (let f = 0; f < c.upper; f++)
        for (let j = Math.min(...js) - 1; j <= Math.max(...js) + 1; j++)
          for (let i = Math.min(...is) - 1; i <= Math.max(...is) + 1; i++)
            expect(b.plans[f]!.gen.maps.grid[j * W + i], `${biome.code} seed ${seed} floor ${f} tile ${i},${j}`).toBe(
              0,
            );
    }
  devCourtOpen(null);
});
test('building: the layout a seed gives is that of BUILDING_V', () => {
  // A few buildings of every sector (the maps and the floor heights), as one number. When this fails, the same seed gives another building now: raise
  // BUILDING_V in src/world/building.ts (a run suspended before is then fitted onto the new building), and put the new
  // version and number here
  devCourtOpen(null);
  let h = 2166136261; // FNV-1a
  const mix = (text: string) => {
    for (let k = 0; k < text.length; k++) h = Math.imul(h ^ text.charCodeAt(k), 16777619) >>> 0;
  };
  for (const biome of BIOMES)
    for (const seed of [1, 2, 3]) {
      const b = makeBuilding(biome, biome.bosses[0]!, seed);
      b.plans.forEach(p => mix(Array.from(p.gen.maps.grid).join('') + Array.from(p.gen.maps.hgt).join()));
      mix(JSON.stringify([b.route, b.links.map(l => [l.kind, l.upper, l.lower, l.a, l.b]), b.lockdown, !!b.court]));
    }
  expect(`v${BUILDING_V} ${h.toString(16)}`).toBe('v6 abb6236');
});
test('mall: the big rooms have islands of cover, and one can still walk to every doorway of the room', () => {
  devCourtOpen(null);
  const mall = BIOMES.find(b => b.code === 'MALL')!;
  let islands = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const b = makeBuilding(mall, mall.bosses[0]!, seed);
    b.plans.forEach((p, floor) => {
      const { W, maps, rooms } = p.gen,
        food = foodCourtRoom(p),
        at = `seed ${seed} floor ${floor}`;
      rooms.forEach((r, n) => {
        const mine = p.islands.filter(s => s.i >= r.x && s.i < r.x + r.w && s.j >= r.y && s.j < r.y + r.h);
        islands += mine.length;
        if (!mine.length) return;
        // (only a big room with nothing special in it, and 1 to 3 islands, two tiles from the walls, each of waist-high cover)
        expect(r.w * r.h, `${at} room ${n}`).toBeGreaterThanOrEqual(ISLAND_MIN_AREA);
        expect([r.plat, n === p.gen.startIdx, n === p.hall?.room, n === food], `${at} room ${n}`).toEqual([
          undefined,
          false,
          false,
          false,
        ]);
        expect(mine.length).toBeLessThanOrEqual(3);
        for (const s of mine) {
          expect(s.w * s.h).toBeGreaterThanOrEqual(2);
          expect(s.w * s.h).toBeLessThanOrEqual(4);
          expect(s.i - r.x, `${at} room ${n}`).toBeGreaterThanOrEqual(2);
          expect(s.j - r.y, `${at} room ${n}`).toBeGreaterThanOrEqual(2);
          expect(r.x + r.w - (s.i + s.w), `${at} room ${n}`).toBeGreaterThanOrEqual(2);
          expect(r.y + r.h - (s.j + s.h), `${at} room ${n}`).toBeGreaterThanOrEqual(2);
          for (let j = s.j; j < s.j + s.h; j++)
            for (let i = s.i; i < s.i + s.w; i++) {
              expect([maps.cover[j * W + i], maps.hgt[j * W + i]], `${at} room ${n}`).toEqual([
                1,
                Math.fround(COVER_H),
              ]);
              expect(p.gen.hazard[j * W + i]).toBe(0);
            }
        }
        // the doorways of the room (the room's floor tiles with a floor tile outside the room next to them) are all joined
        // by walking over the room's tiles that are not cover
        const inside = (k: number) =>
            k % W >= r.x && k % W < r.x + r.w && ((k / W) | 0) >= r.y && ((k / W) | 0) < r.y + r.h,
          free = (k: number) => inside(k) && maps.grid[k] === 1 && !maps.cover[k],
          doorways: number[] = [];
        for (let j = r.y; j < r.y + r.h; j++)
          for (let i = r.x; i < r.x + r.w; i++) {
            const k = j * W + i;
            if (free(k) && [1, -1, W, -W].some(o => !inside(k + o) && maps.grid[k + o] === 1)) doorways.push(k);
          }
        expect(doorways.length, `${at} room ${n}`).toBeGreaterThan(0);
        const seen = new Set<number>(doorways.slice(0, 1)),
          queue = doorways.slice(0, 1);
        for (let q = 0; q < queue.length; q++)
          for (const o of [1, -1, W, -W]) {
            const k = queue[q]! + o;
            if (free(k) && !seen.has(k)) {
              seen.add(k);
              queue.push(k);
            }
          }
        expect(
          doorways.every(k => seen.has(k)),
          `${at} room ${n}: the doorways are not all joined`,
        ).toBe(true);
      });
    });
  }
  expect(islands).toBeGreaterThan(30);
  // (the other sectors have none; the hospital's are tested below)
  for (const biome of BIOMES.filter(x => x.code !== 'MALL' && x.code !== 'HOSP'))
    expect(makeBuilding(biome, biome.bosses[0]!, 1).plans.every(p => !p.islands.length)).toBe(true);
});
test('hospital: the rooms have kinds, the biggest is the waiting hall, and the islands leave the room walkable', () => {
  devCourtOpen(null);
  const hosp = BIOMES.find(b => b.code === 'HOSP')!,
    kindsSeen = new Set<number>();
  let islands = 0,
    halls = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const b = makeBuilding(hosp, hosp.bosses[0]!, seed);
    b.plans.forEach((p, floor) => {
      const { W, maps, rooms } = p.gen,
        kinds = hospRoomKinds(p),
        waiting = waitingRoom(p),
        at = `seed ${seed} floor ${floor}`;
      expect(kinds.length).toBe(rooms.length);
      kinds.forEach((kind, n) => {
        kindsSeen.add(kind);
        expect(kind, `${at} room ${n}`).toBeGreaterThanOrEqual(-1);
        expect(kind, `${at} room ${n}`).toBeLessThan(HOSP_KINDS);
        // (the start room and the operating theatre have no kind)
        if (n === p.gen.startIdx || n === p.hall?.room) expect(kind, `${at} room ${n}`).toBe(-1);
        if (kind === KIND_WAITING) expect(n, `${at} room ${n}`).toBe(waiting);
      });
      if (waiting >= 0) {
        halls++;
        const r = rooms[waiting]!;
        expect(r.w * r.h).toBeGreaterThanOrEqual(48);
        expect(rooms.every((o, n) => n === waiting || kinds[n] === -1 || o.plat || o.w * o.h <= r.w * r.h)).toBe(true);
      }
      p.islands.forEach(s => {
        islands++;
        const n = maps.roomOf[s.j * W + s.i]!;
        expect(kinds[n], `${at} room ${n}`).toBeGreaterThanOrEqual(0);
      });
      // one can walk from any free tile of a room that has islands to every other
      rooms.forEach((r, n) => {
        if (!p.islands.some(s => maps.roomOf[s.j * W + s.i] === n)) return;
        const free: number[] = [];
        for (let j = r.y; j < r.y + r.h; j++)
          for (let i = r.x; i < r.x + r.w; i++)
            if (maps.grid[j * W + i] === 1 && !maps.cover[j * W + i]) free.push(j * W + i);
        const reached = new Set<number>(free.slice(0, 1)),
          queue = free.slice(0, 1);
        for (let q = 0; q < queue.length; q++)
          for (const o of [1, -1, W, -W]) {
            const k = queue[q]! + o;
            if (free.includes(k) && !reached.has(k)) {
              reached.add(k);
              queue.push(k);
            }
          }
        expect(reached.size, `${at} room ${n}: the free floor is cut in two`).toBe(free.length);
      });
    });
  }
  expect(islands).toBeGreaterThan(10);
  expect(halls).toBeGreaterThan(10);
  // (every kind comes up somewhere)
  for (let kind = 0; kind < HOSP_KINDS; kind++) expect(kindsSeen.has(kind), `kind ${kind}`).toBe(true);
});
