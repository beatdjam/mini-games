import { expect, test } from 'vitest';
import { ENEMIES, M1_WAVE_ENEMY, type EnemyKind } from '../../src/data/enemies.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import { PROP_SIZE } from '../../src/data/props.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import type { MapDef } from '../../src/data/types.ts';
import { WEAPONS } from '../../src/data/weapons.ts';
import { rectDistance } from '../../src/logic/collide.ts';
import {
  isEnemyBullet,
  sendToScript,
  step,
  type GameEvent,
  type GameInput,
  type GameModel,
} from '../../src/logic/game.ts';
import { mapBlockers } from '../../src/logic/mapShapes.ts';
import { fireRayHit } from '../../src/logic/fire.ts';
import { newEnemy } from '../../src/logic/enemies.ts';
import { newPlayGame } from './playGame.ts';
import { seed } from '../../src/logic/rng.ts';

const DT = 1 / 60;
const GRUNT = ENEMIES.grunt;

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

// An open field with a wave `b-squad`: no props, no targets. The wave's table plays no part here, so a test chooses the
// places and the kinds itself.
function field(places: { x: number; z: number }[]): MapDef {
  return { ...M1B_HAND, props: [], targets: [], spawns: { 'b-squad': places } };
}

// Starts the wave by hand (the mech at the origin facing -z), as the b-line cue does, with a grunt at each place. A test
// that wants another kind pushes it in itself.
function withSquad(places: { x: number; z: number }[]): GameModel {
  const game = newPlayGame(field(places));
  game.mech.x = 0;
  game.mech.z = 0;
  game.mech.yaw = 0;
  places.forEach((place, i) => {
    game.enemies.push(newEnemy(`b-squad-${i + 1}`, 'b-squad', 'grunt', place.x, place.z));
  });
  return game;
}

function count(events: readonly GameEvent[], kind: GameEvent['kind']): number {
  return events.filter(event => event.kind === kind).length;
}

// Walks the mech from just outside b-line (z 150) through the first line's breakthrough at x 40, until a frame reports
// `spawned`. Returns that frame's events, or null when none did.
function walkIntoBLine(game: GameModel): GameEvent[] | null {
  game.mech.x = 40;
  game.mech.z = 153;
  game.mech.yaw = 0;
  for (let i = 0; i < 180; i++) {
    step(game, { ...idle, moveZ: 1 }, DT);
    if (count(game.events, 'spawned') > 0) return game.events;
  }
  return null;
}

test('walking into b-line puts one enemy at each of the six b-squad places, in the wave’s order and kind', () => {
  const game = newPlayGame(M1B_HAND);
  const events = walkIntoBLine(game);
  expect(events).toContainEqual({ kind: 'spawned', wave: 'b-squad', count: 6 });
  expect(game.script.spawned).toEqual(['beach-mortar', 'b-squad']);
  expect(game.enemies.map(enemy => enemy.id)).toEqual([1, 2, 3, 4, 5, 6].map(n => `b-squad-${n}`));
  const kinds = ['heavy', 'assault', 'grunt', 'grunt', 'assault', 'grunt'] as const;
  expect(kinds).toHaveLength(6);
  game.enemies.forEach((enemy, i) => {
    const kind = kinds[i];
    expect(enemy).toMatchObject({ wave: 'b-squad', kind, hp: ENEMIES[kind].hp, awake: false });
    expect(enemy.x).toBe(M1B_HAND.spawns['b-squad'][i].x);
    expect(enemy.z).toBe(M1B_HAND.spawns['b-squad'][i].z);
  });
  expect(game.mech.z).toBeGreaterThan(120);
});

test('a wave the map has no place for puts out nothing', () => {
  const game = newPlayGame({ ...M1B_HAND, spawns: {} });
  expect(walkIntoBLine(game)).toBeNull();
  expect(game.script.spawned).toContain('b-squad');
  expect(game.enemies).toEqual([]);
});

test('every wave with places on the hand map has a kind for each place', () => {
  for (const wave of M1.waves) {
    const places = M1B_HAND.spawns[wave];
    if (places === undefined) continue;
    const kinds = M1_WAVE_ENEMY[wave];
    expect(kinds, `the wave ${wave} has no kind table`).toBeDefined();
    expect(kinds, `the wave ${wave} has a kind for each of its places`).toHaveLength(places.length);
  }
});

test('four autocannon shots bring a grunt down, and so does one heavy gun shot', () => {
  seed(1);
  const game = withSquad([{ x: 0, z: -40 }]);
  const hits: string[] = [];
  let down: GameEvent | null = null;
  for (let i = 0; i < 240 && !down; i++) {
    step(game, { ...idle, fire: true }, DT);
    for (const event of game.events) {
      if (event.kind === 'hit' && event.enemy !== null) hits.push(event.enemy);
      if (event.kind === 'enemyDown') down = event;
    }
  }
  expect(hits).toEqual(Array(GRUNT.hp / WEAPONS.autocannon.damage).fill('b-squad-1'));
  expect(down).toMatchObject({ kind: 'enemyDown', id: 'b-squad-1' });
  expect(game.enemies[0].hp).toBe(0);

  seed(1);
  const heavy = withSquad([{ x: 0, z: -40 }]);
  const heavyHits: string[] = [];
  let heavyDown = 0;
  for (let i = 0; i < 120 && heavyDown === 0; i++) {
    step(heavy, { ...idle, sub: i === 0 }, DT);
    for (const event of heavy.events) {
      if (event.kind === 'hit' && event.enemy !== null) heavyHits.push(event.enemy);
      if (event.kind === 'enemyDown') heavyDown++;
    }
  }
  expect(heavyHits).toEqual(['b-squad-1']);
  expect(heavyDown).toBe(1);
});

test('a fallen enemy stays but does not move, shoot or take a hit', () => {
  seed(1);
  const game = withSquad([{ x: 0, z: -40 }]);
  const fallen = game.enemies[0];
  fallen.hp = 0;
  fallen.awake = true;
  const at = { x: fallen.x, z: fallen.z };
  let hitEnemy = 0;
  for (let i = 0; i < 300; i++) {
    step(game, { ...idle, fire: true }, DT);
    for (const event of game.events) if (event.kind === 'hit' && event.enemy !== null) hitEnemy++;
  }
  expect(game.enemies).toHaveLength(1);
  expect({ x: fallen.x, z: fallen.z }).toEqual(at);
  expect(hitEnemy).toBe(0);
  expect(game.bullets.some(bullet => 'enemy' in bullet)).toBe(false);
  expect(game.armor).toBe(MECH_TUNE.armor);
});

test('the script gets `cleared` once, when the last enemy of the wave is down', () => {
  seed(2);
  const game = withSquad([
    { x: 0, z: -40 },
    { x: 30, z: -40 },
  ]);
  game.enemies[1].hp = 0;
  for (let i = 0; i < 10; i++) step(game, idle, DT);
  expect(game.script.cleared).toEqual([]);
  let frame = 0;
  while (game.enemies[0].hp > 0 && frame++ < 240) {
    step(game, { ...idle, fire: true }, DT);
    expect(game.script.cleared).toEqual(game.enemies[0].hp > 0 ? [] : ['b-squad']);
  }
  expect(game.enemies[0].hp).toBe(0);
  expect(game.script.cleared).toEqual(['b-squad']);
  for (let i = 0; i < 10; i++) step(game, idle, DT);
  expect(game.script.cleared).toEqual(['b-squad']);
});

test('an enemy’s bullets take the armour down, with the way they came from', () => {
  seed(5);
  // the enemy stands 25 m ahead of the mech and wakes at once
  const game = withSquad([{ x: 0, z: -GRUNT.stopDist }]);
  const damaged: Extract<GameEvent, { kind: 'damaged' }>[] = [];
  let mechHits = 0;
  for (let i = 0; i < 1800; i++) {
    step(game, idle, DT);
    for (const event of game.events) {
      if (event.kind === 'damaged') damaged.push(event);
      if (event.kind === 'hit' && event.mech) mechHits++;
    }
  }
  expect(damaged.length).toBeGreaterThan(3);
  expect(mechHits).toBe(damaged.length);
  expect(game.armor).toBe(MECH_TUNE.armor - GRUNT.damage * damaged.length);
  for (const event of damaged) {
    expect(event.amount).toBe(GRUNT.damage);
    // the bullets fly toward +z, so they came from -z
    expect(event.fromZ).toBeLessThan(-0.9);
  }
});

test('an enemy’s bullet stops at a prop and does not hit the mech behind it', () => {
  const game = newPlayGame({
    ...field([]),
    props: [{ kind: 'block', x: 0, z: -10, yaw: 0, scale: 1 }],
  });
  game.mech.x = 0;
  game.mech.z = 0;
  const y = game.mech.y + MECH_TUNE.chestHeight;
  game.bullets.push({ enemy: 'grunt', x: 0, y, z: -30, dx: 0, dy: 0, dz: 1, left: 80 });
  const hits: Extract<GameEvent, { kind: 'hit' }>[] = [];
  for (let i = 0; i < 60; i++) {
    step(game, idle, DT);
    for (const event of game.events) if (event.kind === 'hit') hits.push(event);
  }
  expect(hits).toHaveLength(1);
  expect(hits[0]).toMatchObject({ weapon: null, mech: false, enemy: null, target: null });
  expect(hits[0].prop).toBe(0);
  expect(game.armor).toBe(MECH_TUNE.armor);
  expect(game.bullets).toHaveLength(0);
});

test('a standing pillbox stops an enemy’s bullet unharmed, and an enemy behind it fires only once it has come round to a clear line', () => {
  seed(5);
  const pillbox = { id: 'pillbox-1', kind: 'pillbox' as const, x: 0, z: -15, yaw: 0 };
  const game = newPlayGame({ ...field([]), targets: [pillbox] });
  game.mech.x = 0;
  game.mech.z = 0;
  game.mech.yaw = 0;
  game.enemies.push(newEnemy('b-squad-1', 'b-squad', 'grunt', 0, -30));
  const y = game.mech.y + MECH_TUNE.chestHeight;
  game.bullets.push({ enemy: 'grunt', x: 0, y, z: -30, dx: 0, dy: 0, dz: 1, left: 80 });
  const hits: Extract<GameEvent, { kind: 'hit' }>[] = [];
  let shotsWithoutLine = 0;
  let shots = 0;
  for (let i = 0; i < 600; i++) {
    const before = game.enemies[0].wait;
    step(game, idle, DT);
    for (const event of game.events) if (event.kind === 'hit') hits.push(event);
    // its timer going back up is a shot; the pillbox must not be between it and the mech then
    if (game.enemies[0].wait > before) {
      shots++;
      if (inSight(game) === 0) shotsWithoutLine++;
    }
  }
  // the pushed bullet stops at the pillbox's wall; the pillbox itself takes no harm
  expect(hits[0]).toMatchObject({ weapon: null, mech: false, enemy: null, target: null, prop: null });
  expect(hits[0].z).toBeLessThan(-10);
  expect(game.targets[0].hp).toBeGreaterThan(0);
  // the enemy walks round the pillbox and shoots from there: every shot it fired had a clear line
  expect(shots).toBeGreaterThan(0);
  expect(shotsWithoutLine).toBe(0);
});

test('the soft lock does not pull toward an enemy hidden behind a pillbox, but toward the pillbox in front', () => {
  seed(5);
  const pillbox = { id: 'pillbox-1', kind: 'pillbox' as const, x: 0, z: -15, yaw: 0 };
  const game = newPlayGame({ ...field([]), targets: [pillbox] });
  game.mech.x = 0;
  game.mech.z = 0;
  game.mech.yaw = 0;
  game.enemies.push(newEnemy('b-squad-1', 'b-squad', 'grunt', 0, -30));
  // the aim goes straight at the enemy's middle, through the pillbox, so by angle alone the enemy would win
  const atEnemy = (): GameInput => {
    const enemy = game.enemies[0];
    const oy = game.mech.y + MECH_TUNE.chestHeight;
    const aim = { ox: 0, oy, oz: 0, dx: enemy.x, dy: GRUNT.height / 2 - oy, dz: enemy.z };
    return { ...idle, aim };
  };
  step(game, idle, DT);
  for (let i = 0; i < 30; i++) {
    step(game, atEnemy(), DT);
    expect(game.aimTarget).toBe('pillbox-1');
  }
  // with the pillbox down the enemy is in sight, and the lock goes to it
  game.targets[0].hp = 0;
  step(game, atEnemy(), DT);
  expect(game.aimTarget).toBe('b-squad-1');
});

test('armour at 0 downs the mech, and a downed game does not change', () => {
  seed(5);
  const game = withSquad([{ x: 0, z: -GRUNT.stopDist }]);
  game.armor = GRUNT.damage;
  let frame = 0;
  while (!game.downed && frame++ < 1800) step(game, idle, DT);
  expect(game.downed).toBe(true);
  expect(game.armor).toBe(0);
  const kinds = game.events.map(event => event.kind);
  expect(kinds.filter(kind => kind === 'downed')).toHaveLength(1);
  expect(kinds.indexOf('damaged')).toBeLessThan(kinds.indexOf('downed'));

  const snapshot = (): string =>
    JSON.stringify({
      time: game.time,
      armor: game.armor,
      mech: game.mech,
      enemies: game.enemies,
      bullets: game.bullets,
      main: game.main,
      sub: game.sub,
      script: game.script,
    });
  const before = snapshot();
  for (let i = 0; i < 120; i++) {
    step(game, { ...idle, moveZ: -1, fire: true, sub: true }, DT);
    expect(game.events).toEqual([]);
  }
  expect(snapshot()).toBe(before);
  expect(game.cleared).toBe(false);
});

test('the soft lock pulls toward an enemy in the aim circle, and drops it when it falls', () => {
  const game = withSquad([{ x: 0, z: -60 }]);
  step(game, idle, DT);
  expect(game.aimTarget).toBe('b-squad-1');
  game.enemies[0].hp = 0;
  step(game, idle, DT);
  expect(game.aimTarget).toBeNull();

  // an enemy 30 degrees off to the side is outside the circle
  const aside = withSquad([{ x: 30, z: -52 }]);
  step(aside, idle, DT);
  expect(aside.aimTarget).toBeNull();
});

test('shots aimed at an enemy reach it through the soft lock', () => {
  seed(4);
  // the enemy is 5 degrees off the aim: only the pull brings the shots onto it
  const game = withSquad([{ x: 5, z: -60 }]);
  let hits = 0;
  for (let i = 0; i < 90; i++) {
    step(game, { ...idle, fire: true }, DT);
    for (const event of game.events) if (event.kind === 'hit' && event.enemy === 'b-squad-1') hits++;
  }
  expect(hits).toBeGreaterThan(0);
});

test('the same seed and inputs give the same events; another seed gives other shots', () => {
  const run = (n: number): GameEvent[][] => {
    seed(n);
    const game = withSquad([
      { x: 0, z: -GRUNT.stopDist },
      { x: 10, z: -30 },
    ]);
    const frames: GameEvent[][] = [];
    for (let i = 0; i < 600; i++) {
      step(game, { ...idle, fire: i % 3 === 0 }, DT);
      frames.push(game.events);
    }
    return frames;
  };
  const first = run(21);
  expect(first.flat().some(event => event.kind === 'damaged')).toBe(true);
  expect(run(21)).toEqual(first);
  expect(run(22)).not.toEqual(first);
});

// How many of the living enemies have a clear line from their chest to the mech's chest (no prop or standing target between).
function inSight(game: GameModel): number {
  const walls = [...game.propBoxes, ...game.targets.filter(target => target.hp > 0).map(target => target.box)];
  const chest = ENEMIES.grunt.height * 0.7;
  return game.enemies.filter(enemy => {
    const dx = game.mech.x - enemy.x;
    const dy = game.mech.y + MECH_TUNE.chestHeight - chest;
    const dz = game.mech.z - enemy.z;
    return enemy.hp > 0 && !fireRayHit(enemy.x, chest, enemy.z, dx, dy, dz, Math.hypot(dx, dy, dz), walls);
  }).length;
}

const SQUAD_SECONDS = 35; // the time the squad has to come out into the mech's sight (s)

test('b-squad, put out behind line 3, finds the way through its breakthrough and comes into the mech’s sight', () => {
  seed(1);
  const game = newPlayGame({ ...M1B_HAND, mines: [] });
  // in front of line 3 (z 8..26), a long way from the squad (z -25..-33)
  game.mech.x = 0;
  game.mech.z = 40;
  game.mech.yaw = 0;
  game.armor = 1e9; // the squad shoots at the mech once it sees it; this test is about where it comes
  sendToScript(game, { kind: 'enter', area: 'b-line' });
  expect(game.enemies).toHaveLength(6);
  expect(inSight(game)).toBe(0);
  for (let i = 0; i < SQUAD_SECONDS / DT; i++) step(game, idle, DT);
  expect(inSight(game)).toBeGreaterThanOrEqual(game.enemies.length / 2);
  // they came round the line, not through it
  const blockers = mapBlockers(game.map).filter(rect => rect.top !== undefined && rect.top > 1);
  for (const enemy of game.enemies) {
    for (const rect of blockers)
      expect(rectDistance(rect, enemy.x, enemy.z)).toBeGreaterThanOrEqual(ENEMIES[enemy.kind].radius - 1e-6);
  }
});

test('seawall-drop is put out on top of the seawall and jumps down to the ground on its seaward side, shooting only after', () => {
  seed(1);
  const game = newPlayGame({ ...M1B_HAND, mines: [] });
  game.mech.x = 0;
  game.mech.z = -20;
  game.mech.yaw = 0;
  game.armor = 1e9;
  // both pillboxes down: cp1, then the wave 2 sinking and `seawall-drop` four seconds on
  sendToScript(game, { kind: 'destroyed', target: 'pillbox-1' });
  sendToScript(game, { kind: 'destroyed', target: 'pillbox-2' });
  for (let i = 0; i < 600 && game.enemies.length === 0; i++) {
    step(game, idle, DT);
    if (game.script.cutscene !== null) sendToScript(game, { kind: 'skip' });
  }
  expect(game.enemies).toHaveLength(6);
  expect(game.enemies.map(enemy => enemy.kind)).toEqual(M1_WAVE_ENEMY['seawall-drop']);
  for (const enemy of game.enemies) {
    expect(enemy.y).toBeGreaterThan(PROP_SIZE.seawall.h - 1);
    expect(enemy.z).toBeLessThan(-65);
  }
  let hostileInTheAir = 0;
  let landed = -1;
  for (let i = 0; i < 4 * 60 && landed < 0; i++) {
    step(game, idle, DT);
    if (game.enemies.every(enemy => enemy.y > 0) && game.bullets.some(isEnemyBullet)) hostileInTheAir++;
    if (game.enemies.every(enemy => enemy.y === 0)) landed = i;
  }
  expect(landed).toBeGreaterThan(0);
  expect(landed * DT).toBeLessThan(1.5);
  expect(hostileInTheAir).toBe(0);
  // on the ground on the seaward side of the wall (z -65), outside every wall
  for (const enemy of game.enemies) {
    expect(enemy.z).toBeGreaterThan(-65);
    for (const rect of game.rects)
      expect(rectDistance(rect, enemy.x, enemy.z)).toBeGreaterThanOrEqual(ENEMIES[enemy.kind].radius - 1e-6);
  }
});

// The mech at the origin facing -z, on an open field, and one enemy pushed in by the test itself: the wave table plays no
// part, so the roles are told apart by their own values alone.
function loneFoe(kind: EnemyKind, z: number): GameModel {
  const game = newPlayGame(field([]));
  game.mech.x = 0;
  game.mech.z = 0;
  game.mech.yaw = 0;
  game.armor = 1e9; // it keeps shooting through a long test
  game.enemies.push(newEnemy(`${kind}-1`, 'b-squad', kind, 0, z));
  return game;
}

function distanceToMech(game: GameModel): number {
  const enemy = game.enemies[0];
  return Math.hypot(game.mech.x - enemy.x, game.mech.z - enemy.z);
}

const ASSAULT = ENEMIES.assault;
const HEAVY = ENEMIES.heavy;

test('a grunt comes in to rifle range and shoots from there, farther out than an assault and nearer than a heavy', () => {
  seed(1);
  const game = loneFoe('grunt', -60);
  let shotOnceStopped = false;
  for (let i = 0; i < 15 / DT; i++) {
    step(game, idle, DT);
    if (distanceToMech(game) <= GRUNT.stopDist + 1 && game.bullets.some(isEnemyBullet)) shotOnceStopped = true;
  }
  expect(distanceToMech(game)).toBeGreaterThan(GRUNT.stopDist - 1);
  expect(distanceToMech(game)).toBeLessThan(GRUNT.stopDist + 1);
  expect(shotOnceStopped).toBe(true);
  expect(GRUNT.stopDist).toBeGreaterThan(ASSAULT.stopDist);
  expect(GRUNT.stopDist).toBeLessThan(HEAVY.stopDist);
});

test('an assault closes to point-blank, firing on the way in, and two autocannon shots bring it down', () => {
  seed(1);
  const game = loneFoe('assault', -60);
  let firedOnTheWay = false;
  for (let i = 0; i < 15 / DT; i++) {
    step(game, idle, DT);
    if (distanceToMech(game) > 15 && game.bullets.some(isEnemyBullet)) firedOnTheWay = true;
  }
  expect(distanceToMech(game)).toBeGreaterThan(ASSAULT.stopDist - 1);
  expect(distanceToMech(game)).toBeLessThan(ASSAULT.stopDist + 1);
  expect(firedOnTheWay).toBe(true);

  seed(1);
  const shooting = loneFoe('assault', -40);
  const hits: string[] = [];
  let down: GameEvent | null = null;
  for (let i = 0; i < 240 && !down; i++) {
    step(shooting, { ...idle, fire: true }, DT);
    for (const event of shooting.events) {
      if (event.kind === 'hit' && event.enemy !== null) hits.push(event.enemy);
      if (event.kind === 'enemyDown') down = event;
    }
  }
  expect(hits).toEqual(Array(ASSAULT.hp / WEAPONS.autocannon.damage).fill('assault-1'));
  expect(down).toMatchObject({ kind: 'enemyDown', id: 'assault-1' });
});

test('a heavy stops far out, shoots less often but heavier, and takes 12 autocannon or 2 heavy gun shots', () => {
  seed(1);
  const game = loneFoe('heavy', -60);
  for (let i = 0; i < 15 / DT; i++) step(game, idle, DT);
  expect(distanceToMech(game)).toBeGreaterThan(HEAVY.stopDist - 1);
  expect(distanceToMech(game)).toBeLessThan(HEAVY.stopDist + 1);

  // at 10 m, inside every stop distance: the heavy shoots less often than a grunt, and each shot takes its own damage
  const shots = (kind: 'grunt' | 'heavy'): { amount: number; at: number }[] => {
    seed(1);
    const g = loneFoe(kind, -10);
    const taken: { amount: number; at: number }[] = [];
    for (let i = 0; i < 10 / DT; i++) {
      step(g, idle, DT);
      for (const event of g.events) if (event.kind === 'damaged') taken.push({ amount: event.amount, at: g.time });
    }
    return taken;
  };
  const gruntShots = shots('grunt');
  const heavyShots = shots('heavy');
  expect(heavyShots.length).toBeGreaterThan(0);
  expect(heavyShots.length).toBeLessThan(gruntShots.length);
  for (const shot of heavyShots) expect(shot.amount).toBe(HEAVY.damage);
  for (let i = 1; i < heavyShots.length; i++) {
    const gap = heavyShots[i].at - heavyShots[i - 1].at;
    expect(gap).toBeGreaterThan(HEAVY.fireInterval - 0.5);
    expect(gap).toBeLessThan(HEAVY.fireInterval + 0.5);
  }

  seed(1);
  const autocannon = loneFoe('heavy', -40);
  const hits: string[] = [];
  let down = false;
  for (let i = 0; i < 360 && !down; i++) {
    step(autocannon, { ...idle, fire: true }, DT);
    for (const event of autocannon.events) {
      if (event.kind === 'hit' && event.enemy !== null) hits.push(event.enemy);
      if (event.kind === 'enemyDown') down = true;
    }
  }
  expect(hits).toHaveLength(HEAVY.hp / WEAPONS.autocannon.damage);
  expect(down).toBe(true);

  seed(1);
  const heavyGun = loneFoe('heavy', -40);
  const heavyHits: string[] = [];
  let heavyDown = 0;
  for (let i = 0; i < 360 && heavyDown === 0; i++) {
    step(heavyGun, { ...idle, sub: true }, DT);
    for (const event of heavyGun.events) {
      if (event.kind === 'hit' && event.enemy !== null) heavyHits.push(event.enemy);
      if (event.kind === 'enemyDown') heavyDown++;
    }
  }
  expect(heavyHits).toHaveLength(HEAVY.hp / WEAPONS.heavyGun.damage);
  expect(heavyDown).toBe(1);
});
