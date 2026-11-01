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
  titan: 'CITY', // the plan of its room, and its practice; in the boss area it is drawn mixed (core/bossArea.ts)
};
// the boss area's eight rooms, in the order the hall's gates stand round it (TITAN is not one of them: the eight-room
// checks go by this list, so a ninth boss does not change them)
export const BOSS_ROOM_ORDER: BossKind[] = [
  'watcher',
  'crusher',
  'core',
  'phantom',
  'trinity',
  'bastion',
  'hoist',
  'surgeon',
];
