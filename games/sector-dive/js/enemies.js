'use strict';
// ================= enemy behaviour (per frame) =================

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
    if (e.stun > 0) { e.stun -= dt; still = true; e.mcd = Math.max(e.mcd, 0.2); }
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
    const want = Math.atan2(dx, dz);
    if (def.turn) { const df = Math.atan2(Math.sin(want - e.face), Math.cos(want - e.face)); e.face += clamp(df, -def.turn * dt, def.turn * dt); }
    else e.face = want;
    e.mesh.rotation.y = e.face;
    if (def.geo === 'tetra' || def.geo === 'tetraS') e.body.rotation.x += dt * 8;
    if (def.geo === 'octa' || def.geo === 'ico') e.body.rotation.y += dt * 3;
  }
}
