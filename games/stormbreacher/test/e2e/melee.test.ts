// The fist in the page: Q is the key, the event names the blow and a grunt in front of the mech loses health. The game
// runs by hand a 60th of a second at a time, as play.test does, so the test does not wait on drawn frames.
import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { runSystems } from '@engine/core/index.ts';
import { currentGame, startSortie } from '../../src/app/play.ts';
import { boot } from '../../src/app/boot.ts';
import { newEnemy } from '../../src/logic/enemies.ts';
import { sendToScript, type GameEvent, type GameModel } from '../../src/logic/game.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

const frame = (): Promise<void> => new Promise(resolve => requestAnimationFrame(() => resolve()));

const key = (type: string, code: string): KeyboardEvent => new KeyboardEvent(type, { code, bubbles: true });

function game(): GameModel {
  const current = currentGame();
  if (!current) throw new Error('the sortie has not started');
  return current;
}

type MeleeEvent = Extract<GameEvent, { kind: 'melee' }>;

test('Q throws a blow that reports a hit and takes an enemy in front down in health', async () => {
  startSortie();
  const current = game();
  // the landing holds the mech on the deck; let it go so the key reaches the mech
  sendToScript(current, { kind: 'skip' });
  const enemy = newEnemy('melee-target', 'test', 'grunt', current.mech.x, current.mech.z - 3);
  current.enemies = [enemy];
  const before = enemy.hp;

  let blow: MeleeEvent | null = null;
  window.dispatchEvent(key('keydown', 'KeyQ'));
  for (let i = 0; i < 30; i++) {
    runSystems(1 / 60);
    const found = game().events.find((event): event is MeleeEvent => event.kind === 'melee');
    if (found) blow = found;
  }
  window.dispatchEvent(key('keyup', 'KeyQ'));
  await frame();

  expect(blow?.hit).toBe(true);
  expect(blow?.enemy).toBe('melee-target');
  expect(enemy.hp).toBeLessThan(before);
});
