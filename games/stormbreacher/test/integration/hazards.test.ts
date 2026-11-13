// The hazards in the game: the beach wave starts a mortar barrage whose shells warn and land, a mine goes off under the
// mech or from its shot, a checkpoint does not keep a shell in flight, and the hand map's mines stand clear of the start.
import { expect, test } from 'vitest';
import { AIMED_MORTAR, BARRAGES, MINE_TUNE } from '../../src/data/hazards.ts';
import { craftZ } from '../../src/data/craft.ts';
import { LANDING_TUNE } from '../../src/data/landing.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import type { MapDef } from '../../src/data/types.ts';
import { WEAPONS } from '../../src/data/weapons.ts';
import {
  newGame,
  retryFromCheckpoint,
  sendToScript,
  step,
  type GameEvent,
  type GameInput,
  type GameModel,
} from '../../src/logic/game.ts';
import { validateMapForMission } from '../../src/logic/mapCheck.ts';
import { seed } from '../../src/logic/rng.ts';
import { newPlayGame } from './playGame.ts';

const DT = 1 / 60;
const MORTAR = BARRAGES.mortar;

const idle: GameInput = {
  moveX: 0,
  moveZ: 0,
  turn: 0,
  jump: false,
  jumpHeld: false,
  boost: false,
  fire: false,
  sub: false,
};

type Landed = Extract<GameEvent, { kind: 'shellLand' }>;
type Warned = Extract<GameEvent, { kind: 'shellWarn' }>;

// An open field with mines at the given places: no props, no targets. The mech is at the origin.
function minefield(mines: { x: number; z: number }[]): GameModel {
  const map: MapDef = { ...M1B_HAND, props: [], targets: [], mines };
  const game = newPlayGame(map);
  game.mech.x = 0;
  game.mech.z = 0;
  game.mech.yaw = 0;
  return game;
}

// The events of `frames` frames, in order.
function run(game: GameModel, frames: number, input: GameInput = idle): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < frames; i++) {
    step(game, input, DT);
    events.push(...game.events);
  }
  return events;
}

const framesOf = (seconds: number): number => Math.ceil(seconds / DT);

// A mech bullet that flies from 5 m south of the mine, low, straight at the mine's middle.
function shootMine(game: GameModel, mine: { x: number; z: number }): void {
  const from = { x: mine.x, y: 1, z: mine.z + 5 };
  const len = Math.hypot(0.85, 5);
  game.bullets.push({
    weapon: 'autocannon',
    ...from,
    dx: 0,
    dy: -0.85 / len,
    dz: -5 / len,
    left: 50,
  });
}

test('the beach wave starts a mortar barrage, and a shell warns, then lands after the warning', () => {
  seed(1);
  const game = newPlayGame(M1B_HAND);
  // the aimed mortar is another hazard: this test reads the barrage's shells alone
  game.aimed = null;
  // on the sand, clear of the craft: its deck holds the barrage until the mech has left it
  game.mech.x = 0;
  game.mech.y = 0;
  game.mech.z = 100;
  const events = run(game, framesOf(MORTAR.interval + MORTAR.warn + 0.2));
  expect(game.barrages).toMatchObject([{ wave: 'beach-mortar', kind: 'mortar' }]);
  const warns = events.filter((event): event is Warned => event.kind === 'shellWarn');
  const lands = events.filter((event): event is Landed => event.kind === 'shellLand');
  expect(warns).toHaveLength(1);
  expect(lands).toHaveLength(1);
  expect(lands[0]).toMatchObject({ x: warns[0].x, z: warns[0].z });
  expect(warns[0].radius).toBe(MORTAR.radius);
  expect(events.indexOf(warns[0])).toBeLessThan(events.indexOf(lands[0]));
  expect(game.shells).toHaveLength(0);
});

test('a shell hurts a mech inside the blast and not one outside it, with the way it came from', () => {
  let hits = 0;
  let misses = 0;
  for (let n = 1; n <= 12; n++) {
    seed(n);
    const game = newPlayGame(M1B_HAND);
    // the mech stands still here, so the aimed mortar would also warn; this test reads the barrage's shells alone
    game.aimed = null;
    const events = run(game, framesOf(MORTAR.interval + MORTAR.warn + 0.2));
    const warn = events.find((event): event is Warned => event.kind === 'shellWarn');
    const land = events.find((event): event is Landed => event.kind === 'shellLand');
    if (!warn || !land) throw new Error('no shell came');
    const inside = Math.hypot(land.x - game.mech.x, land.z - game.mech.z) <= MORTAR.radius;
    expect(land.hit).toBe(inside);
    const damaged = events.filter(event => event.kind === 'damaged');
    if (inside) {
      hits++;
      expect(game.armor).toBe(MECH_TUNE.armor - MORTAR.damage);
      expect(damaged).toHaveLength(1);
      const { fromX, fromZ } = damaged[0] as Extract<GameEvent, { kind: 'damaged' }>;
      // toward the shell's place, as a unit vector
      const dx = land.x - game.mech.x;
      const dz = land.z - game.mech.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-6) {
        expect(fromX).toBeCloseTo(dx / d, 6);
        expect(fromZ).toBeCloseTo(dz / d, 6);
      }
    } else {
      misses++;
      expect(game.armor).toBe(MECH_TUNE.armor);
      expect(damaged).toHaveLength(0);
    }
  }
  expect(hits).toBeGreaterThan(0);
  expect(misses).toBeGreaterThan(0);
});

test('a mech past the barrage’s reach (z under minZ) gets no warning', () => {
  seed(1);
  const game = newPlayGame(M1B_HAND);
  step(game, idle, DT);
  // z 25 lies inside the aimed mortar's reach (minZ -10), so it is left out here too
  game.aimed = null;
  game.mech.z = MORTAR.minZ - 5;
  const events = run(game, framesOf(MORTAR.interval * 3));
  expect(events.filter(event => event.kind === 'shellWarn')).toHaveLength(0);
  expect(game.shells).toHaveLength(0);
});

test('the same seed and input give the same events', () => {
  const play = (): GameEvent[] => {
    seed(42);
    const game = newPlayGame(M1B_HAND);
    return run(game, 900, { ...idle, moveZ: 1 });
  };
  const first = play();
  expect(first.filter(event => event.kind === 'shellWarn').length).toBeGreaterThan(1);
  expect(play()).toEqual(first);
});

test('the mech’s shot sets a mine off: the shot stops, the mine goes, and a mech far away is not hurt', () => {
  const mine = { x: 0, z: -20 };
  const game = minefield([mine]);
  const shots = Math.ceil(MINE_TUNE.hp / WEAPONS.autocannon.damage);
  for (let i = 0; i < shots; i++) shootMine(game, mine);
  const events = run(game, 10);
  expect(events.filter(event => event.kind === 'mineBlast')).toEqual([
    { kind: 'mineBlast', x: mine.x, z: mine.z, hit: false },
  ]);
  expect(game.mines).toHaveLength(0);
  expect(game.bullets).toHaveLength(0);
  expect(game.armor).toBe(MECH_TUNE.armor);
});

test('a shot that leaves the mine standing (health left) still stops at it', () => {
  const mine = { x: 0, z: -20 };
  const game = minefield([mine]);
  game.mines[0].hp = MINE_TUNE.hp + WEAPONS.autocannon.damage;
  shootMine(game, mine);
  const events = run(game, 10);
  expect(events.filter(event => event.kind === 'mineBlast')).toHaveLength(0);
  expect(game.mines).toHaveLength(1);
  expect(game.mines[0].hp).toBe(MINE_TUNE.hp);
  expect(game.bullets).toHaveLength(0);
});

test('a mine shot near the mech hurts it, from the mine’s side', () => {
  // 3 m off: inside the blast, outside the step
  const mine = { x: 0, z: -(MINE_TUNE.stepRadius + 1) };
  const game = minefield([mine]);
  for (let i = 0; i < Math.ceil(MINE_TUNE.hp / WEAPONS.autocannon.damage); i++) shootMine(game, mine);
  const events = run(game, 10);
  expect(events.filter(event => event.kind === 'mineBlast')).toEqual([
    { kind: 'mineBlast', x: mine.x, z: mine.z, hit: true },
  ]);
  expect(game.armor).toBe(MECH_TUNE.armor - MINE_TUNE.damage);
  const damaged = events.find((event): event is Extract<GameEvent, { kind: 'damaged' }> => event.kind === 'damaged');
  expect(damaged).toMatchObject({ amount: MINE_TUNE.damage, fromX: 0, fromZ: -1 });
});

test('stepping on a mine sets it off and hurts the mech; a mine only beyond the blast does nothing', () => {
  const game = minefield([
    { x: 1, z: 0 },
    { x: 60, z: 0 },
  ]);
  const events = run(game, 2);
  expect(events.filter(event => event.kind === 'mineBlast')).toEqual([{ kind: 'mineBlast', x: 1, z: 0, hit: true }]);
  expect(game.mines).toEqual([{ x: 60, z: 0, hp: MINE_TUNE.hp }]);
  expect(game.armor).toBe(MECH_TUNE.armor - MINE_TUNE.damage);
  // a mine that went off does not go off again
  expect(run(game, 60).filter(event => event.kind === 'mineBlast')).toHaveLength(0);
});

test('a checkpoint keeps the barrage and the mines but not a shell that has not landed', () => {
  seed(3);
  const game = newPlayGame(M1B_HAND);
  // the first shell is warned and still in flight
  run(game, framesOf(MORTAR.interval) + 2);
  expect(game.shells).toHaveLength(1);
  const gone = game.mines.splice(0, 1)[0];
  sendToScript(game, { kind: 'enter', area: 'b-line' });
  for (const id of ['pillbox-1', 'pillbox-2']) {
    const target = game.targets.find(t => t.id === id);
    if (!target) throw new Error(`the map has no ${id}`);
    target.hp = 0;
    sendToScript(game, { kind: 'destroyed', target: id });
  }
  expect(game.checkpoint?.id).toBe('cp1');
  expect(game.shells).toHaveLength(1);
  const again = retryFromCheckpoint(game);
  expect(again.shells).toEqual([]);
  expect(again.barrages).toHaveLength(1);
  expect(again.mines).toHaveLength(M1B_HAND.mines!.length - 1);
  expect(again.mines.some(mine => mine.x === gone.x && mine.z === gone.z)).toBe(false);
});

test('the hand map’s mines are on the beach, 6 m or more from the start, and the map still passes the check', () => {
  const mines = M1B_HAND.mines ?? [];
  expect(mines).toHaveLength(6);
  const start = { x: 0, z: craftZ(M1B_HAND.bounds) + LANDING_TUNE.startDepth };
  for (const mine of mines) {
    expect(Math.hypot(mine.x - start.x, mine.z - start.z)).toBeGreaterThanOrEqual(6);
    expect(mine.z).toBeGreaterThanOrEqual(148);
    expect(mine.z).toBeLessThanOrEqual(162);
    expect(Math.abs(mine.x)).toBeLessThanOrEqual(60);
  }
  const skip = { targets: ['main-gun-1', 'main-gun-2', 'magazine'], waves: ['beach-mortar', 'battery'] };
  expect(validateMapForMission(M1B_HAND, M1, skip)).toEqual([]);
  // a map with no `mines` field plays as before
  const { mines: _mines, ...bare } = M1B_HAND;
  expect(newGame(bare).mines).toEqual([]);
});

test('a mech that stands in one place brings an aimed shell down on that place', () => {
  const game = newPlayGame(M1B_HAND);
  // the beach's spawn starts both: the timed barrage and the aimed mortar
  expect(game.barrages).toMatchObject([{ wave: 'beach-mortar', kind: 'mortar' }]);
  expect(game.aimed).not.toBeNull();
  // the aimed mortar alone; the beach's barrage would warn at its own interval too
  game.barrages = [];
  const events = run(game, framesOf(AIMED_MORTAR.stillSec) + 2);
  const warns = events.filter((event): event is Warned => event.kind === 'shellWarn');
  expect(warns).toHaveLength(1);
  expect(warns[0]).toMatchObject({ x: game.mech.x, z: game.mech.z, radius: AIMED_MORTAR.radius });
  expect(game.shells).toHaveLength(1);
  expect(game.shells[0]).toMatchObject({ x: game.mech.x, z: game.mech.z });
  expect(game.shells[0].damage).toBe(AIMED_MORTAR.damage);
  expect(game.shells[0].warn).toBe(AIMED_MORTAR.warn);
  // the shell has already counted this frame's dt down
  expect(game.shells[0].left).toBeCloseTo(AIMED_MORTAR.warn, 1);
});

test('a mech that leaves the circle starts the stay again, and the next shell comes a full stay later', () => {
  const game = newPlayGame(M1B_HAND);
  game.barrages = [];
  run(game, framesOf(AIMED_MORTAR.stillSec) + 2);
  expect(game.shells).toHaveLength(1);
  game.mech.x += AIMED_MORTAR.radius + 4;
  run(game, 1);
  expect(game.aimed?.still).toBe(0);
  const early = run(game, framesOf(AIMED_MORTAR.stillSec - 0.2));
  expect(early.filter(event => event.kind === 'shellWarn')).toHaveLength(0);
  const late = run(game, framesOf(0.3));
  expect(late.filter(event => event.kind === 'shellWarn')).toHaveLength(1);
});

test('the aimed mortar does not reach past its minZ, and its stay does not run there', () => {
  const game = newPlayGame(M1B_HAND);
  game.barrages = [];
  game.mech.z = AIMED_MORTAR.minZ - 5;
  const events = run(game, framesOf(AIMED_MORTAR.stillSec * 2));
  expect(events.filter(event => event.kind === 'shellWarn')).toHaveLength(0);
  expect(game.aimed?.still).toBe(0);
});

test('the aimed mortar ignores cover: a shell comes down even behind the line', () => {
  const game = newPlayGame(M1B_HAND);
  game.barrages = [];
  // just landward of line 1's hedgehogs
  game.mech.x = 0;
  game.mech.z = 140;
  const events = run(game, framesOf(AIMED_MORTAR.stillSec) + 2);
  const warns = events.filter((event): event is Warned => event.kind === 'shellWarn');
  expect(warns).toHaveLength(1);
  expect(warns[0]).toMatchObject({ x: 0, z: 140 });
});

test('a cutscene holds the stay, and the warning comes a full stay after it ends', () => {
  const game = newPlayGame(M1B_HAND);
  game.barrages = [];
  game.script.cutscene = { id: 'landing', left: 1 };
  const held = run(game, framesOf(2));
  expect(held.filter(event => event.kind === 'shellWarn')).toHaveLength(0);
  expect(game.aimed?.still).toBeGreaterThan(0);
  expect(game.aimed?.still).toBeLessThan(1.2);
  const after = run(game, framesOf(AIMED_MORTAR.stillSec) + 2);
  expect(after.filter(event => event.kind === 'shellWarn')).toHaveLength(1);
});

test('a checkpoint keeps the stay of the aimed mortar and drops a shell that has not landed', () => {
  const game = newPlayGame(M1B_HAND);
  game.barrages = [];
  run(game, framesOf(3));
  const still = game.aimed?.still ?? 0;
  expect(still).toBeGreaterThan(2);
  sendToScript(game, { kind: 'enter', area: 'b-line' });
  for (const id of ['pillbox-1', 'pillbox-2']) {
    const target = game.targets.find(t => t.id === id);
    if (!target) throw new Error(`the map has no ${id}`);
    target.hp = 0;
    sendToScript(game, { kind: 'destroyed', target: id });
  }
  expect(game.checkpoint?.id).toBe('cp1');
  const again = retryFromCheckpoint(game);
  expect(again.aimed?.still).toBeCloseTo(still, 6);
  expect(again.shells).toEqual([]);
});
