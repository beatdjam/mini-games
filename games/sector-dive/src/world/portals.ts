import * as THREE from 'three';
import { distXZ } from '@engine/core/util.ts';
import { textSprite } from '@engine/render/render.ts';
import { floorY } from '@engine/world/tiles.ts';
import { PORTAL } from '../data/level.ts';
import type { PortalKind } from '../data/types.ts';
import { player } from '../actors/player.ts';
import { level } from './level.ts';
// a gate: kind 'next' (on to the next area) or 'extract' (back to base)
// t: seconds since it appeared; clear: the player has been away from it since then (both needed before it works)
export interface Portal {
  x: number;
  z: number;
  g: THREE.Group;
  ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  disc: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  kind: PortalKind;
  color: number;
  t: number;
  clear: boolean;
}
export function makePortal(x: number, z: number, color: number, kind: PortalKind, label: string) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.5, 0.12, 8, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 }),
  );
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.4, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  const base = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 1.9, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = -1.55;
  g.add(ring, disc, base);
  if (label) {
    const s = textSprite(label, '#' + color.toString(16).padStart(6, '0'));
    s.position.y = 2.4;
    g.add(s);
  }
  g.position.set(x, floorY(x, z) + PORTAL.centerY, z);
  level.group!.add(g); // gates are made after the level is built
  const clear = !player || distXZ(player, { x, z }) >= PORTAL.clearR; // opened underfoot: wait until the player steps off
  level.portals.push({ x, z, g, ring, disc, kind, color, t: 0, clear });
}
