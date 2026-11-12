// Save data: the campaign's progress and the settings, and the conversions from older versions. Pure: reading and
// writing storage is app/storage.ts.

import { ECONOMY } from '../data/economy.ts';
import type { Payout } from './economy.ts';

export const SAVE_VERSION = 2;

// One mission's record: cleared, and the best time in seconds (null until there is one).
export interface MissionRecord {
  cleared: boolean;
  bestSec: number | null;
}

export interface SaveData {
  v: number;
  funds: number; // the money (cr); only a first clear adds to it (logic/economy.ts)
  records: {
    missions: Record<string, MissionRecord>;
  };
}

export interface Settings {
  lang: string | null;
}

export const defaultSave = (): SaveData => ({
  v: SAVE_VERSION,
  funds: ECONOMY.startFunds,
  records: { missions: {} },
});

export const defaultSettings = (): Settings => ({ lang: null });

// The conversions from older versions, in order (to = the version whose shape the function makes), with the save as it
// is stored. When the version goes up, add each step here.
export const MIGRATIONS: [to: number, migrate: (out: SaveData, raw: Record<string, unknown>) => void][] = [
  // 2: the funds (SB-210); a save from before it starts with the new save's funds
  [
    2,
    out => {
      out.funds = ECONOMY.startFunds;
    },
  ],
];

// Converts a save to the current version. A stored save without `v` counts as version 0, and every conversion above it
// runs in order. `data` is the defaults with the save merged in; `raw` is the save as stored (null when there is none).
export function migrateSave(data: SaveData, raw: Record<string, unknown> | null): SaveData {
  const v = typeof raw?.v === 'number' ? raw.v : 0;
  if (raw) for (const [to, migrate] of MIGRATIONS) if (to > v) migrate(data, raw);
  data.v = SAVE_VERSION;
  return data;
}

// Writes a clear into the save: the mission's record (cleared, and the best time when this one beats it) and, when the
// payout is credited, the take-home into the funds. Called once per clear; the caller writes the save after.
export function recordClear(data: SaveData, missionId: string, sec: number, payout: Payout): void {
  const old = data.records.missions[missionId];
  const best = old?.bestSec ?? null;
  data.records.missions[missionId] = { cleared: true, bestSec: best === null || sec < best ? sec : best };
  if (payout.credited) data.funds += payout.net;
}
