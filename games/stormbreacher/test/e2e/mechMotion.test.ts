import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { scene } from '@engine/render/index.ts';
import { M1_MECH_PALETTE } from '../../src/data/mech.ts';
import { currentGame, startSortie } from '../../src/app/play.ts';
import { sendToScript } from '../../src/logic/game.ts';
import { boot } from '../../src/app/boot.ts';
import { showMech } from '../../src/dev/views/mech.ts';
import { countProtoDraws } from '../../src/view/mechProtoModel.ts';
import { steps } from './steps.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

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

// The sortie's mech is the prototype's rig: a group named 'mech-proto' on bones (view/mechProtoModel.ts).
const protoGroups = (): THREE.Object3D[] => scene.children.filter(child => child.name === 'mech-proto');

function bonesOf(group: THREE.Object3D, pattern: RegExp): THREE.Bone[] {
  const bones: THREE.Bone[] = [];
  group.traverse(object => {
    if ((object as THREE.Bone).isBone === true && pattern.test(object.name)) bones.push(object as THREE.Bone);
  });
  return bones;
}

// The legs' joint angles (rad), the thighs' and shins' turns about x.
const legAngles = (group: THREE.Object3D): number[] => bonesOf(group, /^(thigh|shin)[RL]$/).map(b => b.rotation.x);
const spread = (a: number[], b: number[]): number => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
const flames = (group: THREE.Object3D): THREE.Mesh[] => {
  const found: THREE.Mesh[] = [];
  bonesOf(group, /^torso$/)[0].traverse(object => {
    if ((object as THREE.Mesh).isMesh === true && !(object as THREE.SkinnedMesh).isSkinnedMesh)
      found.push(object as THREE.Mesh);
  });
  return found;
};

test('walking in a sortie swings the legs, and standing keeps them still', async () => {
  startSortie();
  steps(1);
  sendToScript(currentGame()!, { kind: 'skip' });
  steps(2);
  const group = protoGroups().reverse()[0];
  const rest = legAngles(group);
  steps(10);
  // standing breathes a few thousandths of a radian and no more
  expect(spread(legAngles(group), rest)).toBeLessThan(0.02);

  window.dispatchEvent(key('keydown', 'KeyW'));
  steps(25);
  expect(spread(legAngles(group), rest)).toBeGreaterThan(0.05);
  const calls = countProtoDraws(group).calls;
  window.dispatchEvent(key('keyup', 'KeyW'));

  // the swing dies away once the mech has stopped, then it stands as before
  steps(60);
  expect(spread(legAngles(group), rest)).toBeLessThan(0.02);
  expect(countProtoDraws(group).calls).toBe(calls);
});

test('the sortie shows the flame while boosting and hides it again, and the main weapon pulls the arm', async () => {
  startSortie();
  steps(1);
  sendToScript(currentGame()!, { kind: 'skip' });
  steps(2);
  const group = protoGroups().reverse()[0];
  expect(flames(group).every(flame => !flame.visible)).toBe(true);
  const base = countProtoDraws(group).calls;

  window.dispatchEvent(key('keydown', 'ShiftLeft'));
  window.dispatchEvent(key('keydown', 'KeyW'));
  steps(30);
  expect(currentGame()!.mech.boosting).toBe(true);
  expect(flames(group).length).toBeGreaterThan(0);
  expect(flames(group).every(flame => flame.visible)).toBe(true);
  expect(countProtoDraws(group).calls).toBe(base + flames(group).length);
  window.dispatchEvent(key('keyup', 'ShiftLeft'));
  window.dispatchEvent(key('keyup', 'KeyW'));
  steps(90);
  expect(flames(group).every(flame => !flame.visible)).toBe(true);
  expect(countProtoDraws(group).calls).toBe(base);

  // the weapon arm's elbow dips while the gun fires (the free arm's does not)
  const elbow = bonesOf(group, /^elbowR$/)[0];
  const free = bonesOf(group, /^elbowL$/)[0];
  const before = elbow.rotation.x;
  window.dispatchEvent(key('keydown', 'KeyJ'));
  steps(4);
  expect(Math.abs(elbow.rotation.x - before)).toBeGreaterThan(0.05);
  expect(free.rotation.x).toBeCloseTo(-0.45, 2);
  window.dispatchEvent(key('keyup', 'KeyJ'));
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
