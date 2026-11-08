// The movement view (#view-move): an 8 m mech walks, jumps, boosts, lands and fires on the flat field, with the feel's
// camera effects, while the values are turned with URL parameters. The targets are five boxes in front.
import * as THREE from 'three';
import { addSystem, clamp } from '@engine/core/index.ts';
import { camera, scene } from '@engine/render/index.ts';
import { FEEL_TUNE, MOVE_TUNE, type FeelTune, type MoveTune } from '../../data/tune.ts';
import { fireRay, type Aabb } from '../../logic/fire.ts';
import { newMech, stepMech, type MechInput, type MechState } from '../../logic/mech.ts';
import { applyPose, cameraPose, followPose } from '../../view/camera.ts';
import { SIZE_BOX_NAME } from '../../view/field.ts';
import { feelEvents, feelStep, newFeel, spawnDust, type FeelState } from '../../view/feel.ts';
import { heldKeys } from '../keys.ts';
import { buildMechProxy } from '../mechProxy.ts';
import { tuneFrom } from './camera.ts';

const MECH_HEIGHT = 8; // the model's height (m)
const CHEST_HEIGHT = 5; // the height a shot starts from, above the feet (m)
const SHOT_RANGE = 200; // how far a shot reaches (m)
const TARGET_WIDTH = 4; // the target's width (m)
const TARGET_HEIGHT = 8; // the target's height (m)
const TARGET_DEPTH = 2; // the target's depth (m)
const TARGET_COLOR = 0x5c6670; // the target's usual color
const TARGET_HIT_COLOR = 0xc0392b; // the target flashes this on a hit
const FLASH_TIME = 0.15; // how long a hit keeps the target red (s)
const TRACER_COLOR = 0xffe066; // the shot's line
const TRACER_TIME = 0.05; // how long the shot's line shows (s)
const MOUSE_TURN = 0.004; // the yaw a pixel of mouse drag adds (rad/px)
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
function tuneWithParams<T extends Record<string, number>>(base: T, params: URLSearchParams): T {
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
function checkOneTable(a: Record<string, number>, b: Record<string, number>) {
  for (const name of Object.keys(a)) {
    if (name in b) throw new Error(`the tune name "${name}" is in two tables`);
  }
}

const axis = (held: Set<string>, plus: string, minus: string): number =>
  (held.has(plus) ? 1 : 0) - (held.has(minus) ? 1 : 0);

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
  // default shot (forward from the chest) with the caller's own; it says whether that shot hit.
  step(
    input: MechInput,
    dt: number,
    moveTune: MoveTune,
    feelTune: FeelTune,
    onFire?: (mech: MechState) => boolean,
  ): { fov: number; offset: THREE.Vector3 };
}

export interface FlatRangeOptions {
  targets?: boolean; // false leaves out the five fixed boxes, when the caller brings its own
}

// Builds what #view-move and #view-touch share: the mech, the targets, the shots and their effects (the flat ground
// is the start-up field's). Nothing here reads an input device; the caller fills MechInput.
export function buildFlatRange(baseFov: number, options: FlatRangeOptions = {}): FlatRange {
  const mech = newMech();
  const feel = newFeel(baseFov);
  const model = buildMechProxy(MECH_HEIGHT);
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

  function shoot(): boolean {
    const dx = -Math.sin(mech.yaw);
    const dz = -Math.cos(mech.yaw);
    const chest = mech.y + CHEST_HEIGHT;
    const index = fireRay(mech.x, chest, mech.z, dx, 0, dz, SHOT_RANGE, targetBoxes);
    const reach = index >= 0 ? TARGETS[index].dist : SHOT_RANGE;
    tracer(mech.x, chest, mech.z, dx, 0, dz, reach);
    if (index < 0) return false;
    targets[index].flashT = FLASH_TIME;
    targets[index].mesh.material.color.setHex(TARGET_HIT_COLOR);
    return true;
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
    onFire?: (mech: MechState) => boolean,
  ) {
    const frame = feelStep(feel, dt, mech.boosting, baseFov, feelTune);
    const events = frame.stopped ? [] : stepMech(mech, input, dt, moveTune, feelTune.fireRate);
    let hit = false;
    for (const event of events) {
      if (event.kind === 'fire') hit = (onFire ? onFire(mech) : shoot()) || hit;
      else if (event.kind === 'land') spawnDust(mech.x, mech.z, LAND_DUST, feelTune);
      else if (event.kind === 'boostStart') spawnDust(mech.x, mech.z, BOOST_DUST, feelTune);
    }
    feelEvents(feel, events, hit, feelTune);
    stepEffects(dt);
    model.position.set(mech.x, mech.y, mech.z);
    model.rotation.y = mech.yaw;
    return { fov: frame.fov, offset: frame.offset };
  }

  return { mech, feel, model, tracer, step };
}

export function showMove(_hash: string) {
  const params = new URLSearchParams(location.search);
  const cameraTune = tuneFrom(params);
  checkOneTable(MOVE_TUNE, FEEL_TUNE);
  const moveTune = tuneWithParams(MOVE_TUNE, params);
  const feelTune = tuneWithParams(FEEL_TUNE, params);
  // ?feel=0 turns the visible effects off for a comparison; the fire rate is the number of shots, not a feel.
  if (params.get('feel') === '0') {
    feelTune.boostFov = 0;
    feelTune.landShake = 0;
    feelTune.fireShake = 0;
    feelTune.hitStop = 0;
    feelTune.dust = 0;
  }

  const sizeBox = scene.getObjectByName(SIZE_BOX_NAME);
  if (sizeBox) sizeBox.visible = false;

  const range = buildFlatRange(cameraTune.fov);
  const mech = range.mech;
  const keys = heldKeys();
  const walls: THREE.Box3[] = []; // no walls in this view

  // The HUD at the bottom left: the numbers that say what the movement did.
  const hud = document.createElement('div');
  hud.id = 'sbMoveHud';
  hud.style.cssText =
    'position:fixed;left:8px;bottom:8px;padding:4px 6px;font:12px/1.4 monospace;color:#fff;' +
    'background:rgba(0,0,0,0.45);white-space:pre;pointer-events:none';
  document.body.appendChild(hud);

  let mouseDown = false;
  let dragging = false;
  let lastMouseX = 0;
  let mouseYaw = 0; // the yaw the mouse added since the last frame (rad)
  window.addEventListener('mousedown', event => {
    if (event.button === 0) mouseDown = true;
    dragging = true;
    lastMouseX = event.clientX;
  });
  window.addEventListener('mouseup', event => {
    if (event.button === 0) mouseDown = false;
    dragging = false;
  });
  window.addEventListener('mousemove', event => {
    if (!dragging) return;
    mouseYaw -= (event.clientX - lastMouseX) * MOUSE_TURN;
    lastMouseX = event.clientX;
  });

  let camPos: THREE.Vector3 | null = null;

  addSystem({
    name: 'sb-move',
    update: dt => {
      const turnKeys = clamp(axis(keys.held, 'KeyQ', 'KeyE') + axis(keys.held, 'ArrowLeft', 'ArrowRight'), -1, 1);
      const input: MechInput = {
        moveX: axis(keys.held, 'KeyD', 'KeyA'),
        moveZ: axis(keys.held, 'KeyW', 'KeyS'),
        turn: turnKeys * moveTune.turn * dt + mouseYaw,
        jump: keys.pressed.has('Space'),
        jumpHeld: keys.held.has('Space'),
        boost: keys.held.has('ShiftLeft') || keys.held.has('ShiftRight'),
        fire: keys.held.has('KeyJ') || mouseDown,
      };
      mouseYaw = 0;
      keys.pressed.clear();

      const step = range.step(input, dt, moveTune, feelTune);

      const pose = cameraPose({ x: mech.x, y: mech.y, z: mech.z, yaw: mech.yaw }, 0, cameraTune, walls);
      camPos = camPos ? followPose(camPos, pose.pos, dt, cameraTune.lag) : pose.pos.clone();
      const pos = camPos.clone().add(step.offset);
      applyPose(camera, { ...pose, pos }, step.fov);

      // The HUD's numbers: the horizontal speed, the gauge, the ground and the landing stop.
      hud.textContent =
        `speed ${Math.hypot(mech.vx, mech.vz).toFixed(1)} m/s\n` +
        `gauge ${mech.gauge.toFixed(2)}\n` +
        `${mech.grounded ? 'ground' : 'air'}\n` +
        `land ${mech.landT.toFixed(2)} s`;
    },
  });
}
