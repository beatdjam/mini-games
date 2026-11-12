import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { el, runSystems, t } from '@engine/core/index.ts';
import { PLAY_TUNE } from '../../src/data/tune.ts';
import { currentGame, startSortie } from '../../src/app/play.ts';
import { state } from '../../src/app/screen.ts';
import { boot } from '../../src/app/boot.ts';
import { sendToScript } from '../../src/logic/game.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

// The three tests share one page: the first presses the start button, the other two start the sortie again directly.
beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

const key = (type: string, code: string): KeyboardEvent => new KeyboardEvent(type, { code, bubbles: true });

function game() {
  const current = currentGame();
  if (!current) throw new Error('the sortie has not started');
  return current;
}

// Runs the game's systems by hand, a 60th of a second each, until `done` holds, and fails when it never does. Waiting
// for drawn frames instead timed out at 60 s on CI when every game's tests ran at once. A drawn frame could be up to a
// 20th of a second, so 720 steps are the 12 s of the game that 240 frames were. A drawn frame every 30 steps lets the
// page's own timers move on.
async function until(done: () => boolean, tries = 720): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (done()) return;
    runSystems(1 / 60);
    if (i % 30 === 29) await frame();
  }
  if (!done()) throw new Error(`the page did not reach the state in ${tries} steps`);
}

test('the start button begins a sortie on M1 B', () => {
  el<HTMLButtonElement>('#sbStart').click();
  expect(state).toBe('briefing');
  el<HTMLButtonElement>('#sbBriefingSkip').click(); // the briefing is test/e2e/briefing.test.ts's
  expect(state).toBe('play');
  const current = game();
  expect(current.mech.z).toBe(current.map.bounds.maxZ - PLAY_TUNE.startMargin);
  expect(el('#sbApp').hidden).toBe(true);
});

test('the mech walks and shoots in the sortie', async () => {
  startSortie();
  const current = game();
  const startZ = current.mech.z;
  window.dispatchEvent(key('keydown', 'KeyW'));
  window.dispatchEvent(key('keydown', 'KeyJ'));
  let shots = 0;
  for (let i = 0; i < 30; i++) {
    await frame();
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
  const pillbox = current.targets.find(target => target.id === 'pillbox-1');
  if (!pillbox) throw new Error('the map has no pillbox-1');
  current.mech.x = -33;
  current.mech.z = 5;
  current.mech.yaw = 0;
  window.dispatchEvent(key('keydown', 'KeyJ'));
  // the first shot brings one target down; the rest stay up, so the sortie goes on
  await until(() => pillbox.hp === 0);
  expect(state).toBe('play');
  // every target on the map down still does not end the sortie: only the script's end does
  for (const target of current.targets) target.hp = 0;
  await frame();
  expect(state).toBe('play');
  sendToScript(current, { kind: 'destroyed', target: 'main-gun-1' });
  sendToScript(current, { kind: 'destroyed', target: 'main-gun-2' });
  sendToScript(current, { kind: 'destroyed', target: 'magazine' });
  await until(() => state === 'result');
  window.dispatchEvent(key('keyup', 'KeyJ'));
  expect(el('#sbResult').hidden).toBe(false);
  expect(el('#sbResultTime').textContent).toContain('0:');
});
