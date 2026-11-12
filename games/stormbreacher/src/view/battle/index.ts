// The battle around the mech, in the sortie and in #view-fx (SB-045, SB-170): the allies walking landward, the shells
// falling near the mech, the smoke they leave, the columns from the wrecks, the tracers crossing the view and the planes
// overhead. It reads the battle's state (logic/battle.ts) and draws it; it does not decide anything about the game and
// touches no part of GameModel. Everything that comes in numbers is drawn from one instanced mesh per kind, made once at
// the size the tune asks for.
import * as THREE from 'three';
import { type Rng } from '@engine/core/index.ts';
import { burst, disposeTree, scene } from '@engine/render/index.ts';
import type { FxTune } from '../../data/tune.ts';
import { PROP_SIZE } from '../../data/props.ts';
import type { MapDef, Prop } from '../../data/types.ts';
import { newBattle, stepBattle } from '../../logic/battle.ts';
import { MAX_SOLDIERS, crowdCounts, type Crowd, type CrowdCounts } from '../../logic/crowd.ts';
import { addShellCrater, craterInsideBounds, scatterCraters, type Crater } from '../../logic/craters.ts';
import { newPlane, stepPlane, type Plane } from '../../logic/planes.ts';
import { shellBurst } from '../hazards.ts';
import { MAX_TRACERS, craterMeshes, planeGroup, smokeMesh, soldierMeshes, tracerMesh } from './parts.ts';

const BODY_Y = 0.62; // the body's middle above the feet (m)
const HEAD_Y = 1.36; // the head's middle above the feet (m)
const BODY_DEAD_Y = 0.24; // the body's middle once it lies down (m)
const HEAD_DEAD_Y = 0.2; // the head's middle once it lies down (m)
const HEAD_FORWARD = 0.78; // how far the head lies past the body (m)
const FALL_DUST_COLOR = 0x766a58; // the dust a falling ally raises
const FALL_DUST = 4; // the pieces of that dust

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
  // Moves the battle one frame and gives back the shake the shells ask the camera to add this frame (m).
  step(dt: number, mech: { x: number; y: number; z: number }): number;
  // Lets one tracer fly from a place at a velocity (m, m/s); the allies of the sortie shoot with it.
  tracer(at: { x: number; y: number; z: number }, velocity: { x: number; y: number; z: number }): void;
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
): Battle {
  const group = new THREE.Group();
  group.name = BATTLE_GROUP_NAME;
  const state = newBattle(rng, map.bounds, tune);
  const crowd = state.crowd;
  const { bodies, heads } = soldierMeshes();
  const smoke = smokeMesh(tune.smokeMax);
  const smokeCapacity = Math.max(1, Math.round(tune.smokeMax));
  const tracers = tracerMesh();
  const planeGroups = Array.from({ length: MAX_PLANES }, () => planeGroup());
  const craterCapacity = Math.max(1, Math.round(tune.craters) + Math.round(tune.craterCap));
  const craterParts = craterMeshes(craterCapacity);
  group.add(bodies, heads, smoke, tracers, ...planeGroups, craterParts.discs, craterParts.rims, craterParts.water);
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

  // Shows a shell that landed at (x, z): its flash and dirt, its hole and its smoke.
  function landShell(x: number, z: number) {
    shellBurst(x, z);
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
    for (let i = tracerList.length - 1; i >= 0; i--) {
      const tracer = tracerList[i];
      tracer.x += tracer.vx * dt;
      tracer.y += tracer.vy * dt;
      tracer.z += tracer.vz * dt;
      tracer.life -= dt;
      if (tracer.life <= 0 || tracer.z > map.bounds.maxZ + TRACER_PAST) tracerList.splice(i, 1);
    }
  }

  function stepPlanes(dt: number) {
    for (const plane of planes) stepPlane(plane, rng, map.bounds, tune.planeSpeed, dt);
  }

  function drawSoldiers() {
    const list = crowd.soldiers;
    const n = Math.min(list.length, MAX_SOLDIERS);
    for (let i = 0; i < n; i++) {
      const soldier = list[i];
      if (soldier.alive) {
        dummy.rotation.set(0, soldier.yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.position.set(soldier.x, BODY_Y, soldier.z);
        dummy.updateMatrix();
        bodies.setMatrixAt(i, dummy.matrix);
        dummy.position.set(soldier.x, HEAD_Y, soldier.z);
        dummy.updateMatrix();
        heads.setMatrixAt(i, dummy.matrix);
      } else {
        const fx = -Math.sin(soldier.yaw);
        const fz = -Math.cos(soldier.yaw);
        dummy.rotation.set(Math.PI / 2, soldier.yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.position.set(soldier.x, BODY_DEAD_Y, soldier.z);
        dummy.updateMatrix();
        bodies.setMatrixAt(i, dummy.matrix);
        dummy.position.set(soldier.x + fx * HEAD_FORWARD, HEAD_DEAD_Y, soldier.z + fz * HEAD_FORWARD);
        dummy.rotation.set(Math.PI / 2, soldier.yaw, Math.PI / 2);
        dummy.updateMatrix();
        heads.setMatrixAt(i, dummy.matrix);
      }
    }
    showInstances(bodies, n);
    showInstances(heads, n);
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  }

  function drawSmoke() {
    for (let i = 0; i < smokePuffs.length; i++) {
      const puff = smokePuffs[i];
      const k = Math.min(1, puff.age / puff.life);
      dummy.position.set(puff.x, puff.y, puff.z);
      dummy.rotation.set(0, 0, 0);
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

  return {
    crowd,
    group,
    step(dt, mech) {
      const frame = stepBattle(state, rng, dt, tune, mech);
      for (const soldier of frame.fell) burst(soldier.x, 0.5, soldier.z, FALL_DUST_COLOR, FALL_DUST, 3, 0.4, 2);
      let shake = 0;
      if (frame.shell !== null) {
        landShell(frame.shell.x, frame.shell.z);
        shake = frame.shell.shake;
      }
      stepSmoke(dt);
      stepTracers(dt, mech);
      stepPlanes(dt);
      drawSoldiers();
      drawSmoke();
      drawTracers();
      drawPlanes();
      return shake;
    },
    tracer(at, velocity) {
      if (tracerList.length >= MAX_TRACERS) return;
      tracerList.push({ x: at.x, y: at.y, z: at.z, vx: velocity.x, vy: velocity.y, vz: velocity.z, life: TRACER_LIFE });
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
