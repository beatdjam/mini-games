import type { Rng } from '../core/util.ts';
import { COVER_H, DECK_H, SINK_EDGE, SINK_FLOOR, SIDE_NX, SIDE_NZ, SIDE_PX, SIDE_PZ } from './tiles.ts';
import type { Room, TileMaps } from './dungeonBase.ts';
import { roomCenter } from './dungeonBase.ts';
// engine: the dungeon's decorations: raised decks, sunken squares, rubble and bridges. Works on the maps the generator
// laid out (see dungeonGen.ts); every random draw comes from the rng you pass. No three.js, no DOM.
const BRIDGE_MIN_LEN = 5; // shortest straight corridor run (tiles) that can become a walkway

// raised deck inside the room; the outer ring stays at ground level so every doorway still connects
export function addPlatform(maps: TileMaps, w: number, r: Room, deckH = DECK_H) {
  for (let j = r.y + 2; j <= r.y + r.h - 2; j++)
    for (let i = r.x + 1; i <= r.x + r.w - 2; i++) maps.hgt[j * w + i] = deckH;
  // the ramp up to the deck: in the ring's top row, in the middle column, rising toward the deck
  const k = (r.y + 1) * w + roomCenter(r)[0];
  maps.ramp[k] = SIDE_PZ;
  maps.hgt[k] = 0;
  r.plat = true;
}
// A square sunk into the room's floor: the room's tiles one in from its walls (so the walls keep a ground-level aisle,
// and every doorway still opens on it), the outer ring of those at SINK_EDGE and the tiles inside it at SINK_FLOOR. No
// SINK_FLOOR tile touches (even at a corner) a tile that is not sunk, so every neighbour differs by one step at most.
// Only plain floor and cover sink (a cover tile keeps its height over the sunk floor); a door, a ramp, a deck and the
// tiles `skip` says no to (the game's own: a stairwell, a hazard floor) stay, and the sunk tiles round them are edge.
// Returns the sunk tiles (indexes). No random numbers
export function sinkRect(
  maps: TileMaps,
  w: number,
  r: Room,
  skip?: (k: number) => boolean,
  coverH = COVER_H,
): number[] {
  const ok = new Set<number>();
  for (let j = r.y + 1; j <= r.y + r.h - 2; j++)
    for (let i = r.x + 1; i <= r.x + r.w - 2; i++) {
      const k = j * w + i;
      // (hgt is single precision: the cover height as stored)
      const plain = maps.hgt[k] === 0 || (maps.cover[k] && maps.hgt[k] === Math.fround(coverH));
      if (maps.grid[k] === 1 && plain && maps.ramp[k] < 0 && !maps.door?.[k] && !skip?.(k)) ok.add(k);
    }
  const sunk = [...ok];
  const level = (k: number) => {
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (!ok.has(k + dj * w + di)) return SINK_EDGE;
    return SINK_FLOOR;
  };
  const levels = sunk.map(level);
  sunk.forEach((k, n) => {
    maps.hgt[k] = levels[n]! + (maps.cover[k] ? coverH : 0);
  });
  return sunk;
}
// waist-high cover scattered in the room (rate = chance per tile); never on the middle, next to other cover or on a deck
export function addRubble(maps: TileMaps, w: number, r: Room, rate: number, rng: Rng, coverH = COVER_H) {
  const [cx, cy] = roomCenter(r);
  for (let j = r.y + 1; j <= r.y + r.h - 2; j++)
    for (let i = r.x + 1; i <= r.x + r.w - 2; i++) {
      const k = j * w + i;
      if ((i === cx && j === cy) || maps.hgt[k] > 0 || maps.ramp[k] >= 0 || rng.next() > rate) continue;
      let ok = true;
      for (let dj = -1; dj <= 1 && ok; dj++)
        for (let di = -1; di <= 1; di++) {
          const n = (j + dj) * w + i + di;
          if (maps.cover[n] || maps.ramp[n] >= 0 || maps.hgt[n] > 0) {
            ok = false;
            break;
          }
        }
      if (ok) {
        maps.cover[k] = 1;
        maps.hgt[k] = coverH;
      }
    }
}

// a straight corridor run: hor = runs along x (else along y); a..b = its first and last tile along the run;
// c = the row (hor) or column of the run
interface BridgeRun {
  hor: boolean;
  a: number;
  b: number;
  c: number;
}
// index of the tile at position t along the run line c (a row when hor, else a column)
const runTile = (w: number, hor: boolean, c: number, t: number): number => (hor ? c * w + t : t * w + c);
// a corridor tile that nothing is built on yet
const isFreeCorridor = (maps: TileMaps, k: number): boolean =>
  maps.grid[k] === 1 &&
  maps.roomOf[k] < 0 &&
  maps.hgt[k] === 0 &&
  maps.ramp[k] < 0 &&
  !maps.cover[k] &&
  !maps.door?.[k];
// the straight runs (at least BRIDGE_MIN_LEN long, walls on both sides) along x (hor) or along y, line by line
function findBridgeRuns(maps: TileMaps, w: number, h: number, hor: boolean): BridgeRun[] {
  const g = maps.grid;
  const lineCount = hor ? h : w; // rows when scanning along x, else columns
  const lineLen = hor ? w : h; // tiles along one line
  const sideStep = hor ? w : 1; // index step to the tile on either side of a line
  const runs: BridgeRun[] = [];
  for (let c = 1; c < lineCount - 1; c++) {
    let start = -1;
    for (let t = 1; t < lineLen; t++) {
      const k = runTile(w, hor, c, t);
      const ok = t < lineLen - 1 && isFreeCorridor(maps, k) && !g[k - sideStep] && !g[k + sideStep];
      if (ok && start < 0) start = t;
      if (!ok && start >= 0) {
        if (t - start >= BRIDGE_MIN_LEN) runs.push({ hor, a: start, b: t - 1, c });
        start = -1;
      }
    }
  }
  return runs;
}
// straight 1-wide corridor runs (walls on both sides) become raised walkways with a ramp at each end
export function addBridges(maps: TileMaps, w: number, h: number, count: number, rng: Rng, deckH = DECK_H) {
  const runs = [...findBridgeRuns(maps, w, h, true), ...findBridgeRuns(maps, w, h, false)];
  rng
    .shuffle(runs)
    .slice(0, count)
    .forEach(r => {
      const tile = (t: number) => runTile(w, r.hor, r.c, t);
      maps.ramp[tile(r.a)] = r.hor ? SIDE_PX : SIDE_PZ;
      maps.ramp[tile(r.b)] = r.hor ? SIDE_NX : SIDE_NZ;
      for (let t = r.a + 1; t < r.b; t++) maps.hgt[tile(t)] = deckH;
    });
}
