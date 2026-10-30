// Smoke test for Sector Dive Extended, the lockdown: a room that shuts and the waves inside it. Boots the game page (setup.ts) once for this file (bootGame) and runs it through the real loop by hand.
// Each test makes the state it needs; the file passes on its own and in any order (the dice are seeded where a test depends on them).
import { beforeAll, expect, test } from 'vitest';
import type { Pickup } from '../src/data/types.ts';
import { el } from '@engine/core/util.ts';
import { query } from '@engine/core/world.ts';
import { SIDE_STEP, T, W, activeTileGrid, floorY, tileIndex } from '@engine/world/tiles.ts';
import { level, roomSpot } from '../src/world/level.ts';
import { enemies, spawnEnemy } from '../src/world/entities.ts';
import { player, run } from '../src/actors/player.ts';
import { goBase } from '../src/flow/run.ts';
import { building, roomDoors } from '../src/world/building.ts';
import { isDoorLocked } from '@engine/world/doors.ts';
import { DOOR_PASS } from '@engine/world/tiles.ts';
import { setState, show } from '../src/flow/state.ts';
import { openPerk } from '../src/screens/perk.ts';
import { tick, bootGame, killRoom, goToFloor, enterBuilding } from './helpers.ts';

beforeAll(bootGame);

test('lockdown: the room does not shut on a player still in its doorway (they could walk back out of it)', () => {
  enterBuilding(b => !!b.lockdown);
  const ld = building!.lockdown!;
  goToFloor(ld.floor);
  const world = activeTileGrid().world,
    doors = roomDoors(building!.plans[ld.floor]!.gen, ld.room).doors,
    locked = () => doors.some(k => isDoorLocked(world, k));
  // the room's tile just inside one of its doors, and the way from that tile to the door
  const door = doors[0]!,
    [di, dj] = SIDE_STEP.find(([a, b]) => level.roomOf[door + a + b * W] === ld.room)!,
    inside = door + di + dj * W,
    stand = (fromDoor: number) => {
      // (fromDoor = metres into the room from the edge of the door's tile)
      player.x = ((door % W) + 0.5) * T + di * (T / 2 + fromDoor);
      player.z = (Math.floor(door / W) + 0.5) * T + dj * (T / 2 + fromDoor);
      player.fy = floorY(player.x, player.z);
    };
  stand(0.2);
  tick(3);
  expect(level.roomOf[tileIndex(player.x, player.z)], 'on a tile of the room').toBe(ld.room);
  expect(tileIndex(player.x, player.z)).toBe(inside);
  expect(locked(), 'not shut: the player is still in the doorway').toBe(false);
  stand(T / 2);
  tick(3);
  expect(locked(), 'shut once the player is clear of the door').toBe(true);
  goBase();
});
test('lockdown: it waits for an enemy holding a door open, and a player who gets out past it is not left outside', () => {
  enterBuilding(b => !!b.lockdown);
  const ld = building!.lockdown!;
  goToFloor(ld.floor);
  const world = activeTileGrid().world,
    doors = roomDoors(building!.plans[ld.floor]!.gen, ld.room).doors,
    locked = () => doors.some(k => isDoorLocked(world, k)),
    alarm = () => el('#alarm').classList.contains('on'),
    door = doors[0]!,
    [di, dj] = SIDE_STEP.find(([a, b]) => level.roomOf[door + a + b * W] === ld.room)!,
    at = (k: number): [number, number] => [((k % W) + 0.5) * T, (Math.floor(k / W) + 0.5) * T],
    put = (x: number, z: number) => {
      player.x = x;
      player.z = z;
      player.fy = floorY(x, z);
    };
  // an awake enemy stands in the doorway (one that does not move), so the door is open when the room shuts
  const guard = spawnEnemy('turret', ...at(door), ld.room, 1);
  guard.active = true;
  level.roomCount[ld.room]!++;
  tick(30);
  expect(world.doorOpen![door], 'the enemy has opened the door').toBe(1);
  put(...roomSpot(level.rooms[ld.room]!));
  tick(30);
  expect(locked(), 'locked with the player inside').toBe(true);
  expect(world.doorOpen![door], 'the door cannot shut on the enemy in it').toBeGreaterThanOrEqual(DOOR_PASS);
  expect(alarm(), 'no lockdown while a door is open').toBe(false);
  // the player walks out through it, two tiles down the corridor
  put(...at(door - 2 * (di + dj * W)));
  tick(3);
  expect(locked(), 'outside: the room is open again').toBe(false);
  // the enemy is gone; back inside, the doors shut and then the lockdown starts
  guard.dead = true;
  level.roomCount[ld.room]!--;
  put(...roomSpot(level.rooms[ld.room]!));
  tick(30);
  expect(locked(), 'back inside: shut again').toBe(true);
  expect(
    doors.every(k => world.doorOpen![k] === 0),
    'every door is shut',
  ).toBe(true);
  expect(alarm(), 'the lockdown is on').toBe(true);
  goBase();
});
test('lockdown: the room shuts, two waves come, then it opens and leaves a chip', () => {
  enterBuilding(b => !!b.lockdown);
  const ld = building!.lockdown!;
  goToFloor(ld.floor);
  const world = activeTileGrid().world,
    doors = roomDoors(building!.plans[ld.floor]!.gen, ld.room).doors,
    locked = () => doors.every(k => isDoorLocked(world, k)),
    chips = () => query<Pickup>('pickup').filter(p => p.kind === 'chip').length;
  expect(doors.length).toBeGreaterThan(0);
  expect(locked(), 'open until the player walks in').toBe(false);
  const [x, z] = roomSpot(level.rooms[ld.room]!);
  player.x = x;
  player.z = z;
  player.fy = floorY(x, z);
  tick(2);
  expect(locked(), 'shut with the player inside').toBe(true);
  // the lockdown starts once the doors are shut: one left open (an enemy near it, the player's own way in) takes
  // 0.4 s to close
  tick(30);
  expect(el('#alarm').classList.contains('on'), 'the red frame is up').toBe(true);
  expect(el('#alarmText').textContent).toContain('1/3');
  // the room's own enemies, then two waves: after each of the first three clears there are enemies again
  let waves = 0;
  const chipsWas = chips();
  for (let k = 0; k < 20 && !run.bld!.ld; k++) {
    for (let n = 0; n < 6 && level.roomCount[ld.room]! > 0 && !run.bld!.ld; n++) {
      const before = enemies.filter(e => e.room === ld.room && !e.dead).length;
      killRoom(ld.room);
      // a wave arrived when the room has enemies that were not there before the kills
      if (!run.bld!.ld && enemies.filter(e => e.room === ld.room && !e.dead && e.active).length >= 2 && before > 0)
        waves++;
    }
  }
  expect(run.bld!.ld, 'the lockdown is over').toBe(1);
  expect(el('#alarm').classList.contains('on'), 'the red frame is gone').toBe(false);
  expect(waves, 'waves came before it ended').toBeGreaterThanOrEqual(2);
  expect(locked(), 'open again').toBe(false);
  expect(doors.some(k => isDoorLocked(world, k))).toBe(false);
  expect(run.bld!.cleared[ld.floor]).toContain(ld.room);
  // the reward: a chip whose choices are all rare and a weapon of the second rarity or better
  const reward = query<Pickup>('pickup');
  expect(chips(), 'one chip to pick up').toBe(chipsWas + 1);
  expect(reward.filter(q => q.kind === 'chip' && q.rare).length).toBe(1);
  expect(
    reward.some(q => q.kind === 'weapon' && q.w!.r >= 1),
    'and a weapon',
  ).toBe(true);
  openPerk('test', undefined, undefined, 1, true);
  const cards = [...document.querySelectorAll('#perkList .perk')];
  expect(cards.length > 0 && cards.every(c => c.classList.contains('rare')), 'an all-rare pick').toBe(true);
  show(null);
  setState('play');
  // every other room of the building has its enemies: a lockdown takes no ordinary fight away (the room before the
  // boss and the start room aside)
  building!.plans.forEach((p, floor) => {
    goToFloor(floor);
    p.gen.rooms.forEach((_, room) => {
      const empty = room === p.gen.startIdx || room === p.hall?.room || run.bld!.cleared[floor]!.includes(room);
      expect(level.roomCount[room]! > 0, `floor ${floor} room ${room}`).toBe(!empty);
    });
  });
  goBase();
});
