import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { T, tileCenter } from '@engine/world/tiles.ts';
import { HALL_H } from '../../../data/level.ts';
import type { FloorPlan } from '../../building.ts';
import { wallPic } from '../common.ts';
import { hallSurround } from '../hallFaces.ts';
import type { HallFace } from '../hallFaces.ts';
import { canvasTex } from '../paint.ts';
import { facing, onWall, pose } from '../props.ts';
import type { Light, PropTools } from '../props.ts';
import { mallBoxTex } from './cutouts.ts';
import {
  MALL_DOCK_BAYS,
  MALL_DOCK_RACK_WALLS,
  MALL_LANE_WALLS,
  MALL_LIFT_WALLS,
  MALL_ROOM_WALLS,
  MALL_WALL_PICS,
  MALL_WALL_SIDES,
} from './pictures.ts';
// What stands in the mall's loading dock (its boss room), all of it for the eye: it has no body in the tile world, and
// all of it stays close to the walls (under a metre out) or lies flat on the floor, so nothing is in the way of the
// fight. Along the walls: pallet racks with cartons on them, cage trolleys, pallets wrapped in film in piles, stacks of
// empty pallets, and a mercury lamp on a bracket every other tile, high on the wall (clear of what the boss crane
// sweeps, HOIST: the crane's rails and bridge are over 8 m up and between the rails). On the floor: a yellow line along
// every wall and pillar, the tracks of a forklift and oil. Under the ceiling: beams along the room (parallel to the
// crane's rails and clear of them: they stop 2 m from each) and purlins across them, tight under the roof deck.
// ---- tuning numbers used only here ----
const LINE = { w: 0.16, thick: 0.02, y: 0.03, out: 1.6, color: 0xa38c2a }; // the yellow line along a wall: where, its colour
const DECAL_Y = 0.025; // stains and tracks lie this far over the floor (m)
const RACK = { h: 6.4, w: 3.7, deep: 0.9, post: 0.09, gap: 1.5, levels: 4, beam: 0.14, post0: 0.08, chance: 0.75 }; // a pallet rack bay (m): its levels are `gap` apart
const RACK_POST = 0x2b4c78;
const RACK_BEAM = 0x9c6420; // dull orange
const RACK_DECK = 0x3b3e42;
const CARTON_CHANCE = 0.75; // a place on a rack that has cartons on it
const CART = { w: 0.8, deep: 1.1, h: 1.55, base: 0.17, chance: 0.3, out: 0.8 }; // a cage trolley
const PILE = { w: 1.1, h: [0.9, 1.5] as const, chance: 0.42, out: 0.8, pallet: 0.14 }; // pallets wrapped in film
const STACK = { w: 1.2, deep: 1.0, pallet: 0.14, n: [5, 11] as const, chance: 0.35, out: 0.75 }; // empty pallets
const LAMP = { y: 7.6, out: 0.9, size: 1.3, color: 0xcfe6d6, glow: 0x9fb8a8 }; // a mercury lamp on its bracket
const BEAM = { w: 0.3, h: 0.5, flange: 0.34, flangeH: 0.06, color: 0x3b3f43, keep: 2 }; // the beams; `keep` clear of the crane's rails (m)
const PURLIN = { size: 0.14, y: HALL_H - 0.1 }; // the purlins across the beams: under the roof deck, over the rails' tops
const TRACK_LANES = 2; // the lanes the forklift ran along
const TRACK_SKIP = 0.2; // a tile of a lane the tracks do not reach
const OIL_STAINS = 6;
const WHEEL_GAUGE = 0.55; // a forklift's wheels are this far either side of its middle (m)
const CARTON_N = 4; // pictures of cartons and crates (mallBoxTex)

let shared: {
  cartons: THREE.CanvasTexture[];
  pallet: THREE.CanvasTexture;
  cage: THREE.CanvasTexture;
  wrap: THREE.CanvasTexture;
  tracks: THREE.CanvasTexture;
  oil: THREE.CanvasTexture;
} | null = null;
// a pallet from the side: boards with gaps between
const palletTex = () =>
  canvasTex(128, 64, g => {
    g.fillStyle = '#2a1f14';
    g.fillRect(0, 0, 128, 64);
    for (const y of [2, 24, 46]) {
      g.fillStyle = '#8c6b43';
      g.fillRect(0, y, 128, 16);
      g.fillStyle = 'rgba(30,18,8,.3)';
      for (let x = 0; x < 128; x += 7) g.fillRect(x, y + (x % 3) * 4, 5, 1);
    }
  });
// the wire mesh of a trolley: a frame and a grid, clear between
const cageTex = () =>
  canvasTex(64, 96, g => {
    g.strokeStyle = '#8d979e';
    g.lineWidth = 1.5;
    for (let x = 0; x <= 64; x += 8) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 96);
      g.stroke();
    }
    for (let y = 0; y <= 96; y += 8) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(64, y);
      g.stroke();
    }
    g.strokeStyle = '#6e7880';
    g.lineWidth = 5;
    g.strokeRect(2, 2, 60, 92);
  });
// stretch film: a pale haze with bright streaks round the load
const wrapTex = () =>
  canvasTex(64, 64, g => {
    g.fillStyle = 'rgba(214,228,238,.2)';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,.4)';
    for (const y of [6, 14, 31, 40, 55]) g.fillRect(0, y, 64, 2);
  });
// a forklift's tracks along a tile: two rows of black rubber, broken here and there
const tracksTex = () =>
  canvasTex(256, 256, g => {
    for (const y of [128 - WHEEL_GAUGE * 64, 128 + WHEEL_GAUGE * 64])
      for (let x = 0; x < 256; x += 16) {
        g.fillStyle = `rgba(10,10,10,${0.12 + ((x * 7 + y) % 5) * 0.05})`;
        g.fillRect(x, y - 7, 16, 14);
      }
  });
// oil: a few dark blobs with a ring of sheen
const oilTex = () =>
  canvasTex(128, 128, g => {
    for (const [x, y, r, a] of [
      [64, 64, 34, 0.4],
      [84, 50, 16, 0.4],
      [44, 82, 14, 0.35],
    ] as const) {
      const blob = g.createRadialGradient(x, y, 2, x, y, r);
      blob.addColorStop(0, `rgba(8,6,4,${a + 0.2})`);
      blob.addColorStop(1, 'rgba(8,6,4,0)');
      g.fillStyle = blob;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.strokeStyle = 'rgba(120,140,160,.2)';
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(64, 64, 30, 24, 0, 0, Math.PI * 2);
    g.stroke();
  });

export function dockProps(plan: FloorPlan, tools: Pick<PropTools, 'add' | 'd'>, rng: Rng, lights: Light[]) {
  if (!plan.hall) return;
  shared ??= {
    cartons: Array.from({ length: CARTON_N }, (_, n) => mallBoxTex(n)),
    pallet: palletTex(),
    cage: cageTex(),
    wrap: wrapTex(),
    tracks: tracksTex(),
    oil: oilTex(),
  };
  const tex = shared,
    { add, d } = tools,
    { room, plain, open, pictureOf } = hallSurround(plan, d, wall =>
      wallPic(d, wall, MALL_WALL_PICS.length, MALL_LANE_WALLS, MALL_WALL_SIDES, MALL_ROOM_WALLS, MALL_LIFT_WALLS),
    ),
    flat = (color: number) => new THREE.MeshBasicMaterial({ color }),
    cartonsOf = new Map<THREE.Texture, THREE.Matrix4[]>(),
    carton = (pos: THREE.Vector3, turn: number, w: number, h: number, deep: number) => {
      const map = rng.pick(tex.cartons);
      (cartonsOf.get(map) ?? cartonsOf.set(map, []).get(map)!).push(pose(pos, turn, new THREE.Vector3(w, h, deep)));
    };

  // ---- the yellow line along every wall and round every pillar ----
  add(
    new THREE.BoxGeometry(T + LINE.w, LINE.thick, LINE.w),
    flat(LINE.color),
    open.map(f => pose(onWall(f, 0, LINE.out, LINE.y), facing(f))),
  );

  // ---- on the floor: the forklift's tracks along a row and a column, and oil ----
  const tiles = (k: number) => ({ i: k % d.W, j: (k / d.W) | 0 }),
    inner: number[] = [];
  for (let j = room.y + 1; j < room.y + room.h - 1; j++)
    for (let i = room.x + 1; i < room.x + room.w - 1; i++) if (plain(j * d.W + i)) inner.push(j * d.W + i);
  const flatDecal = (map: THREE.Texture, ks: number[], turn: (k: number) => number, size: number) =>
    add(
      new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }),
      ks.map(k => {
        const { i, j } = tiles(k);
        return pose(new THREE.Vector3(tileCenter(i), DECAL_Y, tileCenter(j)), turn(k));
      }),
    );
  const trackTiles: number[] = [],
    trackTurns = new Map<number, number>();
  for (let n = 0; n < TRACK_LANES; n++) {
    const along = n % 2 === 0,
      lane = rng.randi(1, (along ? room.h : room.w) - 2);
    for (const k of inner) {
      const { i, j } = tiles(k);
      if ((along ? j - room.y : i - room.x) !== lane || rng.next() < TRACK_SKIP || trackTurns.has(k)) continue;
      trackTiles.push(k);
      trackTurns.set(k, along ? 0 : Math.PI / 2);
    }
  }
  flatDecal(tex.tracks, trackTiles, k => trackTurns.get(k)!, T);
  const oilTiles = rng.shuffle([...inner]).slice(0, OIL_STAINS);
  flatDecal(tex.oil, oilTiles, () => rng.rand(0, Math.PI * 2), T * 0.8);

  // ---- pallet racks, cage trolleys, wrapped pallets and stacks of empty pallets along the walls ----
  const edges = open.filter(f => f.edge),
    racked = new Set<HallFace>(),
    posts: THREE.Matrix4[] = [],
    beams: THREE.Matrix4[] = [],
    decks: THREE.Matrix4[] = [];
  for (const f of edges) {
    if (!MALL_DOCK_RACK_WALLS.includes(pictureOf(f)) || rng.next() >= RACK.chance) continue;
    racked.add(f);
    const turn = facing(f),
      off = rng.rand(-0.1, 0.1);
    for (const dx of [-RACK.w / 2 + 0.05, RACK.w / 2 - 0.05])
      for (const out of [RACK.post0 + RACK.post, RACK.deep - RACK.post])
        posts.push(pose(onWall(f, off + dx, out, RACK.h / 2), turn));
    for (let level = 0; level < RACK.levels; level++) {
      const y = RACK.gap * (level + 1);
      for (const out of [RACK.post0 + RACK.post, RACK.deep - RACK.post]) beams.push(pose(onWall(f, off, out, y), turn));
      decks.push(pose(onWall(f, off, RACK.deep / 2, y + 0.085), turn));
    }
    // the cartons: on the floor and on each level, in two or three places across the bay
    for (let level = 0; level <= RACK.levels; level++) {
      const base = level === 0 ? 0 : RACK.gap * level + 0.1,
        n = rng.randi(2, 3);
      for (let c = 0; c < n; c++) {
        if (rng.next() > CARTON_CHANCE) continue;
        const w = (RACK.w - 0.3) / n - 0.1,
          h = rng.rand(0.6, RACK.gap - 0.3);
        carton(
          onWall(f, off + (c - (n - 1) / 2) * (RACK.w / n), RACK.deep / 2, base + h / 2),
          turn + rng.rand(-0.04, 0.04),
          w,
          h,
          RACK.deep - 0.3,
        );
      }
    }
  }
  add(new THREE.BoxGeometry(RACK.post, RACK.h, RACK.post), flat(RACK_POST), posts);
  add(new THREE.BoxGeometry(RACK.w, RACK.beam, 0.05), flat(RACK_BEAM), beams);
  add(new THREE.BoxGeometry(RACK.w, 0.03, RACK.deep - 0.2), flat(RACK_DECK), decks);

  // the cage trolleys: a base on four wheels, the wire on three sides and cartons inside
  const bases: THREE.Matrix4[] = [],
    wheels: THREE.Matrix4[] = [],
    meshes: THREE.Matrix4[] = [],
    wrapped: THREE.Matrix4[] = [],
    palletsAt: THREE.Matrix4[] = [];
  for (const f of edges) {
    const bay = MALL_DOCK_BAYS.includes(pictureOf(f));
    if (racked.has(f)) continue;
    if (rng.next() < CART.chance * (bay ? 0.5 : 1)) {
      const turn = facing(f) + rng.rand(-0.35, 0.35),
        at = onWall(f, rng.rand(-1.2, 1.2), CART.out, 0),
        local = (x: number, z: number, y: number, yaw = 0): THREE.Matrix4 =>
          pose(
            new THREE.Vector3(
              at.x + Math.cos(turn) * x + Math.sin(turn) * z,
              y,
              at.z - Math.sin(turn) * x + Math.cos(turn) * z,
            ),
            turn + yaw,
          );
      bases.push(local(0, 0, CART.base));
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) wheels.push(local((sx * CART.w) / 2.3, (sz * CART.deep) / 2.3, 0.07));
      meshes.push(
        local(0, -CART.deep / 2, CART.base + CART.h / 2),
        local(-CART.w / 2, 0, CART.base + CART.h / 2, Math.PI / 2),
        local(CART.w / 2, 0, CART.base + CART.h / 2, Math.PI / 2),
      );
      const n = rng.randi(1, 3);
      for (let c = 0; c < n; c++) {
        const h = rng.rand(0.35, 0.6);
        const p = local(rng.rand(-0.1, 0.1), -0.25 + c * 0.25, CART.base + 0.06 + h / 2 + (c % 2) * 0.0);
        carton(new THREE.Vector3().setFromMatrixPosition(p), turn, CART.w - 0.15, h, 0.4);
      }
    }
    // wrapped pallets, one on another half of the time
    if (rng.next() < PILE.chance) {
      const at = onWall(f, rng.rand(-1.1, 1.1), PILE.out + (bay ? 0.5 : 0), 0),
        turn = facing(f) + rng.rand(-0.1, 0.1),
        tiers = rng.next() < 0.45 ? 2 : 1;
      let y = 0;
      for (let t = 0; t < tiers; t++) {
        const h = rng.rand(PILE.h[0], PILE.h[1]),
          mid = new THREE.Vector3(at.x, y + PILE.pallet + h / 2, at.z);
        palletsAt.push(pose(new THREE.Vector3(at.x, y + PILE.pallet / 2, at.z), turn));
        carton(mid, turn, PILE.w - 0.1, h, PILE.w - 0.1);
        wrapped.push(pose(mid, turn, new THREE.Vector3(PILE.w, h + 0.06, PILE.w)));
        y += PILE.pallet + h;
      }
    }
    // empty pallets stacked
    if (rng.next() < STACK.chance) {
      const at = onWall(f, rng.rand(-1.2, 1.2), STACK.out, 0),
        turn = facing(f) + rng.rand(-0.15, 0.15);
      for (let p = 0, n = rng.randi(STACK.n[0], STACK.n[1]); p < n; p++)
        palletsAt.push(
          pose(
            new THREE.Vector3(
              at.x + rng.rand(-0.03, 0.03),
              STACK.pallet * (p + 0.5) + p * 0.012,
              at.z + rng.rand(-0.03, 0.03),
            ),
            turn + rng.rand(-0.05, 0.05),
          ),
        );
    }
  }
  const wire = new THREE.MeshBasicMaterial({
    map: tex.cage,
    transparent: true,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
  });
  add(new THREE.BoxGeometry(CART.w, 0.1, CART.deep), flat(0x5b6268), bases);
  add(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 8).rotateZ(Math.PI / 2), flat(0x1c1d1f), wheels);
  add(new THREE.PlaneGeometry(CART.deep, CART.h), wire, meshes);
  add(
    new THREE.BoxGeometry(STACK.w, STACK.pallet, STACK.deep),
    new THREE.MeshBasicMaterial({ map: tex.pallet }),
    palletsAt,
  );
  cartonsOf.forEach((where, map) => add(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ map }), where));
  add(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ map: tex.wrap, transparent: true, depthWrite: false }),
    wrapped,
  );

  // ---- a mercury lamp on a bracket every other tile, high on the wall ----
  const arms: THREE.Matrix4[] = [],
    shades: THREE.Matrix4[] = [],
    bulbs: THREE.Matrix4[] = [];
  for (const f of edges.filter(e => (e.i + e.j) % 2 === 0)) {
    const turn = facing(f);
    arms.push(pose(onWall(f, 0, LAMP.out / 2, LAMP.y + 0.28), turn + Math.PI / 2));
    shades.push(pose(onWall(f, 0, LAMP.out, LAMP.y)));
    bulbs.push(pose(onWall(f, 0, LAMP.out, LAMP.y - 0.2)));
    const on = onWall(f, 0, LAMP.out + 0.8, 0);
    lights.push({ x: on.x, z: on.z, color: LAMP.glow, size: LAMP.size });
  }
  add(new THREE.BoxGeometry(0.07, 0.07, LAMP.out), flat(0x4b4e50), arms);
  add(
    new THREE.CylinderGeometry(0.16, 0.46, 0.36, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x70767a, side: THREE.DoubleSide }),
    shades,
  );
  add(new THREE.SphereGeometry(0.15, 10, 8), flat(LAMP.color), bulbs);

  // ---- the beams under the roof, and the purlins across them ----
  const beamLen = room.h * T,
    beamAt: THREE.Matrix4[] = [],
    flangeAt: THREE.Matrix4[] = [],
    purlinAt: THREE.Matrix4[] = [],
    cx = (room.x + room.w / 2) * T,
    cz = (room.y + room.h / 2) * T,
    rails = (room.w * T) / 2 - 2; // where the crane's rails are, from the middle of the room (HOIST, RAIL_MARGIN)
  for (let k = 1; k < room.w; k++) {
    const x = (room.x + k) * T;
    if (Math.abs(Math.abs(x - cx) - rails) < BEAM.keep) continue;
    beamAt.push(pose(new THREE.Vector3(x, HALL_H - BEAM.h / 2 - 0.02, cz)));
    flangeAt.push(pose(new THREE.Vector3(x, HALL_H - BEAM.h - 0.05, cz)));
  }
  for (let k = 1; k < room.h; k++) purlinAt.push(pose(new THREE.Vector3(cx, PURLIN.y, (room.y + k) * T), 0));
  const steel = flat(BEAM.color);
  add(new THREE.BoxGeometry(BEAM.w * 0.35, BEAM.h, beamLen), steel, beamAt);
  add(new THREE.BoxGeometry(BEAM.flange, BEAM.flangeH, beamLen), steel, flangeAt);
  add(new THREE.BoxGeometry(room.w * T, PURLIN.size, PURLIN.size), steel, purlinAt);
}
