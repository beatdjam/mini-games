// A shot a pillbox's front turns away throws its own small bright spark; it must not also get the metal sparks and the
// puff an ordinary hit leaves, or the two effects stack on the same impact (the review of SB-2061).
import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { boot } from '../../src/app/boot.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { newGame, type GameEvent } from '../../src/logic/game.ts';
import { buildPlayView, drawPlay } from '../../src/view/play.ts';
import { gunfireCounts } from '../../src/view/gunfire.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

test('a deflected hit keeps its own spark and gets no metal sparks or puff', () => {
  const game = newGame(M1B_HAND);
  const view = buildPlayView(game);
  const hit: GameEvent = {
    kind: 'hit',
    x: 0,
    y: 1,
    z: 0,
    weapon: 'autocannon',
    target: 'pillbox-1',
    prop: null,
    enemy: null,
    mech: false,
    deflected: false,
  };
  // the same metal target, first turned away by its front and then hit: only the second leaves the metal impact
  game.events = [{ ...hit, deflected: true }];
  drawPlay(view, game, 0);
  expect(gunfireCounts(view.gunfire)).toMatchObject({ sparks: 0, smoke: 0 });
  game.events = [hit];
  drawPlay(view, game, 0);
  expect(gunfireCounts(view.gunfire).sparks).toBeGreaterThan(0);
  expect(gunfireCounts(view.gunfire).smoke).toBe(1);
});
