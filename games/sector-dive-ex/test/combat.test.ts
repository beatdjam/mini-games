// Smoke test for Sector Dive Extended, damage and knockback: shields, rockets, chain blasts, splitters and hit directions. Boots the game page (setup.ts) once for this file (bootGame) and runs it through the real loop by hand.
// Each test makes the state it needs; the file passes on its own and in any order (the dice are seeded where a test depends on them).
import { beforeAll, expect, test } from 'vitest';
import { clearWorld } from '@engine/core/world.ts';
import { V3 } from '@engine/render/render.ts';
import { H, T, W, activeTileGrid, cover, grid, hgt, ramp } from '@engine/world/tiles.ts';
import { PER } from '../src/data/progress.ts';
import { level, roomSpot } from '../src/world/level.ts';
import { enemies, isShielded, removeEnemyMesh, spawnEnemy, spawnPBullet } from '../src/world/entities.ts';
import { player, run } from '../src/actors/player.ts';
import { damagePlayer, explode, hurtEnemy } from '../src/actors/combat.ts';
import { hitDirs } from '../src/ui/hud.ts';
import { endRun, goBase, startRun, startStage } from '../src/flow/run.ts';
import { updatePBullets } from '../src/actors/bullets.ts';
import { COLOR } from '../src/data/colors.ts';
import { tick, bootGame } from './helpers.ts';

beforeAll(bootGame);

test('shield: front wears the shield, back hurts, then it breaks', () => {
  run.route = [3];
  run.stage = PER * 3 + 1;
  startStage();
  enemies.slice().forEach(e => {
    e.dead = true;
    removeEnemyMesh(e);
  });
  clearWorld('enemy');
  const [sx, sz] = roomSpot(level.rooms[level.startIdx]);
  const e = spawnEnemy('shield', sx, sz, -1, 1);
  if (!isShielded(e)) throw new Error('shield fields');
  e.face = 0;
  e.mesh.rotation.y = 0; // facing +z
  const shoot = (dir: number) => {
    spawnPBullet(new V3(sx, e.fy! + 1.6, sz + dir * 2.5), new V3(0, 0, -dir), 60, 20, 0, 0, 0xffffff, 0, {});
    updatePBullets(0.1);
  }; // above rubble height
  const hp0 = e.hp,
    sh0 = e.shieldHp;
  shoot(1); // from the front
  if (!(e.shieldHp < sh0 && e.hp === hp0)) throw new Error('shield front ' + [e.shieldHp, sh0, e.hp, hp0]);
  shoot(-1); // from behind
  if (!(e.hp < hp0)) throw new Error('shield back');
  for (let k = 0; k < 20 && e.shieldHp > 0; k++) shoot(1);
  if (e.shieldHp > 0 || e.stun <= 0) throw new Error('shield break');
  const hp1 = e.hp;
  shoot(1);
  if (!(e.hp < hp1)) throw new Error('after break');
  removeEnemyMesh(e);
  clearWorld('enemy');
});
test('rocket: the enemy it strikes takes its direct share on top of the blast', () => {
  enemies.slice().forEach(e => {
    e.dead = true;
    removeEnemyMesh(e);
  });
  clearWorld('enemy');
  const was = { crit: player.crit, hp: player.hp, maxHp: player.maxHp };
  player.crit = 0;
  player.hp = 1e6;
  player.maxHp = 1e6;
  const [sx, sz] = roomSpot(level.rooms[level.startIdx]);
  const e = spawnEnemy('brute', sx, sz, -1, 1);
  e.hp = 1e6;
  // a rocket of 10 from 2.5 m in front, with and without the direct share; what the blast does is the same both times
  const hit = (direct: number) => {
    const hp0 = e.hp;
    spawnPBullet(new V3(sx, e.fy! + 1.2, sz + 2.5), new V3(0, 0, -1), 60, 10, 0, 5, 0xffffff, 0, { direct });
    updatePBullets(0.1);
    return hp0 - e.hp;
  };
  const plain = hit(0),
    struck = hit(0.5);
  expect(plain, 'the blast hurts').toBeGreaterThan(0);
  expect(struck - plain).toBeCloseTo(5);
  removeEnemyMesh(e);
  clearWorld('enemy');
  Object.assign(player, was);
});
test('chain blast: one kill in a tight cluster does not cascade', () => {
  startRun();
  tick(3);
  enemies.slice().forEach(e => {
    e.dead = true;
    removeEnemyMesh(e);
  });
  clearWorld('enemy');
  player.chain = 3;
  const [cx, cz] = roomSpot(level.rooms[level.startIdx]);
  const line = [0, 2.8, 5.6, 8.4].map(dx => spawnEnemy('crawler', cx + dx, cz, -1, 1)); // each 2.8m apart, blast radius 4
  line.forEach(e => (e.hp = 1)); // any blast that touches one kills it
  hurtEnemy(line[0], 1e6, false);
  const alive = line.filter(e => !e.dead).length;
  if (alive !== 2) throw new Error('chain cascade: alive ' + alive);
  endRun('abandon');
});
test('chain blast: as big as the enemy that blew up, whatever the damage chips; no wider than 4.5 m', () => {
  startRun();
  tick(3);
  enemies.slice().forEach(e => {
    e.dead = true;
    removeEnemyMesh(e);
  });
  clearWorld('enemy');
  player.chain = 1;
  const [cx, cz] = roomSpot(level.rooms[level.startIdx]);
  // what a brute beside it loses when this one is killed (a blast may crit: the smallest of a few)
  const lossBy = (type: string): number => {
    const losses: number[] = [];
    for (let n = 0; n < 8; n++) {
      const small = spawnEnemy(type, cx, cz, -1, 1),
        big = spawnEnemy('brute', cx + 0.5, cz, -1, 1);
      hurtEnemy(small, 1e6, false);
      losses.push((big.maxHp - big.hp) / small.maxHp);
      big.hp = 1e9; // (not blown up in turn by the next kill)
      [small, big].forEach(e => {
        e.dead = true;
        removeEnemyMesh(e);
      });
      clearWorld('enemy');
    }
    return Math.min(...losses);
  };
  expect(lossBy('crawler'), 'a share of the health of the one killed').toBeCloseTo(0.3, 5);
  expect(lossBy('brute')).toBeCloseTo(0.3, 5);
  player.dmgMul = 10;
  expect(lossBy('crawler'), 'damage chips do not count').toBeCloseTo(0.3, 5);
  // the radius stops growing at 4.5 m: with many chips, an enemy 6.5 m off is not touched, one 3.5 m off is
  player.dmgMul = 1;
  player.chain = 20;
  const dead = spawnEnemy('crawler', cx, cz, -1, 1),
    near = spawnEnemy('brute', cx + 3.5, cz, -1, 1),
    far = spawnEnemy('brute', cx, cz + 6.5, -1, 1);
  [near, far].forEach(e => {
    e.maxHp = 1e9;
    e.hp = 1e9;
  });
  hurtEnemy(dead, 1e6, false);
  expect(near.hp < near.maxHp && far.hp === far.maxHp).toBe(true);
  endRun('abandon');
});
test('splitter killed by a chain blast or a rocket: both halves survive', () => {
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
  activeTileGrid().world.door?.fill(0); // a building floor has doors: none in the way here
  const cx = (W * T) / 2,
    cz = (H * T) / 2;
  player.chain = 3;
  player.dmgMul = 10;
  let s = spawnEnemy('splitter', cx, cz, -1, 1);
  hurtEnemy(s, 1e6, false);
  const a1 = enemies.filter(e => !e.dead && !e.boss && e.type === 'mini').length;
  player.chain = 0;
  s = spawnEnemy('splitter', cx + 10, cz, -1, 1);
  explode(s.x, 1, s.z, 5, 1e6, COLOR.fire, true);
  const a2 = enemies.filter(e => !e.dead && !e.boss && e.type === 'mini').length;
  if (a1 !== 2 || a2 !== 4) throw new Error('splitter halves ' + a1 + ' ' + a2);
  endRun('abandon');
});
test('knockback: a rocket pushes what walks away, never a turret bolted to the floor', () => {
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
    cz = (H * T) / 2,
    // the blast between them, 2 m from each
    walker = spawnEnemy('brute', cx - 2, cz, -1, 1),
    turret = spawnEnemy('turret', cx + 2, cz, -1, 1),
    bastions = spawnEnemy('bturret', cx, cz + 2, -1, 1);
  explode(cx, 1, cz, 5, 1, COLOR.fire, true);
  expect(walker.x, 'the brute is pushed').toBeLessThan(cx - 2.5);
  expect([turret.x, turret.z], 'the turret stays').toEqual([cx + 2, cz]);
  expect([bastions.x, bastions.z], "BASTION's turret stays").toEqual([cx, cz + 2]);
  endRun('abandon');
});
test('hit direction: a hit from behind shows the arc, one from in front does not', () => {
  goBase();
  startRun();
  tick(5);
  player.yaw = 0;
  player.hp = 1e6;
  player.maxHp = 1e6;
  hitDirs.forEach(d => {
    d.t = 0;
  });
  player.inv = 0;
  damagePlayer(1, { x: player.x, z: player.z - 8 });
  if (hitDirs.some(d => d.t > 0)) throw new Error('hit arc shown for a hit from the front');
  player.inv = 0;
  damagePlayer(1, { x: player.x + 3, z: player.z + 8 });
  if (!hitDirs.some(d => d.t > 0)) throw new Error('no hit arc for a hit from behind');
  goBase();
});
