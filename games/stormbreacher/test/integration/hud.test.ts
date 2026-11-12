import { expect, test } from 'vitest';
import { ENEMIES } from '../../src/data/enemies.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { HUD_TUNE, MECH_TUNE } from '../../src/data/tune.ts';
import type { TargetKind, TargetPlace } from '../../src/data/types.ts';
import { newGame, type GameModel, type TargetState } from '../../src/logic/game.ts';
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
  expect(hud.main).toEqual({ id: 'autocannon', ammo: 150, max: 200 });
  expect(hud.sub).toEqual({ id: 'heavyGun', ammo: 3, max: 8 });
  expect(hud.armor).toBe(1);
});

test('the objective counts only the pillboxes', () => {
  const game = newGame(M1B_HAND);
  expect(hudModel(game).objective).toEqual({ key: HUD_TUNE.objectiveKey, done: 0, total: 2 });

  targetAt(game, 'pillbox-1').hp = 0;
  expect(hudModel(game).objective.done).toBe(1);

  targetAt(game, 'depot').hp = 0;
  expect(hudModel(game).objective.done).toBe(1);

  targetAt(game, 'pillbox-2').hp = 0;
  expect(hudModel(game).objective.done).toBe(2);
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
