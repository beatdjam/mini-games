import { expect, test, vi } from 'vitest';
import * as THREE from 'three';
import { FEEL_TUNE, QUARTER_TUNE } from '../../src/data/tune.ts';
import { quarterPose } from '../../src/view/quarterCamera.ts';
import { aimPointOf, type PlayView } from '../../src/view/play.ts';

test('the top cursor with the boost fov meets the drawn ground within 0.1m', () => {
  vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 720 });
  try {
    const pose = quarterPose({ x: 0, y: 0, z: 0 }, QUARTER_TUNE);
    // the fov a boosting frame is drawn with: the quarter tune widened by the feel's boost
    const fov = QUARTER_TUNE.fov + FEEL_TUNE.boostFov;
    const view = { quarter: { tune: QUARTER_TUNE, pose, fov } } as unknown as PlayView;
    const cam = new THREE.PerspectiveCamera(fov, 16 / 9, 0.1, 1000);
    cam.position.copy(pose.pos);
    cam.lookAt(pose.look);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 1), cam);
    const hit = new THREE.Vector3();
    expect(ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)).not.toBeNull();
    const at = aimPointOf(view, { x: 0, y: 1 }, 0);
    expect(at).not.toBeNull();
    expect(Math.hypot(at!.x - hit.x, at!.z - hit.z)).toBeLessThan(0.1);
  } finally {
    vi.unstubAllGlobals();
  }
});
