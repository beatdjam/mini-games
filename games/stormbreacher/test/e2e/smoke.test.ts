import { beforeEach, expect, test } from 'vitest';
import * as THREE from 'three';
import { el, t } from '@engine/core/index.ts';
import { camera, drawStats, scene } from '@engine/render/index.ts';
import { FIELD_TUNE } from '../../src/data/tune.ts';
import { isPlaying, state } from '../../src/app/screen.ts';
import { boot, currentGame } from '../../src/app/boot.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

// each test boots the page itself, so one test alone still starts everything (boot() does nothing twice)
beforeEach(() => boot());

const frames = (n: number): Promise<void> =>
  new Promise(resolve => {
    const step = (left: number): void => {
      if (left <= 0) resolve();
      else requestAnimationFrame(() => step(left - 1));
    };
    step(n);
  });

test('the page shows the title and the in-development mark', () => {
  const app = el('#sbApp');
  expect(app.getBoundingClientRect().width).toBeGreaterThan(0);
  expect(el('[data-i18n="app.title"]').textContent).toBe('STORMBREACHER');
  expect(el('[data-i18n="app.status"]').textContent).toBe(t('app.status'));
});

test('the game starts on the title screen and is not being played', () => {
  expect(state).toBe('title');
  expect(isPlaying()).toBe(false);
});

test('a drawn frame reports what it drew', async () => {
  await frames(2);
  // drawStats() is "<n> calls <k>k tris": the ground and the size box make at least one draw call
  const calls = Number(/^(\d+) calls/.exec(drawStats())?.[1]);
  expect(calls).toBeGreaterThan(0);
});

test('the game does not start until the sortie', () => {
  expect(currentGame()).toBeNull();
});

test('the field replaces the engine fog and the camera far plane', () => {
  expect(camera.far).toBe(FIELD_TUNE.viewFar);
  const fog = scene.fog;
  if (!(fog instanceof THREE.Fog)) throw new Error('the field sets a linear fog');
  expect(fog.far).toBe(FIELD_TUNE.fogFar);
});
