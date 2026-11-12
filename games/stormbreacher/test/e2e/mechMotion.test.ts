import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { runSystems } from '@engine/core/index.ts';
import { scene } from '@engine/render/index.ts';
import { M1_MECH_PALETTE } from '../../src/data/mech.ts';
import { currentGame, startSortie } from '../../src/app/play.ts';
import { sendToScript } from '../../src/logic/game.ts';
import { boot } from '../../src/app/boot.ts';
import { showMech } from '../../src/dev/views/mech.ts';
import { countMechDraws } from '../../src/view/mechModel.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));
const key = (type: 'keydown' | 'keyup', code: string) => new KeyboardEvent(type, { code, bubbles: true });

const mechGroups = (): THREE.Object3D[] => scene.children.filter(child => child.name === 'mech');

function meshesOf(group: THREE.Object3D): THREE.InstancedMesh[] {
  return group.children.filter((child): child is THREE.InstancedMesh => (child as THREE.InstancedMesh).isInstancedMesh);
}

// The frame-coloured mesh holds the legs' boxes first (the legs are placed before the rest).
const frameMesh = (group: THREE.Object3D): THREE.InstancedMesh => {
  const found = meshesOf(group).find(
    mesh => (mesh.material as THREE.MeshLambertMaterial).color.getHex() === M1_MECH_PALETTE.frame,
  );
  if (!found) throw new Error('the mech has no frame mesh');
  return found;
};

const LEG_VALUES = 4 * 16; // midLegs: two boxes, mirrored
const legMatrices = (group: THREE.Object3D): number[] =>
  Array.from(frameMesh(group).instanceMatrix.array).slice(0, LEG_VALUES);

test("walking in a sortie moves the legs' boxes, and standing keeps them still", async () => {
  // A drawn frame of the sortie is slow on CI when every game's tests run at once (it timed out at 60 s waiting for
  // ~110 frames), so after the first frame the systems run by hand, a 60th of a second each.
  const steps = (n: number) => {
    for (let i = 0; i < n; i++) runSystems(1 / 60);
  };
  startSortie();
  await frame();
  sendToScript(currentGame()!, { kind: 'skip' });
  steps(2);
  const group = mechGroups().reverse()[0];
  const rest = legMatrices(group);
  steps(10);
  expect(legMatrices(group)).toEqual(rest);

  window.dispatchEvent(key('keydown', 'KeyW'));
  steps(25);
  const walking = legMatrices(group);
  expect(walking).not.toEqual(rest);
  expect(countMechDraws(group).calls).toBe(5);
  window.dispatchEvent(key('keyup', 'KeyW'));

  // the swing dies away once the mech has stopped, then nothing changes
  steps(60);
  const stopped = legMatrices(group);
  steps(10);
  expect(legMatrices(group)).toEqual(stopped);
  expect(countMechDraws(group).calls).toBe(5);
});

test('#view-mech acts out walking, boosting, jumping and firing', () => {
  const before = new Set(mechGroups());
  showMech('#view-mech');
  const group = mechGroups().find(g => !before.has(g))!;
  const report = () =>
    JSON.parse(window.sbMechReport!()) as {
      acts: Record<string, boolean>;
      mech: { calls: number; boxes: number };
    };
  // a frame of the page takes long to draw, so the systems run by hand, a 60th of a second each
  const steps = (n: number) => {
    for (let i = 0; i < n; i++) runSystems(1 / 60);
  };
  const buttons = (label: string): HTMLButtonElement => {
    const found = [...document.querySelectorAll<HTMLButtonElement>('#sbMechBar button')].find(
      node => node.textContent === label,
    );
    if (!found) throw new Error(`no button ${label}`);
    return found;
  };

  steps(3);
  const rest = legMatrices(group);
  const restBoxes = report().mech.boxes;
  expect(report().acts).toEqual({ walk: false, boost: false, jump: false, fire: false });

  buttons('歩く').click();
  expect(report().acts.walk).toBe(true);
  steps(25);
  expect(legMatrices(group)).not.toEqual(rest);
  buttons('歩く').click();
  expect(report().acts.walk).toBe(false);
  steps(60);
  expect(legMatrices(group)).toEqual(rest);

  buttons('ブースト').click();
  steps(30);
  expect(report().mech.boxes).toBeGreaterThan(restBoxes);
  expect(report().mech.calls).toBe(5);
  buttons('ブースト').click();
  steps(60);
  expect(report().mech.boxes).toBe(restBoxes);

  buttons('跳ぶ').click();
  expect(report().acts.jump).toBe(true);
  steps(10);
  expect(group.position.y).toBeGreaterThan(0);
  steps(80);
  expect(report().acts.jump).toBe(false);
  expect(group.position.y).toBe(0);

  buttons('撃つ').click();
  expect(report().acts.fire).toBe(true);
  buttons('撃つ').click();
  expect(report().acts.fire).toBe(false);
});
