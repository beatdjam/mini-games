// The sectors of M1's front (SB-2210, SB-2220): a sector is cleared when the mech is in it and no enemy is left,
// secured when enough infantry has reached its hold line, then counterattacked once before it is stable. The world here
// is the small one the functions ask for, built by hand.
import { expect, test } from 'vitest';
import { LANG, createRng } from '@engine/core/index.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import { M1_SECTORS, SECTOR_TUNE } from '../../src/data/sectors.ts';
import { FX_TUNE, INFANTRY_TUNE } from '../../src/data/tune.ts';
import type { Prop } from '../../src/data/types.ts';
import { newCrowd, stepCrowd, type Soldier } from '../../src/logic/crowd.ts';
import type { GroundRect } from '../../src/logic/collide.ts';
import {
  arrivedSoldiers,
  newSectors,
  releasePosts,
  sectorHold,
  sectorPosts,
  stepSectors,
  type SectorEvent,
  type SectorPhase,
  type SectorWorld,
  type SectorsState,
} from '../../src/logic/sectors.ts';
import '../../src/i18n/ja.ts';
import '../../src/i18n/en.ts';

const BEACH = M1_SECTORS[0];
const PILLBOXES = M1_SECTORS[3];
const BLASTS = M1B_HAND.blasts ?? [];
const LINE1_Z = BLASTS.find(point => point.id === 'l1-a')?.line ?? 0;

function soldierAt(z: number, alive = true): Soldier {
  return {
    x: 0,
    z,
    yaw: 0,
    alive,
    deadT: 0,
    phase: 0,
    squad: 0,
    fallAt: null,
    waited: false,
    post: null,
    hp: INFANTRY_TUNE.hp,
    targetedT: 0,
  };
}

function world(options: {
  mechZ?: number;
  enemies?: readonly { id?: string; z: number; hp: number }[];
  targets?: readonly { kind: string; hp: number }[];
  soldiers?: readonly Soldier[];
  rects?: SectorWorld['rects'];
  flags?: readonly string[];
  wardenDown?: boolean;
}) {
  const crowd = newCrowd();
  crowd.soldiers = [...(options.soldiers ?? [])];
  return {
    mech: { z: options.mechZ ?? 0 },
    enemies: (options.enemies ?? []).map((enemy, i) => ({ id: enemy.id ?? `enemy-${i}`, z: enemy.z, hp: enemy.hp })),
    targets: options.targets ?? [],
    rects: options.rects ?? [],
    battle: { crowd },
    bounds: M1B_HAND.bounds,
    props: M1B_HAND.props,
    flags: options.flags ?? [],
    wardenDown: options.wardenDown ?? false,
  };
}

function stateWith(phases: SectorPhase[]): SectorsState {
  const state = newSectors();
  // the sectors past the ones the test names stay idle, so they are not walked to and do not set the hold line
  state.phase = [...phases, ...M1_SECTORS.slice(phases.length).map((): SectorPhase => 'idle')];
  return state;
}

// A state with every sector before `index` stable and that one advancing, for a test of a later sector.
function advancedTo(index: number): SectorsState {
  const state = newSectors();
  for (let i = 0; i < index; i++) state.phase[i] = 'stable';
  state.phase[index] = 'advancing';
  return state;
}

// The soldiers at a sector's hold line, as many as asked for.
function atHoldOf(index: number, count: number): Soldier[] {
  const z = M1_SECTORS[index].holdZ + SECTOR_TUNE.arriveBand - 1;
  return Array.from({ length: count }, () => soldierAt(z));
}

// A state with the first three sectors stable, for the pillbox line's own tests.
function atPillboxes(): SectorsState {
  return stateWith(['stable', 'stable', 'stable', 'idle']);
}

// The soldiers at the beach's hold line, as many as asked for.
function atTheLine(count: number): Soldier[] {
  const z = BEACH.holdZ + SECTOR_TUNE.arriveBand - 1;
  return Array.from({ length: count }, () => soldierAt(z));
}

// Secures the beach from a state that is advancing and gives back the state and the event kinds.
function secureBeach(count = 10): { state: SectorsState; kinds: string[] } {
  const state = stateWith(['advancing', 'idle', 'idle', 'idle']);
  const events = stepSectors(state, world({ soldiers: atTheLine(count) }), 1 / 60);
  return { state, kinds: events.map(event => event.kind) };
}

// Puts out every enemy of the beach's counterattack, with ids as game.ts gives them, and gives back its world.
function runBeachCounter(state: SectorsState, dt = SECTOR_TUNE.counterEvery): ReturnType<typeof world> {
  const seen = world({});
  for (let frame = 0; frame < BEACH.counter * 4; frame++) {
    for (const event of stepSectors(state, seen, dt)) {
      if (event.kind !== 'sectorSpawn') continue;
      const id = `counter-beach-${state.counterIds[0].length + 1}`;
      state.counterIds[0].push(id);
      seen.enemies.push({ id, z: event.z, hp: 1 });
    }
    if (state.counterIds[0].length >= BEACH.counter) break;
  }
  return seen;
}

test('the mech has to go in before a sector is cleared', () => {
  const state = newSectors();
  const seaward = world({ mechZ: BEACH.seaZ - SECTOR_TUNE.enterDepth + 1 });
  expect(stepSectors(state, seaward, 1 / 60)).toEqual([]);
  expect(state.phase[0]).toBe('idle');
});

test('a living enemy in the sector keeps it from being cleared', () => {
  const state = newSectors();
  const mechZ = BEACH.seaZ - SECTOR_TUNE.enterDepth - 1;
  expect(stepSectors(state, world({ mechZ, enemies: [{ z: 140, hp: 1 }] }), 1 / 60)).toEqual([]);
  expect(state.phase[0]).toBe('idle');
  expect(stepSectors(state, world({ mechZ, enemies: [{ z: 140, hp: 0 }] }), 1 / 60)).toEqual([
    { kind: 'sectorCleared', sector: 'beach' },
  ]);
  expect(state.phase[0]).toBe('advancing');
});

test('an enemy just seaward of the sector’s edge still counts, one past the margin does not', () => {
  const mechZ = BEACH.seaZ - SECTOR_TUNE.enterDepth - 1;
  const inside = newSectors();
  expect(
    stepSectors(inside, world({ mechZ, enemies: [{ z: BEACH.seaZ + SECTOR_TUNE.seaMargin, hp: 1 }] }), 1 / 60),
  ).toEqual([]);
  const outside = newSectors();
  expect(
    stepSectors(outside, world({ mechZ, enemies: [{ z: BEACH.seaZ + SECTOR_TUNE.seaMargin + 1, hp: 1 }] }), 1 / 60),
  ).toEqual([{ kind: 'sectorCleared', sector: 'beach' }]);
});

test('an enemy inland of the sector is not counted', () => {
  const state = newSectors();
  const mechZ = BEACH.seaZ - SECTOR_TUNE.enterDepth - 1;
  expect(stepSectors(state, world({ mechZ, enemies: [{ z: BEACH.landZ - 1, hp: 1 }] }), 1 / 60)).toEqual([
    { kind: 'sectorCleared', sector: 'beach' },
  ]);
});

test('the pillbox line counts the pillboxes that still stand', () => {
  const mechZ = PILLBOXES.seaZ - SECTOR_TUNE.enterDepth - 1;
  const standing = atPillboxes();
  expect(stepSectors(standing, world({ mechZ, targets: [{ kind: 'pillbox', hp: 1 }] }), 1 / 60)).toEqual([]);
  expect(standing.phase[3]).toBe('idle');
  const down = atPillboxes();
  expect(stepSectors(down, world({ mechZ, targets: [{ kind: 'pillbox', hp: 0 }] }), 1 / 60)).toEqual([
    { kind: 'sectorCleared', sector: 'pillboxes' },
  ]);
});

test('a sector behind the front is not judged until the one before it is stable', () => {
  const state = stateWith(['advancing', 'idle', 'idle', 'idle']);
  const mechZ = M1_SECTORS[1].seaZ - SECTOR_TUNE.enterDepth - 1;
  expect(stepSectors(state, world({ mechZ, soldiers: [] }), 1 / 60)).toEqual([]);
  expect(state.phase.slice(0, 4)).toEqual(['advancing', 'idle', 'idle', 'idle']);
});

test('the next sector is not judged while the one before it is still counterattacking', () => {
  const state = stateWith(['counter', 'idle', 'idle', 'idle']);
  state.counterLeft[0] = 1;
  state.counterT[0] = 10;
  const mechZ = M1_SECTORS[1].seaZ - SECTOR_TUNE.enterDepth - 1;
  expect(stepSectors(state, world({ mechZ }), 1 / 60)).toEqual([]);
  expect(state.phase[1]).toBe('idle');
});

test('a stable sector lets the next one be judged', () => {
  const state = stateWith(['stable', 'idle', 'idle', 'idle']);
  const mechZ = M1_SECTORS[1].seaZ - SECTOR_TUNE.enterDepth - 1;
  expect(stepSectors(state, world({ mechZ }), 1 / 60)).toEqual([{ kind: 'sectorCleared', sector: 'line1' }]);
});

test('too few arrived soldiers do not secure the sector', () => {
  const state = stateWith(['advancing', 'idle', 'idle', 'idle']);
  const holdZ = BEACH.holdZ;
  const near = holdZ + SECTOR_TUNE.arriveBand;
  const soldiers = [
    ...Array.from({ length: 5 }, () => soldierAt(near - 1)),
    ...Array.from({ length: 5 }, () => soldierAt(near + 1)),
  ];
  expect(stepSectors(state, world({ soldiers }), 1 / 60)).toEqual([]);
  expect(state.phase[0]).toBe('advancing');
  // min(arriveMax 11, ceil(10 * 0.6) = 6): the sixth soldier at the line secures it
  soldiers[5].z = near;
  expect(stepSectors(state, world({ soldiers }), 1 / 60).map(event => event.kind)).toEqual([
    'sectorSecured',
    'sectorCounter',
  ]);
  expect(state.phase[0]).toBe('counter');
});

test('securing a sector starts its counterattack and records the soldiers that arrived', () => {
  const { state, kinds } = secureBeach();
  expect(kinds).toEqual(['sectorSecured', 'sectorCounter']);
  expect(state.phase[0]).toBe('counter');
  expect(state.counterLeft[0]).toBe(BEACH.counter);
  expect(state.arrived[0]).toBe(10);
});

test('the counterattack puts out one enemy every counterEvery and as many as the sector has', () => {
  const { state } = secureBeach();
  const spawns: Extract<SectorEvent, { kind: 'sectorSpawn' }>[] = [];
  const seen = world({});
  let calls = 0;
  for (let frame = 0; frame < BEACH.counter * 2; frame++) {
    calls += 1;
    for (const event of stepSectors(state, seen, SECTOR_TUNE.counterEvery)) {
      if (event.kind !== 'sectorSpawn') continue;
      spawns.push(event);
      // as game.ts does: remember the id of each enemy put out
      const id = `counter-beach-${state.counterIds[0].length + 1}`;
      state.counterIds[0].push(id);
      seen.enemies.push({ id, z: event.z, hp: 1 });
    }
    if (spawns.length === BEACH.counter) break;
  }
  expect(spawns).toHaveLength(BEACH.counter);
  expect(calls).toBe(BEACH.counter);
  expect(state.counterLeft[0]).toBe(0);
});

test('a counterattack still standing keeps the sector from being stable; all down makes it stable', () => {
  const { state } = secureBeach();
  const seen = runBeachCounter(state);
  expect(stepSectors(state, seen, 1 / 60)).toEqual([]);
  expect(state.phase[0]).toBe('counter');
  for (const enemy of seen.enemies) enemy.hp = 0;
  expect(stepSectors(state, seen, 1 / 60)).toEqual([{ kind: 'sectorStable', sector: 'beach', weak: false }]);
  expect(state.phase[0]).toBe('stable');
});

test('fewer arrived soldiers than weakArrived make a weak hold', () => {
  const { state } = secureBeach(SECTOR_TUNE.weakArrived - 2);
  const seen = runBeachCounter(state);
  for (const enemy of seen.enemies) enemy.hp = 0;
  expect(stepSectors(state, seen, 1 / 60)).toEqual([{ kind: 'sectorStable', sector: 'beach', weak: true }]);
  expect(state.weak[0]).toBe(true);
});

test('a counterattack point on a ground rect moves clear of it', () => {
  const state = stateWith(['counter', 'idle', 'idle', 'idle']);
  state.counterLeft[0] = BEACH.counter;
  state.counterT[0] = SECTOR_TUNE.counterEvery;
  const z = BEACH.landZ - SECTOR_TUNE.counterBack;
  const first = -SECTOR_TUNE.counterSpread;
  const rect = { x: first, z, halfW: 0.5, halfD: 0.5, yaw: 0 };
  const events = stepSectors(state, world({ rects: [rect] }), SECTOR_TUNE.counterEvery);
  expect(events).toEqual([{ kind: 'sectorSpawn', sector: 'beach', x: first + 2, z }]);
});

test('the dead are not counted as arrived, and a wiped-out crowd secures nothing', () => {
  const holdZ = BEACH.holdZ;
  const near = holdZ + SECTOR_TUNE.arriveBand;
  const crowd = newCrowd();
  crowd.soldiers = [soldierAt(near, true), soldierAt(near, false), soldierAt(near, false)];
  expect(arrivedSoldiers(crowd, holdZ)).toHaveLength(1);
  const wiped = stateWith(['advancing', 'idle', 'idle', 'idle']);
  expect(stepSectors(wiped, world({ soldiers: [soldierAt(near, false)] }), 1 / 60)).toEqual([]);
  expect(wiped.phase[0]).toBe('advancing');
});

test('the hold starts at the water’s edge and follows the last cleared sector', () => {
  const open = BLASTS.filter(point => point.line !== null).map(point => point.id);
  const fresh = newSectors();
  expect(sectorHold(fresh, open, BLASTS)).toEqual({ holdZ: SECTOR_TUNE.startHoldZ, held: true });
  fresh.phase[0] = 'advancing';
  expect(sectorHold(fresh, open, BLASTS)).toEqual({ holdZ: BEACH.holdZ, held: true });
  fresh.phase[0] = 'secured';
  expect(sectorHold(fresh, open, BLASTS).holdZ).toBe(BEACH.holdZ);
  fresh.phase[1] = 'advancing';
  expect(sectorHold(fresh, open, BLASTS).holdZ).toBe(M1_SECTORS[1].holdZ);
  fresh.phase[2] = 'advancing';
  fresh.phase[3] = 'advancing';
  expect(sectorHold(fresh, open, BLASTS)).toEqual({ holdZ: PILLBOXES.holdZ, held: true });
  // the line goes on past the pillbox line: the last sector's hold is the end of the front (SB-2280)
  const last = M1_SECTORS.length - 1;
  fresh.phase[last] = 'advancing';
  expect(sectorHold(fresh, open, BLASTS)).toEqual({ holdZ: M1_SECTORS[last].holdZ, held: true });
  fresh.phase[last] = 'secured';
  expect(sectorHold(fresh, open, BLASTS)).toEqual({ holdZ: M1_SECTORS[last].holdZ, held: false });
});

test('a still-closed defence line keeps the infantry before it and the sector unsecured until a blast opens it', () => {
  const state = stateWith(['advancing', 'idle', 'idle', 'idle']);
  expect(LINE1_Z).toBe(137);
  const waitZ = LINE1_Z + SECTOR_TUNE.lineMargin;
  expect(sectorHold(state, [], BLASTS).holdZ).toBe(waitZ);
  expect(sectorHold(state, ['l1-a'], BLASTS).holdZ).toBe(BEACH.holdZ);
  // At the closed line they are not at the beach's hold line, so the beach is not secured.
  const waiting = Array.from({ length: SECTOR_TUNE.arriveMax }, () => soldierAt(waitZ));
  expect(stepSectors(state, world({ soldiers: waiting }), 1 / 60)).toEqual([]);
  expect(state.phase[0]).toBe('advancing');
  // Once they have walked through the hole to the beach's hold line, they secure it.
  const arrived = Array.from({ length: SECTOR_TUNE.arriveMax }, () => soldierAt(BEACH.holdZ));
  expect(stepSectors(state, world({ soldiers: arrived }), 1 / 60).map(event => event.kind)).toEqual([
    'sectorSecured',
    'sectorCounter',
  ]);
});

test('every sector line has text in ja and en', () => {
  const keys = [
    'm1.sector-cleared',
    'm1.sector-line-closed',
    'm1.sector-secured',
    'm1.sector-counter',
    'm1.sector-stable',
    'm1.sector-weak',
  ];
  for (const code of ['ja', 'en']) {
    for (const key of keys) expect(LANG[code].ui[key], `${code} is missing "${key}"`).toBeTruthy();
  }
});

test('a counterattack point covered after ten moves still comes out, at the last point tried', () => {
  const { state } = secureBeach();
  // one rect wide enough to cover every point the ten moves try
  const wall = { x: 0, z: BEACH.landZ - SECTOR_TUNE.counterBack, halfW: 500, halfD: 5, yaw: 0 };
  const seen = world({ rects: [wall] });
  state.counterT[0] = 0;
  const events = stepSectors(state, seen, 1 / 60);
  const spawn = events.find(event => event.kind === 'sectorSpawn');
  expect(spawn).toEqual({
    kind: 'sectorSpawn',
    sector: 'beach',
    x: -SECTOR_TUNE.counterSpread + 20,
    z: BEACH.landZ - SECTOR_TUNE.counterBack,
  });
  expect(state.counterLeft[0]).toBe(BEACH.counter - 1);
});

// SB-2262: a secured sector's soldiers take posts behind its cover and stop there, and the next sector's clearing
// leaves some of them on the ground they took.
test('the posts of a sector sit on the seaward side of its cover (out of sight of the land enemy), then spread across its width', () => {
  const sector = M1_SECTORS[1];
  const covers: GroundRect[] = [
    { x: -20, z: 90, halfW: 3, halfD: 2, yaw: 0 },
    { x: 0, z: 90, halfW: 3, halfD: 2, yaw: 0 },
    { x: 20, z: 90, halfW: 3, halfD: 2, yaw: 0 },
  ];
  const posts = sectorPosts(sector, M1B_HAND.bounds, covers, [], covers.length);
  expect(posts.map(post => post.x)).toEqual([-20, 0, 20]);
  for (const [i, cover] of covers.entries()) expect(posts[i].z).toBeGreaterThan(cover.z);
  // one more soldier than cover: it stands across the sector's width on its hold line
  const extra = sectorPosts(sector, M1B_HAND.bounds, covers, [], covers.length + 1);
  expect(extra).toHaveLength(covers.length + 1);
  expect(new Set(extra.map(post => `${post.x},${post.z}`)).size).toBe(extra.length);
  expect(extra.filter(post => post.z === sector.holdZ)).toHaveLength(1);
  for (const post of extra) {
    expect(post.z).toBeGreaterThanOrEqual(sector.landZ);
    expect(post.z).toBeLessThanOrEqual(sector.seaZ);
  }
  // a crater is no blocker but still makes cover to post behind
  const crater: Prop = { kind: 'crater', x: 10, z: 100, yaw: 0, scale: 1 };
  const behindCrater = sectorPosts(sector, M1B_HAND.bounds, [], [crater], 1);
  expect(behindCrater).toHaveLength(1);
  expect(behindCrater[0].z).toBeGreaterThan(crater.z);
});

test('securing a sector gives its arriving soldiers distinct posts, and they walk to them and stop', () => {
  const state = stateWith(['advancing', 'idle', 'idle', 'idle']);
  const soldiers = atTheLine(10);
  const seen = world({ soldiers });
  expect(stepSectors(state, seen, 1 / 60).map(event => event.kind)).toEqual(['sectorSecured', 'sectorCounter']);
  expect(soldiers.every(soldier => soldier.post !== null)).toBe(true);
  const posts = soldiers.map(soldier => soldier.post);
  expect(new Set(posts.map(post => `${post?.x},${post?.z}`)).size).toBe(10);
  for (const post of posts) {
    if (post === null) throw new Error('a secured soldier has no post');
    expect(post.z).toBeGreaterThanOrEqual(BEACH.landZ);
    expect(post.z).toBeLessThanOrEqual(BEACH.seaZ);
  }

  // ten seconds of walking at a test pace: each one is exactly on its post, facing the land, and none has gone through
  const tune = { ...FX_TUNE, allyDeathRate: 0, allyWaves: 0, allySpeed: 30 };
  const rng = createRng(5);
  for (let i = 0; i < 60 * 10; i++) stepCrowd(seen.battle.crowd, rng, 1 / 60, tune);
  const alive = seen.battle.crowd.soldiers.filter(soldier => soldier.alive);
  expect(alive).toHaveLength(10);
  for (const soldier of alive) {
    if (soldier.post === null) throw new Error('a posted soldier lost its post');
    expect(soldier.x).toBeCloseTo(soldier.post.x, 6);
    expect(soldier.z).toBeCloseTo(soldier.post.z, 6);
    expect(soldier.yaw).toBe(0);
  }
  expect(seen.battle.crowd.through).toBe(0);
});

test('clearing the next sector leaves about half of the posted soldiers on their ground', () => {
  const soldiers = Array.from({ length: 10 }, (_, i) => {
    const soldier = soldierAt(BEACH.holdZ);
    soldier.x = i;
    soldier.waited = true;
    soldier.post = { x: i, z: BEACH.holdZ };
    return soldier;
  });
  const mechZ = M1_SECTORS[1].seaZ - SECTOR_TUNE.enterDepth - 1;
  const events = stepSectors(stateWith(['stable', 'idle', 'idle', 'idle']), world({ mechZ, soldiers }), 1 / 60);
  expect(events).toEqual([{ kind: 'sectorCleared', sector: 'line1' }]);
  const kept = soldiers.filter(soldier => soldier.post !== null).length;
  expect(kept).toBe(Math.round(10 * SECTOR_TUNE.postStayShare));
  expect(kept).toBeGreaterThan(0);
  expect(kept).toBeLessThan(10);
});

test('a posted soldier counts as arrived however far behind the line it stands', () => {
  const crowd = newCrowd();
  const posted = soldierAt(BEACH.holdZ + SECTOR_TUNE.arriveBand + 30);
  posted.post = { x: 0, z: posted.z };
  const walking = soldierAt(BEACH.holdZ + SECTOR_TUNE.arriveBand + 30);
  crowd.soldiers = [posted, walking];
  expect(arrivedSoldiers(crowd, BEACH.holdZ)).toEqual([posted]);
});

test('a post is never in a wall, in the sea or outside the sector', () => {
  const sector = M1_SECTORS[1];
  // a cover whose seaward post would fall past the sector's sea edge, and one whose post lands inside another block
  const covers: GroundRect[] = [
    { x: -30, z: sector.seaZ - 1, halfW: 3, halfD: 2, yaw: 0 },
    { x: 0, z: 100, halfW: 3, halfD: 2, yaw: 0 },
    { x: 0, z: 104.5, halfW: 3, halfD: 2, yaw: 0 },
  ];
  const posts = sectorPosts(sector, M1B_HAND.bounds, covers, [], 6);
  expect(posts).toHaveLength(6);
  for (const post of posts) {
    expect(post.z).toBeGreaterThanOrEqual(Math.max(sector.landZ, M1B_HAND.bounds.minZ));
    expect(post.z).toBeLessThanOrEqual(Math.min(sector.seaZ, M1B_HAND.bounds.maxZ));
    expect(post.x).toBeGreaterThanOrEqual(M1B_HAND.bounds.minX);
    expect(post.x).toBeLessThanOrEqual(M1B_HAND.bounds.maxX);
    for (const cover of covers) {
      expect(Math.abs(post.x - cover.x) < cover.halfW && Math.abs(post.z - cover.z) < cover.halfD).toBe(false);
    }
  }
  // the hold line crossing a block: the spread posts slide off it
  const wall: GroundRect[] = [{ x: 0, z: sector.holdZ, halfW: 10, halfD: 3, yaw: 0 }];
  for (const post of sectorPosts(sector, M1B_HAND.bounds, wall, [], 3)) {
    expect(Math.abs(post.x) >= 10 || Math.abs(post.z - sector.holdZ) >= 3).toBe(true);
  }
});

test('soldiers left posted in an earlier sector are not counted against the next sector, and one always walks on', () => {
  // 4 posted far behind and 4 walking at the line: 4 walkers are enough (ceil(4 * 0.6) = 3), the posted do not add
  const posted = Array.from({ length: 4 }, () => {
    const soldier = soldierAt(BEACH.holdZ + 20);
    soldier.post = { x: 0, z: soldier.z };
    return soldier;
  });
  const lonely = [soldierAt(BEACH.holdZ + 40), ...posted];
  const none = stepSectors(stateWith(['advancing', 'idle', 'idle', 'idle']), world({ soldiers: lonely }), 1 / 60);
  expect(none).toEqual([]);
  // every living soldier posted: nobody walks, the sector is taken as it is rather than never secured
  const allPosted = Array.from({ length: 3 }, () => {
    const soldier = soldierAt(BEACH.holdZ + 20);
    soldier.post = { x: 0, z: soldier.z };
    return soldier;
  });
  const taken = stepSectors(stateWith(['advancing', 'idle', 'idle', 'idle']), world({ soldiers: allPosted }), 1 / 60);
  expect(taken.map(event => event.kind)).toEqual(['sectorSecured', 'sectorCounter']);
  // releasing leaves at least one walker even with a share of 1
  const crowd = newCrowd();
  crowd.soldiers = allPosted;
  releasePosts(crowd, 1);
  expect(allPosted.filter(soldier => soldier.post === null)).toHaveLength(1);
});

// SB-2280: the front runs on past the pillbox line to the magazine, the sectors touching and each hold seaward of its
// land-side edge.
test('the sectors run from the beach to the magazine, with no gap between one and the next', () => {
  expect(M1_SECTORS).toHaveLength(11);
  expect(M1_SECTORS.map(sector => sector.id)).toEqual([
    'beach',
    'line1',
    'line2',
    'pillboxes',
    'cband',
    'gate',
    'yard',
    'plug',
    'field1',
    'field2',
    'magazine',
  ]);
  for (let i = 0; i < M1_SECTORS.length; i++) {
    const sector = M1_SECTORS[i];
    // +z is the sea: a hold line stands seaward of the sector's land-side edge
    expect(sector.holdZ, `${sector.id} hold`).toBeGreaterThan(sector.landZ);
    const next = M1_SECTORS[i + 1];
    if (next !== undefined) expect(sector.landZ, `${sector.id} to ${next.id}`).toBe(next.seaZ);
  }
});

test('the later sectors are cleared, secured and counterattacked as the first ones are', () => {
  for (const id of ['cband', 'field1'] as const) {
    const index = M1_SECTORS.findIndex(entry => entry.id === id);
    const sector = M1_SECTORS[index];
    const seen = world({ mechZ: sector.seaZ - SECTOR_TUNE.enterDepth - 1 });
    const state = advancedTo(index);
    state.phase[index] = 'idle';
    expect(stepSectors(state, seen, 1 / 60)).toEqual([{ kind: 'sectorCleared', sector: id }]);
    expect(state.phase[index]).toBe('advancing');
    seen.battle.crowd.soldiers = atHoldOf(index, 10);
    expect(stepSectors(state, seen, 1 / 60).map(event => event.kind)).toEqual(['sectorSecured', 'sectorCounter']);
    expect(state.phase[index]).toBe('counter');
    expect(state.counterLeft[index]).toBe(sector.counter);
    // as game.ts does: remember the id of each enemy put out and put it on the field alive
    for (let frame = 0; frame < sector.counter * 4 && state.counterLeft[index] > 0; frame++) {
      for (const event of stepSectors(state, seen, SECTOR_TUNE.counterEvery)) {
        if (event.kind !== 'sectorSpawn') continue;
        const spawnId = `counter-${id}-${state.counterIds[index].length + 1}`;
        state.counterIds[index].push(spawnId);
        seen.enemies.push({ id: spawnId, z: event.z, hp: 1 });
      }
    }
    expect(state.counterLeft[index]).toBe(0);
    expect(state.counterIds[index]).toHaveLength(sector.counter);
    for (const enemy of seen.enemies) enemy.hp = 0;
    expect(stepSectors(state, seen, 1 / 60)).toEqual([{ kind: 'sectorStable', sector: id, weak: false }]);
    expect(state.phase[index]).toBe('stable');
  }
});

test('a sector with no counterattack of its own goes straight to stable', () => {
  for (const id of ['yard', 'plug', 'magazine'] as const) {
    const index = M1_SECTORS.findIndex(entry => entry.id === id);
    const sector = M1_SECTORS[index];
    expect(sector.counter).toBe(0);
    const state = advancedTo(index);
    const seen = world({ soldiers: atHoldOf(index, 10) });
    expect(stepSectors(state, seen, 1 / 60).map(event => event.kind)).toEqual(['sectorSecured', 'sectorCounter']);
    expect(state.phase[index]).toBe('counter');
    expect(stepSectors(state, seen, 1 / 60)).toEqual([{ kind: 'sectorStable', sector: id, weak: false }]);
    expect(state.phase[index]).toBe('stable');
  }
});

// SB-2283: a later sector's goal keeps it from being cleared until the thing at its heart is down.
const GATE = M1_SECTORS.find(sector => sector.id === 'gate')!;
const YARD = M1_SECTORS.find(sector => sector.id === 'yard')!;
const PLUG = M1_SECTORS.find(sector => sector.id === 'plug')!;
const MAGAZINE = M1_SECTORS.find(sector => sector.id === 'magazine')!;

// A world just inside a sector, with every enemy out of it.
function atTheFrontOf(
  sector: (typeof M1_SECTORS)[number],
  options: Parameters<typeof world>[0] = {},
): ReturnType<typeof world> {
  return world({ mechZ: sector.seaZ - SECTOR_TUNE.enterDepth - 1, ...options });
}

test('the gate counts the fortress gun that still stands', () => {
  const index = M1_SECTORS.indexOf(GATE);
  const standing = advancedTo(index);
  standing.phase[index] = 'idle';
  expect(stepSectors(standing, atTheFrontOf(GATE, { targets: [{ kind: 'fortressGun', hp: 1 }] }), 1 / 60)).toEqual([]);
  expect(standing.phase[index]).toBe('idle');
  const down = advancedTo(index);
  down.phase[index] = 'idle';
  expect(stepSectors(down, atTheFrontOf(GATE, { targets: [{ kind: 'fortressGun', hp: 0 }] }), 1 / 60)).toEqual([
    { kind: 'sectorCleared', sector: 'gate' },
  ]);
});

test('the yard counts its three waves: it is not cleared until yard-3-clear stands', () => {
  const index = M1_SECTORS.indexOf(YARD);
  const waiting = advancedTo(index);
  waiting.phase[index] = 'idle';
  expect(stepSectors(waiting, atTheFrontOf(YARD), 1 / 60)).toEqual([]);
  expect(waiting.phase[index]).toBe('idle');
  const done = advancedTo(index);
  done.phase[index] = 'idle';
  expect(stepSectors(done, atTheFrontOf(YARD, { flags: ['yard-3-clear'] }), 1 / 60)).toEqual([
    { kind: 'sectorCleared', sector: 'yard' },
  ]);
});

test('the plug counts the mid boss: it is not cleared until the warden is down', () => {
  const index = M1_SECTORS.indexOf(PLUG);
  const waiting = advancedTo(index);
  waiting.phase[index] = 'idle';
  expect(stepSectors(waiting, atTheFrontOf(PLUG), 1 / 60)).toEqual([]);
  expect(waiting.phase[index]).toBe('idle');
  const down = advancedTo(index);
  down.phase[index] = 'idle';
  expect(stepSectors(down, atTheFrontOf(PLUG, { wardenDown: true }), 1 / 60)).toEqual([
    { kind: 'sectorCleared', sector: 'plug' },
  ]);
});

test('the magazine counts its two main guns and not the magazine itself', () => {
  const index = M1_SECTORS.indexOf(MAGAZINE);
  const one = advancedTo(index);
  one.phase[index] = 'idle';
  const oneGun = [
    { kind: 'gun', hp: 1 },
    { kind: 'gun', hp: 0 },
    { kind: 'magazine', hp: 1 },
  ];
  expect(stepSectors(one, atTheFrontOf(MAGAZINE, { targets: oneGun }), 1 / 60)).toEqual([]);
  expect(one.phase[index]).toBe('idle');
  const both = advancedTo(index);
  both.phase[index] = 'idle';
  const bothGuns = [
    { kind: 'gun', hp: 0 },
    { kind: 'gun', hp: 0 },
    { kind: 'magazine', hp: 1 },
  ];
  expect(stepSectors(both, atTheFrontOf(MAGAZINE, { targets: bothGuns }), 1 / 60)).toEqual([
    { kind: 'sectorCleared', sector: 'magazine' },
  ]);
});

test('a sector without goals is cleared by its enemies alone', () => {
  for (const id of ['cband', 'field1', 'field2'] as const) {
    const sector = M1_SECTORS.find(entry => entry.id === id)!;
    expect(sector.goals, id).toBeUndefined();
    const index = M1_SECTORS.indexOf(sector);
    const state = advancedTo(index);
    state.phase[index] = 'idle';
    expect(stepSectors(state, atTheFrontOf(sector), 1 / 60), id).toEqual([{ kind: 'sectorCleared', sector: id }]);
  }
});

test('every flag a sector counts on is one the mission raises', () => {
  const flags = new Set(M1.flags ?? []);
  for (const sector of M1_SECTORS) {
    for (const goal of sector.goals ?? []) {
      if (goal.kind !== 'flag') continue;
      expect(flags.has(goal.name), `${sector.id} counts on "${goal.name}"`).toBe(true);
    }
  }
});
