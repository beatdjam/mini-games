import type { Biome } from '../data/types.ts';
import { ENEMY_TUNE } from '../data/enemies.ts';
import { BIOMES } from '../data/biomes.ts';
import { DMG_SCALE_PER_PROG, PER, enemyGrowth } from '../data/progress.ts';
import { progressOf, rebootMul } from './rules.ts';
import { run } from '../actors/player.ts';

// ---- tuning numbers used only here ----
export const STAGES_PER_GROWTH_DEPTH = 5; // progress (progressOf) per step of the enemy health growth curve

// each run walks the sectors in its own shuffled order (run.route); depth (tier) drives difficulty
const routeBiome = (t: number): Biome => BIOMES[run && run.route ? run.route[t % run.route.length] : t % BIOMES.length];
export const stageInfo = (s: number) => {
  const tier = Math.floor(s / PER);
  return { biome: routeBiome(tier), sub: s % PER, loop: Math.floor(tier / 3), tier };
};
export const isBossStage = (s: number): boolean => s % PER === PER - 1;
// In a building the stage number of a floor is depth * PER + step * (PER - 1) / floors (step = how far along the route),
// so the progress (progressOf) runs evenly from the depth's start to its boss whatever the number of floors
export const buildingStage = (tier: number, step: number, floors: number): number =>
  tier * PER + (step * (PER - 1)) / floors;
// which floor of the building the player is on, counted from the top: '1F' is the top floor ('' outside a building)
export const floorLabel = (): string => (run?.bld ? `${run.bld.floor + 1}F` : '');
// bld = the building the stage is in, when it is not the run's own (a suspended run shown on the base screen)
export function stageLabel(s: number, bld?: { tier: number; step: number; floors: number }): string {
  const si = stageInfo(s),
    b = bld ?? (run?.bld && s === run.stage ? run.bld : undefined);
  if (isBossStage(s)) return `D${si.tier + 1} BOSS`;
  // in a building: the step along its route out of its floors
  if (b && b.tier === si.tier) return `D${si.tier + 1} ${b.step + 1}/${b.floors}`;
  return `D${si.tier + 1} ${Math.floor(si.sub) + 1}/${PER - 1}`;
}
export function tierLabel(t: number): string {
  return `DEPTH ${t + 1}`;
}
export const difficultyAt = (s: number): number =>
  ENEMY_TUNE.hpMul * enemyGrowth(progressOf(s) / STAGES_PER_GROWTH_DEPTH) * rebootMul();
// how much harder things hit at stage s: enemies, bosses, hazard floors and your own rockets all grow by this
export const damageScaleAt = (s: number): number => (1 + progressOf(s) * DMG_SCALE_PER_PROG) * rebootMul();
