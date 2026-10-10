import { PAINT, css } from '../data/colors.ts';
import * as THREE from 'three';
import { KWLN_NEON_WORDS, KWLN_SHOP_NAMES } from '../i18n/signs.ts';
import { canvasTex } from './looks/paint.ts';
// What crowds a courtyard (world/levelMesh.ts buildYardShell, buildAtriumProps): the things on the outer walls of a
// yard and across it, and the things that hang in an atrium. All of it is looked at, never touched: nothing here is
// in the tile world. Many small things, so they are drawn as instanced meshes, one per kind of thing (batcher)

// a number in 0..1 that is the same every time for the same place (which window is lit, where a sign hangs)
export const yardDice = (a: number, b: number, c: number): number => {
  const n = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return n - Math.floor(n);
};
// one tile of a yard's wall on one storey: its middle, the way it faces (turn about y; 0 = +z), whether it has a window
export interface WallSpot {
  x: number;
  y: number;
  z: number;
  turn: number;
  window: boolean;
}
// the well itself: its middle, its size, the height of its ground and of its sky (m, in the building's frame)
export interface Well {
  cx: number;
  cz: number;
  wide: number;
  deep: number;
  ground: number;
  sky: number;
}

// Collects boxes and planes by kind and adds each kind as one instanced mesh. put: where (the middle), turned by
// `ry` about y and then tilted by `rx` about its own x, scaled
function batcher(group: THREE.Group) {
  const at = new THREE.Object3D(),
    lots = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material; m: THREE.Matrix4[] }>();
  at.rotation.order = 'YXZ';
  return {
    put(
      key: string,
      make: () => [THREE.BufferGeometry, THREE.Material],
      x: number,
      y: number,
      z: number,
      ry = 0,
      rx = 0,
      scale: [number, number, number] = [1, 1, 1],
    ) {
      let lot = lots.get(key);
      if (!lot) {
        const [geo, mat] = make();
        lot = { geo, mat, m: [] };
        lots.set(key, lot);
      }
      at.position.set(x, y, z);
      at.rotation.set(rx, ry, 0);
      at.scale.set(...scale);
      at.updateMatrix();
      lot.m.push(at.matrix.clone());
    },
    done() {
      for (const lot of lots.values()) {
        const mesh = new THREE.InstancedMesh(lot.geo, lot.mat, lot.m.length);
        lot.m.forEach((m, n) => mesh.setMatrixAt(n, m));
        mesh.instanceMatrix.needsUpdate = true;
        group.add(mesh);
      }
    },
  };
}
type Batch = ReturnType<typeof batcher>;
// (nothing in a well fades into the sector's fog: across it the far side would be black. `lit` only says the thing
// gives light)
// The well is dim: what gives no light of its own is darkened by `dim` (the yard's shade, set by dressYard);
// what is lit keeps its colour, so the signs and lamps stand out of the gloom
let dim = new THREE.Color(0xffffff);
const flat = (color: number, lit = false): THREE.Material =>
  new THREE.MeshBasicMaterial({ color: lit ? color : new THREE.Color(color).multiply(dim), fog: false });
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

// ---- signs ----
const SIGN_FONT = '"Noto Sans TC", "PingFang TC", "Hiragino Sans", sans-serif';
const NEON_COLORS = [css(PAINT.red1), css(PAINT.pink), css(PAINT.mint1), css(PAINT.amber5), '#58c8ff'];
// a neon sign: the tubes of the characters in one colour on a dark board, with their glow. Read downward, or across
export function neonTex(text: string, color: string, across: boolean): THREE.CanvasTexture {
  const n = text.length,
    w = across ? 64 * n + 16 : 64,
    h = across ? 64 : 64 * n + 16;
  return canvasTex(w, h, g => {
    g.fillStyle = '#0d0b0e';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.strokeRect(3, 3, w - 6, h - 6);
    g.font = `700 46px ${SIGN_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = 10;
    g.fillStyle = color;
    [...text].forEach((ch, k) => g.fillText(ch, across ? 40 + 64 * k : 32, across ? 34 : 40 + 64 * k));
  });
}
// a shop's board, lit from inside: red characters on a yellowed panel
function boardTex(text: string): THREE.CanvasTexture {
  return canvasTex(256, 56, g => {
    g.fillStyle = '#d9c58a';
    g.fillRect(0, 0, 256, 56);
    g.fillStyle = 'rgba(120,80,30,0.25)';
    g.fillRect(0, 44, 256, 12);
    g.strokeStyle = '#5a1614';
    g.lineWidth = 3;
    g.strokeRect(2, 2, 252, 52);
    g.font = `900 38px ${SIGN_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#a81e1a';
    g.fillText(text, 128, 30);
  });
}
// a strip of tin, ribbed, in a paint that has seen weather (an awning)
export function tinTex(color: string): THREE.CanvasTexture {
  return canvasTex(64, 32, g => {
    g.fillStyle = color;
    g.fillRect(0, 0, 64, 32);
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (let x = 0; x < 64; x += 8) g.fillRect(x, 0, 3, 32);
    g.fillStyle = 'rgba(60,30,10,0.3)';
    g.fillRect(0, 24, 64, 8);
  });
}
// the bars of a cage built out round a window, with what is kept in it (boxes, a plant, washing)
export function cageTex(seed: number): THREE.CanvasTexture {
  return canvasTex(96, 64, g => {
    g.fillStyle = '#1a1716';
    g.fillRect(0, 0, 96, 64);
    const stuff = ['#7a5a3a', '#3f6a4a', css(PAINT.grey10), '#a04a3a', css(PAINT.clay5)];
    for (let k = 0; k < 5; k++) {
      g.fillStyle = stuff[Math.floor(yardDice(seed, k, 1) * stuff.length)]!;
      g.fillRect(6 + k * 17, 30 + yardDice(seed, k, 2) * 14, 13, 30);
    }
    g.fillStyle = '#0e0c0c';
    for (let x = 0; x < 96; x += 8) g.fillRect(x, 0, 2, 64);
    g.fillRect(0, 0, 96, 3);
    g.fillRect(0, 30, 96, 2);
    g.fillRect(0, 61, 96, 3);
  });
}
// leaves: a ragged sheet of ivy, with holes the wall shows through
function ivyTex(): THREE.CanvasTexture {
  return canvasTex(64, 128, g => {
    for (let k = 0; k < 260; k++) {
      const x = yardDice(k, 1, 3) * 64,
        y = yardDice(k, 2, 3) * 128,
        // (thicker toward the ground)
        keep = yardDice(k, 3, 3) < 0.35 + (y / 128) * 0.6;
      if (!keep) continue;
      g.fillStyle = ['#2f4a2a', '#3a5a32', '#24381f', '#46663a'][k % 4]!;
      g.fillRect(x, y, 7, 6);
    }
  });
}

// ---- the three yards ----
const WINDOW_DROP = 1.2; // a window's middle is about this far under the middle of its storey's wall tile (m)

// The walled city: neon on brackets and across the well, shop boards, caged balconies with what people keep in them,
// tin awnings, washing on poles, air conditioners, cables with lanterns, the light of the stalls on the ground
function dressWalledCity(b: Batch, group: THREE.Group, spots: WallSpot[], well: Well) {
  const neons = KWLN_NEON_WORDS.flatMap(w => NEON_COLORS.map(c => ({ w, c })));
  const plane = (w: number, h: number) => new THREE.PlaneGeometry(w, h);
  for (const p of spots) {
    const nx = Math.sin(p.turn),
      nz = Math.cos(p.turn),
      tx = Math.cos(p.turn),
      tz = -Math.sin(p.turn),
      d = (salt: number) => yardDice(p.x * 3 + salt, p.y, p.z * 5 + p.turn),
      wy = p.y - WINDOW_DROP;
    // a neon sign on its bracket, edge on to the wall (read from both sides); now and then one two storeys of a size
    if (d(1) < 0.34) {
      const pick = neons[Math.floor(d(2) * neons.length)]!,
        big = d(3) < 0.2 ? 1.9 : 1,
        h = (0.9 * pick.w.length + 0.3) * big,
        out = 0.3 + 0.5 * big,
        y = p.y + (d(4) - 0.5) * 3,
        make = (): [THREE.BufferGeometry, THREE.Material] => [
          plane(0.9, 0.9 * pick.w.length + 0.3),
          new THREE.MeshBasicMaterial({ map: neonTex(pick.w, pick.c, false), fog: false }),
        ];
      for (const back of [0, Math.PI])
        b.put(
          `neon${pick.w}${pick.c}`,
          make,
          p.x + nx * out + tx * 1.6,
          y,
          p.z + nz * out + tz * 1.6,
          p.turn + Math.PI / 2 + back,
          0,
          [big, big, 1],
        );
      b.put(
        'bracket',
        () => [box(0.06, 0.06, 1), flat(0x151314)],
        p.x + nx * (out / 2) + tx * 1.6,
        y + h / 2,
        p.z + nz * (out / 2) + tz * 1.6,
        p.turn,
        0,
        [1, 1, out],
      );
    }
    // a shop's board flat on the wall, under the slab's band
    if (d(5) < 0.26) {
      const name = KWLN_SHOP_NAMES[Math.floor(d(6) * KWLN_SHOP_NAMES.length)]!;
      b.put(
        `board${name}`,
        () => [plane(3.4, 0.75), new THREE.MeshBasicMaterial({ map: boardTex(name), color: 0xb9b0a4, fog: false })],
        p.x + nx * 0.16,
        p.y + 2.9,
        p.z + nz * 0.16,
        p.turn,
      );
    }
    if (p.window) {
      // the cage built out round the window: a box of bars, things kept in it
      if (d(7) < 0.42) {
        const v = Math.floor(d(8) * 4);
        b.put(
          `cage${v}`,
          () => [box(2.7, 1.5, 0.9), new THREE.MeshBasicMaterial({ map: cageTex(v), color: dim, fog: false })],
          p.x + nx * 0.45,
          wy - 0.6,
          p.z + nz * 0.45,
          p.turn,
        );
      }
      // a tin awning over it, hanging forward
      if (d(9) < 0.4) {
        const v = Math.floor(d(10) * 4),
          tin = [css(PAINT.rust2), css(PAINT.teal), css(PAINT.grey9), css(PAINT.olive)][v]!;
        b.put(
          `awning${v}`,
          () => [
            plane(3, 1.3),
            new THREE.MeshBasicMaterial({ map: tinTex(tin), color: dim, side: THREE.DoubleSide, fog: false }),
          ],
          p.x + nx * 0.6,
          wy + 1.75,
          p.z + nz * 0.6,
          p.turn,
          -1.1,
        );
      }
    }
    // washing on a pole pushed out from the wall
    if (d(11) < 0.3) {
      const y = wy - 1.6 + d(12) * 0.6;
      b.put(
        'pole',
        () => [box(0.04, 0.04, 2.2), flat(0x8d8a80)],
        p.x + nx * 1.1 - tx * 1.2,
        y,
        p.z + nz * 1.1 - tz * 1.2,
        p.turn,
      );
      for (let k = 0; k < 3; k++) {
        const c = Math.floor(d(13 + k) * 5);
        b.put(
          `cloth${c}`,
          () => [
            plane(0.55, 0.8),
            new THREE.MeshBasicMaterial({
              color: new THREE.Color([0xc9c2b4, PAINT.rust1, 0x3b5d8a, 0xb8a04a, 0x4d6b55][c]!).multiply(dim),
              side: THREE.DoubleSide,
              fog: false,
            }),
          ],
          p.x + nx * (0.6 + k * 0.6) - tx * 1.2,
          y - 0.45,
          p.z + nz * (0.6 + k * 0.6) - tz * 1.2,
          p.turn + Math.PI / 2,
        );
      }
    }
    // an air conditioner on its bracket
    if (d(16) < 0.4)
      b.put(
        'ac',
        () => [box(0.9, 0.65, 0.5), flat(0x8a8882)],
        p.x + nx * 0.25 + tx * 1.3,
        wy - 1.9,
        p.z + nz * 0.25 + tz * 1.3,
        p.turn,
      );
  }
  // cables strung across the well on every storey, some hung with red lanterns, and a few big signs hung out over
  // the middle of it
  for (let y = well.ground + 3, n = 0; y < well.sky - 1; y += 2.6, n++) {
    const d = yardDice(y, well.cx, well.cz),
      alongX = d < 0.5,
      off = (yardDice(y, well.cz, 7) - 0.5) * 0.8,
      x = well.cx + (alongX ? 0 : off * well.wide),
      z = well.cz + (alongX ? off * well.deep : 0),
      len = alongX ? well.wide : well.deep;
    b.put('cable', () => [box(1, 0.05, 0.05), flat(0x0c0b0c)], x, y, z, alongX ? 0 : Math.PI / 2, 0, [len, 1, 1]);
    if (n % 4 === 0)
      for (let k = 1; k * 1.1 < len; k++)
        b.put(
          'lantern',
          () => [new THREE.SphereGeometry(0.13, 8, 6), flat(0xff4a32, true)],
          x + (alongX ? -len / 2 + k * 1.1 : 0),
          y - 0.3,
          z + (alongX ? 0 : -len / 2 + k * 1.1),
          0,
          0,
          [1, 1.25, 1],
        );
    if (n % 4 === 1) {
      const pick = neons[Math.floor(d * neons.length)]!,
        name = KWLN_SHOP_NAMES[Math.floor(yardDice(y, 3, 9) * KWLN_SHOP_NAMES.length)]!,
        make = (): [THREE.BufferGeometry, THREE.Material] => [
          plane(1.1 * name.length + 0.3, 1.1),
          new THREE.MeshBasicMaterial({ map: neonTex(name, pick.c, true), fog: false }),
        ];
      for (const back of [0, Math.PI])
        b.put(`hang${name}${pick.c}`, make, x, y - 0.7, z, (alongX ? 0 : Math.PI / 2) + back);
    }
  }
  // the stalls at the bottom: pools of warm light on the ground
  const glow = new THREE.MeshBasicMaterial({
    color: PAINT.amber4,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  for (let k = 0; k < 6; k++) {
    const pool = new THREE.Mesh(new THREE.CircleGeometry(2.2 + yardDice(k, 1, 1) * 1.5, 16), glow);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(
      well.cx + (yardDice(k, 2, 1) - 0.5) * well.wide * 0.8,
      well.ground + 0.05,
      well.cz + (yardDice(k, 3, 1) - 0.5) * well.deep * 0.8,
    );
    group.add(pool);
  }
}

// The old downtown: air conditioners under the windows, drain pipes, a fire escape up one wall (a landing on every
// storey, a stair between), a lit exit lamp by it, a water tank's pipes
function dressDowntown(b: Batch, spots: WallSpot[], well: Well, storey: number) {
  const steel = (): THREE.Material => flat(0x33373b);
  for (const p of spots) {
    const nx = Math.sin(p.turn),
      nz = Math.cos(p.turn),
      tx = Math.cos(p.turn),
      tz = -Math.sin(p.turn),
      d = (salt: number) => yardDice(p.x * 3 + salt, p.y, p.z * 5 + p.turn),
      wy = p.y - WINDOW_DROP;
    if (p.window && d(1) < 0.45)
      b.put(
        'ac',
        () => [box(0.95, 0.7, 0.5), flat(0xa9a59c)],
        p.x + nx * 0.25 + tx * 1.2,
        wy - 1.9,
        p.z + nz * 0.25 + tz * 1.2,
        p.turn,
      );
    // a drain pipe down the edge of a bare panel
    if (!p.window && d(2) < 0.5)
      b.put(
        'drain',
        () => [box(0.14, 1, 0.14), flat(0x5a5653)],
        p.x + nx * 0.12 + tx * 1.7,
        p.y,
        p.z + nz * 0.12 + tz * 1.7,
        p.turn,
        0,
        [1, storey, 1],
      );
    // a small lit sign now and then: a tenant's
    if (!p.window && d(3) < 0.12)
      b.put(
        'lamp',
        () => [box(1.2, 0.5, 0.12), flat(0xe9f3ff, true)],
        p.x + nx * 0.1,
        wy + 1.9,
        p.z + nz * 0.1,
        p.turn,
      );
  }
  // the fire escape: against the low-x wall, in its middle, all the way up
  const x = well.cx - well.wide / 2 + 0.75,
    z = well.cz;
  for (let y = well.ground; y < well.sky - storey / 2; y += storey / 2) {
    const flip = Math.round((y - well.ground) / (storey / 2)) % 2 ? 1 : -1;
    b.put('landing', () => [box(1.4, 0.08, 1.6), steel()], x, y + 0.04, z + flip * 2.6);
    b.put('flight', () => [box(1.1, 0.08, 6.6), steel()], x, y + storey / 4, z, 0, -flip * Math.atan2(storey / 2, 5.2));
    b.put(
      'escaperail',
      () => [box(0.05, 1.0, 6.6), steel()],
      x + 0.6,
      y + storey / 4 + 0.5,
      z,
      0,
      -flip * Math.atan2(storey / 2, 5.2),
    );
    b.put('exitlamp', () => [box(0.1, 0.3, 0.7), flat(0x49e08a, true)], x - 0.6, y + 2.3, z + flip * 2.6);
  }
}

// The ruins: ivy over the walls, dead air conditioners, bare poles, a slab of balcony left here and there, and on the
// ground rubble and a dead tree
function dressRuins(b: Batch, spots: WallSpot[], well: Well) {
  const ivy = (): [THREE.BufferGeometry, THREE.Material] => [
    new THREE.PlaneGeometry(3.6, 7),
    new THREE.MeshBasicMaterial({ map: ivyTex(), color: dim, transparent: true, alphaTest: 0.5, fog: false }),
  ];
  for (const p of spots) {
    const nx = Math.sin(p.turn),
      nz = Math.cos(p.turn),
      tx = Math.cos(p.turn),
      tz = -Math.sin(p.turn),
      d = (salt: number) => yardDice(p.x * 3 + salt, p.y, p.z * 5 + p.turn),
      wy = p.y - WINDOW_DROP;
    if (d(1) < 0.42)
      b.put('ivy', ivy, p.x + nx * 0.14 + tx * (d(2) - 0.5), p.y - 0.4, p.z + nz * 0.14 + tz * (d(2) - 0.5), p.turn);
    if (p.window && d(3) < 0.2)
      b.put(
        'deadac',
        () => [box(0.9, 0.65, 0.5), flat(0x6d6a60)],
        p.x + nx * 0.25 + tx * 1.2,
        wy - 1.9,
        p.z + nz * 0.25 + tz * 1.2,
        p.turn,
        0.25,
      );
    if (d(4) < 0.18)
      b.put(
        'pole',
        () => [box(0.04, 0.04, 2), flat(PAINT.grey5)],
        p.x + nx * 1 - tx * 1.2,
        wy - 1.5,
        p.z + nz * 1 - tz * 1.2,
        p.turn,
        0.12,
      );
    if (p.window && d(5) < 0.22)
      b.put(
        'slab',
        () => [box(2.8, 0.18, 1.1), flat(0x6f695f)],
        p.x + nx * 0.55,
        wy - 1.35,
        p.z + nz * 0.55,
        p.turn,
        d(6) < 0.3 ? 0.35 : 0,
      );
  }
  for (let k = 0; k < 9; k++)
    b.put(
      'rubble',
      () => [box(1, 1, 1), flat(0x55524a)],
      well.cx + (yardDice(k, 1, 5) - 0.5) * well.wide * 0.85,
      well.ground + 0.3,
      well.cz + (yardDice(k, 2, 5) - 0.5) * well.deep * 0.85,
      yardDice(k, 3, 5) * 3,
      0.3,
      [1 + yardDice(k, 4, 5) * 2.5, 0.6 + yardDice(k, 5, 5), 1 + yardDice(k, 6, 5) * 2],
    );
  // a dead tree in the middle: a trunk and three boughs
  const wood = (): THREE.Material => flat(0x3a332b);
  b.put('trunk', () => [box(0.5, 6, 0.5), wood()], well.cx, well.ground + 3, well.cz, 0.4);
  for (const [ry, rx, len] of [
    [0.3, 0.9, 4],
    [2.4, 1.1, 3.4],
    [4.3, 0.8, 3],
  ] as const)
    b.put(
      'bough',
      () => [box(0.2, 1, 0.2), wood()],
      well.cx + Math.sin(ry) * 0.9,
      well.ground + 6.2,
      well.cz + Math.cos(ry) * 0.9,
      ry,
      rx,
      [1, len, 1],
    );
}

// what a sector's yard is dressed with (levelMesh.ts YARDS[...].dress)
export type YardDress = 'downtown' | 'walledCity' | 'ruins';
export function dressYard(
  group: THREE.Group,
  dress: YardDress,
  spots: WallSpot[],
  well: Well,
  storey: number,
  shade: number,
) {
  dim = new THREE.Color(shade);
  const b = batcher(group);
  if (dress === 'walledCity') dressWalledCity(b, group, spots, well);
  else if (dress === 'ruins') dressRuins(b, spots, well);
  else dressDowntown(b, spots, well, storey);
  b.done();
}

// ---- what hangs in an atrium ----
// By sector: the old downtown's pendant lamps at different heights; the smelter's crane girder, its chains and hook,
// and hot pipes up the corners; the broadcasting house's lighting truss with its lamps, and hanging cables; the data
// floor's cable trays across the well and columns of status lights
export function dressAtrium(group: THREE.Group, sector: string, well: Well) {
  const b = batcher(group),
    h = well.sky - well.ground,
    corner = (k: number): [number, number] => [
      well.cx + (k & 1 ? 1 : -1) * (well.wide / 2 - 0.25),
      well.cz + (k & 2 ? 1 : -1) * (well.deep / 2 - 0.25),
    ];
  if (sector === 'FORGE') {
    b.put('girder', () => [box(1, 0.5, 0.4), flat(0x4a3a2c)], well.cx, well.sky - 1.2, well.cz, 0, 0, [
      well.wide,
      1,
      1,
    ]);
    b.put('trolley', () => [box(1, 0.5, 0.9), flat(0x6a4a22)], well.cx + 1.2, well.sky - 1.7, well.cz);
    for (const dx of [-0.25, 0.25])
      b.put(
        'chain',
        () => [box(0.06, 1, 0.06), flat(0x1c1a19)],
        well.cx + 1.2 + dx,
        well.sky - 1.9 - h * 0.22,
        well.cz,
        0,
        0,
        [1, h * 0.44, 1],
      );
    b.put('hook', () => [box(0.7, 0.9, 0.35), flat(PAINT.amber1)], well.cx + 1.2, well.sky - 2.3 - h * 0.44, well.cz);
    for (let k = 0; k < 4; k++) {
      const [x, z] = corner(k);
      b.put('hotpipe', () => [box(0.35, 1, 0.35), flat(PAINT.umber1)], x, well.ground + h / 2, z, 0, 0, [1, h, 1]);
      for (let y = well.ground + 2; y < well.sky - 1; y += 4)
        b.put('glowband', () => [box(0.4, 0.3, 0.4), flat(0xff7a2a, true)], x, y, z);
    }
  } else if (sector === 'NOISE') {
    for (const [dx, dz, turn] of [
      [0, -1, 0],
      [0, 1, 0],
      [-1, 0, Math.PI / 2],
      [1, 0, Math.PI / 2],
    ] as const)
      b.put(
        'truss',
        () => [box(1, 0.25, 0.25), flat(0x23212b)],
        well.cx + dx * (well.wide / 2 - 0.9),
        well.sky - 1.4,
        well.cz + dz * (well.deep / 2 - 0.9),
        turn,
        0,
        [well.wide - 1.8, 1, 1],
      );
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2,
        x = well.cx + Math.cos(a) * (well.wide / 2 - 0.9),
        z = well.cz + Math.sin(a) * (well.deep / 2 - 0.9);
      b.put('can', () => [new THREE.CylinderGeometry(0.22, 0.3, 0.6, 10), flat(0x15141a)], x, well.sky - 1.9, z);
      b.put(
        'canlight',
        () => [new THREE.CircleGeometry(0.26, 10), flat(k % 3 ? PAINT.pale : PAINT.glow6, true)],
        x,
        well.sky - 2.21,
        z,
        0,
        Math.PI / 2,
      );
    }
    for (let k = 0; k < 5; k++)
      b.put(
        'cable',
        () => [box(0.05, 1, 0.05), flat(PAINT.ink2)],
        well.cx + (yardDice(k, 1, 9) - 0.5) * well.wide * 0.7,
        well.sky - 1.5 - h * 0.2,
        well.cz + (yardDice(k, 2, 9) - 0.5) * well.deep * 0.7,
        0,
        0,
        [1, h * (0.2 + yardDice(k, 3, 9) * 0.3), 1],
      );
  } else if (sector === 'DATA') {
    for (let y = well.ground + 5, n = 0; y < well.sky - 1; y += 5, n++) {
      b.put('tray', () => [box(1, 0.12, 0.6), flat(PAINT.grey2)], well.cx, y, well.cz + (n % 2 ? 1.5 : -1.5), 0, 0, [
        well.wide,
        1,
        1,
      ]);
      b.put(
        'bundle',
        () => [box(1, 0.16, 0.36), flat(0x1b2530)],
        well.cx,
        y + 0.14,
        well.cz + (n % 2 ? 1.5 : -1.5),
        0,
        0,
        [well.wide, 1, 1],
      );
    }
    for (let k = 0; k < 4; k++) {
      const [x, z] = corner(k);
      b.put('riser', () => [box(0.3, 1, 0.3), flat(0x2a323b)], x, well.ground + h / 2, z, 0, 0, [1, h, 1]);
      for (let y = well.ground + 1; y < well.sky - 1; y += 0.9)
        b.put(
          `led${(k + Math.round(y)) % 3}`,
          () => [box(0.34, 0.08, 0.34), flat([PAINT.cyan, PAINT.mint2, PAINT.amber3][(k + Math.round(y)) % 3]!, true)],
          x,
          y,
          z,
        );
    }
  } else {
    // pendant lamps: a thin rod from the roof, a warm globe at its end, at different heights
    for (let k = 0; k < 7; k++) {
      const x = well.cx + (yardDice(k, 1, 4) - 0.5) * well.wide * 0.6,
        z = well.cz + (yardDice(k, 2, 4) - 0.5) * well.deep * 0.6,
        drop = 2 + yardDice(k, 3, 4) * h * 0.45;
      b.put('rod', () => [box(0.03, 1, 0.03), flat(PAINT.ink11)], x, well.sky - drop / 2, z, 0, 0, [1, drop, 1]);
      b.put('globe', () => [new THREE.SphereGeometry(0.28, 10, 8), flat(PAINT.glow5, true)], x, well.sky - drop, z);
    }
  }
  b.done();
}
