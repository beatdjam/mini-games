// Smoke test for the HUD's writes: updateHud leaves a value alone when it has not changed, so a quiet frame does no DOM
// work (perf/sdx-hud-writes). Boots the game page with the loop held (bootFixed), so only the calls in the test write.
import { afterAll, beforeAll, expect, test } from 'vitest';
import { el } from '@engine/core/util.ts';
import type { Boss } from '../src/data/types.ts';
import { TUNE } from '../src/data/progress.ts';
import { player, run } from '../src/actors/player.ts';
import type { AimTarget } from '../src/world/entities.ts';
import { setBoss, setTarget } from '../src/world/entities.ts';
import { screenFx, updateHud } from '../src/ui/hud.ts';
import { bootFixed, unbootFixed } from './fixed.ts';

beforeAll(bootFixed);
afterAll(unbootFixed);

// a node's changes: the observer's callback is asynchronous, so the test reads takeRecords() at the point it counts
function watch(node: Node) {
  const observer = new MutationObserver(() => {});
  observer.observe(node, { childList: true, characterData: true, subtree: true });
  return observer;
}

test('updateHud writes a value only when it changes', () => {
  const bitObserver = watch(el('#bitNum')),
    hpObserver = watch(el('#hpNum'));

  updateHud(); // the first call writes every value
  bitObserver.takeRecords();
  hpObserver.takeRecords();

  updateHud();
  expect(bitObserver.takeRecords().length, 'bits unchanged: no write').toBe(0);
  expect(hpObserver.takeRecords().length, 'HP unchanged: no write').toBe(0);

  run.bits += 1;
  updateHud();
  expect(bitObserver.takeRecords().length, 'bits changed: written').toBeGreaterThan(0);

  player.hp -= 1;
  updateHud();
  expect(hpObserver.takeRecords().length, 'HP changed: written').toBeGreaterThan(0);

  bitObserver.disconnect();
  hpObserver.disconnect();
});

test('updateBars writes the HP bar and its low class when HP drops under the mark', () => {
  const hpBar = el('#hpBar'),
    hpFill = el('#hpFill');

  player.hp = player.maxHp;
  updateHud();
  const full = hpFill.style.transform;
  expect(hpBar.classList.contains('low'), 'full HP: not low').toBe(false);

  player.hp = player.maxHp * 0.2;
  updateHud();
  expect(hpBar.classList.contains('low'), 'under 30%: low').toBe(true);
  expect(hpFill.style.transform, 'under 30%: the fill shrinks').not.toBe(full);

  player.hp = player.maxHp;
  updateHud();
  expect(hpBar.classList.contains('low'), 'back to full: not low').toBe(false);
});

test('updateBars writes the stamina bar, the short class and the dash button when stamina goes under a dash', () => {
  const stBar = el('#stBar'),
    stFill = el('#stFill'),
    btnDash = el('#btnDash');

  player.st = player.stMax;
  updateHud();
  const full = stFill.style.transform;
  expect(stBar.classList.contains('short'), 'full stamina: not short').toBe(false);
  expect(btnDash.classList.contains('off'), 'full stamina: dash on').toBe(false);

  player.st = TUNE.dashCost - 1;
  updateHud();
  expect(stBar.classList.contains('short'), 'under a dash: short').toBe(true);
  expect(btnDash.classList.contains('off'), 'under a dash: dash off').toBe(true);
  expect(stFill.style.transform, 'under a dash: the fill shrinks').not.toBe(full);

  player.st = player.stMax;
  updateHud();
  expect(stBar.classList.contains('short'), 'back to full: not short').toBe(false);
  expect(btnDash.classList.contains('off'), 'back to full: dash on').toBe(false);
});

test('updateBars writes the stamina warning class', () => {
  const stBar = el('#stBar');

  screenFx.stWarn = 0;
  updateHud();
  expect(stBar.classList.contains('warn'), 'no warning: no class').toBe(false);

  screenFx.stWarn = 1;
  updateHud();
  expect(stBar.classList.contains('warn'), 'warning: class set').toBe(true);

  screenFx.stWarn = 0;
  updateHud();
  expect(stBar.classList.contains('warn'), 'warning gone: class off').toBe(false);
});

test('updateVignette writes the opacity when the level changes', () => {
  const vig = el('#vig');

  player.hp = player.maxHp;
  screenFx.vig = 0;
  updateHud();
  const clear = vig.style.opacity;

  screenFx.vig = 0.5;
  updateHud();
  expect(vig.style.opacity, 'a hit: the edge darkens').not.toBe(clear);

  screenFx.vig = 0;
  updateHud();
  expect(vig.style.opacity, 'faded: clear again').toBe(clear);
});

test('updateHud writes the crosshair lock when there is a target', () => {
  const cross = el('#cross');

  setTarget(null);
  updateHud();
  expect(cross.classList.contains('lock'), 'no target: no lock').toBe(false);

  setTarget({} as AimTarget);
  updateHud();
  expect(cross.classList.contains('lock'), 'target: lock').toBe(true);

  setTarget(null);
  updateHud();
  expect(cross.classList.contains('lock'), 'target gone: lock off').toBe(false);
});

test('updateAmmo writes the reload bar while reloading', () => {
  const reload = el('#reload'),
    rFill = el('#rFill');

  player.reloadT = 0;
  updateHud();
  expect(reload.hidden, 'not reloading: hidden').toBe(true);

  player.reloadT = player.reloadMax / 2;
  updateHud();
  const half = rFill.style.transform;
  expect(reload.hidden, 'reloading: shown').toBe(false);

  player.reloadT = player.reloadMax / 4;
  updateHud();
  expect(rFill.style.transform, 'reload advances: the fill moves').not.toBe(half);

  player.reloadT = 0;
  updateHud();
  expect(reload.hidden, 'reload done: hidden').toBe(true);
});

test('updateHud writes the boss bar when the boss loses HP', () => {
  const bossFill = el('#bossFill'),
    stub = { hp: 100, maxHp: 100 } as Boss;

  setBoss(stub);
  updateHud();
  const full = bossFill.style.transform;

  stub.hp = 50;
  updateHud();
  expect(bossFill.style.transform, 'half HP: the bar shrinks').not.toBe(full);

  setBoss(null);
});
