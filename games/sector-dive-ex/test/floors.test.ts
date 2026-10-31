// Smoke test for Sector Dive Extended, moving through a building: stairwells, lifts, followers, neighbour floors and the boss room. Boots the game page (setup.ts) once for this file (bootGame) and runs it through the real loop by hand.
// Each test makes the state it needs; the file passes on its own and in any order (the dice are seeded where a test depends on them).
import { beforeAll, expect, test } from 'vitest';
import type { Pickup } from '../src/data/types.ts';
import { query } from '@engine/core/world.ts';
import { T, W, activeTileGrid, floorY, grid, tileIndex } from '@engine/world/tiles.ts';
import { joy } from '@engine/ui/input.ts';
import { HALL_H, WALL_H } from '../src/data/level.ts';
import { BIOMES } from '../src/data/biomes.ts';
import { isMilestone, PER, TUNE } from '../src/data/progress.ts';
import {
  buildFixedLevel,
  floorDrawn,
  followersOnTheWay,
  level,
  roomSpot,
  showNeighbourFloors,
  stashedRoomCount,
} from '../src/world/level.ts';
import { boss, enemies, pBullets, spawnEnemy } from '../src/world/entities.ts';
import { player, run } from '../src/actors/player.ts';
import { newWeapon } from '../src/actors/weapons.ts';
import { hurtEnemy } from '../src/actors/combat.ts';
import { bossStageOf, planOf, stageInfo } from '../src/core/stages.ts';
import { RUNNING_SPREAD, fire } from '../src/actors/firing.ts';
import { arenaRoom, minionCount, spawnBoss, spawnMinion } from '../src/actors/bosses/common.ts';
import { controlState } from '../src/ui/input.ts';
import { goBase, nextStage, startRun, crossToFloor } from '../src/flow/run.ts';
import { FLOOR_H, building } from '../src/world/building.ts';
import { ridingY, supplyChips } from '../src/flow/events.ts';
import { isDoorLocked } from '@engine/world/doors.ts';
import { update } from '../src/flow/update.ts';
import { runSystems } from '@engine/core/loop.ts';
import { stateIs, tick, bootGame, goToFloor, putOnTile, enterBuilding } from './helpers.ts';

beforeAll(bootGame);

test('stairwell: walking over the landing changes the floor without moving the player in the world', () => {
  // a run whose building has a stairwell (about half the steps of a route are one)
  enterBuilding(b => b.links.some(x => x.kind === 'stairs'));
  const l = building!.links.find(x => x.kind === 'stairs')!,
    stepOf = (floor: number) => building!.route.indexOf(floor);
  goToFloor(l.upper);
  enemies.slice().forEach(e => hurtEnemy(e, 1e6, false));
  const S = l.strip,
    [foot, top, l1, l2] = [S[0]!, S[S.length - 3]!, S[S.length - 2]!, S[S.length - 1]!],
    gap = building!.grounds[l.upper]! - building!.grounds[l.lower]!;
  // on the upper floor the far landing tile changes nothing
  putOnTile(l2);
  tick(2);
  expect(level.floor).toBe(l.upper);
  // at the stairwell the floor below is drawn (it is seen down the stairs)
  // (another stairwell or lift of this floor may be near too, so the other floors are not checked)
  expect(floorDrawn(l.upper) && floorDrawn(l.lower)).toBe(true);
  expect(player.fy).toBeCloseTo(0);
  // the tile nearer the stairs is the lower floor's: its ground is a floor below, so the player is the gap above it
  putOnTile(l1);
  tick(2);
  expect(level.floor).toBe(l.lower);
  expect(player.fy, 'the same height in the world').toBeCloseTo(gap);
  expect(floorY(player.x, player.z)).toBeCloseTo(gap);
  expect(run.bld!.step).toBe(stepOf(l.lower));
  // down the ramps to the foot
  putOnTile(top);
  tick(2);
  expect(player.fy).toBeGreaterThan(gap - 2.01);
  expect(player.fy).toBeLessThan(gap);
  putOnTile(foot);
  tick(2);
  expect(level.floor).toBe(l.lower);
  expect(player.fy).toBeCloseTo(0);
  // and back up: the far landing tile is the upper floor's
  putOnTile(l1);
  tick(2);
  expect(level.floor, 'still the lower floor on the near tile').toBe(l.lower);
  putOnTile(l2);
  tick(2);
  expect(level.floor).toBe(l.upper);
  expect(player.fy).toBeCloseTo(0);
  expect(run.bld!.step).toBe(stepOf(l.upper));
});
test('running: the dash held on after a dash keeps the player fast and drains stamina until it is let go', () => {
  // a long straight corridor, the player walking along it (the stick pushed forward)
  const rows = ['#'.repeat(64), '#' + '.'.repeat(62) + '#', '#'.repeat(64)];
  goBase();
  startRun();
  tick(2);
  buildFixedLevel(BIOMES[0]!, { rows, rooms: [{ x: 1, y: 1, w: 62, h: 1 }], start: 0, exit: 0 });
  const walk = (frames: number) => {
    const from = player.x;
    tick(frames);
    return Math.abs(player.x - from);
  };
  player.x = 2 * T;
  player.z = 1.5 * T;
  player.fy = 0;
  player.yaw = -Math.PI / 2; // facing +x
  joy.y = -1;
  tick(2);
  const plain = walk(30);
  expect(plain).toBeGreaterThan(1);
  // a dash, the button held: after the dash the player runs
  player.st = player.stMax;
  controlState.dashHeld = true;
  controlState.dashReq = true;
  tick(Math.ceil(TUNE.dashTime * 60) + 2);
  expect(player.sprint).toBe(true);
  const st0 = player.st,
    run1 = walk(30);
  expect(run1 / plain, 'sprintSpeed times as far').toBeCloseTo(TUNE.sprintSpeed, 1);
  expect(st0 - player.st, 'half a second of sprintCost').toBeCloseTo(TUNE.sprintCost * 0.5, 0);
  // let go: back to walking, and the stamina refills after the usual delay
  controlState.dashHeld = false;
  tick(1);
  expect(player.sprint).toBe(false);
  expect(walk(30) / plain).toBeCloseTo(1, 1);
  tick(60);
  expect(player.st).toBeGreaterThan(st0 - TUNE.sprintCost * 0.5);
  // holding the button on its own (no new press) does not run
  controlState.dashHeld = true;
  expect(walk(30) / plain).toBeCloseTo(1, 1);
  // shooting on the run scatters the rounds, even from a rail gun (which is steady when walking)
  const keep = player.weapons[player.cur];
  player.weapons[player.cur] = newWeapon('rail', 0);
  player.extra = 0;
  player.pitch = 0;
  const widest = () => {
    let most = 0;
    for (let k = 0; k < 40; k++) {
      pBullets.forEach(b => {
        b.alive = false;
      });
      player.fireCd = 0;
      player.reloadT = 0;
      player.weapons[player.cur]!.mag = 4;
      fire();
      const b = pBullets.find(x => x.alive)!;
      most = Math.max(most, Math.abs(Math.atan2(b.vz, b.vx))); // the player faces +x
    }
    return most;
  };
  joy.y = 0; // standing still for the shots: only the running state differs
  player.sprint = true;
  player.dashT = 0;
  expect(widest(), 'running').toBeGreaterThan(RUNNING_SPREAD * 0.6);
  player.sprint = false;
  // (the muzzle sits beside the eye, so a straight shot is a hair off the facing direction)
  expect(widest(), 'not running: straight').toBeLessThan(RUNNING_SPREAD * 0.3);
  joy.y = -1;
  player.weapons[player.cur] = keep;
  // touch: held for a moment, the run goes on after the button is let go, until the stick comes back
  controlState.dashHeld = false;
  tick(2);
  player.st = player.stMax;
  player.stDelay = 9;
  joy.id = 1;
  controlState.dashHeld = true;
  controlState.dashReq = true;
  tick(Math.ceil(TUNE.dashTime * 60) + 20);
  controlState.dashHeld = false;
  tick(20);
  expect(player.sprint, 'still running with the thumb off the button').toBe(true);
  joy.y = -0.3;
  tick(2);
  expect(player.sprint, 'the stick came back: walking').toBe(false);
  joy.y = -1;
  // a short press does not latch: the run ends with the button
  player.st = player.stMax;
  controlState.dashHeld = true;
  controlState.dashReq = true;
  tick(Math.ceil(TUNE.dashTime * 60) + 2);
  controlState.dashHeld = false;
  tick(2);
  expect(player.sprint, 'a short press: no run').toBe(false);
  joy.id = null;
  // too little stamina for a dash: no dash, but holding on still runs on what is left
  controlState.dashHeld = false;
  tick(2);
  player.st = TUNE.dashCost - 5;
  player.stDelay = 9; // no refill during the check
  controlState.dashHeld = true;
  controlState.dashReq = true;
  tick(1);
  expect(player.dashT, 'no dash').toBeLessThanOrEqual(0);
  expect(player.sprint).toBe(true);
  expect(walk(30) / plain).toBeCloseTo(TUNE.sprintSpeed, 1);
  // it stops when the stamina is gone
  controlState.dashHeld = false;
  tick(2);
  controlState.dashHeld = true;
  player.st = TUNE.dashCost + 2;
  controlState.dashReq = true;
  tick(Math.ceil(TUNE.dashTime * 60) + 2);
  expect(player.sprint).toBe(true);
  tick(60);
  expect(player.sprint, 'out of stamina').toBe(false);
  controlState.dashHeld = false;
  joy.y = 0;
  // a run in a building again, for the tests below
  goBase();
  startRun();
  tick(2);
});
test('dash: in long frames (20 fps) a dash still goes up a stairwell', () => {
  enterBuilding(b => b.links.some(l => l.kind === 'stairs'));
  const b = building!,
    stairs = b.links.find(l => l.kind === 'stairs')!;
  goToFloor(stairs.lower);
  const step = stairs.strip[1]! - stairs.strip[0]!,
    di = Math.abs(step) === 1 ? step : 0,
    dj = Math.abs(step) === 1 ? 0 : Math.sign(step);
  putOnTile(stairs.strip[0]!);
  const from = { x: player.x, z: player.z };
  player.dashT = TUNE.dashTime;
  player.ddx = di;
  player.ddz = dj;
  for (let k = 0; k < 4; k++) runSystems(0.05);
  // 0.2 s of dash is about 4.9 m; stopped at the first metre of the ramp it would be about 2.4 m
  expect(Math.hypot(player.x - from.x, player.z - from.z), 'how far the dash went').toBeGreaterThan(4);
  expect(player.fy, 'and it climbed').toBeGreaterThan(1);
  goToFloor(0);
});
test('followers: an awake enemy close behind comes down the stairwell after the player and still counts for its room', () => {
  enterBuilding(b => b.links.some(l => l.kind === 'stairs'));
  const b = building!,
    l = b.links.find(x => x.kind === 'stairs')!;
  goToFloor(l.upper);
  // nobody else on the floor (twice over: a splitter leaves its halves, awake)
  for (let k = 0; k < 3; k++) enemies.slice().forEach(e => hurtEnemy(e, 1e6, false));
  tick(1);
  expect(enemies.filter(e => !e.dead).length).toBe(0);
  const l1 = l.strip[l.strip.length - 2]!,
    l2 = l.strip[l.strip.length - 1]!,
    behind = l2 + (l2 - l1), // the upper floor's corridor, one tile past the landing
    // (not the lockdown room: cleared from another floor before its lockdown, it is not marked cleared)
    room = level.rooms.findIndex(
      (_, r) => r !== level.startIdx && !(b.lockdown?.floor === l.upper && b.lockdown.room === r),
    );
  putOnTile(l2);
  tick(2);
  // the last enemy of a room of this floor, awake, two tiles behind the player
  const e = spawnEnemy('crawler', ((behind % W) + 0.5) * T, (Math.floor(behind / W) + 0.5) * T, room, 1);
  e.active = true;
  level.roomCount[room] = 1;
  run.bld!.cleared[l.upper] = run.bld!.cleared[l.upper]!.filter(r => r !== room);
  putOnTile(l1);
  tick(1);
  expect(level.floor, 'the player is on the floor below').toBe(l.lower);
  expect(enemies.includes(e), 'the enemy is off the field, on its way').toBe(false);
  expect(followersOnTheWay()).toBe(1);
  expect(stashedRoomCount(l.upper)![room], 'its room is not cleared yet').toBe(1);
  tick(150);
  expect(enemies.includes(e), 'it came out on this floor').toBe(true);
  expect(followersOnTheWay()).toBe(0);
  expect(e.floor, 'it still belongs to the floor above').toBe(l.upper);
  const pickups = query('pickup').length;
  hurtEnemy(e, 1e6, false);
  expect(stashedRoomCount(l.upper)![room], 'killed here, its room above is cleared').toBe(0);
  expect(run.bld!.cleared[l.upper]).toContain(room);
  expect(query('pickup').length, 'and the reward dropped here').toBeGreaterThan(pickups);
  // a lift leaves the enemies behind
  const lift = b.links.find(x => x.kind === 'elevator');
  if (lift) {
    goToFloor(lift.upper);
    const near = spawnEnemy('crawler', player.x + 1, player.z, -1, 1);
    near.active = true;
    tick(1);
    crossToFloor(b.links.indexOf(lift), lift.lower);
    expect(followersOnTheWay(), 'nobody follows a lift').toBe(0);
  }
  goToFloor(0);
});
test('followers: one left behind on another floor goes back to its own room when the player leaves that floor', () => {
  enterBuilding(b => b.links.some(l => l.kind === 'stairs'));
  const b = building!,
    l = b.links.find(x => x.kind === 'stairs')!;
  goToFloor(l.upper);
  for (let k = 0; k < 3; k++) enemies.slice().forEach(e => hurtEnemy(e, 1e6, false));
  tick(1);
  const l1 = l.strip[l.strip.length - 2]!,
    l2 = l.strip[l.strip.length - 1]!,
    behind = l2 + (l2 - l1),
    room = level.rooms.findIndex(
      (_, r) => r !== level.startIdx && !(b.lockdown?.floor === l.upper && b.lockdown.room === r),
    );
  putOnTile(l2);
  tick(2);
  const e = spawnEnemy('crawler', ((behind % W) + 0.5) * T, (Math.floor(behind / W) + 0.5) * T, room, 1);
  e.active = true;
  level.roomCount[room] = 1;
  run.bld!.cleared[l.upper] = run.bld!.cleared[l.upper]!.filter(r => r !== room);
  putOnTile(l1);
  tick(150);
  expect(level.floor).toBe(l.lower);
  expect(enemies.includes(e), 'it followed the player down').toBe(true);
  // the player shakes it off (it is no longer close behind) and goes back up
  e.active = false;
  crossToFloor(b.links.indexOf(l), l.upper);
  tick(1);
  expect(level.floor).toBe(l.upper);
  expect(enemies.includes(e), 'it is back on its own floor').toBe(true);
  expect(level.roomOf[tileIndex(e.x, e.z)], 'in its own room').toBe(room);
  expect(e.active, 'asleep').toBe(false);
  expect(level.roomCount[room]).toBe(1);
  const pickups = query('pickup').length;
  hurtEnemy(e, 1e6, false);
  expect(run.bld!.cleared[l.upper], 'killed there, the room is cleared as usual').toContain(room);
  expect(query('pickup').length).toBeGreaterThan(pickups);
  goToFloor(0);
});
test("boss room: only the enemies in it count as the boss's minions, and it is the room the boss calls them into", () => {
  enterBuilding();
  const b = building!,
    last = b.plans.length - 1;
  goToFloor(last);
  const hall = level.rooms[level.hall!.room]!;
  // the floor's other rooms have their enemies: none of them is a minion
  expect(enemies.filter(e => !e.dead).length, 'enemies on the floor').toBeGreaterThan(0);
  expect(minionCount(), 'none of them in the boss room').toBe(0);
  expect(arenaRoom(), 'the room the boss fights in is the boss room, not the first room of the floor').toBe(hall);
  // one called into the boss room is counted
  const m = spawnMinion('drone', (hall.x + hall.w / 2) * T, (hall.y + hall.h / 2) * T);
  expect(minionCount()).toBe(1);
  hurtEnemy(m, 1e6, false);
  goToFloor(0);
});
test('boss room: the floor above stands over its top, so the floors are drawn there as anywhere else', () => {
  enterBuilding();
  const b = building!,
    last = b.plans.length - 1,
    hall = b.plans[last]!.hall!,
    r = b.plans[last]!.gen.rooms[hall.room]!;
  // the room is HALL_H high, and the floor above stands a floor's thickness over it, as it does over WALL_H elsewhere
  expect(b.grounds[last - 1]! - b.grounds[last]! - HALL_H).toBe(FLOOR_H - WALL_H);
  goToFloor(last);
  // the stairwell or lift that comes down to this floor: next to it the floors above are drawn
  const link = b.links.find(l => l.lower === last)!;
  putOnTile(link.strip[0]!);
  // (a lift's other floors show only while it is ridden)
  showNeighbourFloors(b, player.x, player.z, link.kind === 'elevator' ? b.links.indexOf(link) : null);
  expect(floorDrawn(link.upper), 'by the way down, the floor above shows').toBe(true);
  // in the boss room its own floor is drawn, the same as in any room (no floor is hidden for it any more)
  putOnTile((r.y + 1) * W + r.x + 1);
  showNeighbourFloors(b, player.x, player.z, null);
  expect(floorDrawn(last)).toBe(true);
  goToFloor(0);
});
test('neighbour floors: by a stairwell they show; by a lift only while it is ridden', () => {
  enterBuilding();
  const b = building!,
    n = level.floor,
    lift = b.links.findIndex(l => l.kind === 'elevator' && (l.upper === n || l.lower === n)),
    stairs = b.links.findIndex(l => l.kind === 'stairs' && (l.upper === n || l.lower === n));
  if (lift >= 0) {
    const l = b.links[lift]!,
      other = l.upper === n ? l.lower : l.upper;
    putOnTile(l.strip[0]!);
    showNeighbourFloors(b, player.x, player.z, null);
    expect(floorDrawn(other), 'standing by the lift: its shaft is walled in').toBe(false);
    showNeighbourFloors(b, player.x, player.z, lift);
    expect(floorDrawn(other), 'riding it').toBe(true);
  }
  if (stairs >= 0) {
    const l = b.links[stairs]!;
    putOnTile(l.strip[0]!);
    showNeighbourFloors(b, player.x, player.z, null);
    expect(floorDrawn(l.upper === n ? l.lower : l.upper), 'by the stairwell').toBe(true);
  }
  expect(lift >= 0 || stairs >= 0, 'this floor has a way on').toBe(true);
});
test('lift: standing on the platform rides to its other floor and back, past a floor when it is a long one', () => {
  // once with any lift, and once with one that passes a floor (in a building that has one)
  for (const long of [false, true]) {
    const want = (x: { kind: string; upper: number; lower: number }) =>
      x.kind === 'elevator' && (!long || x.lower - x.upper === 2);
    enterBuilding(b => b.links.some(want));
    const l = building!.links.find(want)!,
      span = l.lower - l.upper,
      ride = Math.ceil(2.2 * 60 * span) + 40; // frames of a ride, with some to spare
    goToFloor(l.upper);
    enemies.slice().forEach(e => hurtEnemy(e, 1e6, false));
    // arriving on the platform does not start a ride: step off first
    const off = [1, -1, W, -W].map(d => l.a + d).find(k => grid[k] === 1)!;
    putOnTile(off);
    tick(2);
    putOnTile(l.a);
    tick(20);
    expect(ridingY(), 'the wait is not over').toBe(null);
    tick(40);
    expect(ridingY(), 'riding down').toBeLessThan(0);
    expect(level.floor).toBe(l.upper);
    const before = player.fy;
    player.x += 3; // the rider cannot walk off
    tick(1);
    expect(tileIndex(player.x, player.z)).toBe(l.a);
    expect(player.fy).toBeLessThan(before);
    if (long) {
      // half way: about a floor down, with the floor passed and both ends drawn
      tick(Math.ceil(2.2 * 60) - 60);
      expect(player.fy).toBeLessThan(-FLOOR_H * 0.6);
      expect([l.upper, l.upper + 1, l.lower].every(floorDrawn)).toBe(true);
    }
    tick(ride);
    expect(ridingY()).toBe(null);
    expect(level.floor).toBe(l.lower);
    expect(player.fy).toBeCloseTo(0);
    expect(tileIndex(player.x, player.z)).toBe(l.a);
    // it does not leave again until the player has stepped off and back on
    tick(120);
    expect(level.floor).toBe(l.lower);
    putOnTile([1, -1, W, -W].map(d => l.a + d).find(k => grid[k] === 1)!);
    tick(2);
    putOnTile(l.a);
    tick(40);
    expect(ridingY(), 'riding up').toBeGreaterThan(0);
    tick(ride);
    expect(level.floor).toBe(l.upper);
    expect(player.fy).toBeCloseTo(0);
  }
});
test('boss room: its door goes on the map when the player looks at it from the corridor, not before', () => {
  enterBuilding();
  goToFloor(building!.plans.length - 1);
  const hall = level.hall!,
    step = [1, -1, W, -W].find(d => level.roomOf[hall.door + d] === hall.room)!,
    from = hall.door - step; // the corridor tile in front of the door
  player.x = ((from % W) + 0.5) * T;
  player.z = (Math.floor(from / W) + 0.5) * T;
  player.fy = floorY(player.x, player.z);
  // (yaw 0 faces -z)
  const facing = Math.abs(step) === 1 ? Math.atan2(-step, 0) : Math.atan2(0, -Math.sign(step));
  player.yaw = facing + Math.PI;
  level.seen[hall.door] = 0; // (it may have been in sight where the floor starts)
  tick(2);
  expect(level.seen[hall.door], 'standing at it with the back turned').toBe(0);
  player.yaw = facing;
  tick(1);
  expect(level.seen[hall.door], 'looking at it').toBe(1);
});
test('boss room: its door opens for a player who waits at it; walking in starts the boss stage', () => {
  enterBuilding();
  goToFloor(building!.plans.length - 1);
  const hall = level.hall!,
    world = activeTileGrid().world,
    r = level.rooms[hall.room]!,
    tier = stageInfo(run.stage).tier;
  expect(isDoorLocked(world, hall.door), 'locked at first').toBe(true);
  expect(
    enemies.some(e => e.room === hall.room),
    'no enemy waits in the boss room',
  ).toBe(false);
  enemies.slice().forEach(e => hurtEnemy(e, 1e6, false));
  // the corridor tile in front of the door, and the room tile two steps inside
  const step = [1, -1, W, -W].find(d => grid[hall.door + d] === 1 && level.roomOf[hall.door + d] === hall.room)!,
    put = (k: number) => {
      player.x = ((k % W) + 0.5) * T;
      player.z = (Math.floor(k / W) + 0.5) * T;
      player.fy = floorY(player.x, player.z);
    };
  put(hall.door - step);
  tick(30);
  expect(isDoorLocked(world, hall.door), 'half a second is not enough').toBe(true);
  tick(90);
  expect(isDoorLocked(world, hall.door), 'it opens after the wait').toBe(false);
  expect(run.bld!.step, 'still the last floor of the route').toBe(run.bld!.floors - 1);
  // the rooms of the other floors were never cleared: walking in gives the pre-boss supply for them, about 0.18 chips
  // a room, one pick after another
  const owed = supplyChips(),
    chipsHad = run.perks.length;
  expect(owed, 'rooms are left on the floors above').toBeGreaterThan(0);
  put(hall.door + step * 2);
  update(1 / 60);
  expect(run.bld!.supplied).toBe(true);
  for (let k = 0; k < owed; k++) {
    expect(stateIs('perk'), `supply pick ${k + 1} of ${owed}`).toBe(true);
    document.querySelector<HTMLElement>('#perkList .perk')!.click();
  }
  expect(stateIs('play')).toBe(true);
  expect(run.perks.length).toBe(chipsHad + owed);
  expect(supplyChips(), 'given once').toBe(0);
  tick(3);
  expect(run.stage, 'the boss stage of this depth').toBe(tier * PER + PER - 1);
  expect(isDoorLocked(world, hall.door), 'shut behind the player').toBe(true);
  // an enemy waiting in another room of the floor has nothing to do with the fight
  const other = level.rooms.findIndex((_, idx) => idx !== hall.room),
    [ox, oz] = roomSpot(level.rooms[other]!),
    bystander = spawnEnemy('crawler', ox, oz, other, 1);
  level.roomCount[other] = 1;
  // the boss stands in the middle of the room (it arrives by a timer in the game; the test brings it)
  spawnBoss(run.bld!.boss);
  expect(boss!.cx).toBeCloseTo((r.x + r.w / 2) * T);
  expect(boss!.cz).toBeCloseTo((r.y + r.h / 2) * T);
  tick(200);
  // a shielded boss (bastion) first loses what shields it
  if (boss!.invuln) {
    enemies.filter(e => !e.boss && e !== bystander).forEach(e => hurtEnemy(e, 1e6, false));
    tick(20);
  }
  hurtEnemy(boss!, boss!.hp + 1, false);
  tick(2);
  expect(level.portals.map(p => p.kind).sort()).toEqual(expect.arrayContaining(['extract', 'next']));
  expect(
    level.portals.some(p => p.kind === 'terminal'),
    "a milestone's boss leaves a terminal",
  ).toBe(isMilestone(tier));
  expect(isDoorLocked(world, hall.door), 'the way back opens again').toBe(false);
  expect(bystander.dead, 'the enemies in the other rooms are still there').toBeFalsy();
  // after the supply the rooms of this building drop no chips, however often one is cleared
  const chipsLying = () => query<Pickup>('pickup').filter(q => q.kind === 'chip').length,
    lying = chipsLying();
  hurtEnemy(bystander, 1e6, false);
  for (let k = 0; k < 12; k++) {
    const again = spawnEnemy('crawler', ox, oz, other, 1);
    level.roomCount[other] = 1;
    hurtEnemy(again, 1e6, false);
  }
  expect(chipsLying(), 'no chip from a room after the supply').toBe(lying);
  // up to the floor above and back: the boss stays down, the room open with its gates, and forward still leads on
  const last = run.bld!.floor,
    down = building!.links.findIndex(l => l.lower === last),
    up = building!.links[down]!.upper;
  crossToFloor(down, up);
  tick(2);
  expect(stageInfo(run.stage).sub, 'up a floor: no longer the boss stage').not.toBe(PER - 1);
  crossToFloor(down, last);
  tick(2);
  expect(run.stage, 'back: the boss stage again').toBe(tier * PER + PER - 1);
  expect(isDoorLocked(activeTileGrid().world, hall.door), 'the door is open').toBe(false);
  expect(level.portals.map(p => p.kind).sort()).toEqual(expect.arrayContaining(['extract', 'next']));
  expect(
    level.portals.some(p => p.kind === 'terminal'),
    "a milestone's terminal stands again too",
  ).toBe(isMilestone(tier));
  put(hall.door + step * 2);
  tick(200);
  expect(boss, 'walking into the room brings no boss').toBeFalsy();
  // onward: the next depth is a new building, from its top floor
  const seedWas = run.bld!.seed;
  nextStage();
  tick(2);
  expect(stageInfo(run.stage).tier).toBe(tier + 1);
  expect(level.floor).toBe(0);
  expect(run.bld!.seed).not.toBe(seedWas);
  expect(run.bld!.tier).toBe(tier + 1);
});
test('plan: the depth plan of a stage (depth, step, boss, deeper) and the stage numbers it gives', () => {
  expect(planOf(0)).toMatchObject({ tier: 0, sub: 0, boss: false, deeper: true });
  expect(planOf(PER - 1).boss).toBe(true);
  expect(planOf(PER)).toMatchObject({ tier: 1, sub: 0, deeper: false });
  expect(planOf(PER * 3)).toMatchObject({ tier: 3, sub: 0, deeper: true });
  // the old stageInfo's unused loop is gone
  expect('loop' in stageInfo(0)).toBe(false);
  expect(stageInfo(bossStageOf(2)).boss, 'bossStageOf(2) is a boss stage').toBe(true);
  expect(isMilestone(2), 'a deeper toast is not a milestone').toBe(false);
});
