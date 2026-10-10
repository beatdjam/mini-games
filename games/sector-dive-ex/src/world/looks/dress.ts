import { PAINT } from '../../data/colors.ts';
import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import type { TileMapData } from '@engine/world/dungeon.ts';
import { SIDE_STEP, T, tileCenter } from '@engine/world/tiles.ts';
import { WALL_H } from '../../data/level.ts';
import type { FloorPlan } from '../building.ts';
import { wallPic } from './common.ts';
import type { WallSides } from './common.ts';
import { facing, floorNear, onWall, overHead, pose, raised } from './props.ts';
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
// The tiles under a ceiling that get a bundle slung across, line by line (`turn` 0: the bundle runs along x). In an
// alley every tile throws its own dice. In a room whole rows and columns of its tiles are taken (a row or a column
// `share.hall` / 2 of the time, so about that share of the tiles), and a bundle goes from wall to wall: thrown tile by
// tile, they hung there as loose ends, each its own way, joined to nothing
export function spanLines<T extends { i: number; j: number; room: number }>(
  ceilings: T[],
  share: Share,
  rng: Rng,
): { tiles: T[]; turn: number }[] {
  const lines: { tiles: T[]; turn: number }[] = [],
    inRooms = new Map<string, T[]>();
  for (const c of ceilings) {
    if (c.room < 0) {
      if (rng.next() < share.lane) lines.push({ tiles: [c], turn: rng.pick([0, Math.PI / 2]) });
      continue;
    }
    for (const key of [`${c.room}x${c.j}`, `${c.room}z${c.i}`]) {
      if (!inRooms.has(key)) inRooms.set(key, []);
      inRooms.get(key)!.push(c);
    }
  }
  for (const [key, tiles] of inRooms)
    if (rng.next() < share.hall / 2) lines.push({ tiles, turn: key.includes('x') ? 0 : Math.PI / 2 });
  return lines;
}
// The wall faces in straight lines: the faces on one side of a room (or of an alley), tile after tile along the wall
// (faces in the order of the wall's run, `along` = (dj, di) of the side, onWall's `off`). A line ends where the wall
// does: at a doorway or where the wall turns. A run of pipe or cable along the walls is decided line by line, one
// piece from end to end at one height: decided face by face, the pieces stood at every height, each ending in the air.
// `open`: per end (the start, the end), whether the wall stops there with floor beyond it (a doorway, an outer
// corner); there a run turns into the wall. Where it does not (an inner corner) the run ends against the wall across
export interface WallLine<F extends WallSlot> {
  faces: F[];
  open: [boolean, boolean];
}
export function wallLines<F extends WallSlot & { room: number }>(faces: F[], d: TileMapData): WallLine<F>[] {
  const at = new Map(faces.map(f => [`${f.side}:${f.i}:${f.j}`, f])),
    seen = new Set<F>(),
    lines: WallLine<F>[] = [];
  for (const f of faces) {
    if (seen.has(f)) continue;
    const [di, dj] = SIDE_STEP[f.side ?? 0]!,
      next = (g: F, k: number) => {
        const n = at.get(`${g.side}:${g.i + dj * k}:${g.j + di * k}`);
        return n && n.room === g.room && !seen.has(n) ? n : undefined;
      };
    let first = f;
    for (let p = next(first, -1); p; p = next(first, -1)) first = p;
    const line: F[] = [];
    for (let g: F | undefined = first; g; g = next(g, 1)) {
      seen.add(g);
      line.push(g);
    }
    const last = line[line.length - 1]!,
      floorAt = (i: number, j: number) => d.maps.grid[j * d.W + i] === 1;
    lines.push({ faces: line, open: [floorAt(first.i - dj, first.j - di), floorAt(last.i + dj, last.j + di)] });
  }
  return lines;
}
const TURN_IN = 0.25; // a run turns into the wall this far short of where the wall stops (m)
export const RUN_LEN = 4.05; // a run's piece over one face: the tile and a little, so the pieces meet (m; the geometry's length)
// The pieces of a run along a line, `out` from the wall at height y, `thick` its radius: one per face, and at each
// open end the piece cut short and a stub from there into the wall. (For a cylinder RUN_LEN long and 1 round)
export function runAlong<F extends WallSlot>(
  line: WallLine<F>,
  y: number,
  out: number,
  thick: number,
): THREE.Matrix4[] {
  const pieces: THREE.Matrix4[] = [],
    n = line.faces.length;
  line.faces.forEach((f, k) => {
    const cutStart = k === 0 && line.open[0] ? TURN_IN : 0,
      cutEnd = k === n - 1 && line.open[1] ? TURN_IN : 0,
      len = RUN_LEN - cutStart - cutEnd;
    pieces.push(
      pose(
        onWall(f, (cutStart - cutEnd) / 2, out, y),
        facing(f),
        new THREE.Vector3(thick, len / RUN_LEN, thick),
        Math.PI / 2,
      ),
    );
    for (const [cut, end] of [
      [cutStart, -1],
      [cutEnd, 1],
    ] as [number, number][])
      if (cut)
        pieces.push(
          new THREE.Matrix4().compose(
            onWall(f, end * (RUN_LEN / 2 - TURN_IN), out / 2, y),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, facing(f), 0, 'YXZ')),
            new THREE.Vector3(thick, (out + thick) / RUN_LEN, thick),
          ),
        );
  });
  return pieces;
}
export interface WallKit {
  pics: number; // how many wall pictures the sector has, and
  laneWalls?: number[]; // ... what an alley's walls get in place of the plain one (common.ts wallPic)
  sides?: WallSides; // ... the pictures that go only on some walls
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
    // (null on a floor without one: -1, the number the alleys have, would leave them all out)
    arena = plan.hall ? plan.hall.room : null,
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
    // (nor by a deck or a walkway: what stands on the ground there would be half in it)
    bare = (f: WallSlot): boolean => {
      const [di, dj] = SIDE_STEP[f.side ?? 0]!;
      return (
        kit.bare.includes(wallPic(d, (f.j + dj) * d.W + f.i + di, kit.pics, kit.laneWalls, kit.sides)) && !raised(d, f)
      );
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
        faces.filter(f => !byDoor(f) && !raised(d, f)),
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
      // (not over a deck or a walkway: there it would stand out from the wall at the eye)
      faces.filter(f => !taken(f) && !raised(d, f)),
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
  const round = new THREE.CylinderGeometry(1, 1, RUN_LEN, 6),
    runAt: THREE.Matrix4[] = [],
    runColor: number[] = [],
    lines = wallLines(faces, d);
  for (const r of kit.runs ? [kit.runs].flat() : [])
    for (const line of lines) {
      const f = line.faces[0]!;
      if (rng.next() >= of(r, f)) continue;
      const y = lane(f) ? rng.rand(r.laneY[0], r.laneY[1]) : rng.rand(r.y[0], r.y[1]);
      for (let k = 0, n = rng.randi(r.n[0], r.n[1]); k < n; k++) {
        const pieces = runAlong(
          line,
          y - Math.floor(k / 4) * r.r * 2.8,
          r.r * 2.5 + (k % 4) * r.r * 2.4,
          r.r * rng.rand(0.6, 1.7),
        );
        const color = rng.pick(r.colors);
        pieces.forEach(m => {
          runAt.push(m);
          runColor.push(color);
        });
      }
    }
  const sp = kit.spans;
  if (sp)
    for (const { tiles, turn } of spanLines(ceilings, sp, rng)) {
      // (one bundle the whole line long: the same cables at the same height over every tile of it)
      const high = lane(tiles[0]!) ? rng.rand(sp.laneY[0], sp.laneY[1]) : rng.rand(sp.y[0], sp.y[1]),
        sag = rng.rand(0.08, 0.2),
        // (where it sags lowest, over the head of someone on a deck under or next to any tile of the line)
        y = overHead(high - sag * 1.1 - 0.1, Math.max(...tiles.map(c => floorNear(d, c.i, c.j)))) + sag * 1.1 + 0.1,
        n = rng.randi(sp.n[0], sp.n[1]);
      for (let k = 0; k < n; k++) {
        const thick = sp.r * rng.rand(0.7, 1.9),
          side = (k - n / 2) * sp.r * 2.6,
          color = rng.pick(sp.colors);
        for (const c of tiles)
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
    // (at an end of a line of wall, by the corner or the doorway: where the runs along it turn, a pipe takes them up
    // and down; not anywhere along a wall, where it met nothing)
    const at = lines
        .filter(l => rng.next() < of(rs, l.faces[0]!))
        .map(l => {
          const end = rng.next() < 0.5 ? 0 : 1;
          return {
            f: l.faces[end ? l.faces.length - 1 : 0]!,
            off: (end ? 1 : -1) * (T / 2 - TURN_IN - 0.1),
            thick: rs.r * rng.rand(0.7, 1.5),
          };
        }),
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
    const roofed = lanes.filter(c => rng.next() < roof.share && !SIDE_STEP.some((_, side) => taken({ ...c, side }))),
      // (its beam's underside, over the head of someone on a walkway there)
      roofY = (c: { i: number; j: number }) => overHead(roof.y - 0.18, floorNear(d, c.i, c.j)) + 0.18;
    each(roof.maps, roofed, (map, mine) =>
      add(
        new THREE.PlaneGeometry(4, 4).rotateX(Math.PI / 2),
        new THREE.MeshBasicMaterial({ map, color: roof.tint, side: THREE.DoubleSide }),
        mine.map(c =>
          pose(
            new THREE.Vector3(tileCenter(c.i), roofY(c) + rng.rand(0, 0.12), tileCenter(c.j)),
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
        return pose(new THREE.Vector3(tileCenter(c.i), roofY(c) - 0.1, tileCenter(c.j)), alongX ? Math.PI / 2 : 0);
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
        y: overHead(rng.rand(bl.y[0], bl.y[1]) - 0.1, floorNear(d, c.i, c.j)) + 0.1,
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
