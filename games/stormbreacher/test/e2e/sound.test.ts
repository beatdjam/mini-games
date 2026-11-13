// The sound check: #view-sound lists the whole table, and a sortie runs frames without the sound layer throwing.
import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { runSystems } from '@engine/core/index.ts';
import { boot, currentGame } from '../../src/app/boot.ts';
import { startSortie } from '../../src/app/play.ts';
import { SOUND_NAMES } from '../../src/data/sounds.ts';
import { showSound } from '../../src/dev/views/sound.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

test('#view-sound opens with a button for every sound and a distance knob', () => {
  history.replaceState(null, '', '#view-sound');
  showSound();
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('#sbSound button[data-sound]')];
  expect(buttons.map(button => button.dataset.sound)).toEqual([...SOUND_NAMES]);
  expect(document.querySelector('#sbSoundDistance')).not.toBeNull();
  // the list covers the page and the tuning panel sits above it; the next test runs a sortie, so it goes
  document.getElementById('sbSound')?.remove();
});

test('a sortie plays frames through the sound layer without throwing', () => {
  startSortie();
  for (let i = 0; i < 5; i++) runSystems(1 / 60);
  const game = currentGame();
  if (!game) throw new Error('the sortie has not started');
  expect(game.time).toBeGreaterThan(0);
});
