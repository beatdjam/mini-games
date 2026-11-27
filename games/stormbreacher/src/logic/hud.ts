// The values the HUD shows, built from the GameModel. Nothing here reads three or the DOM, so a node test can run it.
// view/hud.ts draws them. There is no heat.
import { ENEMIES, type EnemyKind } from '../data/enemies.ts';
import { CHARGE_TUNE } from '../data/charge.ts';
import { PAYOFFS, PAYOFF_TUNE } from '../data/payoff.ts';
import { CALLOUT_TUNE, RADIO_TUNE, OBJECTIVE_COUNT } from '../data/script.ts';
import { TARGET_CHARGE_ONLY, TARGET_HP } from '../data/props.ts';
import { HUD_TUNE, MECH_TUNE } from '../data/tune.ts';
import type { TargetKind } from '../data/types.ts';
import { WEAPONS, type WeaponId } from '../data/weapons.ts';
import { blastTarget, nearBlast, targetStands } from './blasts.ts';
import { pillboxShot } from './blastMarks.ts';
import type { Aabb } from './fire.ts';
import { armoured } from './battery.ts';
import { frontOf } from './front.ts';
import { enemyBox, type GameModel } from './game.ts';
import { inCircle } from './hazards.ts';
import type { WeaponState } from './weapons.ts';

export interface HudAmmo {
  id: WeaponId;
  ammo: number;
  max: number; // WEAPONS[id].ammo
}

// angle: deg from the mech's front, or from the screen's top when the view passes its azimuth, + to the right; dist: 0
// at the centre, 1 at the edge
export interface HudRadarMark {
  kind: TargetKind | EnemyKind | 'blast'; // `blast` is a pillbox's blast point (SB-2017)
  angle: number;
  dist: number;
}

// A point on the radar, as `bearing` gives it (angle in degrees, distance as a share of the radar's range). A front line
// is two of these, one at each side of the map; a point past the edge is clipped by the view.
export interface HudRadarPoint {
  angle: number;
  dist: number;
}

export interface HudFront {
  a: HudRadarPoint;
  b: HudRadarPoint;
}

export interface HudModel {
  boost: number; // 0-1, the mech's gauge
  armor: number; // 0-1, game.armor / MECH_TUNE.armor
  main: HudAmmo;
  sub: HudAmmo;
  objective: { key: string; count: { done: number; total: number } | null } | null; // the script's objective (`obj.<id>`); count is set for the objectives in OBJECTIVE_COUNT; null before the script names one
  optional: { key: string; distance: number } | null; // the side goal (the depot) once the leader asks; distance is on the ground (m)
  radio: string | null; // the language key of the radio line on screen while it is within RADIO_TUNE.minSec, else null
  callout: string | null; // the language key of the short order near the aim (SB-2028): the on-screen radio line's `callout` for CALLOUT_TUNE.sec, and never while a shell warning shows; else null
  lock: Aabb | null; // the box of the target or enemy `enemy` describes, for the lock frame; null when `enemy` is
  enemy: { kind: TargetKind | EnemyKind; ratio: number } | null; // the living target or enemy the soft FCS pulls toward (game.aimTarget); ratio is hp / TARGET_HP[kind] or hp / ENEMIES[kind].hp; a charge-only target (a pillbox) is never shown
  radar: HudRadarMark[]; // the living targets and enemies within HUD_TUNE.radarRange, and the pillboxes' blast points
  front: HudFront; // the line the allies hold, as two points across the map (SB-2010)
  headline: string | null; // the short heading a milestone puts up (`m1.breach`), or null
  warning: 'shell' | null; // 'shell' while the mech stands inside a warned shell's blast, else null
  use: { key: 'hud.use'; progress: number } | null; // the use prompt near a blast point; progress is the hold, 0-1
  charge: { left: number; total: number } | null; // the first planted charge's fuse left and its full length (s)
  melee: boolean; // the "melee (Q)" hint under the aim circle when both guns are empty
}

const DEG = 180 / Math.PI;

// How the place (x, z) sits from the mech: the angle from `yaw`'s front in degrees (+ to the right) and the distance
// (m). The front is (-sin yaw, -cos yaw) and its right is (cos yaw, -sin yaw) on the ground plane; a target's place is
// the middle of its box. `yaw` is the mech's own unless the view passes the screen's azimuth (a fixed-azimuth camera),
// so the radar turns with the screen there.
function bearing(game: GameModel, x: number, z: number, yaw = game.mech.yaw): { angle: number; dist: number } {
  const mech = game.mech;
  const dx = x - mech.x;
  const dz = z - mech.z;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const ahead = dx * -sin + dz * -cos;
  const side = dx * cos - dz * sin;
  return { angle: Math.atan2(side, ahead) * DEG, dist: Math.hypot(dx, dz) };
}

// One weapon as the HUD shows it: the id, the shots left and the most a sortie loads.
function hudAmmo(weapon: WeaponState): HudAmmo {
  return { id: weapon.id, ammo: weapon.ammo, max: WEAPONS[weapon.id].ammo };
}

// The short heading a milestone put up, while it is within PAYOFF_TUNE.headlineSec of its cue. The cue's time is the
// script's own clock, so a checkpoint or a suspend that brings the cue back brings the heading with it.
function headlineOf(game: GameModel): string | null {
  for (const def of Object.values(PAYOFFS)) {
    if (def.headline === null || def.flag === null) continue;
    if (!game.script.flags.includes(def.flag)) continue;
    const fired = game.script.fired[def.cue];
    if (fired !== undefined && game.time - fired <= PAYOFF_TUNE.headlineSec) return def.headline;
  }
  return null;
}

// The front line as two points on the radar: the ends of the line across the map's width. The view clips the stretch to
// the radar's circle, so a line behind the mech or past the edge shows only where it crosses the dial.
function radarFront(game: GameModel, yaw: number): HudFront {
  const front = frontOf(game.script.flags);
  const a = bearing(game, game.map.bounds.minX, front.z, yaw);
  const b = bearing(game, game.map.bounds.maxX, front.z, yaw);
  const range = HUD_TUNE.radarRange;
  return {
    a: { angle: a.angle, dist: a.dist / range },
    b: { angle: b.angle, dist: b.dist / range },
  };
}

export function hudModel(game: GameModel, viewYaw?: number): HudModel {
  const yaw = viewYaw ?? game.mech.yaw;
  const living = game.targets.filter(target => target.hp > 0);

  const aimed = game.targets.find(target => target.id === game.aimTarget);
  const aimedEnemy = game.enemies.find(placed => placed.id === game.aimTarget);
  let enemy: HudModel['enemy'] = null;
  let lock: Aabb | null = null;
  // A target only a charge breaks (a pillbox) or one behind its plate is never the aim target; if one is named anyway, no
  // bar and no frame.
  if (aimed && aimed.hp > 0 && !TARGET_CHARGE_ONLY[aimed.kind] && !armoured(game.shutters, aimed.id)) {
    enemy = { kind: aimed.kind, ratio: aimed.hp / TARGET_HP[aimed.kind] };
    lock = aimed.box;
  } else if (aimedEnemy && aimedEnemy.hp > 0) {
    enemy = { kind: aimedEnemy.kind, ratio: aimedEnemy.hp / ENEMIES[aimedEnemy.kind].hp };
    lock = enemyBox(aimedEnemy);
  }

  const radar: HudRadarMark[] = [];
  const marks = [
    ...living.map(target => ({
      kind: target.kind,
      x: (target.box.minX + target.box.maxX) / 2,
      z: (target.box.minZ + target.box.maxZ) / 2,
    })),
    ...game.enemies.filter(placed => placed.hp > 0).map(placed => ({ kind: placed.kind, x: placed.x, z: placed.z })),
    // A pillbox's points are the ones the player must find behind the box: the radar marks them like an objective until
    // their charge is planted or their pillbox falls (SB-2017). The lines' points are left off, so the small dial keeps
    // the four the player is looking for apart from the six the lines already show.
    ...game.blasts
      .filter(blast => {
        if (blast.blasted) return false;
        if (blastTarget(game.map, blast.id) === undefined) return false;
        if (game.charges.some(charge => charge.blast === blast.id)) return false;
        // a pillbox's points show on the small map only once it has been shot (SB-2022)
        if (!pillboxShot(game, blastTarget(game.map, blast.id) ?? '')) return false;
        return targetStands(blast, game);
      })
      .map(blast => ({ kind: 'blast' as const, x: blast.x, z: blast.z })),
  ];
  for (const mark of marks) {
    const { angle, dist } = bearing(game, mark.x, mark.z, yaw);
    if (dist > HUD_TUNE.radarRange) continue;
    radar.push({ kind: mark.kind, angle, dist: dist / HUD_TUNE.radarRange });
  }

  const id = game.script.objective;
  let objective: HudModel['objective'] = null;
  if (id !== null) {
    const names = OBJECTIVE_COUNT[id];
    const counted = names === undefined ? [] : game.targets.filter(target => names.includes(target.id));
    objective = {
      key: `obj.${id}`,
      count:
        counted.length === 0 ? null : { done: counted.filter(target => target.hp <= 0).length, total: counted.length },
    };
  }
  const radio = game.radio;
  const warning: HudModel['warning'] = game.shells.some(shell => inCircle(shell, shell.radius, game.mech))
    ? 'shell'
    : null;
  const callout =
    warning === null && radio?.callout !== undefined && game.time - radio.time < CALLOUT_TUNE.sec
      ? radio.callout
      : null;
  // The side goal: the depot stays worth showing once the shelling has started and while it still stands; the flag, not
  // the walk into the hollow, is what takes it away.
  const depot = game.targets.find(target => target.id === 'depot' && target.hp > 0);
  const started = Object.prototype.hasOwnProperty.call(game.script.fired, 'shelling-start');
  let optional: HudModel['optional'] = null;
  if (depot !== undefined && started && !game.script.flags.includes('depot-down')) {
    const x = (depot.box.minX + depot.box.maxX) / 2;
    const z = (depot.box.minZ + depot.box.maxZ) / 2;
    optional = { key: 'hud.optional.depot', distance: Math.hypot(x - game.mech.x, z - game.mech.z) };
  }
  const near = nearBlast(game.blasts, game.charges, game.mech, game);
  const use =
    near === null
      ? null
      : {
          key: 'hud.use' as const,
          progress:
            game.plant !== null && game.plant.blast === near.id
              ? Math.min(1, game.plant.hold / CHARGE_TUNE.holdSec)
              : 0,
        };
  const planted = game.charges[0];

  return {
    boost: game.mech.gauge,
    armor: game.armor / MECH_TUNE.armor,
    main: hudAmmo(game.main),
    sub: hudAmmo(game.sub),
    objective,
    optional,
    radio: radio !== null && game.time - radio.time < RADIO_TUNE.minSec ? radio.line : null,
    enemy,
    lock,
    radar,
    front: radarFront(game, yaw),
    headline: headlineOf(game),
    warning,
    callout,
    use,
    charge: planted === undefined ? null : { left: Math.max(0, planted.left), total: planted.total },
    melee: game.main.ammo <= 0 && game.sub.ammo <= 0,
  };
}
