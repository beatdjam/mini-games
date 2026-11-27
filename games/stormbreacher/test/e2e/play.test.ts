import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import * as THREE from 'three';
import { el, t } from '@engine/core/index.ts';
import { camera } from '@engine/render/index.ts';
import { craftZ } from '../../src/data/craft.ts';
import { LANDING_TUNE } from '../../src/data/landing.ts';
import { currentGame, currentPlayView, startSortie } from '../../src/app/play.ts';
import { state } from '../../src/app/screen.ts';
import { boot } from '../../src/app/boot.ts';
import { sendToScript } from '../../src/logic/game.ts';
import { aimRay } from '../../src/view/camera.ts';
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

test('the aim is the camera state with the feel shake taken out', async () => {
  startSortie();
  steps(1);
  sendToScript(game(), { kind: 'skip' });
  steps(1);
  // The quarter camera (ticket 2100) has no third-person state; ticket 2135 rewrites this check for it, so the old
  // fields are only named here.
  const view = currentPlayView();
  // @ts-expect-error the third-person camera is gone (ticket 2135 rewrites this check)
  if (!view || view.cam === null) throw new Error('the sortie has no camera');
  // a big shake moves the camera the screen draws, but the reticle and the shots keep the state's line
  view.feel.shake = 1;
  steps(1);
  // @ts-expect-error the third-person camera is gone (ticket 2135 rewrites this check)
  expect(view.aim).toEqual(aimRay(view.cam));
  // @ts-expect-error the third-person camera is gone (ticket 2135 rewrites this check)
  const origin = new THREE.Vector3(view.aim.ox, view.aim.oy, view.aim.oz);
  // @ts-expect-error the third-person camera is gone (ticket 2135 rewrites this check)
  expect(origin.distanceTo(view.cam.pos)).toBe(0);
  expect(camera.position.distanceTo(origin)).toBeGreaterThan(1e-3);
});
