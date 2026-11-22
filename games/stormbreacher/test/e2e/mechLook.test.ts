import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { renderer, scene } from '@engine/render/index.ts';

import { CAMERA_TUNE, MECH_TUNE } from '../../src/data/tune.ts';
import { currentGame, startSortie } from '../../src/app/play.ts';
import { sendToScript } from '../../src/logic/game.ts';
import { boot } from '../../src/app/boot.ts';
import { PATTERNS } from '../../src/dev/mech/patterns.ts';
import { showMech } from '../../src/dev/views/mech.ts';
import { countProtoDraws } from '../../src/view/mechProtoModel.ts';
import { steps } from './steps.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

const SNAP_SPEED = 1e6; // m/s: the ease's cap while a test puts the camera in its place, high enough to count as no cap

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
  steps(1);
  const meshes = mechMeshes();
  // the player's kit wears armour, frame, accent and glow: the friendly side's mark (#551) is the allies' alone
  expect(meshes.length).toBe(4);
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
  steps(1);
  const game = currentGame()!;
  expect(group.position.x).toBe(game.mech.x);
  expect(group.position.z).toBe(game.mech.z);
});

test('the mech turns see-through while the camera is near its chest, and solid again when it moves away', async () => {
  startSortie();
  steps(1);
  // the landing cutscene holds its own camera and the mech is on the ramp, so the test starts past it
  sendToScript(currentGame()!, { kind: 'skip' });
  steps(1);
  expect(opacities().every(opacity => opacity === 1)).toBe(true);
  const { dist, lag, pullSpeed, returnSpeed, returnLag, returnDelay } = CAMERA_TUNE;
  try {
    CAMERA_TUNE.dist = 0.5;
    CAMERA_TUNE.lag = 0; // the camera reaches its place in one frame
    // SB-1910 caps how fast a wall brings the camera in, so the test takes the caps off as shots/wall-close.shots.ts does
    CAMERA_TUNE.pullSpeed = SNAP_SPEED;
    CAMERA_TUNE.returnSpeed = SNAP_SPEED;
    CAMERA_TUNE.returnLag = 0;
    CAMERA_TUNE.returnDelay = 0;
    steps(2);
    expect(opacities().every(opacity => opacity === MECH_TUNE.fadeOpacity)).toBe(true);
    expect(mechMeshes().every(mesh => (mesh.material as THREE.Material).transparent)).toBe(true);
    CAMERA_TUNE.dist = dist;
    steps(2);
    expect(opacities().every(opacity => opacity === 1)).toBe(true);
    expect(mechMeshes().every(mesh => !(mesh.material as THREE.Material).transparent)).toBe(true);
  } finally {
    CAMERA_TUNE.dist = dist;
    CAMERA_TUNE.lag = lag;
    CAMERA_TUNE.pullSpeed = pullSpeed;
    CAMERA_TUNE.returnSpeed = returnSpeed;
    CAMERA_TUNE.returnLag = returnLag;
    CAMERA_TUNE.returnDelay = returnDelay;
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
