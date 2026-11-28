// The battle around the mech, in the sortie and in #view-fx (SB-045, SB-170): the allies walking landward, the shells
// falling near the mech, the smoke they leave, the columns from the wrecks, the tracers crossing the view and the planes
// overhead. It draws the battle's state (logic/battle.ts). The sortie keeps that state in GameModel and step moves it; the
// view only draws the frame's events. #view-fx keeps its own state and steps it. Either way the view decides nothing about
// the game and writes nothing back. Everything that comes in numbers is drawn from one instanced mesh per kind, made once
// at the size the tune asks for.
import * as THREE from 'three';
import { type Rng } from '@engine/core/index.ts';
import { burst, camera, disposeTree, scene } from '@engine/render/index.ts';
import { FEEDBACK_COLOR } from '../../data/colors.ts';
import { DROID_TUNE } from '../../data/droids.ts';
import { FEEDBACK_TUNE, INFANTRY_TUNE, type FxTune } from '../../data/tune.ts';
import { M1_NEST_WAVE } from '../../data/enemies.ts';
import { PROP_SIZE } from '../../data/props.ts';
import type { MapDef, Prop } from '../../data/types.ts';
import { newBattle, stepBattle, type BattleState } from '../../logic/battle.ts';
import type { GroundRect } from '../../logic/collide.ts';
import {
  MAX_SOLDIERS,
  crowdCounts,
  fallNear,
  spawnWave,
  type Crowd,
  type CrowdCounts,
  type Soldier,
} from '../../logic/crowd.ts';
import { addShellCrater, craterInsideBounds, scatterCraters, type Crater } from '../../logic/craters.ts';
import { blastFaceHeight, type GameEvent } from '../../logic/game.ts';
import { newPlane, stepPlane, type Plane } from '../../logic/planes.ts';
import { markColor, markSize, sparkReady } from '../battleMarks.ts';
import { droidMatricesChanged, selectNearSoldiers, showDroid, writeDroid } from '../droidPose.ts';
import { shellBurst } from '../hazards.ts';
import { MAX_TRACERS, craterMeshes, planeGroup, smokeMesh, soldierMeshes, tracerMesh } from './parts.ts';

const FALL_DUST_COLOR = 0x766a58; // the dust a falling ally raises
const FALL_DUST = 4; // the pieces of that dust

const MARK_MESH_NAME = 'sb-battle-marks'; // the marks over the soldiers that are aimed at
// How near a hit event's point the soldier it belongs to may have stepped before the frame was drawn (m). The battle
// moves the soldiers after the enemy's fire has named them, so the two do not meet exactly.
const MARK_MATCH = 2;

// The marks over the soldiers that are aimed at: one camera-facing downward triangle per soldier, its colour and size
// from battleMarks. The geometry is a unit triangle with its point at the bottom, so the instance's scale is its size.
function markMesh(capacity: number): THREE.InstancedMesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0.5, 0, 0.5, 0.5, 0, 0, -0.5, 0], 3));
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = MARK_MESH_NAME;
  const color = new THREE.Color(0xffffff);
  for (let i = 0; i < capacity; i++) mesh.setColorAt(i, color);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  return mesh;
}

const SMOKE_RISE = 1.4; // how fast a puff rises (m/s)
const SMOKE_GROW = 2.2; // how much bigger a puff gets by the end
const WRECK_SMOKE_EVERY = 0.9; // how often a wreck gives a puff (s)
const WRECK_SMOKE_LIFT = 0.5; // how far above the wreck's top a puff starts (m)

const TRACER_LIFE = 3; // how long a tracer may fly (s)
const TRACER_SIDE = 70; // how far to either side a tracer starts (m)
const TRACER_BACK = 90; // how far toward the land a tracer starts (m)
const TRACER_FRONT = 30; // ... and the nearest (m)
const TRACER_LIFT = 18; // how high the highest tracer starts (m)

const MAX_PLANES = 12; // the most planes made; the tune shows fewer
const TRACER_PAST = 160; // how far past the sea edge a tracer flies before it goes (m)

const CRATER_DISC_Y = 0.02; // the hole's floor, just above the ground (m)
const CRATER_WATER_Y = 0.04; // the water, just above the floor (m)
const CRATER_RIM_Y = 0.05; // the rim's middle (m)
const CRATER_WATER_SCALE = 0.62; // the water's radius against the hole's

interface Puff {
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
  size: number;
  rise: number;
}

interface Tracer {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

interface WreckSmoke {
  x: number;
  y: number; // where its puffs start, above the wreck (m)
  z: number;
  t: number; // seconds until its next puff (s)
}

export const BATTLE_GROUP_NAME = 'sbBattle';

export interface Battle {
  crowd: Crowd;
  group: THREE.Group;
  // Moves the battle one frame and gives back the shake the shells ask the camera to add this frame (m). While `held`,
  // the allies wait at the crowd's holdZ and no new wave comes in. The sortie does not call this: its GameModel owns the
  // state and step moves it, and the view calls draw.
  step(dt: number, mech: { x: number; y: number; z: number }, held?: boolean): number;
  // Draws the battle the game's step has already moved (the sortie): the dust of the soldiers that fell and the shells
  // that landed, then the view's own smoke, tracers and planes. Gives back the shake the shells ask the camera to add.
  draw(dt: number, mech: { x: number; y: number; z: number }, held: boolean, events: readonly GameEvent[]): number;
  // Moves the waiting line to a milestone's next cover and sends one more wave of infantry in from the sea (SB-2010).
  advance(holdZ: number, count: number): void;
  // Lets one tracer fly from a place at a velocity (m, m/s); the allies of the sortie shoot with it.
  tracer(at: { x: number; y: number; z: number }, velocity: { x: number; y: number; z: number }): void;
  // Moves and draws only the tracers already out, for the landing cutscene: the battlefield's own clock stays still.
  drawTracersOnly(dt: number): void;
  // Lets a blast of the game's own (a mortar shell or a mine) take the soldiers near it (m), with the dust of each.
  blast(x: number, z: number): void;
  counts(): CrowdCounts;
  smoke(): number; // the smoke puffs on screen now
  dispose(): void;
}

// An instanced mesh with no instances is not drawn at all: keep it out of the frame's draw calls too.
function showInstances(mesh: THREE.InstancedMesh, count: number) {
  mesh.count = count;
  mesh.visible = count > 0;
}

// The wrecks that keep a column of smoke, in the order the seed picks them.
function wreckSources(rng: Rng, props: readonly Prop[]): WreckSmoke[] {
  const wrecks = props.filter(prop => prop.kind === 'wreck');
  return rng.shuffle([...wrecks]).map(prop => ({
    x: prop.x,
    y: PROP_SIZE[prop.kind].h * prop.scale + WRECK_SMOKE_LIFT,
    z: prop.z,
    t: rng.rand(0, WRECK_SMOKE_EVERY),
  }));
}

export function buildBattle(
  map: MapDef,
  tune: FxTune,
  rng: Rng,
  craterRng: Rng,
  start: { x: number; z: number },
  holdZ: number | null = null,
  rects: readonly GroundRect[] = [],
  given: BattleState | null = null,
): Battle {
  const group = new THREE.Group();
  group.name = BATTLE_GROUP_NAME;
  // the machine-gun nests are on the map's spawns; a squad walks on one and falls in its fire (see logic/crowd.ts)
  const state = given ?? newBattle(rng, map.bounds, tune, holdZ, map.spawns[M1_NEST_WAVE] ?? []);
  const crowd = state.crowd;
  const nearSoldiers = soldierMeshes();
  const farSoldiers = soldierMeshes(MAX_SOLDIERS, 'far');
  const smoke = smokeMesh(tune.smokeMax);
  const smokeCapacity = Math.max(1, Math.round(tune.smokeMax));
  const tracers = tracerMesh();
  const markCapacity = Math.max(1, Math.round(FEEDBACK_TUNE.maxMarks));
  const marks = markMesh(markCapacity);
  const planeGroups = Array.from({ length: MAX_PLANES }, () => planeGroup());
  const craterCapacity = Math.max(1, Math.round(tune.craters) + Math.round(tune.craterCap));
  const craterParts = craterMeshes(craterCapacity);
  group.add(
    nearSoldiers.bodies,
    nearSoldiers.heads,
    farSoldiers.bodies,
    farSoldiers.heads,
    smoke,
    tracers,
    marks,
    ...planeGroups,
    craterParts.discs,
    craterParts.rims,
    craterParts.water,
  );
  scene.add(group);

  const craterList = scatterCraters(craterRng, map, tune, start);
  const shellCraters: Crater[] = [];
  const smokePuffs: Puff[] = [];
  const tracerList: Tracer[] = [];
  const planes: Plane[] = Array.from({ length: MAX_PLANES }, () => newPlane(rng, map.bounds));
  const wreckSmokes = wreckSources(rng, map.props);

  const dummy = new THREE.Object3D();
  const forward = new THREE.Vector3(0, 0, 1);
  const heading = new THREE.Vector3();
  const puffColor = new THREE.Color();
  const markTint = new THREE.Color();
  const freshColor = new THREE.Color(tune.smokeColor);
  const darkColor = new THREE.Color(tune.smokeDark);

  let tracerT = tune.tracers > 0 ? 1 / tune.tracers : 0;

  function drawCraters() {
    const room = Math.max(0, craterCapacity - craterList.length);
    while (shellCraters.length > room) shellCraters.shift();
    const all = [...craterList, ...shellCraters];
    let waterCount = 0;
    for (let i = 0; i < all.length; i++) {
      const crater = all[i];
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(crater.x, CRATER_DISC_Y, crater.z);
      dummy.scale.set(crater.radius, 1, crater.radius);
      dummy.updateMatrix();
      craterParts.discs.setMatrixAt(i, dummy.matrix);
      dummy.position.set(crater.x, CRATER_RIM_Y, crater.z);
      dummy.scale.set(crater.radius, crater.radius, crater.radius);
      dummy.updateMatrix();
      craterParts.rims.setMatrixAt(i, dummy.matrix);
      if (crater.water) {
        const waterRadius = crater.radius * CRATER_WATER_SCALE;
        dummy.position.set(crater.x, CRATER_WATER_Y, crater.z);
        dummy.scale.set(waterRadius, 1, waterRadius);
        dummy.updateMatrix();
        craterParts.water.setMatrixAt(waterCount, dummy.matrix);
        waterCount++;
      }
    }
    showInstances(craterParts.discs, all.length);
    showInstances(craterParts.rims, all.length);
    showInstances(craterParts.water, waterCount);
    craterParts.discs.instanceMatrix.needsUpdate = true;
    craterParts.rims.instanceMatrix.needsUpdate = true;
    craterParts.water.instanceMatrix.needsUpdate = true;
  }

  function addShellCraterAt(x: number, z: number) {
    if (tune.shellCrater < 0.5) return;
    const low = Math.max(0.5, Math.min(tune.craterMin, tune.craterMax));
    const high = Math.max(low, tune.craterMax);
    const crater: Crater = {
      x,
      z,
      radius: craterRng.rand(low, high),
      water: craterRng.next() < Math.max(0, Math.min(1, tune.craterWater)),
    };
    if (!craterInsideBounds(crater, map.bounds)) return;
    addShellCrater(shellCraters, crater, tune.craterCap);
    drawCraters();
  }

  drawCraters();

  function smokeLimit(): number {
    return Math.min(smokeCapacity, Math.max(0, Math.round(tune.smokeMax)));
  }

  function addPuff(x: number, y: number, z: number, size: number, life: number, rise: number) {
    if (smokePuffs.length >= smokeLimit() || life <= 0) return;
    smokePuffs.push({ x, y, z, age: 0, life, size, rise });
  }

  // Shows a shell that landed at (x, z): its flash and dirt, its hole and its smoke. The flash stands on the face under
  // it, so one that lands on the seawall is not drawn inside it.
  function landShell(x: number, z: number) {
    shellBurst(x, z, blastFaceHeight(rects, x, z));
    addShellCraterAt(x, z);
    const cubes = Math.min(200, Math.max(0, Math.round(tune.smokeCubes)));
    for (let i = 0; i < cubes; i++) {
      addPuff(
        x + rng.rand(-6, 6),
        rng.rand(0.5, 3),
        z + rng.rand(-6, 6),
        rng.rand(2.5, 5),
        tune.smokeLife,
        SMOKE_RISE * rng.rand(0.6, 1.3),
      );
    }
  }

  function addTracer(at: { x: number; z: number }) {
    if (tracerList.length >= MAX_TRACERS) return;
    const speed = Math.max(1, tune.tracerSpeed);
    const vx = rng.rand(-18, 18);
    const vy = rng.rand(-2, 4);
    const vz = speed;
    const size = Math.hypot(vx, vy, vz);
    tracerList.push({
      x: at.x + rng.rand(-TRACER_SIDE, TRACER_SIDE),
      y: rng.rand(2, TRACER_LIFT),
      z: at.z - rng.rand(TRACER_FRONT, TRACER_BACK),
      vx: (vx / size) * speed,
      vy: (vy / size) * speed,
      vz: (vz / size) * speed,
      life: TRACER_LIFE,
    });
  }

  function stepSmoke(dt: number) {
    const limit = smokeLimit();
    if (smokePuffs.length > limit) smokePuffs.splice(0, smokePuffs.length - limit);
    for (let i = smokePuffs.length - 1; i >= 0; i--) {
      const puff = smokePuffs[i];
      puff.age += dt;
      if (puff.age >= puff.life) {
        smokePuffs.splice(i, 1);
        continue;
      }
      puff.y += puff.rise * dt;
    }
    const active = Math.max(0, Math.min(wreckSmokes.length, Math.round(tune.wreckSmoke)));
    for (let i = 0; i < wreckSmokes.length; i++) {
      const source = wreckSmokes[i];
      source.t -= dt;
      if (source.t > 0) continue;
      source.t += WRECK_SMOKE_EVERY;
      if (i >= active) continue;
      addPuff(source.x + rng.rand(-1, 1), source.y, source.z + rng.rand(-1, 1), rng.rand(2.5, 4), tune.smokeLife, 1);
    }
  }

  // Moves the tracers already out and takes the old ones away; it draws none.
  function moveTracers(dt: number) {
    for (let i = tracerList.length - 1; i >= 0; i--) {
      const tracer = tracerList[i];
      tracer.x += tracer.vx * dt;
      tracer.y += tracer.vy * dt;
      tracer.z += tracer.vz * dt;
      tracer.life -= dt;
      if (tracer.life <= 0 || tracer.z > map.bounds.maxZ + TRACER_PAST) tracerList.splice(i, 1);
    }
  }

  function stepTracers(dt: number, at: { x: number; z: number }) {
    const rate = tune.tracers;
    if (rate > 0) {
      tracerT -= dt;
      for (let n = 0; n < MAX_TRACERS && tracerT <= 0; n++) {
        addTracer(at);
        tracerT += 1 / rate;
      }
      if (tracerT <= 0) tracerT = 0;
    }
    moveTracers(dt);
  }

  function stepPlanes(dt: number) {
    for (const plane of planes) stepPlane(plane, rng, map.bounds, tune.planeSpeed, dt);
  }

  // the view's own mark of which soldiers take the close form this frame, kept between frames (SB-2085)
  const nearFlags = new Uint8Array(MAX_SOLDIERS);
  const nearList: number[] = [];
  // The marks' own clock and the last spark of each soldier (SB-2272): the view's state, not the game's.
  let markTime = 0;
  const lastSpark = new WeakMap<Soldier, number>();
  const marked: { soldier: Soldier; dist: number }[] = [];

  function drawSoldiers(held: boolean) {
    const list = crowd.soldiers;
    const n = Math.min(list.length, MAX_SOLDIERS);
    const holdZ = crowd.holdZ;
    // the close form goes to the nearest soldiers within the tune's distance, up to its cap; the rest keep the far form
    const near = selectNearSoldiers(list, camera.position, DROID_TUNE.nearDistance, DROID_TUNE.nearCap, nearList);
    nearFlags.fill(0, 0, n);
    for (const index of near) if (index < n) nearFlags[index] = 1;
    let nearCount = 0;
    let farCount = 0;
    for (let i = 0; i < n; i++) {
      const soldier = list[i];
      // waiting at the line (the view's own read of stepCrowd's rule), or standing on the post it took in a secured
      // sector; one still walking to its post keeps the walk
      const posted = soldier.post !== null && Math.hypot(soldier.x - soldier.post.x, soldier.z - soldier.post.z) < 0.05;
      const waiting = soldier.alive && (posted || (held && holdZ !== null && soldier.z <= holdZ + 1e-9));
      const close = nearFlags[i] === 1;
      const meshes = close ? nearSoldiers : farSoldiers;
      const at = close ? nearCount++ : farCount++;
      writeDroid(
        meshes,
        at,
        soldier.x,
        0,
        soldier.z,
        soldier.yaw,
        soldier.alive ? 0 : 1,
        waiting ? 1 : 0,
        soldier.alive && !waiting ? 1 : 0,
        soldier.phase,
      );
    }
    showDroid(nearSoldiers, nearCount);
    showDroid(farSoldiers, farCount);
    droidMatricesChanged(nearSoldiers);
    droidMatricesChanged(farSoldiers);
  }

  // The mark over each soldier that is aimed at, nearest to the camera first, up to maxMarks: a small downward triangle
  // facing the camera, amber while the soldier is whole and redder as its health falls (SB-2272).
  function drawMarks() {
    const list = crowd.soldiers;
    const n = Math.min(list.length, MAX_SOLDIERS);
    marked.length = 0;
    for (let i = 0; i < n; i++) {
      const soldier = list[i];
      if (!soldier.alive || soldier.targetedT <= 0) continue;
      const dx = soldier.x - camera.position.x;
      const dz = soldier.z - camera.position.z;
      marked.push({ soldier, dist: dx * dx + dz * dz });
    }
    marked.sort((a, b) => a.dist - b.dist);
    const count = Math.min(marked.length, markCapacity);
    const size = markSize();
    const y = DROID_TUNE.height + FEEDBACK_TUNE.markLift + size / 2;
    for (let i = 0; i < count; i++) {
      const soldier = marked[i].soldier;
      dummy.position.set(soldier.x, y, soldier.z);
      dummy.quaternion.copy(camera.quaternion);
      dummy.scale.setScalar(size);
      dummy.updateMatrix();
      marks.setMatrixAt(i, dummy.matrix);
      markTint.setHex(markColor(soldier.hp / INFANTRY_TUNE.hp));
      marks.setColorAt(i, markTint);
    }
    showInstances(marks, count);
    marks.instanceMatrix.needsUpdate = true;
    if (marks.instanceColor) marks.instanceColor.needsUpdate = true;
  }

  // The soldier a hit event belongs to: the nearest one to the event's point. The battle moves the soldiers after the
  // enemy's fire names them, so the point and the soldier may be a step apart by the time the frame is drawn.
  function nearestSoldier(x: number, z: number): Soldier | null {
    let best: Soldier | null = null;
    let bestDist = MARK_MATCH * MARK_MATCH;
    for (const soldier of crowd.soldiers) {
      const dx = soldier.x - x;
      const dz = soldier.z - z;
      const dist = dx * dx + dz * dz;
      if (dist > bestDist) continue;
      bestDist = dist;
      best = soldier;
    }
    return best;
  }

  // A small spark at the chest of each soldier a shot has just hit, at most one per soldier in sparkGap seconds (SB-2272).
  function sparkHits(events: readonly GameEvent[]) {
    for (const event of events) {
      if (event.kind !== 'infantryHit') continue;
      const soldier = nearestSoldier(event.x, event.z);
      if (soldier === null) continue;
      if (!sparkReady(lastSpark.get(soldier) ?? null, markTime)) continue;
      lastSpark.set(soldier, markTime);
      burst(
        soldier.x,
        FEEDBACK_TUNE.sparkHeight,
        soldier.z,
        FEEDBACK_COLOR.spark,
        FEEDBACK_TUNE.sparkCount,
        FEEDBACK_TUNE.sparkSpeed,
        FEEDBACK_TUNE.sparkLife,
        FEEDBACK_TUNE.sparkGravity,
      );
    }
  }

  function drawSmoke() {
    for (let i = 0; i < smokePuffs.length; i++) {
      const puff = smokePuffs[i];
      const k = Math.min(1, puff.age / puff.life);
      dummy.position.set(puff.x, puff.y, puff.z);
      dummy.quaternion.copy(camera.quaternion);
      dummy.scale.setScalar(puff.size * (0.7 + SMOKE_GROW * k));
      dummy.updateMatrix();
      smoke.setMatrixAt(i, dummy.matrix);
      puffColor.copy(freshColor).lerp(darkColor, k);
      smoke.setColorAt(i, puffColor);
    }
    showInstances(smoke, smokePuffs.length);
    smoke.instanceMatrix.needsUpdate = true;
    if (smoke.instanceColor) smoke.instanceColor.needsUpdate = true;
  }

  function drawTracers() {
    for (let i = 0; i < tracerList.length; i++) {
      const tracer = tracerList[i];
      heading.set(tracer.vx, tracer.vy, tracer.vz).normalize();
      dummy.position.set(tracer.x, tracer.y, tracer.z);
      dummy.quaternion.setFromUnitVectors(forward, heading);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      tracers.setMatrixAt(i, dummy.matrix);
    }
    showInstances(tracers, tracerList.length);
    tracers.instanceMatrix.needsUpdate = true;
  }

  function drawPlanes() {
    const shown = Math.min(MAX_PLANES, Math.max(0, Math.round(tune.planes)));
    for (let i = 0; i < MAX_PLANES; i++) {
      const plane = planes[i];
      const mesh = planeGroups[i];
      mesh.visible = i < shown;
      if (!mesh.visible) continue;
      // the plane is built facing +z; a crossing along x turns it a quarter turn
      mesh.position.set(plane.x, tune.planeHeight + plane.lift, plane.z);
      mesh.rotation.set(0, plane.dir > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
    }
  }

  // The view's own share of a frame, once the battle's state is where the game put it.
  function drawFrame(dt: number, mech: { x: number; y: number; z: number }, held: boolean) {
    markTime += dt;
    stepSmoke(dt);
    stepTracers(dt, mech);
    stepPlanes(dt);
    drawSoldiers(held);
    drawMarks();
    drawSmoke();
    drawTracers();
    drawPlanes();
  }

  return {
    crowd,
    group,
    advance(holdZ, count) {
      if (given !== null) return; // the game's own state: only its step moves it
      crowd.holdZ = holdZ;
      crowd.holdT = 0; // each new line starts its waiting loss over (SB-2020)
      if (crowd.bounds !== null && count > 0) spawnWave(crowd, rng, crowd.bounds, count, tune);
    },
    step(dt, mech, held = false) {
      if (given !== null) return 0;
      const frame = stepBattle(state, rng, dt, tune, mech, held);
      for (const soldier of frame.fell) burst(soldier.x, 0.5, soldier.z, FALL_DUST_COLOR, FALL_DUST, 3, 0.4, 2);
      let shake = 0;
      if (frame.shell !== null) {
        landShell(frame.shell.x, frame.shell.z);
        shake = frame.shell.shake;
      }
      drawFrame(dt, mech, held);
      return shake;
    },
    draw(dt, mech, held, events) {
      let shake = 0;
      sparkHits(events);
      for (const event of events) {
        if (event.kind === 'battleFell') {
          burst(event.x, 0.5, event.z, FALL_DUST_COLOR, FALL_DUST, 3, 0.4, 2);
        } else if (event.kind === 'battleShell') {
          landShell(event.x, event.z);
          shake = event.shake;
        }
      }
      drawFrame(dt, mech, held);
      return shake;
    },
    tracer(at, velocity) {
      if (tracerList.length >= MAX_TRACERS) return;
      tracerList.push({ x: at.x, y: at.y, z: at.z, vx: velocity.x, vy: velocity.y, vz: velocity.z, life: TRACER_LIFE });
    },
    drawTracersOnly(dt) {
      moveTracers(dt);
      drawTracers();
    },
    blast(x, z) {
      if (given !== null) return; // the game's own state: its step takes the soldiers a shell reaches
      for (const soldier of fallNear(crowd, x, z, tune.shellFallRadius, tune.shellFallShare, rng)) {
        burst(soldier.x, 0.5, soldier.z, FALL_DUST_COLOR, FALL_DUST, 3, 0.4, 2);
      }
    },
    counts: () => crowdCounts(crowd),
    smoke: () => smokePuffs.length,
    dispose() {
      scene.remove(group);
      group.traverse(object => {
        if (object instanceof THREE.InstancedMesh) object.dispose();
      });
      disposeTree(group);
    },
  };
}
