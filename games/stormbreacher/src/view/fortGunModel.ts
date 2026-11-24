// The fortress's heavy machine-gun nest (SB-2052): 16 m wide, 10 m high and 6 m deep as TARGET_SIZE.fortressGun, its
// guns pointing seaward (+z), standing on the wall's top. One vertex-coloured shape, so the nest is one draw. The colours
// are multipliers of the target's own concrete grey (the same split as the pillbox: grey for the body, near-black for
// metal, red and white blocks for the target's mark).
//
// What is on it: a bevelled deck with a red and white lip; an armoured pedestal with sloped sides and wings (an ammunition
// locker, a generator with its grille and exhaust); a turret ring and drum under an eight-sided housing with a roof, a
// hatch, a searchlight and a mast; a gun shield of five plates with two ports and a sleeve in each; the twin guns, each a
// receiver, a recoil sleeve, a jacket with cooling bands and a barrel with a muzzle brake; belts of cartridges that hang
// from the ammunition boxes to the receivers, and the casings under them; the gunner's hood on the back with its
// vision slits and a ladder up to it; rivets along every edge; sandbags at the deck's ends; scorch and rust.
// The muzzles (at 0.7 of the box's height, past the seaward face) and the box do not move.
import * as THREE from 'three';
import { DEFENSE_COLOR, FORT_COLOR } from '../data/colors.ts';
import { createKit, type V } from './modelKit.ts';

const HALF_W = 8;
const HALF_D = 3;
const HEIGHT = 10;
const DECK = 0.9; // the deck's top
const GUN_Y = 7; // the guns' height: 0.7 of the box's top, where FORTRESS_GUN_TUNE.muzzle puts a shot
const GUN_X = 1.4; // each gun's distance from the middle
const SHIELD_Z = 0.4; // the shield's rear face
const SHIELD_T = 0.45;
const RIVET = 0.045; // half a rivet's side

export function fortGunGeometry(): THREE.BufferGeometry {
  const k = createKit(2052052);
  const { range, hex, box, bevelBox, rod, loft, prism, sheet, bag } = k;
  const concrete = (f = 1) => hex(0xffffff, f);
  const armour = hex(FORT_COLOR.armour);
  const armourLight = hex(FORT_COLOR.armourLight);
  const steel = hex(FORT_COLOR.steel);
  const steelLight = hex(FORT_COLOR.steelLight, 1.2);
  const dark = hex(FORT_COLOR.dark);
  const brass = hex(FORT_COLOR.brass);
  const red = hex(DEFENSE_COLOR.pillboxMark);
  const white = hex(DEFENSE_COLOR.pillboxMarkWhite);

  // an eight-sided ring: half width hx, from z0 to z1, corners cut by c
  const oct = (hx: number, z0: number, z1: number, c: number, y: number): V[] => [
    [-hx + c, y, z0],
    [hx - c, y, z0],
    [hx, y, z0 + c],
    [hx, y, z1 - c],
    [hx - c, y, z1],
    [-hx + c, y, z1],
    [-hx, y, z1 - c],
    [-hx, y, z0 + c],
  ];
  const rivet = (x: number, y: number, z: number, color = steelLight) =>
    box(x - RIVET, x + RIVET, y - RIVET, y + RIVET, z - RIVET, z + RIVET, color);
  // a row of rivets from a to b
  const rivets = (a: V, b: V, n: number, color = steelLight) => {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      rivet(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, color);
    }
  };

  // ---- the deck, with the target's mark along its lips ----
  bevelBox(-HALF_W, HALF_W, 0, DECK, -HALF_D, HALF_D, 0.2, concrete(0.88));
  for (let i = 0; i < 18; i++) {
    const x0 = -7.6 + i * (15.2 / 18);
    box(x0, x0 + 15.2 / 18, DECK, DECK + 0.4, 2.55, 2.97, i % 2 === 0 ? red : white);
  }
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const z0 = -2.4 + i * 0.8;
      const x0 = sx > 0 ? 7.55 : -7.97;
      box(x0, x0 + 0.42, DECK, DECK + 0.4, z0, z0 + 0.8, i % 2 === 0 ? red : white);
    }
  }
  // plain blocks along the back lip, and bolt heads on the deck
  for (let i = 0; i < 5; i++) {
    const x0 = -7.6 + i * 3.04;
    box(x0, x0 + 3.04, DECK, DECK + 0.3, -2.97, -2.6, concrete(0.8));
  }
  for (const x of [-6.4, -3.2, 3.2, 6.4]) {
    for (const z of [-1.9, 1.9]) {
      rivet(x, DECK + 0.03, z, steel);
    }
  }

  // ---- the pedestal: an armoured block with sloped sides, a glacis in front, and the red band over it ----
  loft(
    [
      [
        [-6.9, DECK, -2.5],
        [6.9, DECK, -2.5],
        [6.9, DECK, 2.3],
        [-6.9, DECK, 2.3],
      ],
      [
        [-6.5, 2.4, -2.4],
        [6.5, 2.4, -2.4],
        [6.5, 2.4, 2.0],
        [-6.5, 2.4, 2.0],
      ],
      [
        [-5.7, 3.4, -2.3],
        [5.7, 3.4, -2.3],
        [5.7, 3.4, 1.3],
        [-5.7, 3.4, 1.3],
      ],
    ],
    armour,
  );
  // the front plates: two courses, with the joint between them and the band of the mark
  const frontY = (y: number) => (y <= 2.4 ? 2.3 - ((y - DECK) / (2.4 - DECK)) * 0.3 : 2.0 - ((y - 2.4) / 1.0) * 0.7);
  for (let i = 0; i < 6; i++) {
    const x0 = -6.3 + i * 2.1;
    const x1 = x0 + 2.1 - 0.06;
    // one plate each: a thin slab on the face's slope, proud of it
    const slab = (y: number): V[] => [
      [x0, y, frontY(y)],
      [x1, y, frontY(y)],
      [x1, y, frontY(y) + 0.1],
      [x0, y, frontY(y) + 0.1],
    ];
    prism(slab(DECK + 0.1), slab(2.3), i % 2 === 0 ? armourLight : armour);
    rivets([x0 + 0.2, 1.1, frontY(1.1) + 0.1], [x1 - 0.2, 1.1, frontY(1.1) + 0.1], 5);
    rivets([x0 + 0.2, 2.1, frontY(2.1) + 0.1], [x1 - 0.2, 2.1, frontY(2.1) + 0.1], 5);
  }
  // the band of the mark over the glacis: red with white ticks
  for (let i = 0; i < 12; i++) {
    const x0 = -6 + i;
    const z = frontY(2.9);
    sheet(
      [
        [x0, 2.6, frontY(2.6) + 0.02],
        [x0 + 1, 2.6, frontY(2.6) + 0.02],
        [x0 + 1, 3.0, z + 0.02],
        [x0, 3.0, z + 0.02],
      ],
      [0, 0.4, 1],
      i % 2 === 0 ? red : white,
    );
  }
  // the side wings: on the left an ammunition locker with louvres, on the right a generator with a grille and an exhaust
  loft(
    [
      [
        [-7.8, DECK, -2.4],
        [-6.7, DECK, -2.4],
        [-6.7, DECK, 1.6],
        [-7.8, DECK, 1.6],
      ],
      [
        [-7.7, 3.3, -2.3],
        [-6.5, 3.3, -2.3],
        [-6.5, 3.3, 1.5],
        [-7.7, 3.3, 1.5],
      ],
      [
        [-7.4, 3.7, -2.2],
        [-6.3, 3.7, -2.2],
        [-6.3, 3.7, 1.3],
        [-7.4, 3.7, 1.3],
      ],
    ],
    armourLight,
  );
  for (let i = 0; i < 5; i++) box(-7.84, -7.74, 1.4 + i * 0.35, 1.5 + i * 0.35, -1.8, 0.8, dark); // louvres
  box(-7.9, -7.8, DECK + 0.3, 3.1, -2.2, -2.1, steel); // a hinge strap
  box(-7.9, -7.8, DECK + 0.3, 3.1, 1.2, 1.3, steel);
  for (const y of [1.3, 2.9]) rivets([-7.8, y, -2.0], [-7.8, y, 1.4], 7);
  loft(
    [
      [
        [6.7, DECK, -2.4],
        [7.8, DECK, -2.4],
        [7.8, DECK, 1.6],
        [6.7, DECK, 1.6],
      ],
      [
        [6.5, 2.9, -2.3],
        [7.7, 2.9, -2.3],
        [7.7, 2.9, 1.5],
        [6.5, 2.9, 1.5],
      ],
    ],
    armourLight,
  );
  for (let i = 0; i < 6; i++) box(7.78, 7.86, 1.2 + i * 0.25, 1.3 + i * 0.25, -1.7, 0.9, dark); // the grille
  rod([7.2, 2.9, -1.6], [7.2, 4.6, -1.6], 0.2, 0.2, 8, steel);
  rod([7.2, 4.6, -1.6], [7.2, 4.8, -1.6], 0.3, 0.12, 8, steelLight);
  rod([7.25, 2.9, 0.4], [7.25, 3.5, 0.4], 0.12, 0.12, 6, steel);
  for (const y of [1.3, 2.5]) rivets([7.8, y, -2.0], [7.8, y, 1.4], 7);

  // ---- the turret ring, the drum and the eight-sided housing ----
  rod([0, 3.4, -0.3], [0, 3.8, -0.3], 2.6, 2.6, 20, steel);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    rivet(Math.cos(a) * 2.4, 3.84, -0.3 + Math.sin(a) * 2.4, steelLight);
  }
  rod([0, 3.8, -0.3], [0, 5.3, -0.3], 2.25, 2.15, 20, armour);
  rod([0, 4.4, -0.3], [0, 4.5, -0.3], 2.32, 2.32, 20, steel);
  rod([0, 5.2, -0.3], [0, 5.32, -0.3], 2.32, 2.32, 20, steel);
  loft([oct(3.2, -2.2, 0.4, 0.8, 5.3), oct(3.3, -2.3, 0.4, 0.8, 6.0), oct(2.9, -2.1, 0.4, 0.9, 7.9)], armour);
  // plates on the housing's flanks, with their rivets, and a dark vision slit each
  for (const sx of [-1, 1]) {
    for (const [z0, z1] of [
      [-1.8, -0.9],
      [-0.7, 0.05],
    ] as const) {
      const xa = sx * 3.28;
      bevelBox(Math.min(xa, xa + sx * 0.1), Math.max(xa, xa + sx * 0.1), 5.55, 7.5, z0, z1, 0.03, armourLight);
      const x = xa + sx * 0.1;
      rivets([x, 5.7, z0 + 0.1], [x, 5.7, z1 - 0.1], 4);
      rivets([x, 7.35, z0 + 0.1], [x, 7.35, z1 - 0.1], 4);
    }
    sheet(
      [
        [sx * 3.31, 6.7, -0.55],
        [sx * 3.31, 6.7, -0.05],
        [sx * 3.31, 6.85, -0.05],
        [sx * 3.31, 6.85, -0.55],
      ],
      [sx, 0, 0],
      dark,
    );
  }
  // the roof: a plate overhanging the housing, a slotted vent, a hatch, a searchlight and the mast
  bevelBox(-3.15, 3.15, 7.9, 8.2, -2.4, 0.5, 0.1, armourLight);
  for (let i = 0; i < 4; i++) box(-2.4 + i * 0.3, -2.25 + i * 0.3, 8.2, 8.26, -1.8, -0.9, dark);
  rivets([-3.0, 8.22, 0.35], [3.0, 8.22, 0.35], 9);
  rivets([-3.0, 8.22, -2.25], [3.0, 8.22, -2.25], 9);
  rod([1.9, 8.2, -0.6], [1.9, 8.3, -0.6], 0.5, 0.45, 10, steel); // a hatch, shut
  rod([1.9, 8.3, -0.6], [1.9, 8.36, -0.6], 0.3, 0.3, 8, steelLight);
  rod([-2.3, 8.2, 0.0], [-2.3, 8.5, 0.0], 0.14, 0.14, 8, steel); // the searchlight: a post and a head
  prism(
    [
      [-2.6, 8.5, -0.3],
      [-2.0, 8.5, -0.3],
      [-2.0, 8.5, 0.6],
      [-2.6, 8.5, 0.6],
    ],
    [
      [-2.65, 8.95, -0.35],
      [-1.95, 8.95, -0.35],
      [-1.95, 8.95, 0.7],
      [-2.65, 8.95, 0.7],
    ],
    steel,
  );
  sheet(
    [
      [-2.58, 8.55, 0.62],
      [-2.02, 8.55, 0.62],
      [-2.02, 8.9, 0.69],
      [-2.58, 8.9, 0.69],
    ],
    [0, 0, 1],
    hex(FORT_COLOR.lens),
  );

  // ---- the gun shield: five plates round two ports, each with a sleeve ----
  const sz0 = SHIELD_Z;
  const sz1 = SHIELD_Z + SHIELD_T;
  const portLo = GUN_Y - 0.6;
  const portHi = GUN_Y + 0.6;
  const xl = GUN_X + 0.55; // a port's inner edge is 0.85 from the middle, its outer 1.95
  const xs = GUN_X - 0.55;
  bevelBox(-3.4, 3.4, 5.25, portLo, sz0, sz1, 0.08, armourLight);
  bevelBox(-3.4, 3.4, portHi, 8.5, sz0, sz1, 0.08, armourLight);
  bevelBox(-3.4, -xl, portLo, portHi, sz0, sz1, 0.08, armour);
  bevelBox(xl, 3.4, portLo, portHi, sz0, sz1, 0.08, armour);
  bevelBox(-xs, xs, portLo, portHi, sz0, sz1, 0.08, armour);
  // the dark behind each port
  for (const sx of [-1, 1]) {
    sheet(
      [
        [sx * xs, portLo, sz0 + 0.02],
        [sx * xl, portLo, sz0 + 0.02],
        [sx * xl, portHi, sz0 + 0.02],
        [sx * xs, portHi, sz0 + 0.02],
      ],
      [0, 0, 1],
      dark,
    );
  }
  // rivets round the shield's edge and down its seams, and a bar across the top
  rivets([-3.2, 5.45, sz1], [3.2, 5.45, sz1], 13);
  rivets([-3.2, 8.3, sz1], [3.2, 8.3, sz1], 13);
  rivets([-3.2, portLo - 0.2, sz1], [-xl - 0.2, portLo - 0.2, sz1], 4);
  rivets([3.2, portLo - 0.2, sz1], [xl + 0.2, portLo - 0.2, sz1], 4);
  rivets([-3.2, portHi + 0.2, sz1], [-xl - 0.2, portHi + 0.2, sz1], 4);
  rivets([3.2, portHi + 0.2, sz1], [xl + 0.2, portHi + 0.2, sz1], 4);
  for (const x of [-3.2, 3.2, -xs + 0.15, xs - 0.15]) rivets([x, 5.8, sz1], [x, 6.2, sz1], 2);
  bevelBox(-3.5, 3.5, 8.5, 8.7, sz0 - 0.1, sz1 + 0.1, 0.05, steel); // the shield's lip
  // bullet scars on the shield: bright dents
  for (let n = 0; n < 7; n++) {
    const x = range(-3.1, 3.1);
    const y = range(5.5, 8.3);
    if (Math.abs(Math.abs(x) - GUN_X) < 0.85 && y > portLo - 0.1 && y < portHi + 0.1) continue;
    const r = range(0.05, 0.12);
    sheet(
      [
        [x - r, y - r * 0.8, sz1 + 0.012],
        [x + r, y - r * 0.8, sz1 + 0.012],
        [x + r * 1.1, y + r * 0.7, sz1 + 0.012],
        [x - r * 0.9, y + r, sz1 + 0.012],
      ],
      [0, 0, 1],
      armourLight,
    );
    sheet(
      [
        [x - r * 0.5, y - r * 0.4, sz1 + 0.02],
        [x + r * 0.5, y - r * 0.4, sz1 + 0.02],
        [x, y + r * 0.5, sz1 + 0.02],
      ],
      [0, 0, 1],
      dark,
    );
  }

  // ---- the twin guns ----
  for (const sx of [-1, 1]) {
    const x = sx * GUN_X;
    // the sleeve through the port
    rod([x, GUN_Y, sz0 - 0.05], [x, GUN_Y, sz1 + 0.1], 0.5, 0.5, 12, steelLight);
    // the receiver, a box with a bevelled top, in front of the shield
    bevelBox(x - 0.42, x + 0.42, GUN_Y - 0.42, GUN_Y + 0.42, sz1 + 0.1, sz1 + 0.85, 0.08, steel);
    box(x - 0.1, x + 0.1, GUN_Y + 0.42, GUN_Y + 0.58, sz1 + 0.25, sz1 + 0.6, dark); // the feed cover's slot
    // the recoil sleeve, the jacket with its cooling bands, the barrel and the muzzle brake
    const z0 = sz1 + 0.85;
    rod([x, GUN_Y, z0], [x, GUN_Y, z0 + 0.4], 0.38, 0.38, 12, steelLight);
    rod([x, GUN_Y, z0 + 0.4], [x, GUN_Y, 2.5], 0.3, 0.3, 12, steel);
    for (const z of [z0 + 0.5, z0 + 0.7, z0 + 0.9, z0 + 1.1])
      rod([x, GUN_Y, z], [x, GUN_Y, z + 0.08], 0.37, 0.37, 12, steelLight);
    rod([x, GUN_Y, 2.5], [x, GUN_Y, 3.0], 0.17, 0.15, 10, dark);
    rod([x, GUN_Y, 2.7], [x, GUN_Y, 3.0], 0.27, 0.27, 8, steel);
    for (const dx of [-0.285, 0.285]) box(x + dx - 0.02, x + dx + 0.02, GUN_Y - 0.12, GUN_Y + 0.12, 2.76, 2.94, dark); // brake slots
    // a spent-case chute under the receiver, and the casings on the deck below it
    box(x - 0.22, x + 0.22, GUN_Y - 0.62, GUN_Y - 0.42, sz1 + 0.3, sz1 + 0.75, steel);
    for (let n = 0; n < 8; n++) {
      const cx = x + range(-0.9, 0.9);
      const cz = range(1.9, 2.5);
      const a = range(0, Math.PI);
      rod([cx, DECK + 0.045, cz], [cx + Math.cos(a) * 0.2, DECK + 0.045, cz + Math.sin(a) * 0.2], 0.04, 0.04, 5, brass);
    }
  }

  // ---- the ammunition boxes and their belts ----
  for (const sx of [-1, 1]) {
    const bx = sx * 3.15;
    // the box, with a lid, a handle and a stencil band
    bevelBox(bx - 0.4, bx + 0.4, 6.4, 7.2, sz1 + 0.1, sz1 + 0.95, 0.05, hex(FORT_COLOR.ammoBox));
    box(bx - 0.28, bx + 0.28, 7.2, 7.26, sz1 + 0.3, sz1 + 0.75, steel);
    sheet(
      [
        [bx - 0.4, 6.7, sz1 + 0.96],
        [bx + 0.4, 6.7, sz1 + 0.96],
        [bx + 0.4, 6.85, sz1 + 0.96],
        [bx - 0.4, 6.85, sz1 + 0.96],
      ],
      [0, 0, 1],
      brass,
    );
    // the belt: links on a sag from the box's inner side to the receiver, each with a cartridge
    const from: V = [bx - sx * 0.4, 6.95, sz1 + 0.5];
    const to: V = [sx * (GUN_X + 0.42), GUN_Y - 0.1, sz1 + 0.5];
    const links = 9;
    for (let i = 0; i < links; i++) {
      const t = (i + 0.5) / links;
      const sag = Math.sin(Math.PI * t) * 0.5;
      const px = from[0] + (to[0] - from[0]) * t;
      const py = from[1] + (to[1] - from[1]) * t - sag;
      const slope = Math.atan2(to[1] - from[1] - Math.PI * 0.5 * Math.cos(Math.PI * t), to[0] - from[0]);
      k.tilted([px, py, from[2]], [0.18, 0.1, 0.12], 0, 0, slope, steel);
      k.tilted([px, py, from[2] + 0.1], [0.07, 0.07, 0.14], 0, 0, slope, brass);
    }
    // the tail of the belt hanging from the box to the deck
    for (let i = 0; i < 6; i++) {
      k.tilted([bx + sx * (0.45 + 0.03 * i), 6.35 - i * 0.12, sz1 + 0.55], [0.1, 0.16, 0.12], 0, 0, sx * 0.2, steel);
      k.tilted([bx + sx * (0.45 + 0.03 * i), 6.35 - i * 0.12, sz1 + 0.66], [0.07, 0.14, 0.07], 0, 0, sx * 0.2, brass);
    }
    // the rack under the box
    box(bx - 0.5, bx + 0.5, 6.3, 6.4, sz1 + 0.05, sz1 + 1.0, steel);
    rivets([bx - 0.4, 6.4, sz1 + 1.0], [bx + 0.4, 6.4, sz1 + 1.0], 4);
  }

  // ---- the gunner's hood at the back, its vision slits, and the ladder up to it ----
  loft([oct(1.6, -2.95, -1.55, 0.5, 7.9), oct(1.7, -3.0, -1.5, 0.5, 8.3), oct(1.45, -2.85, -1.65, 0.45, 9.0)], armour);
  bevelBox(-1.3, 1.3, 9.0, 9.12, -2.7, -1.8, 0.04, armourLight); // the hood's cap
  rod([0, 9.12, -2.25], [0, 9.22, -2.25], 0.35, 0.3, 8, steel);
  for (const x of [-1.0, -0.5, 0, 0.5, 1.0])
    sheet(
      [
        [x - 0.12, 8.55, -1.5 + 0.02],
        [x + 0.12, 8.55, -1.5 + 0.02],
        [x + 0.12, 8.7, -1.5 + 0.02],
        [x - 0.12, 8.7, -1.5 + 0.02],
      ],
      [0, 0, 1],
      dark,
    );
  rivets([-1.4, 8.15, -1.52], [1.4, 8.15, -1.52], 6);
  // the ladder up the back of the pedestal to the hood: rails and rungs
  for (const x of [-0.35, 0.35]) box(x - 0.03, x + 0.03, DECK, 7.9, -3.0, -2.94, steelLight);
  for (let y = 1.3; y < 7.8; y += 0.45) box(-0.35, 0.35, y - 0.025, y + 0.025, -3.0, -2.95, steelLight);
  box(-3.1, 3.1, 4.9, 5.1, -3.0, -2.6, armourLight); // a back plate over the ring
  rivets([-2.9, 5.0, -2.62], [2.9, 5.0, -2.62], 8);

  // ---- the mast on the right wing, with a beacon ----
  rod([7.0, 3.7, 0.6], [7.0, HEIGHT, 0.6], 0.07, 0.04, 6, steel);
  box(6.5, 7.5, 8.3, 8.36, 0.55, 0.65, steel);
  box(6.7, 7.3, 9.1, 9.15, 0.55, 0.65, steel);
  box(6.9, 7.1, 9.5, 9.8, 0.5, 0.7, hex(FORT_COLOR.lens));
  rod([7.0, 6.0, 0.6], [6.4, 6.9, 0.6], 0.02, 0.02, 4, steel); // a stay

  // ---- sandbags at the deck's ends, on the ground in front of the wings ----
  for (const sx of [-1, 1]) {
    for (let course = 0; course < 2; course++) {
      for (let i = 0; i < 3; i++) {
        bag(
          [sx * (4.9 + i * 0.85 + (course % 2) * 0.4), DECK + 0.2 + course * 0.33, 2.2 + range(-0.1, 0.1)],
          [range(0.95, 1.1), range(0.34, 0.4), range(0.6, 0.72)],
          range(-0.15, 0.15),
          range(-0.06, 0.06),
          k.shade(DEFENSE_COLOR.pillboxEarth, 0.1),
        );
      }
    }
  }

  // ---- scorch over the guns, rust running from the fittings, the dirt of the deck ----
  for (const sx of [-1, 1]) {
    const x = sx * GUN_X;
    sheet(
      [
        [x - 0.9, 7.7, sz1 + 0.014],
        [x + 0.9, 7.7, sz1 + 0.014],
        [x + 0.6, 8.35, sz1 + 0.014],
        [x - 0.6, 8.35, sz1 + 0.014],
      ],
      [0, 0, 1],
      hex(FORT_COLOR.murk, 1.5),
    );
  }
  for (const [x, y0, y1, z] of [
    [-3.0, 5.25, 4.2, sz1],
    [2.4, 5.25, 3.9, sz1],
    [-2.0, 8.5, 7.9, sz1],
  ] as const) {
    sheet(
      [
        [x - 0.12, y0, z + 0.016],
        [x + 0.12, y0, z + 0.016],
        [x + 0.05, y1, z + 0.016],
        [x - 0.05, y1, z + 0.016],
      ],
      [0, 0, 1],
      hex(FORT_COLOR.rust, 0.9),
    );
  }
  k.darken(0, 2.2, 0.7);
  return k.geometry();
}
