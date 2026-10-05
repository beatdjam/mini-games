// Types of the definitions in src/data/ and of the objects built from them.
// Fields marked "(lang)" are filled from src/i18n/<code>.ts by src/i18n/text.ts when the language is set. They are required
// in the type; the definitions get an empty value for them first (withLang in src/data/langslots.ts), so they are never undefined.
// Objects that gain fields while the game runs (enemies, bosses, bullets) list every field: the ones every object has
// are required, the ones only some kinds use (a sniper's laser, a boss's pattern state) are optional.
import type { WorldObject } from '@engine/core/world.ts';
import type { Projectile } from '@engine/world/projectiles.ts';
import type { ButtonPlace } from '@engine/ui/touchlayout.ts';
import type * as THREE from 'three';

export interface WeaponDef {
  dmg: number;
  rate: number;
  spread: number;
  pellets: number;
  speed: number;
  mag: number;
  reload: number;
  color: number;
  cost: number;
  maxShots?: number; // rounds one trigger pull fires at most (shotCount); split-shot past it goes into each round's damage
  steady?: boolean;
  kb?: number;
  pierce?: number;
  far?: number;
  farMul?: number;
  blast?: number;
  grav?: number;
  chipMag?: number;
  name: string;
  desc: string; // (lang)
}
export interface Rarity {
  stars: string;
  mult: number;
  css: string;
  hex: number;
  name: string /* (lang) */;
}
export interface Affix {
  name: string;
  text: string;
} // (lang)
export interface Biome {
  code: string;
  fog: number;
  fogNear: number;
  fogFar: number;
  floor: string;
  line: string;
  wall: string;
  wallLine: string;
  gen: Record<string, any>; // level generator settings (src/world/level.ts)
  enemies: string[];
  bosses: string[];
  name: string;
  hint?: string; // (lang; hint only on some sectors)
}
export interface BossMeta {
  pillars: boolean;
  hp: number;
  y: number;
  hitR: number;
  tune: Record<string, any>; // attack numbers, read by src/actors/bosses/<name>.ts
  name: string;
  title: string;
  short: string;
  desc: string; // (lang)
}
export interface Perk {
  id: string;
  v: number;
  rv?: number;
  noSupply?: boolean; // noSupply: left out of the shortcut supply picks
  apply(p: any, v: number): void;
  cur(p: any): any;
  maxed?(p: any): boolean;
  name: string;
  desc(v: number): string;
  curText(c: any): string; // (lang)
}
// base upgrades cost bits by level; reboot upgrades cost a fixed number of points
export interface Upgrade {
  id: string;
  max: number;
  cost(level: number): number;
  name: string;
  desc(level: number): string; /* (lang) */
}
// max may be Infinity; step: the cost goes up by this much per level already taken (rebootCost in src/core/rules.ts)
export interface RebootUpgrade {
  id: string;
  max: number;
  cost: number;
  step?: number;
  name: string;
  desc(level: number): string; /* (lang) */
}
// one enemy type (src/data/enemies.ts): hp, speed (m/s), r (collision radius), y (body height), hitR (hit sphere radius), dmg,
// bits (drop), color and geo (geoCache key) are on every type; the rest are switches and numbers of some types
interface RangedDef {
  rate: number;
  speed: number;
  count: number;
  spread: number;
  burst?: number;
  burstGap?: number;
} // burst: rounds per volley
export interface EnemyDef {
  hp: number;
  speed: number;
  r: number;
  y: number;
  hitR: number;
  dmg: number;
  bits: number;
  color: number;
  geo: string;
  melee?: boolean;
  fly?: boolean;
  keep?: number; // keep: distance it holds from the player (circle-strafes)
  ranged?: RangedDef;
  muzzle?: number; // muzzle: height of the muzzle above the body
  sniper?: boolean;
  bomber?: boolean;
  split?: boolean;
  humanoid?: boolean;
  shield?: boolean;
  shieldHp?: number;
  turn?: number; // turn: rad/s
}
// a hit sphere (the head, chest and legs of a trooper, the bodies of Trinity): enemies without `parts` use their own mesh and hitR
export interface HitSphere {
  p: THREE.Vector3;
  r: number;
}
export type Laser = THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
// the fields of any enemy or boss on the field (an engine world object with tag 'enemy')
interface EnemyBase extends WorldObject {
  mesh: THREE.Object3D;
  mat: THREE.MeshLambertMaterial;
  baseEI: number; // group, body material, normal glow
  x: number;
  z: number;
  y: number;
  r: number;
  hitR: number;
  hp: number;
  maxHp: number;
  dmg: number;
  room: number;
  floor?: number; // in a building: the floor its room is on (it may have followed the player to another one)
  active: boolean;
  t: number;
  flash: number; // room: -1 = not tied to a room; t: animation clock
  update?(dt: number): void;
  parts?: HitSphere[]; // trooper, Trinity
  laser?: Laser | null; // sniper, Phantom (null once removed)
  extra?: THREE.Object3D[]; // meshes removed with it (Trinity's bodies)
  stunMul?: number; // bosses: damage multiplier while stunned or open
  invuln?: boolean;
  hinted?: boolean; // Bastion: shielded; whether the hint toast was shown
}
// a regular enemy (spawnEnemy in src/world/entities.ts)
export interface RegularEnemy extends EnemyBase {
  boss?: undefined;
  type: string;
  def: EnemyDef;
  body: THREE.Object3D; // body: the spinning part
  fy: number;
  side: number;
  face: number; // feet height; strafe direction (±1); facing angle
  cd: number;
  mcd: number;
  stun: number; // ranged / sniper cooldown, melee cooldown, seconds of stagger left
  burstN: number;
  burstT: number; // burst rounds left, seconds to the next
  kbShot?: number; // the last shot that knocked it back
  // the rest is set only on some types (see Shielded / Sniper / Trooper below, and the guards isShielded / isSniper / isTrooper in src/world/entities.ts)
  shieldHp?: number;
  shieldParts?: [THREE.Mesh, THREE.LineSegments]; // shield
  fuse?: number;
  detonated?: boolean; // bomber: fuse = seconds left once lit
  aim?: number;
  lock?: number[]; // sniper
  rig?: HumanoidRig;
  walk?: number;
  px?: number;
  pz?: number;
  kick?: number; // trooper
  shots?: number; // ranged: rounds fired (the smoke test counts a burst)
}
// shield: the plate breaks at shieldHp 0; sniper: aim = seconds of aiming left, lock = where the laser locked; trooper: rig = joints,
// walk = walk cycle, px / pz = last position, kick = gun recoil, parts = head, chest and legs
export type Shielded = RegularEnemy & {
  shieldHp: number;
  shieldParts: [THREE.Mesh, THREE.LineSegments];
  def: EnemyDef & { shieldHp: number };
};
export type Sniper = RegularEnemy & { aim: number; lock: number[]; laser: Laser };
export type Trooper = RegularEnemy & {
  rig: HumanoidRig;
  walk: number;
  px: number;
  pz: number;
  kick: number;
  parts: HitSphere[];
};
interface HumanoidRig {
  upper: THREE.Object3D;
  neck: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
}
// a boss (bossBase in src/actors/bosses/common.ts). Each boss adds its own state on top of this (the types are in src/actors/bosses/<name>.ts)
export interface Boss extends EnemyBase {
  boss: true;
  kind: string;
  name: string;
  def: { r: number };
  behave(e: Boss, dt: number): void; // the boss's own behaviour, once it has appeared
  cx: number;
  cz: number; // centre of the arena
  timer: number;
  pat: number;
  patIdx: number;
  pt: number;
  shots: number;
  acc: number; // pattern clock and counters
  spawnT: number;
  spawnMax: number;
  intro: boolean;
  phased?: boolean; // entrance / phase change (bossPauseTick, bossPhase)
  beams?: THREE.Object3D[]; // Noise Core's beams (hidden when it dies)
}
export type Enemy = RegularEnemy | Boss;

// a bullet in flight: ox / oz = where it started, dmg, life = seconds left
interface Bullet extends Projectile {
  dmg: number;
  life: number;
  ox: number;
  oz: number;
}
// the player's: pierce = enemies it can still pass through, blast = explosion radius (rockets), far / farMul = rail range bonus,
// kb = knockback, rail = punches through shields, shot = id of the trigger pull, color
export interface PBullet extends Bullet {
  pierce: number;
  blast: number;
  color: number;
  far: number;
  farMul: number;
  kb: number;
  rail: boolean;
  shot: number;
}
// an enemy's: size = scale (and hit radius), homing = seconds it still steers toward the player
export interface EBullet extends Bullet {
  size: number;
  homing: number;
}

// the `data` part of a language file (src/i18n/<code>.ts): names and descriptions copied onto the definitions
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
  keyActions: Record<string, { name: string }>;
  guideDesk: [string, string][];
  guideTouch: [string, string][];
}

// a keyboard action (PC) and the keys it starts with; name comes from the language file (keyActions)
export interface KeyActionDef {
  id: string;
  keys: string[]; // default keys (KeyboardEvent.code), up to 2
  name: string;
}

// one weapon: in hand, in the bag, in storage or on the ground. basic = a base weapon (never lost);
// r = rarity index, plus = + value, opts = option ids (AFFIX), mag = rounds left in the magazine
export interface WeaponItem {
  id: string;
  r: number;
  basic?: boolean;
  plus?: number;
  opts?: string[];
  mag?: number;
}
// a weapon in hand or in the bag during a run (newWeapon fills every field)
export interface Weapon extends WeaponItem {
  basic: boolean;
  plus: number;
  opts: string[];
  mag: number;
}
// the player during a run (newPlayer in src/actors/player.ts, newWeapon in src/actors/weapons.ts)
export interface Player {
  x: number;
  z: number;
  fy: number;
  vy: number;
  yaw: number;
  pitch: number;
  r: number;
  bob: number;
  tile: number;
  hp: number;
  maxHp: number;
  inv: number;
  kits: number;
  st: number;
  stMax: number;
  stRegen: number;
  stDelay: number;
  dashT: number;
  sprint: boolean; // running: the dash has been held since a dash (flow/update.ts)
  ddx: number;
  ddz: number;
  baseSpeed: number;
  spdMul: number;
  dmgMul: number;
  fireRate: number;
  gainMul: number;
  reloadMul: number;
  magMul: number;
  leech: number;
  pierce: number;
  extra: number;
  crit: number;
  chain: number;
  magnet: number;
  weapons: (Weapon | null)[];
  cur: number;
  bag: (Weapon | null)[];
  reloadT: number;
  reloadMax: number;
  fireCd: number;
}
// one run (a dive, or a boss practice when practice is set)
// the building of the depth being played (src/world/building.ts): what is needed to build it again and to know how
// far the player has got in it. Saved with the checkpoint
export interface BuildingState {
  tier: number; // the depth this building is (0-based)
  seed: number; // makeBuilding's seed
  boss: string; // the boss in its boss room
  floor: number; // the floor the player is on (0 = top)
  floors: number; // how many floors the building has (the stage number and its label need it)
  step: number; // how far along the building's route that floor is (0 = the first; enemies get stronger by this)
  at: number; // the stairs or lift the player came by (index into the building's links), -1 = the start room
  cleared: number[][]; // per floor: the rooms with no enemy left
  ld: number; // the lockdown: 0 = still to come, 1 = done
  visited: boolean[]; // per floor: entered before (the weapon caches are put down on the first visit)
  supplied?: boolean; // the pre-boss supply has been given: the rooms of this building drop no more chips
  seen?: string[]; // per floor: the tiles shown on the map, packed (packSeen); written when the checkpoint is saved
}
export interface RunState {
  stage: number;
  kills: number;
  bits: number;
  startTier: number;
  route: number[];
  perks: string[]; // chip ids taken, '+' for the rare version
  bosses?: string[]; // bosses defeated
  bld?: BuildingState; // not in boss practice
  cleared?: boolean;
  practice?: boolean;
  forceBoss?: string;
  t0?: number;
}
export interface Snapshot {
  run: RunState;
  P: Player;
}
export interface SaveData {
  bits: number;
  up: Record<string, number>;
  unlocked: Record<string, boolean>;
  loadout: (WeaponItem | null)[];
  stash: WeaponItem[];
  shortcut: number;
  startTier: number;
  peak: number; // the deepest shortcut opened since the last reboot (it doesn't close on death; sets the modding cap)
  best: number;
  runs: number;
  bossKills: number;
  bossSeen: Record<string, boolean>;
  stageV: number;
  mods: Record<string, { plus: number; r: number }>;
  canReboot: boolean;
  pres: { count: number; pts: number; up: Record<string, number> };
  suspend: Snapshot | null; // the checkpoint of a run in progress (src/flow/suspend.ts makeSnapshot)
  settings: {
    lang: string | null;
    autofire: boolean;
    assist: string;
    sens: number;
    bgm: number;
    sfx: number;
    leftFire: boolean;
    stickDash: boolean;
    layout: Record<string, ButtonPlace>;
    keys: Record<string, string[]>; // PC key bindings: action id -> its keys (KEY_ACTIONS in src/data/controls.ts)
  };
}

// something on the ground (engine world tag 'pickup'): bits (value), a med kit, a chip or a weapon (w)
export interface Pickup extends WorldObject {
  tag: 'pickup';
  kind: PickupKind;
  x: number;
  z: number;
  y: number;
  mesh: THREE.Object3D;
  t: number;
  dead: boolean;
  value?: number;
  w?: Weapon;
  rare?: boolean; // a chip whose choices are all the rare version (a lockdown's reward)
}
// a ground shockwave ring (engine world tag 'wave'): grows to max radius, hurts the player once when the ring passes
export interface Wave extends WorldObject {
  tag: 'wave';
  x: number;
  z: number;
  r: number;
  speed: number;
  max: number;
  dmg: number;
  hit: boolean;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  dead: boolean;
}

// the flow of the game (src/flow/state.ts state)
export type GameState = 'base' | 'play' | 'pause' | 'perk' | 'result' | 'bag' | 'layout';
// how a dive ends
export type RunEnd = 'extract' | 'dead' | 'abandon';
export type PickupKind = 'bit' | 'kit' | 'chip' | 'weapon';
// a gate: 'next' (on to the next area) or 'extract' (back to base)
export type PortalKind = 'next' | 'extract';
