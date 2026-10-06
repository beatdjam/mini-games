import { addSystem } from '@engine/core/loop.ts';
import { OPPOSITE_SIDE, SIDE_STEP, activeTileGrid, hasLOS, tileCenter, tileIndex } from '@engine/world/tiles.ts';
import { camera } from '@engine/render/render.ts';
import { joy, setFireHeld } from '@engine/ui/input.ts';
import type { Enemy } from '../data/types.ts';
import { save } from '../core/save.ts';
import { toggleSetting } from '../core/progress.ts';
import { player, run } from '../actors/player.ts';
import { spheres } from '../actors/firing.ts';
import { boss, enemies } from '../world/entities.ts';
import { building } from '../world/building.ts';
import { level } from '../world/level.ts';
import { state } from '../flow/state.ts';
import { useKit } from '../ui/input.ts';
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
}
export const BOT_STYLES: Record<string, BotStyle> = {
  // goes straight along the route, aims well
  rusher: { name: 'rusher', autofire: true, turn: 9, aimError: 0.015, fightRange: 22, after: 'extract' },
};

// ---- tuning numbers used only here ----
const KEEP_FAR = 16; // in a fight it closes in from beyond this (m)
const KEEP_NEAR = 6; // ... and backs off inside this
const STRAFE_FLIP = 0.9; // it changes the side it strafes to this often (s)
const AIM_WANDER = 0.35; // its aim error is drawn again this often (s)
const KIT_BELOW = 0.4; // it uses a kit under this share of its health
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

// what a run came to, for the tables (sim/bot.sim.ts)
export interface BotStats {
  frames: number; // frames played (60 a second)
  damage: number; // health lost, kits and regeneration aside
  minHp: number; // the lowest its health went, as a share of the most
  kits: number; // kits used
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

  // the steps from every tile to tile `goal`, walking as a person walks (ramps and decks count; a locked door is
  // walked up to, not through)
  function pathTo(goal: number, key: string) {
    if (goalKey === key) return;
    goalKey = key;
    const grid = activeTileGrid(),
      { W, H, grid: floor } = grid.world;
    dist = new Int32Array(W * H).fill(-1);
    const queue = [goal];
    dist[goal] = 0;
    for (let h = 0; h < queue.length; h++) {
      const c = queue[h]!,
        ci = c % W,
        cj = Math.floor(c / W);
      SIDE_STEP.forEach(([a, b], side) => {
        if (!grid.inBounds(ci + a, cj + b)) return;
        const n = c + a + b * W;
        if (floor[n] !== 1 || dist[n]! >= 0) return;
        // (walking n -> c; the goal itself may be a locked door: its neighbours still lead to it)
        if (c !== goal && !grid.passable(n, c, OPPOSITE_SIDE[side]!)) return;
        if (c === goal && !grid.passable(n, c, OPPOSITE_SIDE[side]!) && !grid.world.door?.[c]) return;
        dist[n] = dist[c]! + 1;
        queue.push(n);
      });
    }
  }
  // the way to walk now to get nearer the goal (a unit vector), or null when there is no way from here
  function wayToGoal(): { x: number; z: number } | null {
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
    const dx = tileCenter(next % W) - player.x,
      dz = tileCenter(Math.floor(next / W)) - player.z,
      len = Math.hypot(dx, dz);
    return len < 0.05 ? { x: 0, z: 0 } : { x: dx / len, z: dz / len };
  }
  // walks along (x, z) in the world, whichever way it is looking
  function walk(x: number, z: number) {
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
        if (d > style.fightRange || (best && d >= best.d)) continue;
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

  // where it is going on this floor: the goal tile, and what to call it
  function goal(): { tile: number; what: string } | null {
    const { W } = activeTileGrid().world,
      tileAt = (x: number, z: number) => tileIndex(x, z);
    const gate = level.portals.find(p => p.kind === style.after) ?? level.portals[0];
    if (gate) return { tile: tileAt(gate.x, gate.z), what: `gate ${gate.kind}` };
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
    if (run.bld) stats.floors = Math.max(stats.floors, building ? building.route.indexOf(run.bld.floor) + 1 : 1);
    if (boss) {
      if (stats.bossAt < 0) stats.bossAt = stats.frames;
      stats.bossHp = Math.max(0, boss.hp / boss.maxHp);
    } else if (stats.bossAt >= 0 && level.portals.length) stats.bossHp = 0;
    if (player.hp < player.maxHp * KIT_BELOW && player.kits > 0) {
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

    let g = goal();
    const again = Math.floor(stats.frames / REPATH_FRAMES);
    if (g) pathTo(g.tile, `${level.floor}:${g.tile}:${again}`);
    let way = g ? wayToGoal() : null;
    if (!way) {
      // shut in (a lockdown), or no way on: go for the nearest enemy of the floor
      let near: Enemy | null = null;
      for (const e of enemies)
        if (
          !e.dead &&
          (!near || Math.hypot(e.x - player.x, e.z - player.z) < Math.hypot(near.x - player.x, near.z - player.z))
        )
          near = e;
      if (near) {
        g = { tile: tileIndex(near.x, near.z), what: 'the nearest enemy' };
        pathTo(g.tile, `${level.floor}:${g.tile}:${again}`);
        way = wayToGoal();
      }
    }
    let foe = pickEnemy();
    // getting nowhere (waiting on a lift that will not come, shooting at what it cannot hit): roam a little
    idleT += dt;
    if (idleT >= IDLE_AFTER) {
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
        along = foe.d > KEEP_FAR ? 1 : foe.d < KEEP_NEAR ? -1 : 0;
      walk(dx * along + -dz * strafe, dz * along + dx * strafe);
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
