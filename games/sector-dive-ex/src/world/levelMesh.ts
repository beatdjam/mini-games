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
import { FLOOR_PLAIN_SHARE, WALL_PLAIN_SHARE, lookOf, variantOf } from './looks.ts';
import type { FloorPlan } from './building.ts';
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
function addDecks(tex: BiomeTextures, group: THREE.Group) {
  const matrix = new THREE.Matrix4();
  const raised: number[] = [];
  for (let k = 0; k < W * H; k++) if (grid[k] === 1 && ramp[k] < 0 && hgt[k] > 0) raised.push(k);
  const sideMat = new THREE.MeshBasicMaterial({ map: tex.wall }),
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
// The courtyard's open middle on one floor (world/building.ts): where it is a hole, a rail of glass round it (a
// steel top rail and posts, a pane under it; the tile world keeps the player out, the rail shows why); on its top
// floor a skylight in the ceiling, and on its ground the light that falls through it
const RAIL_H = 1.15,
  RAIL_T = 0.08; // the rail's height and thickness (m)
const SKYLIGHT = 0xdfe9f2, // the sky seen through the roof: pale, a little cold against the sector's amber
  SKY_POOL_OPACITY = 0.16;
const EVENING_LIGHT = 0xffb86a, // what the low sun leaves on the ground of a yard
  EVENING_POOL_OPACITY = 0.12;
// the sky over a yard, seen from below: the evening, amber at one edge going over to a dusky blue, a few thin clouds
let skyTex: THREE.CanvasTexture | null = null;
function eveningSky(): THREE.CanvasTexture {
  if (skyTex) return skyTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!,
    grad = g.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, '#f2a65a');
  grad.addColorStop(0.35, '#d98a6a');
  grad.addColorStop(0.7, '#7d7f9e');
  grad.addColorStop(1, '#3e4a6b');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  g.globalAlpha = 0.22;
  g.fillStyle = '#ffe2c4';
  for (const [x, y, w, h] of [
    [30, 70, 150, 10],
    [90, 120, 140, 8],
    [10, 170, 110, 7],
    [130, 200, 120, 9],
  ] as const) {
    g.beginPath();
    g.ellipse(x + w / 2, y, w / 2, h, -0.5, 0, Math.PI * 2);
    g.fill();
  }
  skyTex = new THREE.CanvasTexture(c);
  return skyTex;
}
function addCourt(court: NonNullable<FloorPlan['court']>, group: THREE.Group) {
  const is = court.tiles.map(k => k % W),
    js = court.tiles.map(k => (k / W) | 0),
    i0 = Math.min(...is),
    i1 = Math.max(...is) + 1,
    j0 = Math.min(...js),
    j1 = Math.max(...js) + 1,
    cx = ((i0 + i1) / 2) * T,
    cz = ((j0 + j1) / 2) * T,
    wide = (i1 - i0) * T,
    deep = (j1 - j0) * T;
  if (!court.ground) {
    const steel = new THREE.MeshBasicMaterial({ color: 0x2c3136 }),
      glass = new THREE.MeshBasicMaterial({ color: 0x9fb6c4, transparent: true, opacity: 0.16, depthWrite: false });
    // (one run along each side of the hole; the middle is a plain rectangle)
    const side = (x: number, z: number, lenX: number, lenZ: number) => {
      const top = new THREE.Mesh(new THREE.BoxGeometry(lenX || RAIL_T, RAIL_T, lenZ || RAIL_T), steel);
      top.position.set(x, RAIL_H, z);
      const pane = new THREE.Mesh(new THREE.BoxGeometry(lenX || RAIL_T / 2, RAIL_H - 0.12, lenZ || RAIL_T / 2), glass);
      pane.position.set(x, (RAIL_H - 0.12) / 2 + 0.06, z);
      group.add(top, pane);
      const n = Math.round((lenX || lenZ) / T);
      for (let p = 0; p <= n; p++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(RAIL_T, RAIL_H, RAIL_T), steel);
        post.position.set(lenX ? x - lenX / 2 + p * T : x, RAIL_H / 2, lenZ ? z - lenZ / 2 + p * T : z);
        group.add(post);
      }
    };
    side(cx, j0 * T, wide, 0);
    side(cx, j1 * T, wide, 0);
    side(i0 * T, cz, 0, deep);
    side(i1 * T, cz, 0, deep);
  }
  if (court.top) {
    // the sky over the yard: it is open at the top, with the wall round it going up to the roof's edge
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(court.open ? wide : wide - 0.6, court.open ? deep : deep - 0.6),
      court.open
        ? new THREE.MeshBasicMaterial({ map: eveningSky(), fog: false })
        : new THREE.MeshBasicMaterial({ color: SKYLIGHT }),
    );
    sky.rotation.x = Math.PI / 2;
    // (a yard: at the roof's edge, a floor's height up; an atrium: a pane a little under the ceiling, framed by bars)
    sky.position.set(cx, court.open ? FLOOR_H - 0.05 : WALL_H - 0.03, cz);
    group.add(sky);
    const bar = new THREE.MeshBasicMaterial({ color: 0x1b1e21 });
    for (let n = 1; !court.open && n < i1 - i0; n++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, deep - 0.6), bar);
      m.position.set(i0 * T + n * T, WALL_H - 0.08, cz);
      group.add(m);
    }
    for (let n = 1; !court.open && n < j1 - j0; n++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(wide - 0.6, 0.1, 0.12), bar);
      m.position.set(cx, WALL_H - 0.08, j0 * T + n * T);
      group.add(m);
    }
  }
  if (court.ground) {
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(wide, deep),
      new THREE.MeshBasicMaterial({
        color: court.open ? EVENING_LIGHT : SKYLIGHT,
        transparent: true,
        opacity: court.open ? EVENING_POOL_OPACITY : SKY_POOL_OPACITY,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(cx, 0.03, cz);
    group.add(pool);
  }
}
// The three.js part of one floor of the building (world/building.ts). Reads the tile world (set to this floor first).
// Unlike a level on its own it has a ceiling, and it is open where the plan says so: no wall over the stairwell that
// comes up from the floor below, no floor on a landing or a lift's shaft, no ceiling where a stairwell or shaft goes
// up, and the gap between the ceiling and the next floor walled round those
// The boss room is HALL_H high, not WALL_H (the boss that jumps needs the room): its ceiling and the walls above
// WALL_H go in a group of their own, which is returned (null on a floor without a boss room). They stand where the
// floor above is, so the caller shows them only while that floor is not drawn (world/level.ts showNeighbourFloors)
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
    ci0 = Math.min(...cis) - 2,
    ci1 = Math.max(...cis) + 2,
    cj0 = Math.min(...cjs) - 2,
    cj1 = Math.max(...cjs) + 2,
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
        walls.filter(([i, j]) => variantOf(j * W + i, look.walls.length, WALL_PLAIN_SHARE) === v),
      ),
    );
  } else {
    tex.floor.repeat.set(1, 1);
    planes(floorTiles, 0, true, new THREE.MeshBasicMaterial({ map: tex.floor }));
    wallBoxes(tex.wall, walls);
  }
  addDecks(tex, group);
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
  if (plan.court) addCourt(plan.court, courtGroup ?? group);
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
