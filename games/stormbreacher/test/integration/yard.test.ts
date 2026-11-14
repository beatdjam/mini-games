// The yard's trap (SB-1840): three waves shut the mech in from the doors, the survivors shoot them down one at a time
// from the sea gate, and clearing all three opens the way on. The assist's interval is shorter when the depot was broken,
// so the mech spends less time surrounded.
import { expect, test } from 'vitest';
import { YARD_TUNE } from '../../src/data/fortress.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import type { AllyState } from '../../src/logic/allies.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { sendToScript, step, type GameEvent, type GameInput, type GameModel } from '../../src/logic/game.ts';
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
const LONG = 15000; // these tests run many hundreds of frames

// Runs `frames` frames with the mech kept alive and the beach's shells taken away, so the run reads the yard's own fight.
function run(game: GameModel, frames: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < frames; i++) {
    game.armor = MECH_TUNE.armor;
    game.barrages = [];
    game.shells = [];
    game.aimed = null;
    game.battery.on = false;
    step(game, IDLE, DT);
    events.push(...game.events);
  }
  return events;
}

// Stands the mech in the middle of the yard: the next step enters the area and fires the yard's cue.
function enterYard(game: GameModel): void {
  game.mech.x = 0;
  game.mech.z = -80;
  game.mech.y = 0;
  game.mech.grounded = true;
  game.mech.yaw = 0;
  run(game, 1);
}

function allyById(allies: readonly AllyState[], id: string): AllyState {
  const ally = allies.find(entry => entry.id === id);
  if (!ally) throw new Error(`the sortie has no ally "${id}"`);
  return ally;
}

// Takes cp1 (both pillboxes) and waits out the leader's 10 s question, so the two answers can fire.
function atTheQuestion(game: GameModel): void {
  for (const id of ['pillbox-1', 'pillbox-2']) {
    const target = game.targets.find(entry => entry.id === id);
    if (!target) throw new Error(`the map has no ${id}`);
    target.hp = 0;
    sendToScript(game, { kind: 'destroyed', target: id });
  }
  run(game, Math.round(60 * 10) + 1);
}

const yardOf = (game: GameModel, wave: string) => game.enemies.filter(enemy => enemy.wave === wave);
const downYard = (game: GameModel, wave: string): void => {
  for (const enemy of yardOf(game, wave)) enemy.hp = 0;
};

test('the yard sends its three waves in order, and the flags come up as each is cleared', () => {
  const game = newPlayGame(M1B_HAND);
  enterYard(game);
  expect(game.script.fired['fortress-yard']).toBeTypeOf('number');
  expect(yardOf(game, 'yard-1')).toHaveLength(3);
  expect(yardOf(game, 'yard-2')).toHaveLength(0);
  expect(game.assist).toEqual({ waves: ['yard-1', 'yard-2', 'yard-3'], left: YARD_TUNE.assistEvery });

  // yard-2 comes one gap after the cue, not at once
  run(game, Math.round(60 * (YARD_TUNE.waveGapSec - 0.2)));
  expect(game.script.spawned).not.toContain('yard-2');
  run(game, Math.round(60 * 0.4));
  expect(game.script.spawned).toContain('yard-2');
  expect(yardOf(game, 'yard-2')).toHaveLength(2);

  // yard-1 all down: the sea gate's two come out and the flag goes up
  downYard(game, 'yard-1');
  run(game, 1);
  expect(game.script.flags).toContain('yard-1-clear');
  expect(yardOf(game, 'yard-3')).toHaveLength(2);

  downYard(game, 'yard-2');
  run(game, 1);
  expect(game.script.flags).toContain('yard-2-clear');
  expect(game.script.fired['yard-clear']).toBeUndefined(); // yard-3 is still out

  downYard(game, 'yard-3');
  const events = run(game, 1);
  expect(game.script.flags).toEqual(expect.arrayContaining(['yard-1-clear', 'yard-2-clear', 'yard-3-clear']));
  expect(game.script.fired['yard-clear']).toBeTypeOf('number');
  expect(
    events.some(
      event => event.kind === 'script' && event.event.kind === 'radio' && event.event.line === 'm1.yard-clear',
    ),
  ).toBe(true);
});

test(
  'the assist brings one yard enemy down each interval, and the depot’s flag shortens it',
  () => {
    const killsAt = (depotDown: boolean, seconds: number): number => {
      const game = newPlayGame(M1B_HAND);
      if (depotDown) sendToScript(game, { kind: 'destroyed', target: 'depot' });
      enterYard(game);
      expect(game.assist?.left).toBe(depotDown ? YARD_TUNE.assistEveryDepot : YARD_TUNE.assistEvery);
      run(game, Math.round(60 * seconds));
      return game.enemies.filter(enemy => enemy.wave.startsWith('yard-') && enemy.hp <= 0).length;
    };

    // not yet the first interval: none down
    expect(killsAt(false, YARD_TUNE.assistEvery - 0.5)).toBe(0);
    expect(killsAt(true, YARD_TUNE.assistEveryDepot - 0.5)).toBe(0);
    // one at the first interval
    expect(killsAt(false, YARD_TUNE.assistEvery + 0.5)).toBe(1);
    expect(killsAt(true, YARD_TUNE.assistEveryDepot + 0.5)).toBe(1);
    // at the same 24.5 s, the depot's flag has brought one more down
    expect(killsAt(false, 24.5)).toBe(2);
    expect(killsAt(true, 24.5)).toBe(3);
  },
  LONG,
);

test(
  'the cover mechs that lived keep shooting from the sea gate: three when the depot was broken, two when it was passed',
  () => {
    // the depot broken: cover-b3 lives and all three go to the gate
    const depot = newPlayGame(M1B_HAND);
    sendToScript(depot, { kind: 'destroyed', target: 'depot' });
    atTheQuestion(depot);
    sendToScript(depot, { kind: 'enter', area: 'fortress-approach' });
    expect(depot.script.fired['fortress-go']).toBeUndefined(); // the answer was the depot
    enterYard(depot);
    run(depot, Math.round(60 * 35));
    const survivors = depot.allies.filter(ally => ally.id.startsWith('cover-') && !ally.down);
    expect(survivors.map(ally => ally.id).sort()).toEqual(['cover-b1', 'cover-b2', 'cover-b3']);
    for (const ally of survivors) {
      expect(ally.next).toBe(ally.way.length);
      expect(ally.z).toBeGreaterThan(-80);
      expect(ally.z).toBeLessThan(-70);
      expect(Math.abs(ally.x)).toBeLessThanOrEqual(6);
    }

    // straight on: cover-b3 falls to the skipped depot, and its move to the gate does nothing
    const straight = newPlayGame(M1B_HAND);
    atTheQuestion(straight);
    sendToScript(straight, { kind: 'enter', area: 'fortress-approach' });
    run(straight, Math.round(60 * 2));
    const b3 = allyById(straight.allies, 'cover-b3');
    expect(b3.down).toBe(true);
    const way = structuredClone(b3.way);
    const place = { x: b3.x, z: b3.z };

    enterYard(straight);
    expect(b3.way).toEqual(way); // a fallen ally is not sent anywhere
    expect({ x: b3.x, z: b3.z }).toEqual(place);
    run(straight, Math.round(60 * 35));
    const alive = straight.allies.filter(ally => ally.id.startsWith('cover-') && !ally.down);
    expect(alive.map(ally => ally.id).sort()).toEqual(['cover-b1', 'cover-b2']);
    for (const ally of alive) {
      expect(ally.next).toBe(ally.way.length);
      expect(ally.z).toBeGreaterThan(-80);
      expect(ally.z).toBeLessThan(-70);
    }
  },
  LONG,
);
