// The blast points and the charges on them as the screen draws them (SB-1500): a ring on the ground for every point with
// no charge on it, and a small blinking box for every charge planted. One InstancedMesh each, so two draws in all; a frame
// makes no mesh, geometry or material. It reads GameModel and never writes it.
import * as THREE from 'three';
import { scene } from '@engine/render/index.ts';
import { BLAST_POINT_COLOR, CHARGE_COLOR } from '../data/colors.ts';
import type { MapDef } from '../data/types.ts';
import type { GameModel } from '../logic/game.ts';

export const BLAST_POINT_MESH_NAME = 'sb-blast-points';
export const CHARGE_MESH_NAME = 'sb-charges';
export const MAX_BLAST_RINGS = 12; // the most points drawn at once; SB-1500's next cards add the pillboxes' points

const MAX_CHARGES = 12; // the most charges drawn at once; the rest still count down unseen
const RING_INNER = 1.7; // the point's ring (m)
const RING_OUTER = 2.4;
const RING_SEGMENTS = 32;
const GROUND_LIFT = 0.07; // how far above the ground the ring sits, so it does not fight it (m)
const CHARGE_SIZE = 0.7; // the charge box's width and depth (m)
const CHARGE_HEIGHT = 0.5; // its height (m)
const CHARGE_LIFT = 0.05; // its bottom sits this far above the ground (m)
const CHARGE_BLINK_HZ = 9; // how fast the box's light goes up and down (1/s)

export interface BlastView {
  points: THREE.InstancedMesh;
  charges: THREE.InstancedMesh;
}

function instanced(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, max: number) {
  const mesh = new THREE.InstancedMesh(geometry, material, max);
  mesh.name = name;
  // the instances come and go, so the bounding sphere made at the start would cull them
  mesh.frustumCulled = false;
  // The colours are made before the first draw because three r128 creates the buffer inside setColorAt, and its length
  // comes from the mesh's count: count must still be the capacity here, so it is set to 0 after this loop.
  const white = new THREE.Color(0xffffff);
  for (let i = 0; i < max; i++) mesh.setColorAt(i, white);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  scene.add(mesh);
  return mesh;
}

// Builds the rings and charges into the scene, with nothing drawn yet. The map fixes how many points there can be, but
// the mesh keeps MAX_BLAST_RINGS so a later card can add the pillboxes' points without building it again.
export function buildBlastView(_map: MapDef): BlastView {
  const ring = new THREE.RingGeometry(RING_INNER, RING_OUTER, RING_SEGMENTS).rotateX(-Math.PI / 2);
  const box = new THREE.BoxGeometry(CHARGE_SIZE, CHARGE_HEIGHT, CHARGE_SIZE);
  return {
    points: instanced(
      BLAST_POINT_MESH_NAME,
      ring,
      new THREE.MeshBasicMaterial({ color: BLAST_POINT_COLOR, side: THREE.DoubleSide }),
      MAX_BLAST_RINGS,
    ),
    charges: instanced(CHARGE_MESH_NAME, box, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_CHARGES),
  };
}

const place = new THREE.Object3D();
const tint = new THREE.Color();

// Writes a ring for every point that has no charge and a blinking box for every charge, and sets how many are drawn.
export function drawBlasts(view: BlastView, game: GameModel): void {
  let rings = 0;
  for (const blast of game.blasts) {
    if (rings === MAX_BLAST_RINGS) break;
    if (game.charges.some(charge => charge.blast === blast.id)) continue;
    place.position.set(blast.x, GROUND_LIFT, blast.z);
    place.rotation.set(0, 0, 0);
    place.scale.set(1, 1, 1);
    place.updateMatrix();
    view.points.setMatrixAt(rings, place.matrix);
    rings++;
  }
  view.points.count = rings;
  view.points.instanceMatrix.needsUpdate = true;

  let drawn = 0;
  for (const charge of game.charges) {
    if (drawn === MAX_CHARGES) break;
    const blast = game.blasts.find(place => place.id === charge.blast);
    if (!blast) continue;
    place.position.set(blast.x, CHARGE_LIFT + CHARGE_HEIGHT / 2, blast.z);
    place.rotation.set(0, 0, 0);
    place.scale.set(1, 1, 1);
    place.updateMatrix();
    view.charges.setMatrixAt(drawn, place.matrix);
    // the light goes down and up as the fuse burns; its pace does not change, so the box reads as alive
    const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(game.time * CHARGE_BLINK_HZ + drawn));
    view.charges.setColorAt(drawn, tint.setHex(CHARGE_COLOR).multiplyScalar(pulse));
    drawn++;
  }
  view.charges.count = drawn;
  view.charges.instanceMatrix.needsUpdate = true;
  if (view.charges.instanceColor) view.charges.instanceColor.needsUpdate = true;
}

// Takes the two meshes out of the scene and frees them.
export function removeBlastView(view: BlastView): void {
  for (const mesh of [view.points, view.charges]) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose(); // built above as a single material
    mesh.dispose();
  }
}
