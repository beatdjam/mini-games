import type { PickupKind, Weapon } from '../data/types.ts';
import * as THREE from 'three';
import { basicMat, shared } from '@engine/render/render.ts';
import { RARITY, WEAPONS } from '../data/weapons.ts';
import { COLOR } from '../data/colors.ts';
import { gunLook, hasGunLook } from '../actors/gunLooks.ts';
import { groundPool } from './enemyLooks.ts';
import { TEX, grain, paint } from './looks/common.ts';
import type { Paint } from './looks/common.ts';
// The things lying on the floor as what they are, to go with the sectors, the guns and the enemies: a weapon is
// the gun itself, a kit is a medical case, a chip is a circuit board, a bit is a coin of light. Each stands over a
// pool of light in its own colour (a weapon's is its rarity's), so it is seen from across a room on any floor.
// The plain ones (glowing boxes with outlines, world/models.ts) are still there for comparing (dev: ?plain).
// A pickup's model floats, bobs and turns (flow/update.ts): the pool is hung under it, clear of the ground.

const POOL_DROP = 0.82; // the pool hangs this far under the model's middle (it floats 1 m up and bobs 0.12)
const POOL_SIDE = { kit: 2.2, chip: 2.4, weapon: 2.6 }; // the pool's side (m)
const GUN_SCALE = 2.1; // a gun on the floor against the same gun in hand (it has to be seen from a way off)
const RARE_GROW = 0.12; // a rarer weapon is this much bigger per step, as the plain one was

// a medical case: off-white, a green cross, a dark seam where it opens, two latches
const kitPaint: Paint = (g, rand) => {
  g.fillStyle = '#c9cec6';
  g.fillRect(0, 0, TEX, TEX);
  for (let n = 0; n < 60; n++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.07)';
    g.fillRect(rand() * TEX, rand() * TEX, 6 + rand() * 40, 2 + rand() * 12);
  }
  g.fillStyle = '#2f9a3c';
  g.fillRect(TEX * 0.42, TEX * 0.22, TEX * 0.16, TEX * 0.56);
  g.fillRect(TEX * 0.22, TEX * 0.42, TEX * 0.56, TEX * 0.16);
  g.fillStyle = 'rgba(0,0,0,.5)';
  g.fillRect(0, TEX * 0.1, TEX, 5);
  g.fillStyle = '#3a3f44';
  for (const x of [TEX * 0.16, TEX * 0.76]) g.fillRect(x, TEX * 0.05, TEX * 0.08, TEX * 0.11);
  g.strokeStyle = 'rgba(0,0,0,.45)';
  g.lineWidth = 6;
  g.strokeRect(3, 3, TEX - 6, TEX - 6);
  grain(g, rand, 10);
};
// a circuit board: dark green, gold tracks out from a black chip in the middle, gold fingers along one edge
const boardPaint: Paint = (g, rand) => {
  g.fillStyle = '#12301f';
  g.fillRect(0, 0, TEX, TEX);
  g.strokeStyle = '#c8a03a';
  g.lineWidth = 3;
  for (let n = 0; n < 16; n++) {
    const a = (n / 16) * Math.PI * 2,
      x = TEX / 2 + Math.cos(a) * 46,
      y = TEX / 2 + Math.sin(a) * 46,
      out = 56 + rand() * 34;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.sign(Math.cos(a)) * out, y);
    g.lineTo(x + Math.sign(Math.cos(a)) * out, y + Math.sign(Math.sin(a)) * (10 + rand() * 30));
    g.stroke();
  }
  g.fillStyle = '#0a0b0c';
  g.fillRect(TEX / 2 - 46, TEX / 2 - 46, 92, 92);
  g.fillStyle = '#c8a03a';
  for (let x = 20; x < TEX - 20; x += 16) g.fillRect(x, TEX - 26, 9, 22);
  grain(g, rand, 10);
};
let mats: { kit: THREE.Material; board: THREE.Material; dark: THREE.Material } | null = null;
const shares = () =>
  (mats ??= {
    kit: shared(
      new THREE.MeshLambertMaterial({ map: paint(4001, kitPaint), emissive: 0xffffff, emissiveIntensity: 0.25 }),
    ),
    board: shared(
      new THREE.MeshLambertMaterial({ map: paint(4002, boardPaint), emissive: 0xffffff, emissiveIntensity: 0.2 }),
    ),
    dark: shared(new THREE.MeshLambertMaterial({ color: 0x1a1c1f })),
  });
const geos: Record<string, THREE.BufferGeometry> = {};
const boxGeo = (w: number, h: number, d: number) =>
  (geos[`b${w},${h},${d}`] ??= shared(new THREE.BoxGeometry(w, h, d)));
const coinGeo = () => (geos.coin ??= shared(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 6).rotateX(Math.PI / 2)));
const rimGeo = () => (geos.rim ??= shared(new THREE.CylinderGeometry(0.23, 0.23, 0.03, 6).rotateX(Math.PI / 2)));
const part = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
};
// the pool under a model whose middle floats `drop` over where the pool should hang
const pool = (color: number, side: number) => {
  const p = groundPool(color, side);
  p.position.y = -POOL_DROP;
  return p;
};
// The model of a pickup (a weapon drop takes the weapon `w`); null for a weapon without a look of its own.
// userData.tumble = the part that tumbles as well as turns (a chip's board): the pool must stay level
export function pickupLook(kind: PickupKind, w?: Weapon): THREE.Object3D | null {
  const m = shares(),
    g = new THREE.Group();
  if (kind === 'bit') {
    // a coin of light in a dark rim; no pool (bits come by the handful)
    g.add(part(coinGeo(), basicMat(COLOR.amber)), part(rimGeo(), m.dark));
  } else if (kind === 'kit') {
    g.add(
      part(boxGeo(0.62, 0.46, 0.24), m.kit),
      part(boxGeo(0.22, 0.05, 0.06), m.dark, 0, 0.255, 0), // the handle
      part(boxGeo(0.5, 0.03, 0.25), basicMat(COLOR.lime), 0, -0.1, 0), // the lit band round it
      pool(COLOR.lime, POOL_SIDE.kit),
    );
  } else if (kind === 'chip') {
    const board = new THREE.Group();
    board.add(
      part(boxGeo(0.72, 0.72, 0.05), m.board),
      part(boxGeo(0.2, 0.2, 0.07), basicMat(COLOR.amber)), // the core, lit
      part(boxGeo(0.76, 0.03, 0.06), basicMat(COLOR.amber), 0, 0.37, 0), // the lit edges
      part(boxGeo(0.76, 0.03, 0.06), basicMat(COLOR.amber), 0, -0.37, 0),
    );
    g.add(board, pool(COLOR.amber, POOL_SIDE.chip));
    g.userData.tumble = board;
  } else {
    if (!w || !hasGunLook(w.id)) return null;
    // the gun itself, lying on its side across the view, over a bar and a pool in its rarity's colour
    const gun = gunLook(w.id, WEAPONS[w.id]!.color),
      rare = RARITY[w.r]!.hex,
      box = new THREE.Box3().setFromObject(gun),
      mid = box.getCenter(new THREE.Vector3());
    gun.userData = {};
    gun.position.copy(mid).multiplyScalar(-1);
    const turned = new THREE.Group();
    turned.add(gun);
    turned.rotation.y = Math.PI / 2;
    turned.scale.setScalar(GUN_SCALE * (1 + w.r * RARE_GROW));
    g.add(turned, part(boxGeo(0.9, 0.04, 0.12), basicMat(rare), 0, -0.5, 0), pool(rare, POOL_SIDE.weapon));
  }
  return g;
}
