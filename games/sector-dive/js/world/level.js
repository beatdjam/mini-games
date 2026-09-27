'use strict';
let roomOf = null, rooms = [], seen = null, haz = null, hazMat = null, hazT = 0;
let levelGroup = null, portals = [], startIdx = 0, exitIdx = 0, roomCount = [], arena = false, curBiome = BIOMES[0];

// ---------- generators ----------
function newMaps(w, h) {
  return { g: new Uint8Array(w * h), hg: new Float32Array(w * h), rp: new Int8Array(w * h).fill(-1),
    cv: new Uint8Array(w * h), hz: new Uint8Array(w * h), ro: new Int8Array(w * h).fill(-1) };
}
function genRooms(o) {
  const w = o.map || 36, h = w, M = newMaps(w, h), g = M.g, rs = [];
  const target = randi(o.countMin || 5, o.countMax || 6), rmin = o.roomMin || 4, rmax = o.roomMax || 7, cw = o.corridorW || 1;
  let tries = 0;
  while (rs.length < target && tries++ < 1000) {
    const rw = randi(rmin, rmax), rh = randi(rmin, rmax), x = randi(1, w - rw - 1), y = randi(1, h - rh - 1);
    if (rs.some(q => x < q.x + q.w + 2 && x + rw + 2 > q.x && y < q.y + q.h + 2 && y + rh + 2 > q.y)) continue;
    rs.push({ x, y, w: rw, h: rh });
  }
  const carve = (i, j) => { for (let a = 0; a < cw; a++) for (let b = 0; b < cw; b++) { const x = i + a, y = j + b; if (x > 0 && y > 0 && x < w - 1 && y < h - 1) g[y * w + x] = 1; } };
  rs.forEach(r => { for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) g[j * w + i] = 1; });
  const ctr = r => [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)];
  const corridor = (a, b) => {
    let [x, y] = ctr(a); const [tx, ty] = ctr(b);
    const sx = () => { while (x !== tx) { carve(x, y); x += Math.sign(tx - x); } };
    const sy = () => { while (y !== ty) { carve(x, y); y += Math.sign(ty - y); } };
    if (Math.random() < 0.5) { sx(); sy(); } else { sy(); sx(); }
    carve(x, y);
  };
  const order = [rs[0]], rest = rs.slice(1);
  const dist = (a, b) => Math.hypot(a.x + a.w / 2 - b.x - b.w / 2, a.y + a.h / 2 - b.y - b.h / 2);
  while (rest.length) { const last = order[order.length - 1]; rest.sort((a, b) => dist(a, last) - dist(b, last)); order.push(rest.shift()); }
  for (let k = 1; k < order.length; k++) corridor(order[k - 1], order[k]);
  if (order.length > 4) corridor(order[0], order[randi(2, order.length - 1)]);
  rs.forEach((r, idx) => { for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) M.ro[j * w + i] = idx; });
  rs.forEach(r => {
    const big = r.w >= 6 && r.h >= 6;
    if (big && Math.random() < (o.platform || 0)) addPlatform(M, w, r);
    else if (big && !o.rubble && Math.random() < 0.5) {
      const [cx, cy] = ctr(r);
      [[r.x + 1, r.y + 1], [r.x + r.w - 2, r.y + r.h - 2]].forEach(([i, j]) => { if (i !== cx || j !== cy) g[j * w + i] = 0; });
    }
    if (o.rubble) addRubble(M, w, r, o.rubble);
  });
  if (o.bridges) addBridges(M, w, h, o.bridges);
  if (o.hazard) addHazards(M, w, h, o.hazard.count);
  return { W: w, H: h, M, rooms: rs };
}
// raised deck inside the room; the outer ring stays at ground level so every doorway still connects
function addPlatform(M, w, r) {
  for (let j = r.y + 2; j <= r.y + r.h - 2; j++) for (let i = r.x + 1; i <= r.x + r.w - 2; i++) M.hg[j * w + i] = PLAT_H;
  const k = (r.y + 1) * w + Math.floor(r.x + r.w / 2);
  M.rp[k] = 2; M.hg[k] = 0;
  r.plat = true;
}
function addRubble(M, w, r, rate) {
  const cx = Math.floor(r.x + r.w / 2), cy = Math.floor(r.y + r.h / 2);
  for (let j = r.y + 1; j <= r.y + r.h - 2; j++) for (let i = r.x + 1; i <= r.x + r.w - 2; i++) {
    const k = j * w + i;
    if ((i === cx && j === cy) || M.hg[k] > 0 || M.rp[k] >= 0 || Math.random() > rate) continue;
    let ok = true;
    for (let dj = -1; dj <= 1 && ok; dj++) for (let di = -1; di <= 1; di++) { const n = (j + dj) * w + i + di; if (M.cv[n] || M.rp[n] >= 0 || M.hg[n] > 0) { ok = false; break; } }
    if (ok) { M.cv[k] = 1; M.hg[k] = COVER_H; }
  }
}
// straight 1-wide corridor runs (walls on both sides) become raised walkways with a ramp at each end
function addBridges(M, w, h, count) {
  const g = M.g, free = k => g[k] === 1 && M.ro[k] < 0 && M.hg[k] === 0 && M.rp[k] < 0 && !M.cv[k] && !M.hz[k];
  const runs = [];
  for (let j = 1; j < h - 1; j++) {
    let i0 = -1;
    for (let i = 1; i < w; i++) {
      const k = j * w + i, ok = i < w - 1 && free(k) && !g[k - w] && !g[k + w];
      if (ok && i0 < 0) i0 = i;
      if (!ok && i0 >= 0) { if (i - i0 >= 5) runs.push({ hor: true, a: i0, b: i - 1, c: j }); i0 = -1; }
    }
  }
  for (let i = 1; i < w - 1; i++) {
    let j0 = -1;
    for (let j = 1; j < h; j++) {
      const k = j * w + i, ok = j < h - 1 && free(k) && !g[k - 1] && !g[k + 1];
      if (ok && j0 < 0) j0 = j;
      if (!ok && j0 >= 0) { if (j - j0 >= 5) runs.push({ hor: false, a: j0, b: j - 1, c: i }); j0 = -1; }
    }
  }
  shuffle(runs).slice(0, count).forEach(r => {
    const K = t => r.hor ? r.c * w + t : t * w + r.c;
    M.rp[K(r.a)] = r.hor ? 0 : 2; M.rp[K(r.b)] = r.hor ? 1 : 3;
    for (let t = r.a + 1; t < r.b; t++) M.hg[K(t)] = PLAT_H;
  });
}
function addHazards(M, w, h, count) {
  let placed = 0, tries = 0;
  while (placed < count && tries++ < 2000) {
    const i = randi(1, w - 2), j = randi(1, h - 2), k = j * w + i;
    if (M.g[k] !== 1 || M.hg[k] !== 0 || M.rp[k] >= 0 || M.cv[k] || M.hz[k]) continue;
    M.hz[k] = 1; placed++;
  }
}
function genArena(withPillars) {
  const w = 20, h = 20, M = newMaps(w, h);
  for (let j = 4; j < 16; j++) for (let i = 4; i < 16; i++) M.g[j * w + i] = 1;
  if (withPillars) [[6, 6], [13, 6], [6, 13], [13, 13]].forEach(([i, j]) => { M.g[j * w + i] = 0; });
  return { W: w, H: h, M, rooms: [{ x: 4, y: 4, w: 12, h: 12 }] };
}

function clearLevel() {
  if (levelGroup) { disposeTree(levelGroup); scene.remove(levelGroup); levelGroup = null; }
  enemies.forEach(removeEnemyMesh); enemies = [];
  clearWorld();
  clearPool(pBullets); clearPool(eBullets);
  clearFx();
  portals = []; boss = null; nearW = null; hazMat = null;
}

// wedge rising toward +x across one tile; rotated per ramp direction
function wedgeGeo() {
  const a = T / 2, r = RISE, pos = [], uv = [], idx = [];
  const quad = (p0, p1, p2, p3) => { const b = pos.length / 3; pos.push(...p0, ...p1, ...p2, ...p3); uv.push(0, 0, 1, 0, 1, 1, 0, 1); idx.push(b, b + 1, b + 2, b, b + 2, b + 3); };
  const tri = (p0, p1, p2) => { const b = pos.length / 3; pos.push(...p0, ...p1, ...p2); uv.push(0, 0, 1, 0, 1, 1); idx.push(b, b + 1, b + 2); };
  quad([-a, 0, -a], [a, r, -a], [a, r, a], [-a, 0, a]);
  quad([a, 0, -a], [a, 0, a], [a, r, a], [a, r, -a]);
  tri([-a, 0, -a], [a, 0, -a], [a, r, -a]); tri([-a, 0, a], [a, r, a], [a, 0, a]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.addGroup(0, 6, 0); g.addGroup(6, 12, 1);
  return g;
}
const RAMP_ROT = [0, Math.PI, -Math.PI / 2, Math.PI / 2];

function buildLevel(biome, isArena, bossKind) {
  clearLevel();
  curBiome = biome; arena = isArena;
  const gen = isArena ? genArena(BOSS_META[bossKind].pillars) : genRooms(biome.gen);
  W = gen.W; H = gen.H; rooms = gen.rooms;
  const M = gen.M; grid = M.g; hgt = M.hg; ramp = M.rp; cover = M.cv; haz = M.hz; roomOf = M.ro;
  flow = new Int16Array(W * H); flowQ = new Int32Array(W * H); seen = new Uint8Array(W * H);
  roomCount = new Array(rooms.length).fill(0);
  levelGroup = new THREE.Group(); scene.add(levelGroup);
  const tex = biomeTex(biome);
  tex.floor.repeat.set(W, H);
  const fgeo = new THREE.PlaneGeometry(W * T, H * T); fgeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(fgeo, new THREE.MeshBasicMaterial({ map: tex.floor }));
  floor.position.set(W * T / 2, 0, H * T / 2); levelGroup.add(floor);
  const m = new THREE.Matrix4();
  // walls
  const list = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (grid[j * W + i] === 1) continue;
    let near = false;
    for (let dj = -1; dj <= 1 && !near; dj++) for (let di = -1; di <= 1; di++) {
      const a = i + di, b = j + dj;
      if (a >= 0 && b >= 0 && a < W && b < H && grid[b * W + a] === 1) { near = true; break; }
    }
    if (near) list.push([i, j]);
  }
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(T, WALL_H, T), new THREE.MeshBasicMaterial({ map: tex.wall }), list.length);
  list.forEach(([i, j], k) => { m.makeTranslation((i + 0.5) * T, WALL_H / 2, (j + 0.5) * T); inst.setMatrixAt(k, m); });
  inst.instanceMatrix.needsUpdate = true; levelGroup.add(inst);
  // raised decks, walkways and cover
  const raised = [];
  for (let k = 0; k < W * H; k++) if (grid[k] === 1 && ramp[k] < 0 && hgt[k] > 0) raised.push(k);
  const side = new THREE.MeshBasicMaterial({ map: tex.wall }), top = new THREE.MeshBasicMaterial({ map: tex.tile });
  const coverSide = new THREE.MeshBasicMaterial({ map: tex.wall, color: 0x9a9a9a });
  [[raised.filter(k => !cover[k]), side], [raised.filter(k => cover[k]), coverSide]].forEach(([ks, sm]) => {
    if (!ks.length) return;
    const bg = new THREE.BoxGeometry(T, 1, T); bg.translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(bg, [sm, sm, top, sm, sm, sm], ks.length);
    ks.forEach((k, n) => { m.makeScale(1, hgt[k], 1); m.setPosition(((k % W) + 0.5) * T, 0, (((k / W) | 0) + 0.5) * T); im.setMatrixAt(n, m); });
    im.instanceMatrix.needsUpdate = true; levelGroup.add(im);
  });
  const rampTop = new THREE.MeshBasicMaterial({ map: tex.tile, side: THREE.DoubleSide }), rampSide = new THREE.MeshBasicMaterial({ map: tex.wall, side: THREE.DoubleSide });
  const wg = wedgeGeo();
  for (let k = 0; k < W * H; k++) {
    if (grid[k] !== 1 || ramp[k] < 0) continue;
    const rm = new THREE.Mesh(wg, [rampTop, rampSide]);
    rm.position.set(((k % W) + 0.5) * T, hgt[k], (((k / W) | 0) + 0.5) * T); rm.rotation.y = RAMP_ROT[ramp[k]];
    levelGroup.add(rm);
  }
  // hazard floor
  const hz = [];
  for (let k = 0; k < W * H; k++) if (haz[k]) hz.push(k);
  if (hz.length) {
    hazMat = new THREE.MeshBasicMaterial({ color: biome.gen.hazard.color, transparent: true, opacity: 0.2, depthWrite: false });
    const pg = new THREE.PlaneGeometry(T * 0.94, T * 0.94); pg.rotateX(-Math.PI / 2);
    const im = new THREE.InstancedMesh(pg, hazMat, hz.length);
    hz.forEach((k, n) => { m.makeTranslation(((k % W) + 0.5) * T, hgt[k] + 0.04, (((k / W) | 0) + 0.5) * T); im.setMatrixAt(n, m); });
    im.instanceMatrix.needsUpdate = true; levelGroup.add(im);
  }
  hazT = 0;
  // ceiling and neon signs (sectors with gen.ceiling / gen.neon)
  if (biome.gen.ceiling && !isArena) {
    const cg = new THREE.PlaneGeometry(W * T, H * T); cg.rotateX(Math.PI / 2);
    const ceil = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: new THREE.Color(biome.wall).multiplyScalar(0.7) }));
    ceil.position.set(W * T / 2, WALL_H, H * T / 2); levelGroup.add(ceil);
  }
  if (biome.gen.neon && !isArena) {
    const spots = [];
    list.forEach(([i, j]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => { if (!isSolid(i + a, j + b)) spots.push([i, j, a, b]); }));
    const pickSpots = shuffle(spots).slice(0, 90), colors = [0xff3d8a, 0x3dffb4, 0xffd23d, 0x4dc3ff, 0xc58cff];
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(T * 0.55, 0.45, 0.08), new THREE.MeshBasicMaterial({ color: 0xffffff }), pickSpots.length);
    const q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
    pickSpots.forEach(([i, j, a, b], n) => {
      q.setFromAxisAngle(UP, a !== 0 ? Math.PI / 2 : 0);
      m.compose(new THREE.Vector3((i + 0.5 + a * 0.52) * T, rand(2.4, 4.8), (j + 0.5 + b * 0.52) * T), q, s1.set(rand(0.5, 1.2), rand(0.7, 1.6), 1));
      im.setMatrixAt(n, m); im.setColorAt(n, c.setHex(pick(colors)));
    });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; levelGroup.add(im);
  }
  scene.fog.color.setHex(biome.fog); scene.background.setHex(biome.fog);
  scene.fog.near = isArena ? 6 : biome.fogNear; scene.fog.far = isArena ? Math.max(50, biome.fogFar) : biome.fogFar;
  if (isArena) { startIdx = 0; exitIdx = 0; return; }
  startIdx = randi(0, rooms.length - 1);
  const [sx, sz] = roomSpot(rooms[startIdx]);
  computeFlow(Math.floor(sx / T), Math.floor(sz / T));
  let best = -1;
  rooms.forEach((r, idx) => { const [x, z] = roomSpot(r), d = flow[Math.floor(z / T) * W + Math.floor(x / T)]; if (d > best) { best = d; exitIdx = idx; } });
}
// nearest plain floor tile to the room centre (the centre itself can be cover or a ramp)
function roomSpot(r) {
  const cx = Math.floor(r.x + r.w / 2), cy = Math.floor(r.y + r.h / 2);
  let best = null, bd = Infinity;
  for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) {
    const k = j * W + i; if (!walkable(k) || haz[k]) continue;
    const d = (i - cx) * (i - cx) + (j - cy) * (j - cy);
    if (d < bd) { bd = d; best = [(i + 0.5) * T, (j + 0.5) * T]; }
  }
  return best || [(cx + 0.5) * T, (cy + 0.5) * T];
}
function randomTileIn(r) {
  for (let k = 0; k < 40; k++) {
    const i = randi(r.x, r.x + r.w - 1), j = randi(r.y, r.y + r.h - 1);
    const k = j * W + i;
    if (walkable(k) && !haz[k]) return [(i + 0.5) * T + rand(-1, 1), (j + 0.5) * T + rand(-1, 1)];
  }
  return roomSpot(r);
}
function reveal(ti, tj) {
  if (arena) { seen.fill(1); return; }
  for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) {
    if (di * di + dj * dj > 18) continue;
    const i = ti + di, j = tj + dj; if (i >= 0 && j >= 0 && i < W && j < H) seen[j * W + i] = 1;
  }
  const r = roomOf[tj * W + ti];
  if (r >= 0) { const R = rooms[r]; for (let j = R.y - 1; j <= R.y + R.h; j++) for (let i = R.x - 1; i <= R.x + R.w; i++) if (i >= 0 && j >= 0 && i < W && j < H) seen[j * W + i] = 1; }
}
// hazard floors cycle: 1.4s live, 1.6s off, blinking for the last 0.5s before going live
function hazardState() {
  const t = hazT % 3;
  return t < 1.4 ? 'on' : t > 2.5 ? 'warn' : 'off';
}
function updateHazards(dt) {
  if (!hazMat) return;
  hazT += dt;
  const st = hazardState();
  hazMat.opacity = st === 'on' ? 0.85 : st === 'warn' ? (Math.sin(hazT * 30) > 0 ? 0.55 : 0.15) : 0.15;
  const i = Math.floor(P.x / T), j = Math.floor(P.z / T), k = j * W + i;
  if (st === 'on' && i >= 0 && j >= 0 && i < W && j < H && haz[k] && P.fy < hgt[k] + 0.3) damagePlayer(7);
}
function makePortal(x, z, color, kind, label) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.12, 8, 40), new THREE.MeshBasicMaterial({ color }));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.4, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  const base = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.9, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  base.rotation.x = -Math.PI / 2; base.position.y = -1.55;
  g.add(ring, disc, base);
  if (label) { const s = textSprite(label, '#' + color.toString(16).padStart(6, '0')); s.position.y = 2.4; g.add(s); }
  g.position.set(x, floorY(x, z) + 1.7, z);
  levelGroup.add(g);
  portals.push({ x, z, g, ring, disc, kind, color });
}
