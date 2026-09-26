'use strict';
// ================= entities =================
let enemies = [], pickups = [], waves = [], balls = [], boss = null, nearW = null, target = null;
const pBullets = [], eBullets = [], parts = [];
for (let i = 0; i < 300; i++) {
  const m = new THREE.Mesh(geoCache.part, basicMat(0xffffff)); m.visible = false; dynGroup.add(m);
  parts.push({ mesh: m, life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 14 });
}
let partIdx = 0;
function burst(x, y, z, color, n, spd, life, grav) {
  for (let k = 0; k < n; k++) {
    const p = parts[partIdx = (partIdx + 1) % parts.length];
    p.mesh.material = basicMat(color); p.mesh.visible = true; p.mesh.position.set(x, y, z);
    const a = Math.random() * Math.PI * 2, u = rand(-1, 1), s = spd * rand(0.3, 1), q = Math.sqrt(1 - u * u);
    p.vx = Math.cos(a) * q * s; p.vy = u * s + spd * 0.35; p.vz = Math.sin(a) * q * s;
    p.life = p.max = (life || 0.6) * rand(0.6, 1.2); p.g = grav === undefined ? 14 : grav;
  }
}
function updateParts(dt) {
  for (const p of parts) {
    if (p.life <= 0) continue;
    p.life -= dt; if (p.life <= 0) { p.mesh.visible = false; continue; }
    p.vy -= p.g * dt;
    const pos = p.mesh.position; pos.x += p.vx * dt; pos.y += p.vy * dt; pos.z += p.vz * dt;
    if (pos.y < 0.07) { pos.y = 0.07; p.vy *= -0.35; p.vx *= 0.6; p.vz *= 0.6; }
    const s = p.life / p.max; p.mesh.scale.setScalar(p.g < 0 ? 1.8 - s : 0.3 + s);
  }
}
function fireball(x, y, z, radius, color) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
  const m = new THREE.Mesh(geoCache.ball, mat); m.position.set(x, y, z); m.scale.setScalar(0.3); dynGroup.add(m);
  balls.push({ m, t: 0, radius, dead: false });
}
function updateBalls(dt) {
  for (const b of balls) {
    b.t += dt;
    const k = Math.min(1, b.t / 0.16);
    b.m.scale.setScalar(0.3 + (b.radius - 0.3) * (1 - Math.pow(1 - k, 3)));
    b.m.material.opacity = 0.85 * Math.max(0, 1 - b.t / 0.5);
    if (b.t > 0.5) { b.dead = true; disposeTree(b.m); dynGroup.remove(b.m); }
  }
  balls = balls.filter(b => !b.dead);
}
function getBullet(pool, geo, max) {
  for (const b of pool) if (!b.alive) return b;
  if (pool.length >= max) return null;
  const b = { mesh: new THREE.Mesh(geo, basicMat(0xffffff)), alive: false, hit: new Set() };
  dynGroup.add(b.mesh); pool.push(b); return b;
}
function spawnPBullet(pos, dir, speed, dmg, pierce, blast, color, grav, opt) {
  const b = getBullet(pBullets, geoCache.pbullet, 220); if (!b) return;
  b.alive = true; b.x = pos.x; b.y = pos.y; b.z = pos.z;
  b.vx = dir.x * speed; b.vy = dir.y * speed; b.vz = dir.z * speed;
  b.dmg = dmg; b.pierce = pierce; b.blast = blast || 0; b.grav = grav || 0; b.life = blast ? 4 : 1.6; b.color = color; b.hit.clear();
  b.ox = pos.x; b.oz = pos.z; const o = opt || {};
  b.close = o.close || 0; b.closeMul = o.closeMul || 1; b.full = o.full || 0; b.far = o.far || 0; b.farMul = o.farMul || 1;
  b.kb = o.kb || 0; b.rail = !!o.rail; b.shot = o.shot || 0;
  b.mesh.geometry = blast ? geoCache.rocket : geoCache.pbullet;
  b.mesh.material = basicMat(blast ? 0xd8dde3 : color); b.mesh.visible = true; b.mesh.position.set(b.x, b.y, b.z);
  b.mesh.lookAt(b.x + dir.x, b.y + dir.y, b.z + dir.z);
}
function spawnEBullet(x, y, z, vx, vy, vz, dmg, color, size, homing) {
  const b = getBullet(eBullets, geoCache.ebullet, 360); if (!b) return;
  b.alive = true; b.x = x; b.y = y; b.z = z; b.vx = vx; b.vy = vy; b.vz = vz; b.dmg = dmg; b.life = 6;
  b.size = size || 1; b.homing = homing || 0; b.speed = Math.hypot(vx, vy, vz);
  b.mesh.material = basicMat(color || 0xff4d8d); b.mesh.scale.setScalar(b.size); b.mesh.visible = true; b.mesh.position.set(x, y, z);
}
function shootAngle(x, y, z, ang, speed, dmg, color, size) {
  const s = Math.sin(ang), c = Math.cos(ang);
  spawnEBullet(x + s * 1.8, y, z + c * 1.8, s * speed, 0, c * speed, dmg, color, size);
}
function ring(x, z, y, n, speed, off, dmg, color, size) { for (let k = 0; k < n; k++) shootAngle(x, y, z, off + k * Math.PI * 2 / n, speed, dmg, color, size); sfx('eshot', 60); }
function fanAt(x, y, z, n, spread, speed, dmg, color) {
  const base = Math.atan2(P.x - x, P.z - z), hd = Math.hypot(P.x - x, P.z - z) || 1, vyr = (P.fy + 1.2 - y) / hd;
  for (let k = 0; k < n; k++) {
    const a = base + (n > 1 ? (k - (n - 1) / 2) * spread : 0) + rand(-0.03, 0.03);
    const dx = Math.sin(a), dz = Math.cos(a), l = Math.hypot(1, vyr);
    spawnEBullet(x, y, z, dx / l * speed, vyr / l * speed, dz / l * speed, dmg, color);
  }
  sfx('eshot', 60);
}

function buildEnemyMesh(def) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x10161d, emissive: def.color, emissiveIntensity: 0.4 });
  const body = new THREE.Mesh(geoCache[def.geo], mat);
  g.add(body, new THREE.LineSegments(edges(def.geo), lineMat(def.color)));
  if (def.geo === 'cyl') { const head = new THREE.Mesh(geoCache.chip, basicMat(def.color)); head.position.y = 1.1; g.add(head); }
  if (def.shield) {
    const plate = new THREE.Mesh(geoCache.shieldPlate, basicMat(0x2b5f8f)), edge = new THREE.LineSegments(edges('shieldPlate'), lineMat(0x8cc8ff));
    plate.position.set(0, 0.1, 0.75); edge.position.copy(plate.position);
    g.add(plate, edge); g.userData.shield = [plate, edge];
  }
  if (def.sniper) { const eye = new THREE.Mesh(geoCache.chip, basicMat(0xff4d8d)); eye.scale.setScalar(0.5); eye.position.set(0, 0.7, 0.25); g.add(eye); }
  return { g, mat, body };
}
function spawnEnemy(type, x, z, room, diff) {
  const def = ENEMY[type], m = buildEnemyMesh(def), fy = floorY(x, z);
  m.g.position.set(x, fy + def.y, z);
  dynGroup.add(m.g);
  const e = {
    type, def,
    mesh: m.g, body: m.body, mat: m.mat, baseEI: 0.4, // group, spinning body, body material, normal glow
    x, z, fy,               // position on the floor and feet height
    y: def.y,               // body height above the feet
    r: def.r, hitR: def.hitR, // collision radius, hit sphere radius
    hp: def.hp * diff, maxHp: def.hp * diff,
    dmg: def.dmg * ENEMY_TUNE.dmgMul * (1 + (run ? prog(run.stage) : 0) * 0.045) * presMul(),
    room,                   // room index (-1 = not tied to a room, e.g. boss minions)
    active: false,          // wakes up when the player comes near (see wakeCheck)
    cd: rand(0.8, 1.8),     // ranged / sniper cooldown
    mcd: 0,                 // melee cooldown
    t: rand(0, 6),          // animation clock
    flash: 0,               // hit flash timer
    side: Math.random() < 0.5 ? -1 : 1, // strafe direction for `keep` enemies
    face: 0,                // facing angle (turns gradually when def.turn is set)
    stun: 0,                // seconds of stagger left (shield break)
    // set later by behaviour code: fuse (bomber), aim / lock (sniper), lastShot / shotN (shotgun full-hit count), detonated
  };
  if (def.shield) {
    e.shieldHp = def.shieldHp * diff;       // shield breaks at 0
    e.shieldParts = m.g.userData.shield;    // plate + outline meshes, removed on break
  }
  if (def.sniper) e.laser = makeLaser(0xff4d8d);
  enemies.push(e);
  return e;
}
function removeEnemyMesh(e) {
  disposeTree(e.mesh); dynGroup.remove(e.mesh);
  if (e.laser) { disposeTree(e.laser); dynGroup.remove(e.laser); e.laser = null; }
  if (e.extra) e.extra.forEach(o => { disposeTree(o); (o.parent || dynGroup).remove(o); });
}

// keep drops out of portal range so they can be picked up without touching the gate
function clearOfPortals(x, z) {
  const R = 3.2;
  for (const pt of portals) {
    const dx = x - pt.x, dz = z - pt.z, d = Math.hypot(dx, dz);
    if (d >= R - 0.05) continue;
    const base = d > 0.01 ? Math.atan2(dz, dx) : Math.random() * Math.PI * 2;
    for (let k = 0; k < 12; k++) {
      const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 6;
      const nx = pt.x + Math.cos(a) * R, nz = pt.z + Math.sin(a) * R;
      if (!blocked(nx, nz, 0.4) && walkable(Math.floor(nz / T) * W + Math.floor(nx / T))) return clearOfPortals(nx, nz);
    }
  }
  return [x, z];
}
function addPickup(kind, x, z, extra) {
  [x, z] = clearOfPortals(x, z);
  let mesh;
  if (kind === 'bit') mesh = new THREE.Mesh(geoCache.bit, basicMat(0xffc24a));
  else if (kind === 'kit') {
    mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(geoCache.cross1, basicMat(0x8cff6a)), new THREE.Mesh(geoCache.cross2, basicMat(0x8cff6a)), new THREE.LineSegments(edges('chipOuter'), lineMat(0x8cff6a)));
  } else if (kind === 'chip') {
    mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(geoCache.chip, basicMat(0xffc24a)), new THREE.LineSegments(edges('chipOuter'), lineMat(0xffc24a)));
  } else {
    const col = WEAPONS[extra.w.id].color;
    mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(geoCache.wbox, basicMat(col)), new THREE.LineSegments(edges('wbox'), lineMat(RARITY[extra.w.r].hex)));
    mesh.scale.setScalar(1 + extra.w.r * 0.15);
  }
  const baseY = (kind === 'bit' ? 0.5 : 1.0) + floorY(x, z);
  mesh.position.set(x, baseY, z); dynGroup.add(mesh);
  const p = Object.assign({ kind, x, z, y: baseY, mesh, t: rand(0, 6), dead: false }, extra || {});
  pickups.push(p); return p;
}
function dropBits(x, z, total) {
  const n = clamp(Math.round(total / 4), 1, 10), per = total / n;
  for (let k = 0; k < n; k++) addPickup('bit', x + rand(-0.9, 0.9), z + rand(-0.9, 0.9), { value: per });
}
function spawnWave(x, z, speed, max, dmg, color) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
  const m = new THREE.Mesh(geoCache.wave, mat); m.position.set(x, floorY(x, z) + 0.55, z); m.scale.set(0.5, 1, 0.5); dynGroup.add(m);
  waves.push({ x, z, r: 0.5, speed, max, dmg, hit: false, m, dead: false });
}
