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
import { EYE } from '../data/level.ts';
import { KIT_MAX, TUNE } from '../data/progress.ts';
import { save } from '../system/save.ts';
import { updateMusic } from './music.ts';
import { portals, reveal, updateHazards } from '../world/level.ts';
import { ENEMY_GROUP, nearD, setNear, setTarget, target } from '../world/entities.ts';
import { GUNFX, P, curVM, curW, damagePlayer, findTarget, magSize, run, tryFire, wo } from '../actors/player.ts';
import { CTRL } from '../ui/input.ts';
import { SCR, bctx, bigmap, drawMap, hitm, mctx, mini, updateHud, weaponHud } from '../ui/hud.ts';
import { attract, buildAttract, endRun, nextStage, openPerk, renderBase, state } from './game.ts';
import { updateEBullets, updatePBullets } from '../actors/bullets.ts';
// Per-frame systems of Sector Dive, run by the engine loop (engine/core/loop.js) in this order
LOOP.mode = () => state;
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
    if (jm > 0.97) { CTRL.stickT += dt; if (CTRL.stickT > 0.3 && CTRL.stickArmed) { CTRL.dashReq = true; CTRL.stickArmed = false; } }
    else { CTRL.stickT = 0; if (jm < 0.8) CTRL.stickArmed = true; }
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
      if (l > 0.1) { P.ddx = vx / l; P.ddz = vz / l; } else { P.ddx = fx; P.ddz = fz; }
      P.dashT = TUNE.dashTime; P.st -= TUNE.dashCost; P.stDelay = TUNE.staminaDelay; P.inv = Math.max(P.inv, TUNE.dashInvuln); sfx('dash');
    } else { SCR.stWarn = 0.3; sfx('empty'); }
  }
  const sp = P.baseSpeed * P.spdMul * (1 + 0.06 * wo('speed'));
  if (P.dashT > 0) { P.dashT -= dt; vx = P.ddx * TUNE.dashSpeed; vz = P.ddz * TUNE.dashSpeed; }
  moveCircle(P, vx * sp * dt, vz * sp * dt, P.r);
  const gy = floorY(P.x, P.z);
  if (P.fy > gy + 0.01) { P.vy -= 26 * dt; P.fy = Math.max(gy, P.fy + P.vy * dt); if (P.fy === gy) P.vy = 0; }
  else { P.fy = gy; P.vy = 0; }
  if (Math.hypot(vx, vz) > 0.1) P.bob += dt * 9;

  const ti = Math.floor(P.x / T), tj = Math.floor(P.z / T), tkey = tj * W + ti;
  if (tkey !== P.tile) { P.tile = tkey; computeFlow(ti, tj); reveal(ti, tj); }

  // camera + viewmodel
  SCR.shake = Math.max(0, SCR.shake - dt * 1.2);
  const sh = SCR.shake * SCR.shake;
  camera.position.set(P.x + rand(-sh, sh), P.fy + EYE + Math.sin(P.bob) * 0.05 + rand(-sh, sh), P.z + rand(-sh, sh));
  camera.rotation.set(P.pitch, P.yaw, 0);
  GUNFX.gunKick = Math.max(0, GUNFX.gunKick - dt * 0.7);
  const vm = curVM!, vp = vm.userData.pos;
  let rl = 0;
  if (P.reloadT > 0) { const k = 1 - P.reloadT / P.reloadMax; rl = Math.sin(Math.PI * k); }
  gun.position.set(vp[0] + Math.cos(P.bob * 0.5) * 0.012, vp[1] + Math.abs(Math.sin(P.bob * 0.5)) * 0.012 - GUNFX.gunKick * 0.3 - rl * 0.18, vp[2] + GUNFX.gunKick);
  gun.rotation.set(GUNFX.gunKick * 1.6 - rl * 0.7, 0, rl * 0.5);
  GUNFX.flashT -= dt; vm.userData.flash.visible = GUNFX.flashT > 0;

  // reload / shooting
  if (P.reloadT > 0) { P.reloadT -= dt; if (P.reloadT <= 0) { P.reloadT = 0; curW().mag = magSize(curW()); sfx('reloaded'); } }
  setTarget(findTarget());
  P.fireCd -= dt;
  if ((fireHeld || fire2Held || mouseFire || keys.KeyF || (save.settings.autofire && target)) && P.fireCd <= 0) tryFire();
}
// ---- gates: stepping into one moves on (the rest of the frame is skipped) ----
export function updatePortals(dt: number) {
  for (const pt of portals) {
    pt.ring.rotation.z += dt * 1.5; pt.disc.material.opacity = 0.18 + Math.sin(time * 4) * 0.08;
    if (state === 'play' && Math.hypot(P.x - pt.x, P.z - pt.z) < 1.5 && Math.abs(P.fy + 1.7 - pt.g.position.y) < 1.6) {
      if (pt.kind === 'extract') { sfx('portal'); endRun('extract'); }
      else nextStage();
      stopFrame();
      return;
    }
  }
}
export function updateScreenFx(dt: number) {
  SCR.hitTimer -= dt; if (SCR.hitTimer <= 0) hitm.classList.remove('on');
  SCR.vig = Math.max(0, SCR.vig - dt * 2);
  if (state === 'play') updateHud();
  SCR.miniT -= dt;
  if (SCR.miniT <= 0) { SCR.miniT = 0.15; drawMap(mini, mctx, false); if (!bigmap.hidden) drawMap(bigmap, bctx, true); }
}

// weapon pickups compete for "nearest" each frame, so the choice starts over first (system pickupReset)
export function resetNearest() { setNear(null, 1.9); }
// all pickups at once (tests)
export function updatePickups(dt: number) { resetNearest(); query('pickup').forEach(p => p.update!(dt)); sweepWorld(); }
export function updatePickup(p: Pickup, dt: number) {
  p.t += dt;
  const dx = P.x - p.x, dz = P.z - p.z, d = Math.abs(p.y - P.fy - (p.kind === 'bit' ? 0.5 : 1)) < 1.4 || p.kind === 'bit' ? Math.hypot(dx, dz) : 99;
  if (p.kind === 'bit') {
    if (d < 2.4 * P.magnet) { const s = Math.min(d, 14 * dt); p.x += dx / (d || 1) * s; p.z += dz / (d || 1) * s; p.y += (P.fy + 0.5 - p.y) * Math.min(1, dt * 8); }
    if (d < 0.7) { p.dead = true; run.bits += p.value! * P.gainMul * (1 + 0.1 * wo('gain')); sfx('pick', 30); }
  } else if (p.kind === 'kit') {
    if (d < 1.1) {
      if (P.kits < KIT_MAX) { p.dead = true; P.kits++; sfx('pick'); toast(t('run.kitPlus', { n: P.kits, max: KIT_MAX }), 1200); weaponHud(); }
      else if (P.hp < P.maxHp) { p.dead = true; P.hp = Math.min(P.maxHp, P.hp + 20); sfx('heal'); toast(t('run.kitUsedNow'), 1500); }
    }
  } else if (p.kind === 'chip') {
    if (d < 1.3) { p.dead = true; sfx('chip'); openPerk(t('perk.title')); return; }
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
    if (Math.abs(d - w.r) < 0.6) { w.hit = true; damagePlayer(w.dmg); }
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
