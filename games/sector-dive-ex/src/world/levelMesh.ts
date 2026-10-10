import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { UP } from '@engine/render/render.ts';
import {
  H,
  RISE,
  SIDE_STEP,
  T,
  W,
  cover,
  grid,
  hgt,
  inBounds,
  isSolid,
  ramp,
  tileCenter,
} from '@engine/world/tiles.ts';
import { HALL_H, WALL_H } from '../data/level.ts';
import type { Biome } from '../data/types.ts';
import { COLOR } from '../data/colors.ts';
import { biomeTex } from './render.ts';
import type { BiomeTextures } from './render.ts';
import { buildHazardMesh } from './hazards.ts';
import type { GeneratedLevel } from './levelGen.ts';
import { FLOOR_H } from './building.ts';
import { FLOOR_PLAIN_SHARE, lookOf, variantOf, wallPic } from './looks.ts';
import type { Court, FloorPlan } from './building.ts';
import { dressAtrium, dressYard, yardDice } from './yardProps.ts';
import { TEX, canvasTex, grain, grime, paint, poolTex } from './looks/paint.ts';
import type { YardDress } from './yardProps.ts';
const NEON_COUNT = 90; // neon signs per level
const CEILING_SHADE = 0.5; // a building floor's ceiling is the sector's wall colour times this
const SHAFT_FILL_GAP = 0.03; // the wall between a ceiling and the next floor stops this short of both (m)

// wedge rising toward +x across one tile; rotated per ramp direction
function wedgeGeo() {
  type P3 = [number, number, number];
  const a = T / 2,
    r = RISE,
    pos: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  const quad = (p0: P3, p1: P3, p2: P3, p3: P3) => {
    const b = pos.length / 3;
    pos.push(...p0, ...p1, ...p2, ...p3);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  const tri = (p0: P3, p1: P3, p2: P3) => {
    const b = pos.length / 3;
    pos.push(...p0, ...p1, ...p2);
    uv.push(0, 0, 1, 0, 1, 1);
    idx.push(b, b + 1, b + 2);
  };
  quad([-a, 0, -a], [a, r, -a], [a, r, a], [-a, 0, a]);
  quad([a, 0, -a], [a, 0, a], [a, r, a], [a, r, -a]);
  tri([-a, 0, -a], [a, 0, -a], [a, r, -a]);
  tri([-a, 0, a], [a, r, a], [a, 0, a]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.addGroup(0, 6, 0);
  g.addGroup(6, 12, 1);
  return g;
}
const RAMP_ROT = [0, Math.PI, -Math.PI / 2, Math.PI / 2];

// does a floor tile (grid 1) lie within the 8 tiles around (i, j), or on it
function touchesFloor(i: number, j: number): boolean {
  for (let dj = -1; dj <= 1; dj++)
    for (let di = -1; di <= 1; di++) {
      const ni = i + di,
        nj = j + dj;
      if (inBounds(ni, nj) && grid[nj * W + ni] === 1) return true;
    }
  return false;
}

// the solid tiles that touch a floor tile: the only walls that can be seen
function wallTiles(): [number, number][] {
  const tiles: [number, number][] = [];
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      if (grid[j * W + i] === 1) continue;
      if (touchesFloor(i, j)) tiles.push([i, j]);
    }
  return tiles;
}

function addFloor(tex: BiomeTextures, group: THREE.Group) {
  tex.floor.repeat.set(W, H);
  const geo = new THREE.PlaneGeometry(W * T, H * T);
  geo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex.floor }));
  floor.position.set((W * T) / 2, 0, (H * T) / 2);
  group.add(floor);
}

function addWalls(wallTex: THREE.Texture, tiles: [number, number][], group: THREE.Group) {
  if (!tiles.length) return;
  const matrix = new THREE.Matrix4();
  const walls = new THREE.InstancedMesh(
    new THREE.BoxGeometry(T, WALL_H, T),
    new THREE.MeshBasicMaterial({ map: wallTex }),
    tiles.length,
  );
  tiles.forEach(([i, j], n) => {
    matrix.makeTranslation(tileCenter(i), WALL_H / 2, tileCenter(j));
    walls.setMatrixAt(n, matrix);
  });
  walls.instanceMatrix.needsUpdate = true;
  group.add(walls);
}

// raised decks, walkways and cover (not ramps): one box per tile, scaled to the tile height
function addDecks(tex: BiomeTextures, group: THREE.Group, side?: THREE.Texture) {
  const matrix = new THREE.Matrix4();
  const raised: number[] = [];
  for (let k = 0; k < W * H; k++) if (grid[k] === 1 && ramp[k] < 0 && hgt[k] > 0) raised.push(k);
  const sideMat = new THREE.MeshBasicMaterial({ map: side ?? tex.wall }),
    topMat = new THREE.MeshBasicMaterial({ map: tex.tile });
  const coverSideMat = new THREE.MeshBasicMaterial({ map: tex.wall, color: 0x9a9a9a });
  (
    [
      [raised.filter(k => !cover[k]), sideMat],
      [raised.filter(k => cover[k]), coverSideMat],
    ] as [number[], THREE.Material][]
  ).forEach(([tiles, mat]) => {
    if (!tiles.length) return;
    const geo = new THREE.BoxGeometry(T, 1, T);
    geo.translate(0, 0.5, 0);
    const decks = new THREE.InstancedMesh(geo, [mat, mat, topMat, mat, mat, mat], tiles.length);
    tiles.forEach((k, n) => {
      matrix.makeScale(1, hgt[k], 1);
      matrix.setPosition(tileCenter(k % W), 0, tileCenter((k / W) | 0));
      decks.setMatrixAt(n, matrix);
    });
    decks.instanceMatrix.needsUpdate = true;
    group.add(decks);
  });
}

function addRamps(tex: BiomeTextures, group: THREE.Group) {
  const topMat = new THREE.MeshBasicMaterial({ map: tex.tile, side: THREE.DoubleSide }),
    sideMat = new THREE.MeshBasicMaterial({ map: tex.wall, side: THREE.DoubleSide });
  const geo = wedgeGeo();
  for (let k = 0; k < W * H; k++) {
    if (grid[k] !== 1 || ramp[k] < 0) continue;
    const mesh = new THREE.Mesh(geo, [topMat, sideMat]);
    mesh.position.set(tileCenter(k % W), hgt[k], tileCenter((k / W) | 0));
    mesh.rotation.y = RAMP_ROT[ramp[k]];
    group.add(mesh);
  }
}

function addCeiling(biome: Biome, group: THREE.Group) {
  const geo = new THREE.PlaneGeometry(W * T, H * T);
  geo.rotateX(Math.PI / 2);
  const ceiling = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: new THREE.Color(biome.wall).multiplyScalar(0.7) }),
  );
  ceiling.position.set((W * T) / 2, WALL_H, (H * T) / 2);
  group.add(ceiling);
}

// neon signs on the open sides of wall tiles; rng picks which sides get one, then each sign's height, size and colour
function addNeonSigns(tiles: [number, number][], group: THREE.Group, rng: Rng) {
  const matrix = new THREE.Matrix4();
  const spots: [number, number, number, number][] = [];
  tiles.forEach(([i, j]) =>
    SIDE_STEP.forEach(([dx, dz]) => {
      if (!isSolid(i + dx, j + dz)) spots.push([i, j, dx, dz]);
    }),
  );
  const pickSpots = rng.shuffle(spots).slice(0, NEON_COUNT),
    colors = [COLOR.neonPink, COLOR.neonMint, COLOR.neonGold, COLOR.neonSky, COLOR.violet];
  const signs = new THREE.InstancedMesh(
    new THREE.BoxGeometry(T * 0.55, 0.45, 0.08),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    pickSpots.length,
  );
  const rotation = new THREE.Quaternion(),
    scale = new THREE.Vector3(1, 1, 1),
    color = new THREE.Color();
  pickSpots.forEach(([i, j, dx, dz], n) => {
    rotation.setFromAxisAngle(UP, dx !== 0 ? Math.PI / 2 : 0);
    matrix.compose(
      new THREE.Vector3((i + 0.5 + dx * 0.52) * T, rng.rand(2.4, 4.8), (j + 0.5 + dz * 0.52) * T),
      rotation,
      scale.set(rng.rand(0.5, 1.2), rng.rand(0.7, 1.6), 1),
    );
    signs.setMatrixAt(n, matrix);
    signs.setColorAt(n, color.setHex(rng.pick(colors)));
  });
  signs.instanceMatrix.needsUpdate = true;
  if (signs.instanceColor) signs.instanceColor.needsUpdate = true;
  group.add(signs);
}

// ---- a floor of the building: drawn tile by tile, so it can be open where a stairwell or a lift passes ----
// one flat square per tile at height y, facing up or down
function addTilePlanes(tiles: number[], y: number, up: boolean, mat: THREE.Material, group: THREE.Group) {
  if (!tiles.length) return;
  const geo = new THREE.PlaneGeometry(T, T);
  geo.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
  const mesh = new THREE.InstancedMesh(geo, mat, tiles.length),
    matrix = new THREE.Matrix4();
  tiles.forEach((k, n) => {
    matrix.makeTranslation(tileCenter(k % W), y, tileCenter((k / W) | 0));
    mesh.setMatrixAt(n, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
}
// The courtyard on one floor (world/building.ts). An atrium: where its middle is a hole, a rail of glass round it (a
// steel top rail and posts, a pane under it; the tile world keeps the player out, the rail shows why); on its top
// floor a skylight in the ceiling, and on its ground the light that falls through it. A yard: the same rail along
// the balcony's open side
const RAIL_H = 1.15,
  RAIL_T = 0.08; // the rail's height and thickness (m)
// the light an atrium's skylight lets in, by sector (and how strong it lies on the ground): the pale evening sky of
// the old downtown, the furnaces' glow under a sooted roof, a studio's violet work lights, a machine hall's cold white
const SKYLIGHTS: Record<string, [number, number]> = {
  CITY: [0xdfe9f2, 0.16],
  FORGE: [0xffa868, 0.14],
  NOISE: [0xc9b4ff, 0.13],
  DATA: [0xe6f1ff, 0.18],
};
// a run of rail `len` long, centred on (x, z), along x (alongX) or along z
function addRail(x: number, z: number, len: number, alongX: boolean, group: THREE.Group) {
  const steel = new THREE.MeshBasicMaterial({ color: 0x2c3136 }),
    glass = new THREE.MeshBasicMaterial({ color: 0x9fb6c4, transparent: true, opacity: 0.16, depthWrite: false }),
    box = (along: number, h: number, across: number) =>
      new THREE.BoxGeometry(alongX ? along : across, h, alongX ? across : along);
  const top = new THREE.Mesh(box(len, RAIL_T, RAIL_T), steel);
  top.position.set(x, RAIL_H, z);
  const pane = new THREE.Mesh(box(len, RAIL_H - 0.12, RAIL_T / 2), glass);
  pane.position.set(x, (RAIL_H - 0.12) / 2 + 0.06, z);
  group.add(top, pane);
  for (let p = 0; p <= Math.round(len / T); p++) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(RAIL_T, RAIL_H, RAIL_T), steel),
      at = -len / 2 + p * T;
    post.position.set(alongX ? x + at : x, RAIL_H / 2, alongX ? z : z + at);
    group.add(post);
  }
}
function addCourt(court: NonNullable<FloorPlan['court']>, group: THREE.Group, sector: string) {
  const [SKYLIGHT, SKY_POOL_OPACITY] = SKYLIGHTS[sector] ?? SKYLIGHTS.CITY!,
    is = court.tiles.map(k => k % W),
    js = court.tiles.map(k => (k / W) | 0),
    i0 = Math.min(...is),
    i1 = Math.max(...is) + 1,
    j0 = Math.min(...js),
    j1 = Math.max(...js) + 1,
    cx = ((i0 + i1) / 2) * T,
    cz = ((j0 + j1) / 2) * T,
    wide = (i1 - i0) * T,
    deep = (j1 - j0) * T;
  if (court.open) {
    // a yard: the rail on the balcony's side of the yard, one tile's worth per balcony tile
    for (const k of court.balcony) {
      const i = k % W,
        j = (k / W) | 0;
      if (j === j0 - 1) addRail(tileCenter(i), j0 * T, T, true, group);
      else if (j === j1) addRail(tileCenter(i), j1 * T, T, true, group);
      else if (i === i0 - 1) addRail(i0 * T, tileCenter(j), T, false, group);
      else if (i === i1) addRail(i1 * T, tileCenter(j), T, false, group);
    }
    return;
  }
  if (!court.ground) {
    addRail(cx, j0 * T, wide, true, group);
    addRail(cx, j1 * T, wide, true, group);
    addRail(i0 * T, cz, deep, false, group);
    addRail(i1 * T, cz, deep, false, group);
  }
  if (court.top) {
    // the skylight: a bright pane a little under the ceiling, framed by steel bars
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(wide - 0.6, deep - 0.6),
      new THREE.MeshBasicMaterial({ color: SKYLIGHT }),
    );
    sky.rotation.x = Math.PI / 2;
    sky.position.set(cx, WALL_H - 0.03, cz);
    group.add(sky);
    const bar = new THREE.MeshBasicMaterial({ color: 0x1b1e21 });
    for (let n = 1; n < i1 - i0; n++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, deep - 0.6), bar);
      m.position.set(i0 * T + n * T, WALL_H - 0.08, cz);
      group.add(m);
    }
    for (let n = 1; n < j1 - j0; n++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(wide - 0.6, 0.1, 0.12), bar);
      m.position.set(cx, WALL_H - 0.08, j0 * T + n * T);
      group.add(m);
    }
  }
  if (court.ground) {
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(wide, deep),
      new THREE.MeshBasicMaterial({
        color: SKYLIGHT,
        transparent: true,
        opacity: SKY_POOL_OPACITY,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(cx, 0.03, cz);
    group.add(pool);
  }
}

// ---- the yard: the building's own outer walls round an outdoor well ----
// What a balcony looks out on: four walls of windows, storey over storey (the floors the yard passes, and YARD_ABOVE
// / YARD_BELOW more that are only walls), the evening sky over them and the paved ground far below. All of it is a
// picture on planes: nothing here is in the tile world. One facade tile is a tile wide and a storey high, with one
// window: most are dark, some lit (a warm room behind a curtain, or the cold light of a screen)
const YARD_ABOVE = 2,
  YARD_BELOW = 3; // storeys of wall above the top floor the yard passes and below the lowest
const YARD_SKIN = 0.05; // the outer wall's picture stands this far inside the yard (m)
// how a sector's yard looks: its walls, how many of the windows are lit (warm / by a screen), whether every tile
// has a window or every other one, what else is on the wall, the sky and the ground
interface YardTheme {
  wall: [string, string]; // top and bottom of a storey
  joint: string;
  pane: [string, string];
  glint: string; // what the sky leaves on the glass
  sill: string;
  dense: boolean;
  lit: number;
  screen: number;
  extra: 'none' | 'units' | 'ivy'; // painted on the wall: air conditioners and pipes; ivy and cracks
  dress: YardDress; // the things on the walls and across the well (yardProps.ts)
  // which of the sector's wall pictures (its look's walls, by number) stand on a bare tile of the outer wall and on
  // one with a window; one named twice comes up twice as often
  walls: number[];
  windows: number[];
  band: [string, string]; // the slab's band between two storeys: its colour, and the dirt on it
  // The walls do not fade into the sector's fog (across the well they would be black): they are dimmed by this
  // instead, all alike. And the colour of the light from the lit rooms
  shade: number;
  glow: number;
  sky: [string, string, string];
  ground: [string, string, string]; // the ground, its paths, its beds
}
const YARDS: Record<string, YardTheme> = {
  // the old downtown: plastered office blocks in the evening, most rooms dark
  CITY: {
    wall: ['#8d7f78', '#75686a'],
    joint: 'rgba(40,30,38,0.18)',
    pane: ['#5b5870', '#2c2a3a'],
    glint: 'rgba(255,190,140,0.10)',
    sill: '#a3958c',
    dense: false,
    lit: 0.18,
    screen: 0.06,
    extra: 'none',
    dress: 'downtown',
    walls: [0, 0, 8], // panels, stone facing
    windows: [3, 3, 4], // a window with its blind down, or part raised
    band: ['#6f675c', 'rgba(30,24,20,0.35)'],
    shade: 0x9a938d,
    glow: 0xffc27a,
    sky: ['#c98a6c', '#8f7a94', '#4a4a6e'],
    ground: ['#2a2630', '#3a3640', '#1f1c25'],
  },
  // the walled city: a lightwell at night, every flat with its window on it, many lit, air conditioners and pipes
  KWLN: {
    wall: ['#5f5c58', '#45423f'],
    joint: 'rgba(15,12,14,0.3)',
    pane: ['#2b3038', '#16181d'],
    glint: 'rgba(255,90,140,0.08)',
    sill: '#6f6a64',
    dense: true,
    lit: 0.34,
    screen: 0.12,
    extra: 'units',
    dress: 'walledCity',
    walls: [0, 0, 4, 4, 1], // concrete, posters, a shutter
    windows: [3, 3, 3, 2], // a barred window, an iron gate
    band: ['#4a433a', 'rgba(15,12,10,0.45)'],
    shade: 0x5c5860,
    glow: 0xffb060,
    sky: ['#4a2f52', '#2c2238', '#15121c'],
    ground: ['#17161a', '#22202a', '#101014'],
  },
  // the ruins: housing blocks left to the weather, almost no light, ivy up the walls, the yard overgrown
  RUIN: {
    wall: ['#827c70', '#625d54'],
    joint: 'rgba(30,28,24,0.25)',
    pane: ['#34383a', '#191c1d'],
    glint: 'rgba(200,215,215,0.08)',
    sill: '#8b8578',
    dense: false,
    lit: 0.03,
    screen: 0,
    extra: 'ivy',
    dress: 'ruins',
    walls: [0, 1, 1, 2, 6, 6, 8], // mortar, damp, bare blocks, ivy, a hole to the bars
    windows: [5], // a broken window
    band: ['#77705f', 'rgba(35,40,28,0.4)'],
    shade: 0x878d87,
    glow: 0xffd9a0,
    sky: ['#a9afae', '#8a9192', '#6c7476'],
    ground: ['#2c3626', '#3a4031', '#222b1e'],
  },
};
// the slab between two storeys, seen from the yard: a band of concrete with the dirt that runs down from it
function slabBandTex(th: YardTheme): THREE.CanvasTexture {
  return paint(0x51ab, (g, rand) => {
    g.fillStyle = th.band[0];
    g.fillRect(0, 0, TEX, TEX);
    grime(g, rand, 26, 'rgba(255,255,255,0.05)', th.band[1]);
    g.fillStyle = th.band[1];
    g.fillRect(0, 0, TEX, 10);
    g.fillRect(0, TEX - 22, TEX, 22);
    for (let k = 0; k < 9; k++) g.fillRect(rand() * TEX, TEX * 0.3, 3 + rand() * 5, TEX * 0.7);
    grain(g, rand, 0.05);
  });
}
// one tile of the outer wall, 128 x 256 for a tile by a storey: the slab's band at the top, a dark window under it.
// The same picture for every tile, so the wall is one colour all over; a lit window is a pane of its own put over
// the glass (paneTex)
const PANE = { x: 29, y: 104, w: 70, h: 82 }; // the glass in that picture (px)
function facadeTex(th: YardTheme, window: boolean): THREE.CanvasTexture {
  return canvasTex(128, 256, g => {
    // the wall in the evening: a warm grey plaster, darker toward the ground, with the stains rain leaves
    const wall = g.createLinearGradient(0, 0, 0, 256);
    wall.addColorStop(0, th.wall[0]);
    wall.addColorStop(1, th.wall[1]);
    g.fillStyle = wall;
    g.fillRect(0, 0, 128, 256);
    g.fillStyle = th.joint;
    g.fillRect(0, 60, 128, 4); // the joint under the slab
    g.fillRect(0, 0, 2, 256); // the joint between two panels
    g.fillStyle = 'rgba(30,22,30,0.10)';
    if (th.extra === 'ivy') {
      // ivy climbing from the ground, and a crack across the plaster
      g.fillStyle = 'rgba(52,84,44,0.55)';
      for (const [x, w, h] of [
        [4, 14, 150],
        [16, 9, 96],
        [110, 12, 190],
      ] as const)
        g.fillRect(x, 256 - h, w, h);
      g.strokeStyle = 'rgba(25,22,20,0.45)';
      g.beginPath();
      g.moveTo(70, 0);
      g.lineTo(82, 30);
      g.lineTo(76, 58);
      g.stroke();
    }
    if (th.extra === 'units') {
      // pipes down the wall, a cable sagging across it, an air conditioner on its bracket, the stains under it
      g.fillStyle = '#2f2c2b';
      g.fillRect(112, 0, 5, 256);
      g.fillRect(120, 0, 3, 256);
      g.fillStyle = '#26221f';
      g.fillRect(0, 74, 128, 2);
      g.fillRect(0, 232, 128, 3);
      g.fillStyle = '#8c8a84';
      g.fillRect(8, 206, 30, 22);
      g.fillStyle = '#3a3836';
      g.fillRect(12, 210, 22, 14);
      g.fillStyle = 'rgba(20,16,14,0.35)';
      g.fillRect(14, 228, 6, 28);
      g.fillRect(96, 64, 5, 40);
    }
    if (!window) return;
    for (const x of [38, 52, 88]) g.fillRect(x, 190, 3, 46); // streaks under the sill
    // the window: a dark frame, the pane, a sill
    const { x, y, w, h } = PANE;
    g.fillStyle = '#1d191d';
    g.fillRect(x - 4, y - 4, w + 8, h + 8);
    const pane = g.createLinearGradient(x, y, x + w, y + h);
    pane.addColorStop(0, th.pane[0]);
    pane.addColorStop(1, th.pane[1]);
    g.fillStyle = pane;
    g.fillRect(x, y, w, h);
    g.fillStyle = th.glint; // what the sky leaves on the glass
    g.fillRect(x, y, w, 22);
    g.fillStyle = '#1d191d';
    g.fillRect(x + w / 2 - 1, y, 2, h); // the mullion
    g.fillStyle = th.sill;
    g.fillRect(x - 8, y + h + 4, w + 16, 5); // the sill
    if (th.extra === 'units') {
      // a tin awning over the window, and the cage of bars built out round it (every flat has one)
      g.fillStyle = '#4b4a48';
      g.fillRect(x - 12, y - 16, w + 24, 9);
      g.fillStyle = 'rgba(20,18,18,0.5)';
      for (let ax = x - 12; ax < x + w + 12; ax += 6) g.fillRect(ax, y - 16, 2, 9);
      g.strokeStyle = 'rgba(18,16,16,0.85)';
      g.lineWidth = 2;
      g.strokeRect(x - 9, y + 24, w + 18, h - 12);
      for (let bx = x - 3; bx < x + w + 9; bx += 8) {
        g.beginPath();
        g.moveTo(bx, y + 24);
        g.lineTo(bx, y + h + 12);
        g.stroke();
      }
    }
  });
}
// the glass of a lit window: a warm room behind a curtain, or a dark room with a screen on
function paneTex(kind: 'lit' | 'screen'): THREE.CanvasTexture {
  const { w, h } = PANE;
  return canvasTex(w, h, g => {
    if (kind === 'lit') {
      g.fillStyle = '#e6c27c';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(170,120,50,0.35)'; // the folds of a curtain
      for (let cx = 4; cx < w; cx += 9) g.fillRect(cx, 0, 3, h);
    } else {
      g.fillStyle = '#20263a';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(127,166,232,0.25)';
      g.fillRect(22, 20, 44, 50);
      g.fillStyle = '#7fa6e8';
      g.fillRect(38, 34, 18, 26);
    }
    g.fillStyle = '#1d191d';
    g.fillRect(w / 2 - 1, 0, 2, h); // the mullion
  });
}
function yardSkyTex(th: YardTheme): THREE.CanvasTexture {
  return canvasTex(64, 64, g => {
    const sky = g.createLinearGradient(0, 0, 64, 64);
    sky.addColorStop(0, th.sky[0]);
    sky.addColorStop(0.5, th.sky[1]);
    sky.addColorStop(1, th.sky[2]);
    g.fillStyle = sky;
    g.fillRect(0, 0, 64, 64);
  });
}
function yardGroundTex(th: YardTheme): THREE.CanvasTexture {
  return canvasTex(128, 128, g => {
    g.fillStyle = th.ground[0];
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = th.ground[1]; // the paths between the beds
    g.fillRect(56, 0, 16, 128);
    g.fillRect(0, 56, 128, 16);
    g.fillStyle = th.ground[2]; // the beds
    for (const [x, y] of [
      [10, 10],
      [82, 10],
      [10, 82],
      [82, 82],
    ] as const)
      g.fillRect(x, y, 36, 36);
  });
}
// The yard of a building, in the building's own frame: floor 0's ground is at height 0, floor n's at -n * storey.
// `w`: tiles across the map. Where a floor has its balcony, the wall has an opening (no facade tile)
export function buildYardShell(court: Court, w: number, storey: number, biome: Biome): THREE.Group {
  const th = YARDS[biome.code] ?? YARDS.CITY!,
    group = new THREE.Group(),
    is = court.tiles.map(k => k % w),
    js = court.tiles.map(k => (k / w) | 0),
    i0 = Math.min(...is),
    i1 = Math.max(...is) + 1,
    j0 = Math.min(...js),
    j1 = Math.max(...js) + 1,
    top = court.upper - YARD_ABOVE, // the highest storey drawn (above floor 0 when negative)
    bottom = court.lower + YARD_BELOW,
    open = new Set<string>();
  court.balconies.forEach((tiles, n) => tiles.forEach(k => open.add(`${court.upper + n}:${k}`)));
  // every tile of the four walls on every storey: where it stands, which way it faces, the wall tile behind it
  const spots: { x: number; y: number; z: number; turn: number; kind: number }[] = [];
  for (let s = top; s <= bottom; s++) {
    const y = -s * storey + storey / 2,
      put = (x: number, z: number, turn: number, behind: number, n: number) => {
        if (open.has(`${s}:${behind}`)) return;
        // a window on every other tile of a wall (the same columns on every storey), bare wall between
        const d = th.dense || n % 2 ? yardDice(s, n, turn) : -1;
        spots.push({ x, y, z, turn, kind: d < 0 ? -1 : d < th.lit ? 1 : d < th.lit + th.screen ? 2 : 0 });
      };
    for (let i = i0; i < i1; i++) {
      put(tileCenter(i), j0 * T, 0, (j0 - 1) * w + i, i - i0); // the wall on the low-z side faces +z
      put(tileCenter(i), j1 * T, Math.PI, j1 * w + i, i - i0);
    }
    for (let j = j0; j < j1; j++) {
      put(i0 * T, tileCenter(j), Math.PI / 2, j * w + i0 - 1, j - j0);
      put(i1 * T, tileCenter(j), -Math.PI / 2, j * w + i1, j - j0);
    }
  }
  // The wall stands YARD_SKIN inside the yard: in the plane of the tiles' own faces it would flicker against the
  // walls of the floors' balconies. The lit panes stand that much again in front of it
  const at = new THREE.Object3D(),
    place = (mesh: THREE.InstancedMesh, list: typeof spots, out: number, dy: number) => {
      list.forEach((p, n) => {
        at.position.set(p.x + Math.sin(p.turn) * out, p.y + dy, p.z + Math.cos(p.turn) * out);
        at.rotation.set(0, p.turn, 0);
        at.updateMatrix();
        mesh.setMatrixAt(n, at.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    };
  // The wall itself. A sector with a look: its own wall pictures (the ones that can be an outer wall: YardTheme
  // walls / windows), a wall high, and over each the band of the slab, so the yard is painted as richly as the rooms.
  // The plain look: one flat picture a storey high, the lit panes over it
  const look = lookOf(biome);
  if (look) {
    const pic = spots.map(p => {
      const from = p.kind >= 0 ? th.windows : th.walls;
      return from[Math.floor(yardDice(p.x + p.turn, p.y, p.z) * from.length)]! % look.walls.length;
    });
    for (const v of new Set(pic)) {
      const mine = spots.filter((_, n) => pic[n] === v);
      place(
        new THREE.InstancedMesh(
          new THREE.PlaneGeometry(T, WALL_H),
          new THREE.MeshBasicMaterial({ map: look.walls[v]!, fog: false, color: th.shade }),
          mine.length,
        ),
        mine,
        YARD_SKIN,
        (WALL_H - storey) / 2,
      );
    }
    // the light of the rooms that are lit, spilling out round their windows (the pictures' own windows are dark)
    const lit = spots.filter(p => p.kind >= 0 && yardDice(p.z, p.y, p.x + p.turn) < th.lit + th.screen);
    place(
      new THREE.InstancedMesh(
        new THREE.PlaneGeometry(3.4, 3.4),
        new THREE.MeshBasicMaterial({
          map: poolTex(),
          color: th.glow,
          transparent: true,
          opacity: 0.4,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
        }),
        lit.length,
      ),
      lit,
      YARD_SKIN * 2,
      -1.1,
    );
    place(
      new THREE.InstancedMesh(
        new THREE.PlaneGeometry(T, storey - WALL_H),
        new THREE.MeshBasicMaterial({ map: slabBandTex(th), fog: false, color: th.shade }),
        spots.length,
      ),
      spots,
      YARD_SKIN,
      WALL_H / 2,
    );
  }
  for (const window of look ? [] : [true, false]) {
    const mine = spots.filter(p => p.kind >= 0 === window);
    place(
      new THREE.InstancedMesh(
        new THREE.PlaneGeometry(T, storey),
        new THREE.MeshBasicMaterial({ map: facadeTex(th, window) }),
        mine.length,
      ),
      mine,
      YARD_SKIN,
      0,
    );
  }
  // (the lit panes keep their light in the fog: a lit window is seen from far off)
  (['lit', 'screen'] as const).forEach((kind, v) => {
    const mine = look ? [] : spots.filter(p => p.kind === v + 1);
    if (!mine.length) return;
    place(
      new THREE.InstancedMesh(
        new THREE.PlaneGeometry((PANE.w / 128) * T, (PANE.h / 256) * storey),
        new THREE.MeshBasicMaterial({ map: paneTex(kind), fog: false }),
        mine.length,
      ),
      mine,
      YARD_SKIN * 2,
      (0.5 - (PANE.y + PANE.h / 2) / 256) * storey,
    );
  });
  const cx = ((i0 + i1) / 2) * T,
    cz = ((j0 + j1) / 2) * T,
    wide = (i1 - i0) * T,
    deep = (j1 - j0) * T,
    sky = new THREE.Mesh(
      new THREE.PlaneGeometry(wide, deep),
      new THREE.MeshBasicMaterial({ map: yardSkyTex(th), fog: false }),
    ),
    ground = new THREE.Mesh(
      new THREE.PlaneGeometry(wide, deep),
      new THREE.MeshBasicMaterial({ map: yardGroundTex(th), fog: false, color: th.shade }),
    );
  dressYard(
    group,
    th.dress,
    spots.map(p => ({ ...p, window: p.kind >= 0 })),
    { cx, cz, wide, deep, ground: -bottom * storey, sky: -top * storey + storey },
    storey,
    th.shade,
  );
  sky.rotation.x = Math.PI / 2;
  sky.position.set(cx, -top * storey + storey, cz);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx, -bottom * storey, cz);
  group.add(sky, ground);
  return group;
}
// `courtGroup`: on a floor the courtyard passes, what stands in and round it (its galleries, their walls and ceilings,
// the rail) goes into this group and not into `group`, so that it can be drawn alone from the other floors
export function buildFloorMeshes(
  biome: Biome,
  plan: FloorPlan,
  group: THREE.Group,
  rng: Rng,
  courtGroup?: THREE.Group,
): THREE.Group | null {
  // the sector's own look when it has one (world/looks.ts): pictures in a few variants, scattered over the tiles
  const look = lookOf(biome),
    plainTex = biomeTex(biome),
    tex: BiomeTextures = look ? { floor: look.floors[0]!, tile: look.deck, wall: look.walls[0]! } : plainTex,
    all = Array.from({ length: W * H }, (_, k) => k),
    wallSet = new Set(wallTiles().map(([i, j]) => j * W + i));
  plan.shaftWall.forEach((v, k) => {
    if (v) wallSet.add(k);
  });
  const walls = [...wallSet].filter(k => !plan.voids[k]).map(k => [k % W, (k / W) | 0] as [number, number]);
  // the courtyard's square (its open middle, the gallery and the wall round that): those tiles go to courtGroup
  const cis = plan.court && courtGroup ? plan.court.tiles.map(k => k % W) : [],
    cjs = plan.court && courtGroup ? plan.court.tiles.map(k => (k / W) | 0) : [],
    cedge = plan.court?.open ? 1 : 2, // tiles round the middle: a yard's wall; an atrium's gallery and wall
    ci0 = Math.min(...cis) - cedge,
    ci1 = Math.max(...cis) + cedge,
    cj0 = Math.min(...cjs) - cedge,
    cj1 = Math.max(...cjs) + cedge,
    atCourt = (i: number, j: number): boolean => cis.length > 0 && i >= ci0 && i <= ci1 && j >= cj0 && j <= cj1,
    inCourt = (k: number): boolean => atCourt(k % W, (k / W) | 0),
    planes = (tiles: number[], y: number, up: boolean, mat: THREE.Material) => {
      addTilePlanes(
        tiles.filter(k => !inCourt(k)),
        y,
        up,
        mat,
        group,
      );
      if (courtGroup) addTilePlanes(tiles.filter(inCourt), y, up, mat, courtGroup);
    },
    wallBoxes = (map: THREE.Texture, tiles: [number, number][]) => {
      addWalls(
        map,
        tiles.filter(([i, j]) => !atCourt(i, j)),
        group,
      );
      if (courtGroup)
        addWalls(
          map,
          tiles.filter(([i, j]) => atCourt(i, j)),
          courtGroup,
        );
    };
  const floorTiles = all.filter(k => grid[k] === 1 && !plan.noFloor[k]);
  // the boss room's tiles and the ring of tiles round it (its walls and its door)
  const hallRoom = plan.hall ? plan.gen.rooms[plan.hall.room]! : null,
    hallAt = (k: number, ring: number): boolean => {
      if (!hallRoom) return false;
      const i = k % W,
        j = (k / W) | 0;
      return (
        i >= hallRoom.x - ring &&
        i < hallRoom.x + hallRoom.w + ring &&
        j >= hallRoom.y - ring &&
        j < hallRoom.y + hallRoom.h + ring
      );
    };
  if (look) {
    look.floors.forEach((map, v) =>
      planes(
        floorTiles.filter(k => variantOf(k, look.floors.length, FLOOR_PLAIN_SHARE) === v),
        0,
        true,
        new THREE.MeshBasicMaterial({ map }),
      ),
    );
    look.walls.forEach((map, v) =>
      wallBoxes(
        map,
        walls.filter(([i, j]) => wallPic(plan.gen, j * W + i, look.walls.length, look.laneWalls) === v),
      ),
    );
  } else {
    tex.floor.repeat.set(1, 1);
    planes(floorTiles, 0, true, new THREE.MeshBasicMaterial({ map: tex.floor }));
    wallBoxes(tex.wall, walls);
  }
  addDecks(tex, group, look?.deckSide);
  addRamps(tex, group);
  buildHazardMesh(biome, plan.gen.hazard, group);
  const dark = look
    ? new THREE.MeshBasicMaterial({ map: look.ceiling })
    : new THREE.MeshBasicMaterial({ color: new THREE.Color(biome.wall).multiplyScalar(CEILING_SHADE) });
  planes(
    // not over the boss room, nor over its door (the wall above the door is that tile's ceiling)
    all.filter(k => (grid[k] === 1 || plan.voids[k]) && !plan.noCeil[k] && !hallAt(k, 1)),
    WALL_H,
    false,
    dark,
  );
  let hallTop: THREE.Group | null = null;
  if (hallRoom) {
    hallTop = new THREE.Group();
    addTilePlanes(
      all.filter(k => hallAt(k, 0)),
      HALL_H,
      false,
      dark,
      hallTop,
    );
    // the walls go on up: over the ring round the room (its door too) and over the pillars in it
    const upper = all.filter(k => hallAt(k, 1) && (!hallAt(k, 0) || grid[k] !== 1)),
      boxes = new THREE.InstancedMesh(
        new THREE.BoxGeometry(T, HALL_H - WALL_H, T),
        new THREE.MeshBasicMaterial({ map: tex.wall }),
        upper.length,
      ),
      matrix = new THREE.Matrix4();
    upper.forEach((k, n) => {
      matrix.makeTranslation(tileCenter(k % W), (WALL_H + HALL_H) / 2, tileCenter((k / W) | 0));
      boxes.setMatrixAt(n, matrix);
    });
    boxes.instanceMatrix.needsUpdate = true;
    hallTop.add(boxes);
    group.add(hallTop);
  }
  // between this floor's ceiling and the next floor's ground, round a stairwell or shaft that goes up
  const fills = all.filter(k => plan.shaft[k] && !plan.noCeil[k]);
  for (const [fill, into] of [
    [fills.filter(k => !inCourt(k)), group],
    [courtGroup ? fills.filter(inCourt) : [], courtGroup ?? group],
  ] as [number[], THREE.Group][]) {
    if (!fill.length) continue;
    const boxes = new THREE.InstancedMesh(
        // a little short at both ends: its top would lie in the plane of the next floor's ground and its bottom in the
        // plane of this floor's ceiling, and two faces in one plane flicker
        new THREE.BoxGeometry(T, FLOOR_H - WALL_H - 2 * SHAFT_FILL_GAP, T),
        new THREE.MeshBasicMaterial({ map: tex.wall }),
        fill.length,
      ),
      matrix = new THREE.Matrix4();
    fill.forEach((k, n) => {
      matrix.makeTranslation(tileCenter(k % W), (WALL_H + FLOOR_H) / 2, tileCenter((k / W) | 0));
      boxes.setMatrixAt(n, matrix);
    });
    boxes.instanceMatrix.needsUpdate = true;
    into.add(boxes);
  }
  if (plan.court) addCourt(plan.court, courtGroup ?? group, biome.code);
  // a sector with a look brings its own signs; the plain neon bars are for the sectors without one
  if (look) look.props(plan, group, rng);
  else if (biome.gen.neon) addNeonSigns(walls, group, rng);
  return hallTop;
}

// The three.js part of a level: floor, walls, decks, ramps, cover, hazard floor, ceiling and neon signs. Reads the
// tile world (set from gen first). rng only places the signs, so the same seed gives the same look.
export function buildLevelMeshes(biome: Biome, isArena: boolean, gen: GeneratedLevel, group: THREE.Group, rng: Rng) {
  const tex = biomeTex(biome);
  const walls = wallTiles();
  addFloor(tex, group);
  addWalls(tex.wall, walls, group);
  addDecks(tex, group);
  addRamps(tex, group);
  buildHazardMesh(biome, gen.hazard, group);
  // sectors with gen.ceiling / gen.neon
  if (biome.gen.ceiling && !isArena) addCeiling(biome, group);
  if (biome.gen.neon && !isArena) addNeonSigns(walls, group, rng);
}

// what hangs in an atrium, in the building's own frame (see buildYardShell): from under its skylight to its ground
export function buildAtriumProps(court: Court, w: number, storey: number, biome: Biome): THREE.Group {
  const group = new THREE.Group(),
    is = court.tiles.map(k => k % w),
    js = court.tiles.map(k => (k / w) | 0),
    i0 = Math.min(...is),
    i1 = Math.max(...is) + 1,
    j0 = Math.min(...js),
    j1 = Math.max(...js) + 1;
  dressAtrium(group, biome.code, {
    cx: ((i0 + i1) / 2) * T,
    cz: ((j0 + j1) / 2) * T,
    wide: (i1 - i0) * T,
    deep: (j1 - j0) * T,
    ground: -court.lower * storey,
    sky: -court.upper * storey + WALL_H,
  });
  return group;
}
