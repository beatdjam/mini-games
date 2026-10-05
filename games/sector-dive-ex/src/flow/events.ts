import { distXZ, el } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { sfx } from '@engine/audio/audio.ts';
import { setMusic } from '@engine/audio/music.ts';
import { burst } from '@engine/render/fx.ts';
import { activeTileGrid, tileCenter } from '@engine/world/tiles.ts';
import { lockDoor } from '@engine/world/doors.ts';
import { banner, toast } from '@engine/ui/ui.ts';
import { PER } from '../data/progress.ts';
import { COLOR } from '../data/colors.ts';
import { FLOOR_H, building, roomDoors } from '../world/building.ts';
import { arenaFog, level, liftPads, randomTileIn, roomSpot } from '../world/level.ts';
import { addPickup, boss, spawnEnemy } from '../world/entities.ts';
import { player, run } from '../actors/player.ts';
import { difficultyAt, stageInfo, stageLabel } from '../core/stages.ts';
import { spawnBoss } from '../actors/bosses/common.ts';
import { rollWeapon } from '../actors/weapons.ts';
import { progressOf } from '../core/rules.ts';
import { refreshRunText } from '../screens/pause.ts';
import { openPerk } from '../screens/perk.ts';
import { crossToFloor, pickEnemyType, roomEnemyCount } from './run.ts';
import { state } from './state.ts';
// What happens on a building floor: walking over a stairwell's landing or riding a lift moves on to the next floor,
// the lockdown (a room shuts and enemies come in waves) and the boss room (its door opens when the player waits in
// front of it; walking in starts the fight).
// ---- tuning numbers used only here ----
const LOCKDOWN_WAVES = 2; // waves that arrive after the room's own enemies
const WAVE_MIN_DIST = 6; // a wave's enemies appear at least this far from the player when a spot can be found (m)
const WAVE_SPOT_TRIES = 8; // attempts to find such a spot
const LOCKDOWN_TOAST_MS = 3200;
const LOCKDOWN_REWARD_GAP = 2; // the lockdown's rewards lie this far apart (m)
const LOCKDOWN_WEAPON_MIN_RARITY = 1; // the reward weapon's minimum rarity (index into RARITY: 1 = ★★)
const ALARM_EVERY = 2.4; // the lockdown siren sounds this often (s)
const ALERT_BANNER_MS = 2400; // how long the banner stays red after the lockdown's title (the banner itself shows for 2 s)
const BOSS_DOOR_R = 4; // waiting within this of the boss door's middle opens it (m)
const BOSS_DOOR_HOLD = 1.2; // ... for this long (s)
const BOSS_DOOR_TOAST_MS = 4200;
const BOSS_SPAWN_DELAY_MS = 1200; // the boss arrives this long after the player walks into its room
// The pre-boss supply: walking into the boss room gives chips for the rooms left uncleared, about 60% of what clearing
// them would have brought (a cleared room is a chip 30% of the time), so skipping rooms is not a dead end and clearing
// them is still better. The same idea as Sector Dive's shortcut supply
const SUPPLY_PER_ROOM = 0.18; // chips per room with enemies left, rounded to a whole number over the building
const LIFT_R = 1.2; // standing within this of the middle of a lift's platform calls it (m)
const LIFT_WAIT = 0.45; // ... for this long (s)
const LIFT_TIME = 2.2; // a ride takes this long per floor travelled (s)
const LIFT_INVULN = 0.2; // the rider cannot be hurt (refreshed every frame of the ride) (s)

// the state of the floor being played; reset when a floor is built (resetFloorEvents)
const ev = {
  ldActive: false, // the lockdown is running
  ldPending: false, // the lockdown room was emptied from outside: the waves start when the player walks in
  wavesLeft: 0,
  alarmT: 0, // seconds until the siren sounds again
  bossStarted: false, // the player has walked into the boss room
  bossDoorT: 0, // seconds the player has waited at the boss door
  bossDoorHint: false, // the hint at the boss door has been shown
  liftArmed: false, // the player has been off the lifts' platforms since arriving (so a ride does not start at once)
  liftT: 0, // seconds the player has stood on a platform
  // the ride in progress: which lift, +1 down / -1 up, seconds so far
  ride: null as { link: number; dir: number; t: number } | null,
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
  showAlarm(false);
  ev.bossStarted = false;
  ev.bossDoorT = 0;
  ev.bossDoorHint = false;
  ev.liftArmed = false;
  ev.liftT = 0;
  ev.ride = null;
  if (level.hall) lockDoor(world(), level.hall.door);
}

// the lockdown's look: the red frame and the wave count (step i of n: the room's own enemies, then the waves)
function showAlarm(on: boolean) {
  el('#alarm').classList.toggle('on', on);
  if (!on) el('#banner').classList.remove('alert');
  else
    el('#alarmText').textContent = t('run.lockdownHud', {
      i: LOCKDOWN_WAVES - ev.wavesLeft + 1,
      n: LOCKDOWN_WAVES + 1,
    });
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
  showAlarm(true);
  sfx('alarm');
  toast(t('run.lockdownWave', { i: LOCKDOWN_WAVES - ev.wavesLeft, n: LOCKDOWN_WAVES }));
}
function startLockdown(room: number) {
  ev.ldActive = true;
  ev.wavesLeft = LOCKDOWN_WAVES;
  lockdownDoors(room).forEach(k => lockDoor(world(), k));
  sfx('alarm');
  ev.alarmT = ALARM_EVERY;
  banner(t('run.lockdownTitle'), t('run.lockdown'));
  el('#banner').classList.add('alert');
  setTimeout(() => el('#banner').classList.remove('alert'), ALERT_BANNER_MS);
  showAlarm(true);
  setMusic(level.biome.code, true); // the sector's boss arrangement while the room is shut
  if (ev.ldPending || level.roomCount[room] === 0) spawnWave(room);
}
function endLockdown(room: number) {
  ev.ldActive = false;
  showAlarm(false);
  setMusic(level.biome.code);
  run.bld!.ld = 1;
  lockdownDoors(room).forEach(k => lockDoor(world(), k, false));
  markCleared(room);
  // the reward: a chip whose choices are all rare and a weapon of at least the second rarity, side by side
  // across the room's middle. After the pre-boss supply the building's rooms drop no chips: kits in their place
  const [x, z] = roomSpot(level.rooms[room]!),
    chips = !run.bld!.supplied;
  addPickup(chips ? 'chip' : 'kit', x - LOCKDOWN_REWARD_GAP / 2, z, chips ? { rare: true } : undefined);
  addPickup('weapon', x + LOCKDOWN_REWARD_GAP / 2, z, {
    w: rollWeapon(progressOf(run.stage), LOCKDOWN_WEAPON_MIN_RARITY),
  });
  sfx('chip');
  toast(t(run.bld!.supplied ? 'run.cleared' : 'run.lockdownClear'), LOCKDOWN_TOAST_MS);
}
function markCleared(room: number) {
  markClearedOn(level.floor, room);
}
// a room of a floor of the building has no enemy left (the floor being played, or another one whose last enemy
// followed the player here)
export function markClearedOn(floor: number, room: number) {
  const done = run.bld?.cleared[floor];
  if (done && !done.includes(room)) done.push(room);
}
// is this the building's lockdown room, with its lockdown still to come
export function lockdownAhead(floor: number, room: number): boolean {
  const ld = building?.lockdown;
  return !!ld && !!run.bld && !run.bld.ld && ld.floor === floor && ld.room === room;
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

// the rooms of the building whose enemies have not all been killed (the start room and the boss room have none)
function roomsLeft(): number {
  const b = building!,
    done = run.bld!.cleared;
  return b.plans.reduce(
    (sum, p, floor) =>
      sum +
      p.gen.rooms.filter((_, idx) => idx !== p.gen.startIdx && idx !== p.hall?.room && !done[floor]!.includes(idx))
        .length,
    0,
  );
}
// how many chips the pre-boss supply would give right now (0 once it has been given)
export const supplyChips = (): number => (run.bld?.supplied ? 0 : Math.round(roomsLeft() * SUPPLY_PER_ROOM));
// gives the supply: one chip pick after another. From then on the building's rooms drop no chips (combat.ts)
function giveSupply() {
  const total = supplyChips();
  if (!total) return;
  run.bld!.supplied = true;
  let given = 0;
  const next = () => {
    if (given >= total) return;
    given++;
    openPerk(t('perk.queue', { kind: t('perk.bossSupply'), i: given, n: total }), 'supply', next);
  };
  next();
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
  giveSupply();
}
// the boss is down: the way back up opens again
export function onBossDown() {
  if (level.hall) lockDoor(world(), level.hall.door, false);
}

// ---- between floors ----
// The height of a lift rider's feet above the ground of the floor being played while a ride is on (null otherwise):
// 0 to -FLOOR_H going down, 0 to FLOOR_H going up, easing in and out. The player's update keeps them there
export function ridingY(): number | null {
  const r = ev.ride;
  if (!r) return null;
  const l = building!.links[r.link]!,
    span = l.lower - l.upper, // floors the lift travels
    u = Math.min(1, r.t / (LIFT_TIME * span)),
    ease = u * u * (3 - 2 * u);
  return -r.dir * FLOOR_H * span * ease;
}
// a lift: standing on its platform for a moment starts the ride; at its end the next floor is the one being played
function updateLift(dt: number) {
  const b = building!,
    W = world().W,
    r = ev.ride;
  if (r) {
    r.t += dt;
    const l = b.links[r.link]!;
    player.x = tileCenter(l.a % W);
    player.z = tileCenter(Math.floor(l.a / W));
    player.inv = Math.max(player.inv, LIFT_INVULN);
    const pad = liftPads.find(p => p.link === r.link);
    if (pad) pad.mesh.position.y = ridingY()! - 0.06;
    if (r.t < LIFT_TIME * (l.lower - l.upper)) return;
    player.fy = -r.dir * FLOOR_H * (l.lower - l.upper);
    crossToFloor(r.link, r.dir > 0 ? l.lower : l.upper); // resets these events: the ride is over
    return;
  }
  const n = b.links.findIndex(
    l =>
      l.kind === 'elevator' &&
      (l.upper === level.floor || l.lower === level.floor) &&
      distXZ(player, { x: tileCenter(l.a % W), z: tileCenter(Math.floor(l.a / W)) }) < LIFT_R,
  );
  if (n < 0) {
    ev.liftArmed = true;
    ev.liftT = 0;
    return;
  }
  if (!ev.liftArmed || ev.ldActive || ev.bossStarted) return;
  ev.liftT += dt;
  if (ev.liftT < LIFT_WAIT) return;
  ev.ride = { link: n, dir: b.links[n]!.upper === level.floor ? 1 : -1, t: 0 };
  sfx('portal');
}
// a stairwell: its landing is two tiles that are floor on both floors (world/building.ts). Stepping onto the one
// nearer the stairs from the upper floor, or the far one from the lower floor, makes the other floor the one played
function crossStairs(tile: number): boolean {
  const n = building!.links.findIndex(
    l =>
      l.kind === 'stairs' && ((l.upper === level.floor && tile === l.b) || (l.lower === level.floor && tile === l.a)),
  );
  if (n < 0) return false;
  const l = building!.links[n]!;
  crossToFloor(n, l.upper === level.floor ? l.lower : l.upper);
  return true;
}

// the player stepped onto a new tile of a building floor
export function onPlayerTile(tile: number) {
  if (level.floor < 0 || crossStairs(tile)) return;
  const room = level.roomOf[tile]!; // -1 = a corridor or a door
  if (room < 0) return;
  if (isLockdownRoom(room) && !ev.ldActive) startLockdown(room);
  if (level.hall && room === level.hall.room && !ev.bossStarted) startBossFight();
}

// every frame on a building floor: the lifts, and waiting in front of the locked boss door opens it
export function updateFloorEvents(dt: number) {
  if (level.floor < 0) return;
  if (ev.ldActive) {
    ev.alarmT -= dt;
    if (ev.alarmT <= 0) {
      ev.alarmT = ALARM_EVERY;
      sfx('alarm');
    }
  }
  updateLift(dt);
  const hall = level.hall;
  if (!hall || ev.bossStarted || !world().doorLock?.[hall.door]) return;
  const W = world().W,
    at = { x: tileCenter(hall.door % W), z: tileCenter(Math.floor(hall.door / W)) };
  if (distXZ(player, at) > BOSS_DOOR_R) {
    ev.bossDoorT = 0;
    return;
  }
  if (!ev.bossDoorHint) {
    ev.bossDoorHint = true;
    const chips = supplyChips();
    toast(t('run.bossDoor') + (chips ? t('run.bossDoorSupply', { n: chips }) : ''), BOSS_DOOR_TOAST_MS);
  }
  ev.bossDoorT += dt;
  if (ev.bossDoorT < BOSS_DOOR_HOLD) return;
  lockDoor(world(), hall.door, false);
  sfx('reloaded');
  toast(t('run.bossDoorOpen'));
}
