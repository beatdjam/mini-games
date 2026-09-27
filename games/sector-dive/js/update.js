'use strict';
// ================= update =================
function update(dt) {
  time += dt;
  let mx = 0, mz = 0;
  if (keys.KeyW || keys.ArrowUp) mz += 1;
  if (keys.KeyS || keys.ArrowDown) mz -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  mx += joy.x; mz -= joy.y;
  if (save.settings.stickDash && joy.id !== null) {
    const jm = Math.hypot(joy.x, joy.y);
    if (jm > 0.97) { stickT += dt; if (stickT > 0.3 && stickArmed) { dashReq = true; stickArmed = false; } }
    else { stickT = 0; if (jm < 0.8) stickArmed = true; }
  } else { stickT = 0; stickArmed = true; }
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  let vx = fx * mz + rx * mx, vz = fz * mz + rz * mx;
  P.inv -= dt; stWarn -= dt;
  P.stDelay -= dt; if (P.stDelay <= 0) P.st = Math.min(P.stMax, P.st + P.stRegen * dt);
  if (dashReq) {
    dashReq = false;
    if (P.st >= TUNE.dashCost) {
      const l = Math.hypot(vx, vz);
      if (l > 0.1) { P.ddx = vx / l; P.ddz = vz / l; } else { P.ddx = fx; P.ddz = fz; }
      P.dashT = TUNE.dashTime; P.st -= TUNE.dashCost; P.stDelay = TUNE.staminaDelay; P.inv = Math.max(P.inv, TUNE.dashInvuln); sfx('dash');
    } else { stWarn = 0.3; sfx('empty'); }
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
  shake = Math.max(0, shake - dt * 1.2);
  const sh = shake * shake;
  camera.position.set(P.x + rand(-sh, sh), P.fy + EYE + Math.sin(P.bob) * 0.05 + rand(-sh, sh), P.z + rand(-sh, sh));
  camera.rotation.set(P.pitch, P.yaw, 0);
  gunKick = Math.max(0, gunKick - dt * 0.7);
  const vp = curVM.userData.pos;
  let rl = 0;
  if (P.reloadT > 0) { const k = 1 - P.reloadT / P.reloadMax; rl = Math.sin(Math.PI * k); }
  gun.position.set(vp[0] + Math.cos(P.bob * 0.5) * 0.012, vp[1] + Math.abs(Math.sin(P.bob * 0.5)) * 0.012 - gunKick * 0.3 - rl * 0.18, vp[2] + gunKick);
  gun.rotation.set(gunKick * 1.6 - rl * 0.7, 0, rl * 0.5);
  flashT -= dt; curVM.userData.flash.visible = flashT > 0;

  // reload / shooting
  if (P.reloadT > 0) { P.reloadT -= dt; if (P.reloadT <= 0) { P.reloadT = 0; curW().mag = magSize(curW()); sfx('reloaded'); } }
  target = findTarget();
  P.fireCd -= dt;
  if ((fireHeld || fire2Held || mouseFire || keys.KeyF || (save.settings.autofire && target)) && P.fireCd <= 0) tryFire();

  updateEnemies(dt);
  updatePBullets(dt);
  updateEBullets(dt);
  updatePickups(dt);
  updateWaves(dt);
  updateBalls(dt);
  updateParts(dt);
  updateHazards(dt);
  updateMusic(dt);
  if (state === 'result') return;

  for (const pt of portals) {
    pt.ring.rotation.z += dt * 1.5; pt.disc.material.opacity = 0.18 + Math.sin(time * 4) * 0.08;
    if (state === 'play' && Math.hypot(P.x - pt.x, P.z - pt.z) < 1.5 && Math.abs(P.fy + 1.7 - pt.g.position.y) < 1.6) {
      if (pt.kind === 'extract') { sfx('portal'); endRun('extract'); }
      else nextStage();
      return;
    }
  }

  enemies = enemies.filter(e => !e.dead);
  pickups = pickups.filter(p => !p.dead);
  waves = waves.filter(w => !w.dead);

  hitTimer -= dt; if (hitTimer <= 0) hitm.classList.remove('on');
  vig = Math.max(0, vig - dt * 2);
  if (state === 'play') updateHud();
  miniT -= dt;
  if (miniT <= 0) { miniT = 0.15; drawMap(mini, mctx, false); if (!bigmap.hidden) drawMap(bigmap, bctx, true); }
}

function updatePickups(dt) {
  nearW = null; let nearD = 1.9;
  for (const p of pickups) {
    if (p.dead) continue;
    p.t += dt;
    const dx = P.x - p.x, dz = P.z - p.z, d = Math.abs(p.y - P.fy - (p.kind === 'bit' ? 0.5 : 1)) < 1.4 || p.kind === 'bit' ? Math.hypot(dx, dz) : 99;
    if (p.kind === 'bit') {
      if (d < 2.4 * P.magnet) { const s = Math.min(d, 14 * dt); p.x += dx / (d || 1) * s; p.z += dz / (d || 1) * s; p.y += (P.fy + 0.5 - p.y) * Math.min(1, dt * 8); }
      if (d < 0.7) { p.dead = true; run.bits += p.value * P.gainMul * (1 + 0.1 * wo('gain')); sfx('pick', 30); }
    } else if (p.kind === 'kit') {
      if (d < 1.1) {
        if (P.kits < KIT_MAX) { p.dead = true; P.kits++; sfx('pick'); toast(`回復キット +1（${P.kits}/${KIT_MAX}）`, 1200); weaponHud(); }
        else if (P.hp < P.maxHp) { p.dead = true; P.hp = Math.min(P.maxHp, P.hp + 20); sfx('heal'); toast('キットが満杯なのでその場で使った（HP +20）', 1500); }
      }
    } else if (p.kind === 'chip') {
      if (d < 1.3) { p.dead = true; disposeTree(p.mesh); dynGroup.remove(p.mesh); sfx('chip'); openPerk('チップを1枚選ぶ'); continue; }
    } else if (p.kind === 'weapon') {
      if (d < nearD) { nearD = d; nearW = p; }
    }
    if (p.dead) { disposeTree(p.mesh); dynGroup.remove(p.mesh); continue; }
    p.mesh.position.set(p.x, p.y + Math.sin(p.t * 3) * 0.12, p.z);
    p.mesh.rotation.y += dt * 2;
    if (p.kind === 'chip') p.mesh.rotation.x += dt;
  }
}
function updateWaves(dt) {
  for (const w of waves) {
    w.r += w.speed * dt;
    w.m.scale.set(w.r, 1, w.r); w.m.material.opacity = 0.75 * (1 - w.r / w.max);
    if (!w.hit) {
      const d = Math.hypot(P.x - w.x, P.z - w.z);
      if (Math.abs(d - w.r) < 0.6) { w.hit = true; damagePlayer(w.dmg); }
    }
    if (w.r >= w.max) { w.dead = true; disposeTree(w.m); dynGroup.remove(w.m); }
  }
}
function attract(dt) {
  time += dt;
  attractYaw += dt * 0.12;
  camera.position.set(attractPos[0], floorY(attractPos[0], attractPos[1]) + EYE + 0.4, attractPos[1]);
  camera.rotation.set(-0.05, attractYaw, 0);
  portals.forEach(pt => { pt.ring.rotation.z += dt * 1.5; });
  for (const e of enemies) { e.t += dt; e.mesh.position.y = e.fy + e.y + Math.sin(e.t * 2) * 0.15; e.body.rotation.y += dt; }
  updateParts(dt);
}

// ================= loop =================
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state === 'play') update(dt);
  else if (state === 'base') attract(dt);
  renderer.render(scene, camera);
  renderGun();
}
renderBase();
buildAttract();
setMusic('BASE'); // starts once the first tap/click unlocks audio
document.addEventListener('pointerdown', () => audioInit(), { once: true });
requestAnimationFrame(frame);
