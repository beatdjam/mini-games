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
    if (P.st >= 45) {
      const l = Math.hypot(vx, vz);
      if (l > 0.1) { P.ddx = vx / l; P.ddz = vz / l; } else { P.ddx = fx; P.ddz = fz; }
      P.dashT = 0.2; P.st -= 45; P.stDelay = 0.5; P.inv = Math.max(P.inv, 0.32); sfx('dash');
    } else { stWarn = 0.3; sfx('empty'); }
  }
  const sp = P.baseSpeed * P.spdMul * (1 + 0.06 * wo('speed'));
  if (P.dashT > 0) { P.dashT -= dt; vx = P.ddx * 3.3; vz = P.ddz * 3.3; }
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

function updateEnemies(dt) {
  const py = P.fy + 1.3;
  for (const e of enemies) {
    if (e.dead) continue;
    if (e.flash > 0) e.flash -= dt;
    e.mat.emissiveIntensity = e.flash > 0 ? 1.8 : e.baseEI;
    if (e.boss) { e.update(e, dt); continue; }
    const def = e.def, dx = P.x - e.x, dz = P.z - e.z, dist = Math.hypot(dx, dz) || 0.001, ey = e.fy + def.y;
    e.t += dt;
    if (!e.active) {
      const fd = flowAt(e.x, e.z);
      if (fd >= 0 && fd <= 5 && hasLOS(e.x, e.z, P.x, P.z, ey, py)) e.active = true;
      else { e.mesh.position.y = ey + Math.sin(e.t * 2) * 0.12; e.body.rotation.y += dt * 0.5; continue; }
    }
    e.cd -= dt; e.mcd -= dt;
    const los = dist < 40 && hasLOS(e.x, e.z, P.x, P.z, ey, py);
    let still = false;
    // bomber: light the fuse when close, blow up when it runs out
    if (def.bomber) {
      if (e.fuse !== undefined) {
        e.fuse -= dt; e.flash = Math.sin(e.t * 50) > 0 ? 0.05 : 0; still = true;
        if (e.fuse <= 0) { detonate(e); continue; }
      } else if (dist < 2.2 && Math.abs(P.fy - e.fy) < 1.5) { e.fuse = 0.45; sfx('empty'); still = true; }
    }
    // sniper: 1.1s visible laser (locks for the last 0.25s), then one fast round
    if (def.sniper) {
      if (e.aim > 0) {
        e.aim -= dt; still = true;
        const sy = e.mesh.position.y + 0.7;
        if (e.aim > 0.25) e.lock = [P.x, py - 0.1, P.z];
        setLaser(e.laser, [e.x, sy, e.z], e.lock, e.aim > 0.25 ? 0.45 : (Math.sin(e.t * 60) > 0 ? 1 : 0.3));
        if (e.aim <= 0) {
          e.laser.visible = false; e.cd = rand(2.6, 3.4);
          const vx = e.lock[0] - e.x, vy = e.lock[1] - sy, vz = e.lock[2] - e.z, l = Math.hypot(vx, vy, vz) || 1;
          spawnEBullet(e.x, sy, e.z, vx / l * 60, vy / l * 60, vz / l * 60, e.dmg, 0xff4d8d, 0.7);
          sfx('rail', 80);
        }
      } else if (los && e.cd <= 0) { e.aim = 1.1; e.lock = [P.x, py, P.z]; still = true; }
      else e.laser.visible = false;
    }
    if (def.speed > 0 && !still) {
      let tx = 0, tz = 0, want = def.speed;
      if (los) {
        if (def.keep && dist < def.keep) { tx = -dz / dist * e.side; tz = dx / dist * e.side; want *= 0.6; if (Math.random() < dt * 0.4) e.side *= -1; }
        else { tx = dx / dist; tz = dz / dist; }
      } else { const f = flowDir(e.x, e.z); if (f) { tx = f[0]; tz = f[1]; } else { tx = dx / dist; tz = dz / dist; } }
      for (const o of enemies) {
        if (o === e || o.dead || o.boss) continue;
        const ox = e.x - o.x, oz = e.z - o.z, d2 = ox * ox + oz * oz, rr = e.r + o.r + 0.3;
        if (d2 < rr * rr && d2 > 1e-4) { const d = Math.sqrt(d2); tx += ox / d * 0.9; tz += oz / d * 0.9; }
      }
      const tl = Math.hypot(tx, tz);
      if (tl > 0.01) { moveCircle(e, tx / tl * want * dt, tz / tl * want * dt, e.r); e.fy = floorY(e.x, e.z); }
    }
    if (def.melee && dist < e.r + P.r + 0.4 && Math.abs(P.fy - e.fy) < 1.2 && e.mcd <= 0) { e.mcd = 0.9; damagePlayer(e.dmg); }
    if (def.ranged && los && dist < 26 && e.cd <= 0) {
      e.cd = def.ranged.rate * rand(0.8, 1.25);
      const r = def.ranged;
      fanAt(e.x, e.mesh.position.y + (def.geo === 'cyl' ? 1.1 : 0), e.z, r.count, r.spread, r.speed, e.dmg, def.color === 0xffe14a ? 0xffe14a : 0xff4d8d);
    }
    const bob = def.fly ? Math.sin(e.t * 3) * 0.3 : 0;
    e.mesh.position.set(e.x, e.fy + def.y + bob, e.z);
    e.mesh.rotation.y = Math.atan2(dx, dz);
    if (def.geo === 'tetra' || def.geo === 'tetraS') e.body.rotation.x += dt * 8;
    if (def.geo === 'octa' || def.geo === 'ico') e.body.rotation.y += dt * 3;
  }
}
function updatePBullets(dt) {
  for (const b of pBullets) {
    if (!b.alive) continue;
    b.life -= dt;
    if (b.grav) b.vy -= b.grav * dt;
    const dist = Math.hypot(b.vx, b.vy, b.vz) * dt, steps = Math.max(1, Math.ceil(dist / 0.6));
    let dead = b.life <= 0;
    for (let s = 0; s < steps && !dead; s++) {
      b.x += b.vx * dt / steps; b.y += b.vy * dt / steps; b.z += b.vz * dt / steps;
      if (b.y > WALL_H + 3 || solidAt(b.x, b.z) || b.y < floorY(b.x, b.z) + 0.03) {
        if (b.blast) explode(b.x, Math.max(floorY(b.x, b.z) + 0.4, b.y), b.z, b.blast, b.dmg, b.color, true);
        else burst(b.x, b.y, b.z, b.color, 3, 4, 0.3);
        dead = true; break;
      }
      for (const e of enemies) {
        if (e.dead || b.hit.has(e)) continue;
        let hit = false;
        for (const sp of spheres(e)) {
          const q = sp.p, dx = b.x - q.x, dy = b.y - q.y, dz = b.z - q.z, hr = sp.r + (b.blast ? 0.2 : 0.05);
          if (dx * dx + dy * dy + dz * dz < hr * hr) { hit = true; break; }
        }
        if (!hit) continue;
        b.hit.add(e);
        if (b.blast) { explode(b.x, b.y, b.z, b.blast, b.dmg, b.color, true); dead = true; break; }
        // shield: rounds arriving from the front are stopped (the rail gun punches through)
        if (e.def.shield && !b.rail) {
          const fx = Math.sin(e.mesh.rotation.y), fz = Math.cos(e.mesh.rotation.y), ox = b.x - e.x, oz = b.z - e.z, ol = Math.hypot(ox, oz) || 1;
          if ((ox * fx + oz * fz) / ol > 0.3) { burst(b.x, b.y, b.z, 0x8cc8ff, 4, 5, 0.25); sfx('empty', 60); dead = true; break; }
        }
        const crit = Math.random() < P.crit + 0.08 * wo('crit');
        let dmg = b.dmg * (crit ? 2 : 1);
        const travel = Math.hypot(b.x - b.ox, b.z - b.oz);
        if (b.close && travel < b.close) dmg *= b.closeMul;
        if (b.far && travel > b.far) dmg *= b.farMul;
        hurtEnemy(e, dmg, crit);
        // shotgun: enough pellets from one shot on the same target lands a bonus hit
        if (b.full && !e.dead) {
          if (e.lastShot !== b.shot) { e.lastShot = b.shot; e.shotN = 0; }
          if (++e.shotN === b.full) { hurtEnemy(e, b.dmg * b.closeMul * 3, true); burst(b.x, b.y, b.z, 0xffffff, 10, 7, 0.35); sfx('kill', 60); }
        }
        if (b.kb && !e.boss && !e.dead) { const kx = e.x - P.x, kz = e.z - P.z, kl = Math.hypot(kx, kz) || 1; moveCircle(e, kx / kl * b.kb, kz / kl * b.kb, e.r); e.fy = floorY(e.x, e.z); }
        burst(b.x, b.y, b.z, b.color, 2, 3, 0.25);
        if (--b.pierce < 0) { dead = true; break; }
      }
    }
    if (dead) { b.alive = false; b.mesh.visible = false; continue; }
    b.mesh.position.set(b.x, b.y, b.z);
    if (b.blast) {
      b.mesh.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
      burst(b.x - b.vx * 0.02, b.y, b.z - b.vz * 0.02, Math.random() < 0.35 ? 0xff8a3d : 0x6b7480, 1, 0.6, 0.7, -1.5);
    }
  }
}
function updateEBullets(dt) {
  for (const b of eBullets) {
    if (!b.alive) continue;
    b.life -= dt;
    if (b.homing > 0) {
      b.homing -= dt;
      const dx = P.x - b.x, dy = P.fy + 1.2 - b.y, dz = P.z - b.z, l = Math.hypot(dx, dy, dz) || 1, k = Math.min(1, dt * 2.2);
      b.vx += (dx / l * b.speed - b.vx) * k; b.vy += (dy / l * b.speed - b.vy) * k; b.vz += (dz / l * b.speed - b.vz) * k;
    }
    const steps = Math.max(1, Math.ceil(b.speed * dt / 0.5)), rr = 0.42 + 0.2 * b.size;
    let gone = false;
    for (let s = 0; s < steps && !gone; s++) {
      b.x += b.vx * dt / steps; b.y += b.vy * dt / steps; b.z += b.vz * dt / steps;
      if (b.life <= 0 || solidAt(b.x, b.z) || b.y < floorY(b.x, b.z) + 0.05) { burst(b.x, Math.max(0.1, b.y), b.z, 0xff4d8d, 2, 3, 0.2); gone = true; break; }
      const dx = b.x - P.x, dz = b.z - P.z;
      if (dx * dx + dz * dz < rr * rr && b.y > P.fy && b.y < P.fy + 2.1 && P.inv <= 0) { damagePlayer(b.dmg); gone = true; break; }
    }
    if (gone) { b.alive = false; b.mesh.visible = false; continue; }
    b.mesh.position.set(b.x, b.y, b.z);
  }
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
}
renderBase();
buildAttract();
requestAnimationFrame(frame);

// dev check: open the page with #smoke to run every sector (floor + each boss candidate) once and log errors to the console
if (location.hash === '#smoke') {
  window.addEventListener('error', e => console.error('SMOKE ERR', e.message, e.filename + ':' + e.lineno));
  setTimeout(() => {
    try {
      startRun();
      const tick = n => { for (let k = 0; k < n; k++) { if (state !== 'play') { show(null); state = 'play'; } P.hp = P.maxHp; P.inv = 1; update(1 / 60); } };
      fireHeld = true;
      BIOMES.forEach((b, bi) => {
        run.route = [bi]; run.stage = bi * PER + 1; startStage(); tick(120);
        const n0 = enemies.length;
        // walk the player through the level to exercise movement over ramps/decks
        for (let k = 0; k < 120; k++) { joy.y = -1; P.yaw += 0.05; tick(1); }
        joy.y = 0;
        enemies.slice().forEach(e => hurtEnemy(e, 1e6, false)); tick(30);
        console.log('SMOKE floor', b.code, 'enemies', n0, 'fy', P.fy.toFixed(2), 'raised', hgt.filter(h => h > 0).length, 'ramps', ramp.filter(r => r >= 0).length, 'haz', haz.filter(Boolean).length);
        b.bosses.forEach(kind => {
          run.stage = bi * PER + PER - 1; startStage(); boss = null;
          enemies.slice().forEach(e => { e.dead = true; removeEnemyMesh(e); }); enemies = [];
          spawnBoss(kind); tick(400);
          if (boss && boss.invuln) { enemies.filter(e => !e.boss).forEach(e => hurtEnemy(e, 1e6, false)); tick(20); }
          const had = !!boss; if (boss) hurtEnemy(boss, boss.hp + 1, false); tick(60);
          console.log('SMOKE boss', b.code, kind, had ? 'spawned' : 'MISSING', 'portals', portals.length);
        });
      });
      // suspend -> resume -> suspend -> discard
      run.route = [0]; run.stage = 2; startStage(); tick(30);
      suspendRun(); if (!save.suspend || state !== 'base') throw new Error('suspend failed');
      resumeRun(); tick(60); if (run.stage !== 2 || save.suspend) throw new Error('resume failed');
      suspendRun(); discardSuspended(); if (save.suspend || state !== 'result') throw new Error('discard failed');
      console.log('SMOKE suspend ok');
      goBase(); save.bits = 999; save.up.hp = 3; $('#btnWipe').click(); $('#btnWipeGo').click();
      if (save.bits !== 0 || save.up.hp !== 0 || !$('#dlgWipe').hidden) throw new Error('wipe failed');
      console.log('SMOKE wipe ok');
      startRun(); tick(10);
      // reachability: from the start room, can the player walk into every room (and back to the start)?
      BIOMES.forEach((b, bi) => {
        let bad = 0, back = 0;
        for (let n = 0; n < 25; n++) {
          run.route = [bi]; run.stage = bi * PER; buildLevel(b, false);
          const reach = from => { const seenT = new Uint8Array(W * H), q = [from]; seenT[from] = 1;
            while (q.length) { const c = q.pop(), ci = c % W, cj = (c / W) | 0;
              [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, bb], sd) => { const ni = ci + a, nj = cj + bb; if (isSolid(ni, nj)) return; const nn = nj * W + ni; if (!seenT[nn] && passable(c, nn, sd)) { seenT[nn] = 1; q.push(nn); } }); }
            return seenT; };
          const [sx, sz] = roomSpot(rooms[startIdx]), st = Math.floor(sz / T) * W + Math.floor(sx / T), fwdR = reach(st);
          rooms.forEach(r => { const [x, z] = roomSpot(r), k = Math.floor(z / T) * W + Math.floor(x / T); if (!fwdR[k]) bad++; else if (!reach(k)[st]) back++; });
        }
        console.log('SMOKE reach', b.code, 'unreachable rooms', bad, 'one-way rooms', back);
      });
      console.log('SMOKE DONE');
    } catch (err) { console.error('SMOKE FAIL', err && err.stack || err); }
  }, 300);
}
// dev view: #view-KWLN etc. drops straight into that sector's first floor (for screenshots)
if (location.hash.startsWith('#view-')) {
  setTimeout(() => {
    const bi = BIOMES.findIndex(b => b.code === location.hash.slice(6));
    if (bi < 0) return;
    startRun(); run.route = [bi]; run.stage = bi * PER + 1; startStage(); show(null); state = 'play';
    for (let k = 0; k < 20; k++) update(1 / 60);
  }, 300);
}
