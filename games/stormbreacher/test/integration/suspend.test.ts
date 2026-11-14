import { describe, expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { AIMED_MORTAR } from '../../src/data/hazards.ts';
import { payoutOf } from '../../src/logic/economy.ts';
import { retryFromCheckpoint, sendToScript, step, type GameInput, type GameModel } from '../../src/logic/game.ts';
import { restoreSuspend, suspendOf } from '../../src/logic/suspend.ts';
import { newEnemy } from '../../src/logic/enemies.ts';
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
const walk: GameInput = { ...idle, moveZ: 1 };

function run(game: GameModel, input: GameInput, frames: number): void {
  for (let i = 0; i < frames; i++) step(game, input, DT);
}

// Suspends and resumes through JSON, as the storage does.
function resumed(game: GameModel): GameModel {
  const back = restoreSuspend(JSON.parse(JSON.stringify(suspendOf(game))));
  if (!back) throw new Error('the suspend was not read');
  return back;
}

// A game that walked, met the squad, took cp1 (both pillboxes down), walked on and was downed once.
function played(): GameModel {
  const game = newPlayGame(M1B_HAND);
  run(game, walk, 30);
  sendToScript(game, { kind: 'enter', area: 'b-line' });
  run(game, walk, 30);
  for (const id of ['pillbox-1', 'pillbox-2']) {
    const target = game.targets.find(t => t.id === id);
    if (!target) throw new Error(`the map has no ${id}`);
    target.hp = 0;
    sendToScript(game, { kind: 'destroyed', target: id });
  }
  run(game, walk, 40);
  game.armor = 0;
  game.downed = true;
  const again = retryFromCheckpoint(game);
  run(again, walk, 40);
  return again;
}

describe('suspend and resume', () => {
  test('the mech, enemies, targets, script, clock, checkpoint and retries come back', () => {
    const game = played();
    expect(game.enemies.length).toBeGreaterThan(0);
    expect(game.retries).toBe(1);
    expect(game.checkpoint?.id).toBe('cp1');
    const back = resumed(game);
    expect(back.mech).toEqual(game.mech);
    expect(back.armor).toBe(game.armor);
    expect(back.enemies).toEqual(game.enemies);
    expect(back.targets).toEqual(game.targets);
    expect(back.script).toEqual(game.script);
    expect(back.time).toBe(game.time);
    expect(back.retries).toBe(1);
    expect(back.checkpoint).toEqual(game.checkpoint);
    expect(back.checkpoint?.map).toBe(M1B_HAND);
    expect(back.bullets).toEqual([]);
    expect(back.events).toEqual([]);
  });

  test('the resumed game goes on stepping', () => {
    const back = resumed(played());
    const z = back.mech.z;
    run(back, walk, 30);
    expect(back.mech.z).not.toBe(z);
    expect(back.time).toBeGreaterThan(0);
  });

  test('a mech downed after the resume starts again from the checkpoint kept in the suspend', () => {
    const game = played();
    const cp = game.checkpoint;
    if (!cp) throw new Error('no checkpoint');
    const back = resumed(game);
    back.armor = 0;
    back.downed = true;
    const again = retryFromCheckpoint(back);
    expect(again.mech.x).toBe(cp.mech.x);
    expect(again.mech.z).toBe(cp.mech.z);
    expect(again.time).toBe(cp.time);
    expect(again.retries).toBe(2);
    expect(again.downed).toBe(false);
    expect(again.checkpoint?.id).toBe('cp1');
  });

  test('a game suspended before any checkpoint has none after the resume', () => {
    const game = newPlayGame(M1B_HAND);
    run(game, walk, 20);
    expect(resumed(game).checkpoint).toBeNull();
  });

  test('the yard’s assist and the cover mechs’ post come back with the resume', () => {
    const game = newPlayGame(M1B_HAND);
    sendToScript(game, { kind: 'enter', area: 'fortress-yard' });
    if (game.assist === null) throw new Error('the yard cue did not start the assist');
    game.assist.left = 4.25;
    const ally = game.allies.find(entry => entry.id === 'cover-b1');
    if (!ally) throw new Error('the sortie has no cover-b1');
    ally.x = 0;
    ally.z = -76;
    ally.next = ally.way.length;
    const back = resumed(game);
    expect(back.assist).toEqual({ waves: ['yard-1', 'yard-2', 'yard-3'], left: 4.25 });
    expect(back.allies.find(entry => entry.id === 'cover-b1')).toEqual(ally);
  });

  test('the mid boss’s phase and timers come back with the resume', () => {
    const game = newPlayGame(M1B_HAND);
    const warden = newEnemy('warden-1', 'warden', 'warden', 0, -118);
    if (!warden.warden) throw new Error('the warden has no state');
    warden.hp = 190;
    warden.warden.phase = 'stagger';
    warden.warden.timer = 1.2;
    warden.warden.exposed = 1.2;
    warden.warden.mortarT = 2;
    warden.warden.called = true;
    game.enemies = [warden];
    const back = resumed(game);
    expect(back.enemies[0]).toMatchObject({ id: 'warden-1', hp: 190, warden: warden.warden });
  });

  test('the aimed mortar’s anchor and stay come back with the resume', () => {
    const game = newPlayGame(M1B_HAND);
    if (game.aimed === null) throw new Error('the beach cue did not start the aimed mortar');
    game.aimed = { anchor: { x: game.mech.x + 1, z: game.mech.z - 1 }, still: 1.75 };
    const back = resumed(game);
    expect(back.aimed).toEqual({ anchor: { x: game.mech.x + 1, z: game.mech.z - 1 }, still: 1.75 });
    // a shell warned before the suspend is gone, as a checkpoint's is
    back.shells.push({ x: 0, z: 0, radius: AIMED_MORTAR.radius, warn: AIMED_MORTAR.warn, left: 1, damage: 1 });
    expect(resumed(back).shells).toEqual([]);
  });

  test('a clear after the resume pays what the same sortie pays without a suspend', () => {
    const game = played();
    const back = resumed(game);
    for (const g of [game, back]) {
      g.time += 90;
      g.armor -= 100;
      g.cleared = true;
    }
    expect(payoutOf(back, false)).toEqual(payoutOf(game, false));
    // the retry is counted once, not twice
    expect(payoutOf(back, false).retries).toBe(1);
  });
});
