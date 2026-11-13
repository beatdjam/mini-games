// A hit on the mech lights the screen edge the shot came from and the glow goes out in time (SB-1380).
import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { currentGame, startSortie } from '../../src/app/play.ts';
import { boot } from '../../src/app/boot.ts';
import { HURT_TUNE, MECH_TUNE } from '../../src/data/tune.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

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

// The mech starts facing -z, so a shot from +x comes from its right: the second edge after the front's.
const RIGHT = 2;
const LEFT = 6;

test('a shot from the right lights the right edge, and the glow goes out in time', async () => {
  startSortie();
  const current = game();
  // inside the mech's box and flying from its right, so the first step takes the armour and reports the way it came from
  current.bullets.push({
    enemy: 'grunt',
    x: current.mech.x + 0.5,
    y: current.mech.y + MECH_TUNE.chestHeight,
    z: current.mech.z,
    dx: -1,
    dy: 0,
    dz: 0,
    left: 50,
  });
  await frame();

  expect(Number(edge(RIGHT).style.opacity)).toBeGreaterThan(0);
  expect(Number(edge(LEFT).style.opacity)).toBe(0);

  // the glow lasts HURT_TUNE.edgeFade seconds of the game's own time, whatever the frame rate: wait for that much
  // simulated time (the frames add up to it), not a number of frames
  const began = current.time;
  for (let i = 0; i < 600 && current.time - began < HURT_TUNE.edgeFade + 0.05; i++) await frame();
  expect(Number(edge(RIGHT).style.opacity)).toBe(0);
});
