// The values the HUD shows, built from the GameModel. Nothing here reads three or the DOM, so a node test can run it.
// view/hud.ts draws them. There is no heat.
import { ENEMIES, type EnemyKind } from '../data/enemies.ts';
import { CHARGE_TUNE } from '../data/charge.ts';
import { RADIO_TUNE, OBJECTIVE_COUNT } from '../data/script.ts';
import { TARGET_HP } from '../data/props.ts';
import { HUD_TUNE, MECH_TUNE } from '../data/tune.ts';
import type { TargetKind } from '../data/types.ts';
import { WEAPONS, type WeaponId } from '../data/weapons.ts';
import { nearBlast } from './blasts.ts';
import type { Aabb } from './fire.ts';
import { enemyBox, type GameModel } from './game.ts';
import { inCircle } from './hazards.ts';
import type { WeaponState } from './weapons.ts';

export interface HudAmmo {
  id: WeaponId;
  ammo: number;
  max: number; // WEAPONS[id].ammo
}

// angle: deg from the mech's front, + to the right; dist: 0 at the centre, 1 at the edge
export interface HudRadarMark {
  kind: TargetKind | EnemyKind;
  angle: number;
  dist: number;
}

export interface HudModel {
  boost: number; // 0-1, the mech's gauge
  armor: number; // 0-1, game.armor / MECH_TUNE.armor
  main: HudAmmo;
  sub: HudAmmo;
  objective: { key: string; count: { done: number; total: number } | null } | null; // the script's objective (`obj.<id>`); count is set for the objectives in OBJECTIVE_COUNT; null before the script names one
  radio: string | null; // the language key of the radio line on screen while it is within RADIO_TUNE.minSec, else null
  lock: Aabb | null; // the box of the target or enemy `enemy` describes, for the lock frame; null when `enemy` is
  enemy: { kind: TargetKind | EnemyKind; ratio: number } | null; // the living target or enemy the soft FCS pulls toward (game.aimTarget); ratio is hp / TARGET_HP[kind] or hp / ENEMIES[kind].hp
  radar: HudRadarMark[]; // the living targets and enemies within HUD_TUNE.radarRange
  warning: 'shell' | null; // 'shell' while the mech stands inside a warned shell's blast, else null
  use: { key: 'hud.use'; progress: number } | null; // the use prompt near a blast point; progress is the hold, 0-1
  charge: { left: number; total: number } | null; // the first planted charge's fuse left and its full length (s)
}

const DEG = 180 / Math.PI;

// How the place (x, z) sits from the mech: the angle from the mech's front in degrees (+ to the right) and the distance
// (m). The mech's front is (-sin yaw, -cos yaw) and its right is (cos yaw, -sin yaw) on the ground plane; a target's
// place is the middle of its box.
function bearing(game: GameModel, x: number, z: number): { angle: number; dist: number } {
  const mech = game.mech;
  const dx = x - mech.x;
  const dz = z - mech.z;
  const sin = Math.sin(mech.yaw);
  const cos = Math.cos(mech.yaw);
  const ahead = dx * -sin + dz * -cos;
  const side = dx * cos - dz * sin;
  return { angle: Math.atan2(side, ahead) * DEG, dist: Math.hypot(dx, dz) };
}

// One weapon as the HUD shows it: the id, the shots left and the most a sortie loads.
function hudAmmo(weapon: WeaponState): HudAmmo {
  return { id: weapon.id, ammo: weapon.ammo, max: WEAPONS[weapon.id].ammo };
}

export function hudModel(game: GameModel): HudModel {
  const living = game.targets.filter(target => target.hp > 0);

  const aimed = game.targets.find(target => target.id === game.aimTarget);
  const aimedEnemy = game.enemies.find(placed => placed.id === game.aimTarget);
  let enemy: HudModel['enemy'] = null;
  let lock: Aabb | null = null;
  if (aimed && aimed.hp > 0) {
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
  ];
  for (const mark of marks) {
    const { angle, dist } = bearing(game, mark.x, mark.z);
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
    radio: radio !== null && game.time - radio.time < RADIO_TUNE.minSec ? radio.line : null,
    enemy,
    lock,
    radar,
    warning: game.shells.some(shell => inCircle(shell, shell.radius, game.mech)) ? 'shell' : null,
    use,
    charge: planted === undefined ? null : { left: Math.max(0, planted.left), total: CHARGE_TUNE.fuse },
  };
}
