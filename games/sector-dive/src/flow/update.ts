import type { Pickup, Wave } from '../data/types.ts';
import { distXZ, rand } from '@engine/core/util.ts';
import { LOOP, addSystem, runSystems, startLoop, stopFrame } from '@engine/core/loop.ts';
import { WORLD, query, sweepWorld } from '@engine/core/world.ts';
import { t } from '@engine/core/i18n.ts';
import { sfx, unlockAudio } from '@engine/audio/audio.ts';
import { setMusic } from '@engine/audio/music.ts';
import { camera, gun } from '@engine/render/render.ts';
import { FX } from '@engine/render/fx.ts';
import { T, W, computeFlow, floorY, moveCircle } from '@engine/world/tiles.ts';
import { toast } from '@engine/ui/ui.ts';
import { fire2Held, fireHeld, joy, keys, mouseFire } from '@engine/ui/input.ts';
import { EYE, PORTAL } from '../data/level.ts';
import { KIT_MAX, TUNE } from '../data/progress.ts';
import { save } from '../core/save.ts';
import { updateMusic } from './music.ts';
import { level, reveal } from '../world/level.ts';
import { updateHazards } from '../world/hazards.ts';
import { ENEMY_GROUP, nearPickupDist, setNear, setTarget, target } from '../world/entities.ts';
import {
  GUNFX,
  player,
  curVM,
  currentWeapon,
  damagePlayer,
  findTarget,
  kitHealAmount,
  magSize,
  run,
  shotId,
  tryFire,
  weaponOptCount,
} from '../actors/player.ts';
import { controlState } from '../ui/input.ts';
import { drawMap } from '../ui/minimap.ts';
import { screenFx, bctx, bigmap, hitm, mctx, mini, updateHitDirs, updateHud, weaponHud } from '../ui/hud.ts';
import { attract, buildAttract } from './attract.ts';
import { endRun, nextStage } from './run.ts';
import { state } from './state.ts';
import { openPerk } from '../screens/perk.ts';
import { renderBase } from '../screens/base.ts';
import { updateEBullets, updatePBullets } from '../actors/bullets.ts';
// Per-frame systems of Sector Dive, run by the engine loop (engine/src/core/loop.ts) in this order
LOOP.mode = () => state;
// ---- tuning numbers used only here ----
const STICK_DASH_PUSH = 0.97; // stick pushed this far (0-1) counts as "at the rim" for the stick dash
const STICK_DASH_HOLD = 0.3; // seconds held at the rim before the stick dash fires
const STICK_DASH_REARM = 0.8; // the stick must come back below this before it can dash again
const MOVE_EPS = 0.1; // move input / speed below this counts as standing still
const STAMINA_WARN_TIME = 0.3; // seconds the stamina bar flashes when a dash is refused
const SPEED_CHIP_PER_LEVEL = 0.06; // move speed per speed chip level (+6%)
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
const BIT_GAIN_PER_LEVEL = 0.1; // bits per gain chip level (+10%)
const PICKUP_REACH_Y = 1.4; // vertical reach for picking things up (m)
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
export function updatePlayer(dt: number) {
  time += dt;
  let mx = 0,
    mz = 0;
  if (keys.KeyW || keys.ArrowUp) mz += 1;
  if (keys.KeyS || keys.ArrowDown) mz -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  mx += joy.x;
  mz -= joy.y;
  if (save.settings.stickDash && joy.id !== null) {
    const jm = Math.hypot(joy.x, joy.y);
    if (jm > STICK_DASH_PUSH) {
      controlState.stickT += dt;
      if (controlState.stickT > STICK_DASH_HOLD && controlState.stickArmed) {
        controlState.dashReq = true;
        controlState.stickArmed = false;
      }
    } else {
      controlState.stickT = 0;
      if (jm < STICK_DASH_REARM) controlState.stickArmed = true;
    }
  } else {
    controlState.stickT = 0;
    controlState.stickArmed = true;
  }
  const ml = Math.hypot(mx, mz);
  if (ml > 1) {
    mx /= ml;
    mz /= ml;
  }
  const fx = -Math.sin(player.yaw),
    fz = -Math.cos(player.yaw),
    rx = Math.cos(player.yaw),
    rz = -Math.sin(player.yaw);
  let vx = fx * mz + rx * mx,
    vz = fz * mz + rz * mx;
  player.inv -= dt;
  screenFx.stWarn -= dt;
  player.stDelay -= dt;
  if (player.stDelay <= 0) player.st = Math.min(player.stMax, player.st + player.stRegen * dt);
  if (controlState.dashReq) {
    controlState.dashReq = false;
    if (player.st >= TUNE.dashCost) {
      const l = Math.hypot(vx, vz);
      if (l > MOVE_EPS) {
        player.ddx = vx / l;
        player.ddz = vz / l;
      } else {
        player.ddx = fx;
        player.ddz = fz;
      }
      player.dashT = TUNE.dashTime;
      player.st -= TUNE.dashCost;
      player.stDelay = TUNE.staminaDelay;
      player.inv = Math.max(player.inv, TUNE.dashInvuln);
      sfx('dash');
    } else {
      screenFx.stWarn = STAMINA_WARN_TIME;
      sfx('empty');
    }
  }
  const sp = player.baseSpeed * player.spdMul * (1 + SPEED_CHIP_PER_LEVEL * weaponOptCount('speed'));
  if (player.dashT > 0) {
    player.dashT -= dt;
    vx = player.ddx * TUNE.dashSpeed;
    vz = player.ddz * TUNE.dashSpeed;
  }
  moveCircle(player, vx * sp * dt, vz * sp * dt, player.r);
  const gy = floorY(player.x, player.z);
  if (player.fy > gy + GROUND_EPS) {
    player.vy -= GRAVITY * dt;
    player.fy = Math.max(gy, player.fy + player.vy * dt);
    if (player.fy === gy) player.vy = 0;
  } else {
    player.fy = gy;
    player.vy = 0;
  }
  if (Math.hypot(vx, vz) > MOVE_EPS) player.bob += dt * BOB_RATE;

  const ti = Math.floor(player.x / T),
    tj = Math.floor(player.z / T),
    tkey = tj * W + ti;
  if (tkey !== player.tile) {
    player.tile = tkey;
    computeFlow(ti, tj);
    reveal(ti, tj);
  }

  // camera + viewmodel
  screenFx.shake = Math.max(0, screenFx.shake - dt * SHAKE_DECAY);
  const sh = screenFx.shake * screenFx.shake;
  camera.position.set(
    player.x + rand(-sh, sh),
    player.fy + EYE + Math.sin(player.bob) * 0.05 + rand(-sh, sh),
    player.z + rand(-sh, sh),
  );
  camera.rotation.set(player.pitch, player.yaw, 0);
  GUNFX.gunKick = Math.max(0, GUNFX.gunKick - dt * GUN_KICK_DECAY);
  const vm = curVM!,
    vp = vm.userData.pos;
  let rl = 0;
  if (player.reloadT > 0) {
    const k = 1 - player.reloadT / player.reloadMax;
    rl = Math.sin(Math.PI * k);
  }
  gun.position.set(
    vp[0] + Math.cos(player.bob * 0.5) * 0.012,
    vp[1] + Math.abs(Math.sin(player.bob * 0.5)) * 0.012 - GUNFX.gunKick * 0.3 - rl * 0.18,
    vp[2] + GUNFX.gunKick,
  );
  gun.rotation.set(GUNFX.gunKick * 1.6 - rl * 0.7, 0, rl * 0.5);
  GUNFX.flashT -= dt;
  vm.userData.flash.visible = GUNFX.flashT > 0;

  // reload / shooting
  if (player.reloadT > 0) {
    player.reloadT -= dt;
    if (player.reloadT <= 0) {
      player.reloadT = 0;
      currentWeapon().mag = magSize(currentWeapon());
      sfx('reloaded');
    }
  }
  setTarget(findTarget());
  // A gun faster than the frame rate fires several rounds in one frame, so fire-rate chips keep working past 60 (or 30)
  // shots a second. The carry-over is kept to one frame, so a pause (reloading, not holding fire) doesn't bank shots.
  player.fireCd = Math.max(player.fireCd - dt, -dt);
  if (fireHeld || fire2Held || mouseFire || keys.KeyF || (save.settings.autofire && target)) {
    for (let k = 0; k < MAX_SHOTS_PER_FRAME && player.fireCd <= 0; k++) {
      const before = shotId;
      tryFire();
      if (shotId === before) break;
    }
  }
}
// ---- gates: stepping into one moves on (the rest of the frame is skipped) ----
export function updatePortals(dt: number) {
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
export function updateScreenFx(dt: number) {
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
  }
}

// weapon pickups compete for "nearest" each frame, so the choice starts over first (system pickupReset)
export function resetNearest() {
  setNear(null, WEAPON_PICK_R);
}
// all pickups at once (tests)
export function updatePickups(dt: number) {
  resetNearest();
  query('pickup').forEach(p => p.update!(dt));
  sweepWorld();
}
export function updatePickup(p: Pickup, dt: number) {
  p.t += dt;
  const dx = player.x - p.x,
    dz = player.z - p.z,
    d =
      Math.abs(p.y - player.fy - (p.kind === 'bit' ? 0.5 : 1)) < PICKUP_REACH_Y || p.kind === 'bit'
        ? Math.hypot(dx, dz)
        : 99;
  if (p.kind === 'bit') {
    if (d < BIT_MAGNET_R * player.magnet) {
      const s = Math.min(d, BIT_PULL_SPEED * dt);
      p.x += (dx / (d || 1)) * s;
      p.z += (dz / (d || 1)) * s;
      p.y += (player.fy + 0.5 - p.y) * Math.min(1, dt * 8);
    }
    if (d < BIT_PICK_R) {
      p.dead = true;
      run.bits += p.value! * player.gainMul * (1 + BIT_GAIN_PER_LEVEL * weaponOptCount('gain'));
      sfx('pick', 30);
    }
  } else if (p.kind === 'kit') {
    if (d < KIT_PICK_R) {
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
  } else if (p.kind === 'chip') {
    if (d < CHIP_PICK_R) {
      p.dead = true;
      sfx('chip');
      openPerk(t('perk.title'));
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
export const PLAY = ['play'];
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
