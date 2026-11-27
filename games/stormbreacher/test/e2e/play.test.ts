import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { el, t } from '@engine/core/index.ts';
import { camera } from '@engine/render/index.ts';
import { craftZ } from '../../src/data/craft.ts';
import { LANDING_TUNE } from '../../src/data/landing.ts';
import { currentGame, currentPlayView, cursorAim, startSortie } from '../../src/app/play.ts';
import type { PlayRead } from '../../src/app/input.ts';
import { state } from '../../src/app/screen.ts';
import { boot } from '../../src/app/boot.ts';
import { sendToScript } from '../../src/logic/game.ts';
import { groundPoint, quarterPose } from '../../src/view/quarterCamera.ts';
import { steps, untilSteps } from './steps.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

// The three tests share one page: the first presses the start button, the other two start the sortie again directly.
beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

const key = (type: string, code: string): KeyboardEvent => new KeyboardEvent(type, { code, bubbles: true });

function game() {
  const current = currentGame();
  if (!current) throw new Error('the sortie has not started');
  return current;
}

test('the start button begins a sortie on M1 B', () => {
  el<HTMLButtonElement>('#sbStart').click();
  expect(state).toBe('briefing');
  el<HTMLButtonElement>('#sbBriefingSkip').click(); // the briefing is test/e2e/briefing.test.ts's
  expect(state).toBe('play');
  const current = game();
  expect(current.mech.z).toBe(craftZ(current.map.bounds) + LANDING_TUNE.startDepth);
  expect(el('#sbApp').hidden).toBe(true);
});

test('the mech walks and shoots in the sortie', async () => {
  startSortie();
  const current = game();
  // the landing holds the mech on the deck; let it go so the keys reach the mech
  sendToScript(current, { kind: 'skip' });
  const startZ = current.mech.z;
  window.dispatchEvent(key('keydown', 'KeyW'));
  window.dispatchEvent(key('keydown', 'KeyJ'));
  let shots = 0;
  for (let i = 0; i < 30; i++) {
    steps(1);
    shots += game().events.filter(event => event.kind === 'shot').length;
  }
  window.dispatchEvent(key('keyup', 'KeyW'));
  window.dispatchEvent(key('keyup', 'KeyJ'));
  expect(game().mech.z).toBeLessThan(startZ);
  expect(shots).toBeGreaterThan(0);
  const objective = el('#sbPlayHud [data-hud="objective"]');
  expect(objective.hidden).toBe(false);
  expect(objective.textContent).toContain(t('obj.reach-pillboxes'));
});

test("the script's end shows the result", async () => {
  startSortie();
  const current = game();
  for (const target of current.targets) target.hp = 1;
  // a depot still breaks from a shot (SB-2015 leaves only the pillboxes to the charges)
  const depot = current.targets.find(target => target.id === 'depot');
  if (!depot) throw new Error('the map has no depot');
  current.mech.x = depot.box ? (depot.box.minX + depot.box.maxX) / 2 : 0;
  current.mech.z = 41;
  current.mech.yaw = 0;
  window.dispatchEvent(key('keydown', 'KeyJ'));
  // the first shot brings one target down; the rest stay up, so the sortie goes on
  await untilSteps(() => depot.hp === 0);
  expect(state).toBe('play');
  // every target on the map down still does not end the sortie: only the script's end does
  for (const target of current.targets) target.hp = 0;
  steps(1);
  expect(state).toBe('play');
  sendToScript(current, { kind: 'destroyed', target: 'main-gun-1' });
  sendToScript(current, { kind: 'destroyed', target: 'main-gun-2' });
  sendToScript(current, { kind: 'destroyed', target: 'magazine' });
  await untilSteps(() => state === 'result');
  window.dispatchEvent(key('keyup', 'KeyJ'));
  expect(el('#sbResult').hidden).toBe(false);
  expect(el('#sbResultTime').textContent).toContain('0:');
});

test("the aim is the cursor's point on the ground, and the feel's shake does not move it", () => {
  startSortie();
  steps(1);
  sendToScript(game(), { kind: 'skip' });
  steps(1);
  const current = game();
  const view = currentPlayView();
  if (!view) throw new Error('the sortie has no view');
  // The quarter camera keeps no third-person state: the aim is the ground point under the cursor. The mech is left
  // standing, and the lens is put at its place in one frame, so the ground point can be worked out from the tune alone.
  expect(view.aim).toBeUndefined();
  const tune = view.quarter.tune;
  const lag = tune.lag;
  tune.lag = 0;
  try {
    steps(1);
    const aspect = window.innerWidth / window.innerHeight;
    const aimAt = (cursor: { x: number; y: number }) => {
      // cursorAim reads only the cursor from the frame's read
      const aim = cursorAim(current, view, { cursor } as unknown as PlayRead);
      if (aim.aimAt === undefined) throw new Error('the cursor gave no point on the ground');
      return aim.aimAt;
    };
    const groundAt = (cursor: { x: number; y: number }) => {
      const pose = quarterPose({ x: current.mech.x, y: current.mech.y, z: current.mech.z }, tune);
      const point = groundPoint(pose, tune.fov, aspect, cursor, current.mech.y);
      if (point === null) throw new Error('the cursor looked above the horizon');
      return point;
    };

    // the point under the middle of the screen, from the camera's place and not the drawn (shaken) camera
    const middle = aimAt({ x: 0, y: 0 });
    const middleGround = groundAt({ x: 0, y: 0 });
    expect(middle.x).toBeCloseTo(middleGround.x, 6);
    expect(middle.z).toBeCloseTo(middleGround.z, 6);

    // a shake moves the drawn camera, but not the point the shot is aimed at
    view.feel.shake = 1;
    steps(1);
    expect(camera.position.distanceTo(view.quarter.pose!.pos)).toBeGreaterThan(0.1);
    const shaken = aimAt({ x: 0, y: 0 });
    expect(shaken.x).toBeCloseTo(middle.x, 9);
    expect(shaken.z).toBeCloseTo(middle.z, 9);

    // and moving the cursor moves the point: the aim is the cursor's, not the camera's line
    const right = aimAt({ x: 0.5, y: 0 });
    const rightGround = groundAt({ x: 0.5, y: 0 });
    expect(right.x).toBeCloseTo(rightGround.x, 6);
    expect(right.z).toBeCloseTo(rightGround.z, 6);
    expect(Math.hypot(right.x - middle.x, right.z - middle.z)).toBeGreaterThan(1);
  } finally {
    tune.lag = lag;
  }
});
