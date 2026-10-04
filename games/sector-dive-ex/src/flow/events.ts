import { distXZ } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { sfx } from '@engine/audio/audio.ts';
import { burst } from '@engine/render/fx.ts';
import { activeTileGrid, tileCenter } from '@engine/world/tiles.ts';
import { lockDoor } from '@engine/world/doors.ts';
import { banner, toast } from '@engine/ui/ui.ts';
import { PER } from '../data/progress.ts';
import { COLOR } from '../data/colors.ts';
import { building, roomDoors } from '../world/building.ts';
import { arenaFog, level, randomTileIn, roomSpot } from '../world/level.ts';
import { addPickup, boss, spawnEnemy } from '../world/entities.ts';
import { player, run } from '../actors/player.ts';
import { difficultyAt, stageInfo, stageLabel } from '../core/stages.ts';
import { spawnBoss } from '../actors/bosses/common.ts';
import { refreshRunText } from '../screens/pause.ts';
import { pickEnemyType, roomEnemyCount } from './run.ts';
import { state } from './state.ts';
// What happens in the rooms of a building floor: the lockdown (a room shuts and enemies come in waves) and the boss
// room (its door opens when the player waits in front of it; walking in starts the fight).
// ---- tuning numbers used only here ----
const LOCKDOWN_WAVES = 2; // waves that arrive after the room's own enemies
const WAVE_MIN_DIST = 6; // a wave's enemies appear at least this far from the player when a spot can be found (m)
const WAVE_SPOT_TRIES = 8; // attempts to find such a spot
const LOCKDOWN_TOAST_MS = 3200;
const BOSS_DOOR_R = 4; // waiting within this of the boss door's middle opens it (m)
const BOSS_DOOR_HOLD = 1.2; // ... for this long (s)
const BOSS_DOOR_TOAST_MS = 2600;
const BOSS_SPAWN_DELAY_MS = 1200; // the boss arrives this long after the player walks into its room

// the state of the floor being played; reset when a floor is built (resetFloorEvents)
const ev = {
  ldActive: false, // the lockdown is running
  ldPending: false, // the lockdown room was emptied from outside: the waves start when the player walks in
  wavesLeft: 0,
  bossStarted: false, // the player has walked into the boss room
  bossDoorT: 0, // seconds the player has waited at the boss door
  bossDoorHint: false, // the hint at the boss door has been shown
};
const world = () => activeTileGrid().world;
// is this room of the floor being played the building's lockdown room, with the lockdown still to come
function isLockdownRoom(room: number): boolean {
  const ld = building?.lockdown;
  return !!ld && !!run.bld && !run.bld.ld && level.floor === ld.floor && room === ld.room;
}
const lockdownDoors = (room: number): number[] => roomDoors(building!.plans[level.floor]!.gen, room).doors;

// called when a building floor has been built: nothing running, the boss door locked
export function resetFloorEvents() {
  ev.ldActive = false;
  ev.ldPending = false;
  ev.wavesLeft = 0;
  ev.bossStarted = false;
  ev.bossDoorT = 0;
  ev.bossDoorHint = false;
  if (level.hall) lockDoor(world(), level.hall.door);
}

function spawnWave(room: number) {
  const r = level.rooms[room]!,
    si = stageInfo(run.stage),
    n = roomEnemyCount(r, level.biome),
    diff = difficultyAt(run.stage);
  for (let k = 0; k < n; k++) {
    let [x, z] = randomTileIn(r);
    for (let tries = 0; tries < WAVE_SPOT_TRIES && distXZ(player, { x, z }) < WAVE_MIN_DIST; tries++)
      [x, z] = randomTileIn(r);
    const e = spawnEnemy(pickEnemyType(level.biome, si.tier), x, z, room, diff);
    e.active = true; // a wave comes in awake
    burst(x, 1.2, z, COLOR.mag, 10, 6, 0.5);
  }
  level.roomCount[room] = n;
  ev.wavesLeft--;
  toast(t('run.lockdownWave', { i: LOCKDOWN_WAVES - ev.wavesLeft, n: LOCKDOWN_WAVES }));
}
function startLockdown(room: number) {
  ev.ldActive = true;
  ev.wavesLeft = LOCKDOWN_WAVES;
  lockdownDoors(room).forEach(k => lockDoor(world(), k));
  sfx('beam');
  banner(t('run.lockdownTitle'), t('run.lockdown'));
  if (ev.ldPending || level.roomCount[room] === 0) spawnWave(room);
}
function endLockdown(room: number) {
  ev.ldActive = false;
  run.bld!.ld = 1;
  lockdownDoors(room).forEach(k => lockDoor(world(), k, false));
  markCleared(room);
  const [x, z] = roomSpot(level.rooms[room]!);
  addPickup('chip', x, z);
  sfx('chip');
  toast(t('run.lockdownClear'), LOCKDOWN_TOAST_MS);
}
function markCleared(room: number) {
  const done = run.bld?.cleared[level.floor];
  if (done && !done.includes(room)) done.push(room);
}

// A room of a building floor has no enemy left. Returns true when the lockdown took the event (a wave came, or it
// ended with its own reward), so the caller gives no ordinary reward
export function onRoomCleared(room: number): boolean {
  if (level.floor < 0) return false;
  if (!isLockdownRoom(room)) {
    markCleared(room);
    return false;
  }
  if (!ev.ldActive) {
    ev.ldPending = true;
    return true;
  }
  if (ev.wavesLeft > 0) spawnWave(room);
  else endLockdown(room);
  return true;
}

function startBossFight() {
  ev.bossStarted = true;
  lockDoor(world(), level.hall!.door);
  // from here the stage is the depth's boss stage: the boss's strength, the label and the result screen follow it
  run.stage = stageInfo(run.stage).tier * PER + PER - 1;
  arenaFog();
  refreshRunText();
  banner(stageLabel(run.stage), level.biome.name);
  const stageAt = run.stage,
    kind = run.bld!.boss;
  setTimeout(() => {
    if (run && run.stage === stageAt && ev.bossStarted && !boss && state !== 'base' && state !== 'result')
      spawnBoss(kind);
  }, BOSS_SPAWN_DELAY_MS);
}
// the boss is down: the way back up opens again
export function onBossDown() {
  if (level.hall) lockDoor(world(), level.hall.door, false);
}

// the player stepped onto a new tile of a building floor (room = the room it is in, -1 = a corridor or a door)
export function onPlayerRoom(room: number) {
  if (level.floor < 0 || room < 0) return;
  if (isLockdownRoom(room) && !ev.ldActive) startLockdown(room);
  if (level.hall && room === level.hall.room && !ev.bossStarted) startBossFight();
}

// every frame on a building floor: waiting in front of the locked boss door opens it
export function updateFloorEvents(dt: number) {
  const hall = level.hall;
  if (level.floor < 0 || !hall || ev.bossStarted || !world().doorLock?.[hall.door]) return;
  const W = world().W,
    at = { x: tileCenter(hall.door % W), z: tileCenter(Math.floor(hall.door / W)) };
  if (distXZ(player, at) > BOSS_DOOR_R) {
    ev.bossDoorT = 0;
    return;
  }
  if (!ev.bossDoorHint) {
    ev.bossDoorHint = true;
    toast(t('run.bossDoor'), BOSS_DOOR_TOAST_MS);
  }
  ev.bossDoorT += dt;
  if (ev.bossDoorT < BOSS_DOOR_HOLD) return;
  lockDoor(world(), hall.door, false);
  sfx('reloaded');
  toast(t('run.bossDoorOpen'));
}
