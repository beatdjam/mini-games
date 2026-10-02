import * as THREE from 'three';
import { pick, rand, randi, shuffle } from '@engine/core/util.ts';
import { clearWorld } from '@engine/core/world.ts';
import { UP, disposeTree, scene, textSprite } from '@engine/render/render.ts';
import { clearFx } from '@engine/render/fx.ts';
import {
  H,
  RISE,
  T,
  W,
  computeFlow,
  cover,
  floorY,
  flow,
  grid,
  hgt,
  isSolid,
  ramp,
  setTileWorld,
  tileIndex,
  walkable,
} from '@engine/world/tiles.ts';
import { clearPool } from '@engine/world/projectiles.ts';
import { COVER_H, PLAT_H, PORTAL, WALL_H } from '../data/level.ts';
import { BOSS_META } from '../data/bosses.ts';
import { BIOMES } from '../data/biomes.ts';
import type { Biome, PortalKind } from '../data/types.ts';
import { biomeTex } from './render.ts';
import { eBullets, enemies, pBullets, removeEnemyMesh, setBoss, setNear } from './entities.ts';
import { player, damagePlayer, damageScaleAt, run } from '../actors/player.ts';
import { COLOR } from '../data/colors.ts';
// ---- tuning numbers used only here (the per-sector numbers are in data/biomes.ts gen) ----
const GEN_MAP_SIZE = 36; // default map side (tiles)
const GEN_ROOM_COUNT: [number, number] = [5, 6]; // default number of rooms (min, max)
const GEN_ROOM_SIZE: [number, number] = [4, 7]; // default room side (min, max, tiles)
const GEN_ROOM_TRIES = 1000; // attempts to place the rooms
const ROOM_GAP = 2; // rooms keep this many tiles apart
const EXTRA_LINK_MIN_ROOMS = 4; // with more rooms than this, one extra corridor makes a loop
const BIG_ROOM = 6; // a room at least this wide and tall (tiles) can hold a platform or pillars
const PILLAR_CHANCE = 0.5; // chance a big room (without rubble) gets two pillars
const BRIDGE_MIN_LEN = 5; // shortest straight corridor run (tiles) that can become a walkway
const HAZARD_TRIES = 2000; // attempts to place the hazard floors
const ARENA_SIZE = 20,
  ARENA_FROM = 4,
  ARENA_TO = 16; // boss arena: map side, floor from tile .. to tile
const NEON_COUNT = 90; // neon signs per level
const ARENA_FOG_NEAR = 6; // fog start in boss arenas (m)
const ARENA_FOG_FAR_MIN = 50; // fog end in boss arenas is at least this (m)
const SPOT_JITTER = 1; // random spots in a room scatter this far from the tile centre (m)
const SPOT_TRIES = 40; // attempts to find a free random spot
const REVEAL_R2 = 18; // map reveal radius around the player, squared (tiles)
const REVEAL_BOX = 4; // ... searched in this many tiles each way
const HAZARD_CYCLE = 3; // hazard floor cycle (s): live, then off
const HAZARD_LIVE = 1.4; // seconds live (an area starts right after this: hazards off)
const HAZARD_WARN_FROM = 2.5; // blinks from here to the end of the cycle
const HAZARD_DMG = 7; // hazard floor damage (x damageScaleAt)
const HAZARD_REACH_Y = 0.3; // standing this far above the floor still gets hurt (m)
// a room on the tile grid (tiles); plat = has a raised deck
export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  plat?: boolean;
}
// a gate: kind 'next' (on to the next area) or 'extract' (back to base)
// t: seconds since it appeared; clear: the player has been away from it since then (both needed before it works)
export interface Portal {
  x: number;
  z: number;
  g: THREE.Group;
  ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  disc: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  kind: PortalKind;
  color: number;
  t: number;
  clear: boolean;
}
export type LevelMaps = ReturnType<typeof newMaps>;
let hazMat: THREE.MeshBasicMaterial | null = null; // material of the hazard floor
let hazT = 0; // hazard floor clock (s)
export function setHazardClock(v: number) {
  hazT = v;
} // tests
// the level being played: built as a whole by buildLevel, replaced (never patched field by field) on the next one
export interface Level {
  biome: Biome; // sector of this level
  arena: boolean; // a boss arena
  rooms: Room[];
  roomOf: Int8Array; // per tile: index of the room it is in (-1 = none)
  seen: Uint8Array; // per tile: shown on the map (filled in as the player explores)
  hazardTiles: Uint8Array; // per tile: hazard floor
  roomCount: number[]; // enemies left per room (a room is cleared at 0)
  portals: Portal[];
  startIdx: number; // room index of the start
  exitIdx: number; // room index of the exit
  group: THREE.Group | null; // the three.js group holding the level's meshes
}
function emptyLevel(): Level {
  return {
    biome: BIOMES[0],
    arena: false,
    rooms: [],
    roomOf: new Int8Array(0),
    seen: new Uint8Array(0),
    hazardTiles: new Uint8Array(0),
    roomCount: [],
    portals: [],
    startIdx: 0,
    exitIdx: 0,
    group: null,
  };
}
// replaced only by buildLevel (and emptied piecewise by clearLevel)
export let level: Level = emptyLevel();

// ---------- generators ----------
export function newMaps(w: number, h: number) {
  return {
    g: new Uint8Array(w * h),
    hg: new Float32Array(w * h),
    rp: new Int8Array(w * h).fill(-1),
    cv: new Uint8Array(w * h),
    hz: new Uint8Array(w * h),
    ro: new Int8Array(w * h).fill(-1),
  };
}
export function genRooms(o: Record<string, any>) {
  const w: number = o.map || GEN_MAP_SIZE,
    h = w,
    M = newMaps(w, h),
    g = M.g,
    rs: Room[] = [];
  const target = randi(o.countMin || GEN_ROOM_COUNT[0], o.countMax || GEN_ROOM_COUNT[1]),
    rmin = o.roomMin || GEN_ROOM_SIZE[0],
    rmax = o.roomMax || GEN_ROOM_SIZE[1],
    cw = o.corridorW || 1;
  let tries = 0;
  while (rs.length < target && tries++ < GEN_ROOM_TRIES) {
    const rw = randi(rmin, rmax),
      rh = randi(rmin, rmax),
      x = randi(1, w - rw - 1),
      y = randi(1, h - rh - 1);
    if (
      rs.some(
        q => x < q.x + q.w + ROOM_GAP && x + rw + ROOM_GAP > q.x && y < q.y + q.h + ROOM_GAP && y + rh + ROOM_GAP > q.y,
      )
    )
      continue;
    rs.push({ x, y, w: rw, h: rh });
  }
  const carve = (i: number, j: number) => {
    for (let a = 0; a < cw; a++)
      for (let b = 0; b < cw; b++) {
        const x = i + a,
          y = j + b;
        if (x > 0 && y > 0 && x < w - 1 && y < h - 1) g[y * w + x] = 1;
      }
  };
  rs.forEach(r => {
    for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) g[j * w + i] = 1;
  });
  const ctr = (r: Room) => [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)];
  const corridor = (a: Room, b: Room) => {
    let [x, y] = ctr(a);
    const [tx, ty] = ctr(b);
    const sx = () => {
      while (x !== tx) {
        carve(x, y);
        x += Math.sign(tx - x);
      }
    };
    const sy = () => {
      while (y !== ty) {
        carve(x, y);
        y += Math.sign(ty - y);
      }
    };
    if (Math.random() < 0.5) {
      sx();
      sy();
    } else {
      sy();
      sx();
    }
    carve(x, y);
  };
  const order = [rs[0]],
    rest = rs.slice(1);
  const dist = (a: Room, b: Room) => Math.hypot(a.x + a.w / 2 - b.x - b.w / 2, a.y + a.h / 2 - b.y - b.h / 2);
  while (rest.length) {
    const last = order[order.length - 1];
    rest.sort((a, b) => dist(a, last) - dist(b, last));
    order.push(rest.shift()!);
  }
  for (let k = 1; k < order.length; k++) corridor(order[k - 1], order[k]);
  if (order.length > EXTRA_LINK_MIN_ROOMS) corridor(order[0], order[randi(2, order.length - 1)]);
  rs.forEach((r, idx) => {
    for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) M.ro[j * w + i] = idx;
  });
  rs.forEach(r => {
    const big = r.w >= BIG_ROOM && r.h >= BIG_ROOM;
    if (big && Math.random() < (o.platform || 0)) addPlatform(M, w, r);
    else if (big && !o.rubble && Math.random() < PILLAR_CHANCE) {
      const [cx, cy] = ctr(r);
      [
        [r.x + 1, r.y + 1],
        [r.x + r.w - 2, r.y + r.h - 2],
      ].forEach(([i, j]) => {
        if (i !== cx || j !== cy) g[j * w + i] = 0;
      });
    }
    if (o.rubble) addRubble(M, w, r, o.rubble);
  });
  if (o.bridges) addBridges(M, w, h, o.bridges);
  if (o.hazard) addHazards(M, w, h, o.hazard.count);
  return { W: w, H: h, M, rooms: rs };
}
// raised deck inside the room; the outer ring stays at ground level so every doorway still connects
export function addPlatform(M: LevelMaps, w: number, r: Room) {
  for (let j = r.y + 2; j <= r.y + r.h - 2; j++)
    for (let i = r.x + 1; i <= r.x + r.w - 2; i++) M.hg[j * w + i] = PLAT_H;
  const k = (r.y + 1) * w + Math.floor(r.x + r.w / 2);
  M.rp[k] = 2;
  M.hg[k] = 0;
  r.plat = true;
}
export function addRubble(M: LevelMaps, w: number, r: Room, rate: number) {
  const cx = Math.floor(r.x + r.w / 2),
    cy = Math.floor(r.y + r.h / 2);
  for (let j = r.y + 1; j <= r.y + r.h - 2; j++)
    for (let i = r.x + 1; i <= r.x + r.w - 2; i++) {
      const k = j * w + i;
      if ((i === cx && j === cy) || M.hg[k] > 0 || M.rp[k] >= 0 || Math.random() > rate) continue;
      let ok = true;
      for (let dj = -1; dj <= 1 && ok; dj++)
        for (let di = -1; di <= 1; di++) {
          const n = (j + dj) * w + i + di;
          if (M.cv[n] || M.rp[n] >= 0 || M.hg[n] > 0) {
            ok = false;
            break;
          }
        }
      if (ok) {
        M.cv[k] = 1;
        M.hg[k] = COVER_H;
      }
    }
}
// straight 1-wide corridor runs (walls on both sides) become raised walkways with a ramp at each end
export function addBridges(M: LevelMaps, w: number, h: number, count: number) {
  const g = M.g,
    free = (k: number) => g[k] === 1 && M.ro[k] < 0 && M.hg[k] === 0 && M.rp[k] < 0 && !M.cv[k] && !M.hz[k];
  const runs: { hor: boolean; a: number; b: number; c: number }[] = [];
  for (let j = 1; j < h - 1; j++) {
    let i0 = -1;
    for (let i = 1; i < w; i++) {
      const k = j * w + i,
        ok = i < w - 1 && free(k) && !g[k - w] && !g[k + w];
      if (ok && i0 < 0) i0 = i;
      if (!ok && i0 >= 0) {
        if (i - i0 >= BRIDGE_MIN_LEN) runs.push({ hor: true, a: i0, b: i - 1, c: j });
        i0 = -1;
      }
    }
  }
  for (let i = 1; i < w - 1; i++) {
    let j0 = -1;
    for (let j = 1; j < h; j++) {
      const k = j * w + i,
        ok = j < h - 1 && free(k) && !g[k - 1] && !g[k + 1];
      if (ok && j0 < 0) j0 = j;
      if (!ok && j0 >= 0) {
        if (j - j0 >= BRIDGE_MIN_LEN) runs.push({ hor: false, a: j0, b: j - 1, c: i });
        j0 = -1;
      }
    }
  }
  shuffle(runs)
    .slice(0, count)
    .forEach(r => {
      const K = (t: number) => (r.hor ? r.c * w + t : t * w + r.c);
      M.rp[K(r.a)] = r.hor ? 0 : 2;
      M.rp[K(r.b)] = r.hor ? 1 : 3;
      for (let t = r.a + 1; t < r.b; t++) M.hg[K(t)] = PLAT_H;
    });
}
export function addHazards(M: LevelMaps, w: number, h: number, count: number) {
  let placed = 0,
    tries = 0;
  while (placed < count && tries++ < HAZARD_TRIES) {
    const i = randi(1, w - 2),
      j = randi(1, h - 2),
      k = j * w + i;
    if (M.g[k] !== 1 || M.hg[k] !== 0 || M.rp[k] >= 0 || M.cv[k] || M.hz[k]) continue;
    M.hz[k] = 1;
    placed++;
  }
}
export function genArena(withPillars: boolean) {
  const w = ARENA_SIZE,
    h = ARENA_SIZE,
    M = newMaps(w, h);
  for (let j = ARENA_FROM; j < ARENA_TO; j++) for (let i = ARENA_FROM; i < ARENA_TO; i++) M.g[j * w + i] = 1;
  if (withPillars)
    [
      [6, 6],
      [13, 6],
      [6, 13],
      [13, 13],
    ].forEach(([i, j]) => {
      M.g[j * w + i] = 0;
    });
  return {
    W: w,
    H: h,
    M,
    rooms: [{ x: ARENA_FROM, y: ARENA_FROM, w: ARENA_TO - ARENA_FROM, h: ARENA_TO - ARENA_FROM }],
  };
}

export function clearLevel() {
  if (level.group) {
    disposeTree(level.group);
    scene.remove(level.group);
    level.group = null;
  }
  enemies.forEach(removeEnemyMesh);
  clearWorld();
  clearPool(pBullets);
  clearPool(eBullets);
  clearFx();
  level.portals = [];
  setBoss(null);
  setNear(null);
  hazMat = null;
}

// wedge rising toward +x across one tile; rotated per ramp direction
export function wedgeGeo() {
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
export const RAMP_ROT = [0, Math.PI, -Math.PI / 2, Math.PI / 2];

export function buildLevel(biome: Biome, isArena: boolean, bossKind?: string | null) {
  clearLevel();
  const gen = isArena ? genArena(BOSS_META[bossKind!].pillars) : genRooms(biome.gen);
  const M = gen.M;
  setTileWorld({
    W: gen.W,
    H: gen.H,
    grid: M.g,
    hgt: M.hg,
    ramp: M.rp,
    cover: M.cv,
    flow: new Int16Array(gen.W * gen.H),
    flowQ: new Int32Array(gen.W * gen.H),
  });
  const lg = new THREE.Group();
  // a new object per build; startIdx, exitIdx and portals are filled in below, before anything else reads it
  level = {
    biome,
    arena: isArena,
    rooms: gen.rooms,
    roomOf: M.ro,
    seen: new Uint8Array(W * H),
    hazardTiles: M.hz,
    roomCount: new Array(gen.rooms.length).fill(0),
    portals: [],
    startIdx: 0,
    exitIdx: 0,
    group: lg,
  };
  scene.add(lg);
  const tex = biomeTex(biome);
  tex.floor.repeat.set(W, H);
  const fgeo = new THREE.PlaneGeometry(W * T, H * T);
  fgeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(fgeo, new THREE.MeshBasicMaterial({ map: tex.floor }));
  floor.position.set((W * T) / 2, 0, (H * T) / 2);
  lg.add(floor);
  const m = new THREE.Matrix4();
  // walls
  const list: [number, number][] = [];
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      if (grid[j * W + i] === 1) continue;
      let near = false;
      for (let dj = -1; dj <= 1 && !near; dj++)
        for (let di = -1; di <= 1; di++) {
          const a = i + di,
            b = j + dj;
          if (a >= 0 && b >= 0 && a < W && b < H && grid[b * W + a] === 1) {
            near = true;
            break;
          }
        }
      if (near) list.push([i, j]);
    }
  const inst = new THREE.InstancedMesh(
    new THREE.BoxGeometry(T, WALL_H, T),
    new THREE.MeshBasicMaterial({ map: tex.wall }),
    list.length,
  );
  list.forEach(([i, j], k) => {
    m.makeTranslation((i + 0.5) * T, WALL_H / 2, (j + 0.5) * T);
    inst.setMatrixAt(k, m);
  });
  inst.instanceMatrix.needsUpdate = true;
  lg.add(inst);
  // raised decks, walkways and cover
  const raised: number[] = [];
  for (let k = 0; k < W * H; k++) if (grid[k] === 1 && ramp[k] < 0 && hgt[k] > 0) raised.push(k);
  const side = new THREE.MeshBasicMaterial({ map: tex.wall }),
    top = new THREE.MeshBasicMaterial({ map: tex.tile });
  const coverSide = new THREE.MeshBasicMaterial({ map: tex.wall, color: 0x9a9a9a });
  (
    [
      [raised.filter(k => !cover[k]), side],
      [raised.filter(k => cover[k]), coverSide],
    ] as [number[], THREE.Material][]
  ).forEach(([ks, sm]) => {
    if (!ks.length) return;
    const bg = new THREE.BoxGeometry(T, 1, T);
    bg.translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(bg, [sm, sm, top, sm, sm, sm], ks.length);
    ks.forEach((k, n) => {
      m.makeScale(1, hgt[k], 1);
      m.setPosition(((k % W) + 0.5) * T, 0, (((k / W) | 0) + 0.5) * T);
      im.setMatrixAt(n, m);
    });
    im.instanceMatrix.needsUpdate = true;
    lg.add(im);
  });
  const rampTop = new THREE.MeshBasicMaterial({ map: tex.tile, side: THREE.DoubleSide }),
    rampSide = new THREE.MeshBasicMaterial({ map: tex.wall, side: THREE.DoubleSide });
  const wg = wedgeGeo();
  for (let k = 0; k < W * H; k++) {
    if (grid[k] !== 1 || ramp[k] < 0) continue;
    const rm = new THREE.Mesh(wg, [rampTop, rampSide]);
    rm.position.set(((k % W) + 0.5) * T, hgt[k], (((k / W) | 0) + 0.5) * T);
    rm.rotation.y = RAMP_ROT[ramp[k]];
    lg.add(rm);
  }
  // the start room (picked before the hazard floor is drawn): none in it or its doorways, so the first steps of an
  // area can't land on one (the spot is the room's middle, so a hazard there put the player right next to others)
  if (!isArena) {
    level.startIdx = randi(0, level.rooms.length - 1);
    const R = level.rooms[level.startIdx]!;
    for (let j = R.y - 1; j <= R.y + R.h; j++)
      for (let i = R.x - 1; i <= R.x + R.w; i++)
        if (i >= 0 && j >= 0 && i < W && j < H) level.hazardTiles[j * W + i] = 0;
  }
  // hazard floor
  const hz: number[] = [];
  for (let k = 0; k < W * H; k++) if (level.hazardTiles[k]) hz.push(k);
  if (hz.length) {
    hazMat = new THREE.MeshBasicMaterial({
      color: biome.gen.hazard.color,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });
    const pg = new THREE.PlaneGeometry(T * 0.94, T * 0.94);
    pg.rotateX(-Math.PI / 2);
    const im = new THREE.InstancedMesh(pg, hazMat, hz.length);
    hz.forEach((k, n) => {
      m.makeTranslation(((k % W) + 0.5) * T, hgt[k] + 0.04, (((k / W) | 0) + 0.5) * T);
      im.setMatrixAt(n, m);
    });
    im.instanceMatrix.needsUpdate = true;
    lg.add(im);
  }
  hazT = HAZARD_LIVE; // an area starts with the hazards off (about 1 s before they blink, 1.6 s before they go live)
  // ceiling and neon signs (sectors with gen.ceiling / gen.neon)
  if (biome.gen.ceiling && !isArena) {
    const cg = new THREE.PlaneGeometry(W * T, H * T);
    cg.rotateX(Math.PI / 2);
    const ceil = new THREE.Mesh(
      cg,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(biome.wall).multiplyScalar(0.7) }),
    );
    ceil.position.set((W * T) / 2, WALL_H, (H * T) / 2);
    lg.add(ceil);
  }
  if (biome.gen.neon && !isArena) {
    const spots: [number, number, number, number][] = [];
    list.forEach(([i, j]) =>
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].forEach(([a, b]) => {
        if (!isSolid(i + a, j + b)) spots.push([i, j, a, b]);
      }),
    );
    const pickSpots = shuffle(spots).slice(0, NEON_COUNT),
      colors = [0xff3d8a, 0x3dffb4, 0xffd23d, 0x4dc3ff, COLOR.violet];
    const im = new THREE.InstancedMesh(
      new THREE.BoxGeometry(T * 0.55, 0.45, 0.08),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      pickSpots.length,
    );
    const q = new THREE.Quaternion(),
      s1 = new THREE.Vector3(1, 1, 1),
      c = new THREE.Color();
    pickSpots.forEach(([i, j, a, b], n) => {
      q.setFromAxisAngle(UP, a !== 0 ? Math.PI / 2 : 0);
      m.compose(
        new THREE.Vector3((i + 0.5 + a * 0.52) * T, rand(2.4, 4.8), (j + 0.5 + b * 0.52) * T),
        q,
        s1.set(rand(0.5, 1.2), rand(0.7, 1.6), 1),
      );
      im.setMatrixAt(n, m);
      im.setColorAt(n, c.setHex(pick(colors)));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    lg.add(im);
  }
  (scene.fog as THREE.Fog).color.setHex(biome.fog);
  (scene.background as THREE.Color).setHex(biome.fog);
  (scene.fog as THREE.Fog).near = isArena ? ARENA_FOG_NEAR : biome.fogNear;
  (scene.fog as THREE.Fog).far = isArena ? Math.max(ARENA_FOG_FAR_MIN, biome.fogFar) : biome.fogFar;
  if (isArena) return;
  const [sx, sz] = roomSpot(level.rooms[level.startIdx]);
  computeFlow(Math.floor(sx / T), Math.floor(sz / T));
  let best = -1;
  level.rooms.forEach((r, idx) => {
    const [x, z] = roomSpot(r),
      d = flow[tileIndex(x, z)];
    if (d > best) {
      best = d;
      level.exitIdx = idx;
    }
  });
}
// nearest plain floor tile to the room centre (the centre itself can be cover or a ramp)
export function roomSpot(r: Room): [number, number] {
  const cx = Math.floor(r.x + r.w / 2),
    cy = Math.floor(r.y + r.h / 2);
  let best: [number, number] | null = null,
    bd = Infinity;
  for (let j = r.y; j < r.y + r.h; j++)
    for (let i = r.x; i < r.x + r.w; i++) {
      const k = j * W + i;
      if (!walkable(k) || level.hazardTiles[k]) continue;
      const d = (i - cx) * (i - cx) + (j - cy) * (j - cy);
      if (d < bd) {
        bd = d;
        best = [(i + 0.5) * T, (j + 0.5) * T];
      }
    }
  return best || [(cx + 0.5) * T, (cy + 0.5) * T];
}
export function randomTileIn(r: Room): [number, number] {
  for (let k = 0; k < SPOT_TRIES; k++) {
    const i = randi(r.x, r.x + r.w - 1),
      j = randi(r.y, r.y + r.h - 1);
    const k = j * W + i;
    if (walkable(k) && !level.hazardTiles[k])
      return [(i + 0.5) * T + rand(-SPOT_JITTER, SPOT_JITTER), (j + 0.5) * T + rand(-SPOT_JITTER, SPOT_JITTER)];
  }
  return roomSpot(r);
}
export function reveal(ti: number, tj: number) {
  if (level.arena) {
    level.seen.fill(1);
    return;
  }
  for (let dj = -REVEAL_BOX; dj <= REVEAL_BOX; dj++)
    for (let di = -REVEAL_BOX; di <= REVEAL_BOX; di++) {
      if (di * di + dj * dj > REVEAL_R2) continue;
      const i = ti + di,
        j = tj + dj;
      if (i >= 0 && j >= 0 && i < W && j < H) level.seen[j * W + i] = 1;
    }
  const r = level.roomOf[tj * W + ti];
  if (r >= 0) {
    const R = level.rooms[r];
    for (let j = R.y - 1; j <= R.y + R.h; j++)
      for (let i = R.x - 1; i <= R.x + R.w; i++) if (i >= 0 && j >= 0 && i < W && j < H) level.seen[j * W + i] = 1;
  }
}
// hazard floors cycle: 1.4s live, 1.6s off, blinking for the last 0.5s before going live
export function hazardState() {
  const t = hazT % HAZARD_CYCLE;
  return t < HAZARD_LIVE ? 'on' : t > HAZARD_WARN_FROM ? 'warn' : 'off';
}
export function updateHazards(dt: number) {
  if (!hazMat) return;
  hazT += dt;
  const st = hazardState();
  hazMat.opacity = st === 'on' ? 0.85 : st === 'warn' ? (Math.sin(hazT * 30) > 0 ? 0.55 : 0.15) : 0.15;
  const i = Math.floor(player.x / T),
    j = Math.floor(player.z / T),
    k = j * W + i;
  if (st === 'on' && i >= 0 && j >= 0 && i < W && j < H && level.hazardTiles[k] && player.fy < hgt[k] + HAZARD_REACH_Y)
    damagePlayer(HAZARD_DMG * damageScaleAt(run.stage));
}
export function makePortal(x: number, z: number, color: number, kind: PortalKind, label: string) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.5, 0.12, 8, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 }),
  );
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.4, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  const base = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 1.9, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = -1.55;
  g.add(ring, disc, base);
  if (label) {
    const s = textSprite(label, '#' + color.toString(16).padStart(6, '0'));
    s.position.y = 2.4;
    g.add(s);
  }
  g.position.set(x, floorY(x, z) + PORTAL.centerY, z);
  level.group!.add(g); // gates are made after the level is built
  const clear = !player || Math.hypot(player.x - x, player.z - z) >= PORTAL.clearR; // opened underfoot: wait until the player steps off
  level.portals.push({ x, z, g, ring, disc, kind, color, t: 0, clear });
}
