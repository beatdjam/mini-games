// The sectors of M1's front (SB-2210, SB-2220): a sector is cleared when the mech has gone in, no enemy is left in it
// and its goals are down, secured when enough of the infantry has reached its hold line, and then counterattacked once
// before it is stable.
// The game asks these pure functions, so a node test runs them without a page; game.ts is not imported (game.ts imports
// this file). +z is the sea.
import { ENEMIES } from '../data/enemies.ts';
import { PROP_SIZE } from '../data/props.ts';
import { M1_SECTORS, SECTOR_TUNE, type Sector, type SectorId } from '../data/sectors.ts';
import type { MapBounds, Prop } from '../data/types.ts';
import { rectDistance, type GroundRect } from './collide.ts';
import type { Crowd, Soldier } from './crowd.ts';

// 'secured' is only the step between a secured sector and its counterattack: stepSectors moves a sector on to 'counter'
// in the same frame, so a state that is read between frames never holds it (a test may set it).
export type SectorPhase = 'idle' | 'advancing' | 'secured' | 'counter' | 'stable';

export interface SectorsState {
  phase: SectorPhase[]; // one for each sector of M1_SECTORS, front to back
  counterLeft: number[]; // the counterattack enemies not put out yet (count)
  counterT: number[]; // the seconds to the next counterattack enemy (s)
  counterIds: string[][]; // the counterattack enemies put out, by id
  arrived: number[]; // the soldiers at the hold line when the sector was secured
  weak: boolean[]; // whether the hold was weak when it became stable
}

// What the sectors need to know of one enemy or one target.
interface SectorFoe {
  id: string;
  z: number;
  hp: number;
}

interface SectorTarget {
  kind: string;
  hp: number;
}

// What a frame of the sectors needs: the mech, the enemies and targets, the ground's rects, the infantry's crowd, the
// map's edges, its props (for the cover a secured sector's soldiers post behind) and the script's state its goals read.
export interface SectorWorld {
  mech: { z: number };
  enemies: readonly SectorFoe[];
  targets: readonly SectorTarget[];
  rects: readonly GroundRect[];
  battle: { crowd: Crowd };
  bounds: MapBounds;
  props: readonly Prop[];
  flags: readonly string[];
  wardenDown: boolean;
}

// What a sector's goals are read against: the targets, the script's flags and whether the mid boss is down.
export interface SectorGoalView {
  targets: readonly SectorTarget[];
  flags: readonly string[];
  wardenDown: boolean;
}

export type SectorEvent =
  | { kind: 'sectorCleared'; sector: SectorId }
  | { kind: 'sectorSecured'; sector: SectorId }
  | { kind: 'sectorCounter'; sector: SectorId }
  | { kind: 'sectorSpawn'; sector: SectorId; x: number; z: number }
  | { kind: 'sectorStable'; sector: SectorId; weak: boolean };

export interface SectorHold {
  holdZ: number; // where the infantry waits now (m)
  held: boolean; // whether it waits there instead of walking on
}

// What a sector needs to know of a blast point: the line it belongs to (null for the pillbox and fortress points).
export interface BlastLine {
  id: string;
  line: number | null;
}

export function newSectors(): SectorsState {
  const none = () => M1_SECTORS.map(() => 0);
  return {
    phase: M1_SECTORS.map(() => 'idle'),
    counterLeft: none(),
    counterT: none(),
    counterIds: M1_SECTORS.map(() => []),
    arrived: none(),
    weak: M1_SECTORS.map(() => false),
  };
}

const POST_COVER_GAP = 1.5; // how far landward of a cover's face a soldier posts (m)
const POST_EDGE = 3; // how far inside the map's side edges a spread post stays (m)
const POST_CLEAR = 0.8; // how far off a blocking rect a post stays, so no soldier stands inside a wall or a block (m)

// The living soldiers at or past `holdZ` (within arriveBand of it, on the landward side), and every soldier that has
// taken a post in a secured sector: a posted soldier counts as arrived however far behind the line it stands (SB-2262).
export function arrivedSoldiers(crowd: Crowd, holdZ: number): Soldier[] {
  return crowd.soldiers.filter(
    soldier => soldier.alive && (soldier.post !== null || soldier.z <= holdZ + SECTOR_TUNE.arriveBand),
  );
}

// The covering things of a sector: its blocking rects (a blown prop is already out of `rects`) and its craters, which
// are no blockers but still make a place to lie behind.
function coverRects(sector: Sector, rects: readonly GroundRect[], props: readonly Prop[]): GroundRect[] {
  const covers: GroundRect[] = [];
  for (const rect of rects) {
    if (rect.z < sector.landZ || rect.z > sector.seaZ) continue;
    covers.push(rect);
  }
  const crater = PROP_SIZE.crater;
  for (const prop of props) {
    if (prop.kind !== 'crater' || prop.z < sector.landZ || prop.z > sector.seaZ) continue;
    covers.push({
      x: prop.x,
      z: prop.z,
      halfW: (crater.w * prop.scale) / 2,
      halfD: (crater.d * prop.scale) / 2,
      yaw: prop.yaw,
    });
  }
  return covers;
}

// The post behind a cover: squarely on its seaward side, `POST_COVER_GAP` off its face. The enemy comes from the land,
// so the cover's shadow falls seaward (+z). A turned rect's reach along z is its two half-lengths turned into that axis.
function coverPost(cover: GroundRect): { x: number; z: number } {
  const reachZ = Math.abs(Math.sin(cover.yaw)) * cover.halfW + Math.abs(Math.cos(cover.yaw)) * cover.halfD;
  return { x: cover.x, z: cover.z + reachZ + POST_COVER_GAP };
}

// Whether a soldier could stand at the point: no blocking rect (a wall, a block, a hedgehog) within POST_CLEAR of it.
function standable(rects: readonly GroundRect[], x: number, z: number): boolean {
  return rects.every(rect => rectDistance(rect, x, z) >= POST_CLEAR);
}

// The places `count` soldiers post at in a secured sector (SB-2262): the seaward side of the sector's cover first (out of
// the land enemy's sight), spread along the sector's width, and then the sector's hold line across the map's width when
// there is not enough cover. The points are distinct, inside the sector and the map (never in the sea), and clear of the
// blocking rects, sorted by x. Pure, so a node test can read the choice.
export function sectorPosts(
  sector: Sector,
  bounds: MapBounds,
  rects: readonly GroundRect[],
  props: readonly Prop[],
  count: number,
): { x: number; z: number }[] {
  const want = Math.max(0, Math.floor(count));
  if (want === 0) return [];
  const minZ = Math.max(Math.min(sector.landZ, sector.seaZ), bounds.minZ);
  const maxZ = Math.min(Math.max(sector.landZ, sector.seaZ), bounds.maxZ);
  const minX = bounds.minX + POST_EDGE;
  const maxX = bounds.maxX - POST_EDGE;
  const covers = coverRects(sector, rects, props)
    .map(cover => {
      const post = coverPost(cover);
      return { x: Math.min(Math.max(post.x, minX), maxX), z: post.z };
    })
    .filter(post => post.z >= minZ && post.z <= maxZ && standable(rects, post.x, post.z))
    .sort((a, b) => a.x - b.x || a.z - b.z);
  const posts: { x: number; z: number }[] = [];
  // Pick the covers evenly through the sorted list, so the posts do not all gather at one end of the sector.
  const picked = Math.min(want, covers.length);
  for (let i = 0; i < picked; i++) {
    posts.push(covers[Math.floor((i * covers.length) / picked)]);
  }
  // Not enough cover: the rest stand across the sector's width on its hold line.
  const rest = want - posts.length;
  if (rest > 0) {
    const z = Math.min(Math.max(sector.holdZ, minZ), maxZ);
    for (let i = 0; i < rest; i++) {
      const base = rest === 1 ? (minX + maxX) / 2 : minX + ((maxX - minX) * (i + 0.5)) / rest;
      // a point a rect covers (the hold line can cross a hedgehog line) slides along x until it is clear
      let x = base;
      for (let move = 1; move <= 20 && !standable(rects, x, z); move++) {
        const slid = base + (move % 2 === 1 ? 1 : -1) * Math.ceil(move / 2) * 1.5;
        x = Math.min(Math.max(slid, minX), maxX);
      }
      posts.push({ x, z });
    }
  }
  return posts.sort((a, b) => a.x - b.x || a.z - b.z);
}

// Gives every soldier that has just reached the sector's hold line a post in the sector; one posted in an earlier
// sector keeps its place.
function postArrived(world: SectorWorld, sector: Sector): void {
  const crowd = world.battle.crowd;
  const fresh = arrivedSoldiers(crowd, sector.holdZ).filter(soldier => soldier.post === null);
  const posts = sectorPosts(sector, world.bounds, world.rects, world.props, fresh.length);
  // soldiers and posts both go in x order, so the ones walking to their posts do not cross each other
  fresh.sort((a, b) => a.x - b.x);
  for (let i = 0; i < fresh.length; i++) {
    fresh[i].post = posts[i];
    fresh[i].waited = true;
  }
}

// Lets some posted soldiers go on with the line when the next sector is cleared: `stayShare` of them keep the ground
// they took, and the rest walk on to the new waiting line. The pick needs no draw of its own.
export function releasePosts(crowd: Crowd, stayShare: number): void {
  const posted = crowd.soldiers.filter(soldier => soldier.alive && soldier.post !== null);
  // at least one goes on, so the line always has a soldier to walk to the new hold
  const share = Math.round(posted.length * Math.min(1, Math.max(0, stayShare)));
  const stay = Math.max(0, Math.min(posted.length - 1, share));
  for (let i = stay; i < posted.length; i++) posted[i].post = null;
}

// Whether any of a sector's goals still stands (SB-2283): a target of the goal's kind with health left, a flag not yet
// raised, or the mid boss not down. A sector with no goals has none standing.
export function goalsStanding(sector: Sector, view: SectorGoalView): boolean {
  for (const goal of sector.goals ?? []) {
    if (goal.kind === 'target') {
      if (view.targets.some(target => target.kind === goal.target && target.hp > 0)) return true;
    } else if (goal.kind === 'flag') {
      if (!view.flags.includes(goal.name)) return true;
    } else if (!view.wardenDown) {
      return true;
    }
  }
  return false;
}

// Whether a sector has no living enemy left in it. Its enemies count from its landZ to seaMargin past its seaZ, so the
// margin overlaps the sector seaward of it (an enemy there counts for both; the sectors are looked at front to back, so
// the front one decides); the sector's goals have to be down too.
function sectorClear(sector: Sector, world: SectorWorld): boolean {
  if (world.mech.z > sector.seaZ - SECTOR_TUNE.enterDepth) return false;
  for (const enemy of world.enemies) {
    if (enemy.hp <= 0) continue;
    if (enemy.z < sector.landZ || enemy.z > sector.seaZ + SECTOR_TUNE.seaMargin) continue;
    return false;
  }
  if (goalsStanding(sector, world)) return false;
  return true;
}

// Whether enough of the living infantry that walks with the line stands at the sector's hold line: min(arriveMax, ceil(walking * arriveShare)).
// With every soldier down nothing is secured; the refill in game.ts puts the next wave out instead.
function sectorSecured(crowd: Crowd, holdZ: number): boolean {
  const living = crowd.soldiers.filter(soldier => soldier.alive);
  if (living.length === 0) return false;
  // The ones left posted in an earlier sector hold that ground and are not asked to come: only the soldiers that walk
  // with the line are counted, against the number of them. With none of them left the sector is taken as it is.
  const walking = living.filter(soldier => soldier.post === null);
  if (walking.length === 0) return true;
  const needed = Math.min(SECTOR_TUNE.arriveMax, Math.ceil(walking.length * SECTOR_TUNE.arriveShare));
  return walking.filter(soldier => soldier.z <= holdZ + SECTOR_TUNE.arriveBand).length >= needed;
}

// The i-th point the counterattack comes out at: z is counterBack inland of the sector's land-side edge, and x runs
// evenly from -counterSpread to +counterSpread. A point that a ground rect covers is moved 2m at a time until it is
// clear; if it is still covered after ten moves, the last point tried is used, so the counterattack always comes out.
function counterPoint(sector: Sector, index: number, rects: readonly GroundRect[]): { x: number; z: number } {
  const z = sector.landZ - SECTOR_TUNE.counterBack;
  const spread = SECTOR_TUNE.counterSpread;
  const base = sector.counter <= 1 ? 0 : -spread + (2 * spread * index) / (sector.counter - 1);
  const radius = ENEMIES[SECTOR_TUNE.counterKind].radius;
  let x = base;
  for (let move = 0; move <= 10; move++) {
    x = base + move * 2;
    if (rects.every(rect => rectDistance(rect, x, z) > radius)) break;
  }
  return { x, z };
}

// Moves the sectors on by one frame. Only the frontmost sector that is not stable is looked at, so the ones behind it
// wait until it is stable in turn. A secured sector's arriving soldiers take posts there, and a sector cleared lets
// some of the posted ones stay and sends the rest on (SB-2262). Gives back the events of a sector cleared, secured,
// counterattacked or made stable this frame, and of each counterattack enemy to put out.
export function stepSectors(state: SectorsState, world: SectorWorld, dt: number): SectorEvent[] {
  for (let i = 0; i < M1_SECTORS.length; i++) {
    const phase = state.phase[i];
    if (phase === 'stable') continue;
    const sector = M1_SECTORS[i];
    if (phase === 'idle') {
      if (!sectorClear(sector, world)) return [];
      state.phase[i] = 'advancing';
      // the line moves on: some of the posted infantry stays in the ground it took, the rest walk to the new line
      releasePosts(world.battle.crowd, SECTOR_TUNE.postStayShare);
      return [{ kind: 'sectorCleared', sector: sector.id }];
    }
    if (phase === 'advancing' || phase === 'secured') {
      if (phase === 'advancing' && !sectorSecured(world.battle.crowd, sector.holdZ)) return [];
      state.arrived[i] = arrivedSoldiers(world.battle.crowd, sector.holdZ).filter(
        soldier => soldier.post === null,
      ).length;
      if (phase === 'advancing') postArrived(world, sector);
      state.phase[i] = 'counter';
      state.counterLeft[i] = sector.counter;
      state.counterT[i] = SECTOR_TUNE.counterEvery;
      state.counterIds[i] = [];
      return [
        { kind: 'sectorSecured', sector: sector.id },
        { kind: 'sectorCounter', sector: sector.id },
      ];
    }
    if (state.counterLeft[i] > 0) {
      state.counterT[i] -= dt;
      if (state.counterT[i] > 0) return [];
      state.counterT[i] += SECTOR_TUNE.counterEvery;
      const point = counterPoint(sector, sector.counter - state.counterLeft[i], world.rects);
      state.counterLeft[i] -= 1;
      return [{ kind: 'sectorSpawn', sector: sector.id, ...point }];
    }
    const standing = state.counterIds[i].some(id => {
      const enemy = world.enemies.find(entry => entry.id === id);
      return enemy !== undefined && enemy.hp > 0;
    });
    if (standing) return [];
    state.phase[i] = 'stable';
    state.weak[i] = state.arrived[i] < SECTOR_TUNE.weakArrived;
    return [{ kind: 'sectorStable', sector: sector.id, weak: state.weak[i] }];
  }
  return [];
}

// The hold a still-closed defence line puts on the infantry: the seaward-most of the closed lines, 6m before it. A line
// is open once any of its points is among `blasts` (the script's record of what the game has blown). Null when every
// line is open or the map has none.
function closedLineHoldZ(blasts: readonly string[], blastPoints: readonly BlastLine[]): number | null {
  let holdZ: number | null = null;
  const opened = new Set<number>();
  for (const point of blastPoints) {
    if (point.line !== null && blasts.includes(point.id)) opened.add(point.line);
  }
  const seen = new Set<number>();
  for (const point of blastPoints) {
    if (point.line === null || opened.has(point.line) || seen.has(point.line)) continue;
    seen.add(point.line);
    const lineHoldZ = point.line + SECTOR_TUNE.lineMargin;
    if (holdZ === null || lineHoldZ > holdZ) holdZ = lineHoldZ;
  }
  return holdZ;
}

// Where the infantry waits now: the last sector that is advancing or further on, or the water's edge before the first.
// A sector hold that stands inland of a defence line the mech has not opened yet is pulled back to 6m seaward of that
// line, so the infantry waits before it and pours through the hole once a blast opens it. It waits until the pillbox
// line is secured and then walks on, as it did once `pillboxes-down` raised.
export function sectorHold(
  state: SectorsState | null,
  blasts: readonly string[],
  blastPoints: readonly BlastLine[],
): SectorHold {
  let holdZ = SECTOR_TUNE.startHoldZ;
  for (let i = 0; i < M1_SECTORS.length; i++) {
    const phase = state?.phase[i];
    if (phase === 'idle' || phase === undefined) continue;
    holdZ = M1_SECTORS[i].holdZ;
  }
  const closed = closedLineHoldZ(blasts, blastPoints);
  if (closed !== null && closed > holdZ) holdZ = closed;
  const last = state?.phase[M1_SECTORS.length - 1];
  const holding = last !== 'secured' && last !== 'counter' && last !== 'stable';
  return { holdZ, held: holding };
}
