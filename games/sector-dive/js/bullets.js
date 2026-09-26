'use strict';
// ================= bullets (per frame) =================

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
        if (e.def.shield && e.shieldHp > 0 && !b.rail) {
          const fx = Math.sin(e.mesh.rotation.y), fz = Math.cos(e.mesh.rotation.y), ox = b.x - e.x, oz = b.z - e.z, ol = Math.hypot(ox, oz) || 1;
          if ((ox * fx + oz * fz) / ol > 0.3) {
            e.shieldHp -= b.dmg; burst(b.x, b.y, b.z, 0x8cc8ff, 4, 5, 0.25); hitMark(false);
            if (e.shieldHp <= 0) { // shield breaks: drop the plate and stagger
              e.shieldParts.forEach(o => e.mesh.remove(o)); e.stun = 1.0; e.flash = 0.25;
              burst(b.x, b.y, b.z, 0x8cc8ff, 22, 8, 0.6); sfx('boom', 60);
            } else {
              sfx('empty', 60);
              if (e.shieldHp < e.def.shieldHp * 0.5) e.shieldParts[0].material = basicMat(0x5b3a3a); // cracked
            }
            dead = true; break;
          }
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
