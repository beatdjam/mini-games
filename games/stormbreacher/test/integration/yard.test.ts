// The yard's trap (SB-1840): three waves shut the mech in from the doors, the survivors shoot them down one at a time
// from the sea gate, and clearing all three opens the way on. The assist's interval is shorter when the depot was broken,
// so the mech spends less time surrounded.
import { expect, test } from 'vitest';
import { YARD_TUNE } from '../../src/data/fortress.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { sendToScript, step, type GameEvent, type GameInput, type GameModel } from '../../src/logic/game.ts';
import { holdAlliesFire, newPlayGame } from './playGame.ts';

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

// Takes cp1 (both pillboxes) and waits out the 10 s before the shelling starts.
function afterCp1(game: GameModel): void {
  for (const id of ['pillbox-1', 'pillbox-2']) {
    const target = game.targets.find(entry => entry.id === id);
    if (!target) throw new Error(`the map has no ${id}`);
    target.hp = 0;
    sendToScript(game, { kind: 'destroyed', target: id });
  }
  // the milestone's short slow makes the script's clock run a little behind the frames, so run until the shelling starts
  for (let frame = 0; frame < 60 * 20 && game.script.fired['shelling-start'] === undefined; frame++) run(game, 1);
  expect(game.script.fired['shelling-start']).toBeDefined();
}

// Stands the mech in the middle of one of the mission's areas and runs a few frames, so the game sends the `enter` itself.
function walkTo(game: GameModel, area: string): void {
  const spot = game.mission.areas[area];
  game.mech.x = spot.x;
  game.mech.z = spot.z;
  game.mech.y = 0;
  game.mech.grounded = true;
  run(game, 3);
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
      // the assist alone is counted: the allies' fire would bring yard enemies down too (SB-2301)
      holdAlliesFire(game);
      if (depotDown) sendToScript(game, { kind: 'destroyed', target: 'depot' });
      enterYard(game);
      expect(game.assist?.left).toBe(depotDown ? YARD_TUNE.assistEveryDepot : YARD_TUNE.assistEvery);
      const events = run(game, Math.round(60 * seconds));
      // the shots are counted from the events, not from the enemies left: a downed enemy stays in the list
      return events.filter(event => event.kind === 'enemyDown' && event.id.startsWith('yard-')).length;
    };

    // not yet the first interval: none down
    expect(killsAt(false, YARD_TUNE.assistEvery - 0.5)).toBe(0);
    expect(killsAt(true, YARD_TUNE.assistEveryDepot - 0.5)).toBe(0);
    // one at the first interval
    expect(killsAt(false, YARD_TUNE.assistEvery + 0.5)).toBe(1);
    expect(killsAt(true, YARD_TUNE.assistEveryDepot + 0.5)).toBe(1);
    // at the same moment (half a second past the plain interval's second shot), the depot's flag has brought more down
    const both = 2 * YARD_TUNE.assistEvery + 0.5;
    expect(killsAt(false, both)).toBe(2);
    expect(killsAt(true, both)).toBe(Math.floor(both / YARD_TUNE.assistEveryDepot));
    expect(Math.floor(both / YARD_TUNE.assistEveryDepot)).toBeGreaterThan(2);
  },
  LONG,
);

test(
  'the cover mechs keep shooting from the sea gate: all three, whether the depot was broken or passed (SB-2046)',
  () => {
    for (const broken of [true, false]) {
      const game = newPlayGame(M1B_HAND);
      if (broken) sendToScript(game, { kind: 'destroyed', target: 'depot' });
      afterCp1(game);
      walkTo(game, 'fortress-approach');
      enterYard(game);
      // this test reads where the survivors stand: their new fire would clear the yard and send them on to its middle (SB-2301)
      holdAlliesFire(game);
      run(game, Math.round(60 * 35));
      const survivors = game.allies.filter(ally => ally.id.startsWith('cover-') && !ally.down);
      expect(survivors.map(ally => ally.id).sort()).toEqual(['cover-b1', 'cover-b2', 'cover-b3']);
      for (const ally of survivors) {
        expect(ally.next).toBe(ally.way.length);
        expect(ally.z).toBeGreaterThan(-80);
        expect(ally.z).toBeLessThan(-70);
        expect(Math.abs(ally.x)).toBeLessThanOrEqual(6);
      }
    }
  },
  LONG,
);
