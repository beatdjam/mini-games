import * as THREE from 'three';
import { H, T, W, hgt } from '@engine/world/tiles.ts';
import type { Biome } from '../data/types.ts';
import { player, damagePlayer, damageScaleAt, run } from '../actors/player.ts';
import { level } from './level.ts';
const HAZARD_CYCLE = 3; // hazard floor cycle (s): live, then off
const HAZARD_LIVE = 1.4; // seconds live (an area starts right after this: hazards off)
const HAZARD_WARN_FROM = 2.5; // blinks from here to the end of the cycle
const HAZARD_DMG = 7; // hazard floor damage (x damageScaleAt)
const HAZARD_REACH_Y = 0.3; // standing this far above the floor still gets hurt (m)
let hazMat: THREE.MeshBasicMaterial | null = null; // material of the hazard floor
let hazT = 0; // hazard floor clock (s)
export function setHazardClock(v: number) {
  hazT = v;
} // tests
// the floor tiles of the hazard layer, drawn into the level group; starts the clock (an area starts with the hazards
// off: about 1 s before they blink, 1.6 s before they go live)
export function buildHazardMesh(biome: Biome, hazardTiles: Uint8Array, group: THREE.Group) {
  const m = new THREE.Matrix4();
  const hz: number[] = [];
  for (let k = 0; k < W * H; k++) if (hazardTiles[k]) hz.push(k);
  if (hz.length) {
    hazMat = new THREE.MeshBasicMaterial({
      color: biome.gen.hazard.color,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });
    const pg = new THREE.PlaneGeometry(T * 0.94, T * 0.94);
    pg.rotateX(-Math.PI / 2);
    const im = new THREE.InstancedMesh(pg, hazMat, hz.length);
    hz.forEach((k, n) => {
      m.makeTranslation(((k % W) + 0.5) * T, hgt[k] + 0.04, (((k / W) | 0) + 0.5) * T);
      im.setMatrixAt(n, m);
    });
    im.instanceMatrix.needsUpdate = true;
    group.add(im);
  }
  hazT = HAZARD_LIVE;
}
// the level is gone: no hazard floor to update
export function clearHazards() {
  hazMat = null;
}
// hazard floors cycle: 1.4s live, 1.6s off, blinking for the last 0.5s before going live
export function hazardState() {
  const t = hazT % HAZARD_CYCLE;
  return t < HAZARD_LIVE ? 'on' : t > HAZARD_WARN_FROM ? 'warn' : 'off';
}
export function updateHazards(dt: number) {
  if (!hazMat) return;
  hazT += dt;
  const st = hazardState();
  hazMat.opacity = st === 'on' ? 0.85 : st === 'warn' ? (Math.sin(hazT * 30) > 0 ? 0.55 : 0.15) : 0.15;
  const i = Math.floor(player.x / T),
    j = Math.floor(player.z / T),
    k = j * W + i;
  if (st === 'on' && i >= 0 && j >= 0 && i < W && j < H && level.hazardTiles[k] && player.fy < hgt[k] + HAZARD_REACH_Y)
    damagePlayer(HAZARD_DMG * damageScaleAt(run.stage));
}
