import { expect, test } from 'vitest';
import { ENEMIES } from '../../src/data/enemies.ts';
import { CHARGE_TUNE } from '../../src/data/charge.ts';
import { AIMED_MORTAR } from '../../src/data/hazards.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { CALLOUT_TUNE, RADIO_TUNE, CUTSCENE_SEC } from '../../src/data/script.ts';
import { HUD_TUNE, MECH_TUNE } from '../../src/data/tune.ts';
import type { TargetKind, TargetPlace } from '../../src/data/types.ts';
import { WEAPONS } from '../../src/data/weapons.ts';
import {
  newGame,
  queueRadio,
  sendToScript,
  step,
  stepRadio,
  type GameInput,
  type GameModel,
  type TargetState,
} from '../../src/logic/game.ts';
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
// M1's B with both main guns: the hand map has them past the fortress (SB-120); the check keeps that true.
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

test('the fortress-gun objective counts the one nest on the sea wall', () => {
  const game = newGame(M1B_HAND);
  game.script.objective = 'stop-fortress-gun';
  expect(hudModel(game).objective).toEqual({ key: 'obj.stop-fortress-gun', count: { done: 0, total: 1 } });
  targetAt(game, 'fortress-gun').hp = 0;
  expect(hudModel(game).objective?.count).toEqual({ done: 1, total: 1 });
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

test('two radio lines come up in turn, each for RADIO_TUNE.minSec', () => {
  const game = newGame(M1B_HAND);
  step(game, idle, 1 / 60);
  sendToScript(game, { kind: 'skip' }); // the opening cutscene hides the HUD, and no line comes up behind it
  expect(hudModel(game).radio).toBeNull();

  // the same frame brings two lines: the b-line's radio and one queued behind it
  sendToScript(game, { kind: 'enter', area: 'b-line' });
  queueRadio(game, 'm1.pillboxes-down');
  step(game, idle, 1 / 60);
  expect(game.radio?.line).toBe('m1.depot-hint');
  expect(hudModel(game).radio).toBe('m1.depot-hint');

  game.time += RADIO_TUNE.minSec - 0.1;
  stepRadio(game, 1 / 60);
  expect(hudModel(game).radio).toBe('m1.depot-hint');
  game.time += 0.1;
  stepRadio(game, 1 / 60);
  expect(game.radio?.line).toBe('m1.pillboxes-down');
  expect(hudModel(game).radio).toBe('m1.pillboxes-down');

  game.time += RADIO_TUNE.minSec;
  stepRadio(game, 1 / 60);
  expect(game.radio).toBeNull();
  expect(hudModel(game).radio).toBeNull();
});

test('the radio queue does not move while a cutscene hides the HUD', () => {
  const game = newGame(M1B_HAND);
  step(game, idle, 1 / 60);
  sendToScript(game, { kind: 'skip' });
  // the wave 2 line is on screen as its cutscene starts, and the bars hide the HUD for the whole cutscene; a second line waits
  game.radio = { line: 'm1.wave2-lost', time: game.time };
  game.radioQueue = [{ line: 'm1.pillboxes-down' }];
  game.script.cutscene = { id: 'wave2-sinks', left: CUTSCENE_SEC['wave2-sinks'] };
  // the cutscene is longer than RADIO_TUNE.minSec, so the queue would move on if the clock ran while it plays
  expect(CUTSCENE_SEC['wave2-sinks']).toBeGreaterThan(RADIO_TUNE.minSec);
  const age = game.time - game.radio.time;
  for (let i = 0; i < 500 && game.script.cutscene !== null; i++) {
    step(game, idle, 1 / 60);
    if (game.script.cutscene !== null) {
      expect(game.radio?.line).toBe('m1.wave2-lost');
      expect(game.radioQueue.some(entry => entry.line === 'm1.pillboxes-down')).toBe(true);
    }
  }
  expect(game.script.cutscene).toBeNull();
  // the line has aged by at most the frame the cutscene ended in
  expect(game.time - (game.radio?.time ?? 0) - age).toBeLessThan(2 / 60);
  expect(hudModel(game).radio).toBe('m1.wave2-lost');
  expect(game.radioQueue.some(entry => entry.line === 'm1.pillboxes-down')).toBe(true);

  // the line then gets its full RADIO_TUNE.minSec once the HUD is back, and the next one comes up after it
  for (let i = 0; i < 150; i++) step(game, idle, 1 / 60); // 2.5 s
  expect(hudModel(game).radio).toBe('m1.wave2-lost');
  for (let i = 0; i < 60; i++) step(game, idle, 1 / 60); // 1 s more (3.5 s)
  expect(hudModel(game).radio).not.toBe('m1.wave2-lost');
});

test('the lock box is the box of the target or enemy the aim is pulled toward', () => {
  const game = newGame({ ...M1B_HAND, targets: [{ id: 'near', kind: 'depot', x: 0, z: -50, yaw: 0 }] });
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

  // a pillbox only a charge breaks has no bar, even if it were named (SB-2043)
  game.aimTarget = 'near';
  expect(hudModel(game).enemy).toBeNull();
  expect(hudModel(game).lock).toBeNull();

  game.aimTarget = 'far';
  expect(hudModel(game).enemy).toEqual({ kind: 'depot', ratio: 1 });

  targetAt(game, 'far').hp = 0;
  expect(hudModel(game).enemy).toBeNull();
});

test('with no aim target there is no enemy', () => {
  const game = newGame({ ...M1B_HAND, targets: [atAngle('inside', 'depot', 0, 100)] });
  atOrigin(game);
  expect(game.aimTarget).toBeNull();
  expect(hudModel(game).enemy).toBeNull();

  game.aimTarget = 'inside';
  expect(hudModel(game).enemy).toEqual({ kind: 'depot', ratio: 1 });
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

test('the optional depot mark comes after the question and goes when the depot is down', () => {
  const game = newGame(M1B_HAND);
  atOrigin(game);
  expect(hudModel(game).optional).toBeNull();

  // the leader has asked: the side goal shows, with the distance on the ground
  game.script.fired['depot-ask'] = 0;
  const depot = targetAt(game, 'depot');
  const cx = (depot.box.minX + depot.box.maxX) / 2;
  const cz = (depot.box.minZ + depot.box.maxZ) / 2;
  const shown = hudModel(game).optional;
  expect(shown).toEqual({ key: 'hud.optional.depot', distance: Math.hypot(cx, cz) });
  game.mech.x = cx;
  game.mech.z = cz + 30;
  expect(hudModel(game).optional?.distance).toBeCloseTo(30, 6);

  // broken, or out of the way: no mark
  game.script.flags.push('depot-down');
  expect(hudModel(game).optional).toBeNull();
  game.script.flags = game.script.flags.filter(flag => flag !== 'depot-down');
  depot.hp = 0;
  expect(hudModel(game).optional).toBeNull();
});

test('the radar keeps the depot’s own mark', () => {
  const game = newGame(M1B_HAND);
  atOrigin(game);
  const radar = hudModel(game).radar.filter(mark => mark.kind === 'depot');
  expect(radar).toHaveLength(1);
  expect(radar[0].dist).toBeGreaterThan(0);
});

test('a warned aimed shell inside its circle shows the shell warning', () => {
  const game = newGame(M1B_HAND);
  // the mech's old start on the sand, clear of the map's props and off the craft, which holds the barrage
  game.mech.x = 0;
  game.mech.y = 0;
  game.mech.z = 166;
  game.mech.yaw = 0;
  // one step short of a full stay, so the next frame's warning lands on the mech
  game.aimed = { anchor: { x: game.mech.x, z: game.mech.z }, still: AIMED_MORTAR.stillSec - 0.1 };
  step(game, idle, 0.2);
  expect(game.shells).toHaveLength(1);
  expect(hudModel(game).warning).toBe('shell');
  game.mech.x = AIMED_MORTAR.radius + 1;
  expect(hudModel(game).warning).toBeNull();
});

test('a radio line with a callout puts the short order near the aim for CALLOUT_TUNE.sec (SB-2028)', () => {
  const game = newGame(M1B_HAND);
  step(game, idle, 1 / 60);
  sendToScript(game, { kind: 'skip' });
  expect(hudModel(game).callout).toBeNull();

  // the script's own line: line 2's approach says "now" and carries its order
  sendToScript(game, { kind: 'enter', area: 'line2-approach' });
  step(game, idle, 1 / 60);
  expect(game.radio?.line).toBe('m1.line2-support');
  expect(hudModel(game).callout).toBe('m1.callout.line2-support');
  expect(hudModel(game).radio).toBe('m1.line2-support');

  game.time += CALLOUT_TUNE.sec - 0.1;
  expect(hudModel(game).callout).toBe('m1.callout.line2-support');
  game.time += 0.2;
  expect(hudModel(game).callout).toBeNull();
  // the radio band still holds the line after the order has gone
  expect(hudModel(game).radio).toBe('m1.line2-support');
});

test('a radio line without a callout shows no order, and the order follows its own line in the queue', () => {
  const game = newGame(M1B_HAND);
  step(game, idle, 1 / 60);
  sendToScript(game, { kind: 'skip' });
  queueRadio(game, 'm1.depot-hint');
  queueRadio(game, 'm1.line2-hold', 0, 'm1.callout.line2-hold');
  stepRadio(game, 1 / 60);
  expect(hudModel(game).callout).toBeNull();
  game.time += RADIO_TUNE.minSec;
  stepRadio(game, 1 / 60);
  expect(game.radio?.line).toBe('m1.line2-hold');
  expect(hudModel(game).callout).toBe('m1.callout.line2-hold');
});

test('the shell warning takes the place of the callout while it shows (SB-2028)', () => {
  const game = newGame(M1B_HAND);
  game.mech.x = 0;
  game.mech.y = 0;
  game.mech.z = 166;
  game.mech.yaw = 0;
  game.aimed = { anchor: { x: game.mech.x, z: game.mech.z }, still: AIMED_MORTAR.stillSec - 0.1 };
  step(game, idle, 0.2);
  game.radio = { line: 'm1.line2-hold', time: game.time, callout: 'm1.callout.line2-hold' };
  expect(hudModel(game).warning).toBe('shell');
  expect(hudModel(game).callout).toBeNull();
  // out of the circle, the order comes back for the rest of its seconds
  game.mech.x = AIMED_MORTAR.radius + 1;
  expect(hudModel(game).warning).toBeNull();
  expect(hudModel(game).callout).toBe('m1.callout.line2-hold');
});
