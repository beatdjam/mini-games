import type { Boss, Laser } from '../../data/types.ts';
import * as THREE from 'three';
import { pick, rand } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { sfx } from '@engine/audio/audio.ts';
import { burst } from '@engine/render/fx.ts';
import { T } from '@engine/world/tiles.ts';
import { toast } from '@engine/ui/ui.ts';
import { BOSS_META } from '../../data/bosses.ts';
import { randomTileIn, rooms } from '../../world/level.ts';
import { enemies, ring, spawnEBullet, spawnEnemy } from '../../world/entities.ts';
import { player, difficultyAt, run } from '../player.ts';
import { bossBase, makeLaser, setLaser } from './common.ts';
import { COLOR } from '../../data/colors.ts';
// PHANTOM: warps between spots near the pillars, aims a laser, fires one heavy round

// laser: the aim line; lock: where it is locked on; cycle: warps so far (every droneEvery-th brings drones)
export type PhantomBoss = Boss & { st: string; laser: Laser; lock: number[]; cycle: number };
export function spawnPhantom() {
  const g = new THREE.Group(),
    geo = new THREE.OctahedronGeometry(1.2, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0x0c1418, emissive: 0x9fe7ff, emissiveIntensity: 0.3 });
  const body = new THREE.Mesh(geo, mat);
  body.scale.set(0.8, 1.7, 0.8);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x9fe7ff }));
  edge.scale.copy(body.scale);
  const lens = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 12, 10),
    new THREE.MeshBasicMaterial({ color: COLOR.mag }),
  );
  lens.position.set(0, 0.5, 0.75);
  g.add(body, edge, lens);
  const e = bossBase('phantom', g, mat, updPhantom, {
    st: 'idle',
    laser: makeLaser(COLOR.mag),
    lock: [0, 0, 0],
    cycle: 0,
  });
  e.timer = 1.6;
  phantomWarp(e, true);
  toast(t('boss.phantomHint'), 4200);
}
export function phantomWarp(e: Boss, first?: boolean) {
  const spots = BOSS_META.phantom.tune.spots
    .map(([i, j]: [number, number]) => [(i + 0.5) * T, (j + 0.5) * T])
    .sort(
      (a: number[], b: number[]) =>
        Math.hypot(b[0] - player.x, b[1] - player.z) - Math.hypot(a[0] - player.x, a[1] - player.z),
    );
  // warp anywhere except the two spots nearest the player (first appearance: the farthest spot)
  const [x, z] = first ? spots[0] : pick(spots.slice(0, spots.length - 2));
  e.x = x;
  e.z = z;
  if (!first) {
    burst(x, 2, z, 0x9fe7ff, 16, 6, 0.5);
    ring(
      x,
      z,
      1.3,
      BOSS_META.phantom.tune.warpRing[0],
      BOSS_META.phantom.tune.warpRing[1],
      rand(0, 1),
      e.dmg,
      0x9fe7ff,
    );
  }
}
export function updPhantom(e: PhantomBoss, dt: number) {
  const K = BOSS_META.phantom.tune;
  e.t += dt;
  e.timer -= dt;
  const enr = e.hp < e.maxHp * 0.5,
    eye = [e.x, e.y + 0.5, e.z];
  let sc = 1;
  e.mesh.lookAt(player.x, e.y, player.z);
  if (e.st === 'idle') {
    if (e.timer <= 0) {
      e.st = 'aim';
      e.timer = enr ? K.aimEnr : K.aim;
      e.shots = 0;
      sfx('beam');
    }
  } else if (e.st === 'aim') {
    if (e.timer > 0.3) e.lock = [player.x, player.fy + 1.3, player.z];
    setLaser(e.laser, eye, e.lock, e.timer > 0.3 ? 0.45 : Math.sin(e.t * 60) > 0 ? 1 : 0.25);
    if (e.timer <= 0) {
      const v = [e.lock[0] - eye[0], e.lock[1] - eye[1], e.lock[2] - eye[2]],
        l = Math.hypot(v[0], v[1], v[2]) || 1;
      spawnEBullet(
        eye[0],
        eye[1],
        eye[2],
        (v[0] / l) * K.shotSpeed,
        (v[1] / l) * K.shotSpeed,
        (v[2] / l) * K.shotSpeed,
        e.dmg * K.shotDmg,
        COLOR.mag,
        0.9,
      );
      sfx('rail');
      e.laser.visible = false;
      e.shots++;
      if (enr && e.shots < 2)
        e.timer = K.secondGap; // enraged: a quick second shot
      else {
        e.st = 'vanish';
        e.timer = K.vanish;
      }
    }
  } else if (e.st === 'vanish') {
    sc = Math.max(0.05, e.timer / K.vanish);
    if (e.timer <= 0) {
      phantomWarp(e);
      e.st = 'idle';
      e.timer = enr ? K.idleEnr : K.idle;
      e.cycle++;
      if (e.cycle % K.droneEvery === 0 && enemies.filter(o => !o.boss && !o.dead).length < K.droneCap)
        for (let k = 0; k < K.drones; k++) {
          const [x, z] = randomTileIn(rooms[0]);
          spawnEnemy('drone', x, z, -1, difficultyAt(run.stage)).active = true;
        }
    }
  }
  e.mesh.scale.setScalar(sc);
  e.mesh.position.set(e.x, e.y + Math.sin(e.t * 2) * 0.2, e.z);
}
