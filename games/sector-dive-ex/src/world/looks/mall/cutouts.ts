import type * as THREE from 'three';
import { canvasTex } from '../paint.ts';
import { seeded, soil } from '../cutoutTools.ts';
import { BRASS, HAZARD_YELLOW } from './shared.ts';
// The shopping mall's painted set pieces (see looks/dress.ts): the side of a raised deck and the side of a step down into the
// food court. The decks of the mall are the planters and stages of its concourse.

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

const STEP_STONE = '#6f6857';
const STEP_JOINT = 40; // px between the joints of a step's stone
// The side of a step down into the sunk food court, a tile wide and a step high: warm stone with a joint now and then,
// a yellow safety line along the nosing at the top with a brass strip under it, dust at the foot
export function mallSunkTex(): THREE.CanvasTexture {
  const rand = seeded(3302),
    W = 256,
    H = 32;
  return canvasTex(W, H, g => {
    g.fillStyle = STEP_STONE;
    g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += STEP_JOINT) {
      g.fillStyle = 'rgba(20,16,10,.35)';
      g.fillRect(x, 8, 1.5, H);
    }
    for (let n = 0; n < 60; n++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(255,240,210,.07)' : 'rgba(20,14,8,.16)';
      g.fillRect(rand() * W, 8 + rand() * (H - 8), 2 + rand() * 8, 1);
    }
    g.fillStyle = HAZARD_YELLOW; // the safety line
    g.fillRect(0, 0, W, 5);
    g.fillStyle = 'rgba(255,244,200,.4)';
    g.fillRect(0, 0, W, 1);
    g.fillStyle = BRASS; // the strip under it
    g.fillRect(0, 5, W, 2);
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(0, 7, W, 2);
    soil(g, rand, W, H, H * 0.5);
  });
}
