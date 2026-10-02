import type { Boss, RegularEnemy } from '../../data/types.ts';
import * as THREE from 'three';
import { clamp, el } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { sfx } from '@engine/audio/audio.ts';
import { setMusic } from '@engine/audio/music.ts';
import { dynGroup } from '@engine/render/render.ts';
import { burst, fireball } from '@engine/render/fx.ts';
import { clearPool } from '@engine/world/projectiles.ts';
import { H, T, W } from '@engine/world/tiles.ts';
import { query } from '@engine/core/world.ts';
import { banner, toast } from '@engine/ui/ui.ts';
import { BOSS_META, BOSS_TUNE } from '../../data/bosses.ts';
import { hpGrowth } from '../../data/progress.ts';
import { persist, save } from '../../core/save.ts';
import { openShortcut, recordBossKill, recordBossSeen, recordPeak, unlockReboot } from '../../core/progress.ts';
import { rebootMul, progressOf } from '../../core/rules.ts';
import { level } from '../../world/level.ts';
import { makePortal } from '../../world/portals.ts';
import {
  addPickup,
  dropBits,
  eBullets,
  enemies,
  removeEnemyMesh,
  setBoss,
  spawnEnemy,
  spawnEnemyObj,
} from '../../world/entities.ts';
import { damageScaleAt, difficultyAt, stageInfo, tierLabel } from '../../core/stages.ts';
import { rollWeapon } from '../weapons.ts';
import { run } from '../player.ts';
import { spawnWatcher } from './watcher.ts';
import { spawnCrusher } from './crusher.ts';
import { spawnCore } from './core.ts';
import { spawnPhantom } from './phantom.ts';
import { spawnTrinity } from './trinity.ts';
import { spawnBastion } from './bastion.ts';
import { screenFx } from '../../ui/hud.ts';
import { track } from '@engine/core/analytics.ts';
import { COLOR } from '../../data/colors.ts';
// ================= bosses =================
const BOSS_PHASE_HP = 0.5; // a boss enrages (and enters its next phase) below this share of its health
const PATTERN_COUNT = 3; // attack patterns the bosses with a pat / pt clock cycle through
// the bosses' shared timings and heights
export const FIRST_SHOT_DELAY = 0.3; // a pattern waits this long before its first round (s)
export const RING_Y = 1.3; // height of ring and spiral bullets above the floor (m)
// a boss as bossBase makes it
const BOSS_START_OFFSET_Z = 6; // it appears this far from the arena centre along z (m)
const BOSS_BODY_R = 1.8; // collision radius of the body (m)
const BOSS_DEF_R = 1.8; // r of the boss's `def` (the enemy-def shape the generic enemy code expects) (m)
const BOSS_GLOW = 0.3; // emissive intensity of the body at rest (baseEI)
const BOSS_FIRST_TIMER = 2.2; // starting value of the pattern timer (s); bosses that need another set it in their spawn
const BOSS_BASE_DMG = 10; // attack damage before damageScaleAt
// what a boss drops when it goes down (bossDown)
const BOSS_BITS = 45; // bits dropped before the bossDifficulty multiplier
const BOSS_WEAPON_ROLL_PER_PROGRESS = 0.03; // added to the weapon's lucky roll for each point of progress
const BOSS_WEAPON_LUCKY_ABOVE = 0.9; // a lucky roll above this raises the weapon's minimum rarity
const BOSS_WEAPON_MIN_RARITY = 1; // minimum rarity of the weapon (index into RARITY: 1 = ★★)
const BOSS_WEAPON_LUCKY_RARITY = 2; // minimum rarity on a lucky roll (★★★)
const BOSS_WEAPON_PROGRESS_BONUS = 2; // the weapon is rolled as if this many progress points deeper
const REBOOT_UNLOCK_TIER = 2; // beating the boss of this depth (0-based tier, 2 = DEPTH 3) unlocks the reboot
const REBOOT_TOAST_DELAY = 4400; // the reboot-unlocked toast appears this long after the kill (ms)
const REBOOT_TOAST_MS = 4200; // how long the reboot-unlocked toast stays (ms)
// boss health multiplier: 1.33 x hpMul at the D1 boss (progress 4), then x growth per depth (about 4.0 at D3),
// sliding down to x lateGrowth per depth deeper in (hpGrowth in src/data/progress.ts)
export function bossDifficulty() {
  return (
    1.33 *
    BOSS_TUNE.hpMul *
    hpGrowth((progressOf(run.stage) - 4) / 5, BOSS_TUNE.growth, BOSS_TUNE.lateGrowth) *
    rebootMul()
  );
}
// hp / y (height of the body) / hitR (hit radius) come from BOSS_META; hp is scaled by bossDifficulty
// behave(e, dt) is the boss's own behaviour, called by updateEnemy once it has appeared
// state: the fields only this boss has (its type S is in src/actors/bosses/<name>.ts); they're put on the boss as it's made
export function bossBase<S extends object>(
  kind: string,
  mesh: THREE.Object3D,
  mat: THREE.MeshLambertMaterial,
  behave: (e: Boss & S, dt: number) => void,
  state: S,
): Boss & S {
  const meta = BOSS_META[kind]!,
    name = meta.title ?? kind,
    hp = meta.hp * bossDifficulty(),
    y = meta.y,
    hitR = meta.hitR;
  dynGroup.add(mesh);
  const cx = (W * T) / 2,
    cz = (H * T) / 2;
  // entrance: grows in over introTime, invulnerable and not attacking (spawnT counts down in bossPauseTick); the name goes up big
  const e: Boss & S = {
    boss: true,
    kind,
    name,
    mesh,
    mat,
    baseEI: BOSS_GLOW,
    x: cx,
    z: cz - BOSS_START_OFFSET_Z,
    y,
    hp,
    maxHp: hp,
    hitR,
    r: BOSS_BODY_R,
    t: 0,
    timer: BOSS_FIRST_TIMER,
    pat: -1,
    patIdx: 0,
    pt: 0,
    shots: 0,
    acc: 0,
    dmg: BOSS_BASE_DMG * damageScaleAt(run.stage),
    cx,
    cz,
    behave,
    flash: 0,
    room: -1,
    active: true,
    def: { r: BOSS_DEF_R },
    spawnT: BOSS_TUNE.introTime,
    spawnMax: BOSS_TUNE.introTime,
    intro: true,
    ...state,
  };
  mesh.position.set(e.x, y, e.z);
  spawnEnemyObj(e);
  setBoss(e);
  el('#bossName').textContent = name;
  el('#bossBar').hidden = false;
  const [en, jp] = name.split(' — ');
  banner(en, jp || 'BOSS');
  sfx('beam');
  return e;
}
// while a boss is appearing or switching phase it can't be hurt and doesn't act
export function bossPauseTick(e: Boss, dt: number) {
  e.spawnT -= dt;
  const k = clamp(1 - e.spawnT / e.spawnMax, 0, 1);
  if (e.intro) e.mesh.scale.setScalar(0.25 + 0.75 * k);
  else e.mesh.scale.setScalar(1 + Math.sin(k * Math.PI * 6) * 0.08);
  e.flash = Math.sin(e.t * 30 + k * 20) > 0 ? 0.05 : 0;
  if (e.spawnT <= 0) {
    e.mesh.scale.setScalar(1);
    e.intro = false;
  }
}
// below half health: the boss uses its enraged numbers (*Enr in BOSS_META tune); bossPhase fires at the same point
export function isEnraged(e: Boss): boolean {
  return e.hp < e.maxHp * BOSS_PHASE_HP;
}
// start the next attack pattern: e.pat cycles 0..PATTERN_COUNT-1; the caller sets e.timer (its length) after this
export function nextPattern(e: Boss) {
  e.pat = e.patIdx++ % PATTERN_COUNT;
  e.pt = 0;
  e.shots = 0;
  e.acc = 0;
}
// a drone / crawler / turret the boss calls in; it's awake from the start and belongs to no room
export function spawnMinion(type: string, x: number, z: number): RegularEnemy {
  const m = spawnEnemy(type, x, z, -1, difficultyAt(run.stage));
  m.active = true;
  return m;
}
// how many minions are alive (the boss itself doesn't count)
export function minionCount(): number {
  return enemies.filter(o => !o.boss && !o.dead).length;
}
// drop below half health: short invulnerable burst, then the boss's enraged patterns take over
export function bossPhase(e: Boss) {
  e.phased = true;
  e.spawnT = BOSS_TUNE.phaseTime;
  e.spawnMax = BOSS_TUNE.phaseTime;
  e.intro = false;
  const p = e.mesh.position;
  burst(p.x, p.y, p.z, COLOR.mag, 40, 12, 1.0);
  fireball(p.x, p.y, p.z, 4, COLOR.mag);
  screenFx.shake = Math.max(screenFx.shake, 0.4);
  sfx('bigboom');
  clearPool(eBullets);
  toast(t('boss.phase2'), 2000);
}
// the lookup wraps each call (not the function itself): the boss files import this one, so at load time
// their exports may not exist yet
const BOSS_SPAWNERS: Record<string, () => void> = {
  watcher: () => spawnWatcher(),
  crusher: () => spawnCrusher(),
  core: () => spawnCore(),
  phantom: () => spawnPhantom(),
  trinity: () => spawnTrinity(),
  bastion: () => spawnBastion(),
};
// candidates per sector are listed in BIOMES[].bosses; each boss lives in src/actors/bosses/<name>.ts
export function spawnBoss(kind: string) {
  if (!run.practice && !save.bossSeen[kind]) {
    recordBossSeen(kind);
    persist();
  } // practice doesn't count as an encounter
  BOSS_SPAWNERS[kind]!();
  setMusic(level.biome.code, true); // boss arrangement of this sector's theme
}
// the fight is over: music, shake and sound, then clear the minions, bullets and shockwaves left in the arena
function clearBattle(e: Boss) {
  setMusic(level.biome.code);
  screenFx.shake = 0.6;
  sfx('bigboom');
  if (e.beams)
    e.beams.forEach((b: THREE.Object3D) => {
      b.visible = false;
    });
  enemies.forEach(o => {
    if (!o.dead && !o.boss) {
      o.dead = true;
      burst(o.x, o.mesh.position.y, o.z, o.def.color, 10, 7, 0.6);
      removeEnemyMesh(o);
    }
  });
  clearPool(eBullets);
  query('wave').forEach(w => {
    w.dead = true;
  }); // a shockwave still spreading must not kill the player after the win
}
function hideBossBar() {
  el('#bossBar').hidden = true;
  setBoss(null);
}
// tier: the 0-based depth of this stage (stageInfo(run.stage).tier), progress: progressOf(run.stage)
function giveBossRewards(e: Boss, tier: number, progress: number) {
  run.bosses = run.bosses || [];
  run.bosses.push(e.kind);
  track('boss_defeated', { target: e.kind, level: tier + 1 });
  dropBits(e.x, e.z, BOSS_BITS * bossDifficulty());
  addPickup('chip', e.cx, e.cz + 4);
  addPickup('kit', e.cx + 2, e.cz + 5);
  const roll = Math.random() + progress * BOSS_WEAPON_ROLL_PER_PROGRESS;
  const minRarity = roll > BOSS_WEAPON_LUCKY_ABOVE ? BOSS_WEAPON_LUCKY_RARITY : BOSS_WEAPON_MIN_RARITY;
  addPickup('weapon', e.cx - 2, e.cz + 5, { w: rollWeapon(progress + BOSS_WEAPON_PROGRESS_BONUS, minRarity) });
  makePortal(e.cx + 6, e.cz - 2, COLOR.amber, 'next', t('boss.forward'));
  makePortal(e.cx - 6, e.cz - 2, COLOR.cyan, 'extract', t('boss.extract'));
}
// the kill counts toward the save: reboot unlock, deepest depth, the next shortcut
function recordBossProgress(tier: number) {
  recordBossKill();
  if (tier >= REBOOT_UNLOCK_TIER && !save.canReboot) {
    unlockReboot();
    setTimeout(() => toast(t('boss.rebootUnlocked'), REBOOT_TOAST_MS), REBOOT_TOAST_DELAY);
  }
  const newTier = tier + 1;
  recordPeak(newTier);
  if (newTier > save.shortcut) {
    openShortcut(newTier);
    toast(t('boss.shortcut', { tier: tierLabel(newTier) }), 4200);
  } else toast(t('boss.choose'), 3200);
  persist();
}
export function bossDown(e: Boss) {
  clearBattle(e);
  if (run.practice) {
    // practice: no rewards, no progress; just a way home
    makePortal(e.cx, e.cz - 2, COLOR.cyan, 'extract', t('boss.toBase'));
    hideBossBar();
    run.cleared = true;
    toast(t('boss.practiceWon'), 2600);
    return;
  }
  const tier = stageInfo(run.stage).tier;
  giveBossRewards(e, tier, progressOf(run.stage));
  hideBossBar();
  recordBossProgress(tier);
}
