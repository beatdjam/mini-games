'use strict';
// ================= bosses =================
// boss health multiplier: 1.33 x hpMul at the D1 boss (progress 4), then x growth per depth (about 4.0 at D3)
function bossDiff() { return 1.33 * BOSS_TUNE.hpMul * Math.pow(BOSS_TUNE.growth, (prog(run.stage) - 4) / 5) * presMul(); }
function bossBase(name, mesh, mat, hp, y, hitR, update) {
  dynGroup.add(mesh);
  const cx = W * T / 2, cz = H * T / 2;
  const e = { boss: true, name, mesh, mat, baseEI: 0.3, x: cx, z: cz - 6, y, hp, maxHp: hp, hitR, r: 1.8, t: 0, timer: 2.2, pat: -1, patIdx: 0,
    pt: 0, shots: 0, acc: 0, dmg: 10 * (1 + prog(run.stage) * 0.045) * presMul(), cx, cz, update, flash: 0, room: -1, active: true, def: { r: 1.8 } };
  mesh.position.set(e.x, y, e.z);
  enemies.push(e); boss = e;
  $('#bossName').textContent = name; $('#bossBar').hidden = false;
  // entrance: grows in over introTime, invulnerable and not attacking; the name goes up big
  e.spawnT = e.spawnMax = BOSS_TUNE.introTime; e.intro = true;
  const [en, jp] = name.split(' — ');
  banner(en, jp || 'BOSS'); sfx('beam');
  return e;
}
// while a boss is appearing or switching phase it can't be hurt and doesn't act
function bossPauseTick(e, dt) {
  e.spawnT -= dt;
  const k = clamp(1 - e.spawnT / e.spawnMax, 0, 1);
  if (e.intro) e.mesh.scale.setScalar(0.25 + 0.75 * k);
  else e.mesh.scale.setScalar(1 + Math.sin(k * Math.PI * 6) * 0.08);
  e.flash = Math.sin(e.t * 30 + k * 20) > 0 ? 0.05 : 0;
  if (e.spawnT <= 0) { e.mesh.scale.setScalar(1); e.intro = false; }
}
// drop below half health: short invulnerable burst, then the boss's enraged patterns take over
function bossPhase(e) {
  e.phased = true; e.spawnT = e.spawnMax = BOSS_TUNE.phaseTime; e.intro = false;
  const p = e.mesh.position;
  burst(p.x, p.y, p.z, 0xff4d8d, 40, 12, 1.0); fireball(p.x, p.y, p.z, 4, 0xff4d8d);
  shake = Math.max(shake, 0.4); sfx('bigboom');
  eBullets.forEach(b => { b.alive = false; b.mesh.visible = false; });
  toast('第二段階 — 攻撃が激しくなる', 2000);
}
// candidates per sector are listed in BIOMES[].bosses; each boss lives in js/bosses/<name>.js
function spawnBoss(kind) {
  if (!run.practice && !save.bossSeen[kind]) { save.bossSeen[kind] = true; persist(); } // practice doesn't count as an encounter
  const spawn = { watcher: spawnWatcher, crusher: spawnCrusher, core: spawnCore, phantom: spawnPhantom, trinity: spawnTrinity, bastion: spawnBastion }[kind];
  spawn();
  setMusic(curBiome.code, true); // boss arrangement of this sector's theme
}
function bossDown(e) {
  setMusic(curBiome.code);
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
  const roll = Math.random() + prog(run.stage) * 0.03;
  addPickup('weapon', e.cx - 2, e.cz + 5, { w: rollWeapon(prog(run.stage) + 2, roll > 0.9 ? 2 : 1) });
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

// ---- aimed laser line (sniper enemy, Phantom) ----
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
