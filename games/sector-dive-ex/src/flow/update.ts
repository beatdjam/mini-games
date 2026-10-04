import type { Pickup, Wave } from '../data/types.ts';
import { distXZ, rand } from '@engine/core/util.ts';
import { LOOP, addSystem, runSystems, startLoop, stopFrame } from '@engine/core/loop.ts';
import { WORLD, query, sweepWorld } from '@engine/core/world.ts';
import { t } from '@engine/core/i18n.ts';
import { sfx, unlockAudio } from '@engine/audio/audio.ts';
import { setMusic } from '@engine/audio/music.ts';
import { camera, gun } from '@engine/render/render.ts';
import { FX } from '@engine/render/fx.ts';
import { T, computeFlow, floorY, moveCircle, tileIndex } from '@engine/world/tiles.ts';
import { toast } from '@engine/ui/ui.ts';
import { fire2Held, fireHeld, joy, mouseFire } from '@engine/ui/input.ts';
import { actionDown } from '@engine/ui/keymap.ts';
import { EYE, PORTAL } from '../data/level.ts';
import { KIT_MAX, TUNE } from '../data/progress.ts';
import { GAIN_OPT_PER_LEVEL, SPEED_OPT_PER_LEVEL } from '../data/weapons.ts';
import { save } from '../core/save.ts';
import { updateMusic } from './music.ts';
import { level, reveal, showNeighbourFloors } from '../world/level.ts';
import { building } from '../world/building.ts';
import { updateHazards } from '../world/hazards.ts';
import { ENEMY_GROUP, enemies, nearPickupDist, setNear, setTarget, target } from '../world/entities.ts';
import { updateDoorMeshes } from '../world/doors.ts';
import type { DoorMover } from '@engine/world/doors.ts';
import { GUNFX, curVM } from '../actors/viewmodel.ts';
import { player, currentWeapon, run } from '../actors/player.ts';
import { damagePlayer, kitHealAmount } from '../actors/combat.ts';
import { findTarget, shotId, tryFire } from '../actors/firing.ts';
import { magSize, weaponOptCount } from '../actors/weapons.ts';
import { controlState } from '../ui/input.ts';
import { drawMap } from '../ui/minimap.ts';
import { screenFx, bctx, bigmap, hitm, mctx, mini, updateHitDirs, updateHud, weaponHud } from '../ui/hud.ts';
import { attract, buildAttract } from './attract.ts';
import { endRun, nextStage } from './run.ts';
import { onPlayerTile, ridingY, updateFloorEvents } from './events.ts';
import { updateMap3D } from '../ui/map3d.ts';
import { state } from './state.ts';
import { openPerk } from '../screens/perk.ts';
import { renderBase } from '../screens/base.ts';
import { updateEBullets, updatePBullets } from '../actors/bullets.ts';
// Per-frame systems of Sector Dive Extended, run by the engine loop (engine/src/core/loop.ts) in this order
LOOP.mode = () => state;
// ---- tuning numbers used only here ----
const STICK_DASH_PUSH = 0.97; // stick pushed this far (0-1) counts as "at the rim" for the stick dash
const STICK_DASH_HOLD = 0.3; // seconds held at the rim before the stick dash fires
const STICK_DASH_REARM = 0.8; // the stick must come back below this before it can dash again
const MOVE_EPS = 0.1; // move input / speed below this counts as standing still
const STAMINA_WARN_TIME = 0.3; // seconds the stamina bar flashes when a dash is refused
const RUN_LATCH_HOLD = 0.25; // touch: the dash button held this long keeps the run on after it is let go (s)
const RUN_LATCH_STICK = 0.5; // ... while the stick stays pushed further than this (0-1)
const GRAVITY = 26; // m/s^2, falling after a ledge or a drop
const GROUND_EPS = 0.01; // within this of the floor counts as standing on it (m)
const BOB_RATE = 9; // head-bob phase speed while moving (rad/s)
const SHAKE_DECAY = 1.2; // screen shake fades by this per second
const GUN_KICK_DECAY = 0.7; // gun recoil fades by this per second
const VIGNETTE_DECAY = 2; // damage vignette fades by this per second
const MINIMAP_INTERVAL = 0.15; // seconds between map redraws
const MAX_SHOTS_PER_FRAME = 8; // cap on rounds fired in one frame (fire rate faster than the frame rate)
const WEAPON_PICK_R = 1.9; // how close a weapon pickup must be to be the "nearest" (m)
const BIT_MAGNET_R = 2.4; // bits start flying to the player inside this x magnet chip (m)
const BIT_PULL_SPEED = 14; // m/s a bit flies toward the player
const BIT_PICK_R = 0.7; // bits are collected inside this (m)
const PICKUP_REACH_Y = 1.4; // vertical reach for picking things up (m)
const BIT_HOVER_Y = 0.5; // height a bit rests at above the floor, and where it flies to above the player's feet (m)
const PICKUP_HOVER_Y = 1; // height a kit, chip or weapon rests at above the floor (m)
const KIT_PICK_R = 1.1; // med kit pick-up radius (m)
const CHIP_PICK_R = 1.3; // chip pick-up radius (m)
const WAVE_HIT_WIDTH = 0.6; // shockwave ring thickness that hurts (m)
// seconds of play time (drives blinking and animations)
export let time = 0;
export function tickClock(dt: number) {
  time += dt;
}
// one play step by hand (tests)
export function update(dt: number) {
  runSystems(dt, 'play');
}

// ---- player: movement, dash, camera, viewmodel, reload and firing ----
// a point or direction on the ground (x, z)
interface Vec2 {
  x: number;
  z: number;
}

// move input from the keyboard and the stick: x = right, z = forward, at most 1 long
function readMoveInput(): Vec2 {
  let x = 0,
    z = 0;
  if (actionDown('forward')) z += 1;
  if (actionDown('back')) z -= 1;
  if (actionDown('right')) x += 1;
  if (actionDown('left')) x -= 1;
  x += joy.x;
  z -= joy.y;
  const inputLen = Math.hypot(x, z);
  if (inputLen > 1) {
    x /= inputLen;
    z /= inputLen;
  }
  return { x, z };
}

// holding the stick at its rim for a moment asks for a dash (controlState.dashReq)
function updateStickDash(dt: number) {
  if (save.settings.stickDash && joy.id !== null) {
    const stickPush = Math.hypot(joy.x, joy.y);
    if (stickPush > STICK_DASH_PUSH) {
      controlState.stickT += dt;
      if (controlState.stickT > STICK_DASH_HOLD && controlState.stickArmed) {
        controlState.dashReq = true;
        controlState.stickArmed = false;
      }
    } else {
      controlState.stickT = 0;
      if (stickPush < STICK_DASH_REARM) controlState.stickArmed = true;
    }
  } else {
    controlState.stickT = 0;
    controlState.stickArmed = true;
  }
}

// the ground direction the player faces
function facingDir(): Vec2 {
  return { x: -Math.sin(player.yaw), z: -Math.cos(player.yaw) };
}

// move input (relative to where the player faces) turned into a ground direction in the world
function worldMoveDir(input: Vec2): Vec2 {
  const forward = facingDir();
  const rightX = Math.cos(player.yaw),
    rightZ = -Math.sin(player.yaw);
  return {
    x: forward.x * input.z + rightX * input.x,
    z: forward.z * input.z + rightZ * input.x,
  };
}

// invulnerability, the stamina bar warning and stamina regeneration
function tickStamina(dt: number) {
  player.inv -= dt;
  screenFx.stWarn -= dt;
  player.stDelay -= dt;
  if (player.stDelay <= 0) player.st = Math.min(player.stMax, player.st + player.stRegen * dt);
}

// a dash was asked for: starts it toward the move direction (or straight ahead) if there is stamina, else warns
function startDashIfRequested(moveDir: Vec2) {
  if (!controlState.dashReq) return;
  controlState.dashReq = false;
  if (player.st >= TUNE.dashCost) {
    const moveLen = Math.hypot(moveDir.x, moveDir.z);
    if (moveLen > MOVE_EPS) {
      player.ddx = moveDir.x / moveLen;
      player.ddz = moveDir.z / moveLen;
    } else {
      const forward = facingDir();
      player.ddx = forward.x;
      player.ddz = forward.z;
    }
    player.dashT = TUNE.dashTime;
    player.sprint = true; // holding the dash on keeps the player running once the dash is over (applySprint)
    player.st -= TUNE.dashCost;
    player.stDelay = TUNE.staminaDelay;
    player.inv = Math.max(player.inv, TUNE.dashInvuln);
    sfx('dash');
  } else {
    // not enough for a dash: the bar warns, but holding on still runs on what stamina is left (applySprint)
    player.sprint = true;
    screenFx.stWarn = STAMINA_WARN_TIME;
    sfx('empty');
  }
}

// is the dash held right now: its key, its button, or (with the stick dash on) the stick at its rim. On touch a run
// that was started by holding the button for RUN_LATCH_HOLD goes on after the thumb leaves the button (it is needed
// for aiming), for as long as the stick stays pushed past RUN_LATCH_STICK
function dashHeld(): boolean {
  if (actionDown('dash') || controlState.dashHeld) return true;
  const push = joy.id !== null ? Math.hypot(joy.x, joy.y) : 0;
  return (controlState.runLatch && push > RUN_LATCH_STICK) || (save.settings.stickDash && push > STICK_DASH_PUSH);
}
// Running: after pressing the dash (whether the dash came or there was too little stamina for it), while it stays
// held and the player keeps moving, they move faster and stamina drains instead of refilling. It ends when the dash
// is let go, the player stops, or the stamina runs out; the next run needs a new press. No invulnerability
function applySprint(dt: number, moveDir: Vec2): Vec2 {
  if (!player.sprint) return moveDir;
  controlState.heldT = controlState.dashHeld ? controlState.heldT + dt : 0;
  if (controlState.heldT >= RUN_LATCH_HOLD) controlState.runLatch = true;
  if (!dashHeld() || player.st <= 0 || Math.hypot(moveDir.x, moveDir.z) < MOVE_EPS) {
    player.sprint = false;
    controlState.runLatch = false;
    controlState.heldT = 0;
    return moveDir;
  }
  player.st = Math.max(0, player.st - TUNE.sprintCost * dt);
  player.stDelay = TUNE.staminaDelay;
  return { x: moveDir.x * TUNE.sprintSpeed, z: moveDir.z * TUNE.sprintSpeed };
}
// while dashing, the dash direction replaces the move direction; after it, running (applySprint)
function applyDash(dt: number, moveDir: Vec2): Vec2 {
  if (player.dashT <= 0) return applySprint(dt, moveDir);
  player.dashT -= dt;
  return { x: player.ddx * TUNE.dashSpeed, z: player.ddz * TUNE.dashSpeed };
}

function movePlayer(dt: number, dir: Vec2) {
  if (ridingY() !== null) return; // riding a lift: the platform carries the player
  const speed = player.baseSpeed * player.spdMul * (1 + SPEED_OPT_PER_LEVEL * weaponOptCount('speed'));
  moveCircle(player, dir.x * speed * dt, dir.z * speed * dt, player.r);
}

// falls after a ledge or a drop, otherwise stays on the floor
function applyGravity(dt: number) {
  const rideY = ridingY();
  if (rideY !== null) {
    player.fy = rideY;
    player.vy = 0;
    return;
  }
  const groundY = floorY(player.x, player.z);
  if (player.fy > groundY + GROUND_EPS) {
    player.vy -= GRAVITY * dt;
    player.fy = Math.max(groundY, player.fy + player.vy * dt);
    if (player.fy === groundY) player.vy = 0;
  } else {
    player.fy = groundY;
    player.vy = 0;
  }
}

function updateHeadBob(dt: number, dir: Vec2) {
  if (Math.hypot(dir.x, dir.z) > MOVE_EPS) player.bob += dt * BOB_RATE;
}

// entering a new tile refreshes the flow field and what the map shows
function updatePlayerTile() {
  const tile = tileIndex(player.x, player.z);
  if (tile !== player.tile) {
    player.tile = tile;
    const tileX = Math.floor(player.x / T),
      tileZ = Math.floor(player.z / T);
    computeFlow(tileX, tileZ);
    reveal(tileX, tileZ);
    onPlayerTile(tile);
  }
}

// camera: head bob and screen shake (shake draws 3 random numbers per frame, in x, y, z order)
function updateCamera(dt: number) {
  screenFx.shake = Math.max(0, screenFx.shake - dt * SHAKE_DECAY);
  const shakeRange = screenFx.shake * screenFx.shake;
  camera.position.set(
    player.x + rand(-shakeRange, shakeRange),
    player.fy + EYE + Math.sin(player.bob) * 0.05 + rand(-shakeRange, shakeRange),
    player.z + rand(-shakeRange, shakeRange),
  );
  camera.rotation.set(player.pitch, player.yaw, 0);
}

// 0 -> 1 -> 0 over a reload (how far the gun is lowered and tilted); 0 when not reloading
function reloadPhase(): number {
  if (player.reloadT <= 0) return 0;
  const progress = 1 - player.reloadT / player.reloadMax;
  return Math.sin(Math.PI * progress);
}

// the gun in hand: bob, recoil, reload dip and muzzle flash
function updateGunView(dt: number) {
  GUNFX.gunKick = Math.max(0, GUNFX.gunKick - dt * GUN_KICK_DECAY);
  const viewModel = curVM!,
    restPos = viewModel.userData.pos;
  const reload = reloadPhase();
  gun.position.set(
    restPos[0] + Math.cos(player.bob * 0.5) * 0.012,
    restPos[1] + Math.abs(Math.sin(player.bob * 0.5)) * 0.012 - GUNFX.gunKick * 0.3 - reload * 0.18,
    restPos[2] + GUNFX.gunKick,
  );
  gun.rotation.set(GUNFX.gunKick * 1.6 - reload * 0.7, 0, reload * 0.5);
  GUNFX.flashT -= dt;
  viewModel.userData.flash.visible = GUNFX.flashT > 0;
}

function updateReload(dt: number) {
  if (player.reloadT > 0) {
    player.reloadT -= dt;
    if (player.reloadT <= 0) {
      player.reloadT = 0;
      currentWeapon().mag = magSize(currentWeapon());
      sfx('reloaded');
    }
  }
}

function updateFiring(dt: number) {
  setTarget(findTarget());
  // A gun faster than the frame rate fires several rounds in one frame, so fire-rate chips keep working past 60 (or 30)
  // shots a second. The carry-over is kept to one frame, so a pause (reloading, not holding fire) doesn't bank shots.
  player.fireCd = Math.max(player.fireCd - dt, -dt);
  if (fireHeld || fire2Held || mouseFire || actionDown('fire') || (save.settings.autofire && target)) {
    for (let shots = 0; shots < MAX_SHOTS_PER_FRAME && player.fireCd <= 0; shots++) {
      const before = shotId;
      tryFire();
      if (shotId === before) break;
    }
  }
}

function updatePlayer(dt: number) {
  time += dt;
  const input = readMoveInput();
  updateStickDash(dt);
  const moveDir = worldMoveDir(input);
  tickStamina(dt);
  startDashIfRequested(moveDir);
  const dir = applyDash(dt, moveDir);
  movePlayer(dt, dir);
  applyGravity(dt);
  updateHeadBob(dt, dir);
  updatePlayerTile();
  updateCamera(dt);
  updateGunView(dt);
  updateReload(dt);
  updateFiring(dt);
}
// ---- a building floor: its doors (the player and the awake enemies open them) and its room events ----
function updateBuildingFloor(dt: number) {
  if (level.floor < 0) return;
  const movers: DoorMover[] = [player];
  enemies.forEach(e => {
    if (!e.dead && (e.active || e.boss)) movers.push(e);
  });
  updateDoorMeshes(movers, dt);
  updateFloorEvents(dt);
  if (building) showNeighbourFloors(building, player.x, player.z);
}
// ---- gates: stepping into one moves on (the rest of the frame is skipped) ----
function updatePortals(dt: number) {
  for (const pt of level.portals) {
    // arming (data/level.ts PORTAL): dim and still until it works, then bright and turning
    pt.t += dt;
    const d = distXZ(player, pt);
    if (!pt.clear && d >= PORTAL.clearR) pt.clear = true;
    const armed = pt.t >= PORTAL.armTime && pt.clear;
    pt.ring.material.opacity = armed ? 1 : 0.35;
    pt.disc.material.opacity = armed ? 0.18 + Math.sin(time * 4) * 0.08 : 0.06;
    if (armed) pt.ring.rotation.z += dt * 1.5;
    if (
      armed &&
      state === 'play' &&
      d < PORTAL.enterR &&
      Math.abs(player.fy + PORTAL.centerY - pt.g.position.y) < PORTAL.reachY
    ) {
      if (pt.kind === 'extract') {
        sfx('portal');
        endRun('extract');
      } else nextStage();
      stopFrame();
      return;
    }
  }
}
function updateScreenFx(dt: number) {
  updateHitDirs(dt);
  screenFx.hitTimer -= dt;
  if (screenFx.hitTimer <= 0) hitm.classList.remove('on');
  screenFx.vig = Math.max(0, screenFx.vig - dt * VIGNETTE_DECAY);
  if (state === 'play') updateHud();
  screenFx.miniT -= dt;
  if (screenFx.miniT <= 0) {
    screenFx.miniT = MINIMAP_INTERVAL;
    drawMap(mini, mctx, false);
    if (!bigmap.hidden) drawMap(bigmap, bctx, true);
    updateMap3D(!bigmap.hidden);
  }
}

// weapon pickups compete for "nearest" each frame, so the choice starts over first (system pickupReset)
function resetNearest() {
  setNear(null, WEAPON_PICK_R);
}
// all pickups at once (tests)
export function updatePickups(dt: number) {
  resetNearest();
  query('pickup').forEach(p => p.update!(dt));
  sweepWorld();
}
// horizontal distance to a pickup; Infinity when a kit, chip or weapon is out of vertical reach (bits ignore height)
function pickupDistance(p: Pickup): number {
  if (p.kind === 'bit') return distXZ(player, p);
  const inReachY = Math.abs(p.y - player.fy - PICKUP_HOVER_Y) < PICKUP_REACH_Y;
  return inReachY ? distXZ(player, p) : Infinity;
}
// bits inside the magnet radius fly toward the player
function pullBit(p: Pickup, d: number, dt: number) {
  if (d >= BIT_MAGNET_R * player.magnet) return;
  const dx = player.x - p.x,
    dz = player.z - p.z;
  const step = Math.min(d, BIT_PULL_SPEED * dt);
  p.x += (dx / (d || 1)) * step;
  p.z += (dz / (d || 1)) * step;
  p.y += (player.fy + BIT_HOVER_Y - p.y) * Math.min(1, dt * 8);
}
function collectBit(p: Pickup) {
  p.dead = true;
  run.bits += p.value! * player.gainMul * (1 + GAIN_OPT_PER_LEVEL * weaponOptCount('gain'));
  sfx('pick', 30);
}
function collectKit(p: Pickup) {
  if (player.kits < KIT_MAX) {
    p.dead = true;
    player.kits++;
    sfx('pick');
    toast(t('run.kitPlus', { n: player.kits, max: KIT_MAX }), 1200);
    weaponHud();
  }
  // kits full: used on the spot for a whole kit's heal (the same as using one and picking this up again)
  else if (player.hp < player.maxHp) {
    const heal = kitHealAmount();
    p.dead = true;
    player.hp = Math.min(player.maxHp, player.hp + heal);
    sfx('heal');
    toast(t('run.kitUsedNow', { n: heal }), 1500);
  }
}
function collectChip(p: Pickup) {
  p.dead = true;
  sfx('chip');
  openPerk(t('perk.title'));
}
export function updatePickup(p: Pickup, dt: number) {
  p.t += dt;
  const d = pickupDistance(p);
  if (p.kind === 'bit') {
    pullBit(p, d, dt);
    if (d < BIT_PICK_R) collectBit(p);
  } else if (p.kind === 'kit') {
    if (d < KIT_PICK_R) collectKit(p);
  } else if (p.kind === 'chip') {
    if (d < CHIP_PICK_R) {
      collectChip(p);
      return;
    }
  } else if (p.kind === 'weapon') {
    if (d < nearPickupDist) setNear(p, d);
  }
  if (p.dead) return;
  p.mesh.position.set(p.x, p.y + Math.sin(p.t * 3) * 0.12, p.z);
  p.mesh.rotation.y += dt * 2;
  if (p.kind === 'chip') p.mesh.rotation.x += dt;
}
export function updateWave(w: Wave, dt: number) {
  w.r += w.speed * dt;
  w.mesh.scale.set(w.r, 1, w.r);
  w.mesh.material.opacity = 0.75 * (1 - w.r / w.max);
  if (!w.hit) {
    const d = distXZ(player, w);
    if (Math.abs(d - w.r) < WAVE_HIT_WIDTH) {
      w.hit = true;
      damagePlayer(w.dmg, w);
    }
  }
  if (w.r >= w.max) w.dead = true;
}

// ---- the systems, in order. 'play' = diving, 'base' = the base screen with the slowly turning backdrop ----
const PLAY = ['play'];
// registers the systems and starts the loop; main.ts calls this once every module has loaded
export function boot() {
  addSystem({ name: 'player', order: 0, modes: PLAY, update: updatePlayer });
  ENEMY_GROUP.system.modes = PLAY; // enemies: engine world group, updateEnemy per enemy (order 10)
  addSystem({ name: 'playerBullets', order: 20, modes: PLAY, update: updatePBullets });
  addSystem({ name: 'enemyBullets', order: 21, modes: PLAY, update: updateEBullets });
  addSystem({ name: 'pickupReset', order: 29, modes: PLAY, update: resetNearest });
  // pickups and shockwaves: engine world objects (engine/src/core/world.ts), updated at order 30
  WORLD.system.modes = PLAY;
  // engine effects (engine/src/render/fx.ts): frozen while paused; particles also drift on the base screen
  FX.fireballs.modes = PLAY;
  FX.particles.modes = ['play', 'base'];
  addSystem({ name: 'hazards', order: 50, modes: PLAY, update: updateHazards });
  addSystem({ name: 'building', order: 55, modes: PLAY, update: updateBuildingFloor });
  addSystem({ name: 'music', order: 60, modes: PLAY, update: updateMusic });
  // a run that just ended (death / extraction above) stops here for this frame
  addSystem({
    name: 'endGuard',
    order: 65,
    modes: PLAY,
    update: () => {
      if (state === 'result') stopFrame();
    },
  });
  addSystem({ name: 'portals', order: 70, modes: PLAY, update: updatePortals });
  addSystem({ name: 'screenFx', order: 90, modes: PLAY, update: updateScreenFx });
  addSystem({ name: 'attract', order: 0, modes: ['base'], update: attract });

  renderBase();
  buildAttract();
  setMusic('BASE'); // starts once the first tap/click unlocks audio
  unlockAudio();
  startLoop();
}
