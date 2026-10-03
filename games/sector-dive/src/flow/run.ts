import type { Biome, RunEnd, Weapon, WeaponItem } from '../data/types.ts';
import { clamp, el, isTouch, pick, randi, shuffle } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { audioInit, sfx } from '@engine/audio/audio.ts';
import { musicVolume, setMusic } from '@engine/audio/music.ts';
import { T, W, floorY } from '@engine/world/tiles.ts';
import type { Room } from '@engine/world/dungeon.ts';
import { banner, enterFs, isFullscreen, toast } from '@engine/ui/ui.ts';
import { exitLock, releaseInputs, requestLock } from '@engine/ui/input.ts';
import { track } from '@engine/core/analytics.ts';
import { ELITE_TYPES, ENEMY_TUNE } from '../data/enemies.ts';
import { BIOMES } from '../data/biomes.ts';
import { PER, TUNE } from '../data/progress.ts';
import { COLOR } from '../data/colors.ts';
import { persist, save } from '../core/save.ts';
import { progressOf } from '../core/rules.ts';
import {
  closeShortcut,
  earnBits,
  recordBest,
  recordRunStart,
  riskLoadout,
  setSuspend,
  storeWeapons,
} from '../core/progress.ts';
import { buildLevel, level, randomTileIn, roomSpot } from '../world/level.ts';
import { makePortal } from '../world/portals.ts';
import { addPickup, boss, spawnEnemy } from '../world/entities.ts';
import { player, newPlayer, run, setPlayer, setRun } from '../actors/player.ts';
import { difficultyAt, isBossStage, stageInfo, stageLabel, tierLabel } from '../core/stages.ts';
import { rollWeapon, weaponText } from '../actors/weapons.ts';
import { spawnBoss } from '../actors/bosses/common.ts';
import { keyText, moveKeysText, normalizeWeapons } from '../ui/input.ts';
import { updateHint, weaponHud } from '../ui/hud.ts';
import { openPerk } from '../screens/perk.ts';
import { refreshRunText } from '../screens/pause.ts';
import { renderBase } from '../screens/base.ts';
import { showPracticeResult, showRunResult } from '../screens/result.ts';
import { setPlayUI, setState, show, state } from './state.ts';
import { checkpoint } from './suspend.ts';
import { buildAttract } from './attract.ts';

// toast and timer lengths (ms)
const FIRST_TOAST_MS = 4200; // the how-to-play toast shown when a run opens with no chips to pick
const RISKED_TOAST_MS = 3000; // the "weapons at risk" toast
const RISKED_TOAST_DELAY_MS = FIRST_TOAST_MS + 200; // shown just after the how-to-play toast ends
const HINT_DELAY_MS = 1800; // the sector hint toast comes up this long after a sector's first floor starts
const HINT_TOAST_MS = 3600;
const DEEPER_TOAST_MS = 3000; // the "next depth" toast
const PRACTICE_TOAST_MS = 2600;
const BOSS_SPAWN_DELAY_MS = 1200; // the boss arrives this long after the player enters its arena

// the player's start in the boss arena and on every new stage
const ARENA_START_Z = 14.5; // tile rows (multiplied by T), the south end of the arena
const ARENA_START_PITCH = 0.08; // radians
const STAGE_START_INVULN = 1.0; // seconds of invulnerability when a stage starts

// enemies per room: the smallest of three limits (ENEMY_TUNE.maxPerRoom, room size, pace by progress)
const ROOM_MIN_ENEMIES = 2; // floor of the room-size limit
const DEFAULT_TILES_PER_ENEMY = 3; // room tiles per enemy when the biome has no gen.density
const ROOM_PACE_MIN = 2; // the pace limit is a random number from ROOM_PACE_MIN to ROOM_PACE_MAX ...
const ROOM_PACE_MAX = 4;
const ROOM_PACE_PER_PROGRESS = 0.3; // ... plus this many per progress (progressOf) step, rounded down
const WEAPON_CACHE_TWO_CHANCE = 0.4; // chance a floor has 2 weapon caches instead of 1

// one pick of the chips that open every run; times is how many times the chosen chip counts
type StartChip = { label: string; times: number };
// the chip picks that open every run: one per chip carried from the base, one per skipped depth
function pickStartChips(tier: number) {
  const queue: StartChip[] = [];
  for (let k = 0; k < save.up.chip; k++) queue.push({ label: t('perk.carry'), times: 1 });
  // a walked depth gives about 8 chips, so one supply chip per skipped depth left deep starts hopeless: each supply pick
  // counts supplyTimes times instead
  for (let k = 0; k < tier; k++) queue.push({ label: t('perk.supply'), times: TUNE.supplyTimes });
  const total = queue.length;
  // after the loadout / shortcut chips are picked, re-save the checkpoint so they are part of it
  const next = () => {
    if (!queue.length) {
      checkpoint();
      return;
    }
    const chip = queue.shift()!;
    openPerk(t('perk.queue', { kind: chip.label, i: total - queue.length, n: total }), 'loadout', next, chip.times);
  };
  next();
  return total;
}
export function startRun() {
  audioInit();
  if (isTouch && !isFullscreen()) enterFs();
  if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request('screen').catch(() => {});
  const tier = clamp(save.startTier, 0, save.shortcut);
  setPlayer(newPlayer(save.loadout));
  const risked = save.loadout.filter(w => w && !w.basic).length;
  // non-basic weapons leave the base: they come back only on extraction
  riskLoadout();
  setRun({
    stage: tier * PER,
    kills: 0,
    bits: 0,
    perks: [],
    bosses: [],
    startTier: tier,
    route: shuffle(BIOMES.map((_, i) => i)),
  });
  recordRunStart();
  persist();
  track('dive_start', { start_level: tier + 1, item_name: save.loadout[0]?.id ?? '' });
  show(null);
  setPlayUI(true);
  normalizeWeapons();
  weaponHud();
  startStage();
  const total = pickStartChips(tier);
  if (!total) {
    // with chips to pick first, the lock is requested when the last one is chosen
    requestLock();
    toast(
      t(isTouch ? 'run.firstTouch' : 'run.firstDesk', { move: moveKeysText(), pause: keyText('pause', 0) }),
      FIRST_TOAST_MS,
    );
  }
  if (risked) setTimeout(() => toast(t('run.risked'), RISKED_TOAST_MS), total ? 0 : RISKED_TOAST_DELAY_MS);
}
// the boss room: the player starts at the south end, the boss comes after a moment
function setupArena(bossKind: string | null) {
  player.x = (W * T) / 2;
  player.z = ARENA_START_Z * T;
  player.yaw = 0;
  player.pitch = ARENA_START_PITCH;
  const stageAt = run.stage;
  setTimeout(() => {
    if (run && run.stage === stageAt && !boss && !level.portals.length && state !== 'base' && state !== 'result')
      spawnBoss(bossKind!);
  }, BOSS_SPAWN_DELAY_MS);
}
// enemies in one room. Calls randi once, so keep its place in the order of random calls
function roomEnemyCount(r: Room, b: Biome): number {
  return Math.min(
    ENEMY_TUNE.maxPerRoom,
    Math.max(ROOM_MIN_ENEMIES, Math.floor((r.w * r.h) / (b.gen.density || DEFAULT_TILES_PER_ENEMY))),
    randi(ROOM_PACE_MIN, ROOM_PACE_MAX) + Math.floor(progressOf(run.stage) * ROOM_PACE_PER_PROGRESS),
  );
}
// a floor: the player in the start room facing the exit, enemies in every other room, weapon caches
function setupFloor(b: Biome, si: ReturnType<typeof stageInfo>) {
  const diff = difficultyAt(run.stage);
  const [sx, sz] = roomSpot(level.rooms[level.startIdx]);
  player.x = sx;
  player.z = sz;
  const [ex, ez] = roomSpot(level.rooms[level.exitIdx]);
  player.yaw = Math.atan2(-(ex - sx), -(ez - sz));
  player.pitch = 0;
  makePortal(ex, ez, COLOR.amber, 'next', t(si.sub === PER - 2 ? 'run.toBoss' : 'run.nextArea'));
  level.rooms.forEach((r, idx) => {
    if (idx === level.startIdx) return;
    const n = roomEnemyCount(r, b);
    for (let k = 0; k < n; k++) {
      const [x, z] = randomTileIn(r);
      spawnEnemy(pickEnemyType(b, si.tier), x, z, idx, diff);
    }
    level.roomCount[idx] = n;
  });
  const cand = level.rooms.map((_, i) => i).filter(i => i !== level.startIdx);
  const caches = Math.random() < WEAPON_CACHE_TWO_CHANCE ? 2 : 1;
  shuffle(cand)
    .slice(0, caches)
    .forEach(i => {
      const [x, z] = randomTileIn(level.rooms[i]);
      addPickup('weapon', x, z, { w: rollWeapon(progressOf(run.stage)) });
    });
}
export function startStage() {
  const si = stageInfo(run.stage),
    b = si.biome,
    isArena = isBossStage(run.stage);
  const fade = el('#fade');
  fade.style.transition = 'none';
  fade.style.opacity = '1';
  requestAnimationFrame(() => {
    fade.style.transition = '';
    fade.style.opacity = '0';
  });
  const bossKind = isArena ? run.forceBoss || pick(b.bosses) : null;
  if (!run.practice)
    track('level_start', {
      level: si.tier + 1,
      stage: si.sub + 1,
      stage_type: b.code,
      stage_role: isArena ? 'boss' : 'normal',
      target: bossKind ?? '',
    });
  buildLevel(b, isArena, bossKind);
  if (isArena) setupArena(bossKind);
  else setupFloor(b, si);
  player.tile = -1;
  player.inv = STAGE_START_INVULN;
  player.fy = floorY(player.x, player.z);
  player.vy = 0;
  el('#bossBar').hidden = true;
  refreshRunText();
  banner(stageLabel(run.stage), b.name);
  const hintAt = run.stage,
    hint = b.hint;
  if (si.sub === 0 && hint)
    setTimeout(() => {
      if (run && run.stage === hintAt && state === 'play') toast(hint, HINT_TOAST_MS);
    }, HINT_DELAY_MS);
  setState('play');
  checkpoint();
  if (!isArena) setMusic(b.code);
  musicVolume(1);
  updateHint();
}
// deeper sectors lean toward the biome's tougher enemy types
export function pickEnemyType(b: Biome, tier: number): string {
  if (Math.random() < ENEMY_TUNE.trooperChance) return 'trooper'; // the humanoid soldier turns up in every sector
  const elites = b.enemies.filter(type => ELITE_TYPES.includes(type));
  const chance = Math.min(ENEMY_TUNE.eliteMax, ENEMY_TUNE.elitePerDepth * tier);
  return elites.length && Math.random() < chance ? pick(elites) : pick(b.enemies);
}
export function nextStage() {
  sfx('portal');
  run.stage++;
  recordBest(run.stage);
  persist();
  if (run.stage % (PER * 3) === 0) toast(t('run.deeper', { n: stageInfo(run.stage).tier + 1 }), DEEPER_TOAST_MS);
  startStage();
}

// ---- boss practice: fight one boss at a chosen depth's strength; nothing is gained or lost ----
export function startPractice(kind: string, tier?: number) {
  const depth = tier || 0;
  audioInit();
  if (isTouch && !isFullscreen()) enterFs();
  const bi = BIOMES.findIndex(b => b.bosses.includes(kind));
  setPlayer(newPlayer(save.loadout));
  setRun({
    stage: depth * PER + PER - 1,
    kills: 0,
    bits: 0,
    perks: [],
    startTier: 0,
    route: [bi],
    practice: true,
    forceBoss: kind,
    t0: performance.now(),
  });
  track('practice_start', { target: kind, level: depth + 1 });
  show(null);
  setPlayUI(true);
  normalizeWeapons();
  weaponHud();
  startStage();
  requestLock();
  toast(t('run.practiceStart'), PRACTICE_TOAST_MS);
}
function endPractice(kind: RunEnd) {
  setState('result');
  releaseInputs();
  exitLock();
  const sec = Math.round((performance.now() - run.t0!) / 1000);
  track('practice_end', {
    target: run.forceBoss!,
    level: stageInfo(run.stage).tier + 1,
    result: run.cleared ? 'won' : kind,
    duration_sec: sec,
  });
  showPracticeResult(kind, sec);
}

// ---- run end ----
// a stripped copy for the save (no per-run fields)
const strip = (w: WeaponItem | null): WeaponItem | null =>
  w ? { id: w.id, r: w.r, basic: !!w.basic, plus: w.plus || 0, opts: w.opts || [] } : null;
export function endRun(kind: RunEnd) {
  if (run.practice) {
    endPractice(kind);
    return;
  }
  setSuspend(null); // the run is over: its checkpoint must not come back
  const dead = kind !== 'extract';
  setState('result');
  releaseInputs();
  exitLock();
  const got = Math.floor(run.bits),
    kept = dead ? Math.floor(got * TUNE.deathBitsKeep) : got;
  const si = stageInfo(run.stage);
  track('level_end', {
    result: kind,
    level: si.tier + 1,
    stage: si.sub + 1,
    stage_type: si.biome.code,
    stage_role: isBossStage(run.stage) ? 'boss' : 'normal',
    count: run.kills,
    upgrades: run.perks.length,
    value: kept,
    virtual_currency_name: 'bits',
  });
  earnBits(kept);
  recordBest(run.stage);
  const found = player.weapons.concat(player.bag).filter((w): w is Weapon => !!w && !w.basic);
  const foundText = found.length ? found.map(weaponText).join(t('common.sep')) : t('common.none');
  const rows: [string, string | number][] = [];
  rows.push([t('res.reached'), `${stageLabel(run.stage)}　${si.biome.name}`]);
  rows.push([t('res.kills'), run.kills]);
  rows.push([t('res.bits'), dead ? t('res.bitsLost', { kept, lost: got - kept }) : `+${kept}`]);
  let shortcutMsg = '';
  if (dead) {
    rows.push([t('res.lostWeapons'), foundText]);
    if (closeShortcut()) shortcutMsg = t('res.shortcutClosed', { tier: tierLabel(save.shortcut + 1) });
  } else {
    const sold = storeWeapons(
      [strip(player.weapons[0]), strip(player.weapons[1])],
      player.bag.filter(w => w && !w.basic).map(w => strip(w)!),
    );
    rows.push([t('res.keptWeapons'), foundText]);
    if (sold) rows.push([t('res.sold'), `+${sold}`]);
  }
  if (shortcutMsg) rows.push([t('res.shortcut'), shortcutMsg]);
  persist();
  showRunResult(kind, rows);
}
el('#btnBack').addEventListener('click', goBase);
export function goBase() {
  setState('base');
  setRun(null);
  setPlayer(null);
  setPlayUI(false);
  show('#scrBase');
  renderBase();
  setMusic('BASE');
  musicVolume(1);
  buildAttract();
}
