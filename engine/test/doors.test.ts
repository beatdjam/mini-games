import { expect, test } from 'vitest';
import { createRng } from '../src/core/util.ts';

import {
  DOOR_PASS,
  T,
  type TileWorld,
  activeTileGrid,
  computeFlow,
  createTileGrid,
  flowAt,
  hasLOS,
  isFloor,
  isSolid,
  setTileWorld,
  solidAt,
  tileCoord,
} from '../src/world/tiles.ts';
import { generateDungeon } from '../src/world/dungeon.ts';
import { DOOR_CLOSE_DELAY, DOOR_SENSE_R, DOOR_SPEED, isDoorLocked, lockDoor, updateDoors } from '../src/world/doors.ts';
import { tileMapFromRows } from '../src/world/tilemap.ts';
import { floorReach, unreachableFloorTiles } from '../src/world/floors.ts';
import { eq, ok, worldFromRows, floorsFromRows, spot, reached } from './helpers.ts';

// ---- doors ----
// one row of floor with a door at column 3: the player side is columns 1-2, the far side columns 4-5
const DOOR_ROWS = ['#######', '#..+..#', '#######'];
const doorX = 3.5 * T,
  midZ = 1.5 * T;
const person = (x: number, r = 0.4) => ({ x, z: midZ, r });
// runs updateDoors for `seconds` in steps of dt
function tickDoors(
  g: ReturnType<typeof createTileGrid>,
  movers: { x: number; z: number; r: number }[],
  seconds: number,
) {
  for (let t = 0; t < seconds; t += 0.05) updateDoors(g, movers, 0.05);
}
test('doors: a shut door is a wall for movement, sight and bullets, but still a floor tile', () => {
  const g = createTileGrid(worldFromRows(DOOR_ROWS)),
    k = g.tileIndex(doorX, midZ);
  eq(g.world.door![k], 1);
  eq(g.world.doorOpen![k], 0, 'doors start shut');
  eq(g.world.grid[k], 1, 'the tile stays a floor tile');
  ok(g.isSolid(3, 1) && g.solidAt(doorX, midZ) && g.blocked(doorX, midZ, 0.4), 'solid');
  ok(g.isFloor(3, 1) && !g.isFloor(0, 0) && !g.isFloor(9, 9), 'isFloor counts the door but not walls or outside');
  ok(!g.hasLOS(1.5 * T, midZ, 5.5 * T, midZ), 'no sight through it');
  ok(g.hasLOS(1.5 * T, midZ, 2.5 * T, midZ) && g.hasLOS(4.5 * T, midZ, 5.5 * T, midZ), 'but sight on each side');
  const o = { x: 1.5 * T, z: midZ, fy: 0 };
  for (let n = 0; n < 100; n++) g.moveCircle(o, 0.2, 0, 0.4);
  ok(o.x < 3 * T - 0.4 + 1e-6 && g.moveCircle({ x: o.x, z: midZ }, 0.5, 0, 0.4), 'stopped in front of the door');
  eq(g.world.door![g.tileIndex(1.5 * T, midZ)], 0, 'ordinary floor is not a door');
});
test('doors: near someone it opens (floor to walk and see through), and it shuts again after a while', () => {
  const g = createTileGrid(worldFromRows(DOOR_ROWS)),
    k = g.tileIndex(doorX, midZ),
    open = () => g.world.doorOpen![k];
  const far = person(1.5 * T); // 8 m from the door's middle
  ok(Math.abs(far.x - doorX) > DOOR_SENSE_R);
  tickDoors(g, [far], 1);
  eq(open(), 0, 'out of range: stays shut');
  const near = person(doorX - DOOR_SENSE_R + 0.2);
  tickDoors(g, [near], 0.1);
  ok(open() > 0 && open() < DOOR_PASS, 'opening, not yet through');
  ok(g.isSolid(3, 1), 'still a wall while under DOOR_PASS');
  tickDoors(g, [near], 0.4);
  ok(open() >= DOOR_PASS && !g.isSolid(3, 1) && !g.blocked(doorX, midZ, 0.4), 'open enough: floor');
  ok(g.hasLOS(1.5 * T, midZ, 5.5 * T, midZ), 'sight goes through');
  const o = { x: near.x, z: midZ, fy: 0 };
  for (let n = 0; n < 100; n++) g.moveCircle(o, 0.2, 0, 0.4);
  ok(o.x > 4 * T, 'walks through to the far side');
  tickDoors(g, [near], 1);
  near.x = 1.5 * T; // steps away, out of range
  tickDoors(g, [near], DOOR_CLOSE_DELAY - 0.3);
  eq(open(), 1, 'stays wide open until the delay is over');
  tickDoors(g, [near], 0.3 + 1 / DOOR_SPEED + 0.3);
  eq(open(), 0, 'then closes all the way');
  ok(g.isSolid(3, 1) && !g.hasLOS(1.5 * T, midZ, 5.5 * T, midZ), 'a wall again');
});
test('doors: it does not shut while someone overlaps the tile; any of the movers opens it; options override', () => {
  const g = createTileGrid(worldFromRows(DOOR_ROWS)),
    k = g.tileIndex(doorX, midZ),
    open = () => g.world.doorOpen![k],
    tiny = { sense: 0.5, closeDelay: 0.1 };
  tickDoors(g, [person(doorX)], 1);
  eq(open(), 1);
  // the door's tile starts at x = 3 * T = 12: a body at 11.8 with r 0.4 overlaps it, one at 11.4 does not
  const run = (movers: { x: number; z: number; r: number }[], seconds: number) => {
    for (let t = 0; t < seconds; t += 0.05) updateDoors(g, movers, 0.05, tiny);
  };
  run([person(11.8)], 3);
  eq(open(), 1, 'an overlapping body holds it open');
  run([person(11.4)], 1.5);
  eq(open(), 0, 'one just outside the tile (and out of the small sense range) lets it shut');
  run([person(11.8)], 1);
  eq(open(), 1, 'overlapping a shut door opens it');
  // several movers, given as any iterable: only the near one counts
  const set = new Set([person(1.5 * T), person(4.5 * T), person(doorX + 1)]);
  tickDoors(g, [], 3);
  eq(open(), 0);
  for (let n = 0; n < 20; n++) updateDoors(g, set, 0.05);
  eq(open(), 1, 'one near mover of three is enough');
  // a faster door (the options replace the defaults one by one)
  tickDoors(g, [], 3);
  updateDoors(g, [person(doorX)], 0.1, { speed: 10 });
  eq(open(), 1, 'speed 10: fully open in 0.1 s');
  updateDoors(g, [person(doorX)], 0, {});
  updateDoors(g, [person(doorX)], -1, {});
  eq(open(), 1, 'a dt of 0 or less changes nothing');
});
test('doors: a world without doors is left alone; door without doorOpen is an error', () => {
  const plain = createTileGrid(worldFromRows(['####', '#..#', '####']));
  updateDoors(plain, [person(1.5 * T)], 1);
  eq(plain.world.door, undefined, 'nothing is added to the world');
  const bad = worldFromRows(DOOR_ROWS);
  delete bad.doorOpen;
  const g = createTileGrid(bad);
  ok(g.isSolid(3, 1), 'a door with no doorOpen counts as shut');
  expect(() => updateDoors(g, [person(doorX)], 0.1)).toThrow(/doorOpen/);
});
test('doors: paths and reach checks go through a shut door', () => {
  const rows = ['#######', '#..+..#', '#######'],
    withDoor = createTileGrid(worldFromRows(rows)),
    noDoor = createTileGrid(worldFromRows(['#######', '#.....#', '#######']));
  withDoor.computeFlow(5, 1);
  noDoor.computeFlow(5, 1);
  eq(Array.from(withDoor.world.flow).join(), Array.from(noDoor.world.flow).join(), 'the same steps as with a floor');
  eq(withDoor.flowAt(doorX, midZ), 2, 'on the door tile itself (shut)');
  eq(withDoor.flowAt(1.5 * T, midZ), 4);
  const d = withDoor.flowDir(2.5 * T, midZ);
  ok(d && d[0] > 0.9, 'flowDir heads into the shut door');
  ok(withDoor.flowDir(doorX, midZ)![0] > 0.9, 'and on along from the door tile');
  // a wall in the same place does cut the path
  const wall = createTileGrid(worldFromRows(['#######', '#..#..#', '#######']));
  wall.computeFlow(5, 1);
  eq(wall.flowAt(1.5 * T, midZ), -1);
  // floors
  const f = floorsFromRows([['#######', '#..+..#', '#######']], []);
  eq(unreachableFloorTiles(f, spot(0, 1, 1)).length, 0, 'every tile is reached through the shut door');
  eq(reached(floorReach(f, spot(0, 1, 1)), 0), '0000000' + '0111110' + '0000000', 'floorReach too');
  const sealed = floorsFromRows([['#####', '#.#+#', '#####']], []);
  eq(
    JSON.stringify(unreachableFloorTiles(sealed, spot(0, 1, 1))),
    JSON.stringify([spot(0, 3, 1)]),
    'a door cut off from the start is listed as a floor tile that cannot be reached',
  );
  eq(unreachableFloorTiles(sealed, spot(0, 3, 1)).length, 1, 'starting on the door tile itself works too');
  // a link may end on a door tile
  const two = floorsFromRows(
    [DOOR_ROWS, ['###', '#.#', '###']],
    [{ kind: 'stairs', a: spot(0, 3, 1), b: spot(1, 1, 1) }],
  );
  eq(unreachableFloorTiles(two, spot(0, 1, 1)).length, 0, 'a link on a door tile is accepted');
});
test('doors: a locked door shuts at once, opens for nobody, and opens again once unlocked', () => {
  const g = createTileGrid(worldFromRows(DOOR_ROWS)),
    k = g.tileIndex(doorX, midZ),
    open = () => g.world.doorOpen![k];
  eq(g.world.doorLock, undefined, 'no lock map until a door is locked');
  ok(!isDoorLocked(g.world, k));
  lockDoor(g.world, k, false);
  eq(g.world.doorLock, undefined, 'unlocking a door that was never locked adds nothing');
  const near = person(doorX - 3); // in sense range, not on the door's tile (which starts 1 m further on)
  tickDoors(g, [near], 1);
  eq(open(), 1, 'an ordinary door: open');
  lockDoor(g.world, k);
  ok(isDoorLocked(g.world, k) && !isDoorLocked(g.world, k - 1));
  updateDoors(g, [near], 0.1);
  ok(open() < 1, 'locked: it starts shutting right away, with someone near and no closeDelay');
  tickDoors(g, [near], 1);
  eq(open(), 0, 'and shuts all the way');
  ok(g.isSolid(3, 1) && !g.hasLOS(1.5 * T, midZ, 5.5 * T, midZ), 'a wall');
  tickDoors(g, [near, person(doorX + 3)], 2);
  eq(open(), 0, 'nobody near opens it');
  lockDoor(g.world, k, false);
  ok(!isDoorLocked(g.world, k));
  tickDoors(g, [near], 1);
  eq(open(), 1, 'unlocked: an ordinary door again');
  expect(() => lockDoor(g.world, k - 1)).toThrow(/no door/);
  expect(() => lockDoor(worldFromRows(['###', '#.#', '###']), 4)).toThrow(/no door/);
});
test('doors: a locked door waits for a body in the doorway before it shuts', () => {
  const g = createTileGrid(worldFromRows(DOOR_ROWS)),
    k = g.tileIndex(doorX, midZ),
    open = () => g.world.doorOpen![k],
    body = person(doorX);
  tickDoors(g, [body], 1);
  lockDoor(g.world, k);
  tickDoors(g, [body], 2);
  eq(open(), 1, 'held open while the body overlaps the tile');
  ok(!g.blocked(body.x, body.z, body.r), 'so the body is never inside a wall');
  body.x = 11.8; // the tile starts at x = 12: still overlapping
  tickDoors(g, [body], 1);
  eq(open(), 1);
  body.x = 11.4; // off the tile, still within sense range
  tickDoors(g, [body], 1);
  eq(open(), 0, 'shuts once the doorway is clear');
});
test('doors: paths and reach checks stop at a locked door', () => {
  const g = createTileGrid(worldFromRows(DOOR_ROWS)),
    k = g.tileIndex(doorX, midZ);
  g.computeFlow(5, 1);
  eq(g.flowAt(1.5 * T, midZ), 4, 'unlocked: the path goes through');
  lockDoor(g.world, k);
  g.computeFlow(5, 1);
  eq(g.flowAt(1.5 * T, midZ), -1, 'locked: the far side cannot be reached');
  eq(g.flowAt(doorX, midZ), 2, 'a body still in the doorway keeps its way out');
  eq(g.flowAt(4.5 * T, midZ), 1, 'the near side is as before');
  eq(g.flowDir(2.5 * T, midZ), null, 'no direction into the locked door');
  ok(g.isFloor(3, 1), 'the tile is still a floor tile');
  g.computeFlow(1, 1);
  eq(g.flowAt(4.5 * T, midZ), -1, 'the same from the other side');
  lockDoor(g.world, k, false);
  g.computeFlow(5, 1);
  eq(g.flowAt(1.5 * T, midZ), 4, 'unlocked again: through');
  // floors
  const f = floorsFromRows([DOOR_ROWS], []);
  lockDoor(f.grids[0].world, k);
  eq(reached(floorReach(f, spot(0, 1, 1)), 0), '0000000' + '0110000' + '0000000', 'floorReach stops in front of it');
  // the active world takes and drops the lock map with its maps
  const w = worldFromRows(DOOR_ROWS);
  lockDoor(w, k);
  setTileWorld(w);
  eq(activeTileGrid().world.doorLock, w.doorLock, 'setTileWorld hands the lock map over');
  setTileWorld(worldFromRows(DOOR_ROWS));
  eq(activeTileGrid().world.doorLock, undefined, 'a new grid starts with no lock');
});
test('doors: without door maps (or with every door open, or none marked) the results are the same', () => {
  const d = generateDungeon({ map: 40, roomMin: 6, roomMax: 8, platform: 1, rubble: 0.1, bridges: 2 }, createRng(7)),
    M = d.maps,
    n = d.W * d.H,
    base = (): TileWorld => ({
      W: d.W,
      H: d.H,
      grid: M.grid,
      hgt: M.hgt,
      ramp: M.ramp,
      cover: M.cover,
      flow: new Int16Array(n),
      flowQ: new Int32Array(n),
    });
  const plain = createTileGrid(base()),
    zeros = createTileGrid({ ...base(), door: new Uint8Array(n), doorOpen: new Float32Array(n) }),
    // doors on real floor tiles, all wide open
    opened = base(),
    marked = new Uint8Array(n);
  for (let k = 0; k < n; k++) if (M.grid[k] === 1 && k % 7 === 0) marked[k] = 1;
  const allOpen = createTileGrid({ ...opened, door: marked, doorOpen: new Float32Array(n).fill(1) });
  eq(
    marked.some(v => v === 1),
    true,
    'the sample has doors',
  );
  const c = d.rooms[0],
    ci = Math.floor(c.x + c.w / 2),
    cj = Math.floor(c.y + c.h / 2),
    rng = createRng(3),
    span = Math.max(d.W, d.H) * T;
  const grids = [plain, zeros, allOpen];
  grids.forEach(g => g.computeFlow(ci, cj));
  const flowOf = (g: typeof plain) => Array.from(g.world.flow).join();
  eq(flowOf(zeros), flowOf(plain), 'flow with all-zero door maps');
  eq(flowOf(allOpen), flowOf(plain), 'flow with open doors');
  let seen = 0;
  for (let q = 0; q < 300; q++) {
    const x = rng.rand(-T, span + T),
      z = rng.rand(-T, span + T),
      x1 = rng.rand(0, span),
      z1 = rng.rand(0, span),
      dx = rng.rand(-1, 1),
      dz = rng.rand(-1, 1),
      fy = q % 3 === 0 ? undefined : plain.floorY(x, z);
    const res = grids.map(g => {
      const m = { x, z, fy },
        hit = g.moveCircle(m, dx, dz, 0.4);
      return [
        g.solidAt(x, z),
        g.isSolid(tileCoord(x), tileCoord(z)),
        g.isFloor(tileCoord(x), tileCoord(z)),
        g.blocked(x, z, 0.4),
        g.hasLOS(x, z, x1, z1),
        g.hasLOS(x, z, x1, z1, 0.5, 1.5),
        g.flowAt(x, z),
        JSON.stringify(g.flowDir(x, z)),
        hit,
        m.x,
        m.z,
      ].join();
    });
    eq(res[1], res[0], 'all-zero door maps');
    eq(res[2], res[0], 'open doors');
    if (plain.flowAt(x, z) > 0) seen++;
  }
  ok(seen > 20, 'the sample covers reachable ground');
  // a world made with no door key at all has none, and the same module result
  eq('door' in createTileGrid(base()).world, false);
});
test('doors: the active world takes door maps through setTileWorld, and they can be removed again', () => {
  const m = tileMapFromRows(DOOR_ROWS),
    n = m.W * m.H;
  setTileWorld({ W: m.W, H: m.H, grid: m.maps.grid, hgt: m.maps.hgt, ramp: m.maps.ramp, cover: m.maps.cover });
  setTileWorld({ flow: new Int16Array(n), flowQ: new Int32Array(n), door: undefined, doorOpen: undefined });
  eq(isSolid(3, 1), false, 'no door maps: floor');
  setTileWorld({ door: m.maps.door, doorOpen: m.maps.doorOpen });
  ok(isSolid(3, 1) && isFloor(3, 1) && solidAt(doorX, midZ), 'the module functions see the shut door');
  updateDoors(activeTileGrid(), [person(doorX)], 1);
  ok(!isSolid(3, 1) && hasLOS(1.5 * T, midZ, 5.5 * T, midZ), 'and the open one');
  computeFlow(5, 1);
  eq(flowAt(1.5 * T, midZ), 4);
  setTileWorld({ door: undefined, doorOpen: undefined });
  eq(activeTileGrid().world.door, undefined);
  m.maps.doorOpen![3 + m.W] = 0;
  eq(isSolid(3, 1), false, 'removed: the tile is plain floor again');
  // a new level (a new grid) without door maps drops the doors of the one before
  setTileWorld({ door: m.maps.door, doorOpen: m.maps.doorOpen });
  setTileWorld({ W: m.W, H: m.H, grid: m.maps.grid.slice(), hgt: m.maps.hgt, ramp: m.maps.ramp, cover: m.maps.cover });
  eq(activeTileGrid().world.door, undefined, 'a new grid comes with its own doors (here none)');
  eq(DOOR_PASS > 0 && DOOR_PASS <= 1, true);
});
