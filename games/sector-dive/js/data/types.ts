// Types of the definitions in js/data/ and of the objects built from them.
// Fields marked "(lang)" are filled from js/lang/<code>.js by js/system/text.ts when the language is set.
// Objects that gain fields while the game runs (enemies, bosses) still allow any extra field ([k: string]: any);
// to make one stricter, list its fields here and drop the index signature.
import type { WorldObject } from '../../../../engine/core/world.ts';
import type { ButtonPlace } from '../../../../engine/ui/touchlayout.ts';
import type * as THREE from 'three';

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
  id: string; v: number; rv?: number; noSupply?: boolean; // noSupply: left out of the shortcut supply picks
  apply(p: any, v: number): void; cur(p: any): any; maxed?(p: any): boolean;
  name?: string; desc?(v: number): string; curText?(c: any): string; // (lang)
}
// base upgrades cost bits by level; reboot upgrades cost a fixed number of points
export interface Upgrade { id: string; max: number; cost(level: number): number; name?: string; desc?(level: number): string; }
// max may be Infinity; step: the cost goes up by this much per level already taken (presCost in js/system/rules.ts)
export interface PresUpgrade { id: string; max: number; cost: number; step?: number; name?: string; desc?(level: number): string; }
export interface EnemyDef { [k: string]: any; }
// an enemy or boss on the field (fields are listed in spawnEnemy / bossBase)
export interface Enemy extends WorldObject { x: number; z: number; r: number; fy?: number; side?: number; [k: string]: any; }

// the `data` part of a language file (js/lang/<code>.ts): names and descriptions copied onto the definitions
export interface LangData {
  weapons: Record<string, { name: string; desc: string }>;
  rarity: Record<number, { name: string }>;
  affix: Record<string, { name: string; text: string }>;
  biomes: Record<string, { name: string; hint?: string }>;
  bosses: Record<string, { name: string; title: string; short: string; desc: string }>;
  perks: Record<string, { name: string; desc(v: number): string; curText(c: any): string }>;
  upgrades: Record<string, { name: string; desc(level: number): string }>;
  pres: Record<string, { name: string; desc(level: number): string }>;
  layout: Record<string, { name: string }>;
  guideDesk: [string, string][]; guideTouch: [string, string][];
}

// one weapon: in hand, in the bag, in storage or on the ground. basic = a base weapon (never lost);
// r = rarity index, plus = + value, opts = option ids (AFFIX), mag = rounds left in the magazine
export interface WeaponItem { id: string; r: number; basic?: boolean; plus?: number; opts?: string[]; mag?: number; }
// a weapon in hand or in the bag during a run (newWeapon fills every field)
export interface Weapon extends WeaponItem { basic: boolean; plus: number; opts: string[]; mag: number; }
// the player during a run (newWeapon / newPlayer in js/actors/player.ts)
export interface Player {
  x: number; z: number; fy: number; vy: number; yaw: number; pitch: number; r: number; bob: number; tile: number;
  hp: number; maxHp: number; inv: number; kits: number;
  st: number; stMax: number; stRegen: number; stDelay: number; dashT: number; ddx: number; ddz: number;
  baseSpeed: number; spdMul: number; dmgMul: number; fireRate: number; gainMul: number; reloadMul: number; magMul: number;
  leech: number; pierce: number; extra: number; crit: number; chain: number; magnet: number;
  weapons: (Weapon | null)[]; cur: number; bag: (Weapon | null)[]; reloadT: number; reloadMax: number; fireCd: number;
}
// one run (a dive, or a boss practice when practice is set)
export interface RunState {
  stage: number; kills: number; bits: number; startTier: number; route: number[];
  perks: string[];   // chip ids taken, '+' for the rare version
  bosses?: string[]; // bosses defeated
  cleared?: boolean; practice?: boolean; forceBoss?: string; t0?: number;
}
export interface Snapshot { run: RunState; P: Player; }
export interface SaveData {
  bits: number; up: Record<string, number>; unlocked: Record<string, boolean>;
  loadout: (WeaponItem | null)[]; stash: WeaponItem[]; shortcut: number; startTier: number;
  best: number; runs: number; bossKills: number; bossSeen: Record<string, boolean>; stageV: number;
  mods: Record<string, { plus: number; r: number }>; canReboot: boolean;
  pres: { count: number; pts: number; up: Record<string, number> };
  suspend: Snapshot | null; // the checkpoint of a run in progress (js/flow/game.ts makeSnapshot)
  settings: {
    lang: string | null; autofire: boolean; assist: string; sens: number; bgm: number; sfx: number;
    leftFire: boolean; stickDash: boolean; layout: Record<string, ButtonPlace>;
  };
}

// something on the ground (engine world tag 'pickup'): bits (value), a med kit, a chip or a weapon (w)
export interface Pickup extends WorldObject { tag: 'pickup'; kind: string; x: number; z: number; y: number; mesh: THREE.Object3D; t: number; dead: boolean; value?: number; w?: Weapon; }
// a ground shockwave ring (engine world tag 'wave'): grows to max radius, hurts the player once when the ring passes
export interface Wave extends WorldObject { tag: 'wave'; x: number; z: number; r: number; speed: number; max: number; dmg: number; hit: boolean; mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; dead: boolean; }
