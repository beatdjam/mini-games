// Save data: the campaign's progress and the settings, and the conversions from older versions. Pure: reading and
// writing storage is app/storage.ts.

export const SAVE_VERSION = 1;

// One mission's record: cleared, and the best time in seconds (null until there is one).
export interface MissionRecord {
  cleared: boolean;
  bestSec: number | null;
}

export interface SaveData {
  v: number;
  records: {
    missions: Record<string, MissionRecord>;
  };
}

export interface Settings {
  lang: string | null;
}

export const defaultSave = (): SaveData => ({
  v: SAVE_VERSION,
  records: { missions: {} },
});

export const defaultSettings = (): Settings => ({ lang: null });

// The conversions from older versions, in order (to = the version whose shape the function makes), with the save as it
// is stored. Empty for now; when the version goes up, add each step here.
export const MIGRATIONS: [to: number, migrate: (out: SaveData, raw: Record<string, unknown>) => void][] = [];

// Converts a save to the current version. A stored save without `v` counts as version 0, and every conversion above it
// runs in order. `data` is the defaults with the save merged in; `raw` is the save as stored (null when there is none).
export function migrateSave(data: SaveData, raw: Record<string, unknown> | null): SaveData {
  const v = typeof raw?.v === 'number' ? raw.v : 0;
  if (raw) for (const [to, migrate] of MIGRATIONS) if (to > v) migrate(data, raw);
  data.v = SAVE_VERSION;
  return data;
}
