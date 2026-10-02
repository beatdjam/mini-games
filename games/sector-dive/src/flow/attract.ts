import { pick } from '@engine/core/util.ts';
import { camera } from '@engine/render/render.ts';
import { floorY } from '@engine/world/tiles.ts';
import { EYE } from '../data/level.ts';
import { BIOMES } from '../data/biomes.ts';
import { COLOR } from '../data/colors.ts';
import { buildLevel, level, makePortal, randomTileIn, roomSpot } from '../world/level.ts';
import { enemies, spawnEnemy } from '../world/entities.ts';
import { tickClock } from './update.ts';
// the base screen backdrop: the camera slowly turns in the start room (system 'attract', src/flow/update.ts)
let attractYaw = 0; // camera yaw (rad)
let attractPos = [0, 0]; // camera position (x, z)
export function buildAttract() {
  const ab = pick(BIOMES);
  buildLevel(ab, false);
  level.rooms.forEach((r, idx) => {
    if (idx === level.startIdx) return;
    for (let k = 0; k < 3; k++) {
      const [x, z] = randomTileIn(r);
      spawnEnemy(pick(ab.enemies), x, z, idx, 1);
    }
  });
  attractPos = roomSpot(level.rooms[level.startIdx]);
  const [ex, ez] = roomSpot(level.rooms[level.exitIdx]);
  attractYaw = Math.atan2(-(ex - attractPos[0]), -(ez - attractPos[1]));
  makePortal(ex, ez, COLOR.amber, 'next', '');
  level.seen.fill(1);
}
export function attract(dt: number) {
  tickClock(dt);
  attractYaw += dt * 0.12;
  camera.position.set(attractPos[0], floorY(attractPos[0], attractPos[1]) + EYE + 0.4, attractPos[1]);
  camera.rotation.set(-0.05, attractYaw, 0);
  level.portals.forEach(pt => {
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
