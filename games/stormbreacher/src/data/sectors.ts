// The sectors of M1's front (SB-2210): the beach, the two hedgehog lines and the pillbox line. The infantry moves up a
// sector when the mech has gone in and every enemy of it is down, and digs in at the sector's hold line once enough of
// them have arrived. +z is the sea, so a sector runs from its seaZ (the larger z) to its landZ.
import type { EnemyKind } from './enemies.ts';
import { PAYOFF_TUNE } from './payoff.ts';
import { BATTLE_TUNE } from './tune.ts';

export type SectorId = 'beach' | 'line1' | 'line2' | 'pillboxes';

export interface Sector {
  id: SectorId;
  seaZ: number; // the sector's sea-side edge (m)
  landZ: number; // the sector's land-side edge (m)
  holdZ: number; // where the infantry waits once the sector is cleared (m)
  counter: number; // the enemies of the counterattack that follows the sector's securing (count)
  budget: number; // the enemies the trickle may put out while this sector is the front (count, SB-2230)
}

// The values the sectors run on. Provisional, to be settled by eye in the sortie.
export const SECTOR_TUNE = {
  startHoldZ: 160, // where the infantry waits before the first sector (m), at the water's edge
  enterDepth: 6, // how far past a sector's sea-side edge the mech has to go to count as in it (m)
  seaMargin: 10, // how far seaward of a sector's seaZ its enemies still count (m)
  arriveBand: 8, // a soldier this near its hold line has arrived (m)
  arriveShare: 0.6, // the share of the living infantry that has to arrive to secure a sector
  arriveMax: 11, // the most that share is ever taken as (soldiers)
  surge: PAYOFF_TUNE.surgeAllies, // the infantry a cleared sector adds (soldiers)
  refill: PAYOFF_TUNE.surgeAllies, // the wave put out when every soldier is down while the line is held (soldiers)
  counterEvery: 0.55, // the seconds between one counterattack enemy and the next (s)
  counterBack: 12, // how far inland of a sector's landZ the counterattack comes out (m)
  counterSpread: 60, // half the x spread of the counterattack's points (m)
  weakArrived: 8, // fewer soldiers than this at the hold line make a weak hold (soldiers)
  counterKind: 'grunt' as EnemyKind, // the kind of enemy the counterattack puts out
};

// The four sectors, front to back. The beach's hold sits just seaward of line 1's hedgehogs (z 129..145); the pillbox
// line's is the hold the battle layer waited at before the sectors came (BATTLE_TUNE.holdZ).
export const M1_SECTORS: readonly Sector[] = [
  { id: 'beach', seaZ: 170, landZ: 129, holdZ: 132, counter: 3, budget: 8 },
  { id: 'line1', seaZ: 129, landZ: 62, holdZ: 80, counter: 4, budget: 12 },
  { id: 'line2', seaZ: 62, landZ: -11, holdZ: BATTLE_TUNE.holdLine2Z, counter: 6, budget: 16 },
  { id: 'pillboxes', seaZ: -11, landZ: -40, holdZ: BATTLE_TUNE.holdZ, counter: 8, budget: 20 },
];
