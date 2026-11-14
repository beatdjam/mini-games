import { expect, test } from 'vitest';
import { ENEMIES, M1_WAVE_ENEMY, type EnemyKind } from '../../src/data/enemies.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import type { MapDef } from '../../src/data/types.ts';
import { WEAPONS } from '../../src/data/weapons.ts';
import { rectDistance } from '../../src/logic/collide.ts';
import { openBreach } from '../../src/logic/blasts.ts';
import {
  isEnemyBullet,
  newGame,
  retryFromCheckpoint,
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
const LONG = 15000; // these tests run many hundreds of frames; the default 5 s is short on a busy CI machine

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
  // the mech stands still through the test, so the aimed mortar would hurt it too; these tests read the enemies' bullets
  game.aimed = null;
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
  expect(game.script.spawned).toEqual(['beach-mortar', 'b-emplacements', 'line1-hold', 'pillbox-hold', 'b-squad']);
  const squad = game.enemies.filter(enemy => enemy.wave === 'b-squad');
  expect(squad.map(enemy => enemy.id)).toEqual([1, 2, 3, 4, 5, 6].map(n => `b-squad-${n}`));
  const kinds = ['heavy', 'assault', 'grunt', 'grunt', 'assault', 'grunt'] as const;
  expect(kinds).toHaveLength(6);
  squad.forEach((enemy, i) => {
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

test(
  'the same seed and inputs give the same events; another seed gives other shots',
  () => {
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
  },
  LONG,
);

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

const SQUAD_SECONDS = 60; // the time the squad has to come out into the mech's sight (s; the second line is farther in)

test(
  'b-squad, put out behind line 2, finds the way through the hole a blast opens and comes into the mech’s sight',
  () => {
    seed(1);
    const game = newPlayGame(openBreach({ ...M1B_HAND, mines: [] }, ['l2-b']));
    // in front of line 2 (z 62..74), a long way from the squad (z -25..-33)
    game.mech.x = 0;
    game.mech.z = 88;
    game.mech.yaw = 0;
    game.armor = 1e9; // the squad shoots at the mech once it sees it; this test is about where it comes
    sendToScript(game, { kind: 'enter', area: 'b-line' });
    // this test is about where b-squad comes; the nests shoot from their own places
    // the nests and the posted defenders (SB-2015) stand on this map too; these tests read the squad alone
    game.enemies = game.enemies.filter(enemy => !['b-emplacements', 'line1-hold', 'pillbox-hold'].includes(enemy.wave));
    expect(game.enemies).toHaveLength(6);
    expect(inSight(game)).toBe(0);
    // line 2 is far enough in that the ends of the squad lie past a grunt's notice; the test is about the way it takes,
    // so every one of them is woken
    for (const enemy of game.enemies) enemy.awake = true;
    for (let i = 0; i < SQUAD_SECONDS / DT; i++) step(game, idle, DT);
    expect(inSight(game)).toBeGreaterThanOrEqual(game.enemies.length / 2);
    // they came round the line, not through it
    const blockers = mapBlockers(game.map).filter(rect => rect.top !== undefined && rect.top > 1);
    for (const enemy of game.enemies) {
      for (const rect of blockers)
        expect(rectDistance(rect, enemy.x, enemy.z)).toBeGreaterThanOrEqual(ENEMIES[enemy.kind].radius - 1e-6);
    }
  },
  LONG,
);

test(
  'a closed line 2 keeps b-squad out of the mech’s sight',
  () => {
    seed(1);
    const game = newPlayGame({ ...M1B_HAND, mines: [] });
    game.mech.x = 0;
    game.mech.z = 88;
    game.mech.yaw = 0;
    game.armor = 1e9;
    sendToScript(game, { kind: 'enter', area: 'b-line' });
    // the nests and the posted defenders (SB-2015) stand on this map too; these tests read the squad alone
    game.enemies = game.enemies.filter(enemy => !['b-emplacements', 'line1-hold', 'pillbox-hold'].includes(enemy.wave));
    // every one of them tries the line, however far past a grunt's notice its end stands
    for (const enemy of game.enemies) enemy.awake = true;
    for (let i = 0; i < SQUAD_SECONDS / DT; i++) step(game, idle, DT);
    expect(inSight(game)).toBe(0);
  },
  LONG,
);

test('the six nests stand at the map’s places from the first frame, asleep and held', () => {
  const game = newGame(M1B_HAND);
  step(game, idle, 0); // the intro and the beach fire: the nests are put out with the beach
  const nests = game.enemies.filter(enemy => enemy.wave === 'b-emplacements');
  expect(nests).toHaveLength(6);
  const burst = ENEMIES.emplacement.burst;
  if (burst === undefined) throw new Error('the nest has a burst');
  nests.forEach((enemy, i) => {
    expect(enemy).toMatchObject({
      kind: 'emplacement',
      hp: ENEMIES.emplacement.hp,
      awake: false,
      dormant: true,
      burstLeft: burst.shots,
    });
    expect(enemy.x).toBe(M1B_HAND.spawns['b-emplacements'][i].x);
    expect(enemy.z).toBe(M1B_HAND.spawns['b-emplacements'][i].z);
  });
  const places = nests.map(enemy => ({ x: enemy.x, z: enemy.z }));
  step(game, idle, DT);
  expect(nests.every(enemy => !enemy.awake && enemy.dormant)).toBe(true);
  expect(nests.map(enemy => ({ x: enemy.x, z: enemy.z }))).toEqual(places);
});

test('stepping off the craft wakes the front nest alone, and it starts to shoot', () => {
  const game = newPlayGame(M1B_HAND);
  const nests = game.enemies.filter(enemy => enemy.wave === 'b-emplacements');
  const front = nests.find(enemy => enemy.id === 'b-emplacements-1');
  if (!front) throw new Error('the front nest is out');
  expect(front).toMatchObject({ awake: true, dormant: false });
  expect(nests.filter(enemy => enemy !== front).every(enemy => !enemy.awake && enemy.dormant)).toBe(true);

  game.armor = 1e9;
  let shots = 0;
  for (let i = 0; i < Math.round((ENEMIES.emplacement.fireInterval + 0.5) / DT); i++) {
    step(game, idle, DT);
    for (const bullet of game.bullets) {
      if (!isEnemyBullet(bullet)) continue;
      shots++;
    }
  }
  // the nests are the only enemies out, so a shot is the front one's; the five that sleep never start a burst
  expect(shots).toBeGreaterThan(0);
  expect(nests.filter(enemy => enemy !== front).every(enemy => !enemy.awake && enemy.dormant)).toBe(true);
});

test('the nest that wakes at the shore is the seaward nest nearest the craft’s lane', () => {
  const places = M1B_HAND.spawns['b-emplacements'] ?? [];
  const lane = (M1B_HAND.bounds.minX + M1B_HAND.bounds.maxX) / 2;
  let front = 0;
  for (let i = 1; i < places.length; i++) {
    const here = places[front];
    const there = places[i];
    const seaward = there.z > here.z;
    const sameZNearer = there.z === here.z && Math.abs(there.x - lane) < Math.abs(here.x - lane);
    if (seaward || sameZNearer) front = i;
  }
  const ashore = M1.cues.find(cue => cue.id === 'ashore');
  if (!ashore) throw new Error('the mission has no ashore cue');
  const wake = ashore.actions.find(action => action.kind === 'wake' && 'enemy' in action);
  if (!wake || wake.kind !== 'wake' || !('enemy' in wake)) throw new Error('the ashore cue wakes no nest');
  expect(wake.enemy).toBe(`b-emplacements-${front + 1}`);
});

test('the other five stay asleep when the mech comes near them before B', () => {
  const game = newPlayGame(M1B_HAND);
  game.armor = 1e9;
  game.mech.x = 0;
  game.mech.z = 155; // outside b-line (z 120..150), within the nests' notice
  const nests = game.enemies.filter(enemy => enemy.wave === 'b-emplacements');
  const sleeping = nests.filter(enemy => enemy.id !== 'b-emplacements-1');
  for (let i = 0; i < Math.round(5 / DT); i++) step(game, idle, DT);
  expect(sleeping.every(enemy => !enemy.awake && enemy.dormant)).toBe(true);
});

test('entering B wakes every living nest, and one broken before it stays down', () => {
  const game = newPlayGame(M1B_HAND);
  const nests = game.enemies.filter(enemy => enemy.wave === 'b-emplacements');
  const broken = nests[3];
  broken.hp = 0; // shot down before the mech reached B
  sendToScript(game, { kind: 'enter', area: 'b-line' });
  expect(broken).toMatchObject({ hp: 0, awake: false, dormant: true });
  expect(nests.filter(enemy => enemy !== broken).every(enemy => enemy.awake && !enemy.dormant)).toBe(true);
});

test('a dormant nest can be shot down before B', () => {
  const map: MapDef = {
    ...M1B_HAND,
    props: [],
    targets: [],
    spawns: {
      'b-emplacements': [
        { x: 0, z: 166 },
        { x: 0, z: 150 },
        { x: -80, z: 120 },
        { x: 80, z: 120 },
        { x: -80, z: 100 },
        { x: 80, z: 100 },
      ],
    },
  };
  const game = newPlayGame(map);
  game.armor = 1e9;
  game.mech.x = 0;
  game.mech.z = 160; // still outside b-line
  game.mech.y = 0;
  game.mech.yaw = 0;
  const back = game.enemies.find(enemy => enemy.id === 'b-emplacements-2');
  if (!back) throw new Error('the second nest is out');
  expect(back).toMatchObject({ awake: false, dormant: true });
  for (let i = 0; i < 600 && back.hp > 0; i++) step(game, { ...idle, fire: true }, DT);
  expect(back.hp).toBe(0);
  sendToScript(game, { kind: 'enter', area: 'b-line' });
  expect(back).toMatchObject({ hp: 0, awake: false, dormant: true });
});

test('a checkpoint keeps the nests asleep, and a retry brings them back asleep', () => {
  const game = newGame(M1B_HAND);
  step(game, idle, 0); // the beach puts the six nests out asleep
  sendToScript(game, { kind: 'skip' }); // end the landing, but stay on the deck: `ashore` does not fire yet
  game.armor = 1e9;
  const nestsOf = (model: GameModel) => model.enemies.filter(enemy => enemy.wave === 'b-emplacements');
  expect(nestsOf(game)).toHaveLength(6);
  expect(nestsOf(game).every(enemy => !enemy.awake && enemy.dormant)).toBe(true);
  // both pillboxes down take cp1 with every nest still asleep
  for (const id of ['pillbox-1', 'pillbox-2']) {
    const target = game.targets.find(entry => entry.id === id);
    if (!target) throw new Error(`the map has no ${id}`);
    target.hp = 0;
    sendToScript(game, { kind: 'destroyed', target: id });
  }
  expect(game.checkpoint?.id).toBe('cp1');
  expect(
    game.checkpoint?.enemies
      .filter(enemy => enemy.wave === 'b-emplacements')
      .every(enemy => !enemy.awake && enemy.dormant),
  ).toBe(true);
  // entering B wakes every living nest in this sortie
  sendToScript(game, { kind: 'enter', area: 'b-line' });
  expect(nestsOf(game).every(enemy => enemy.awake && !enemy.dormant)).toBe(true);
  // the retry comes back to the checkpoint's asleep nests
  const again = retryFromCheckpoint(game);
  expect(nestsOf(again)).toHaveLength(6);
  expect(nestsOf(again).every(enemy => !enemy.awake && enemy.dormant)).toBe(true);
  // and they stay asleep a frame on: the mech is back on the deck, outside B
  step(again, idle, DT);
  expect(nestsOf(again).every(enemy => !enemy.awake && enemy.dormant)).toBe(true);
  // the checkpoint itself still holds them asleep
  expect(
    game.checkpoint?.enemies
      .filter(enemy => enemy.wave === 'b-emplacements')
      .every(enemy => !enemy.awake && enemy.dormant),
  ).toBe(true);
});

test('the nav is not made while only the nests are alive, and is made for a walker', () => {
  const map = { ...M1B_HAND, props: [], targets: [], spawns: {} };
  const onlyNests = newPlayGame(map);
  onlyNests.mech.x = 0;
  onlyNests.mech.z = 0;
  onlyNests.enemies.push(newEnemy('e-1', 'b-emplacements', 'emplacement', 0, -40));
  step(onlyNests, idle, DT);
  expect(onlyNests.nav.grid).toBeNull();
  expect(onlyNests.nav.field).toBeNull();

  const withWalker = newPlayGame(map);
  withWalker.mech.x = 0;
  withWalker.mech.z = 0;
  withWalker.enemies.push(newEnemy('w-1', 'b-squad', 'grunt', 0, -40));
  step(withWalker, idle, DT);
  expect(withWalker.nav.grid).not.toBeNull();
});

test('six nests in the open sweep their bursts together, within the screen’s 96 lines', () => {
  const map = { ...M1B_HAND, props: [], targets: [], spawns: {} };
  const game = newPlayGame(map);
  game.mech.x = 0;
  game.mech.z = 0;
  game.armor = 1e9;
  for (let i = 0; i < 6; i++) {
    game.enemies.push(newEnemy(`e-${i + 1}`, 'b-emplacements', 'emplacement', -25 + i * 10, -60));
  }
  let most = 0;
  for (let i = 0; i < Math.round(4 / DT); i++) {
    step(game, idle, DT);
    most = Math.max(most, game.bullets.length);
  }
  console.log(`six nests: at most ${most} bullets in the air`);
  expect(most).toBeGreaterThan(0);
  expect(most).toBeLessThanOrEqual(96); // MAX_BULLET_LINES in src/view/play.ts
});

test('once the six nests are down the script is told b-emplacements is cleared', () => {
  const game = newPlayGame(M1B_HAND);
  walkIntoBLine(game);
  for (const enemy of game.enemies) if (enemy.wave === 'b-emplacements') enemy.hp = 0;
  step(game, idle, DT);
  expect(game.script.cleared).toContain('b-emplacements');
});

// The mech at the origin facing -z, on an open field, and one enemy pushed in by the test itself: the wave table plays no
// part, so the roles are told apart by their own values alone.
function loneFoe(kind: EnemyKind, z: number): GameModel {
  const game = newPlayGame(field([]));
  game.mech.x = 0;
  game.mech.z = 0;
  game.mech.yaw = 0;
  game.armor = 1e9; // it keeps shooting through a long test
  // the mech stands still through the test, so the aimed mortar would hurt it too; these tests read the enemies' bullets
  game.aimed = null;
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
