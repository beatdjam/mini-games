'use strict';
// NOISE CORE: rotating beams, bullet rings, summons

function spawnCore() {
  const bd = bossDiff();
  const g = new THREE.Group(), geo = new THREE.TorusKnotGeometry(1.3, 0.38, 72, 8);
  const mat = new THREE.MeshLambertMaterial({ color: 0x140c20, emissive: 0xc58cff, emissiveIntensity: 0.3 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const knot = new THREE.Mesh(geo, mat);
  g.add(knot, core);
  const e = bossBase(BOSS_META.core.title, g, mat, 2400 * bd, 2.6, 2.3, updCore);
  e.x = e.cx; e.z = e.cz; g.position.set(e.x, e.y, e.z); e.knot = knot;
  e.beams = []; e.ba = 0; e.bdir = 1;
  for (let k = 0; k < 3; k++) {
    const bg = new THREE.BoxGeometry(34, 0.45, 0.45); bg.translate(17, 0, 0);
    const bm = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xff4d8d, transparent: true, opacity: 0.25, depthWrite: false }));
    bm.position.set(e.cx, 1.2, e.cz); bm.visible = false; levelGroup.add(bm); e.beams.push(bm);
  }
  toast(t('boss.coreHint'), 3800);
}
function updCore(e, dt) {
  e.t += dt; e.timer -= dt; e.pt += dt;
  const enr = e.hp < e.maxHp * 0.5;
  e.knot.rotation.x += dt * 0.8; e.knot.rotation.y += dt * (enr ? 1.6 : 1.0);
  e.mesh.position.y = e.y + Math.sin(e.t * 1.3) * 0.25;
  if (e.timer <= 0) {
    e.pat = e.patIdx++ % 3; e.pt = 0; e.shots = 0; e.acc = 0;
    e.timer = [7.5, 3.2, 2.2][e.pat];
    if (e.pat === 0) { e.bdir *= -1; e.ba = Math.atan2(-(P.z - e.cz), P.x - e.cx) + Math.PI * 0.5; sfx('beam'); }
  }
  const nb = enr ? 3 : 2;
  e.beams.forEach((b, k) => { b.visible = e.pat === 0 && k < nb; });
  if (e.pat === 0) {
    const live = e.pt > 1.2;
    const sp = (live ? (enr ? 0.85 : 0.6) : 0.15) * e.bdir;
    e.ba += sp * dt;
    const pd = Math.hypot(P.x - e.cx, P.z - e.cz), pa = Math.atan2(-(P.z - e.cz), P.x - e.cx);
    for (let k = 0; k < nb; k++) {
      const b = e.beams[k], a = e.ba + k * Math.PI * 2 / nb;
      b.rotation.y = a;
      b.material.opacity = live ? 0.95 : 0.22 + Math.sin(e.t * 30) * 0.08;
      b.scale.set(1, live ? 1 : 0.35, live ? 1 : 0.35);
      if (live) {
        const df = Math.atan2(Math.sin(pa - a), Math.cos(pa - a));
        if (Math.cos(df) > 0 && pd * Math.abs(Math.sin(df)) < 0.75) damagePlayer(e.dmg * 1.3);
      }
    }
    if (enr && live && e.pt > 2 + e.shots * 1.4) { e.shots++; fanAt(e.cx, 2.6, e.cz, 3, 0.2, 13, e.dmg, 0xc58cff); }
  } else if (e.pat === 1) {
    if (e.shots < 3 && e.pt > 0.3 + e.shots * 0.8) {
      ring(e.cx, e.cz, 1.3, 20, 7, e.shots * 0.16, e.dmg, 0xc58cff);
      if (enr) ring(e.cx, e.cz, 1.3, 14, 11, e.shots * 0.3 + 0.1, e.dmg, 0xff4d8d, 0.8);
      e.shots++;
    }
  } else if (e.pat === 2 && e.shots === 0 && e.pt > 0.3) {
    e.shots = 1;
    const minions = enemies.filter(o => !o.boss && !o.dead).length;
    const n = minions < 6 ? (enr ? 3 : 2) : 0;
    for (let k = 0; k < n; k++) { const a = rand(0, Math.PI * 2); spawnEnemy(pick(['crawler', 'crawler', 'drone']), e.cx + Math.cos(a) * 5, e.cz + Math.sin(a) * 5, -1, diffOf(run.stage)).active = true; }
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; spawnEBullet(e.cx + Math.sin(a) * 2, 2.6, e.cz + Math.cos(a) * 2, Math.sin(a) * 5, 0, Math.cos(a) * 5, e.dmg, 0xff4d8d, 1.3, 3); }
  }
}
