import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { buildWindowPanes } from '@engine/render/windows.ts';
import type { WindowFace } from '@engine/render/windows.ts';
import { floorSides } from '@engine/world/walls.ts';
import { H, T, W, grid, tileCenter } from '@engine/world/tiles.ts';
import { HALL_H, WALL_H } from '../data/level.ts';
import type { Biome } from '../data/types.ts';
import { biomeTex } from './render.ts';
import type { BiomeTextures } from './render.ts';
import { buildHazardMesh } from './hazards.ts';
import type { GeneratedLevel } from './levelGen.ts';
import { FLOOR_H } from './building.ts';
import { FLOOR_PLAIN_SHARE, facesWest, lookOf, variantOf, wallPic } from './looks.ts';
import type { FloorPlan } from './building.ts';
import {
  addCeiling,
  addDecks,
  addFloor,
  addNeonSigns,
  addRamps,
  addTilePlanes,
  addWalls,
  wallTiles,
} from './meshParts.ts';
import { addCourt } from './courtMesh.ts';
import { TEX } from './looks/paint.ts';
// A level's meshes, put together from the pieces in meshParts.ts and the courtyard's in courtMesh.ts: a floor of the
// building (buildFloorMeshes: drawn tile by tile, so it can be open where a stairwell or a lift passes, in the
// sector's look when it has one) and a level of its own (buildLevelMeshes: a boss arena, a fixed map)
const CEILING_SHADE = 0.5; // a building floor's ceiling is the sector's wall colour times this
const SHAFT_FILL_GAP = 0.03; // the wall between a ceiling and the next floor stops this short of both (m)

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
    look.walls.forEach((map, v) => {
      const mine = walls.filter(
          ([i, j]) => wallPic(plan.gen, j * W + i, look.walls.length, look.laneWalls, look.wallSides) === v,
        ),
        dusk = look.shadedWalls?.[v];
      // (a picture with a shaded one: as it is where it faces west, the shaded one elsewhere)
      wallBoxes(map, dusk ? mine.filter(([i, j]) => facesWest(plan.gen, j * W + i)) : mine);
      if (dusk)
        wallBoxes(
          dusk,
          mine.filter(([i, j]) => !facesWest(plan.gen, j * W + i)),
        );
    });
    // the windows one sees out of: their panes on every face of theirs a floor looks at (engine/src/render/windows.ts)
    const outside = look.outside;
    if (outside) {
      const faces: WindowFace[] = [];
      for (const [i, j] of walls) {
        const k = j * W + i,
          rects = outside.panes[wallPic(plan.gen, k, look.walls.length, look.laneWalls, look.wallSides)];
        if (!rects) continue;
        for (const [di, dj] of floorSides(plan.gen, k))
          faces.push({ i, j, di, dj, rects: rects.map(r => r.map(v => v / TEX) as [number, number, number, number]) });
      }
      const panes = buildWindowPanes(faces, WALL_H);
      if (panes) group.add(panes);
    }
  } else {
    tex.floor.repeat.set(1, 1);
    planes(floorTiles, 0, true, new THREE.MeshBasicMaterial({ map: tex.floor }));
    wallBoxes(tex.wall, walls);
  }
  addDecks(tex, group, look?.deckSide);
  addRamps(tex, group, look?.deckSide);
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
  if (plan.court) addCourt(plan.court, courtGroup ?? group, biome.code, dark);
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
