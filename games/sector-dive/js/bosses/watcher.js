'use strict';
// WATCHER 監視体: rings, aimed fans and a spiral; summons drones at half health

function spawnWatcher() {
  const bd = bossDiff();
  const g = new THREE.Group(), geo = new THREE.IcosahedronGeometry(2.1, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0x0f151c, emissive: 0x54e8ff, emissiveIntensity: 0.3 });
  g.add(new THREE.Mesh(geo, mat), new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x54e8ff })));
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff4d8d })); eye.position.z = 1.75; g.add(eye);
  bossBase('WATCHER — 監視体', g, mat, 1300 * bd, 3.2, 2.4, updWatcher);
  toast('弾の輪は隙間を抜けるか、ダッシュ中の無敵で抜ける', 3800);
}
function updWatcher(e, dt) {
  e.t += dt; e.timer -= dt; e.pt += dt;
  const enr = e.hp < e.maxHp * 0.5;
  e.x = e.cx + Math.sin(e.t * 0.35) * 7; e.z = e.cz + Math.sin(e.t * 0.22) * 5 - 3;
  e.mesh.position.set(e.x, e.y + Math.sin(e.t * 1.6) * 0.4, e.z);
  e.mesh.lookAt(P.x, 1.6, P.z);
  if (enr && !e.summoned) {
    e.summoned = true;
    for (let k = 0; k < 3; k++) spawnEnemy('drone', e.x + Math.cos(k * 2.1) * 4, e.z + Math.sin(k * 2.1) * 4, -1, diffOf(run.stage)).active = true;
    toast('監視体が子機を展開した');
  }
  if (e.timer <= 0) { e.pat = e.patIdx++ % 3; e.pt = 0; e.shots = 0; e.acc = 0; e.timer = [3.4, 2.8, 3.4][e.pat] * (enr ? 0.85 : 1); }
  const y = 1.3;
  if (e.pat === 0) {
    if (e.shots < 3 && e.pt > 0.3 + e.shots * 0.75) { ring(e.x, e.z, y, enr ? 22 : 18, 8.5, e.shots * 0.15 + e.t, e.dmg, 0xff4d8d); e.shots++; }
  } else if (e.pat === 1) {
    if (e.shots < (enr ? 4 : 3) && e.pt > 0.3 + e.shots * 0.55) { fanAt(e.x, e.mesh.position.y, e.z, 5, 0.14, 16, e.dmg, 0xffc24a); e.shots++; }
  } else if (e.pat === 2 && e.pt < 2.6) {
    e.acc += dt;
    const arms = enr ? 3 : 2;
    while (e.acc > 0.08) {
      e.acc -= 0.08;
      for (let k = 0; k < arms; k++) shootAngle(e.x, y, e.z, e.t * 2.2 + k * Math.PI * 2 / arms, 9, e.dmg, 0x54e8ff);
      sfx('eshot', 90);
    }
  }
}
