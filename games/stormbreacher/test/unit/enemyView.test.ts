import { expect, test } from 'vitest';
import { camera, scene } from '@engine/render/index.ts';
import { ENEMIES, SOLDIER_KINDS } from '../../src/data/enemies.ts';
import { ENEMY_DETAIL_DISTANCE, ENEMY_KITS } from '../../src/data/enemyLooks.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { newEnemy } from '../../src/logic/enemies.ts';
import { newGame } from '../../src/logic/game.ts';
import { buildEnemyView, drawEnemies, enemyFarMeshName, removeEnemyView } from '../../src/view/enemies.ts';
import { bakeProtoMech } from '../../src/view/mechProtoBake.ts';
import { MAP_FOG } from '../../src/view/world.ts';

test('every part with a colour array holds room for each copy after a draw, and the soldiers carry their colours', () => {
  const view = buildEnemyView();
  const game = newGame(M1B_HAND);
  game.enemies = [
    newEnemy('g-1', 'g', 'grunt', 0, 0),
    newEnemy('h-1', 'h', 'heavy', 5, 0),
    newEnemy('e-1', 'e', 'emplacement', 10, 0),
  ];
  drawEnemies(view, game);
  for (const kind of Object.keys(view) as (keyof typeof view)[]) {
    for (const part of view[kind].parts) {
      const colors = part.mesh.instanceColor;
      if (colors) expect(colors.array.length, `${kind} colour array`).toBeGreaterThanOrEqual(part.mesh.count * 3);
    }
  }
  const grunt = view.grunt.mesh.instanceColor;
  if (!grunt) throw new Error('the grunt has no colour array');
  // a copy multiplies the shape's own colours, so an alive one is white and only a fallen one is tinted
  expect(grunt.array[0] + grunt.array[1] + grunt.array[2], 'grunt alive tint').toBeGreaterThan(0);
  // the enemy side's colours (SB-1480) are baked into the shape, so a white copy is still not black
  expect(view.grunt.mesh.geometry.attributes.color, 'grunt painted shape').toBeDefined();
  expect(view.emplacement.mesh.geometry.attributes.color, 'the nest is not painted').toBeUndefined();
  removeEnemyView(view);
});

// SB-2083: the three roles are baked from their kits, and the far shape keeps fewer shapes than the full one.
test('each enemy role is baked from a mech kit, and its far shape costs fewer triangles', () => {
  for (const kind of SOLDIER_KINDS) {
    const near = bakeProtoMech(ENEMY_KITS[kind], ENEMIES[kind].height, 'full');
    const far = bakeProtoMech(ENEMY_KITS[kind], ENEMIES[kind].height, 'far');
    console.log(`${kind}: near ${near.triangles} triangles, far ${far.triangles}`);
    expect(near.triangles).toBeGreaterThan(0);
    expect(far.triangles).toBeGreaterThan(0);
    expect(far.triangles, kind).toBeLessThan(near.triangles);
    // SB-2086: the box plates and the coarser round shapes bring the far body under its budget
    expect(far.triangles, `${kind} far budget`).toBeLessThanOrEqual(2500);
    expect(near.geometry.attributes.color, `${kind} baked colours`).toBeDefined();
    near.geometry.dispose();
    far.geometry.dispose();
  }
});

// SB-2086: a restarting sortie builds and removes the same view again and again; no mesh stays in the scene.
test('building and removing the enemy view again and again leaves no mesh behind', () => {
  const enemyMeshes = (): string[] =>
    scene.children.map(child => child.name).filter(name => name.startsWith('sb-enemy'));
  for (let round = 0; round < 3; round++) {
    const view = buildEnemyView();
    const game = newGame(M1B_HAND);
    game.enemies = [newEnemy(`g-${round}`, 'g', 'grunt', 0, 0)];
    drawEnemies(view, game);
    expect(enemyMeshes().length, `round ${round} built`).toBeGreaterThan(0);
    removeEnemyView(view);
    expect(enemyMeshes(), `round ${round} removed`).toEqual([]);
  }
  // and a fresh view still draws after those rounds
  const view = buildEnemyView();
  const game = newGame(M1B_HAND);
  game.enemies = [newEnemy('g-last', 'g', 'grunt', 0, 0)];
  drawEnemies(view, game);
  expect(view.grunt.mesh.count + (view.grunt.parts.find(part => part.level === 'far')?.mesh.count ?? 0)).toBe(1);
  removeEnemyView(view);
});

// SB-2083: a copy past its role's distance is written into the far mesh, and one nearer into the full mesh.
test('a distant soldier is drawn in its far shape', () => {
  const view = buildEnemyView();
  const game = newGame(M1B_HAND);
  game.enemies = [newEnemy('g-1', 'g', 'grunt', 0, 0)];
  const was = camera.position.clone();
  try {
    camera.position.set(0, 0, 0);
    drawEnemies(view, game);
    expect(view.grunt.mesh.count, 'near count').toBe(1);
    const farMesh = view.grunt.parts.find(part => part.level === 'far')!.mesh;
    expect(farMesh.count, 'far count near').toBe(0);

    camera.position.set(0, 0, ENEMY_DETAIL_DISTANCE.grunt + 10);
    drawEnemies(view, game);
    expect(view.grunt.mesh.count, 'near count far').toBe(0);
    expect(farMesh.count, 'far count far').toBe(1);
    expect(farMesh.name).toBe(enemyFarMeshName('grunt'));
  } finally {
    camera.position.copy(was);
    removeEnemyView(view);
  }
});

// SB-2086: a copy behind the camera or past the fog is not written; one in front and inside the fog still is.
test('an enemy behind the camera or past the fog is not drawn', () => {
  const view = buildEnemyView();
  const game = newGame(M1B_HAND);
  game.enemies = [newEnemy('g-1', 'g', 'grunt', 0, -10)];
  const was = camera.position.clone();
  const wasQ = camera.quaternion.clone();
  const farMesh = view.grunt.parts.find(part => part.level === 'far')!.mesh;
  try {
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -1);
    drawEnemies(view, game);
    expect(view.grunt.mesh.count, 'in front').toBe(1);

    camera.lookAt(0, 0, 1);
    drawEnemies(view, game);
    expect(view.grunt.mesh.count, 'behind the camera').toBe(0);
    expect(farMesh.count, 'behind the camera (far)').toBe(0);

    // in front again, but past the fog's far plane
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -1);
    game.enemies[0].z = -(MAP_FOG.far + 10);
    drawEnemies(view, game);
    expect(view.grunt.mesh.count, 'past the fog').toBe(0);
    expect(farMesh.count, 'past the fog (far)').toBe(0);
  } finally {
    camera.position.copy(was);
    camera.quaternion.copy(wasQ);
    removeEnemyView(view);
  }
});

// SB-2086: the switch has a band either side of the role's distance, so a soldier stepping back and forth across the line
// keeps the shape it had instead of flickering between the full and the far one.
test('a soldier keeps its shape across the distance switch', () => {
  const view = buildEnemyView();
  const game = newGame(M1B_HAND);
  game.enemies = [newEnemy('g-1', 'g', 'grunt', 0, 0)];
  const detail = ENEMY_DETAIL_DISTANCE.grunt;
  const farMesh = view.grunt.parts.find(part => part.level === 'far')!.mesh;
  const was = camera.position.clone();
  const wasQ = camera.quaternion.clone();
  const at = (distance: number) => {
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
    drawEnemies(view, game);
  };
  try {
    at(detail + 1);
    expect(farMesh.count, 'just past the line').toBe(1);
    at(detail - 1);
    expect(farMesh.count, 'one metre back still far').toBe(1);
    at(detail - 4);
    expect(view.grunt.mesh.count, 'past the band near').toBe(1);
    at(detail + 1);
    expect(view.grunt.mesh.count, 'just past the line still near').toBe(1);
    at(detail + 4);
    expect(farMesh.count, 'past the band far').toBe(1);
  } finally {
    camera.position.copy(was);
    camera.quaternion.copy(wasQ);
    removeEnemyView(view);
  }
});
