import type { Rng } from '@engine/core/util.ts';
import { generateArena, generateDungeon } from '@engine/world/dungeon.ts';
import type { Room, TileMapData, TileMaps } from '@engine/world/dungeon.ts';
import { COVER_H, PLAT_H } from '../data/level.ts';
import { BOSS_META } from '../data/bosses.ts';
import type { Biome } from '../data/types.ts';
// The room-and-corridor generator (rooms, decks, rubble, bridges) is the engine's (world/dungeon.ts); this file adds
// the game's parts: the biome's settings, hazard floors, the boss arena's pillars and the start room.
export type { Room, TileMaps };
// ---- tuning numbers used only here (the per-sector numbers are in data/biomes.ts gen) ----
const HAZARD_TRIES = 2000; // attempts to place the hazard floors
const ARENA_SIZE = 20,
  ARENA_FROM = 4,
  ARENA_TO = 16; // boss arena: map side, floor from tile .. to tile
const ARENA_PILLARS: [number, number][] = [
  [6, 6],
  [13, 6],
  [6, 13],
  [13, 13],
]; // pillar tiles of an arena that has pillars
// what generateLevel returns: the tile maps and rooms, before anything touches the tile world or three.js
export interface GeneratedLevel {
  W: number;
  H: number;
  maps: TileMaps;
  hazard: Uint8Array; // per tile: hazard floor
  rooms: Room[];
  startIdx: number; // room index of the start (0 in a boss arena)
}
// hazard floors on plain floor tiles (not on decks, ramps or cover)
export function addHazards(gen: TileMapData, hazard: Uint8Array, count: number, rng: Rng) {
  const { W: w, H: h, maps: M } = gen;
  let placed = 0,
    tries = 0;
  while (placed < count && tries++ < HAZARD_TRIES) {
    const i = rng.randi(1, w - 2),
      j = rng.randi(1, h - 2),
      k = j * w + i;
    if (M.grid[k] !== 1 || M.hgt[k] !== 0 || M.ramp[k] >= 0 || M.cover[k] || hazard[k]) continue;
    hazard[k] = 1;
    placed++;
  }
}

// Everything random in generation draws from rng, so the same seed gives the same level.
export function generateLevel(
  biome: Biome,
  isArena: boolean,
  bossKind: string | null | undefined,
  rng: Rng,
): GeneratedLevel {
  const gen = isArena
    ? generateArena(ARENA_SIZE, ARENA_FROM, ARENA_TO, BOSS_META[bossKind!].pillars ? ARENA_PILLARS : [])
    : generateDungeon({ ...biome.gen, deckH: PLAT_H, coverH: COVER_H }, rng);
  const hazard = new Uint8Array(gen.W * gen.H);
  if (!isArena && biome.gen.hazard) addHazards(gen, hazard, biome.gen.hazard.count, rng);
  let startIdx = 0;
  // the start room: none in it or its doorways, so the first steps of an area can't land on a hazard floor (the
  // spot is the room's middle, so a hazard there put the player right next to others)
  if (!isArena) {
    startIdx = rng.randi(0, gen.rooms.length - 1);
    const R = gen.rooms[startIdx]!;
    for (let j = R.y - 1; j <= R.y + R.h; j++)
      for (let i = R.x - 1; i <= R.x + R.w; i++)
        if (i >= 0 && j >= 0 && i < gen.W && j < gen.H) hazard[j * gen.W + i] = 0;
  }
  return { W: gen.W, H: gen.H, maps: gen.maps, hazard, rooms: gen.rooms, startIdx };
}
