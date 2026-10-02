import type { Biome } from '../data/types.ts';
import * as THREE from 'three';
import { renderer, shared } from '@engine/render/render.ts';
export const rocketGeo = new THREE.CylinderGeometry(0.1, 0.14, 0.7, 8);
rocketGeo.rotateX(Math.PI / 2);
// shared shapes by name (enemy defs pick theirs with `geo`)
export const geoCache: Record<string, THREE.BufferGeometry> = {
  pbullet: shared(new THREE.BoxGeometry(0.07, 0.07, 1.1)),
  rocket: shared(rocketGeo),
  ebullet: shared(new THREE.SphereGeometry(0.22, 8, 6)),
  bit: shared(new THREE.OctahedronGeometry(0.22)),
  tetra: shared(new THREE.TetrahedronGeometry(0.8)),
  octa: shared(new THREE.OctahedronGeometry(0.62)),
  cyl: shared(new THREE.CylinderGeometry(0.5, 0.85, 1.8, 8)),
  box: shared(new THREE.BoxGeometry(1.9, 2.2, 1.9)),
  chip: shared(new THREE.BoxGeometry(0.5, 0.5, 0.5)),
  chipOuter: shared(new THREE.BoxGeometry(0.85, 0.85, 0.85)),
  wbox: shared(new THREE.BoxGeometry(1.0, 0.32, 0.32)),
  cross1: shared(new THREE.BoxGeometry(0.6, 0.2, 0.2)),
  cross2: shared(new THREE.BoxGeometry(0.2, 0.6, 0.2)),
  wave: shared(new THREE.CylinderGeometry(1, 1, 1.1, 56, 1, true)),
  rod: shared(new THREE.BoxGeometry(0.45, 1.9, 0.45)),
  slab: shared(new THREE.BoxGeometry(1.1, 1.8, 0.9)),
  ico: shared(new THREE.IcosahedronGeometry(0.55)),
  dodeca: shared(new THREE.DodecahedronGeometry(0.8)),
  tetraS: shared(new THREE.TetrahedronGeometry(0.45)),
  shieldPlate: shared(new THREE.BoxGeometry(1.8, 2.0, 0.12)),
  // the trooper's parts (buildHumanoid)
  hTorso: shared(new THREE.BoxGeometry(0.62, 0.7, 0.38)),
  hHead: shared(new THREE.BoxGeometry(0.34, 0.32, 0.34)),
  hVisor: shared(new THREE.BoxGeometry(0.26, 0.08, 0.04)),
  hArm: shared(new THREE.BoxGeometry(0.17, 0.62, 0.19)),
  hLeg: shared(new THREE.BoxGeometry(0.22, 0.98, 0.25)),
  hGun: shared(new THREE.BoxGeometry(0.11, 0.55, 0.13)), // long along the arm
};
export const edgeCache: Record<string, THREE.EdgesGeometry> = {};
export function edges(key: string): THREE.EdgesGeometry {
  return edgeCache[key] || (edgeCache[key] = shared(new THREE.EdgesGeometry(geoCache[key])));
}
// textures
export function makeTex(bg: string, line: string, kind: 'floor' | 'wall'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = line;
  g.fillStyle = line;
  if (kind === 'floor') {
    g.globalAlpha = 0.85;
    g.lineWidth = 2;
    g.strokeRect(1, 1, 126, 126);
    g.globalAlpha = 0.25;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(64, 0);
    g.lineTo(64, 128);
    g.moveTo(0, 64);
    g.lineTo(128, 64);
    g.stroke();
    g.globalAlpha = 0.6;
    g.fillRect(60, 60, 8, 8);
  } else {
    g.globalAlpha = 1;
    g.lineWidth = 3;
    g.strokeRect(2, 2, 124, 124);
    g.globalAlpha = 0.35;
    g.lineWidth = 1;
    for (let y = 18; y < 128; y += 18) {
      g.beginPath();
      g.moveTo(10, y);
      g.lineTo(118, y);
      g.stroke();
    }
    g.globalAlpha = 0.9;
    g.fillRect(12, 52, 34, 4);
    g.fillRect(84, 76, 30, 4);
    g.fillRect(12, 100, 8, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return t;
}
export interface BiomeTextures {
  floor: THREE.CanvasTexture;
  tile: THREE.CanvasTexture;
  wall: THREE.CanvasTexture;
}
export const texCache: Record<string, BiomeTextures> = {};
export function biomeTex(b: Biome): BiomeTextures {
  if (texCache[b.code]) return texCache[b.code];
  const floor = makeTex(b.floor, b.line, 'floor');
  floor.wrapS = floor.wrapT = THREE.RepeatWrapping;
  return (texCache[b.code] = {
    floor,
    tile: makeTex(b.floor, b.line, 'floor'),
    wall: makeTex(b.wall, b.wallLine, 'wall'),
  });
}
