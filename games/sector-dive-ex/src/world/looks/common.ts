import type * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
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
