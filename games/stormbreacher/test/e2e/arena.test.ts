// #view-arena: the sortie's own fight in a flat arena. The page itself is not drawn between the frames: runSystems moves
// the game and the view by hand, as #view-fx's test does, so the test needs no frame timing.
import { beforeAll, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { el, runSystems } from '@engine/core/index.ts';
import { boot } from '../../src/app/boot.ts';
import { MECH_TUNE } from '../../src/data/tune.ts';
import { currentArenaGame, currentArenaView, showArena } from '../../src/dev/views/arena.ts';
import { aimPointOf } from '../../src/view/play.ts';
// loads the language files and boots the page, as the real page does
import '../../src/main.ts';

beforeAll(async () => {
  await page.viewport(1280, 720);
  boot();
});

// where on the screen's vertical middle line (+1 is the top) the cursor points: toward the top, where the enemies come from
const AIM_Y = 0.25;

const key = (type: string, code: string): KeyboardEvent => new KeyboardEvent(type, { code, bubbles: true });

test('#view-arena opens, fights a group and puts the next one out when it falls', () => {
  history.replaceState(null, '', '#view-arena?enemies=grunt:1');
  showArena('#view-arena?enemies=grunt:1');
  const arena = currentArenaGame();
  if (!arena) throw new Error('the arena did not open');
  expect(document.querySelector('#sbArenaHud')).not.toBeNull();

  runSystems(1 / 60);
  const view = currentArenaView();
  if (!view) throw new Error('the arena has no view');
  // The camera follows the mech with a lag. Let it come to rest first, so the screen's point and the ground it names do
  // not move under the test.
  let moved = Infinity;
  for (let i = 0; i < 60 && moved >= 1e-12; i++) {
    const before = view.quarter.pose;
    const pos = before?.pos.clone();
    const look = before?.look.clone();
    runSystems(1 / 60);
    const after = view.quarter.pose;
    if (pos && look && after) moved = Math.max(after.pos.distanceToSquared(pos), after.look.distanceToSquared(look));
  }
  expect(moved, 'the camera came to rest').toBeLessThan(1e-12);

  const first = arena.enemies.filter(enemy => enemy.hp > 0);
  expect(first).toHaveLength(1);
  const enemy = first[0];
  // Put the enemy where a point on the screen's vertical middle line names on the ground: the arena aims with the
  // cursor's ground point (FCS_QUARTER). x = 0 is the same line whatever the window's size, so no projection or camera
  // aspect is read, and the upper half puts the enemy well ahead of the mech.
  const cursor = { x: 0, y: AIM_Y };
  const spot = aimPointOf(view, cursor, arena.mech.y);
  if (!spot) throw new Error("the screen's point does not name a point on the ground");
  enemy.x = spot.x;
  enemy.z = spot.z;
  enemy.y = 0;
  // The cursor goes to the same screen point, so the game reads the ground point the enemy stands on.
  const rect = el('#gl').getBoundingClientRect();
  window.dispatchEvent(
    new MouseEvent('mousemove', {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + ((1 - cursor.y) / 2) * rect.height,
      bubbles: true,
    }),
  );
  const before = enemy.hp;

  window.dispatchEvent(key('keydown', 'KeyJ'));
  try {
    for (let i = 0; i < 60 * 8 && arena.enemies.some(other => other.hp > 0); i++) {
      // the enemy is held where the cursor names, as the old test held the mech's facing on it
      enemy.x = spot.x;
      enemy.z = spot.z;
      enemy.y = 0;
      runSystems(1 / 60);
    }
  } finally {
    window.dispatchEvent(key('keyup', 'KeyJ'));
  }
  const report = JSON.parse(window.sbArenaReport?.() ?? '{}') as {
    kills: number;
    shots: number;
    hits: number;
  };
  // the state at the failure, so a miss shows where the aim went
  const state = JSON.stringify({
    spot,
    away: Math.hypot(spot.x - arena.mech.x, spot.z - arena.mech.z),
    mech: { x: arena.mech.x, z: arena.mech.z },
    hp: enemy.hp,
    report,
  });
  expect(enemy.hp, state).toBeLessThan(before);
  expect(report.shots).toBeGreaterThan(0);
  expect(report.hits).toBeGreaterThan(0);
  expect(report.kills).toBeGreaterThanOrEqual(1);

  // The group is down: a few seconds later the next one comes in.
  for (let i = 0; i < 60 * 6 && !arena.enemies.some(other => other.hp > 0); i++) runSystems(1 / 60);
  const next = arena.enemies.filter(other => other.hp > 0);
  expect(next).toHaveLength(1);
  expect(next[0].id).not.toBe(enemy.id);

  // By default the mech does not fall: its armour is put back full every frame, whatever hit it.
  arena.armor = 1;
  runSystems(1 / 60);
  expect(arena.armor).toBe(MECH_TUNE.armor);

  // The sortie's craft lane is the one way past the map's front edge; the arena has no craft, so a mech boosting straight
  // at any edge, the front (+z) one through the lane included, must stop where the sand ends. The quarter camera moves the
  // mech with the screen's frame (W is the screen's top), so a world edge takes the two keys at either side of it.
  const { minX, maxX, minZ, maxZ } = arena.map.bounds;
  const radius = MECH_TUNE.radius;
  const edges = [
    { name: '+z', x: 0, z: maxZ - 6, keys: ['KeyS', 'KeyA'] },
    { name: '-z', x: 0, z: minZ + 6, keys: ['KeyW', 'KeyD'] },
    { name: '+x', x: maxX - 6, z: 0, keys: ['KeyS', 'KeyD'] },
    { name: '-x', x: minX + 6, z: 0, keys: ['KeyW', 'KeyA'] },
  ];
  for (const edge of edges) {
    arena.mech.x = edge.x;
    arena.mech.z = edge.z;
    for (const code of edge.keys) window.dispatchEvent(key('keydown', code));
    window.dispatchEvent(key('keydown', 'ShiftLeft'));
    try {
      for (let i = 0; i < 90; i++) runSystems(1 / 60);
    } finally {
      for (const code of edge.keys) window.dispatchEvent(key('keyup', code));
      window.dispatchEvent(key('keyup', 'ShiftLeft'));
    }
    const { x, z } = arena.mech;
    const eps = 1e-6;
    expect(x, edge.name).toBeLessThanOrEqual(maxX - radius + eps);
    expect(x, edge.name).toBeGreaterThanOrEqual(minX + radius - eps);
    expect(z, edge.name).toBeLessThanOrEqual(maxZ - radius + eps);
    expect(z, edge.name).toBeGreaterThanOrEqual(minZ + radius - eps);
    // it did reach the edge it ran at, not stop short
    const reached =
      edge.name === '+z'
        ? maxZ - radius - z
        : edge.name === '-z'
          ? z - (minZ + radius)
          : edge.name === '+x'
            ? maxX - radius - x
            : x - (minX + radius);
    expect(reached, edge.name).toBeLessThan(1);
  }
});
