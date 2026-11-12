// The enemies as the screen draws them: one instanced box per kind (so the draw count is the number of kinds), the
// fallen ones low and dark. It reads GameModel and never writes it.
import * as THREE from 'three';
import { scene } from '@engine/render/index.ts';
import { ENEMY_COLOR, ENEMY_DOWN_COLOR } from '../data/colors.ts';
import { ENEMIES, ENEMY_KINDS, type EnemyKind } from '../data/enemies.ts';
import type { GameModel } from '../logic/game.ts';

const MAX_ENEMIES = 64; // the most enemies of one kind drawn at once; the rest walk unseen
const DOWN_SCALE_Y = 0.35; // how low a fallen enemy sits (its height scale)

export type EnemyView = Record<EnemyKind, THREE.InstancedMesh>;

// The name of a kind's mesh in the scene.
export const enemyMeshName = (kind: EnemyKind): string => `sb-enemy-${kind}`;

// Builds one instanced mesh per kind into the scene, with nothing drawn yet.
export function buildEnemyView(): EnemyView {
  const view = {} as EnemyView; // filled for every kind in the loop below
  for (const kind of ENEMY_KINDS) {
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      MAX_ENEMIES,
    );
    mesh.name = enemyMeshName(kind);
    mesh.count = 0;
    // the instances move every frame, so the bounding sphere made at the start would cull them
    mesh.frustumCulled = false;
    scene.add(mesh);
    view[kind] = mesh;
  }
  return view;
}

const place = new THREE.Object3D();
const tint = new THREE.Color();

// Writes each enemy of each kind into its mesh and sets how many are drawn.
export function drawEnemies(view: EnemyView, game: GameModel): void {
  const counts = new Map<EnemyKind, number>(ENEMY_KINDS.map(kind => [kind, 0]));
  for (const enemy of game.enemies) {
    const mesh = view[enemy.kind];
    const at = counts.get(enemy.kind) ?? 0;
    if (at >= MAX_ENEMIES) continue;
    counts.set(enemy.kind, at + 1);
    const def = ENEMIES[enemy.kind];
    const alive = enemy.hp > 0;
    const height = alive ? def.height : def.height * DOWN_SCALE_Y;
    place.position.set(enemy.x, height / 2, enemy.z);
    place.rotation.y = enemy.yaw;
    place.scale.set(def.radius * 2, height, def.radius * 2);
    place.updateMatrix();
    mesh.setMatrixAt(at, place.matrix);
    mesh.setColorAt(at, tint.setHex(alive ? ENEMY_COLOR[enemy.kind] : ENEMY_DOWN_COLOR));
  }
  for (const kind of ENEMY_KINDS) {
    const mesh = view[kind];
    mesh.count = counts.get(kind) ?? 0;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

// Takes the meshes out of the scene.
export function removeEnemyView(view: EnemyView): void {
  for (const kind of ENEMY_KINDS) {
    scene.remove(view[kind]);
    view[kind].geometry.dispose();
    (view[kind].material as THREE.Material).dispose(); // built above as a single material
    view[kind].dispose();
  }
}
