// The camera's shake from the battlefield's shells (SB-1700): the layer's step asks for a shake every frame, and the
// draw must add it within the blast's cap (feelBoom) rather than past it.
import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { boot } from '../../src/app/boot.ts';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { FEEL_TUNE } from '../../src/data/tune.ts';
import { newGame } from '../../src/logic/game.ts';
import { buildPlayView, drawPlay } from '../../src/view/play.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

test('a battlefield shell’s shake stops at the blast’s cap', () => {
  const game = newGame(M1B_HAND);
  const view = buildPlayView(game);
  // The battle is the only shake this frame. The game's step turns the shell `stepBattle` gives into a `battleShell`
  // event; the view's battle draw returns its shake, and `drawPlay` adds it within the blast's cap. The shell asks for
  // more than the cap on its own.
  view.feel.shake = FEEL_TUNE.shakeMax / 2;
  game.events.push({
    kind: 'battleShell',
    x: game.mech.x,
    z: game.mech.z - 5,
    shake: FEEL_TUNE.shakeMax * 2,
  });
  drawPlay(view, game, 1 / 60, 0);
  // the frame's own decay is the only thing that takes the capped shake down
  const decay = Math.exp(-FEEL_TUNE.shakeDecay / 60);
  expect(view.feel.shake).toBeCloseTo(FEEL_TUNE.shakeMax * decay, 6);
});
