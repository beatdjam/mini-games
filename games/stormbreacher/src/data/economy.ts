// The money's table (SB-210). Every value here is provisional. The unit is cr. The formula that uses them is in
// logic/economy.ts; nothing is computed here.
import type { WeaponId } from './weapons.ts';

export const ECONOMY = {
  startFunds: 0, // the funds a new save starts with (cr)
  rewardFloor: 0, // the take-home never goes below this (cr)
  roundTo: 10, // the repair cost is rounded to a multiple of this (cr)
};

export type BonusId = 'depot' | 'par' | 'noRetry';

export interface MissionEconomy {
  baseReward: number; // paid for a clear (cr)
  parTimeSec: number; // the game clock a clear must be within for the `par` bonus (s)
  bonus: Record<BonusId, number>; // `depot`: the ammo depot was broken (the script's flag `depot-down`); `par`: within parTimeSec; `noRetry`: cleared with no retry (cr)
}

// By the mission's id (MissionDef.id).
export const MISSION_ECONOMY: Record<string, MissionEconomy> = {
  m1: { baseReward: 10000, parTimeSec: 720, bonus: { depot: 2000, par: 1000, noRetry: 1000 } },
};

// The flag the script sets when the depot breaks (data/missions/m1.ts); the `depot` bonus reads it.
export const DEPOT_FLAG = 'depot-down';

// The cost of the ammo one sortie loads, by weapon (cr).
export const AMMO_COST: Record<WeaponId, number> = {
  autocannon: 500,
  heavyGun: 300,
};

// The repair of a mech that lost all its armour (cr); a part of it is charged in proportion to the armour lost. This is
// M1's mech (M1_MECH in data/mech.ts).
export const M1_MECH_REPAIR_FULL = 1500;
