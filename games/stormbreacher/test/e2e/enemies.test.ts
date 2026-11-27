import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { el, t } from '@engine/core/index.ts';
import { scene } from '@engine/render/index.ts';
import { ENEMY_KINDS, SOLDIER_KINDS, type EnemyKind, type SoldierKind } from '../../src/data/enemies.ts';
import { WARDEN_LAMP_COLOR, WARDEN_VENT_IDLE_COLOR } from '../../src/data/colors.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { currentGame, showResult, startSortie } from '../../src/app/play.ts';
import { state } from '../../src/app/screen.ts';
import { boot } from '../../src/app/boot.ts';
import { newEnemy } from '../../src/logic/enemies.ts';
import { sendToScript } from '../../src/logic/game.ts';
import { enemyFarMeshName, enemyMeshName } from '../../src/view/enemies.ts';
import { steps, untilSteps } from './steps.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

// The tests share one page: each starts the sortie again directly.
beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

function game() {
  const current = currentGame();
  if (!current) throw new Error('the sortie has not started');
  return current;
}

// These tests count the script's enemies only. The front's trickle (SB-2230) would add one of its own from the first
// step, so it is stopped before any: null is the game's mouth for a sortie without it, as `sectors: false` is.
function startSortieWithoutTrickle(): void {
  startSortie();
  game().trickle = null;
}

// Every mesh of a kind: a soldier has the full shape and the far one (SB-2083); the nest has its named sandbags only, and
// so has the mid boss (SB-1850), whose lamps and vents are two more meshes of the same copy (SB-2049).
const meshNamesOf = (kind: EnemyKind): string[] =>
  kind === 'emplacement' || kind === 'warden'
    ? [enemyMeshName(kind)]
    : [enemyMeshName(kind), enemyFarMeshName(kind as SoldierKind)];

// The mesh of every kind; a wave of mixed kinds draws into more than one of them.
const enemyMeshes = (): THREE.Object3D[] =>
  scene.children.filter(child => ENEMY_KINDS.some(kind => meshNamesOf(kind).includes(child.name)));

// How many enemies the scene draws across every kind's mesh. A copy is written into one level only, and one behind the
// camera or past the fog is not written at all (SB-2086), so the sum is what the frame draws.
const drawnEnemies = (): number => enemyMeshes().reduce((sum, mesh) => sum + (mesh as THREE.InstancedMesh).count, 0);

// The follow eases from the cutscene's camera, out at sea, to the quarter view behind the mech, and the fog's far plane
// is measured from wherever the camera stands. Two seconds of the game's time take it to the play pose.
const SETTLE_STEPS = 120;

test('an enemy’s bullet that takes the last armour shows the result with the downed heading', async () => {
  startSortie();
  // The landing cutscene starts on the first step, and no hit takes armour while it plays: a bullet that has not reached
  // the mech in the first frame (a short frame on a busy machine) would hit during it and change nothing. So the
  // cutscene is skipped before the bullet is put out.
  steps(1);
  sendToScript(game(), { kind: 'skip' });
  steps(1);
  const current = game();
  expect(current.script.cutscene).toBeNull();
  current.armor = 1;
  const y = current.mech.y + MECH_TUNE.chestHeight;
  current.bullets.push({ enemy: 'grunt', x: current.mech.x, y, z: current.mech.z - 5, dx: 0, dy: 0, dz: 1, left: 50 });
  try {
    await untilSteps(() => state === 'result');
  } catch (error) {
    const what = `state ${state}, armour ${current.armor}, cutscene ${current.script.cutscene?.id ?? 'none'}`;
    throw new Error(`${(error as Error).message}: ${what}`);
  }
  expect(current.downed).toBe(true);
  expect(el('#sbResult').hidden).toBe(false);
  expect(el('#sbResult .title').textContent).toBe(t('result.downed'));
  expect(t('result.downed')).not.toBe(t('result.title'));
});

test('the script’s end keeps the cleared heading', () => {
  startSortie();
  showResult();
  expect(el('#sbResult .title').textContent).toBe(t('result.title'));
});

// The meshes a wave can draw into: each role's full shape and far shape, and the nest's named sandbags.
const allMeshNames = (): string[] => ENEMY_KINDS.flatMap(kind => meshNamesOf(kind)).sort();

test('the enemies of a wave are drawn, and starting again leaves one set', async () => {
  startSortieWithoutTrickle();
  steps(1);
  // the landing cutscene leaves the camera out at sea; the play view is the one the fog is measured from
  sendToScript(game(), { kind: 'skip' });
  steps(SETTLE_STEPS);
  expect(enemyMeshes()).toHaveLength(ENEMY_KINDS.length + SOLDIER_KINDS.length);
  // the six nests and the two sectors' ten posted defenders (SB-2015) stand from the start
  expect(drawnEnemies()).toBe(16);
  sendToScript(game(), { kind: 'enter', area: 'b-line' });
  steps(1);
  // the squad, on top of the six nests and the ten defenders; from the play pose the whole squad is inside the fog
  expect(game().enemies).toHaveLength(22);
  expect(enemyMeshes()).toHaveLength(ENEMY_KINDS.length + SOLDIER_KINDS.length);
  expect(drawnEnemies()).toBe(22);

  startSortieWithoutTrickle();
  steps(1);
  sendToScript(game(), { kind: 'skip' });
  steps(SETTLE_STEPS);
  expect(
    enemyMeshes()
      .map(mesh => mesh.name)
      .sort(),
  ).toEqual(allMeshNames());
  expect(drawnEnemies()).toBe(16);
});

const colorAt = new THREE.Color();

// Every part of the machine-gun nest's model: the named sandbags mesh and the meshes named after it.
function nestParts(): THREE.InstancedMesh[] {
  const name = enemyMeshName('emplacement');
  const found: THREE.InstancedMesh[] = [];
  scene.traverse(object => {
    if (object instanceof THREE.InstancedMesh && object.name.startsWith(name)) found.push(object);
  });
  expect(found.length).toBeGreaterThan(1);
  return found;
}

test('every kind keeps room for its instance colours, so the GPU can draw it', async () => {
  startSortieWithoutTrickle();
  steps(1);
  // the landing cutscene's camera is out past the fog; the wave is measured from where the player stands
  sendToScript(game(), { kind: 'skip' });
  steps(SETTLE_STEPS);
  sendToScript(game(), { kind: 'enter', area: 'b-line' });
  steps(1);
  // the six nests, the ten posted defenders and the squad (SB-2015)
  expect(drawnEnemies()).toBe(22);
  for (const kind of ENEMY_KINDS) {
    // The nest's parts take no colour per copy: three multiplies the material's colour by instanceColor when it exists,
    // and a colour array that is never written is all zeros, which would draw the nest black. So it has none, and the
    // part shows its material's colour (or its painted vertex colours).
    if (kind === 'emplacement') {
      for (const part of nestParts()) {
        expect(part.instanceColor, `${part.name} has no colour array`).toBeNull();
        const material = part.material as THREE.MeshLambertMaterial | THREE.MeshBasicMaterial;
        if (!material.vertexColors) expect(material.color.getHex(), `${part.name} colour`).not.toBe(0);
      }
      continue;
    }
    // The mid boss is put out here, in front of the mech, as no wave of this scene brings it: a body, its lamps and its vents
    // (SB-2049), each one mesh with one copy. The body's colours are painted in and the copy is white; the lamps and the
    // vents are white in the shape and take their colour per copy. The room covers the copy all the same.
    if (kind === 'warden') {
      const before = drawnEnemies();
      const current = game();
      current.enemies.push(newEnemy('warden-e2e', 'warden', 'warden', current.mech.x, current.mech.z - 12));
      steps(1);
      expect(drawnEnemies(), 'the warden is drawn').toBe(before + 1);
      const wanted: [string, number][] = [
        [enemyMeshName(kind), 0xffffff],
        [`${enemyMeshName(kind)}-lamps`, WARDEN_LAMP_COLOR],
        [`${enemyMeshName(kind)}-vents`, WARDEN_VENT_IDLE_COLOR],
      ];
      for (const [name, hex] of wanted) {
        const mesh = scene.getObjectByName(name) as THREE.InstancedMesh;
        expect(mesh.count, `${name} copies`).toBe(1);
        const colors = mesh.instanceColor;
        if (colors === null) throw new Error(`${kind} (${name}) has no instance colours`);
        expect(colors.array.length, `${name} colour room`).toBe((mesh.instanceMatrix.array.length / 16) * 3);
        mesh.getColorAt(0, colorAt);
        expect(colorAt.getHex(), `${name} colour`).toBe(hex);
        expect(mesh.geometry.attributes.color, `${name} baked colours`).toBeDefined();
      }
      continue;
    }
    // A soldier's copies are split between the full shape and the far one (SB-2083), so each kind draws in one of the
    // two; the room of each mesh covers every copy it may draw, so the GPU finds a colour for each one.
    const meshes = meshNamesOf(kind).map(name => scene.getObjectByName(name) as THREE.InstancedMesh);
    expect(
      meshes.reduce((sum, mesh) => sum + mesh.count, 0),
      kind,
    ).toBeGreaterThan(0);
    for (const mesh of meshes) {
      const colors = mesh.instanceColor;
      if (colors === null) throw new Error(`${kind} (${mesh.name}) has no instance colours`);
      expect(colors.array.length, `${mesh.name} colour room`).toBe((mesh.instanceMatrix.array.length / 16) * 3);
      // A soldier's copy multiplies the shape's own baked colours: alive it is white, so they show, and a written array
      // is never all zeros, which would draw the copy black.
      for (let i = 0; i < mesh.count; i++) {
        mesh.getColorAt(i, colorAt);
        expect(colorAt.getHex(), `${mesh.name} ${i}`).toBe(0xffffff);
      }
      expect(mesh.geometry.attributes.color, `${mesh.name} baked colours`).toBeDefined();
    }
  }
});
