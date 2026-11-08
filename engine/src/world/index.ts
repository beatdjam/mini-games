// engine/world: the public entry for the world folder. Games import from here, not from the files inside.
// The names a game may use are re-exported below; types come from the module that owns them.

export { isDoorLocked, lockDoor, updateDoors } from './doors.ts';
export type { DoorMover } from './doors.ts';
export type { Room, TileMaps } from './dungeonBase.ts';
export { sinkRect } from './dungeonDecor.ts';
export { generateArena, generateDungeon, tileWorldOf } from './dungeonGen.ts';
export type { TileMapData } from './dungeonGen.ts';
export { createFloors } from './floors.ts';
export type { Floors } from './floors.ts';
export {
  aimFan,
  clearPool,
  projHitsTerrain,
  ringAngles,
  steerToward,
  stepProjectile,
  takeFromPool,
} from './projectiles.ts';
export type { Projectile } from './projectiles.ts';
export { placeProps } from './slots.ts';
export type { PropRule, Slot } from './slots.ts';
export {
  allReached,
  around,
  carveCorridorFrom,
  groundsOf,
  makeRoute,
  markAround,
  markLinkOpenings,
  noOpenings,
  placeLink,
  roomDoors,
  roomTiles,
  roomsOnWay,
  thinDoorPairs,
} from './stairwells.ts';
export type { BuildingLink, FloorOpenings, StairwellConfig } from './stairwells.ts';
export { steerChase } from './steer.ts';
export { tileMapFromRows } from './tilemap.ts';
export {
  COVER_H,
  DOOR_PASS,
  H,
  OPPOSITE_SIDE,
  RISE,
  SIDE_STEP,
  SINK_EDGE,
  SINK_FLOOR,
  STEP,
  T,
  W,
  activeTileGrid,
  blocked,
  computeFlow,
  cover,
  floorY,
  flow,
  flowAt,
  flowDir,
  grid,
  hasLOS,
  hgt,
  inBounds,
  isFloor,
  isSolid,
  moveCircle,
  passable,
  ramp,
  setTileWorld,
  tileCenter,
  tileCoord,
  tileIndex,
  walkable,
} from './tiles.ts';
export { alongOpen, facadePicture, facesToward, floorSides, wallSide } from './walls.ts';
export type { WallMap } from './walls.ts';
