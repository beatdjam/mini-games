// A shot at a grunt 3, 5, 8 and 12 m ahead (SB-1910): where the reticle's point is, whether the line from the muzzle to
// it is clear, how far the soft lock pulls from that line, and how many of 20 shots hit. The grunt stands on the
// camera's line, so the reticle is on its chest. A second run circles the grunt while keeping the reticle on it.
import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { CAMERA_TUNE, FCS_TUNE, MECH_TUNE } from '../../src/data/tune.ts';
import { newEnemy } from '../../src/logic/enemies.ts';
import { fireRayHit } from '../../src/logic/fire.ts';
import { enemyBox, step, type GameModel } from '../../src/logic/game.ts';
import { seed } from '../../src/logic/rng.ts';
import { aimRay, cameraPose, stateOfPose } from '../../src/view/camera.ts';
import { newPlayGame } from './playGame.ts';

const DT = 1 / 60;
const DEG = Math.PI / 180;
const MECH_Z = 100; // the mech faces -z (m)
const SHOTS = 20;
const ENEMY = 'close-1';
const ORBIT_RATE = Math.PI / 4; // the mech turns this fast while the player keeps the reticle on the grunt (rad/s)
const WANT_HIT = 18; // the shots that must hit of 20 (90%)

const idle = { moveX: 0, moveZ: 0, turn: 0, jump: false, jumpHeld: false, boost: false, fire: false, sub: false };

// The middle of the screen the open camera draws, for a mech standing as it is.
function openAim(game: GameModel, pitch: number) {
  const { x, y, z, yaw } = game.mech;
  return aimRay(stateOfPose(cameraPose({ x, y, z, yaw }, pitch, CAMERA_TUNE, [])));
}

// The pitch that puts the camera's line through `point` (rad). The line rises with the pitch.
function pitchTo(game: GameModel, point: { x: number; y: number; z: number }): number {
  const at = (pitch: number): number => {
    const aim = openAim(game, pitch);
    const t = ((point.x - aim.ox) * aim.dx + (point.z - aim.oz) * aim.dz) / (aim.dx * aim.dx + aim.dz * aim.dz);
    return aim.oy + aim.dy * t;
  };
  let lo = CAMERA_TUNE.pitchMin;
  let hi = CAMERA_TUNE.pitchMax;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) < point.y) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

interface Measure {
  dist: number;
  hit: number; // shots that hit the grunt out of SHOTS
  aimY: number; // the reticle point's height (m)
  aimAt: number; // how far the reticle point is from the muzzle (m)
  clear: boolean; // the line from the muzzle to the reticle point meets nothing before it
  pullDeg: number; // the angle between the muzzle-to-aim-point line and the muzzle-to-centre line (deg)
}

function measure(dist: number): Measure {
  seed(11);
  const game = newPlayGame({ ...M1B_HAND, props: [], targets: [], mines: [] });
  game.mech.x = 0;
  game.mech.z = MECH_Z;
  game.mech.yaw = 0;
  const targetZ = MECH_Z - dist;
  const targetX = CAMERA_TUNE.shoulder; // the camera's line is this far right of the mech
  game.enemies.push(newEnemy(ENEMY, 'test', 'grunt', targetX, targetZ, 0));
  const enemy = game.enemies.find(placed => placed.id === ENEMY);
  if (!enemy) throw new Error('the grunt is placed');
  const box = enemyBox(enemy);
  const cy = (box.minY + box.maxY) / 2;
  const aim = openAim(game, pitchTo(game, { x: targetX, y: cy, z: targetZ }));

  // The reticle's point: where the camera's line first meets the grunt, counted past the muzzle (manualDir's rule).
  const raw = { dx: aim.dx, dy: aim.dy, dz: aim.dz };
  const length = Math.hypot(raw.dx, raw.dy, raw.dz);
  const dir = { dx: raw.dx / length, dy: raw.dy / length, dz: raw.dz / length };
  const mx = MECH_TUNE.muzzleSide;
  const my = MECH_TUNE.chestHeight;
  const mz = MECH_Z - MECH_TUNE.muzzleForward;
  const start = Math.max(0, (mx - aim.ox) * dir.dx + (my - aim.oy) * dir.dy + (mz - aim.oz) * dir.dz);
  const hit = fireRayHit(
    aim.ox + dir.dx * start,
    aim.oy + dir.dy * start,
    aim.oz + dir.dz * start,
    dir.dx,
    dir.dy,
    dir.dz,
    FCS_TUNE.soft.range - start,
    [box],
  );
  const reach = start + (hit?.dist ?? 0);
  const aimPoint = {
    x: aim.ox + dir.dx * reach,
    y: aim.oy + dir.dy * reach,
    z: aim.oz + dir.dz * reach,
  };
  const toAim = { x: aimPoint.x - mx, y: aimPoint.y - my, z: aimPoint.z - mz };
  const toCentre = { x: targetX - mx, y: cy - my, z: targetZ - mz };
  const dot = toAim.x * toCentre.x + toAim.y * toCentre.y + toAim.z * toCentre.z;
  const angle = Math.acos(
    dot / (Math.hypot(toAim.x, toAim.y, toAim.z) * Math.hypot(toCentre.x, toCentre.y, toCentre.z)),
  );
  const blocked = fireRayHit(mx, my, mz, toAim.x, toAim.y, toAim.z, Math.hypot(toAim.x, toAim.y, toAim.z) - 0.01, [
    box,
  ]);

  // Fire SHOTS shots, letting each bullet fly until its hit is reported. The grunt's health is put back every frame, so
  // all 20 shots are measured against a living grunt (four would down it).
  let fired = 0;
  let hits = 0;
  const take = () => {
    for (const event of game.events) {
      if (event.kind === 'shot') fired++;
      if (event.kind === 'hit' && event.enemy === ENEMY) hits++;
    }
  };
  for (let frame = 0; frame < 600 && fired < SHOTS; frame++) {
    enemy.hp = 40;
    step(game, { ...idle, fire: true, aim }, DT);
    take();
    if (fired >= SHOTS) {
      for (let i = 0; i < 30; i++) {
        enemy.hp = 40;
        step(game, { ...idle, aim }, DT);
        take();
      }
    }
  }
  return {
    dist,
    hit: hits,
    aimY: aimPoint.y,
    aimAt: Math.hypot(toAim.x, toAim.y, toAim.z),
    clear: blocked === null,
    pullDeg: angle / DEG,
  };
}

test('a grunt 3 to 12 m ahead with the reticle on its chest: 20 shots', () => {
  const rows = [3, 5, 8, 12].map(measure);
  for (const row of rows) {
    expect(row.clear).toBe(true);
    expect(row.hit).toBeGreaterThanOrEqual(WANT_HIT);
  }
  // the soft lock's centre is far from the reticle's point at 3 m, which is what the near aim takes over from
  expect(rows[0].pullDeg).toBeGreaterThan(rows[3].pullDeg);
});

// A player circling a grunt at `dist` m, keeping the reticle on its chest while firing: how many of 20 shots hit. This is
// where the slow soft pull hurt: the muzzle trails a target the mech is turning past.
function orbitHits(dist: number): number {
  seed(13);
  const game = newPlayGame({ ...M1B_HAND, props: [], targets: [], mines: [] });
  game.mech.x = 0;
  game.mech.z = MECH_Z;
  game.mech.yaw = 0;
  game.enemies.push(newEnemy(ENEMY, 'test', 'grunt', CAMERA_TUNE.shoulder, MECH_Z - dist, 0));
  const enemy = game.enemies.find(placed => placed.id === ENEMY);
  if (!enemy) throw new Error('the grunt is placed');
  const cy = (enemyBox(enemy).minY + enemyBox(enemy).maxY) / 2;
  let fired = 0;
  let hits = 0;
  const take = () => {
    for (const event of game.events) {
      if (event.kind === 'shot') fired++;
      if (event.kind === 'hit' && event.enemy === ENEMY) hits++;
    }
  };
  for (let frame = 0; frame < 600 && fired < SHOTS; frame++) {
    enemy.hp = 40;
    const { x, z, yaw } = game.mech;
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    enemy.x = x + right.x * CAMERA_TUNE.shoulder + forward.x * dist;
    enemy.z = z + right.z * CAMERA_TUNE.shoulder + forward.z * dist;
    const aim = openAim(game, pitchTo(game, { x: enemy.x, y: cy, z: enemy.z }));
    step(game, { ...idle, turn: ORBIT_RATE * DT, fire: true, aim }, DT);
    take();
    if (fired >= SHOTS) {
      for (let i = 0; i < 30; i++) {
        enemy.hp = 40;
        step(game, { ...idle, aim }, DT);
        take();
      }
    }
  }
  return hits;
}

test('circling a grunt 3 to 12 m ahead with the reticle on its chest: 20 shots', () => {
  for (const dist of [3, 5, 8, 12]) expect(orbitHits(dist)).toBeGreaterThanOrEqual(WANT_HIT);
});
