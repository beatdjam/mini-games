import * as THREE from 'three';
import { T, activeTileGrid, tileCenter } from '@engine/world/tiles.ts';
import { isDoorLocked, updateDoors } from '@engine/world/doors.ts';
import type { DoorMover } from '@engine/world/doors.ts';
import { textSprite } from '@engine/render/render.ts';
import { t } from '@engine/core/i18n.ts';
import { WALL_H } from '../data/level.ts';
import { COLOR } from '../data/colors.ts';
import type { Biome } from '../data/types.ts';
// The doors of the floor being played: one slab per door tile that sinks into the floor as the door opens. How far a
// door is open, its collision and its lock are the engine's (engine/src/world/doors.ts); this file draws them.
// ---- tuning numbers used only here ----
const DOOR_THICK = 0.5; // thickness of the slab (m)
const DOOR_LOCKED_GLOW = 0.9; // emissive intensity of a locked door
const DOOR_GLOW = 0.25; // ... of an ordinary door
const BOSS_LABEL_Y = WALL_H * 0.72; // height of the boss door's label (m)

interface DoorMesh {
  k: number; // tile
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>;
  boss: boolean;
}
// rebuilt by buildDoorMeshes for every floor
let doorMeshes: DoorMesh[] = [];

// one slab per door of the active tile world, across its corridor. bossDoor (a tile, or -1) gets its own colour and label
export function buildDoorMeshes(biome: Biome, group: THREE.Group, bossDoor: number) {
  doorMeshes = [];
  const { door, grid, W } = activeTileGrid().world;
  if (!door) return;
  door.forEach((v, k) => {
    if (!v) return;
    const i = k % W,
      j = Math.floor(k / W),
      alongX = grid[k - 1] === 1 || grid[k + 1] === 1, // the corridor runs along x: the slab spans z
      boss = k === bossDoor,
      color = boss ? COLOR.mag : biome.line,
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(alongX ? DOOR_THICK : T, WALL_H, alongX ? T : DOOR_THICK),
        new THREE.MeshLambertMaterial({ color: 0x10161c, emissive: color, emissiveIntensity: DOOR_GLOW }),
      );
    mesh.position.set(tileCenter(i), WALL_H / 2, tileCenter(j));
    group.add(mesh);
    if (boss) {
      const label = textSprite(t('run.bossDoorLabel'), '#' + COLOR.mag.toString(16).padStart(6, '0'));
      label.position.set(tileCenter(i), BOSS_LABEL_Y, tileCenter(j));
      group.add(label);
    }
    doorMeshes.push({ k, mesh, boss });
  });
}
// moves the doors (the engine) and their slabs. movers: everyone on this floor who can open a door
export function updateDoorMeshes(movers: Iterable<DoorMover>, dt: number) {
  const g = activeTileGrid(),
    { doorOpen } = g.world;
  if (!doorOpen) return;
  updateDoors(g, movers, dt);
  for (const d of doorMeshes) {
    d.mesh.position.y = WALL_H / 2 - doorOpen[d.k]! * WALL_H;
    d.mesh.material.emissiveIntensity = isDoorLocked(g.world, d.k) ? DOOR_LOCKED_GLOW : DOOR_GLOW;
  }
}
