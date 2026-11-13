import { expect, test } from 'vitest';
import { ALLY_TUNE } from '../../src/data/allies.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { M1 } from '../../src/data/missions/m1.ts';
import type { AllyState } from '../../src/logic/allies.ts';
import {
  newGame,
  retryFromCheckpoint,
  sendToScript,
  step,
  type GameEvent,
  type GameInput,
  type GameModel,
} from '../../src/logic/game.ts';
import { seed } from '../../src/logic/rng.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { newPlayGame } from './playGame.ts';

const DT = 1 / 60;
const IDLE: GameInput = {
  moveX: 0,
  moveZ: 0,
  turn: 0,
  jump: false,
  jumpHeld: false,
  boost: false,
  fire: false,
  sub: false,
};
const PLACE = M1.places['beach-mid'];
const COVERS = ['cover-b1', 'cover-b2', 'cover-b3'] as const;

// Runs `frames` frames; gives back every event, in order.
function run(game: GameModel, input: GameInput, frames: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < frames; i++) {
    step(game, input, DT);
    events.push(...game.events);
  }
  return events;
}

const downs = (events: GameEvent[]) => events.filter(event => event.kind === 'allyDown');
const calls = (events: GameEvent[]) => events.filter(event => event.kind === 'allyCall');

// Breaks both pillboxes, which fires cp1: the checkpoint and the three cover mechs' way to C.
function breakPillboxes(game: GameModel): void {
  for (const id of ['pillbox-1', 'pillbox-2']) {
    const target = game.targets.find(t => t.id === id);
    if (!target) throw new Error(`the map has no ${id}`);
    target.hp = 0;
    sendToScript(game, { kind: 'destroyed', target: id });
  }
}

function allyById(allies: readonly AllyState[], id: string): AllyState {
  const ally = allies.find(entry => entry.id === id);
  if (!ally) throw new Error(`the sortie has no ally "${id}"`);
  return ally;
}

// Steps with the enemies and the shells taken away, so the mech keeps its armour while the allies walk their ways.
function runQuiet(game: GameModel, frames: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < frames; i++) {
    game.enemies = [];
    game.barrages = [];
    game.shells = [];
    game.aimed = null;
    game.armor = MECH_TUNE.armor;
    game.battery.on = false;
    step(game, IDLE, DT);
    events.push(...game.events);
  }
  return events;
}

test('the beach cue puts the buddy and the three cover mechs out, standing until the cutscene is over', () => {
  const game = newGame(M1B_HAND);
  step(game, IDLE, 0);
  expect(game.allies.map(ally => ally.id).sort()).toEqual(['buddy', 'cover-b1', 'cover-b2', 'cover-b3']);
  const buddy = allyById(game.allies, 'buddy');
  const start = { x: buddy.x, z: buddy.z };
  expect(start.z).toBeGreaterThan(160);
  run(game, IDLE, 60);
  expect(game.script.cutscene).not.toBeNull();
  expect({ x: buddy.x, z: buddy.z }).toEqual(start);
  expect(buddy.down).toBe(false);
});

test('the buddy runs landward, calls, and falls to the mortar at beach-mid once', () => {
  const game = newPlayGame(M1B_HAND);
  const buddy = allyById(game.allies, 'buddy');
  const events = run(game, IDLE, 60);
  expect(buddy.z).toBeLessThan(166 - ALLY_TUNE.speed / 2);
  expect(downs(events)).toHaveLength(0);
  events.push(...run(game, IDLE, 60 * 20));
  expect(buddy.down).toBe(true);
  expect(downs(events)).toEqual([{ kind: 'allyDown', id: 'buddy', x: buddy.x, z: buddy.z, by: 'mortar' }]);
  expect(Math.hypot(buddy.x - PLACE.x, buddy.z - PLACE.z)).toBeLessThanOrEqual(ALLY_TUNE.arrive);
  // the call comes once, before the fall
  const called = calls(events).filter(event => event.kind === 'allyCall' && event.id === 'buddy');
  expect(called).toEqual([{ kind: 'allyCall', id: 'buddy', line: 'm1.buddy-call' }]);
  expect(events.indexOf(called[0])).toBeLessThan(events.findIndex(event => event.kind === 'allyDown'));
  // fallen, it stays where it is and reports nothing more
  const at = { x: buddy.x, z: buddy.z };
  expect(downs(run(game, IDLE, 120))).toHaveLength(0);
  expect({ x: buddy.x, z: buddy.z }).toEqual(at);
});

test('the allies take no part in the mech, the shots or the shells: the game goes the same without them', () => {
  const play = (withAllies: boolean) => {
    seed(11);
    const game = newPlayGame(M1B_HAND);
    if (!withAllies) game.allies = [];
    // the mech walks along the buddy's way and fires all the while
    const events = run(game, { ...IDLE, moveZ: 1, fire: true }, 60 * 12);
    return {
      game,
      events: events.filter(event => event.kind !== 'allyDown' && event.kind !== 'allyCall'),
    };
  };
  const a = play(true);
  const b = play(false);
  expect(allyById(a.game.allies, 'buddy').down).toBe(true);
  expect(a.game.mech).toEqual(b.game.mech);
  expect(a.game.armor).toBe(b.game.armor);
  expect(a.game.bullets).toEqual(b.game.bullets);
  expect(a.game.targets).toEqual(b.game.targets);
  expect(a.events).toEqual(b.events);
});

test('a shot passing through the buddy goes on, and the mech stands where the buddy stands', () => {
  const game = newPlayGame(M1B_HAND);
  const buddy = allyById(game.allies, 'buddy');
  game.mech.x = buddy.x;
  game.mech.z = buddy.z;
  game.bullets.push({
    weapon: game.main.id,
    x: buddy.x,
    y: 1.5,
    z: buddy.z + 1,
    dx: 0,
    dy: 0,
    dz: -1,
    left: 100,
  });
  run(game, IDLE, 1);
  expect(game.events.filter(event => event.kind === 'hit')).toHaveLength(0);
  expect(game.bullets).toHaveLength(1);
  expect(game.bullets[0].z).toBeLessThan(buddy.z + 1);
});

test('the three cover mechs reach the posts behind line 1 and go on to C at cp1, then to the boss at the seawall', () => {
  const game = newPlayGame(M1B_HAND);
  run(game, IDLE, 60 * 20);
  for (const id of COVERS) {
    const ally = allyById(game.allies, id);
    expect(ally.next).toBe(ally.way.length);
    expect(ally.down).toBe(false);
  }
  const posts = COVERS.map(id => {
    const ally = allyById(game.allies, id);
    return { x: ally.x, z: ally.z };
  });

  breakPillboxes(game);
  COVERS.forEach((id, i) => {
    const ally = allyById(game.allies, id);
    // the next way starts at the post the ally stands on
    expect(ally.way[0]).toEqual(posts[i]);
    expect(ally.next).toBe(1);
  });
  // the wave2-sinks cutscene holds them, then they run on to C
  runQuiet(game, 60 * 40);
  const cPosts = COVERS.map(id => {
    const ally = allyById(game.allies, id);
    expect(ally.next).toBe(ally.way.length);
    return { x: ally.x, z: ally.z };
  });

  sendToScript(game, { kind: 'enter', area: 'seawall-top' });
  COVERS.forEach((id, i) => {
    const ally = allyById(game.allies, id);
    expect(ally.way[0]).toEqual(cPosts[i]);
    expect(ally.next).toBe(1);
  });
});

test('on the way to the boss the cover mechs climb the ramp and come back to the ground past the seawall', () => {
  const game = newPlayGame(M1B_HAND);
  breakPillboxes(game);
  runQuiet(game, 60 * 40);
  sendToScript(game, { kind: 'enter', area: 'seawall-top' });

  const ally = allyById(game.allies, 'cover-b1');
  let highest = 0;
  for (let i = 0; i < 60 * 25; i++) {
    runQuiet(game, 1);
    highest = Math.max(highest, ally.y);
  }
  expect(highest).toBeGreaterThan(3);
  expect(ally.y).toBe(0);
});

test('entering B puts the gunner out as the fifth ally, and it calls and falls to the machine gun', () => {
  const game = newPlayGame(M1B_HAND);
  game.mech.x = 0;
  game.mech.z = 140;
  step(game, IDLE, DT);
  expect(game.allies).toHaveLength(5);
  const gunner = allyById(game.allies, 'gunner');
  const events = runQuiet(game, 60 * 20);
  expect(gunner.down).toBe(true);
  const called = events.filter(event => event.kind === 'allyCall' && event.id === 'gunner');
  expect(called).toEqual([{ kind: 'allyCall', id: 'gunner', line: 'm1.gunner-call' }]);
  const down = events.find(event => event.kind === 'allyDown' && event.id === 'gunner');
  expect(down).toEqual({ kind: 'allyDown', id: 'gunner', x: gunner.x, z: gunner.z, by: 'gun' });
  expect(events.indexOf(called[0])).toBeLessThan(events.indexOf(down ?? called[0]));
});

test('a checkpoint keeps all five allies with their height, call and way, and coming back matches it', () => {
  const game = newPlayGame(M1B_HAND);
  game.mech.x = 0;
  game.mech.z = 140;
  step(game, IDLE, DT); // the gunner comes out
  breakPillboxes(game);

  const kept = structuredClone(game.checkpoint?.allies ?? []);
  expect(kept.map(ally => ally.id).sort()).toEqual(['buddy', 'cover-b1', 'cover-b2', 'cover-b3', 'gunner']);
  expect(game.checkpoint?.allies).toEqual(game.allies);
  for (const ally of kept) {
    expect(ally.y).toBeTypeOf('number');
    expect(ally.called).toBeTypeOf('boolean');
    expect(ally.way.length).toBeGreaterThan(1);
  }

  const again = retryFromCheckpoint(game);
  expect(again.allies).toEqual(kept);
  expect(again.allies[0]).not.toBe(game.checkpoint?.allies[0]);
});

test('going back to the checkpoint brings the buddy back as the checkpoint kept it', () => {
  const game = newPlayGame(M1B_HAND);
  run(game, IDLE, 60);
  // cp1 is taken while the buddy is still running
  breakPillboxes(game);
  const kept = structuredClone(allyById(game.allies, 'buddy'));
  expect(kept.down).toBe(false);
  expect(allyById(game.checkpoint?.allies ?? [], 'buddy')).toEqual(kept);
  run(game, IDLE, 60 * 20);
  expect(allyById(game.allies, 'buddy').down).toBe(true);

  const again = retryFromCheckpoint(game);
  const keptAgain = allyById(again.allies, 'buddy');
  expect(keptAgain).toEqual(kept);
  expect(keptAgain).not.toBe(game.checkpoint?.allies.find(ally => ally.id === 'buddy'));
  expect(again.allies.map(ally => ally.id)).toEqual(
    expect.arrayContaining(['buddy', 'cover-b1', 'cover-b2', 'cover-b3']),
  );
  // it runs on from there and falls once more
  expect(downs(run(again, IDLE, 60 * 20))).toHaveLength(1);
  // and the checkpoint itself still holds the buddy running
  expect(allyById(game.checkpoint?.allies ?? [], 'buddy')).toEqual(kept);
});
