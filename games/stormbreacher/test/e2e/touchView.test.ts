import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { camera } from '@engine/render/index.ts';
import { boot } from '../../src/app/boot.ts';
import { QUARTER_TUNE } from '../../src/data/tune.ts';
import { showTouch } from '../../src/dev/views/touch.ts';
import { quarterPose } from '../../src/view/quarterCamera.ts';
import { draw, steps } from './steps.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

test('#view-touch opens under the overview camera with the layout editor and the report', async () => {
  history.replaceState(null, '', '#view-touch');
  showTouch('#view-touch');
  // the mech stands still: 120 frames (2 s) let the camera's follow settle on the overview pose
  steps(120);
  draw();

  expect(document.querySelector('#sbLayoutBtn')).not.toBeNull();
  expect(document.querySelector('#sbResultBtn')).not.toBeNull();
  expect(window.sbTouchReport).toBeTypeOf('function');
  const report = JSON.parse(window.sbTouchReport!());
  expect(report).toHaveProperty('stats');
  expect(report).toHaveProperty('layout');
  expect(report).toHaveProperty('screen');

  // the mech starts at the origin and takes no input, so its feet stay there
  const feet = { x: 0, y: 0, z: 0 };
  const pose = quarterPose(feet, QUARTER_TUNE);
  expect(camera.position.distanceTo(pose.pos)).toBeLessThanOrEqual(0.5);
  expect(camera.fov).toBeCloseTo(QUARTER_TUNE.fov, 1);
  const height = camera.position.y - feet.y;
  expect(Math.abs(height - (QUARTER_TUNE.height + QUARTER_TUNE.lookHeight))).toBeLessThanOrEqual(0.5);

  // the PC's key list says nothing about a jump
  const hint = document.querySelector('#sbPlayHint');
  if (hint) expect(hint.textContent).not.toContain('ジャンプ');
});
