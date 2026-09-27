'use strict';
// CRUSHER: charges (stuns itself on walls), jump-slam shockwaves, homing volleys

function spawnCrusher() {
  const bd = bossDiff();
  const g = new THREE.Group(), geo = new THREE.BoxGeometry(3.2, 3.2, 3.2);
  const mat = new THREE.MeshLambertMaterial({ color: 0x1c0f09, emissive: 0xff8a3d, emissiveIntensity: 0.3 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 0.2), new THREE.MeshBasicMaterial({ color: 0xffc24a })); plate.position.set(0, 0.5, 1.65);
  g.add(new THREE.Mesh(geo, mat), new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xff8a3d })), plate);
  const e = bossBase(BOSS_META.crusher.title, g, mat, 1800 * bd, 1.6, 2.4, updCrusher);
  e.st = 'idle'; e.timer = 2;
  toast(t('boss.crusherHint'), 4200);
}
function updCrusher(e, dt) {
  e.t += dt; e.timer -= dt;
  const enr = e.hp < e.maxHp * 0.5, dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz) || 1;
  let y = 1.6;
  if (e.st === 'idle') {
    moveCircle(e, dx / d * 3.2 * dt, dz / d * 3.2 * dt, 1.8);
    e.mesh.rotation.y = Math.atan2(dx, dz);
    if (e.timer <= 0) {
      const r = Math.random();
      if (r < 0.5) { e.st = 'tele'; e.timer = enr ? 0.5 : 0.8; }
      else if (r < 0.8) { e.st = 'slam'; e.timer = 1.0; }
      else { e.st = 'volley'; e.timer = 0.4; }
    }
  } else if (e.st === 'tele') {
    e.mesh.rotation.y = Math.atan2(dx, dz); e.cdx = dx / d; e.cdz = dz / d;
    e.flash = Math.sin(e.t * 40) > 0 ? 0.03 : 0;
    y += Math.sin(e.t * 50) * 0.05;
    if (e.timer <= 0) { e.st = 'charge'; e.timer = 3; e.hitP = false; }
  } else if (e.st === 'charge') {
    const hit = moveCircle(e, e.cdx * 24 * dt, e.cdz * 24 * dt, 1.8);
    burst(e.x - e.cdx * 1.6, 0.3, e.z - e.cdz * 1.6, 0xff8a3d, 1, 3, 0.3);
    if (!e.hitP && d < 2.5) { e.hitP = true; damagePlayer(e.dmg * 2.2); moveCircle(P, e.cdx * 3, e.cdz * 3, P.r); }
    if (hit || e.timer <= 0) {
      e.st = 'stun'; e.timer = 1.6; e.stunMul = 1.5; shake = Math.max(shake, 0.35); sfx('boom');
      spawnWave(e.x, e.z, 11, 18, e.dmg * 1.4, 0xff8a3d);
      toast(t('boss.crusherStun'), 1400);
    }
  } else if (e.st === 'stun') {
    y += Math.sin(e.t * 30) * 0.08;
    if (e.timer <= 0) { e.stunMul = 0; e.st = enr && Math.random() < 0.5 ? 'slam' : 'idle'; e.timer = 1.0; }
  } else if (e.st === 'slam') {
    const jt = 1 - e.timer;
    y += Math.sin(Math.PI * clamp(jt, 0, 1)) * 5;
    moveCircle(e, dx / d * 7 * dt, dz / d * 7 * dt, 1.8);
    if (e.timer <= 0) {
      shake = Math.max(shake, 0.4); sfx('boom');
      spawnWave(e.x, e.z, 12, 24, e.dmg * 1.5, 0xffc24a);
      if (enr) e.second = 0.45;
      e.st = 'idle'; e.timer = 1.3;
    }
  } else if (e.st === 'volley') {
    if (e.timer <= 0) {
      const n = enr ? 9 : 6;
      for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; spawnEBullet(e.x + Math.sin(a) * 2, 3.4, e.z + Math.cos(a) * 2, Math.sin(a) * 6, 2, Math.cos(a) * 6, e.dmg, 0xff6a3d, 1.3, 2.6); }
      sfx('eshot'); e.st = 'idle'; e.timer = 1.4;
    }
  }
  if (e.second > 0) { e.second -= dt; if (e.second <= 0) spawnWave(e.x, e.z, 9, 24, e.dmg * 1.5, 0xffc24a); }
  e.mesh.position.set(e.x, y, e.z);
}
