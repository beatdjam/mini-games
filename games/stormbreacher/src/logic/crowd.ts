// The allies of #view-fx (SB-045): waves of soldiers that come in from the sea side, walk landward with a little sway,
// fall now and then and stay down for a few seconds. Pure functions over a list, no three and no DOM, so a node test can
// run them. +z is the sea and -z is the land, as on the map.
import { clamp, distXZ, type Rng } from '@engine/core/index.ts';
import type { MapBounds, SpawnPoint } from '../data/types.ts';
import type { FxTune } from '../data/tune.ts';

// A hard cap on the soldiers in the list, so the view's instanced mesh is always big enough. The first wave plus the
// waves after it can reach it; from then on a new wave brings no one until the fallen are gone.
export const MAX_SOLDIERS = 1200;

const LAND_FRACTION = 0.09; // the far defence line's z, as a share of the bounds' depth from minZ
const SPAWN_MARGIN = 2; // how far inside the side edges a soldier comes in (m)
const SPAWN_DEPTH = 8; // how far back from the sea edge a wave is spread (m)
const SWAY_RATE = 1.3; // how fast a soldier sways side to side (rad/s)
const SWAY_SPEED = 0.6; // how fast the sway moves it sideways (m/s)
const EDGE_MARGIN = 1; // how close a swaying soldier may come to the side edge (m)
const SQUAD_ACROSS = 3; // how many soldiers stand in a squad's front rank
const SQUAD_GAP_X = 2.2; // how far apart two of them stand across (m)
const SQUAD_GAP_Z = 2; // how far one rank stands behind the next (m)
const SQUAD_NEST_SPREAD = 3; // how far off a nest's x a squad comes in (m); inside squadFallRadius, so it falls there
export const DEAD_LINGER = 4; // how long a fallen soldier stays on the ground (s)

export interface Soldier {
  x: number; // the feet (m)
  z: number;
  yaw: number; // which way it walks (rad); 0 walks toward -z
  alive: boolean; // false once it has fallen
  deadT: number; // seconds since it fell; counts only while alive is false
  phase: number; // how far its sway has run (rad)
  squad: number; // the squad it walks in (0 for one of the scattered soldiers)
  fallAt: SpawnPoint | null; // the machine-gun nest it falls near (null keeps it walking)
}

export interface Crowd {
  soldiers: Soldier[];
  bounds: MapBounds | null; // where the waves come in; set by the first spawnWave
  lineZ: number; // the z a soldier reaches the far defence line at (m)
  holdZ: number | null; // the z a held soldier waits at (m); null waits nowhere
  nests: readonly SpawnPoint[]; // where the machine guns stand (m); a squad walks on one and falls there
  waveT: number; // seconds until the next wave (s)
  fallen: number; // how many have fallen so far
  through: number; // how many have reached the line so far
}

export interface CrowdCounts {
  advancing: number; // still walking
  fallen: number; // down now or gone after lying there
  through: number; // past the line
  capped: boolean; // the list is at MAX_SOLDIERS, so a new wave brings no one
}

export function newCrowd(): Crowd {
  return { soldiers: [], bounds: null, lineZ: 0, holdZ: null, nests: [], waveT: 0, fallen: 0, through: 0 };
}

// Puts `count` soldiers near the sea edge. Squads of tune.squad come in on the nests, one squad to a nest and each
// soldier a step of the wedge from the one before; the rest of the wave is scattered across the map as before. Gives
// back how many joined; the cap may take fewer.
export function spawnWave(crowd: Crowd, rng: Rng, bounds: MapBounds, count: number, tune: FxTune): number {
  crowd.bounds = bounds;
  crowd.lineZ = bounds.minZ + (bounds.maxZ - bounds.minZ) * LAND_FRACTION;
  let added = 0;
  const want = Math.max(0, Math.floor(count));
  const squadSize = Math.max(0, Math.floor(tune.squad));
  const squads = Math.max(0, Math.floor(tune.squads));
  const inSquads = Math.min(want, squadSize * squads);
  for (let n = 0; n < squads && added < inSquads && crowd.nests.length > 0; n++) {
    const nest = crowd.nests[n % crowd.nests.length];
    const x = clamp(
      nest.x + rng.rand(-SQUAD_NEST_SPREAD, SQUAD_NEST_SPREAD),
      bounds.minX + SPAWN_MARGIN,
      bounds.maxX - SPAWN_MARGIN,
    );
    const z = bounds.maxZ - rng.rand(0, SPAWN_DEPTH);
    const falls = tune.squadFallRadius > 0 ? Math.floor(squadSize * clamp(tune.squadFallShare, 0, 1)) : 0;
    for (let i = 0; i < squadSize && added < inSquads && crowd.soldiers.length < MAX_SOLDIERS; i++) {
      const across = (i % SQUAD_ACROSS) - (SQUAD_ACROSS - 1) / 2;
      crowd.soldiers.push({
        x: x + across * SQUAD_GAP_X,
        z: z + Math.floor(i / SQUAD_ACROSS) * SQUAD_GAP_Z,
        yaw: 0,
        alive: true,
        deadT: 0,
        phase: rng.rand(0, Math.PI * 2),
        squad: n + 1,
        fallAt: i < falls ? { x: nest.x, z: nest.z } : null,
      });
      added++;
    }
  }
  // the rest of the wave comes in one by one, the same draws as the old scatter
  const scattered = want - added;
  for (let i = 0; i < scattered && crowd.soldiers.length < MAX_SOLDIERS; i++) {
    crowd.soldiers.push({
      x: rng.rand(bounds.minX + SPAWN_MARGIN, bounds.maxX - SPAWN_MARGIN),
      z: bounds.maxZ - rng.rand(0, SPAWN_DEPTH),
      yaw: 0,
      alive: true,
      deadT: 0,
      phase: rng.rand(0, Math.PI * 2),
      squad: 0,
      fallAt: null,
    });
    added++;
  }
  return added;
}

// Moves the crowd by one frame: brings the next wave when its time comes, walks the living, makes some fall, takes the
// fallen away after DEAD_LINGER and counts the ones that reach the line. While `held` and the crowd has a holdZ, the
// living stop at that line and no new wave comes in, so the field does not fill up while they wait. Gives back the
// soldiers that fell this frame, so the view can put a little dust where each one went down.
export function stepCrowd(crowd: Crowd, rng: Rng, dt: number, tune: FxTune, held = false): Soldier[] {
  const span = Math.max(0, dt);
  const fell: Soldier[] = [];
  const holdZ = held ? crowd.holdZ : null;

  if (holdZ === null && crowd.bounds !== null && tune.allyWaves > 0) {
    crowd.waveT -= span;
    if (crowd.waveT <= 0) {
      spawnWave(crowd, rng, crowd.bounds, Math.round(tune.allies), tune);
      crowd.waveT = Math.max(0.01, tune.allyWaves);
    }
  }

  const bounds = crowd.bounds;
  const deathChance = 1 - Math.exp(-Math.max(0, tune.allyDeathRate) * span);
  for (let i = crowd.soldiers.length - 1; i >= 0; i--) {
    const soldier = crowd.soldiers[i];
    if (!soldier.alive) {
      soldier.deadT += span;
      if (soldier.deadT >= DEAD_LINGER) crowd.soldiers.splice(i, 1);
      continue;
    }

    soldier.phase += SWAY_RATE * span;
    const sideways = Math.cos(soldier.phase) * SWAY_SPEED;
    soldier.x += sideways * span;
    soldier.z -= Math.max(0, tune.allySpeed) * span;
    soldier.yaw = Math.atan2(-sideways, Math.max(0.001, tune.allySpeed));
    if (bounds !== null) {
      soldier.x = clamp(soldier.x, bounds.minX + EDGE_MARGIN, bounds.maxX - EDGE_MARGIN);
    }

    // the waiting line comes before the far line: a held soldier stops there and never counts as through
    if (holdZ !== null && soldier.z < holdZ) soldier.z = holdZ;

    if (soldier.z <= crowd.lineZ) {
      crowd.through++;
      crowd.soldiers.splice(i, 1);
      continue;
    }
    // a squad that walks into a machine gun's fire falls there, before the steady loss of allyDeathRate
    if (soldier.fallAt !== null && distXZ(soldier, soldier.fallAt) <= tune.squadFallRadius) {
      soldier.alive = false;
      soldier.deadT = 0;
      crowd.fallen++;
      fell.push(soldier);
      continue;
    }
    if (tune.allyDeathRate > 0 && rng.next() < deathChance) {
      soldier.alive = false;
      soldier.deadT = 0;
      crowd.fallen++;
      fell.push(soldier);
    }
  }
  return fell;
}

// Makes the living soldiers within `radius` of (x, z) fall, each with a chance of `share`: a nearby shell's doing. A
// radius or a share of 0 keeps them up. Gives back the ones that fell this frame, for the view to put dust on them.
export function fallNear(crowd: Crowd, x: number, z: number, radius: number, share: number, rng: Rng): Soldier[] {
  const fell: Soldier[] = [];
  if (radius <= 0 || share <= 0) return fell;
  const chance = Math.min(1, share);
  for (const soldier of crowd.soldiers) {
    if (!soldier.alive || distXZ({ x, z }, soldier) > radius) continue;
    if (rng.next() >= chance) continue;
    soldier.alive = false;
    soldier.deadT = 0;
    crowd.fallen++;
    fell.push(soldier);
  }
  return fell;
}

// The numbers the view puts at the top left.
export function crowdCounts(crowd: Crowd): CrowdCounts {
  let advancing = 0;
  for (const soldier of crowd.soldiers) if (soldier.alive) advancing++;
  return { advancing, fallen: crowd.fallen, through: crowd.through, capped: crowd.soldiers.length >= MAX_SOLDIERS };
}
