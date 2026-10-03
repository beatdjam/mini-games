import { COVER_H, DECK_H } from './tiles.ts';
import { forEachRoomTile, newTileMaps, setDoor } from './dungeon.ts';
import type { Room, TileMapData } from './dungeon.ts';
// engine: Fixed maps written as rows of text, for levels that are drawn by hand (and for tests that need a known
// terrain). The maps use the same encoding as the tile world (world/tiles.ts) and the generators (world/dungeon.ts).

// which character means what, and the heights of the raised tiles (m)
export interface Legend {
  wall: string;
  floor: string;
  deck: string; // raised floor (deckH)
  cover: string; // waist-high cover (coverH); counts as floor
  rampPX: string; // ramp rising toward +x (ramp side 0, the right of the row)
  rampMX: string; // toward -x (side 1)
  rampPZ: string; // toward +z (side 2, the next row down)
  rampMZ: string; // toward -z (side 3, the previous row)
  door: string; // a door on a floor tile (shut at the start); the door maps exist only when a row has one
  deckH: number;
  coverH: number;
}
// A-Z are floor tiles that mark rooms (A = room 0 ...) when the caller gives no room list
export const DEFAULT_LEGEND: Legend = {
  wall: '#',
  floor: '.',
  deck: '=',
  cover: 'c',
  rampPX: '>',
  rampMX: '<',
  rampPZ: 'v',
  rampMZ: '^',
  door: '+',
  deckH: DECK_H,
  coverH: COVER_H,
};

// Parses rows (all the same length) into tile maps. A ramp tile sits at height 0 and rises RISE toward its side, so a
// ramp next to a deck leads up onto it. Rooms: the `rooms` you give (roomOf is filled over each rectangle), or else
// one room per letter A-Z in use (its bounding box; the letters themselves must run from A without gaps).
// Throws on an unknown character or rows of different lengths.
export function tileMapFromRows(rows: string[], legend: Partial<Legend> = {}, rooms?: Room[]): TileMapData {
  const L: Legend = { ...DEFAULT_LEGEND, ...legend },
    H = rows.length,
    W = rows[0]?.length ?? 0,
    maps = newTileMaps(W, H),
    ramps = [L.rampPX, L.rampMX, L.rampPZ, L.rampMZ],
    letters: Room[] = [];
  rows.forEach((row, j) => {
    if (row.length !== W) throw new Error(`tileMapFromRows: row ${j} is ${row.length} wide, expected ${W}`);
    for (let i = 0; i < W; i++) {
      const c = row[i],
        k = j * W + i,
        side = ramps.indexOf(c);
      if (c === L.wall) continue;
      maps.grid[k] = 1;
      if (c === L.floor) continue;
      if (c === L.deck) maps.hgt[k] = L.deckH;
      else if (c === L.cover) {
        maps.cover[k] = 1;
        maps.hgt[k] = L.coverH;
      } else if (side >= 0) maps.ramp[k] = side;
      else if (c === L.door) setDoor(maps, k);
      else if (c >= 'A' && c <= 'Z') {
        const id = c.charCodeAt(0) - 65,
          r = letters[id];
        if (!r) letters[id] = { x: i, y: j, w: 1, h: 1 };
        else {
          const x1 = Math.max(r.x + r.w, i + 1),
            y1 = Math.max(r.y + r.h, j + 1);
          r.x = Math.min(r.x, i);
          r.y = Math.min(r.y, j);
          r.w = x1 - r.x;
          r.h = y1 - r.y;
        }
        maps.roomOf[k] = id;
      } else throw new Error(`tileMapFromRows: unknown character '${c}' at row ${j}, column ${i}`);
    }
  });
  if (rooms) {
    maps.roomOf.fill(-1);
    rooms.forEach((r, id) =>
      forEachRoomTile(r, (i, j) => {
        maps.roomOf[j * W + i] = id;
      }),
    );
    return { W, H, maps, rooms };
  }
  for (let id = 0; id < letters.length; id++)
    if (!letters[id]) throw new Error(`tileMapFromRows: room letter ${String.fromCharCode(65 + id)} is missing`);
  return { W, H, maps, rooms: letters };
}
