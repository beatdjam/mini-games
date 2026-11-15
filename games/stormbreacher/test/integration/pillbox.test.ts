// The pillboxes in a sortie: one behind cover does not warn or fire, one with a clear line warns and then fires a burst,
// and a cutscene holds it still.
import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { PILLBOX_TUNE } from '../../src/data/pillbox.ts';
import { TARGET_HP } from '../../src/data/props.ts';
import type { MapDef } from '../../src/data/types.ts';
import { isPillboxBullet, step, type GameEvent, type GameInput, type GameModel } from '../../src/logic/game.ts';
import { pillboxMuzzle } from '../../src/logic/pillbox.ts';
import { seed } from '../../src/logic/rng.ts';
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

// A pillbox at the origin's land side, and a block between it and the mech's first place: the mech starts behind it.
function field(): MapDef {
  return {
    ...M1B_HAND,
    props: [{ kind: 'block', x: 0, z: 10, yaw: 0, scale: 1 }],
    targets: [{ id: 'pillbox-1', kind: 'pillbox', x: 0, z: -15, yaw: 0 }],
    spawns: {},
    mines: [],
  };
}

function atMech(game: GameModel, x: number, z: number): void {
  game.mech.x = x;
  game.mech.z = z;
  game.mech.yaw = 0;
}

test('a pillbox behind cover is silent, and warns and fires a burst once the line is clear', () => {
  seed(3);
  const game = newPlayGame(field());
  atMech(game, 0, 20);

  // the block at z 10 stands between the muzzle and the mech: nothing is warned or fired
  let fired = false;
  for (let i = 0; i < 300; i++) {
    step(game, idle, DT);
    for (const event of game.events) expect(event.kind).not.toBe('pillboxWarn');
    if (game.bullets.some(isPillboxBullet)) fired = true;
  }
  expect(fired).toBe(false);

  // out from behind the block, the warning comes, from the pillbox's muzzle
  atMech(game, 30, 20);
  let warn: Extract<GameEvent, { kind: 'pillboxWarn' }> | null = null;
  let warnTime = 0;
  for (let i = 0; i < 600 && warn === null; i++) {
    step(game, idle, DT);
    for (const event of game.events) {
      if (event.kind === 'pillboxWarn') {
        warn = event;
        warnTime = game.time;
      }
    }
  }
  expect(warn).not.toBeNull();
  if (warn === null) return;
  const target = game.targets[0];
  const muzzle = pillboxMuzzle(target.box, target.yaw);
  expect(warn.target).toBe('pillbox-1');
  expect(warn.x).toBeCloseTo(muzzle.x);
  expect(warn.y).toBeCloseTo(muzzle.y);
  expect(warn.z).toBeCloseTo(muzzle.z);
  expect(warn.y).toBeCloseTo(target.box.maxY * PILLBOX_TUNE.muzzle);

  // the first shot of the burst follows the warning by PILLBOX_TUNE.warn
  let shotTime: number | null = null;
  for (let i = 0; i < 120 && shotTime === null; i++) {
    step(game, idle, DT);
    if (game.bullets.some(isPillboxBullet)) shotTime = game.time;
  }
  expect(shotTime).not.toBeNull();
  if (shotTime === null) return;
  expect(shotTime - warnTime).toBeCloseTo(PILLBOX_TUNE.warn, 1);
});

test('a shot takes no health but quiets the muzzle for the suppression’s seconds', () => {
  seed(5);
  const game = newPlayGame(field());
  atMech(game, 30, 20);
  const target = game.targets[0];
  const state = game.pillboxes[0];
  // let it start a warning, so the suppression also has to cut a warning short
  let warned = false;
  for (let i = 0; i < 240 && !warned; i++) {
    step(game, idle, DT);
    if (game.events.some(event => event.kind === 'pillboxWarn')) warned = true;
  }
  expect(warned).toBe(true);
  game.bullets = [];

  // a mech shot into the pillbox's side: the health stays whole and the muzzle is quiet
  game.bullets.push({
    weapon: 'autocannon',
    x: target.box.minX - 1,
    y: 2,
    z: (target.box.minZ + target.box.maxZ) / 2,
    dx: 1,
    dy: 0,
    dz: 0,
    left: 20,
  });
  step(game, idle, DT);
  expect(target.hp).toBe(TARGET_HP.pillbox);
  expect(state.suppress).toBeGreaterThan(PILLBOX_TUNE.suppressSec - DT * 2);
  expect(state.warn).toBe(0);
  game.bullets = [];

  // it neither warns nor fires while it is held quiet
  const quietFrames = Math.ceil(PILLBOX_TUNE.suppressSec / DT) - 4;
  for (let i = 0; i < quietFrames; i++) {
    step(game, idle, DT);
    expect(game.events.some(event => event.kind === 'pillboxWarn')).toBe(false);
    expect(game.bullets.some(isPillboxBullet)).toBe(false);
  }
  // the quiet runs out, the wait passes and the warning comes again
  let again = false;
  for (let i = 0; i < (PILLBOX_TUNE.interval + PILLBOX_TUNE.warn + 1) / DT && !again; i++) {
    step(game, idle, DT);
    again = game.events.some(event => event.kind === 'pillboxWarn');
  }
  expect(again).toBe(true);
});

test('a cutscene holds a pillbox still: it neither counts down nor warns', () => {
  seed(4);
  const game = newPlayGame(field());
  atMech(game, 30, 20);
  game.script.cutscene = { id: 'landing', left: 10 };
  for (let i = 0; i < 300; i++) {
    step(game, idle, DT);
    for (const event of game.events) expect(event.kind).not.toBe('pillboxWarn');
    expect(game.bullets.some(isPillboxBullet)).toBe(false);
  }
  expect(game.pillboxes[0].wait).toBe(PILLBOX_TUNE.firstWait);
});
