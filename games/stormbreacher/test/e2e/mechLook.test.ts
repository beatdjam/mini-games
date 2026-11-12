import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { scene } from '@engine/render/index.ts';
import { MECH_COLORS } from '../../src/data/mech.ts';
import { CAMERA_TUNE, MECH_TUNE } from '../../src/data/tune.ts';
import { currentGame, startSortie } from '../../src/app/play.ts';
import { sendToScript } from '../../src/logic/game.ts';
import { boot } from '../../src/app/boot.ts';
import { PATTERNS } from '../../src/dev/mech/patterns.ts';
import { showMech } from '../../src/dev/views/mech.ts';
import { countMechDraws } from '../../src/view/mechModel.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

// The meshes the sortie's mech is drawn with: the instanced meshes named 'mech' that sit in the sortie's scene.
function mechMeshes(): THREE.InstancedMesh[] {
  const meshes: THREE.InstancedMesh[] = [];
  scene.traverse(object => {
    const mesh = object as THREE.InstancedMesh;
    if (mesh.isInstancedMesh === true && mesh.name === 'mech') meshes.push(mesh);
  });
  return meshes;
}

const opacities = (): number[] => mechMeshes().map(mesh => (mesh.material as THREE.Material).opacity);

test('a sortie draws the mech as one instanced mesh per colour, with no stand-in boxes', async () => {
  startSortie();
  await frame();
  const meshes = mechMeshes();
  expect(meshes.length).toBe(MECH_COLORS.length);
  const group = meshes[0].parent!;
  const draws = countMechDraws(group);
  console.log(`sortie mech draws: ${draws.calls} calls, ${draws.triangles} triangles`);
  expect(draws.calls).toBe(MECH_COLORS.length);
  // every mesh in the mech's group is one of the colour meshes; a stand-in would add plain boxes
  let others = 0;
  group.traverse(object => {
    if ((object as THREE.Mesh).isMesh === true && !meshes.includes(object as THREE.InstancedMesh)) others++;
  });
  expect(others).toBe(0);
  // the landing walks the model down the ramp, so it is on the game's mech once the cutscene is skipped
  sendToScript(currentGame()!, { kind: 'skip' });
  await frame();
  const game = currentGame()!;
  expect(group.position.x).toBe(game.mech.x);
  expect(group.position.z).toBe(game.mech.z);
});

test('the mech turns see-through while the camera is near its chest, and solid again when it moves away', async () => {
  startSortie();
  await frame();
  // the landing cutscene holds its own camera and the mech is on the ramp, so the test starts past it
  sendToScript(currentGame()!, { kind: 'skip' });
  await frame();
  expect(opacities().every(opacity => opacity === 1)).toBe(true);
  const { dist, lag } = CAMERA_TUNE;
  try {
    CAMERA_TUNE.dist = 0.5;
    CAMERA_TUNE.lag = 0; // the camera reaches its place in one frame
    await frame();
    await frame();
    expect(opacities().every(opacity => opacity === MECH_TUNE.fadeOpacity)).toBe(true);
    expect(mechMeshes().every(mesh => (mesh.material as THREE.Material).transparent)).toBe(true);
    CAMERA_TUNE.dist = dist;
    await frame();
    await frame();
    expect(opacities().every(opacity => opacity === 1)).toBe(true);
    expect(mechMeshes().every(mesh => !(mesh.material as THREE.Material).transparent)).toBe(true);
  } finally {
    CAMERA_TUNE.dist = dist;
    CAMERA_TUNE.lag = lag;
  }
});

test('#view-mech pattern e keeps its parts and colours', () => {
  const params = new URLSearchParams(location.search);
  params.set('pattern', 'e');
  history.replaceState(null, '', `${location.pathname}?${params.toString()}${location.hash}`);
  showMech('#view-mech');
  const report = JSON.parse(window.sbMechReport!()) as { pattern: string; mech: { calls: number; boxes: number } };
  expect(report.pattern).toBe('e');
  expect(report.mech.calls).toBe(5);
  expect(report.mech.boxes).toBe(19);
  expect(PATTERNS.e.palette.armor).toBe(0x6f735c);
  expect(PATTERNS.e.palette.sensor).toBe(0xd8482a);
});
