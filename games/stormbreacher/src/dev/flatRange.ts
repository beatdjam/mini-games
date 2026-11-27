// The flat range that #view-touch, #view-map and #view-fx share: the mech, the targets, the shots and their effects on
// the flat field, with the feel and the tune tables the URL turns.
import * as THREE from 'three';
import { scene } from '@engine/render/index.ts';
import { FEEL_TUNE, MECH_TUNE, MOVE_TUNE, type FeelTune, type MoveTune } from '../data/tune.ts';
import type { GroundRect } from '../logic/collide.ts';
import { fireRay, type Aabb } from '../logic/fire.ts';
import { newMech, stepMech, type MechInput, type MechState } from '../logic/mech.ts';
import { feelEvents, feelStep, newFeel, spawnDust, type FeelState, type ShotResult } from '../view/feel.ts';
import { buildMechProxy } from '../view/mechProxy.ts';

const SHOT_RANGE = 200; // how far a shot reaches (m)
const TARGET_WIDTH = 2; // the target's width (m)
const TARGET_HEIGHT = 4; // the target's height (m)
const TARGET_DEPTH = 1; // the target's depth (m)
const TARGET_COLOR = 0x5c6670; // the target's usual color
const TARGET_HIT_COLOR = 0xc0392b; // the target flashes this on a hit
const FLASH_TIME = 0.15; // how long a hit keeps the target red (s)
const TRACER_COLOR = 0xffe066; // the shot's line
const TRACER_TIME = 0.05; // how long the shot's line shows (s)
const LAND_DUST = 10; // the dust's particle count before FEEL_TUNE.dust, per landing
const BOOST_DUST = 6; // the same, per boost start

// Where the targets stand: how far in front of the start (m) and how far to the side (m; + is right).
const TARGETS: { dist: number; side: number }[] = [
  { dist: 30, side: -10 },
  { dist: 45, side: 6 },
  { dist: 60, side: -7 },
  { dist: 60, side: 9 },
  { dist: 80, side: 0 },
];

interface Target {
  box: Aabb;
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>;
  flashT: number; // the red flash left (s)
}

interface Tracer {
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  t: number; // the time left (s)
}

// One tune table with every URL value of the same name on top; a value that is not a number is ignored.
export function tuneWithParams<T extends Record<string, number>>(base: T, params: URLSearchParams): T {
  const tune: T = { ...base };
  // a field-by-field view: Object.keys loses the key type, but every field of a tune table is a number
  const fields: Record<string, number> = tune;
  for (const key of Object.keys(base)) {
    const value = params.get(key);
    if (value === null || value.trim() === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) fields[key] = n;
  }
  return tune;
}

// A URL name that is in both tables would set two values at once; refuse it instead of picking one.
export function checkOneTable(a: Record<string, number>, b: Record<string, number>) {
  for (const name of Object.keys(a)) {
    if (name in b) throw new Error(`the tune name "${name}" is in two tables`);
  }
}

function buildTargets(): Target[] {
  return TARGETS.map(({ dist, side }) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(TARGET_WIDTH, TARGET_HEIGHT, TARGET_DEPTH),
      new THREE.MeshLambertMaterial({ color: TARGET_COLOR }),
    );
    mesh.position.set(side, TARGET_HEIGHT / 2, -dist);
    scene.add(mesh);
    const box: Aabb = {
      minX: side - TARGET_WIDTH / 2,
      maxX: side + TARGET_WIDTH / 2,
      minY: 0,
      maxY: TARGET_HEIGHT,
      minZ: -dist - TARGET_DEPTH / 2,
      maxZ: -dist + TARGET_DEPTH / 2,
    };
    return { box, mesh, flashT: 0 };
  });
}

export interface FlatRange {
  mech: MechState;
  feel: FeelState;
  model: THREE.Group;
  // A shot's line from (ox, oy, oz) toward (dx, dy, dz), `length` m long.
  tracer(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, length: number): void;
  // Advances the mech and the effects and gives back the camera's feel for this frame. `onFire` may replace the
  // default shot (forward from the chest) with the caller's own; it says what that shot did. `radius` is the mech's
  // hit radius (m; MECH_TUNE.radius when left out).
  step(
    input: MechInput,
    dt: number,
    moveTune: MoveTune,
    feelTune: FeelTune,
    onFire?: (mech: MechState) => ShotResult,
    radius?: number,
  ): { fov: number; offset: THREE.Vector3 };
}

export interface FlatRangeOptions {
  targets?: boolean; // false leaves out the five fixed boxes, when the caller brings its own
  rects?: readonly GroundRect[]; // the map's blocking rects; left out, nothing blocks
}

// Builds what #view-touch, #view-map and #view-fx share: the mech, the targets, the shots and their effects (the flat
// ground is the start-up field's). Nothing here reads an input device; the caller fills MechInput.
export function buildFlatRange(baseFov: number, options: FlatRangeOptions = {}): FlatRange {
  const mech = newMech();
  const feel = newFeel(baseFov);
  const model = buildMechProxy(MECH_TUNE.height);
  scene.add(model);
  const targets = options.targets === false ? [] : buildTargets();
  const targetBoxes = targets.map(target => target.box);
  const tracers: Tracer[] = [];

  function tracer(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, length: number): void {
    const from = new THREE.Vector3(ox, oy, oz);
    const to = new THREE.Vector3(ox + dx * length, oy + dy * length, oz + dz * length);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([from, to]),
      new THREE.LineBasicMaterial({ color: TRACER_COLOR }),
    );
    scene.add(line);
    tracers.push({ line, t: TRACER_TIME });
  }

  // the fixed boxes never go down, so a shot here is a hit or a miss
  function shoot(): ShotResult {
    const dx = -Math.sin(mech.yaw);
    const dz = -Math.cos(mech.yaw);
    const chest = mech.y + MECH_TUNE.chestHeight;
    const index = fireRay(mech.x, chest, mech.z, dx, 0, dz, SHOT_RANGE, targetBoxes);
    const reach = index >= 0 ? TARGETS[index].dist : SHOT_RANGE;
    tracer(mech.x, chest, mech.z, dx, 0, dz, reach);
    if (index < 0) return 'miss';
    targets[index].flashT = FLASH_TIME;
    targets[index].mesh.material.color.setHex(TARGET_HIT_COLOR);
    return 'hit';
  }

  function stepEffects(dt: number) {
    for (const target of targets) {
      if (target.flashT <= 0) continue;
      target.flashT = Math.max(0, target.flashT - dt);
      if (target.flashT === 0) target.mesh.material.color.setHex(TARGET_COLOR);
    }
    for (let i = tracers.length - 1; i >= 0; i--) {
      const tracer = tracers[i];
      tracer.t -= dt;
      if (tracer.t > 0) continue;
      scene.remove(tracer.line);
      tracer.line.geometry.dispose();
      tracer.line.material.dispose();
      tracers.splice(i, 1);
    }
  }

  function step(
    input: MechInput,
    dt: number,
    moveTune: MoveTune,
    feelTune: FeelTune,
    onFire?: (mech: MechState) => ShotResult,
    radius?: number,
  ) {
    const frame = feelStep(feel, dt, mech.boosting, baseFov, feelTune);
    const events = frame.stopped
      ? []
      : stepMech(mech, input, dt, moveTune, feelTune.fireRate, {
          rects: options.rects ?? [],
          radius: radius ?? MECH_TUNE.radius,
        });
    let kill = false;
    for (const event of events) {
      if (event.kind === 'fire') kill = (onFire ? onFire(mech) : shoot()) === 'kill' || kill;
      else if (event.kind === 'land') spawnDust(mech.x, mech.z, LAND_DUST, feelTune);
      else if (event.kind === 'boostStart') spawnDust(mech.x, mech.z, BOOST_DUST, feelTune);
    }
    feelEvents(feel, events, kill, feelTune);
    stepEffects(dt);
    model.position.set(mech.x, mech.y, mech.z);
    model.rotation.y = mech.yaw;
    return { fov: frame.fov, offset: frame.offset };
  }

  return { mech, feel, model, tracer, step };
}

// MOVE_TUNE and FEEL_TUNE with the URL's values on top (?walk=12&hitStop=0), for every view that moves the mech.
// ?feel=0 turns the visible effects off for a comparison; the fire rate is the number of shots, not a feel.
export function moveFeelFromParams(params: URLSearchParams): { moveTune: MoveTune; feelTune: FeelTune } {
  checkOneTable(MOVE_TUNE, FEEL_TUNE);
  const moveTune = tuneWithParams(MOVE_TUNE, params);
  const feelTune = tuneWithParams(FEEL_TUNE, params);
  if (params.get('feel') === '0') {
    feelTune.boostFov = 0;
    feelTune.landShake = 0;
    feelTune.fireShake = 0;
    feelTune.hitStop = 0;
    feelTune.dust = 0;
  }
  return { moveTune, feelTune };
}
