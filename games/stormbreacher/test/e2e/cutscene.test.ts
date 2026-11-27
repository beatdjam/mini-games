import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { el, t, runSystems } from '@engine/core/index.ts';
import * as THREE from 'three';
import { camera, scene } from '@engine/render/index.ts';
import { currentGame, currentPlayView, startSortie } from '../../src/app/play.ts';
import { boot } from '../../src/app/boot.ts';
import { craftZ } from '../../src/data/craft.ts';
import { LANDING_RIDERS, LANDING_TUNE, SINKING_CREWS } from '../../src/data/landing.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { CUTSCENE_SEC } from '../../src/data/script.ts';
import { sendToScript } from '../../src/logic/game.ts';
import { RIDERS_NAME } from '../../src/view/riders.ts';
import { SINKING_CREW_NAME } from '../../src/view/sinkingCrews.ts';
import { quarterPose } from '../../src/view/quarterCamera.ts';
import { pastSkipGuard as pastGuard } from './cutsceneSkip.ts';
import { draw, steps, untilSteps } from './steps.ts';
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

// A cutscene takes no skip for CUTSCENE_SKIP_GUARD_SEC after it starts, so a test that skips it waits that out first.
async function pastSkipGuard(): Promise<void> {
  await untilSteps(pastGuard);
}

const bars = (): HTMLElement => el('#sbCutscene');
const caption = (): string => el('#sbCutscene [data-cutscene="caption"]').textContent ?? '';

test('a sortie shows the black bars and a line, and hides the HUD', async () => {
  startSortie();
  await untilSteps(() => !bars().hidden);
  expect(el('#sbPlayHud').hidden).toBe(true);
  expect(bars().querySelectorAll('[data-cutscene="top"], [data-cutscene="bottom"]')).toHaveLength(2);
  const bottom = el('#sbCutscene [data-cutscene="bottom"]').getBoundingClientRect();
  expect(bottom.height).toBeGreaterThan(0);
  expect(bottom.bottom).toBe(window.innerHeight);
  // the line is in the lower bar once the first line's second comes
  expect(game().script.cutscene?.id).toBe('landing');
  game().script.cutscene = { id: 'landing', left: CUTSCENE_SEC.landing - 1 };
  steps(1);
  expect(caption()).toBe(t('cutscene.landing.wave'));
});

test('a click skips the cutscene: the bars go and the HUD comes', async () => {
  startSortie();
  await untilSteps(() => !bars().hidden);
  await pastSkipGuard();
  el('#gl').click();
  await untilSteps(() => bars().hidden);
  expect(game().script.cutscene).toBeNull();
  expect(el('#sbPlayHud').hidden).toBe(false);
});

test('Enter skips it too, and the click that started the sortie does not', async () => {
  startSortie();
  steps(1);
  expect(game().script.cutscene).not.toBeNull();
  await pastSkipGuard();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', repeat: true, bubbles: true }));
  steps(1);
  expect(game().script.cutscene).not.toBeNull();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
  await untilSteps(() => game().script.cutscene === null);
  expect(bars().hidden).toBe(true);
});

test('starting again from the beginning plays it again, with one set of bars', async () => {
  startSortie();
  await untilSteps(() => !bars().hidden);
  await pastSkipGuard();
  el('#gl').click();
  await untilSteps(() => bars().hidden);
  el('#sbResultRestart').click();
  await untilSteps(() => !bars().hidden);
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

test('beach-held plays after the win and then the result shows', async () => {
  startSortie();
  await untilSteps(() => !bars().hidden);
  await pastSkipGuard();
  el('#gl').click();
  await untilSteps(() => bars().hidden);
  for (const target of ['main-gun-1', 'main-gun-2', 'magazine']) sendToScript(game(), { kind: 'destroyed', target });
  expect(game().script.cutscene?.id).toBe('beach-held');
  await untilSteps(() => !bars().hidden);
  expect(game().cleared).toBe(true);
  expect(el('#sbResult').hidden).toBe(true);
  game().script.cutscene = { id: 'beach-held', left: CUTSCENE_SEC['beach-held'] - 5 };
  steps(1);
  expect(caption()).toBe(t('cutscene.held.landing'));
  expect(seaCrafts()).toBe(2);
  // a skip ends it, and the result follows
  el('#gl').click();
  await untilSteps(() => !el('#sbResult').hidden);
  expect(bars().hidden).toBe(true);
});

// The sortie's mech is the prototype's rig (view/mechProtoModel.ts): a group named 'mech-proto' on bones.
const mechModel = (): THREE.Object3D => {
  const found = scene.children.filter(child => child.name === 'mech-proto').reverse()[0];
  if (!found) throw new Error('no mech model in the scene');
  return found;
};

// The legs' joint angles (rad): the hips' and knees' turns about x. They swing while the mech walks and hold still
// (but for the breathing's few thousandths) while it stands.
function legAngles(): number[] {
  const angles: number[] = [];
  mechModel().traverse(object => {
    if ((object as THREE.Bone).isBone === true && /^(thigh|shin)[RL]$/.test(object.name))
      angles.push(object.rotation.x);
  });
  if (angles.length !== 4) throw new Error('the mech has no leg bones');
  return angles;
}
const sameAngles = (a: number[], b: number[]): boolean => a.every((v, i) => Math.abs(v - b[i]) < 0.02);

const START_Z = craftZ(M1B_HAND.bounds) + LANDING_TUNE.startDepth; // where newGame puts the mech on the deck

// The pose the quarter camera asks for now: where the camera is at rest once the cutscene has handed over.
function quarterTarget(): THREE.Vector3 {
  const view = currentPlayView();
  if (!view) throw new Error('the sortie has no view');
  return quarterPose({ x: game().mech.x, y: game().mech.y, z: game().mech.z }, view.quarter.tune).pos;
}

// Runs the game by hand while the bars show, and gives the camera pose the last cutscene frame showed. The first
// controlled frame eases from that pose, so the cutscene's picture is not jumped over.
function runCutsceneToEnd(): THREE.Vector3 {
  const view = currentPlayView();
  if (!view) throw new Error('the sortie has no view');
  let shown: THREE.Vector3 | null = null;
  for (let i = 0; i < 720 && !bars().hidden; i++) {
    if (view.quarter.pose !== null) shown = view.quarter.pose.pos.clone();
    runSystems(1 / 60);
  }
  if (!bars().hidden) throw new Error('the cutscene did not end');
  if (shown === null) throw new Error('the cutscene showed no camera');
  return shown;
}

// The follow from the cutscene's last pose: one `lag` step at a 60th of a second, then the quarter camera's place
// within 0.5 m in a few dozen frames, with no frame moving farther than the ease asks.
function expectEaseToQuarter(shown: THREE.Vector3, frames: number): void {
  const view = currentPlayView();
  if (!view || view.quarter.pose === null) throw new Error('the sortie has no camera');
  const tune = view.quarter.tune;
  if (!(tune.lag > 0)) throw new Error('the quarter camera has no lag to ease with');
  const amount = 1 - Math.exp(-(1 / 60) / tune.lag);
  const gap = shown.distanceTo(quarterTarget());
  expect(view.quarter.pose.pos.distanceTo(shown)).toBeCloseTo(gap * amount, 4);
  let prev = view.quarter.pose.pos.clone();
  let prevGap = prev.distanceTo(quarterTarget());
  for (let i = 0; i < frames; i++) {
    steps(1);
    const now = view.quarter.pose.pos.clone();
    expect(now.distanceTo(prev)).toBeLessThanOrEqual(prevGap * amount + 1e-4);
    prev = now;
    prevGap = now.distanceTo(quarterTarget());
  }
  expect(prevGap).toBeLessThan(0.5);
  expect(camera.position.distanceTo(quarterTarget())).toBeLessThan(0.5);
}

test('the landing draws the mech standing on the deck, not walking', async () => {
  startSortie();
  await untilSteps(() => !bars().hidden);
  // the deck before the ramp comes down: drawn where the game's mech stands, standing
  game().script.cutscene = { id: 'landing', left: CUTSCENE_SEC.landing - 6 };
  steps(10);
  expect(mechModel().visible).toBe(true);
  expect(mechModel().position.z).toBeGreaterThan(START_Z); // still sailing in
  expect(mechModel().position.y).toBeCloseTo(game().mech.y, 6);
  const rest = legAngles();
  // the ramp coming down, the craft at the shore: the model is on the deck and the legs do not swing
  game().script.cutscene = { id: 'landing', left: 1 };
  steps(10);
  expect(mechModel().visible).toBe(true);
  expect(mechModel().position.z).toBeCloseTo(START_Z, 6);
  expect(sameAngles(legAngles(), rest)).toBe(true);
  // the game's own mech is the same place
  expect(game().mech.z).toBeCloseTo(START_Z, 3);
});

test('the other cutscenes do not draw the mech', async () => {
  startSortie();
  await untilSteps(() => !bars().hidden);
  await pastSkipGuard();
  el('#gl').click();
  await untilSteps(() => bars().hidden);
  game().script.cutscene = { id: 'beach-held', left: CUTSCENE_SEC['beach-held'] - 1 };
  steps(1);
  expect(mechModel().visible).toBe(false);
  game().script.cutscene = null;
  steps(1);
  expect(mechModel().visible).toBe(true);
});

test('the fortress blast shows the ruin and then the craft at sea', async () => {
  startSortie();
  await untilSteps(() => !bars().hidden);
  el('#gl').click();
  await untilSteps(() => bars().hidden);
  game().script.cutscene = { id: 'fortress-blast', left: CUTSCENE_SEC['fortress-blast'] - 1 };
  steps(1);
  expect(bars().hidden).toBe(false);
  expect(caption()).toBe(t('cutscene.blast.fall'));
  game().script.cutscene = { id: 'fortress-blast', left: CUTSCENE_SEC['fortress-blast'] - 6.5 };
  steps(1);
  steps(1);
  expect(caption()).toBe(t('cutscene.blast.gun'));
  expect(seaCrafts()).toBe(1);
  game().script.cutscene = null;
  steps(1);
});

const riderGroups = (): THREE.Group[] =>
  scene.children.filter((child): child is THREE.Group => child.name === RIDERS_NAME);

test('the landing draws six riders, hides them after, and a restart keeps one set', async () => {
  startSortie();
  await untilSteps(() => !bars().hidden);
  game().script.cutscene = { id: 'landing', left: CUTSCENE_SEC.landing - 6 };
  steps(3);
  const groups = riderGroups();
  expect(groups).toHaveLength(1);
  expect(groups[0].visible).toBe(true);
  const meshes: THREE.InstancedMesh[] = [];
  groups[0].traverse(object => {
    const mesh = object as THREE.InstancedMesh;
    if (mesh.isInstancedMesh === true) meshes.push(mesh);
  });
  expect(meshes).toHaveLength(2);
  for (const mesh of meshes) {
    expect(mesh.count).toBe(LANDING_RIDERS.length);
    expect(mesh.visible).toBe(true);
  }
  // another cutscene leaves them on the beach
  game().script.cutscene = { id: 'beach-held', left: CUTSCENE_SEC['beach-held'] - 1 };
  steps(1);
  expect(groups[0].visible).toBe(false);
  // and once the landing is over they are out of sight too
  game().script.cutscene = null;
  steps(1);
  expect(groups[0].visible).toBe(false);
  // starting again builds one set of riders, not two
  startSortie();
  steps(2);
  expect(riderGroups()).toHaveLength(1);
});

const sinkingCrewGroups = (): THREE.Object3D[] => {
  const groups: THREE.Object3D[] = [];
  scene.traverse(child => {
    if (child.name === SINKING_CREW_NAME) groups.push(child);
  });
  return groups;
};

test('the landing draws the sinking crews and the ally mech, and a skip hides them and a restart keeps one set', () => {
  // no waiting for frames: the systems run and the scene is drawn by hand, as landingView does
  const step = (n: number): void => {
    for (let i = 0; i < n; i++) {
      runSystems(0);
      draw();
    }
  };
  startSortie();
  // the first step starts the landing, which sets its own second: the table's second is put in after that
  step(1);
  game().script.cutscene = { id: 'landing', left: CUTSCENE_SEC.landing - 3.9 };
  step(3);
  const groups = sinkingCrewGroups();
  expect(groups).toHaveLength(1);
  expect(groups[0].visible).toBe(true);
  const meshes: THREE.InstancedMesh[] = [];
  groups[0].traverse(object => {
    const mesh = object as THREE.InstancedMesh;
    if (mesh.isInstancedMesh === true) meshes.push(mesh);
  });
  expect(meshes).toHaveLength(2);
  for (const mesh of meshes) {
    expect(mesh.count).toBeGreaterThan(0);
    expect(mesh.visible).toBe(true);
  }
  const allyIndex = SINKING_CREWS.findIndex(place => place.ally !== undefined);
  const ally = scene.getObjectByName(`${SINKING_CREW_NAME}Ally${allyIndex}`);
  expect(ally).toBeDefined();
  expect(ally?.visible).toBe(true);

  // the skip ends it before the next frame: the crews and the ally are out of sight
  el('#gl').click();
  step(2);
  expect(game().script.cutscene).toBeNull();
  expect(groups[0].visible).toBe(false);
  expect(ally?.visible).toBe(false);

  // starting again builds one set of crews, not two: the old set is taken out of the scene
  startSortie();
  step(2);
  expect(sinkingCrewGroups()).toHaveLength(1);
  expect(sinkingCrewGroups()[0]).not.toBe(groups[0]);
  let allies = 0;
  scene.traverse(child => {
    if (child.name === `${SINKING_CREW_NAME}Ally${allyIndex}`) allies++;
  });
  expect(allies).toBe(1);
});

test('when the landing ends the mech is at its start and the camera eases from the last key to the quarter view', async () => {
  startSortie();
  await untilSteps(() => !bars().hidden);
  game().script.cutscene = { id: 'landing', left: 0.05 };
  // the last cutscene frame is the picture the first controlled frame eases from
  const shown = runCutsceneToEnd();
  const model = mechModel();
  expect(model.visible).toBe(true);
  expect(model.position.x).toBeCloseTo(game().mech.x, 3);
  expect(model.position.z).toBeCloseTo(START_Z, 3);
  // the model faces the way the game's mech does: the cursor's point decides that now, not a fixed 0
  expect(model.rotation.y).toBeCloseTo(game().mech.yaw, 6);
  expectEaseToQuarter(shown, 60);
});

test('a skip puts the mech at its start and eases the camera from the frame it skipped', async () => {
  startSortie();
  await untilSteps(() => !bars().hidden);
  game().script.cutscene = { id: 'landing', left: CUTSCENE_SEC.landing - 2 };
  steps(3);
  const view = currentPlayView();
  if (!view || view.quarter.pose === null) throw new Error('the sortie has no camera');
  const shown = view.quarter.pose.pos.clone();
  el('#gl').click();
  await untilSteps(() => bars().hidden);
  expect(mechModel().position.z).toBeCloseTo(START_Z, 3);
  // the skipped frame is far out at sea, so the ease has farther to come than the landing's last key
  expectEaseToQuarter(shown, 90);
});
