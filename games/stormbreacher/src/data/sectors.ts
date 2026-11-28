// The sectors of M1's front (SB-2210, SB-2280): the beach, the two hedgehog lines and the pillbox line, and on past it
// through the fortress to the magazine. The infantry moves up a sector when the mech has gone in and every enemy of it
// is down, and digs in at the sector's hold line once enough of them have arrived. +z is the sea, so a sector runs from
// its seaZ (the larger z) to its landZ.
import type { EnemyKind } from './enemies.ts';
import { PAYOFF_TUNE } from './payoff.ts';
import { BATTLE_TUNE } from './tune.ts';
import type { TargetKind } from './types.ts';

export type SectorId =
  'beach' | 'line1' | 'line2' | 'pillboxes' | 'cband' | 'gate' | 'yard' | 'plug' | 'field1' | 'field2' | 'magazine';

// A rectangle the trickle may put an enemy in (SB-2282). A sector without one uses TRICKLE_TUNE's band instead.
export interface SpawnZone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// A goal of a sector (SB-2283): the sector is not cleared while it stands. A target still has health, a flag is not
// raised yet, or the mid boss is not down.
export type SectorGoal =
  { kind: 'target'; target: TargetKind } | { kind: 'flag'; name: string } | { kind: 'wardenDown' };

export interface Sector {
  id: SectorId;
  seaZ: number; // the sector's sea-side edge (m)
  landZ: number; // the sector's land-side edge (m)
  holdZ: number; // where the infantry waits once the sector is cleared (m)
  counter: number; // the enemies of the counterattack that follows the sector's securing (count)
  budget: number; // the enemies the trickle may put out while this sector is the front (count, SB-2230)
  spawn?: readonly SpawnZone[]; // where its trickle comes out, drawn by area (SB-2282); left out for TRICKLE_TUNE's band
  goals?: readonly SectorGoal[]; // what keeps the sector from being cleared besides its enemies (SB-2283)
}

// The values the sectors run on. Provisional, to be settled by eye in the sortie.
export const SECTOR_TUNE = {
  startHoldZ: 160, // where the infantry waits before the first sector (m), at the water's edge
  lineMargin: 6, // how far seaward of a still-closed defence line the infantry waits (m)
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
  postStayShare: 0.5, // the posted soldiers that keep their ground when the line moves on (share; SB-2262)
};

// The infantry's support fire (SB-2240): the soldiers at a sector's hold line shoot the nearest enemy in range. The
// factor grows with the number of soldiers who have arrived, and the shooters are capped so a crowd of hundreds does not
// outgun the mech. A hit takes a share of the target's health and suppresses its fire and walk for a moment. Provisional.
export const SUPPORT_TUNE = {
  shooters: 12, // the most soldiers that fire, however many have arrived (soldiers)
  minFactor: 0.35, // the weakest the factor is (share)
  maxFactor: 1.15, // the strongest the factor is (share)
  factorPer: 12, // the arrived soldiers one whole factor is worth (soldiers)
  intervalMin: 1.1, // the shortest wait between one soldier's shots (s)
  intervalMax: 1.7, // the longest wait between one soldier's shots (s)
  range: 57, // how far a soldier's shot reaches (m); the spike's 240 px in the sortie's scale
  damageBase: 0.07, // the share of the target's health a shot takes with no factor
  damagePer: 0.17, // the share the factor adds
  suppressSec: 2.6, // how long a hit enemy is suppressed (s)
  suppressFire: 2.5, // how many times longer the enemy's wait between shots is while suppressed
  suppressMove: 0.55, // how much of its walk speed the enemy keeps while suppressed
};

// The eleven sectors, front to back. The beach's hold sits just seaward of line 1's hedgehogs (z 129..145); the pillbox
// line's is the hold the battle layer waited at before the sectors came (BATTLE_TUNE.holdZ).
export const M1_SECTORS: readonly Sector[] = [
  { id: 'beach', seaZ: 170, landZ: 129, holdZ: 132, counter: 3, budget: 8 },
  { id: 'line1', seaZ: 129, landZ: 62, holdZ: 80, counter: 4, budget: 12 },
  { id: 'line2', seaZ: 62, landZ: -11, holdZ: BATTLE_TUNE.holdLine2Z, counter: 6, budget: 16 },
  {
    id: 'pillboxes',
    seaZ: -11,
    landZ: -40,
    holdZ: BATTLE_TUNE.holdZ,
    counter: 8,
    budget: 20,
    goals: [{ kind: 'target', target: 'pillbox' }],
  },
  // The latter half, past the pillbox line (SB-2280). The yard, the plug and the magazine have no counterattack of their
  // own: the script's waves stand in for it. 仮。遊んで直す.
  // The open ground seaward of the seawall's ends, either side of the fortress. 仮。遊んで直す.
  {
    id: 'cband',
    seaZ: -40,
    landZ: -55,
    holdZ: -47,
    counter: 4,
    budget: 14,
    spawn: [
      { minX: -96, maxX: -40, minZ: -64, maxZ: -45 },
      { minX: 40, maxX: 96, minZ: -64, maxZ: -45 },
    ],
  },
  {
    id: 'gate',
    seaZ: -55,
    landZ: -70,
    holdZ: -60,
    counter: 6,
    budget: 12,
    spawn: [
      { minX: -96, maxX: -40, minZ: -64, maxZ: -56 },
      { minX: 40, maxX: 96, minZ: -64, maxZ: -56 },
    ],
    goals: [{ kind: 'target', target: 'fortressGun' }],
  },
  // The yard's inside, clear of its walls; the cover there is taken out by the rects' check. 仮。遊んで直す.
  {
    id: 'yard',
    seaZ: -70,
    landZ: -100,
    holdZ: -85,
    counter: 0,
    budget: 6,
    spawn: [{ minX: -26, maxX: 26, minZ: -120, maxZ: -76 }],
    goals: [{ kind: 'flag', name: 'yard-3-clear' }],
  },
  { id: 'plug', seaZ: -100, landZ: -125, holdZ: -96, counter: 0, budget: 0, goals: [{ kind: 'wardenDown' }] },
  { id: 'field1', seaZ: -125, landZ: -175, holdZ: -150, counter: 6, budget: 18 },
  { id: 'field2', seaZ: -175, landZ: -225, holdZ: -200, counter: 8, budget: 20 },
  {
    id: 'magazine',
    seaZ: -225,
    landZ: -255,
    holdZ: -232,
    counter: 0,
    budget: 12,
    goals: [{ kind: 'target', target: 'gun' }],
  },
];
