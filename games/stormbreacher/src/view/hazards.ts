// The hazards as the screen draws them (SB-190): the ring of each warned shell on the ground and a disc for each mine,
// one instanced mesh each (so two draws in all). A shell's ring keeps the blast's radius and goes from dark to bright as
// it nears landing. It reads GameModel and never writes it.
import * as THREE from 'three';
import { scene } from '@engine/render/index.ts';
import { MINE_COLOR, SHELL_LAND_COLOR, SHELL_WARN_COLOR } from '../data/colors.ts';
import { MINE_TUNE } from '../data/hazards.ts';
import type { GameModel } from '../logic/game.ts';

export const SHELL_MESH_NAME = 'sb-shells';
export const MINE_MESH_NAME = 'sb-mines';

const MAX_SHELLS = 16; // the most shells drawn at once; the rest fall unseen
const MAX_MINES = 64; // the most mines drawn at once
const RING_INNER = 0.88; // the ring's inner radius as a share of its outer one
const RING_SEGMENTS = 48;
const GROUND_LIFT = 0.06; // how far above the ground the ring and the discs sit, so they do not fight with it (m)
const DISC_SEGMENTS = 16;

export interface HazardView {
  shells: THREE.InstancedMesh;
  mines: THREE.InstancedMesh;
}

function instanced(name: string, geometry: THREE.BufferGeometry, max: number, color: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }), max);
  mesh.name = name;
  mesh.count = 0;
  // the instances change as the game goes on, so the bounding sphere made at the start would cull them
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

// Builds the two meshes into the scene, with nothing drawn yet.
export function buildHazardView(): HazardView {
  const ring = new THREE.RingGeometry(RING_INNER, 1, RING_SEGMENTS);
  ring.rotateX(-Math.PI / 2);
  const disc = new THREE.CircleGeometry(1, DISC_SEGMENTS);
  disc.rotateX(-Math.PI / 2);
  return {
    // the instance colour multiplies the white base, so each ring takes its own shade
    shells: instanced(SHELL_MESH_NAME, ring, MAX_SHELLS, 0xffffff),
    mines: instanced(MINE_MESH_NAME, disc, MAX_MINES, MINE_COLOR),
  };
}

const place = new THREE.Object3D();
const warn = new THREE.Color(SHELL_WARN_COLOR);
const land = new THREE.Color(SHELL_LAND_COLOR);
const tint = new THREE.Color();

// Writes each shell's ring and each mine's disc, and sets how many are drawn.
export function drawHazards(view: HazardView, game: GameModel): void {
  const shells = Math.min(game.shells.length, MAX_SHELLS);
  for (let i = 0; i < shells; i++) {
    const shell = game.shells[i];
    place.position.set(shell.x, GROUND_LIFT, shell.z);
    place.scale.set(shell.radius, 1, shell.radius);
    place.updateMatrix();
    view.shells.setMatrixAt(i, place.matrix);
    // the share of the warning that has gone: 0 when it comes, 1 at the landing
    const gone = 1 - Math.max(0, Math.min(1, shell.left / shell.warn));
    view.shells.setColorAt(i, tint.copy(warn).lerp(land, gone));
  }
  view.shells.count = shells;
  view.shells.instanceMatrix.needsUpdate = true;
  if (view.shells.instanceColor) view.shells.instanceColor.needsUpdate = true;

  const mines = Math.min(game.mines.length, MAX_MINES);
  for (let i = 0; i < mines; i++) {
    const mine = game.mines[i];
    place.position.set(mine.x, GROUND_LIFT, mine.z);
    place.scale.set(MINE_TUNE.size.w / 2, 1, MINE_TUNE.size.d / 2);
    place.updateMatrix();
    view.mines.setMatrixAt(i, place.matrix);
  }
  view.mines.count = mines;
  view.mines.instanceMatrix.needsUpdate = true;
}

// Takes the meshes out of the scene.
export function removeHazardView(view: HazardView): void {
  for (const mesh of [view.shells, view.mines]) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose(); // built above as a single material
    mesh.dispose();
  }
}
