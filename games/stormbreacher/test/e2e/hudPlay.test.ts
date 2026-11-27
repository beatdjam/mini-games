import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { el, runSystems, t } from '@engine/core/index.ts';
import { newEnemy } from '../../src/logic/enemies.ts';
import { sendToScript } from '../../src/logic/game.ts';
import { currentGame, currentPlayView, startSortie, showResult } from '../../src/app/play.ts';
import { aimPointOf } from '../../src/view/play.ts';
import { boot } from '../../src/app/boot.ts';
import { steps } from './steps.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

// The tests share one page: each starts the sortie again directly.
beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

const key = (type: string, code: string): KeyboardEvent => new KeyboardEvent(type, { code, bubbles: true });

test('a sortie shows the HUD', () => {
  startSortie();
  const hud = el('#sbPlayHud');
  for (const id of ['main', 'sub', 'objective', 'radio', 'radar', 'reticle', 'warning'])
    expect(hud.querySelector(`[data-hud="${id}"]`), `the HUD is missing ${id}`).not.toBeNull();
  expect(hud.querySelector('[data-hud="warning"]')?.hasAttribute('hidden'), 'no warning at the start').toBe(true);
  expect(hud.querySelector('[data-hud="radio"]')?.hasAttribute('hidden'), 'no radio line at the start').toBe(true);
  expect(hud.querySelector('[data-hud="heat"]'), 'the HUD should not have heat').toBeNull();
  expect(document.querySelector('#sbHud')).toBeNull();
});

test('the ammo gauges follow the shots', async () => {
  startSortie();
  // E's main ammo is the aim mark's left arc: its fill's path is the gauge's remaining share
  const mainArc = (): string => {
    const main = el('#sbPlayHud [data-hud="main"]');
    const paths = main.querySelectorAll('path');
    const fill = paths[paths.length - 1];
    if (!fill) throw new Error('the main gauge has no arc');
    return fill.getAttribute('d') ?? '';
  };
  // the HUD is filled on the first frame of the sortie
  steps(1);
  const current = currentGame();
  if (!current) throw new Error('the sortie has not started');
  sendToScript(current, { kind: 'skip' }); // the mech takes no input during the landing
  const before = mainArc();
  window.dispatchEvent(key('keydown', 'KeyJ'));
  // the systems run by hand, a 60th of a second each: drawn frames are slow on CI (software GL, seconds each)
  for (let i = 0; i < 30; i++) runSystems(1 / 60);
  steps(1);
  window.dispatchEvent(key('keyup', 'KeyJ'));
  expect(mainArc()).not.toBe(before);
});

test('starting again leaves one HUD', () => {
  startSortie();
  startSortie();
  expect(document.querySelectorAll('#sbPlayHud').length).toBe(1);
});

test('the result hides the HUD', () => {
  startSortie();
  showResult();
  expect(el('#sbPlayHud').hidden).toBe(true);
});

test("the objective is the script's first one", async () => {
  startSortie();
  steps(1);
  const objective = el('#sbPlayHud [data-hud="objective"]');
  expect(objective.hidden).toBe(false);
  expect(objective.textContent).toContain(t('obj.reach-pillboxes'));
});

test('the use prompt says how to plant a charge at a blast point, and the touch button lights', async () => {
  startSortie();
  const game = currentGame();
  if (!game) throw new Error('the sortie has not started');
  steps(1);
  sendToScript(game, { kind: 'skip' }); // the mech takes no input during the landing
  const use = el('#sbPlayHud [data-hud="use"]');
  const button = el('#btnUse');
  expect(use.hidden).toBe(true);
  expect(button.classList.contains('on')).toBe(false);

  // pillbox-1's side point is at (-41, -15); stand 2 m sea-side of it
  game.mech.x = -41;
  game.mech.y = 0;
  game.mech.z = -13;
  game.mech.grounded = true;
  runSystems(1 / 60);
  steps(1);
  expect(use.hidden).toBe(false);
  expect(use.textContent).toContain(t('hud.plant'));
  expect(button.classList.contains('on')).toBe(true);

  // out of reach: the prompt and the lit button go
  game.mech.z = -30;
  runSystems(1 / 60);
  steps(1);
  expect(use.hidden).toBe(true);
  expect(button.classList.contains('on')).toBe(false);
});

test('the lock frame shows only while the aim is pulled toward a target', () => {
  startSortie();
  const game = currentGame();
  if (!game) throw new Error('the sortie has not started');
  steps(1);
  sendToScript(game, { kind: 'skip' }); // the mech takes no input during the landing
  steps(1);
  const view = currentPlayView();
  if (!view) throw new Error('the sortie has no view');
  const lock = el('#sbPlayHud [data-hud="lock"]');
  expect(game.aimTarget).toBeNull();
  expect(lock.hidden).toBe(true);

  // The quarter camera aims with the cursor: the enemy is put on the ground point the cursor names, in the middle of the
  // screen, so the quarter FCS's circle (FCS_QUARTER) holds it. The lens is put at its place in one frame, so that point
  // is the tune's own.
  const tune = view.quarter.tune;
  const lag = tune.lag;
  tune.lag = 0;
  // open sand, clear of the craft and the props, so the enemy put under the cursor is in sight
  game.mech.x = 0;
  game.mech.z = 110;
  game.mech.y = 0;
  game.mech.grounded = true;
  game.mech.vx = 0;
  game.mech.vz = 0;
  steps(1);
  const rect = el('#gl').getBoundingClientRect();
  const move = (x: number, y: number): void => {
    window.dispatchEvent(
      new MouseEvent('mousemove', {
        clientX: rect.left + ((x + 1) / 2) * rect.width,
        clientY: rect.top + ((1 - y) / 2) * rect.height,
        bubbles: true,
      }),
    );
  };
  const enemyId = 'lock-frame-test';
  const others = game.enemies;
  try {
    // the lock is what this test is about, so the other waves are kept out of the way; the target is the one we place
    game.enemies = [];
    move(0, 0);
    steps(1);
    const at = aimPointOf(view, { x: 0, y: 0 }, game.mech.y);
    if (at === null) throw new Error('the middle of the screen looked above the horizon');
    game.enemies.push(newEnemy(enemyId, 'test', 'grunt', at.x, at.z));
    steps(1);
    expect(game.aimTarget).toBe(enemyId);
    expect(lock.hidden).toBe(false);
    expect(lock.getBoundingClientRect().width).toBeGreaterThan(0);

    // aim away to the screen's right: the target leaves the circle and the frame goes
    move(0.95, 0);
    steps(1);
    expect(game.aimTarget).toBeNull();
    expect(lock.hidden).toBe(true);
  } finally {
    tune.lag = lag;
    game.enemies = others;
  }
});
