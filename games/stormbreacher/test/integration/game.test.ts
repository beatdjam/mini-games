import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { PROP_HP, TARGET_HP, TARGET_SIZE } from '../../src/data/props.ts';
import { MECH_TUNE, MOVE_TUNE, PLAY_TUNE } from '../../src/data/tune.ts';
import type { MapDef } from '../../src/data/types.ts';
import { M1_LOADOUT, WEAPONS } from '../../src/data/weapons.ts';
import { rectDistance } from '../../src/logic/collide.ts';
import type { Ray3 } from '../../src/logic/fcs.ts';
import { newGame, step, type GameEvent, type GameInput, type GameModel } from '../../src/logic/game.ts';
import { seed } from '../../src/logic/rng.ts';

const DT = 1 / 60;

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

// Puts the mech where the tests fire from: in front of pillbox-1 (its +z side), facing the land.
function atPillbox1(game: GameModel): void {
  const place = M1B_HAND.targets[0];
  game.mech.x = place.x;
  game.mech.z = place.z + 20;
  game.mech.yaw = 0;
}

// The breakable hedgehog of line 2 nearest the sea, found by its place rather than its index in the map.
function breakableHedgehogIndex(): number {
  const prop = M1B_HAND.props.find(item => item.breakable === true && item.x === 52.33 && item.z === 93.33);
  if (!prop) throw new Error('the hand map has the breakable hedgehog at x 52.33, z 93.33');
  return M1B_HAND.props.indexOf(prop);
}

// Puts the mech in front of that hedgehog (its +z side), facing the land.
function atBreakableHedgehog(game: GameModel): void {
  game.mech.x = 52.33;
  game.mech.z = 105;
  game.mech.yaw = 0;
}

type HitEvent = Extract<GameEvent, { kind: 'hit' }>;

// Steps with `input` for the first frame and `idle` after, until a bullet reports a hit. Returns the hit and the number
// of frames it took (null when none came in `maxFrames`).
function firstHit(game: GameModel, input: GameInput, maxFrames: number): { hit: HitEvent; frames: number } | null {
  for (let i = 0; i < maxFrames; i++) {
    step(game, i === 0 ? input : idle, DT);
    for (const event of game.events) if (event.kind === 'hit') return { hit: event, frames: i + 1 };
  }
  return null;
}

// This runs in node without three or the DOM: that it passes is itself the check that the logic runs without a page.
test('120 frames of 1/60 s advance the game by 2 s', () => {
  const game = newGame(M1B_HAND);
  for (let i = 0; i < 120; i++) step(game, idle, 1 / 60);
  expect(game.time).toBeCloseTo(2, 6);
});

test('a new game puts the mech at the front edge facing the land', () => {
  const game = newGame(M1B_HAND);
  expect(game.mech.x).toBe((M1B_HAND.bounds.minX + M1B_HAND.bounds.maxX) / 2);
  expect(game.mech.z).toBe(M1B_HAND.bounds.maxZ - PLAY_TUNE.startMargin);
  expect(game.mech.yaw).toBe(0);
  expect(game.targets).toHaveLength(3);
  for (const target of game.targets) expect(target.hp).toBe(TARGET_HP[target.kind]);
});

test('holding fire in front of a pillbox breaks it', () => {
  const game = newGame(M1B_HAND);
  atPillbox1(game);
  let hits = 0;
  let destroyedFrame = -1;
  for (let i = 0; i < 600 && destroyedFrame < 0; i++) {
    step(game, { ...idle, fire: true }, 1 / 60);
    for (const event of game.events) {
      if (event.kind === 'hit' && event.target === 'pillbox-1') hits++;
      if (event.kind === 'destroyed' && event.id === 'pillbox-1') destroyedFrame = i;
    }
  }
  expect(destroyedFrame).toBeGreaterThanOrEqual(0);
  expect(hits).toBe(TARGET_HP.pillbox / WEAPONS[M1_LOADOUT.main].damage);
  expect(game.targets.find(target => target.id === 'pillbox-1')?.hp).toBe(0);
});

test('a shot that misses flies its range and vanishes without a hit', () => {
  // no props: a shot now stops at a prop (the hedgehogs of line 3 stand on the sea side of this spot)
  const game = newGame({ ...M1B_HAND, props: [] });
  atPillbox1(game);
  game.mech.yaw = Math.PI; // away from the land, toward the sea
  const def = WEAPONS[M1_LOADOUT.main];
  step(game, { ...idle, fire: true }, DT);
  expect(game.events.some(event => event.kind === 'shot')).toBe(true);
  expect(game.bullets).toHaveLength(1);
  let frames = 1;
  let hits = 0;
  while (game.bullets.length > 0 && frames < 120) {
    step(game, idle, DT);
    frames++;
    hits += game.events.filter(event => event.kind === 'hit').length;
  }
  expect(hits).toBe(0);
  expect(frames / 60).toBeCloseTo(def.range / def.speed, 1);
});

test('breaking every target on the map no longer clears the game', () => {
  const oneTarget = { ...M1B_HAND, targets: [M1B_HAND.targets[0]] };
  const game = newGame(oneTarget);
  atPillbox1(game);
  let destroyed = false;
  for (let i = 0; i < 600 && !destroyed; i++) {
    step(game, { ...idle, fire: true }, 1 / 60);
    destroyed = game.events.some(event => event.kind === 'destroyed');
  }
  expect(destroyed).toBe(true);
  expect(game.cleared).toBe(false);
});

test('the same inputs give the same game', () => {
  const inputs: GameInput[] = [];
  for (let i = 0; i < 120; i++) inputs.push({ ...idle, moveZ: 1 });
  for (let i = 0; i < 180; i++) inputs.push({ ...idle, moveZ: 1, turn: -MOVE_TUNE.turn / 60, fire: true });
  for (let i = 0; i < 60; i++) inputs.push({ ...idle, jump: i === 0, jumpHeld: true, boost: true });

  const run = (game: GameModel): GameEvent[][] => {
    const frames: GameEvent[][] = [];
    for (const input of inputs) {
      step(game, input, 1 / 60);
      frames.push(game.events);
    }
    return frames;
  };

  seed(5);
  const a = newGame(M1B_HAND);
  const eventsA = run(a);
  seed(5);
  const b = newGame(M1B_HAND);
  const eventsB = run(b);
  expect(a.mech).toEqual(b.mech);
  expect(a.targets).toEqual(b.targets);
  expect(a.time).toEqual(b.time);
  expect(eventsA).toEqual(eventsB);
});

test('the mech does not walk into a target', () => {
  const game = newGame(M1B_HAND);
  atPillbox1(game);
  const place = M1B_HAND.targets[0];
  const size = TARGET_SIZE[place.kind];
  const rect = { x: place.x, z: place.z, halfW: size.w / 2, halfD: size.d / 2, yaw: place.yaw };
  for (let i = 0; i < 300; i++) {
    step(game, { ...idle, moveZ: 1 }, 1 / 60);
    expect(rectDistance(rect, game.mech.x, game.mech.z)).toBeGreaterThanOrEqual(MECH_TUNE.radius - 1e-9);
  }
});

test('a prop between the mech and a target stops the shot', () => {
  const map: MapDef = {
    ...M1B_HAND,
    props: [{ kind: 'block', x: -33, z: -5, yaw: 0, scale: 1 }],
    targets: [M1B_HAND.targets[0]],
  };
  const game = newGame(map);
  game.mech.x = -33;
  game.mech.z = 5;
  game.mech.yaw = 0;
  const result = firstHit(game, { ...idle, fire: true }, 60);
  if (!result) throw new Error('the shot hit something');
  expect(result.hit.target).toBeNull();
  expect(result.hit.prop).toBe(0);
  expect(5 - result.hit.z).toBeCloseTo(8, 0);
  expect(game.targets[0].hp).toBe(TARGET_HP.pillbox);
  expect(game.bullets).toHaveLength(0);
});

test('the sub gun breaks a pillbox in fewer shots', () => {
  const game = newGame(M1B_HAND);
  atPillbox1(game);
  let hits = 0;
  for (let i = 0; i < 600 && game.targets[0].hp > 0; i++) {
    step(game, { ...idle, sub: true }, 1 / 60);
    for (const event of game.events) {
      if (event.kind !== 'hit' || event.target !== 'pillbox-1') continue;
      hits++;
      expect(event.weapon).toBe('heavyGun');
    }
  }
  expect(hits).toBe(Math.ceil(TARGET_HP.pillbox / WEAPONS.heavyGun.damage));
  expect(game.targets.find(target => target.id === 'pillbox-1')?.hp).toBe(0);
});

test('the autocannon does not reach past its range', () => {
  const place = M1B_HAND.targets[0];
  const map: MapDef = { ...M1B_HAND, props: [], targets: [place] };
  const game = newGame(map);
  game.mech.x = place.x;
  game.mech.z = place.z + 150;
  game.mech.yaw = 0;
  expect(firstHit(game, { ...idle, fire: true }, 120)).toBeNull();
  expect(game.bullets).toHaveLength(0);

  const subHit = firstHit(game, { ...idle, sub: true }, 120);
  if (!subHit) throw new Error('the heavy gun hit something');
  expect(subHit.hit.target).toBe('pillbox-1');
  expect(subHit.hit.weapon).toBe('heavyGun');
});

test('running out of ammo stops the shots', () => {
  const game = newGame(M1B_HAND);
  atPillbox1(game);
  game.main.ammo = 3;
  let shots = 0;
  for (let i = 0; i < 120; i++) {
    step(game, { ...idle, fire: true }, 1 / 60);
    shots += game.events.filter(event => event.kind === 'shot').length;
  }
  expect(shots).toBe(3);
});

test('a breakable hedgehog breaks after its health in autocannon shots', () => {
  const index = breakableHedgehogIndex();
  const game = newGame(M1B_HAND);
  atBreakableHedgehog(game);
  const rects = game.rects.length;
  const boxes = game.propBoxes.length;
  const refs = game.propRefs.length;
  let shots = 0;
  let broke: GameEvent | undefined;
  for (let i = 0; i < 600 && !broke; i++) {
    step(game, { ...idle, fire: true }, 1 / 60);
    for (const event of game.events) {
      if (event.kind === 'hit' && event.prop === index) shots++;
      if (event.kind === 'propDestroyed') broke = event;
    }
  }
  if (broke?.kind !== 'propDestroyed') throw new Error('the hedgehog broke');
  expect(shots).toBe(Math.ceil(PROP_HP.hedgehog / WEAPONS[M1_LOADOUT.main].damage));
  expect(broke.prop).toBe(index);
  expect(game.rects.length).toBe(rects - 1);
  expect(game.propBoxes.length).toBe(boxes - 1);
  expect(game.propRefs.length).toBe(refs - 1);
  expect(game.breakables.find(state => state.prop === index)?.hp).toBe(0);
});

test('the sub gun breaks a breakable hedgehog in one shot', () => {
  const game = newGame(M1B_HAND);
  atBreakableHedgehog(game);
  let shots = 0;
  let broke = false;
  for (let i = 0; i < 600 && !broke; i++) {
    step(game, { ...idle, sub: true }, 1 / 60);
    for (const event of game.events) {
      if (event.kind === 'hit' && event.prop !== null) shots++;
      if (event.kind === 'propDestroyed') broke = true;
    }
  }
  expect(broke).toBe(true);
  expect(shots).toBe(1);
});

test('a prop that is not marked breakable takes no damage', () => {
  const game = newGame(M1B_HAND);
  game.mech.x = -61;
  game.mech.z = 150;
  game.mech.yaw = 0;
  const rects = game.rects.length;
  let destroyed = false;
  for (let i = 0; i < 120; i++) {
    step(game, { ...idle, fire: true }, 1 / 60);
    for (const event of game.events) if (event.kind === 'propDestroyed') destroyed = true;
  }
  expect(destroyed).toBe(false);
  expect(game.rects.length).toBe(rects);
});

test('a broken prop does not come back', () => {
  const index = breakableHedgehogIndex();
  const game = newGame(M1B_HAND);
  atBreakableHedgehog(game);
  let broke = false;
  for (let i = 0; i < 600 && !broke; i++) {
    step(game, { ...idle, fire: true }, 1 / 60);
    broke = game.events.some(event => event.kind === 'propDestroyed');
  }
  if (!broke) throw new Error('the hedgehog broke');
  const rects = game.rects.length;
  const boxes = game.propBoxes.length;
  const refs = game.propRefs.length;
  for (let i = 0; i < 60; i++) step(game, idle, 1 / 60);
  expect(game.rects.length).toBe(rects);
  expect(game.propBoxes.length).toBe(boxes);
  expect(game.propRefs.length).toBe(refs);
  expect(game.breakables.find(state => state.prop === index)?.hp).toBe(0);
});

test('the mech stays inside the map’s bounds', () => {
  const game = newGame(M1B_HAND);
  game.mech.x = M1B_HAND.bounds.minX + 2;
  game.mech.z = M1B_HAND.bounds.maxZ - 10;
  game.mech.yaw = 0;
  for (let i = 0; i < 120; i++) step(game, { ...idle, moveX: -1 }, 1 / 60);
  expect(game.mech.x).toBeGreaterThanOrEqual(M1B_HAND.bounds.minX + MECH_TUNE.radius);
});

test('the breakable stretch of line 2 is shut until it is shot, then the mech walks through', () => {
  // without firing, the hedgehogs stop the mech on the sea side of the line
  const shut = newGame(M1B_HAND);
  atBreakableHedgehog(shut);
  for (let i = 0; i < 600; i++) step(shut, { ...idle, moveZ: 1 }, 1 / 60);
  expect(shut.mech.z).toBeGreaterThan(90);

  // firing while walking breaks the stretch and the mech passes the back edge of line 2 (z 80)
  const through = newGame(M1B_HAND);
  atBreakableHedgehog(through);
  const broke: number[] = [];
  let crossed = false;
  for (let i = 0; i < 1800 && !crossed; i++) {
    step(through, { ...idle, moveZ: 1, fire: true }, 1 / 60);
    for (const event of through.events) if (event.kind === 'propDestroyed') broke.push(event.prop);
    for (const rect of through.rects) {
      expect(rectDistance(rect, through.mech.x, through.mech.z)).toBeGreaterThanOrEqual(MECH_TUNE.radius - 1e-9);
    }
    if (through.mech.z < 78) crossed = true;
  }
  expect(crossed).toBe(true);
  expect(broke.length).toBeGreaterThanOrEqual(3);
  for (const prop of broke) expect(through.map.props[prop].breakable).toBe(true);
});

test('a shot does not hit in the frame it is fired; it lands after about distance / speed', () => {
  const place = M1B_HAND.targets[0];
  const game = newGame({ ...M1B_HAND, props: [], targets: [place] });
  game.mech.x = place.x;
  game.mech.z = place.z + 100;
  game.mech.yaw = 0;
  const def = WEAPONS[M1_LOADOUT.main];
  const result = firstHit(game, { ...idle, fire: true }, 120);
  if (!result) throw new Error('the shot hit the pillbox');
  expect(result.hit.target).toBe('pillbox-1');
  expect(result.frames).toBeGreaterThan(1);
  expect(result.frames / 60).toBeCloseTo(100 / def.speed, 1);
});

test('a shot aimed down stops at the ground', () => {
  const game = newGame({ ...M1B_HAND, props: [], targets: [] });
  atPillbox1(game);
  const chestY = game.mech.y + MECH_TUNE.chestHeight;
  const aim: Ray3 = { ox: game.mech.x, oy: chestY, oz: game.mech.z, dx: 0, dy: -0.5, dz: -Math.sqrt(0.75) };
  const result = firstHit(game, { ...idle, fire: true, aim }, 60);
  if (!result) throw new Error('the shot reached the ground');
  expect(result.hit.target).toBeNull();
  expect(result.hit.prop).toBeNull();
  expect(result.hit.y).toBeCloseTo(0, 6);
  expect(game.bullets).toHaveLength(0);
});

// The mech at the origin facing -z, one pillbox 100 m away at `deg` from the front, no props.
function withPillboxAtAngle(deg: number): GameModel {
  const rad = (deg * Math.PI) / 180;
  const place = { id: 'dummy', kind: 'pillbox' as const, x: Math.sin(rad) * 100, z: -Math.cos(rad) * 100, yaw: 0 };
  const game = newGame({ ...M1B_HAND, props: [], targets: [place] });
  game.mech.x = 0;
  game.mech.z = 0;
  game.mech.yaw = 0;
  return game;
}

test('a target inside the aim circle becomes the aim target and the shots reach it', () => {
  seed(3);
  const game = withPillboxAtAngle(5);
  let hits = 0;
  for (let i = 0; i < 90; i++) {
    step(game, { ...idle, fire: true }, DT);
    expect(game.aimTarget).toBe('dummy');
    for (const event of game.events) if (event.kind === 'hit' && event.target === 'dummy') hits++;
  }
  expect(hits).toBeGreaterThan(0);
});

test('a target outside the aim circle is not the aim target', () => {
  const game = withPillboxAtAngle(12);
  step(game, idle, DT);
  expect(game.aimTarget).toBeNull();
});

test('the same seed and the same inputs give the same events; another seed gives other shots', () => {
  const run = (n: number): GameEvent[][] => {
    seed(n);
    const game = withPillboxAtAngle(3);
    const frames: GameEvent[][] = [];
    for (let i = 0; i < 90; i++) {
      step(game, { ...idle, fire: true, sub: i % 30 === 0 }, DT);
      frames.push(game.events);
    }
    return frames;
  };
  const first = run(11);
  expect(run(11)).toEqual(first);
  expect(run(12)).not.toEqual(first);
});
