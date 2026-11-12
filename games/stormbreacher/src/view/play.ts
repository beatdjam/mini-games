// The sortie as the screen draws it: the map on M1's B line, the mech, its shots, the dust and the camera's feel. The
// view reads GameModel and never writes it; logic/game.ts owns the mech, the targets and the frame's events.
import * as THREE from 'three';
import { clamp } from '@engine/core/index.ts';
import { camera, cullChunks, scene } from '@engine/render/index.ts';
import { lookOf } from '../data/looks.ts';
import { M1 } from '../data/missions/m1.ts';
import { CAMERA_TUNE, FEEL_TUNE, MECH_TUNE } from '../data/tune.ts';
import type { GameModel } from '../logic/game.ts';
import { hudModel } from '../logic/hud.ts';
import type { MechEvent } from '../logic/mech.ts';
import { applyPose, cameraPose, followPose } from './camera.ts';
import { feelEvents, feelStep, newFeel, spawnDust, type FeelState } from './feel.ts';
import { buildPlayHud, drawHud, type PlayHud } from './hud.ts';
import { applyLookTo } from './look.ts';
import { buildMechProxy } from './mechProxy.ts';
import { buildWorld, MAP_FOG, syncWorld, type World } from './world.ts';

const TRACER_COLOR = 0xffe066; // the bullet's line
const TRACER_LENGTH = 4; // how far behind its head a bullet's line reaches (m)
const MAX_BULLET_LINES = 96; // the most bullets drawn at once; the rest fly unseen
const HIT_DUST = 3; // the dust's particle count before FEEL_TUNE.dust, per hit
const LAND_DUST = 10; // the dust's particle count before FEEL_TUNE.dust, per landing
const BOOST_DUST = 6; // the same, per boost start

// The bullets in flight, drawn as one set of line segments: two vertices a bullet, the position written every frame.
export interface BulletLines {
  lines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  positions: THREE.BufferAttribute; // MAX_BULLET_LINES * 2 vertices (the tail, then the head)
}

export interface PlayView {
  world: World;
  model: THREE.Group; // the mech's stand-in
  feel: FeelState;
  pitch: number; // the camera's pitch (rad)
  camPos: THREE.Vector3 | null; // the camera's place in the last frame
  bullets: BulletLines; // the lines of the shots in flight
  hud: PlayHud; // the sortie's HUD, in the page
}

// Builds the sortie's map and its mech into the scene. Hiding the start-up field is left to the caller.
export function buildPlayView(game: GameModel): PlayView {
  const world = buildWorld(game.map);
  // the look comes from the mission's row; the sortie is M1's B alone, so M1.id is written here (SB-300 picks the mission)
  applyLookTo(lookOf(M1.id), world.built.group);
  const model = buildMechProxy(MECH_TUNE.height);
  scene.add(model);
  const hud = buildPlayHud(document.body);
  return { world, model, feel: newFeel(CAMERA_TUNE.fov), pitch: 0, camPos: null, bullets: buildBulletLines(), hud };
}

function buildBulletLines(): BulletLines {
  const positions = new THREE.BufferAttribute(new Float32Array(MAX_BULLET_LINES * 2 * 3), 3);
  positions.setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', positions);
  geometry.setDrawRange(0, 0);
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: TRACER_COLOR }));
  // the bounding sphere would be made from the first positions (all 0), so the lines are never culled by it
  lines.frustumCulled = false;
  scene.add(lines);
  return { lines, positions };
}

// Writes each bullet's head and the point TRACER_LENGTH behind it, and draws only as many segments as there are bullets.
function drawBullets(view: PlayView, game: GameModel): void {
  const count = Math.min(game.bullets.length, MAX_BULLET_LINES);
  const positions = view.bullets.positions;
  for (let i = 0; i < count; i++) {
    const bullet = game.bullets[i];
    positions.setXYZ(
      i * 2,
      bullet.x - bullet.dx * TRACER_LENGTH,
      bullet.y - bullet.dy * TRACER_LENGTH,
      bullet.z - bullet.dz * TRACER_LENGTH,
    );
    positions.setXYZ(i * 2 + 1, bullet.x, bullet.y, bullet.z);
  }
  positions.needsUpdate = true;
  view.bullets.lines.geometry.setDrawRange(0, count * 2);
}

// One frame of the sortie: the frame's events become dust and the camera's shake, the bullets in flight become lines,
// the mech and the map follow the game's state, and the camera looks from behind the mech. The feel's hit stop is not
// used: the logic cannot be frozen.
export function drawPlay(view: PlayView, game: GameModel, dt: number, pitchDelta: number): void {
  const mechEvents: MechEvent[] = [];
  let kill = false;
  for (const event of game.events) {
    if (event.kind === 'mech') {
      mechEvents.push(event.event);
      if (event.event.kind === 'land') spawnDust(game.mech.x, game.mech.z, LAND_DUST, FEEL_TUNE);
      else if (event.event.kind === 'boostStart') spawnDust(game.mech.x, game.mech.z, BOOST_DUST, FEEL_TUNE);
    } else if (event.kind === 'shot') {
      mechEvents.push({ kind: 'fire', speed: 0 });
    } else if (event.kind === 'hit') {
      spawnDust(event.x, event.z, HIT_DUST, FEEL_TUNE);
    } else if (event.kind === 'destroyed') {
      kill = true;
    }
  }
  feelEvents(view.feel, mechEvents, kill, FEEL_TUNE);
  const frame = feelStep(view.feel, dt, game.mech.boosting, CAMERA_TUNE.fov, FEEL_TUNE);

  view.model.position.set(game.mech.x, game.mech.y, game.mech.z);
  view.model.rotation.y = game.mech.yaw;

  view.pitch = clamp(view.pitch + pitchDelta, CAMERA_TUNE.pitchMin, CAMERA_TUNE.pitchMax);
  const pose = cameraPose(
    { x: game.mech.x, y: game.mech.y, z: game.mech.z, yaw: game.mech.yaw },
    view.pitch,
    CAMERA_TUNE,
    view.world.cameraBoxes,
  );
  view.camPos = view.camPos ? followPose(view.camPos, pose.pos, dt, CAMERA_TUNE.lag) : pose.pos.clone();
  const pos = view.camPos.clone().add(frame.offset);
  applyPose(camera, { ...pose, pos }, frame.fov);

  cullChunks(view.world.built.chunks, view.world.built.group, camera, MAP_FOG.far);
  syncWorld(view.world, game);
  drawBullets(view, game);
  drawHud(view.hud, hudModel(game));
}
