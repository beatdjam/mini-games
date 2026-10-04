import * as THREE from 'three';
import { T, activeTileGrid, tileCenter } from '@engine/world/tiles.ts';
import { isDoorLocked, updateDoors } from '@engine/world/doors.ts';
import type { DoorMover } from '@engine/world/doors.ts';
import { textSprite } from '@engine/render/render.ts';
import { t } from '@engine/core/i18n.ts';
import { WALL_H } from '../data/level.ts';
import { COLOR } from '../data/colors.ts';
import type { Biome } from '../data/types.ts';
// The doors of the floor being played: two leaves per door tile that slide apart into the walls as the door opens.
// How far a door is open, its collision and its lock are the engine's (engine/src/world/doors.ts); this file draws
// them and sets how early and how fast they open.
// ---- tuning numbers used only here ----
const DOOR_THICK = 0.5; // thickness of a leaf (m)
// a door starts opening well before anyone reaches it and is through (DOOR_PASS) in about 0.1 s, so nobody has to
// stop in front of it
const DOOR_CFG = { sense: 7, speed: 5 }; // m from the middle of the door's tile; doorOpen per second
const DOOR_LOCKED_GLOW = 0.9; // emissive intensity of a locked door
const DOOR_GLOW = 0.25; // ... of an ordinary door
const BOSS_LABEL_Y = WALL_H * 0.72; // height of the boss door's label (m)

interface DoorMesh {
  k: number; // tile
  leaves: [THREE.Mesh, THREE.Mesh]; // the two halves; they slide apart along `axis`
  axis: 'x' | 'z';
  mid: number; // the middle of the door's tile along `axis` (m)
  mat: THREE.MeshLambertMaterial; // shared by the two leaves
}
// rebuilt by buildDoorMeshes for every floor
let doorMeshes: DoorMesh[] = [];

// two leaves per door of the active tile world, across its corridor. bossDoor (a tile, or -1) gets its own colour and label
export function buildDoorMeshes(biome: Biome, group: THREE.Group, bossDoor: number) {
  doorMeshes = [];
  const { door, grid, W } = activeTileGrid().world;
  if (!door) return;
  door.forEach((v, k) => {
    if (!v) return;
    const i = k % W,
      j = Math.floor(k / W),
      alongX = grid[k - 1] === 1 || grid[k + 1] === 1, // the corridor runs along x: the door spans z
      boss = k === bossDoor,
      mat = new THREE.MeshLambertMaterial({
        color: 0x10161c,
        emissive: boss ? COLOR.mag : biome.line,
        emissiveIntensity: DOOR_GLOW,
      }),
      leaf = () => {
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(alongX ? DOOR_THICK : T / 2, WALL_H, alongX ? T / 2 : DOOR_THICK),
          mat,
        );
        m.position.set(tileCenter(i), WALL_H / 2, tileCenter(j));
        group.add(m);
        return m;
      },
      d: DoorMesh = { k, leaves: [leaf(), leaf()], axis: alongX ? 'z' : 'x', mid: tileCenter(alongX ? j : i), mat };
    placeLeaves(d, 0);
    if (boss) {
      const label = textSprite(t('run.bossDoorLabel'), '#' + COLOR.mag.toString(16).padStart(6, '0'));
      label.position.set(tileCenter(i), BOSS_LABEL_Y, tileCenter(j));
      group.add(label);
    }
    doorMeshes.push(d);
  });
}
// the leaves meet in the middle when shut and are each half a tile further out (inside the walls) when wide open
function placeLeaves(d: DoorMesh, open: number) {
  const off = T / 4 + (open * T) / 2;
  d.leaves[0].position[d.axis] = d.mid - off;
  d.leaves[1].position[d.axis] = d.mid + off;
}
// moves the doors (the engine) and their slabs. movers: everyone on this floor who can open a door
export function updateDoorMeshes(movers: Iterable<DoorMover>, dt: number) {
  const g = activeTileGrid(),
    { doorOpen } = g.world;
  if (!doorOpen) return;
  updateDoors(g, movers, dt, DOOR_CFG);
  for (const d of doorMeshes) {
    placeLeaves(d, doorOpen[d.k]!);
    d.mat.emissiveIntensity = isDoorLocked(g.world, d.k) ? DOOR_LOCKED_GLOW : DOOR_GLOW;
  }
}
