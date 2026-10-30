import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { T } from '@engine/world/tiles.ts';
import { HALL_H } from '../../../data/level.ts';
import type { FloorPlan } from '../../building.ts';
import { FULL_SIZE, facing, onWall, pose } from '../props.ts';
import type { Light, PropTools } from '../props.ts';
import { wallPic } from '../common.ts';
import { hallSurround } from '../hallFaces.ts';
import {
  RUIN_ALL_WALLS,
  RUIN_HALL_LIT_WALLS,
  RUIN_HALL_STAGE_WALLS,
  RUIN_ROOM_WALLS,
  RUIN_WALL_SIDES,
} from './pictures.ts';
import {
  DAYLIGHT,
  HALL_BEAM,
  HALL_LAMP_GLASS,
  HALL_LAMP_METAL,
  HALL_PLASTER,
  HALL_STEEL,
  HALL_TABLETOP,
  HALL_VINYL,
  HALL_WEED,
  HALL_WOOD,
} from './strokes.ts';
// What lies and stands in the ruined streets' collapsed hall (its boss room), all of it for the eye: it has no body in
// the tile world, and all of it is against the walls (within about 1.3 m) or hangs on them, so nothing is in the way of
// the fight. PHANTOM flies about the room and CRUSHER charges across it and leaps high, so the middle of the room and
// the air over it are left empty. Along the walls: heaps of fallen mortar, beams come down and leaning on the wall,
// stacks of folding chairs, a folding table leaning and one tipped over, a lectern by the stage, weeds where the light
// falls. High on the walls: ivy hanging from the broken roof edge, a dead lamp on its bracket. On the floor: pools of the
// day's pale light.
// ---- tuning numbers used only here ----
const HEAP = { chance: 0.34, out: [0.35, 1.0] as const, stones: [4, 7] as const, r: [0.18, 0.42] as const }; // a heap of fallen mortar: chance per wall face, distance from the wall, stones in it, their size (m)
const BEAM = { chance: 0.12, max: 3, len: 3.2, w: 0.2, h: 0.26, foot: 1.2, top: 1.5 }; // a roof beam leaning on a wall: its distance from the wall at the floor, the height it reaches
const STACK = {
  chance: 0.2,
  max: 6,
  out: [0.4, 0.9] as const,
  w: 0.5,
  deep: 0.5,
  seat: 0.04,
  gap: 0.13,
  legs: 0.025,
  back: 0.45,
}; // a stack of folding chairs
const STACK_CHAIRS = [5, 9] as const;
const LEAN_TABLE = { chance: 0.1, max: 2, w: 1.7, h: 0.72, thick: 0.04, out: 0.3, lean: 0.2 }; // a folding table on its edge, leaning
const TIPPED = { chance: 0.08, max: 2, out: [0.8, 1.2] as const, w: 1.6, d: 0.7, thick: 0.04, tip: 0.5, leg: 0.7 }; // a table tipped over
const LECTERN = { out: 0.9, w: 0.55, d: 0.45, h: 1.05, top: 0.1, slope: 0.35 }; // the lectern stood by the stage
const VINE = { chance: 0.3, max: 6, w: 1.9, h: 4.2, out: 0.07 }; // ivy hanging down from the top of a wall
const LAMP = { chance: 0.1, max: 3, y: 4.4, arm: 0.5, drop: 0.26, r: 0.2, h: 0.32 }; // a dead lamp on a bracket
const WEED = { chance: 0.5, max: 8, blades: 7, out: [0.3, 1.1] as const, h: [0.4, 0.9] as const, r: 0.035 }; // weeds in the light
const DAY_POOL = { share: 0.3, size: [0.45, 0.7] as const, window: 0.5, windowOut: 1.5, opacity: 0.2 }; // the day's light on the floor: the share of floor tiles that have a pool, its size (of LAMP_POOL)

// a thing tipped up about the axis along its wall (`pitch`: the top leaning away from the wall, rad)
const leaned = (pos: THREE.Vector3, turn: number, pitch: number, scale = FULL_SIZE): THREE.Matrix4 =>
  new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, turn, 0, 'YXZ')), scale);

export function hallProps(
  plan: FloorPlan,
  tools: Pick<PropTools, 'add' | 'd' | 'pools'>,
  rng: Rng,
  vine: THREE.Texture,
) {
  if (!plan.hall) return;
  const { add, d, pools } = tools,
    { open, plain, room, pictureOf } = hallSurround(plan, d, wall =>
      wallPic(d, wall, { count: RUIN_ALL_WALLS, sides: RUIN_WALL_SIDES, rooms: RUIN_ROOM_WALLS }),
    ),
    edges = open.filter(f => f.edge),
    stage = edges.filter(f => RUIN_HALL_STAGE_WALLS.includes(pictureOf(f))),
    lit = edges.filter(f => RUIN_HALL_LIT_WALLS.includes(pictureOf(f))),
    flat = (color: number) => new THREE.MeshBasicMaterial({ color }),
    tinted = new THREE.MeshBasicMaterial({ color: 0xffffff }), // (each copy has its own colour)
    steel = flat(HALL_STEEL),
    beamMat = flat(HALL_BEAM),
    lights: Light[] = [];

  // ---- heaps of fallen mortar along the walls: a few lumps piled, the largest at the back ----
  const lumps: THREE.Matrix4[] = [],
    lumpColors: number[] = [];
  for (const f of edges) {
    if (rng.next() >= HEAP.chance) continue;
    const off = rng.rand(-1.3, 1.3),
      n = rng.randi(HEAP.stones[0], HEAP.stones[1]);
    for (let k = 0; k < n; k++) {
      const r = rng.rand(HEAP.r[0], HEAP.r[1]) * (k ? 1 : 1.4),
        out = k ? rng.rand(HEAP.out[0], HEAP.out[1]) : HEAP.out[0] + 0.1,
        at = onWall(f, off + rng.rand(-0.7, 0.7), out, r * 0.55);
      lumps.push(
        pose(
          at,
          rng.rand(0, 6.3),
          new THREE.Vector3(1, 0.7 + rng.rand(0, 0.3), 1).multiplyScalar(r),
          rng.rand(-0.4, 0.4),
        ),
      );
      lumpColors.push(rng.pick(HALL_PLASTER));
    }
  }
  add(new THREE.DodecahedronGeometry(1, 0), tinted, lumps, lumpColors);

  // ---- roof beams that came down: one end on the floor, the other against the wall ----
  const beams: THREE.Matrix4[] = [],
    rebar: THREE.Matrix4[] = [];
  for (const f of edges) {
    if (beams.length >= BEAM.max || rng.next() >= BEAM.chance) continue;
    const turn = facing(f),
      off = rng.rand(-1.0, 1.0),
      run = BEAM.foot,
      rise = BEAM.top,
      lean = Math.atan2(run, rise),
      mid = onWall(f, off, run / 2, rise / 2);
    // (the beam's long side is up and down in its own frame, so it is tipped out of the upright by `lean`)
    beams.push(leaned(mid, turn, lean, new THREE.Vector3(1, Math.hypot(run, rise) / BEAM.len, 1)));
    rebar.push(leaned(onWall(f, off + 0.35, run * 0.4, rise * 0.4), turn, lean * 0.8));
  }
  add(new THREE.BoxGeometry(BEAM.w, BEAM.len, BEAM.h), beamMat, beams);
  add(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 5), flat(HALL_LAMP_METAL), rebar);

  // ---- stacks of folding chairs: seats one over the next, four tubes down to the floor, the backs on top ----
  const seats: THREE.Matrix4[] = [],
    seatColors: number[] = [],
    legs: THREE.Matrix4[] = [],
    backs: THREE.Matrix4[] = [];
  let stacks = 0;
  for (const f of edges) {
    if (stacks >= STACK.max || rng.next() >= STACK.chance) continue;
    stacks++;
    const turn = facing(f),
      off = rng.rand(-1.2, 1.2),
      out = rng.rand(STACK.out[0], STACK.out[1]),
      n = rng.randi(STACK_CHAIRS[0], STACK_CHAIRS[1]),
      top = n * STACK.gap + 0.4;
    for (let k = 0; k < n; k++) {
      seats.push(pose(onWall(f, off, out, 0.42 + k * STACK.gap), turn + rng.rand(-0.04, 0.04)));
      seatColors.push(rng.pick(HALL_VINYL));
    }
    for (const sx of [-1, 1]) {
      legs.push(
        pose(
          onWall(f, off + sx * (STACK.w / 2 - 0.03), out, (top + 0.4) / 2),
          turn,
          new THREE.Vector3(1, top + 0.4, 1),
        ),
      );
      backs.push(
        pose(onWall(f, off + sx * (STACK.w / 2 - 0.03), out - STACK.deep / 2 + 0.03, 0.42 + top / 2 + 0.2), turn),
      );
    }
  }
  add(new THREE.BoxGeometry(STACK.w, STACK.seat, STACK.deep), tinted, seats, seatColors);
  add(new THREE.CylinderGeometry(STACK.legs, STACK.legs, 1, 5), steel, legs);
  add(new THREE.BoxGeometry(0.04, STACK.back, 0.04), steel, backs);

  // ---- a folding table stood on its edge against a wall, and one tipped over with its legs in the air ----
  const tops: THREE.Matrix4[] = [],
    tipped: THREE.Matrix4[] = [],
    tableLegs: THREE.Matrix4[] = [];
  let leaning = 0,
    over = 0;
  for (const f of edges) {
    const turn = facing(f);
    if (leaning < LEAN_TABLE.max && rng.next() < LEAN_TABLE.chance) {
      leaning++;
      tops.push(leaned(onWall(f, rng.rand(-1.0, 1.0), LEAN_TABLE.out, LEAN_TABLE.h / 2 + 0.15), turn, LEAN_TABLE.lean));
    }
    if (over < TIPPED.max && rng.next() < TIPPED.chance) {
      over++;
      const off = rng.rand(-1.0, 1.0),
        out = rng.rand(TIPPED.out[0], TIPPED.out[1]),
        yaw = turn + rng.rand(-0.5, 0.5),
        at = onWall(f, off, out, TIPPED.d * Math.sin(TIPPED.tip) * 0.5 + 0.05);
      tipped.push(
        new THREE.Matrix4().compose(
          at,
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, TIPPED.tip, 'YXZ')),
          FULL_SIZE,
        ),
      );
      for (const lx of [-0.6, 0.6])
        tableLegs.push(
          new THREE.Matrix4().compose(
            at.clone().add(new THREE.Vector3(Math.cos(yaw) * lx, TIPPED.leg * 0.45, -Math.sin(yaw) * lx)),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, TIPPED.tip, 'YXZ')),
            FULL_SIZE,
          ),
        );
    }
  }
  const tableMat = flat(HALL_TABLETOP);
  add(new THREE.BoxGeometry(LEAN_TABLE.w, LEAN_TABLE.h, LEAN_TABLE.thick), tableMat, tops);
  add(new THREE.BoxGeometry(TIPPED.w, TIPPED.thick, TIPPED.d), tableMat, tipped);
  add(new THREE.BoxGeometry(0.04, TIPPED.leg, 0.04), steel, tableLegs);

  // ---- the lectern, by a wall of the stage ----
  const lecterns: THREE.Matrix4[] = [],
    slopes: THREE.Matrix4[] = [];
  if (stage.length) {
    const f = stage[rng.randi(0, stage.length - 1)]!,
      turn = facing(f),
      off = rng.rand(-1.0, 1.0);
    lecterns.push(pose(onWall(f, off, LECTERN.out, LECTERN.h / 2), turn));
    slopes.push(leaned(onWall(f, off, LECTERN.out, LECTERN.h + 0.02), turn, -LECTERN.slope));
  }
  const wood = flat(HALL_WOOD);
  add(new THREE.BoxGeometry(LECTERN.w * 0.8, LECTERN.h, LECTERN.d * 0.8), wood, lecterns);
  add(new THREE.BoxGeometry(LECTERN.w, LECTERN.top, LECTERN.d), wood, slopes);

  // ---- weeds that came up where the light falls ----
  const blades: THREE.Matrix4[] = [],
    bladeColors: number[] = [];
  let tufts = 0;
  for (const f of lit) {
    if (tufts >= WEED.max || rng.next() >= WEED.chance) continue;
    tufts++;
    const off = rng.rand(-1.2, 1.2),
      out = rng.rand(WEED.out[0], WEED.out[1]);
    for (let k = 0; k < WEED.blades; k++) {
      const h = rng.rand(WEED.h[0], WEED.h[1]);
      blades.push(
        pose(
          onWall(f, off + rng.rand(-0.25, 0.25), out + rng.rand(-0.2, 0.2), h / 2),
          rng.rand(0, 6.3),
          new THREE.Vector3(1, h, 1),
          rng.rand(-0.35, 0.35),
        ),
      );
      bladeColors.push(rng.pick([HALL_WEED, 0x4f6d3b, 0x718d55]));
    }
  }
  add(new THREE.ConeGeometry(WEED.r, 1, 4), tinted, blades, bladeColors);

  // ---- ivy hanging from the broken top of a wall ----
  const hang: THREE.Matrix4[] = [];
  for (const f of edges) {
    if (hang.length >= VINE.max || rng.next() >= VINE.chance) continue;
    const flip = rng.next() < 0.5 ? -1 : 1;
    hang.push(
      pose(onWall(f, rng.rand(-1.1, 1.1), VINE.out, HALL_H - VINE.h / 2), facing(f), new THREE.Vector3(flip, 1, 1)),
    );
  }
  add(
    new THREE.PlaneGeometry(VINE.w, VINE.h),
    new THREE.MeshBasicMaterial({ map: vine, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }),
    hang,
  );

  // ---- a dead lamp on a bracket, a little out from the wall ----
  const arms: THREE.Matrix4[] = [],
    shades: THREE.Matrix4[] = [];
  for (const f of edges) {
    if (arms.length >= LAMP.max || rng.next() >= LAMP.chance) continue;
    const turn = facing(f),
      off = rng.rand(-1.0, 1.0);
    arms.push(pose(onWall(f, off, LAMP.arm / 2, LAMP.y), turn));
    shades.push(pose(onWall(f, off, LAMP.arm, LAMP.y - LAMP.drop), turn));
  }
  add(new THREE.BoxGeometry(0.05, 0.05, LAMP.arm), flat(HALL_LAMP_METAL), arms);
  add(
    new THREE.CylinderGeometry(LAMP.r * 0.5, LAMP.r, LAMP.h, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: HALL_LAMP_GLASS, side: THREE.DoubleSide }),
    shades,
  );

  // ---- the day's light on the floor: under the broken roof, and before the windows ----
  for (let j = room.y; j < room.y + room.h; j++)
    for (let i = room.x; i < room.x + room.w; i++) {
      if (!plain(j * d.W + i) || rng.next() >= DAY_POOL.share) continue;
      const size = rng.rand(DAY_POOL.size[0], DAY_POOL.size[1]);
      lights.push({ x: (i + 0.5) * T + rng.rand(-1, 1), z: (j + 0.5) * T + rng.rand(-1, 1), color: DAYLIGHT, size });
    }
  for (const f of lit) {
    const at = onWall(f, 0, DAY_POOL.windowOut, 0);
    lights.push({ x: at.x, z: at.z, color: DAYLIGHT, size: DAY_POOL.window });
  }
  pools(lights, DAY_POOL.opacity);
}
