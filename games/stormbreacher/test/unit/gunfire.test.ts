import { expect, test } from 'vitest';
import { GUNFIRE_CAP, GUNFIRE_TUNE } from '../../src/data/gunfire.ts';
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
