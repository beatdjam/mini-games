import * as THREE from 'three';
import { T, activeTileGrid, tileCenter } from '@engine/world/tiles.ts';
import { isDoorLocked, updateDoors } from '@engine/world/doors.ts';
import type { DoorMover } from '@engine/world/doors.ts';
import { textSprite } from '@engine/render/render.ts';
import { t } from '@engine/core/i18n.ts';
import { WALL_H } from '../data/level.ts';
import { COLOR } from '../data/colors.ts';
import type { Biome } from '../data/types.ts';
import { lookOf } from './looks.ts';
// The doors of the floor being played: two leaves per door tile that slide apart into the walls as the door opens.
// How far a door is open, its collision and its lock are the engine's (engine/src/world/doors.ts); this file draws
// them and sets how early and how fast they open.
// ---- tuning numbers used only here ----
const DOOR_THICK = 0.5; // thickness of a leaf (m)
// A face of a leaf must never lie in the plane of another face, or the two flicker: wide open, a leaf goes this much
// further into the wall than its own width (its end would sit exactly in the wall's face), and it stops this much
// short of the ceiling
const DOOR_CLEAR = 0.06; // m
// a door starts opening well before anyone reaches it and is through (DOOR_PASS) in about 0.1 s, so nobody has to
// stop in front of it
const DOOR_CFG = { sense: 7, speed: 5 }; // m from the middle of the door's tile; doorOpen per second
const DOOR_LOCKED_GLOW = 0.9; // emissive intensity of a locked door
const DOOR_GLOW = 0.25; // ... of an ordinary door
const BOSS_LABEL_Y = WALL_H * 0.6; // height of the boss door's label (m)
const BOSS_LABEL_OUT = 1.2; // the label hangs this far in front of the door (m)

const LOOK_DOOR = { lit: 0.9, lockedTint: 0xff6a5a, lockedLit: 1.15 }; // a painted door: how brightly it shows
interface DoorMesh {
  k: number; // tile (the first of the two, for a door 2 tiles wide)
  wide: number; // tiles across: 1, or 2 in a corridor 2 wide (the two tiles are one door: a leaf per tile)
  painted: boolean; // drawn with the sector's own door picture (world/looks.ts)
  leaves: [THREE.Mesh, THREE.Mesh]; // the two halves; they slide apart along `axis`
  axis: 'x' | 'z';
  mid: number; // the middle of the door's tile along `axis` (m)
  mat: THREE.MeshLambertMaterial; // shared by the two leaves
}
// the doors of every floor of the building (filled by buildDoorMeshes), and the floor whose doors move
let doorSets: DoorMesh[][] = [];
let doorMeshes: DoorMesh[] = [];
export function resetDoorMeshes() {
  doorSets = [];
  doorMeshes = [];
}
// the floor being played: its doors are the ones that move from now on
export function useDoorFloor(floor: number) {
  doorMeshes = doorSets[floor] ?? [];
  doorMeshes.forEach(d => placeLeaves(d, 0));
}

// Two leaves per door of the active tile world (set to the floor being drawn), across its corridor, into the floor's
// group. bossDoor (a tile, or -1) gets its own colour and label
export function buildDoorMeshes(biome: Biome, group: THREE.Group, bossDoor: number, floor: number) {
  const list: DoorMesh[] = [];
  doorSets[floor] = list;
  const { door, grid, W } = activeTileGrid().world,
    look = lookOf(biome);
  if (!door) return;
  door.forEach((v, k) => {
    if (!v) return;
    // the second tile of a door 2 wide: drawn with the first
    if ((door[k - 1] && !door[k + 1]) || (door[k - W] && !door[k + W])) return;
    const i = k % W,
      j = Math.floor(k / W),
      // the corridor runs along x (the door spans z) when the floor before or behind the door is on that axis; the
      // other half of a door 2 wide is floor too, but it is a door
      open = (t: number) => grid[t] === 1 && !door[t],
      alongX = open(k - 1) || open(k + 1),
      across = alongX ? W : 1,
      wide = door[k + across] ? 2 : 1,
      boss = k === bossDoor,
      map = look ? (boss ? look.bossDoor : look.door) : null,
      // a painted door shows its picture by its own light (the scene's lights are for the enemies); a plain one is a
      // dark slab that glows in the sector's colour
      mat = map
        ? new THREE.MeshLambertMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: LOOK_DOOR.lit })
        : new THREE.MeshLambertMaterial({
            color: 0x10161c,
            emissive: boss ? COLOR.mag : biome.line,
            emissiveIntensity: DOOR_GLOW,
          }),
      span = (T * wide) / 2, // width of a leaf
      leaf = () => {
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(alongX ? DOOR_THICK : span, WALL_H - DOOR_CLEAR, alongX ? span : DOOR_THICK),
          mat,
        );
        m.position.set(tileCenter(i), (WALL_H - DOOR_CLEAR) / 2, tileCenter(j));
        group.add(m);
        return m;
      },
      d: DoorMesh = {
        k,
        wide,
        painted: !!map,
        leaves: [leaf(), leaf()],
        axis: alongX ? 'z' : 'x',
        mid: tileCenter(alongX ? j : i) + ((wide - 1) * T) / 2, // a door 2 wide meets between its two tiles
        mat,
      };
    placeLeaves(d, 0);
    // the boss door's label, in front of the door on both sides (in the door's own plane the leaves would hide it)
    if (boss)
      for (const side of [-1, 1]) {
        const label = textSprite(t('run.bossDoorLabel'), '#' + COLOR.mag.toString(16).padStart(6, '0')),
          off = side * BOSS_LABEL_OUT;
        label.position.set(tileCenter(i) + (alongX ? off : 0), BOSS_LABEL_Y, tileCenter(j) + (alongX ? 0 : off));
        group.add(label);
      }
    list.push(d);
  });
}
// the leaves meet in the middle when shut and are each a little more than half a tile further out when wide open:
// wholly inside the walls, their ends clear of the walls' faces
function placeLeaves(d: DoorMesh, open: number) {
  const span = (T * d.wide) / 2,
    off = span / 2 + open * (span + DOOR_CLEAR);
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
    // a door 2 wide moves as one: as far open as the further open of its two tiles
    const other = d.k + (d.axis === 'z' ? g.world.W : 1);
    placeLeaves(d, d.wide > 1 ? Math.max(doorOpen[d.k]!, doorOpen[other]!) : doorOpen[d.k]!);
    const locked = isDoorLocked(g.world, d.k);
    if (d.painted) {
      // a locked painted door is lit red
      d.mat.emissive.setHex(locked ? LOOK_DOOR.lockedTint : 0xffffff);
      d.mat.emissiveIntensity = locked ? LOOK_DOOR.lockedLit : LOOK_DOOR.lit;
    } else d.mat.emissiveIntensity = locked ? DOOR_LOCKED_GLOW : DOOR_GLOW;
  }
}
