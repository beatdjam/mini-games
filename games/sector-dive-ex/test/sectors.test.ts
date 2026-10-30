// Smoke test for Sector Dive Extended, every sector's floors and bosses, ledges, reachability and level generation. Boots the game page (setup.ts) once for this file (bootGame) and runs it through the real loop by hand.
// Each test makes the state it needs; the file passes on its own and in any order (the dice are seeded where a test depends on them).
import { beforeAll, describe, expect, test } from 'vitest';
import { createRng } from '@engine/core/util.ts';
import { clearWorld } from '@engine/core/world.ts';
import {
  H,
  STEP,
  T,
  W,
  blocked,
  cover,
  floorY,
  grid,
  hgt,
  isSolid,
  moveCircle,
  passable,
  ramp,
  tileIndex,
  walkable,
} from '@engine/world/tiles.ts';
import { joy } from '@engine/ui/input.ts';
import { PLAT_H } from '../src/data/level.ts';
import { BOSS_ORDER } from '../src/data/bosses.ts';
import { BIOMES } from '../src/data/biomes.ts';
import { PER } from '../src/data/progress.ts';
import { buildFixedLevel, buildLevel, level, roomSpot } from '../src/world/level.ts';
import { hazardState } from '../src/world/hazards.ts';
import { generateLevel } from '../src/world/levelGen.ts';
import type { GeneratedLevel } from '../src/world/levelGen.ts';
import { makePortal } from '../src/world/portals.ts';
import { boss, enemies, removeEnemyMesh, setBoss, spawnEnemy } from '../src/world/entities.ts';
import { player, run } from '../src/actors/player.ts';
import { hurtEnemy } from '../src/actors/combat.ts';
import { spawnBoss } from '../src/actors/bosses/common.ts';
import { endRun, goBase, startRun, startStage } from '../src/flow/run.ts';
import { building } from '../src/world/building.ts';
import { tick, bootGame, goToFloor } from './helpers.ts';

beforeAll(bootGame);

// run every sector (floor + each boss candidate) once
BIOMES.forEach((b, bi) => {
  test(`floor ${b.code}`, () => {
    goBase();
    startRun();
    run.route = [bi];
    run.stage = bi * PER + 1;
    startStage();
    tick(120);
    const n0 = enemies.length;
    // walk the player through the level to exercise movement over ramps/decks
    for (let k = 0; k < 120; k++) {
      joy.y = -1;
      player.yaw += 0.05;
      tick(1);
    }
    joy.y = 0;
    enemies.slice().forEach(e => hurtEnemy(e, 1e6, false));
    tick(30);
    console.log(
      'floor',
      b.code,
      'enemies',
      n0,
      'fy',
      player.fy.toFixed(2),
      'raised',
      hgt.filter(h => h > 0).length,
      'ramps',
      ramp.filter(r => r >= 0).length,
      'haz',
      level.hazardTiles.filter(Boolean).length,
    );
  });
  b.bosses.forEach(kind => {
    test(`boss ${b.code} ${kind}`, () => {
      goBase();
      startRun();
      // a new building of this sector with this boss, then its boss room on the lowest floor
      run.stage = bi * PER;
      run.bld = undefined;
      run.forceBoss = kind;
      startStage();
      run.forceBoss = undefined;
      goToFloor(building!.plans.length - 1);
      run.stage = bi * PER + PER - 1; // the boss stage, as once the player has walked into the boss room
      setBoss(null);
      enemies.slice().forEach(e => {
        e.dead = true;
        removeEnemyMesh(e);
      });
      clearWorld('enemy');
      spawnBoss(kind);
      boss!.spawnT = 0;
      tick(400);
      if (boss && boss.invuln) {
        enemies.filter(e => !e.boss).forEach(e => hurtEnemy(e, 1e6, false));
        tick(20);
      }
      const had = !!boss;
      if (boss) hurtEnemy(boss, boss.hp + 1, false);
      tick(60);
      expect(had, 'boss spawned').toBe(true);
    });
  });
});

test('ledge: stepping off a raised deck leaves nothing stuck or half inside', () => {
  // a ramp, a 3x3 deck and open floor beside it
  const rows = ['##########', '#>===....#', '#>===....#', '#>===....#', '##########'];
  run.route = [5];
  run.stage = 26;
  buildFixedLevel(BIOMES[5], { rows, rooms: [{ x: 1, y: 1, w: 8, h: 3 }], start: 0, exit: 0 });
  let tested = 0,
    stuck = 0,
    inside = 0;
  for (let k = 0; k < W * H; k++) {
    const i = k % W,
      j = (k / W) | 0;
    if (i > W - 4 || grid[k] !== 1 || hgt[k] !== PLAT_H || ramp[k] >= 0 || cover[k]) continue;
    if (!walkable(k + 1) || hgt[k + 1] !== 0 || !walkable(k + 2) || hgt[k + 2] !== 0) continue;
    for (const who of ['player', 'enemy']) {
      const o: { x: number; z: number; fy: number; vy?: number; r?: number } =
        who === 'player' ? player : spawnEnemy('crawler', 0, 0, -1, 1);
      o.x = (i + 1) * T - 0.2;
      o.z = (j + 0.5) * T;
      o.fy = PLAT_H;
      o.vy = 0;
      for (let t = 0; t < 60; t++) {
        moveCircle(o, 0.15, 0, o.r || player.r);
        const g2 = floorY(o.x, o.z);
        o.fy = who === 'player' ? Math.max(g2, o.fy - 0.2) : g2;
      }
      const x0 = o.x;
      moveCircle(o, 0.3, 0, o.r || player.r);
      tested++;
      if (o.x <= x0 && !blocked(x0 + 0.3, o.z, o.r || player.r)) stuck++;
      if (floorY(o.x - (o.r || player.r) + 0.02, o.z) > o.fy + STEP) inside++;
    }
  }
  if (tested !== 6) throw new Error('ledge: expected 6 cases, ran ' + tested);
  if (stuck || inside) throw new Error('ledge check failed');
});
test('gates: one opening underfoot waits until the player steps off and back', () => {
  goBase();
  startRun();
  tick(5);
  run.stage = PER - 1; // as after the boss: an onward gate leads to the next depth
  const st = run.stage;
  makePortal(player.x, player.z, 0xffffff, 'next', '');
  tick(30);
  if (run.stage !== st) throw new Error('gate took the player right away');
  tick(60);
  if (run.stage !== st) throw new Error('gate took the player without stepping off');
  player.x += 3;
  tick(2);
  player.x -= 3;
  tick(2);
  if (run.stage !== st + 1) throw new Error('gate did not work after stepping off and back');
  goBase();
});
test('hazard floors: none in the start room, off at the start of an area', () => {
  goBase();
  startRun();
  for (const route of [1, 4])
    for (let k = 0; k < 30; k++) {
      run.route = [route];
      run.stage = (k % 6) * PER + (k % 3);
      startStage();
      const R = level.rooms[level.startIdx]!;
      for (let j = R.y - 1; j <= R.y + R.h; j++)
        for (let i = R.x - 1; i <= R.x + R.w; i++)
          if (level.hazardTiles[j * W + i])
            throw new Error(`hazard in the start room: route ${route} stage ${run.stage} tile ${i},${j}`);
      if (hazardState() === 'on') throw new Error('hazards live at the start of an area');
    }
  endRun('abandon');
  goBase();
});
// reachability: from the start room, can the player walk into every room (and back to the start)?
describe('reachability', () => {
  beforeAll(() => {
    startRun();
    tick(10);
  });
  BIOMES.forEach((b, bi) => {
    test(`reach ${b.code}`, () => {
      let bad = 0,
        back = 0;
      for (let n = 0; n < 25; n++) {
        run.route = [bi];
        run.stage = bi * PER;
        buildLevel(b, false);
        const reach = (from: number) => {
          const seenT = new Uint8Array(W * H),
            q = [from];
          seenT[from] = 1;
          while (q.length) {
            const c = q.pop()!,
              ci = c % W,
              cj = (c / W) | 0;
            [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ].forEach(([a, bb], sd) => {
              const ni = ci + a,
                nj = cj + bb;
              if (isSolid(ni, nj)) return;
              const nn = nj * W + ni;
              if (!seenT[nn] && passable(c, nn, sd)) {
                seenT[nn] = 1;
                q.push(nn);
              }
            });
          }
          return seenT;
        };
        const [sx, sz] = roomSpot(level.rooms[level.startIdx]),
          st = tileIndex(sx, sz),
          fwdR = reach(st);
        level.rooms.forEach(r => {
          const [x, z] = roomSpot(r),
            k = tileIndex(x, z);
          if (!fwdR[k]) bad++;
          else if (!reach(k)[st]) back++;
        });
      }
      console.log('reach', b.code, 'unreachable rooms', bad, 'one-way rooms', back);
    });
  });
});

test('the same seed builds the same level', () => {
  const snap = () => ({ rooms: JSON.stringify(level.rooms), grid: Array.from(grid), start: level.startIdx });
  buildLevel(BIOMES[1], false, null, 1234);
  const a = snap();
  buildLevel(BIOMES[1], false, null, 1234);
  expect(snap()).toEqual(a);
  expect(level.seed).toBe(1234);
});

// A pin on generation: the same seed must keep giving the same maps, rooms and start. Changing the generator or the
// order it draws random numbers in changes these on purpose, and then the numbers here are updated with it.
function levelHash(gen: GeneratedLevel): string {
  const M = gen.maps;
  const maps = [M.grid, M.hgt, M.ramp, M.cover, gen.hazard, M.roomOf].map(a => Array.from(a).join(','));
  const text = maps.join('|') + JSON.stringify(gen.rooms) + gen.startIdx;
  let h = 2166136261; // FNV-1a
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16);
}
test('generation is pinned: the same seed gives the same level', () => {
  const got: Record<string, string> = {};
  BIOMES.forEach(b => {
    got[b.code] = levelHash(generateLevel(b, false, null, createRng(1234)));
  });
  BOSS_ORDER.forEach(k => {
    got['arena ' + k] = levelHash(generateLevel(BIOMES[0], true, k, createRng(1234)));
  });
  expect(got).toEqual({
    DATA: '31230a44',
    FORGE: 'a37e213e',
    NOISE: 'f514cc1b',
    RUIN: 'ea80ade1',
    KWLN: '9b86bedd',
    CITY: 'd1432964',
    MALL: '2c496622',
    HOSP: 'c933e16e',
    'arena watcher': 'b566d42b',
    'arena crusher': 'b566d42b',
    'arena hoist': 'dc3f981b', // (no pillars, as TRINITY's)
    'arena surgeon': 'dc3f981b',
    'arena core': 'dc3f981b',
    'arena phantom': 'b566d42b',
    'arena trinity': 'dc3f981b',
    'arena bastion': 'dc3f981b',
  });
});
