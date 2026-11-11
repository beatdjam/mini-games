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

const TRACER_COLOR = 0xffe066; // the shot's line
const TRACER_TIME = 0.05; // how long the shot's line shows (s)
const LAND_DUST = 10; // the dust's particle count before FEEL_TUNE.dust, per landing
const BOOST_DUST = 6; // the same, per boost start

interface Tracer {
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  t: number; // the time left (s)
}

export interface PlayView {
  world: World;
  model: THREE.Group; // the mech's stand-in
  feel: FeelState;
  pitch: number; // the camera's pitch (rad)
  camPos: THREE.Vector3 | null; // the camera's place in the last frame
  tracers: Tracer[]; // the shots whose line is still showing
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
  return { world, model, feel: newFeel(CAMERA_TUNE.fov), pitch: 0, camPos: null, tracers: [], hud };
}

function addTracer(view: PlayView, ox: number, oy: number, oz: number, dx: number, dz: number, length: number): void {
  const from = new THREE.Vector3(ox, oy, oz);
  const to = new THREE.Vector3(ox + dx * length, oy, oz + dz * length);
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([from, to]),
    new THREE.LineBasicMaterial({ color: TRACER_COLOR }),
  );
  scene.add(line);
  view.tracers.push({ line, t: TRACER_TIME });
}

// Takes the lines whose time is up out of the scene and frees them.
function stepTracers(view: PlayView, dt: number): void {
  for (let i = view.tracers.length - 1; i >= 0; i--) {
    const tracer = view.tracers[i];
    tracer.t -= dt;
    if (tracer.t > 0) continue;
    scene.remove(tracer.line);
    tracer.line.geometry.dispose();
    tracer.line.material.dispose();
    view.tracers.splice(i, 1);
  }
}

// One frame of the sortie: the frame's events become dust, lines and the camera's shake, the mech and the map follow the
// game's state, and the camera looks from behind the mech. The feel's hit stop is not used: the logic cannot be frozen.
export function drawPlay(view: PlayView, game: GameModel, dt: number, pitchDelta: number): void {
  const mechEvents: MechEvent[] = [];
  let kill = false;
  for (const event of game.events) {
    if (event.kind === 'mech') {
      mechEvents.push(event.event);
      if (event.event.kind === 'land') spawnDust(game.mech.x, game.mech.z, LAND_DUST, FEEL_TUNE);
      else if (event.event.kind === 'boostStart') spawnDust(game.mech.x, game.mech.z, BOOST_DUST, FEEL_TUNE);
    } else if (event.kind === 'shot') {
      addTracer(view, event.x, event.y, event.z, event.dx, event.dz, event.reach);
      mechEvents.push({ kind: 'fire', speed: 0 });
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
  stepTracers(view, dt);
  drawHud(view.hud, hudModel(game));
}
