import type { BossKind } from './types.ts';
// each boss's room is the lowest-floor hall of its sector's building as it is (decided 2026-11-01)
export const BOSS_ROOMS: Record<BossKind, string> = {
  watcher: 'DATA',
  crusher: 'FORGE',
  core: 'NOISE',
  phantom: 'RUIN',
  trinity: 'KWLN',
  bastion: 'CITY',
  hoist: 'MALL',
  surgeon: 'HOSP',
};
