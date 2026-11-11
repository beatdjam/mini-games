// The beach bench view (#view-outdoor): a wide landing beach built from a seed, mechs walking it, a camera that walks
// the beach or stands still, and the numbers the screen drew, measured by bench.ts.
import * as THREE from 'three';
import { addSystem, turnToward, yawToward } from '@engine/core/index.ts';
import { camera, cullChunks, scene } from '@engine/render/index.ts';
import { CAMERA_TUNE } from '../../data/tune.ts';
import { stream } from '../../logic/rng.ts';
import { applyPose, cameraPose, type CameraTarget } from '../../view/camera.ts';
import { GROUND_NAME, SIZE_BOX_NAME } from '../../view/field.ts';
import { startBench, type BenchParams } from '../outdoor/bench.ts';
import { buildOutdoor } from '../../view/outdoor.ts';
import { outdoorLayout } from '../outdoor/layout.ts';
import { spawnMechLine, spawnMechs } from '../outdoor/mechs.ts';

// The URL values this view reads. `values` lists what a choice accepts; a value that is not one of them stays at the
// fallback and is named in the result's "無効な値". The plain numbers only have a fallback.
const PARAMS = {
  chunk: { fallback: 32, values: [0, 16, 32, 64] }, // m; a chunk's side, 0 leaves the beach whole
  chunkMin: { fallback: 3000 }, // triangles; the least a kind needs before the chunks split it
  far: { fallback: 120, values: [80, 120, 160] }, // m; how far the camera draws and the fog ends
  enemies: { fallback: 30, values: [0, 10, 30, 50] }, // the mechs walking the beach (0: none, for ?mechs=)
  mechDraw: { fallback: 'group', values: ['group', 'instanced'] }, // how the mechs are drawn
  mechs: { fallback: 0 }, // mechs added in a line for comparison (?mechs=100)
  density: { fallback: 1 }, // how many obstacles stand on the beach
  cam: { fallback: 'path', values: ['path', 'fixed'] }, // the camera walks the beach or stands still
} as const;

const SKY_COLOR = 0x9db8c6; // the field's sky colour, for the fog when the scene has none
const NO_WALLS: THREE.Box3[] = []; // the camera has no level boxes to keep in front of here

// The camera's path: an invisible 8 m mech walks from the sea to the seawall and back, swaying across the beach.
const PATH = {
  fromZ: 150, // the sea end of the walk (m)
  toZ: -60, // the seawall end (m)
  speed: 8, // m/s along the walk
  swayX: 30, // how far the walk sways to either side (m)
  swayLegs: 1, // how many full sways one leg of the walk makes
  turnRate: 2, // how fast the camera's target turns toward its way (rad/s)
} as const;

const PATH_LENGTH = PATH.fromZ - PATH.toZ; // m, one leg

// The fixed camera looks at the middle of the beach and faces the land.
const FIXED: CameraTarget = { x: 0, y: 0, z: 60, yaw: 0 };

interface Walk {
  u: number; // 0 at the sea end, 1 at the seawall end
  dir: 1 | -1; // which way along the path the next step goes
  x: number;
  z: number;
  yaw: number;
}

function readChoice<T extends number | string>(
  params: URLSearchParams,
  name: string,
  values: readonly T[],
  fallback: T,
  invalid: string[],
): T {
  const raw = params.get(name);
  if (raw === null || raw.trim() === '') return fallback;
  const hit = values.find(value => String(value) === raw.trim());
  if (hit !== undefined) return hit;
  invalid.push(name);
  return fallback;
}

function readNumber(params: URLSearchParams, name: string, fallback: number, invalid: string[]): number {
  const raw = params.get(name);
  if (raw === null || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (Number.isFinite(value) && value >= 0) return value;
  invalid.push(name);
  return fallback;
}

// Moves the invisible mech along the path and says where it stands and which way it faces.
function stepWalk(walk: Walk, dt: number) {
  walk.u += (walk.dir * PATH.speed * dt) / PATH_LENGTH;
  if (walk.u > 1) {
    walk.u = 2 - walk.u;
    walk.dir = -1;
  } else if (walk.u < 0) {
    walk.u = -walk.u;
    walk.dir = 1;
  }
  const z = PATH.fromZ + (PATH.toZ - PATH.fromZ) * walk.u;
  const x = PATH.swayX * Math.sin(walk.u * Math.PI * 2 * PATH.swayLegs);
  const dx = x - walk.x;
  const dz = z - walk.z;
  if (Math.hypot(dx, dz) > 1e-4) walk.yaw = turnToward(walk.yaw, yawToward(dx, dz), PATH.turnRate * dt);
  walk.x = x;
  walk.z = z;
}

// The beach bench.
export function showOutdoor(_hash: string) {
  const params = new URLSearchParams(location.search);
  const invalid: string[] = [];
  const bench: BenchParams = {
    chunk: readChoice(params, 'chunk', PARAMS.chunk.values, PARAMS.chunk.fallback, invalid),
    chunkMin: readNumber(params, 'chunkMin', PARAMS.chunkMin.fallback, invalid),
    far: readChoice(params, 'far', PARAMS.far.values, PARAMS.far.fallback, invalid),
    enemies: readChoice(params, 'enemies', PARAMS.enemies.values, PARAMS.enemies.fallback, invalid),
    mechDraw: readChoice(params, 'mechDraw', PARAMS.mechDraw.values, PARAMS.mechDraw.fallback, invalid),
    mechs: readNumber(params, 'mechs', PARAMS.mechs.fallback, invalid),
    density: readNumber(params, 'density', PARAMS.density.fallback, invalid),
    cam: readChoice(params, 'cam', PARAMS.cam.values, PARAMS.cam.fallback, invalid),
    invalid,
  };

  // the field's size box and ground would stand in the beach
  const sizeBox = scene.getObjectByName(SIZE_BOX_NAME);
  if (sizeBox) sizeBox.visible = false;
  const ground = scene.getObjectByName(GROUND_NAME);
  if (ground) ground.visible = false;

  // the fog ends where the camera stops drawing, the camera reaches a little past it
  const fog = scene.fog instanceof THREE.Fog ? scene.fog : new THREE.Fog(SKY_COLOR, bench.far * 0.4, bench.far);
  fog.near = bench.far * 0.4;
  fog.far = bench.far;
  scene.fog = fog;
  camera.far = bench.far + 20;
  camera.updateProjectionMatrix();

  const items = outdoorLayout(stream('field'), bench.density);
  const built = buildOutdoor(items, { chunk: bench.chunk, chunkMin: bench.chunkMin });
  scene.add(built.group);

  const crowd = spawnMechs(stream('field'), bench.enemies, bench.mechDraw);
  scene.add(crowd.root);
  const line = bench.mechs > 0 ? spawnMechLine(bench.mechs, bench.mechDraw) : null;
  if (line) scene.add(line.root);

  const walk: Walk = {
    u: 0,
    dir: 1,
    x: 0,
    z: PATH.fromZ,
    yaw: yawToward(0, PATH.toZ - PATH.fromZ),
  };

  addSystem({
    name: 'sb-outdoor',
    update: dt => {
      let target: CameraTarget;
      if (bench.cam === 'path') {
        stepWalk(walk, dt);
        target = { x: walk.x, y: 0, z: walk.z, yaw: walk.yaw };
      } else {
        target = FIXED;
      }
      applyPose(camera, cameraPose(target, 0, CAMERA_TUNE, NO_WALLS), CAMERA_TUNE.fov);

      cullChunks(built.chunks, built.group, camera, bench.far);
      crowd.update(dt, camera.position);
      if (line) line.update(dt, camera.position);
    },
  });

  startBench(bench, built.build);
}
