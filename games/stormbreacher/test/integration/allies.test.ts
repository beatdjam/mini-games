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
import { restoreSuspend, suspendOf } from '../../src/logic/suspend.ts';
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
const LONG = 15000; // these tests run many hundreds of frames; the default 5 s is short on a busy CI machine

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

// Stands the mech at `place` and holds use, as a player plants a charge: the hold and the fuse run, nothing shoots back,
// and the frame the charge blows is the frame the script hears it. Gives back the events of those frames.
function plantAndBlow(game: GameModel, place: { x: number; z: number }, blast: string): GameEvent[] {
  game.mech.x = place.x;
  game.mech.z = place.z;
  game.mech.y = 0;
  game.mech.grounded = true;
  const events: GameEvent[] = [];
  for (let i = 0; i < 60 * 10 && !game.script.blasts.includes(blast); i++) {
    game.enemies = [];
    game.barrages = [];
    game.shells = [];
    game.aimed = null;
    game.armor = MECH_TUNE.armor;
    game.battery.on = false;
    step(game, { ...IDLE, use: true }, DT);
    events.push(...game.events);
  }
  expect(game.script.blasts).toContain(blast);
  return events;
}

test('the beach allies stay out of it while the mech is on the craft, and run once it steps off', () => {
  const game = newGame(M1B_HAND);
  step(game, IDLE, 0);
  expect(game.allies).toEqual([]);
  // the landing ends, but the mech is still on the deck
  sendToScript(game, { kind: 'skip' });
  run(game, IDLE, 60);
  expect(game.allies).toEqual([]);
  // down the ramp: the ashored input puts the buddy and the three cover mechs out in the same frame
  game.mech.z = M1B_HAND.bounds.maxZ;
  step(game, IDLE, DT);
  expect(game.allies.map(ally => ally.id).sort()).toEqual(['buddy', 'cover-b1', 'cover-b2', 'cover-b3', 'gunner']);
  const buddy = allyById(game.allies, 'buddy');
  const start = { x: buddy.x, z: buddy.z };
  expect(start.z).toBeGreaterThan(160);
  // it runs from the first frame it is out
  run(game, IDLE, 30);
  expect(buddy.z).toBeLessThan(start.z);
  expect(buddy.down).toBe(false);
});

test(
  'the buddy runs landward, calls, and falls to the mortar at beach-mid once',
  () => {
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
  },
  LONG,
);

test(
  'the allies take no part in the mech, the shots or the shells: the game goes the same without them',
  () => {
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
  },
  LONG,
);

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

test('a charge blown in the game tells the script, and the cover mechs take the first hole of the line', () => {
  const game = newPlayGame(M1B_HAND);
  runQuiet(game, 60 * 5); // the cover mechs reach their waiting cover
  game.charges.push({ blast: 'l1-b', left: 0 });
  step(game, IDLE, DT);
  expect(game.script.blasts).toEqual(['l1-b']);
  for (const id of COVERS) {
    const way = id.replace('cover-', '');
    expect(allyById(game.allies, id).way).toEqual(M1.paths[`${way}-run-l1b`]);
  }

  // the same line's other point can still be planted, but the way stays the first hole's
  game.charges.push({ blast: 'l1-a', left: 0 });
  step(game, IDLE, DT);
  expect(game.script.blasts).toEqual(['l1-b', 'l1-a']);
  for (const id of COVERS) {
    const way = id.replace('cover-', '');
    expect(allyById(game.allies, id).way).toEqual(M1.paths[`${way}-run-l1b`]);
  }
});

test('blowing l1-a first sends the cover mechs through its hole, and a suspend keeps that way', () => {
  const game = newPlayGame(M1B_HAND);
  runQuiet(game, 60 * 5);
  game.charges.push({ blast: 'l1-a', left: 0 });
  step(game, IDLE, DT);
  expect(game.script.blasts).toEqual(['l1-a']);
  for (const id of COVERS) {
    const way = id.replace('cover-', '');
    expect(allyById(game.allies, id).way).toEqual(M1.paths[`${way}-run-l1a`]);
  }
  // the suspend keeps the blown point and the allies' ways, so a resume still goes through l1-a
  const back = restoreSuspend(suspendOf(game));
  if (!back) throw new Error('the suspend did not read back');
  expect(back.script.blasts).toEqual(['l1-a']);
  for (const id of COVERS) {
    const way = id.replace('cover-', '');
    expect(allyById(back.allies, id).way).toEqual(M1.paths[`${way}-run-l1a`]);
  }
});

test(
  'the three cover mechs wait sea-side of line 1 and go through its hole once the line is blasted',
  () => {
    const game = newPlayGame(M1B_HAND);
    run(game, IDLE, 60 * 20);
    for (const id of COVERS) {
      const ally = allyById(game.allies, id);
      // the way they were given ends at the cover sea-side of line 1; they do not run through the closed line
      expect(ally.next).toBe(ally.way.length);
      expect(ally.z).toBeGreaterThan(150);
      expect(ally.down).toBe(false);
    }
    const waits = COVERS.map(id => {
      const ally = allyById(game.allies, id);
      return { x: ally.x, z: ally.z };
    });

    // l1-b blows: the script hears the blast and sends the three through the hole
    sendToScript(game, { kind: 'blast', id: 'l1-b' });
    COVERS.forEach((id, i) => {
      const ally = allyById(game.allies, id);
      expect(ally.way[0]).toEqual(waits[i]);
      expect(ally.next).toBe(1);
    });
    const before = allyById(game.allies, 'cover-b1').z;
    run(game, IDLE, 180); // around the low wall at x 30 and then through the hole
    expect(allyById(game.allies, 'cover-b1').z).toBeLessThan(before);

    // they reach the posts behind line 1
    runQuiet(game, 60 * 20);
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
  },
  LONG,
);

test(
  'on the way to the boss the cover mechs climb the ramp and come back to the ground past the seawall',
  () => {
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
  },
  LONG,
);

test(
  'the gunner waits by line 1 and takes the first blown hole in the order the sortie runs',
  () => {
    // b-line from the inside: the mech enters B on its way to l1-b, before the charge blows
    const inside = newPlayGame(M1B_HAND);
    const gunnerInside = allyById(inside.allies, 'gunner');
    expect(gunnerInside.way).toEqual(M1.paths['gunner-wait']);
    plantAndBlow(inside, { x: 40, z: 149 }, 'l1-b');
    expect(gunnerInside.way).toEqual(M1.paths['gunner-run-l1b']);

    // the band outside b-line: l1-b is still in reach, so the mech plants it without ever entering B
    const band = newPlayGame(M1B_HAND);
    plantAndBlow(band, { x: 40, z: 151.3 }, 'l1-b');
    expect(allyById(band.allies, 'gunner').way).toEqual(M1.paths['gunner-run-l1b']);

    // l1-a blown first
    const left = newPlayGame(M1B_HAND);
    plantAndBlow(left, { x: -55, z: 148 }, 'l1-a');
    expect(allyById(left.allies, 'gunner').way).toEqual(M1.paths['gunner-run-l1a']);
    // line1-open fires only on the blast: the way was never picked from the fallback
    expect(left.script.fired['line1-open']).toBeTypeOf('number');
  },
  LONG,
);

test(
  'the gunner comes out with the beach and falls to the machine gun once line 1 is blown',
  () => {
    const game = newPlayGame(M1B_HAND);
    expect(game.allies).toHaveLength(5);
    expect(allyById(game.allies, 'gunner').way).toEqual(M1.paths['gunner-wait']);
    // the sortie's order: the mech enters B (the pillboxes wake), then a charge blows line 1
    game.mech.x = 0;
    game.mech.z = 140;
    step(game, IDLE, DT);
    expect(game.script.fired['pillboxes']).toBeTypeOf('number');
    sendToScript(game, { kind: 'blast', id: 'l1-b' });
    const gunner = allyById(game.allies, 'gunner');
    expect(gunner.way).toEqual(M1.paths['gunner-run-l1b']);
    const events = runQuiet(game, 60 * 20);
    expect(gunner.down).toBe(true);
    const called = events.filter(event => event.kind === 'allyCall' && event.id === 'gunner');
    expect(called).toEqual([{ kind: 'allyCall', id: 'gunner', line: 'm1.gunner-call' }]);
    const down = events.find(event => event.kind === 'allyDown' && event.id === 'gunner');
    expect(down).toEqual({ kind: 'allyDown', id: 'gunner', x: gunner.x, z: gunner.z, by: 'gun' });
    expect(events.indexOf(called[0])).toBeLessThan(events.indexOf(down ?? called[0]));
  },
  LONG,
);

test('a checkpoint keeps all five allies with their height, call and way, and coming back matches it', () => {
  const game = newPlayGame(M1B_HAND);
  game.mech.x = 0;
  game.mech.z = 140;
  step(game, IDLE, DT); // the pillboxes wake
  sendToScript(game, { kind: 'blast', id: 'l1-b' }); // the gunner takes its way before the checkpoint
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

test(
  'going back to the checkpoint brings the buddy back as the checkpoint kept it',
  () => {
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
    expect(again.allies.map(ally => ally.id)).toEqual(['buddy', 'cover-b1', 'cover-b2', 'cover-b3', 'gunner']);
    // it runs on from there and falls once more
    expect(downs(run(again, IDLE, 60 * 20))).toHaveLength(1);
    // and the checkpoint itself still holds the buddy running
    expect(allyById(game.checkpoint?.allies ?? [], 'buddy')).toEqual(kept);
  },
  LONG,
);
