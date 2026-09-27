'use strict';
// BASTION: shielded core; destroy every turret to open it for a few seconds

// ---- BASTION: shielded core; destroy every turret to open it for a few seconds ----
function spawnBastion() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x1b1408, emissive: 0xffb347, emissiveIntensity: 0.3 });
  const baseGeo = new THREE.CylinderGeometry(2.4, 3, 1.6, 8), coreGeo = new THREE.IcosahedronGeometry(1.3, 1);
  const base = new THREE.Mesh(baseGeo, mat); base.position.y = -1.6;
  const baseEdge = new THREE.LineSegments(new THREE.EdgesGeometry(baseGeo), new THREE.LineBasicMaterial({ color: 0xffb347 })); baseEdge.position.y = -1.6;
  const core = new THREE.Mesh(coreGeo, mat);
  const shieldM = new THREE.Mesh(new THREE.SphereGeometry(2.6, 20, 14), new THREE.MeshBasicMaterial({ color: 0x8cc8ff, transparent: true, opacity: 0.25, depthWrite: false }));
  g.add(base, baseEdge, core, shieldM);
  const e = bossBase('bastion', g, mat, updBastion);
  e.x = e.cx; e.z = e.cz; e.core = core; e.shield = shieldM; e.invuln = true; e.turrets = []; e.openT = 0; e.ringT = 2.5;
  bastionTurrets(e, 4);
  toast(t('boss.bastionHint'), 4600);
}
function bastionTurrets(e, n) {
  const off = rand(0, Math.PI);
  for (let k = 0; k < n; k++) {
    const a = off + k * Math.PI * 2 / n, t = spawnEnemy('bturret', e.cx + Math.cos(a) * 8, e.cz + Math.sin(a) * 8, -1, diffOf(run.stage));
    t.active = true; e.turrets.push(t);
  }
}
function updBastion(e, dt) {
  e.t += dt;
  const enr = e.hp < e.maxHp * 0.5;
  e.core.rotation.y += dt * (e.invuln ? 0.6 : 2.5); e.core.rotation.x += dt * 0.4;
  e.shield.visible = e.invuln; e.shield.material.opacity = 0.2 + Math.sin(e.t * 4) * 0.06;
  e.turrets = e.turrets.filter(t => !t.dead);
  if (e.invuln && !e.turrets.length) { e.invuln = false; e.openT = 12; e.stunMul = 1.5; toast(t('boss.bastionOpen'), 2400); sfx('chip'); }
  if (!e.invuln) {
    e.openT -= dt;
    if (e.openT <= 0) { e.invuln = true; e.stunMul = 0; e.hinted = true; bastionTurrets(e, enr ? 3 : 2); toast(t('boss.bastionClose'), 2200); }
  }
  e.ringT -= dt;
  if (e.ringT <= 0) {
    ring(e.cx, e.cz, 1.3, e.invuln ? 16 : 24, e.invuln ? 7 : 9, e.t, e.dmg, 0xffb347);
    if (enr) for (let k = 0; k < 3; k++) { const a = rand(0, Math.PI * 2); spawnEBullet(e.cx + Math.sin(a) * 2.5, 2.6, e.cz + Math.cos(a) * 2.5, Math.sin(a) * 5, 1, Math.cos(a) * 5, e.dmg, 0xff4d8d, 1.3, 3); }
    e.ringT = e.invuln ? 3 : 2;
  }
  e.mesh.position.set(e.cx, e.y, e.cz);
}
