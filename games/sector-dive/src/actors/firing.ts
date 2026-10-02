import type { Enemy, HitSphere } from '../data/types.ts';
import type { AimTarget } from '../world/entities.ts';
import { clamp, rand } from '@engine/core/util.ts';
import { sfx } from '@engine/audio/audio.ts';
import { UP, V3, camera, scene } from '@engine/render/render.ts';
import { burst } from '@engine/render/fx.ts';
import { hasLOS } from '@engine/world/tiles.ts';
import { joy, keys } from '@engine/ui/input.ts';
import { RATE_OPT_MUL, RELOAD_OPT_MUL, SPLIT_FAN, WEAPONS } from '../data/weapons.ts';
import { ASSIST } from '../data/progress.ts';
import { save } from '../core/save.ts';
import { enemies, spawnPBullet, target } from '../world/entities.ts';
import { screenFx } from '../ui/hud.ts';
import { player, currentWeapon } from './player.ts';
import { blastRadius, magSize, shotCount, splitMul, weaponOptCount, wDmgMul } from './weapons.ts';
import { GUNFX, curVM } from './viewmodel.ts';

// ---- tuning numbers used only here ----
// aim
const FOG_VISIBLE_SHARE = 0.6; // you can make enemies out this far into the fog
const VISIBLE_RANGE_MAX = 56; // ... and never farther than this (m)
const MIN_AIM_CONE = 0.012; // the aim cone never gets narrower than this (rad)
const MIN_TARGET_DIST = 0.1; // targets closer than this are ignored (m)
const TARGET_R_SHRINK = 0.85; // share of a target's hit radius counted as aimable
const NO_TARGET_AIM_DIST = 40; // aim point distance when nothing is targeted (m)
// firing
const MOVE_SPREAD_STICK = 0.2; // stick push that counts as moving (for the moving spread)
const EXTRA_PELLET_SPREAD = 0.02; // extra spread for pellets added by split-shot
const MOVING_SPREAD = 0.014; // extra spread while moving (weapons that aren't steady)
const GUNKICK_MAX = 0.2; // recoil cap
const KICK_BLAST = 0.2,
  KICK_SPREAD = 0.12,
  KICK_SINGLE = 0.05; // recoil per shot: rocket, pellets / rail, other
const FLASH_BLAST = 0.09,
  FLASH_NORMAL = 0.05; // muzzle flash seconds: rocket, other
const SHAKE_BLAST_FIRE = 0.18,
  SHAKE_PELLET_FIRE = 0.06; // screen shake when firing a rocket / pellets

export function lookDir() {
  return new V3(
    -Math.sin(player.yaw) * Math.cos(player.pitch),
    Math.sin(player.pitch),
    -Math.cos(player.yaw) * Math.cos(player.pitch),
  );
}

// hit spheres: multi-body bosses list their parts, everything else is one sphere at the mesh
export function spheres(e: Enemy): HitSphere[] {
  return e.parts || [{ p: e.mesh.position, r: e.hitR }];
}
// how far you can actually make enemies out: 60% of the way into the fog
export const visibleRange = () =>
  Math.min(
    VISIBLE_RANGE_MAX,
    (scene.fog as THREE.Fog).near + ((scene.fog as THREE.Fog).far - (scene.fog as THREE.Fog).near) * FOG_VISIBLE_SHARE,
  );
// target for autofire, aim assist and the red crosshair: in the aim cone, in line of sight, and not hidden in fog
export function findTarget(): AimTarget | null {
  const f = lookDir(),
    cp = camera.position,
    cone = Math.max(ASSIST[save.settings.assist] || 0, MIN_AIM_CONE),
    maxD = visibleRange();
  let best: AimTarget | null = null,
    bestS = Infinity;
  for (const e of enemies) {
    if (e.dead) continue;
    for (const sp of spheres(e)) {
      const ep = sp.p,
        ex = ep.x - cp.x,
        ey = ep.y - cp.y,
        ez = ep.z - cp.z,
        d = Math.hypot(ex, ey, ez);
      if (d > maxD || d < MIN_TARGET_DIST) continue;
      const a = Math.acos(clamp((ex * f.x + ey * f.y + ez * f.z) / d, -1, 1)),
        s = a - Math.atan((sp.r * TARGET_R_SHRINK) / d);
      if (s < cone && s < bestS && hasLOS(cp.x, cp.z, ep.x, ep.z, cp.y, ep.y)) {
        best = { e, p: ep };
        bestS = s;
      }
    }
  }
  return best;
}

export function tryFire() {
  if (player.reloadT > 0) return;
  const w = currentWeapon();
  if (w.mag <= 0) {
    startReload();
    return;
  }
  fire();
}
export function startReload() {
  const w = currentWeapon();
  if (player.reloadT > 0 || w.mag >= magSize(w)) return;
  const reloadTime = WEAPONS[w.id].reload * player.reloadMul * Math.pow(RELOAD_OPT_MUL, weaponOptCount('reload'));
  player.reloadMax = reloadTime;
  player.reloadT = reloadTime;
  sfx('reload');
}
export let shotId = 0; // one trigger pull; knockback is applied once per shot per enemy
export function fire() {
  shotId++;
  const w = currentWeapon(),
    def = WEAPONS[w.id];
  player.fireCd += (def.rate / player.fireRate) * Math.pow(RATE_OPT_MUL, weaponOptCount('rate')); // added, not set: the frame loop may fire more than once (update)
  w.mag--;
  camera.updateMatrixWorld();
  camera.updateMatrixWorld();
  const mz = curVM!.userData.tip.getWorldPosition(new V3()).applyMatrix4(camera.matrixWorld); // gun space -> world
  const cp = camera.position,
    f = lookDir();
  let aim: THREE.Vector3;
  if (target) {
    const tp = target.p,
      d = cp.distanceTo(tp),
      straight = cp.clone().addScaledVector(f, d);
    const lvl = save.settings.assist;
    aim = lvl === 'strong' ? tp.clone() : lvl === 'weak' ? straight.lerp(tp, 0.5) : straight;
  } else aim = cp.clone().addScaledVector(f, NO_TARGET_AIM_DIST);
  const base = aim.sub(mz).normalize();
  const n = shotCount(def);
  const dmg = def.dmg * wDmgMul(w) * player.dmgMul * splitMul(def);
  const blast = blastRadius(def);
  const moving = Math.hypot(joy.x, joy.y) > MOVE_SPREAD_STICK || keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD;
  const fanStep = n > 1 ? Math.min(SPLIT_FAN.step, SPLIT_FAN.max / (n - 1)) : 0;
  for (let k = 0; k < n; k++) {
    const d = base.clone();
    if (player.extra > 0 && def.pellets === 1) d.applyAxisAngle(UP, (k - (n - 1) / 2) * fanStep);
    const s = def.spread + (k >= def.pellets ? EXTRA_PELLET_SPREAD : 0) + (moving && !def.steady ? MOVING_SPREAD : 0);
    d.x += rand(-s, s);
    d.y += rand(-s, s) * 0.7;
    d.z += rand(-s, s);
    d.normalize();
    spawnPBullet(
      mz,
      d,
      def.speed,
      dmg,
      (def.pierce || 0) + player.pierce + weaponOptCount('pierce'),
      blast,
      def.color,
      def.grav || 0,
      {
        far: def.far,
        farMul: def.farMul,
        kb: def.kb,
        rail: !!def.pierce,
        shot: shotId,
      },
    );
  }
  GUNFX.gunKick = Math.min(
    GUNKICK_MAX,
    GUNFX.gunKick + (def.blast ? KICK_BLAST : def.pellets > 1 || def.pierce ? KICK_SPREAD : KICK_SINGLE),
  );
  GUNFX.flashT = def.blast ? FLASH_BLAST : FLASH_NORMAL;
  if (def.blast) {
    screenFx.shake = Math.max(screenFx.shake, SHAKE_BLAST_FIRE);
    burst(mz.x, mz.y, mz.z, 0x9aa3ad, 6, 2, 0.8, -2);
  } else if (def.pellets > 1) screenFx.shake = Math.max(screenFx.shake, SHAKE_PELLET_FIRE);
  sfx(w.id, 40);
  if (w.mag <= 0) startReload();
}
