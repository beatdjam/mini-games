// The fortress's wall piece (SB-2052): 12 m long, 12 m high, 6 m thick, as it stands in PROP_SIZE.fortWall. It is one
// vertex-coloured shape, so the twenty pieces of the fortress are one instanced mesh. The colours are multipliers of the
// concrete's own grey (1 = the concrete), the way the pillbox's are.
//
// What is on it, on the sea face (+z) and the yard face (-z) alike: a bevelled plinth; a body 5 m thick with a string
// course under the top; two tapering buttresses with hazard stripes on their feet; a parapet of merlons along both edges
// of the walkway; two loopholes cut into the body with steel frames and visors; formwork panels, pour lines, tie holes and
// joints; shell scars with rebar left sticking out, cracks, soot, rain streaks and rust; floodlights; and, on the yard
// face, a ladder with a safety cage. The hit box does not move: the shape stays inside x 12, y 12 and z 6.
import * as THREE from 'three';
import { DEFENSE_COLOR, FORT_COLOR } from '../data/colors.ts';
import { createKit, type Face, type V } from './modelKit.ts';

const LENGTH = 6; // half the length (m)
const BODY = 2.5; // half the body's thickness: the buttresses, the plinth and the merlons make up the rest of 3 m
const TOP = 11; // the walkway's height
const TOP_OUT = 12; // the merlons' top
const PLINTH = 0.8;
const BUTTRESS_U = 3.6; // where the buttresses stand along a face (m from the middle)
const LOOPHOLE = { u: 1.5, v: 7.2, w: 1.3, h: 0.55 }; // the centre of each loophole (the two stand at +-u)
const LADDER_X = 4.9;

interface Hole {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export function fortWallGeometry(): THREE.BufferGeometry {
  const k = createKit(2052);
  const { range, pick, hex, shade, box, bevelBox, rod, loft, prism, sheet, decal, slab, ring } = k;
  const concrete = () => hex(0xffffff, 1);
  const dirt = (f: number) => hex(0xffffff, f);
  const steel = hex(FORT_COLOR.steel);
  const steelLight = hex(FORT_COLOR.steelLight, 1.3);
  const dark = hex(FORT_COLOR.dark);
  const murk = hex(FORT_COLOR.murk);
  const gloom = hex(FORT_COLOR.gloom);
  const groove = hex(FORT_COLOR.groove);
  const tie = hex(FORT_COLOR.tieHole);

  // ---- the body ----
  bevelBox(-LENGTH, LENGTH, 0, PLINTH + 0.25, -3, 3, 0.22, dirt(0.9)); // the plinth
  // the core, and the skin each side of it, cut at the loopholes
  box(-LENGTH, LENGTH, PLINTH, TOP, -1.2, 1.2, concrete());
  const holes: Hole[] = [-1, 1].map(s => ({
    x0: s * LOOPHOLE.u - LOOPHOLE.w / 2,
    x1: s * LOOPHOLE.u + LOOPHOLE.w / 2,
    y0: LOOPHOLE.v - LOOPHOLE.h / 2,
    y1: LOOPHOLE.v + LOOPHOLE.h / 2,
  }));
  const [left, right] = holes;
  for (const s of [-1, 1]) {
    const [z0, z1] = s > 0 ? [1.2, BODY] : [-BODY, -1.2];
    box(-LENGTH, left.x0, PLINTH, TOP, z0, z1, concrete());
    box(left.x1, right.x0, PLINTH, TOP, z0, z1, concrete());
    box(right.x1, LENGTH, PLINTH, TOP, z0, z1, concrete());
    for (const hole of holes) {
      box(hole.x0, hole.x1, PLINTH, hole.y0, z0, z1, concrete());
      box(hole.x0, hole.x1, hole.y1, TOP, z0, z1, concrete());
    }
  }
  // the string course under the walkway, a coping on the cut of the top, and the sloped foot of the body
  for (const s of [-1, 1]) {
    bevelBox(-LENGTH, LENGTH, TOP - 0.55, TOP, s * 2.2, s * 2.8, 0.2, dirt(0.95));
    bevelBox(-LENGTH, LENGTH, PLINTH + 0.25, PLINTH + 0.7, s * 2.55, s * 2.95, 0.15, dirt(0.88));
  }

  // faces: u runs to the right of someone looking at it
  const outer = k.face([0, 0, BODY], [1, 0, 0], [0, 0, 1]);
  const inner = k.face([0, 0, -BODY], [-1, 0, 0], [0, 0, -1]);
  const faces: [number, Face][] = [
    [1, outer],
    [-1, inner],
  ];
  // what is already on a face, as rects (u0, u1, v0, v1), so the dressing keeps clear of it
  const taken: Record<number, [number, number, number, number][]> = { 1: [], [-1]: [] };
  const free = (s: number, u: number, v: number, pad = 0.1): boolean =>
    u > -LENGTH + 0.15 &&
    u < LENGTH - 0.15 &&
    v > PLINTH + 0.4 &&
    v < TOP - 0.7 &&
    !taken[s].some(([u0, u1, v0, v1]) => u > u0 - pad && u < u1 + pad && v > v0 - pad && v < v1 + pad);
  for (const s of [-1, 1]) {
    for (const u of [-BUTTRESS_U, BUTTRESS_U]) taken[s].push([u - 0.55, u + 0.55, 0, TOP]);
    for (const u of [-LOOPHOLE.u, LOOPHOLE.u]) taken[s].push([u - 1.2, u + 1.2, LOOPHOLE.v - 1.0, LOOPHOLE.v + 0.9]); // the loophole and its soot
    taken[s].push([-LENGTH, -LENGTH + 0.2, 0, TOP], [LENGTH - 0.2, LENGTH, 0, TOP]);
  }
  taken[-1].push([-LADDER_X - 0.6, -LADDER_X + 0.6, 0, TOP + 1]); // the ladder (u is mirrored on the yard face)
  for (const s of [-1, 1]) taken[s].push([-2.9, -1.9, 9.2, 10.4], [1.9, 2.9, 9.2, 10.4]); // the floodlights

  // ---- the loopholes: a recess cut through the skin, a steel frame and a visor ----
  for (const [s] of faces) {
    for (const hole of holes) {
      const zFace = s * BODY;
      const zBack = s * 1.2;
      // the back of the recess, then the floor, the ceiling and the sides, darker the deeper they go
      sheet(
        [
          [hole.x0, hole.y0, zBack + s * 0.01],
          [hole.x1, hole.y0, zBack + s * 0.01],
          [hole.x1, hole.y1, zBack + s * 0.01],
          [hole.x0, hole.y1, zBack + s * 0.01],
        ],
        [0, 0, s],
        dark,
      );
      const mid = (zBack + zFace) / 2;
      for (const [za, zb, color] of [
        [zBack, mid, murk],
        [mid, zFace, gloom],
      ] as const) {
        const [a, b] = za < zb ? [za, zb] : [zb, za];
        sheet(
          [
            [hole.x0, hole.y0 + 0.01, a],
            [hole.x1, hole.y0 + 0.01, a],
            [hole.x1, hole.y0 + 0.01, b],
            [hole.x0, hole.y0 + 0.01, b],
          ],
          [0, 1, 0],
          color,
        );
        sheet(
          [
            [hole.x0, hole.y1 - 0.01, a],
            [hole.x1, hole.y1 - 0.01, a],
            [hole.x1, hole.y1 - 0.01, b],
            [hole.x0, hole.y1 - 0.01, b],
          ],
          [0, -1, 0],
          color,
        );
        for (const sx of [-1, 1]) {
          const x = sx > 0 ? hole.x1 - 0.01 : hole.x0 + 0.01;
          sheet(
            [
              [x, hole.y0, a],
              [x, hole.y1, a],
              [x, hole.y1, b],
              [x, hole.y0, b],
            ],
            [-sx, 0, 0],
            color,
          );
        }
      }
      // the frame, and a visor sloping out over it with rivets
      const t = 0.18;
      const fz = s > 0 ? [zFace, zFace + 0.14] : [zFace - 0.14, zFace];
      box(hole.x0 - t, hole.x1 + t, hole.y1, hole.y1 + t, fz[0], fz[1], steel);
      box(hole.x0 - t, hole.x1 + t, hole.y0 - t, hole.y0, fz[0], fz[1], steel);
      box(hole.x0 - t, hole.x0, hole.y0, hole.y1, fz[0], fz[1], steel);
      box(hole.x1, hole.x1 + t, hole.y0, hole.y1, fz[0], fz[1], steel);
      const near = zFace + s * 0.14;
      const far = zFace + s * 0.48;
      prism(
        [
          [hole.x0 - 0.3, hole.y1 + t, near],
          [hole.x1 + 0.3, hole.y1 + t, near],
          [hole.x1 + 0.3, hole.y1 + t - 0.12, far],
          [hole.x0 - 0.3, hole.y1 + t - 0.12, far],
        ],
        [
          [hole.x0 - 0.3, hole.y1 + t + 0.14, near],
          [hole.x1 + 0.3, hole.y1 + t + 0.14, near],
          [hole.x1 + 0.3, hole.y1 + t + 0.02, far],
          [hole.x0 - 0.3, hole.y1 + t + 0.02, far],
        ],
        steel,
      );
      for (let i = 0; i < 3; i++) {
        const x = hole.x0 - 0.15 + (i * (hole.x1 - hole.x0 + 0.3)) / 2;
        box(x - 0.04, x + 0.04, hole.y1 + t + 0.15, hole.y1 + t + 0.21, near - 0.04, near + 0.04, steelLight);
      }
      // a bar across the opening, set deep
      const xm = (hole.x0 + hole.x1) / 2;
      box(xm - 0.025, xm + 0.025, hole.y0, hole.y1, mid - 0.025, mid + 0.025, steel);
    }
  }

  // ---- the buttresses, tapering, with a capital and hazard stripes on the foot ----
  for (const [s] of faces) {
    for (const sx of [-1, 1]) {
      const xc = sx * BUTTRESS_U;
      const section = (y: number, out: number, half: number): V[] => {
        const z0 = s * (BODY - 0.1);
        const z1 = s * out;
        return [
          [xc - half, y, z0],
          [xc + half, y, z0],
          [xc + half, y, z1],
          [xc - half, y, z1],
        ];
      };
      loft(
        [section(PLINTH, 3, 0.5), section(2.4, 3, 0.5), section(6.2, 2.86, 0.43), section(10.1, 2.7, 0.38)],
        dirt(0.97),
      );
      // the capital
      loft(
        [section(10.1, 2.9, 0.55), section(10.2, 2.95, 0.55), section(10.6, 2.95, 0.55), section(10.75, 2.8, 0.45)],
        dirt(0.93),
      );
      // hazard stripes on the foot, slanting
      const fa = k.face([0, 0, s * 3], [s, 0, 0], [0, 0, s]);
      const u = s * xc;
      for (let i = 0; i < 6; i++) {
        const v0 = 1.05 + i * 0.22;
        const color = i % 2 === 0 ? hex(FORT_COLOR.hazardYellow) : hex(FORT_COLOR.hazardBlack);
        decal(
          fa,
          [
            [u - 0.5, v0],
            [u + 0.5, v0 + 0.12],
            [u + 0.5, v0 + 0.34],
            [u - 0.5, v0 + 0.22],
          ],
          0.012,
          color,
        );
      }
      // a bolted base plate
      box(xc - 0.62, xc + 0.62, PLINTH + 0.25, PLINTH + 0.4, s > 0 ? 2.4 : -3, s > 0 ? 3 : -2.4, steel);
    }
  }

  // ---- the parapet: merlons along both edges of the walkway, and the coping seams on the top ----
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const x = -4.8 + i * 2.4;
      const [z0, z1] = s > 0 ? [2.25, 2.85] : [-2.85, -2.25];
      loft(
        [
          [
            [x - 0.75, TOP, z0],
            [x + 0.75, TOP, z0],
            [x + 0.75, TOP, z1],
            [x - 0.75, TOP, z1],
          ],
          [
            [x - 0.75, TOP_OUT - 0.18, z0],
            [x + 0.75, TOP_OUT - 0.18, z0],
            [x + 0.75, TOP_OUT - 0.18, z1],
            [x - 0.75, TOP_OUT - 0.18, z1],
          ],
          [
            [x - 0.6, TOP_OUT, z0 + 0.08 * s],
            [x + 0.6, TOP_OUT, z0 + 0.08 * s],
            [x + 0.6, TOP_OUT, z1 - 0.08 * s],
            [x - 0.6, TOP_OUT, z1 - 0.08 * s],
          ],
        ],
        dirt(range(0.9, 1)),
      );
      // a firing step notch in the merlon's face: a dark slit
      const slit = k.face([0, 0, s * z1], [s, 0, 0], [0, 0, s]);
      decal(
        slit,
        [
          [s * x - 0.08, 11.25],
          [s * x + 0.08, 11.25],
          [s * x + 0.08, 11.85],
          [s * x - 0.08, 11.85],
        ],
        0.012,
        murk,
      );
    }
    // a gutter spout in the string course between the merlons, and the dark of its stain below
    for (const x of [-3.6, 1.2, 3.6]) {
      box(x - 0.1, x + 0.1, TOP - 0.2, TOP - 0.05, s * 2.8 - 0.1, s * 2.8 + 0.1 + s * 0.12, steel);
    }
  }
  // seams across the walkway, and the dark of drains
  const walk = (x0: number, x1: number, z0: number, z1: number, color: THREE.Color) =>
    sheet(
      [
        [x0, TOP + 0.012, z0],
        [x1, TOP + 0.012, z0],
        [x1, TOP + 0.012, z1],
        [x0, TOP + 0.012, z1],
      ],
      [0, 1, 0],
      color,
    );
  for (let x = -5.4; x < 5.5; x += 1.2) walk(x - 0.025, x + 0.025, -2.25, 2.25, groove);
  walk(-5.9, 5.9, -0.03, 0.03, groove);
  for (const x of [-4.2, 2.1]) walk(x - 0.2, x + 0.2, -0.4, 0.4, tie);

  // ---- both faces: panels, pour lines, joints, tie holes, scars, cracks, soot, streaks ----
  for (const [s, face] of faces) {
    // formwork panels: slabs a hair proud of the body, each a little lighter or darker
    for (let n = 0, placed = 0; n < 90 && placed < 15; n++) {
      const w = range(0.9, 1.9);
      const h = range(0.5, 1.2);
      const u = range(-LENGTH + 0.3 + w / 2, LENGTH - 0.3 - w / 2);
      const v = range(PLINTH + 0.5 + h / 2, TOP - 0.8 - h / 2);
      const ok = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].every(([a, b]) => free(s, u + (a * w) / 2, v + (b * h) / 2, 0.08));
      if (!ok) continue;
      slab(face, u - w / 2, u + w / 2, v - h / 2, v + h / 2, range(0.025, 0.06), dirt(range(0.82, 1)));
      taken[s].push([u - w / 2, u + w / 2, v - h / 2, v + h / 2]);
      placed++;
    }
    // pour lines: grooves along the whole length, a few breaks
    for (const v of [3.3, 5.6, 9.0]) {
      for (let u = -LENGTH + 0.1; u < LENGTH - 1.2; u += 1.5) {
        if (rand01(k) < 0.1) continue;
        if (!free(s, u + 0.7, v, 0.04) && !(Math.abs(Math.abs(u + 0.7) - BUTTRESS_U) < 1)) continue;
        decal(
          face,
          [
            [u, v - 0.02],
            [Math.min(u + 1.5, LENGTH - 0.1), v - 0.02],
            [Math.min(u + 1.5, LENGTH - 0.1), v + 0.02],
            [u, v + 0.02],
          ],
          0.085,
          groove,
        );
      }
    }
    // joints between the pieces at both ends, and a formwork joint in the middle
    for (const u of [-LENGTH + 0.08, LENGTH - 0.08, 0]) {
      decal(
        face,
        [
          [u - 0.03, PLINTH + 0.4],
          [u + 0.03, PLINTH + 0.4],
          [u + 0.03, TOP - 0.6],
          [u - 0.03, TOP - 0.6],
        ],
        0.09,
        groove,
      );
    }
    // tie holes in rows
    for (const [row, v] of [1.9, 4.5, 7.7, 9.9].entries()) {
      for (let u = -5.2 + (row % 2) * 0.75; u < LENGTH - 0.4; u += 1.5) {
        if (!free(s, u, v, 0.12)) continue;
        decal(
          face,
          [
            [u - 0.05, v - 0.05],
            [u + 0.05, v - 0.05],
            [u + 0.05, v + 0.05],
            [u - 0.05, v + 0.05],
          ],
          0.09,
          tie,
        );
      }
    }
    // soot over each loophole: a fan in two steps
    for (const hu of [-LOOPHOLE.u, LOOPHOLE.u]) {
      const top = LOOPHOLE.v + LOOPHOLE.h / 2 + 0.4;
      decal(
        face,
        [
          [hu - 0.8, top],
          [hu + 0.8, top],
          [hu + 0.5, top + 0.7],
          [hu - 0.5, top + 0.7],
        ],
        0.02,
        hex(0xffffff, 0.6),
      );
      decal(
        face,
        [
          [hu - 0.5, top + 0.7],
          [hu + 0.5, top + 0.7],
          [hu + 0.25, top + 1.3],
          [hu - 0.25, top + 1.3],
        ],
        0.02,
        hex(0xffffff, 0.75),
      );
      // rust running from the frame
      decal(
        face,
        [
          [hu - 0.6, LOOPHOLE.v - LOOPHOLE.h / 2 - 0.2],
          [hu - 0.45, LOOPHOLE.v - LOOPHOLE.h / 2 - 0.2],
          [hu - 0.42, LOOPHOLE.v - 1.6],
          [hu - 0.58, LOOPHOLE.v - 1.4],
        ],
        0.07,
        hex(FORT_COLOR.rust, 0.85),
      );
    }
    // shell scars: a dark ragged patch, a darker heart and a spray of streaks; some with rebar left sticking out
    const scars: [number, number, number, boolean][] = [
      [range(-4.9, -4.3), range(5.3, 6.1), range(0.5, 0.7), true],
      [range(-0.4, 0.5), range(2.4, 3.0), range(0.4, 0.6), false],
      [range(4.3, 4.8), range(8.1, 9.0), range(0.5, 0.7), true],
      [range(2.4, 3.0), range(4.8, 5.4), range(0.3, 0.45), false],
    ];
    for (const [u, v, r, rebarOut] of scars) {
      if (!free(s, u, v, r * 0.6)) continue;
      const points: [number, number][] = Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const j = range(0.65, 1.25);
        return [u + Math.cos(angle) * r * j, v + Math.sin(angle) * r * j * 0.85] as [number, number];
      });
      decal(face, points, 0.07, hex(FORT_COLOR.scarRim));
      decal(
        face,
        points.map(([pu, pv]) => [u + (pu - u) * 0.55, v + (pv - v) * 0.55] as [number, number]),
        0.095,
        tie,
      );
      // scorch streaks thrown out from the hit
      for (let b = 0; b < 5; b++) {
        const a = range(0, Math.PI * 2);
        const len = range(r * 1.1, r * 2.2);
        const w = range(0.03, 0.07);
        decal(
          face,
          [
            [u + Math.cos(a) * r * 0.9 - w * Math.sin(a), v + Math.sin(a) * r * 0.9 + w * Math.cos(a)],
            [u + Math.cos(a) * r * 0.9 + w * Math.sin(a), v + Math.sin(a) * r * 0.9 - w * Math.cos(a)],
            [
              Math.max(-LENGTH + 0.1, Math.min(LENGTH - 0.1, u + Math.cos(a) * (r + len))),
              Math.max(PLINTH + 0.4, Math.min(TOP - 0.7, v + Math.sin(a) * (r + len))),
            ],
          ],
          0.06,
          hex(FORT_COLOR.murk, 1.3),
        );
      }
      taken[s].push([u - r * 1.3, u + r * 1.3, v - r * 1.1, v + r * 1.1]);
      if (!rebarOut) continue;
      for (let b = 0; b < 3; b++) {
        const a = face.at(u + range(-r * 0.5, r * 0.5), v + range(-r * 0.3, r * 0.3), 0.07);
        const out = range(0.25, 0.38);
        const bend = range(-0.15, 0.15);
        const mid: V = [a[0] + bend, a[1] + range(0.04, 0.12), a[2] + s * out * 0.6];
        const end: V = [mid[0] + bend, mid[1] - range(0.05, 0.2), mid[2] + s * out * 0.4];
        const bar = hex(DEFENSE_COLOR.rebar, 0.85);
        rod(a, mid, 0.03, 0.03, 4, bar);
        rod(mid, end, 0.03, 0.025, 4, bar);
      }
    }
    // cracks: a walk with a branch or two
    for (let n = 0; n < 6; n++) {
      crackWalk(
        k,
        face,
        s,
        range(-5.2, 5.2),
        range(5, 10.2),
        3 + Math.floor(range(0, 4)),
        range(-0.5, 0.5),
        range(0.025, 0.05),
        free,
      );
    }
    // rain streaks from the string course, light and dark
    for (let n = 0; n < 12; n++) {
      const u = range(-5.6, 5.6);
      const length = range(0.8, 3.4);
      const w = range(0.05, 0.16);
      const top = TOP - 0.62;
      if (!free(s, u, top - length / 2, 0.1) || !free(s, u, top - length, 0.1)) continue;
      decal(
        face,
        [
          [u - w, top],
          [u + w, top],
          [u + w * 0.5, top - length],
          [u - w * 0.5, top - length],
        ],
        0.075,
        rand01(k) < 0.35 ? hex(FORT_COLOR.streakLight) : hex(DEFENSE_COLOR.pillboxStain, 0.8),
      );
    }
    // the dark band along the foot where the ground splashes up
    decal(
      face,
      [
        [-LENGTH, PLINTH + 0.7],
        [LENGTH, PLINTH + 0.7],
        [LENGTH, PLINTH + 0.4],
        [-LENGTH, PLINTH + 0.4],
      ],
      0.05,
      hex(FORT_COLOR.footBand),
    );
  }

  // ---- floodlights under the string course, one at each side of the loopholes ----
  for (const [s] of faces) {
    for (const sx of [-1, 1]) {
      const x = sx * 2.4;
      const z = s * BODY;
      box(x - 0.08, x + 0.08, 9.5, 9.8, z + s * 0, z + s * 0.28, steel); // the bracket
      // the lamp head: a box with a hood and a glass front tilted down
      const head = (y0: number, y1: number, d0: number, d1: number) =>
        prism(
          [
            [x - 0.38, y0, z + s * d0],
            [x + 0.38, y0, z + s * d0],
            [x + 0.38, y0, z + s * d1],
            [x - 0.38, y0, z + s * d1],
          ],
          [
            [x - 0.38, y1, z + s * d0],
            [x + 0.38, y1, z + s * d0],
            [x + 0.38, y1, z + s * (d1 - 0.1)],
            [x - 0.38, y1, z + s * (d1 - 0.1)],
          ],
          steel,
        );
      head(9.25, 9.85, 0.25, 0.46);
      sheet(
        [
          [x - 0.3, 9.32, z + s * 0.47],
          [x + 0.3, 9.32, z + s * 0.47],
          [x + 0.3, 9.76, z + s * 0.43],
          [x - 0.3, 9.76, z + s * 0.43],
        ],
        [0, 0, s],
        hex(FORT_COLOR.lens),
      );
      // the cable down the wall
      rod([x + 0.25, 9.3, z + s * 0.1], [x + 0.25, 8.2, z + s * 0.05], 0.035, 0.035, 5, hex(0x3c3a36));
    }
  }

  // ---- the ladder on the yard face, with its cage ----
  {
    const s = -1;
    const x0 = LADDER_X - 0.3;
    const x1 = LADDER_X + 0.3;
    const zf = s * BODY;
    for (const x of [x0, x1]) {
      box(x - 0.035, x + 0.035, PLINTH + 0.3, TOP_OUT - 0.1, zf - 0.28, zf - 0.2, steelLight); // the rails
      for (const y of [2.0, 5.0, 8.0, 10.6]) box(x - 0.04, x + 0.04, y - 0.05, y + 0.05, zf - 0.24, zf, steel); // the brackets
    }
    for (let y = 1.25; y < TOP_OUT - 0.3; y += 0.5) box(x0, x1, y - 0.025, y + 0.025, zf - 0.26, zf - 0.22, steelLight);
    // the cage: four hoops from 3.4 m up, with two straps down the back
    for (const y of [3.4, 5.6, 7.8, 10.0]) {
      box(x0 - 0.14, x0 - 0.1, y - 0.03, y + 0.03, zf - 0.46, zf - 0.28, steel);
      box(x1 + 0.1, x1 + 0.14, y - 0.03, y + 0.03, zf - 0.46, zf - 0.28, steel);
      box(x0 - 0.14, x1 + 0.14, y - 0.03, y + 0.03, zf - 0.48, zf - 0.44, steel);
    }
    for (const x of [x0 - 0.12, x1 + 0.12]) box(x - 0.025, x + 0.025, 3.4, 10.0, zf - 0.5, zf - 0.46, steel);
    // a landing at the top, over the string course, and a warning plate at the foot
    box(x0 - 0.2, x1 + 0.2, TOP - 0.1, TOP + 0.03, zf - 0.46, zf - 0.2, steel);
    decal(
      k.face([0, 0, zf], [-1, 0, 0], [0, 0, -1]),
      [
        [-LADDER_X + 0.45, 1.0],
        [-LADDER_X - 0.45, 1.0],
        [-LADDER_X - 0.45, 1.3],
        [-LADDER_X + 0.45, 1.3],
      ],
      0.025,
      hex(FORT_COLOR.hazardYellow),
    );
  }

  // ---- loose rubble where the chips fell, at the foot of both faces ----
  for (let n = 0; n < 12; n++) {
    const s = n % 2 === 0 ? 1 : -1;
    const size = range(0.12, 0.3);
    k.turned(
      [range(-5.5, 5.5), PLINTH + 0.25 + size * 0.3, s * range(2.6, 2.75)],
      [size * range(0.8, 1.4), size * range(0.5, 0.9), size * range(0.8, 1.3)],
      range(0, Math.PI),
      range(-0.4, 0.4),
      dirt(range(0.6, 0.9)),
    );
  }
  void ring;
  void pick;
  void shade;

  k.darken(0, 2.2, 0.72);
  return k.geometry();
}

function rand01(k: { rand: () => number }): number {
  return k.rand();
}

// A crack: a walk down a face, each segment a thin strip, with a branch now and then.
function crackWalk(
  k: ReturnType<typeof createKit>,
  face: Face,
  s: number,
  startU: number,
  startV: number,
  steps: number,
  lean: number,
  width: number,
  free: (s: number, u: number, v: number, pad?: number) => boolean,
  branch = true,
): void {
  const crack = k.hex(DEFENSE_COLOR.crack);
  let u = startU;
  let v = startV;
  let angle = Math.PI / 2 + lean;
  for (let i = 0; i < steps; i++) {
    angle += k.range(-0.5, 0.5);
    const length = k.range(0.25, 0.6);
    const nu = u + Math.cos(angle) * length;
    const nv = v - Math.sin(angle) * length;
    if (!free(s, nu, nv, 0.08)) return;
    const w = width * (1 - i / (steps + 2));
    k.decal(
      face,
      [
        [u - w, v],
        [u + w, v],
        [nu + w * 0.6, nv],
        [nu - w * 0.6, nv],
      ],
      0.1,
      crack,
    );
    if (branch && i > 0 && k.rand() < 0.35)
      crackWalk(k, face, s, u, v, 2 + Math.floor(k.rand() * 2), lean + k.range(-1, 1), width * 0.6, free, false);
    u = nu;
    v = nv;
  }
}
