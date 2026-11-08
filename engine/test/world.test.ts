import { expect, test } from 'vitest';
import * as THREE from 'three';
import { createRng } from '../src/core/util.ts';

import {
  COVER_H,
  DECK_H,
  RISE,
  SINK_EDGE,
  SINK_FLOOR,
  STEP,
  T,
  W,
  type TileWorld,
  activeTileGrid,
  computeFlow,
  cover,
  createTileGrid,
  edgeH,
  floorY,
  flow,
  flowAt,
  flowDir,
  grid,
  hasLOS,
  hgt,
  inBounds,
  isFloor,
  isSolid,
  blocked,
  moveCircle,
  OPPOSITE_SIDE,
  passable,
  ramp,
  setTileWorld,
  SIDE_NX,
  SIDE_NZ,
  SIDE_PX,
  SIDE_PZ,
  SIDE_STEP,
  solidAt,
  tileCenter,
  tileCoord,
  tileIndex,
  walkable,
} from '../src/world/tiles.ts';
import {
  addDoorways,
  forEachRoomTile,
  generateArena,
  generateDungeon,
  setDoor,
  sinkRect,
  tileWorldOf,
} from '../src/world/dungeon.ts';
import { tileMapFromRows } from '../src/world/tilemap.ts';
import { addSunkSides } from '../src/render/tilemesh.ts';
import {
  STAIRWELL_DEFAULTS,
  allReached,
  allSolid,
  gapOf,
  groundsOf,
  makeRoute,
  markAround,
  markLinkOpenings,
  noOpenings,
  placeLink,
  roomDoors,
  roomTiles,
  roomsOnWay,
  stripOf,
  thinDoorPairs,
} from '../src/world/stairwells.ts';
import { type PropRule, type Slot, placeProps, slotsOf } from '../src/world/slots.ts';
import { createFloors, unreachableFloorTiles } from '../src/world/floors.ts';
import {
  type Projectile,
  aimFan,
  clearPool,
  projHitsTerrain,
  ringAngles,
  steerToward,
  stepProjectile,
  takeFromPool,
} from '../src/world/projectiles.ts';
import { steerChase } from '../src/world/steer.ts';
import { facesToward, floorSides, wallSide } from '../src/world/walls.ts';
import { eq, near, ok, worldFromRows, spot } from './helpers.ts';

// ---------- world: tiles, projectiles, steering ----------
// a 6x3 tile room: row 1 is walkable; tile (4,1) is a raised step 2 m up; everything else is wall
export function tinyWorld() {
  const w = 6,
    h = 3;
  setTileWorld({
    W: w,
    H: h,
    grid: new Uint8Array(w * h),
    hgt: new Float32Array(w * h),
    ramp: new Int8Array(w * h).fill(-1),
    cover: new Uint8Array(w * h),
    flow: new Int32Array(w * h),
    flowQ: new Int32Array(w * h),
  });
  for (let i = 0; i < 5; i++) grid[W + i] = 1;
  hgt[W + 4] = 2;
}
test('tiles: tileIndex is the grid index of the tile holding a world point', () => {
  tinyWorld();
  eq(tileIndex(0.5 * T, 0.5 * T), 0);
  eq(tileIndex(2.5 * T, 1.5 * T), W + 2);
  eq(tileIndex(4.99 * T, 2.01 * T), 2 * W + 4);
});
test('tiles: tileCoord, inBounds and tileCenter', () => {
  tinyWorld();
  eq(tileCoord(0), 0);
  eq(tileCoord(T - 0.01), 0);
  eq(tileCoord(T), 1);
  eq(tileCoord(2.5 * T), 2);
  eq(tileCoord(-0.01), -1, 'floors toward -infinity');
  ok(inBounds(0, 0) && inBounds(W - 1, 2), 'corners are inside');
  ok(!inBounds(-1, 0) && !inBounds(0, -1), 'negative is outside');
  ok(!inBounds(W, 0) && !inBounds(0, 3), 'W and H themselves are outside');
  eq(tileCenter(0), T / 2);
  eq(tileCenter(3), 3.5 * T);
  eq(tileCoord(tileCenter(4)), 4, 'the centre is inside its own tile');
});
test('tiles: side numbers match the ramp directions, steps and opposites', () => {
  eq(JSON.stringify([SIDE_PX, SIDE_NX, SIDE_PZ, SIDE_NZ]), '[0,1,2,3]');
  eq(JSON.stringify(SIDE_STEP), '[[1,0],[-1,0],[0,1],[0,-1]]');
  for (let sd = 0; sd < 4; sd++) {
    const [a, b] = SIDE_STEP[sd],
      [oa, ob] = SIDE_STEP[OPPOSITE_SIDE[sd]];
    eq(OPPOSITE_SIDE[OPPOSITE_SIDE[sd]], sd, 'opposite of the opposite');
    ok(oa === -a && ob === -b, 'the opposite side steps back');
  }
});
test('tiles: floor height, ramps, walls and steps block, line of sight', () => {
  tinyWorld();
  eq(floorY(1.5 * T, 1.5 * T), 0);
  eq(floorY(4.5 * T, 1.5 * T), 2, 'raised tile');
  ramp[W + 3] = 0;
  near(floorY(3.5 * T, 1.5 * T), RISE / 2, 1e-6, 'halfway up a +x ramp');
  ramp[W + 3] = -1;
  ok(solidAt(1.5 * T, 0.5 * T), 'row 0 is wall');
  const o = { x: 1.5 * T, z: 1.5 * T, fy: 0 };
  for (let k = 0; k < 100; k++) moveCircle(o, 0.2, 0, 0.4);
  ok(o.x < 4 * T, 'a 2 m step blocks walking (limit STEP)');
  const hitWall = moveCircle(o, 0, -10, 0.4);
  ok(hitWall, 'walls block');
  ok(hasLOS(0.5 * T, 1.5 * T, 3.5 * T, 1.5 * T), 'clear along the row');
  ok(hasLOS(0.5 * T, 1.5 * T, 3.5 * T, 1.5 * T, 0.5, 0.5), 'a low sight line over a flat floor is clear');
  ok(!hasLOS(0.5 * T, 1.5 * T, 5.5 * T, 1.5 * T, 1, 1), 'the raised tile blocks a low sight line');
});

test('tiles: flow field leads to the target around the step', () => {
  tinyWorld();
  computeFlow(0, 1);
  eq(flowAt(0.5 * T, 1.5 * T), 0, 'target tile is 0');
  eq(flowAt(3.5 * T, 1.5 * T), 3);
  const d = flowDir(3.5 * T, 1.5 * T);
  ok(d && d[0] < -0.9, 'heads toward -x');
  eq(flowAt(4.5 * T, 1.5 * T), 4, 'dropping down the 2 m step is allowed');
  computeFlow(4, 1);
  eq(flowAt(3.5 * T, 1.5 * T), -1, 'climbing it is not (more than STEP)');
});
test('tiles: two tile grids keep their own terrain, collision, sight and flow', () => {
  // A: a flat corridor. B: the same size, with a 2 m deck at the right end and a wall in the middle
  const a = createTileGrid(worldFromRows(['######', '#....#', '######'])),
    b = createTileGrid(worldFromRows(['######', '#.#.=#', '######']));
  tinyWorld();
  const flowBefore = Array.from(flow).join();
  eq(a.floorY(4.5 * T, 1.5 * T), 0, 'A is flat at the right end');
  eq(b.floorY(4.5 * T, 1.5 * T), DECK_H, 'B has a deck there');
  eq(floorY(4.5 * T, 1.5 * T), 2, 'the active world is the tiny one, not A or B');
  ok(!a.solidAt(2.5 * T, 1.5 * T) && b.solidAt(2.5 * T, 1.5 * T), 'the middle tile is floor in A, wall in B');
  ok(a.hasLOS(1.5 * T, 1.5 * T, 4.5 * T, 1.5 * T), 'A: clear along the corridor');
  ok(!b.hasLOS(1.5 * T, 1.5 * T, 3.5 * T, 1.5 * T), 'B: the wall cuts the line');
  ok(!a.blocked(2.5 * T, 1.5 * T, 0.4) && b.blocked(2.5 * T, 1.5 * T, 0.4), 'blocked');
  const oa = { x: 1.5 * T, z: 1.5 * T, fy: 0 },
    ob = { x: 1.5 * T, z: 1.5 * T, fy: 0 };
  for (let k = 0; k < 100; k++) {
    a.moveCircle(oa, 0.2, 0, 0.4);
    b.moveCircle(ob, 0.2, 0, 0.4);
  }
  ok(oa.x > 4 * T, 'A: walks to the end');
  ok(ob.x < 2 * T, 'B: stops at the wall');
  ok(a.walkable(a.tileIndex(1.5 * T, 1.5 * T)) && !b.walkable(b.tileIndex(2.5 * T, 1.5 * T)), 'walkable');
  eq(a.edgeH(a.tileIndex(1.5 * T, 1.5 * T), SIDE_PX), 0, 'edgeH');
  ok(!a.inBounds(6, 1) && !b.inBounds(0, 3), 'inBounds uses each own size');
  b.computeFlow(3, 1);
  const flowB = Array.from(b.world.flow).join();
  eq(b.flowAt(3.5 * T, 1.5 * T), 0, 'B: target tile');
  eq(b.flowAt(4.5 * T, 1.5 * T), 1, 'B: one step away');
  eq(b.flowAt(1.5 * T, 1.5 * T), -1, 'B: the wall keeps the left side unreachable');
  a.computeFlow(1, 1);
  eq(Array.from(b.world.flow).join(), flowB, "B's flow is untouched by computing A's");
  eq(Array.from(flow).join(), flowBefore, "the active world's flow is untouched too");
  eq(a.flowAt(4.5 * T, 1.5 * T), 3, 'A: three steps to the left end');
  ok(a.flowDir(4.5 * T, 1.5 * T)![0] < -0.9, 'A: flowDir heads to -x');
  eq(b.flowDir(1.5 * T, 1.5 * T), null, 'B: no way from the unreachable side');
  // a change to one world shows only in the grid made from it
  b.world.hgt[b.tileIndex(3.5 * T, 1.5 * T)] = 1;
  eq(b.floorY(3.5 * T, 1.5 * T), 1);
  eq(a.floorY(3.5 * T, 1.5 * T), 0);
});
test('tiles: blockedDir and depenetrate treat a deck higher than STEP as a step up', () => {
  // one 2 m deck at tile (3, 1), walls all round, floor on the rest
  const g = createTileGrid(worldFromRows(['######', '#..=.#', '######'])),
    r = 0.4;
  // blockedDir: free floor, the deck's lip, walls only (fy undefined) and the deck itself
  ok(!g.blockedDir(1.5 * T, 1.5 * T, r, 0, 1, 0), 'plain floor is free going +x');
  ok(g.blockedDir(3 * T - 0.2, 1.5 * T, r, 0, 1, 0), 'the deck lip blocks at foot height 0');
  ok(!g.blockedDir(3 * T - 0.2, 1.5 * T, r, undefined, 1, 0), 'no foot height checks walls only');
  ok(!g.blockedDir(3 * T - 0.2, 1.5 * T, r, DECK_H, 1, 0), 'from the deck top it is level');
  ok(g.blockedDir(1.5 * T, 1 * T + 0.2, r, 0, 0, -1), 'a wall blocks whatever the height');
  // depenetrate: back off the lip on both sides, and stay put on or away from the deck
  const lip = { x: 3 * T - 0.2, z: 1.5 * T, fy: 0 };
  g.depenetrate(lip, r);
  near(lip.x, 3 * T - r - 0.01, 1e-9, 'pushed back off the near lip');
  eq(lip.z, 1.5 * T, 'z is untouched by an x push');
  const far = { x: 4 * T + 0.2, z: 1.5 * T, fy: 0 };
  g.depenetrate(far, r);
  near(far.x, 4 * T + r + 0.01, 1e-9, 'pushed back off the far lip');
  const onDeck = { x: 3.5 * T, z: 1.5 * T, fy: 0 };
  g.depenetrate(onDeck, r);
  near(onDeck.x, 3.5 * T, 1e-9, 'standing on the deck is left alone in x');
  near(onDeck.z, 1.5 * T, 1e-9, 'standing on the deck is left alone in z');
  const away = { x: 1.5 * T, z: 1.5 * T, fy: 0 };
  g.depenetrate(away, r);
  near(away.x, 1.5 * T, 1e-9, 'away from the deck nothing moves in x');
  near(away.z, 1.5 * T, 1e-9, 'away from the deck nothing moves in z');
});
test('tiles: the module functions give what a tile grid made from the same maps gives', () => {
  const d = generateDungeon({ map: 40, roomMin: 6, roomMax: 8, platform: 1, rubble: 0.1, bridges: 2 }, createRng(7)),
    M = d.maps,
    n = d.W * d.H,
    world: TileWorld = {
      W: d.W,
      H: d.H,
      grid: M.grid,
      hgt: M.hgt,
      ramp: M.ramp,
      cover: M.cover,
      flow: new Int16Array(n),
      flowQ: new Int32Array(n),
    };
  setTileWorld(world);
  const g = createTileGrid(world),
    act = activeTileGrid(),
    rng = createRng(3),
    r = 0.4,
    span = Math.max(d.W, d.H) * T;
  // the maps are shared, so the active flow is the one g reads
  const c = d.rooms[0];
  computeFlow(Math.floor(c.x + c.w / 2), Math.floor(c.y + c.h / 2));
  let rampSeen = 0,
    flowSeen = 0;
  for (let k = 0; k < 400; k++) {
    const x = rng.rand(-T, span + T),
      z = rng.rand(-T, span + T),
      x1 = rng.rand(0, span),
      z1 = rng.rand(0, span),
      i = tileCoord(x),
      j = tileCoord(z),
      idx = rng.randi(0, n - 1),
      sd = rng.randi(0, 3);
    eq(g.floorY(x, z), floorY(x, z), 'floorY');
    eq(act.floorY(x, z), floorY(x, z), 'floorY (active object)');
    eq(g.solidAt(x, z), solidAt(x, z), 'solidAt');
    eq(g.isSolid(i, j), isSolid(i, j), 'isSolid');
    eq(g.isFloor(i, j), isFloor(i, j), 'isFloor');
    eq(g.inBounds(i, j), inBounds(i, j), 'inBounds');
    eq(g.tileIndex(x, z), tileIndex(x, z), 'tileIndex');
    eq(g.blocked(x, z, r), blocked(x, z, r), 'blocked');
    eq(g.hasLOS(x, z, x1, z1), hasLOS(x, z, x1, z1), 'hasLOS');
    eq(g.hasLOS(x, z, x1, z1, 0.5, 1.5), hasLOS(x, z, x1, z1, 0.5, 1.5), 'hasLOS with heights');
    eq(g.walkable(idx), walkable(idx), 'walkable');
    eq(g.edgeH(idx, sd), edgeH(idx, sd), 'edgeH');
    const nb = idx + SIDE_STEP[sd][0] + SIDE_STEP[sd][1] * d.W;
    if (nb >= 0 && nb < n) eq(g.passable(idx, nb, sd), passable(idx, nb, sd), 'passable');
    eq(g.flowAt(x, z), flowAt(x, z), 'flowAt');
    eq(JSON.stringify(g.flowDir(x, z)), JSON.stringify(flowDir(x, z)), 'flowDir');
    if (ramp[idx] >= 0) rampSeen++;
    if (flowAt(x, z) > 0) flowSeen++;
    const dx = rng.rand(-1, 1),
      dz = rng.rand(-1, 1),
      fy = k % 3 === 0 ? undefined : floorY(x, z),
      m1 = { x, z, fy },
      m2 = { x, z, fy };
    eq(g.moveCircle(m1, dx, dz, r), moveCircle(m2, dx, dz, r), 'moveCircle hit');
    eq(m1.x + ',' + m1.z, m2.x + ',' + m2.z, 'moveCircle position');
  }
  ok(rampSeen > 0 && flowSeen > 0, 'the sample touched ramps and the flow field');
  // computeFlow on g's own arrays gives the same field as the module one
  const own = createTileGrid({ ...world, flow: new Int16Array(n), flowQ: new Int32Array(n) });
  own.computeFlow(Math.floor(c.x + c.w / 2), Math.floor(c.y + c.h / 2));
  eq(Array.from(own.world.flow).join(), Array.from(flow).join(), 'computeFlow');
  // setTileWorld with part of the maps shows in the active object and the module functions alike, not in g
  const flat = M.grid.findIndex((v, k) => v === 1 && M.ramp[k] < 0),
    fx = tileCenter(flat % d.W),
    fz = tileCenter(Math.floor(flat / d.W)),
    raised = new Float32Array(n).fill(1.5);
  ok(M.hgt[flat] !== 1.5, 'the sample tile is not already 1.5 m up');
  setTileWorld({ hgt: raised });
  eq(floorY(fx, fz), 1.5, 'module function');
  eq(act.floorY(fx, fz), 1.5, 'active object');
  eq(act.world.hgt, raised, 'the active object holds the new array');
  eq(hgt, raised, 'the live binding follows');
  eq(g.floorY(fx, fz), M.hgt[flat], 'g keeps the maps it was made from');
});

test('dungeon: the same seed gives the same rooms, joined by walkable ground, features in place', () => {
  const opts = { map: 40, roomMin: 6, roomMax: 8, platform: 1, rubble: 0.1, bridges: 2 };
  for (const seed of [1, 7, 99]) {
    const d = generateDungeon(opts, createRng(seed)),
      again = generateDungeon(opts, createRng(seed)),
      M = d.maps;
    eq(JSON.stringify(d.rooms), JSON.stringify(again.rooms), 'rooms repeat');
    eq(Array.from(M.hgt).join(), Array.from(again.maps.hgt).join(), 'heights repeat');
    ok(d.rooms.length >= 2 && d.rooms.every(r => r.x >= 1 && r.y >= 1 && r.x + r.w < d.W && r.y + r.h < d.H), 'rooms');
    for (let k = 0; k < d.W * d.H; k++) {
      if (M.hgt[k] > 0 || M.ramp[k] >= 0 || M.cover[k]) ok(M.grid[k] === 1, 'features stand on floor');
      if (M.cover[k]) near(M.hgt[k], COVER_H, 1e-6, 'cover height');
      else if (M.hgt[k] > 0) eq(M.hgt[k], DECK_H, 'deck height');
    }
    ok(d.rooms.some(r => r.plat) && M.ramp.some(r => r >= 0), 'a deck with its ramp');
    setTileWorld({ W: d.W, H: d.H, grid: M.grid, hgt: M.hgt, ramp: M.ramp, cover: M.cover });
    setTileWorld({ flow: new Int16Array(d.W * d.H), flowQ: new Int32Array(d.W * d.H) });
    const c = (r: { x: number; y: number; w: number; h: number }) => [
      Math.floor(r.x + r.w / 2),
      Math.floor(r.y + r.h / 2),
    ];
    computeFlow(c(d.rooms[0])[0], c(d.rooms[0])[1]);
    d.rooms.forEach(r => ok(flow[c(r)[1] * d.W + c(r)[0]] >= 0, 'every room reaches the first'));
  }
  eq(
    generateDungeon({ deckH: 3, coverH: 1, platform: 1, rubble: 0.2 }, createRng(5)).maps.hgt.some(h => h === 3),
    true,
    'deckH option',
  );
});
test('dungeon: an arena is a floor square with the pillars as walls', () => {
  const a = generateArena(20, 4, 16, [[6, 6]]);
  eq(a.W, 20);
  eq(
    a.maps.grid.reduce((n, v) => n + v, 0),
    12 * 12 - 1,
    'floor minus one pillar',
  );
  eq(a.maps.grid[6 * 20 + 6], 0, 'pillar');
  eq(JSON.stringify(a.rooms), JSON.stringify([{ x: 4, y: 4, w: 12, h: 12 }]));
});
test('dungeon: sinkRect sinks a square one in from the walls, in steps that can be walked down and up', () => {
  // a room 9 wide and 7 high (x 1 to 9, y 1 to 7) with a cover tile (c), a deck (=) and a door (+) in it
  const rows = [
    '###########',
    '#.........#',
    '#.........#',
    '#...c.....#',
    '#.........+',
    '#.....=...#',
    '#.........#',
    '#.........#',
    '###########',
  ];
  const m = tileMapFromRows(rows, {}, [{ x: 1, y: 1, w: 9, h: 7 }]),
    w = m.W,
    at = (i: number, j: number) => j * w + i;
  const sunk = sinkRect(m.maps, w, m.rooms[0]!);
  eq(m.maps.hgt[at(1, 1)], 0, 'the tile by the wall stays on the ground');
  eq(m.maps.hgt[at(9, 4)], 0, 'and by the door');
  eq(m.maps.hgt[at(2, 2)], SINK_EDGE, 'the next ring is the edge');
  eq(m.maps.hgt[at(3, 3)], SINK_FLOOR, 'inside it the bottom');
  eq(m.maps.hgt[at(6, 5)], DECK_H, 'a deck does not sink');
  eq(m.maps.hgt[at(5, 4)], SINK_EDGE, 'next to the deck: the edge');
  near(m.maps.hgt[at(4, 3)]!, SINK_FLOOR + COVER_H, 1e-6, 'cover keeps its height over the bottom');
  ok(!sunk.includes(at(6, 5)) && sunk.includes(at(4, 3)), 'the tiles returned');
  // no two neighbouring floor tiles (corners too) differ by more than a step, except at the deck and the cover
  for (let j = 1; j < m.H - 1; j++)
    for (let i = 1; i < w - 1; i++) {
      const k = at(i, j);
      if (m.maps.grid[k] !== 1 || m.maps.cover[k] || m.maps.hgt[k] === DECK_H) continue;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const n = at(i + di, j + dj);
          if (m.maps.grid[n] !== 1 || m.maps.cover[n] || m.maps.hgt[n] === DECK_H) continue;
          ok(Math.abs(m.maps.hgt[n]! - m.maps.hgt[k]!) <= -SINK_EDGE, `step at ${i},${j}`);
        }
    }
  eq(SINK_FLOOR - SINK_EDGE, SINK_EDGE - 0, 'the two steps are the same height');
  ok(-SINK_EDGE <= STEP, 'a step is one that can be climbed');
  const was = activeTileGrid().world;
  setTileWorld({
    W: w,
    H: m.H,
    grid: m.maps.grid,
    hgt: m.maps.hgt,
    ramp: m.maps.ramp,
    cover: m.maps.cover,
    flow: new Int16Array(w * m.H),
    flowQ: new Int32Array(w * m.H),
  });
  try {
    // down to the bottom and back up the same way
    computeFlow(4, 5);
    ok(flowAt(tileCenter(1), tileCenter(1)) > 0, 'one can go down from the aisle to the bottom');
    computeFlow(1, 1);
    ok(flowAt(tileCenter(4), tileCenter(5)) > 0, 'and up again');
    // walking: from the bottom up to the aisle, one step at a time
    const o = { x: tileCenter(3), z: tileCenter(5), fy: SINK_FLOOR };
    for (let n = 0; n < 200; n++) {
      moveCircle(o, 0, 0.1, 0.4);
      o.fy = floorY(o.x, o.z);
    }
    eq(o.fy, 0, 'walked up to the ground in two steps');
    // the bottom does not lead to the ground straight: a bottom tile by a ground tile cannot be climbed
    hgt[at(3, 6)] = 0;
    ok(!passable(at(3, 5), at(3, 6), SIDE_PZ), 'from the bottom to the ground is more than a step');
    ok(passable(at(3, 6), at(3, 5), SIDE_NZ), 'down it is allowed');
    hgt[at(3, 6)] = SINK_EDGE;
    ok(passable(at(3, 5), at(3, 6), SIDE_PZ), 'from the bottom to the edge is one step');
    // the sides of the steps are drawn on the lower tile's edge, toward the higher
    const group = new THREE.Group();
    addSunkSides(new THREE.Texture(), k => (cover[k] ? hgt[k]! - COVER_H : Math.min(hgt[k]!, 0)), group);
    ok(group.children.length === 1, 'one mesh');
  } finally {
    setTileWorld(was);
  }
});
test('dungeon: forEachRoomTile visits every tile of a room once, row by row', () => {
  const seen: string[] = [];
  forEachRoomTile({ x: 2, y: 5, w: 3, h: 2 }, (i, j) => seen.push(i + ',' + j));
  eq(seen.join(' '), '2,5 3,5 4,5 2,6 3,6 4,6');
});
test('tilemap: rows become the tile maps, rooms from letters or a list, errors on bad rows', () => {
  const rows = ['########', '#A.>==.#', '#A.>==c#', '########'];
  const m = tileMapFromRows(rows);
  eq(m.W, 8);
  eq(m.H, 4);
  const at = (i: number, j: number) => j * m.W + i;
  eq(m.maps.grid[at(0, 0)], 0, 'wall');
  eq(m.maps.grid[at(2, 1)], 1, 'floor');
  eq(m.maps.hgt[at(4, 1)], DECK_H, 'deck');
  eq(m.maps.ramp[at(3, 1)], 0, 'ramp rises toward +x');
  eq(m.maps.ramp[at(4, 1)], -1, 'no ramp on a deck');
  eq(m.maps.cover[at(6, 2)], 1, 'cover');
  near(m.maps.hgt[at(6, 2)], COVER_H, 1e-6, 'cover height');
  eq(JSON.stringify(m.rooms), JSON.stringify([{ x: 1, y: 1, w: 1, h: 2 }]), 'room from letters');
  eq(m.maps.roomOf[at(1, 2)], 0, 'roomOf');
  eq(m.maps.roomOf[at(2, 1)], -1, 'roomOf outside');
  const listed = tileMapFromRows(rows, {}, [{ x: 2, y: 1, w: 2, h: 2 }]);
  eq(listed.maps.roomOf[at(3, 2)], 0, 'roomOf from a given list');
  eq(listed.maps.roomOf[at(1, 1)], -1, 'letters do not count when a list is given');
  const own = tileMapFromRows(['XYx'], { wall: 'X', floor: 'Y', deck: 'x' });
  eq(own.maps.grid.join(), '0,1,1', 'custom legend');
  eq(own.maps.hgt[2], DECK_H);
  const dirs = tileMapFromRows(['.>', '<v', '^.']);
  eq(dirs.maps.ramp.join(), '-1,0,1,2,3,-1', 'ramp sides 0:+x 1:-x 2:+z 3:-z');
  expect(() => tileMapFromRows(['##', '#'])).toThrow();
  expect(() => tileMapFromRows(['#?'])).toThrow();
  expect(() => tileMapFromRows(['#B'])).toThrow();

  setTileWorld({
    W: m.W,
    H: m.H,
    grid: m.maps.grid,
    hgt: m.maps.hgt,
    ramp: m.maps.ramp,
    cover: m.maps.cover,
    flow: new Int16Array(m.W * m.H),
    flowQ: new Int32Array(m.W * m.H),
  });
  ok(isSolid(0, 0) && !isSolid(2, 1) && isSolid(-1, 1) && isSolid(8, 1), 'isSolid');
  eq(floorY(4.5 * T, 1.5 * T), DECK_H, 'floorY on the deck');
  near(floorY(3.5 * T, 1.5 * T), RISE / 2, 1e-9, 'floorY halfway up the ramp');
  ok(passable(at(2, 1), at(3, 1), 0), 'floor to ramp');
  ok(passable(at(3, 1), at(4, 1), 0), 'ramp to deck');
  ok(passable(at(4, 1), at(3, 1), 1), 'deck back down the ramp');
  ok(!passable(at(6, 1), at(5, 1), 1), 'deck edge blocked from below');
  ok(passable(at(5, 1), at(6, 1), 0), 'stepping off the deck');
  const walker = { x: 2.5 * T, z: 1.5 * T, fy: 0 };
  for (let t = 0; t < 110; t++) {
    moveCircle(walker, 0.1, 0, 0.4);
    walker.fy = floorY(walker.x, walker.z);
  }
  ok(walker.x > 5 * T && walker.fy === DECK_H, 'walked up the ramp onto the deck');
  for (let t = 0; t < 40; t++) moveCircle(walker, 0.1, 0, 0.4);
  ok(walker.x > 6 * T, 'and off its far edge');
  const below = { x: 6.5 * T, z: 1.5 * T, fy: 0 };
  for (let t = 0; t < 40; t++) moveCircle(below, -0.1, 0, 0.4);
  ok(below.x >= 6 * T, 'blocked by the deck edge from below');
});

test('projectiles: pool, sub-steps, terrain, homing, patterns', () => {
  tinyWorld();
  const pool: Projectile[] = [],
    geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  const b = takeFromPool(pool, geo, 2)!;
  b.alive = true;
  ok(takeFromPool(pool, geo, 2) !== b, 'second slot');
  pool[1].alive = true;
  eq(takeFromPool(pool, geo, 2), null, 'pool full');
  const r1 = takeFromPool(pool, geo, 2, true),
    r2 = takeFromPool(pool, geo, 2, true);
  eq(r1, b, 'full + recycle: the one handed out first');
  eq(r2, pool[1], 'then the next oldest, not the one just reused');
  Object.assign(b, { x: 0.5 * T, y: 1, z: 1.5 * T, vx: 30, vy: 0, vz: 0 });
  let steps = 0;
  stepProjectile(b, 0.1, 0.5, () => {
    steps++;
    return false;
  });
  eq(steps, 6, '3 m in 0.5 m steps');
  near(b.x, 0.5 * T + 3, 1e-9);
  let hit: number | null = null;
  stepProjectile(b, 1, 0.5, p => {
    if (projHitsTerrain(p, 10, 0.03)) {
      hit = p.x;
      return true;
    }
    return false;
  });
  ok(hit !== null && hit >= 4 * T - 0.5 && hit <= 4 * T + 0.5, 'stops at the raised tile ' + hit);
  clearPool(pool);
  ok(!pool[0].alive && !pool[1].alive, 'clearPool');
  const h = { x: 0, y: 0, z: 0, vx: 5, vy: 0, vz: 0, speed: 5 };
  for (let k = 0; k < 200; k++) steerToward(h as unknown as Projectile, 0, 0, 10, 0.05, 2.2);
  ok(h.vz > 4.9 && Math.abs(h.vx) < 0.1, 'turned toward +z');
  eq(ringAngles(4, 0).length, 4);
  near(ringAngles(4, 0)[1], Math.PI / 2);
  const fan = aimFan(0, 0, 0, 0, 0, 10, 3, 0.2, 0);
  eq(fan.length, 3);
  near(fan[1][2], 1, 1e-9, 'middle bullet aims straight');
  fan.forEach(v => near(Math.hypot(v[0], v[1], v[2]), 1, 1e-9, 'unit'));
});

test('steer: chase in sight, circle when close, push apart', () => {
  tinyWorld();
  const e = { x: 1.5 * T, z: 1.5 * T, r: 0.5, fy: 0, side: 1 };
  steerChase(e, 0.1, 8, 0, 8, true, 4, 0, [], null);
  ok(e.x > 1.5 * T, 'moved toward the target');
  const f = { x: 2 * T, z: 1.5 * T, r: 0.5, fy: 0, side: 1 },
    g2 = { x: 2 * T + 0.3, z: 1.5 * T, r: 0.5 };
  steerChase(f, 0.1, 0, 0.001, 0.001, true, 4, 0, [g2], null);
  ok(f.x < 2 * T, 'pushed away from a neighbour');
});

test('steer: the circling side flips by the rng it is given', () => {
  tinyWorld();
  const e = { x: 1.5 * T, z: 1.5 * T, r: 0.5, fy: 0, side: 1 };
  steerChase(e, 0.1, 1, 0, 1, true, 4, 3, [], null, () => 0);
  eq(e.side, -1, 'flips when the rng is 0');
  const f = { x: 1.5 * T, z: 1.5 * T, r: 0.5, fy: 0, side: 1 };
  steerChase(f, 0.1, 1, 0, 1, true, 4, 3, [], null, () => 0.99);
  eq(f.side, 1, 'stays when the rng is high');
});
test('tilemap: + is a door on a floor tile; the door maps exist only when a row has one', () => {
  const m = tileMapFromRows(['#####', '#.+A#', '#####']);
  const at = (i: number, j: number) => j * m.W + i;
  eq(m.maps.grid[at(2, 1)], 1, 'a door is floor in grid');
  eq(m.maps.door![at(2, 1)], 1, 'and marked in door');
  eq(m.maps.doorOpen![at(2, 1)], 0, 'shut');
  eq(m.maps.hgt[at(2, 1)], 0);
  eq(m.maps.ramp[at(2, 1)], -1);
  eq(m.maps.cover[at(2, 1)], 0);
  eq(
    Array.from(m.maps.door!).reduce((a, b) => a + b, 0),
    1,
    'only one door',
  );
  eq(m.maps.roomOf[at(3, 1)], 0, 'room letters still work next to a door');
  eq(tileMapFromRows(['#..#', '#A.#']).maps.door, undefined, 'no door character: no door maps');
  eq(tileMapFromRows(['#..#', '#A.#']).maps.doorOpen, undefined);
  const own = tileMapFromRows(['#D.#'], { door: 'D' });
  eq(own.maps.door![1], 1, 'the door character can be changed');
  expect(() => tileMapFromRows(['#+#'], { door: 'D' })).toThrow();
  // setDoor on any maps
  const g = generateArena(10, 2, 8, []);
  eq(g.maps.door, undefined);
  setDoor(g.maps, 3 * 10 + 3);
  eq(g.maps.door![33], 1);
  eq(g.maps.doorOpen!.length, 100);
});
// a short hash of a generated dungeon (all five maps and the rooms), to compare with one made by the code before doors
function dungeonHash(d: ReturnType<typeof generateDungeon>): string {
  const M = d.maps,
    text =
      [M.grid, M.hgt, M.ramp, M.cover, M.roomOf].map(a => Array.from(a).join()).join('|') + JSON.stringify(d.rooms);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}
test('dungeon: without the doors option the maps and the random numbers are what they were before doors existed', () => {
  // the hashes and the next random number were taken from the generator before doors were added
  const full = { map: 40, roomMin: 6, roomMax: 8, platform: 1, rubble: 0.1, bridges: 2 };
  const golden: [object, number, string, number][] = [
    [full, 1, '10260462', 0.163012815406546],
    [full, 7, '101b7d00', 0.8379574753344059],
    [full, 99, '5c7cc35c', 0.8688769349828362],
    [{}, 1, 'e083cc19', 0.5763414488174021],
    [{}, 7, '56976c6e', 0.42671570368111134],
    [{ bridges: 0, rubble: 0.2 }, 99, 'ef5f9794', 0.19899036060087383],
  ];
  for (const [o, seed, hash, next] of golden) {
    const rng = createRng(seed),
      d = generateDungeon(o, rng);
    eq(dungeonHash(d), hash, `seed ${seed}`);
    eq(rng.next(), next, `random numbers used, seed ${seed}`);
    eq(d.maps.door, undefined, 'no door maps');
    eq(d.maps.doorOpen, undefined);
    const off = generateDungeon({ ...o, doors: false }, createRng(seed));
    eq(dungeonHash(off), hash, 'doors: false is the same');
    eq(off.maps.door, undefined);
  }
});
test('dungeon: doors go in the room doorways, draw no random numbers, and every floor stays reachable', () => {
  const opts = { map: 40, roomMin: 6, roomMax: 8, platform: 1, rubble: 0.1 };
  for (const seed of [1, 7, 99, 123, 2024]) {
    // without bridges the only difference is the doors
    const plainRng = createRng(seed),
      doorRng = createRng(seed),
      plain = generateDungeon(opts, plainRng),
      d = generateDungeon({ ...opts, doors: true }, doorRng),
      M = d.maps,
      W = d.W;
    eq(dungeonHash(d), dungeonHash(plain), 'the same maps as without doors');
    eq(doorRng.next(), plainRng.next(), 'no random numbers drawn for doors');
    const doors: number[] = [];
    M.door!.forEach((v, k) => {
      if (v) doors.push(k);
    });
    ok(doors.length >= d.rooms.length / 2, `seed ${seed}: ${doors.length} doors`);
    eq(M.doorOpen!.length, W * d.H);
    ok(
      M.doorOpen!.every(v => v === 0),
      'all shut',
    );
    for (const k of doors) {
      eq(M.grid[k], 1, 'a door is a floor tile');
      eq(M.roomOf[k], -1, 'outside the rooms');
      // along one axis: a room tile on one side, floor on the other; across: walls
      const axisX = M.roomOf[k - 1] >= 0 || M.roomOf[k + 1] >= 0,
        [a, b] = axisX ? [k - 1, k + 1] : [k - W, k + W],
        [c, e] = axisX ? [k - W, k + W] : [k - 1, k + 1];
      ok(M.roomOf[a] >= 0 || M.roomOf[b] >= 0, 'touches a room');
      ok(M.grid[a] === 1 && M.grid[b] === 1, 'floor on both ends');
      // (or, where two corridors run side by side, wall on one side and the other half of the door on the other)
      const wall = (t: number) => !M.grid[t],
        half = (t: number, beyond: number) => !!M.door![t] && wall(beyond);
      ok(
        (wall(c) && wall(e)) || (wall(c) && half(e, e + (e - k))) || (wall(e) && half(c, c + (c - k))),
        'walls on both sides',
      );
    }
    // most rooms are entered through a door (a corridor that bends right at a room's edge has no doorway)
    let withDoor = 0;
    d.rooms.forEach((_r, id) => {
      if (doors.some(k => [k - 1, k + 1, k - W, k + W].some(t => M.roomOf[t] === id))) withDoor++;
    });
    ok(withDoor * 2 >= d.rooms.length, `seed ${seed}: ${withDoor} of ${d.rooms.length} rooms have a door`);
    // all floor tiles can still be reached, shut doors or not
    const f = createFloors(
      [
        {
          W,
          H: d.H,
          grid: M.grid,
          hgt: M.hgt,
          ramp: M.ramp,
          cover: M.cover,
          door: M.door,
          doorOpen: M.doorOpen,
          flow: new Int16Array(W * d.H),
          flowQ: new Int32Array(W * d.H),
        },
      ],
      [0],
      [],
    );
    const r0 = d.rooms[0];
    eq(unreachableFloorTiles(f, spot(0, Math.floor(r0.x + r0.w / 2), Math.floor(r0.y + r0.h / 2))).length, 0, 'reach');
    const g = f.grids[0];
    g.computeFlow(Math.floor(r0.x + r0.w / 2), Math.floor(r0.y + r0.h / 2));
    for (let k = 0; k < W * d.H; k++) if (M.grid[k] === 1) ok(g.world.flow[k] >= 0, 'flow reaches every floor tile');
    // while a shut door really is a wall
    ok(g.isSolid(doors[0] % W, Math.floor(doors[0] / W)), 'shut: solid');
  }
  // with bridges the doorway tiles are not used for a walkway
  const b = generateDungeon({ ...opts, doors: true, bridges: 3 }, createRng(7));
  for (let k = 0; k < b.W * b.H; k++)
    if (b.maps.door![k]) ok(b.maps.ramp[k] < 0 && b.maps.hgt[k] === 0, 'flat door tile');
  // addDoorways alone, on a corridor of width 2: the doors come in pairs, side by side across the corridor
  const wide = generateDungeon({ ...opts, corridorW: 2 }, createRng(7));
  addDoorways(wide.maps, wide.W);
  const wd = wide.maps.door!,
    pairs = [...wd.keys()].filter(k => wd[k]);
  ok(pairs.length >= 2 && pairs.length % 2 === 0, 'a corridor 2 wide has doors, an even number');
  for (const k of pairs)
    eq([k - 1, k + 1, k - wide.W, k + wide.W].filter(t => wd[t]).length, 1, 'each has one door beside it');
  // a corridor 3 wide has none
  const wider = generateDungeon({ ...opts, corridorW: 3 }, createRng(7));
  addDoorways(wider.maps, wider.W);
  eq(wider.maps.door, undefined, 'a corridor 3 wide has no doorway');
});
test('dungeon: tileWorldOf shares the maps and brings the doors along', () => {
  const d = generateDungeon({ map: 30, doors: true }, createRng(3)),
    w = tileWorldOf(d);
  ok(w.grid === d.maps.grid && w.hgt === d.maps.hgt && w.door === d.maps.door, 'the maps themselves');
  eq([w.W, w.H, w.flow.length, w.flowQ.length].join(','), '30,30,900,900');
  ok(!('door' in tileWorldOf(generateDungeon({ map: 30 }, createRng(3)))), 'no door maps without doors');
});

// ---- the hall: a room with a single way in ----
// the floor tiles reached from tile `from` walking over floor (4 ways, heights ignored), never stepping on `skip`
function floodFloor(d: ReturnType<typeof generateDungeon>, from: number, skip = -1): Uint8Array {
  const seen = new Uint8Array(d.W * d.H),
    queue = [from];
  seen[from] = 1;
  for (let n = 0; n < queue.length; n++)
    for (const step of [1, -1, d.W, -d.W]) {
      const k = queue[n] + step;
      if (d.maps.grid[k] !== 1 || seen[k] || k === skip) continue;
      seen[k] = 1;
      queue.push(k);
    }
  return seen;
}
const HALL_CASES = [
  { map: 36, countMin: 2, countMax: 3, hall: { w: 12, h: 12 } },
  { map: 36, hall: { w: 12, h: 12 }, platform: 1, rubble: 0.1, bridges: 2, doors: true },
  { map: 44, roomMin: 6, roomMax: 9, corridorW: 2, hall: { w: 12, h: 12 }, platform: 0.8 },
  { map: 30, countMin: 6, countMax: 8, hall: { w: 5, h: 9 }, doors: true },
];
test('dungeon: the hall is the last room, bare, with one door, and no corridor runs through it', () => {
  for (const opts of HALL_CASES)
    for (let seed = 1; seed <= 60; seed++) {
      const d = generateDungeon(opts, createRng(seed)),
        { W, maps: M } = d,
        at = `map ${opts.map} seed ${seed}`;
      ok(d.hall && d.hall.room === d.rooms.length - 1 && d.rooms.length >= 2, `${at}: the last of 2 rooms or more`);
      const hall = d.rooms[d.hall!.room],
        door = d.hall!.door;
      eq(`${hall.w}x${hall.h}`, `${opts.hall.w}x${opts.hall.h}`, 'the size asked for');
      ok(hall.x >= 3 && hall.y >= 3 && hall.x + hall.w <= W - 3 && hall.y + hall.h <= d.H - 3, `${at}: off the edge`);
      ok(!hall.plat, 'no deck');
      forEachRoomTile(hall, (i, j) => {
        const k = j * W + i;
        ok(M.grid[k] === 1 && M.hgt[k] === 0 && M.ramp[k] < 0 && !M.cover[k], `${at}: bare floor at ${i},${j}`);
        eq(M.roomOf[k], d.hall!.room, 'marked as the hall');
      });
      // the ring of wall round the hall has exactly one opening: the door
      const openings: number[] = [];
      for (let j = hall.y - 1; j <= hall.y + hall.h; j++)
        for (let i = hall.x - 1; i <= hall.x + hall.w; i++) {
          const inside = i >= hall.x && i < hall.x + hall.w && j >= hall.y && j < hall.y + hall.h;
          if (!inside && M.grid[j * W + i] === 1) openings.push(j * W + i);
        }
      eq(openings.join(), String(door), `${at}: the door is the only opening`);
      eq(M.door![door], 1, 'and it has a door, whatever the doors option says');
      eq(M.doorOpen![door], 0);
      eq(M.roomOf[door], -1);
      // every other room is reached without the hall; the hall only through its door
      const middle = (r: { x: number; y: number; w: number; h: number }) =>
          Math.floor(r.y + r.h / 2) * W + Math.floor(r.x + r.w / 2),
        without = floodFloor(d, middle(d.rooms[0]), door),
        withDoor = floodFloor(d, middle(d.rooms[0]));
      d.rooms.slice(0, -1).forEach((r, n) => eq(without[middle(r)], 1, `${at}: room ${n} reached round the hall`));
      eq(without[middle(hall)], 0, `${at}: the hall is not reached without its door`);
      eq(withDoor[middle(hall)], 1, `${at}: and is reached through it`);
      // walking by the height rules too: nothing but cover is cut off
      const f = createFloors([tileWorldOf(d)], [0], []),
        start = { floor: 0, i: middle(d.rooms[0]) % W, j: Math.floor(middle(d.rooms[0]) / W) };
      ok(
        unreachableFloorTiles(f, start).every(t => M.cover[t.j * W + t.i]),
        `${at}: every floor tile is walked to`,
      );
    }
});
test('dungeon: the hall draws two numbers first, repeats with the seed, and the option alone changes nothing else', () => {
  const opts = { map: 36, platform: 0.5, rubble: 0.1, bridges: 2 };
  for (const seed of [1, 7, 99, 2024]) {
    const a = generateDungeon({ ...opts, hall: { w: 12, h: 12 } }, createRng(seed)),
      b = generateDungeon({ ...opts, hall: { w: 12, h: 12 } }, createRng(seed));
    eq(dungeonHash(a), dungeonHash(b), 'the same seed gives the same map');
    eq(JSON.stringify(a.hall), JSON.stringify(b.hall));
    // the hall's place is the first two numbers of the seed
    const rng = createRng(seed),
      x = rng.randi(3, 36 - 12 - 3),
      y = rng.randi(3, 36 - 12 - 3),
      hall = a.rooms[a.hall!.room];
    eq(`${hall.x},${hall.y}`, `${x},${y}`);
    eq(generateDungeon(opts, createRng(seed)).hall, undefined, 'no hall without the option');
  }
  expect(() => generateDungeon({ map: 20, hall: { w: 15, h: 4 } }, createRng(1))).toThrow(/does not fit/);
  expect(() => generateDungeon({ map: 20, hall: { w: 4, h: 0 } }, createRng(1))).toThrow(/does not fit/);
  // a map the hall fills leaves no place for another room
  expect(() => generateDungeon({ map: 18, hall: { w: 12, h: 12 } }, createRng(1))).toThrow(/no room could be placed/);
});
// ---- prop slots ----
const slotText = (s: Slot) => `${s.kind}@${s.i},${s.j}` + (s.side === undefined ? '' : `/${s.side}`);
test('slots: slotsOf finds wall faces, corners, middles, room floor, corridors and doorways', () => {
  // a 5 x 4 room, a door on its east side, a corridor behind it
  const d = tileMapFromRows(['##########', '#.....####', '#.....+..#', '#.....####', '#.....####', '##########'], {}, [
    { x: 1, y: 1, w: 5, h: 4 },
  ]);
  const list = slotsOf(d).map(slotText),
    of = (kind: string) => list.filter(t => t.startsWith(kind + '@'));
  eq(of('center').join(), 'center@3,3', 'the middle of the room');
  eq(of('corner').join(), 'corner@1,1,corner@5,1,corner@1,4,corner@5,4', 'the four corners, row by row');
  eq(of('floor').join(), 'floor@2,2,floor@3,2,floor@4,2,floor@5,2,floor@2,3,floor@4,3', 'room tiles with no wall');
  eq(of('doorway').join(), 'doorway@6,2', 'the door');
  eq(of('corridor').join(), 'corridor@7,2,corridor@8,2');
  ok(list.includes('wall@1,1/1') && list.includes('wall@1,1/3'), 'a corner has two wall faces (-x, -z)');
  eq(
    list.filter(t => t.startsWith('wall@8,2')).join(),
    'wall@8,2/0,wall@8,2/2,wall@8,2/3',
    'the corridor end: walls on +x, +z, -z',
  );
  ok(!list.some(t => t.startsWith('wall@6,2')), 'a door tile is only a doorway');
  eq(list.indexOf('wall@1,1/1') < list.indexOf('corner@1,1'), true, 'a tile lists its wall faces first');
  // decks, ramps and cover take no slots
  const deck = tileMapFromRows(['######', '#.>==#', '#.##.#', '######'], {}, [{ x: 1, y: 1, w: 4, h: 2 }]);
  ok(
    slotsOf(deck).every(s => deck.maps.hgt[s.j * deck.W + s.i] === 0 && deck.maps.ramp[s.j * deck.W + s.i] < 0),
    'flat tiles only',
  );
});
test('stairwells: floors made apart are joined by a stairwell and a lift, every floor reached, drawn open round them', () => {
  expect(new Set(Array.from({ length: 100 }, (_, n) => makeRoute(5, createRng(n)).join(''))).size).toBe(6);
  expect(makeRoute(3, createRng(1))).toEqual([0, 1, 2]);
  const STRIP = stripOf();
  expect(STRIP).toBe(STAIRWELL_DEFAULTS.floorH / RISE + 3);
  let done = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const rng = createRng(seed),
      opts = { map: 48, countMin: 4, countMax: 5 },
      maps = [0, 1, 2].map(() => generateDungeon(opts, rng)),
      W = maps[0]!.W,
      keepOut = maps.map(() => new Uint8Array(W * maps[0]!.H)),
      r = maps[0]!.rooms[0]!,
      start = Math.floor(r.y + r.h / 2) * W + Math.floor(r.x + r.w / 2),
      stairs = placeLink(maps, keepOut, true, 0, 1, { floor: 0, from: start, skip: 0 }, rng),
      lift = stairs && placeLink(maps, keepOut, false, 1, 2, { floor: 1, from: stairs.b, skip: -1 }, rng);
    if (!stairs || !lift) continue;
    done++;
    expect(stairs.strip.length).toBe(STRIP);
    // the lower floor: the strip is floor, rising to floorH; the upper floor: only the landing
    expect(stairs.strip.every(k => maps[1]!.maps.grid[k] === 1)).toBe(true);
    expect(maps[1]!.maps.hgt[stairs.strip[STRIP - 1]!]).toBe(STAIRWELL_DEFAULTS.floorH);
    expect(stairs.strip.map(k => maps[0]!.maps.grid[k])).toEqual([...Array(STRIP - 2).fill(0), 1, 1]);
    expect(maps[1]!.maps.grid[lift.a] === 1 && maps[2]!.maps.grid[lift.a] === 1).toBe(true);
    expect(allReached(maps, [stairs, lift], 0), `seed ${seed}`).toBe(true);
    const open = maps.map(m => noOpenings(m.W * m.H));
    markLinkOpenings(open, maps, [stairs, lift]);
    expect(open[0]!.noFloor[stairs.a]).toBe(1);
    expect(open[0]!.voids[stairs.strip[0]!], 'over the foot of the stairs: a hole').toBe(1);
    expect(open[1]!.noCeil[stairs.strip[0]!]).toBe(1);
    expect(open[2]!.noCeil[lift.a]).toBe(1);
  }
  expect(done, 'most seeds have room for both').toBeGreaterThan(3);
});
test('stairwells: a taller gap between two floors has a longer stairwell, rising to that gap', () => {
  // (only the gap under floor 1 given: the one under floor 0 stays floorH)
  const gaps: number[] = [];
  gaps[1] = 14;
  const cfg = { ...STAIRWELL_DEFAULTS, gaps };
  expect(gapOf(cfg, 0)).toBe(STAIRWELL_DEFAULTS.floorH);
  expect(gapOf(cfg, 1)).toBe(14);
  expect(groundsOf(cfg, 3)).toEqual([0, -STAIRWELL_DEFAULTS.floorH, -STAIRWELL_DEFAULTS.floorH - 14]);
  expect(stripOf(cfg, 1)).toBe(14 / RISE + 3);
  let done = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const rng = createRng(seed),
      opts = { map: 48, countMin: 4, countMax: 5 },
      maps = [0, 1, 2].map(() => generateDungeon(opts, rng)),
      W = maps[0]!.W,
      keepOut = maps.map(() => new Uint8Array(W * maps[0]!.H)),
      r = maps[0]!.rooms[0]!,
      start = Math.floor(r.y + r.h / 2) * W + Math.floor(r.x + r.w / 2),
      lift = placeLink(maps, keepOut, false, 0, 1, { floor: 0, from: start, skip: 0 }, rng, cfg),
      stairs = lift && placeLink(maps, keepOut, true, 1, 2, { floor: 1, from: lift.b, skip: -1 }, rng, cfg);
    if (!stairs || !lift) continue;
    done++;
    const STRIP = stripOf(cfg, 1);
    expect(stairs.strip.length).toBe(STRIP);
    expect(stairs.strip.map(k => maps[2]!.maps.hgt[k])).toEqual([0, 0, 2, 4, 6, 8, 10, 12, 14, 14]);
    expect(allReached(maps, [lift, stairs], 0, cfg), `seed ${seed}`).toBe(true);
    const open = maps.map(m => noOpenings(m.W * m.H));
    markLinkOpenings(open, maps, [lift, stairs]);
    expect(stairs.strip.map(k => open[1]!.voids[k])).toEqual([...Array(STRIP - 2).fill(1), 0, 0]);
  }
  expect(done, 'most seeds have room for both').toBeGreaterThan(3);
});
test('stairwells: two doors close along a corridor become one; a room shut only by doors is closable', () => {
  const d = tileMapFromRows(['#######', '#.....#', '#.....#', '###+###', '###.###', '###+###', '#.....#', '#######']);
  thinDoorPairs(d);
  const doors = Array.from(d.maps.door!).flatMap((v, k) => (v ? [k] : []));
  expect(doors.length, 'the second of the pair goes').toBe(1);
  const room = tileMapFromRows(['#####', '#AAA#', '#AAA#', '##+##', '##.##']);
  expect(roomDoors(room, 0)).toEqual({ doors: [3 * 5 + 2], closable: true });
});
test('stairwells: allSolid wants walls on both floors round each tile and keeps it off the edge', () => {
  const solidRows = ['#######', '#######', '#######', '#######', '#######', '#######', '#######'],
    holeRows = ['#######', '#######', '#######', '####.##', '#######', '#######', '#######'],
    solid = tileMapFromRows(solidRows),
    holed = tileMapFromRows(holeRows),
    middle = 3 * 7 + 3; // (3, 3)
  eq(allSolid(solid, solid, [middle]), true, 'all wall round the middle tile');
  eq(allSolid(solid, holed, [middle]), false, 'a floor on the upper floor only');
  eq(allSolid(holed, solid, [middle]), false, 'a floor on the lower floor only');
  eq(allSolid(solid, solid, [middle + 1]), true, 'a tile next to the middle is still 2 from the edge');
  eq(allSolid(solid, solid, [3 * 7 + 1]), false, 'one tile from the left edge');
  eq(allSolid(solid, solid, [3 * 7 + 5]), false, 'one tile from the right edge');
});
test('stairwells: markAround keeps the tile and the 8 round it clear and leaves the rest', () => {
  const keepOut = new Uint8Array(7 * 7);
  markAround(keepOut, 7, [3 * 7 + 3]);
  for (const k of [16, 17, 18, 23, 24, 25, 30, 31, 32]) eq(keepOut[k], 1, `tile ${k} is kept clear`);
  eq(
    keepOut.reduce((a, b) => a + b, 0),
    9,
    'nothing outside the 3x3 block is set',
  );
});
test('stairwells: roomTiles lists a room row by row', () => {
  const d = tileMapFromRows(['#######', '#AAA..#', '#AAA..#', '#######']);
  expect(roomTiles(d, 0), 'room A is 3 wide and 2 high from (1, 1)').toEqual([8, 9, 10, 15, 16, 17]);
});
test('stairwells: roomsOnWay counts the rooms the shortest way crosses, skip aside', () => {
  const d = tileMapFromRows(['#########', '#AAA#BBB#', '#AAA.BBB#', '#AAA#BBB#', '#########']),
    fromA = 1 * 9 + 1, // (1, 1) in room A
    inA = 2 * 9 + 3, // (3, 2) in room A
    inB = 2 * 9 + 7; // (7, 2) in room B
  eq(roomsOnWay(d, fromA, inB, -1), 2, 'the way from A to B crosses both rooms');
  eq(roomsOnWay(d, fromA, inB, 1), 1, 'room B skipped');
  eq(roomsOnWay(d, fromA, inB, 0), 1, 'room A skipped');
  eq(roomsOnWay(d, fromA, inA, 0), 0, 'both tiles in room A, which is skipped');
});
test('slots: placeProps keeps blocking props out of the way, and the same seed repeats', () => {
  const rules: PropRule[] = [
    { id: 'crate', slots: ['corner', 'floor'], blocks: true, count: [6, 10] },
    { id: 'sign', slots: ['wall'], blocks: false, count: 12, gap: 3 },
    { id: 'lamp', slots: ['center'], blocks: false, count: 3 },
    { id: 'stuck', slots: ['wall', 'corridor', 'doorway'], blocks: true, count: 5 },
  ];
  for (const seed of [1, 7, 99, 123, 2024]) {
    const d = generateDungeon({ map: 36, doors: true, platform: 1, rubble: 0.1 }, createRng(seed)),
      W = d.W,
      r0 = d.rooms[0],
      keep = [Math.floor(r0.y + r0.h / 2) * W + Math.floor(r0.x + r0.w / 2)];
    const p = placeProps(d, rules, createRng(seed), keep),
      again = placeProps(d, rules, createRng(seed), keep);
    eq(JSON.stringify(p), JSON.stringify(again), 'repeats');
    const crates = p.filter(x => x.id === 'crate'),
      signs = p.filter(x => x.id === 'sign');
    ok(crates.length >= 6 && crates.length <= 10, `seed ${seed}: ${crates.length} crates`);
    eq(signs.length, 12, `seed ${seed}: signs`);
    eq(p.filter(x => x.id === 'lamp').length, 3);
    eq(p.filter(x => x.id === 'stuck').length, 0, 'a blocking prop never takes a wall, corridor or doorway slot');
    ok(
      p.every(x => rules.find(r => r.id === x.id)!.slots.includes(x.slot.kind)),
      'only the kinds a rule allows',
    );
    for (const a of signs)
      for (const b of signs)
        if (a !== b) ok(Math.max(Math.abs(a.slot.i - b.slot.i), Math.abs(a.slot.j - b.slot.j)) >= 3, 'gap');
    const tileOf = (x: { slot: Slot }) => x.slot.j * W + x.slot.i;
    for (const c of crates) {
      const k = tileOf(c);
      ok(p.filter(x => tileOf(x) === k).length === 1, 'nothing else on a crate tile');
      ok(!keep.includes(k), 'not on a kept tile');
      ok(![k - 1, k + 1, k - W, k + W].some(n => d.maps.door![n]), 'not next to a door');
    }
    eq(new Set(p.map(x => slotText(x.slot))).size, p.length, 'one prop per slot');
    // with the crates made solid, every tile that could be walked to still can be (cover never could)
    const grid = d.maps.grid.slice();
    crates.forEach(c => (grid[tileOf(c)] = 0));
    const n = W * d.H,
      world = (g: Uint8Array) => ({
        W,
        H: d.H,
        grid: g,
        hgt: d.maps.hgt,
        ramp: d.maps.ramp,
        cover: d.maps.cover,
        flow: new Int16Array(n),
        flowQ: new Int32Array(n),
      }),
      start = spot(0, keep[0] % W, Math.floor(keep[0] / W)),
      before = unreachableFloorTiles(createFloors([world(d.maps.grid)], [0], []), start).length,
      after = unreachableFloorTiles(createFloors([world(grid)], [0], []), start).length;
    eq(after, before, `seed ${seed}: nothing new cut off (only cover, ${before} tiles, was out of reach)`);
  }
});
test('slots: a blocking prop that would cut the way is not placed; the count is what fits', () => {
  // a room one tile wide: blocking the middle would cut off the east end
  const d = tileMapFromRows(['#######', '#.....#', '#######'], {}, [{ x: 1, y: 1, w: 5, h: 1 }]);
  eq(
    slotsOf(d)
      .filter(s => s.kind !== 'wall')
      .map(slotText)
      .join(),
    'corner@1,1,center@3,1,corner@5,1',
  );
  const p = placeProps(d, [{ id: 'crate', slots: ['corner', 'center'], blocks: true, count: 3 }], createRng(1));
  // the west corner is where the reach check starts (no keep given), the middle would cut the way: only the east corner
  eq(p.map(x => slotText(x.slot)).join(), 'corner@5,1');
  eq(placeProps(d, [{ id: 'x', slots: ['floor'], blocks: false, count: 4 }], createRng(1)).length, 0, 'no floor slots');
});
test("walls: a wall's faces, the outside wall and a thin wall, which way a face looks", () => {
  const d = tileMapFromRows(['#######', '#..#..#', '#######', '#######', '#.....#', '#######']),
    at = (i: number, j: number) => j * d.W + i;
  expect(floorSides(d, at(3, 1)), 'floor on both sides').toEqual([
    [1, 0],
    [-1, 0],
  ]);
  expect(floorSides(d, at(3, 2)), 'seen from no floor').toEqual([]);
  expect(wallSide(d, at(0, 1)), 'the map edge behind it').toBe('outer');
  expect(wallSide(d, at(1, 0)), 'the map edge behind it').toBe('outer');
  expect(wallSide(d, at(3, 1)), 'floor right behind it, on both sides').toBe('inner');
  expect(wallSide(d, at(1, 2)), 'floor further behind it').toBeNull();
  expect(wallSide(d, at(3, 2)), 'seen from no floor').toBeNull();
  // what lies beyond: 1 counts as floor (another level's floor further out), 2 as the edge (a yard open to the sky)
  const wide = tileMapFromRows(['#######', '#.....#', '#######', '#######', '#######']),
    w = (i: number, j: number) => j * wide.W + i,
    far = new Uint8Array(wide.W * wide.H);
  expect(wallSide(wide, w(2, 2)), 'nothing to the edge').toBe('outer');
  far[w(2, 4)] = 1;
  expect(wallSide(wide, w(2, 2), far), "another level's floor further out").toBeNull();
  far[w(2, 3)] = 2;
  expect(wallSide(wide, w(2, 2), far), 'a yard before it').toBe('outer');
  // the wall on a room's -x side looks toward -x (its floor is on the +x side)
  expect(facesToward(d, at(0, 1), [-1, 0])).toBe(true);
  expect(facesToward(d, at(6, 1), [-1, 0])).toBe(false);
  expect(facesToward(d, at(6, 1), [1, 0])).toBe(true);
  expect(facesToward(d, at(1, 0), [0, -1]), 'the top wall looks toward -z').toBe(true);
});
