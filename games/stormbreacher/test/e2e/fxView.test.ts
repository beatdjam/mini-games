import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { camera, drawStats, scene } from '@engine/render/index.ts';
import { boot } from '../../src/app/boot.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { FX_STAGES, QUARTER_TUNE } from '../../src/data/tune.ts';
import { showFx } from '../../src/dev/views/fx.ts';
import { BATTLE_GROUP_NAME } from '../../src/view/battle/index.ts';
import { quarterPose } from '../../src/view/quarterCamera.ts';
import { draw, steps } from './steps.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

test('#view-fx stage 2 draws the battle: the allies, the holes and the smoke', async () => {
  history.replaceState(null, '', '#view-fx?fx=2&seed=1');
  showFx('#view-fx?fx=2&seed=1');
  // 40 frames of the page, run by hand: drawn frames timed out on CI. One drawn frame after them gives the draw counts.
  steps(40);
  draw();
  const group = scene.children.find(child => child.name === BATTLE_GROUP_NAME);
  expect(group).toBeDefined();
  const drawn: THREE.InstancedMesh[] = [];
  group!.traverse(object => {
    const mesh = object as THREE.InstancedMesh;
    if (mesh.isInstancedMesh === true && mesh.visible && mesh.count > 0) drawn.push(mesh);
  });
  // the soldiers are split between the close and far forms (SB-2085); together they hold the stage's whole wave once
  const soldierCount = (names: readonly string[]): number =>
    names.reduce((sum, name) => {
      const mesh = group!.getObjectByName(name);
      return mesh instanceof THREE.InstancedMesh ? sum + mesh.count : sum;
    }, 0);
  const allies = Math.round(FX_STAGES[2].allies);
  expect(soldierCount(['sb-battle-bodies', 'sb-battle-bodies-far'])).toBe(allies);
  expect(soldierCount(['sb-battle-heads', 'sb-battle-heads-far'])).toBe(allies);
  expect(drawn.length).toBeGreaterThanOrEqual(5);
  console.log(`#view-fx stage 2: ${drawStats()}`);
});

test('#view-fx opens under the overview camera and reports the movement alone', async () => {
  history.replaceState(null, '', '#view-fx?fx=2&seed=1');
  showFx('#view-fx?fx=2&seed=1');
  // 120 frames of no walking input settle the camera's follow at the mech's start
  steps(120);
  draw();
  const bounds = M1B_HAND.bounds;
  // the view starts the mech 4 m inside the sea edge, past the camera's back distance
  const startMargin = 4;
  const feet = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: 0,
    z: bounds.maxZ - (QUARTER_TUNE.back + startMargin),
  };
  const pose = quarterPose(feet, QUARTER_TUNE);
  expect(camera.position.distanceTo(pose.pos)).toBeLessThanOrEqual(0.5);

  const report = JSON.parse(window.sbFxReport!());
  expect(report).not.toHaveProperty('mechCam');
  expect(report).toHaveProperty('mechMove');
});
