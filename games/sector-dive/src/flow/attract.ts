import { pick } from '@engine/core/util.ts';
import { camera } from '@engine/render/render.ts';
import { floorY } from '@engine/world/tiles.ts';
import { EYE } from '../data/level.ts';
import { BIOMES } from '../data/biomes.ts';
import { COLOR } from '../data/colors.ts';
import {
  buildLevel,
  exitIdx,
  makePortal,
  portals,
  randomTileIn,
  roomSpot,
  rooms,
  seen,
  startIdx,
} from '../world/level.ts';
import { enemies, spawnEnemy } from '../world/entities.ts';
import { tickClock } from './update.ts';
// the base screen backdrop: the camera slowly turns in the start room (system 'attract', src/flow/update.ts)
export let attractYaw = 0,
  attractPos = [0, 0];
export function buildAttract() {
  const ab = pick(BIOMES);
  buildLevel(ab, false);
  rooms.forEach((r, idx) => {
    if (idx === startIdx) return;
    for (let k = 0; k < 3; k++) {
      const [x, z] = randomTileIn(r);
      spawnEnemy(pick(ab.enemies), x, z, idx, 1);
    }
  });
  attractPos = roomSpot(rooms[startIdx]);
  const [ex, ez] = roomSpot(rooms[exitIdx]);
  attractYaw = Math.atan2(-(ex - attractPos[0]), -(ez - attractPos[1]));
  makePortal(ex, ez, COLOR.amber, 'next', '');
  seen.fill(1);
}
export function attract(dt: number) {
  tickClock(dt);
  attractYaw += dt * 0.12;
  camera.position.set(attractPos[0], floorY(attractPos[0], attractPos[1]) + EYE + 0.4, attractPos[1]);
  camera.rotation.set(-0.05, attractYaw, 0);
  portals.forEach(pt => {
    pt.ring.rotation.z += dt * 1.5;
    pt.ring.material.opacity = 1;
  }); // the backdrop's gate looks armed
  for (const e of enemies) {
    if (e.boss) continue;
    e.t += dt;
    e.mesh.position.y = e.fy + e.y + Math.sin(e.t * 2) * 0.15;
    e.body.rotation.y += dt;
  }
}
