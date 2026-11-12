// The values the HUD shows, built from the GameModel. Nothing here reads three or the DOM, so a node test can run it.
// view/hud.ts draws them. The armour is always full because the mech has no health yet (SB-190), and there is no heat.
import { TARGET_HP } from '../data/props.ts';
import { HUD_TUNE } from '../data/tune.ts';
import type { TargetKind } from '../data/types.ts';
import { WEAPONS, type WeaponId } from '../data/weapons.ts';
import type { GameModel, TargetState } from './game.ts';
import type { WeaponState } from './weapons.ts';

export interface HudAmmo {
  id: WeaponId;
  ammo: number;
  max: number; // WEAPONS[id].ammo
}

// angle: deg from the mech's front, + to the right; dist: 0 at the centre, 1 at the edge
export interface HudRadarMark {
  kind: TargetKind;
  angle: number;
  dist: number;
}

export interface HudModel {
  boost: number; // 0-1, the mech's gauge
  armor: number; // 0-1; always 1 until the mech has health (SB-190)
  main: HudAmmo;
  sub: HudAmmo;
  objective: { key: string; done: number; total: number }; // key: a language key; done and total count HUD_TUNE.objectiveKind
  enemy: { kind: TargetKind; ratio: number } | null; // the living target the soft FCS pulls toward (game.aimTarget); ratio is hp / TARGET_HP[kind]
  radar: HudRadarMark[]; // the living targets within HUD_TUNE.radarRange
}

const DEG = 180 / Math.PI;

// How the target sits from the mech: the angle from the mech's front in degrees (+ to the right) and the distance (m).
// The mech's front is (-sin yaw, -cos yaw) and its right is (cos yaw, -sin yaw) on the ground plane; a target's place is
// the middle of its box.
function bearing(game: GameModel, target: TargetState): { angle: number; dist: number } {
  const mech = game.mech;
  const dx = (target.box.minX + target.box.maxX) / 2 - mech.x;
  const dz = (target.box.minZ + target.box.maxZ) / 2 - mech.z;
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
  const enemy: HudModel['enemy'] =
    aimed && aimed.hp > 0 ? { kind: aimed.kind, ratio: aimed.hp / TARGET_HP[aimed.kind] } : null;

  const radar: HudRadarMark[] = [];
  for (const target of living) {
    const { angle, dist } = bearing(game, target);
    if (dist > HUD_TUNE.radarRange) continue;
    radar.push({ kind: target.kind, angle, dist: dist / HUD_TUNE.radarRange });
  }

  const counted = game.targets.filter(target => target.kind === HUD_TUNE.objectiveKind);

  return {
    boost: game.mech.gauge,
    armor: 1,
    main: hudAmmo(game.main),
    sub: hudAmmo(game.sub),
    objective: {
      key: HUD_TUNE.objectiveKey,
      done: counted.filter(target => target.hp <= 0).length,
      total: counted.length,
    },
    enemy,
    radar,
  };
}
