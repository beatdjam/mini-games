import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { camera } from '@engine/render/index.ts';
import { boot } from '../../src/app/boot.ts';
import { QUARTER_TUNE } from '../../src/data/tune.ts';
import { showMap } from '../../src/dev/views/mapView.ts';
import { quarterPose } from '../../src/view/quarterCamera.ts';
import { draw, steps } from './steps.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

test('#view-map opens under the overview camera, still, with the quarter camera in the panel', async () => {
  history.replaceState(null, '', '#view-map?src=hand');
  showMap('#view-map?src=hand');

  expect(window.sbMapReport).toBeTypeOf('function');
  const report = JSON.parse(window.sbMapReport!());
  expect(report).toHaveProperty('id');
  expect(report).toHaveProperty('props');
  const feet = { x: report.mech.x, y: 0, z: report.mech.z };

  // the mech takes no walking input, so 120 frames (2 s) leave it where it started and settle the camera's follow
  steps(120);
  draw();
  const later = JSON.parse(window.sbMapReport!());
  expect(later.mech.x).toBeCloseTo(feet.x, 5);
  expect(later.mech.z).toBeCloseTo(feet.z, 5);

  const pose = quarterPose(feet, QUARTER_TUNE);
  expect(camera.position.distanceTo(pose.pos)).toBeLessThanOrEqual(0.5);
  expect(camera.fov).toBeCloseTo(QUARTER_TUNE.fov, 1);

  const panel = document.querySelector('#sbTunePanel');
  expect(panel).not.toBeNull();
  expect(panel!.textContent).toContain('QUARTER_TUNE');
});
