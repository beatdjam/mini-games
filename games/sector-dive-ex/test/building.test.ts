// Smoke test for Sector Dive Extended, the building: layout of floors, courtyards, atriums, the mall and the hospital. Boots the game page (setup.ts) once for this file (bootGame) and runs it through the real loop by hand.
// Each test makes the state it needs; the file passes on its own and in any order (the dice are seeded where a test depends on them).
import { beforeAll, expect, test } from 'vitest';
import { Group, Matrix4, Vector3 } from 'three';
import type { InstancedMesh } from 'three';
import type { Enemy, Pickup, Snapshot } from '../src/data/types.ts';
import { createRng, el } from '@engine/core/index.ts';
import { query } from '@engine/core/index.ts';
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
} from '@engine/world/index.ts';
import { COVER_H } from '../src/data/level.ts';
import { BIOMES } from '../src/data/biomes.ts';
import { foodCourtRoom } from '../src/world/looks/mall/rooms.ts';
import { groundOf } from '../src/world/meshParts.ts';
import { lookOf } from '../src/world/looks.ts';
import { DEPTH_SCALE, PER } from '../src/data/progress.ts';
import { save } from '../src/core/save.ts';
import { progressOf } from '../src/core/rules.ts';
import { level, roomSpot } from '../src/world/level.ts';
import { addPickup, enemies } from '../src/world/entities.ts';
import { player, run } from '../src/actors/player.ts';
import { hurtEnemy } from '../src/actors/combat.ts';
import { stageLabel } from '../src/core/stages.ts';
import { goBase, startRun, startStage, useLink } from '../src/flow/run.ts';
import { building, devCourtOpen, makeBuilding, packSeen, roomDoors, setBuilding } from '../src/world/building.ts';
import { resumeRun, suspendRun } from '../src/flow/suspend.ts';
import { tick, bootGame, killRoom, goToFloor, enterBuilding } from './helpers.ts';

beforeAll(bootGame);

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
  expect(progressOf(run.stage), 'the strength follows the route').toBeCloseTo(
    run.bld!.tier * 5 * DEPTH_SCALE + 4 / run.bld!.floors,
  );
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

test("building: a mall atrium's ground has a fountain and planters that are cover, and is walked round them", () => {
  const mall = BIOMES.find(x => x.code === 'MALL')!;
  let atriums = 0,
    planters = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const b = makeBuilding(mall, mall.bosses[0]!, seed),
      c = b.court;
    if (!c) continue;
    atriums++;
    const p = b.plans[c.lower]!,
      { maps, W: w } = p.gen,
      at = `seed ${seed}`,
      pieces = [...(p.pieces ?? new Map<number, string>())];
    // the fountain on the middle tile of the open middle, the planters in it too; all of them cover
    const is = c.tiles.map(k => k % w),
      js = c.tiles.map(k => (k / w) | 0),
      middle = (Math.min(...js) + ((c.h - 1) >> 1)) * w + Math.min(...is) + ((c.w - 1) >> 1);
    expect(p.pieces?.get(middle), at).toBe('fountain');
    for (const [k] of pieces) {
      expect(c.tiles, `${at} tile ${k}`).toContain(k);
      expect(maps.cover[k], `${at} tile ${k}`).toBe(1);
      expect(maps.hgt[k], `${at} tile ${k}`).toBeCloseTo(COVER_H); // (the heights are float32)
    }
    planters += pieces.filter(([, kind]) => kind === 'planter').length;
    // every other tile of the ground's room is reached from any one of them, round the pieces
    const room = p.gen.rooms.length - 1,
      free = [...maps.roomOf.keys()].filter(k => maps.roomOf[k] === room && maps.grid[k] === 1 && !maps.cover[k]),
      seen = new Set([free[0]!]),
      todo = [free[0]!];
    while (todo.length) {
      const k = todo.pop()!;
      for (const n of [k - 1, k + 1, k - w, k + w])
        if (free.includes(n) && !seen.has(n)) {
          seen.add(n);
          todo.push(n);
        }
    }
    expect(seen.size, at).toBe(free.length);
  }
  expect(atriums).toBeGreaterThan(0);
  expect(planters, 'the galleries have planters').toBeGreaterThan(0);
  // in a run, a cleared room's reward on the ground is not put on the fountain
  for (let k = 0; k < 10; k++) {
    goBase();
    startRun();
    run.route = [BIOMES.indexOf(mall)];
    run.bld = undefined;
    startStage();
    if (building!.court) break;
  }
  goToFloor(building!.court!.lower);
  const spot = tileIndex(...roomSpot(level.rooms[level.rooms.length - 1]!));
  expect(building!.plans[building!.court!.lower]!.pieces?.has(spot)).toBe(false);
});
