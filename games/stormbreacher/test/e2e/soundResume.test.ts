// A resumed sortie brings back the radio line that was on screen. beginPlay must tell the sound layer about that line
// before the first frame, or the voice speaks a line the player has already read. The synth is a stand-in that only
// counts the radio's square tone, so nothing here starts audio.
import { beforeAll, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { boot } from '../../src/app/boot.ts';
import { continueSortie, currentGame, startSortie } from '../../src/app/play.ts';
import { SUSPEND_KEY } from '../../src/app/storage.ts';
import { sendToScript } from '../../src/logic/game.ts';
import { suspendOf } from '../../src/logic/suspend.ts';
import { soundFrame } from '../../src/view/sound.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

const synth = vi.hoisted(() => ({ squares: 0 }));

vi.mock('@engine/audio/index.ts', () => ({
  setVolumes: () => {},
  unlockAudio: () => {},
  audioInit: () => {},
  audioNow: () => 0,
  sweepTone: (_t: number, type: string) => {
    if (type === 'square') synth.squares++;
  },
  noiseBurst: () => {},
}));

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

test('a resume does not speak the line that was already on screen', () => {
  startSortie();
  const game = currentGame();
  if (!game) throw new Error('the sortie has not started');
  sendToScript(game, { kind: 'skip' });
  game.radio = { line: 'm1.depot-hint', time: 2 };
  localStorage.setItem(SUSPEND_KEY, JSON.stringify(suspendOf(game)));

  synth.squares = 0;
  continueSortie();
  const resumed = currentGame();
  if (!resumed) throw new Error('the suspend did not come back');
  // beginPlay has already put the line on screen as the last one heard; the first frame must not say it again
  soundFrame(resumed, 0);
  expect(synth.squares).toBe(0);
});
