// The guidance for the pillboxes (SB-2017): the first shot that lands says the front will not open and a charge is the
// way, the objective says "blow up", a pillar stands over every blast point, the radar marks the pillboxes' points, the
// use prompt comes up in reach, and the beach can be walked to all four pillbox points through the lines' holes.
import { expect, test } from 'vitest';
import { LANG } from '@engine/core/index.ts';
import { CHARGE_TUNE } from '../../src/data/charge.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import type { MapDef } from '../../src/data/types.ts';
import { HUD_TUNE, MECH_TUNE } from '../../src/data/tune.ts';
import { WEAPONS } from '../../src/data/weapons.ts';
import { openBreach } from '../../src/logic/blasts.ts';
import { newGame, step, type GameEvent, type GameInput, type GameModel } from '../../src/logic/game.ts';
import { hudModel } from '../../src/logic/hud.ts';
import '../../src/i18n/ja.ts';
import '../../src/i18n/en.ts';
import { newPlayGame } from './playGame.ts';

const DT = 1 / 60;
const ARRIVE = 0.6; // a waypoint counts as reached within this (m)
const PILLBOX_POINTS = ['blast-pillbox-1-side', 'blast-pillbox-1-back', 'blast-pillbox-2-side', 'blast-pillbox-2-back'];

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

// The hand map with no waves and no mines: these tests walk and shoot without another enemy or a mine deciding them.
function quietMap(map: MapDef = M1B_HAND): MapDef {
  return { ...map, spawns: {}, mines: [] };
}

// A ray from the chest through the middle of a target's box, as the camera's aim would give it.
function aimAt(game: GameModel, id: string): GameInput['aim'] {
  const target = game.targets.find(entry => entry.id === id);
  if (!target) throw new Error(`the game has no ${id}`);
  const chest = { x: game.mech.x, y: game.mech.y + MECH_TUNE.chestHeight, z: game.mech.z };
  const cx = (target.box.minX + target.box.maxX) / 2;
  const cy = (target.box.minY + target.box.maxY) / 2;
  const cz = (target.box.minZ + target.box.maxZ) / 2;
  const length = Math.hypot(cx - chest.x, cy - chest.y, cz - chest.z);
  return {
    ox: chest.x,
    oy: chest.y,
    oz: chest.z,
    dx: (cx - chest.x) / length,
    dy: (cy - chest.y) / length,
    dz: (cz - chest.z) / length,
  };
}

// Steps without the beach's mortar: the shots and the fuse are what these tests count.
function run(game: GameModel, input: GameInput, frames: number): GameEvent[] {
  const seen: GameEvent[] = [];
  for (let i = 0; i < frames; i++) {
    game.barrages = [];
    game.shells = [];
    step(game, input, DT);
    seen.push(...game.events);
  }
  return seen;
}

// Fires until a shot of the mech's lands on `id`, and returns the frames' events.
function hitTarget(game: GameModel, id: string, frames = 240): GameEvent[] {
  game.main.ammo = WEAPONS.autocannon.ammo;
  const seen: GameEvent[] = [];
  for (let i = 0; i < frames; i++) {
    const events = run(game, { ...idle, fire: true, aim: aimAt(game, id) }, 1);
    seen.push(...events);
    if (events.some(event => event.kind === 'hit' && event.target === id)) return seen;
  }
  throw new Error(`the mech's shots did not land on ${id}`);
}

// A mech in the open landward of line 2, its face to pillbox-1.
function pillboxGame(): GameModel {
  const game = newPlayGame(quietMap());
  game.mech.x = -33;
  game.mech.y = 0;
  game.mech.z = 5;
  game.mech.yaw = 0;
  game.mech.grounded = true;
  return game;
}

test('the first shot on a pillbox says once how to break it; a later hit says nothing', () => {
  const game = pillboxGame();
  expect(game.pillboxHint).toBe(false);

  const first = hitTarget(game, 'pillbox-1');
  expect(first.some(event => event.kind === 'hit' && event.target === 'pillbox-1')).toBe(true);
  expect(game.pillboxHint).toBe(true);
  // the pillbox remembers it was shot, which lets its points show their light (SB-2022)
  expect(game.pillboxes.find(entry => entry.id === 'pillbox-1')?.shot).toBe(true);
  expect(game.pillboxes.find(entry => entry.id === 'pillbox-2')?.shot).toBe(false);
  // the line comes up at the end of the same frame
  expect(game.radio?.line).toBe('m1.pillbox-charge');

  // let the line have its time on the band, then hit the pillbox again: no second line
  run(game, idle, Math.ceil(3.2 / DT));
  expect(game.radio).toBeNull();
  const second = hitTarget(game, 'pillbox-1');
  expect(second.some(event => event.kind === 'hit' && event.target === 'pillbox-1')).toBe(true);
  expect(game.radio).toBeNull();
  expect(game.radioQueue.filter(line => line.line === 'm1.pillbox-charge')).toHaveLength(0);
});

test('the guidance’s words are in both languages', () => {
  for (const key of ['m1.pillbox-charge', 'hud.plant']) {
    for (const code of ['ja', 'en']) expect(LANG[code].ui[key], `${code} is missing ${key}`).toBeTruthy();
  }
  expect(LANG.ja.ui['obj.break-pillboxes']).toContain('爆破');
});

test('the use prompt comes up at every pillbox point in reach and goes when the mech leaves', () => {
  const game = newGame(quietMap());
  for (const id of PILLBOX_POINTS) {
    const point = game.blasts.find(place => place.id === id);
    if (!point) throw new Error(`the map has no ${id}`);
    game.mech.x = point.x;
    game.mech.z = point.z + CHARGE_TUNE.reach - 1;
    expect(hudModel(game).use, id).not.toBeNull();
    game.mech.z = point.z + CHARGE_TUNE.reach + 1;
    expect(hudModel(game).use, id).toBeNull();
  }
});

// A pillbox with the two points of its own and a line point: the radar marks the pillbox's, not the line's.
function radarMap(): MapDef {
  return {
    id: 'pillbox-guide',
    bounds: { minX: -100, maxX: 100, minZ: -60, maxZ: 60 },
    props: [],
    targets: [{ id: 'pillbox-1', kind: 'pillbox', x: -33, z: -15, yaw: 0 }],
    spawns: {},
    blasts: [
      { id: 'blast-pillbox-1-side', line: null, x: -41, z: -15, target: 'pillbox-1' },
      { id: 'blast-pillbox-1-back', line: null, x: -33, z: -23, target: 'pillbox-1' },
      { id: 'l1-a', line: 137, x: -55, z: 146.5 },
    ],
  };
}

test('the radar marks the pillbox’s blast points, and leaves the line’s point off', () => {
  const game = newGame(radarMap());
  // before the pillbox is shot once, the small map shows none of its points (SB-2022)
  expect(hudModel(game).radar.filter(mark => mark.kind === 'blast')).toHaveLength(0);
  const state = game.pillboxes.find(entry => entry.id === 'pillbox-1');
  if (!state) throw new Error('the game has no pillbox-1 state');
  state.shot = true;
  const marks = hudModel(game).radar.filter(mark => mark.kind === 'blast');
  expect(marks).toHaveLength(2);

  // each one sits at its point's bearing and distance
  const range = HUD_TUNE.radarRange;
  for (const point of (game.map.blasts ?? []).filter(place => place.target === 'pillbox-1')) {
    const away = Math.hypot(point.x - game.mech.x, point.z - game.mech.z);
    expect(
      marks.some(mark => Math.abs(mark.dist * range - away) < 1e-6),
      point.id,
    ).toBe(true);
  }

  // a point whose pillbox is down is not marked
  const pillbox = game.targets.find(target => target.id === 'pillbox-1');
  if (!pillbox) throw new Error('the map has no pillbox-1');
  pillbox.hp = 0;
  expect(hudModel(game).radar.filter(mark => mark.kind === 'blast')).toHaveLength(0);
});

// Walks forward, facing the waypoint each frame, until the mech's middle is within ARRIVE of it.
function walkTo(game: GameModel, x: number, z: number): void {
  for (let i = 0; i < 1200; i++) {
    const dx = x - game.mech.x;
    const dz = z - game.mech.z;
    if (Math.hypot(dx, dz) < ARRIVE) return;
    game.mech.yaw = Math.atan2(-dx, -dz);
    step(game, { ...idle, moveZ: 1 }, DT);
  }
  throw new Error(`the mech did not reach (${x}, ${z}); it stands at (${game.mech.x}, ${game.mech.z})`);
}

test('from the beach the mech walks to all four pillbox points through the lines’ opened holes', () => {
  // The player blows one hole in each line on the way in: line 1 at x 40 and line 2 at its near point x -10.
  const map = openBreach(quietMap(), ['l1-b', 'l2-a']);
  const game = newPlayGame(map);
  game.mech.yaw = 0;
  // the beach, through line 1's hole at x 40 and line 2's near one at x -10
  walkTo(game, 42, 156);
  walkTo(game, 40, 135);
  walkTo(game, 40, 116);
  walkTo(game, -10, 116);
  walkTo(game, -10, 80);
  walkTo(game, -10, 58);
  walkTo(game, 0, 50);
  walkTo(game, 0, 10);
  // pillbox-1: its side point from the sea side, then round the back to the point behind it
  walkTo(game, -41, 6);
  walkTo(game, -41, -15);
  walkTo(game, -41, -23);
  walkTo(game, -33, -23);
  // pillbox-2: across behind both boxes, to the back point, then round its starboard side
  walkTo(game, -20, -23);
  walkTo(game, 10, -23);
  walkTo(game, 21, -23);
  walkTo(game, 30, -23);
  walkTo(game, 30, -17);
  expect(game.mech.y).toBe(0);
});
