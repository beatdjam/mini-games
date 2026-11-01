import type { Biome, BossKind } from '../data/types.ts';
import { BIOMES } from '../data/biomes.ts';
import { BOSS_ROOMS } from '../data/bossRooms.ts';
import { BOSS_AREA_START_TIER, MILESTONE_EVERY, milestoneBelow } from '../data/progress.ts';
import { t } from '@engine/core/i18n.ts';
// the boss area (the hall and the eight boss rooms): its depth once settled in the save, and where each boss's room is
// The flag is on: tests and dev views turn it off to see the game without the boss area
let on = true;
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
  const home = BIOMES.find(b => b.code === BOSS_ROOMS[kind])!;
  if (kind !== 'titan') return home;
  // (read through a prototype: the sector's fields stay as they are, whichever the language)
  mixed ??= Object.create(home, {
    code: { value: 'MIX' },
    name: { get: () => t('boss.hallPlace') },
  }) as Biome;
  return mixed;
}
// TITAN's room: built as the city's plan, drawn with the sectors run together (world/looks.ts MIX), and nobody's sector
let mixed: Biome | undefined;
