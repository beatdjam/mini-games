// Types of the definitions in js/data/ and of the objects built from them.
// Fields marked "(lang)" are filled from js/lang/<code>.js by js/system/text.ts when the language is set.
// Objects that gain fields while the game runs (enemies, bosses) still allow any extra field ([k: string]: any);
// to make one stricter, list its fields here and drop the index signature.
import type { WorldObject } from '../../../../engine/core/world.ts';

export interface WeaponDef {
  dmg: number; rate: number; spread: number; pellets: number; speed: number; mag: number; reload: number; color: number; cost: number;
  steady?: boolean; kb?: number; pierce?: number; far?: number; farMul?: number; blast?: number; grav?: number; chipMag?: number;
  name?: string; desc?: string; // (lang)
}
export interface Rarity { stars: string; mult: number; css: string; hex: number; name?: string /* (lang) */; }
export interface Affix { name?: string; text?: string; } // (lang)
export interface Biome {
  code: string; fog: number; fogNear: number; fogFar: number; floor: string; line: string; wall: string; wallLine: string;
  gen: Record<string, any>; // level generator settings (js/world/level.ts)
  enemies: string[]; bosses: string[];
  name?: string; hint?: string; // (lang)
}
export interface BossMeta {
  pillars: boolean; hp: number; y: number; hitR: number;
  tune: Record<string, any>; // attack numbers, read by js/actors/bosses/<name>.ts
  name?: string; title?: string; short?: string; desc?: string; // (lang)
}
export interface Perk {
  id: string; v: number; rv?: number;
  apply(p: any, v: number): void; cur(p: any): any; maxed?(p: any): boolean;
  name?: string; desc?(v: number): string; curText?(c: any): string; // (lang)
}
// base upgrades cost bits by level; reboot upgrades cost a fixed number of points
export interface Upgrade { id: string; max: number; cost(level: number): number; name?: string; desc?(level: number): string; }
export interface PresUpgrade { id: string; max: number; cost: number; name?: string; desc?(level: number): string; }
export interface EnemyDef { [k: string]: any; }
// an enemy or boss on the field (fields are listed in spawnEnemy / bossBase)
export interface Enemy extends WorldObject { x: number; z: number; r: number; fy?: number; side?: number; [k: string]: any; }
