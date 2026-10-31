import type { Biome, BossKind } from '../data/types.ts';
import { BIOMES } from '../data/biomes.ts';
import { BOSS_ROOMS } from '../data/bossRooms.ts';
import { BOSS_AREA_START_TIER, MILESTONE_EVERY, milestoneBelow } from '../data/progress.ts';
// the boss area (the hall and the eight boss rooms): its depth once settled in the save, and where each boss's room is
// The flag is off in the published build: only the dev server has it on (import.meta.env.DEV is false in a build)
let on = import.meta.env.DEV;
export const bossAreaOn = (): boolean => on;
// dev and tests only (the same handle as devSeed in world/level.ts); off in the published build
export function devBossArea(v: boolean) {
  on = v;
}
// The depth of the boss area for a save: a new save gets DEPTH 50 (0-based 49). A save already deeper gets the next
// milestone above its start depth (a start on a milestone gives the milestone after it). A shallower start counts as D50
export function bossAreaTierFor(shortcut: number, startTier: number): number {
  if (shortcut <= BOSS_AREA_START_TIER) return BOSS_AREA_START_TIER;
  return milestoneBelow(Math.max(BOSS_AREA_START_TIER, startTier)) + MILESTONE_EVERY;
}
// the sector whose building holds that boss's room (data/bossRooms.ts)
export function bossRoomBiome(kind: BossKind): Biome {
  return BIOMES.find(b => b.code === BOSS_ROOMS[kind])!;
}
