import { T, tileCenter } from './tiles.ts';
import type { TileGrid, TileWorld } from './tiles.ts';
// engine: Doors that open when someone comes near and close again after a while, and doors a game locks (they shut
// and stay shut). The tiles and their collision are in world/tiles.ts (TileWorld.door / doorOpen / doorLock,
// DOOR_PASS); this file moves doorOpen. No random numbers, no three.js.
// ---- tuning numbers (a game can pass its own through DoorConfig) ----
export const DOOR_SENSE_R = 3.5; // a door starts opening when a mover is this close to the middle of its tile (m)
export const DOOR_SPEED = 2.5; // how fast a door opens and closes (doorOpen per second; 2.5 = full travel in 0.4 s)
export const DOOR_CLOSE_DELAY = 1.5; // a door starts closing this long after the last mover was near it (s)

export interface DoorConfig {
  sense: number; // m, see DOOR_SENSE_R
  speed: number; // doorOpen per second, see DOOR_SPEED
  closeDelay: number; // s, see DOOR_CLOSE_DELAY
}
export const DOOR_DEFAULTS: DoorConfig = { sense: DOOR_SENSE_R, speed: DOOR_SPEED, closeDelay: DOOR_CLOSE_DELAY };
// anything with a position and a radius: the player, an enemy ...
export interface DoorMover {
  x: number;
  z: number;
  r: number;
}

// per door array: the door tiles (found once) and the time since each door last had someone near it
interface DoorState {
  tiles: Int32Array; // tile index of each door
  idle: Float32Array; // per door: seconds since a mover was near (0 at the start)
  near: Uint8Array; // per door: scratch flags for one update (NEAR, OVER)
}
const NEAR = 1; // a mover is within `sense` of the door or overlaps its tile
const OVER = 2; // a mover overlaps the door's tile
// keyed by the `door` array itself, so a new array (a new level) gets a new list. A door added to the same array after
// the first updateDoors call is not seen; hand over a new array to change where the doors are
const states = new WeakMap<Uint8Array, DoorState>();
function doorState(door: Uint8Array): DoorState {
  let s = states.get(door);
  if (!s) {
    const list: number[] = [];
    for (let k = 0; k < door.length; k++) if (door[k] === 1) list.push(k);
    s = { tiles: Int32Array.from(list), idle: new Float32Array(list.length), near: new Uint8Array(list.length) };
    states.set(door, s);
  }
  return s;
}

// Locks the door on tile k (on = false unlocks it). A locked door shuts at once (updateDoors, no closeDelay) and opens
// for nobody; paths and reach checks do not go into its tile (TileGrid.passable). Unlocked, it is an ordinary door
// again. Makes world.doorLock the first time. Throws when tile k has no door
export function lockDoor(world: TileWorld, k: number, on = true) {
  if (!world.door || world.door[k] !== 1) throw new Error(`lockDoor: tile ${k} has no door`);
  if (!world.doorLock) {
    if (!on) return;
    world.doorLock = new Uint8Array(world.door.length);
  }
  world.doorLock[k] = on ? 1 : 0;
}
export const isDoorLocked = (world: TileWorld, k: number): boolean =>
  world.door !== undefined && world.doorLock !== undefined && world.door[k] === 1 && world.doorLock[k] === 1;

// Moves every door of the grid by dt seconds. A door opens while any of `movers` is within `sense` of its tile's middle
// or overlaps its tile (a circle of radius r against the square); once none has been for `closeDelay` it closes. A door
// never closes while a mover overlaps its tile. A locked door (lockDoor) does not open; it closes right away, waiting
// only while a mover overlaps its tile. Pass only the movers on this grid (the ones on its floor, say).
// Nothing happens for a world without `door`; throws when `door` is there without a `doorOpen` of the same size
export function updateDoors(grid: TileGrid, movers: Iterable<DoorMover>, dt: number, cfg: Partial<DoorConfig> = {}) {
  const { door, doorOpen, doorLock, W } = grid.world;
  if (!door || !(dt > 0)) return;
  if (!doorOpen || doorOpen.length !== door.length)
    throw new Error('updateDoors: world.door needs a doorOpen of the same size');
  const { sense, speed, closeDelay } = { ...DOOR_DEFAULTS, ...cfg },
    st = doorState(door),
    { tiles, idle, near } = st,
    half = T / 2;
  near.fill(0);
  for (const m of movers)
    for (let n = 0; n < tiles.length; n++) {
      if (near[n] === (NEAR | OVER)) continue;
      const k = tiles[n],
        dx = Math.abs(m.x - tileCenter(k % W)),
        dz = Math.abs(m.z - tileCenter(Math.floor(k / W))),
        gx = Math.max(dx - half, 0),
        gz = Math.max(dz - half, 0);
      if (gx * gx + gz * gz <= m.r * m.r) near[n] = NEAR | OVER;
      else if (dx * dx + dz * dz <= sense * sense) near[n] |= NEAR;
    }
  for (let n = 0; n < tiles.length; n++) {
    const k = tiles[n];
    if (doorLock && doorLock[k] === 1) {
      // nobody opens it; it only waits for a body in the doorway to get out
      idle[n] = closeDelay;
      if (!(near[n] & OVER)) doorOpen[k] = Math.max(0, doorOpen[k] - speed * dt);
    } else if (near[n]) {
      idle[n] = 0;
      doorOpen[k] = Math.min(1, doorOpen[k] + speed * dt);
    } else {
      idle[n] += dt;
      if (idle[n] >= closeDelay) doorOpen[k] = Math.max(0, doorOpen[k] - speed * dt);
    }
  }
}
