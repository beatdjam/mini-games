// The front's trickle (SB-2230): while a sector is the front and not secured, the enemies keep coming out of its inland
// side, out of the overview camera's sight, one at a time and up to the sector's budget. The game asks these pure
// functions, so a node test runs them without a page (game.ts is not imported).
import type { Rng } from '@engine/core/index.ts';
import { ENEMIES, type EnemyKind } from '../data/enemies.ts';
import { M1_SECTORS, SECTOR_TUNE, WALL_SPAWN_TUNE, type SpawnZone } from '../data/sectors.ts';
import { TRICKLE_TUNE, TRICKLE_WAVE } from '../data/trickle.ts';
import { QUARTER_TUNE } from '../data/tune.ts';
import type { MapBounds } from '../data/types.ts';
import { rectDistance, type GroundRect } from './collide.ts';
import { goalsStanding, type SectorPhase, type SectorsState } from './sectors.ts';
import { insideQuad, viewGround } from './viewGround.ts';

export interface TrickleState {
  t: number; // the seconds to the next enemy (s); 0 or less means one may come now
  spent: number[]; // the enemies put out for each sector, front to back
}

// What a frame of the trickle needs: the mech, the enemies and targets, the ground's blockers and bounds, the sectors,
// the script's state its goals read, and whether the trickle is held (`paused`: a cutscene, the mech downed, the sortie
// cleared).
export interface TrickleWorld {
  mech: { x: number; y: number; z: number };
  enemies: readonly TrickleFoe[];
  targets: readonly { kind: string; hp: number }[];
  rects: readonly GroundRect[];
  bounds: MapBounds;
  sectors: SectorsState;
  flags: readonly string[];
  wardenDown: boolean;
  paused: boolean;
}

// What the trickle needs to know of one enemy.
export interface TrickleFoe {
  wave: string;
  kind: EnemyKind;
  z: number;
  hp: number;
  dormant: boolean;
}

export interface TricklePoint {
  x: number;
  z: number;
  y?: number; // the height it comes out at (m); left out for the ground
  sector: number; // the place in M1_SECTORS whose budget was spent
}

export function newTrickle(count: number): TrickleState {
  return { t: 0, spent: Array.from({ length: count }, () => 0) };
}

// The front sector: the first one, front to back, that is idle or advancing. A secured one (secured, counter, stable) is
// no longer the front. Null when every sector is secured.
export function frontSector(phases: readonly SectorPhase[]): number | null {
  for (let i = 0; i < phases.length; i++) {
    if (phases[i] === 'idle' || phases[i] === 'advancing') return i;
  }
  return null;
}

// The living infantry: not dormant, and not a nest or the mid boss. The script's own enemies count too.
function livingInfantry(enemies: readonly TrickleFoe[]): number {
  return enemies.filter(
    enemy => enemy.hp > 0 && !enemy.dormant && enemy.kind !== 'emplacement' && enemy.kind !== 'warden',
  ).length;
}

// Whether the front sector still has a scripted foe in it when it is idle: a living enemy that is not the trickle's own,
// or a goal of the sector still standing (a pillbox on the pillbox line, the fortress's gun, the main guns, the yard's
// waves or the mid boss; SB-2283). That is the window in which the trickle comes out while idle.
function scriptedFoeIn(sectorIndex: number, world: TrickleWorld): boolean {
  const sector = M1_SECTORS[sectorIndex];
  for (const enemy of world.enemies) {
    if (enemy.hp <= 0 || enemy.wave === TRICKLE_WAVE) continue;
    if (enemy.z < sector.landZ || enemy.z > sector.seaZ + SECTOR_TUNE.seaMargin) continue;
    return true;
  }
  return goalsStanding(sector, world);
}

// A point from the sector's own rectangles: one draw picks the rectangle by its share of the area, then x and z are
// drawn inside it (SB-2282). A rectangle with a height (the wall's top, SB-2304) gives its own y back.
function spawnInZones(zones: readonly SpawnZone[], rng: Rng): { x: number; z: number; y?: number } {
  let total = 0;
  for (const zone of zones) total += (zone.maxX - zone.minX) * (zone.maxZ - zone.minZ);
  const pick = rng.rand(0, total);
  let edge = 0;
  let chosen = zones[zones.length - 1];
  for (const zone of zones) {
    edge += (zone.maxX - zone.minX) * (zone.maxZ - zone.minZ);
    if (pick < edge) {
      chosen = zone;
      break;
    }
  }
  return {
    x: rng.rand(chosen.minX, chosen.maxX),
    z: rng.rand(chosen.minZ, chosen.maxZ),
    ...(chosen.y !== undefined ? { y: chosen.y } : {}),
  };
}

// Moves the trickle on by one frame. When an enemy may come, a point for it is drawn from `rng` and given back; making
// the enemy is the game's part. `spent` grows only when a point was found, and none is spent when all the tries fail:
// the next one waits `retryT` instead.
export function stepTrickle(state: TrickleState, world: TrickleWorld, rng: Rng, dt: number): TricklePoint | null {
  if (world.paused) return null;
  state.t -= dt;
  if (state.t > 0) return null;
  const index = frontSector(world.sectors.phase);
  if (index === null) return null;
  const sector = M1_SECTORS[index];
  if ((state.spent[index] ?? 0) >= sector.budget) return null;
  if (livingInfantry(world.enemies) >= TRICKLE_TUNE.maxAlive) return null;
  // While the front sector is idle, the trickle only fills in behind its scripted enemies; once they are down, it stops,
  // so the sector can be cleared. While it is advancing the pressure goes on.
  if (world.sectors.phase[index] === 'idle' && !scriptedFoeIn(index, world)) return null;
  // a sector with a trap of its own (the yard) keeps its trickle back until the mech has gone in
  if (world.sectors.phase[index] === 'idle' && sector.trickleOnEntry === true) {
    if (world.mech.z > sector.seaZ - SECTOR_TUNE.enterDepth) return null;
  }
  const sight = viewGround(world.mech, QUARTER_TUNE, TRICKLE_TUNE.viewAspect, TRICKLE_TUNE.viewMargin);
  const radius = ENEMIES[TRICKLE_TUNE.kind].radius;
  for (let try_ = 0; try_ < TRICKLE_TUNE.tries; try_++) {
    let x: number;
    let z: number;
    let y: number | undefined;
    if (sector.spawn !== undefined && sector.spawn.length > 0) {
      ({ x, z, y } = spawnInZones(sector.spawn, rng));
    } else {
      z = sector.landZ - TRICKLE_TUNE.spawnBack - rng.rand(0, TRICKLE_TUNE.spawnDepth);
      x = rng.rand(-TRICKLE_TUNE.spawnSpread, TRICKLE_TUNE.spawnSpread);
    }
    // A point on a wall's top (SB-2304) is meant to be seen: it may lie in the view and over its own wall, and is held
    // only to the shorter `minMechDist` from the mech. The map's edges still hold.
    const raised = y !== undefined;
    const minDist = raised ? WALL_SPAWN_TUNE.minMechDist : TRICKLE_TUNE.minDist;
    if (!raised && insideQuad(sight, x, z)) continue;
    if (Math.hypot(x - world.mech.x, z - world.mech.z) < minDist) continue;
    if (!raised && world.rects.some(rect => rectDistance(rect, x, z) <= radius)) continue;
    if (
      x < world.bounds.minX + radius ||
      x > world.bounds.maxX - radius ||
      z < world.bounds.minZ + radius ||
      z > world.bounds.maxZ - radius
    ) {
      continue;
    }
    state.spent[index] = (state.spent[index] ?? 0) + 1;
    state.t = rng.rand(TRICKLE_TUNE.intervalMin, TRICKLE_TUNE.intervalMax);
    return { x, z, ...(y !== undefined ? { y } : {}), sector: index };
  }
  state.t = TRICKLE_TUNE.retryT;
  return null;
}
