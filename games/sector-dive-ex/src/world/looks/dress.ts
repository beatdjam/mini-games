import { PAINT } from '../../data/colors.ts';
import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import type { TileMapData } from '@engine/world/dungeon.ts';
import { SIDE_STEP, tileCenter } from '@engine/world/tiles.ts';
import { WALL_H } from '../../data/level.ts';
import type { FloorPlan } from '../building.ts';
import { wallPic } from './common.ts';
import { facing, onWall, pose } from './props.ts';
import type { Light, PropTools, WallSlot } from './props.ts';
// Dressing a sector's walls in layers. placeProps hands a slot to one prop, and a floor gets so many of each: that
// is for the few things that matter where they stand. A lived-in place needs every wall full, one thing over
// another, so here every wall face and every tile under a ceiling is gone over, each layer by its own throw of the
// dice. A wall, from the ground up: a heap at its foot, a unit let into it (a stall, a rack of shelves, a control
// panel), things high on it, runs of pipe or cable under the ceiling. Overhead: runs slung across, and over an alley
// a roof.
// Flat pictures read as paper from the side, so the pictures stand on something solid: boxes with painted faces in
// front of a unit (its counter) and inside a heap.
// A sector gives its pictures and its shares in a WallKit (a share is the part of the faces that get the thing: in a
// room, and along an alley).

type Share = { hall: number; lane: number };
export interface WallKit {
  pics: number; // how many wall pictures the sector has, and
  laneWalls?: number[]; // ... what an alley's walls get in place of the plain one (common.ts wallPic)
  bare: number[]; // the wall pictures a unit may stand in front of (not a window or a door painted there)
  // what is let into a wall at ground level: a painted front, `w` by `h` metres, with boxes in front of it (their
  // faces from `counter`) and a post at each end when `posts`. `light`: the colour of the light it throws
  units?: Share & {
    maps: THREE.Texture[];
    w: number;
    h: number;
    counter?: THREE.Texture[];
    posts?: number;
    light?: number;
  };
  // heaps along the foot of the walls: a cut-out picture `w` by `h` metres in front of boxes with `solid` faces
  heaps?: Share & { maps: THREE.Texture[]; solid: THREE.Texture[]; w: number; h: number };
  // cut-outs high on the walls (a sign, washing, something hanging): between the heights `y`, `out` from the wall
  high?: (Share & { maps: THREE.Texture[]; w: number; h: number; y: [number, number]; out: [number, number] })[];
  // runs along the walls (pipes, cables): `n` of them together, radius `r`, each its own colour of `colors`
  // (several bands may be given: under the ceiling, at the waist, along the ground)
  runs?: Run | Run[];
  runMap?: THREE.Texture; // the picture on the runs, risers and spans (each tinted its own colour); none: plain
  // pipes up the walls, floor to ceiling, a flange on each
  risers?: Share & { colors: number[]; r: number };
  // the same slung across from wall to wall, sagging
  spans?: Share & { colors: number[]; r: number; n: [number, number]; y: [number, number]; laneY: [number, number] };
  // an alley roofed over at height `y` (sheets with these pictures, a beam of colour `beam` at every tile)
  roof?: { maps: THREE.Texture[]; y: number; tint: number; beam: number; share: number };
  // lamps hung down the middle of the alleys: a cord and a small light of this colour
  bulbs?: { share: number; color: number; y: [number, number] };
}
type Run = Share & { colors: number[]; r: number; n: [number, number]; y: [number, number]; laneY: [number, number] };
export type Face = WallSlot & { room: number };

// Dresses the floor by `kit`. `taken`: wall faces to leave alone above head height (where the sector's own props
// stand out from the wall). The lights it makes are added to `lights` (the caller lays the pools)
export function dressWalls(
  tools: Pick<PropTools, 'add'>,
  d: TileMapData,
  plan: FloorPlan,
  rng: Rng,
  kit: WallKit,
  lights: Light[],
  taken: (f: WallSlot) => boolean = () => false,
) {
  const { add } = tools,
    arena = plan.hall?.room ?? -1,
    faces: Face[] = [],
    ceilings: { i: number; j: number; room: number }[] = [];
  for (let j = 1; j < d.H - 1; j++)
    for (let i = 1; i < d.W - 1; i++) {
      const k = j * d.W + i,
        room = d.maps.roomOf[k]!;
      if (d.maps.grid[k] !== 1 || room === arena || plan.court?.tiles.includes(k)) continue;
      if (!plan.noCeil[k]) ceilings.push({ i, j, room });
      SIDE_STEP.forEach(([di, dj], side) => {
        const wall = (j + dj) * d.W + i + di;
        if (!d.maps.grid[wall] && !plan.voids[wall]) faces.push({ i, j, side, room });
      });
    }
  const lane = (f: { room: number }) => f.room < 0,
    of = (s: Share, f: { room: number }) => (lane(f) ? s.lane : s.hall),
    some = <T extends { room: number }>(list: T[], s: Share): T[] => list.filter(f => rng.next() < of(s, f)),
    // (nothing stands at the foot of a wall by a door: it would be in the doorway)
    byDoor = (f: WallSlot): boolean =>
      [[0, 0], ...SIDE_STEP].some(([di, dj]) => !!d.maps.door?.[(f.j + dj!) * d.W + f.i + di!]),
    bare = (f: WallSlot): boolean => {
      const [di, dj] = SIDE_STEP[f.side ?? 0]!;
      return kit.bare.includes(wallPic(d, (f.j + dj) * d.W + f.i + di, kit.pics, kit.laneWalls));
    },
    flat = (color: number) => new THREE.MeshBasicMaterial({ color }),
    cutout = (map: THREE.Texture) =>
      new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }),
    // the boxes: one instanced mesh per face picture, each box scaled to its size
    boxes = new Map<THREE.Texture, THREE.Matrix4[]>(),
    box = (maps: THREE.Texture[], pos: THREE.Vector3, turn: number, w: number, h: number, deep: number) => {
      const map = maps[rng.randi(0, maps.length - 1)]!;
      if (!boxes.has(map)) boxes.set(map, []);
      boxes.get(map)!.push(pose(pos, turn, new THREE.Vector3(w, h, deep)));
    },
    each = <T>(maps: THREE.Texture[], list: T[], make: (map: THREE.Texture, mine: T[]) => void) =>
      maps.forEach((map, v) =>
        make(
          map,
          list.filter((_, n) => n % maps.length === v),
        ),
      );

  // ---- units let into the walls ----
  const u = kit.units;
  if (u) {
    const at = some(
      faces.filter(f => bare(f) && !byDoor(f)),
      u,
    );
    each(u.maps, at, (map, mine) =>
      add(
        new THREE.PlaneGeometry(u.w, u.h),
        new THREE.MeshBasicMaterial({ map }),
        mine.map(f => pose(onWall(f, 0, 0.1, u.h / 2), facing(f))),
      ),
    );
    for (const f of at) {
      const turn = facing(f);
      if (u.counter)
        for (let off = -u.w / 2 + 0.5; off < u.w / 2 - 0.3; off += 0.95) {
          const h = rng.rand(0.55, 0.92);
          box(
            u.counter,
            onWall(f, off + rng.rand(-0.05, 0.05), 0.36, h / 2),
            turn + rng.rand(-0.06, 0.06),
            0.9,
            h,
            0.46,
          );
        }
      if (u.light !== undefined && rng.next() < 0.5) {
        const out = onWall(f, 0, 1.6, 0);
        lights.push({ x: out.x, z: out.z, color: u.light, size: 0.55 });
      }
    }
    if (u.posts !== undefined)
      add(
        new THREE.BoxGeometry(0.09, u.h, 0.09),
        flat(u.posts),
        at.flatMap(f => [-u.w / 2 + 0.05, u.w / 2 - 0.05].map(off => pose(onWall(f, off, 0.52, u.h / 2), facing(f)))),
      );
  }
  // ---- heaps along the foot of the walls ----
  const hp = kit.heaps;
  if (hp) {
    // (and against the sides of the raised decks: things pile up there as they do along a wall)
    const decks: Face[] = [];
    for (let j = 1; j < d.H - 1; j++)
      for (let i = 1; i < d.W - 1; i++) {
        const k = j * d.W + i;
        if (d.maps.grid[k] !== 1 || d.maps.hgt[k]! > 0 || d.maps.ramp[k]! >= 0) continue;
        SIDE_STEP.forEach(([di, dj], side) => {
          const n = (j + dj) * d.W + i + di;
          if (d.maps.grid[n] === 1 && d.maps.ramp[n]! < 0 && d.maps.hgt[n]! >= 1.5 && !d.maps.cover[n])
            decks.push({ i, j, side, room: d.maps.roomOf[k]! });
        });
      }
    const at = [
      ...some(
        faces.filter(f => !byDoor(f)),
        hp,
      ),
      ...decks.filter(() => rng.next() < 0.45),
    ].map(f => ({ f, off: rng.rand(-0.3, 0.3) }));
    for (const a of at) {
      const turn = facing(a.f);
      for (let k = 0, n = rng.randi(2, 4); k < n; k++) {
        const w = rng.rand(0.55, 0.95),
          tall = rng.rand(0.4, 0.8),
          off = a.off + rng.rand(-1.3, 1.3);
        box(hp.solid, onWall(a.f, off, 0.27, tall / 2), turn + rng.rand(-0.1, 0.1), w, tall, 0.45);
        if (rng.next() < 0.4)
          box(
            hp.solid,
            onWall(a.f, off + rng.rand(-0.1, 0.1), 0.27, tall + 0.25),
            turn + rng.rand(-0.15, 0.15),
            w * 0.8,
            0.5,
            0.4,
          );
      }
    }
    each(hp.maps, at, (map, mine) =>
      add(
        new THREE.PlaneGeometry(hp.w, hp.h),
        cutout(map),
        mine.map(a => pose(onWall(a.f, a.off, 0.56, (hp.h * 0.9) / 2), facing(a.f), new THREE.Vector3(1, 0.9, 1))),
      ),
    );
  }
  boxes.forEach((where, map) => add(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ map }), where));
  // ---- high on the walls ----
  for (const hi of kit.high ?? []) {
    const at = some(
      faces.filter(f => !taken(f)),
      hi,
    );
    each(hi.maps, at, (map, mine) =>
      add(
        new THREE.PlaneGeometry(hi.w, hi.h),
        cutout(map),
        mine.map(f => pose(onWall(f, 0, rng.rand(hi.out[0], hi.out[1]), rng.rand(hi.y[0], hi.y[1])), facing(f))),
      ),
    );
  }
  // ---- runs along the walls and across ----
  const round = new THREE.CylinderGeometry(1, 1, 4.05, 6),
    runAt: THREE.Matrix4[] = [],
    runColor: number[] = [];
  for (const r of kit.runs ? [kit.runs].flat() : [])
    for (const f of some(faces, r)) {
      const y = lane(f) ? rng.rand(r.laneY[0], r.laneY[1]) : rng.rand(r.y[0], r.y[1]);
      for (let k = 0, n = rng.randi(r.n[0], r.n[1]); k < n; k++) {
        const thick = r.r * rng.rand(0.6, 1.7);
        runColor.push(rng.pick(r.colors));
        runAt.push(
          pose(
            onWall(f, 0, r.r * 2.5 + (k % 4) * r.r * 2.4, y - Math.floor(k / 4) * r.r * 2.8),
            facing(f),
            new THREE.Vector3(thick, 1, thick),
            Math.PI / 2 + rng.rand(-0.012, 0.012),
          ),
        );
      }
    }
  const sp = kit.spans;
  if (sp)
    for (const c of some(ceilings, sp)) {
      const turn = rng.pick([0, Math.PI / 2]),
        y = lane(c) ? rng.rand(sp.laneY[0], sp.laneY[1]) : rng.rand(sp.y[0], sp.y[1]),
        sag = rng.rand(0.08, 0.2),
        n = rng.randi(sp.n[0], sp.n[1]);
      for (let k = 0; k < n; k++) {
        const thick = sp.r * rng.rand(0.7, 1.9),
          side = (k - n / 2) * sp.r * 2.6,
          color = rng.pick(sp.colors);
        for (const half of [-1, 1]) {
          runColor.push(color);
          runAt.push(
            pose(
              new THREE.Vector3(
                tileCenter(c.i) + Math.cos(turn) * half + Math.sin(turn) * side,
                y - sag * 1.1,
                tileCenter(c.j) - Math.sin(turn) * half + Math.cos(turn) * side,
              ),
              turn,
              new THREE.Vector3(thick, 0.52, thick),
              Math.PI / 2 + half * sag,
            ),
          );
        }
      }
    }
  const runMat = () => new THREE.MeshBasicMaterial({ color: 0xffffff, map: kit.runMap ?? null });
  add(round, runMat(), runAt, runColor);
  const rs = kit.risers;
  if (rs) {
    const at = some(faces, rs).map(f => ({ f, off: rng.rand(-1.5, 1.5), thick: rs.r * rng.rand(0.7, 1.5) })),
      colors = at.map(() => rng.pick(rs.colors));
    add(
      new THREE.CylinderGeometry(1, 1, WALL_H, 8),
      runMat(),
      at.map(a => pose(onWall(a.f, a.off, a.thick + 0.03, WALL_H / 2), 0, new THREE.Vector3(a.thick, 1, a.thick))),
      colors,
    );
    add(
      new THREE.CylinderGeometry(1, 1, 0.12, 8),
      flat(PAINT.ink8),
      at.flatMap(a =>
        [1.4, 3.6].map(y =>
          pose(
            onWall(a.f, a.off, a.thick + 0.03, y + rng.rand(-0.3, 0.3)),
            0,
            new THREE.Vector3(a.thick * 1.5, 1, a.thick * 1.5),
          ),
        ),
      ),
    );
  }
  // ---- the alleys: a roof over them, lamps down their middle ----
  const lanes = ceilings.filter(lane),
    roof = kit.roof;
  if (roof) {
    const roofed = lanes.filter(c => rng.next() < roof.share && !SIDE_STEP.some((_, side) => taken({ ...c, side })));
    each(roof.maps, roofed, (map, mine) =>
      add(
        new THREE.PlaneGeometry(4, 4).rotateX(Math.PI / 2),
        new THREE.MeshBasicMaterial({ map, color: roof.tint, side: THREE.DoubleSide }),
        mine.map(c =>
          pose(
            new THREE.Vector3(tileCenter(c.i), roof.y + rng.rand(0, 0.12), tileCenter(c.j)),
            rng.pick([0, Math.PI / 2]),
          ),
        ),
      ),
    );
    add(
      new THREE.BoxGeometry(4, 0.16, 0.16),
      flat(roof.beam),
      roofed.map(c => {
        const alongX = d.maps.grid[c.j * d.W + c.i - 1] === 1 || d.maps.grid[c.j * d.W + c.i + 1] === 1;
        return pose(new THREE.Vector3(tileCenter(c.i), roof.y - 0.1, tileCenter(c.j)), alongX ? Math.PI / 2 : 0);
      }),
    );
  }
  const bl = kit.bulbs;
  if (bl) {
    const bulbs = lanes
      .filter(() => rng.next() < bl.share)
      .map(c => ({
        x: tileCenter(c.i) + rng.rand(-0.7, 0.7),
        z: tileCenter(c.j) + rng.rand(-0.7, 0.7),
        y: rng.rand(bl.y[0], bl.y[1]),
      }));
    add(
      new THREE.BoxGeometry(0.025, 1, 0.025),
      flat(PAINT.ink3),
      bulbs.map(b => pose(new THREE.Vector3(b.x, (b.y + WALL_H) / 2, b.z), 0, new THREE.Vector3(1, WALL_H - b.y, 1))),
    );
    add(
      new THREE.SphereGeometry(0.09, 8, 6),
      flat(bl.color),
      bulbs.map(b => pose(new THREE.Vector3(b.x, b.y, b.z))),
    );
    bulbs.forEach(b => lights.push({ x: b.x, z: b.z, color: bl.color, size: 0.7 }));
  }
}
