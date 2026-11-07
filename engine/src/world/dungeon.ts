// The dungeon's parts, split into what makes the map and what decorates it; this file keeps the path the games import.
export { newTileMaps, generateDungeon, tileWorldOf, setDoor, addDoorways, generateArena } from './dungeonGen.ts';
export type { TileMapData, DungeonOptions } from './dungeonGen.ts';
export { forEachRoomTile } from './dungeonBase.ts';
export type { Room, TileMaps } from './dungeonBase.ts';
export { addPlatform, sinkRect, addRubble, addBridges } from './dungeonDecor.ts';
