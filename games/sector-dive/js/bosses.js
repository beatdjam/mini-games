'use strict';
// ================= bosses =================
function bossDiff() { return (1 + run.stage * 0.08 + stageInfo(run.stage).loop * 0.5) * presMul(); }
function bossBase(name, mesh, mat, hp, y, hitR, update) {
  dynGroup.add(mesh);
  const cx = W * T / 2, cz = H * T / 2;
  const e = { boss: true, name, mesh, mat, baseEI: 0.3, x: cx, z: cz - 6, y, hp, maxHp: hp, hitR, r: 1.8, t: 0, timer: 2.2, pat: -1, patIdx: 0,
    pt: 0, shots: 0, acc: 0, dmg: 10 * (1 + run.stage * 0.045) * presMul(), cx, cz, update, flash: 0, room: -1, active: true, def: { r: 1.8 } };
  mesh.position.set(e.x, y, e.z);
  enemies.push(e); boss = e;
  $('#bossName').textContent = name; $('#bossBar').hidden = false;
  return e;
}
function spawnBoss(kind) {
  if (!save.bossSeen[kind]) { save.bossSeen[kind] = true; persist(); }
  if (kind === 'phantom') return spawnPhantom();
  if (kind === 'trinity') return spawnTrinity();
  if (kind === 'bastion') return spawnBastion();
  const bd = bossDiff();
  if (kind === 'watcher') {
    const g = new THREE.Group(), geo = new THREE.IcosahedronGeometry(2.1, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0x0f151c, emissive: 0x54e8ff, emissiveIntensity: 0.3 });
    g.add(new THREE.Mesh(geo, mat), new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x54e8ff })));
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff4d8d })); eye.position.z = 1.75; g.add(eye);
    bossBase('WATCHER — 監視体', g, mat, 1300 * bd, 3.2, 2.4, updWatcher);
    toast('弾の輪は隙間を抜けるか、ダッシュ中の無敵で抜ける', 3800);
  } else if (kind === 'crusher') {
    const g = new THREE.Group(), geo = new THREE.BoxGeometry(3.2, 3.2, 3.2);
    const mat = new THREE.MeshLambertMaterial({ color: 0x1c0f09, emissive: 0xff8a3d, emissiveIntensity: 0.3 });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 0.2), new THREE.MeshBasicMaterial({ color: 0xffc24a })); plate.position.set(0, 0.5, 1.65);
    g.add(new THREE.Mesh(geo, mat), new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xff8a3d })), plate);
    const e = bossBase('CRUSHER — 圧壊機', g, mat, 1800 * bd, 1.6, 2.4, updCrusher);
    e.st = 'idle'; e.timer = 2;
    toast('地を這う衝撃波はダッシュですり抜けられる。壁に突っ込ませると隙ができる', 4200);
  } else {
    const g = new THREE.Group(), geo = new THREE.TorusKnotGeometry(1.3, 0.38, 72, 8);
    const mat = new THREE.MeshLambertMaterial({ color: 0x140c20, emissive: 0xc58cff, emissiveIntensity: 0.3 });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const knot = new THREE.Mesh(geo, mat);
    g.add(knot, core);
    const e = bossBase('NOISE CORE — 深層核', g, mat, 2400 * bd, 2.6, 2.3, updCore);
    e.x = e.cx; e.z = e.cz; g.position.set(e.x, e.y, e.z); e.knot = knot;
    e.beams = []; e.ba = 0; e.bdir = 1;
    for (let k = 0; k < 3; k++) {
      const bg = new THREE.BoxGeometry(34, 0.45, 0.45); bg.translate(17, 0, 0);
      const bm = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xff4d8d, transparent: true, opacity: 0.25, depthWrite: false }));
      bm.position.set(e.cx, 1.2, e.cz); bm.visible = false; levelGroup.add(bm); e.beams.push(bm);
    }
    toast('回転レーザーはダッシュの無敵で飛び越える', 3800);
  }
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
      toast('スタン中 — ダメージ1.5倍', 1400);
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
function bossDown(e) {
  shake = 0.6; sfx('bigboom');
  if (e.beams) e.beams.forEach(b => { b.visible = false; });
  enemies.forEach(o => { if (!o.dead && !o.boss) { o.dead = true; burst(o.x, o.mesh.position.y, o.z, o.def.color, 10, 7, 0.6); removeEnemyMesh(o); } });
  eBullets.forEach(b => { b.alive = false; b.mesh.visible = false; });
  if (run.practice) { // practice: no rewards, no progress; just a way home
    makePortal(e.cx, e.cz - 2, 0x54e8ff, 'extract', '拠点へ');
    $('#bossBar').hidden = true; boss = null; run.cleared = true;
    toast('撃破。ゲートから拠点へ戻る', 2600);
    return;
  }
  dropBits(e.x, e.z, 45 * bossDiff());
  addPickup('chip', e.cx, e.cz + 4); addPickup('kit', e.cx + 2, e.cz + 5);
  const roll = Math.random() + run.stage * 0.03;
  addPickup('weapon', e.cx - 2, e.cz + 5, { w: rollWeapon(run.stage + 2, roll > 0.9 ? 2 : 1) });
  makePortal(e.cx + 6, e.cz - 2, 0xffc24a, 'next', '前進');
  makePortal(e.cx - 6, e.cz - 2, 0x54e8ff, 'extract', '帰還');
  $('#bossBar').hidden = true; boss = null;
  save.bossKills++;
  if (stageInfo(run.stage).tier >= 2 && !save.canReboot) { save.canReboot = true; setTimeout(() => toast('再起動が解放された。拠点で進行をリセットしてボーナスを得られる', 4200), 4400); }
  const newTier = stageInfo(run.stage).tier + 1;
  if (newTier > save.shortcut) { save.shortcut = newTier; toast(`撃破。${tierLabel(newTier)} へのショートカットが開通した。帰還か前進かを選ぶ`, 4200); }
  else toast('撃破。帰還するか、前進するかを選ぶ', 3200);
  persist();
}

// ---- shared helpers for aimed lasers ----
function makeLaser(color) {
  const lg = new THREE.BufferGeometry().setFromPoints([new V3(), new V3()]);
  const l = new THREE.Line(lg, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 }));
  l.visible = false; l.frustumCulled = false; dynGroup.add(l); return l;
}
function setLaser(l, a, b, op) {
  const p = l.geometry.attributes.position;
  p.setXYZ(0, a[0], a[1], a[2]); p.setXYZ(1, b[0], b[1], b[2]); p.needsUpdate = true;
  l.material.opacity = op; l.visible = true;
}

// ---- PHANTOM: warps between spots near the pillars, aims a laser, fires one heavy round ----
const PHANTOM_SPOTS = [[5, 5], [14, 5], [5, 10], [14, 10], [10, 5], [5, 14], [14, 14]];
function spawnPhantom() {
  const bd = bossDiff(), g = new THREE.Group(), geo = new THREE.OctahedronGeometry(1.2, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0x0c1418, emissive: 0x9fe7ff, emissiveIntensity: 0.3 });
  const body = new THREE.Mesh(geo, mat); body.scale.set(0.8, 1.7, 0.8);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x9fe7ff })); edge.scale.copy(body.scale);
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff4d8d })); lens.position.set(0, 0.5, 0.75);
  g.add(body, edge, lens);
  const e = bossBase('PHANTOM — 狙撃体', g, mat, 1100 * bossDiff(), 2.2, 1.6, updPhantom);
  e.st = 'idle'; e.timer = 1.6; e.laser = makeLaser(0xff4d8d); e.cycle = 0;
  phantomWarp(e, true);
  toast('予告レーザーが点滅したら撃ってくる。柱の陰に隠れるか、ダッシュでかわす', 4200);
}
function phantomWarp(e, first) {
  const spots = PHANTOM_SPOTS.map(([i, j]) => [(i + 0.5) * T, (j + 0.5) * T])
    .sort((a, b) => Math.hypot(b[0] - P.x, b[1] - P.z) - Math.hypot(a[0] - P.x, a[1] - P.z));
  const [x, z] = first ? spots[0] : pick(spots.slice(0, 3));
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
      phantomWarp(e); e.st = 'idle'; e.timer = enr ? 1.0 : 1.5; e.cycle++;
      if (e.cycle % 2 === 0 && enemies.filter(o => !o.boss && !o.dead).length < 4)
        for (let k = 0; k < 2; k++) { const [x, z] = randomTileIn(rooms[0]); spawnEnemy('drone', x, z, -1, diffOf(run.stage)).active = true; }
    }
  }
  e.mesh.scale.setScalar(sc);
  e.mesh.position.set(e.x, e.y + Math.sin(e.t * 2) * 0.2, e.z);
}

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
  const e = bossBase('TRINITY — 三連体', g, mat, 1700 * bossDiff(), 2.2, 1.4, updTrinity);
  e.x = e.cx; e.z = e.cz; e.bodies = bodies; e.extra = bodies; e.parts = bodies.map(b => ({ p: b.position, r: 1.4 }));
  e.fireK = 0; e.fireT = 1.2; e.ringT = 5; e.ramT = 4; e.ram = null;
  updTrinity(e, 0);
  toast('3体で体力を共有している。どれを撃っても削れる', 3800);
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
  const e = bossBase('BASTION — 要塞核', g, mat, 1500 * bossDiff(), 2.4, 2.0, updBastion);
  e.x = e.cx; e.z = e.cz; e.core = core; e.shield = shieldM; e.invuln = true; e.turrets = []; e.openT = 0; e.ringT = 2.5;
  bastionTurrets(e, 4);
  toast('シールド中は本体にダメージが通らない。周りの砲台を全部壊すと、しばらく無防備になる', 4600);
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
  if (e.invuln && !e.turrets.length) { e.invuln = false; e.openT = 9; toast('シールド解除 — 今のうちに本体を撃つ', 2200); sfx('chip'); }
  if (!e.invuln) {
    e.openT -= dt;
    if (e.openT <= 0) { e.invuln = true; e.hinted = true; bastionTurrets(e, enr ? 4 : 3); toast('シールド再展開。砲台が再建された', 2200); }
  }
  e.ringT -= dt;
  if (e.ringT <= 0) {
    ring(e.cx, e.cz, 1.3, e.invuln ? 16 : 24, e.invuln ? 7 : 9, e.t, e.dmg, 0xffb347);
    if (enr) for (let k = 0; k < 3; k++) { const a = rand(0, Math.PI * 2); spawnEBullet(e.cx + Math.sin(a) * 2.5, 2.6, e.cz + Math.cos(a) * 2.5, Math.sin(a) * 5, 1, Math.cos(a) * 5, e.dmg, 0xff4d8d, 1.3, 3); }
    e.ringT = e.invuln ? 3 : 2;
  }
  e.mesh.position.set(e.cx, e.y, e.cz);
}
