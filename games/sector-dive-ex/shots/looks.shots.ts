// Screenshots of the looks from fixed seeds: npm run shots. Not a test: it is not part of npm test or the CI (the
// drawn pixels differ between machines). For a refactor that should not change the looks, take them before and after
// on the same machine and compare them: SHOTS_OUT=<folder> npm run shots on each, then node tools/shots_diff.js
// <before> <after>.
// Each sector: its first floor from the start, a room from its corner, and the boss room from its door. Then a row of
// every enemy (in a boss room), the things that lie on the floor, and each boss up close as #boss-<kind>-look shows it.
import { afterAll, beforeAll, test } from 'vitest';
import { page } from 'vitest/browser';
import { T, W, floorY } from '@engine/world/tiles.ts';
import { yawToward } from '@engine/core/util.ts';
import { BIOMES } from '../src/data/biomes.ts';
import { BOSS_ORDER } from '../src/data/bosses.ts';
import { ENEMY } from '../src/data/enemies.ts';
import { WEAPON_ORDER } from '../src/data/weapons.ts';
import { player } from '../src/actors/player.ts';
import { newWeapon } from '../src/actors/weapons.ts';
import { spawnBoss } from '../src/actors/bosses/common.ts';
import { startPractice, startRun } from '../src/flow/run.ts';
import { show, setState } from '../src/flow/state.ts';
import { placeView, update } from '../src/flow/update.ts';
import { addPickup, enemies, spawnEnemy } from '../src/world/entities.ts';
import { level } from '../src/world/level.ts';
import { bootFixed, clearEnemies, enterSector, holdLoop, seedDice, unbootFixed } from '../test/fixed.ts';

declare const __SHOTS_OUT__: string; // the folder the pictures go to (vitest.shots.config.ts)
declare const __SHOTS_ONLY__: string; // only the shots whose names contain this ('' = all)

const LOOK_FROM = 7.5; // how far from a boss its shot is taken (m), as #boss-<kind>-look
const LOOK_TURN = 0.65; // how far the boss is turned (rad), as #boss-<kind>-look
const ROW_D = 6.5; // how far in front of the player the row of enemies stands (m), as #view-enemies-
const ROW_GAP = 2.4; // between two enemies of the row (m)
const ROW_SIZE = 5; // enemies in one shot of the row
const SHOT_CLOCK = 1000; // what performance.now() says while a shot is taken (ms)

const wanted = (name: string) => !__SHOTS_ONLY__ || name.includes(__SHOTS_ONLY__);
const frame = () => new Promise(r => requestAnimationFrame(r));
// the picture of what the camera sees from where the player stands, the loop and the clock held still (only the 3D view: the HUD,
// banners and toasts are hidden)
async function shot(name: string) {
  holdLoop(true);
  placeView();
  // (the clock stopped too: some props flicker by it as they are drawn, the sparks of FORGE's hall, NOISE's screens)
  const now = performance.now;
  performance.now = () => SHOT_CLOCK;
  try {
    for (let k = 0; k < 3; k++) await frame();
    await page.screenshot({ path: `${__SHOTS_OUT__}/${name}.png` });
  } finally {
    performance.now = now;
  }
}
function stand(x: number, z: number, yaw: number, pitch = 0) {
  player.x = x;
  player.z = z;
  player.fy = floorY(x, z);
  player.yaw = yaw;
  player.pitch = pitch;
}
// a point d metres in front of the player and side metres to their right
const ahead = (d: number, side: number): [number, number] => [
  player.x - Math.sin(player.yaw) * d + Math.cos(player.yaw) * side,
  player.z - Math.cos(player.yaw) * d - Math.sin(player.yaw) * side,
];

// in sector bi's boss room (its enemies gone), on the tile inside its door, looking toward its middle
function inHall(bi: number, pitch: number) {
  enterSector(bi, 'last');
  clearEnemies();
  const hall = level.hall!,
    r = level.rooms[hall.room]!,
    di = hall.door % W,
    dj = Math.floor(hall.door / W),
    mx = r.x + r.w / 2,
    mz = r.y + r.h / 2,
    x = di + 0.5 + Math.sign(mx - di - 0.5),
    z = dj + 0.5 + Math.sign(mz - dj - 0.5);
  stand(x * T, z * T, yawToward(mx - x, mz - z), pitch);
}

beforeAll(async () => {
  await bootFixed();
  await page.viewport(1280, 720);
  const hide = document.createElement('style');
  hide.textContent = 'body * { visibility: hidden !important; } #gl { visibility: visible !important; }';
  document.head.appendChild(hide);
  show(null);
  setState('play');
});
afterAll(unbootFixed);

BIOMES.forEach((b, bi) => {
  test(`sector ${b.code}`, async () => {
    if (wanted(`sector-${b.code}-start`)) {
      enterSector(bi, 0);
      await shot(`sector-${b.code}-start`);
    }
    if (wanted(`sector-${b.code}-room`)) {
      // the first room of the floor other than the start, from its corner toward the far one, as #view-<code>-b
      enterSector(bi, 0);
      clearEnemies();
      const r = level.rooms[level.rooms.findIndex((_, i) => i !== level.startIdx && i !== level.hall?.room)]!;
      stand((r.x + 0.6) * T, (r.y + 0.6) * T, yawToward(r.w - 1.2, r.h - 1.2), 0.05);
      await shot(`sector-${b.code}-room`);
    }
    if (wanted(`sector-${b.code}-hall`)) {
      // the boss room, from a tile inside its door toward its middle
      inHall(bi, 0.12);
      await shot(`sector-${b.code}-hall`);
    }
  });
});

test('enemies and items', async () => {
  const types = Object.keys(ENEMY);
  for (let at = 0; at < types.length; at += ROW_SIZE) {
    const name = `enemies-${at / ROW_SIZE + 1}`;
    if (!wanted(name)) continue;
    inHall(0, 0); // (the boss room: room enough for the row)
    const row = types.slice(at, at + ROW_SIZE);
    row.forEach((type, n) => {
      const e = spawnEnemy(type, ...ahead(ROW_D, (n - (row.length - 1) / 2) * ROW_GAP), -1, 1);
      e.face = player.yaw; // (asleep, they keep the way the model was made: turned to face the player)
      e.mesh.rotation.y = player.yaw;
    });
    await shot(name);
  }
  if (wanted('items')) {
    // the five weapons (in the three rarities), a kit, a chip and some bits, as #view-items
    enterSector(0, 0);
    clearEnemies();
    WEAPON_ORDER.forEach((id, n) => addPickup('weapon', ...ahead(7.5, (n - 2) * 2.4), { w: newWeapon(id, n % 3) }));
    addPickup('kit', ...ahead(4.5, -2.2));
    addPickup('chip', ...ahead(4.5, 0));
    for (let k = 0; k < 4; k++) addPickup('bit', ...ahead(4.2, 1.8 + k * 0.5), { value: 1 });
    await shot('items');
  }
});

test('bosses', async () => {
  for (const kind of BOSS_ORDER) {
    if (!wanted(`boss-${kind}`)) continue;
    startPractice(kind, 0);
    show(null);
    setState('play');
    player.hp = 1e6;
    player.maxHp = 1e6;
    // the boss comes now rather than a moment after the arena (on a timer, it would find the dice elsewhere), then its
    // entrance is run on by hand
    seedDice();
    spawnBoss(kind);
    holdLoop(false);
    for (let n = 0; n < 150; n++) update(1 / 60);
    const b = enemies.find(e => e.boss)!;
    // (a boss of several bodies, Trinity: its first body)
    const at = (b.boss && b.parts?.[0]?.p) || b.mesh.position;
    stand(at.x, at.z + LOOK_FROM, 0, Math.atan2(at.y - 1.6, LOOK_FROM) * 0.6);
    for (let n = 0; n < 2; n++) update(1 / 60);
    b.mesh.rotation.y += LOOK_TURN;
    await shot(`boss-${kind}`);
    startRun();
  }
});
