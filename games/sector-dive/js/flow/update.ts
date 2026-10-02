import type { Pickup, Wave } from '../data/types.ts';
import { rand } from '../../../../engine/core/util.ts';
import { LOOP, addSystem, runSystems, startLoop, stopFrame } from '../../../../engine/core/loop.ts';
import { WORLD, query, sweepWorld } from '../../../../engine/core/world.ts';
import { t } from '../../../../engine/core/i18n.ts';
import { sfx, unlockAudio } from '../../../../engine/audio/audio.ts';
import { setMusic } from '../../../../engine/audio/music.ts';
import { camera, gun } from '../../../../engine/render/render.ts';
import { FX } from '../../../../engine/render/fx.ts';
import { T, W, computeFlow, floorY, moveCircle } from '../../../../engine/world/tiles.ts';
import { toast } from '../../../../engine/ui/ui.ts';
import { fire2Held, fireHeld, joy, keys, mouseFire } from '../../../../engine/ui/input.ts';
import { EYE, PORTAL } from '../data/level.ts';
import { KIT_MAX, TUNE } from '../data/progress.ts';
import { save } from '../system/save.ts';
import { updateMusic } from './music.ts';
import { portals, reveal, updateHazards } from '../world/level.ts';
import { ENEMY_GROUP, nearD, setNear, setTarget, target } from '../world/entities.ts';
import { GUNFX, P, curVM, curW, damagePlayer, findTarget, kitHealAmount, magSize, run, shotId, tryFire, wo } from '../actors/player.ts';
import { CTRL } from '../ui/input.ts';
import { SCR, bctx, bigmap, drawMap, hitm, mctx, mini, updateHitDirs, updateHud, weaponHud } from '../ui/hud.ts';
import { attract, buildAttract, endRun, nextStage, openPerk, renderBase, state } from './game.ts';
import { updateEBullets, updatePBullets } from '../actors/bullets.ts';
// Per-frame systems of Sector Dive, run by the engine loop (engine/core/loop.js) in this order
LOOP.mode = () => state;
// ---- tuning numbers used only here ----
const STICK_DASH_PUSH = 0.97;     // stick pushed this far (0-1) counts as "at the rim" for the stick dash
const STICK_DASH_HOLD = 0.3;      // seconds held at the rim before the stick dash fires
const STICK_DASH_REARM = 0.8;     // the stick must come back below this before it can dash again
const MOVE_EPS = 0.1;             // move input / speed below this counts as standing still
const STAMINA_WARN_TIME = 0.3;    // seconds the stamina bar flashes when a dash is refused
const SPEED_CHIP_PER_LEVEL = 0.06; // move speed per speed chip level (+6%)
const GRAVITY = 26;               // m/s^2, falling after a ledge or a drop
const GROUND_EPS = 0.01;          // within this of the floor counts as standing on it (m)
const BOB_RATE = 9;               // head-bob phase speed while moving (rad/s)
const SHAKE_DECAY = 1.2;          // screen shake fades by this per second
const GUN_KICK_DECAY = 0.7;       // gun recoil fades by this per second
const VIGNETTE_DECAY = 2;         // damage vignette fades by this per second
const MINIMAP_INTERVAL = 0.15;    // seconds between map redraws
const MAX_SHOTS_PER_FRAME = 8;    // cap on rounds fired in one frame (fire rate faster than the frame rate)
const WEAPON_PICK_R = 1.9;        // how close a weapon pickup must be to be the "nearest" (m)
const BIT_MAGNET_R = 2.4;         // bits start flying to the player inside this x magnet chip (m)
const BIT_PULL_SPEED = 14;        // m/s a bit flies toward the player
const BIT_PICK_R = 0.7;           // bits are collected inside this (m)
const BIT_GAIN_PER_LEVEL = 0.1;   // bits per gain chip level (+10%)
const PICKUP_REACH_Y = 1.4;       // vertical reach for picking things up (m)
const KIT_PICK_R = 1.1;           // med kit pick-up radius (m)
const CHIP_PICK_R = 1.3;          // chip pick-up radius (m)
const WAVE_HIT_WIDTH = 0.6;       // shockwave ring thickness that hurts (m)
// seconds of play time (drives blinking and animations)
export let time = 0;
export function tickClock(dt: number) { time += dt; }
// one play step by hand (tests)
export function update(dt: number) { runSystems(dt, 'play'); }

// ---- player: movement, dash, camera, viewmodel, reload and firing ----
export function updatePlayer(dt: number) {
  time += dt;
  let mx = 0, mz = 0;
  if (keys.KeyW || keys.ArrowUp) mz += 1;
  if (keys.KeyS || keys.ArrowDown) mz -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  mx += joy.x; mz -= joy.y;
  if (save.settings.stickDash && joy.id !== null) {
    const jm = Math.hypot(joy.x, joy.y);
    if (jm > STICK_DASH_PUSH) { CTRL.stickT += dt; if (CTRL.stickT > STICK_DASH_HOLD && CTRL.stickArmed) { CTRL.dashReq = true; CTRL.stickArmed = false; } }
    else { CTRL.stickT = 0; if (jm < STICK_DASH_REARM) CTRL.stickArmed = true; }
  } else { CTRL.stickT = 0; CTRL.stickArmed = true; }
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  let vx = fx * mz + rx * mx, vz = fz * mz + rz * mx;
  P.inv -= dt; SCR.stWarn -= dt;
  P.stDelay -= dt; if (P.stDelay <= 0) P.st = Math.min(P.stMax, P.st + P.stRegen * dt);
  if (CTRL.dashReq) {
    CTRL.dashReq = false;
    if (P.st >= TUNE.dashCost) {
      const l = Math.hypot(vx, vz);
      if (l > MOVE_EPS) { P.ddx = vx / l; P.ddz = vz / l; } else { P.ddx = fx; P.ddz = fz; }
      P.dashT = TUNE.dashTime; P.st -= TUNE.dashCost; P.stDelay = TUNE.staminaDelay; P.inv = Math.max(P.inv, TUNE.dashInvuln); sfx('dash');
    } else { SCR.stWarn = STAMINA_WARN_TIME; sfx('empty'); }
  }
  const sp = P.baseSpeed * P.spdMul * (1 + SPEED_CHIP_PER_LEVEL * wo('speed'));
  if (P.dashT > 0) { P.dashT -= dt; vx = P.ddx * TUNE.dashSpeed; vz = P.ddz * TUNE.dashSpeed; }
  moveCircle(P, vx * sp * dt, vz * sp * dt, P.r);
  const gy = floorY(P.x, P.z);
  if (P.fy > gy + GROUND_EPS) { P.vy -= GRAVITY * dt; P.fy = Math.max(gy, P.fy + P.vy * dt); if (P.fy === gy) P.vy = 0; }
  else { P.fy = gy; P.vy = 0; }
  if (Math.hypot(vx, vz) > MOVE_EPS) P.bob += dt * BOB_RATE;

  const ti = Math.floor(P.x / T), tj = Math.floor(P.z / T), tkey = tj * W + ti;
  if (tkey !== P.tile) { P.tile = tkey; computeFlow(ti, tj); reveal(ti, tj); }

  // camera + viewmodel
  SCR.shake = Math.max(0, SCR.shake - dt * SHAKE_DECAY);
  const sh = SCR.shake * SCR.shake;
  camera.position.set(P.x + rand(-sh, sh), P.fy + EYE + Math.sin(P.bob) * 0.05 + rand(-sh, sh), P.z + rand(-sh, sh));
  camera.rotation.set(P.pitch, P.yaw, 0);
  GUNFX.gunKick = Math.max(0, GUNFX.gunKick - dt * GUN_KICK_DECAY);
  const vm = curVM!, vp = vm.userData.pos;
  let rl = 0;
  if (P.reloadT > 0) { const k = 1 - P.reloadT / P.reloadMax; rl = Math.sin(Math.PI * k); }
  gun.position.set(vp[0] + Math.cos(P.bob * 0.5) * 0.012, vp[1] + Math.abs(Math.sin(P.bob * 0.5)) * 0.012 - GUNFX.gunKick * 0.3 - rl * 0.18, vp[2] + GUNFX.gunKick);
  gun.rotation.set(GUNFX.gunKick * 1.6 - rl * 0.7, 0, rl * 0.5);
  GUNFX.flashT -= dt; vm.userData.flash.visible = GUNFX.flashT > 0;

  // reload / shooting
  if (P.reloadT > 0) { P.reloadT -= dt; if (P.reloadT <= 0) { P.reloadT = 0; curW().mag = magSize(curW()); sfx('reloaded'); } }
  setTarget(findTarget());
  // A gun faster than the frame rate fires several rounds in one frame, so fire-rate chips keep working past 60 (or 30)
  // shots a second. The carry-over is kept to one frame, so a pause (reloading, not holding fire) doesn't bank shots.
  P.fireCd = Math.max(P.fireCd - dt, -dt);
  if (fireHeld || fire2Held || mouseFire || keys.KeyF || (save.settings.autofire && target)) {
    for (let k = 0; k < MAX_SHOTS_PER_FRAME && P.fireCd <= 0; k++) { const before = shotId; tryFire(); if (shotId === before) break; }
  }
}
// ---- gates: stepping into one moves on (the rest of the frame is skipped) ----
export function updatePortals(dt: number) {
  for (const pt of portals) {
    // arming (data/level.ts PORTAL): dim and still until it works, then bright and turning
    pt.t += dt;
    const d = Math.hypot(P.x - pt.x, P.z - pt.z);
    if (!pt.clear && d >= PORTAL.clearR) pt.clear = true;
    const armed = pt.t >= PORTAL.armTime && pt.clear;
    pt.ring.material.opacity = armed ? 1 : 0.35;
    pt.disc.material.opacity = armed ? 0.18 + Math.sin(time * 4) * 0.08 : 0.06;
    if (armed) pt.ring.rotation.z += dt * 1.5;
    if (armed && state === 'play' && d < PORTAL.enterR && Math.abs(P.fy + PORTAL.centerY - pt.g.position.y) < PORTAL.reachY) {
      if (pt.kind === 'extract') { sfx('portal'); endRun('extract'); }
      else nextStage();
      stopFrame();
      return;
    }
  }
}
export function updateScreenFx(dt: number) {
  updateHitDirs(dt);
  SCR.hitTimer -= dt; if (SCR.hitTimer <= 0) hitm.classList.remove('on');
  SCR.vig = Math.max(0, SCR.vig - dt * VIGNETTE_DECAY);
  if (state === 'play') updateHud();
  SCR.miniT -= dt;
  if (SCR.miniT <= 0) { SCR.miniT = MINIMAP_INTERVAL; drawMap(mini, mctx, false); if (!bigmap.hidden) drawMap(bigmap, bctx, true); }
}

// weapon pickups compete for "nearest" each frame, so the choice starts over first (system pickupReset)
export function resetNearest() { setNear(null, WEAPON_PICK_R); }
// all pickups at once (tests)
export function updatePickups(dt: number) { resetNearest(); query('pickup').forEach(p => p.update!(dt)); sweepWorld(); }
export function updatePickup(p: Pickup, dt: number) {
  p.t += dt;
  const dx = P.x - p.x, dz = P.z - p.z, d = Math.abs(p.y - P.fy - (p.kind === 'bit' ? 0.5 : 1)) < PICKUP_REACH_Y || p.kind === 'bit' ? Math.hypot(dx, dz) : 99;
  if (p.kind === 'bit') {
    if (d < BIT_MAGNET_R * P.magnet) { const s = Math.min(d, BIT_PULL_SPEED * dt); p.x += dx / (d || 1) * s; p.z += dz / (d || 1) * s; p.y += (P.fy + 0.5 - p.y) * Math.min(1, dt * 8); }
    if (d < BIT_PICK_R) { p.dead = true; run.bits += p.value! * P.gainMul * (1 + BIT_GAIN_PER_LEVEL * wo('gain')); sfx('pick', 30); }
  } else if (p.kind === 'kit') {
    if (d < KIT_PICK_R) {
      if (P.kits < KIT_MAX) { p.dead = true; P.kits++; sfx('pick'); toast(t('run.kitPlus', { n: P.kits, max: KIT_MAX }), 1200); weaponHud(); }
      // kits full: used on the spot for a whole kit's heal (the same as using one and picking this up again)
      else if (P.hp < P.maxHp) { const heal = kitHealAmount(); p.dead = true; P.hp = Math.min(P.maxHp, P.hp + heal); sfx('heal'); toast(t('run.kitUsedNow', { n: heal }), 1500); }
    }
  } else if (p.kind === 'chip') {
    if (d < CHIP_PICK_R) { p.dead = true; sfx('chip'); openPerk(t('perk.title')); return; }
  } else if (p.kind === 'weapon') {
    if (d < nearD) setNear(p, d);
  }
  if (p.dead) return;
  p.mesh.position.set(p.x, p.y + Math.sin(p.t * 3) * 0.12, p.z);
  p.mesh.rotation.y += dt * 2;
  if (p.kind === 'chip') p.mesh.rotation.x += dt;
}
export function updateWave(w: Wave, dt: number) {
  w.r += w.speed * dt;
  w.mesh.scale.set(w.r, 1, w.r); w.mesh.material.opacity = 0.75 * (1 - w.r / w.max);
  if (!w.hit) {
    const d = Math.hypot(P.x - w.x, P.z - w.z);
    if (Math.abs(d - w.r) < WAVE_HIT_WIDTH) { w.hit = true; damagePlayer(w.dmg, w); }
  }
  if (w.r >= w.max) w.dead = true;
}

// ---- the systems, in order. 'play' = diving, 'base' = the base screen with the slowly turning backdrop ----
export const PLAY = ['play'];
// registers the systems and starts the loop; main.js calls this once every module has loaded
export function boot() {
  addSystem({ name: 'player', order: 0, modes: PLAY, update: updatePlayer });
  ENEMY_GROUP.system.modes = PLAY; // enemies: engine world group, updateEnemy per enemy (order 10)
  addSystem({ name: 'playerBullets', order: 20, modes: PLAY, update: updatePBullets });
  addSystem({ name: 'enemyBullets', order: 21, modes: PLAY, update: updateEBullets });
  addSystem({ name: 'pickupReset', order: 29, modes: PLAY, update: resetNearest });
  // pickups and shockwaves: engine world objects (engine/core/world.js), updated at order 30
  WORLD.system.modes = PLAY;
  // engine effects (engine/render/fx.js): frozen while paused; particles also drift on the base screen
  FX.fireballs.modes = PLAY; FX.particles.modes = ['play', 'base'];
  addSystem({ name: 'hazards', order: 50, modes: PLAY, update: updateHazards });
  addSystem({ name: 'music', order: 60, modes: PLAY, update: updateMusic });
  // a run that just ended (death / extraction above) stops here for this frame
  addSystem({ name: 'endGuard', order: 65, modes: PLAY, update: () => { if (state === 'result') stopFrame(); } });
  addSystem({ name: 'portals', order: 70, modes: PLAY, update: updatePortals });
  addSystem({ name: 'screenFx', order: 90, modes: PLAY, update: updateScreenFx });
  addSystem({ name: 'attract', order: 0, modes: ['base'], update: attract });

  renderBase();
  buildAttract();
  setMusic('BASE'); // starts once the first tap/click unlocks audio
  unlockAudio();
  startLoop();
}
