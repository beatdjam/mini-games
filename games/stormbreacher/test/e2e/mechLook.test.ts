import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { renderer, scene } from '@engine/render/index.ts';
import { PROTO_MATERIALS } from '../../src/data/mechProto.ts';
import { CAMERA_TUNE, MECH_TUNE } from '../../src/data/tune.ts';
import { currentGame, startSortie } from '../../src/app/play.ts';
import { sendToScript } from '../../src/logic/game.ts';
import { boot } from '../../src/app/boot.ts';
import { PATTERNS } from '../../src/dev/mech/patterns.ts';
import { showMech } from '../../src/dev/views/mech.ts';
import { countProtoDraws } from '../../src/view/mechProtoModel.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

// The meshes the sortie's mech is drawn with: the skinned meshes of the 'mech-proto' group in the sortie's scene.
function mechMeshes(): THREE.SkinnedMesh[] {
  const meshes: THREE.SkinnedMesh[] = [];
  scene.traverse(object => {
    const mesh = object as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh === true && mesh.name === 'mech-proto') meshes.push(mesh);
  });
  return meshes;
}

const opacities = (): number[] => mechMeshes().map(mesh => (mesh.material as THREE.Material).opacity);

test('a sortie draws the mech as one skinned mesh per material, with no stand-in boxes', async () => {
  startSortie();
  await frame();
  const meshes = mechMeshes();
  expect(meshes.length).toBe(Object.keys(PROTO_MATERIALS).length);
  const group = meshes[0].parent!;
  const draws = countProtoDraws(group);
  console.log(`sortie mech draws: ${draws.calls} calls, ${draws.triangles} triangles, ${draws.shapes} shapes`);
  expect(draws.calls).toBe(meshes.length);
  // every mesh in the mech's group is one of the skinned meshes (the flame cones are hidden while it is not boosting)
  let others = 0;
  group.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh === true && mesh.visible && !meshes.includes(mesh as THREE.SkinnedMesh)) others++;
  });
  expect(others).toBe(0);
  // no shadow and no surroundings' light unless the page asks for them (?shadow=1, ?env=1)
  expect(scene.environment).toBeNull();
  expect(renderer.shadowMap.enabled).toBe(false);
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
  expect(report.mech.boxes).toBe(53);
  expect(PATTERNS.e.palette.armor).toBe(0x6f735c);
  expect(PATTERNS.e.palette.sensor).toBe(0xd8482a);
});
