// The game's state and the entry for updating it by one frame: the mech, the map, the targets' health, the props that
// break, the weapons, the shots in flight, the mission script and the frame's events. Nothing here reads three or the
// DOM, so a test runs it in node without a page. A shot is a bullet that flies at its weapon's speed (data/weapons.ts)
// from the mech's chest toward the camera's aim, drawn toward a target in the aim circle by the soft FCS (fcs.ts) and
// spread a little by a random draw. It stops at the first prop it meets, at the first target along its path or at the
// ground, whichever is nearest, and vanishes at its range; a breakable prop takes the damage and breaks at 0. The
// script's `spawn` (a wave of enemies), `cleared` (a wave down) and `ally` (a friend) are kept as events but do nothing
// until the enemies and the friends come (SB-190); when they do, `cleared` goes back through sendToScript and `spawn`
// puts the enemies out.
import { M1 } from '../data/missions/m1.ts';
import { PROP_HP, TARGET_HP, TARGET_SIZE } from '../data/props.ts';
import { FCS_TUNE, MECH_TUNE, MOVE_TUNE, PLAY_TUNE } from '../data/tune.ts';
import type { Area, MapDef, MissionDef, TargetKind, TargetPlace } from '../data/types.ts';
import { M1_LOADOUT, WEAPONS, type WeaponId } from '../data/weapons.ts';
import { rectBox, type GroundRect } from './collide.ts';
import { newFcs, spreadDir, stepFcs, type Dir3, type FcsState, type FcsTarget, type Ray3 } from './fcs.ts';
import { fireRayHit, type Aabb } from './fire.ts';
import { blockingPropIndexes, mapBlockers } from './mapShapes.ts';
import { newMech, stepMech, type MechEvent, type MechInput, type MechState } from './mech.ts';
import { stream } from './rng.ts';
import { newScript, scriptInput, stepScript, type ScriptInput, type ScriptOut, type ScriptState } from './script.ts';
import { newWeapon, stepWeapon, type WeaponState } from './weapons.ts';

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
  // a bullet leaves the chest
  | { kind: 'shot'; x: number; y: number; z: number; dx: number; dy: number; dz: number; weapon: WeaponId }
  | {
      kind: 'hit';
      x: number;
      y: number;
      z: number;
      weapon: WeaponId;
      target: string | null; // the target's id when a target stopped the bullet
      prop: number | null; // the prop's place in map.props when a prop stopped it; both null at the ground
    }
  | { kind: 'destroyed'; id: string }
  | { kind: 'propDestroyed'; prop: number; x: number; z: number }
  | { kind: 'script'; event: ScriptOut } // what the mission script reported, wrapped as it came
  | { kind: 'cleared' };

// A shot in flight: where it is, the direction it flies (length 1) and the range it has left.
export interface Bullet {
  weapon: WeaponId;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  left: number; // the range left (m)
}

export interface GameModel {
  time: number; // seconds since the sortie began
  map: MapDef;
  mission: MissionDef; // the script's write-up (data/missions/m1.ts)
  script: ScriptState; // the mission script's own state; the objective, marks and the rest are read from here
  radio: { line: string; time: number } | null; // the last radio line's key and when it came; null before one
  mech: MechState;
  rects: GroundRect[]; // the map's blockers (mapBlockers)
  propBoxes: Aabb[]; // the props' boxes, which stop a shot
  propRefs: number[]; // the prop's place in map.props for each propBoxes entry
  breakables: BreakableState[]; // the breakable blocking props, with their health
  targets: TargetState[];
  main: WeaponState; // the main weapon's ammo and wait
  sub: WeaponState; // the sub weapon's ammo and wait
  fcs: FcsState; // the aim assist's state (the soft kind)
  aimTarget: string | null; // the id of the target the soft FCS pulls the aim toward, or null
  bullets: Bullet[]; // the shots in flight
  events: GameEvent[]; // this frame's events; step empties it first
  cleared: boolean; // set when the script's `end` fires
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

// The FCS's view of the targets: the id is the target's place in game.targets, the centre is the middle of its box.
function fcsTargets(game: GameModel): FcsTarget[] {
  return game.targets.map((target, id) => ({
    id,
    box: target.box,
    cx: (target.box.minX + target.box.maxX) / 2,
    cy: (target.box.minY + target.box.maxY) / 2,
    cz: (target.box.minZ + target.box.maxZ) / 2,
    alive: target.hp > 0,
  }));
}

// One shot from the mech's chest toward `dir`, spread by a random draw: a bullet with `weapon`'s range to fly.
function shoot(game: GameModel, weapon: WeaponId, dir: Dir3): void {
  const def = WEAPONS[weapon];
  const mech = game.mech;
  const aimed = spreadDir(dir, FCS_TUNE.soft.spread, stream('shots'));
  const y = mech.y + MECH_TUNE.chestHeight;
  game.bullets.push({ weapon, x: mech.x, y, z: mech.z, dx: aimed.dx, dy: aimed.dy, dz: aimed.dz, left: def.range });
  game.events.push({ kind: 'shot', x: mech.x, y, z: mech.z, dx: aimed.dx, dy: aimed.dy, dz: aimed.dz, weapon });
}

// Moves one bullet on by `dt`. It stops at the nearest of the first prop, the first live target and the ground along
// the stretch it flies; there it reports a hit, the prop or the target takes the damage, and a target down to 0 breaks
// and goes to the script. Returns whether the bullet is gone. The boxes are made fresh for each bullet, so a target or a
// prop an earlier bullet broke is not met again.
function flyBullet(game: GameModel, bullet: Bullet, dt: number): boolean {
  const def = WEAPONS[bullet.weapon];
  const dist = Math.min(def.speed * dt, bullet.left);
  const alive = game.targets.filter(target => target.hp > 0);
  // The live targets come first and the props after, so an index past the targets is a prop that stopped the bullet.
  const boxes = [...alive.map(target => target.box), ...game.propBoxes];
  const hit = fireRayHit(bullet.x, bullet.y, bullet.z, bullet.dx, bullet.dy, bullet.dz, dist, boxes);
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
  const target = hit && hit.dist <= ground && hit.index < alive.length ? alive[hit.index] : null;
  const prop = hit && hit.dist <= ground && hit.index >= alive.length ? game.propRefs[hit.index - alive.length] : null;
  game.events.push({
    kind: 'hit',
    x,
    y,
    z,
    weapon: bullet.weapon,
    target: target ? target.id : null,
    prop,
  });
  if (hit && prop !== null) damageProp(game, hit.index - alive.length, def.damage);
  if (!target) return true;
  target.hp = Math.max(0, target.hp - def.damage);
  if (target.hp > 0) return true;
  game.events.push({ kind: 'destroyed', id: target.id });
  sendToScript(game, { kind: 'destroyed', target: target.id });
  return true;
}

// Moves every bullet in flight on by `dt` and drops the ones that stopped or ran out of range.
function stepBullets(game: GameModel, dt: number): void {
  game.bullets = game.bullets.filter(bullet => !flyBullet(game, bullet, dt));
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
  game.rects.splice(boxIndex, 1);
  game.propBoxes.splice(boxIndex, 1);
  game.propRefs.splice(boxIndex, 1);
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
  // mapBlockers puts the props first and the targets after, so the first propRefs.length rects are the props.
  const propRefs = blockingPropIndexes(map);
  return {
    time: 0,
    map,
    mission,
    script: newScript(mission),
    radio: null,
    mech,
    rects,
    propBoxes: rects.slice(0, propRefs.length).map(rectBox),
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
    main: newWeapon(M1_LOADOUT.main),
    sub: newWeapon(M1_LOADOUT.sub),
    fcs: newFcs(),
    aimTarget: null,
    bullets: [],
    events: [],
    cleared: false,
  };
}

// Hands one input to the script and keeps its events. Names the mission does not have are not sent: scriptInput throws
// on them, and a map may hold a target the script does not know. Tests and the enemies' `cleared` use this entry.
export function sendToScript(game: GameModel, input: ScriptInput): void {
  if (input.kind === 'destroyed' && !game.mission.targets.includes(input.target)) return;
  if (input.kind === 'cleared' && !game.mission.waves.includes(input.wave)) return;
  if (input.kind === 'enter' && !(input.area in game.mission.areas)) return;
  applyScriptOut(game, scriptInput(game.script, game.mission, input));
}

// Keeps every event the script reported. The game itself takes only two: a radio line (the last one stays up) and the
// end (the sortie is cleared). The rest wait for the enemies and the friends (SB-190).
function applyScriptOut(game: GameModel, outs: readonly ScriptOut[]): void {
  for (const event of outs) {
    game.events.push({ kind: 'script', event });
    if (event.kind === 'radio') game.radio = { line: event.line, time: game.time };
    if (event.kind === 'end' && !game.cleared) {
      game.cleared = true;
      game.events.push({ kind: 'cleared' });
    }
  }
}

// Whether the point is inside the area's rectangle on the ground.
function inArea(area: Area, x: number, z: number): boolean {
  return Math.abs(x - area.x) <= area.w / 2 && Math.abs(z - area.z) <= area.d / 2;
}

// A frame's input: the mech's own input, the sub weapon's trigger (the main uses the mech's fire) and the camera's aim.
export interface GameInput extends MechInput {
  sub: boolean;
  aim?: Ray3; // the camera's line through the middle of the screen; without it, level from the chest along the mech's yaw
}

// One frame: the mech moves, the soft FCS picks the target in the aim circle, each weapon fires as often as its interval
// allows while its trigger is held, and every bullet in flight (the new ones too) moves on, stopping at a prop, a target
// or the ground; a broken target goes to the script. The mech then enters any area it stands in, and the script's time
// moves on; what the script reports is kept as this frame's events. The main weapon fires first.
export function step(game: GameModel, input: GameInput, dt: number): void {
  game.events = [];
  if (game.cleared) return;
  game.time += dt;
  const events = stepMech(game.mech, input, dt, MOVE_TUNE, 0, {
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
  const fcs = stepFcs(game.fcs, 'soft', FCS_TUNE.soft, aim, chest, fcsTargets(game), dt);
  game.aimTarget = fcs.candidateId === null ? null : game.targets[fcs.candidateId].id;
  const mainShots = stepWeapon(game.main, input.fire, dt);
  const subShots = stepWeapon(game.sub, input.sub, dt);
  for (let i = 0; i < mainShots; i++) shoot(game, game.main.id, fcs.shotDir);
  for (let i = 0; i < subShots; i++) shoot(game, game.sub.id, fcs.shotDir);
  stepBullets(game, dt);
  for (const [id, area] of Object.entries(game.mission.areas)) {
    if (game.script.entered.includes(id)) continue;
    if (inArea(area, game.mech.x, game.mech.z)) sendToScript(game, { kind: 'enter', area: id });
  }
  applyScriptOut(game, stepScript(game.script, game.mission, dt));
}
