// A charge on a pillbox's blast point breaks the pillbox (SB-1540): holding use on the point beside the box plants it,
// the fuse burns, and the blast takes the pillbox down through the same damage path a shot uses, so the script hears the
// `destroyed` on the same frame. A point whose pillbox is already down cannot be planted on.
import { describe, expect, test } from 'vitest';
import { CHARGE_TUNE } from '../../src/data/charge.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { PILLBOX_BLAST } from '../../src/data/pillbox.ts';
import type { MapDef } from '../../src/data/types.ts';
import { nearBlast } from '../../src/logic/blasts.ts';
import { step, type GameEvent, type GameInput, type GameModel } from '../../src/logic/game.ts';
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
const use: GameInput = { ...idle, use: true };

// One pillbox and the point beside it: the hand map's pillbox-1 and its side point, with no props or waves in the way.
const MAP: MapDef = {
  id: 'pillbox-blast',
  bounds: { minX: -60, maxX: 40, minZ: -60, maxZ: 20 },
  props: [],
  targets: [{ id: 'pillbox-1', kind: 'pillbox', x: -33, z: -15, yaw: 0 }],
  spawns: {},
  blasts: [{ id: 'blast-pillbox-1-side', line: null, x: -41, z: -15, target: 'pillbox-1' }],
};

// Stands the mech 2 m sea-side of the point, inside CHARGE_TUNE.reach and on the ground.
function atThePoint(): GameModel {
  const game = newPlayGame(MAP);
  game.mech.x = -41;
  game.mech.z = -13;
  game.mech.y = 0;
  game.mech.grounded = true;
  return game;
}

function runUntil(game: GameModel, input: GameInput, frames: number, done: () => boolean): GameEvent[] {
  const seen: GameEvent[] = [];
  for (let i = 0; i < frames; i++) {
    step(game, input, DT);
    seen.push(...game.events);
    if (done()) return seen;
  }
  throw new Error(`the game did not reach the state in ${frames} frames`);
}

describe('a charge on a pillbox’s point', () => {
  test('breaks the pillbox, reports it once and tells the script on the same frame', () => {
    const game = atThePoint();
    expect(game.targets[0].hp).toBeGreaterThan(0);

    const planted = runUntil(game, use, 200, () => game.events.some(event => event.kind === 'planted'));
    expect(planted.find(event => event.kind === 'planted')).toEqual({
      kind: 'planted',
      id: 'blast-pillbox-1-side',
      x: -41,
      z: -15,
    });
    expect(game.charges).toHaveLength(1);

    const seen = runUntil(game, idle, Math.ceil((CHARGE_TUNE.fuse + 0.5) / DT), () =>
      game.events.some(event => event.kind === 'blast'),
    );
    expect(game.charges).toEqual([]);
    expect(game.targets[0].hp).toBe(0);
    expect(game.events.filter(event => event.kind === 'destroyed')).toEqual([{ kind: 'destroyed', id: 'pillbox-1' }]);
    // the blast and the destroyed it caused are the same frame's, in that order
    const blastAt = seen.findIndex(event => event.kind === 'blast');
    expect(seen[blastAt]).toMatchObject({ kind: 'blast', id: 'blast-pillbox-1-side' });
    expect(seen[blastAt + 1]).toEqual({ kind: 'destroyed', id: 'pillbox-1' });
    expect(seen.filter(event => event.kind === 'blast')).toHaveLength(1);
    expect(game.script.destroyed).toContain('pillbox-1');
    // one charge is more than the pillbox's health (TARGET_HP.pillbox 100), so the armour's shares do not matter
    expect(PILLBOX_BLAST.damage).toBeGreaterThan(100);
  });

  test('a point whose pillbox is already down is not offered to plant on', () => {
    const game = atThePoint();
    expect(nearBlast(game.blasts, game.charges, game.mech, game)?.id).toBe('blast-pillbox-1-side');
    game.targets[0].hp = 0;
    expect(nearBlast(game.blasts, game.charges, game.mech, game)).toBeNull();
  });
});

// The test map holds the same names as the hand map's point, so a chip of the real data cannot drift unnoticed.
test('the hand map names the side point the same way', () => {
  const point = (M1B_HAND.blasts ?? []).find(place => place.id === 'blast-pillbox-1-side');
  expect(point).toMatchObject({ line: null, x: -41, z: -15, target: 'pillbox-1' });
});
