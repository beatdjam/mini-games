// The milestones' payoff (SB-2010): line 1's breach and the second bunker's fall move the front line, start the sector's
// enemies back to the next cover, send the allies on, slow the world for a moment and ease the enemy mortar. The flags
// keep the front line through a checkpoint and a suspend.
import { describe, expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { PAYOFF_TUNE } from '../../src/data/payoff.ts';
import { newEnemy } from '../../src/logic/enemies.ts';
import { frontOf } from '../../src/logic/front.ts';
import { hudModel } from '../../src/logic/hud.ts';
import { retryFromCheckpoint, sendToScript, step, type GameInput, type GameModel } from '../../src/logic/game.ts';
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

// No props, so an enemy's fall back is not pushed about by a wall; the targets stay, so cp1 can be taken.
const OPEN_MAP = { ...M1B_HAND, props: [] };

function run(game: GameModel, frames: number): void {
  for (let i = 0; i < frames; i++) step(game, idle, DT);
}

// The first pillbox down and then the second: the first gets the smaller knock, the second takes cp1.
function takeCp1(game: GameModel): void {
  for (const id of ['pillbox-1', 'pillbox-2']) {
    const target = game.targets.find(entry => entry.id === id);
    if (!target) throw new Error(`the map has no ${id}`);
    target.hp = 0;
    sendToScript(game, { kind: 'destroyed', target: id });
  }
}

// A walking enemy of the B sector, put where the milestone's fall back should reach it.
function gruntAt(x: number, z: number) {
  return newEnemy('payoff-test', 'payoff-test', 'grunt', x, z);
}

describe('line 1’s breach', () => {
  test('moves the front line, starts the sector’s enemies back and sets the slowdown and the mortar’s lull', () => {
    const game = newPlayGame(OPEN_MAP);
    expect(frontOf(game.script.flags).id).toBe('beach');
    const enemy = gruntAt(0, 120);
    game.enemies.push(enemy);

    sendToScript(game, { kind: 'blast', id: 'l1-b' });

    expect(frontOf(game.script.flags).id).toBe('line1');
    expect(game.slow).toEqual({ left: PAYOFF_TUNE.slowSec, scale: PAYOFF_TUNE.slowScale });
    expect(game.calm).toEqual({ left: PAYOFF_TUNE.calmSec, mul: PAYOFF_TUNE.calmMul });
    expect(enemy.fallback).not.toBeNull();
    expect(enemy.fallback?.z).toBeLessThan(120);
    // the heading is up for its seconds and the radar has a front line to draw
    expect(hudModel(game).headline).toBe('m1.breach');
    expect(hudModel(game).front.b.dist).toBeGreaterThan(0);

    // it runs to the next line's cover: landward, away from the mech
    const startZ = enemy.z;
    run(game, 30);
    expect(enemy.z).toBeLessThan(startZ);
  });

  test('sends the cover mechs through the hole', () => {
    const game = newPlayGame(OPEN_MAP);
    const cover = game.allies.find(ally => ally.id === 'cover-b1');
    if (!cover) throw new Error('the sortie has no cover-b1');
    sendToScript(game, { kind: 'blast', id: 'l1-b' });
    const end = cover.way[cover.way.length - 1];
    expect(end).toMatchObject({ x: 20, z: 110 });
    const startZ = cover.z;
    run(game, 30);
    expect(cover.z).toBeLessThan(startZ);
  });

  test('the cheer waits for the radio band', () => {
    const game = newPlayGame(OPEN_MAP);
    sendToScript(game, { kind: 'blast', id: 'l1-b' });
    step(game, idle, DT);
    expect(game.radio?.line).not.toBe('m1.line1-cheer');
    for (let i = 0; i < 180 && game.radio?.line !== 'm1.line1-cheer'; i++) step(game, idle, DT);
    expect(game.radio?.line).toBe('m1.line1-cheer');
  });

  test('the slowdown ends and the clock runs at full speed again', () => {
    const game = newPlayGame(OPEN_MAP);
    sendToScript(game, { kind: 'blast', id: 'l1-b' });
    expect(game.slow).not.toBeNull();

    const before = game.time;
    step(game, idle, 0.1);
    expect(game.time - before).toBeCloseTo(0.1 * PAYOFF_TUNE.slowScale, 6);

    run(game, Math.ceil(PAYOFF_TUNE.slowSec / DT) + 2);
    expect(game.slow).toBeNull();
    const after = game.time;
    step(game, idle, 0.1);
    expect(game.time - after).toBeCloseTo(0.1, 6);
    // the mortar's lull runs longer than the slowdown and ends on its own too
    run(game, Math.ceil(PAYOFF_TUNE.calmSec / DT) + 2);
    expect(game.calm).toBeNull();
  });
});

describe('line 2’s breach', () => {
  test('moves the front line to the middle line and starts the sector’s enemies back', () => {
    const game = newPlayGame(OPEN_MAP);
    expect(frontOf(game.script.flags).id).toBe('beach');
    const enemy = gruntAt(0, 82);
    game.enemies.push(enemy);

    sendToScript(game, { kind: 'blast', id: 'l2-a' });

    expect(frontOf(game.script.flags).id).toBe('line2');
    expect(game.script.flags).toContain('line2-open');
    expect(game.slow).not.toBeNull();
    expect(game.calm).not.toBeNull();
    expect(hudModel(game).headline).toBe('m1.breach2');
    expect(enemy.fallback?.z).toBeLessThan(82);

    const startZ = enemy.z;
    run(game, 30);
    expect(enemy.z).toBeLessThan(startZ);
  });

  test('the command’s line to hold at the cover comes after the cheer, not over it', () => {
    const game = newPlayGame(OPEN_MAP);
    sendToScript(game, { kind: 'blast', id: 'l2-a' });
    const shown: string[] = [];
    for (let i = 0; i < Math.round(12 / DT); i++) {
      step(game, idle, DT);
      const line = game.radio?.line;
      if (line !== undefined && shown[shown.length - 1] !== line) shown.push(line);
    }
    expect(shown.slice(0, 2)).toEqual(['m1.line2-cheer', 'm1.line2-hold']);
  });
});

describe('the second bunker', () => {
  test('moves the front line to the pillboxes and starts the sector’s enemies back to their cover', () => {
    const game = newPlayGame(OPEN_MAP);
    const enemy = gruntAt(0, 0);
    game.enemies.push(enemy);

    takeCp1(game);

    expect(frontOf(game.script.flags).id).toBe('pillboxes');
    expect(game.slow).not.toBeNull();
    expect(game.calm).not.toBeNull();
    expect(hudModel(game).headline).toBe('m1.bunker-down');
    expect(enemy.fallback?.z).toBeLessThan(0);

    const startZ = enemy.z;
    run(game, 30);
    expect(enemy.z).toBeLessThan(startZ);
  });

  test('sends the cover mechs on to C', () => {
    const game = newPlayGame(OPEN_MAP);
    const cover = game.allies.find(ally => ally.id === 'cover-b1');
    if (!cover) throw new Error('the sortie has no cover-b1');
    takeCp1(game);
    expect(cover.way[cover.way.length - 1]).toMatchObject({ x: 0, z: 6 });
  });

  test('keeps the front line through a checkpoint and a suspend', () => {
    const game = newPlayGame(OPEN_MAP);
    takeCp1(game);
    expect(game.checkpoint?.id).toBe('cp1');

    const retried = retryFromCheckpoint(game);
    expect(frontOf(retried.script.flags).id).toBe('pillboxes');

    const back = restoreSuspend(JSON.parse(JSON.stringify(suspendOf(game))));
    if (!back) throw new Error('the suspend was not read');
    expect(frontOf(back.script.flags).id).toBe('pillboxes');
    expect(back.script.flags).toContain('pillboxes-down');
  });
});

describe('the flags alone decide the line', () => {
  test('beach, line 1, line 2 and the pillbox line are the four steps, in that order', () => {
    expect(frontOf([]).id).toBe('beach');
    expect(frontOf(['line1-open']).id).toBe('line1');
    expect(frontOf(['line1-open', 'line2-open']).id).toBe('line2');
    expect(frontOf(['line1-open', 'line2-open', 'pillboxes-down']).id).toBe('pillboxes');
    expect(frontOf(['pillboxes-down']).id).toBe('pillboxes');
  });
});
