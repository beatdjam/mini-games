import type { Boss, BossKind, Enemy, RegularEnemy } from '../../data/types.ts';
import * as THREE from 'three';
import { clamp, el } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { sfx } from '@engine/audio/audio.ts';
import { setMusic } from '@engine/audio/music.ts';
import { dynGroup } from '@engine/render/render.ts';
import { burst, fireball } from '@engine/render/fx.ts';
import { clearPool } from '@engine/world/projectiles.ts';
import { floorY, tileIndex } from '@engine/world/tiles.ts';
import { query } from '@engine/core/world.ts';
import { banner, toast } from '@engine/ui/ui.ts';
import { BOSS_META, BOSS_TUNE } from '../../data/bosses.ts';
import { BOSS_ROOM_ORDER } from '../../data/bossRooms.ts';
import { hpGrowth, isMilestone } from '../../data/progress.ts';
import { persist, save } from '../../core/save.ts';
import { openShortcut, recordBossKill, recordBossRoomBeaten, recordBossSeen, recordPeak } from '../../core/progress.ts';
import { progressOf } from '../../core/rules.ts';
import { bossAreaOn } from '../../core/bossArea.ts';
import { arenaCenter, level } from '../../world/level.ts';
import { BOSS_POOL_SIDE } from '../../world/models/bosses/shared.ts';
import { bossHullMat, groundPool } from '../../world/models/machine.ts';
import { plainLooks } from '../../world/looks.ts';
import { onBossDown } from '../../flow/events.ts';
import { RUN_KINDS } from '../../flow/runKind.ts';
import { makePortal, makeTerminal } from '../../world/portals.ts';
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
import { spawnHoist } from './hoist.ts';
import { spawnSurgeon } from './surgeon.ts';
import { screenFx } from '../../ui/hud.ts';
import { track } from '@engine/core/analytics.ts';
import { COLOR } from '../../data/colors.ts';
// ================= bosses =================
// the bosses' shared timings and heights
export const FIRST_SHOT_DELAY = 0.3; // a pattern waits this long before its first round (s)
export const RING_Y = 1.3; // height of ring and spiral bullets above the floor (m)
export const LAND_DY = 1.5; // a landing crushes a player whose feet are this close to the floor it lands on (m)
// a boss as createBoss makes it
const BOSS_START_OFFSET_Z = 6; // it appears this far from the arena centre along z (m)
const BOSS_BODY_R = 1.8; // collision radius of the body (m)
const BOSS_DEF_R = 1.8; // r of the boss's `def` (the enemy-def shape the generic enemy code expects) (m)
const BOSS_GLOW = 0.3; // emissive intensity of the body at rest (baseEI)
const BOSS_FIRST_TIMER = 2.2; // starting value of the pattern timer (s); bosses that need another set it in their spawn
const BOSS_BASE_DMG = 10; // attack damage before damageScaleAt
const BOSS_WEAPON_ROLL_PER_PROGRESS = 0.03; // added to the weapon's lucky roll for each point of progress
const BOSS_WEAPON_LUCKY_ABOVE = 0.9; // a lucky roll above this raises the weapon's minimum rarity
const BOSS_WEAPON_MIN_RARITY = 1; // minimum rarity of the weapon (index into RARITY: 1 = ★★)
const BOSS_WEAPON_LUCKY_RARITY = 2; // minimum rarity on a lucky roll (★★★)
const BOSS_WEAPON_PROGRESS_BONUS = 2; // the weapon is rolled as if this many progress points deeper
const BOSS_BEATEN_TOAST_MS = 2600; // the "beaten n/8" toast (ms)
// boss health multiplier: 1.33 x hpMul at the D1 boss (progress 4), then x growth per depth (about 4.0 at D3),
// sliding down to x lateGrowth per depth deeper in (hpGrowth in src/data/progress.ts)
export function bossDifficulty() {
  return 1.33 * BOSS_TUNE.hpMul * hpGrowth((progressOf(run.stage) - 4) / 5, BOSS_TUNE.growth, BOSS_TUNE.lateGrowth);
}
// the body material of a boss: a near-black base colour that glows in the boss's own colour (at rest: BOSS_GLOW)
// (with the looks on: a machine's hull plate with a little of that colour in it, world/models/machine.ts)
export function bossMaterial(dark: number, emissive: number): THREE.MeshLambertMaterial {
  if (!plainLooks()) return bossHullMat(emissive);
  return new THREE.MeshLambertMaterial({ color: dark, emissive, emissiveIntensity: BOSS_GLOW });
}
// the edge lines drawn over a body mesh
export function wireOutline(geo: THREE.BufferGeometry, color: number): THREE.LineSegments {
  return new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color }));
}
// What a boss looks like: its body and the material that glows in its colour (and flashes when hit). Each boss makes
// it in its <name>Visual() from nothing of the game's state (no run, level or scene), so that it can also be shown on
// its own; spawning it is what puts it in the arena. A look's material may carry userData.glow (a lower glow at rest)
// and userData.pool (the colour of the pool of light it stands in: world/models/machine.ts bossHullMat)
export interface BossVisual {
  mesh: THREE.Group;
  mat: THREE.MeshLambertMaterial;
}
// how a boss is put in the arena (createBoss)
export interface BossSpawn<S extends object> {
  kind: BossKind;
  look: BossVisual;
  behave: (e: Boss & S, dt: number) => void; // its own behaviour, called by updateEnemy once it has appeared
  state: S; // the fields only this boss has (its type S is in src/actors/bosses/<name>.ts)
  hint: [key: string, ms: number]; // its hint on how to fight it (bossHint)
  centred?: boolean; // it starts in the arena's middle (bossPauseTick moves the body there as it comes in)
  timer?: number; // its first pattern comes after this (s; BOSS_FIRST_TIMER when not given)
  pool?: false; // no pool of light under it, even with a look (HOIST: the floor under the magnet carries its shadow)
  extra?: THREE.Object3D[]; // meshes of its own already in the scene, removed with it (as its pool is)
  onDown?: (e: Boss & S) => void; // when it goes down, after its meshes are removed
}
// hp / y (height of the body) / hitR (hit radius) come from BOSS_META; hp is scaled by bossDifficulty
export function createBoss<S extends object>(o: BossSpawn<S>): Boss & S {
  const { kind, behave, state } = o,
    { mesh, mat } = o.look;
  if (o.pool === false) delete mat.userData.pool;
  const meta = BOSS_META[kind],
    name = meta.title ?? kind,
    hp = meta.hp * bossDifficulty(),
    y = meta.y,
    hitR = meta.hitR;
  dynGroup.add(mesh);
  const [cx, cz] = arenaCenter();
  // entrance: grows in over introTime, invulnerable and not attacking (spawnT counts down in bossPauseTick); the name goes up big
  const e: Boss & S = {
    boss: true,
    kind,
    name,
    mesh,
    mat,
    baseEI: mat.userData.glow ?? BOSS_GLOW, // (a look's body glows less: world/models/bosses/shared.ts)
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
    phase: 0,
    ...state,
  };
  mesh.position.set(e.x, y, e.z);
  // a look's boss stands in a pool of its colour on the ground (kept under it by updateEnemy; it goes with the boss)
  if (mat.userData.pool !== undefined) {
    const pool = groundPool(mat.userData.pool, BOSS_POOL_SIDE);
    dynGroup.add(pool);
    e.pool = pool;
    e.extra = [pool];
    poseBossPool(e);
  }
  spawnEnemyObj(e);
  setBoss(e);
  el('#bossName').textContent = name;
  el('#bossBar').hidden = false;
  const [en, jp] = name.split(' — ');
  banner(en, jp || 'BOSS');
  sfx('beam');
  if (o.centred) {
    e.x = cx;
    e.z = cz;
  }
  if (o.timer !== undefined) e.timer = o.timer;
  if (o.extra) e.extra = [...(e.extra ?? []), ...o.extra];
  const down = o.onDown;
  if (down) e.onDown = () => down(e);
  bossHint(...o.hint);
  return e;
}
// while a boss is appearing or switching phase it can't be hurt and doesn't act. It appears where it will start to
// move: its own spawn may put it somewhere else than createBoss did at first (the arena's middle, a warp spot, its flight path),
// and its body would jump there on the first frame it acts
export function bossPauseTick(e: Boss, dt: number) {
  e.spawnT -= dt;
  const k = clamp(1 - e.spawnT / e.spawnMax, 0, 1);
  if (e.intro) {
    e.mesh.scale.setScalar(0.25 + 0.75 * k);
    e.mesh.position.x = e.x;
    e.mesh.position.z = e.z;
  } else e.mesh.scale.setScalar(1 + Math.sin(k * Math.PI * 6) * 0.08);
  e.flash = Math.sin(e.t * 30 + k * 20) > 0 ? 0.05 : 0;
  if (e.spawnT <= 0) {
    e.mesh.scale.setScalar(1);
    e.intro = false;
  }
}
// keeps a boss's pool of light on the ground under its body (the body floats, bobs and jumps)
const BOSS_POOL_Y = 0.08; // above the ground, and above the enemies' pools and the bullets'
export function poseBossPool(e: Boss) {
  const at = e.mesh.position;
  e.pool?.position.set(at.x, floorY(at.x, at.z) + BOSS_POOL_Y, at.z);
}
// how many of BOSS_TUNE.phases the boss's health has passed: 0 = the first phase, 1 = the second, ...
export function phaseOf(e: Boss): number {
  return BOSS_TUNE.phases.filter(t => e.hp < e.maxHp * t).length;
}
// below the first boundary: the boss uses its enraged numbers (*Enr in BOSS_META tune)
export function isEnraged(e: Boss): boolean {
  return phaseOf(e) > 0;
}
// the next phase begins when its health passes a boundary, once the attack it is in the air in is over
export function checkPhase(e: Boss) {
  if (!e.aloft && e.hp > 0 && phaseOf(e) > e.phase) bossPhase(e);
}
// start the next attack pattern: e.pat cycles 0..BOSS_TUNE.patternCount-1; the caller sets e.timer (its length) after this
export function nextPattern(e: Boss) {
  e.pat = e.patIdx++ % BOSS_TUNE.patternCount;
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
// how many minions are alive (the boss itself doesn't count). In a building only the enemies in the boss room count:
// the ones left in the other rooms of the floor are not the boss's, and must not fill its cap
export function minionCount(): number {
  return enemies.filter(o => !o.boss && !o.dead && inArena(o)).length;
}
// the room the boss fights in: the boss room of a building floor, the one room of a boss arena
export const arenaRoom = () => level.rooms[level.hall ? level.hall.room : 0]!;
// drop below half health: short invulnerable burst, then the boss's enraged patterns take over
export function bossPhase(e: Boss) {
  e.phase++;
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
const BOSS_SPAWNERS: Record<BossKind, () => void> = {
  watcher: () => spawnWatcher(),
  crusher: () => spawnCrusher(),
  core: () => spawnCore(),
  phantom: () => spawnPhantom(),
  trinity: () => spawnTrinity(),
  bastion: () => spawnBastion(),
  hoist: () => spawnHoist(),
  surgeon: () => spawnSurgeon(),
};
// the boss being spawned is met for the first time, or in boss practice (there to learn it): its hint is shown
let hintDue = false;
// candidates per sector are listed in BIOMES[].bosses; each boss lives in src/actors/bosses/<name>.ts
export function spawnBoss(kind: BossKind) {
  const practice = run.kind === 'practice';
  hintDue = practice || !save.bossSeen[kind];
  if (!practice && !save.bossSeen[kind]) {
    recordBossSeen(kind);
    persist();
  } // practice doesn't count as an encounter
  BOSS_SPAWNERS[kind]();
  setMusic(level.biome.code, true); // boss arrangement of this sector's theme
}
// a boss's hint on how to fight it (a toast): only when the boss is met for the first time, and in boss practice
export function bossHint(key: string, ms: number) {
  if (hintDue) toast(t(key), ms);
}
// is the enemy in the boss's arena: anywhere in a boss arena, inside the boss room on a building floor (the enemies
// in the floor's other rooms have nothing to do with the fight)
function inArena(o: Enemy): boolean {
  return !level.hall || level.roomOf[tileIndex(o.x, o.z)] === level.hall.room;
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
    if (!o.dead && !o.boss && inArena(o)) {
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
// progress: progressOf(run.stage)
function giveBossRewards(e: Boss, progress: number) {
  run.bosses = run.bosses || [];
  run.bosses.push(e.kind);
  track('boss_defeated', { target: e.kind, level: stageInfo(run.stage).tier + 1 });
  dropBits(e.x, e.z, BOSS_TUNE.bits * BOSS_TUNE.bitsKept * bossDifficulty());
  addPickup('chip', e.cx, e.cz + 4);
  addPickup('kit', e.cx + 2, e.cz + 5);
  const roll = Math.random() + progress * BOSS_WEAPON_ROLL_PER_PROGRESS;
  const minRarity = roll > BOSS_WEAPON_LUCKY_ABOVE ? BOSS_WEAPON_LUCKY_RARITY : BOSS_WEAPON_MIN_RARITY;
  addPickup('weapon', e.cx - 2, e.cz + 5, { w: rollWeapon(progress + BOSS_WEAPON_PROGRESS_BONUS, minRarity) });
}
// the gates round (cx, cz), the middle of the arena, once the boss of depth `tier` is down: forward and back to base,
// and at a milestone a terminal between them, where the dive's bits buy levels (screens/levelup.ts). Also when the
// player comes back to the boss room's floor after the fight (flow/events.ts resetFloorEvents)
export function putBossGates(cx: number, cz: number, tier: number) {
  makePortal(cx + 6, cz - 2, COLOR.amber, 'next', t('boss.forward'));
  makePortal(cx - 6, cz - 2, COLOR.cyan, 'extract', t('boss.extract'));
  if (isMilestone(tier)) makeTerminal(cx, cz - 2, COLOR.lime, t('boss.terminal'));
}
// a beaten boss room's gate, at (cx, cz) in the middle of the room: back to the hall, where the run goes on
export function putRoomGates(cx: number, cz: number) {
  makePortal(cx, cz - 2, COLOR.cyan, 'hall', t('boss.toHall'));
}
// what saves the run once a boss room's boss is down: flow/suspend.ts checkpoint, handed over by main.ts. flow/suspend.ts
// reaches this file through flow/run.ts, so importing it from here would close a cycle
let saveBeatenRoom = () => {};
export function setSaveBeatenRoom(fn: () => void) {
  saveBeatenRoom = fn;
}
// the kill counts toward the save: deepest depth, the next shortcut
function recordBossProgress(tier: number) {
  recordBossKill();
  const newTier = tier + 1;
  recordPeak(newTier);
  if (newTier > save.shortcut) {
    openShortcut(newTier);
    toast(t('boss.shortcut', { tier: tierLabel(newTier) }), 4200);
  } else toast(t('boss.choose'), 3200);
  persist();
}
export function bossDown(e: Boss) {
  e.onDown?.();
  clearBattle(e);
  if (!RUN_KINDS[run.kind].rewards) {
    // practice: no rewards, no progress; just a way home
    makePortal(e.cx, e.cz - 2, COLOR.cyan, 'extract', t('boss.toBase'));
    hideBossBar();
    run.cleared = true;
    toast(t('boss.practiceWon'), 2600);
    return;
  }
  const tier = stageInfo(run.stage).tier;
  // a boss room of the boss area: the same rewards the first time, only its bits after that, and no shortcut (the
  // room beaten is kept in the save, so a death or a resume does not take it back)
  if (bossAreaOn() && stageInfo(run.stage).area && run.area?.at === 'room') {
    const first = recordBossRoomBeaten(run.area.boss);
    onBossDown(); // the room's door opens again
    putRoomGates(e.cx, e.cz);
    if (first) {
      giveBossRewards(e, progressOf(run.stage));
      recordBossKill();
      toast(
        t('boss.beatenCount', { n: save.records.bossArea?.beaten.length ?? 0, max: BOSS_ROOM_ORDER.length }),
        BOSS_BEATEN_TOAST_MS,
      );
    } else {
      dropBits(e.x, e.z, BOSS_TUNE.bits * BOSS_TUNE.bitsKept * bossDifficulty());
      track('boss_defeated', { target: e.kind, level: tier + 1 });
    }
    hideBossBar();
    saveBeatenRoom();
    return;
  }
  giveBossRewards(e, progressOf(run.stage));
  putBossGates(e.cx, e.cz, tier);
  onBossDown();
  hideBossBar();
  recordBossProgress(tier);
}
