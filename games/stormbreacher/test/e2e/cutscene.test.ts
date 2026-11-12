import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { el, t } from '@engine/core/index.ts';
import * as THREE from 'three';
import { camera, scene } from '@engine/render/index.ts';
import { currentGame, startSortie } from '../../src/app/play.ts';
import { boot } from '../../src/app/boot.ts';
import { CUTSCENES } from '../../src/data/cutscenes.ts';
import { M1_MECH_PALETTE } from '../../src/data/mech.ts';
import { CUTSCENE_SEC } from '../../src/data/script.ts';
import { sendToScript } from '../../src/logic/game.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

// The tests share one page: each starts the sortie again directly.
beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));
const frames = async (n: number): Promise<void> => {
  for (let i = 0; i < n; i++) await frame();
};

function game() {
  const current = currentGame();
  if (!current) throw new Error('the sortie has not started');
  return current;
}

async function until(done: () => boolean, tries = 240): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (done()) return;
    await frame();
  }
  if (!done()) throw new Error(`the page did not reach the state in ${tries} frames`);
}

const bars = (): HTMLElement => el('#sbCutscene');
const caption = (): string => el('#sbCutscene [data-cutscene="caption"]').textContent ?? '';

test('a sortie shows the black bars and a line, and hides the HUD', async () => {
  startSortie();
  await until(() => !bars().hidden);
  expect(el('#sbPlayHud').hidden).toBe(true);
  expect(bars().querySelectorAll('[data-cutscene="top"], [data-cutscene="bottom"]')).toHaveLength(2);
  const bottom = el('#sbCutscene [data-cutscene="bottom"]').getBoundingClientRect();
  expect(bottom.height).toBeGreaterThan(0);
  expect(bottom.bottom).toBe(window.innerHeight);
  // the line is in the lower bar once the first line's second comes
  expect(game().script.cutscene?.id).toBe('landing');
  game().script.cutscene = { id: 'landing', left: CUTSCENE_SEC.landing - 1 };
  await frame();
  expect(caption()).toBe(t('cutscene.landing.wave'));
});

test('a click skips the cutscene: the bars go and the HUD comes', async () => {
  startSortie();
  await until(() => !bars().hidden);
  el('#gl').click();
  await until(() => bars().hidden);
  expect(game().script.cutscene).toBeNull();
  expect(el('#sbPlayHud').hidden).toBe(false);
});

test('Enter skips it too, and the click that started the sortie does not', async () => {
  startSortie();
  await frame();
  expect(game().script.cutscene).not.toBeNull();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', repeat: true, bubbles: true }));
  await frame();
  expect(game().script.cutscene).not.toBeNull();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
  await until(() => game().script.cutscene === null);
  expect(bars().hidden).toBe(true);
});

test('starting again from the beginning plays it again, with one set of bars', async () => {
  startSortie();
  await until(() => !bars().hidden);
  el('#gl').click();
  await until(() => bars().hidden);
  el('#sbResultRestart').click();
  await until(() => !bars().hidden);
  expect(document.querySelectorAll('#sbCutscene')).toHaveLength(1);
  expect(game().script.cutscene?.id).toBe('landing');
  expect(el('#sbPlayHud').hidden).toBe(true);
});

// The crafts of the cutscenes that are in sight now (the player's own is `craftUnit`, not counted).
function seaCrafts(): number {
  let count = 0;
  scene.traverse(child => {
    if (/^craftSide\d+Unit$/.test(child.name) && child.visible) count++;
  });
  return count;
}

test('wave2-sinks shows the bars and its line, hides the HUD and draws the crafts at sea', async () => {
  startSortie();
  await until(() => !bars().hidden);
  el('#gl').click();
  await until(() => bars().hidden);
  expect(seaCrafts()).toBe(0);
  game().script.cutscene = { id: 'wave2-sinks', left: CUTSCENE_SEC['wave2-sinks'] - 1 };
  await frame();
  expect(bars().hidden).toBe(false);
  expect(el('#sbPlayHud').hidden).toBe(true);
  expect(caption()).toBe(t('cutscene.wave2.hit'));
  expect(seaCrafts()).toBe(4);
  game().script.cutscene = { id: 'wave2-sinks', left: CUTSCENE_SEC['wave2-sinks'] - 4 };
  await frame();
  expect(caption()).toBe(t('cutscene.wave2.none'));
  // when it is over the bars go, the HUD comes and the crafts are out of sight
  game().script.cutscene = null;
  await until(() => bars().hidden);
  expect(el('#sbPlayHud').hidden).toBe(false);
  expect(seaCrafts()).toBe(0);
});

test('beach-held plays after the win and then the result shows', async () => {
  startSortie();
  await until(() => !bars().hidden);
  el('#gl').click();
  await until(() => bars().hidden);
  for (const target of ['main-gun-1', 'main-gun-2', 'magazine']) sendToScript(game(), { kind: 'destroyed', target });
  expect(game().script.cutscene?.id).toBe('beach-held');
  await until(() => !bars().hidden);
  expect(game().cleared).toBe(true);
  expect(el('#sbResult').hidden).toBe(true);
  game().script.cutscene = { id: 'beach-held', left: CUTSCENE_SEC['beach-held'] - 5 };
  await frame();
  expect(caption()).toBe(t('cutscene.held.landing'));
  expect(seaCrafts()).toBe(2);
  // a skip ends it, and the result follows
  el('#gl').click();
  await until(() => !el('#sbResult').hidden);
  expect(bars().hidden).toBe(true);
});

const mechModel = (): THREE.Object3D => {
  const found = scene.children.filter(child => child.name === 'mech').reverse()[0];
  if (!found) throw new Error('no mech model in the scene');
  return found;
};

// The frame-coloured mesh holds the legs' boxes first (the legs are placed before the rest).
const LEG_VALUES = 4 * 16;
function legMatrices(): number[] {
  const mesh = mechModel().children.find(
    (child): child is THREE.InstancedMesh =>
      (child as THREE.InstancedMesh).isInstancedMesh === true &&
      ((child as THREE.InstancedMesh).material as THREE.MeshLambertMaterial).color.getHex() === M1_MECH_PALETTE.frame,
  );
  if (!mesh) throw new Error('the mech has no frame mesh');
  return Array.from(mesh.instanceMatrix.array).slice(0, LEG_VALUES);
}

const lastKey = (): THREE.Vector3 => {
  const keys = CUTSCENES.landing?.camera ?? [];
  const last = keys[keys.length - 1];
  return new THREE.Vector3(...last.pos);
};

const START_Z = 166; // the mech's start (SPEC 3.1; newGame)

test('the landing draws the mech standing in the craft, then walking down the ramp with its legs swinging', async () => {
  startSortie();
  await until(() => !bars().hidden);
  // in the craft before the ramp comes down: drawn, behind the start, standing
  game().script.cutscene = { id: 'landing', left: CUTSCENE_SEC.landing - 6 };
  await frames(10);
  expect(mechModel().visible).toBe(true);
  expect(mechModel().position.z).toBeGreaterThan(START_Z + 10);
  const rest = legMatrices();
  // on the ramp: drawn over the craft and the ramp, past the start, and the legs swing
  game().script.cutscene = { id: 'landing', left: CUTSCENE_SEC.landing - 8.8 };
  await frames(10);
  expect(mechModel().visible).toBe(true);
  expect(mechModel().position.z).toBeGreaterThan(START_Z);
  expect(mechModel().position.z).toBeLessThan(START_Z + 14);
  expect(legMatrices()).not.toEqual(rest);
  // the game's own mech never moved
  expect(game().mech.z).toBeCloseTo(START_Z, 3);
});

test('the other cutscenes do not draw the mech', async () => {
  startSortie();
  await until(() => !bars().hidden);
  el('#gl').click();
  await until(() => bars().hidden);
  game().script.cutscene = { id: 'wave2-sinks', left: CUTSCENE_SEC['wave2-sinks'] - 1 };
  await frame();
  expect(mechModel().visible).toBe(false);
  game().script.cutscene = null;
  await frame();
  expect(mechModel().visible).toBe(true);
});

test('when the landing ends the mech is at its start and the camera is where the last key put it', async () => {
  startSortie();
  await until(() => !bars().hidden);
  game().script.cutscene = { id: 'landing', left: 0.05 };
  await until(() => bars().hidden);
  const model = mechModel();
  expect(model.visible).toBe(true);
  expect(model.position.x).toBeCloseTo(game().mech.x, 3);
  expect(model.position.z).toBeCloseTo(START_Z, 3);
  expect(model.rotation.y).toBeCloseTo(0, 6);
  expect(camera.position.distanceTo(lastKey())).toBeLessThan(0.5);
});

test('a skip puts the mech at its start and the camera at the game camera', async () => {
  startSortie();
  await until(() => !bars().hidden);
  game().script.cutscene = { id: 'landing', left: CUTSCENE_SEC.landing - 2 };
  await frames(3);
  el('#gl').click();
  await until(() => bars().hidden);
  expect(mechModel().position.z).toBeCloseTo(START_Z, 3);
  expect(camera.position.distanceTo(lastKey())).toBeLessThan(0.5);
});
