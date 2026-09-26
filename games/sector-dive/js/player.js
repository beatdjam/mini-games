'use strict';
// ================= player =================
let P = null, run = null;
const newWeapon = (id, r, basic, plus, opts) => ({ id, r, basic: !!basic, plus: plus || 0, opts: opts || [], mag: WEAPONS[id].mag });
// weapon options: only active while that weapon is in hand
const AFFIX = {
  mag:    { name: '大容量弾倉',   text: '装弾数 +30%' },
  reload: { name: '速射装填',     text: 'リロード -20%' },
  rate:   { name: '高速機関',     text: '連射速度 +10%' },
  crit:   { name: '照準補正',     text: '会心率 +8%' },
  leech:  { name: '吸収回路',     text: '撃破ごとにHP +2' },
  speed:  { name: '軽量フレーム', text: '移動速度 +6%' },
  pierce: { name: '徹甲弾',       text: '貫通 +1' },
  gain:   { name: '採集機構',     text: 'ビット獲得 +10%' },
};
const PLUS_DMG = 0.08;
const wo = (k, w) => { w = w || (P && P.weapons[P.cur]); return w && w.opts ? w.opts.filter(o => o === k).length : 0; };
const wDmgMul = w => RARITY[w.r].mult * (1 + PLUS_DMG * (w.plus || 0));
function rollWeapon(stage, minR) {
  const roll = Math.random() + stage * 0.025;
  const r = Math.max(minR || 0, roll > 1.05 ? 2 : roll > 0.68 ? 1 : 0);
  let plus = 0;
  // no cap: the stage level climbs 0.6 per stage (about +3 per sector).
  // Usually at or a little below that level; above it only 15% of the time, each further step 30%.
  if (stage >= 3) {
    const lv = Math.floor((stage - 2) * 0.6);
    if (Math.random() < 0.15) { let over = 1; while (Math.random() < 0.3) over++; plus = lv + over; }
    else plus = Math.max(0, lv - randi(0, 2));
  }
  let n = 0;
  if (stage >= 5 && Math.random() < 0.35 + (stage - 5) * 0.04) n++;
  if (stage >= 10 && Math.random() < 0.3 + (stage - 10) * 0.03) n++;
  return newWeapon(pickDrop(), r, false, plus, shuffle(Object.keys(AFFIX)).slice(0, n));
}
function newPlayer(loadout) {
  const u = save.up, pu = save.pres.up, hp = 100 + u.hp * 15 + pu.hp * 10;
  const ws = loadout.map(w => w ? newWeapon(w.id, w.r, w.basic, w.plus, w.opts) : null);
  return { x: 0, z: 0, yaw: 0, pitch: 0, hp, maxHp: hp, r: 0.45, baseSpeed: 7.4, spdMul: 1 + u.spd * 0.05, dmgMul: 1 + u.dmg * 0.08,
    rateMul: 1, gainMul: (1 + u.gain * 0.15) * (1 + pu.gain * 0.1), leech: 0, pierce: 0, extra: 0, crit: 0, chain: 0, magnet: 1, reloadMul: 1, magMul: 1,
    st: 100 + (u.stam || 0) * 20, stMax: 100 + (u.stam || 0) * 20, stRegen: 34 * (1 + u.dash * 0.12), stDelay: 0,
    inv: 0, dashT: 0, ddx: 0, ddz: 0, weapons: ws, cur: 0, bag: [null, null, null, null], kits: 1 + u.kit,
    reloadT: 0, reloadMax: 1, fireCd: 0, tile: -1, bob: 0, fy: 0, vy: 0 };
}
// each run walks the sectors in its own shuffled order (run.route); depth (tier) drives difficulty
const routeBiome = t => BIOMES[run && run.route ? run.route[t % run.route.length] : t % BIOMES.length];
const stageInfo = s => { const tier = Math.floor(s / PER); return { biome: routeBiome(tier), sub: s % PER, loop: Math.floor(tier / 3), tier }; };
const isBossStage = s => s % PER === PER - 1;
function stageLabel(s) { const si = stageInfo(s); return `D${si.tier + 1} ${isBossStage(s) ? 'BOSS' : (si.sub + 1) + '/' + (PER - 1)}`; }
function tierLabel(t) { return `DEPTH ${t + 1}`; }
const diffOf = s => (1 + s * 0.1 + stageInfo(s).loop * 0.5) * presMul();
const magSize = w => Math.max(1, Math.round(WEAPONS[w.id].mag * P.magMul * (1 + 0.3 * wo('mag', w))));
const rarLabel = w => w.basic ? '基本' : `${RARITY[w.r].stars}${RARITY[w.r].name}`;
const wName = w => `<span style="color:${w.basic ? 'inherit' : RARITY[w.r].css}">${WEAPONS[w.id].name}${w.plus ? '+' + w.plus : ''}</span><em style="color:${RARITY[w.r].css}">${rarLabel(w)}</em>`;
const wText = w => `${WEAPONS[w.id].name}${w.plus ? '+' + w.plus : ''}［${rarLabel(w)}］${w.opts && w.opts.length ? '◆' + w.opts.map(o => AFFIX[o].name).join('・') : ''}`;
const wOpts = w => w.opts && w.opts.length ? `<span class="wopt">${w.opts.map(o => AFFIX[o].text).join(' / ')}</span>` : '';

// ---- viewmodels ----
const gun = new THREE.Group(); camera.add(gun); gun.visible = false;
function vmMat(c, lit) { const m = lit ? new THREE.MeshLambertMaterial({ color: c }) : new THREE.MeshBasicMaterial({ color: c }); m.depthTest = false; return m; }
function vbox(w, h, d, mat, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; }
function vcyl(r, len, mat, x, y, z) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), mat); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); return m; }
const VM = {};
function buildVM(id) {
  const g = new THREE.Group(), col = WEAPONS[id].color;
  const dark = vmMat(0x1d2935, true), darker = vmMat(0x0f161d, true), acc = vmMat(col);
  let tip = [0, 0.02, -0.5], pos = [0.3, -0.3, -0.6];
  if (id === 'pistol') {
    g.add(vbox(0.1, 0.13, 0.34, dark, 0, 0, 0), vbox(0.105, 0.025, 0.3, acc, 0, 0.05, 0), vbox(0.05, 0.05, 0.12, darker, 0, 0.01, -0.22), vbox(0.08, 0.2, 0.09, darker, 0, -0.13, 0.1));
    tip = [0, 0.01, -0.3]; pos = [0.28, -0.28, -0.55];
  } else if (id === 'smg') {
    g.add(vbox(0.11, 0.14, 0.46, dark, 0, 0, 0), vbox(0.115, 0.025, 0.38, acc, 0, 0.055, 0), vbox(0.06, 0.22, 0.08, darker, 0, -0.17, -0.06),
      vbox(0.06, 0.08, 0.2, darker, 0, -0.02, 0.3), vbox(0.05, 0.05, 0.16, darker, 0, 0.01, -0.3));
    tip = [0, 0.01, -0.4];
  } else if (id === 'shotgun') {
    g.add(vbox(0.12, 0.13, 0.5, dark, 0, 0, 0.05), vbox(0.075, 0.075, 0.55, darker, 0, 0.035, -0.42), vbox(0.11, 0.08, 0.2, acc, 0, -0.045, -0.36),
      vbox(0.09, 0.16, 0.12, darker, 0, -0.12, 0.2));
    tip = [0, 0.035, -0.7]; pos = [0.3, -0.3, -0.55];
  } else if (id === 'rail') {
    g.add(vbox(0.09, 0.12, 0.72, dark, 0, 0, -0.05), vbox(0.02, 0.02, 0.7, acc, 0.05, 0.07, -0.12), vbox(0.02, 0.02, 0.7, acc, -0.05, 0.07, -0.12));
    [-0.12, -0.26, -0.4].forEach(z => g.add(vbox(0.14, 0.14, 0.03, acc, 0, 0.01, z)));
    g.add(vbox(0.08, 0.18, 0.1, darker, 0, -0.13, 0.15));
    tip = [0, 0.01, -0.46];
  } else {
    g.add(vcyl(0.12, 0.95, dark, 0, 0, -0.05), vcyl(0.135, 0.07, acc, 0, 0, -0.52), vcyl(0.135, 0.05, acc, 0, 0, 0.4),
      vbox(0.04, 0.09, 0.12, darker, -0.12, 0.12, -0.1), vbox(0.07, 0.18, 0.08, darker, 0, -0.18, 0.08));
    tip = [0, 0, -0.58]; pos = [0.32, -0.25, -0.5];
  }
  const t = new THREE.Object3D(); t.position.set(tip[0], tip[1], tip[2]); g.add(t);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(id === 'launcher' ? 0.16 : 0.08, 8, 6), vmMat(0xffffff));
  flash.position.copy(t.position); flash.visible = false; g.add(flash);
  g.traverse(o => { o.renderOrder = 999; });
  g.userData = { tip: t, flash, pos };
  g.visible = false; gun.add(g); VM[id] = g;
}
WEAPON_ORDER.forEach(buildVM);
let gunKick = 0, flashT = 0, curVM = null;
function setVM(id) {
  if (curVM) { curVM.visible = false; curVM.userData.flash.visible = false; }
  curVM = VM[id]; curVM.visible = true;
}

const curW = () => P.weapons[P.cur];
function fwd() { return new V3(-Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), -Math.cos(P.yaw) * Math.cos(P.pitch)); }

// hit spheres: multi-body bosses list their parts, everything else is one sphere at the mesh
function spheres(e) { return e.parts || [{ p: e.mesh.position, r: e.hitR }]; }
function findTarget() {
  const f = fwd(), cp = camera.position, cone = Math.max(ASSIST[save.settings.assist] || 0, 0.012);
  let best = null, bestS = Infinity;
  for (const e of enemies) {
    if (e.dead) continue;
    for (const sp of spheres(e)) {
      const ep = sp.p, ex = ep.x - cp.x, ey = ep.y - cp.y, ez = ep.z - cp.z, d = Math.hypot(ex, ey, ez);
      if (d > 56 || d < 0.1) continue;
      const a = Math.acos(clamp((ex * f.x + ey * f.y + ez * f.z) / d, -1, 1)), s = a - Math.atan(sp.r * 0.85 / d);
      if (s < cone && s < bestS && hasLOS(cp.x, cp.z, ep.x, ep.z, cp.y, ep.y)) { best = { e, p: ep }; bestS = s; }
    }
  }
  return best;
}

function tryFire() {
  if (P.reloadT > 0) return;
  const w = curW();
  if (w.mag <= 0) { startReload(); return; }
  fire();
}
function startReload() {
  const w = curW();
  if (P.reloadT > 0 || w.mag >= magSize(w)) return;
  P.reloadMax = P.reloadT = WEAPONS[w.id].reload * P.reloadMul * Math.pow(0.8, wo('reload')); sfx('reload');
}
let shotId = 0;
function fire() {
  shotId++;
  const w = curW(), def = WEAPONS[w.id], rar = RARITY[w.r];
  P.fireCd = def.rate * P.rateMul * Math.pow(0.91, wo('rate'));
  w.mag--;
  camera.updateMatrixWorld();
  const mz = curVM.userData.tip.getWorldPosition(new V3());
  const cp = camera.position, f = fwd();
  let aim;
  if (target) {
    const tp = target.p, d = cp.distanceTo(tp), straight = cp.clone().addScaledVector(f, d);
    const lvl = save.settings.assist;
    aim = lvl === 'strong' ? tp.clone() : lvl === 'weak' ? straight.lerp(tp, 0.5) : straight;
  } else aim = cp.clone().addScaledVector(f, 40);
  const base = aim.sub(mz).normalize();
  const n = def.pellets + P.extra;
  const dmg = def.dmg * wDmgMul(w) * P.dmgMul * (P.extra > 0 ? 0.8 : 1);
  const moving = Math.hypot(joy.x, joy.y) > 0.2 || keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD;
  for (let k = 0; k < n; k++) {
    const d = base.clone();
    if (P.extra > 0 && def.pellets === 1) d.applyAxisAngle(UP, (k - (n - 1) / 2) * 0.05);
    const s = def.spread + (k >= def.pellets ? 0.02 : 0) + (moving && !def.steady ? 0.014 : 0);
    d.x += rand(-s, s); d.y += rand(-s, s) * 0.7; d.z += rand(-s, s); d.normalize();
    spawnPBullet(mz, d, def.speed, dmg, (def.pierce || 0) + P.pierce + wo('pierce'), def.blast, def.color, def.grav, { close: def.close, closeMul: def.closeMul, full: def.full, far: def.far, farMul: def.farMul, kb: def.kb, rail: !!def.pierce, shot: shotId });
  }
  gunKick = Math.min(0.2, gunKick + (def.blast ? 0.2 : def.pellets > 1 || def.pierce ? 0.12 : 0.05));
  flashT = def.blast ? 0.09 : 0.05;
  if (def.blast) { shake = Math.max(shake, 0.18); burst(mz.x, mz.y, mz.z, 0x9aa3ad, 6, 2, 0.8, -2); }
  else if (def.pellets > 1) shake = Math.max(shake, 0.06);
  sfx(w.id, 40);
  if (w.mag <= 0) startReload();
}

function damagePlayer(d) {
  if (P.inv > 0 || state !== 'play') return;
  P.hp -= d; P.inv = 0.45; shake = Math.max(shake, 0.22); vig = 0.9; sfx('hurt', 80);
  if (P.hp <= 0) { P.hp = 0; endRun('dead'); }
}

function hurtEnemy(e, dmg, isCrit) {
  if (e.dead) return;
  if (e.invuln) { if (!e.hinted) { e.hinted = true; toast('シールド中。周りの砲台を先に壊す', 2400); } burst(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z, 0x8cc8ff, 2, 4, 0.2); return; }
  if (e.stunMul) dmg *= e.stunMul;
  e.hp -= dmg; e.flash = 0.07;
  if (!e.active) { e.active = true; if (e.room >= 0) enemies.forEach(o => { if (o.room === e.room) o.active = true; }); }
  hitMark(isCrit); sfx('hit', 45);
  if (e.hp <= 0) killEnemy(e);
}
function explode(x, y, z, radius, dmg, color, big) {
  if (big) {
    fireball(x, y, z, radius * 0.75, 0xff8a3d); fireball(x, y, z, radius * 0.4, 0xfff2c0);
    burst(x, y, z, 0xff6a3d, 34, 12, 0.9); burst(x, y, z, 0xffc24a, 14, 7, 0.6); burst(x, y + 0.5, z, 0x5b6470, 12, 2.5, 1.4, -3);
    sfx('bigboom', 60);
    const pd = Math.hypot(P.x - x, P.z - z);
    shake = Math.max(shake, 0.5 * clamp(1 - pd / 30, 0.25, 1));
    if (pd < radius * 0.6 && state === 'play') damagePlayer(14);
  } else {
    burst(x, y, z, color || 0xff6a3d, 22, 9, 0.7); burst(x, y, z, 0xffffff, 8, 5, 0.4);
    sfx('boom', 60); shake = Math.max(shake, 0.12);
  }
  for (const e of enemies) {
    if (e.dead) continue;
    let dd = Infinity;
    for (const sp of spheres(e)) { const q = sp.p; dd = Math.min(dd, Math.hypot(q.x - x, (q.y - y) * 0.6, q.z - z) - sp.r * 0.5); }
    if (dd < radius) {
      const core = radius * 0.4, fall = dd <= core ? 1 : 1 - (dd - core) / (radius - core) * 0.7;
      hurtEnemy(e, dmg * fall, false);
      if (big && !e.boss && !e.dead) { const kx = e.x - x, kz = e.z - z, kl = Math.hypot(kx, kz) || 1; moveCircle(e, kx / kl * 2.2, kz / kl * 2.2, e.r); e.flash = 0.2; }
    }
  }
}
// bomber blast: hurts the player and any enemy caught in it
function bomberBlast(x, y, z, dmg) {
  burst(x, y, z, 0xffb13d, 26, 10, 0.7); burst(x, y, z, 0xffffff, 8, 5, 0.3); fireball(x, y, z, 3, 0xff8a3d);
  sfx('boom', 40); shake = Math.max(shake, 0.2);
  if (Math.hypot(P.x - x, P.z - z) < 3.4 && Math.abs(P.fy + 1 - y) < 2.5) damagePlayer(dmg);
  for (const o of enemies) if (!o.dead && !o.boss && Math.hypot(o.x - x, o.z - z) < 3.2) hurtEnemy(o, 35, false);
}
function detonate(e) { e.detonated = true; killEnemy(e, true); bomberBlast(e.x, e.mesh.position.y, e.z, e.dmg); }
function killEnemy(e, noReward) {
  e.dead = true;
  if (!noReward) run.kills++;
  const pos = e.mesh.position;
  burst(pos.x, pos.y, pos.z, e.boss ? 0xff4d8d : e.def.color, e.boss ? 60 : 14, e.boss ? 14 : 8, e.boss ? 1.4 : 0.7);
  removeEnemyMesh(e); sfx('kill', 30);
  if (e.boss) { bossDown(e); return; }
  if (e.def.split) {
    for (let k = 0; k < 2; k++) {
      const m = spawnEnemy('mini', e.x + (k ? 0.6 : -0.6), e.z + rand(-0.4, 0.4), e.room, diffOf(run.stage)); m.active = true;
    }
    if (e.room >= 0) roomCount[e.room] += 2;
  }
  if (e.def.bomber && !e.detonated) { e.detonated = true; bomberBlast(e.x, pos.y, e.z, e.dmg * 0.6); }
  if (noReward) { if (e.room >= 0 && --roomCount[e.room] === 0) roomCleared(e.room); return; }
  dropBits(e.x, e.z, e.def.bits * 0.6 * (1 + run.stage * 0.05));
  if (Math.random() < 0.06) addPickup('kit', e.x + rand(-0.5, 0.5), e.z + rand(-0.5, 0.5));
  const lh = P.leech + 2 * wo('leech'); if (lh) P.hp = Math.min(P.maxHp, P.hp + lh);
  if (P.chain) explode(pos.x, pos.y, pos.z, 3 + P.chain * 0.8, 18 * P.chain * P.dmgMul, 0xffc24a);
  if (e.room >= 0 && --roomCount[e.room] === 0) roomCleared(e.room);
}
function roomCleared(idx) {
  const [x, z] = roomSpot(rooms[idx]);
  if (Math.random() < 0.6) { addPickup('chip', x, z); toast('区画制圧 — チップを回収できる'); }
  else { addPickup('kit', x - 0.8, z); dropBits(x + 0.8, z, 6 + run.stage); toast('区画制圧'); }
}
