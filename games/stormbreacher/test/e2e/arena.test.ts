// #view-arena: the sortie's own fight in a flat arena. The page itself is not drawn between the frames: runSystems moves
// the game and the view by hand, as #view-fx's test does, so the test needs no frame timing.
import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { runSystems } from '@engine/core/index.ts';
import { boot } from '../../src/app/boot.ts';
import { currentArenaGame, showArena } from '../../src/dev/views/arena.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

const key = (type: string, code: string): KeyboardEvent => new KeyboardEvent(type, { code, bubbles: true });

test('#view-arena opens, fights a group and puts the next one out when it falls', () => {
  history.replaceState(null, '', '#view-arena?enemies=grunt:1');
  showArena('#view-arena?enemies=grunt:1');
  const arena = currentArenaGame();
  if (!arena) throw new Error('the arena did not open');
  expect(document.querySelector('#sbArenaHud')).not.toBeNull();

  runSystems(1 / 60);
  const first = arena.enemies.filter(enemy => enemy.hp > 0);
  expect(first).toHaveLength(1);
  const enemy = first[0];
  // Stand it straight ahead, clear of the cover, so the soft FCS has an easy line and the test is about the arena,
  // not about aiming.
  enemy.x = arena.mech.x - 40;
  enemy.z = arena.mech.z;
  enemy.y = 0;
  arena.mech.yaw = Math.PI / 2;
  const before = enemy.hp;

  window.dispatchEvent(key('keydown', 'KeyJ'));
  try {
    for (let i = 0; i < 60 * 8 && arena.enemies.some(other => other.hp > 0); i++) {
      arena.mech.yaw = Math.PI / 2;
      runSystems(1 / 60);
    }
  } finally {
    window.dispatchEvent(key('keyup', 'KeyJ'));
  }
  expect(enemy.hp).toBeLessThan(before);

  const report = JSON.parse(window.sbArenaReport?.() ?? '{}') as {
    kills: number;
    shots: number;
    hits: number;
  };
  expect(report.shots).toBeGreaterThan(0);
  expect(report.hits).toBeGreaterThan(0);
  expect(report.kills).toBeGreaterThanOrEqual(1);

  // The group is down: a few seconds later the next one comes in.
  for (let i = 0; i < 60 * 6 && !arena.enemies.some(other => other.hp > 0); i++) runSystems(1 / 60);
  const next = arena.enemies.filter(other => other.hp > 0);
  expect(next).toHaveLength(1);
  expect(next[0].id).not.toBe(enemy.id);
});
