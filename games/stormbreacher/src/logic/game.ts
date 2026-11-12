// The game's state and the entry for updating it by one frame: the mech, the map, the targets' health, the props that
// break, the weapons, the mission script and the frame's events. Nothing here reads three or the DOM, so a test runs it
// in node without a page. A shot's damage and range come from the weapon table (data/weapons.ts), and it stops at the
// first prop it meets and at the first target along its path, whichever is nearer; a breakable prop takes the damage
// and breaks at 0. The script's `spawn` (a wave of enemies), `cleared` (a wave down) and `ally` (a friend) are kept as
// events but do nothing until the enemies and the friends come (SB-190); when they do, `cleared` goes back through
// sendToScript and `spawn` puts the enemies out.
import { M1 } from '../data/missions/m1.ts';
import { PROP_HP, TARGET_HP, TARGET_SIZE } from '../data/props.ts';
import { MECH_TUNE, MOVE_TUNE, PLAY_TUNE } from '../data/tune.ts';
import type { Area, MapDef, MissionDef, TargetKind, TargetPlace } from '../data/types.ts';
import { M1_LOADOUT, WEAPONS, type WeaponId } from '../data/weapons.ts';
import { rectBox, type GroundRect } from './collide.ts';
import { fireRayHit, type Aabb } from './fire.ts';
import { blockingPropIndexes, mapBlockers } from './mapShapes.ts';
import { newMech, stepMech, type MechEvent, type MechInput, type MechState } from './mech.ts';
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
  | {
      kind: 'shot';
      x: number;
      y: number;
      z: number;
      dx: number;
      dz: number;
      reach: number;
      target: string | null;
      weapon: WeaponId;
    }
  | { kind: 'destroyed'; id: string }
  | { kind: 'propDestroyed'; prop: number; x: number; z: number }
  | { kind: 'script'; event: ScriptOut } // what the mission script reported, wrapped as it came
  | { kind: 'cleared' };

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

// One shot from the mech's chest, straight ahead along the ground, with `weapon`'s damage and range: it stops at the
// first prop or hits the first target it meets, and a target down to 0 breaks and goes to the script. A breakable prop
// takes the same damage and breaks at 0, which opens the mech's path; any other prop only stops the shot.
function shoot(game: GameModel, weapon: WeaponId): void {
  const def = WEAPONS[weapon];
  const mech = game.mech;
  const dx = -Math.sin(mech.yaw);
  const dz = -Math.cos(mech.yaw);
  const y = mech.y + MECH_TUNE.chestHeight;
  const alive = game.targets.filter(target => target.hp > 0);
  // The live targets come first and the props after, so an index past the targets is a prop that stopped the shot.
  const boxes = [...alive.map(target => target.box), ...game.propBoxes];
  const hit = fireRayHit(mech.x, y, mech.z, dx, 0, dz, def.range, boxes);
  const target = hit && hit.index < alive.length ? alive[hit.index] : null;
  const reach = hit ? hit.dist : def.range;
  game.events.push({ kind: 'shot', x: mech.x, y, z: mech.z, dx, dz, reach, target: target ? target.id : null, weapon });
  if (hit && hit.index >= alive.length) damageProp(game, hit.index - alive.length, def.damage);
  if (!target) return;
  target.hp = Math.max(0, target.hp - def.damage);
  if (target.hp > 0) return;
  game.events.push({ kind: 'destroyed', id: target.id });
  sendToScript(game, { kind: 'destroyed', target: target.id });
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

// A frame's input: the mech's own input, and the sub weapon's trigger (the main uses the mech's fire).
export interface GameInput extends MechInput {
  sub: boolean;
}

// One frame: the mech moves, each weapon fires as often as its interval allows while its trigger is held, every shot
// hits a target or reaches its range, and a broken target goes to the script. The mech then enters any area it stands
// in, and the script's time moves on; what the script reports is kept as this frame's events. The main weapon fires
// first.
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
  const mainShots = stepWeapon(game.main, input.fire, dt);
  const subShots = stepWeapon(game.sub, input.sub, dt);
  for (let i = 0; i < mainShots; i++) shoot(game, game.main.id);
  for (let i = 0; i < subShots; i++) shoot(game, game.sub.id);
  for (const [id, area] of Object.entries(game.mission.areas)) {
    if (game.script.entered.includes(id)) continue;
    if (inArea(area, game.mech.x, game.mech.z)) sendToScript(game, { kind: 'enter', area: id });
  }
  applyScriptOut(game, stepScript(game.script, game.mission, dt));
}
