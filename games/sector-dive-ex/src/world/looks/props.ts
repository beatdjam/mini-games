import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { placeProps } from '@engine/world/slots.ts';
import type { Placement, PropRule, Slot } from '@engine/world/slots.ts';
import type { TileMapData } from '@engine/world/dungeon.ts';
import { SIDE_STEP, T, tileCenter } from '@engine/world/tiles.ts';
import type { FloorPlan } from '../building.ts';
import { poolTex } from './paint.ts';
// The tools for the things fixed to a sector's walls and ceilings (its props): where a thing goes on a wall, the
// places the engine hands out (placeProps), one instanced mesh for all the copies of a part, and the light the lamps
// throw on the ground.
export const LAMP_POOL = 7; // side of the pool of light a ceiling lamp throws on the floor (m)
const POOL_Y = 0.05; // the pools lie this far above the floor (m)

// ---- where things go on a wall (a wall slot of placeProps: the floor tile and the side its wall is on) ----
export type WallSlot = { i: number; j: number; side?: number };
// where on a wall face: the tile's middle moved to the wall, `off` along it, `out` away from it, at height y
export function onWall(s: WallSlot, off: number, out: number, y: number): THREE.Vector3 {
  const [di, dj] = SIDE_STEP[s.side ?? 0]!;
  return new THREE.Vector3(
    tileCenter(s.i) + di * (T / 2 - out) + dj * off,
    y,
    tileCenter(s.j) + dj * (T / 2 - out) + di * off,
  );
}
// the turn that makes a thing's +z look away from the wall (its +x then runs along the wall)
export function facing(s: WallSlot): number {
  const [di, dj] = SIDE_STEP[s.side ?? 0]!;
  return Math.atan2(-di, -dj);
}
export const FULL_SIZE = new THREE.Vector3(1, 1, 1); // a copy that is not scaled
// one copy of a part: a place, a turn about the upright and a scale; `roll` then tips the thing along its wall
export const pose = (pos: THREE.Vector3, turn = 0, scale = FULL_SIZE, roll = 0): THREE.Matrix4 =>
  new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, turn, roll, 'YXZ')), scale);

// light thrown on a surface: a picture (a pool, a patch of sun) added to what is behind it; color = its tint (none:
// each copy has its own)
export function lightMat(map: THREE.Texture, opacity: number, color?: number | string) {
  const m = new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  if (color !== undefined) m.color.set(color);
  return m;
}
// a lamp's light on the ground: where, its colour, and its size as a share of LAMP_POOL
export interface Light {
  x: number;
  z: number;
  color: number;
  size: number;
}
export interface PropTools {
  d: TileMapData; // the floor's map
  placed: Placement[]; // every place handed out, as placeProps gave them
  wallOf: (s: WallSlot) => number; // the wall tile a wall slot is on
  // the places handed to the props with this id (no wall is drawn where a stairwell comes up from below: nothing
  // hangs there)
  of: (id: string) => Slot[];
  // one instanced mesh for all the copies of a part (none when there are no copies); colors = each copy's own
  add: (
    geo: THREE.BufferGeometry,
    mat: THREE.Material | THREE.Material[],
    where: THREE.Matrix4[],
    colors?: number[],
  ) => THREE.InstancedMesh | null;
  // the light the lamps throw on the ground: a soft pool of each one's colour
  pools: (lights: Light[], opacity: number) => void;
}
// places a floor's props by the sector's rules (the random numbers are drawn here, once) and gives the tools to
// build them into `group`
export function propTools(plan: FloorPlan, group: THREE.Group, rules: PropRule[], rng: Rng): PropTools {
  const d = { W: plan.gen.W, H: plan.gen.H, maps: plan.gen.maps, rooms: plan.gen.rooms },
    placed = placeProps(d, rules, rng);
  const wallOf = (s: WallSlot) => {
    const [di, dj] = SIDE_STEP[s.side ?? 0]!;
    return (s.j + dj) * d.W + s.i + di;
  };
  const add: PropTools['add'] = (geo, mat, where, colors) => {
    if (!where.length) return null;
    const mesh = new THREE.InstancedMesh(geo, mat, where.length),
      color = new THREE.Color();
    where.forEach((mx, n) => {
      mesh.setMatrixAt(n, mx);
      if (colors) mesh.setColorAt(n, color.setHex(colors[n]!));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    return mesh;
  };
  return {
    d,
    placed,
    wallOf,
    of: id =>
      placed
        .filter(p => p.id === id)
        .map(p => p.slot)
        .filter(s => s.kind !== 'wall' || !plan.voids[wallOf(s)]),
    add,
    pools: (lights, opacity) =>
      add(
        new THREE.PlaneGeometry(LAMP_POOL, LAMP_POOL).rotateX(-Math.PI / 2),
        lightMat(poolTex(), opacity),
        lights.map(l => pose(new THREE.Vector3(l.x, POOL_Y, l.z), 0, new THREE.Vector3(l.size, 1, l.size))),
        lights.map(l => l.color),
      ),
  };
}
