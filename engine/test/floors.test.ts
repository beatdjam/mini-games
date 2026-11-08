import { expect, test } from 'vitest';
import { DECK_H, RISE, T, activeTileGrid } from '../src/world/tiles.ts';
import {
  type FloorLink,
  type Floors,
  createFloors,
  crossLink,
  feetY,
  floorFlow,
  floorReach,
  flowLink,
  linksAt,
  otherEnd,
  unreachableFloorTiles,
} from '../src/world/floors.ts';
import {
  LIFT_RIDE,
  LIFT_WAIT,
  createLift,
  liftProgress,
  liftTarget,
  updateLift,
  useFloor,
} from '../src/world/lifts.ts';
import { eq, near, ok, worldFromRows, floorsFromRows, spot, reached, crossFloors } from './helpers.ts';

test('floors: a link joins two floors, in both directions', () => {
  const f = floorsFromRows(
    [
      ['#######', '#.....#', '#######'],
      ['#######', '#.....#', '#.###.#', '#.....#', '#######'],
    ],
    [{ kind: 'stairs', a: spot(0, 5, 1), b: spot(1, 1, 1) }],
  );
  const up = floorReach(f, spot(0, 1, 1));
  eq(reached(up, 0), '0000000' + '0111110' + '0000000', 'floor 1 (the starting floor) is walkable end to end');
  eq(unreachableFloorTiles(f, spot(0, 1, 1)).length, 0, 'every floor tile of both floors is reached');
  eq(
    up[1].reduce((a, b) => a + b, 0),
    5 + 2 + 5,
    'all 12 floor tiles of floor 1',
  );
  const down = floorReach(f, spot(1, 3, 3));
  eq(down[0][1 * 7 + 1], 1, 'the link also leads from floor 2 down to floor 1');
  eq(unreachableFloorTiles(f, spot(1, 3, 3)).length, 0);
});
test('floors: without a link, a wall or a closed room, a floor is out of reach', () => {
  const rows1 = ['#######', '#..#..#', '#######'],
    rows0 = ['#####', '#...#', '#####'];
  const none = floorsFromRows([rows0, rows1], []);
  eq(reached(floorReach(none, spot(0, 1, 1)), 1), '0'.repeat(21), 'no link: nothing of floor 2');
  eq(unreachableFloorTiles(none, spot(0, 1, 1)).length, 4, 'the 4 tiles of floor 2');
  const one = floorsFromRows([rows0, rows1], [{ kind: 'elevator', a: spot(0, 3, 1), b: spot(1, 1, 1) }]);
  const list = unreachableFloorTiles(one, spot(0, 1, 1));
  eq(
    JSON.stringify(list),
    JSON.stringify([spot(1, 4, 1), spot(1, 5, 1)]),
    'the room behind the wall stays out of reach',
  );
  eq(floorReach(one, spot(0, 1, 1))[1][1 * 7 + 2], 1, 'the left room of floor 2 is reached');
  // a link on one floor can cross a wall
  const same = floorsFromRows([rows1], [{ kind: 'door', a: spot(0, 2, 1), b: spot(0, 4, 1) }]);
  eq(unreachableFloorTiles(same, spot(0, 1, 1)).length, 0, 'a link on one floor crosses the wall');
});
test('floors: steps up of more than STEP block the walk, drops and low steps do not', () => {
  // ground at 0 m (i 1-2), deck at 2 m (i 3-4)
  const high = floorsFromRows([['######', '#..==#', '######']], []);
  eq(reached(floorReach(high, spot(0, 1, 1)), 0), '000000' + '011000' + '000000', 'cannot climb the 2 m deck');
  eq(reached(floorReach(high, spot(0, 4, 1)), 0), '000000' + '011110' + '000000', 'but can drop from it');
  eq(
    JSON.stringify(unreachableFloorTiles(high, spot(0, 1, 1))),
    JSON.stringify([spot(0, 3, 1), spot(0, 4, 1)]),
    'the deck tiles are the unreachable ones',
  );
  eq(unreachableFloorTiles(high, spot(0, 3, 1)).length, 0, 'from the deck everything is reached');
  // the same rows with a 0.5 m deck: under STEP, so both ways work
  const low = floorsFromRows([['######', '#..==#', '######']], [], 0.5);
  eq(unreachableFloorTiles(low, spot(0, 1, 1)).length, 0, 'a 0.5 m step can be climbed');
  eq(unreachableFloorTiles(low, spot(0, 4, 1)).length, 0);
  // a ramp leads up onto the deck
  const ramp = floorsFromRows([['#####', '#.>=#', '#####']], []);
  eq(unreachableFloorTiles(ramp, spot(0, 1, 1)).length, 0, 'the ramp climbs to the deck');
  eq(unreachableFloorTiles(ramp, spot(0, 3, 1)).length, 0, 'and back down');
  // heights are per floor: floors at different baseY are joined by the link, not by their heights
  const apart = floorsFromRows(
    [
      ['####', '#..#', '####'],
      ['####', '#..#', '####'],
    ],
    [{ kind: 'stairs', a: spot(0, 2, 1), b: spot(1, 1, 1) }],
  );
  eq(unreachableFloorTiles(apart, spot(0, 1, 1)).length, 0, 'a link ignores the 10 m between the floors');
});
test('floors: feetY adds the floor height, linksAt lists the links of a tile', () => {
  const stairs: FloorLink = { kind: 'stairs', a: spot(0, 2, 1), b: spot(1, 1, 1) },
    lift: FloorLink = { kind: 'elevator', a: spot(0, 2, 1), b: spot(1, 3, 1) },
    f = floorsFromRows(
      [
        ['#####', '#.>=#', '#####'],
        ['#####', '#...#', '#####'],
      ],
      [stairs, lift],
    );
  eq(feetY(f, 0, 1.5 * T, 1.5 * T), 0, 'floor 0 ground');
  eq(feetY(f, 1, 1.5 * T, 1.5 * T), 10, 'floor 1 is 10 m up');
  eq(feetY(f, 0, 3.5 * T, 1.5 * T), DECK_H, 'the deck on floor 0');
  near(feetY(f, 0, 2.5 * T, 1.5 * T), RISE / 2, 1e-6, 'halfway up the ramp');
  f.baseY[1] = 12;
  eq(feetY(f, 1, 1.5 * T, 1.5 * T), 12, 'it reads baseY at call time');
  eq(linksAt(f, 0, 2, 1).length, 2, 'two links at the ramp tile');
  ok(linksAt(f, 0, 2, 1)[0] === stairs && linksAt(f, 0, 2, 1)[1] === lift, 'the links themselves, in the order given');
  ok(linksAt(f, 1, 1, 1)[0] === stairs && linksAt(f, 1, 3, 1)[0] === lift, 'found from the b end too');
  eq(linksAt(f, 1, 2, 1).length, 0, 'a tile with no link');
  eq(linksAt(f, 1, 9, 9).length, 0, 'outside the map');
  eq(linksAt(f, 5, 1, 1).length, 0, 'a floor that does not exist');
  const self = floorsFromRows([['###', '#.#', '###']], [{ kind: 'x', a: spot(0, 1, 1), b: spot(0, 1, 1) }]);
  eq(linksAt(self, 0, 1, 1).length, 1, 'a link from a tile to itself is listed once');
});
test('floors: createFloors names the wrong link, floorReach rejects a start off the floor', () => {
  const worlds = [worldFromRows(['####', '#..#', '####']), worldFromRows(['####', '#.##', '####'])],
    good: FloorLink = { kind: 'stairs', a: spot(0, 1, 1), b: spot(1, 1, 1) },
    make = (...links: FloorLink[]) => createFloors(worlds, [0, 5], links);
  make(good);
  expect(() => createFloors(worlds, [0], [])).toThrow(/2 floors but 1 baseY/);
  expect(() => make(good, { kind: 'lift', a: spot(2, 1, 1), b: spot(1, 1, 1) })).toThrow(/link 1 \(lift\) a: floor 2/);
  expect(() => make({ kind: 'lift', a: spot(0, 1, 1), b: spot(-1, 1, 1) })).toThrow(/link 0 \(lift\) b: floor -1/);
  expect(() => make({ kind: 'lift', a: spot(0, 4, 1), b: spot(1, 1, 1) })).toThrow(/link 0 \(lift\) a: tile \(4, 1\)/);
  expect(() => make(good, good, { kind: 'lift', a: spot(0, 1, 1), b: spot(1, 1, 3) })).toThrow(
    /link 2 \(lift\) b: tile \(1, 3\)/,
  );
  expect(() => make({ kind: 'lift', a: spot(0, 1, 1), b: spot(1, 2, 1) })).toThrow(
    /link 0 \(lift\) b: tile \(2, 1\).*not a floor/,
  );
  expect(() => make({ kind: 'lift', a: spot(0, 0.5, 1), b: spot(1, 1, 1) })).toThrow(/link 0 \(lift\) a/);
  const f = make(good);
  expect(() => floorReach(f, spot(0, 0, 0))).toThrow(/floorReach: from.*not a floor tile/);
  expect(() => floorReach(f, spot(3, 1, 1))).toThrow(/floorReach: from: floor 3/);
});
const flowRow = (f: Floors, floor: number, j: number) => {
  const w = f.grids[floor].world;
  return Array.from(w.flow.slice(j * w.W, (j + 1) * w.W)).join(',');
};
const onlyStairs = (l: FloorLink) => l.kind === 'stairs',
  anyLink = () => true;
test('floors: floorFlow leads over the floors through the links it may use', () => {
  const { f, stairs, lift } = crossFloors();
  floorFlow(f, spot(1, 3, 1), onlyStairs);
  eq(flowRow(f, 1, 1), '-1,2,1,0,1,2,-1', 'the target floor, through the shut door');
  eq(flowRow(f, 0, 1), '-1,7,6,5,4,3,-1', 'floor 0 leads to the stairs: one step over them');
  eq(flowRow(f, 2, 1), '-1,-1,-1,-1', 'a floor with no link has no way');
  eq(JSON.stringify(f.grids[0].flowDir(2.5 * T, 1.5 * T)), '[1,0]', 'flowDir on floor 0 heads for the stairs');
  eq(f.grids[0].flowDir(5.5 * T, 1.5 * T), null, 'on the stairs tile no neighbour is closer');
  ok(flowLink(f, 0, 5, 1, onlyStairs) === stairs, 'flowLink: the stairs lead on');
  eq(flowLink(f, 0, 1, 1, onlyStairs), null, 'the lift is not one to use');
  eq(flowLink(f, 1, 1, 1, onlyStairs), null, 'the stairs do not lead back down (floor 0 is farther)');
  eq(flowLink(f, 1, 3, 1, anyLink), null, 'the target tile itself');
  eq(flowLink(f, 2, 1, 1, anyLink), null, 'a tile with no way');
  eq(flowLink(f, 0, 9, 9, anyLink), null, 'outside the map');
  floorFlow(f, spot(1, 3, 1), anyLink);
  eq(flowRow(f, 0, 1), '-1,5,6,5,4,3,-1', 'with the lift too, the west end goes up by lift');
  ok(flowLink(f, 0, 1, 1, anyLink) === lift, 'flowLink picks the lift there');
  floorFlow(f, spot(0, 3, 1), onlyStairs);
  eq(flowRow(f, 1, 3), '-1,5,6,7,8,9,-1', 'the other way round: floor 1 leads down the stairs');
  ok(otherEnd(stairs, 0, 5, 1) === stairs.b && otherEnd(stairs, 1, 1, 1) === stairs.a, 'otherEnd from either end');
  expect(() => floorFlow(f, spot(0, 0, 0), anyLink)).toThrow(/floorFlow: target.*not a floor tile/);
});
test('floors: floorReach and unreachableFloorTiles cross only the links `use` accepts', () => {
  const { f } = crossFloors();
  eq(unreachableFloorTiles(f, spot(0, 1, 1)).length, 2, 'every link: only floor 2 (joined to nothing) is out of reach');
  eq(unreachableFloorTiles(f, spot(0, 1, 1), onlyStairs).length, 2, 'stairs alone still reach floor 1');
  const lifted = floorsFromRows(
    [
      ['#####', '#...#', '#####'],
      ['#####', '#...#', '#####'],
    ],
    [{ kind: 'elevator', a: spot(0, 3, 1), b: spot(1, 1, 1) }],
  );
  eq(unreachableFloorTiles(lifted, spot(0, 1, 1)).length, 0, 'the lift joins the floors');
  eq(
    JSON.stringify(unreachableFloorTiles(lifted, spot(0, 1, 1), onlyStairs)),
    JSON.stringify([spot(1, 1, 1), spot(1, 2, 1), spot(1, 3, 1)]),
    'without stairs, floor 1 is out of reach: enemies that never ride could not get there',
  );
  eq(reached(floorReach(lifted, spot(1, 2, 1), onlyStairs), 0), '0'.repeat(15), 'nor floor 0 from floor 1');
});
test('floors: crossLink moves a mover across a link once, until it steps off', () => {
  const { f, stairs } = crossFloors();
  const m: { floor: number; x: number; z: number; linkTile?: number } = { floor: 0, x: 5.3 * T, z: 1.6 * T };
  eq(
    crossLink(f, m, l => l.kind === 'elevator'),
    null,
    'a link it may not use: no move',
  );
  eq(m.floor, 0);
  ok(crossLink(f, m, onlyStairs) === stairs, 'up the stairs');
  eq(
    [m.floor, m.x, m.z, m.linkTile].join(','),
    [1, 1.5 * T, 1.5 * T, 1 * 7 + 1].join(','),
    'the middle of the other end',
  );
  eq(crossLink(f, m, onlyStairs), null, 'standing where it came out: no crossing back');
  m.x = 1.9 * T;
  eq(crossLink(f, m, onlyStairs), null, 'still on that tile');
  m.x = 2.5 * T;
  eq(crossLink(f, m, onlyStairs), null, 'off the tile: nothing there');
  eq(m.linkTile, -1, 'and the hold is gone');
  m.x = 1.5 * T;
  ok(crossLink(f, m, onlyStairs) === stairs, 'back on the stairs: down again');
  eq([m.floor, m.x, m.z].join(','), [0, 5.5 * T, 1.5 * T].join(','));
  const lost = { floor: 0, x: -3, z: 1.5 * T };
  eq(crossLink(f, lost, anyLink), null, 'outside the map');
  eq(crossLink(f, { floor: 7, x: 1.5 * T, z: 1.5 * T }, anyLink), null, 'a floor that does not exist');
});
test('lifts: standing on a lift for a moment starts it, the ride carries the rider to the other end', () => {
  const { f, lift: link } = crossFloors(),
    lift = createLift(link),
    rider: { floor: number; x: number; z: number; linkTile?: number } = { floor: 0, x: 1.5 * T, z: 1.5 * T };
  eq(updateLift(f, lift, rider, 0.5), null, 'on the lift: waiting');
  eq(lift.phase, 'wait');
  ok(lift.from === link.a, 'got on at the a end');
  rider.x = 2.5 * T;
  eq(updateLift(f, lift, rider, 0.1), null, 'stepped off before it started');
  eq([lift.phase, lift.t, lift.from].join(','), 'idle,0,', 'idle again, the wait starts over');
  rider.x = 1.5 * T;
  eq(updateLift(f, lift, rider, 0.5), null);
  eq(updateLift(f, lift, rider, 0.4), 'depart', `it starts after ${LIFT_WAIT} s`);
  ok(liftTarget(lift) === link.b, 'going to the b end');
  eq(liftProgress(lift), 0);
  eq(updateLift(f, lift, rider, 1), null, 'riding');
  near(liftProgress(lift), 1 / LIFT_RIDE, 1e-6, 'progress over the ride');
  rider.x = 2.5 * T; // the game let it drift: it still rides from where it got on
  eq(updateLift(f, lift, rider, LIFT_RIDE), 'arrive', 'the ride is over');
  eq(
    [rider.floor, rider.x, rider.z, rider.linkTile].join(','),
    [1, 5.5 * T, 3.5 * T, 3 * 7 + 5].join(','),
    'at the b end',
  );
  eq([lift.phase, liftProgress(lift), liftTarget(lift)].join(','), 'idle,0,', 'idle again');
  eq(updateLift(f, lift, rider, 5), null, 'standing where it came out: the lift does not go back');
  eq(lift.phase, 'idle');
  rider.x = 4.5 * T;
  eq(updateLift(f, lift, rider, 0.1), null, 'off the lift');
  eq(rider.linkTile, -1, 'the hold is dropped');
  rider.x = 5.5 * T;
  updateLift(f, lift, rider, 0.1);
  eq(
    updateLift(f, lift, rider, 0.1, { wait: 0.15, ride: 0.2 }),
    'depart',
    'back on: it goes down (the game may pass its own times)',
  );
  eq(updateLift(f, lift, rider, 0.2, { wait: 0.15, ride: 0.2 }), 'arrive');
  eq([rider.floor, rider.x, rider.z].join(','), [0, 1.5 * T, 1.5 * T].join(','), 'back on floor 0');
  const other = { floor: 1, x: 1.5 * T, z: 1.5 * T }; // the stairs tile of floor 1, not a lift stop
  eq(updateLift(f, createLift(link), other, 5), null, 'a tile that is not a stop');
  eq(updateLift(f, lift, rider, 0), null, 'dt 0 does nothing');
});
test('lifts: useFloor hands one floor to the module-level tile functions', () => {
  const { f } = crossFloors();
  useFloor(f, 1);
  const act = activeTileGrid().world;
  ok(act.grid === f.grids[1].world.grid && act.door === f.grids[1].world.door, 'the floor maps themselves, not copies');
  eq([act.W, act.H].join(','), '7,5');
  useFloor(f, 2);
  eq(activeTileGrid().world.door, f.grids[2].world.door, 'the next floor replaces it');
  expect(() => useFloor(f, 9)).toThrow(/useFloor: floor 9 does not exist/);
});
