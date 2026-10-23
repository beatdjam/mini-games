import type * as THREE from 'three';
import type { BlockStyle, StreetThing } from './outside.ts';
import type { Rng } from '@engine/core/util.ts';
import { SIDE_STEP } from '@engine/world/tiles.ts';
import { alongOpen, facesToward, floorSides, wallSide } from '@engine/world/walls.ts';
import type { WallMap } from '@engine/world/walls.ts';
import { CSS_COLOR } from '../../data/colors.ts';
import type { FloorPlan } from '../building.ts';
import { TEX, grain, grime } from './paint.ts';
import type { Paint } from './paint.ts';
// What every sector's look has in common: the shape of a look, which picture a tile gets, and the one picture that
// is the same in all of them (a lift's platform). The looks themselves are in the files next to this one, one per
// sector (world/looks.ts lists them); they are painted with the tools in paint.ts and their props are built with the
// ones in props.ts.
export interface Look {
  walls: THREE.CanvasTexture[];
  floors: THREE.CanvasTexture[];
  deck: THREE.CanvasTexture; // top of raised decks and ramps
  ceiling: THREE.CanvasTexture;
  door: THREE.CanvasTexture; // one leaf of a door (a leaf is half a tile wide and a wall high)
  bossDoor: THREE.CanvasTexture; // ... of the boss room's door
  fog: number; // the colour things fade to in the distance (the sector's own is for the plain look)
  // The hazard floor of a sector that has one: `base` is what the tile is (always shown, so the tile can be told
  // from the floor round it), `glow` is what lights up in the hazard's colour while it is live (world/hazards.ts).
  // Without it the hazard floor is the plain glowing square
  hazard?: { base: THREE.CanvasTexture; glow: THREE.CanvasTexture };
  // The pictures (by number) that take the plain picture's place on a wall along an alley (a wall that has a
  // corridor tile beside it): an alley's walls are all shop fronts, windows and gates, none of them bare. Without
  // it an alley's walls are painted like any other
  laneWalls?: number[];
  // the pictures that go only on some walls (WallSides). Without it any picture goes on any wall
  wallSides?: WallSides;
  // pictures (by number) as they are on a wall that does not face west, where the evening sun does not come in (a
  // window with only the dusk sky in it: facesWest). Without it a picture is the same whichever way it faces
  shadedWalls?: Record<number, THREE.CanvasTexture>;
  // windows one sees out of: for a wall picture (by number), the rectangles of its panes (in the picture's pixels,
  // left, top, right, bottom); there the backdrop is seen instead of the picture, as far away as the sky
  // (levelMesh.ts buildFloorMeshes and engine/src/render/windows.ts, level.ts). The backdrop is the view all round (paint.ts BACKDROP_W). Only where the
  // picture may stand on the building's outside wall (WallSides outer). Without it no window is seen through
  // `frame`: the colour of the frames round them, standing out of the wall (engine windows.ts buildWindowFrames)
  outside?: { panes: Record<number, [number, number, number, number][]>; frame: number } & OutsideView;
  // pictures (by number) as they are seen from outside the building, on a wall with rooms behind it (a yard's walls,
  // the building's own outside: courtMesh.ts): a window seen through has the dark room behind its glass, not the
  // outside (which there would be seen through the building). Without it such a wall has the picture as it is
  innerWalls?: Record<number, THREE.CanvasTexture>;
  // the sides of the raised decks (a picture a tile wide and a deck high). Without it they have the plain wall's
  // picture pressed down to their height, which reads as a lump of wall and not as a thing built there
  deckSide?: THREE.CanvasTexture;
  // the sides of the steps down into a sunk floor (a picture a tile wide and a step high, its top edge along the top)
  // Without it they have the plain wall's picture
  sunkSide?: THREE.CanvasTexture;
  // Walls by room: a room gets one kind of picture (a shop of one kind), so its walls agree. Without it the walls are
  // scattered over the whole tile world the way they always were
  roomWalls?: RoomWalls;
  // The pictures of the walls round a lift (the tile with the lift's platform, a dead end): the first is the face of a
  // wall, the second (if any) goes on the one side wall that is the control panel's. Without it these walls are
  // painted like any other
  liftWalls?: number[];
  // The floors of the rooms, by the kind of room (the same kinds as roomWalls): the pictures of a room's floor, picked
  // like the default floors (the first of a kind's set is the plain one, and comes up most). Without it every floor
  // tile is scattered over all the floors
  roomFloors?: RoomFloors;
  // Which kind each room of a floor is (by room number; -1 = none of them), worked out when the floor is drawn: the
  // kinds roomWalls and roomFloors use
  roomKinds?: (plan: FloorPlan) => number[];
  // The waist-high cover drawn the sector's own way (a sofa, a bench ...) in place of the plain box: given the tiles
  // that are cover (the tile world's collision and height are not touched, this is only what one sees). Without it
  // cover is a box with the wall's picture on its sides
  cover?: (tiles: number[], plan: FloorPlan, group: THREE.Group) => void;
  props: (plan: FloorPlan, group: THREE.Group, rng: Rng) => void;
}
// a look's pictures (the props are built in the file next to them, <sector>/props.ts)
export type Pictures = Omit<Look, 'props'>;
// which picture a tile gets: the same one every time, scattered so that neighbours differ. The first picture is the
// plainest and comes up most (`plainShare` of the tiles)
export function variantOf(k: number, count: number, plainShare: number): number {
  const h = (Math.imul(k + 1, 2654435761) >>> 0) / 4294967296;
  return h < plainShare ? 0 : 1 + (Math.floor((h - plainShare) * 9973) % (count - 1));
}
// is a corridor tile (floor that is in no room) beside this wall tile
export function byLane(
  d: { W: number; maps: { grid: ArrayLike<number>; roomOf: ArrayLike<number> } },
  k: number,
): boolean {
  return [k - 1, k + 1, k - d.W, k + d.W].some(t => d.maps.grid[t] === 1 && d.maps.roomOf[t]! < 0);
}
// The pictures (by number) that go only on some walls (engine/src/world/walls.ts wallSide); on any other wall the
// plain picture stands in their place. `outer`: only on the building's outside wall, where nothing of the floor lies behind the wall out to the map's edge
// (a window with the evening outside, a fire exit). `inner`: only on a thin wall, with floor right behind it (a glass
// partition, with the next room or the corridor beyond it)
// what is seen out of the windows (Look.outside): the band all round (backdrop), the sky straight up in one colour
// (the band's top row's), the ground below it, seen from above (a picture that wraps), going into the haze toward the
// horizon (the band's colour under the horizon), and the buildings across the street (outside.ts: how high they
// stand, the pictures of their faces and roofs, FACADE_M and ROOF_M a repeat, and the light on them). Painted in
// <sector>/backdrop.ts
export interface OutsideView {
  backdrop: THREE.CanvasTexture;
  sky: number;
  ground: THREE.CanvasTexture;
  haze: number;
  blocks: {
    style: BlockStyle;
    facades: THREE.CanvasTexture[];
    roofs: THREE.CanvasTexture[];
    light: [number, number, number][]; // on a face looking toward each side (0: +x ... 3: -z, as in world/tiles.ts)
    roofLight: [number, number, number];
  };
  // what stands on the street among them (outside.ts outsideStreet: trees, lamps, poles), its pictures (with a clear
  // background, the thing's foot at the bottom middle) and the light on them. Without it the street is bare
  street?: { things: StreetThing[]; pics: THREE.CanvasTexture[]; light: [number, number, number] };
}
// The pictures of a sector whose rooms have a kind each (Look.roomWalls; the kind of each room is in wallKinds).
// `plain`: the pictures 0 .. plain - 1 are painted on the sector's own wall, the others on the kind's; `common`: the
// first `common` of them are the ones scattered over every wall that no shop room owns (they take laneWalls too); `shops`: for
// each kind, the pictures of its room's inside walls (ROOM_OWN_SHARE of the wall tiles); `ground`: for each kind, the
// bare wall the rest of them have; `fronts`: for each kind, the pictures of the wall where it meets a corridor, its
// shop front (FRONT_SHARE of those tiles, the rest the ground)
export interface RoomWalls {
  plain: number;
  common: number[];
  shops: number[][];
  ground: number[];
  fronts: number[][];
}
export const ROOM_OWN_SHARE = 0.85;
export const FRONT_SHARE = 0.85;
// the floors by kind of room (Look.roomFloors): `plain` floors are the default ones (0 .. plain - 1); `shops`: for each
// kind, its set (two at least: the first is the plain one)
export interface RoomFloors {
  plain: number;
  shops: number[][];
}
// The lifts and stairwells of a floor, by the floor's grid (world/building.ts): `lifts` the tiles of lift platforms,
// `strips` every tile of every stairwell and lift on it (what the floor is marked on)
export interface FloorLinks {
  lifts: Set<number>;
  strips: Set<number>;
}
export const wallLinks = new WeakMap<ArrayLike<number>, FloorLinks>();
// the picture of a wall tile that a lift's platform stands beside (Look.liftWalls), or null
function liftWallPic(d: WallMap, k: number, liftWalls: number[]): number | null {
  const lifts = wallLinks.get(d.maps.grid)?.lifts;
  if (!lifts?.size) return null;
  for (const [di, dj] of SIDE_STEP) {
    const t = k + dj! * d.W + di!;
    if (d.maps.grid[t] !== 1 || !lifts.has(t)) continue;
    // the way in is the side of the lift's tile that has floor; the control panel is on the side wall with the lower number
    const open = SIDE_STEP.flatMap(([ei, ej], s) => (d.maps.grid[t + ej! * d.W + ei!] === 1 ? [s] : [])),
      side = SIDE_STEP.findIndex(([ei, ej]) => t + ej! * d.W + ei! === k);
    return open.length === 1 && liftWalls.length > 1 && side === (open[0]! < 2 ? 2 : 0) ? liftWalls[1]! : liftWalls[0]!;
  }
  return null;
}
// the kind of each room of a floor, by the floor's grid (Look.roomKinds, set when the floor is drawn)
export const wallKinds = new WeakMap<ArrayLike<number>, number[]>();
export const roomKindOf = (grid: ArrayLike<number>, room: number): number =>
  room >= 0 ? (wallKinds.get(grid)?.[room] ?? -1) : -1;
// a hash of k in 0..1, by multiplier `mul`
const unit = (k: number, mul: number): number => (Math.imul(k + 1, mul) >>> 0) / 4294967296;
// the room a wall tile belongs to (the lowest number of the rooms whose floor lies beside it), or -1 when only
// corridor floor (or none) does
export function roomBeside(
  d: { W: number; maps: { grid: ArrayLike<number>; roomOf: ArrayLike<number> } },
  k: number,
): number {
  let room = -1;
  for (const t of [k - 1, k + 1, k - d.W, k + d.W]) {
    const r = d.maps.grid[t] === 1 ? d.maps.roomOf[t]! : -1;
    if (r >= 0 && (room < 0 || r < room)) room = r;
  }
  return room;
}
// which floor picture a floor tile gets (Look.roomFloors): the tile of a room of a kind has its kind's, any other the
// default scattering over `floors` pictures
export function floorPic(
  d: { maps: { grid: ArrayLike<number>; roomOf: ArrayLike<number> } },
  k: number,
  floors: number,
  rooms?: RoomFloors,
): number {
  if (!rooms) return variantOf(k, floors, FLOOR_PLAIN_SHARE);
  const kind = roomKindOf(d.maps.grid, d.maps.roomOf[k]!);
  if (kind < 0) return variantOf(k, rooms.plain, FLOOR_PLAIN_SHARE);
  const set = rooms.shops[kind]!;
  return set[variantOf(k, set.length, FLOOR_PLAIN_SHARE)]!;
}
export interface WallSides {
  outer?: number[];
  inner?: number[];
  // the window on a wall that faces a courtyard open to the sky, on every other tile (YARD_WINDOW_EVERY), the same
  // columns as the yard's own windows (courtMesh.ts buildYardShell); the tiles between have none of `outer`. Without
  // it such a wall is painted like any outside wall
  yard?: number;
}
// a wall on a yard has a window on every this many tiles (where its place along the wall is odd)
export const YARD_WINDOW_EVERY = 2;
export const yardWindowAt = (along: number): boolean => along % YARD_WINDOW_EVERY === 1;
// The evening sun is in the west, which is toward -x on every map: a wall tile faces west when the floor it is seen
// from lies east of it (a window there looks out at the sun and lets it in)
const WEST = [-1, 0] as const;
export const facesWest = (d: WallMap, k: number): boolean => facesToward(d, k, WEST);
// which picture a wall tile gets: variantOf, but along an alley the plain one gives way to one of `laneWalls`; a
// picture of `sides` on a wall it may not go on gives way to the plain one
export function wallPic(
  d: WallMap & { maps: { roomOf: ArrayLike<number> } },
  k: number,
  count: number,
  laneWalls?: number[],
  sides?: WallSides,
  rooms?: RoomWalls,
  liftWalls?: number[],
): number {
  const v0 = rooms
      ? rooms.common[variantOf(k, rooms.common.length, WALL_PLAIN_SHARE)]!
      : variantOf(k, count, WALL_PLAIN_SHARE),
    room = rooms ? roomBeside(d, k) : -1,
    kind = roomKindOf(d.maps.grid, room),
    lane = byLane(d, k);
  let v: number;
  if (rooms && kind >= 0) {
    // a shop's wall: its front where it meets the corridor, its inside walls elsewhere
    const own = lane ? rooms.fronts[kind]! : rooms.shops[kind]!,
      share = lane ? FRONT_SHARE : ROOM_OWN_SHARE;
    v = unit(k, 2654435769) < share ? own[Math.floor(unit(k + 977, 3266489917) * own.length)]! : rooms.ground[kind]!;
  } else if (rooms && room >= 0 && !lane) v = v0;
  else v = v0 === 0 && laneWalls && lane ? laneWalls[(k * 7 + ((k / d.W) | 0) * 3) % laneWalls.length]! : v0;
  if (liftWalls) v = liftWallPic(d, k, liftWalls) ?? v;
  const beyond = wallBeyond.get(d.maps.grid);
  if (sides?.yard !== undefined) {
    // (only an outside wall: one that a floor sees from another side too is left as it is. A window only where every
    // face a floor sees looks across the yard: the tile at the end of a balcony is seen from the balcony too, at right
    // angles to the yard, and a window there would look into the building)
    const along = alongOpen(d, k, beyond);
    if (along !== null && wallSide(d, k, beyond) === 'outer') {
      const across = floorSides(d, k).every(([di, dj]) => {
        const t = k - dj * d.W - di;
        return beyond?.[t] === 2 && d.maps.grid[t] !== 1;
      });
      return across && yardWindowAt(along) ? sides.yard : sides.outer?.includes(v) ? 0 : v;
    }
  }
  if (!sides || (!sides.outer?.includes(v) && !sides.inner?.includes(v))) return v;
  const side = wallSide(d, k, beyond),
    // (the tile is floor on another floor: the building runs out past this wall above or below it, and its outside,
    // one straight mass, takes that floor in: a window here would look out from inside it, past its walls)
    under = beyond?.[k] === 1;
  return (sides.outer?.includes(v) && side === 'outer' && !under) || (sides.inner?.includes(v) && side === 'inner')
    ? v
    : 0;
}
// What a building's wall looks out on (engine wallSide's `beyond`), registered by the floor's grid (world/building.ts):
// another floor's floor counts as floor (so a wall is outside only where the building as a whole ends, and a window
// there sees out past its own straight walls), a courtyard open to the sky as outside (a window on it sees the yard)
export const wallBeyond = new WeakMap<ArrayLike<number>, ArrayLike<number>>();
// the number of the floor in its building, by the floor's grid (world/building.ts): a room's kind is drawn from it too
export const wallFloor = new WeakMap<ArrayLike<number>, number>();
export const WALL_PLAIN_SHARE = 0.4; // share of the wall tiles that get the plain picture
export const FLOOR_PLAIN_SHARE = 0.6; // ... of the floor tiles

// The top of a lift's platform, the same in every sector with a look (a lift must be known at a glance): a steel
// plate with studs, a lit strip round its rim and an arrow up and one down, both in the lift's colour (violet, as on
// the map)
export const liftPaint: Paint = (g, rand) => {
  const steel = g.createLinearGradient(0, 0, TEX, TEX);
  steel.addColorStop(0, '#5c6269');
  steel.addColorStop(1, '#474c53');
  g.fillStyle = steel;
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 60, '#7c838b', '#22262a');
  // studs, so it reads as a plate to stand on
  g.fillStyle = 'rgba(255,255,255,.13)';
  for (let y = 22; y < TEX; y += 18)
    for (let x = 22 + ((y / 18) % 2) * 9; x < TEX - 14; x += 18) g.fillRect(x, y, 6, 2);
  // the frame and the lit strip inside it
  g.strokeStyle = '#24282c';
  g.lineWidth = 14;
  g.strokeRect(7, 7, TEX - 14, TEX - 14);
  g.strokeStyle = CSS_COLOR.violet;
  g.shadowColor = CSS_COLOR.violet;
  g.shadowBlur = 10;
  g.lineWidth = 4;
  g.strokeRect(20, 20, TEX - 40, TEX - 40);
  // the arrows: one up, one down
  g.fillStyle = CSS_COLOR.violet;
  for (const [cy, dir] of [
    [TEX * 0.36, -1],
    [TEX * 0.64, 1],
  ] as const) {
    g.beginPath();
    g.moveTo(TEX / 2, cy + dir * 26);
    g.lineTo(TEX / 2 - 30, cy - dir * 12);
    g.lineTo(TEX / 2 + 30, cy - dir * 12);
    g.closePath();
    g.fill();
  }
  g.shadowBlur = 0;
  grain(g, rand, 14);
};
