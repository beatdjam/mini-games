import { describe, expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { TARGET_SIZE, WRECK_SCALE_Y } from '../../src/data/props.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { WARDEN_TUNE } from '../../src/data/warden.ts';
import { WEAPONS } from '../../src/data/weapons.ts';
import {
  newGame,
  restartGame,
  retryFromCheckpoint,
  sendToScript,
  step,
  targetRect,
  type GameInput,
  type GameModel,
} from '../../src/logic/game.ts';
import { newPlayGame } from './playGame.ts';
import { newEnemy } from '../../src/logic/enemies.ts';
import { restoreCheckpoint } from '../../src/logic/script.ts';

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

// Breaks both pillboxes, which is what takes cp1.
function takeCp1(game: GameModel): void {
  for (const id of ['pillbox-1', 'pillbox-2']) {
    const target = game.targets.find(t => t.id === id);
    if (!target) throw new Error(`the map has no ${id}`);
    target.hp = 0;
    sendToScript(game, { kind: 'destroyed', target: id });
  }
}

// Shoots the target down from its east side. A pillbox is not one of them: bullets only suppress it, so a pillbox goes
// down by hand (takeCp1) or by a charge.
function shootDownFromSide(game: GameModel, id: string): void {
  const place = M1B_HAND.targets.find(target => target.id === id);
  if (!place) throw new Error(`the hand map has no ${id}`);
  const target = game.targets.find(entry => entry.id === id);
  if (!target) throw new Error(`the game has no ${id}`);
  game.mech.x = place.x + 20;
  game.mech.z = place.z;
  game.mech.y = 0;
  game.mech.yaw = Math.PI / 2;
  for (let i = 0; i < 600 && target.hp > 0; i++) step(game, { ...idle, fire: true }, DT);
  expect(target.hp, id).toBe(0);
}

// A game that walked, met the B line's squad and then took cp1.
function atCp1(): GameModel {
  const game = newPlayGame(M1B_HAND);
  run(game, walk, 30);
  sendToScript(game, { kind: 'enter', area: 'b-line' });
  // the nests would shoot the mech on the way; this test reads the checkpoint's copy
  game.enemies = game.enemies.filter(enemy => enemy.wave !== 'b-emplacements');
  run(game, walk, 30);
  takeCp1(game);
  return game;
}

// What the game changes after cp1: the mech walks on, the depot and an enemy fall, and the armour and weapons are spent.
function playOn(game: GameModel): void {
  run(game, walk, 60);
  const depot = game.targets.find(t => t.id === 'depot');
  if (!depot) throw new Error('the map has no depot');
  depot.hp = 0;
  sendToScript(game, { kind: 'destroyed', target: 'depot' });
  game.enemies[0].hp = 0;
  game.armor = 0;
  game.downed = true;
  game.main.ammo = 0;
  game.main.wait = 3;
  game.sub.ammo = 1;
}

describe('checkpoint', () => {
  test('there is none until the script takes one; the pillboxes down take cp1', () => {
    const game = newPlayGame(M1B_HAND);
    expect(game.checkpoint).toBeNull();
    run(game, idle, 5);
    expect(game.checkpoint).toBeNull();
    takeCp1(game);
    expect(game.checkpoint?.id).toBe('cp1');
    expect(game.script.checkpoint?.id).toBe('cp1');
  });

  test('the copy leaves out the events, the bullets in flight and the checkpoint itself', () => {
    const game = atCp1();
    game.bullets.push({ enemy: 'grunt', x: 0, y: 1, z: 0, dx: 0, dy: 0, dz: 1, left: 10 });
    takeCp1(game);
    const copy = game.checkpoint;
    if (!copy) throw new Error('no checkpoint');
    expect('events' in copy).toBe(false);
    expect('bullets' in copy).toBe(false);
    expect('checkpoint' in copy).toBe(false);
    expect(copy.map).toBe(game.map);
    expect(copy.mission).toBe(game.mission);
  });

  test('a retry puts the mech, the clock, the enemies and the targets back as they were at the checkpoint', () => {
    const game = atCp1();
    const mech = { x: game.mech.x, z: game.mech.z, yaw: game.mech.yaw };
    const time = game.time;
    const enemies = structuredClone(game.enemies);
    const targets = structuredClone(game.targets);
    expect(enemies.length).toBeGreaterThan(0);
    playOn(game);
    expect(game.mech.z).not.toBe(mech.z);
    const again = retryFromCheckpoint(game);
    expect(again.mech.x).toBe(mech.x);
    expect(again.mech.z).toBe(mech.z);
    expect(again.mech.yaw).toBe(mech.yaw);
    expect(again.time).toBe(time);
    expect(again.enemies).toEqual(enemies);
    expect(again.enemies.every(enemy => enemy.hp > 0)).toBe(true);
    expect(again.targets).toEqual(targets);
    expect(again.targets.find(t => t.id === 'depot')?.hp).toBeGreaterThan(0);
    expect(again.script.destroyed).not.toContain('depot');
    expect(again.bullets).toEqual([]);
  });

  test('a retry fills the armour and both weapons and clears downed', () => {
    const game = atCp1();
    playOn(game);
    const again = retryFromCheckpoint(game);
    expect(again.armor).toBe(MECH_TUNE.armor);
    expect(again.downed).toBe(false);
    expect(again.cleared).toBe(false);
    expect(again.main.ammo).toBe(WEAPONS[again.main.id].ammo);
    expect(again.sub.ammo).toBe(WEAPONS[again.sub.id].ammo);
    expect(again.main.wait).toBe(0);
    expect(again.aimTarget).toBeNull();
  });

  test('a broken target comes back from the checkpoint as the same low wreck', () => {
    // no props, so nothing stands in the line of fire to the depot
    const game = newPlayGame({ ...M1B_HAND, props: [] });
    shootDownFromSide(game, 'depot');
    takeCp1(game);
    expect(game.checkpoint?.id).toBe('cp1');
    // a pillbox set to 0 by hand keeps its wall's height until the checkpoint's copy lowers it
    for (const id of ['depot', 'pillbox-1']) {
      const place = M1B_HAND.targets.find(target => target.id === id);
      if (!place) throw new Error(`the hand map has no ${id}`);
      const wreckTop = TARGET_SIZE[place.kind].h * WRECK_SCALE_Y;
      const again = retryFromCheckpoint(game);
      expect(again.targets.find(target => target.id === id)?.hp, id).toBe(0);
      expect(targetRect(again, id)?.top, id).toBeCloseTo(wreckTop, 9);
    }
    const depot = M1B_HAND.targets.find(target => target.id === 'depot');
    if (!depot) throw new Error('the hand map has no depot');
    expect(targetRect(game, 'depot')?.top).toBeCloseTo(TARGET_SIZE[depot.kind].h * WRECK_SCALE_Y, 9);
  });

  test('a retry counts and reports where it began from', () => {
    const game = atCp1();
    expect(game.retries).toBe(0);
    const again = retryFromCheckpoint(game);
    expect(again.retries).toBe(1);
    expect(again.events).toEqual([{ kind: 'retried', from: 'cp1' }]);
  });

  test('the script is the one restoreCheckpoint gives', () => {
    const game = atCp1();
    playOn(game);
    expect(retryFromCheckpoint(game).script).toEqual(restoreCheckpoint(game.script));
  });

  test('going down twice goes back to the same place', () => {
    const game = atCp1();
    const mech = { x: game.mech.x, z: game.mech.z };
    const time = game.time;
    playOn(game);
    const first = retryFromCheckpoint(game);
    playOn(first);
    const second = retryFromCheckpoint(first);
    expect(second.retries).toBe(2);
    expect(second.mech.x).toBe(mech.x);
    expect(second.mech.z).toBe(mech.z);
    expect(second.time).toBe(time);
    expect(second.checkpoint?.id).toBe('cp1');
    expect(second.targets.find(t => t.id === 'depot')?.hp).toBeGreaterThan(0);
  });

  test('the game goes on after a retry, and so does the script', () => {
    const game = atCp1();
    playOn(game);
    const again = retryFromCheckpoint(game);
    const z = again.mech.z;
    const time = again.time;
    run(again, walk, 30);
    expect(again.mech.z).not.toBe(z);
    expect(again.time).toBeGreaterThan(time);
    // the leader's question is 10 s after cp1; the fortress gate waits for it (SB-1820)
    run(again, idle, 600);
    // the script goes on from the copy: the fortress gate takes cp2 and its objective
    sendToScript(again, { kind: 'enter', area: 'fortress-gate' });
    run(again, idle, 1);
    expect(again.script.fired['fortress-gate']).toBeDefined();
    expect(again.script.objective).toBe('stop-fortress-gun');
  });

  test('the checkpoint does not change with what the retried game does', () => {
    const game = atCp1();
    const before = structuredClone(game.checkpoint);
    const again = retryFromCheckpoint(game);
    playOn(again);
    again.enemies.push(...structuredClone(again.enemies));
    again.script.flags.push('x');
    again.rects.length = 0;
    again.propBoxes.length = 0;
    again.breakables.length = 0;
    run(again, walk, 30);
    expect(again.checkpoint).toBe(game.checkpoint);
    expect(game.checkpoint).toEqual(before);
    // and a second retry still gets the original
    const third = retryFromCheckpoint(again);
    expect(third.enemies).toEqual(before?.enemies);
    expect(third.rects).toEqual(before?.rects);
  });

  test('the mid boss’s health comes back from the checkpoint, at the head of its phase', () => {
    const game = newPlayGame(M1B_HAND);
    const warden = newEnemy('warden-1', 'warden', 'warden', 0, -118);
    if (!warden.warden) throw new Error('the warden has no state');
    warden.hp = 180;
    warden.warden.phase = 'charge';
    warden.warden.timer = 0.3;
    warden.warden.chargeLeft = 12;
    warden.warden.exposed = 0.4;
    warden.warden.mortarT = 4;
    warden.warden.called = true;
    game.enemies.push(warden);
    takeCp1(game);
    const copy = game.checkpoint;
    if (!copy) throw new Error('no checkpoint');
    const savedState = structuredClone(warden.warden);
    const saved = copy.enemies.find(enemy => enemy.id === 'warden-1');
    // the checkpoint keeps the state as it was, mid charge
    expect(saved).toMatchObject({ hp: 180, warden: savedState });

    // the game goes on, the warden takes a burst of the next phase, and a retry comes back at the copy
    const state = warden.warden;
    state.phase = 'burst';
    state.burstLeft = 2;
    state.timer = 0.1;
    warden.hp = 90;
    const again = retryFromCheckpoint(game);
    // the retry drops the shots in flight, so the charge under way restarts as a rest and a fresh choice
    expect(again.enemies.find(enemy => enemy.id === 'warden-1')).toMatchObject({
      hp: 180,
      warden: {
        phase: 'burst',
        burstLeft: 0,
        timer: WARDEN_TUNE.burstRest,
        chargeLeft: 0,
        exposed: 0,
        mortarT: WARDEN_TUNE.mortarEvery,
        called: true,
      },
    });
  });

  test('retrying without a checkpoint is refused', () => {
    expect(() => retryFromCheckpoint(newGame(M1B_HAND))).toThrow('no checkpoint');
  });

  test('cp3 keeps the assist and the cover mechs at their post, and a retry sends no yard wave twice', () => {
    const game = newPlayGame(M1B_HAND);
    sendToScript(game, { kind: 'enter', area: 'fortress-yard' });
    run(game, idle, 1);
    const assist = structuredClone(game.assist);
    sendToScript(game, { kind: 'wardenDown' });
    sendToScript(game, { kind: 'fortressDown' });
    // the blast's cutscene is passed over, so the assist's wait runs on as it did before the checkpoint
    sendToScript(game, { kind: 'skip' });
    const copy = game.checkpoint;
    if (!copy) throw new Error('no checkpoint');
    expect(copy.id).toBe('cp3');
    expect(copy.script.cutscene).toBeNull();
    expect(copy.script.fortressDown).toBe(true);
    expect(copy.script.flags).toContain('fortress-down');
    expect(copy.script.spawned).toContain('battery');
    expect(copy.battery.on).toBe(true);
    expect(copy.assist).toEqual(assist);
    expect(copy.assist).not.toBeNull();
    expect(copy.allies).toEqual(game.allies);
    // the yard’s first wave stands in the copy, and the script knows it went out
    expect(copy.enemies.filter(enemy => enemy.wave === 'yard-1')).toHaveLength(3);
    expect(copy.script.spawned).toContain('yard-1');

    // the assist’s wait runs on after the checkpoint, and the retry comes back with the copy’s
    run(game, idle, 60);
    expect(game.assist?.left).toBeLessThan(copy.assist?.left ?? 0);
    const again = retryFromCheckpoint(game);
    expect(again.assist).toEqual(copy.assist);
    expect(again.script.spawned).toEqual(copy.script.spawned);
    expect(again.enemies.filter(enemy => enemy.wave === 'yard-1')).toHaveLength(3);
    expect(again.enemies.map(enemy => enemy.id).sort()).toEqual(copy.enemies.map(enemy => enemy.id).sort());
  });
});

describe('restart', () => {
  test('a restart is a new game with only the retry count and the event different', () => {
    const game = atCp1();
    playOn(game);
    const again = restartGame(game);
    const fresh = newGame(M1B_HAND);
    expect(again.retries).toBe(1);
    expect(again.events).toEqual([{ kind: 'retried', from: null }]);
    expect({ ...again, retries: 0, events: [] }).toEqual(fresh);
    expect(again.checkpoint).toBeNull();
  });

  test('the retry count keeps growing across restarts', () => {
    expect(restartGame(restartGame(newGame(M1B_HAND))).retries).toBe(2);
  });
});
