// The game's state and the entry for updating it by one frame: the mech and its armour, the map, the targets' health,
// the props that break, the enemies, the weapons, the shots in flight, the mission script and the frame's events.
// Nothing here reads three or the DOM, so a test runs it in node without a page. The mech's shot is a bullet that flies
// at its weapon's speed (data/weapons.ts) from the mech's chest toward the camera's aim, drawn toward a target or an
// enemy in the aim circle by the soft FCS (fcs.ts) and spread a little by a random draw. It stops at the first prop it
// meets, at the first target or living enemy along its path or at the ground, whichever is nearest, and vanishes at its
// range; a breakable prop takes the damage and breaks at 0. An enemy's shot (logic/enemies.ts) flies at its kind's
// speed and stops at a prop, at the mech or at the ground; the mech's armour takes its damage, and at 0 the mech is
// downed and the game stops. The script's `spawn` puts a wave's enemies out (the wave's kind is in M1_WAVE_ENEMY), starts
// the wave's barrage (M1_WAVE_BARRAGE; logic/hazards.ts) and, when the last of the enemies falls, `cleared` goes back
// through sendToScript. A barrage warns of a shell while the mech is in reach and the shell lands later; a mine blows up
// when the mech steps on it or the mech's shot breaks it, and both take armour from a mech inside the blast. The boss
// (SB-200, logic/battery.ts): once the `battery` wave is out, each main gun still standing shoots the mech with a machine
// gun, and the magazine takes no harm while its shutter is shut, until both main guns are down. An `ally` (a friend,
// logic/allies.ts) runs its way with no hit box and falls at the place its fate names (SB-170).
import { ENEMIES, ENEMY_KINDS, M1_WAVE_DROP, M1_WAVE_ENEMY, type EnemyKind } from '../data/enemies.ts';
import { BATTERY_WAVE, GUN_TUNE } from '../data/battery.ts';
import { BARRAGES, M1_WAVE_BARRAGE, MINE_TUNE } from '../data/hazards.ts';
import { M1_MECH } from '../data/mech.ts';
import { M1 } from '../data/missions/m1.ts';
import { PROP_HP, TARGET_HP, TARGET_SIZE } from '../data/props.ts';
import { FCS_TUNE, MECH_TUNE, PLAY_TUNE } from '../data/tune.ts';
import type { Area, MapDef, MissionDef, TargetKind, TargetPlace } from '../data/types.ts';
import { M1_LOADOUT, WEAPONS, type WeaponId } from '../data/weapons.ts';
import { rectBox, rectBoxes, type GroundRect } from './collide.ts';
import {
  newBattery,
  newShutters,
  openShutters,
  shuttered,
  stepGun,
  type BatteryState,
  type ShutterState,
} from './battery.ts';
import { newAlly, stepAlly, type AllyFate, type AllyState } from './allies.ts';
import { newEnemy, stepEnemy, type EnemyShot, type EnemyState } from './enemies.ts';
import { newNav, stepNav, type NavState } from './nav.ts';
import {
  newFcs,
  spreadDir,
  stepFcs,
  type Dir3,
  type FcsState,
  type FcsTarget,
  type FcsWorld,
  type Ray3,
} from './fcs.ts';
import { fireRayHit, type Aabb } from './fire.ts';
import {
  inCircle,
  mineStepped,
  newBarrage,
  stepBarrage,
  stepShells,
  type BarrageState,
  type MineState,
  type ShellState,
} from './hazards.ts';
import { blockingPropIndexes, mapBlockers } from './mapShapes.ts';
import { newMech, stepMech, type MechEvent, type MechInput, type MechState } from './mech.ts';
import { moveTuneOf } from './mechTune.ts';
import { stream } from './rng.ts';
import { newScript, scriptInput, stepScript, type ScriptInput, type ScriptOut, type ScriptState } from './script.ts';
import { newWeapon, stepWeapon, type WeaponState } from './weapons.ts';

// The radius the enemies' cells are blocked for (m): the widest enemy's, so what one can walk through they all can.
const NAV_RADIUS = Math.max(...ENEMY_KINDS.map(kind => ENEMIES[kind].radius));

export interface TargetState {
  id: string;
  kind: TargetKind;
  hp: number; // the health left
  box: Aabb; // the box a shot may hit
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
    }
  | { kind: 'destroyed'; id: string }
  | { kind: 'shutterOpen'; target: string } // the shutter before this target opened
  | { kind: 'spawned'; wave: string; count: number } // a wave's enemies were put out
  | { kind: 'enemyDown'; id: string; x: number; z: number } // an enemy's health reached 0
  | { kind: 'damaged'; amount: number; fromX: number; fromZ: number } // the mech took `amount`; (fromX, fromZ) is the unit direction on the ground from the mech toward where the bullet came from
  | { kind: 'downed' } // the armour reached 0
  | { kind: 'propDestroyed'; prop: number; x: number; z: number }
  | { kind: 'shellWarn'; x: number; z: number; radius: number } // a shell will land here
  | { kind: 'shellLand'; x: number; z: number; hit: boolean } // a shell landed; `hit` is whether the mech was inside the blast
  | { kind: 'mineBlast'; x: number; z: number; hit: boolean } // a mine blew up; `hit` is whether the mech was inside the blast
  | { kind: 'allyDown'; id: string; x: number; z: number; by: string } // an ally fell where it stood; `by` is how (the script's fate)
  | { kind: 'script'; event: ScriptOut } // what the mission script reported, wrapped as it came
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

export type Bullet = MechBullet | EnemyBullet | BatteryBullet;

export function isEnemyBullet(bullet: Bullet): bullet is EnemyBullet {
  return 'enemy' in bullet;
}

export function isBatteryBullet(bullet: Bullet): bullet is BatteryBullet {
  return 'gun' in bullet;
}

// Whether the bullet is fired at the mech: an enemy's or the battery's.
export function isHostileBullet(bullet: Bullet): bullet is EnemyBullet | BatteryBullet {
  return !('weapon' in bullet);
}

// How fast a bullet flies and what it does, from the table of the weapon, the enemy or the gun that fired it.
function bulletSpec(bullet: Bullet): { speed: number; damage: number } {
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
// `mission` are definitions nothing writes to, so the copy points at the same ones.
export type GameSnapshot = Omit<GameModel, 'events' | 'bullets' | 'shells' | 'nav' | 'checkpoint'> & { id: string };

export interface GameModel {
  time: number; // seconds since the sortie began
  map: MapDef;
  mission: MissionDef; // the script's write-up (data/missions/m1.ts)
  script: ScriptState; // the mission script's own state; the objective, marks and the rest are read from here
  radio: { line: string; time: number } | null; // the last radio line's key and when it came; null before one
  mech: MechState;
  armor: number; // the mech's armour left (MECH_TUNE.armor at the start)
  downed: boolean; // set when the armour reaches 0; step does nothing after
  rects: GroundRect[]; // the map's blockers (mapBlockers)
  propBoxes: Aabb[]; // the props' boxes, which stop a shot; a ramp is a stack that follows its slope
  propRefs: number[]; // the prop's place in map.props for each propBoxes entry
  breakables: BreakableState[]; // the breakable blocking props, with their health
  targets: TargetState[];
  enemies: EnemyState[]; // every enemy put out, the fallen too (hp 0: they do not move, shoot or take a hit)
  nav: NavState; // the cells and counts the enemies find their way by; made again from rects, so a copy leaves it out
  main: WeaponState; // the main weapon's ammo and wait
  sub: WeaponState; // the sub weapon's ammo and wait
  fcs: FcsState; // the aim assist's state (the soft kind)
  aimTarget: string | null; // the id of the target or enemy the soft FCS pulls the aim toward, or null
  bullets: Bullet[]; // the shots in flight
  barrages: BarrageState[]; // the barrages that have started; none stops
  shells: ShellState[]; // the shells warned and not yet landed
  shutters: ShutterState[]; // the armour plates before the targets that have one, shut or open
  battery: BatteryState; // the main guns' machine guns
  mines: MineState[]; // the mines still on the ground
  allies: AllyState[]; // the allies the script has put out, the fallen too (down: they do not move); no hit box
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

// The box a shot may hit: TARGET_SIZE's w and d turned by the target's yaw, with y from the ground to its height.
export function targetBox(place: TargetPlace): Aabb {
  const size = TARGET_SIZE[place.kind];
  return rectBox({
    x: place.x,
    z: place.z,
    halfW: size.w / 2,
    halfD: size.d / 2,
    yaw: place.yaw,
    top: size.h,
  });
}

// The FCS's view of the targets and then the enemies: the id is the place in game.targets, or past them in
// game.enemies; the centre is the middle of the box. One the chest cannot see (a prop or a standing target in the way)
// counts as not alive, so the soft lock never pulls toward an enemy behind a pillbox's wall.
function fcsTargets(game: GameModel, chest: { x: number; y: number; z: number }): FcsTarget[] {
  const things = [
    ...game.targets.map(target => ({ box: target.box, alive: target.hp > 0 })),
    ...game.enemies.map(enemy => ({ box: enemyBox(enemy), alive: enemy.hp > 0 })),
  ];
  // What hides one from the chest: the props and the standing targets (a pillbox's wall hides the enemy behind it).
  const walls = [...game.propBoxes, ...game.targets.filter(target => target.hp > 0).map(target => target.box)];
  return things.map(({ box, alive }, id) => {
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    const cz = (box.minZ + box.maxZ) / 2;
    return { id, box, cx, cy, cz, alive: alive && inSight(chest, cx, cy, cz, box, walls) };
  });
}

// Whether the line from the chest to (cx, cy, cz) meets none of `walls` before it enters `own` (the thing's own box,
// which is left out of the walls: a target's centre is inside its own box).
function inSight(
  chest: { x: number; y: number; z: number },
  cx: number,
  cy: number,
  cz: number,
  own: Aabb,
  walls: readonly Aabb[],
): boolean {
  const dx = cx - chest.x;
  const dy = cy - chest.y;
  const dz = cz - chest.z;
  const length = Math.hypot(dx, dy, dz);
  const reach = fireRayHit(chest.x, chest.y, chest.z, dx, dy, dz, length, [own])?.dist ?? length;
  const others = walls.filter(wall => wall !== own);
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

// One shot from the muzzle toward `dir`, spread by a random draw: a bullet with `weapon`'s range to fly.
function shoot(game: GameModel, weapon: WeaponId, dir: Dir3): void {
  const def = WEAPONS[weapon];
  const { x, y, z } = muzzleOf(game.mech);
  const aimed = spreadDir(dir, FCS_TUNE.soft.spread, stream('shots'));
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
  game.events.push({
    kind: 'hit',
    x,
    y,
    z,
    weapon: hostile ? null : bullet.weapon,
    target: target ? target.id : null,
    prop: propBox >= 0 ? game.propRefs[propBox] : null,
    enemy: enemy ? enemy.id : null,
    mech: asMech,
  });
  if (asMech) damageMech(game, damage, -bullet.dx, -bullet.dz);
  // an enemy's bullet does not break a prop
  if (!hostile && propBox >= 0) damageProp(game, propBox, damage);
  if (enemy) damageEnemy(game, enemy, damage);
  if (mine) damageMine(game, mine, damage);
  if (!target) return true;
  // a target behind a shut shutter stops the bullet and takes no harm
  if (shuttered(game.shutters, target.id)) return true;
  target.hp = Math.max(0, target.hp - damage);
  if (target.hp > 0) return true;
  game.events.push({ kind: 'destroyed', id: target.id });
  checkShutters(game);
  sendToScript(game, { kind: 'destroyed', target: target.id });
  return true;
}

// Opens every shutter whose targets are all down and reports each one. Also called every frame, so a target whose health
// was taken some other way opens its shutter too.
function checkShutters(game: GameModel): void {
  const hpOf = (id: string): number => game.targets.find(target => target.id === id)?.hp ?? 0;
  for (const target of openShutters(game.shutters, hpOf)) game.events.push({ kind: 'shutterOpen', target });
}

// Takes `damage` off the enemy; at 0 it falls (it stays in game.enemies).
function damageEnemy(game: GameModel, enemy: EnemyState, damage: number): void {
  enemy.hp = Math.max(0, enemy.hp - damage);
  if (enemy.hp > 0) return;
  game.events.push({ kind: 'enemyDown', id: enemy.id, x: enemy.x, z: enemy.z });
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

// Takes `damage` off the mine's health; at 0 it goes off.
function damageMine(game: GameModel, mine: MineState, damage: number): void {
  mine.hp = Math.max(0, mine.hp - damage);
  if (mine.hp > 0) return;
  blowUp(game, mine);
}

// Takes the mine off the ground and blows it up: a mech inside MINE_TUNE.blastRadius takes MINE_TUNE.damage.
function blowUp(game: GameModel, mine: MineState): void {
  game.mines.splice(game.mines.indexOf(mine), 1);
  const hit = inCircle(mine, MINE_TUNE.blastRadius, game.mech);
  game.events.push({ kind: 'mineBlast', x: mine.x, z: mine.z, hit });
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

// A new sortie on `map` with the script `mission`: the mech at the middle of the front edge, facing the land, every
// target at its health, and the script at its start.
export function newGame(map: MapDef, mission: MissionDef = M1): GameModel {
  const mech = newMech();
  mech.x = (map.bounds.minX + map.bounds.maxX) / 2;
  mech.z = map.bounds.maxZ - PLAY_TUNE.startMargin;
  mech.yaw = 0;
  const rects = mapBlockers(map);
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
    radio: null,
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
    })),
    enemies: [],
    nav: newNav(),
    main: newWeapon(M1_LOADOUT.main),
    sub: newWeapon(M1_LOADOUT.sub),
    fcs: newFcs(),
    aimTarget: null,
    bullets: [],
    barrages: [],
    shells: [],
    shutters: newShutters(map.targets.map(place => place.id)),
    battery: newBattery(map.targets),
    mines: (map.mines ?? []).map(place => ({ x: place.x, z: place.z, hp: MINE_TUNE.hp })),
    allies: [],
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

// Puts a wave's enemies out, one at each of the map's spawn points for the wave. A wave that M1_WAVE_ENEMY does not
// name, or that the map has no place for, puts out nothing.
function spawnWave(game: GameModel, wave: string): void {
  const kind = M1_WAVE_ENEMY[wave];
  const places = game.map.spawns[wave];
  if (kind === undefined || places === undefined || places.length === 0) return;
  const y = M1_WAVE_DROP[wave] ?? 0;
  places.forEach((place, i) => game.enemies.push(newEnemy(`${wave}-${i + 1}`, wave, kind, place.x, place.z, y)));
  game.events.push({ kind: 'spawned', wave, count: places.length });
}

// Starts the barrage a wave names in M1_WAVE_BARRAGE, once; a wave that is not there starts none.
function startBarrage(game: GameModel, wave: string): void {
  const kind = M1_WAVE_BARRAGE[wave];
  if (kind === undefined || game.barrages.some(barrage => barrage.wave === wave)) return;
  game.barrages.push(newBarrage(wave, kind));
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
    fate = { place, by: event.fate.by };
  }
  game.allies.push(newAlly(event.id, way, fate));
}

// Keeps every event the script reported. The game itself takes four: a radio line (the last one stays up), a wave to
// put out and start the barrage of (`spawn`), an ally to put out (`ally`) and the end (the sortie is cleared).
function applyScriptOut(game: GameModel, outs: readonly ScriptOut[]): void {
  let checkpoint: string | null = null;
  for (const event of outs) {
    game.events.push({ kind: 'script', event });
    if (event.kind === 'radio') game.radio = { line: event.line, time: game.time };
    if (event.kind === 'spawn') {
      spawnWave(game, event.wave);
      startBarrage(game, event.wave);
      if (event.wave === BATTERY_WAVE) game.battery.on = true;
    }
    if (event.kind === 'ally') spawnAlly(game, event);
    if (event.kind === 'end' && !game.cleared) {
      game.cleared = true;
      game.events.push({ kind: 'cleared' });
    }
    if (event.kind === 'checkpoint') checkpoint = event.id;
  }
  // The copy is taken once all of the frame's events are applied, so the wave a checkpoint's cue sends out is in it
  if (checkpoint !== null) game.checkpoint = snapshotOf(game, checkpoint);
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
    map,
    mission,
    ...kept
  } = game;
  return { ...structuredClone(kept), map, mission, id };
}

// The sortie again from the last checkpoint: the checkpoint's game with the armour full, both weapons loaded, the aim
// assist fresh and the enemies, targets, props, mines, barrages and script as the checkpoint kept them (no wave is sent
// out again; a shell warned but not landed is gone). The
// checkpoint is copied again, so the new game's changes do not reach it, and it stays for the next time.
export function retryFromCheckpoint(game: GameModel): GameModel {
  const checkpoint = game.checkpoint;
  if (checkpoint === null) throw new Error('no checkpoint to retry from');
  const { id, map, mission, ...rest } = checkpoint;
  return {
    ...structuredClone(rest),
    map,
    mission,
    armor: MECH_TUNE.armor,
    downed: false,
    // the weapons the checkpoint had, loaded full again
    main: newWeapon(rest.main.id),
    sub: newWeapon(rest.sub.id),
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
}

// The sortie again from the start.
export function restartGame(game: GameModel): GameModel {
  const next = newGame(game.map, game.mission);
  next.retries = game.retries + 1;
  next.events.push({ kind: 'retried', from: null });
  return next;
}

// Whether the point is inside the area's rectangle on the ground.
function inArea(area: Area, x: number, z: number): boolean {
  return Math.abs(x - area.x) <= area.w / 2 && Math.abs(z - area.z) <= area.d / 2;
}

// Moves every enemy on by `dt`; the shots they fire become bullets.
function stepEnemies(game: GameModel, dt: number): void {
  // a standing target blocks an enemy's line as a prop does
  const blockers = [...game.propBoxes, ...game.targets.filter(target => target.hp > 0).map(target => target.box)];
  const mech = game.mech;
  const alive = game.enemies.some(enemy => enemy.hp > 0);
  // the way round the walls is made only while there is an enemy to use it
  const nav = alive ? stepNav(game.nav, game.rects, game.map.bounds, NAV_RADIUS, mech, dt) : null;
  const world = { rects: game.rects, propBoxes: blockers, bounds: game.map.bounds, nav, others: game.enemies };
  for (const enemy of game.enemies) {
    const shot: EnemyShot | null = stepEnemy(enemy, game.mech, world, dt, stream('enemies'));
    if (!shot) continue;
    game.bullets.push({ enemy: enemy.kind, ...shot, left: ENEMIES[enemy.kind].fireRange });
  }
}

// Counts every main gun still standing down by `dt` once the battery is on; the shots they fire become bullets.
function stepBattery(game: GameModel, dt: number): void {
  if (!game.battery.on) return;
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

// Runs the hazards by `dt`: each barrage may warn of a shell, each shell counts down and one that lands hurts a mech inside
// its blast, and a mine the mech stands on goes off.
function stepHazards(game: GameModel, dt: number): void {
  // A cutscene holds the mech still, so no barrage counts down or warns of a shell while one plays; the shells already
  // warned of still land. The barrage starts counting again when the cutscene ends or is skipped.
  const held = game.script.cutscene !== null;
  for (const barrage of held ? [] : game.barrages) {
    // a barrage the script's flag slows (the depot's loss) comes that many times as seldom
    const slow = BARRAGES[barrage.kind].slow;
    const mul = slow !== undefined && game.script.flags.includes(slow.flag) ? slow.mul : 1;
    const shell = stepBarrage(barrage, game.mech, dt, stream('mortar'), mul);
    if (!shell) continue;
    game.shells.push(shell);
    game.events.push({ kind: 'shellWarn', x: shell.x, z: shell.z, radius: shell.radius });
  }
  for (const shell of stepShells(game.shells, dt)) {
    const hit = inCircle(shell, shell.radius, game.mech);
    game.events.push({ kind: 'shellLand', x: shell.x, z: shell.z, hit });
    if (hit) damageMech(game, shell.damage, shell.x - game.mech.x, shell.z - game.mech.z);
  }
  for (const mine of [...game.mines]) if (mineStepped(mine, game.mech)) blowUp(game, mine);
}

// Runs every ally on by `dt`; one that reaches its fate's place falls there. A cutscene holds them where they stand, as it
// holds the barrages: the beach's cue puts the ally out in the same frame as the landing, and it should run once the
// mech can.
function stepAllies(game: GameModel, dt: number): void {
  if (game.script.cutscene !== null) return;
  for (const ally of game.allies) {
    if (!stepAlly(ally, dt) || ally.fate === null) continue;
    game.events.push({ kind: 'allyDown', id: ally.id, x: ally.x, z: ally.z, by: ally.fate.by });
  }
}

// A frame's input: the mech's own input, the sub weapon's trigger (the main uses the mech's fire) and the camera's aim.
export interface GameInput extends MechInput {
  sub: boolean;
  aim?: Ray3; // the camera's line through the middle of the screen; without it, level from the chest along the mech's yaw
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

// One frame: the mech moves, the soft FCS picks the target or enemy in the aim circle, each weapon fires as often as its
// interval allows while its trigger is held, each enemy wakes, walks and shoots, and every bullet in flight (the new
// ones too) moves on, stopping at a prop, a target, an enemy, a mine, the mech or the ground; the hazards run next
// (stepHazards); a broken target goes to the script, and so does a wave whose enemies are all down. The mech then
// enters any area it stands in, and the script's time moves on; what the script reports is kept as this frame's events. The main weapon fires first. Once the sortie is cleared
// (the closing cutscene may still be playing: it goes on to its end) or the mech is downed, step does nothing.
export function step(game: GameModel, given: GameInput, dt: number): void {
  game.events = [];
  if ((game.cleared && game.script.cutscene === null) || game.downed) return;
  // while a cutscene plays the mech holds still and holds its fire; the aim line still passes through
  const input = game.script.cutscene === null ? given : { ...IDLE_INPUT, aim: given.aim };
  game.time += dt;
  const events = stepMech(game.mech, input, dt, moveTuneOf(M1_MECH), 0, {
    rects: game.rects,
    radius: MECH_TUNE.radius,
  });
  // The mech stays inside the map: the mech is kept a radius in from every side, and a speed that pushed it out stops.
  const radius = MECH_TUNE.radius;
  const minX = game.map.bounds.minX + radius;
  const maxX = game.map.bounds.maxX - radius;
  const minZ = game.map.bounds.minZ + radius;
  const maxZ = game.map.bounds.maxZ - radius;
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
  const chest = { x: game.mech.x, y: game.mech.y + MECH_TUNE.chestHeight, z: game.mech.z };
  const aim: Ray3 = input.aim ?? {
    ox: chest.x,
    oy: chest.y,
    oz: chest.z,
    dx: -Math.sin(game.mech.yaw),
    dy: 0,
    dz: -Math.cos(game.mech.yaw),
  };
  // The aim line stops at the first prop, standing target, live enemy or the ground; a shot goes there from the muzzle.
  const world: FcsWorld = {
    boxes: [
      ...game.propBoxes,
      ...game.targets.filter(target => target.hp > 0).map(target => target.box),
      ...game.enemies.filter(enemy => enemy.hp > 0).map(enemyBox),
    ],
    groundY: 0,
  };
  const fcs = stepFcs(game.fcs, 'soft', FCS_TUNE.soft, aim, muzzleOf(game.mech), fcsTargets(game, chest), dt, world);
  game.aimTarget = fcs.candidateId === null ? null : fcsName(game, fcs.candidateId);
  const mainShots = stepWeapon(game.main, input.fire, dt);
  const subShots = stepWeapon(game.sub, input.sub, dt);
  for (let i = 0; i < mainShots; i++) shoot(game, game.main.id, fcs.shotDir);
  for (let i = 0; i < subShots; i++) shoot(game, game.sub.id, fcs.shotDir);
  stepEnemies(game, dt);
  stepBattery(game, dt);
  stepBullets(game, dt);
  stepHazards(game, dt);
  stepAllies(game, dt);
  checkShutters(game);
  checkWaves(game);
  for (const [id, area] of Object.entries(game.mission.areas)) {
    if (game.script.entered.includes(id)) continue;
    if (inArea(area, game.mech.x, game.mech.z)) sendToScript(game, { kind: 'enter', area: id });
  }
  applyScriptOut(game, stepScript(game.script, game.mission, dt));
}
