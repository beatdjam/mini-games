// The map as the screen draws it: the ground tiles and props, the mission's targets, and the fog and camera range they
// are seen through. The game and the dev views that walk a map both build it from here.
import * as THREE from 'three';
import { camera, scene } from '@engine/render/index.ts';
import { M1_SHUTTERS, type ShutterDef } from '../data/battery.ts';
import { SKY_COLOR } from '../data/colors.ts';
import { FORTRESS_SHUTTER_TUNE } from '../data/fortress.ts';
import { PILLBOX_BREAK } from '../data/pillbox.ts';
import { TARGET_SIZE, TILE_SIZE, WRECK_SCALE_Y } from '../data/props.ts';
import { CAMERA_TUNE } from '../data/tune.ts';
import type { MapBounds, MapDef, Prop } from '../data/types.ts';
import type { GameModel } from '../logic/game.ts';
import { blastPropIndexes } from '../logic/blasts.ts';
import { blockingPropIndexes, cameraBlockers, mapBlockers } from '../logic/mapShapes.ts';
import { cameraBoxesOfRect } from './camera.ts';
import { buildAtmosphere } from './atmosphere.ts';
import { addFadeProp, dropFade, lowRects, newFadeSet, type FadeSet } from './fade.ts';
import { buildShore } from './shore.ts';
import { shutterHousingGeometry, shutterPlateGeometry } from './shutterModel.ts';
import { breakPropSlot, buildOutdoor, buildTargets, type OutdoorBuild, type PropSlot } from './outdoor.ts';

const FOG_NEAR = 100; // m
const FOG_FAR = 240; // m; the map is 340 m deep, so the far end appears as the mech comes closer
const CHUNK = 32; // m
const CHUNK_MIN = 3000; // triangles
const WRECK_COLOR = 0x1f1c18; // the colour a broken target keeps

// The fog's numbers the map views set; #view-fx starts from the same ones when its own look is off.
export const MAP_FOG = { near: FOG_NEAR, far: FOG_FAR } as const;

export interface World {
  built: OutdoorBuild; // the ground and props, and their chunks
  targets: Map<string, THREE.Mesh>; // the mission's targets by id
  targetGroup: THREE.Group; // every target and shutter, to take out when the world is built again
  shutters: Map<string, THREE.Mesh>; // the armour plate before a target, by the target's id; hidden once it is open
  shore: THREE.Group; // the sea and the landing craft, to take out with them
  cameraBoxes: THREE.Box3[]; // the tall props, the targets and the crafts as walls the camera keeps out of (a prop under CAMERA_TUNE.wallHeight is in `fade` instead)
  fade: FadeSet; // the low props that turn see-through when they stand between the camera and the mech (SB-2048)
  targetCameraBoxes: Map<string, THREE.Box3>; // a target's id -> its box in cameraBoxes, lowered when it breaks
  slots: Map<number, PropSlot>; // a breakable or blast-opened prop's place in map.props -> where it is drawn
  propCameraBoxes: Map<number, THREE.Box3>; // those props' place in map.props -> its box in cameraBoxes
  broken: Set<number>; // the props already drawn broken or opened
  opened: Set<string>; // the blast points whose hole is already open in the draw, so the props are not searched again
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
// `air` false leaves out the beach's air (its smoke, haze, fires and grade): #view-fx's stage 0 asks for no effects.
export function buildWorld(map: MapDef, air = true): World {
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
  // the air over the beach: its smoke, haze, fires and screen grade (SB-1440). A new map replaces the last one's
  if (air) buildAtmosphere(map);
  const targets = new Map<string, THREE.Mesh>();
  for (const child of targetGroup.children) {
    if (child instanceof THREE.Mesh) targets.set(child.name, child);
  }

  // a shutter's plate stands in front of its target, toward the sea (+z); it is a stage prop and stops no shot itself
  const shutters = new Map<string, THREE.Mesh>();
  for (const def of M1_SHUTTERS) {
    const place = map.targets.find(target => target.id === def.target);
    if (!place) continue;
    // the plate and, standing on its top edge, the winding machine (view/shutterModel.ts, SB-2052); both take their colours
    // from their vertices
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const plate = new THREE.Mesh(shutterPlateGeometry(def.w, def.h, def.d), material);
    plate.name = `sb-shutter-${def.target}`;
    const housing = new THREE.Mesh(shutterHousingGeometry(def.w, def.d), material);
    housing.name = `sb-shutter-housing-${def.target}`;
    housing.position.y = def.h / 2;
    plate.add(housing);
    const baseY = place.y ?? 0; // a nest stands on the wall's top
    plate.userData.baseY = baseY;
    plate.position.set(place.x, baseY + def.h / 2, place.z + TARGET_SIZE[place.kind].d / 2 + def.gap + def.d / 2);
    targetGroup.add(plate);
    shutters.set(def.target, plate);
  }

  // cameraBoxesOfRect runs over cameraBlockers' rects, which put the blocking props first in map.props' order, so the
  // boxes of rect i belong to blockingPropIndexes(map)[i]. A breakable prop is one flat rect, so its list holds one box.
  // The targets come after the props and the three crafts' rects after them, so the props' places still line up.
  const mapRects = mapBlockers(map);
  const rects = cameraBlockers(map);
  const boxesByRect = rects.map(cameraBoxesOfRect);
  // A low prop is no wall: it fades when it is between the camera and the mech, and stays out of cameraBoxes (SB-2048).
  // The rects past the props' (the targets and the crafts) always stay walls.
  const owners = blockingPropIndexes(map);
  const lowRect = lowRects(map, rects.length, CAMERA_TUNE);
  const boxes = boxesByRect.filter((_, i) => !lowRect[i]).flat();
  // The targets' own boxes, so syncWorld can lower one when its target breaks: the camera must not keep avoiding a wall
  // that is already a low wreck.
  const targetCameraBoxes = new Map<string, THREE.Box3>();
  const targetStart = mapRects.length - map.targets.length;
  map.targets.forEach((place, i) => {
    const box = boxesByRect[targetStart + i]?.[0];
    if (box) targetCameraBoxes.set(place.id, box);
  });
  const slots = new Map<number, PropSlot>();
  const propCameraBoxes = new Map<number, THREE.Box3>();
  const blastProps = blastPropsOf(map);
  map.props.forEach((prop, index) => {
    const slot = built.slots.get(prop);
    if (slot) slots.set(index, slot);
  });
  blockingPropIndexes(map).forEach((propIndex, i) => {
    const prop = map.props[propIndex];
    if (prop.breakable !== true && prop.collapse !== true && !blastProps.has(prop)) return;
    const box = boxesByRect[i][0];
    if (box) propCameraBoxes.set(propIndex, box);
  });

  const fade = newFadeSet(built.group, built.slots);
  lowRect.forEach((low, i) => {
    if (!low) return;
    for (const box of boxesByRect[i]) addFadeProp(fade, owners[i], map.props[owners[i]], box);
  });

  return {
    built,
    targets,
    targetGroup,
    shutters,
    shore,
    cameraBoxes: boxes,
    fade,
    targetCameraBoxes,
    slots,
    propCameraBoxes,
    broken: new Set(),
    opened: new Set(),
    breaks: new Map(),
  };
}

// The nest's plate rolls up and the nest rises over FORTRESS_SHUTTER_TUNE.openSec once the shutter is open (SB-2051); shut,
// the plate stands full and the nest sits sunk into the wall. The progress is the plate's own (`userData.open`): a plate
// first seen open (a checkpoint or a suspend brings one back) starts fully open, and one seen shut starts at 0, so
// the state needs nothing more than the shutter's `open`.
function rollShutter(
  world: World,
  game: GameModel,
  plate: THREE.Mesh,
  def: ShutterDef,
  open: boolean,
  dt: number,
): void {
  const before = typeof plate.userData.open === 'number' ? plate.userData.open : 1;
  const sec = FORTRESS_SHUTTER_TUNE.openSec;
  const share = open ? Math.min(1, before + (sec <= 0 ? 1 : dt / sec)) : 0;
  plate.userData.open = share;
  const k = share * share * (3 - 2 * share); // smooth in and out
  const baseY = typeof plate.userData.baseY === 'number' ? plate.userData.baseY : 0;
  plate.visible = k < 1;
  // the plate rolls up with its top edge fixed, and the machine over it keeps its own height
  plate.scale.y = Math.max(0.001, 1 - k);
  plate.position.y = baseY + def.h - (def.h * plate.scale.y) / 2;
  const housing = plate.children[0];
  if (housing) housing.scale.y = 1 / plate.scale.y;
  const target = game.targets.find(item => item.id === def.target);
  const mesh = world.targets.get(def.target);
  if (mesh && target && target.hp > 0) mesh.position.y = baseY - FORTRESS_SHUTTER_TUNE.sink * (1 - k);
}

// Lowers and darkens every target whose health is gone, lowers its camera box to the wreck's height, hides every shutter
// that is open, and every prop the game has broken or a blast has opened: its copy becomes a low, dark wreck and its box
// leaves cameraBoxes in place (the third-person dev views hand that same array to the camera every frame). A blasted line
// is drawn open from the first frame after a checkpoint or a suspend brings it back. A pillbox goes down over
// PILLBOX_BREAK.sec instead, so its fall reads as the road opening: the
// seconds live here, in the view, and a save or a checkpoint needs nothing new. Called every frame: a pillbox keeps
// sinking until PILLBOX_BREAK.sec, while every other broken target is left as it is once it is down, and a blast point's
// hole is searched only on the frame it opens.
export function syncWorld(world: World, game: GameModel, dt: number): void {
  for (const target of game.targets) {
    if (target.hp > 0) continue;
    const box = world.targetCameraBoxes.get(target.id);
    if (box) box.max.y = TARGET_SIZE[target.kind].h * WRECK_SCALE_Y;
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
      if (mesh.scale.y === WRECK_SCALE_Y) continue;
      mesh.scale.y = WRECK_SCALE_Y;
    }
    if (mesh.material instanceof THREE.MeshLambertMaterial) mesh.material.color.setHex(WRECK_COLOR);
  }
  for (const shutter of game.shutters) {
    const plate = world.shutters.get(shutter.target);
    if (!plate) continue;
    const def = M1_SHUTTERS.find(item => item.target === shutter.target);
    if (def?.opensOnFlag === undefined) {
      plate.visible = !shutter.open;
      continue;
    }
    rollShutter(world, game, plate, def, shutter.open, dt);
  }
  for (const breakable of game.breakables) {
    if (breakable.hp > 0) continue;
    breakPropAt(world, breakable.prop);
  }
  for (const blast of game.blasts) {
    if (!blast.blasted || world.opened.has(blast.id)) continue;
    world.opened.add(blast.id);
    for (const prop of blastPropIndexes(game.map, blast)) breakPropAt(world, prop);
  }
  // The fortress blast's walls and its land door (SB-1860): the game keeps their places in map.props, and every one is
  // lowered once, whether it was broken this frame or is already down after a checkpoint or a suspend.
  for (const prop of game.brokenProps) breakPropAt(world, prop);
}

// Lowers and darkens one prop where it stands and takes its box out of cameraBoxes, once.
function breakPropAt(world: World, prop: number): void {
  if (world.broken.has(prop)) return;
  // a prop that is fading has its copy in the see-through twin: put it back before the break lowers it
  dropFade(world.fade, prop);
  const slot = world.slots.get(prop);
  if (slot) breakPropSlot(slot);
  const box = world.propCameraBoxes.get(prop);
  if (box) {
    const at = world.cameraBoxes.indexOf(box);
    if (at >= 0) world.cameraBoxes.splice(at, 1);
  }
  world.broken.add(prop);
}
