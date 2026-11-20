import { expect, test } from 'vitest';
import * as THREE from 'three';
import { GUNFIRE_CAP, GUNFIRE_TUNE } from '../../src/data/gunfire.ts';
import { WEAPONS } from '../../src/data/weapons.ts';
import type { Bullet } from '../../src/logic/game.ts';
import {
  buildGunfireView,
  drawGunfire,
  gunfireCounts,
  removeGunfireView,
  spawnImpact,
} from '../../src/view/gunfire.ts';

test('a full spark pool keeps its cap and gives its oldest slot to the newest impact', () => {
  const view = buildGunfireView();
  try {
    // enough metal impacts to fill the pool and go past it
    const impacts = Math.ceil(GUNFIRE_CAP.sparks / GUNFIRE_TUNE.impact.metalSparks);
    for (let i = 0; i < impacts; i++) spawnImpact(view, i, 0, 0, true);
    expect(gunfireCounts(view).sparks).toBe(GUNFIRE_CAP.sparks);
    // the first spark's slot now holds the last impact's spark; the slots past the wrap keep their own
    const wrapped = impacts * GUNFIRE_TUNE.impact.metalSparks - GUNFIRE_CAP.sparks;
    expect(view.sparkSlots[0].x).toBe(impacts - 1);
    expect(view.sparkSlots[wrapped].x).toBe(0);
  } finally {
    removeGunfireView(view);
  }
});

test('a hostile bullet flashes its muzzle once, not on every frame it is seen', () => {
  const view = buildGunfireView();
  try {
    const bullet: Bullet = { pillbox: 'pillbox-1', x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 1, left: 100 };
    drawGunfire(view, [bullet], 0);
    expect(gunfireCounts(view).flashes).toBe(1);
    // the same bullet is in flight on the next frame too, but its muzzle has already flashed
    drawGunfire(view, [bullet], 0);
    expect(gunfireCounts(view).flashes).toBe(1);
  } finally {
    removeGunfireView(view);
  }
});

test('the mech’s tracer leaves the cannon’s mouth while the bullet is still behind it', () => {
  const view = buildGunfireView();
  try {
    // the logic fires from the chest, well behind the cannon the three views draw
    const bullet: Bullet = {
      weapon: 'autocannon',
      x: 0.9,
      y: 2.5,
      z: -0.4,
      dx: 0,
      dy: 0,
      dz: -1,
      left: WEAPONS.autocannon.range,
    };
    const muzzle = new THREE.Vector3(0.64, 2.9, -3);
    drawGunfire(view, [bullet], 0, muzzle);
    const matrix = new THREE.Matrix4();
    view.tracers.getMatrixAt(0, matrix);
    const mid = new THREE.Vector3().setFromMatrixPosition(matrix);
    // the band starts at the muzzle and reaches forward, not back from the bullet
    expect(mid.z).toBeCloseTo(muzzle.z - GUNFIRE_TUNE.tracer.length / 2, 5);
  } finally {
    removeGunfireView(view);
  }
});

// SB-2086: whether a shot is new enough to leave the barrel is read from its own range left, not from where the muzzle
// stands. A shot that crosses in front of the gun (here fired backwards) still starts at the mouth, and an older shot
// whose mouth has walked forward stays at its own head.
test('a new shot starts at the muzzle whichever way it flies, and an old one does not', () => {
  const view = buildGunfireView();
  const matrix = new THREE.Matrix4();
  const mid = new THREE.Vector3();
  try {
    const across: Bullet = {
      weapon: 'autocannon',
      x: 0.9,
      y: 2.5,
      z: -0.4,
      dx: 0,
      dy: 0,
      dz: 1,
      left: WEAPONS.autocannon.range,
    };
    const muzzle = new THREE.Vector3(0.64, 2.9, -3);
    drawGunfire(view, [across], 0, muzzle);
    view.tracers.getMatrixAt(0, matrix);
    mid.setFromMatrixPosition(matrix);
    expect(mid.z, 'across the muzzle').toBeCloseTo(muzzle.z + GUNFIRE_TUNE.tracer.length / 2, 5);

    const old: Bullet = { ...across, x: 0.9, z: -20, left: WEAPONS.autocannon.range - 20 };
    drawGunfire(view, [old], 0, muzzle);
    view.tracers.getMatrixAt(0, matrix);
    mid.setFromMatrixPosition(matrix);
    // its band's middle is 4 m behind its own head, not at the mouth
    expect(mid.z, 'an older shot').toBeCloseTo(-20 - GUNFIRE_TUNE.tracer.length / 2, 5);
  } finally {
    removeGunfireView(view);
  }
});
