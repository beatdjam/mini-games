// The map as the screen draws it: a target that falls must stop being the tall wall the camera kept out of.
import { expect, test } from 'vitest';
import { M1B_HAND } from '../../src/data/maps/m1b-hand.ts';
import { TARGET_SIZE, WRECK_SCALE_Y } from '../../src/data/props.ts';
import { newGame } from '../../src/logic/game.ts';
import { buildWorld, syncWorld } from '../../src/view/world.ts';

test('a broken target no longer pushes the camera as a tall wall', () => {
  const world = buildWorld(M1B_HAND);
  const game = newGame(M1B_HAND);
  const box = world.targetCameraBoxes.get('pillbox-1');
  if (!box) throw new Error('the hand map has no pillbox-1 camera box');
  expect(world.cameraBoxes).toContain(box); // the camera reads these boxes every frame
  expect(box.max.y).toBe(TARGET_SIZE.pillbox.h);

  const target = game.targets.find(entry => entry.id === 'pillbox-1');
  if (!target) throw new Error('the game has no pillbox-1');
  target.hp = 0;
  syncWorld(world, game, 0);
  expect(box.max.y).toBeCloseTo(TARGET_SIZE.pillbox.h * WRECK_SCALE_Y, 9);
});
