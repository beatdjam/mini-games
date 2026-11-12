// The money of a cleared sortie (SB-210): the take-home is the base reward and the bonuses, less the ammo, the repair
// and the retries. Pure: the numbers are in data/economy.ts, and the save is logic/save.ts.
import { AMMO_COST, DEPOT_FLAG, ECONOMY, M1_MECH_REPAIR_FULL, MISSION_ECONOMY, type BonusId } from '../data/economy.ts';
import { MECH_TUNE } from '../data/tune.ts';
import type { GameModel } from './game.ts';

export interface Payout {
  base: number; // the mission's base reward
  bonuses: Record<BonusId, { earned: boolean; amount: number }>; // `amount` is what it pays when earned
  ammo: number; // the ammo cost of the two weapons
  repair: number; // the repair of the armour lost in the last run, rounded
  retries: number; // how many times the sortie began again
  retryCost: number; // the cost of one retry times `retries`
  net: number; // the take-home, never below ECONOMY.rewardFloor
  credited: boolean; // whether `net` is added to the funds (the first clear of the mission only)
}

// The take-home of a cleared `game`; `clearedBefore` is whether the mission was cleared in an earlier sortie.
export function payoutOf(game: GameModel, clearedBefore: boolean): Payout {
  const def = MISSION_ECONOMY[game.mission.id];
  if (def === undefined) throw new Error(`no economy for mission ${game.mission.id}`);
  const earned: Record<BonusId, boolean> = {
    depot: game.script.flags.includes(DEPOT_FLAG),
    par: game.time <= def.parTimeSec,
    noRetry: game.retries === 0,
  };
  const bonuses = {
    depot: { earned: earned.depot, amount: def.bonus.depot },
    par: { earned: earned.par, amount: def.bonus.par },
    noRetry: { earned: earned.noRetry, amount: def.bonus.noRetry },
  };
  const bonusTotal = (Object.keys(bonuses) as BonusId[]).reduce(
    (sum, id) => sum + (bonuses[id].earned ? bonuses[id].amount : 0),
    0,
  );
  const ammo = AMMO_COST[game.main.id] + AMMO_COST[game.sub.id];
  const lost = Math.min(MECH_TUNE.armor, Math.max(0, MECH_TUNE.armor - game.armor));
  const repair = Math.round((M1_MECH_REPAIR_FULL * lost) / MECH_TUNE.armor / ECONOMY.roundTo) * ECONOMY.roundTo;
  // one retry costs a new load of ammo and a full repair
  const retryCost = (ammo + M1_MECH_REPAIR_FULL) * game.retries;
  const net = Math.max(ECONOMY.rewardFloor, def.baseReward + bonusTotal - ammo - repair - retryCost);
  return {
    base: def.baseReward,
    bonuses,
    ammo,
    repair,
    retries: game.retries,
    retryCost,
    net,
    credited: !clearedBefore,
  };
}
