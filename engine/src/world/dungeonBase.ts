// engine: the dungeon's shared parts: a room on the tile grid, the per-tile maps of a level, and helpers over a room.
// No three.js, no DOM.
// a room on the tile grid (tiles); plat = has a raised deck
export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  plat?: boolean;
}
// the per-tile maps of a level, indexed j * W + i (grid: 1 = floor, 0 = wall; the others as in world/tiles.ts)
export interface TileMaps {
  grid: Uint8Array;
  hgt: Float32Array;
  ramp: Int8Array; // -1 = flat
  cover: Uint8Array;
  roomOf: Int8Array; // index of the room the tile is in (-1 = none)
  // only on maps that have doors (setDoor makes them; same meaning as in TileWorld, doors start shut)
  door?: Uint8Array;
  doorOpen?: Float32Array;
}

// the middle tile of a room (x, y)
export function roomCenter(r: Room): [number, number] {
  return [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)];
}
// calls fn(i, j) for every tile of the room, row by row
export function forEachRoomTile(r: Room, fn: (i: number, j: number) => void) {
  for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) fn(i, j);
}
