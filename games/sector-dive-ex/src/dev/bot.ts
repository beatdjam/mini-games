import { addSystem } from '@engine/core/loop.ts';
import { OPPOSITE_SIDE, SIDE_STEP, activeTileGrid, hasLOS, tileCenter, tileIndex } from '@engine/world/tiles.ts';
import { camera } from '@engine/render/render.ts';
import { joy, setFireHeld } from '@engine/ui/input.ts';
import { query } from '@engine/core/world.ts';
import type { Boss, Enemy, Pickup, Wave, Weapon } from '../data/types.ts';
import { BOSS_META } from '../data/bosses.ts';
import { KIT_MAX, TUNE } from '../data/progress.ts';
import { EYE, PORTAL } from '../data/level.ts';
import { stageInfo } from '../core/stages.ts';
import { save } from '../core/save.ts';
import { toggleSetting } from '../core/progress.ts';
import { player, run } from '../actors/player.ts';
import { spheres } from '../actors/firing.ts';
import { boss, eBullets, enemies, nearPickup } from '../world/entities.ts';
import { hazardState } from '../world/hazards.ts';
import { weaponStats } from '../actors/weapons.ts';
import { kitHealAmount } from '../actors/combat.ts';
import { building } from '../world/building.ts';
import { level } from '../world/level.ts';
import { state } from '../flow/state.ts';
import { controlState, equipNearby, normalizeWeapons, useKit } from '../ui/input.ts';
// ================= a player that plays by itself (dev) =================
// For looking at the balance without playing by hand: a bot that walks the building's route, fights what it sees and
// takes the boss, through the same inputs a person uses (the stick, where the player looks, the fire button). It
// knows no more than the map shows a person who has been there: the route (the stairs and lifts), the boss room and
// the gates. `BotStyle` is what makes one kind of player differ from another.
// Used two ways: headless, stepped by hand and fast (sim/bot.sim.ts, npm run sim), and on the dev server with the
// picture on (#bot or #bot-<style>, src/dev/dev.ts; ?seed=<n> gives the same buildings each time).

export interface BotStyle {
  name: string;
  autofire: boolean; // the game's auto-fire setting (off: the bot holds the fire button while it has a target)
  turn: number; // how fast it brings its aim round (rad/s)
  aimError: number; // how far off its aim wanders (rad)
  fightRange: number; // it stops to fight what it sees within this (m)
  after: 'extract' | 'next'; // the gate it takes when the boss is down
  avoidHazards: boolean; // it goes round the hazard floors, and does not step onto one that is live or about to be
  dodge: number; // the share of the shots and shockwaves coming at it that it dashes clear of (0 = it never dashes)
  healBelow: number; // it uses a kit under this share of its health (when none of the kit's healing would be wasted)
  knowsBosses: boolean; // it fights each boss the way that boss asks for (BOSS_PLAYS), not only as any enemy
  explore: boolean; // it clears every room of a floor before going on (else it follows the route and fights what it meets)
  loot: number; // it goes out of its way for a weapon, a kit or a chip within this (m; 0 = only what it walks over)
}
// someone who plays well: quick, accurate aim, dashes clear of most shots, minds the hazard floors
const SKILLED = {
  turn: 9,
  aimError: 0.015,
  fightRange: 22,
  avoidHazards: true,
  dodge: 0.8,
  healBelow: 0.5,
  knowsBosses: true,
};
const KINDS: Record<string, Omit<BotStyle, 'name' | 'autofire'>> = {
  // new to it: slow, loose aim, seldom dashes, walks onto hazard floors, heals late, takes only what lies near
  beginner: {
    turn: 3.5,
    aimError: 0.07,
    fightRange: 14,
    avoidHazards: false,
    dodge: 0.15,
    healBelow: 0.3,
    knowsBosses: false,
    explore: false,
    loot: 5,
    after: 'next',
  },
  // plays well and looks everywhere: clears every room, goes a long way for a pickup
  explorer: { ...SKILLED, explore: true, loot: 40, after: 'next' },
  // plays well and presses on: follows the route, takes what lies near it
  rusher: { ...SKILLED, explore: false, loot: 12, after: 'next' },
};
// each kind with the game's auto-fire on (the name alone) and off (`-manual`: it pulls the trigger itself)
export const BOT_STYLES: Record<string, BotStyle> = Object.fromEntries(
  Object.entries(KINDS).flatMap(([name, kind]) => [
    [name, { name, autofire: true, ...kind }],
    [`${name}-manual`, { name: `${name}-manual`, autofire: false, ...kind }],
  ]),
);

// ---- what it knows about each boss ----
// How a boss is fought, as someone who has met it a few times would: the distance to keep, and the moment to dash
// and which way. (Shots and shockwaves are dodged the same way for every enemy; a Bastion's turrets go first because
// what stands with a boss always does.) The states read here are each boss's own (actors/bosses/<kind>.ts).
interface BossPlay {
  near?: number; // the distance to keep (m), in place of KEEP_NEAR / KEEP_FAR
  far?: number;
  dash?: { x: number; z: number }; // get clear now, this way
  chase?: boolean; // out of sight, it is run down with dashes (keeping enough stamina to dodge once)
}
type Vec = { x: number; z: number };
const unit = (x: number, z: number): Vec => {
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l };
};
const BOSS_PLAYS: Record<string, (b: Boss, me: Vec) => BossPlay> = {
  // CRUSHER: keep well away; step out of the line of a charge; while it is stunned on a wall, close in and shoot
  crusher: (b, me) => {
    // (the boss's own state; its type is private to actors/bosses/crusher.ts)
    const c = b as Boss & { st: string; cdx: number; cdz: number };
    if (c.st === 'stun') return { near: 4, far: 9 };
    const play: BossPlay = { near: 10, far: 20 };
    if (c.st !== 'charge') return play;
    const rx = me.x - b.x,
      rz = me.z - b.z,
      ahead = rx * c.cdx + rz * c.cdz, // how far along its charge the player is
      aside = rx * c.cdz - rz * c.cdx; // ... and how far to one side of it
    if (ahead > 0 && ahead < CHARGE_REACH && Math.abs(aside) < CHARGE_WIDTH) {
      const side = aside >= 0 ? 1 : -1;
      play.dash = { x: c.cdz * side, z: -c.cdx * side };
    }
    return play;
  },
  // NOISE CORE: its beams sweep round the middle: dash through one that is about to reach it, against the spin
  core: (b, me) => {
    const c = b as Boss & { ba: number; bdir: number; beams: { visible: boolean }[] };
    const n = c.beams.filter(m => m.visible).length;
    if (b.pat !== 0 || !n || b.pt < BOSS_META.core!.tune.beamWarm - BEAM_EARLY) return {};
    const pd = Math.hypot(me.x - b.cx, me.z - b.cz),
      pa = Math.atan2(-(me.z - b.cz), me.x - b.cx);
    for (let k = 0; k < n; k++) {
      const a = c.ba + (k / n) * Math.PI * 2,
        df = Math.atan2(Math.sin(pa - a), Math.cos(pa - a)) * c.bdir; // the beam is this far behind the player (rad)
      if (df > 0 && df < Math.PI / 2 && pd * Math.sin(df) < BEAM_NEAR)
        // (round the middle, the way the beam came from)
        return { dash: { x: Math.sin(pa) * c.bdir, z: Math.cos(pa) * c.bdir } };
    }
    return {};
  },
  // PHANTOM: it warps behind the pillars: run it down with dashes when it is out of sight. Its laser locks a moment
  // before the shot: dash aside then
  phantom: (b, me) => {
    const c = b as Boss & { st: string; lock: number[] };
    if (c.st !== 'aim' || b.timer > PHANTOM_LOCKED || Math.hypot(c.lock[0]! - me.x, c.lock[2]! - me.z) > 1.5)
      return { chase: true };
    const away = unit(me.x - b.x, me.z - b.z);
    return { chase: true, dash: { x: -away.z, z: away.x } };
  },
  // TRINITY: one body lunges at where the player stood: get off that spot
  trinity: (b, me) => {
    const r = (b as Boss & { ram: { t: number; dur: number; tx: number; tz: number } | null }).ram;
    if (!r || r.t > r.dur / 2 || Math.hypot(me.x - r.tx, me.z - r.tz) > RAM_NEAR) return {};
    const away = unit(me.x - b.cx, me.z - b.cz);
    return { dash: { x: -away.z, z: away.x } };
  },
};

// ---- tuning numbers used only here ----
const CHARGE_REACH = 30; // a Crusher's charge is stepped out of when it is coming from within this (m)
const CHARGE_WIDTH = 3.4; // ... and would pass this near (m; it hits within 2.5)
const BEAM_EARLY = 0.3; // a Core's beams are minded from this long before they burn (s)
const BEAM_NEAR = 2.4; // ... and dashed through when one is this near (m)
const PHANTOM_LOCKED = 0.3; // a Phantom's laser stops following this long before the shot (s)
const RAM_NEAR = 2.8; // a Trinity's lunge is dodged when it is aimed within this of the player (m)
const KEEP_FAR = 16; // in a fight it closes in from beyond this (m)
const KEEP_NEAR = 6; // ... and backs off inside this
const STRAFE_FLIP = 0.9; // it changes the side it strafes to this often (s)
const AIM_WANDER = 0.35; // its aim error is drawn again this often (s)
const KIT_ANYWAY = 0.2; // under this share of its health it uses a kit even if some of the healing is wasted
const STUCK_AFTER = 1.5; // not having moved for this long while walking counts as stuck (s)
const STUCK_MOVED = 0.4; // ... less than this far (m)
const UNSTICK_FOR = 0.5; // it then sidesteps for this long (s)
const KEEP_AIM = 0.6; // it keeps aiming where a foe was for this long after losing sight of it (s)
const FIRE_CONE = 0.12; // without auto-fire it pulls the trigger when its aim is within this of the target (rad)
const PITCH_MAX = 1.4; // rad
const REPATH_FRAMES = 30; // the way is worked out again this often (doors lock and open)
const IDLE_AFTER = 8; // getting nowhere for this long (no ground covered, nothing killed), it roams (s)
const IDLE_MOVED = 1.5; // ... less ground than this (m)
const ROAM_FOR = 2.5; // it then walks some other way for this long (s)
const HAZARD_COST = 8; // a hazard floor tile counts as this many tiles of walking: it goes round when that is shorter
const LOOK_AHEAD = 1.7; // it will not walk onto a live hazard floor this near ahead (m)
const BETTER_BY = 1.1; // a weapon on the floor is taken when it does this many times the damage of the worse one held
const DODGE_TIME = 0.3; // it dashes when a shot would reach it within this (s)
const DODGE_MARGIN = 0.45; // ... passing this near its body (m)
const DODGE_REACH_Y = 2.2; // a shot this far above or below its middle goes by (m)
const WAVE_NEAR = 1.6; // it dashes through a shockwave when the ring is this near (m)
const NO_HIT_AFTER = 1.2; // shooting at a foe this long without hurting it, it closes in (s)
const PUSH_IN_FOR = 1.5; // ... for this long (s)
const LOOT_GIVE_UP = 12; // a thing on the floor it has not got to in this long is left (s)
const LOOT_REACH_Y = 2.5; // a thing this far above or below its feet is on another level: left alone (m)

// what a run came to, for the tables (sim/bot.sim.ts)
export interface BotStats {
  frames: number; // frames played (60 a second)
  damage: number; // health lost, kits and regeneration aside
  minHp: number; // the lowest its health went, as a share of the most
  kits: number; // kits used
  hazard: number; // seconds stood on a live hazard floor
  picked: number; // weapons taken from the floor
  dashes: number; // dashes made to get clear of a shot or a shockwave
  depth: number; // the deepest depth it played (1 = the first)
  floors: number; // floors of the building it reached
  bossAt: number; // the frame the boss appeared at (-1 = it never did)
  bossHp: number; // the share of the boss's health left (1 = not fought)
  stuck: number; // times it had to shake itself loose
  doing: string; // what it is doing now (for the picture and for a run that never ends)
  trace: string[]; // what it did, in order: `<second> <floor> <what>` each time that changed
}

const angleTo = (dx: number, dz: number) => Math.atan2(-dx, -dz); // the yaw that looks along (dx, dz)
function turnToward(from: number, to: number, max: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + Math.max(-max, Math.min(max, d));
}

export function createBot(style: BotStyle) {
  const stats: BotStats = {
    frames: 0,
    damage: 0,
    minHp: 1,
    kits: 0,
    hazard: 0,
    picked: 0,
    dashes: 0,
    depth: 1,
    floors: 1,
    bossAt: -1,
    bossHp: 1,
    stuck: 0,
    doing: 'start',
    trace: [],
  };
  let dist: Int32Array = new Int32Array(0); // per tile: steps to the goal (-1 = no way)
  let goalKey = ''; // what `dist` was made for
  let lastHp = -1;
  let strafe = 1; // the side it strafes to (±1)
  let strafeT = 0;
  let wanderT = 0;
  let errYaw = 0;
  let errPitch = 0;
  let stuckT = 0;
  let stuckAt = { x: 0, z: 0 };
  let unstickT = 0;
  let unstickSide = 1;
  let seen: ReturnType<typeof pickEnemy> = null; // the foe it saw last
  let seenT = 0; // seconds it still aims there
  let idleT = 0;
  let idleAt = { x: 0, z: 0, kills: 0, foeHp: 0 };
  let roamT = 0;
  let roam = { x: 0, z: 0 }; // the way it roams
  let shotAt: { e: Enemy | null; hp: number; t: number } = { e: null, hp: 0, t: 0 }; // the foe under fire, its health when a shot last told, seconds since

  // the steps from every tile to tile `goal`, walking as a person walks (ramps and decks count; a locked door is
  // walked up to, not through)
  function pathTo(goal: number, key: string) {
    if (goalKey === key) return;
    goalKey = key;
    spread(goal, true);
    // (when the only way lies past the gate it does not want, it goes that way all the same)
    if ((dist[tileIndex(player.x, player.z)] ?? -1) < 0) spread(goal, false);
  }
  function spread(goal: number, roundGates: boolean) {
    const grid = activeTileGrid(),
      { W, H, grid: floor } = grid.world;
    dist = new Int32Array(W * H).fill(-1);
    // (the gate it does not mean to take is walked round: stepping near it would end the run or the depth)
    const wants = level.portals.some(pt => pt.kind === style.after),
      shut = new Set(
        level.portals.filter(pt => roundGates && wants && pt.kind !== style.after).map(pt => tileIndex(pt.x, pt.z)),
      );
    const queue = [goal];
    dist[goal] = 0;
    // (tiles are taken again when a shorter way to them turns up: a hazard floor costs more than a plain one)
    for (let h = 0; h < queue.length; h++) {
      const c = queue[h]!,
        ci = c % W,
        cj = Math.floor(c / W),
        cost = dist[c]! + (style.avoidHazards && level.hazardTiles[c] ? HAZARD_COST : 1);
      SIDE_STEP.forEach(([a, b], side) => {
        if (!grid.inBounds(ci + a, cj + b)) return;
        const n = c + a + b * W;
        if (floor[n] !== 1 || shut.has(n) || (dist[n]! >= 0 && dist[n]! <= cost)) return;
        // (walking n -> c; the goal itself may be a locked door: its neighbours still lead to it)
        if (!grid.passable(n, c, OPPOSITE_SIDE[side]!) && !(c === goal && grid.world.door?.[c])) return;
        dist[n] = cost;
        queue.push(n);
      });
    }
  }
  // The steps from where it stands to every tile it can walk to (-1 = it cannot): what it goes for (a thing on the
  // floor, an enemy the map shows) must be somewhere it can get to, or it would stand under a deck for ever
  let reach: Int32Array = new Int32Array(0);
  let reachKey = '';
  function reachFromHere(key: string) {
    if (reachKey === key) return;
    reachKey = key;
    const grid = activeTileGrid(),
      { W, H, grid: floor } = grid.world,
      start = tileIndex(player.x, player.z);
    reach = new Int32Array(W * H).fill(-1);
    const queue = [start];
    reach[start] = 0;
    for (let h = 0; h < queue.length; h++) {
      const c = queue[h]!,
        ci = c % W,
        cj = Math.floor(c / W);
      SIDE_STEP.forEach(([a, b], side) => {
        if (!grid.inBounds(ci + a, cj + b)) return;
        const n = c + a + b * W;
        if (floor[n] !== 1 || reach[n]! >= 0 || !grid.passable(c, n, side)) return;
        reach[n] = reach[c]! + 1;
        queue.push(n);
      });
    }
  }
  const stepsTo = (o: { x: number; z: number }): number => reach[tileIndex(o.x, o.z)] ?? -1;
  // the nearest enemy it can walk to (the map shows where they are), the boss or not
  function nearestEnemy(bossToo: boolean): Enemy | null {
    let near: Enemy | null = null,
      best = Infinity;
    for (const e of enemies) {
      const d = e.dead || (e.boss && !bossToo) ? -1 : stepsTo(e);
      if (d >= 0 && d < best) {
        near = e;
        best = d;
      }
    }
    return near;
  }
  // the way to walk now to get nearer the goal (a unit vector), or null when there is no way from here
  function wayToGoal(at?: { x: number; z: number }): { x: number; z: number } | null {
    const grid = activeTileGrid(),
      { W } = grid.world,
      here = tileIndex(player.x, player.z),
      d = dist[here] ?? -1;
    if (d < 0) return null;
    let next = here;
    if (d > 0) {
      let best = d;
      SIDE_STEP.forEach(([a, b], side) => {
        const n = here + a + b * W,
          dn = dist[n] ?? -1;
        // (a nearer tile it cannot step onto from here, a deck above it, is not the way; the goal may be a locked door)
        if (dn > 0 && !grid.passable(here, n, side)) return;
        if (dn >= 0 && dn < best) {
          best = dn;
          next = n;
        }
      });
    }
    // (on the goal's own tile: to the thing itself, which may lie well off the tile's middle)
    const end = next === here && d === 0 ? at : undefined,
      dx = (end ? end.x : tileCenter(next % W)) - player.x,
      dz = (end ? end.z : tileCenter(Math.floor(next / W))) - player.z,
      len = Math.hypot(dx, dz);
    return len < 0.05 ? { x: 0, z: 0 } : { x: dx / len, z: dz / len };
  }
  const hazardAt = (x: number, z: number): boolean => !!level.hazardTiles[tileIndex(x, z)];
  // would walking along (x, z) take it onto a hazard floor that is live or about to be (from a tile that is not one)
  function intoHazard(x: number, z: number): boolean {
    if (!style.avoidHazards || hazardState() === 'off' || hazardAt(player.x, player.z)) return false;
    const len = Math.hypot(x, z);
    return len > 0.01 && hazardAt(player.x + (x / len) * LOOK_AHEAD, player.z + (z / len) * LOOK_AHEAD);
  }
  // walks along (x, z) in the world, whichever way it is looking (it waits rather than step onto a live hazard floor)
  function walk(x: number, z: number) {
    if (intoHazard(x, z)) return;
    const fx = -Math.sin(player.yaw),
      fz = -Math.cos(player.yaw),
      rx = Math.cos(player.yaw),
      rz = -Math.sin(player.yaw);
    joy.x = x * rx + z * rz;
    joy.y = -(x * fx + z * fz);
  }

  // the enemy it would shoot: the nearest it can see within its range
  function pickEnemy(): { e: Enemy; x: number; y: number; z: number; d: number } | null {
    const cp = camera.position;
    let best: ReturnType<typeof pickEnemy> = null;
    for (const e of enemies) {
      if (e.dead) continue;
      for (const s of spheres(e)) {
        const d = Math.hypot(s.p.x - cp.x, s.p.z - cp.z);
        // (what stands with a boss goes first: some bosses cannot be hurt while their turrets stand)
        const sooner = best && !!best.e.boss !== !!e.boss ? !e.boss : !best || d < best.d;
        if (d > style.fightRange || !sooner) continue;
        if (!hasLOS(cp.x, cp.z, s.p.x, s.p.z, cp.y, s.p.y)) continue;
        best = { e, x: s.p.x, y: s.p.y, z: s.p.z, d };
      }
    }
    return best;
  }
  function aimAt(dt: number, x: number, y: number, z: number): number {
    const cp = camera.position,
      dx = x - cp.x,
      dz = z - cp.z,
      wantYaw = angleTo(dx, dz) + errYaw,
      wantPitch = Math.atan2(y - cp.y, Math.hypot(dx, dz)) + errPitch;
    player.yaw = turnToward(player.yaw, wantYaw, style.turn * dt);
    player.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, turnToward(player.pitch, wantPitch, style.turn * dt)));
    return Math.abs(turnToward(player.yaw, wantYaw, Math.PI) - player.yaw);
  }

  // ---- things on the floor ----
  const dpsOf = (w: Weapon | null): number => (w ? weaponStats(w).dps : 0);
  const worstHeld = (): number => Math.min(dpsOf(player.weapons[0] ?? null), dpsOf(player.weapons[1] ?? null));
  // is a thing on the floor worth walking to: a chip always, a kit when there is room or health to gain, a weapon
  // when it is clearly better than the worse of the two held (or a slot is empty)
  function wanted(p: Pickup): boolean {
    if (p.dead || p.kind === 'bit') return false;
    if (p.kind === 'chip') return true;
    if (p.kind === 'kit') return player.kits < KIT_MAX || player.hp < player.maxHp;
    return dpsOf(p.w!) > worstHeld() * BETTER_BY;
  }
  // The nearest wanted thing it can walk to within the range it goes out of its way for. Once it has set out for
  // one it stays with it (or it would turn back and forth between two); one it cannot get in LOOT_GIVE_UP seconds is
  // left for good
  let lootFor: Pickup | null = null;
  let lootT = 0;
  const lootLeft = new Set<Pickup>();
  function lootNear(dt: number): Pickup | null {
    const ok = (p: Pickup) => wanted(p) && !lootLeft.has(p) && stepsTo(p) >= 0;
    if (lootFor && ok(lootFor)) {
      lootT += dt;
      if (lootT < LOOT_GIVE_UP) return lootFor;
      lootLeft.add(lootFor);
    }
    lootFor = null;
    lootT = 0;
    let bestD = style.loot;
    for (const p of query<Pickup>('pickup')) {
      if (!ok(p) || Math.abs(p.y - player.fy) > LOOT_REACH_Y) continue;
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      if (d < bestD) {
        lootFor = p;
        bestD = d;
      }
    }
    return lootFor;
  }
  // a weapon in reach: take it into the empty slot, or in place of the worse one; then hold the better of the two
  function takeWeapons() {
    const p = nearPickup;
    if (!p || !wanted(p)) return;
    // (the one in hand is the one swapped out: the worse of the two)
    if (player.weapons[1] && dpsOf(player.weapons[player.cur] ?? null) > worstHeld()) player.cur ^= 1;
    normalizeWeapons();
    equipNearby();
    stats.picked++;
    const better = dpsOf(player.weapons[1] ?? null) > dpsOf(player.weapons[0] ?? null) ? 1 : 0;
    if (player.cur !== better) {
      player.cur = better;
      normalizeWeapons();
    }
  }

  // ---- getting clear of what is coming ----
  const judged = new Map<object, number>(); // shots and waves it has made its mind up about (and which life of theirs)
  // does it react to this one (decided once per shot: `dodge` of them)
  function reactsTo(o: object, life: number): boolean {
    if (judged.get(o) === life) return false;
    judged.set(o, life);
    return Math.random() < style.dodge;
  }
  const canDash = (): boolean => player.st >= TUNE.dashCost && player.dashT <= 0 && player.inv <= 0;
  // the way to dash to get clear of a shot about to hit or a shockwave about to pass (null = nothing to dodge, or
  // no stamina for it)
  function dodgeWay(): { x: number; z: number } | null {
    if (style.dodge <= 0 || !canDash()) return null;
    for (const b of eBullets) {
      if (!b.alive || Math.abs(b.y - (player.fy + EYE / 2)) > DODGE_REACH_Y) continue;
      const rx = player.x - b.x,
        rz = player.z - b.z,
        v2 = b.vx * b.vx + b.vz * b.vz;
      if (v2 < 0.01) continue;
      const t = (rx * b.vx + rz * b.vz) / v2; // seconds to where it passes nearest
      if (t <= 0 || t > DODGE_TIME) continue;
      const mx = rx - b.vx * t,
        mz = rz - b.vz * t; // from that nearest point to the player
      if (Math.hypot(mx, mz) > player.r + DODGE_MARGIN) continue;
      if (!reactsTo(b, b.born ?? 0)) continue;
      // across its path, to the side the player is already on
      const v = Math.sqrt(v2),
        side = b.vx * rz - b.vz * rx >= 0 ? 1 : -1;
      return { x: (-b.vz / v) * side, z: (b.vx / v) * side };
    }
    for (const w of query<Wave>('wave')) {
      if (w.dead || w.hit) continue;
      const dx = w.x - player.x,
        dz = w.z - player.z,
        d = Math.hypot(dx, dz),
        gap = d - w.r; // the ring is this far short of the player
      if (gap <= 0 || gap > WAVE_NEAR || d < 0.01) continue;
      if (!reactsTo(w, 0)) continue;
      return { x: dx / d, z: dz / d }; // through the ring, toward its middle
    }
    return null;
  }

  const distTo = (o: { x: number; z: number }): number => Math.hypot(o.x - player.x, o.z - player.z);
  // a point a few metres from `o`, on the far side of the player
  function awayFrom(o: { x: number; z: number }): { x: number; z: number } {
    const d = Math.max(distTo(o), 0.01),
      ux = d < 0.02 ? 1 : (player.x - o.x) / d,
      uz = d < 0.02 ? 0 : (player.z - o.z) / d;
    return { x: o.x + ux * (PORTAL.clearR + 1), z: o.z + uz * (PORTAL.clearR + 1) };
  }
  // where it is going on this floor: the goal tile (and the very spot, when it matters), and what to call it
  function goal(dt: number): { tile: number; what: string; at?: { x: number; z: number } } | null {
    const { W } = activeTileGrid().world,
      tileAt = (x: number, z: number) => tileIndex(x, z);
    const loot = lootNear(dt);
    if (loot) return { tile: tileAt(loot.x, loot.z), what: `pick up a ${loot.kind}`, at: loot };
    const gate = level.portals.find(p => p.kind === style.after) ?? level.portals[0];
    if (gate) {
      // (a gate that opened underfoot works only once it has been stepped away from: data/level.ts PORTAL)
      if (!gate.clear) return { tile: tileIndex(player.x, player.z), what: 'step off the gate', at: awayFrom(gate) };
      return { tile: tileAt(gate.x, gate.z), what: `gate ${gate.kind}`, at: gate };
    }
    // a boss out of sight (the map shows where it is): go to it
    if (boss && stepsTo(boss) >= 0) return { tile: tileAt(boss.x, boss.z), what: `find ${boss.kind}` };
    // the enemies left on the floor, for the kind that clears every floor: the nearest it can walk to
    if (style.explore && !boss) {
      const near = nearestEnemy(false);
      if (near) return { tile: tileAt(near.x, near.z), what: 'clear the floor' };
    }
    const st = run.bld,
      b = building;
    if (!st || !b || level.floor < 0) return null;
    const n = b.route.indexOf(st.floor);
    if (n >= 0 && n < b.route.length - 1) {
      const l = b.links[n]!;
      // stairs: the landing tile that makes the other floor the one played; a lift: its platform
      const tile = l.kind === 'stairs' ? (l.upper === st.floor ? l.b : l.a) : l.a;
      return { tile, what: `${l.kind} ${n}` };
    }
    const hall = level.hall;
    if (!hall) return null;
    // (once inside, the door locks behind: the fight is on, and the boss comes after a moment)
    const inside = level.roomOf[tileIndex(player.x, player.z)] === hall.room;
    if (activeTileGrid().world.doorLock?.[hall.door] && !boss && !inside) return { tile: hall.door, what: 'boss door' };
    const r = level.rooms[hall.room]!;
    return { tile: (r.y + Math.floor(r.h / 2)) * W + r.x + Math.floor(r.w / 2), what: 'boss room' };
  }

  let traced = '';
  function note() {
    const what = stats.doing.replace(/^fight .*/, 'fight');
    if (what === traced) return;
    traced = what;
    stats.trace.push(`${(stats.frames / 60).toFixed(0)}s f${level.floor} ${stats.doing}`);
  }
  // one frame of play: call before the game's own update
  function step(dt: number) {
    play(dt);
    note();
  }
  function play(dt: number) {
    if (save.settings.autofire !== style.autofire) toggleSetting('autofire');
    if (state === 'perk') {
      // a chip to choose: the first one offered
      document.querySelector<HTMLButtonElement>('#perkList button')?.click();
      return;
    }
    if (state !== 'play' || !player) return;
    stats.frames++;
    if (lastHp >= 0 && player.hp < lastHp) stats.damage += lastHp - player.hp;
    lastHp = player.hp;
    stats.minHp = Math.min(stats.minHp, player.hp / player.maxHp);
    stats.depth = Math.max(stats.depth, stageInfo(run.stage).tier + 1);
    if (run.bld) stats.floors = Math.max(stats.floors, building ? building.route.indexOf(run.bld.floor) + 1 : 1);
    if (boss) {
      if (stats.bossAt < 0) stats.bossAt = stats.frames;
      stats.bossHp = Math.max(0, boss.hp / boss.maxHp);
    } else if (stats.bossAt >= 0 && level.portals.length) stats.bossHp = 0;
    if (hazardState() === 'on' && hazardAt(player.x, player.z)) stats.hazard += dt;
    takeWeapons();
    const share = player.hp / player.maxHp,
      wasted = player.hp + kitHealAmount() > player.maxHp;
    if (player.kits > 0 && (share < KIT_ANYWAY || (share < style.healBelow && !wasted))) {
      useKit();
      stats.kits++;
    }
    wanderT -= dt;
    if (wanderT <= 0) {
      wanderT = AIM_WANDER;
      errYaw = (Math.random() * 2 - 1) * style.aimError;
      errPitch = (Math.random() * 2 - 1) * style.aimError;
    }
    strafeT -= dt;
    if (strafeT <= 0) {
      strafeT = STRAFE_FLIP;
      strafe = -strafe;
    }

    // getting clear comes first: of a shot or a shockwave, or of what this boss is about to do
    const play = style.knowsBosses && boss ? (BOSS_PLAYS[boss.kind]?.(boss, player) ?? {}) : {},
      clear = dodgeWay() ?? (play.dash && canDash() ? play.dash : null);
    if (clear) {
      walk(clear.x, clear.z);
      controlState.dashReq = true;
      stats.dashes++;
      stats.doing = 'dash';
      return;
    }
    const again = Math.floor(stats.frames / REPATH_FRAMES);
    reachFromHere(`${level.floor}:${tileIndex(player.x, player.z)}:${again}`);
    let g = goal(dt);
    if (g) pathTo(g.tile, `${level.floor}:${g.tile}:${again}`);
    let way = g ? wayToGoal(g.at) : null;
    if (!way) {
      // shut in (a lockdown), or no way on: go for the nearest enemy it can walk to
      const near = nearestEnemy(true);
      if (near) {
        g = { tile: tileIndex(near.x, near.z), what: 'the nearest enemy' };
        pathTo(g.tile, `${level.floor}:${g.tile}:${again}`);
        way = wayToGoal();
      }
    }
    let foe = pickEnemy();
    // getting nowhere (waiting on a lift that will not come, shooting at what it cannot hit): roam a little
    idleT += dt;
    if (idleT >= IDLE_AFTER && !level.portals.length) {
      const foeHp = foe ? foe.e.hp : -1;
      if (
        Math.hypot(player.x - idleAt.x, player.z - idleAt.z) < IDLE_MOVED &&
        run.kills === idleAt.kills &&
        foeHp === idleAt.foeHp
      ) {
        const turn = Math.random() * Math.PI * 2;
        roam = { x: Math.cos(turn), z: Math.sin(turn) };
        roamT = ROAM_FOR;
        stats.stuck++;
      }
      idleT = 0;
      idleAt = { x: player.x, z: player.z, kills: run.kills, foeHp };
    }
    if (roamT > 0) {
      roamT -= dt;
      setFireHeld(false);
      player.yaw = turnToward(player.yaw, angleTo(roam.x, roam.z), style.turn * dt);
      walk(roam.x, roam.z);
      stats.doing = 'roam';
      return;
    }
    // (a foe that slips behind a corner is still aimed at for a moment, where it was last seen)
    if (foe) {
      seen = foe;
      seenT = KEEP_AIM;
    } else if (seenT > 0 && !seen!.e.dead) {
      seenT -= dt;
      foe = seen;
    }
    joy.x = 0;
    joy.y = 0;
    if (foe) {
      // a fight: aim, keep a distance, strafe
      const off = aimAt(dt, foe.x, foe.y, foe.z);
      setFireHeld(!style.autofire && off < FIRE_CONE);
      const dx = (foe.x - player.x) / Math.max(foe.d, 0.01),
        dz = (foe.z - player.z) / Math.max(foe.d, 0.01),
        ofBoss = foe.e.boss ? play : {},
        keep = foe.d > (ofBoss.far ?? KEEP_FAR) ? 1 : foe.d < (ofBoss.near ?? KEEP_NEAR) ? -1 : 0;
      // Shooting and not hurting it (the shots go into the edge of the deck it stands on: the muzzle is lower than
      // the eye; or into a shield): after a moment it closes in instead of strafing, until a shot tells
      const hp = foe.e.hp + (foe.e.boss ? 0 : (foe.e.shieldHp ?? 0));
      if (foe.e !== shotAt.e || hp < shotAt.hp) shotAt = { e: foe.e, hp, t: 0 };
      else shotAt.t += dt;
      const pushIn = shotAt.t > NO_HIT_AFTER && shotAt.t < NO_HIT_AFTER + PUSH_IN_FOR;
      if (shotAt.t >= NO_HIT_AFTER + PUSH_IN_FOR) shotAt.t = 0;
      const along = pushIn ? 1 : keep,
        across = pushIn ? 0 : strafe;
      if (intoHazard(dx * along + -dz * across, dz * along + dx * across)) strafe = -strafe;
      walk(dx * along + -dz * across, dz * along + dx * across);
      stats.doing = `fight ${foe.e.boss ? foe.e.kind : foe.e.type}`;
      stuckT = 0;
      return;
    }
    setFireHeld(false);
    if (!way) {
      stats.doing = g ? `no way to ${g.what}` : 'nowhere to go';
      return;
    }
    stats.doing = `to ${g!.what}`;
    // a boss that hides is run down: a dash along the way to it, with a dash's worth of stamina kept for dodging
    if (play.chase && boss && g!.what.startsWith('find ') && canDash() && player.st >= TUNE.dashCost * 2) {
      walk(way.x, way.z);
      controlState.dashReq = true;
      return;
    }
    // on its way: look where it walks
    if (way.x || way.z) {
      player.yaw = turnToward(player.yaw, angleTo(way.x, way.z), style.turn * dt);
      player.pitch = turnToward(player.pitch, 0, style.turn * dt);
    }
    // stuck against something (a corner, a crate): sidestep for a moment
    stuckT += dt;
    if (stuckT >= STUCK_AFTER) {
      if (Math.hypot(player.x - stuckAt.x, player.z - stuckAt.z) < STUCK_MOVED && (way.x || way.z)) {
        unstickT = UNSTICK_FOR;
        unstickSide = -unstickSide;
        stats.stuck++;
      }
      stuckT = 0;
      stuckAt = { x: player.x, z: player.z };
    }
    if (unstickT > 0) {
      unstickT -= dt;
      walk(-way.z * unstickSide + way.x * 0.3, way.x * unstickSide + way.z * 0.3);
    } else walk(way.x, way.z);
  }
  return { step, stats, style };
}
export type Bot = ReturnType<typeof createBot>;

// the bot at the controls (null = a person): it plays one frame before the game's own systems, in every mode (it
// has chips to choose while the game waits)
let playing: Bot | null = null;
let hooked = false;
export function setBot(bot: Bot | null) {
  playing = bot;
  if (!bot) {
    joy.x = 0;
    joy.y = 0;
    setFireHeld(false);
  }
  if (hooked) return;
  hooked = true;
  addSystem({ name: 'bot', order: -10, update: dt => playing?.step(dt) });
}
