'use strict';
// PHANTOM: warps between spots near the pillars, aims a laser, fires one heavy round

const PHANTOM_SPOTS = [[5, 5], [14, 5], [5, 10], [14, 10], [10, 5], [5, 14], [14, 14]];
function spawnPhantom() {
  const bd = bossDiff(), g = new THREE.Group(), geo = new THREE.OctahedronGeometry(1.2, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0x0c1418, emissive: 0x9fe7ff, emissiveIntensity: 0.3 });
  const body = new THREE.Mesh(geo, mat); body.scale.set(0.8, 1.7, 0.8);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x9fe7ff })); edge.scale.copy(body.scale);
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff4d8d })); lens.position.set(0, 0.5, 0.75);
  g.add(body, edge, lens);
  const e = bossBase(BOSS_META.phantom.title, g, mat, 1100 * bossDiff(), 2.2, 1.6, updPhantom);
  e.st = 'idle'; e.timer = 1.6; e.laser = makeLaser(0xff4d8d); e.cycle = 0;
  phantomWarp(e, true);
  toast(t('boss.phantomHint'), 4200);
}
function phantomWarp(e, first) {
  const spots = PHANTOM_SPOTS.map(([i, j]) => [(i + 0.5) * T, (j + 0.5) * T])
    .sort((a, b) => Math.hypot(b[0] - P.x, b[1] - P.z) - Math.hypot(a[0] - P.x, a[1] - P.z));
  // warp anywhere except the two spots nearest the player (first appearance: the farthest spot)
  const [x, z] = first ? spots[0] : pick(spots.slice(0, spots.length - 2));
  e.x = x; e.z = z;
  if (!first) { burst(x, 2, z, 0x9fe7ff, 16, 6, 0.5); ring(x, z, 1.3, 10, 8, rand(0, 1), e.dmg, 0x9fe7ff); }
}
function updPhantom(e, dt) {
  e.t += dt; e.timer -= dt;
  const enr = e.hp < e.maxHp * 0.5, eye = [e.x, e.y + 0.5, e.z];
  let sc = 1;
  e.mesh.lookAt(P.x, e.y, P.z);
  if (e.st === 'idle') {
    if (e.timer <= 0) { e.st = 'aim'; e.timer = enr ? 1.0 : 1.3; e.shots = 0; sfx('beam'); }
  } else if (e.st === 'aim') {
    if (e.timer > 0.3) e.lock = [P.x, P.fy + 1.3, P.z];
    setLaser(e.laser, eye, e.lock, e.timer > 0.3 ? 0.45 : (Math.sin(e.t * 60) > 0 ? 1 : 0.25));
    if (e.timer <= 0) {
      const v = [e.lock[0] - eye[0], e.lock[1] - eye[1], e.lock[2] - eye[2]], l = Math.hypot(v[0], v[1], v[2]) || 1;
      spawnEBullet(eye[0], eye[1], eye[2], v[0] / l * 62, v[1] / l * 62, v[2] / l * 62, e.dmg * 2.4, 0xff4d8d, 0.9);
      sfx('rail'); e.laser.visible = false; e.shots++;
      if (enr && e.shots < 2) e.timer = 0.55; // enraged: a quick second shot
      else { e.st = 'vanish'; e.timer = 0.45; }
    }
  } else if (e.st === 'vanish') {
    sc = Math.max(0.05, e.timer / 0.45);
    if (e.timer <= 0) {
      phantomWarp(e); e.st = 'idle'; e.timer = enr ? 1.6 : 2.2; e.cycle++;
      if (e.cycle % 3 === 0 && enemies.filter(o => !o.boss && !o.dead).length < 2)
        for (let k = 0; k < 2; k++) { const [x, z] = randomTileIn(rooms[0]); spawnEnemy('drone', x, z, -1, diffOf(run.stage)).active = true; }
    }
  }
  e.mesh.scale.setScalar(sc);
  e.mesh.position.set(e.x, e.y + Math.sin(e.t * 2) * 0.2, e.z);
}
