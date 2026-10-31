// Smoke test for Sector Dive Extended, enemy behaviour: the mortar, the repair drone and the trooper. Boots the game page (setup.ts) once for this file (bootGame) and runs it through the real loop by hand.
// Each test makes the state it needs; the file passes on its own and in any order (the dice are seeded where a test depends on them).
import { beforeAll, expect, test } from 'vitest';
import type { MortarShell } from '../src/data/types.ts';
import { distXZ } from '@engine/core/util.ts';
import { clearWorld, query } from '@engine/core/world.ts';
import { H, T, W, activeTileGrid, cover, floorY, grid, hgt, ramp } from '@engine/world/tiles.ts';
import { PER } from '../src/data/progress.ts';
import { enemies, removeEnemyMesh, spawnEnemy } from '../src/world/entities.ts';
import { player, run } from '../src/actors/player.ts';
import { MORTAR_BLAST_R } from '../src/actors/mortar.ts';
import { endRun, goBase, startRun, startStage } from '../src/flow/run.ts';
import { setState, show } from '../src/flow/state.ts';
import { update } from '../src/flow/update.ts';
import { tick, bootGame } from './helpers.ts';

beforeAll(bootGame);

test('mortar: a round puts a ring where the player stood, then hurts only whoever is still in it', () => {
  // two rounds on an open floor: in the first the player stays put, in the second steps out of the ring
  const lands = (stepOut: number) => {
    startRun();
    tick(3);
    enemies.slice().forEach(e => {
      e.dead = true;
      removeEnemyMesh(e);
    });
    clearWorld('enemy');
    clearWorld('shell');
    grid.fill(1);
    hgt.fill(0);
    ramp.fill(-1);
    cover.fill(0);
    activeTileGrid().world.door?.fill(0);
    const cx = (W * T) / 2,
      cz = (H * T) / 2;
    player.x = cx;
    player.z = cz;
    player.fy = floorY(cx, cz);
    const m = spawnEnemy('mortar', cx, cz + 12, -1, 1);
    m.active = true;
    m.cd = 0;
    for (let k = 0; k < 30 && !m.shots; k++) update(1 / 60);
    expect(m.shots, 'the mortar fired').toBe(1);
    const shell = query<MortarShell>('shell')[0]!;
    expect(shell, 'a round is in the air').toBeTruthy();
    expect([shell.tx, shell.tz], "aimed at the player's feet").toEqual([cx, cz]);
    expect(shell.mesh.children.length, 'the round, the ring and its fill').toBe(3);
    expect(shell.fill.scale.x, 'the ring has barely begun to fill').toBeLessThan(0.5);
    // the mortar dies; the round still falls
    m.dead = true;
    removeEnemyMesh(m);
    clearWorld('enemy');
    player.x += stepOut;
    player.hp = 1e6;
    player.maxHp = 1e6;
    player.inv = 0;
    const hp0 = player.hp;
    update(0.7);
    expect(shell.dead, 'still flying halfway').toBeFalsy();
    expect(shell.fill.scale.x, 'the ring is about half full').toBeGreaterThan(MORTAR_BLAST_R * 0.3);
    for (let k = 0; k < 60 && !shell.dead; k++) update(1 / 60);
    expect(shell.dead, 'it landed').toBe(true);
    const lost = hp0 - player.hp;
    endRun('abandon');
    return { lost, dmg: shell.dmg };
  };
  const hit = lands(0);
  expect(hit.lost, 'standing in the ring').toBe(hit.dmg);
  expect(lands(MORTAR_BLAST_R + 0.5).lost, 'outside the ring').toBe(0);
});
test('repair drone: mends the most worn enemy near it, then the next, and flies off from the player', () => {
  // on an open floor: a worn brute and a slightly worn shield, both held where they are, and a repair drone by them
  startRun();
  tick(3);
  enemies.slice().forEach(e => {
    e.dead = true;
    removeEnemyMesh(e);
  });
  clearWorld('enemy');
  grid.fill(1);
  hgt.fill(0);
  ramp.fill(-1);
  cover.fill(0);
  activeTileGrid().world.door?.fill(0);
  const cx = (W * T) / 2,
    cz = (H * T) / 2;
  player.x = cx;
  player.z = cz;
  player.fy = floorY(cx, cz);
  player.hp = 1e6;
  player.maxHp = 1e6;
  const b = spawnEnemy('brute', cx, cz + 20, -1, 1),
    s = spawnEnemy('shield', cx + 4, cz + 20, -1, 1),
    m = spawnEnemy('medic', cx, cz + 25, -1, 1);
  for (const e of [b, s, m]) e.active = true;
  b.stun = 1e6;
  s.stun = 1e6;
  b.hp = b.maxHp * 0.4;
  s.hp = s.maxHp * 0.9;
  tick(12);
  expect(m.patient, 'the brute is the more worn').toBe(b);
  expect(m.laser!.visible, 'the beam is on').toBe(true);
  const hp0 = b.hp;
  tick(60);
  expect((b.hp - hp0) / b.maxHp, 'about a fifth of its hit points a second').toBeGreaterThan(0.18);
  expect((b.hp - hp0) / b.maxHp).toBeLessThan(0.22);
  b.hp = b.maxHp;
  tick(42);
  expect(m.patient, 'the brute is whole: on to the shield').toBe(s);
  s.hp = s.maxHp;
  tick(42);
  expect(m.patient, 'nothing left to mend').toBeNull();
  expect(m.laser!.visible, 'the beam is off').toBe(false);
  player.x = m.x;
  player.z = m.z - 4;
  const d0 = distXZ(player, m);
  tick(30);
  expect(distXZ(player, m), 'it flies away from the player').toBeGreaterThan(d0 + 1);
  expect(m.hp, 'it was never hurt').toBe(m.maxHp);
  endRun('abandon');
});
test('trooper: 3-round bursts, hit spheres at head, chest and legs', () => {
  goBase();
  startRun();
  // an open boss arena without pillars (a run's own boss room is inside a building floor: as boss practice gets one)
  run.kind = 'practice';
  run.t0 = performance.now();
  run.stage = PER - 1;
  run.forceBoss = 'trinity';
  startStage();
  show(null);
  setState('play');
  player.hp = 1e6;
  player.maxHp = 1e6;
  enemies.forEach(o => {
    o.dead = true;
    removeEnemyMesh(o);
  });
  const e = spawnEnemy('trooper', player.x, player.z - 7, -1, 1);
  e.active = true;
  e.cd = 0;
  for (let k = 0; k < 30; k++) update(1 / 60); // 0.5 s: one burst (3 rounds, 0.13 s apart)
  const shots = e.shots,
    [head, chest, legs] = e.parts!.map(q => q.p.y);
  run.forceBoss = undefined;
  run.kind = 'dive'; // ends as the ordinary run it was started as
  endRun('abandon');
  goBase();
  if (shots !== 3 || !(head > chest && chest > legs))
    throw new Error('trooper burst ' + shots + ' spheres ' + [head, chest, legs]);
});
