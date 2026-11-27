// The battle layer in the game (SB-2200): the infantry's crowd and the battle's shells are GameModel's now, step moves
// them and the view only draws them. The front line's flags still decide the waiting line, and a suspend or a retry
// rebuilds the crowd at the line the flags hold.
import { describe, expect, test } from 'vitest';
import { LINE1_FLAG, LINE2_FLAG } from '../../src/data/front.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { PAYOFF_TUNE } from '../../src/data/payoff.ts';
import { frontOf } from '../../src/logic/front.ts';
import {
  newGame,
  retryFromCheckpoint,
  sendToScript,
  step,
  type GameInput,
  type GameModel,
} from '../../src/logic/game.ts';
import { seed } from '../../src/logic/rng.ts';
import { restoreSuspend, suspendOf } from '../../src/logic/suspend.ts';
import { newPlayGame } from './playGame.ts';

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

function run(game: GameModel, frames: number): void {
  for (let i = 0; i < frames; i++) step(game, idle, DT);
}

function alive(game: GameModel) {
  return game.battle.crowd.soldiers.filter(soldier => soldier.alive);
}

function meanZ(game: GameModel): number {
  const soldiers = alive(game);
  return soldiers.reduce((sum, soldier) => sum + soldier.z, 0) / soldiers.length;
}

// Breaks both pillboxes, which is what takes cp1.
function takeCp1(game: GameModel): void {
  for (const id of ['pillbox-1', 'pillbox-2']) {
    const target = game.targets.find(entry => entry.id === id);
    if (!target) throw new Error(`the map has no ${id}`);
    target.hp = 0;
    sendToScript(game, { kind: 'destroyed', target: id });
  }
}

// Suspends and resumes through JSON, as the storage does.
function resumed(game: GameModel): GameModel {
  const back = restoreSuspend(JSON.parse(JSON.stringify(suspendOf(game))));
  if (!back) throw new Error('the suspend was not read');
  return back;
}

describe('the battle layer in the game', () => {
  test('the infantry walks from the sea to the hold line and waits', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    const holdZ = frontOf([]).holdZ;
    expect(game.battleFront).toBe('beach');
    expect(game.battle.crowd.holdZ).toBe(holdZ);
    const before = meanZ(game);
    const count = alive(game).length;
    run(game, 600);
    // +z is the sea: walking landward lowers z, and the held line stops them at the beach's hold.
    expect(meanZ(game)).toBeLessThan(before);
    expect(alive(game).every(soldier => soldier.z >= holdZ - 1e-9)).toBe(true);
    // no new wave comes in while the line is held
    expect(alive(game).length).toBeLessThanOrEqual(count);
  });

  test('a new front line moves the hold and sends one wave', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    const line1 = frontOf([LINE1_FLAG]);
    const before = game.battle.crowd.soldiers.length;
    game.script.flags.push(LINE1_FLAG);
    step(game, idle, DT);
    expect(game.battleFront).toBe('line1');
    expect(game.battle.crowd.holdZ).toBe(line1.holdZ);
    expect(game.battle.crowd.soldiers.length).toBe(before + PAYOFF_TUNE.surgeAllies);
  });

  test('the infantry keeps walking while the mech is downed', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    game.downed = true;
    const before = meanZ(game);
    run(game, 60);
    expect(meanZ(game)).toBeLessThan(before);
  });

  test('the landing cutscene holds the infantry still', () => {
    seed(7);
    const game = newGame(M1B_HAND);
    step(game, idle, 0);
    expect(game.script.cutscene?.id).toBe('landing');
    const before = meanZ(game);
    const count = alive(game).length;
    run(game, 60);
    expect(meanZ(game)).toBe(before);
    expect(alive(game).length).toBe(count);
  });

  test('a suspend rebuilds the battle at the line the flags hold', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    game.script.flags.push(LINE2_FLAG);
    const back = resumed(game);
    const front = frontOf(back.script.flags);
    expect(front.id).toBe('line2');
    expect(back.battleFront).toBe(front.id);
    expect(back.battle.crowd.holdZ).toBe(front.holdZ);
  });

  test('a retry rebuilds the battle at the checkpoint’s line', () => {
    seed(7);
    const game = newPlayGame(M1B_HAND);
    takeCp1(game);
    expect(game.checkpoint?.id).toBe('cp1');
    const again = retryFromCheckpoint(game);
    const front = frontOf(again.script.flags);
    expect(front.id).toBe('pillboxes');
    expect(again.battleFront).toBe(front.id);
    expect(again.battle.crowd.holdZ).toBe(front.holdZ);
  });
});
