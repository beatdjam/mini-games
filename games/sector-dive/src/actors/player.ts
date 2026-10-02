import type {
  Biome,
  Enemy,
  HitSphere,
  Player,
  RegularEnemy,
  RunState,
  Weapon,
  WeaponDef,
  WeaponItem,
} from '../data/types.ts';
import type { AimTarget } from '../world/entities.ts';
import { clamp, rand, randi, shuffle } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { sfx } from '@engine/audio/audio.ts';
import { UP, V3, buildViewmodel, camera, gun, scene } from '@engine/render/render.ts';
import { burst, fireball } from '@engine/render/fx.ts';
import { hasLOS, moveCircle } from '@engine/world/tiles.ts';
import { toast } from '@engine/ui/ui.ts';
import { joy, keys } from '@engine/ui/input.ts';
import {
  AFFIX,
  PLUS_DMG,
  RARITY,
  RATE_OPT_MUL,
  RELOAD_OPT_MUL,
  SPLIT_FAN,
  WEAPONS,
  WEAPON_ORDER,
} from '../data/weapons.ts';
import { VIEWMODELS, VM_COLORS } from '../data/viewmodels.ts';
import { ENEMY_TUNE } from '../data/enemies.ts';
import { BIOMES } from '../data/biomes.ts';
import { ASSIST, BAG_MAX, PER, TUNE, enemyGrowth } from '../data/progress.ts';
import { save } from '../core/save.ts';
import { basicNow, pickDrop, rebootMul, progressOf, startDmgMul, startMaxHp } from '../core/rules.ts';
import { roomCount, roomSpot, rooms } from '../world/level.ts';
import { addPickup, dropBits, enemies, removeEnemyMesh, spawnEnemy, spawnPBullet, target } from '../world/entities.ts';
import { bossDown, bossPhase } from './bosses/common.ts';
import { screenFx, hitDirection, hitMark } from '../ui/hud.ts';
import { endRun } from '../flow/run.ts';
import { state } from '../flow/state.ts';
import { COLOR } from '../data/colors.ts';
// ---- tuning numbers used only here ----
// player
const PLAYER_R = 0.45; // body radius (m)
const SPD_UP_PER_LEVEL = 0.05; // move speed per speed upgrade level
const GAIN_UP_PER_LEVEL = 0.15; // bits per gain upgrade level
const REBOOT_GAIN_PER_LEVEL = 0.1; // bits per reboot gain level
const STAM_UP_PER_LEVEL = 20; // max stamina per endurance upgrade level
const REGEN_UP_PER_LEVEL = 0.12; // stamina regen per cooling upgrade level
// weapon drops
const RARITY_STAGE_BONUS = 0.025; // rarity roll bonus per stage (deeper drops lean rarer)
const RARITY_BONUS_MAX = 0.6; // ... up to this
const RARITY_3_AT = 1.05; // roll above this gives rarity 2 (3 stars)
const RARITY_2_AT = 0.68; // roll above this gives rarity 1 (2 stars)
const PLUS_FROM_STAGE = 2.5; // weapons start getting a + value from this stage
const PLUS_STAGE_OFFSET = 2; // stages before the + level starts climbing
const PLUS_PER_STAGE = 0.6; // + level climbs this much per stage
const PLUS_OVER_CHANCE = 0.15; // chance of a + above that level
const PLUS_OVER_MORE = 0.3; // chance of each further step above it
const PLUS_BELOW_MAX = 2; // otherwise up to this many below it
const AFFIX1_FROM_STAGE = 5,
  AFFIX1_BASE = 0.35,
  AFFIX1_PER_STAGE = 0.04; // first option: from this stage, chance, chance per stage after
const AFFIX2_FROM_STAGE = 10,
  AFFIX2_BASE = 0.3,
  AFFIX2_PER_STAGE = 0.03; // second option: the same
// difficulty scaling
const STAGES_PER_GROWTH_DEPTH = 5; // progress (progressOf) per step of the enemy health growth curve
const DMG_SCALE_PER_PROG = 0.045; // damage taken grows this much per progress
// weapon option and chip effects
const MAG_OPT_PER_LEVEL = 0.3; // magazine size per mag option
const SPLIT_DMG_PER_CHIP = 0.2; // total damage per split-shot chip
const CRIT_PER_OPT = 0.08; // crit chance per crit option
const PIERCE_BLAST_PER_LEVEL = 0.15; // rocket blast radius per pierce level
export const CRIT_MUL = 2; // crit damage multiplier
const LEECH_OPT_HP = 2; // HP per kill from each leech option
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
// being hit and hitting
const HIT_SHAKE = 0.22; // screen shake when the player is hurt
const HIT_VIGNETTE = 0.9; // damage vignette strength when hurt
const ENEMY_FLASH = 0.07; // seconds an enemy flashes white when hit
const BOSS_PHASE_HP = 0.5; // a boss enters its next phase below this share of its health
// explosions
const BLAST_SHAKE = 0.5; // rocket blast screen shake at point-blank
const BLAST_SHAKE_DIST = 30; // ... fades out by this distance (m)
const BLAST_SHAKE_MIN = 0.25; // ... but never below this share
const BLAST_SELF_R = 0.6; // share of the radius that hurts the player
const BLAST_SELF_DMG = 7; // damage to the player there (x damageScaleAt)
const BLAST_Y_SQUASH = 0.6; // height differences count this much in blast distance
const BLAST_BODY_SHRINK = 0.5; // share of a hit sphere's radius taken off the blast distance
const BLAST_CORE = 0.4; // share of the radius that takes full damage
const BLAST_EDGE_LOSS = 0.7; // damage lost at the very edge
const BLAST_PUSH = 0.8; // rocket blast knockback on enemies (m)
const BLAST_PUSH_FLASH = 0.2; // seconds those flash
// bomber
const BOMBER_SHAKE = 0.2; // screen shake from a bomber blast
const BOMBER_PLAYER_R = 3.4; // blast radius on the player (m)
const BOMBER_PLAYER_DY = 2.5; // ... and the height difference it still reaches (m)
const BOMBER_ENEMY_R = 3.2; // blast radius on other enemies (m)
const BOMBER_ENEMY_DMG = 35; // blast damage on other enemies (before depth scaling)
const BOMBER_DEATH_DMG = 0.6; // share of its damage when a bomber is shot dead
// kills and rewards
const KILL_BITS_MUL = 0.6; // share of an enemy's bits dropped
const KILL_BITS_PER_PROG = 0.05; // more bits per progress
const KIT_DROP_SPREAD = 0.5; // a dropped kit lands this far from the enemy (m)
const CHAIN_R_BASE = 2.5,
  CHAIN_R_PER = 0.5; // chain blast radius: base + per chip (m)
const CHAIN_DMG = 18; // chain blast damage per chip
const SPLIT_KIDS = 2; // enemies a splitter breaks into
const SPLIT_OFFSET = 0.6; // the halves appear this far to each side (m)
const ROOM_KIT_OFFSET = 0.8; // a cleared room puts the kit / bits this far to each side of its centre (m)
const ROOM_BITS_BASE = 6; // bits from a cleared room (+ progress)
// The player and the run exist only during a run; on the base screen they are null (setPlayer(null) / setRun(null)).
// They are typed without null because nearly all code using them runs during a run; code that can also run
// on the base screen checks them (if (player) ..., run && ...).
// replaced only through setPlayer / setRun
export let player = null as unknown as Player;
export let run = null as unknown as RunState;
export function setPlayer(p: Player | null) {
  player = p as Player;
}
export function setRun(r: RunState | null) {
  run = r as RunState;
}
export const newWeapon = (id: string, r: number, basic?: boolean, plus?: number, opts?: string[]): Weapon => ({
  id,
  r,
  basic: !!basic,
  plus: plus || 0,
  opts: opts || [],
  mag: WEAPONS[id].mag,
});
// how many of option k a weapon has (the one in hand if none given)
export const weaponOptCount = (k: string, w?: WeaponItem | null): number => {
  w = w || (player && player.weapons[player.cur]);
  return w && w.opts ? w.opts.filter(o => o === k).length : 0;
};
export const wDmgMul = (w: WeaponItem): number => RARITY[w.r].mult * (1 + PLUS_DMG * (w.plus || 0));
// `stage` here is progress (progressOf), not the raw stage number
export function rollWeapon(stage: number, minR?: number): Weapon {
  // deeper drops lean rarer, up to a point (+0.6): even deep down about 55% are ★★★, 37% ★★ and 8% ★, so rarity still matters
  const roll = Math.random() + Math.min(stage * RARITY_STAGE_BONUS, RARITY_BONUS_MAX);
  const r = Math.max(minR || 0, roll > RARITY_3_AT ? 2 : roll > RARITY_2_AT ? 1 : 0);
  let plus = 0;
  // no cap: the stage level climbs 0.6 per stage (about +3 per sector).
  // Usually at or a little below that level; above it only 15% of the time, each further step 30%.
  if (stage >= PLUS_FROM_STAGE) {
    const lv = Math.floor((stage - PLUS_STAGE_OFFSET) * PLUS_PER_STAGE);
    if (Math.random() < PLUS_OVER_CHANCE) {
      let over = 1;
      while (Math.random() < PLUS_OVER_MORE) over++;
      plus = lv + over;
    } else plus = Math.max(0, lv - randi(0, PLUS_BELOW_MAX));
  }
  let n = 0;
  if (stage >= AFFIX1_FROM_STAGE && Math.random() < AFFIX1_BASE + (stage - AFFIX1_FROM_STAGE) * AFFIX1_PER_STAGE) n++;
  if (stage >= AFFIX2_FROM_STAGE && Math.random() < AFFIX2_BASE + (stage - AFFIX2_FROM_STAGE) * AFFIX2_PER_STAGE) n++;
  return newWeapon(pickDrop(), r, false, plus, shuffle(Object.keys(AFFIX)).slice(0, n));
}
export function newPlayer(loadout: (WeaponItem | null)[]): Player {
  const u = save.up,
    pu = save.pres.up,
    hp = startMaxHp(u.hp);
  const ws = loadout.map(basicNow).map(w => (w ? newWeapon(w.id, w.r, w.basic, w.plus, w.opts) : null));
  return {
    x: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    hp,
    maxHp: hp,
    r: PLAYER_R,
    baseSpeed: TUNE.moveSpeed,
    spdMul: 1 + u.spd * SPD_UP_PER_LEVEL,
    dmgMul: startDmgMul(u.dmg),
    fireRate: 1,
    gainMul: (1 + u.gain * GAIN_UP_PER_LEVEL) * (1 + pu.gain * REBOOT_GAIN_PER_LEVEL),
    leech: 0,
    pierce: 0,
    extra: 0,
    crit: 0,
    chain: 0,
    magnet: 1,
    reloadMul: 1,
    magMul: 1,
    st: TUNE.stamina + (u.stam || 0) * STAM_UP_PER_LEVEL,
    stMax: TUNE.stamina + (u.stam || 0) * STAM_UP_PER_LEVEL,
    stRegen: TUNE.staminaRegen * (1 + u.dash * REGEN_UP_PER_LEVEL),
    stDelay: 0,
    inv: 0,
    dashT: 0,
    ddx: 0,
    ddz: 0,
    weapons: ws,
    cur: 0,
    bag: Array(BAG_MAX).fill(null),
    kits: TUNE.kitStart + u.kit,
    reloadT: 0,
    reloadMax: 1,
    fireCd: 0,
    tile: -1,
    bob: 0,
    fy: 0,
    vy: 0,
  };
}
// each run walks the sectors in its own shuffled order (run.route); depth (tier) drives difficulty
export const routeBiome = (t: number): Biome =>
  BIOMES[run && run.route ? run.route[t % run.route.length] : t % BIOMES.length];
export const stageInfo = (s: number) => {
  const tier = Math.floor(s / PER);
  return { biome: routeBiome(tier), sub: s % PER, loop: Math.floor(tier / 3), tier };
};
export const isBossStage = (s: number): boolean => s % PER === PER - 1;
export function stageLabel(s: number): string {
  const si = stageInfo(s);
  return `D${si.tier + 1} ${isBossStage(s) ? 'BOSS' : si.sub + 1 + '/' + (PER - 1)}`;
}
export function tierLabel(t: number): string {
  return `DEPTH ${t + 1}`;
}
export const difficultyAt = (s: number): number =>
  ENEMY_TUNE.hpMul * enemyGrowth(progressOf(s) / STAGES_PER_GROWTH_DEPTH) * rebootMul();
// how much harder things hit at stage s: enemies, bosses, hazard floors and your own rockets all grow by this
export const damageScaleAt = (s: number): number => (1 + progressOf(s) * DMG_SCALE_PER_PROG) * rebootMul();
export const kitHealAmount = (): number => Math.round(Math.max(TUNE.kitHeal, player.maxHp * TUNE.kitHealPct));
// chipMag: share of the magazine chips' effect a weapon gets (the launcher only half, so it can't double its output)
export const magSize = (w: WeaponItem): number => {
  const def = WEAPONS[w.id],
    chip = 1 + (player.magMul - 1) * (def.chipMag ?? 1);
  return Math.max(1, Math.round(def.mag * chip * (1 + MAG_OPT_PER_LEVEL * weaponOptCount('mag', w))));
};
// rarity only; whether it's a base (never-lost) weapon is shown separately where it matters (bag, loadout)
export const rarLabel = (w: WeaponItem): string => `${RARITY[w.r].stars}${RARITY[w.r].name}`;
export const weaponName = (w: WeaponItem): string =>
  `<span style="color:${w.r ? RARITY[w.r].css : 'inherit'}">${WEAPONS[w.id].name}${w.plus ? '+' + w.plus : ''}</span><em style="color:${RARITY[w.r].css}">${rarLabel(w)}</em>`;
export const weaponText = (w: WeaponItem): string =>
  t('weapon.text', {
    name: WEAPONS[w.id].name + (w.plus ? '+' + w.plus : ''),
    rar: rarLabel(w),
    opts: w.opts && w.opts.length ? w.opts.map(o => AFFIX[o].name).join(t('share.join')) : '',
  });
// split-shot: each chip adds one projectile and +20% total damage, shared across all projectiles,
// so a full hit gains the same +20% per chip whether the weapon fires 1 round or 8 pellets
// rounds per trigger pull; a weapon with maxShots (the launcher: 3 rockets) puts the split-shot bonus past that into
// each round instead, so its blasts don't flood a corridor
export const shotCount = (def: WeaponDef): number => Math.min(def.pellets + player.extra, def.maxShots ?? Infinity);
export const splitMul = (def: WeaponDef): number =>
  (def.pellets * (1 + SPLIT_DMG_PER_CHIP * player.extra)) / shotCount(def);
export const critChance = (w?: WeaponItem): number =>
  Math.min(TUNE.critCap, player.crit + CRIT_PER_OPT * weaponOptCount('crit', w));
// rockets burst on the first hit, so pierce bonuses widen the blast instead (+15% radius each)
export const blastRadius = (def: WeaponDef, w?: WeaponItem): number =>
  def.blast ? def.blast * (1 + PIERCE_BLAST_PER_LEVEL * (player.pierce + weaponOptCount('pierce', w))) : 0;
// Effective numbers for a weapon with the player's current chips / upgrades and the weapon's own options.
// dps = sustained damage per second on one target, including reloads and average crits. What it leaves out is given
// apart: farDps = the rail's dps on targets past `far` metres; blast = the rocket's blast radius (every enemy caught
// in it takes the hit, up to full damage near the centre).
export function weaponStats(w: WeaponItem) {
  const def = WEAPONS[w.id];
  const perHit = def.dmg * wDmgMul(w) * player.dmgMul * splitMul(def);
  const hits = shotCount(def);
  const interval = (def.rate / player.fireRate) * Math.pow(RATE_OPT_MUL, weaponOptCount('rate', w));
  const mag = magSize(w);
  const reload = def.reload * player.reloadMul * Math.pow(RELOAD_OPT_MUL, weaponOptCount('reload', w));
  const dps = ((perHit * hits * mag) / (mag * interval + reload)) * (1 + critChance(w));
  return {
    perHit,
    hits,
    mag,
    interval,
    dps,
    far: def.far || 0,
    farDps: def.far ? dps * def.farMul! : 0,
    blast: blastRadius(def, w),
  };
}
export const weaponOptsHTML = (w: WeaponItem): string =>
  w.opts && w.opts.length ? `<span class="wopt">${w.opts.map(o => AFFIX[o].text).join(' / ')}</span>` : '';

// the gun in hand per weapon, from src/data/viewmodels.ts
export const viewmodelGroups: Record<string, THREE.Group> = {};
WEAPON_ORDER.forEach(id => {
  const g = buildViewmodel(VIEWMODELS[id], Object.assign({ acc: WEAPONS[id].color }, VM_COLORS));
  g.visible = false;
  gun.add(g);
  viewmodelGroups[id] = g;
});
// the gun in hand: recoil and muzzle flash timers
export const GUNFX = { gunKick: 0, flashT: 0 };
// the viewmodel shown (none until the first weapon is set)
export let curVM: THREE.Group | null = null;
export function setVM(id: string) {
  if (curVM) {
    curVM.visible = false;
    curVM.userData.flash.visible = false;
  }
  const vm = (curVM = viewmodelGroups[id]);
  vm.visible = true;
}

// the weapon in hand; during a run there always is one (normalizeWeapons keeps slot 0 filled)
export const currentWeapon = (): Weapon => player.weapons[player.cur]!;
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
  player.reloadMax = player.reloadT =
    WEAPONS[w.id].reload * player.reloadMul * Math.pow(RELOAD_OPT_MUL, weaponOptCount('reload'));
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

// from: where the hit came from (the attacker or the blast), for the direction arc; none for floors and your own blasts
export function damagePlayer(d: number, from?: { x: number; z: number }) {
  if (player.inv > 0 || state !== 'play') return;
  player.hp -= d;
  player.inv = TUNE.hitInvuln;
  screenFx.shake = Math.max(screenFx.shake, HIT_SHAKE);
  screenFx.vig = HIT_VIGNETTE;
  sfx('hurt', 80);
  if (from) hitDirection(from.x, from.z);
  if (player.hp <= 0) {
    player.hp = 0;
    endRun('dead');
  }
}

export function hurtEnemy(e: Enemy, dmg: number, isCrit: boolean) {
  if (e.dead) return;
  if (e.boss && e.spawnT > 0) {
    burst(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z, 0xffffff, 2, 3, 0.2);
    return;
  }
  if (e.invuln) {
    if (!e.hinted) {
      e.hinted = true;
      toast(t('run.shielded'), 2400);
    }
    burst(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z, COLOR.shield, 2, 4, 0.2);
    return;
  }
  if (e.stunMul) dmg *= e.stunMul;
  e.hp -= dmg;
  e.flash = ENEMY_FLASH;
  if (!e.active) {
    e.active = true;
    if (e.room >= 0)
      enemies.forEach(o => {
        if (o.room === e.room) o.active = true;
      });
  }
  hitMark(isCrit);
  sfx('hit', 45);
  if (e.hp <= 0) killEnemy(e);
  else if (e.boss && !e.phased && e.hp < e.maxHp * BOSS_PHASE_HP) bossPhase(e);
}
// player explosions (rockets, chain blasts); one crit roll per explosion
export function explode(x: number, y: number, z: number, radius: number, dmg: number, color: number, big?: boolean) {
  const crit = Math.random() < critChance();
  if (crit) dmg *= CRIT_MUL;
  if (big) {
    // kept small and short so a blast near you doesn't hide what's behind it
    fireball(x, y, z, radius * 0.5, COLOR.orange);
    fireball(x, y, z, radius * 0.28, 0xfff2c0);
    burst(x, y, z, COLOR.fire, 26, 12, 0.6);
    burst(x, y, z, COLOR.amber, 10, 7, 0.45);
    burst(x, y + 0.5, z, 0x5b6470, 6, 2.5, 0.7, -3);
    sfx('bigboom', 60);
    const pd = Math.hypot(player.x - x, player.z - z);
    screenFx.shake = Math.max(screenFx.shake, BLAST_SHAKE * clamp(1 - pd / BLAST_SHAKE_DIST, BLAST_SHAKE_MIN, 1));
    if (pd < radius * BLAST_SELF_R && state === 'play') damagePlayer(BLAST_SELF_DMG * damageScaleAt(run.stage));
  } else {
    burst(x, y, z, color || COLOR.fire, 22, 9, 0.7);
    burst(x, y, z, 0xffffff, 8, 5, 0.4);
    sfx('boom', 60);
    screenFx.shake = Math.max(screenFx.shake, 0.12);
  }
  for (const e of enemies.slice()) {
    // enemies spawned by this blast's kills aren't hit by it
    if (e.dead) continue;
    let dd = Infinity;
    for (const sp of spheres(e)) {
      const q = sp.p;
      dd = Math.min(dd, Math.hypot(q.x - x, (q.y - y) * BLAST_Y_SQUASH, q.z - z) - sp.r * BLAST_BODY_SHRINK);
    }
    if (dd < radius) {
      const core = radius * BLAST_CORE,
        fall = dd <= core ? 1 : 1 - ((dd - core) / (radius - core)) * BLAST_EDGE_LOSS;
      hurtEnemy(e, dmg * fall, crit);
      if (big && !e.boss && !e.dead) {
        const kx = e.x - x,
          kz = e.z - z,
          kl = Math.hypot(kx, kz) || 1;
        moveCircle(e, (kx / kl) * BLAST_PUSH, (kz / kl) * BLAST_PUSH, e.r);
        e.flash = BLAST_PUSH_FLASH;
      }
    }
  }
}
// bomber blast: hurts the player and any enemy caught in it
export function bomberBlast(x: number, y: number, z: number, dmg: number) {
  burst(x, y, z, COLOR.bomber, 26, 10, 0.7);
  burst(x, y, z, 0xffffff, 8, 5, 0.3);
  fireball(x, y, z, 3, COLOR.orange);
  sfx('boom', 40);
  screenFx.shake = Math.max(screenFx.shake, BOMBER_SHAKE);
  if (Math.hypot(player.x - x, player.z - z) < BOMBER_PLAYER_R && Math.abs(player.fy + 1 - y) < BOMBER_PLAYER_DY)
    damagePlayer(dmg, { x, z });
  // the blast on other enemies grows with enemy health, so it still matters deep down
  const hit = (BOMBER_ENEMY_DMG * difficultyAt(run.stage)) / ENEMY_TUNE.hpMul;
  for (const o of enemies.slice())
    if (!o.dead && !o.boss && Math.hypot(o.x - x, o.z - z) < BOMBER_ENEMY_R) hurtEnemy(o, hit, false);
}
export function detonate(e: RegularEnemy) {
  e.detonated = true;
  killEnemy(e, true);
  bomberBlast(e.x, e.mesh.position.y, e.z, e.dmg);
}
let inChainBlast = false;
export function killEnemy(e: Enemy, noReward?: boolean) {
  e.dead = true;
  if (!noReward) run.kills++;
  const pos = e.mesh.position;
  burst(pos.x, pos.y, pos.z, e.boss ? COLOR.mag : e.def.color, e.boss ? 60 : 14, e.boss ? 14 : 8, e.boss ? 1.4 : 0.7);
  removeEnemyMesh(e);
  sfx('kill', 30);
  if (e.boss) {
    bossDown(e);
    return;
  }
  if (e.def.bomber && !e.detonated) {
    e.detonated = true;
    bomberBlast(e.x, pos.y, e.z, e.dmg * BOMBER_DEATH_DMG);
  }
  if (!noReward) {
    dropBits(e.x, e.z, e.def.bits * KILL_BITS_MUL * (1 + progressOf(run.stage) * KILL_BITS_PER_PROG));
    if (Math.random() < TUNE.kitDropChance)
      addPickup('kit', e.x + rand(-KIT_DROP_SPREAD, KIT_DROP_SPREAD), e.z + rand(-KIT_DROP_SPREAD, KIT_DROP_SPREAD));
    const lh = player.leech + LEECH_OPT_HP * weaponOptCount('leech');
    if (lh) player.hp = Math.min(player.maxHp, player.hp + lh);
    // chain blast: only enemies you killed explode; kills caused by a chain blast don't set off another one
    if (player.chain && !inChainBlast) {
      inChainBlast = true;
      // damage grows with depth at the same rate as enemy health, so the chip stays useful deep down
      const depthScale = enemyGrowth(progressOf(run.stage) / STAGES_PER_GROWTH_DEPTH);
      explode(
        pos.x,
        pos.y,
        pos.z,
        CHAIN_R_BASE + player.chain * CHAIN_R_PER,
        CHAIN_DMG * player.chain * player.dmgMul * depthScale,
        COLOR.amber,
      );
      inChainBlast = false;
    }
  }
  // splitter: the halves appear after any blast from this kill, so they aren't wiped out by it
  if (e.def.split) {
    for (let k = 0; k < SPLIT_KIDS; k++) {
      const m = spawnEnemy(
        'mini',
        e.x + (k ? SPLIT_OFFSET : -SPLIT_OFFSET),
        e.z + rand(-0.4, 0.4),
        e.room,
        difficultyAt(run.stage),
      );
      m.active = true;
    }
    if (e.room >= 0) roomCount[e.room] += SPLIT_KIDS;
  }
  if (e.room >= 0 && --roomCount[e.room] === 0) roomCleared(e.room);
}
export function roomCleared(idx: number) {
  const [x, z] = roomSpot(rooms[idx]);
  if (Math.random() < TUNE.chipChance) {
    addPickup('chip', x, z);
    toast(t('run.clearedChip'));
  } else {
    addPickup('kit', x - ROOM_KIT_OFFSET, z);
    dropBits(x + ROOM_KIT_OFFSET, z, ROOM_BITS_BASE + progressOf(run.stage));
    toast(t('run.cleared'));
  }
}
