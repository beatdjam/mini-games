// The map as the screen draws it: the ground tiles and props, the mission's targets, and the fog and camera range they
// are seen through. The game and the dev views that walk a map both build it from here.
import * as THREE from 'three';
import { camera, scene } from '@engine/render/index.ts';
import { M1_SHUTTERS } from '../data/battery.ts';
import { SHUTTER_COLOR, SKY_COLOR } from '../data/colors.ts';
import { PILLBOX_BREAK } from '../data/pillbox.ts';
import { TARGET_SIZE, TILE_SIZE } from '../data/props.ts';
import type { MapBounds, MapDef, Prop } from '../data/types.ts';
import type { GameModel } from '../logic/game.ts';
import { blastPropIndexes } from '../logic/blasts.ts';
import { craftRects } from '../logic/craft.ts';
import { blockingPropIndexes, mapBlockers } from '../logic/mapShapes.ts';
import { cameraBoxesOfRect } from './camera.ts';
import { buildShore } from './shore.ts';
import { breakPropSlot, buildOutdoor, buildTargets, type OutdoorBuild, type PropSlot } from './outdoor.ts';

const FOG_NEAR = 100; // m
const FOG_FAR = 240; // m; the map is 340 m deep, so the far end appears as the mech comes closer
const CHUNK = 32; // m
const CHUNK_MIN = 3000; // triangles
const WRECK_COLOR = 0x1f1c18; // the colour a broken target keeps
const WRECK_SCALE_Y = 0.35; // how low a broken target sits (its height scale)

// The fog's numbers the map views set; #view-fx starts from the same ones when its own look is off.
export const MAP_FOG = { near: FOG_NEAR, far: FOG_FAR } as const;

export interface World {
  built: OutdoorBuild; // the ground and props, and their chunks
  targets: Map<string, THREE.Mesh>; // the mission's targets by id
  targetGroup: THREE.Group; // every target and shutter, to take out when the world is built again
  shutters: Map<string, THREE.Mesh>; // the armour plate before a target, by the target's id; hidden once it is open
  shore: THREE.Group; // the sea and the landing craft, to take out with them
  cameraBoxes: THREE.Box3[]; // the props and targets as walls the camera keeps out of
  slots: Map<number, PropSlot>; // a breakable or blast-opened prop's place in map.props -> where it is drawn
  propCameraBoxes: Map<number, THREE.Box3>; // those props' place in map.props -> its box in cameraBoxes
  broken: Set<number>; // the props already drawn broken or opened
  breaks: Map<string, number>; // a target's id -> the seconds since it broke, for the pillboxes' sink
}

// The tiles that cover the whole bounds. The last row and column may hang a little past the edge, so no gap is left.
export function groundTiles(bounds: MapBounds): Prop[] {
  const cols = Math.ceil((bounds.maxX - bounds.minX) / TILE_SIZE);
  const rows = Math.ceil((bounds.maxZ - bounds.minZ) / TILE_SIZE);
  const tiles: Prop[] = [];
  for (let row = 0; row < rows; row++) {
    const z = bounds.minZ + TILE_SIZE / 2 + row * TILE_SIZE;
    for (let col = 0; col < cols; col++) {
      const x = bounds.minX + TILE_SIZE / 2 + col * TILE_SIZE;
      tiles.push({ kind: 'tile', x, z, yaw: 0, scale: 0.9 + ((row + col) % 3) * 0.07 });
    }
  }
  return tiles;
}

// The props a blast point would take out of its line, for the draw: their copies get a slot and a camera box now, so a
// blast can lower them where they stand without a new mesh.
function blastPropsOf(map: MapDef): Set<Prop> {
  const props = new Set<Prop>();
  for (const blast of map.blasts ?? []) {
    for (const index of blastPropIndexes(map, blast)) props.add(map.props[index]);
  }
  return props;
}

// Builds the walkable map into the scene and returns what was built. Hiding the start-up field is left to the caller.
export function buildWorld(map: MapDef): World {
  const fog = scene.fog instanceof THREE.Fog ? scene.fog : new THREE.Fog(SKY_COLOR, FOG_NEAR, FOG_FAR);
  fog.near = FOG_NEAR;
  fog.far = FOG_FAR;
  scene.fog = fog;
  camera.far = FOG_FAR + 20;
  camera.updateProjectionMatrix();

  const built = buildOutdoor([...groundTiles(map.bounds), ...map.props], {
    chunk: CHUNK,
    chunkMin: CHUNK_MIN,
    slotProps: blastPropsOf(map),
  });
  scene.add(built.group);

  const targetGroup = buildTargets(map.targets);
  scene.add(targetGroup);
  const shore = buildShore(map.bounds);
  scene.add(shore);
  const targets = new Map<string, THREE.Mesh>();
  for (const child of targetGroup.children) {
    if (child instanceof THREE.Mesh) targets.set(child.name, child);
  }

  // a shutter's plate stands in front of its target, toward the sea (+z); it is a stage prop and stops no shot itself
  const shutters = new Map<string, THREE.Mesh>();
  for (const def of M1_SHUTTERS) {
    const place = map.targets.find(target => target.id === def.target);
    if (!place) continue;
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(def.w, def.h, def.d),
      new THREE.MeshLambertMaterial({ color: SHUTTER_COLOR }),
    );
    plate.name = `sb-shutter-${def.target}`;
    plate.position.set(place.x, def.h / 2, place.z + TARGET_SIZE[place.kind].d / 2 + def.gap + def.d / 2);
    targetGroup.add(plate);
    shutters.set(def.target, plate);
  }

  // cameraBoxesOfRect runs over mapBlockers' rects, which put the blocking props first in map.props' order, so the
  // boxes of rect i belong to blockingPropIndexes(map)[i]. A breakable prop is one flat rect, so its list holds one box.
  // The craft's rects come after the map's, so the props' places still line up.
  const rects = [...mapBlockers(map), ...craftRects(map.bounds)];
  const boxesByRect = rects.map(cameraBoxesOfRect);
  const boxes = boxesByRect.flat();
  const slots = new Map<number, PropSlot>();
  const propCameraBoxes = new Map<number, THREE.Box3>();
  const blastProps = blastPropsOf(map);
  map.props.forEach((prop, index) => {
    const slot = built.slots.get(prop);
    if (slot) slots.set(index, slot);
  });
  blockingPropIndexes(map).forEach((propIndex, i) => {
    const prop = map.props[propIndex];
    if (prop.breakable !== true && !blastProps.has(prop)) return;
    const box = boxesByRect[i][0];
    if (box) propCameraBoxes.set(propIndex, box);
  });

  return {
    built,
    targets,
    targetGroup,
    shutters,
    shore,
    cameraBoxes: boxes,
    slots,
    propCameraBoxes,
    broken: new Set(),
    breaks: new Map(),
  };
}

// Lowers and darkens every target whose health is gone, hides every shutter that is open, and every prop the game has
// broken or a blast has opened: its copy becomes a low, dark wreck and its box leaves cameraBoxes in place (play.ts hands
// that same array to the camera every frame). A blasted line is drawn open from the first frame after a checkpoint or a
// suspend brings it back. A pillbox goes down over PILLBOX_BREAK.sec instead, so its fall reads as the road opening: the
// seconds live here, in the view, and a save or a checkpoint needs nothing new. Called every frame, so one already down
// or broken is left as it is.
export function syncWorld(world: World, game: GameModel, dt: number): void {
  for (const target of game.targets) {
    if (target.hp > 0) continue;
    const mesh = world.targets.get(target.id);
    if (!mesh) continue;
    if (target.kind === 'pillbox') {
      // A pillbox already down when the world is built (a checkpoint or a suspend brings one back) has no seconds yet:
      // start it fully down, so it does not sink again.
      const before = world.breaks.get(target.id) ?? PILLBOX_BREAK.sec;
      const at = Math.min(PILLBOX_BREAK.sec, before + dt);
      world.breaks.set(target.id, at);
      const share = PILLBOX_BREAK.sec <= 0 ? 1 : Math.min(1, at / PILLBOX_BREAK.sec);
      const k = share * share * (3 - 2 * share); // smooth in and out
      mesh.scale.y = 1 + (WRECK_SCALE_Y - 1) * k;
      mesh.position.y = -PILLBOX_BREAK.sink * k;
      mesh.rotation.x = -PILLBOX_BREAK.lean * k; // toward the land (-z); the yaw in rotation.y stays
    } else {
      mesh.scale.y = WRECK_SCALE_Y;
    }
    if (mesh.material instanceof THREE.MeshLambertMaterial) mesh.material.color.setHex(WRECK_COLOR);
  }
  for (const shutter of game.shutters) {
    const plate = world.shutters.get(shutter.target);
    if (plate) plate.visible = !shutter.open;
  }
  for (const breakable of game.breakables) {
    if (breakable.hp > 0 || world.broken.has(breakable.prop)) continue;
    const slot = world.slots.get(breakable.prop);
    if (slot) breakPropSlot(slot);
    const box = world.propCameraBoxes.get(breakable.prop);
    if (box) {
      const at = world.cameraBoxes.indexOf(box);
      if (at >= 0) world.cameraBoxes.splice(at, 1);
    }
    world.broken.add(breakable.prop);
  }
  for (const blast of game.blasts) {
    if (!blast.blasted) continue;
    for (const prop of blastPropIndexes(game.map, blast)) {
      if (world.broken.has(prop)) continue;
      const slot = world.slots.get(prop);
      if (slot) breakPropSlot(slot);
      const box = world.propCameraBoxes.get(prop);
      if (box) {
        const at = world.cameraBoxes.indexOf(box);
        if (at >= 0) world.cameraBoxes.splice(at, 1);
      }
      world.broken.add(prop);
    }
  }
}
