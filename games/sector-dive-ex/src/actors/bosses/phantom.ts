import { phantomLook } from '../../world/bossLooks.ts';
import { plainLooks } from '../../world/looks.ts';
import type { Boss, Laser } from '../../data/types.ts';
import * as THREE from 'three';
import { pick, rand } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { sfx } from '@engine/audio/audio.ts';
import { burst } from '@engine/render/fx.ts';
import { T } from '@engine/world/tiles.ts';
import { toast } from '@engine/ui/ui.ts';
import { BOSS_META } from '../../data/bosses.ts';
import { arenaShift, randomTileIn } from '../../world/level.ts';
import { ring, shootAtPoint } from '../../world/entities.ts';
import { player } from '../player.ts';
import {
  RING_Y,
  arenaRoom,
  bossBase,
  bossMaterial,
  isEnraged,
  minionCount,
  spawnMinion,
  wireOutline,
} from './common.ts';
import { makeLaser, setLaser } from '../../world/models.ts';
import { COLOR } from '../../data/colors.ts';
// PHANTOM: warps between spots near the pillars, aims a laser, fires one heavy round

// laser: the aim line; lock: where it is locked on; cycle: warps so far (every droneEvery-th brings drones)
type PhantomBoss = Boss & { st: string; laser: Laser; lock: number[]; cycle: number };
export function spawnPhantom() {
  const g = new THREE.Group(),
    geo = new THREE.OctahedronGeometry(1.2, 0);
  const mat = bossMaterial(0x0c1418, 0x9fe7ff);
  const body = new THREE.Mesh(geo, mat);
  body.scale.set(0.8, 1.7, 0.8);
  const edge = wireOutline(geo, 0x9fe7ff);
  edge.scale.copy(body.scale);
  const lens = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 12, 10),
    new THREE.MeshBasicMaterial({ color: COLOR.mag }),
  );
  lens.position.set(0, 0.5, 0.75);
  if (plainLooks()) g.add(body, edge, lens);
  else g.add(phantomLook(mat, 0x9fe7ff));
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
function phantomWarp(e: Boss, first?: boolean) {
  const [si, sj] = arenaShift();
  const spots = BOSS_META.phantom.tune.spots
    .map(([i, j]: [number, number]) => [(i + si + 0.5) * T, (j + sj + 0.5) * T])
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
      RING_Y,
      z,
      BOSS_META.phantom.tune.warpRing[0],
      BOSS_META.phantom.tune.warpRing[1],
      rand(0, 1),
      e.dmg,
      0x9fe7ff,
    );
  }
}
function updPhantom(e: PhantomBoss, dt: number) {
  const K = BOSS_META.phantom.tune;
  e.t += dt;
  e.timer -= dt;
  const enr = isEnraged(e),
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
      shootAtPoint(
        eye[0],
        eye[1],
        eye[2],
        e.lock[0],
        e.lock[1],
        e.lock[2],
        K.shotSpeed,
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
      if (e.cycle % K.droneEvery === 0 && minionCount() < K.droneCap)
        for (let k = 0; k < K.drones; k++) {
          const [x, z] = randomTileIn(arenaRoom());
          spawnMinion('drone', x, z);
        }
    }
  }
  e.mesh.scale.setScalar(sc);
  e.mesh.position.set(e.x, e.y + Math.sin(e.t * 2) * 0.2, e.z);
}
