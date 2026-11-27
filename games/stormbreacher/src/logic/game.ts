// The game's state and the entry for updating it by one frame: the mech and its armour, the map, the targets' health,
// the props that break, the enemies, the weapons, the mech's fist, the shots in flight, the mission script and the
// frame's events.
// Nothing here reads three or the DOM, so a test runs it in node without a page. The mech's shot is a bullet that flies
// at its weapon's speed (data/weapons.ts) from the mech's chest toward the aim line, drawn toward a target or an
// enemy in the aim circle by the soft FCS (fcs.ts) and spread a little by a random draw. It stops at the first prop it
// meets, at the first target or living enemy along its path or at the ground, whichever is nearest, and vanishes at its
// range; a breakable prop takes the damage and breaks at 0. An enemy's shot (logic/enemies.ts) flies at its kind's
// speed and stops at a prop, at the mech or at the ground; the mech's armour takes its damage, and at 0 the mech is
// downed and the game stops. A pillbox (logic/pillbox.ts) that sees the mech warns of a burst and then fires it, and its
// shots fly as an enemy's do. A shot on a pillbox takes no health and quiets its muzzle for a while instead (SB-2015);
// only a charge on a blast point breaks it. The script's `spawn` puts a wave's enemies out (the wave's kinds are in
// M1_WAVE_ENEMY), starts
// the wave's barrage (M1_WAVE_BARRAGE; logic/hazards.ts) and, when the last of the enemies falls, `cleared` goes back
// through sendToScript. A barrage warns of a shell while the mech is in reach and the shell lands later; an aimed mortar
// warns of a shell on the place the mech has stayed at for a while; a mine blows up
// when the mech steps on it or the mech's shot breaks it, and both take armour from a mech inside the blast. The boss
// (SB-200, logic/battery.ts): once the `battery` wave is out, each main gun still standing shoots the mech with a machine
// gun, and the magazine takes no harm while its shutter is shut, until both main guns are down. An `ally` (a friend,
// logic/allies.ts) runs its way with no hit box and falls at the place its fate names (SB-170).
import { distXZ } from '@engine/core/index.ts';
import { ALLY_TUNE, COVER_TUNE } from '../data/allies.ts';
import { CUTSCENES } from '../data/cutscenes.ts';
import { LINE2_FLAG } from '../data/front.ts';
import { DEFENDER_POSTS, defenderPostOf } from '../data/defenders.ts';
import {
  ENEMIES,
  ENEMY_CHEST,
  ENEMY_KINDS,
  M1_NEST_WAVE,
  M1_WAVE_DROP,
  M1_WAVE_ENEMY,
  type EnemyKind,
} from '../data/enemies.ts';
import { BATTERY_WAVE, GUN_TUNE, M1_SHUTTERS } from '../data/battery.ts';
import { CHARGE_TUNE } from '../data/charge.ts';
import { CRAFT_TUNE, craftZ } from '../data/craft.ts';
import { FORT_BLAST_TUNE, FORTRESS_GUN_TUNE, FORTRESS_TUNE, YARD_TUNE } from '../data/fortress.ts';
import { BARRAGES, M1_WAVE_AIMED, M1_WAVE_BARRAGE, MINE_TUNE } from '../data/hazards.ts';
import { LANDING_TUNE } from '../data/landing.ts';
import { MELEE_DAMAGE_MUL, MELEE_TUNE } from '../data/melee.ts';
import { M1_MECH } from '../data/mech.ts';
import { FORTRESS_GUN_FLAG, M1 } from '../data/missions/m1.ts';
import { PAYOFFS, PAYOFF_TUNE } from '../data/payoff.ts';
import { M1_SECTORS, SECTOR_TUNE, type SectorId } from '../data/sectors.ts';
import { PILLBOX_BLAST, PILLBOX_TUNE } from '../data/pillbox.ts';
import { PROP_HP, TARGET_CHARGE_ONLY, TARGET_HP, TARGET_SIZE, WRECK_SCALE_Y } from '../data/props.ts';
import { RADIO_TUNE } from '../data/script.ts';
import { BLAST_FACE_TUNE, FCS_QUARTER, FCS_TUNE, MECH_TUNE, PLAY_BATTLE_TUNE, type FxTune } from '../data/tune.ts';
import { TRICKLE_TUNE, TRICKLE_WAVE } from '../data/trickle.ts';
import type { FcsTune } from '../data/tuneTypes.ts';
import type { AllyFateBy, Area, GroundSpot, MapDef, MissionDef, TargetKind, TargetPlace } from '../data/types.ts';
import { WARDEN_TUNE } from '../data/warden.ts';
import { M1_LOADOUT, WEAPONS, type WeaponId } from '../data/weapons.ts';
import { newBattle, stepBattle, type BattleState } from './battle.ts';
import { pushOutCircle, rectBox, rectBoxes, groundAt, type GroundRect } from './collide.ts';
import { allyCraftRects, craftBack, craftRects, inCraftLane } from './craft.ts';
import { fallNear, spawnWave as spawnCrowd } from './crowd.ts';
import {
  armoured,
  newBattery,
  newShutters,
  openShutters,
  shuttered,
  stepGun,
  type BatteryState,
  type ShutterState,
} from './battery.ts';
import { moveAlly, newAlly, stepAlly, type AllyFate, type AllyState } from './allies.ts';
import { newAssist, stepAssist as stepAssistState, type AssistState } from './assist.ts';
import {
  blastPropIndexes,
  blastTarget,
  newBlasts,
  stepBlasts,
  stepCharge,
  type BlastState,
  type ChargeState,
  type PlantState,
} from './blasts.ts';
import { holdAt, newEnemy, stepEnemy, type EnemyShot, type EnemyState } from './enemies.ts';
import { newFortressGun, stepFortressGun, type FortressGunState } from './fortress.ts';
import { newNav, stepNav, type NavState } from './nav.ts';
import { newPillbox, pillboxDamageMul, stepPillbox, suppressPillbox, type PillboxState } from './pillbox.ts';
import {
  newFcs,
  spreadDir,
  spreadFor,
  stepFcs,
  type Dir3,
  type FcsState,
  type FcsTarget,
  type FcsWorld,
  type Ray3,
} from './fcs.ts';
import { fireRayHit, type Aabb } from './fire.ts';
import { newSectors, sectorHold, stepSectors, type SectorsState } from './sectors.ts';
import { newTrickle, stepTrickle, type TrickleState } from './trickle.ts';
import {
  inCircle,
  mineStepped,
  newAimed,
  newBarrage,
  stepAimed,
  stepBarrage,
  stepShells,
  type AimedState,
  type BarrageState,
  type MineState,
  type ShellState,
} from './hazards.ts';
import { blockingPropIndexes, mapBlockers } from './mapShapes.ts';
import {
  beginLunge,
  beginMelee,
  meleeTarget,
  newMelee,
  stepMeleeBlow,
  stepMeleeLunge,
  type MeleePoint,
  type MeleeState,
} from './melee.ts';
import { newMech, stepMech, type MechEvent, type MechInput, type MechState } from './mech.ts';
import { moveTuneOf } from './mechTune.ts';
import { stream } from './rng.ts';
import { newScript, scriptInput, stepScript, type ScriptInput, type ScriptOut, type ScriptState } from './script.ts';
import { restartWarden, stepWarden, wardenDamageMul } from './warden.ts';
import { newWeapon, stepWeapon, type WeaponState } from './weapons.ts';

// The radius the enemies' cells are blocked for (m): the widest walking enemy's, so what one can walk through they all
// can. A static kind (the machine-gun nest) never uses the nav, so it does not widen the cells for the walkers.
export const NAV_RADIUS = Math.max(
  ...ENEMY_KINDS.filter(kind => ENEMIES[kind].speed > 0).map(kind => ENEMIES[kind].navRadius ?? ENEMIES[kind].radius),
);

export interface TargetState {
  id: string;
  kind: TargetKind;
  hp: number; // the health left
  box: Aabb; // the box a shot may hit
  yaw: number; // how far it is turned about its middle (rad); a pillbox fires toward its front
}

export interface BreakableState {
  prop: number; // the prop's place in map.props
  hp: number; // the health left; 0 stays after it breaks
}

// What happened in one frame, in the order it happened.
export type GameEvent =
  | { kind: 'mech'; event: MechEvent } // what stepMech reported, wrapped as it came
  // a bullet leaves the mech's chest
  | { kind: 'shot'; x: number; y: number; z: number; dx: number; dy: number; dz: number; weapon: WeaponId }
  // the mech's fist: `hit` is whether it met something, and (x, y, z) is where the blow landed or the empty air in front;
  // the id of the enemy or target, or the prop's place in map.props, when one of those took it
  | {
      kind: 'melee';
      hit: boolean;
      x: number;
      y: number;
      z: number;
      enemy: string | null;
      target: string | null;
      prop: number | null;
    }
  | {
      kind: 'hit';
      x: number;
      y: number;
      z: number;
      weapon: WeaponId | null; // the mech's weapon; null for an enemy's or the battery's bullet
      target: string | null; // the target's id when a target stopped the bullet
      prop: number | null; // the prop's place in map.props when a prop stopped it
      enemy: string | null; // the enemy's id when an enemy stopped the bullet
      mech: boolean; // whether the mech stopped the bullet; all of these are empty at the ground and at a mine
      deflected: boolean; // whether a pillbox's front or a nest's plate turned the bullet away; false everywhere else
    }
  | { kind: 'destroyed'; id: string }
  | { kind: 'shutterOpen'; target: string } // the shutter before this target opened
  | { kind: 'spawned'; wave: string; count: number } // a wave's enemies were put out
  | { kind: 'enemyDown'; id: string; x: number; y: number; z: number } // an enemy's health reached 0
  | { kind: 'wardenDown'; id: string; x: number; z: number } // the mid boss's three seconds of smoke ended and it blew
  | { kind: 'damaged'; amount: number; fromX: number; fromZ: number } // the mech took `amount`; (fromX, fromZ) is the unit direction on the ground from the mech toward where the bullet came from
  | { kind: 'downed' } // the armour reached 0
  | { kind: 'propDestroyed'; prop: number; x: number; z: number }
  | { kind: 'shellWarn'; x: number; z: number; radius: number } // a shell will land here
  | { kind: 'shellLand'; x: number; y: number; z: number; hit: boolean } // a shell landed; `hit` is whether the mech was inside the blast
  | { kind: 'mineBlast'; x: number; y: number; z: number; hit: boolean } // a mine blew up; `hit` is whether the mech was inside the blast
  | { kind: 'battleFell'; x: number; z: number } // one of the battle layer's soldiers fell this frame; the view puts its dust there
  | { kind: 'battleShell'; x: number; z: number; shake: number } // a shell of the battle layer landed; the view draws it and shakes the camera
  | { kind: 'sectorCleared'; sector: SectorId } // a sector's enemies are all down; the infantry moves up to it (SB-2210)
  | { kind: 'sectorSecured'; sector: SectorId } // enough infantry has reached the sector's hold line; it is secured (SB-2210)
  | { kind: 'sectorCounter'; sector: SectorId } // the sector's securing brought a counterattack (SB-2220)
  | { kind: 'sectorSpawn'; sector: SectorId; x: number; z: number } // one counterattack enemy comes out here (SB-2220)
  | { kind: 'sectorStable'; sector: SectorId; weak: boolean } // the counterattack is beaten off; the sector is stable (SB-2220)
  | { kind: 'planted'; id: string; x: number; z: number } // a charge was planted on this blast point
  | { kind: 'blast'; id: string; x: number; z: number; hit: boolean } // a charge blew up; `hit` is whether the mech was inside the blast
  | { kind: 'pillboxWarn'; target: string; x: number; y: number; z: number } // a pillbox will fire a burst from this muzzle; the view reads the countdown, so this is for the tests and a future sound or effect
  | { kind: 'allyDown'; id: string; x: number; z: number; by: AllyFateBy } // an ally fell where it stood; `by` is how (the script's fate)
  | { kind: 'allyCall'; id: string; line: string } // an ally called on the radio before its fate
  | { kind: 'assistFire'; fromX: number; fromZ: number; toX: number; toZ: number } // the scripted allies shot an enemy from (fromX, fromZ) at (toX, toZ); a look only
  | { kind: 'script'; event: ScriptOut } // what the mission script reported, wrapped as it came
  // an ally's support fire flies at a silenced nest (SB-2024): from (x, y, z) to (tx, ty, tz); the view draws the tracer and the spark
  | { kind: 'coverFire'; enemy: string; x: number; y: number; z: number; tx: number; ty: number; tz: number }
  | { kind: 'payoff'; id: string; x: number; z: number } // a milestone's knock, at the blast or the thing that fell
  | { kind: 'cleared' }
  | { kind: 'retried'; from: string | null }; // the sortie began again: from the checkpoint with this id, or null from the start

// A shot in flight: where it is, the direction it flies (length 1) and the range it has left.
interface BulletBase {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  left: number; // the range left (m)
}

export interface MechBullet extends BulletBase {
  weapon: WeaponId;
}

export interface EnemyBullet extends BulletBase {
  enemy: EnemyKind;
}

// A shot of a main gun's machine gun.
export interface BatteryBullet extends BulletBase {
  gun: string; // the id of the target that fired it
}

// A shot of a pillbox's machine gun.
export interface PillboxBullet extends BulletBase {
  pillbox: string; // the id of the target that fired it
}

// A shot of the fortress's heavy machine-gun nest.
export interface FortressBullet extends BulletBase {
  fort: string; // the id of the target that fired it
}

export type Bullet = MechBullet | EnemyBullet | BatteryBullet | PillboxBullet | FortressBullet;

export function isEnemyBullet(bullet: Bullet): bullet is EnemyBullet {
  return 'enemy' in bullet;
}

export function isBatteryBullet(bullet: Bullet): bullet is BatteryBullet {
  return 'gun' in bullet;
}

export function isPillboxBullet(bullet: Bullet): bullet is PillboxBullet {
  return 'pillbox' in bullet;
}

export function isFortressBullet(bullet: Bullet): bullet is FortressBullet {
  return 'fort' in bullet;
}

// Whether the bullet is fired at the mech: an enemy's, the battery's, a pillbox's or the fortress nest's.
export function isHostileBullet(
  bullet: Bullet,
): bullet is EnemyBullet | BatteryBullet | PillboxBullet | FortressBullet {
  return !('weapon' in bullet);
}

// How fast a bullet flies and what it does, from the table of the weapon, the enemy, the gun, the pillbox or the nest
// that fired it.
function bulletSpec(bullet: Bullet): { speed: number; damage: number } {
  if (isFortressBullet(bullet)) {
    return { speed: FORTRESS_GUN_TUNE.bulletSpeed, damage: FORTRESS_GUN_TUNE.damage };
  }
  if (isPillboxBullet(bullet)) return { speed: PILLBOX_TUNE.bulletSpeed, damage: PILLBOX_TUNE.damage };
  if (isBatteryBullet(bullet)) return { speed: GUN_TUNE.bulletSpeed, damage: GUN_TUNE.damage };
  if (isEnemyBullet(bullet)) {
    const def = ENEMIES[bullet.enemy];
    return { speed: def.bulletSpeed, damage: def.damage };
  }
  const def = WEAPONS[bullet.weapon];
  return { speed: def.speed, damage: def.damage };
}

// The game as a checkpoint keeps it: every field of GameModel except the ones listed here, which are not kept. `events`,
// `bullets` and `shells` (a warning before it lands) are the frame's own, `checkpoint` never nests, and `id` is the checkpoint's name (cp1). `map` and
// `mission` are definitions nothing writes to, so the copy points at the same ones. The battle layer (`battle`,
// `battleTune`) is rebuilt from the sectors when the sortie comes back.
export type GameSnapshot = Omit<
  GameModel,
  'events' | 'bullets' | 'shells' | 'nav' | 'checkpoint' | 'battle' | 'battleTune'
> & { id: string };

export interface GameModel {
  time: number; // seconds since the sortie began
  map: MapDef;
  mission: MissionDef; // the script's write-up (data/missions/m1.ts)
  script: ScriptState; // the mission script's own state; the objective, marks and the rest are read from here
  battle: BattleState; // the battle layer's infantry and shells; step moves it, the view only draws it
  sectors: SectorsState | null; // the front's sectors; null where the sortie's sectors do not run (the arena)
  trickle: TrickleState | null; // the enemies the front keeps putting out (SB-2230); null where the sectors do not run
  battleTune: FxTune; // the values the battle layer runs on (the sortie's, or the arena's thinner one)
  // The line on screen now. `time` is when it came up plus the cutscene seconds since (stepRadio holds it still while a
  // cutscene hides the HUD), so game.time - time is the seconds the HUD has shown it; null before one
  radio: { line: string; time: number; callout?: string } | null;
  radioQueue: { line: string; at?: number; callout?: string }[]; // the lines waiting to come up after it, oldest first; `at` is the game time it may come up
  mech: MechState;
  armor: number; // the mech's armour left (MECH_TUNE.armor at the start)
  downed: boolean; // set when the armour reaches 0; step does nothing after
  rects: GroundRect[]; // the map's blockers (mapBlockers)
  propBoxes: Aabb[]; // the props' boxes, which stop a shot; a ramp is a stack that follows its slope
  propRefs: number[]; // the prop's place in map.props for each propBoxes entry
  breakables: BreakableState[]; // the breakable blocking props, with their health
  targets: TargetState[];
  pillboxes: PillboxState[]; // the pillboxes' machine guns, by target id; a destroyed pillbox's state stays
  pillboxHint: boolean; // whether the radio line about how to break a pillbox has gone out (SB-2017)
  enemies: EnemyState[]; // every enemy put out, the fallen too (hp 0: they do not move, shoot or take a hit)
  nav: NavState; // the cells and counts the enemies find their way by; made again from rects, so a copy leaves it out
  main: WeaponState; // the main weapon's ammo and wait
  sub: WeaponState; // the sub weapon's ammo and wait
  melee: MeleeState; // the fist's wait and lunge
  fcs: FcsState; // the aim assist's state (the soft kind)
  aimTarget: string | null; // the id of the target or enemy the soft FCS pulls the aim toward, or null
  bullets: Bullet[]; // the shots in flight
  barrages: BarrageState[]; // the barrages that have started; none stops
  aimed: AimedState | null; // the aimed mortar, once a wave has started it; null before one
  shells: ShellState[]; // the shells warned and not yet landed
  shutters: ShutterState[]; // the armour plates before the targets that have one, shut or open
  battery: BatteryState; // the main guns' machine guns
  fortressGun: FortressGunState; // the fortress sea wall's heavy machine-gun nest (SB-1830)
  mines: MineState[]; // the mines still on the ground
  blasts: BlastState[]; // the map's blast points, and which have blown their line open
  charges: ChargeState[]; // the charges planted and not yet blown
  plant: PlantState | null; // the hold under way on a blast point, if any
  brokenProps: number[]; // the props the fortress blast brought down (map.props' places, SB-1860)
  allies: AllyState[]; // the allies the script has put out, the fallen too (down: they do not move); no hit box
  slow: { left: number; scale: number } | null; // the milestone's short slowdown: real seconds left and the time's share
  calm: { left: number; mul: number } | null; // the milestone's lull in the enemy mortar: seconds left and its interval share
  // the allies' support fire under way (SB-2024): the wave it holds quiet, the seconds left, the wait to the next tracer, the nest to fire at next, and whether the radio line about the rounds running short has gone out; null when none
  cover: { wave: string; left: number; wait: number; next: number; warned: boolean } | null;
  assist: AssistState | null; // the script's assist once a cue has started it (SB-1840); null before one
  events: GameEvent[]; // this frame's events; step empties it first
  cleared: boolean; // set when the script's `end` fires
  checkpoint: GameSnapshot | null; // the game as the last checkpoint kept it; null before one
  retries: number; // how many times the sortie began again (SB-210 charges the repair and the ammo for each)
}

// The box a shot may hit on a mine: MINE_TUNE.size around its place.
function mineBox(mine: MineState): Aabb {
  const size = MINE_TUNE.size;
  return rectBox({ x: mine.x, z: mine.z, halfW: size.w / 2, halfD: size.d / 2, yaw: 0, top: size.h });
}

// The box a shot may hit on an enemy: x and z +- its radius, y from its feet (the ground, but while it falls in) to its height.
export function enemyBox(enemy: EnemyState): Aabb {
  const def = ENEMIES[enemy.kind];
  const box = rectBox({ x: enemy.x, z: enemy.z, halfW: def.radius, halfD: def.radius, yaw: 0, top: def.height });
  return { ...box, minY: enemy.y, maxY: enemy.y + def.height };
}

// The box an enemy's shot may hit on the mech: x and z +- its radius, y from the feet to its height.
function mechBox(mech: MechState): Aabb {
  const r = MECH_TUNE.radius;
  return {
    minX: mech.x - r,
    maxX: mech.x + r,
    minY: mech.y,
    maxY: mech.y + MECH_TUNE.height,
    minZ: mech.z - r,
    maxZ: mech.z + r,
  };
}

// The box a shot may hit: TARGET_SIZE's w and d turned by the target's yaw, with y from the target's foot (`place.y`,
// 0 when left out, as the fortress nest is set on the wall's top) to its height.
export function targetBox(place: TargetPlace): Aabb {
  const size = TARGET_SIZE[place.kind];
  const box = rectBox({
    x: place.x,
    z: place.z,
    halfW: size.w / 2,
    halfD: size.d / 2,
    yaw: place.yaw,
    top: size.h,
  });
  const y = place.y ?? 0;
  return { ...box, minY: y, maxY: y + size.h };
}

// The rect the target stands on. mapBlockers writes the targets after the props, so a prop that broke has moved the
// number; the rect is found by the target's place and size instead.
export function targetRect(game: Pick<GameModel, 'map' | 'rects'>, id: string): GroundRect | null {
  const place = game.map.targets.find(entry => entry.id === id);
  if (place === undefined) return null;
  const size = TARGET_SIZE[place.kind];
  return (
    game.rects.find(
      rect =>
        rect.ramp !== true &&
        rect.x === place.x &&
        rect.z === place.z &&
        rect.yaw === place.yaw &&
        rect.halfW === size.w / 2 &&
        rect.halfD === size.d / 2,
    ) ?? null
  );
}

// The target's rect stands at the wreck's height once it is down, the share of its height the view draws the wreck at.
function lowerWreckRect(game: Pick<GameModel, 'map' | 'rects'>, target: TargetState): void {
  if (target.hp > 0) return;
  const rect = targetRect(game, target.id);
  if (rect !== null) rect.top = TARGET_SIZE[target.kind].h * WRECK_SCALE_Y;
}

// Lowers the rect of every broken target, for a checkpoint or a suspend written before the rect kept the wreck's
// height: the ground then matches the low wreck the view draws.
export function lowerBrokenTargetRects(game: Pick<GameModel, 'map' | 'targets' | 'rects'>): void {
  for (const target of game.targets) lowerWreckRect(game, target);
}

// The FCS's view of the targets and then the enemies: the id is the place in game.targets, or past them in
// game.enemies; the centre is the middle of the box. One the chest cannot see (a prop or a standing target in the way)
// counts as not alive, so the soft lock never pulls toward an enemy behind a pillbox's wall.
function fcsTargets(game: GameModel, chest: { x: number; y: number; z: number }): FcsTarget[] {
  const things = [
    ...game.targets.map(target => ({
      box: target.box,
      alive: target.hp > 0,
      // a nest behind its plate is out of the aim until the plate opens (SB-2051)
      lockable: !TARGET_CHARGE_ONLY[target.kind] && !armoured(game.shutters, target.id),
    })),
    ...game.enemies.map(enemy => ({ box: enemyBox(enemy), alive: enemy.hp > 0, lockable: true })),
  ];
  // What hides one from the chest: the props and the standing targets (a pillbox's wall hides the enemy behind it).
  const walls = [...game.propBoxes, ...game.targets.filter(target => target.hp > 0).map(target => target.box)];
  return things.map(({ box, alive, lockable }, id) => {
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    const cz = (box.minZ + box.maxZ) / 2;
    return { id, box, cx, cy, cz, alive: alive && inSight(chest, cx, cy, cz, box, walls), lockable };
  });
}

// Whether the line from the chest to (cx, cy, cz) meets none of `walls` before it enters `own` (the thing's own box,
// which is left out of the walls: a target's centre is inside its own box). With no own box the whole line is checked.
function inSight(
  chest: { x: number; y: number; z: number },
  cx: number,
  cy: number,
  cz: number,
  own: Aabb | null,
  walls: readonly Aabb[],
): boolean {
  const dx = cx - chest.x;
  const dy = cy - chest.y;
  const dz = cz - chest.z;
  const length = Math.hypot(dx, dy, dz);
  const reach =
    own === null ? length : (fireRayHit(chest.x, chest.y, chest.z, dx, dy, dz, length, [own])?.dist ?? length);
  const others = own === null ? walls : walls.filter(wall => wall !== own);
  return fireRayHit(chest.x, chest.y, chest.z, dx, dy, dz, reach, others) === null;
}

// The id of the target or enemy at the FCS's id (see fcsTargets).
function fcsName(game: GameModel, id: number): string {
  return id < game.targets.length ? game.targets[id].id : game.enemies[id - game.targets.length].id;
}

// Where a shot leaves: the weapon arm's muzzle, to the mech's right and a little ahead of its centre.
function muzzleOf(mech: MechState): { x: number; y: number; z: number } {
  const side = MECH_TUNE.muzzleSide;
  const ahead = MECH_TUNE.muzzleForward;
  return {
    x: mech.x + Math.cos(mech.yaw) * side - Math.sin(mech.yaw) * ahead,
    y: mech.y + MECH_TUNE.chestHeight,
    z: mech.z - Math.sin(mech.yaw) * side - Math.cos(mech.yaw) * ahead,
  };
}

// One shot from the muzzle toward `dir`, spread by a random draw at `dist` m with `tune`: a bullet with `weapon`'s range
// to fly.
function shoot(game: GameModel, weapon: WeaponId, dir: Dir3, dist: number, tune: FcsTune): void {
  const def = WEAPONS[weapon];
  const { x, y, z } = muzzleOf(game.mech);
  const aimed = spreadDir(dir, spreadFor(dist, tune), stream('shots'));
  game.bullets.push({ weapon, x, y, z, dx: aimed.dx, dy: aimed.dy, dz: aimed.dz, left: def.range });
  game.events.push({ kind: 'shot', x, y, z, dx: aimed.dx, dy: aimed.dy, dz: aimed.dz, weapon });
}

// Moves one bullet on by `dt`. The mech's bullet stops at the nearest of the first prop, the first live target, the
// first live enemy, the first mine and the ground along the stretch it flies; an enemy's bullet stops at the nearest of the first prop,
// the mech and the ground. There it reports a hit; a prop (the mech's bullet only), a target or an enemy takes the
// damage and one down to 0 falls, a target going to the script, a mine going off at 0; the mech's armour takes an enemy's bullet. Returns
// whether the bullet is gone. The boxes are made fresh for each bullet, so a thing an earlier bullet broke is not met
// again.
function flyBullet(game: GameModel, bullet: Bullet, dt: number): boolean {
  const { speed, damage } = bulletSpec(bullet);
  const dist = Math.min(speed * dt, bullet.left);
  const hostile = isHostileBullet(bullet);
  const aliveTargets = hostile ? [] : game.targets.filter(target => target.hp > 0);
  const aliveEnemies = hostile ? [] : game.enemies.filter(enemy => enemy.hp > 0);
  // What only this bullet can hit comes first and the props after, so an index past `front` is a prop that stopped it.
  // (a mine comes after the enemies; an enemy's bullet flies over the mines)
  const front = hostile
    ? [mechBox(game.mech)]
    : [...aliveTargets.map(t => t.box), ...aliveEnemies.map(enemyBox), ...game.mines.map(mineBox)];
  // An enemy's bullet also stops at a standing target (a pillbox's wall), after the props, and does it no harm.
  const walls = hostile ? game.targets.filter(target => target.hp > 0).map(target => target.box) : [];
  const hit = fireRayHit(bullet.x, bullet.y, bullet.z, bullet.dx, bullet.dy, bullet.dz, dist, [
    ...front,
    ...game.propBoxes,
    ...walls,
  ]);
  // A bullet heading down meets the ground (y = 0) where its height runs out, if that is within the stretch.
  let ground = Infinity;
  if (bullet.dy < 0 && bullet.y + bullet.dy * dist <= 0) ground = bullet.y <= 0 ? 0 : bullet.y / -bullet.dy;
  if (!hit && ground === Infinity) {
    bullet.x += bullet.dx * dist;
    bullet.y += bullet.dy * dist;
    bullet.z += bullet.dz * dist;
    bullet.left -= dist;
    return bullet.left <= 0;
  }
  const stop = hit && hit.dist <= ground ? hit.dist : ground;
  const x = bullet.x + bullet.dx * stop;
  const y = bullet.y + bullet.dy * stop;
  const z = bullet.z + bullet.dz * stop;
  const met = hit && hit.dist <= ground ? hit.index : -1;
  const asMech = hostile && met === 0;
  const target = !hostile && met >= 0 && met < aliveTargets.length ? aliveTargets[met] : null;
  const enemyEnd = aliveTargets.length + aliveEnemies.length;
  const enemy =
    !hostile && met >= aliveTargets.length && met < enemyEnd ? aliveEnemies[met - aliveTargets.length] : null;
  const mine = !hostile && met >= enemyEnd && met < front.length ? game.mines[met - enemyEnd] : null;
  const propBox = met >= front.length && met < front.length + game.propBoxes.length ? met - front.length : -1;
  // A pillbox's front takes a quarter of the shot; everything else takes it whole. The way it came from is the
  // bullet's own direction turned around, so this is settled before the damage is taken.
  const mul = target && target.kind === 'pillbox' ? pillboxDamageMul(target.yaw, bullet.dx, bullet.dz) : 1;
  // A shot at a target behind its plate shows where the plate stops it, not at the box behind: the sparks stand in front
  // of the plate. The box's own spot is kept for the damage, which the plate takes away.
  const plated = target !== null && armoured(game.shutters, target.id);
  const plateZ = plated && target ? plateFront(target) : 0;
  const back = plated && bullet.dz < 0 && z < plateZ ? (plateZ - z) / -bullet.dz : 0;
  game.events.push({
    kind: 'hit',
    x: x - bullet.dx * back,
    y: y - bullet.dy * back,
    z: z - bullet.dz * back,
    weapon: hostile ? null : bullet.weapon,
    target: target ? target.id : null,
    prop: propBox >= 0 ? game.propRefs[propBox] : null,
    enemy: enemy ? enemy.id : null,
    mech: asMech,
    deflected: mul < 1 || plated,
  });
  if (asMech) damageMech(game, damage, -bullet.dx, -bullet.dz);
  // an enemy's bullet does not break a prop
  if (!hostile && propBox >= 0) damageProp(game, propBox, damage);
  // the mid boss's front plate, flank and back plate take different shares; every other enemy takes the shot whole
  if (enemy) {
    const mul =
      enemy.kind === 'warden' ? wardenDamageMul(enemy.yaw, bullet.dx, bullet.dz, (enemy.warden?.exposed ?? 0) > 0) : 1;
    damageEnemy(game, enemy, damage * mul);
  }
  if (mine) damageMine(game, mine, damage);
  if (!target) return true;
  // A shot does not break a pillbox (SB-2015): it suppresses the muzzle for a while and leaves the armour alone. A
  // charge on a blast point is the only way to break one.
  if (target.kind === 'pillbox') {
    suppressPillboxBy(game, target.id);
    return true;
  }
  damageTarget(game, target, damage * mul);
  return true;
}

// The z of the front face of the plate before a target that has one: the box's seaward face, the gap and the plate's depth.
function plateFront(target: TargetState): number {
  const def = M1_SHUTTERS.find(item => item.target === target.id);
  return target.box.maxZ + (def ? def.gap + def.d : 0);
}

// What a shot or a blow does to a pillbox (SB-2015): the muzzle is quieted for a while and the armour is left alone. The
// first one that lands tells the player the front will not open and where to plant a charge (SB-2017). It is said once:
// the line's lesson is worth one moment, not a nag.
function suppressPillboxBy(game: GameModel, id: string): void {
  if (!game.pillboxHint) {
    game.pillboxHint = true;
    queueRadio(game, 'm1.pillbox-charge', 0, 'm1.callout.pillbox-charge');
  }
  const state = game.pillboxes.find(pillbox => pillbox.id === id);
  if (state) suppressPillbox(state);
}

// Takes `damage` off the target; at 0 it falls, the frame reports it and the script is told. A target behind a shut
// shutter stops the shot and takes no harm. The one way to hurt a target, so a shot and a charge on a pillbox's point
// (SB-1540) go through the same fall.
function damageTarget(game: GameModel, target: TargetState, damage: number): void {
  if (shuttered(game.shutters, target.id)) return;
  target.hp = Math.max(0, target.hp - damage);
  if (target.hp > 0) return;
  // The view draws the wreck at WRECK_SCALE_Y of the target's height, so the wall left on the ground stands at the same
  // height: the mech may jump over it, the camera looks over it, and the shots still pass through the fallen target.
  lowerWreckRect(game, target);
  // The enemy's cells are made from the rects and their count does not change with a target, so stepNav would keep the
  // grid made before the fall. Dropping it rebuilds the grid on the next frame that has a walking enemy.
  game.nav.grid = null;
  game.events.push({ kind: 'destroyed', id: target.id });
  checkShutters(game);
  sendToScript(game, { kind: 'destroyed', target: target.id });
}

// Opens every shutter whose targets are all down and reports each one. Also called every frame, so a target whose health
// was taken some other way opens its shutter too.
function checkShutters(game: GameModel): void {
  const hpOf = (id: string): number => game.targets.find(target => target.id === id)?.hp ?? 0;
  for (const target of openShutters(game.shutters, hpOf, game.script.flags))
    game.events.push({ kind: 'shutterOpen', target });
}

// The height of the face a blast at (x, z) stands on: the ground, or the top of a prop or a target there (the seawall's
// 6 m, a ramp's slope, a pillbox's roof). A blast beside a wall's foot stays on the ground: the radius is the mech's own,
// so only a face the mech itself could stand on lifts it. The view draws the warned shell's ring at this height too.
const BLAST_FACE_RADIUS = MECH_TUNE.radius;
export function blastFaceHeight(rects: readonly GroundRect[], x: number, z: number): number {
  return groundAt(x, z, BLAST_FACE_RADIUS, rects, BLAST_FACE_TUNE.maxHeight);
}

// Takes `damage` off the enemy; at 0 it falls (it stays in game.enemies).
function damageEnemy(game: GameModel, enemy: EnemyState, damage: number): void {
  enemy.hp = Math.max(0, enemy.hp - damage);
  if (enemy.hp > 0) return;
  game.events.push({
    kind: 'enemyDown',
    id: enemy.id,
    x: enemy.x,
    // An enemy falling in can be above the face below it: its blast belongs at its feet then, not in the ground.
    y: Math.max(enemy.y, blastFaceHeight(game.rects, enemy.x, enemy.z)),
    z: enemy.z,
  });
}

// One thing the fist may reach: what it is, where the ground point the sector is measured to is (the nearest face of a
// structure, not its middle), where the blow shows, the box it owns (so its own face is not taken for a wall) and the
// share of the damage that kind takes.
type MeleeHit =
  | { kind: 'enemy'; enemy: EnemyState }
  | { kind: 'target'; target: TargetState }
  | { kind: 'mine'; mine: MineState }
  | { kind: 'prop'; prop: number };

interface MeleeCandidate {
  at: MeleePoint;
  hit: MeleeHit;
  box: Aabb | null; // the candidate's own box; null for a mine
  x: number;
  y: number;
  z: number;
  mul: number;
}

// A point on a face, moved MELEE_TUNE.contactGap toward the mech, so the sparks of a blow stand in front of the face rather
// than inside it. A mech already at the point (inside the box) is left where it is.
function inFrontOfFace(x: number, z: number, mech: { x: number; z: number }, gap: number): { x: number; z: number } {
  const dx = mech.x - x;
  const dz = mech.z - z;
  const length = Math.hypot(dx, dz);
  if (length < 1e-9) return { x, z };
  return { x: x + (dx / length) * gap, z: z + (dz / length) * gap };
}

// Everything in the sector's reach that a blow can harm: the living enemies, the standing targets, the mines and the
// breakable props. The fallen and the broken are left out, as a shot leaves them out. The sector is measured to the
// nearest point of a box, so a big structure can be reached from its face; a blow does not go through a wall or a prop,
// and a defender still hidden behind its cover is not seen at all. Returns the candidate's box too, so the sight test can
// leave out the face it is aimed at.
function meleeCandidates(game: GameModel): MeleeCandidate[] {
  const candidates: MeleeCandidate[] = [];
  for (const enemy of game.enemies) {
    if (enemy.hp <= 0) continue;
    // a posted defender is behind its cover while it hides; only a stepped-out one, or one running to the next cover, can be hit
    if (enemy.post !== null && !enemy.holdOut && enemy.fallback === null) continue;
    const def = ENEMIES[enemy.kind];
    const box = enemyBox(enemy);
    const face = inFrontOfFace(
      Math.min(Math.max(game.mech.x, box.minX), box.maxX),
      Math.min(Math.max(game.mech.z, box.minZ), box.maxZ),
      game.mech,
      MELEE_TUNE.contactGap,
    );
    candidates.push({
      at: face,
      hit: { kind: 'enemy', enemy },
      box,
      // the sparks show on the side toward the mech, not inside the machine
      x: face.x,
      y: enemy.y + def.height * ENEMY_CHEST,
      z: face.z,
      mul: MELEE_DAMAGE_MUL[enemy.kind],
    });
  }
  for (const target of game.targets) {
    if (target.hp <= 0) continue;
    const { box } = target;
    const face = inFrontOfFace(
      Math.min(Math.max(game.mech.x, box.minX), box.maxX),
      Math.min(Math.max(game.mech.z, box.minZ), box.maxZ),
      game.mech,
      MELEE_TUNE.contactGap,
    );
    candidates.push({
      at: face,
      hit: { kind: 'target', target },
      box,
      // sparks show on the face nearest the mech rather than inside the structure
      x: face.x,
      y: (box.minY + box.maxY) / 2,
      z: face.z,
      mul: MELEE_DAMAGE_MUL[target.kind],
    });
  }
  for (const mine of game.mines) {
    candidates.push({
      at: mine,
      hit: { kind: 'mine', mine },
      box: null,
      x: mine.x,
      y: 0.5,
      z: mine.z,
      mul: MELEE_DAMAGE_MUL.mine,
    });
  }
  for (const breakable of game.breakables) {
    if (breakable.hp <= 0) continue;
    let box: Aabb | null = null;
    let pointX = 0;
    let pointZ = 0;
    let nearest = Infinity;
    for (let i = 0; i < game.propBoxes.length; i++) {
      if (game.propRefs[i] !== breakable.prop) continue;
      const candidate = game.propBoxes[i];
      const x = Math.min(Math.max(game.mech.x, candidate.minX), candidate.maxX);
      const z = Math.min(Math.max(game.mech.z, candidate.minZ), candidate.maxZ);
      const dist = Math.hypot(game.mech.x - x, game.mech.z - z);
      if (dist >= nearest) continue;
      nearest = dist;
      box = candidate;
      pointX = x;
      pointZ = z;
    }
    if (box === null) continue;
    const face = inFrontOfFace(pointX, pointZ, game.mech, MELEE_TUNE.contactGap);
    candidates.push({
      at: face,
      hit: { kind: 'prop', prop: breakable.prop },
      box,
      x: face.x,
      y: 0.8,
      z: face.z,
      mul: MELEE_DAMAGE_MUL.prop,
    });
  }
  return candidates;
}

// One blow of the mech's fist, landing where the swing is: the nearest thing in the front sector takes the kind's share of
// MELEE_TUNE.damage and a lunge follows. An empty sector is a miss, so the lunge is short and only the air is struck. The
// blow reports where it landed (the target's near face, or the point in front of the mech) so the view's sparks and the
// sound come from there. A blow on a pillbox suppresses it and takes no health, as a shot does.
function meleeStrike(game: GameModel): void {
  const chest = { x: game.mech.x, y: game.mech.y + MECH_TUNE.chestHeight, z: game.mech.z };
  const walls = [...game.propBoxes, ...game.targets.filter(target => target.hp > 0).map(target => target.box)];
  // The fist goes no farther than its own reach: a prop or a standing target between the chest and the face turns the
  // blow away, the same rule a shot follows.
  const candidates = meleeCandidates(game).filter(candidate =>
    inSight(chest, candidate.x, candidate.y, candidate.z, candidate.box, walls),
  );
  const index = meleeTarget(
    game.mech,
    candidates.map(candidate => candidate.at),
  );
  const met = index >= 0 ? candidates[index] : null;
  const fx = -Math.sin(game.mech.yaw);
  const fz = -Math.cos(game.mech.yaw);
  const x = met ? met.x : game.mech.x + fx * (MELEE_TUNE.range / 2);
  const y = met ? met.y : game.mech.y + MECH_TUNE.chestHeight;
  const z = met ? met.z : game.mech.z + fz * (MELEE_TUNE.range / 2);
  const target = met?.hit.kind === 'target' ? met.hit.target : null;
  const prop = met?.hit.kind === 'prop' ? met.hit.prop : null;
  game.events.push({
    kind: 'melee',
    hit: met !== null,
    x,
    y,
    z,
    enemy: met?.hit.kind === 'enemy' ? met.hit.enemy.id : null,
    target: target ? target.id : null,
    prop,
  });
  if (met !== null) {
    const damage = MELEE_TUNE.damage * met.mul;
    if (met.hit.kind === 'enemy') damageEnemy(game, met.hit.enemy, damage);
    else if (met.hit.kind === 'target') {
      // a blow, like a shot, only quiets a pillbox's muzzle; a charge is the one way to break it (SB-2015)
      if (met.hit.target.kind === 'pillbox') suppressPillboxBy(game, met.hit.target.id);
      else damageTarget(game, met.hit.target, damage);
    } else if (met.hit.kind === 'mine') damageMine(game, met.hit.mine, damage, true);
    else {
      const box = game.propRefs.indexOf(met.hit.prop);
      if (box >= 0) damageProp(game, box, damage);
    }
  }
  beginLunge(game.melee, game.mech.yaw, met !== null);
}

// Takes `damage` off the mech's armour and reports it with the way it came from, (toX, toZ) being the direction on the
// ground from the mech toward the source (any length); at 0 the mech is downed, once.
function damageMech(game: GameModel, damage: number, toX: number, toZ: number): void {
  if (game.downed) return;
  // A cutscene holds the mech still, so nothing hurts it while one plays (the shot still stops at it).
  if (game.script.cutscene !== null) return;
  game.armor = Math.max(0, game.armor - damage);
  const flat = Math.hypot(toX, toZ);
  game.events.push({
    kind: 'damaged',
    amount: damage,
    fromX: flat < 1e-9 ? 0 : toX / flat,
    fromZ: flat < 1e-9 ? 0 : toZ / flat,
  });
  if (game.armor > 0) return;
  game.downed = true;
  game.events.push({ kind: 'downed' });
}

// Takes `damage` off the mine's health; at 0 it goes off. `punched` is a blow's damage: the fist's own blast leaves the
// mech out of it.
function damageMine(game: GameModel, mine: MineState, damage: number, punched = false): void {
  mine.hp = Math.max(0, mine.hp - damage);
  if (mine.hp > 0) return;
  blowUp(game, mine, punched);
}

// Takes the mine off the ground and blows it up: a mech inside MINE_TUNE.blastRadius takes MINE_TUNE.damage. A punched
// mine's blast is reported without the mech, so its shake and sound still play but the fist's own blast cannot hurt it.
function blowUp(game: GameModel, mine: MineState, punched = false): void {
  game.mines.splice(game.mines.indexOf(mine), 1);
  const hit = !punched && inCircle(mine, MINE_TUNE.blastRadius, game.mech);
  game.events.push({ kind: 'mineBlast', x: mine.x, y: blastFaceHeight(game.rects, mine.x, mine.z), z: mine.z, hit });
  if (hit) damageMech(game, MINE_TUNE.damage, mine.x - game.mech.x, mine.z - game.mech.z);
}

// Moves every bullet in flight on by `dt` and drops the ones that stopped or ran out of range.
function stepBullets(game: GameModel, dt: number): void {
  game.bullets = game.bullets.filter(bullet => !flyBullet(game, bullet, dt));
}

// The place in game.rects of the rect the prop box at boxIndex wraps. propBoxes holds one box per prop rect, or a
// stack of them for a ramp, in the same order as the rects, so the boxes are counted along until boxIndex falls in one.
function rectIndexOfBox(game: GameModel, boxIndex: number): number {
  let seen = 0;
  for (let i = 0; i < game.rects.length; i++) {
    seen += rectBoxes(game.rects[i]).length;
    if (boxIndex < seen) return i;
  }
  return -1;
}

// Takes `damage` off the prop at `boxIndex` when it can break. At 0 the prop leaves rects, propBoxes and propRefs at that
// same place, in place, so the mech's path opens without a new array (step hands game.rects to stepMech as it is) and the
// frame reports it. A prop with no health left never comes back.
function damageProp(game: GameModel, boxIndex: number, damage: number): void {
  const prop = game.propRefs[boxIndex];
  const breakable = game.breakables.find(state => state.prop === prop);
  if (!breakable) return;
  breakable.hp = Math.max(0, breakable.hp - damage);
  if (breakable.hp > 0) return;
  const rectIndex = rectIndexOfBox(game, boxIndex);
  for (let i = game.propRefs.length - 1; i >= 0; i--) {
    if (game.propRefs[i] !== prop) continue;
    game.propBoxes.splice(i, 1);
    game.propRefs.splice(i, 1);
  }
  if (rectIndex >= 0) game.rects.splice(rectIndex, 1);
  const place = game.map.props[prop];
  game.events.push({ kind: 'propDestroyed', prop, x: place.x, z: place.z });
}

// Opens the hole a blast makes in its line: takes every hedgehog blastPropIndexes names out of rects, propBoxes and
// propRefs. The boxes are taken out from the highest number down, because each splice moves the ones after it; the rect
// each box belongs to is found first, the same way damageProp does (a ramp's stack makes the two numbers differ), and the
// rects are taken out from the highest number down too. The map itself is not touched: it stays the closed line.
function openBlastHole(game: GameModel, blast: BlastState): void {
  const props = new Set(blastPropIndexes(game.map, blast));
  if (props.size === 0) return;
  breakProps(game, props);
}

// Takes the named props' blockers out of rects, propBoxes and propRefs, the boxes from the highest number down and each
// rect after them. The map is unchanged: it still says where the prop stood.
function breakProps(game: GameModel, props: ReadonlySet<number>): void {
  const boxes: number[] = [];
  for (let i = 0; i < game.propRefs.length; i++) if (props.has(game.propRefs[i])) boxes.push(i);
  if (boxes.length === 0) return;
  const rects = [...new Set(boxes.map(box => rectIndexOfBox(game, box)))].filter(index => index >= 0);
  for (let i = boxes.length - 1; i >= 0; i--) {
    game.propBoxes.splice(boxes[i], 1);
    game.propRefs.splice(boxes[i], 1);
  }
  rects.sort((a, b) => b - a);
  for (const index of rects) game.rects.splice(index, 1);
}

// The fortress's footprint (SB-1860): the walls and the land door this charge brings down, and the sea gate's seaward
// face, past which the mech is out. `FORT_LAND_Z` is the land wall's outer face.
const FORT_HALF_W = FORTRESS_TUNE.outerW / 2 + 1; // the walls' outer faces and a metre (m)
const FORT_SEA_Z = FORTRESS_TUNE.seaWallZ - FORTRESS_TUNE.wallT / 2; // the sea wall's landward face (m)
const FORT_LAND_Z = FORTRESS_TUNE.landWallZ - FORTRESS_TUNE.wallT / 2; // the land wall's outer face (m)
const FORT_GATE_Z = FORTRESS_TUNE.seaWallZ + FORTRESS_TUNE.wallT / 2; // the sea gate's seaward face (m)

// Whether the mech is outside the fortress's box: past the sea gate, past the land wall or round the side walls. A mech
// that stayed inside takes the blast; one that ran out the sea gate is spared (SB-1860's decision).
function outsideFortress(mech: { x: number; z: number }): boolean {
  if (mech.z > FORT_GATE_Z || mech.z < FORT_LAND_Z) return true;
  return Math.abs(mech.x) > FORTRESS_TUNE.outerW / 2;
}

// What the charge in the land wall does (SB-1860): every `collapse` prop of the fortress's box comes down, the wall's
// machine-gun nest is destroyed, a mech still inside takes FORT_BLAST_TUNE.damage and the script hears `fortressDown`.
// The nest is broken first and `fortressDown` sent last, and the script is told even when the nest was already down.
export function fortressBlast(game: GameModel, blast: BlastState): void {
  const already = new Set(game.brokenProps);
  const props: number[] = [];
  game.map.props.forEach((prop, index) => {
    if (prop.collapse !== true || already.has(index)) return;
    if (Math.abs(prop.x) > FORT_HALF_W || prop.z > FORT_SEA_Z || prop.z < FORT_LAND_Z) return;
    props.push(index);
  });
  if (props.length > 0) {
    game.brokenProps.push(...props);
    breakProps(game, new Set(props));
  }
  const gun = game.targets.find(target => target.id === 'fortress-gun' && target.hp > 0);
  if (gun) damageTarget(game, gun, gun.hp);
  if (!outsideFortress(game.mech)) {
    damageMech(game, FORT_BLAST_TUNE.damage, blast.x - game.mech.x, blast.z - game.mech.z);
  }
  sendToScript(game, { kind: 'fortressDown' });
}

// A new sortie on `map` with the script `mission`: the mech on the landing craft's deck at the middle of the front edge,
// facing the land, every target at its health, and the script at its start. `battleTune` thins the battle layer (the arena
// asks for the beach's own tune with its allies, shells and planes off); the sortie's is the default. `sectors` false
// leaves the sector rules off (the arena walks its infantry only), keeping the hold at the water's edge.
export function newGame(
  map: MapDef,
  mission: MissionDef = M1,
  options: { battleTune?: FxTune; sectors?: boolean } = {},
): GameModel {
  const battleTune = options.battleTune ?? PLAY_BATTLE_TUNE;
  const sectors = options.sectors === false ? null : newSectors();
  const trickle = sectors === null ? null : newTrickle(M1_SECTORS.length);
  const mech = newMech();
  mech.x = (map.bounds.minX + map.bounds.maxX) / 2;
  mech.z = craftZ(map.bounds) + LANDING_TUNE.startDepth;
  // The deck's height: at 0 the deck's box would push the mech out over the sea.
  mech.y = CRAFT_TUNE.deckTop;
  mech.yaw = 0;
  const rects = [...mapBlockers(map), ...craftRects(map.bounds), ...allyCraftRects(map.bounds)];
  // mapBlockers puts the props first and the targets after; blockingPropIndexes gives the prop for each of those rects.
  const propRects = blockingPropIndexes(map);
  const propBoxes: Aabb[] = [];
  const propRefs: number[] = [];
  propRects.forEach((prop, i) => {
    for (const box of rectBoxes(rects[i])) {
      propBoxes.push(box);
      propRefs.push(prop);
    }
  });
  return {
    time: 0,
    map,
    mission,
    script: newScript(mission),
    battle: newBattle(stream('crowd'), map.bounds, battleTune, SECTOR_TUNE.startHoldZ, map.spawns[M1_NEST_WAVE] ?? []),
    sectors,
    trickle,
    battleTune,
    radio: null,
    radioQueue: [],
    mech,
    armor: MECH_TUNE.armor,
    downed: false,
    rects,
    propBoxes,
    propRefs,
    breakables: propRefs
      .filter(index => map.props[index].breakable === true)
      .map(index => ({ prop: index, hp: PROP_HP[map.props[index].kind] })),
    targets: map.targets.map(place => ({
      id: place.id,
      kind: place.kind,
      hp: TARGET_HP[place.kind],
      box: targetBox(place),
      yaw: place.yaw,
    })),
    pillboxes: map.targets.filter(place => place.kind === 'pillbox').map(place => newPillbox(place.id)),
    pillboxHint: false,
    enemies: [],
    nav: newNav(),
    main: newWeapon(M1_LOADOUT.main),
    sub: newWeapon(M1_LOADOUT.sub),
    melee: newMelee(),
    fcs: newFcs(),
    aimTarget: null,
    bullets: [],
    barrages: [],
    aimed: null,
    shells: [],
    shutters: newShutters(map.targets.map(place => place.id)),
    battery: newBattery(map.targets),
    fortressGun: newFortressGun(),
    mines: (map.mines ?? []).map(place => ({ x: place.x, z: place.z, hp: MINE_TUNE.hp })),
    blasts: newBlasts(map),
    charges: [],
    plant: null,
    brokenProps: [],
    allies: [],
    slow: null,
    calm: null,
    cover: null,
    assist: null,
    events: [],
    cleared: false,
    checkpoint: null,
    retries: 0,
  };
}

// Hands one input to the script and keeps its events. Names the mission does not have are not sent: scriptInput throws
// on them, and a map may hold a target the script does not know. Tests and checkWaves' `cleared` use this entry.
export function sendToScript(game: GameModel, input: ScriptInput): void {
  if (input.kind === 'destroyed' && !game.mission.targets.includes(input.target)) return;
  if (input.kind === 'cleared' && !game.mission.waves.includes(input.wave)) return;
  if (input.kind === 'enter' && !(input.area in game.mission.areas)) return;
  applyScriptOut(game, scriptInput(game.script, game.mission, input));
}

// Puts a wave's enemies out, one at each of the map's spawn points for the wave: the i-th place gets the i-th kind in
// M1_WAVE_ENEMY. A wave the table does not name, a wave the map has no place for, or a list whose length does not match
// the places puts out nothing, so a half-written table cannot put out a wrong mix. `dormant` puts them out asleep and
// held until a script's `wake` (the machine-gun nests are on the field from the start).
function spawnWave(game: GameModel, wave: string, dormant = false): void {
  const kinds = M1_WAVE_ENEMY[wave];
  const places = game.map.spawns[wave];
  if (kinds === undefined || places === undefined || places.length === 0 || kinds.length !== places.length) return;
  const y = M1_WAVE_DROP[wave] ?? 0;
  let count = 0;
  places.forEach((place, i) => {
    const enemy = newEnemy(`${wave}-${i + 1}`, wave, kinds[i], place.x, place.z, y, dormant);
    // the defenders of a sector stand on the posts of their own (SB-2015); the other waves walk
    const post = defenderPostOf(wave, i);
    if (post !== undefined) holdAt(enemy, post);
    game.enemies.push(enemy);
    count++;
  });
  game.events.push({ kind: 'spawned', wave, count });
}

// Wakes the enemies a script's `wake` names: every living one of a wave, or one by id. A fallen enemy stays down.
function wakeEnemies(game: GameModel, event: Extract<ScriptOut, { kind: 'wake' }>): void {
  for (const enemy of game.enemies) {
    if (enemy.hp <= 0) continue;
    const named = 'wave' in event ? enemy.wave === event.wave : enemy.id === event.enemy;
    if (!named) continue;
    enemy.awake = true;
    enemy.dormant = false;
  }
}

// The allies' support fire (SB-2020): every living nest of the wave holds its next burst for `sec` seconds, so a window
// opens for the charge at line 2's near point. The nest stays awake and keeps its health; the burst starts afresh when
// the seconds run out. `wait` and `burstLeft` are already in the enemy and the saves, so no new field is kept.
function silenceNests(game: GameModel, event: Extract<ScriptOut, { kind: 'suppress' }>): void {
  for (const enemy of game.enemies) {
    if (enemy.hp <= 0 || enemy.wave !== event.wave) continue;
    const burst = ENEMIES[enemy.kind].burst;
    if (burst === undefined) continue;
    enemy.wait = Math.max(enemy.wait, Math.max(0, event.sec));
    enemy.burstLeft = burst.shots;
  }
  game.cover = { wave: event.wave, left: Math.max(0, event.sec), wait: 0, next: 0, warned: false };
}

// The support fire's picture (SB-2024), run each frame while a window is open: a `coverFire` event for one living nest in
// turn every COVER_TUNE.fireEvery seconds (from the nearest ally in range, else from out at sea), and the radio line
// that the rounds run short a little before the window closes. Nothing here touches the nests: their quiet is the seconds
// `silenceNests` set.
function stepCover(game: GameModel, dt: number): void {
  const cover = game.cover;
  if (cover === null) return;
  // the hole is open: the window is over, so no more tracers and no "rounds run short" over a gap that is already there
  if (game.script.flags.includes(LINE2_FLAG)) {
    game.cover = null;
    return;
  }
  cover.left -= dt;
  if (cover.left <= 1e-9) {
    game.cover = null;
    return;
  }
  if (!cover.warned && cover.left <= COVER_TUNE.warnBefore) {
    cover.warned = true;
    queueRadio(game, COVER_TUNE.endLine, 0, COVER_TUNE.endCallout);
  }
  cover.wait -= dt;
  if (cover.wait > 0) return;
  cover.wait = COVER_TUNE.fireEvery;
  // only the nests ahead of the mech get a tracer; the ones it has passed are out of the picture
  const nests = game.enemies.filter(enemy => enemy.hp > 0 && enemy.wave === cover.wave && enemy.z <= game.mech.z);
  if (nests.length === 0) return;
  const nest = nests[cover.next % nests.length];
  cover.next += 1;
  const def = ENEMIES[nest.kind];
  const to = { x: nest.x, y: nest.y + def.height * COVER_TUNE.hitHeight, z: nest.z };
  let from = {
    x: nest.x + ((cover.next % COVER_TUNE.seaLanes) - (COVER_TUNE.seaLanes - 1) / 2) * COVER_TUNE.seaSpread,
    y: COVER_TUNE.fromHeight,
    z: nest.z + COVER_TUNE.seaDist,
  };
  let best = COVER_TUNE.allyRange;
  for (const ally of game.allies) {
    if (ally.down) continue;
    const dist = distXZ(ally, nest);
    if (dist >= best) continue;
    best = dist;
    from = { x: ally.x, y: ally.y + COVER_TUNE.fromHeight, z: ally.z };
  }
  game.events.push({ kind: 'coverFire', enemy: nest.id, ...from, tx: to.x, ty: to.y, tz: to.z });
}

// Starts the barrage a wave names in M1_WAVE_BARRAGE, once; a wave that is not there starts none.
function startBarrage(game: GameModel, wave: string): void {
  const kind = M1_WAVE_BARRAGE[wave];
  if (kind === undefined || game.barrages.some(barrage => barrage.wave === wave)) return;
  game.barrages.push(newBarrage(wave, kind));
}

// Starts the aimed mortar a wave names in M1_WAVE_AIMED, once; a wave that is not there, or a mortar already started,
// does nothing.
function startAimed(game: GameModel, wave: string): void {
  if (!M1_WAVE_AIMED.includes(wave) || game.aimed !== null) return;
  game.aimed = newAimed(game.mech);
}

// Sends `cleared` to the script for each wave whose enemies are all down. Once a wave is cleared the script remembers
// it, so it is not sent again.
function checkWaves(game: GameModel): void {
  for (const wave of new Set(game.enemies.map(enemy => enemy.wave))) {
    if (game.script.cleared.includes(wave)) continue;
    if (game.enemies.some(enemy => enemy.wave === wave && enemy.hp > 0)) continue;
    sendToScript(game, { kind: 'cleared', wave });
  }
}

// Puts out the ally a script's `ally` event names, on the way and with the fate the mission writes down.
function spawnAlly(game: GameModel, event: Extract<ScriptOut, { kind: 'ally' }>): void {
  const way = game.mission.paths[event.path];
  if (way === undefined) throw new Error(`no path "${event.path}" in the mission`);
  let fate: AllyFate | null = null;
  if (event.fate) {
    const place = game.mission.places[event.fate.at];
    if (place === undefined) throw new Error(`no place "${event.fate.at}" in the mission`);
    fate = { place, by: event.fate.by, call: event.fate.call ?? null };
  }
  game.allies.push(newAlly(event.id, way, fate));
}

// Sends an ally already out along the next way the mission names. An ally the script moved before it came out is left
// alone: the mission writes the `ally` action before its `allyMove` in the same cue.
function moveAllyTo(game: GameModel, event: Extract<ScriptOut, { kind: 'allyMove' }>): void {
  const way = game.mission.paths[event.path];
  if (way === undefined) throw new Error(`no path "${event.path}" in the mission`);
  const ally = game.allies.find(entry => entry.id === event.id);
  if (ally !== undefined) moveAlly(ally, way);
}

// Puts one radio line behind the one on screen; its time is stamped when `stepRadio` brings it up. `delay` holds it off
// the band for that many game seconds (a milestone's cheer comes a moment after the blast). When the queue is full the
// newest line is dropped: dropping the oldest would leave the lines behind the one on screen waiting longer.
// `callout` is the language key of a short order that shows near the aim while the line is up (SB-2028).
export function queueRadio(game: GameModel, line: string, delay = 0, callout?: string): void {
  if (game.radioQueue.length >= RADIO_TUNE.maxPending) return;
  const entry: GameModel['radioQueue'][number] = { line };
  if (delay > 0) entry.at = game.time + delay;
  if (callout !== undefined) entry.callout = callout;
  game.radioQueue.push(entry);
}

// Moves the radio band on: the next line comes up when the one on screen has had RADIO_TUNE.minSec (s), one line a
// frame at most, so a line that came with another still gets its time on screen. A line with `at` in the future keeps
// the band as it is until its time; the queue stays in order. `time` is when it came up.
// A cutscene hides the HUD, so while one plays nothing comes up and the line on screen keeps its age: `time` moves on
// with `dt` (game.time has already), so the line gets its RADIO_TUNE.minSec of the HUD, not of the sortie's clock.
export function stepRadio(game: GameModel, dt: number): void {
  const shown = game.radio;
  if (game.script.cutscene !== null) {
    if (shown !== null) shown.time += dt;
    return;
  }
  if (shown !== null && game.time - shown.time < RADIO_TUNE.minSec) return;
  const next = game.radioQueue[0];
  if (next === undefined) {
    game.radio = null;
    return;
  }
  if (next.at !== undefined && game.time < next.at) return;
  game.radioQueue.shift();
  game.radio =
    next.callout === undefined
      ? { line: next.line, time: game.time }
      : { line: next.line, time: game.time, callout: next.callout };
}

// The cover point nearest an enemy, for its fall back to the next line.
function nearestCover(enemy: GroundSpot, at: readonly GroundSpot[]): GroundSpot {
  let best = at[0];
  let bestDist = Infinity;
  for (const point of at) {
    const dist = distXZ(enemy, point);
    if (dist >= bestDist) continue;
    best = point;
    bestDist = dist;
  }
  return { ...best };
}

// The defenders a milestone breaks: line 1's and line 2's falls send their own posts back, the first bunker's fall
// sends only the posts around that bunker, and the second's sends the whole pillbox line back (SB-2015, SB-2020). Each
// runs to the next line's post and holds there in turn; a post with no `next` is the last line.
function routeDefenders(game: GameModel, id: string): void {
  for (const enemy of game.enemies) {
    if (enemy.hp <= 0 || enemy.post === null) continue;
    const post = DEFENDER_POSTS[enemy.post];
    const runs =
      id === 'breach'
        ? post.line === 'line1'
        : id === 'breach2'
          ? post.line === 'line2'
          : id === 'bunker1'
            ? post.line === 'pillbox' && post.firstRout
            : id === 'bunker' && post.line === 'pillbox';
    if (!runs || post.next === null) continue;
    const next = DEFENDER_POSTS[post.next];
    enemy.fallback = { x: next.x, z: next.z };
    enemy.fallbackPost = post.next;
    enemy.fallbackHold = PAYOFF_TUNE.retreatHold;
    enemy.holdOut = false;
  }
}

// Carries out a milestone's knock (SB-2010): the short slowdown, the enemy mortar's lull and the fall back of every
// walking enemy in the sector. A nest stays and fires: it is fixed, so it does not run. The first bunker only gets the
// smaller, shorter knock. The posted defenders of the sector run to the next line's cover (SB-2015).
function applyPayoff(game: GameModel, id: string): void {
  if (!Object.keys(PAYOFFS).includes(id)) return;
  const first = id === 'bunker1';
  game.slow = {
    left: first ? PAYOFF_TUNE.firstSlowSec : PAYOFF_TUNE.slowSec,
    scale: first ? PAYOFF_TUNE.firstSlowScale : PAYOFF_TUNE.slowScale,
  };
  game.calm = id === 'bunker1' ? null : { left: PAYOFF_TUNE.calmSec, mul: PAYOFF_TUNE.calmMul };
  routeDefenders(game, id);
  const fallback = PAYOFFS[id as keyof typeof PAYOFFS].fallback;
  if (fallback === null) return;
  for (const enemy of game.enemies) {
    if (enemy.hp <= 0 || enemy.post !== null || ENEMIES[enemy.kind].static === true) continue;
    if (enemy.z <= fallback.lineZ) continue;
    enemy.fallback = nearestCover(enemy, fallback.at);
    enemy.fallbackHold = PAYOFF_TUNE.retreatHold;
  }
}

// Where a milestone happened, for its sound and its view: the blast that opened the line or the target that fell. A cue
// that has neither (a dev view's) tells it at the mech.
function payoffSpot(game: GameModel, id: string): { x: number; z: number } {
  const def = PAYOFFS[id as keyof typeof PAYOFFS];
  const blasts = def.blasts ?? [];
  for (let i = game.events.length - 1; i >= 0; i--) {
    const event = game.events[i];
    if (event.kind === 'blast' && blasts.includes(event.id)) return { x: event.x, z: event.z };
    if (event.kind === 'destroyed') {
      const target = game.targets.find(entry => entry.id === event.id);
      if (target) {
        return { x: (target.box.minX + target.box.maxX) / 2, z: (target.box.minZ + target.box.maxZ) / 2 };
      }
    }
  }
  return { x: game.mech.x, z: game.mech.z };
}

// Keeps every event the script reported. The game itself takes six: a radio line (the lines queue up, one on screen), a
// wave to put out and start the barrage of (`spawn`), an ally to put out (`ally`), an ally's fire on a wave
// (`suppress`), a milestone's knock (`payoff`) and the end (the sortie is cleared).
function applyScriptOut(game: GameModel, outs: readonly ScriptOut[]): void {
  let checkpoint: string | null = null;
  for (const event of outs) {
    game.events.push({ kind: 'script', event });
    if (event.kind === 'radio') queueRadio(game, event.line, event.delay ?? 0, event.callout);
    if (event.kind === 'spawn') {
      spawnWave(game, event.wave, event.dormant === true);
      startBarrage(game, event.wave);
      startAimed(game, event.wave);
      if (event.wave === BATTERY_WAVE) game.battery.on = true;
    }
    if (event.kind === 'wake') wakeEnemies(game, event);
    if (event.kind === 'suppress') silenceNests(game, event);
    if (event.kind === 'ally') spawnAlly(game, event);
    if (event.kind === 'allyMove') moveAllyTo(game, event);
    if (event.kind === 'payoff') {
      applyPayoff(game, event.id);
      const at = payoffSpot(game, event.id);
      game.events.push({ kind: 'payoff', id: event.id, x: at.x, z: at.z });
    }
    if (event.kind === 'assist') {
      // the interval the first shot waits for: the shorter one once the depot is down. stepAssist reads the flag again
      // after each shot, so a depot that goes down later shortens the waits from the next shot on, not this one
      const every = game.script.flags.includes('depot-down') ? YARD_TUNE.assistEveryDepot : YARD_TUNE.assistEvery;
      game.assist = newAssist(event.waves);
      game.assist.left = every;
    }
    if (event.kind === 'allyFall') {
      // a fall the script calls for (SB-1820): the ally is already out, so it falls where it stands, as stepAllies does it
      const ally = game.allies.find(entry => entry.id === event.id);
      if (ally !== undefined && !ally.down) {
        ally.down = true;
        game.events.push({ kind: 'allyDown', id: ally.id, x: ally.x, z: ally.z, by: event.by });
      }
    }
    if (event.kind === 'end' && !game.cleared) {
      game.cleared = true;
      game.events.push({ kind: 'cleared' });
    }
    if (event.kind === 'checkpoint') checkpoint = event.id;
  }
  // The copy is taken once all of the frame's events are applied, so the wave a checkpoint's cue sends out is in it. A
  // cutscene the cue set is not kept: coming back from the checkpoint must not play it again (SB-1860's cp3).
  if (checkpoint !== null) {
    game.checkpoint = snapshotOf(game, checkpoint);
    if (game.checkpoint.script.cutscene !== null) game.checkpoint.script.cutscene = null;
  }
}

// A deep copy of the game for the checkpoint `id`. The fields that are not kept are taken out by name, so a field added
// to GameModel is copied unless it is added to the list.
function snapshotOf(game: GameModel, id: string): GameSnapshot {
  const {
    events: _events,
    bullets: _bullets,
    shells: _shells,
    nav: _nav,
    checkpoint: _checkpoint,
    battle: _battle,
    battleTune: _battleTune,
    map,
    mission,
    ...kept
  } = game;
  const snapshot = { ...structuredClone(kept), map, mission, id };
  // A target's rect may have run ahead of the health in a test or an old save; the checkpoint keeps the wreck's height.
  lowerBrokenTargetRects(snapshot);
  return snapshot;
}

// The sortie again from the last checkpoint: the checkpoint's game with the armour full, both weapons loaded, the aim
// assist fresh and the enemies, targets, props, mines, barrages, the aimed mortar and script as the checkpoint kept them
// (no wave is sent out again; a shell warned but not landed is gone). The
// checkpoint is copied again, so the new game's changes do not reach it, and it stays for the next time.
export function retryFromCheckpoint(game: GameModel): GameModel {
  const checkpoint = game.checkpoint;
  if (checkpoint === null) throw new Error('no checkpoint to retry from');
  const { id, map, mission, ...rest } = checkpoint;
  const hold = sectorHold(rest.sectors);
  const next: GameModel = {
    ...structuredClone(rest),
    map,
    mission,
    battle: newBattle(stream('crowd'), map.bounds, game.battleTune, hold.holdZ, map.spawns[M1_NEST_WAVE] ?? []),
    battleTune: game.battleTune,
    armor: MECH_TUNE.armor,
    downed: false,
    // the weapons the checkpoint had, loaded full again
    main: newWeapon(rest.main.id),
    sub: newWeapon(rest.sub.id),
    // the fist is ready at once: the wait a retry was taken over does not carry into the new sortie
    melee: newMelee(),
    fcs: newFcs(),
    aimTarget: null,
    bullets: [],
    shells: [],
    nav: newNav(),
    events: [{ kind: 'retried', from: id }],
    cleared: false,
    checkpoint,
    retries: game.retries + 1,
  };
  // The bullets in flight are gone, so a warning, a burst or a suppression under way is dropped too; the wait stays as
  // the checkpoint kept it, and the next warning comes after it.
  next.cover = null;
  // the mid boss goes back to the head of its phase, as its shots and shells in flight are gone
  for (const enemy of next.enemies) if (enemy.warden) restartWarden(enemy.warden);
  next.pillboxes = next.pillboxes.map(pillbox => ({ ...pillbox, warn: 0, shots: 0, shotWait: 0, suppress: 0 }));
  // An old checkpoint kept a broken target's rect at the wall's height; the ground matches the low wreck once the
  // sortie is back.
  lowerBrokenTargetRects(next);
  return next;
}

// The sortie again from the start.
export function restartGame(game: GameModel): GameModel {
  const next = newGame(game.map, game.mission, { battleTune: game.battleTune, sectors: game.sectors !== null });
  next.retries = game.retries + 1;
  next.events.push({ kind: 'retried', from: null });
  return next;
}

// Whether the point is inside the area's rectangle on the ground.
function inArea(area: Area, x: number, z: number): boolean {
  return Math.abs(x - area.x) <= area.w / 2 && Math.abs(z - area.z) <= area.d / 2;
}

// Moves every enemy on by `dt`; the shots they fire become bullets. A cutscene holds them where they stand, as it holds the
// pillboxes and the allies: the seawall's drop comes out in the same frame as the wave 2 cutscene, and walking and shooting
// through it would put the reinforcements somewhere else by the time the camera comes back.
function stepEnemies(game: GameModel, dt: number): void {
  if (game.script.cutscene !== null) return;
  // a standing target blocks an enemy's line as a prop does
  const blockers = [...game.propBoxes, ...game.targets.filter(target => target.hp > 0).map(target => target.box)];
  const mech = game.mech;
  // a nest never walks, so the nav is made only while an enemy that does walk is alive
  const alive = game.enemies.some(enemy => enemy.hp > 0 && ENEMIES[enemy.kind].speed > 0);
  // the way round the walls is made only while there is an enemy to use it
  const nav = alive ? stepNav(game.nav, game.rects, game.map.bounds, NAV_RADIUS, mech, dt) : null;
  const world = { rects: game.rects, propBoxes: blockers, bounds: game.map.bounds, nav, others: game.enemies };
  let addWave = false;
  for (const enemy of game.enemies) {
    // the mid boss runs its own phases rather than the walk, stop and shoot of stepEnemy
    if (enemy.kind === 'warden') {
      if (enemy.warden === undefined) throw new Error(`the warden ${enemy.id} has no state`);
      const out = stepWarden(enemy.warden, enemy, game.mech, world, dt, stream('enemies'));
      for (const shot of out.shots) {
        game.bullets.push({ enemy: enemy.kind, ...shot, left: ENEMIES.warden.fireRange });
      }
      for (const shell of out.shells) {
        game.shells.push(shell);
        game.events.push({ kind: 'shellWarn', x: shell.x, z: shell.z, radius: shell.radius });
      }
      if (out.ram) ramMech(game, enemy, out.ram.dx, out.ram.dz);
      if (out.addWave) addWave = true;
      if (out.down) game.events.push({ kind: 'wardenDown', id: enemy.id, x: enemy.x, z: enemy.z });
      continue;
    }
    // a fallen enemy only marks the time since it fell: the trickle's bodies are taken out after a while (SB-2230)
    if (enemy.hp <= 0) {
      enemy.fallenT += dt;
      continue;
    }
    // the nests draw from a stream of their own, so their bursts do not shift the walkers' spread
    const rng = ENEMIES[enemy.kind].burst ? stream('emplacements') : stream('enemies');
    const shot: EnemyShot | null = stepEnemy(enemy, game.mech, world, dt, rng);
    if (!shot) continue;
    game.bullets.push({ enemy: enemy.kind, ...shot, left: ENEMIES[enemy.kind].fireRange });
  }
  if (addWave) spawnWave(game, 'warden-adds');
}

// The mid boss's charge strikes the mech (SB-1850): the ram takes `charge.damage` off its armour and pushes it `charge.push`
// m aside, to the side of the run it stands on, out of the way of the rest of the run and kept out of the walls.
function ramMech(game: GameModel, enemy: EnemyState, dx: number, dz: number): void {
  damageMech(game, WARDEN_TUNE.charge.damage, -dx, -dz);
  if (game.script.cutscene !== null) return;
  const side = -dz * (game.mech.x - enemy.x) + dx * (game.mech.z - enemy.z) < 0 ? -1 : 1;
  const pushed = pushOutCircle(
    game.mech.x - dz * side * WARDEN_TUNE.charge.push,
    game.mech.z + dx * side * WARDEN_TUNE.charge.push,
    MECH_TUNE.radius,
    game.rects,
  );
  game.mech.x = pushed.x;
  game.mech.z = pushed.z;
}

// Counts every pillbox still standing down by `dt`; one that sees the mech warns and then fires a burst, and the shots
// become bullets. A cutscene holds the pillboxes still, as it holds the barrages and the allies: nothing counts.
function stepPillboxes(game: GameModel, dt: number): void {
  if (game.script.cutscene !== null) return;
  for (const target of game.targets) {
    if (target.kind !== 'pillbox' || target.hp <= 0) continue;
    const state = game.pillboxes.find(pillbox => pillbox.id === target.id);
    if (!state) continue;
    // the line is stopped by a prop or by another standing target; stepPillbox adds the pillbox's own box
    const blockers = [
      ...game.propBoxes,
      ...game.targets.filter(other => other.hp > 0 && other.id !== target.id).map(other => other.box),
    ];
    const { warnAt, shot } = stepPillbox(state, target.box, target.yaw, game.mech, blockers, dt, stream('pillboxes'));
    if (warnAt) game.events.push({ kind: 'pillboxWarn', target: target.id, ...warnAt });
    if (shot) game.bullets.push({ pillbox: target.id, ...shot, left: PILLBOX_TUNE.range });
  }
}

// Counts every main gun still standing down by `dt` once the battery is on; the shots they fire become bullets. A cutscene
// holds the guns too, as it holds the pillboxes: nothing counts while the mech cannot move.
function stepBattery(game: GameModel, dt: number): void {
  if (!game.battery.on || game.script.cutscene !== null) return;
  for (const gun of game.battery.guns) {
    const place = game.targets.find(target => target.id === gun.id);
    if (!place || place.hp <= 0) continue;
    // the line is stopped by a prop or by another standing target; the gun's own box is left out
    const blockers = [
      ...game.propBoxes,
      ...game.targets.filter(target => target.hp > 0 && target.id !== gun.id).map(target => target.box),
    ];
    const shot = stepGun(gun, place.box, game.mech, blockers, dt, stream('battery'));
    if (!shot) continue;
    game.bullets.push({ gun: gun.id, ...shot, left: GUN_TUNE.range });
  }
}

// Runs the fortress's heavy machine-gun nest while its target stands; the shots it fires become FortressBullets. The
// line is stopped by a prop or by another standing target; the nest's own box is left out (its muzzle is past it).
function stepFortressGunNest(game: GameModel, dt: number): void {
  // asleep until the script's flag stands (SB-2045); a nest broken before then stays silent, the flag or not
  if (!game.script.flags.includes(FORTRESS_GUN_FLAG)) return;
  const target = game.targets.find(item => item.kind === 'fortressGun' && item.hp > 0);
  if (!target) return;
  const blockers = [
    ...game.propBoxes,
    ...game.targets.filter(other => other.hp > 0 && other.id !== target.id).map(other => other.box),
  ];
  const shot = stepFortressGun(game.fortressGun, target.box, game.mech, blockers, dt, stream('battery'));
  if (!shot) return;
  game.bullets.push({ fort: target.id, ...shot, left: FORTRESS_GUN_TUNE.range });
}

// Runs the hazards by `dt`: each barrage may warn of a shell, the aimed mortar warns of one on the place the mech has
// stayed at, each shell counts down and one that lands hurts a mech inside its blast, and a mine the mech stands on goes
// off.
function stepHazards(game: GameModel, dt: number): void {
  // A cutscene holds the mech still, so no barrage counts down or warns of a shell while one plays; the shells already
  // warned of still land. The landing craft holds it too: the beach's mortar does not drop shells on the boat until the
  // mech has walked down the ramp. The barrage starts counting again when the mech leaves the craft.
  const held = game.script.cutscene !== null || game.mech.z > game.map.bounds.maxZ;
  // A milestone's lull (SB-2010) eases the enemy mortar for a few seconds: its interval is multiplied, as the depot's
  // flag does. The counter runs on the game's clock, so a pause holds it.
  const calm = game.calm;
  const calmMul = calm === null ? 1 : calm.mul;
  if (calm !== null) {
    calm.left -= dt;
    if (calm.left <= 1e-9) game.calm = null;
  }
  for (const barrage of held ? [] : game.barrages) {
    // a barrage the script's flag slows (the depot's loss) comes that many times as seldom; the milestone only eases the
    // enemy mortar, not the battery's guns
    const slow = BARRAGES[barrage.kind].slow;
    let mul = slow !== undefined && game.script.flags.includes(slow.flag) ? slow.mul : 1;
    if (barrage.kind === 'mortar') mul *= calmMul;
    const shell = stepBarrage(barrage, game.mech, dt, stream('mortar'), mul);
    if (!shell) continue;
    game.shells.push(shell);
    game.events.push({ kind: 'shellWarn', x: shell.x, z: shell.z, radius: shell.radius });
  }
  // The aimed mortar counts the stay as the barrage counts its interval: nothing while a cutscene holds the mech. The
  // lull slows it the same way.
  if (!held && game.aimed !== null) {
    const shell = stepAimed(game.aimed, game.mech, dt / calmMul);
    if (shell) {
      game.shells.push(shell);
      game.events.push({ kind: 'shellWarn', x: shell.x, z: shell.z, radius: shell.radius });
    }
  }
  for (const shell of stepShells(game.shells, dt)) {
    const hit = inCircle(shell, shell.radius, game.mech);
    const y = blastFaceHeight(game.rects, shell.x, shell.z);
    game.events.push({ kind: 'shellLand', x: shell.x, y, z: shell.z, hit });
    if (hit) damageMech(game, shell.damage, shell.x - game.mech.x, shell.z - game.mech.z);
  }
  for (const mine of [...game.mines]) if (mineStepped(mine, game.mech)) blowUp(game, mine);
}

// Runs every ally on by `dt`; one that reaches its fate's place falls there. A cutscene holds them where they stand, as it
// holds the barrages: the landing puts them aboard the crafts beside the player's, and they should run once the mech can.
// Their feet follow the ground under them (the deck, a ramp up the seawall), and an ally that steps off a drop falls at
// ALLY_TUNE.fallSpeed rather than dropping in one frame. They step off their ramps the moment the landing hands over the
// controls (SB-1967), not when the player's mech leaves its craft; the mech still walks down its own ramp by the player's
// hand. The feet are set even while they are held, so the five are drawn standing on their decks through the landing.
function stepAllies(game: GameModel, dt: number): void {
  const running = game.script.cutscene === null;
  for (const ally of game.allies) {
    const fell = running ? stepAlly(ally, dt, game.mech) : false;
    const ground = groundAt(ally.x, ally.z, ALLY_TUNE.groundRadius, game.rects, ALLY_TUNE.maxGround);
    if (ground > ally.y) ally.y = ground;
    else ally.y = Math.max(ground, ally.y - ALLY_TUNE.fallSpeed * dt);
    if (!running) continue;
    const fate = ally.fate;
    if (fate === null) continue;
    // The call comes a few seconds before the fate's place, so it is out before the ally falls, never after.
    if (!ally.called && fate.call !== null && distXZ(ally, fate.place) <= ALLY_TUNE.callLead * ALLY_TUNE.speed) {
      ally.called = true;
      queueRadio(game, fate.call);
      game.events.push({ kind: 'allyCall', id: ally.id, line: fate.call });
    }
    if (fell) game.events.push({ kind: 'allyDown', id: ally.id, x: ally.x, z: ally.z, by: fate.by });
  }
}

// The script's assist (SB-1840): the cover mechs at the sea gate shoot one enemy of the waves the script names every
// interval, the shorter one once the depot is down. It only takes that enemy's health to 0 (no hit box, no change to the
// enemies' aim), and reports the tracer before the `enemyDown` of the same frame, so the view draws the shot first.
function stepAssist(game: GameModel, dt: number): void {
  if (game.assist === null) return;
  // a cutscene holds the allies where they stand, so the assist waits with them
  if (game.script.cutscene !== null) return;
  const every = game.script.flags.includes('depot-down') ? YARD_TUNE.assistEveryDepot : YARD_TUNE.assistEvery;
  const shot = stepAssistState(game.assist, game.enemies, YARD_TUNE.gate, every, dt);
  if (shot === null) return;
  const enemy = game.enemies.find(entry => entry.id === shot.id);
  if (enemy === undefined) return;
  game.events.push({ kind: 'assistFire', fromX: YARD_TUNE.gate.x, fromZ: YARD_TUNE.gate.z, toX: shot.x, toZ: shot.z });
  damageEnemy(game, enemy, enemy.hp);
}

// How near the mech an aim point is too close to turn toward (m): a point under its feet would spin it every frame.
const AIM_MIN_DIST = 0.9;

// The yaw that faces from the mech toward `aim` (0 faces -z), or undefined with no point or one too near to turn toward.
function faceTo(mech: { x: number; z: number }, aim: { x: number; z: number } | undefined): number | undefined {
  if (aim === undefined || distXZ(mech, aim) < AIM_MIN_DIST) return undefined;
  return Math.atan2(-(aim.x - mech.x), -(aim.z - mech.z));
}

// The chest's level aim toward the point, or along the mech's yaw when there is no point or it is too near to turn
// toward.
function levelAim(
  mech: { x: number; z: number; yaw: number },
  chest: { x: number; y: number; z: number },
  aim: { x: number; z: number } | undefined,
): Ray3 {
  let dx = -Math.sin(mech.yaw);
  let dz = -Math.cos(mech.yaw);
  if (aim !== undefined && distXZ(mech, aim) >= AIM_MIN_DIST) {
    const length = Math.hypot(aim.x - chest.x, aim.z - chest.z);
    if (length > 1e-9) {
      dx = (aim.x - chest.x) / length;
      dz = (aim.z - chest.z) / length;
    }
  }
  return { ox: chest.x, oy: chest.y, oz: chest.z, dx, dy: 0, dz };
}

// A frame's input: the mech's own input, the sub weapon's trigger (the main uses the mech's fire), the aim line,
// the point on the ground the player points at, the use key (planting a charge; left out where there is none, so the old
// test inputs need no change) and the fist.
export interface GameInput extends MechInput {
  sub: boolean;
  // The aim line: the third-person camera's line through the middle of the screen for the dev views. The main body and
  // the arena pass none and aim with `aimAt`, or with only a movement frame (`frame`) while a touch screen's right drag is
  // off; with neither, the line is level from the chest along the mech's yaw.
  aim?: Ray3;
  // The point the player points at, on the mech's feet plane (world, m): the mech turns toward it and the aim line is
  // level from the chest to it.
  aimAt?: { x: number; z: number };
  use?: boolean;
  melee?: boolean;
}

// No key, no stick, no trigger: what the mech gets while a cutscene plays.
const IDLE_INPUT: GameInput = {
  moveX: 0,
  moveZ: 0,
  turn: 0,
  jump: false,
  jumpHeld: false,
  boost: false,
  fire: false,
  sub: false,
};

// The share of time the world keeps this frame: the milestone's short slowdown, or 1. The app scales its drawing by it
// too, so the blast and the battle read in slow motion as well; the input still goes through.
export function timeScale(game: GameModel): number {
  return game.slow === null ? 1 : game.slow.scale;
}

// One frame: the mech moves, the soft FCS picks the target or enemy in the aim circle, each weapon fires as often as its
// interval allows while its trigger is held, the fist strikes when its wait allows and lunges, each enemy wakes, walks
// and shoots, and every bullet in flight (the new
// ones too) moves on, stopping at a prop, a target, an enemy, a mine, the mech or the ground; the hazards run next
// (stepHazards); a broken target goes to the script, and so does a wave whose enemies are all down. The mech then
// enters any area it stands in, and the script's time moves on; what the script reports is kept as this frame's events. The main weapon fires first. Once the sortie is cleared
// (the closing cutscene may still be playing: it goes on to its end) or the mech is downed, the game's own frame does
// nothing, but the battle layer still moves (see stepBattleLayer). A milestone's slowdown (SB-2010) scales the whole
// frame by `slow.scale`; its clock counts real seconds, so it ends after `slow.left` seconds have gone by whatever the
// game's own clock says.
export function step(game: GameModel, given: GameInput, dt: number): void {
  game.events = [];
  if ((game.cleared && game.script.cutscene === null) || game.downed) {
    stepBattleLayer(game, dt * timeScale(game));
    return;
  }
  stepFrame(game, given, dt);
  stepBattleLayer(game, dt * timeScale(game));
}

// Moves the battle layer by one frame after the game's own frame (or instead of it while the sortie is downed or cleared),
// in the order the view used to: the game's own shells and mines take the soldiers near them, the sectors move the
// waiting line and send the wave a cleared one brings (not while a cutscene holds the battle or the mech is downed), and
// then the battle steps (the landing's cutscene holds it still). The fallen, the shell and the sector events become this
// frame's events for the view to draw. The state is the game's, so a test can read it.
function stepBattleLayer(game: GameModel, dt: number): void {
  const tune = game.battleTune;
  // A shell of the game's own (a mortar round or a mine) takes the infantry near it, as the battle's own shells do.
  for (const event of [...game.events]) {
    if (event.kind !== 'shellLand' && event.kind !== 'mineBlast') continue;
    const fell = fallNear(
      game.battle.crowd,
      event.x,
      event.z,
      tune.shellFallRadius,
      tune.shellFallShare,
      stream('crowd'),
    );
    for (const soldier of fell) game.events.push({ kind: 'battleFell', x: soldier.x, z: soldier.z });
  }
  const cutscene = game.script.cutscene;
  if (cutscene !== null && CUTSCENES[cutscene.id]?.holdsBattle === true) return;
  if (game.sectors !== null) {
    if (!game.downed) {
      for (const event of stepSectors(game.sectors, game, dt)) {
        game.events.push(event);
        if (event.kind === 'sectorCleared') {
          const sector = M1_SECTORS.find(entry => entry.id === event.sector);
          if (sector !== undefined) {
            game.battle.crowd.holdZ = sector.holdZ;
            game.battle.crowd.holdT = 0;
            if (game.battle.crowd.bounds !== null && SECTOR_TUNE.surge > 0) {
              spawnCrowd(game.battle.crowd, stream('crowd'), game.battle.crowd.bounds, SECTOR_TUNE.surge, tune);
            }
          }
          queueRadio(game, 'm1.sector-cleared');
        } else if (event.kind === 'sectorSecured') {
          queueRadio(game, 'm1.sector-secured');
        } else if (event.kind === 'sectorCounter') {
          queueRadio(game, 'm1.sector-counter');
        } else if (event.kind === 'sectorSpawn') {
          spawnSectorCounter(game, event);
        } else {
          queueRadio(game, event.weak ? 'm1.sector-weak' : 'm1.sector-stable');
        }
      }
      if (game.trickle !== null) {
        const spawn = stepTrickle(
          game.trickle,
          {
            mech: game.mech,
            enemies: game.enemies,
            targets: game.targets,
            rects: game.rects,
            bounds: game.map.bounds,
            sectors: game.sectors,
            paused: game.script.cutscene !== null || game.cleared,
          },
          stream('trickle'),
          dt,
        );
        if (spawn !== null) spawnTrickle(game, spawn.x, spawn.z);
        clearFallenTrickle(game);
      }
    }
    const hold = sectorHold(game.sectors);
    if (game.battle.crowd.holdZ !== hold.holdZ) {
      game.battle.crowd.holdZ = hold.holdZ;
      game.battle.crowd.holdT = 0;
    }
    // While the infantry waits, a wave that is wiped out entirely is made up from behind, so the line is not left empty
    // before it is secured (SB-2210). One wave a frame: the wave just put out has its soldiers alive.
    if (
      hold.held &&
      SECTOR_TUNE.refill > 0 &&
      game.battle.crowd.bounds !== null &&
      game.battle.crowd.soldiers.every(soldier => !soldier.alive)
    ) {
      spawnCrowd(game.battle.crowd, stream('crowd'), game.battle.crowd.bounds, SECTOR_TUNE.refill, tune);
      game.battle.crowd.holdT = 0;
    }
  }
  const hold = sectorHold(game.sectors);
  const frame = stepBattle(game.battle, stream('crowd'), dt, tune, game.mech, hold.held);
  for (const soldier of frame.fell) game.events.push({ kind: 'battleFell', x: soldier.x, z: soldier.z });
  if (frame.shell !== null) {
    game.events.push({ kind: 'battleShell', x: frame.shell.x, z: frame.shell.z, shake: frame.shell.shake });
  }
}

// Puts out one enemy of a sector's counterattack (SB-2220): the sectors choose the point, the game makes the enemy as
// a wave's own are made, awake from the start, and remembers its id so the sector knows when they are all down. The
// wave's name is outside the mission's, so the script's `cleared` never waits on it.
function spawnSectorCounter(game: GameModel, event: Extract<GameEvent, { kind: 'sectorSpawn' }>): void {
  if (game.sectors === null) return;
  const index = M1_SECTORS.findIndex(sector => sector.id === event.sector);
  if (index < 0) return;
  const wave = `counter-${event.sector}`;
  const id = `${wave}-${game.sectors.counterIds[index].length + 1}`;
  const enemy = newEnemy(id, wave, SECTOR_TUNE.counterKind, event.x, event.z);
  enemy.awake = true;
  game.enemies.push(enemy);
  game.sectors.counterIds[index].push(id);
}

// Puts out one enemy of the trickle (SB-2230): the trickle chose the point and spent its sector's budget, the game makes
// the enemy awake and names it by how many the trickle has put out so far, so the names do not collide.
function spawnTrickle(game: GameModel, x: number, z: number): void {
  if (game.trickle === null) return;
  const count = game.trickle.spent.reduce((sum, spent) => sum + spent, 0);
  const enemy = newEnemy(`${TRICKLE_WAVE}-${count}`, TRICKLE_WAVE, TRICKLE_TUNE.kind, x, z);
  enemy.awake = true;
  game.enemies.push(enemy);
}

// Takes the fallen of the trickle out of the list once their bodies have shown for fallenKeep seconds, so a long sortie
// does not keep growing it. Only the trickle's own fallen are taken: the script's enemies stay for its `cleared`.
function clearFallenTrickle(game: GameModel): void {
  const keep = TRICKLE_TUNE.fallenKeep;
  const gone = (enemy: EnemyState) => enemy.wave === TRICKLE_WAVE && enemy.hp <= 0 && enemy.fallenT >= keep;
  if (!game.enemies.some(gone)) return;
  game.enemies = game.enemies.filter(enemy => !gone(enemy));
}

// The game's own frame, without the battle layer.
function stepFrame(game: GameModel, given: GameInput, dt: number): void {
  const slow = game.slow;
  const span = slow === null ? dt : dt * slow.scale;
  if (slow !== null) {
    slow.left -= dt;
    if (slow.left <= 1e-9) game.slow = null;
  }
  // while a cutscene plays the mech holds still and holds its fire; the aim line still passes through
  const input = game.script.cutscene === null ? given : { ...IDLE_INPUT, aim: given.aim };
  // Use plants a charge: while it is held the mech does not shoot, so a charge and a shot cannot be asked for together.
  const use = input.use === true && game.script.cutscene === null;
  // A point the player aims at turns the mech toward it (a face already given wins), and the held input keeps it too.
  const face = input.face ?? faceTo(game.mech, input.aimAt);
  const faced = face === undefined ? input : { ...input, face };
  const held = use ? { ...faced, fire: false, sub: false, melee: false } : faced;
  game.time += span;
  const moveTune = moveTuneOf(M1_MECH);
  const radius = MECH_TUNE.radius;
  // stepMech keeps the mech a radius inside the map's bounds. The landing craft's lane is the one way past the front
  // edge, so while the mech stands in it the bound reaches back to the craft's stern.
  const stepBounds = inCraftLane(game.mech.x, game.map.bounds)
    ? { ...game.map.bounds, maxZ: craftBack(game.map.bounds) }
    : game.map.bounds;
  const events = stepMech(game.mech, held, span, moveTune, 0, {
    rects: game.rects,
    radius,
    bounds: stepBounds,
  });
  // The fist counts its wait down every frame. A held key swings again as soon as the wait is over, so the interval is the
  // same whether the key is tapped or held. The blow lands on the swing's own frame (stepMeleeBlow), not when the key went
  // down, so the damage and the arm cannot drift apart; the lunge starts on that same frame. All of it runs on the
  // milestone's own span, so the fist keeps time with the enemies and the shots. The lunge moves the mech before the map's
  // edge is applied to it.
  game.melee.wait = Math.max(0, game.melee.wait - span);
  if (held.melee === true && game.melee.wait <= 0 && game.melee.blow === null) beginMelee(game.melee);
  if (stepMeleeBlow(game.melee, span)) meleeStrike(game);
  const over = game.mech.grounded ? game.mech.y + moveTune.stepHeight : game.mech.y;
  stepMeleeLunge(game.melee, game.mech, span, game.rects, radius, over);
  // The mech stays inside the map: the mech is kept a radius in from every side, and a speed that pushed it out stops.
  // The lane is read again from the mech's x after the step and the lunge, so a mech that left it sideways this frame
  // goes back to the front edge.
  const bounds = inCraftLane(game.mech.x, game.map.bounds)
    ? { ...game.map.bounds, maxZ: craftBack(game.map.bounds) }
    : game.map.bounds;
  const minX = bounds.minX + radius;
  const maxX = bounds.maxX - radius;
  const minZ = bounds.minZ + radius;
  const maxZ = bounds.maxZ - radius;
  if (game.mech.x < minX) {
    game.mech.x = minX;
    if (game.mech.vx < 0) game.mech.vx = 0;
  } else if (game.mech.x > maxX) {
    game.mech.x = maxX;
    if (game.mech.vx > 0) game.mech.vx = 0;
  }
  if (game.mech.z < minZ) {
    game.mech.z = minZ;
    if (game.mech.vz < 0) game.mech.vz = 0;
  } else if (game.mech.z > maxZ) {
    game.mech.z = maxZ;
    if (game.mech.vz > 0) game.mech.vz = 0;
  }
  for (const event of events) game.events.push({ kind: 'mech', event });
  // The face comes from the mech before the step and this line from the chest after it, so a fast move shifts the aim by
  // one frame.
  const chest = { x: game.mech.x, y: game.mech.y + MECH_TUNE.chestHeight, z: game.mech.z };
  const aim: Ray3 = input.aim ?? levelAim(game.mech, chest, input.aimAt);
  // The aim line stops at the first prop, standing target, live enemy or the ground; a shot goes there from the muzzle.
  const world: FcsWorld = {
    boxes: [
      ...game.propBoxes,
      ...game.targets.filter(target => target.hp > 0).map(target => target.box),
      ...game.enemies.filter(enemy => enemy.hp > 0).map(enemyBox),
    ],
    groundY: 0,
  };
  // A top-down input (the main body and the arena, on a PC or a touch screen) passes a movement frame or an aim point and
  // gets the wider, level values. An input with neither (bots, tests, the dev views) keeps the third-person soft values.
  const fcsTune = input.frame === undefined && input.aimAt === undefined ? FCS_TUNE.soft : FCS_QUARTER;
  const fcs = stepFcs(game.fcs, 'soft', fcsTune, aim, muzzleOf(game.mech), fcsTargets(game, chest), span, world);
  game.aimTarget = fcs.candidateId === null ? null : fcsName(game, fcs.candidateId);
  const mainShots = stepWeapon(game.main, held.fire, span);
  const subShots = stepWeapon(game.sub, held.sub, span);
  for (let i = 0; i < mainShots; i++) shoot(game, game.main.id, fcs.shotDir, fcs.shotDist, fcsTune);
  for (let i = 0; i < subShots; i++) shoot(game, game.sub.id, fcs.shotDir, fcs.shotDist, fcsTune);
  stepEnemies(game, span);
  stepPillboxes(game, span);
  stepBattery(game, span);
  stepFortressGunNest(game, span);
  stepBullets(game, span);
  stepHazards(game, span);
  const charge = stepCharge(game, use, span);
  game.plant = charge.plant;
  if (charge.planted) {
    const { id, x, z } = charge.planted;
    game.events.push({ kind: 'planted', id, x, z });
  }
  // A cutscene holds the fuses still: the fortress one counts its 20 s only while the player has the controls.
  for (const blown of game.script.cutscene === null ? stepBlasts(game, span) : []) {
    const blast = blown.blast;
    if (blast.blasted) continue;
    openBlastHole(game, blast);
    blast.blasted = true;
    game.events.push({ kind: 'blast', id: blast.id, x: blast.x, z: blast.z, hit: blown.hit });
    // the script may wait for a line's hole: a mission that runs an `allyMove` on the blast hears it now, before the
    // frame's allies step, so the allies that waited by the line start through it in this same frame
    sendToScript(game, { kind: 'blast', id: blast.id });
    // The fortress's charge is its own blast (SB-1860): it brings the walls down and tells the script so, and it does
    // not take the line charge's 9 m hit and 60 damage.
    if (blast.id === 'fort-bomb') {
      fortressBlast(game, blast);
      continue;
    }
    // A point that names a target breaks it (a pillbox's point, SB-1540). The charge sits outside the armour, so the
    // shot's shares are not taken off it, and a target already down is not reported again.
    const targetId = blastTarget(game.map, blast.id);
    const target = targetId === undefined ? undefined : game.targets.find(entry => entry.id === targetId);
    if (target && target.hp > 0) damageTarget(game, target, PILLBOX_BLAST.damage);
    if (blown.hit) damageMech(game, CHARGE_TUNE.damage, blast.x - game.mech.x, blast.z - game.mech.z);
  }
  // The mech has walked down the ramp: the script puts the beach's allies out now, and they start running this frame.
  if (!game.script.ashore && game.mech.z <= game.map.bounds.maxZ) sendToScript(game, { kind: 'ashore' });
  stepAllies(game, span);
  stepAssist(game, span);
  checkShutters(game);
  checkWaves(game);
  for (const [id, area] of Object.entries(game.mission.areas)) {
    if (game.script.entered.includes(id)) continue;
    if (inArea(area, game.mech.x, game.mech.z)) sendToScript(game, { kind: 'enter', area: id });
  }
  // The mid boss blew (SB-1850): the land wall's magazine is open to a charge. One `wardenDown` event becomes one input.
  if (game.events.some(event => event.kind === 'wardenDown')) sendToScript(game, { kind: 'wardenDown' });
  applyScriptOut(game, stepScript(game.script, game.mission, span));
  stepCover(game, span);
  stepRadio(game, span);
}
