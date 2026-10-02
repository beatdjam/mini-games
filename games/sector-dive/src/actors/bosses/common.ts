import type { Boss, Laser } from '../../data/types.ts';
import * as THREE from 'three';
import { clamp, el } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { sfx } from '@engine/audio/audio.ts';
import { setMusic } from '@engine/audio/music.ts';
import { V3, dynGroup } from '@engine/render/render.ts';
import { burst, fireball } from '@engine/render/fx.ts';
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
  spawnEnemyObj,
} from '../../world/entities.ts';
import { damageScaleAt, stageInfo, tierLabel } from '../../core/stages.ts';
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
    baseEI: 0.3,
    x: cx,
    z: cz - 6,
    y,
    hp,
    maxHp: hp,
    hitR,
    r: 1.8,
    t: 0,
    timer: 2.2,
    pat: -1,
    patIdx: 0,
    pt: 0,
    shots: 0,
    acc: 0,
    dmg: 10 * damageScaleAt(run.stage),
    cx,
    cz,
    behave,
    flash: 0,
    room: -1,
    active: true,
    def: { r: 1.8 },
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
  eBullets.forEach(b => {
    b.alive = false;
    b.mesh.visible = false;
  });
  toast(t('boss.phase2'), 2000);
}
// candidates per sector are listed in BIOMES[].bosses; each boss lives in src/actors/bosses/<name>.ts
export function spawnBoss(kind: string) {
  if (!run.practice && !save.bossSeen[kind]) {
    recordBossSeen(kind);
    persist();
  } // practice doesn't count as an encounter
  const spawn = (
    {
      watcher: spawnWatcher,
      crusher: spawnCrusher,
      core: spawnCore,
      phantom: spawnPhantom,
      trinity: spawnTrinity,
      bastion: spawnBastion,
    } as Record<string, () => void>
  )[kind]!;
  spawn();
  setMusic(level.biome.code, true); // boss arrangement of this sector's theme
}
export function bossDown(e: Boss) {
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
  eBullets.forEach(b => {
    b.alive = false;
    b.mesh.visible = false;
  });
  query('wave').forEach(w => {
    w.dead = true;
  }); // a shockwave still spreading must not kill the player after the win
  if (run.practice) {
    // practice: no rewards, no progress; just a way home
    makePortal(e.cx, e.cz - 2, COLOR.cyan, 'extract', t('boss.toBase'));
    el('#bossBar').hidden = true;
    setBoss(null);
    run.cleared = true;
    toast(t('boss.practiceWon'), 2600);
    return;
  }
  (run.bosses = run.bosses || []).push(e.kind);
  track('boss_defeated', { target: e.kind, level: stageInfo(run.stage).tier + 1 });
  dropBits(e.x, e.z, 45 * bossDifficulty());
  addPickup('chip', e.cx, e.cz + 4);
  addPickup('kit', e.cx + 2, e.cz + 5);
  const roll = Math.random() + progressOf(run.stage) * 0.03;
  addPickup('weapon', e.cx - 2, e.cz + 5, { w: rollWeapon(progressOf(run.stage) + 2, roll > 0.9 ? 2 : 1) });
  makePortal(e.cx + 6, e.cz - 2, COLOR.amber, 'next', t('boss.forward'));
  makePortal(e.cx - 6, e.cz - 2, COLOR.cyan, 'extract', t('boss.extract'));
  el('#bossBar').hidden = true;
  setBoss(null);
  recordBossKill();
  if (stageInfo(run.stage).tier >= 2 && !save.canReboot) {
    unlockReboot();
    setTimeout(() => toast(t('boss.rebootUnlocked'), 4200), 4400);
  }
  const newTier = stageInfo(run.stage).tier + 1;
  recordPeak(newTier);
  if (newTier > save.shortcut) {
    openShortcut(newTier);
    toast(t('boss.shortcut', { tier: tierLabel(newTier) }), 4200);
  } else toast(t('boss.choose'), 3200);
  persist();
}

// ---- aimed laser line (sniper enemy, Phantom) ----
// ---- shared helpers for aimed lasers ----
export function makeLaser(color: number): Laser {
  const lg = new THREE.BufferGeometry().setFromPoints([new V3(), new V3()]);
  const l = new THREE.Line(lg, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 }));
  l.visible = false;
  l.frustumCulled = false;
  dynGroup.add(l);
  return l;
}
export function setLaser(l: Laser, a: number[], b: number[], op: number) {
  const p = l.geometry.attributes.position;
  p.setXYZ(0, a[0], a[1], a[2]);
  p.setXYZ(1, b[0], b[1], b[2]);
  p.needsUpdate = true;
  l.material.opacity = op;
  l.visible = true;
}
