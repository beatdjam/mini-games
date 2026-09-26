'use strict';
// ================= enemy behaviour (per frame) =================
// Fields on an enemy object are listed in spawnEnemy (js/entities.js).

function updateEnemies(dt) {
  const py = P.fy + 1.3; // player chest height, used for line of sight
  for (const e of enemies) {
    if (e.dead) continue;
    if (e.flash > 0) e.flash -= dt;
    e.mat.emissiveIntensity = e.flash > 0 ? 1.8 : e.baseEI;
    if (e.boss) { if (e.spawnT > 0) bossPauseTick(e, dt); else e.update(e, dt); continue; }

    const def = e.def;
    const dx = P.x - e.x, dz = P.z - e.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const eyeY = e.fy + def.y;
    e.t += dt;

    if (!e.active && !wakeCheck(e, eyeY, py, dt)) continue;
    e.cd -= dt;
    e.mcd -= dt;
    const los = dist < 40 && hasLOS(e.x, e.z, P.x, P.z, eyeY, py);

    let still = false; // true = this enemy doesn't walk this frame
    if (e.stun > 0) { e.stun -= dt; still = true; e.mcd = Math.max(e.mcd, 0.2); }
    if (def.bomber) {
      const r = updateBomber(e, dt, dist);
      if (r === 'gone') continue;
      if (r) still = true;
    }
    if (def.sniper && updateSniper(e, dt, los, py)) still = true;
    if (def.speed > 0 && !still) steerEnemy(e, dt, dx, dz, dist, los);

    if (def.melee && dist < e.r + P.r + 0.4 && Math.abs(P.fy - e.fy) < 1.2 && e.mcd <= 0) {
      e.mcd = 0.9;
      damagePlayer(e.dmg);
    }
    if (def.ranged && los && dist < 26 && e.cd <= 0) {
      const r = def.ranged;
      e.cd = r.rate * ENEMY_TUNE.fireInterval * rand(0.8, 1.25);
      const muzzleY = e.mesh.position.y + (def.geo === 'cyl' ? 1.1 : 0);
      const color = def.color === 0xffe14a ? 0xffe14a : 0xff4d8d;
      fanAt(e.x, muzzleY, e.z, r.count, r.spread, r.speed, e.dmg, color);
    }
    poseEnemy(e, dt, dx, dz);
  }
}

// Idle until the player is within ENEMY_TUNE.wakeTiles of walking distance and in sight. Returns true once awake.
function wakeCheck(e, eyeY, py, dt) {
  const fd = flowAt(e.x, e.z);
  if (fd >= 0 && fd <= ENEMY_TUNE.wakeTiles && hasLOS(e.x, e.z, P.x, P.z, eyeY, py)) {
    e.active = true;
    return true;
  }
  e.mesh.position.y = eyeY + Math.sin(e.t * 2) * 0.12;
  e.body.rotation.y += dt * 0.5;
  return false;
}

// Bomber: light the fuse when close, blow up when it runs out.
// Returns 'gone' if it exploded, true if it should stand still, false otherwise.
function updateBomber(e, dt, dist) {
  if (e.fuse !== undefined) {
    e.fuse -= dt;
    e.flash = Math.sin(e.t * 50) > 0 ? 0.05 : 0;
    if (e.fuse <= 0) { detonate(e); return 'gone'; }
    return true;
  }
  if (dist < 2.2 && Math.abs(P.fy - e.fy) < 1.5) {
    e.fuse = 0.45;
    sfx('empty');
    return true;
  }
  return false;
}

// Sniper: 1.1s visible laser (tracks, then locks for the last 0.25s), then one fast round.
// Returns true while aiming (it stands still).
function updateSniper(e, dt, los, py) {
  if (e.aim > 0) {
    e.aim -= dt;
    const sy = e.mesh.position.y + 0.7;
    if (e.aim > 0.25) e.lock = [P.x, py - 0.1, P.z];
    const opacity = e.aim > 0.25 ? 0.45 : (Math.sin(e.t * 60) > 0 ? 1 : 0.3);
    setLaser(e.laser, [e.x, sy, e.z], e.lock, opacity);
    if (e.aim <= 0) {
      e.laser.visible = false;
      e.cd = rand(2.6, 3.4) * ENEMY_TUNE.fireInterval;
      const vx = e.lock[0] - e.x, vy = e.lock[1] - sy, vz = e.lock[2] - e.z;
      const l = Math.hypot(vx, vy, vz) || 1, speed = 60;
      spawnEBullet(e.x, sy, e.z, vx / l * speed, vy / l * speed, vz / l * speed, e.dmg, 0xff4d8d, 0.7);
      sfx('rail', 80);
    }
    return true;
  }
  if (los && e.cd <= 0) {
    e.aim = 1.1;
    e.lock = [P.x, py, P.z];
    return true;
  }
  e.laser.visible = false;
  return false;
}

// Walk toward the player (straight when in sight, along the flow field otherwise),
// circle-strafe when a `keep` distance is set, and push away from nearby enemies.
function steerEnemy(e, dt, dx, dz, dist, los) {
  const def = e.def;
  let tx = 0, tz = 0, speed = def.speed;
  if (los) {
    if (def.keep && dist < def.keep) {
      tx = -dz / dist * e.side;
      tz = dx / dist * e.side;
      speed *= 0.6;
      if (Math.random() < dt * 0.4) e.side *= -1;
    } else {
      tx = dx / dist;
      tz = dz / dist;
    }
  } else {
    const f = flowDir(e.x, e.z);
    if (f) { tx = f[0]; tz = f[1]; } else { tx = dx / dist; tz = dz / dist; }
  }
  for (const o of enemies) {
    if (o === e || o.dead || o.boss) continue;
    const ox = e.x - o.x, oz = e.z - o.z, d2 = ox * ox + oz * oz, rr = e.r + o.r + 0.3;
    if (d2 < rr * rr && d2 > 1e-4) {
      const d = Math.sqrt(d2);
      tx += ox / d * 0.9;
      tz += oz / d * 0.9;
    }
  }
  const tl = Math.hypot(tx, tz);
  if (tl > 0.01) {
    moveCircle(e, tx / tl * speed * dt, tz / tl * speed * dt, e.r);
    e.fy = floorY(e.x, e.z);
  }
}

// Place the mesh, face the player (limited by def.turn rad/s if set), spin decorative bodies.
function poseEnemy(e, dt, dx, dz) {
  const def = e.def;
  const bob = def.fly ? Math.sin(e.t * 3) * 0.3 : 0;
  e.mesh.position.set(e.x, e.fy + def.y + bob, e.z);
  const want = Math.atan2(dx, dz);
  if (def.turn) {
    const diff = Math.atan2(Math.sin(want - e.face), Math.cos(want - e.face));
    e.face += clamp(diff, -def.turn * dt, def.turn * dt);
  } else {
    e.face = want;
  }
  e.mesh.rotation.y = e.face;
  if (def.geo === 'tetra' || def.geo === 'tetraS') e.body.rotation.x += dt * 8;
  if (def.geo === 'octa' || def.geo === 'ico') e.body.rotation.y += dt * 3;
}
