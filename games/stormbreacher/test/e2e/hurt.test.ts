// A hit on the mech lights the screen edge the shot came from and the glow goes out in time (SB-1380).
import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { currentGame, startSortie } from '../../src/app/play.ts';
import { boot } from '../../src/app/boot.ts';
import { HURT_TUNE, MECH_TUNE, QUARTER_TUNE } from '../../src/data/tune.ts';
import { steps, untilSteps } from './steps.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

function game() {
  const current = currentGame();
  if (!current) throw new Error('the sortie has not started');
  return current;
}

function edge(index: number): HTMLElement {
  const node = document.querySelector<HTMLElement>(`#sbPlayHurt [data-hurt-edge="${index}"]`);
  if (!node) throw new Error(`the hurt view has no edge ${index}`);
  return node;
}

// The overview's edges follow the screen, not the mech's own facing (SB-2127): the top runs along QUARTER_TUNE.azimuth,
// so the screen's right is that way turned a quarter, and a shot from it lights the second edge after the top's.
const RIGHT = 2;
const LEFT = 6;
const SCREEN_RIGHT = { x: Math.cos(QUARTER_TUNE.azimuth), z: -Math.sin(QUARTER_TUNE.azimuth) };

test('a shot from the screen’s right lights the right edge, and the glow goes out in time', async () => {
  startSortie();
  const current = game();
  // inside the mech's box and flying from the screen's right, so the first step takes the armour and reports the way it
  // came from
  current.bullets.push({
    enemy: 'grunt',
    x: current.mech.x + SCREEN_RIGHT.x * 0.5,
    y: current.mech.y + MECH_TUNE.chestHeight,
    z: current.mech.z + SCREEN_RIGHT.z * 0.5,
    dx: -SCREEN_RIGHT.x,
    dy: 0,
    dz: -SCREEN_RIGHT.z,
    left: 50,
  });
  steps(1);

  expect(Number(edge(RIGHT).style.opacity)).toBeGreaterThan(0);
  expect(Number(edge(LEFT).style.opacity)).toBe(0);

  // the glow lasts HURT_TUNE.edgeFade seconds of the game's own time: run the game by hand until that much has passed
  const began = current.time;
  await untilSteps(() => current.time - began >= HURT_TUNE.edgeFade + 0.05);
  expect(Number(edge(RIGHT).style.opacity)).toBe(0);
});
