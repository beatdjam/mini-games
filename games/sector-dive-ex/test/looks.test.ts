// Smoke test for Sector Dive Extended, looks: view models, gun looks, wall pictures, the outside of a building and props. Boots the game page (setup.ts) once for this file (bootGame) and runs it through the real loop by hand.
// Each test makes the state it needs; the file passes on its own and in any order (the dice are seeded where a test depends on them).
import { beforeAll, expect, test } from 'vitest';
import { createRng } from '@engine/core/util.ts';
import { camera, scene } from '@engine/render/render.ts';
import { T } from '@engine/world/tiles.ts';
import { WEAPON_ORDER } from '../src/data/weapons.ts';
import { EYE, WALL_H } from '../src/data/level.ts';
import { VIEWMODELS } from '../src/data/viewmodels.ts';
import { gunLook, hasGunLook } from '../src/world/models/gunLooks.ts';
import { BIOMES } from '../src/data/biomes.ts';
import { facesWest, lookOf, variantOf, wallPic, WALL_PLAIN_SHARE } from '../src/world/looks.ts';
import { floorSides, wallSide } from '@engine/world/walls.ts';
import { enterFloor, showBuilding, showNeighbourFloors } from '../src/world/level.ts';
import { devCourtOpen, makeBuilding } from '../src/world/building.ts';
import type { Building } from '../src/world/building.ts';
import { WINDOW_ORDER } from '@engine/render/windows.ts';
import { tileMapFromRows } from '@engine/world/tilemap.ts';
import * as THREE from 'three';
import { dressAtrium, dressYard } from '../src/world/yardProps.ts';
import { buildingShell, outsideBlocks, shellOf } from '../src/world/looks/outside.ts';
import type { TileMapData } from '@engine/world/dungeon.ts';
import { floorNear, overHead, raised } from '../src/world/looks/props.ts';
import { bootGame } from './helpers.ts';

beforeAll(bootGame);

test('viewmodels: no two parts have a flat face in the same place (it would flicker)', () => {
  // each part as an axis-aligned box; a cylinder is round on its sides, so only its end caps (along z) count
  const bounds = (p: (string | number)[]) => {
    const n = p.map(Number);
    return p[0] === 'cyl'
      ? { cyl: true, lo: [n[4] - n[1], n[5] - n[1], n[6] - n[2] / 2], hi: [n[4] + n[1], n[5] + n[1], n[6] + n[2] / 2] }
      : {
          cyl: false,
          lo: [n[5] - n[1] / 2, n[6] - n[2] / 2, n[7] - n[3] / 2],
          hi: [n[5] + n[1] / 2, n[6] + n[2] / 2, n[7] + n[3] / 2],
        };
  };
  const clash: string[] = [];
  for (const [id, def] of Object.entries(VIEWMODELS)) {
    const bs = def.parts.map(bounds);
    for (let a = 0; a < bs.length; a++)
      for (let b = a + 1; b < bs.length; b++)
        for (let ax = 0; ax < 3; ax++) {
          if ((bs[a].cyl || bs[b].cyl) && ax !== 2) continue;
          for (const side of ['lo', 'hi'] as const) {
            if (Math.abs(bs[a][side][ax] - bs[b][side][ax]) > 1e-9) continue;
            const others = [0, 1, 2].filter(k => k !== ax);
            if (others.every(k => Math.min(bs[a].hi[k], bs[b].hi[k]) - Math.max(bs[a].lo[k], bs[b].lo[k]) > 1e-9))
              clash.push(`${id} parts ${a}/${b} ${'xyz'[ax]} ${side}`);
          }
        }
  }
  expect(clash).toEqual([]);
});
test('gun looks: every weapon has one, and no two of its parts have a flat face in the same place', () => {
  const clash: string[] = [];
  for (const id of WEAPON_ORDER) {
    expect(hasGunLook(id), id).toBe(true);
    const g = gunLook(id, 0xffffff);
    expect(g.userData.tip && g.userData.flash && g.userData.pos, `${id}: what the game reads from a gun`).toBeTruthy();
    // each part as an axis-aligned box; a cylinder only counts by its end caps (along z); tilted parts are left out
    const bs = g.children.flatMap(c => {
      const geo = (c as THREE.Mesh).geometry as THREE.BufferGeometry & { parameters?: Record<string, number> },
        q = geo?.parameters,
        at = c.position;
      if (!q || geo.type === 'SphereGeometry') return [];
      const cyl = geo.type === 'CylinderGeometry';
      if (!cyl && c.rotation.x !== 0) return [];
      const half = cyl ? [q.radiusTop!, q.radiusTop!, q.height! / 2] : [q.width! / 2, q.height! / 2, q.depth! / 2],
        mid = [at.x, at.y, at.z];
      return [{ cyl, lo: mid.map((v, k) => v - half[k]!), hi: mid.map((v, k) => v + half[k]!) }];
    });
    for (let a = 0; a < bs.length; a++)
      for (let b = a + 1; b < bs.length; b++)
        for (let ax = 0; ax < 3; ax++) {
          if ((bs[a]!.cyl || bs[b]!.cyl) && ax !== 2) continue;
          for (const side of ['lo', 'hi'] as const) {
            if (Math.abs(bs[a]![side][ax]! - bs[b]![side][ax]!) > 1e-9) continue;
            const others = [0, 1, 2].filter(k => k !== ax);
            if (
              others.every(k => Math.min(bs[a]!.hi[k]!, bs[b]!.hi[k]!) - Math.max(bs[a]!.lo[k]!, bs[b]!.lo[k]!) > 1e-9)
            )
              clash.push(`${id} parts ${a}/${b} ${'xyz'[ax]} ${side}`);
          }
        }
  }
  expect(clash).toEqual([]);
});
test("wall pictures: a window only on the building's outside wall, a glass partition only on a thin wall", () => {
  const d = tileMapFromRows(['#######', '#..#..#', '#######', '#######', '#.....#', '#######']),
    at = (i: number, j: number) => j * d.W + i;
  expect(wallSide(d, at(0, 1)), 'the map edge behind it').toBe('outer');
  expect(wallSide(d, at(1, 0)), 'the map edge behind it').toBe('outer');
  expect(wallSide(d, at(3, 1)), 'a room right behind it, on both sides').toBe('inner');
  expect(wallSide(d, at(1, 2)), 'a room further behind it').toBeNull();
  expect(wallSide(d, at(3, 2)), 'seen from no floor').toBeNull();
  // a picture of `outer` on any other wall, and one of `inner` on any other wall, gives way to the plain one
  const all = Array.from({ length: 12 }, (_, n) => n + 1),
    pic = (k: number, sides: { outer?: number[]; inner?: number[] }) => wallPic(d, k, 13, undefined, sides);
  for (const k of [at(0, 1), at(1, 0), at(3, 1), at(1, 2)]) {
    const v = variantOf(k, 13, WALL_PLAIN_SHARE),
      side = wallSide(d, k);
    expect(pic(k, { outer: all }), `tile ${k}`).toBe(side === 'outer' ? v : 0);
    expect(pic(k, { inner: all }), `tile ${k}`).toBe(side === 'inner' ? v : 0);
    expect(pic(k, {}), `tile ${k}: no sides, as it was`).toBe(v);
  }
  // the evening sun is toward -x: the wall on a room's -x side faces west (its window lets the sun in), not the others
  expect(facesWest(d, at(0, 1))).toBe(true);
  expect(facesWest(d, at(6, 1))).toBe(false);
  expect(facesWest(d, at(1, 0))).toBe(false);
  // a window one sees out of is only ever on the building's outside wall or on a yard (what is behind any other wall
  // is the building, not the view)
  for (const biome of BIOMES) {
    const look = lookOf(biome);
    for (const v of Object.keys(look?.outside?.panes ?? {}))
      expect(look!.wallSides?.outer, `${biome.code} picture ${v}`).toContain(Number(v));
  }
});
test('outside: the buildings across the street stand clear of the building, and only faces that can be seen', () => {
  // a building 10 by 8 tiles in the middle of a 30-tile map
  const w = 30,
    h = 30,
    inside = new Uint8Array(w * h).map((_, k) =>
      k % w >= 10 && k % w < 20 && ((k / w) | 0) >= 11 && ((k / w) | 0) < 19 ? 1 : 0,
    ),
    style = {
      high: [
        [14, 30],
        [40, 60],
      ] as [[number, number], [number, number]],
      facades: 3,
      roofs: 2,
    },
    blocks = outsideBlocks(inside, w, h, style, createRng(7));
  expect(blocks.length).toBeGreaterThan(20);
  expect(outsideBlocks(inside, w, h, style, createRng(7)), 'the same rng, the same blocks').toEqual(blocks);
  const [bx0, bx1, bz0, bz1] = [10 * T, 20 * T, 11 * T, 19 * T];
  for (const b of blocks) {
    // the street: no block nearer the building than 5 tiles
    const gap = Math.max(bx0 - b.x1, b.x0 - bx1, bz0 - b.z1, b.z0 - bz1);
    expect(gap).toBeGreaterThanOrEqual(5 * T - 1e-6);
    expect(b.top).toBeGreaterThanOrEqual(14);
    expect(b.top).toBeLessThanOrEqual(60);
    // no face turned away from the building: a block wholly east of it has no face looking east (side 0)
    if (b.x0 >= bx1) expect(b.sides).not.toContain(0);
    if (b.x1 <= bx0) expect(b.sides).not.toContain(1);
    if (b.z0 >= bz1) expect(b.sides).not.toContain(2);
    if (b.z1 <= bz0) expect(b.sides).not.toContain(3);
  }
  // a block straight across the street to the west shows the building its east face
  const across = blocks.find(b => b.x1 <= bx0 && b.x1 > bx0 - 6 * T && b.z0 >= bz0 && b.z1 <= bz1);
  if (across) expect(across.sides).toContain(0);
});
test("outside: the building's own walls, floor by floor: faces on its outline, a roof where the floor above leaves off", () => {
  // a 6 by 1 strip of tiles: the top floor the middle two, the floor under it all six (it stands out on both sides)
  const w = 6,
    h = 1,
    top = shellOf(k => k === 2 || k === 3, w, h),
    low = shellOf(() => true, w, h),
    boxes = buildingShell([top, low], w, h, 8),
    of = (floorBottom: number, i: number) => boxes.find(b => b.bottom === floorBottom && b.x0 === i * T);
  expect(Array.from(top), 'with the walls round it').toEqual([0, 1, 1, 1, 1, 0]);
  // the top floor (bottom 8): a face out at its ends, a roof everywhere, no underside where the floor under holds it
  expect(of(8, 1)!.sides).toContain(1);
  expect(of(8, 1)!.noRoof).toBe(false);
  expect(of(8, 1)!.under).toBe(false);
  // the floor under it (bottom 0): no roof under the top floor, a roof (a terrace) beyond it
  expect(of(0, 2)!.noRoof).toBe(true);
  expect(of(0, 0)!.noRoof).toBe(false);
  // a tile with nothing to show is not built (inside the outline, covered, held up)
  expect(boxes.filter(b => b.bottom === 0 && b.x0 === 2 * T && !b.sides.length && b.noRoof && !b.under)).toEqual([]);
});
test('outside: a window one sees out of looks past the whole building, or on to a yard', () => {
  devCourtOpen(true);
  let windows = 0;
  // (the ruins' one: a window was on the tile at a balcony's end, seen from the balcony)
  for (const [code, seed, boss] of [
    ['CITY', 3],
    ['CITY', 6],
    ['CITY', 9],
    ['RUIN', 1128278361, 'phantom'],
  ] as const) {
    const biome = BIOMES.find(x => x.code === code)!,
      look = lookOf(biome)!,
      b = makeBuilding(biome, boss ?? biome.bosses[0]!, seed),
      W = b.plans[0]!.gen.W,
      H = b.plans[0]!.gen.H,
      anyFloor = (k: number) => b.plans.some(p => p.gen.maps.grid[k] === 1 || !!p.voids[k]);
    b.plans.forEach((p, floor) => {
      const d = p.gen,
        yard = b.court?.open && floor <= b.court.lower ? new Set(b.court.tiles) : new Set<number>();
      d.maps.grid.forEach((v, k) => {
        if (v || p.voids[k] || !look.outside!.panes[wallPic(d, k, look.walls.length, look.laneWalls, look.wallSides)])
          return;
        windows++;
        // straight out from each floor that sees it: no floor of any floor before the edge, unless a yard comes first.
        // On the yard's edge, the yard right behind each face (not the tile at a balcony's end, seen along the yard)
        const onYard = [1, -1, W, -W].some(o => yard.has(k + o));
        // (and not on a tile that is floor on another floor: under or over it, the building runs out past the window)
        if (!onYard) expect(anyFloor(k), `seed ${seed} floor ${floor} wall ${k} under a floor`).toBe(false);
        for (const [di, dj] of floorSides(d, k)) {
          if (onYard) expect(yard.has(k - dj * W - di), `seed ${seed} floor ${floor} wall ${k} on the yard`).toBe(true);
          let i = (k % W) - di,
            j = Math.floor(k / W) - dj;
          for (; i >= 0 && j >= 0 && i < W && j < H; i -= di, j -= dj) {
            const t = j * W + i;
            if (yard.has(t)) break;
            expect(anyFloor(t), `seed ${seed} floor ${floor} wall ${k}`).toBe(false);
          }
        }
      });
    });
  }
  devCourtOpen(null);
  expect(windows).toBeGreaterThan(0);
});
test('outside: a window on a yard shows the yard itself, its walls out to the glass, and only while one is in sight', () => {
  const city = BIOMES.find(x => x.code === 'CITY')!,
    look = lookOf(city)!;
  // a building with a window one sees out of right on its yard: the wall tile, the step from it to the floor
  let found: { b: Building; floor: number; k: number; o: number } | null = null;
  for (let seed = 1; seed < 300 && !found; seed++) {
    const b = makeBuilding(city, city.bosses[0]!, seed),
      c = b.court;
    if (!c?.open) continue;
    b.plans.forEach((p, floor) => {
      const d = p.gen,
        g = d.maps.grid;
      g.forEach((v, k) => {
        if (found || v || p.voids[k]) return;
        if (!look.outside!.panes[wallPic(d, k, look.walls.length, look.laneWalls, look.wallSides)]) return;
        const o = [1, -1, d.W, -d.W].find(o => g[k + o] === 1 && c.tiles.includes(k - o));
        if (o !== undefined) found = { b, floor, k, o };
      });
    });
  }
  expect(found, 'such a window in some building').not.toBeNull();
  const { b, floor, k, o } = found!,
    W = b.plans[0]!.gen.W,
    [di, dj] = Math.abs(o) === 1 ? [o, 0] : [0, Math.sign(o)];
  showBuilding(b);
  enterFloor(b, floor);
  const copies: THREE.Mesh[] = [];
  scene.traverse(m => {
    if (
      (m as THREE.Mesh).isMesh &&
      m.renderOrder > WINDOW_ORDER &&
      m.renderOrder < WINDOW_ORDER + 1 &&
      !(m as THREE.InstancedMesh).isInstancedMesh
    )
      copies.push(m as THREE.Mesh);
  });
  expect(copies.length, 'the yard is copied for its windows').toBeGreaterThan(0);
  const shown = () =>
    copies.some(m => {
      for (let q: THREE.Object3D | null = m; q; q = q.parent) if (!q.visible) return false;
      return true;
    });
  // standing in front of the window, looking at it, then away
  const x = ((k % W) + 0.5 + di) * T,
    z = (Math.floor(k / W) + 0.5 + dj) * T;
  camera.position.set(x, EYE, z);
  camera.rotation.set(0, Math.atan2(di, dj), 0);
  showNeighbourFloors(b, x, z, null);
  expect(shown(), 'looking at it').toBe(true);
  camera.rotation.set(0, Math.atan2(-di, -dj), 0);
  showNeighbourFloors(b, x, z, null);
  expect(shown(), 'looking away').toBe(false);
  // the copies stand where the yard and what stands round it do (not moved: the walls that run away from the glass
  // keep their windows where the rooms behind them have theirs), but the yard's ground reaches a tile further toward
  // the floor, out to the glass
  const moved = new Set(
    copies.map(m => {
      let q: THREE.Object3D = m;
      while (q.parent!.parent!.parent !== scene) q = q.parent!;
      return `${Math.round(q.position.x * 100) / 100},${Math.round(q.position.z * 100) / 100}`;
    }),
  );
  expect([...moved]).toEqual(['0,0']);
  const side = Math.sqrt(b.court!.tiles.length) * T,
    longer = di ? [side + T, side] : [side, side + T];
  expect(
    copies.some(m => {
      const p = (m.geometry as THREE.PlaneGeometry).parameters;
      return p?.width === longer[0] && p?.height === longer[1];
    }),
    'the ground a tile longer toward the window',
  ).toBe(true);
});
test('props: what hangs overhead clears the head of someone on a raised floor under it or next to it', () => {
  // a 4 by 3 map: ground, a ramp up toward +x, a walkway 2 m up, ground; the row under it walls
  const d = {
    W: 4,
    H: 2,
    maps: {
      grid: new Uint8Array([1, 1, 1, 1, 0, 0, 0, 0]),
      hgt: new Float32Array([0, 0, 2, 0, 0, 0, 0, 0]),
      ramp: new Int8Array([-1, 0, -1, -1, -1, -1, -1, -1]),
    },
  } as unknown as TileMapData;
  expect(floorNear(d, 0, 0), 'next to the ramp: its top end').toBe(2);
  expect(floorNear(d, 2, 0)).toBe(2);
  expect(floorNear(d, 3, 0), 'next to the walkway').toBe(2);
  expect(overHead(3.5, 0), 'over the ground: where it was').toBe(3.5);
  expect(overHead(3.5, 2), 'a metre over the eye on the walkway').toBeCloseTo(2 + EYE + 1);
  expect(overHead(5.9, 2), 'never up into the ceiling').toBeLessThan(WALL_H);
  expect(raised(d, { i: 1, j: 0 }) && raised(d, { i: 2, j: 0 }) && !raised(d, { i: 3, j: 0 })).toBe(true);
});
test('courtyard: what hangs in an atrium has the same colours whatever yard was dressed before it', () => {
  const well = { cx: 20, cz: 20, wide: 12, deep: 12, ground: -16, sky: 0, decks: [] },
    colours = (g: THREE.Group) =>
      g.children.flatMap(o =>
        o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial ? [o.material.color.getHex()] : [],
      ),
    dressed = () => {
      const g = new THREE.Group();
      dressAtrium(g, 'FORGE', well);
      return colours(g);
    };
  const fresh = dressed();
  expect(fresh.length).toBeGreaterThan(0);
  dressYard(new THREE.Group(), 'downtown', [], well, 8, 0x404040); // a dark yard's shade
  expect(dressed()).toEqual(fresh);
});
