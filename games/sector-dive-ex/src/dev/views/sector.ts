import { yawToward } from '@engine/core/util.ts';
import { T, floorY } from '@engine/world/tiles.ts';
import { BIOMES } from '../../data/biomes.ts';
import { PER } from '../../data/progress.ts';
import { player, run } from '../../actors/player.ts';
import { enemies, removeEnemyMesh } from '../../world/entities.ts';
import { level } from '../../world/level.ts';
import { startRun, startStage } from '../../flow/run.ts';
import { setState, show } from '../../flow/state.ts';
import { update } from '../../flow/update.ts';
// dev view: #view-KWLN etc. drops straight into that sector's first floor (for screenshots)
export function showSector(hash: string) {
  setTimeout(() => {
    // #view-KWLN: the start room. #view-KWLN-b / -c / -d: other rooms of the floor, seen from a corner (for comparing looks)
    const [code, pose] = hash.slice(6).split('-');
    const bi = BIOMES.findIndex(b => b.code === code);
    if (bi < 0) return;
    startRun();
    run.route = [bi];
    run.stage = bi * PER + 1;
    startStage();
    if (pose) {
      const others = level.rooms.map((_, i) => i).filter(i => i !== level.startIdx && i !== level.hall?.room),
        r = level.rooms[others['bcd'.indexOf(pose) % others.length]!]!;
      enemies.slice().forEach(e => {
        e.dead = true;
        removeEnemyMesh(e);
      });
      player.x = (r.x + 0.6) * T;
      player.z = (r.y + 0.6) * T;
      player.fy = floorY(player.x, player.z);
      player.yaw = yawToward(r.w - 1.2, r.h - 1.2); // toward the far corner
      player.pitch = 0.05;
    }
    show(null);
    setState('play');
    for (let k = 0; k < 20; k++) update(1 / 60);
  }, 300);
}
