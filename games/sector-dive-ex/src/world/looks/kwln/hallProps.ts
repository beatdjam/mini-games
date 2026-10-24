import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { T } from '@engine/world/tiles.ts';
import { COLOR, css } from '../../../data/colors.ts';
import { KWLN_NEON_WORDS } from '../../../i18n/signs.ts';
import type { FloorPlan } from '../../building.ts';
import { facing, lightMat, onWall, pose } from '../props.ts';
import type { Light, PropTools } from '../props.ts';
import { wallPic } from '../common.ts';
import { hallSurround } from '../hallFaces.ts';
import { canvasTex, poolTex } from '../paint.ts';
import { washingTex } from './cutouts.ts';
import {
  KWLN_ALL_WALLS,
  KWLN_HALL_HANGING_WALLS,
  KWLN_HALL_SHRINE_WALLS,
  KWLN_HALL_SIGNED_WALLS,
  KWLN_LANE_WALLS,
  KWLN_ROOM_WALLS,
} from './pictures.ts';
import {
  HALL_ASH,
  HALL_BRONZE,
  HALL_CANDLE,
  HALL_FLAME,
  HALL_GOLD,
  HALL_LACQUER,
  HALL_LANTERN,
  HALL_ORANGE,
  HALL_PLATE,
  HALL_STICK,
  HALL_WAX,
  KWLN_FONT,
} from './strokes.ts';
// What stands in the walled city's temple square (its boss room), all of it for the eye: it has no body in the tile
// world, and all of it stays close to the walls (a metre or so out) or hangs from them, so nothing is in the way of the
// fight. TRINITY's three drones spin and fly about the room and WATCHER floats in it and fires rings, so the middle of
// the room and the air over it are left empty: no lantern or cable crosses the room. Hanging from the walls high up:
// red paper lanterns, neon signs on brackets, poles of washing, cables sagging along the wall. On the floor by the walls:
// a bronze cauldron of incense and stands of joss sticks (thin smoke rises from them), offering tables, plastic stools.
// ---- tuning numbers used only here ----
const LANTERN = {
  chance: 0.4,
  max: 16,
  r: 0.3,
  out: [0.35, 1.15] as const,
  y: [3.8, 5.0] as const,
  arm: 5.5,
  pool: 0.34,
}; // paper lanterns: chance per wall face, the most in a room, radius, distance from the wall and height of one (m), the height of the arm it hangs from, the share that light the floor under them
const LANTERN_GLOW = { size: 1.8, opacity: 0.16 }; // the light of a lantern on the wall behind it
const CAULDRON = { chance: 0.3, max: 2, out: 1.0, r: 0.42, h: 0.55, legs: 0.3, sticks: 12, smoke: 3.0 }; // the incense cauldron (m)
const STAND = { chance: 0.28, out: [0.5, 1.0] as const, r: 0.12, h: 0.32, sticks: 6, smoke: 1.8 }; // a stand of joss sticks
const TABLE = { chance: 0.25, max: 3, out: [0.8, 1.1] as const, w: 1.0, d: 0.5, h: 0.78 }; // an offering table
const STOOL = { chance: 0.15, max: 6, out: [0.5, 1.2] as const, r: 0.17, h: 0.38 }; // a plastic stool
const NEON = { chance: 0.35, max: 4, w: 0.12, h: 1.8, out: 0.7, y: [4.4, 5.0] as const, size: 0.8 }; // a neon sign on its bracket
const LAUNDRY = { chance: 0.2, max: 3, out: 1.2, y: 4.9, w: 3.0, h: 1.15 }; // washing on a pole sticking out of the wall
const CABLE = { chance: 0.7, n: 3, y: 5.2, out: 0.12, r: 0.025, sag: 0.05 }; // cables sagging along a wall
const POOL_OPACITY = 0.2; // the light thrown on the floor: weak
const STOOL_COLORS = [0xb53a30, 0x2f5f9a, 0x3b8a62, 0xb53a30];
const CABLE_COLORS = [0x15120f, 0x241e1a, 0x3a3128];
const NEON_TUBES = [COLOR.neonPink, COLOR.neonMint, 0x6b685d]; // the last is a sign that is dead
const SMOKE_OPACITY = 0.45;

let shared: {
  lantern: THREE.CanvasTexture;
  smoke: THREE.CanvasTexture;
  neons: THREE.CanvasTexture[];
  washing: THREE.CanvasTexture;
} | null = null;
// a paper lantern's skin: red, ribbed, lighter where the flame is, a gold band at each end
const lanternTex = () =>
  canvasTex(64, 64, g => {
    const body = g.createRadialGradient(32, 32, 2, 32, 32, 34);
    body.addColorStop(0, '#f0643a');
    body.addColorStop(1, css(HALL_LANTERN));
    g.fillStyle = body;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(70,10,8,.4)';
    for (let x = 0; x < 64; x += 8) g.fillRect(x, 0, 1.5, 64);
    g.fillStyle = css(HALL_GOLD);
    g.fillRect(0, 0, 64, 8);
    g.fillRect(0, 56, 64, 8);
  });
// thin smoke: a few wavering threads, fading out at both ends
const smokeTex = () =>
  canvasTex(64, 256, g => {
    g.clearRect(0, 0, 64, 256);
    g.lineCap = 'round';
    for (let k = 0; k < 5; k++) {
      g.strokeStyle = `rgba(${(HALL_ASH >> 16) & 255},${(HALL_ASH >> 8) & 255},${HALL_ASH & 255},${0.3 + k * 0.08})`;
      g.lineWidth = 2 + k;
      g.beginPath();
      for (let y = 256; y >= 0; y -= 8)
        g.lineTo(32 + Math.sin(y / 30 + k * 1.7) * (4 + (256 - y) / 14) + (k - 2) * 3, y);
      g.stroke();
    }
    g.globalCompositeOperation = 'destination-in';
    const fade = g.createLinearGradient(0, 0, 0, 256);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(0.35, 'rgba(0,0,0,1)');
    fade.addColorStop(0.8, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,.2)');
    g.fillStyle = fade;
    g.fillRect(0, 0, 64, 256);
  });
// a neon sign read downward: two characters in a frame of tubes
const neonTex = (words: string, color: number, lit: boolean) =>
  canvasTex(80, 224, g => {
    g.fillStyle = '#0e0d0d';
    g.fillRect(0, 0, 80, 224);
    g.strokeStyle = css(color);
    g.shadowColor = lit ? css(color) : 'rgba(0,0,0,0)';
    g.shadowBlur = lit ? 10 : 0;
    g.lineWidth = 3;
    g.strokeRect(6, 6, 68, 212);
    g.font = `900 56px ${KWLN_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = css(color);
    [...words].forEach((ch, n) => g.fillText(ch, 40, 62 + n * 80));
  });

export function hallProps(plan: FloorPlan, tools: Pick<PropTools, 'add' | 'd' | 'pools'>, rng: Rng) {
  if (!plan.hall) return;
  shared ??= {
    lantern: lanternTex(),
    smoke: smokeTex(),
    neons: NEON_TUBES.map((color, n) => neonTex(KWLN_NEON_WORDS[(n * 3) % KWLN_NEON_WORDS.length]!, color, n < 2)),
    washing: washingTex(42),
  };
  const tex = shared,
    { add, d, pools } = tools,
    lights: Light[] = [],
    { open, pictureOf } = hallSurround(plan, d, wall =>
      wallPic(d, wall, KWLN_ALL_WALLS, KWLN_LANE_WALLS, undefined, KWLN_ROOM_WALLS),
    ),
    edges = open.filter(f => f.edge),
    shrines = edges.filter(f => KWLN_HALL_SHRINE_WALLS.includes(pictureOf(f))),
    signed = edges.filter(f => KWLN_HALL_SIGNED_WALLS.includes(pictureOf(f))),
    hanging = edges.filter(f => KWLN_HALL_HANGING_WALLS.includes(pictureOf(f))),
    flat = (color: number) => new THREE.MeshBasicMaterial({ color }),
    // (white: each copy has its own colour)
    tinted = new THREE.MeshBasicMaterial({ color: 0xffffff }),
    bronze = flat(HALL_BRONZE),
    iron = flat(0x2b2824),
    wood = flat(0x5a3f26),
    cloth = flat(HALL_LACQUER),
    ember = flat(HALL_CANDLE),
    stickMat = flat(HALL_STICK),
    smokeMat = new THREE.MeshBasicMaterial({
      map: tex.smoke,
      transparent: true,
      opacity: SMOKE_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    // a thing is stood a little out from its wall, at a height, along its wall
    spot = (
      f: (typeof edges)[number],
      off: number,
      out: number,
      y: number,
      turn = 0,
      scale = new THREE.Vector3(1, 1, 1),
      roll = 0,
    ) => pose(onWall(f, off, out, y), facing(f) + turn, scale, roll);

  // ---- paper lanterns on arms out of the walls ----
  const arms: THREE.Matrix4[] = [],
    cords: THREE.Matrix4[] = [],
    balls: THREE.Matrix4[] = [],
    caps: THREE.Matrix4[] = [],
    tassels: THREE.Matrix4[] = [],
    glows: THREE.Matrix4[] = [];
  for (const f of edges) {
    if (rng.next() >= LANTERN.chance) continue;
    for (let n = rng.randi(1, 2); n > 0 && balls.length < LANTERN.max; n--) {
      const off = rng.rand(-1.5, 1.5),
        out = rng.rand(LANTERN.out[0], LANTERN.out[1]),
        y = rng.rand(LANTERN.y[0], LANTERN.y[1]),
        cord = LANTERN.arm - y - LANTERN.r;
      arms.push(spot(f, off, out / 2, LANTERN.arm, 0, new THREE.Vector3(1, 1, out)));
      cords.push(spot(f, off, out, LANTERN.arm - cord / 2, 0, new THREE.Vector3(1, cord, 1)));
      balls.push(spot(f, off, out, y, 0, new THREE.Vector3(1, 0.85, 1)));
      for (const dy of [-1, 1]) caps.push(spot(f, off, out, y + dy * LANTERN.r * 0.8));
      tassels.push(spot(f, off, out, y - LANTERN.r - 0.12));
      glows.push(spot(f, off, 0.04, y));
      if (rng.next() < LANTERN.pool) {
        const at = onWall(f, off, out, 0);
        lights.push({ x: at.x, z: at.z, color: HALL_CANDLE, size: 0.5 });
      }
    }
  }
  add(new THREE.BoxGeometry(0.05, 0.05, 1), iron, arms);
  add(new THREE.BoxGeometry(0.012, 1, 0.012), iron, cords);
  add(new THREE.SphereGeometry(LANTERN.r, 12, 8), new THREE.MeshBasicMaterial({ map: tex.lantern }), balls);
  add(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 8), flat(HALL_GOLD), caps);
  add(new THREE.BoxGeometry(0.03, 0.2, 0.03), flat(HALL_GOLD), tassels);
  add(
    new THREE.PlaneGeometry(LANTERN_GLOW.size, LANTERN_GLOW.size),
    lightMat(poolTex(), LANTERN_GLOW.opacity, HALL_CANDLE),
    glows,
  );

  // ---- the incense cauldron, with its sticks and its smoke ----
  const bodies: THREE.Matrix4[] = [],
    legs: THREE.Matrix4[] = [],
    ears: THREE.Matrix4[] = [],
    sticks: THREE.Matrix4[] = [],
    tips: THREE.Matrix4[] = [],
    smokes: THREE.Matrix4[] = [];
  const burn = (
    f: (typeof edges)[number],
    off: number,
    out: number,
    y: number,
    r: number,
    n: number,
    len: number,
    smoke: number,
  ) => {
    for (let k = 0; k < n; k++) {
      const a = rng.rand(0, Math.PI * 2),
        rr = rng.rand(0, r),
        lean = rng.rand(-0.2, 0.2),
        at = onWall(f, off + Math.cos(a) * rr, out + Math.sin(a) * rr, y + len / 2);
      sticks.push(pose(at, facing(f), new THREE.Vector3(1, len, 1), lean));
      tips.push(pose(at.clone().setY(y + len), facing(f)));
    }
    for (const turn of [0, Math.PI / 2])
      smokes.push(spot(f, off, out, y + len + smoke / 2, turn, new THREE.Vector3(1, smoke, 1)));
  };
  for (const f of shrines) {
    if (bodies.length >= CAULDRON.max || rng.next() >= CAULDRON.chance) continue;
    const off = rng.rand(-0.8, 0.8),
      base = CAULDRON.legs;
    bodies.push(spot(f, off, CAULDRON.out, base + CAULDRON.h / 2));
    for (const [a, b] of [
      [-1, -1],
      [1, -1],
      [0, 1],
    ] as const)
      legs.push(spot(f, off + a * CAULDRON.r * 0.6, CAULDRON.out + b * CAULDRON.r * 0.5, base / 2));
    for (const a of [-1, 1]) ears.push(spot(f, off + a * CAULDRON.r, CAULDRON.out, base + CAULDRON.h + 0.1));
    burn(f, off, CAULDRON.out, base + CAULDRON.h, CAULDRON.r * 0.6, CAULDRON.sticks, 0.55, CAULDRON.smoke);
  }
  add(new THREE.CylinderGeometry(CAULDRON.r, CAULDRON.r * 0.7, CAULDRON.h, 12), bronze, bodies);
  add(new THREE.CylinderGeometry(0.05, 0.05, CAULDRON.legs, 6), bronze, legs);
  add(new THREE.BoxGeometry(0.07, 0.3, 0.07), bronze, ears);

  // ---- stands of joss sticks ----
  const pots: THREE.Matrix4[] = [];
  for (const f of shrines) {
    if (rng.next() >= STAND.chance) continue;
    const off = rng.rand(-1.4, 1.4),
      out = rng.rand(STAND.out[0], STAND.out[1]);
    pots.push(spot(f, off, out, STAND.h / 2));
    burn(f, off, out, STAND.h, STAND.r * 0.7, STAND.sticks, 0.6, STAND.smoke);
  }
  add(new THREE.CylinderGeometry(STAND.r, STAND.r * 0.8, STAND.h, 8), bronze, pots);
  add(new THREE.CylinderGeometry(0.008, 0.008, 1, 4), stickMat, sticks);
  add(new THREE.BoxGeometry(0.03, 0.03, 0.03), ember, tips);
  add(new THREE.PlaneGeometry(0.7, 1), smokeMat, smokes);

  // ---- offering tables: red cloth, oranges on a plate, two candles ----
  const tops: THREE.Matrix4[] = [],
    tableLegs: THREE.Matrix4[] = [],
    cloths: THREE.Matrix4[] = [],
    oranges: THREE.Matrix4[] = [],
    plates: THREE.Matrix4[] = [],
    candles: THREE.Matrix4[] = [],
    flames: THREE.Matrix4[] = [];
  for (const f of shrines) {
    if (tops.length >= TABLE.max || rng.next() >= TABLE.chance) continue;
    const off = rng.rand(-1.2, 1.2),
      out = rng.rand(TABLE.out[0], TABLE.out[1]);
    tops.push(spot(f, off, out, TABLE.h));
    cloths.push(spot(f, off, out, TABLE.h + 0.04));
    for (const a of [-1, 1])
      for (const b of [-1, 1])
        tableLegs.push(spot(f, off + a * (TABLE.w / 2 - 0.05), out + b * (TABLE.d / 2 - 0.05), TABLE.h / 2));
    plates.push(spot(f, off, out, TABLE.h + 0.07));
    for (const [a, b] of [
      [-0.06, 0],
      [0.06, 0.03],
      [0, -0.05],
    ] as const)
      oranges.push(spot(f, off + a, out + b, TABLE.h + 0.13));
    for (const a of [-1, 1]) {
      candles.push(spot(f, off + a * 0.38, out, TABLE.h + 0.14));
      flames.push(spot(f, off + a * 0.38, out, TABLE.h + 0.25));
    }
  }
  add(new THREE.BoxGeometry(TABLE.w, 0.05, TABLE.d), wood, tops);
  add(new THREE.BoxGeometry(TABLE.w + 0.06, 0.02, TABLE.d * 0.6), cloth, cloths);
  add(new THREE.BoxGeometry(0.06, TABLE.h, 0.06), wood, tableLegs);
  add(new THREE.CylinderGeometry(0.14, 0.12, 0.02, 10), flat(HALL_PLATE), plates);
  add(new THREE.SphereGeometry(0.06, 8, 6), flat(HALL_ORANGE), oranges);
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 6), flat(HALL_WAX), candles);
  add(new THREE.BoxGeometry(0.03, 0.05, 0.03), flat(HALL_FLAME), flames);

  // ---- plastic stools, in twos and threes ----
  const stools: THREE.Matrix4[] = [],
    stoolColors: number[] = [];
  for (const f of edges) {
    if (stools.length >= STOOL.max || rng.next() >= STOOL.chance) continue;
    const off = rng.rand(-1.2, 1.2),
      out = rng.rand(STOOL.out[0], STOOL.out[1]);
    for (let n = rng.randi(1, 3); n > 0; n--) {
      stools.push(spot(f, off + rng.rand(-0.5, 0.5), out + rng.rand(-0.2, 0.2), STOOL.h / 2));
      stoolColors.push(rng.pick(STOOL_COLORS));
    }
  }
  add(new THREE.CylinderGeometry(STOOL.r, STOOL.r * 0.85, STOOL.h, 10), tinted, stools, stoolColors);

  // ---- neon signs on brackets, high on the walls of the flats and shops ----
  const neons: THREE.Matrix4[][] = tex.neons.map(() => []),
    brackets: THREE.Matrix4[] = [];
  let signs = 0;
  for (const f of signed) {
    if (signs >= NEON.max || rng.next() >= NEON.chance) continue;
    const off = rng.rand(-1.2, 1.2),
      v = rng.randi(0, tex.neons.length - 1),
      y = rng.rand(NEON.y[0], NEON.y[1]);
    neons[v]!.push(spot(f, off, NEON.out / 2 + 0.05, y));
    brackets.push(spot(f, off, 0.15, y, 0, new THREE.Vector3(1, 1, 0.3)));
    if (v < 2) {
      const at = onWall(f, off, NEON.out, 0);
      lights.push({ x: at.x, z: at.z, color: NEON_TUBES[v]!, size: NEON.size });
    }
    signs++;
  }
  tex.neons.forEach((map, v) => {
    const lit = new THREE.MeshBasicMaterial({ map }),
      edge = flat(0x16141b);
    add(new THREE.BoxGeometry(NEON.w, NEON.h, NEON.out), [lit, lit, edge, edge, edge, edge], neons[v]!);
  });
  add(new THREE.BoxGeometry(0.08, 0.08, 1), iron, brackets);

  // ---- washing on poles sticking out of the walls, high up ----
  const poles: THREE.Matrix4[] = [],
    lines: THREE.Matrix4[] = [],
    washes: THREE.Matrix4[] = [];
  for (const f of hanging) {
    if (washes.length >= LAUNDRY.max || rng.next() >= LAUNDRY.chance) continue;
    const off = rng.rand(-0.4, 0.4);
    for (const a of [-1, 1])
      poles.push(
        spot(f, off + a * (LAUNDRY.w / 2 - 0.1), LAUNDRY.out / 2, LAUNDRY.y, 0, new THREE.Vector3(1, 1, LAUNDRY.out)),
      );
    lines.push(spot(f, off, LAUNDRY.out, LAUNDRY.y));
    washes.push(spot(f, off, LAUNDRY.out, LAUNDRY.y - LAUNDRY.h / 2 + 0.05));
  }
  add(new THREE.BoxGeometry(0.05, 0.05, 1), wood, poles);
  add(new THREE.BoxGeometry(LAUNDRY.w, 0.04, 0.04), wood, lines);
  add(
    new THREE.PlaneGeometry(LAUNDRY.w, LAUNDRY.h),
    new THREE.MeshBasicMaterial({ map: tex.washing, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }),
    washes,
  );

  // ---- cables sagging along the walls, near the ceiling of the walls ----
  const cables: THREE.Matrix4[] = [],
    cableColors: number[] = [];
  for (const f of edges) {
    if (rng.next() >= CABLE.chance) continue;
    const y = rng.rand(CABLE.y, CABLE.y + 0.5);
    for (let k = 0; k < CABLE.n; k++) {
      const color = rng.pick(CABLE_COLORS),
        sag = CABLE.sag * rng.rand(0.6, 1.6);
      for (const half of [-1, 1]) {
        cables.push(
          spot(
            f,
            half * (T / 4),
            CABLE.out + k * 0.07,
            y - sag * 0.5 + k * 0.05,
            0,
            new THREE.Vector3(CABLE.r, 1, CABLE.r),
            Math.PI / 2 + half * sag,
          ),
        );
        cableColors.push(color);
      }
    }
  }
  add(new THREE.CylinderGeometry(1, 1, T / 2, 5), tinted, cables, cableColors);
  pools(lights, POOL_OPACITY);
}
