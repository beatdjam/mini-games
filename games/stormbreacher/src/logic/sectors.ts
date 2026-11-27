// The sectors of M1's front (SB-2210, SB-2220): a sector is cleared when the mech has gone in and no enemy is left in
// it, secured when enough of the infantry has reached its hold line, and then counterattacked once before it is stable.
// The game asks these pure functions, so a node test runs them without a page; game.ts is not imported (game.ts imports
// this file). +z is the sea.
import { ENEMIES } from '../data/enemies.ts';
import { M1_SECTORS, SECTOR_TUNE, type Sector, type SectorId } from '../data/sectors.ts';
import { rectDistance, type GroundRect } from './collide.ts';
import type { Crowd, Soldier } from './crowd.ts';

export type SectorPhase = 'idle' | 'advancing' | 'secured' | 'counter' | 'stable';

export interface SectorsState {
  phase: SectorPhase[]; // one for each sector of M1_SECTORS, front to back
  counterLeft: number[]; // the counterattack enemies not put out yet (count)
  counterT: number[]; // the seconds to the next counterattack enemy (s)
  counterIds: string[][]; // the counterattack enemies put out, by id
  arrived: number[]; // the soldiers at the hold line when the sector was secured
  weak: boolean[]; // whether the hold was weak when it became stable
}

// What the sectors need to know of one enemy or one target.
interface SectorFoe {
  id: string;
  z: number;
  hp: number;
}

interface SectorTarget {
  kind: string;
  hp: number;
}

// What a frame of the sectors needs: the mech, the enemies and targets, the ground's rects, and the infantry's crowd.
export interface SectorWorld {
  mech: { z: number };
  enemies: readonly SectorFoe[];
  targets: readonly SectorTarget[];
  rects: readonly GroundRect[];
  battle: { crowd: Crowd };
}

export type SectorEvent =
  | { kind: 'sectorCleared'; sector: SectorId }
  | { kind: 'sectorSecured'; sector: SectorId }
  | { kind: 'sectorCounter'; sector: SectorId }
  | { kind: 'sectorSpawn'; sector: SectorId; x: number; z: number }
  | { kind: 'sectorStable'; sector: SectorId; weak: boolean };

export interface SectorHold {
  holdZ: number; // where the infantry waits now (m)
  held: boolean; // whether it waits there instead of walking on
}

export function newSectors(): SectorsState {
  const none = () => M1_SECTORS.map(() => 0);
  return {
    phase: M1_SECTORS.map(() => 'idle'),
    counterLeft: none(),
    counterT: none(),
    counterIds: M1_SECTORS.map(() => []),
    arrived: none(),
    weak: M1_SECTORS.map(() => false),
  };
}

// The living soldiers at or past `holdZ` (within arriveBand of it, on the landward side).
export function arrivedSoldiers(crowd: Crowd, holdZ: number): Soldier[] {
  return crowd.soldiers.filter(soldier => soldier.alive && soldier.z <= holdZ + SECTOR_TUNE.arriveBand);
}

// Whether a sector has no living enemy left in it. Its enemies count from its landZ to seaMargin past its seaZ; the
// pillbox line also counts the pillboxes that still stand.
function sectorClear(sector: Sector, world: SectorWorld): boolean {
  if (world.mech.z > sector.seaZ - SECTOR_TUNE.enterDepth) return false;
  for (const enemy of world.enemies) {
    if (enemy.hp <= 0) continue;
    if (enemy.z < sector.landZ || enemy.z > sector.seaZ + SECTOR_TUNE.seaMargin) continue;
    return false;
  }
  if (sector.id === 'pillboxes' && world.targets.some(target => target.kind === 'pillbox' && target.hp > 0)) {
    return false;
  }
  return true;
}

// Whether enough of the living infantry stands at the sector's hold line: min(arriveMax, ceil(living * arriveShare)).
// With every soldier down nothing is secured; the refill in game.ts puts the next wave out instead.
function sectorSecured(crowd: Crowd, holdZ: number): boolean {
  const living = crowd.soldiers.filter(soldier => soldier.alive).length;
  if (living === 0) return false;
  const needed = Math.min(SECTOR_TUNE.arriveMax, Math.ceil(living * SECTOR_TUNE.arriveShare));
  return arrivedSoldiers(crowd, holdZ).length >= needed;
}

// The i-th point the counterattack comes out at: z is counterBack inland of the sector's land-side edge, and x runs
// evenly from -counterSpread to +counterSpread. A point that a ground rect covers is moved 2m at a time until it is
// clear; if it is still covered after ten moves, the point is skipped (null).
function counterPoint(sector: Sector, index: number, rects: readonly GroundRect[]): { x: number; z: number } | null {
  const z = sector.landZ - SECTOR_TUNE.counterBack;
  const spread = SECTOR_TUNE.counterSpread;
  const base = sector.counter <= 1 ? 0 : -spread + (2 * spread * index) / (sector.counter - 1);
  const radius = ENEMIES[SECTOR_TUNE.counterKind].radius;
  for (let move = 0; move <= 10; move++) {
    const x = base + move * 2;
    if (rects.every(rect => rectDistance(rect, x, z) > radius)) return { x, z };
  }
  return null;
}

// Moves the sectors on by one frame. Only the frontmost sector that is not stable is looked at, so the ones behind it
// wait until it is stable in turn. Gives back the events of a sector cleared, secured, counterattacked or made stable
// this frame, and of each counterattack enemy to put out.
export function stepSectors(state: SectorsState, world: SectorWorld, dt: number): SectorEvent[] {
  for (let i = 0; i < M1_SECTORS.length; i++) {
    const phase = state.phase[i];
    if (phase === 'stable') continue;
    const sector = M1_SECTORS[i];
    if (phase === 'idle') {
      if (!sectorClear(sector, world)) return [];
      state.phase[i] = 'advancing';
      return [{ kind: 'sectorCleared', sector: sector.id }];
    }
    if (phase === 'advancing' || phase === 'secured') {
      if (phase === 'advancing' && !sectorSecured(world.battle.crowd, sector.holdZ)) return [];
      state.arrived[i] = arrivedSoldiers(world.battle.crowd, sector.holdZ).length;
      state.phase[i] = 'counter';
      state.counterLeft[i] = sector.counter;
      state.counterT[i] = SECTOR_TUNE.counterEvery;
      state.counterIds[i] = [];
      return [
        { kind: 'sectorSecured', sector: sector.id },
        { kind: 'sectorCounter', sector: sector.id },
      ];
    }
    if (state.counterLeft[i] > 0) {
      state.counterT[i] -= dt;
      if (state.counterT[i] > 0) return [];
      state.counterT[i] += SECTOR_TUNE.counterEvery;
      const point = counterPoint(sector, sector.counter - state.counterLeft[i], world.rects);
      state.counterLeft[i] -= 1;
      return point === null ? [] : [{ kind: 'sectorSpawn', sector: sector.id, ...point }];
    }
    const standing = state.counterIds[i].some(id => {
      const enemy = world.enemies.find(entry => entry.id === id);
      return enemy !== undefined && enemy.hp > 0;
    });
    if (standing) return [];
    state.phase[i] = 'stable';
    state.weak[i] = state.arrived[i] < SECTOR_TUNE.weakArrived;
    return [{ kind: 'sectorStable', sector: sector.id, weak: state.weak[i] }];
  }
  return [];
}

// Where the infantry waits now: the last sector that is advancing or further on, or the water's edge before the
// first. It waits until the pillbox line is secured and then walks on, as it did once `pillboxes-down` raised.
export function sectorHold(state: SectorsState | null): SectorHold {
  let holdZ = SECTOR_TUNE.startHoldZ;
  for (let i = 0; i < M1_SECTORS.length; i++) {
    const phase = state?.phase[i];
    if (phase === 'idle' || phase === undefined) continue;
    holdZ = M1_SECTORS[i].holdZ;
  }
  const last = state?.phase[M1_SECTORS.length - 1];
  const holding = last !== 'secured' && last !== 'counter' && last !== 'stable';
  return { holdZ, held: holding };
}
