// The game's state and the entry for updating it by one frame: the mech, the map, the targets' health and the frame's
// events. Nothing here reads three or the DOM, so a test runs it in node without a page. The mission script (SB-150),
// the enemies (SB-190) and the weapon table (SB-140) are not here yet. A shot stops at the first prop it meets and at
// the first target along its path, whichever is nearer.
import { TARGET_HP, TARGET_SIZE } from '../data/props.ts';
import { FEEL_TUNE, MECH_TUNE, MOVE_TUNE, PLAY_TUNE } from '../data/tune.ts';
import type { MapDef, TargetKind, TargetPlace } from '../data/types.ts';
import type { GroundRect } from './collide.ts';
import { fireRay, type Aabb } from './fire.ts';
import { mapBlockers } from './mapShapes.ts';
import { newMech, stepMech, type MechEvent, type MechInput, type MechState } from './mech.ts';

export interface TargetState {
  id: string;
  kind: TargetKind;
  hp: number; // the health left
  box: Aabb; // the box a shot may hit
}

// What happened in one frame, in the order it happened.
export type GameEvent =
  | { kind: 'mech'; event: MechEvent } // what stepMech reported, wrapped as it came
  | { kind: 'shot'; x: number; y: number; z: number; dx: number; dz: number; reach: number; target: string | null }
  | { kind: 'destroyed'; id: string }
  | { kind: 'cleared' };

export interface GameModel {
  time: number; // seconds since the sortie began
  map: MapDef;
  mech: MechState;
  rects: GroundRect[]; // the map's blockers (mapBlockers)
  propBoxes: Aabb[]; // the props' boxes, which stop a shot
  targets: TargetState[];
  events: GameEvent[]; // this frame's events; step empties it first
  cleared: boolean; // every target is down
}

// The box a shot may hit, from a rect on the ground: the turned rect's outside wrapped along the axes, with y from the
// ground to its top. A turned rect's box grows a little, because fireRay only handles boxes along the axes.
function rectBox(rect: GroundRect): Aabb {
  const cos = Math.abs(Math.cos(rect.yaw));
  const sin = Math.abs(Math.sin(rect.yaw));
  const halfX = cos * rect.halfW + sin * rect.halfD;
  const halfZ = sin * rect.halfW + cos * rect.halfD;
  return {
    minX: rect.x - halfX,
    maxX: rect.x + halfX,
    minY: 0,
    maxY: rect.top ?? 0,
    minZ: rect.z - halfZ,
    maxZ: rect.z + halfZ,
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

// The distance along the ray to where it enters the box, or null when it misses. fireRay answers only which box was
// hit, so a shot's reach needs this here. The direction is already of length 1.
function boxEntry(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, box: Aabb): number | null {
  let near = 0;
  let far = Infinity;
  const axis = (origin: number, dir: number, min: number, max: number): boolean => {
    if (Math.abs(dir) < 1e-12) return origin >= min && origin <= max;
    let t0 = (min - origin) / dir;
    let t1 = (max - origin) / dir;
    if (t0 > t1) [t0, t1] = [t1, t0];
    near = Math.max(near, t0);
    far = Math.min(far, t1);
    return near <= far;
  };
  if (!axis(ox, dx, box.minX, box.maxX)) return null;
  if (!axis(oy, dy, box.minY, box.maxY)) return null;
  if (!axis(oz, dz, box.minZ, box.maxZ)) return null;
  return near;
}

// One shot from the mech's chest, straight ahead along the ground: it stops at the first prop or hits the first target
// it meets, and a target down to 0 breaks. When every target is down the sortie is cleared (a map with no targets is
// never cleared). A prop does not break.
function shoot(game: GameModel): void {
  const mech = game.mech;
  const dx = -Math.sin(mech.yaw);
  const dz = -Math.cos(mech.yaw);
  const y = mech.y + MECH_TUNE.chestHeight;
  const alive = game.targets.filter(target => target.hp > 0);
  // The live targets come first and the props after, so an index past the targets is a prop that stopped the shot.
  const boxes = [...alive.map(target => target.box), ...game.propBoxes];
  const index = fireRay(mech.x, y, mech.z, dx, 0, dz, PLAY_TUNE.shotRange, boxes);
  if (index >= alive.length) {
    const prop = game.propBoxes[index - alive.length];
    const reach = boxEntry(mech.x, y, mech.z, dx, 0, dz, prop) ?? PLAY_TUNE.shotRange;
    game.events.push({ kind: 'shot', x: mech.x, y, z: mech.z, dx, dz, reach, target: null });
    return;
  }
  const hit = index >= 0 ? alive[index] : null;
  const reach = hit ? (boxEntry(mech.x, y, mech.z, dx, 0, dz, hit.box) ?? PLAY_TUNE.shotRange) : PLAY_TUNE.shotRange;
  game.events.push({ kind: 'shot', x: mech.x, y, z: mech.z, dx, dz, reach, target: hit ? hit.id : null });
  if (!hit) return;
  hit.hp = Math.max(0, hit.hp - PLAY_TUNE.shotDamage);
  if (hit.hp > 0) return;
  game.events.push({ kind: 'destroyed', id: hit.id });
  if (game.targets.length > 0 && game.targets.every(target => target.hp <= 0)) {
    game.cleared = true;
    game.events.push({ kind: 'cleared' });
  }
}

// A new sortie on `map`: the mech at the middle of the front edge, facing the land, and every target at its health.
export function newGame(map: MapDef): GameModel {
  const mech = newMech();
  mech.x = (map.bounds.minX + map.bounds.maxX) / 2;
  mech.z = map.bounds.maxZ - PLAY_TUNE.startMargin;
  mech.yaw = 0;
  const rects = mapBlockers(map);
  // mapBlockers puts the props first and the targets after, so all but the last targets.length rects are props.
  const propCount = rects.length - map.targets.length;
  return {
    time: 0,
    map,
    mech,
    rects,
    propBoxes: rects.slice(0, propCount).map(rectBox),
    targets: map.targets.map(place => ({
      id: place.id,
      kind: place.kind,
      hp: TARGET_HP[place.kind],
      box: targetBox(place),
    })),
    events: [],
    cleared: false,
  };
}

// One frame: the mech moves, every shot it fires hits a target or reaches its range, and a broken target reports it.
export function step(game: GameModel, input: MechInput, dt: number): void {
  game.events = [];
  if (game.cleared) return;
  game.time += dt;
  const events = stepMech(game.mech, input, dt, MOVE_TUNE, FEEL_TUNE.fireRate, {
    rects: game.rects,
    radius: MECH_TUNE.radius,
  });
  for (const event of events) {
    game.events.push({ kind: 'mech', event });
    if (event.kind === 'fire') shoot(game);
  }
}
