// The camera measurement view (#view-camera): an 8 m model walks a set path through the SB-040 course while the
// third-person camera follows, and the numbers are collected for the first lap. ?drive moves the model by hand.
import * as THREE from 'three';
import { addSystem, clamp, turnToward, yawToward } from '@engine/core/index.ts';
import { camera, scene } from '@engine/render/index.ts';
import { CAMERA_TUNE, MOVE_TUNE, type CameraTune } from '../../data/tune.ts';
import { scaleForMech } from '../../logic/mechScale.ts';
import { applyPose, cameraPose, followPose, screenFraction, type CameraPose } from '../../view/camera.ts';
import { SIZE_BOX_NAME } from '../../view/field.ts';
import { STATIONS, buildCourse, type StationName } from '../course.ts';
import { heldKeys } from '../keys.ts';
import { buildMechProxy } from '../mechProxy.ts';

declare global {
  interface Window {
    sbCameraReport?: () => string | null;
  }
}

const MECH_HEIGHT = 8; // the model's height in this view (m)
const DEFAULT_CEIL = 18; // the hall's ceiling above the floor (m)
const COURSE_FAR = 600; // the camera's far plane for the course (m), past the whole course
const TURN_RATE = 2.0; // how fast the model turns toward its path or the keys (rad/s)
const PITCH_RATE = 1.2; // how fast the drive keys change the pitch (rad/s)
const SPEED_DEFAULT = 1; // the route's speed multiplier when ?speed is absent

interface RoutePoint {
  x: number;
  z: number;
  section: StationName; // the place the point belongs to
}

// The far end of the 40 m corridor, whose station stands 6 m past its near end (m).
const CORRIDOR_FAR = STATIONS.corridor.z - 52;
const DOOR_SOUTH = STATIONS.door.z + 10; // the approach to the 8 x 10 m opening (m)
const DOOR_NORTH = STATIONS.door.z - 12; // the far side of the door wall (m)
const HALL_IN = -62; // just inside the hall's entrance (m)
const HALL_NEAR = -70; // the near corners of the lap around the hall (m)
const HALL_FAR = -90; // its far corners (m)
const HALL_SIDE = 14; // how far the lap stays from the hall's walls (m)
const STEP_WEST = 40; // the west end of the walk beside the steps (m)
const STEP_EAST = 80; // its east end (m)
const REF_WEST = STATIONS.ref.x - 9; // the west edge of the 6 m reference wall (m)
const REF_EAST = STATIONS.ref.x - 1; // its east edge (m)

// The path of the first lap: the 8 m corridor from end to end, through the 8 x 10 m opening, once around the hall,
// beside the steps, along the 6 m reference wall, then back to the start.
const ROUTE: RoutePoint[] = [
  { x: STATIONS.corridor.x, z: STATIONS.corridor.z, section: 'corridor' },
  { x: STATIONS.corridor.x, z: CORRIDOR_FAR, section: 'corridor' },
  { x: STATIONS.door.x, z: DOOR_SOUTH, section: 'door' },
  { x: STATIONS.door.x, z: DOOR_NORTH, section: 'door' },
  { x: STATIONS.hall.x, z: STATIONS.hall.z, section: 'hall' },
  { x: STATIONS.hall.x, z: HALL_IN, section: 'hall' },
  { x: -HALL_SIDE, z: HALL_NEAR, section: 'hall' },
  { x: -HALL_SIDE, z: HALL_FAR, section: 'hall' },
  { x: HALL_SIDE, z: HALL_FAR, section: 'hall' },
  { x: HALL_SIDE, z: HALL_NEAR, section: 'hall' },
  { x: STATIONS.hall.x, z: HALL_IN, section: 'hall' },
  { x: STATIONS.hall.x, z: STATIONS.hall.z, section: 'hall' },
  { x: STEP_WEST, z: STATIONS.step.z, section: 'step' },
  { x: STEP_EAST, z: STATIONS.step.z, section: 'step' },
  { x: REF_WEST, z: STATIONS.ref.z, section: 'ref' },
  { x: REF_EAST, z: STATIONS.ref.z, section: 'ref' },
  { x: STATIONS.corridor.x, z: STATIONS.corridor.z, section: 'corridor' },
];

interface Stats {
  frames: number;
  pulled: number;
  distMin: number;
  distSum: number;
  shoulderMin: number;
  inside: number;
  screenMin: number;
  screenSum: number;
  screenMax: number;
}

interface StatsReport {
  frames: number;
  pulledFrames: number;
  distMin: number;
  distAvg: number;
  shoulderMin: number;
  cameraInBoxFrames: number;
  screenFractionMin: number;
  screenFractionAvg: number;
  screenFractionMax: number;
}

interface CameraReport extends StatsReport {
  sections: Record<StationName, StatsReport>;
}

function emptyStats(): Stats {
  return {
    frames: 0,
    pulled: 0,
    distMin: Infinity,
    distSum: 0,
    shoulderMin: Infinity,
    inside: 0,
    screenMin: Infinity,
    screenSum: 0,
    screenMax: -Infinity,
  };
}

const round = (value: number): number => Math.round(value * 1000) / 1000;

function statsReport(stats: Stats): StatsReport {
  if (stats.frames === 0) {
    return {
      frames: 0,
      pulledFrames: 0,
      distMin: 0,
      distAvg: 0,
      shoulderMin: 0,
      cameraInBoxFrames: 0,
      screenFractionMin: 0,
      screenFractionAvg: 0,
      screenFractionMax: 0,
    };
  }
  return {
    frames: stats.frames,
    pulledFrames: stats.pulled,
    distMin: round(stats.distMin),
    distAvg: round(stats.distSum / stats.frames),
    shoulderMin: round(stats.shoulderMin),
    cameraInBoxFrames: stats.inside,
    screenFractionMin: round(stats.screenMin),
    screenFractionAvg: round(stats.screenSum / stats.frames),
    screenFractionMax: round(stats.screenMax),
  };
}

function inAnyBox(point: THREE.Vector3, boxes: readonly THREE.Box3[]): boolean {
  return boxes.some(box => box.containsPoint(point));
}

function record(stats: Stats, pose: CameraPose, camPos: THREE.Vector3, fraction: number, boxes: readonly THREE.Box3[]) {
  stats.frames++;
  if (pose.pulled) stats.pulled++;
  stats.distMin = Math.min(stats.distMin, pose.dist);
  stats.distSum += pose.dist;
  stats.shoulderMin = Math.min(stats.shoulderMin, pose.shoulder);
  if (inAnyBox(camPos, boxes)) stats.inside++;
  stats.screenMin = Math.min(stats.screenMin, fraction);
  stats.screenSum += fraction;
  stats.screenMax = Math.max(stats.screenMax, fraction);
}

function makeReport(total: Stats, sections: Record<StationName, Stats>): CameraReport {
  return {
    ...statsReport(total),
    sections: {
      corridor: statsReport(sections.corridor),
      door: statsReport(sections.door),
      hall: statsReport(sections.hall),
      step: statsReport(sections.step),
      ref: statsReport(sections.ref),
    },
  };
}

function numberParam(params: URLSearchParams, name: string, fallback: number): number {
  const value = params.get(name);
  if (value === null || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// `base` with every numeric URL value of the same name on top; a value that is not a number is ignored.
export function tuneFrom(params: URLSearchParams, base: CameraTune = CAMERA_TUNE): CameraTune {
  const tune: CameraTune = { ...base };
  // Object.keys loses the key type; every field of a camera table is a number.
  for (const key of Object.keys(base) as (keyof CameraTune)[]) {
    const value = params.get(key);
    if (value === null || value.trim() === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) tune[key] = n;
  }
  return tune;
}

export function showCamera(_hash: string) {
  const params = new URLSearchParams(location.search);
  // This view keeps the 8 m mech and the course built for it, so start from the 8 m camera.
  const base = scaleForMech(MECH_HEIGHT, MOVE_TUNE, CAMERA_TUNE, { camera: true, move: false }).cameraTune;
  const tune = tuneFrom(params, base);
  const ceil = numberParam(params, 'ceil', DEFAULT_CEIL);
  const speed = numberParam(params, 'speed', SPEED_DEFAULT);
  const drive = params.has('drive');
  const alwaysAim = params.has('aim');

  // the field's size box would stand in the course, and the course reaches past the field's fog
  const sizeBox = scene.getObjectByName(SIZE_BOX_NAME);
  if (sizeBox) sizeBox.visible = false;
  scene.fog = null;
  camera.far = COURSE_FAR;
  camera.updateProjectionMatrix();

  const course = buildCourse({ ceil });
  scene.add(course.group);
  const boxes = course.boxes;

  const model = buildMechProxy(MECH_HEIGHT);
  scene.add(model);

  const start = ROUTE[0];
  const pos = new THREE.Vector3(start.x, 0, start.z);
  let yaw = drive ? 0 : yawToward(ROUTE[1].x - start.x, ROUTE[1].z - start.z);
  let pitch = 0;
  let targetIndex = 1;
  let routeSection: StationName = ROUTE[1].section;
  let finished = false;
  let report: CameraReport | null = null;
  model.position.copy(pos);
  model.rotation.y = yaw;

  // ?drive: the keys the view holds. pressed is unused here, but cleared each frame like every reader of heldKeys.
  const keys = drive ? heldKeys() : null;

  const down = (code: string): boolean => keys !== null && keys.held.has(code);

  function advanceRoute(): boolean {
    targetIndex++;
    if (targetIndex >= ROUTE.length) {
      finished = true;
      return true;
    }
    routeSection = ROUTE[targetIndex].section;
    return false;
  }

  // Moves along the route at tune.walk * speed; true on the frame the first lap comes back to its start.
  function stepRoute(dt: number): boolean {
    if (finished) return false;
    const target = ROUTE[targetIndex];
    const yawTo = yawToward(target.x - pos.x, target.z - pos.z);
    yaw = turnToward(yaw, yawTo, TURN_RATE * dt);

    let remaining = tune.walk * speed * dt;
    while (remaining > 0 && !finished) {
      const point = ROUTE[targetIndex];
      const dx = point.x - pos.x;
      const dz = point.z - pos.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= 1e-6) {
        advanceRoute();
        continue;
      }
      if (remaining >= distance) {
        pos.x = point.x;
        pos.z = point.z;
        remaining -= distance;
        advanceRoute();
      } else {
        pos.x += (dx / distance) * remaining;
        pos.z += (dz / distance) * remaining;
        remaining = 0;
      }
    }
    return finished;
  }

  function stepDrive(dt: number) {
    let forward = (down('KeyW') ? 1 : 0) - (down('KeyS') ? 1 : 0);
    let strafe = (down('KeyD') ? 1 : 0) - (down('KeyA') ? 1 : 0);
    const length = Math.hypot(forward, strafe);
    if (length > 0) {
      forward /= length;
      strafe /= length;
    }
    pos.x += (forward * -Math.sin(yaw) + strafe * Math.cos(yaw)) * tune.walk * dt;
    pos.z += (forward * -Math.cos(yaw) + strafe * -Math.sin(yaw)) * tune.walk * dt;

    const turn = (down('KeyQ') || down('ArrowLeft') ? 1 : 0) - (down('KeyE') || down('ArrowRight') ? 1 : 0);
    yaw += turn * TURN_RATE * dt;

    const lift = (down('KeyR') || down('ArrowUp') ? 1 : 0) - (down('KeyF') || down('ArrowDown') ? 1 : 0);
    pitch = clamp(pitch + lift * PITCH_RATE * dt, tune.pitchMin, tune.pitchMax);
  }

  const total = emptyStats();
  const sections: Record<StationName, Stats> = {
    corridor: emptyStats(),
    door: emptyStats(),
    hall: emptyStats(),
    step: emptyStats(),
    ref: emptyStats(),
  };
  let camPos: THREE.Vector3 | null = null;

  addSystem({
    name: 'sb-camera',
    update: dt => {
      if (keys) keys.pressed.clear();
      let lapDone = false;
      if (drive) stepDrive(dt);
      else lapDone = stepRoute(dt);

      const aiming = alwaysAim || (drive && (down('ShiftLeft') || down('ShiftRight')));
      const pose = cameraPose({ x: pos.x, y: 0, z: pos.z, yaw }, pitch, tune, boxes, aiming);
      camPos = camPos ? followPose(camPos, pose.pos, dt, tune.lag) : pose.pos.clone();
      applyPose(camera, { ...pose, pos: camPos }, aiming ? tune.aimFov : tune.fov);
      model.position.set(pos.x, 0, pos.z);
      model.rotation.y = yaw;

      // The route's report counts frames, so ?speed changes how long a lap takes but not what one number means.
      if (!drive && report === null) {
        const fraction = screenFraction(camera, model.position, MECH_HEIGHT);
        record(total, pose, camera.position, fraction, boxes);
        record(sections[routeSection], pose, camera.position, fraction, boxes);
        if (lapDone) report = makeReport(total, sections);
      }
    },
  });

  window.sbCameraReport = () => (report ? JSON.stringify(report) : null);
}
