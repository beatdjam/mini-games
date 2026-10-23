import type * as THREE from 'three';
import { canvasTex } from '../paint.ts';
import { seeded, soil } from '../cutoutTools.ts';
// The shopping mall's painted set pieces (see looks/dress.ts): so far the side of a raised deck only. The decks of the
// mall are the planters and stages of its concourse.

const PLANTER_TILES = ['#6f7a68', '#68735f', '#78826f', '#636d5b']; // sage glazed tiles gone dull
const PLANTER_BRASS = '#a58b4c';
// The side of a raised deck of the mall, a tile wide and a deck high: the tiled edge of a planter, small square
// tiles in a dull green glaze, a brass line along the top under a pale stone cap, dust and old water marks at the
// foot
export function mallDeckTex(): THREE.CanvasTexture {
  const rand = seeded(3301),
    W = 256,
    H = 128,
    tile = 16;
  return canvasTex(W, H, g => {
    g.fillStyle = '#566151';
    g.fillRect(0, 0, W, H);
    for (let y = 22; y < H; y += tile)
      for (let x = ((y / tile) % 2) * (tile / 2) - tile / 2; x < W; x += tile) {
        g.fillStyle = PLANTER_TILES[Math.floor(rand() * PLANTER_TILES.length)]!;
        g.fillRect(x + 0.6, y + 0.6, tile - 1.2, tile - 1.2);
        g.fillStyle = 'rgba(230,240,255,.1)';
        g.fillRect(x + 0.6, y + 0.6, tile - 1.2, 2);
      }
    g.fillStyle = '#8e8a79'; // the stone cap
    g.fillRect(0, 0, W, 13);
    g.fillStyle = 'rgba(255,248,226,.2)';
    g.fillRect(0, 0, W, 2);
    g.fillStyle = PLANTER_BRASS; // the brass line
    g.fillRect(0, 14, W, 4);
    g.fillStyle = 'rgba(255,244,200,.35)';
    g.fillRect(0, 14, W, 1.2);
    g.fillStyle = 'rgba(0,0,0,.3)';
    g.fillRect(0, 18, W, 3);
    soil(g, rand, W, H, H * 0.5);
  });
}
