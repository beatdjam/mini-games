import * as THREE from 'three';
import { distXZ } from '@engine/core/util.ts';
import { textSprite } from '@engine/render/render.ts';
import { floorY } from '@engine/world/tiles.ts';
import { PORTAL } from '../data/level.ts';
import type { PortalKind } from '../data/types.ts';
import { player } from '../actors/player.ts';
import { level } from './level.ts';
import { plainLooks } from './looks.ts';
import { TEX, grain, paint } from './looks/common.ts';
import type { Paint } from './looks/common.ts';
// ---- the gate's frame (with the looks on): two posts and a beam of dark steel, black and yellow at the posts' feet,
// a lamp on each post and a strip under the beam in the gate's colour, a steel plate on the ground ----
const GATE = { halfW: 1.78, post: 0.3, top: 1.9, beam: 0.3, plate: 2.15 }; // m, about the gate's middle (1.7 m up)
const framePaint: Paint = (g, rand) => {
  const base = g.createLinearGradient(0, 0, TEX, 0);
  base.addColorStop(0, '#2c3035');
  base.addColorStop(0.5, '#454b52');
  base.addColorStop(1, '#262a2e');
  g.fillStyle = base;
  g.fillRect(0, 0, TEX, TEX);
  for (let n = 0; n < 80; n++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.14)';
    g.fillRect(rand() * TEX, rand() * TEX, 4 + rand() * 30, 6 + rand() * 40);
  }
  // the warning band at the foot
  g.save();
  g.beginPath();
  g.rect(0, TEX * 0.84, TEX, TEX * 0.16);
  g.clip();
  g.fillStyle = '#c7a132';
  g.fillRect(0, TEX * 0.84, TEX, TEX * 0.16);
  g.fillStyle = '#16140f';
  for (let x = -60; x < TEX; x += 64) {
    g.beginPath();
    g.moveTo(x, TEX);
    g.lineTo(x + 40, TEX * 0.84);
    g.lineTo(x + 72, TEX * 0.84);
    g.lineTo(x + 32, TEX);
    g.fill();
  }
  g.restore();
  grain(g, rand, 12);
};
let frameMat: THREE.Material | null = null,
  plateMat: THREE.Material | null = null;
function gateFrame(color: number): THREE.Group {
  frameMat ??= new THREE.MeshLambertMaterial({
    map: paint(5001, framePaint),
    emissive: 0xffffff,
    emissiveIntensity: 0.18,
  });
  plateMat ??= new THREE.MeshLambertMaterial({ color: 0x2a2e33 });
  const f = new THREE.Group(),
    glow = new THREE.MeshBasicMaterial({ color }),
    box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      f.add(m);
    },
    foot = -PORTAL.centerY, // the ground, seen from the gate's middle
    postH = GATE.top - foot;
  for (const side of [-1, 1]) {
    box(GATE.post, postH, GATE.post, frameMat, side * GATE.halfW, foot + postH / 2);
    box(GATE.post + 0.06, 0.16, GATE.post + 0.06, glow, side * GATE.halfW, GATE.top - 0.5); // the lamp round the post
  }
  box(GATE.halfW * 2 + GATE.post + 0.2, GATE.beam, GATE.post + 0.08, frameMat, 0, GATE.top + GATE.beam / 2);
  box(GATE.halfW * 2 - GATE.post, 0.05, 0.1, glow, 0, GATE.top - 0.03); // the strip under the beam
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(GATE.plate, GATE.plate, 0.06, 28), plateMat);
  plate.position.y = foot + 0.03;
  f.add(plate);
  return f;
}
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
  // with the looks on, the gate is a steel frame on a plate, its lamps and the light inside it in the gate's colour;
  // the ring and the disc (what shows whether it works yet: flow/update.ts) are the light inside the frame
  const framed = !plainLooks();
  if (framed) g.add(gateFrame(color));
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.5, framed ? 0.05 : 0.12, 8, 40),
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
  g.add(ring, disc);
  if (!framed) g.add(base);
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
