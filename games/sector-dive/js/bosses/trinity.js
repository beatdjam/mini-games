'use strict';
// TRINITY: three bodies orbiting the centre on one shared health pool

// ---- TRINITY: three bodies orbiting the centre on one shared health pool ----
function spawnTrinity() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x160a12, emissive: 0xff4d8d, emissiveIntensity: 0.3 });
  const geo = new THREE.OctahedronGeometry(1.2, 0), cols = [0xff4d8d, 0xffc24a, 0x54e8ff];
  const bodies = cols.map(c => {
    const b = new THREE.Group();
    b.add(new THREE.Mesh(geo, mat), new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: c })));
    dynGroup.add(b); return b;
  });
  const e = bossBase('trinity', g, mat, updTrinity);
  e.x = e.cx; e.z = e.cz; e.bodies = bodies; e.extra = bodies; e.parts = bodies.map(b => ({ p: b.position, r: 1.4 }));
  e.fireK = 0; e.fireT = 1.2; e.ringT = 5; e.ramT = 4; e.ram = null;
  updTrinity(e, 0);
  toast(t('boss.trinityHint'), 3800);
}
function updTrinity(e, dt) {
  e.t += dt;
  const enr = e.hp < e.maxHp * 0.5, R = enr ? 5.5 : 7.5, a0 = e.t * (enr ? 0.8 : 0.55), cols = [0xff4d8d, 0xffc24a, 0x54e8ff];
  e.bodies.forEach((b, k) => {
    let x = e.cx + Math.cos(a0 + k * Math.PI * 2 / 3) * R, z = e.cz + Math.sin(a0 + k * Math.PI * 2 / 3) * R, y = 2.2 + Math.sin(e.t * 2 + k) * 0.4;
    if (e.ram && e.ram.k === k) { // enraged: one body lunges at where you stood, then returns
      const r = e.ram, u = r.t / r.dur, f = u < 0.5 ? u * 2 : 2 - u * 2;
      x += (r.tx - x) * f; z += (r.tz - z) * f; y += (1.2 - y) * f;
      if (!r.hit && Math.hypot(P.x - x, P.z - z) < 1.8) { r.hit = true; damagePlayer(e.dmg * 2); }
    }
    b.position.set(x, y, z); b.rotation.y += dt * (1.5 + k);
  });
  e.fireT -= dt;
  if (e.fireT <= 0) {
    const k = e.fireK++ % 3, b = e.bodies[k].position;
    fanAt(b.x, b.y, b.z, 3, 0.16, 14, e.dmg, cols[k]); e.fireT = enr ? 0.45 : 0.65;
  }
  e.ringT -= dt;
  if (e.ringT <= 0) { e.bodies.forEach((b, k) => ring(b.position.x, b.position.z, 1.3, 8, 7.5, k * 0.3 + e.t, e.dmg, 0xc58cff)); e.ringT = enr ? 4 : 5.5; }
  if (enr) {
    if (e.ram) { e.ram.t += dt; if (e.ram.t >= e.ram.dur) e.ram = null; }
    else if ((e.ramT -= dt) <= 0) { e.ram = { k: randi(0, 2), t: 0, dur: 1.4, tx: P.x, tz: P.z, hit: false }; e.ramT = 3.2; sfx('dash'); }
  }
  e.mesh.position.set(e.cx, 2.2, e.cz);
}
