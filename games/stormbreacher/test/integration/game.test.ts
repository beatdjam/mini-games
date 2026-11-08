import { expect, test } from 'vitest';
import { newGame, step } from '../../src/logic/game.ts';

// This runs in node without three or the DOM: that it passes is itself the check that the logic runs without a page.
test('120 frames of 1/60 s advance the game by 2 s', () => {
  const game = newGame();
  for (let i = 0; i < 120; i++) step(game, 1 / 60);
  expect(game.time).toBeCloseTo(2, 6);
});
