import { expect, test } from 'vitest';
import { ENEMIES } from '../../src/data/enemies.ts';
import { CHARGE_TUNE } from '../../src/data/charge.ts';
import { AIMED_MORTAR } from '../../src/data/hazards.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { RADIO_MIN_SEC } from '../../src/data/script.ts';
import { HUD_TUNE, MECH_TUNE, PLAY_TUNE } from '../../src/data/tune.ts';
import type { TargetKind, TargetPlace } from '../../src/data/types.ts';
import { WEAPONS } from '../../src/data/weapons.ts';
import { newGame, sendToScript, step, type GameInput, type GameModel, type TargetState } from '../../src/logic/game.ts';
import { newEnemy } from '../../src/logic/enemies.ts';
import { hudModel } from '../../src/logic/hud.ts';

// A target at `deg` from the mech's front (+ to the right) and `dist` metres away, with the mech at the origin facing -z.
function atAngle(id: string, kind: TargetKind, deg: number, dist: number): TargetPlace {
  const rad = (deg * Math.PI) / 180;
  return { id, kind, x: Math.sin(rad) * dist, z: -Math.cos(rad) * dist, yaw: 0 };
}

function targetAt(game: GameModel, id: string): TargetState {
  const target = game.targets.find(placed => placed.id === id);
  if (!target) throw new Error(`the map has ${id}`);
  return target;
}

// Puts the mech at the origin, facing the land.
function atOrigin(game: GameModel): void {
  game.mech.x = 0;
  game.mech.z = 0;
  game.mech.yaw = 0;
}

test('the boost and the ammo follow the game', () => {
  const game = newGame(M1B_HAND);
  game.mech.gauge = 0.4;
  game.main.ammo = 150;
  game.sub.ammo = 3;

  const hud = hudModel(game);
  expect(hud.boost).toBe(0.4);
  expect(hud.main).toEqual({ id: 'autocannon', ammo: 150, max: WEAPONS.autocannon.ammo });
  expect(hud.sub).toEqual({ id: 'heavyGun', ammo: 3, max: WEAPONS.heavyGun.ammo });
  expect(hud.armor).toBe(1);
});

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

// M1B_HAND with the battery's two main guns added, so the silence-battery objective has something to count.
// M1's B with both main guns: the hand map has them behind the seawall (SB-120); the check keeps that true.
function withGuns(): GameModel {
  const guns = M1B_HAND.targets.filter(target => target.kind === 'gun');
  expect(guns.map(target => target.id).sort()).toEqual(['main-gun-1', 'main-gun-2']);
  return newGame(M1B_HAND);
}

// M1's B with the battery's guns taken off, for an objective that counts targets the map does not have.
function withoutGuns(): GameModel {
  return newGame({ ...M1B_HAND, targets: M1B_HAND.targets.filter(target => target.kind !== 'gun') });
}

test('the objective follows the script', () => {
  const game = newGame(M1B_HAND);
  expect(hudModel(game).objective).toBeNull();

  step(game, idle, 1 / 60);
  expect(hudModel(game).objective?.key).toBe('obj.reach-pillboxes');

  sendToScript(game, { kind: 'enter', area: 'b-line' });
  expect(hudModel(game).objective?.key).toBe('obj.break-pillboxes');
});

test('a counted objective shows done and total', () => {
  const game = newGame(M1B_HAND);
  step(game, idle, 1 / 60);
  sendToScript(game, { kind: 'enter', area: 'b-line' });
  expect(hudModel(game).objective).toEqual({ key: 'obj.break-pillboxes', count: { done: 0, total: 2 } });

  targetAt(game, 'pillbox-1').hp = 0;
  expect(hudModel(game).objective?.count).toEqual({ done: 1, total: 2 });

  targetAt(game, 'depot').hp = 0;
  expect(hudModel(game).objective?.count).toEqual({ done: 1, total: 2 });

  targetAt(game, 'pillbox-2').hp = 0;
  expect(hudModel(game).objective?.count).toEqual({ done: 2, total: 2 });
});

test('the battery objective counts the main guns', () => {
  const game = withGuns();
  game.script.objective = 'silence-battery';
  expect(hudModel(game).objective).toEqual({ key: 'obj.silence-battery', count: { done: 0, total: 2 } });
  targetAt(game, 'main-gun-2').hp = 0;
  expect(hudModel(game).objective?.count).toEqual({ done: 1, total: 2 });
});

test('a counted objective leaves out the targets the map does not have', () => {
  const game = withoutGuns();
  game.script.objective = 'silence-battery';
  expect(hudModel(game).objective).toEqual({ key: 'obj.silence-battery', count: null });
});

test('an objective that is not counted shows no count', () => {
  const game = newGame(M1B_HAND);
  step(game, idle, 1 / 60);
  expect(hudModel(game).objective).toEqual({ key: 'obj.reach-pillboxes', count: null });
  game.script.objective = 'hit-magazine';
  expect(hudModel(game).objective).toEqual({ key: 'obj.hit-magazine', count: null });
});

test('the radio line stays for RADIO_MIN_SEC', () => {
  const game = newGame(M1B_HAND);
  step(game, idle, 1 / 60);
  expect(hudModel(game).radio).toBeNull();

  sendToScript(game, { kind: 'enter', area: 'b-line' });
  expect(game.radio?.line).toBe('m1.depot-hint');
  expect(hudModel(game).radio).toBe('m1.depot-hint');

  game.time += RADIO_MIN_SEC - 0.1;
  expect(hudModel(game).radio).toBe('m1.depot-hint');
  game.time += 0.2;
  expect(hudModel(game).radio).toBeNull();
});

test('the lock box is the box of the target or enemy the aim is pulled toward', () => {
  const game = newGame({ ...M1B_HAND, targets: [{ id: 'near', kind: 'pillbox', x: 0, z: -50, yaw: 0 }] });
  atOrigin(game);
  expect(hudModel(game).lock).toBeNull();

  game.aimTarget = 'near';
  expect(hudModel(game).lock).toBe(targetAt(game, 'near').box);

  targetAt(game, 'near').hp = 0;
  expect(hudModel(game).lock).toBeNull();

  const grunt = newEnemy('w-1', 'w', 'grunt', 5, -30);
  game.enemies.push(grunt);
  game.aimTarget = 'w-1';
  const box = hudModel(game).lock;
  expect(box).not.toBeNull();
  expect(box?.maxY).toBe(ENEMIES.grunt.height);
  expect((box?.minX ?? 0) + (box?.maxX ?? 0)).toBeCloseTo(10, 6);
});

test('the enemy is the living target the aim is pulled toward', () => {
  const targets: TargetPlace[] = [
    { id: 'near', kind: 'pillbox', x: 0, z: -50, yaw: 0 },
    { id: 'far', kind: 'depot', x: 0, z: -100, yaw: 0 },
  ];
  const game = newGame({ ...M1B_HAND, targets });
  atOrigin(game);

  game.aimTarget = 'near';
  expect(hudModel(game).enemy).toEqual({ kind: 'pillbox', ratio: 1 });

  targetAt(game, 'near').hp = 50;
  expect(hudModel(game).enemy).toEqual({ kind: 'pillbox', ratio: 0.5 });

  game.aimTarget = 'far';
  expect(hudModel(game).enemy).toEqual({ kind: 'depot', ratio: 1 });

  targetAt(game, 'far').hp = 0;
  expect(hudModel(game).enemy).toBeNull();
});

test('with no aim target there is no enemy', () => {
  const game = newGame({ ...M1B_HAND, targets: [atAngle('inside', 'pillbox', 0, 100)] });
  atOrigin(game);
  expect(game.aimTarget).toBeNull();
  expect(hudModel(game).enemy).toBeNull();

  game.aimTarget = 'inside';
  expect(hudModel(game).enemy).toEqual({ kind: 'pillbox', ratio: 1 });
});

test('the radar turns with the mech', () => {
  const game = newGame({ ...M1B_HAND, targets: [{ id: 'ahead', kind: 'pillbox', x: 0, z: -100, yaw: 0 }] });
  atOrigin(game);

  let radar = hudModel(game).radar;
  expect(radar).toHaveLength(1);
  expect(radar[0].angle).toBeCloseTo(0, 6);
  expect(radar[0].dist).toBeCloseTo(100 / HUD_TUNE.radarRange, 6);

  game.mech.yaw = Math.PI / 2;
  radar = hudModel(game).radar;
  expect(radar[0].angle).toBeCloseTo(90, 6);

  const side = newGame({ ...M1B_HAND, targets: [{ id: 'side', kind: 'pillbox', x: 50, z: 0, yaw: 0 }] });
  atOrigin(side);
  expect(hudModel(side).radar[0].angle).toBeCloseTo(90, 6);
});

test('the radar leaves out dead and far targets', () => {
  const targets: TargetPlace[] = [
    { id: 'near', kind: 'pillbox', x: 0, z: -50, yaw: 0 },
    { id: 'dead', kind: 'depot', x: 10, z: -50, yaw: 0 },
    { id: 'far', kind: 'gun', x: 0, z: -(HUD_TUNE.radarRange + 50), yaw: 0 },
  ];
  const game = newGame({ ...M1B_HAND, targets });
  atOrigin(game);
  targetAt(game, 'dead').hp = 0;

  const radar = hudModel(game).radar;
  expect(radar).toHaveLength(1);
  expect(radar[0].kind).toBe('pillbox');
  expect(radar[0].angle).toBeCloseTo(0, 6);
  expect(radar[0].dist).toBeCloseTo(50 / HUD_TUNE.radarRange, 6);
});

test('the armour follows the mech’s armour left', () => {
  const game = newGame(M1B_HAND);
  expect(hudModel(game).armor).toBe(1);
  game.armor = MECH_TUNE.armor / 4;
  expect(hudModel(game).armor).toBe(0.25);
  game.armor = 0;
  expect(hudModel(game).armor).toBe(0);
});

test('the enemy is an enemy the aim is pulled toward, with its health', () => {
  const game = newGame({ ...M1B_HAND, targets: [] });
  atOrigin(game);
  const grunt = newEnemy('w-1', 'w', 'grunt', 0, -50);
  game.enemies.push(grunt);
  game.aimTarget = 'w-1';
  expect(hudModel(game).enemy).toEqual({ kind: 'grunt', ratio: 1 });

  grunt.hp = ENEMIES.grunt.hp / 4;
  expect(hudModel(game).enemy).toEqual({ kind: 'grunt', ratio: 0.25 });

  grunt.hp = 0;
  expect(hudModel(game).enemy).toBeNull();
});

test('the radar shows the living enemies and leaves out the fallen and the far', () => {
  const game = newGame({ ...M1B_HAND, targets: [] });
  atOrigin(game);
  game.enemies.push(
    newEnemy('ahead', 'w', 'grunt', 0, -50),
    newEnemy('fallen', 'w', 'grunt', 10, -50),
    newEnemy('far', 'w', 'grunt', 0, -(HUD_TUNE.radarRange + 50)),
  );
  game.enemies[1].hp = 0;
  const radar = hudModel(game).radar;
  expect(radar).toHaveLength(1);
  expect(radar[0].kind).toBe('grunt');
  expect(radar[0].angle).toBeCloseTo(0, 6);
  expect(radar[0].dist).toBeCloseTo(50 / HUD_TUNE.radarRange, 6);
});

test('the use prompt comes up near a blast point and follows the hold', () => {
  const game = newGame(M1B_HAND);
  const blast = game.blasts.find(place => place.id === 'l1-b');
  if (!blast) throw new Error('the map has no l1-b');
  game.mech.x = blast.x;
  game.mech.z = blast.z + 2;
  expect(hudModel(game).use).toEqual({ key: 'hud.use', progress: 0 });

  game.plant = { blast: blast.id, hold: CHARGE_TUNE.holdSec / 2 };
  expect(hudModel(game).use?.progress).toBeCloseTo(0.5, 6);

  game.mech.z = blast.z + CHARGE_TUNE.reach + 1;
  expect(hudModel(game).use).toBeNull();
});

test('a planted charge shows its fuse left and full length', () => {
  const game = newGame(M1B_HAND);
  const blast = game.blasts.find(place => place.id === 'l1-b');
  if (!blast) throw new Error('the map has no l1-b');
  game.mech.x = blast.x;
  game.mech.z = blast.z + 2;
  game.charges.push({ blast: blast.id, left: CHARGE_TUNE.fuse / 2 });
  expect(hudModel(game).charge).toEqual({ left: CHARGE_TUNE.fuse / 2, total: CHARGE_TUNE.fuse });
});

test('a warned aimed shell inside its circle shows the shell warning', () => {
  const game = newGame(M1B_HAND);
  // the mech's start, clear of the map's props
  game.mech.x = 0;
  game.mech.z = M1B_HAND.bounds.maxZ - PLAY_TUNE.startMargin;
  game.mech.yaw = 0;
  // one step short of a full stay, so the next frame's warning lands on the mech
  game.aimed = { anchor: { x: game.mech.x, z: game.mech.z }, still: AIMED_MORTAR.stillSec - 0.1 };
  step(game, idle, 0.2);
  expect(game.shells).toHaveLength(1);
  expect(hudModel(game).warning).toBe('shell');
  game.mech.x = AIMED_MORTAR.radius + 1;
  expect(hudModel(game).warning).toBeNull();
});
