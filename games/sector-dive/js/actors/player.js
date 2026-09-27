import { $, clamp, rand, randi, shuffle } from '../../../../engine/core/util.js';
import { t } from '../../../../engine/core/i18n.js';
import { sfx } from '../../../../engine/audio/audio.js';
import { UP, V3, buildViewmodel, camera, gun, scene } from '../../../../engine/render/render.js';
import { burst, fireball } from '../../../../engine/render/fx.js';
import { hasLOS, moveCircle } from '../../../../engine/world/tiles.js';
import { toast } from '../../../../engine/ui/ui.js';
import { joy, keys } from '../../../../engine/ui/input.js';
import { AFFIX, PLUS_DMG, RARITY, WEAPONS, WEAPON_ORDER } from '../data/weapons.js';
import { VIEWMODELS, VM_COLORS } from '../data/viewmodels.js';
import { ENEMY_TUNE } from '../data/enemies.js';
import { BIOMES } from '../data/biomes.js';
import { ASSIST, DEPTH_HP_GROWTH, PER, TUNE } from '../data/progress.js';
import { save } from '../system/save.js';
import { basicNow, pickDrop, presMul, prog } from '../system/rules.js';
import { roomCount, roomSpot, rooms } from '../world/level.js';
import { addPickup, dropBits, enemies, removeEnemyMesh, spawnEnemy, spawnPBullet, target } from '../world/entities.js';
import { bossDown, bossPhase } from './bosses/common.js';
import { SCR, hitMark } from '../ui/hud.js';
import { endRun, state } from '../flow/game.js';
export let P = null, run = null;
export function setPlayer(p) { P = p; }
export function setRun(r) { run = r; }
export const newWeapon = (id, r, basic, plus, opts) => ({ id, r, basic: !!basic, plus: plus || 0, opts: opts || [], mag: WEAPONS[id].mag });
export const wo = (k, w) => { w = w || (P && P.weapons[P.cur]); return w && w.opts ? w.opts.filter(o => o === k).length : 0; };
export const wDmgMul = w => RARITY[w.r].mult * (1 + PLUS_DMG * (w.plus || 0));
// `stage` here is progress (prog), not the raw stage number
export function rollWeapon(stage, minR) {
  const roll = Math.random() + stage * 0.025;
  const r = Math.max(minR || 0, roll > 1.05 ? 2 : roll > 0.68 ? 1 : 0);
  let plus = 0;
  // no cap: the stage level climbs 0.6 per stage (about +3 per sector).
  // Usually at or a little below that level; above it only 15% of the time, each further step 30%.
  if (stage >= 2.5) {
    const lv = Math.floor((stage - 2) * 0.6);
    if (Math.random() < 0.15) { let over = 1; while (Math.random() < 0.3) over++; plus = lv + over; }
    else plus = Math.max(0, lv - randi(0, 2));
  }
  let n = 0;
  if (stage >= 5 && Math.random() < 0.35 + (stage - 5) * 0.04) n++;
  if (stage >= 10 && Math.random() < 0.3 + (stage - 10) * 0.03) n++;
  return newWeapon(pickDrop(), r, false, plus, shuffle(Object.keys(AFFIX)).slice(0, n));
}
export function newPlayer(loadout) {
  const u = save.up, pu = save.pres.up, hp = TUNE.hp + u.hp * 15 + pu.hp * 10;
  const ws = loadout.map(basicNow).map(w => w ? newWeapon(w.id, w.r, w.basic, w.plus, w.opts) : null);
  return { x: 0, z: 0, yaw: 0, pitch: 0, hp, maxHp: hp, r: 0.45, baseSpeed: TUNE.moveSpeed, spdMul: 1 + u.spd * 0.05, dmgMul: 1 + u.dmg * 0.08,
    fireRate: 1, gainMul: (1 + u.gain * 0.15) * (1 + pu.gain * 0.1), leech: 0, pierce: 0, extra: 0, crit: 0, chain: 0, magnet: 1, reloadMul: 1, magMul: 1,
    st: TUNE.stamina + (u.stam || 0) * 20, stMax: TUNE.stamina + (u.stam || 0) * 20, stRegen: TUNE.staminaRegen * (1 + u.dash * 0.12), stDelay: 0,
    inv: 0, dashT: 0, ddx: 0, ddz: 0, weapons: ws, cur: 0, bag: [null, null, null, null], kits: TUNE.kitStart + u.kit,
    reloadT: 0, reloadMax: 1, fireCd: 0, tile: -1, bob: 0, fy: 0, vy: 0 };
}
// each run walks the sectors in its own shuffled order (run.route); depth (tier) drives difficulty
export const routeBiome = t => BIOMES[run && run.route ? run.route[t % run.route.length] : t % BIOMES.length];
export const stageInfo = s => { const tier = Math.floor(s / PER); return { biome: routeBiome(tier), sub: s % PER, loop: Math.floor(tier / 3), tier }; };
export const isBossStage = s => s % PER === PER - 1;
export function stageLabel(s) { const si = stageInfo(s); return `D${si.tier + 1} ${isBossStage(s) ? 'BOSS' : (si.sub + 1) + '/' + (PER - 1)}`; }
export function tierLabel(t) { return `DEPTH ${t + 1}`; }
export const diffOf = s => ENEMY_TUNE.hpMul * Math.pow(DEPTH_HP_GROWTH, prog(s) / 5) * presMul();
// chipMag: share of the magazine chips' effect a weapon gets (the launcher only half, so it can't double its output)
export const magSize = w => { const def = WEAPONS[w.id], chip = 1 + (P.magMul - 1) * (def.chipMag ?? 1); return Math.max(1, Math.round(def.mag * chip * (1 + 0.3 * wo('mag', w)))); };
// rarity only; whether it's a base (never-lost) weapon is shown separately where it matters (bag, loadout)
export const rarLabel = w => `${RARITY[w.r].stars}${RARITY[w.r].name}`;
export const wName = w => `<span style="color:${w.r ? RARITY[w.r].css : 'inherit'}">${WEAPONS[w.id].name}${w.plus ? '+' + w.plus : ''}</span><em style="color:${RARITY[w.r].css}">${rarLabel(w)}</em>`;
export const wText = w => t('weapon.text', { name: WEAPONS[w.id].name + (w.plus ? '+' + w.plus : ''), rar: rarLabel(w), opts: w.opts && w.opts.length ? w.opts.map(o => AFFIX[o].name).join(t('share.join')) : '' });
// split-shot: each chip adds one projectile and +20% total damage, shared across all projectiles,
// so a full hit gains the same +20% per chip whether the weapon fires 1 round or 8 pellets
export const splitMul = def => def.pellets * (1 + 0.2 * P.extra) / (def.pellets + P.extra);
export const critChance = w => Math.min(TUNE.critCap, P.crit + 0.08 * wo('crit', w));
// Effective numbers for a weapon with the player's current chips / upgrades and the weapon's own options.
// dps = sustained damage per second including reloads and average crits (rail range bonus and explosions not counted).
export function weaponStats(w) {
  const def = WEAPONS[w.id];
  const perHit = def.dmg * wDmgMul(w) * P.dmgMul * splitMul(def);
  const hits = def.pellets + P.extra;
  const interval = def.rate / P.fireRate * Math.pow(0.91, wo('rate', w));
  const mag = magSize(w);
  const reload = def.reload * P.reloadMul * Math.pow(0.8, wo('reload', w));
  return { perHit, hits, mag, dps: perHit * hits * mag / (mag * interval + reload) * (1 + critChance(w)) };
}
export const wOpts = w => w.opts && w.opts.length ? `<span class="wopt">${w.opts.map(o => AFFIX[o].text).join(' / ')}</span>` : '';

// the gun in hand per weapon, from js/data/viewmodels.js
export const VM = {};
WEAPON_ORDER.forEach(id => {
  const g = buildViewmodel(VIEWMODELS[id], Object.assign({ acc: WEAPONS[id].color }, VM_COLORS));
  g.visible = false; gun.add(g); VM[id] = g;
});
// the gun in hand: recoil and muzzle flash timers
export const GUNFX = { gunKick: 0, flashT: 0 };
export let curVM = null;
export function setVM(id) {
  if (curVM) { curVM.visible = false; curVM.userData.flash.visible = false; }
  curVM = VM[id]; curVM.visible = true;
}

export const curW = () => P.weapons[P.cur];
export function fwd() { return new V3(-Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), -Math.cos(P.yaw) * Math.cos(P.pitch)); }

// hit spheres: multi-body bosses list their parts, everything else is one sphere at the mesh
export function spheres(e) { return e.parts || [{ p: e.mesh.position, r: e.hitR }]; }
// how far you can actually make enemies out: 60% of the way into the fog
export const visibleRange = () => Math.min(56, scene.fog.near + (scene.fog.far - scene.fog.near) * 0.6);
// target for autofire, aim assist and the red crosshair: in the aim cone, in line of sight, and not hidden in fog
export function findTarget() {
  const f = fwd(), cp = camera.position, cone = Math.max(ASSIST[save.settings.assist] || 0, 0.012), maxD = visibleRange();
  let best = null, bestS = Infinity;
  for (const e of enemies) {
    if (e.dead) continue;
    for (const sp of spheres(e)) {
      const ep = sp.p, ex = ep.x - cp.x, ey = ep.y - cp.y, ez = ep.z - cp.z, d = Math.hypot(ex, ey, ez);
      if (d > maxD || d < 0.1) continue;
      const a = Math.acos(clamp((ex * f.x + ey * f.y + ez * f.z) / d, -1, 1)), s = a - Math.atan(sp.r * 0.85 / d);
      if (s < cone && s < bestS && hasLOS(cp.x, cp.z, ep.x, ep.z, cp.y, ep.y)) { best = { e, p: ep }; bestS = s; }
    }
  }
  return best;
}

export function tryFire() {
  if (P.reloadT > 0) return;
  const w = curW();
  if (w.mag <= 0) { startReload(); return; }
  fire();
}
export function startReload() {
  const w = curW();
  if (P.reloadT > 0 || w.mag >= magSize(w)) return;
  P.reloadMax = P.reloadT = WEAPONS[w.id].reload * P.reloadMul * Math.pow(0.8, wo('reload')); sfx('reload');
}
export let shotId = 0; // one trigger pull; knockback is applied once per shot per enemy
export function fire() {
  shotId++;
  const w = curW(), def = WEAPONS[w.id], rar = RARITY[w.r];
  P.fireCd = def.rate / P.fireRate * Math.pow(0.91, wo('rate'));
  w.mag--;
  camera.updateMatrixWorld();
  camera.updateMatrixWorld();
  const mz = curVM.userData.tip.getWorldPosition(new V3()).applyMatrix4(camera.matrixWorld); // gun space -> world
  const cp = camera.position, f = fwd();
  let aim;
  if (target) {
    const tp = target.p, d = cp.distanceTo(tp), straight = cp.clone().addScaledVector(f, d);
    const lvl = save.settings.assist;
    aim = lvl === 'strong' ? tp.clone() : lvl === 'weak' ? straight.lerp(tp, 0.5) : straight;
  } else aim = cp.clone().addScaledVector(f, 40);
  const base = aim.sub(mz).normalize();
  const n = def.pellets + P.extra;
  const dmg = def.dmg * wDmgMul(w) * P.dmgMul * splitMul(def);
  // rockets burst on the first hit, so pierce bonuses widen the blast instead (+15% radius each)
  const blast = def.blast ? def.blast * (1 + 0.15 * (P.pierce + wo('pierce'))) : 0;
  const moving = Math.hypot(joy.x, joy.y) > 0.2 || keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD;
  for (let k = 0; k < n; k++) {
    const d = base.clone();
    if (P.extra > 0 && def.pellets === 1) d.applyAxisAngle(UP, (k - (n - 1) / 2) * 0.05);
    const s = def.spread + (k >= def.pellets ? 0.02 : 0) + (moving && !def.steady ? 0.014 : 0);
    d.x += rand(-s, s); d.y += rand(-s, s) * 0.7; d.z += rand(-s, s); d.normalize();
    spawnPBullet(mz, d, def.speed, dmg, (def.pierce || 0) + P.pierce + wo('pierce'), blast, def.color, def.grav, { far: def.far, farMul: def.farMul, kb: def.kb, rail: !!def.pierce, shot: shotId });
  }
  GUNFX.gunKick = Math.min(0.2, GUNFX.gunKick + (def.blast ? 0.2 : def.pellets > 1 || def.pierce ? 0.12 : 0.05));
  GUNFX.flashT = def.blast ? 0.09 : 0.05;
  if (def.blast) { SCR.shake = Math.max(SCR.shake, 0.18); burst(mz.x, mz.y, mz.z, 0x9aa3ad, 6, 2, 0.8, -2); }
  else if (def.pellets > 1) SCR.shake = Math.max(SCR.shake, 0.06);
  sfx(w.id, 40);
  if (w.mag <= 0) startReload();
}

export function damagePlayer(d) {
  if (P.inv > 0 || state !== 'play') return;
  P.hp -= d; P.inv = TUNE.hitInvuln; SCR.shake = Math.max(SCR.shake, 0.22); SCR.vig = 0.9; sfx('hurt', 80);
  if (P.hp <= 0) { P.hp = 0; endRun('dead'); }
}

export function hurtEnemy(e, dmg, isCrit) {
  if (e.dead) return;
  if (e.boss && e.spawnT > 0) { burst(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z, 0xffffff, 2, 3, 0.2); return; }
  if (e.invuln) { if (!e.hinted) { e.hinted = true; toast(t('run.shielded'), 2400); } burst(e.mesh.position.x, e.mesh.position.y, e.mesh.position.z, 0x8cc8ff, 2, 4, 0.2); return; }
  if (e.stunMul) dmg *= e.stunMul;
  e.hp -= dmg; e.flash = 0.07;
  if (!e.active) { e.active = true; if (e.room >= 0) enemies.forEach(o => { if (o.room === e.room) o.active = true; }); }
  hitMark(isCrit); sfx('hit', 45);
  if (e.hp <= 0) killEnemy(e);
  else if (e.boss && !e.phased && e.hp < e.maxHp * 0.5) bossPhase(e);
}
// player explosions (rockets, chain blasts); one crit roll per explosion
export function explode(x, y, z, radius, dmg, color, big) {
  const crit = Math.random() < critChance();
  if (crit) dmg *= 2;
  if (big) {
    fireball(x, y, z, radius * 0.75, 0xff8a3d); fireball(x, y, z, radius * 0.4, 0xfff2c0);
    burst(x, y, z, 0xff6a3d, 34, 12, 0.9); burst(x, y, z, 0xffc24a, 14, 7, 0.6); burst(x, y + 0.5, z, 0x5b6470, 12, 2.5, 1.4, -3);
    sfx('bigboom', 60);
    const pd = Math.hypot(P.x - x, P.z - z);
    SCR.shake = Math.max(SCR.shake, 0.5 * clamp(1 - pd / 30, 0.25, 1));
    if (pd < radius * 0.6 && state === 'play') damagePlayer(14);
  } else {
    burst(x, y, z, color || 0xff6a3d, 22, 9, 0.7); burst(x, y, z, 0xffffff, 8, 5, 0.4);
    sfx('boom', 60); SCR.shake = Math.max(SCR.shake, 0.12);
  }
  for (const e of enemies.slice()) { // enemies spawned by this blast's kills aren't hit by it
    if (e.dead) continue;
    let dd = Infinity;
    for (const sp of spheres(e)) { const q = sp.p; dd = Math.min(dd, Math.hypot(q.x - x, (q.y - y) * 0.6, q.z - z) - sp.r * 0.5); }
    if (dd < radius) {
      const core = radius * 0.4, fall = dd <= core ? 1 : 1 - (dd - core) / (radius - core) * 0.7;
      hurtEnemy(e, dmg * fall, crit);
      if (big && !e.boss && !e.dead) { const kx = e.x - x, kz = e.z - z, kl = Math.hypot(kx, kz) || 1; moveCircle(e, kx / kl * 2.2, kz / kl * 2.2, e.r); e.flash = 0.2; }
    }
  }
}
// bomber blast: hurts the player and any enemy caught in it
export function bomberBlast(x, y, z, dmg) {
  burst(x, y, z, 0xffb13d, 26, 10, 0.7); burst(x, y, z, 0xffffff, 8, 5, 0.3); fireball(x, y, z, 3, 0xff8a3d);
  sfx('boom', 40); SCR.shake = Math.max(SCR.shake, 0.2);
  if (Math.hypot(P.x - x, P.z - z) < 3.4 && Math.abs(P.fy + 1 - y) < 2.5) damagePlayer(dmg);
  for (const o of enemies.slice()) if (!o.dead && !o.boss && Math.hypot(o.x - x, o.z - z) < 3.2) hurtEnemy(o, 35, false);
}
export function detonate(e) { e.detonated = true; killEnemy(e, true); bomberBlast(e.x, e.mesh.position.y, e.z, e.dmg); }
export let inChainBlast = false;
export function killEnemy(e, noReward) {
  e.dead = true;
  if (!noReward) run.kills++;
  const pos = e.mesh.position;
  burst(pos.x, pos.y, pos.z, e.boss ? 0xff4d8d : e.def.color, e.boss ? 60 : 14, e.boss ? 14 : 8, e.boss ? 1.4 : 0.7);
  removeEnemyMesh(e); sfx('kill', 30);
  if (e.boss) { bossDown(e); return; }
  if (e.def.bomber && !e.detonated) { e.detonated = true; bomberBlast(e.x, pos.y, e.z, e.dmg * 0.6); }
  if (!noReward) {
    dropBits(e.x, e.z, e.def.bits * 0.6 * (1 + prog(run.stage) * 0.05));
    if (Math.random() < TUNE.kitDropChance) addPickup('kit', e.x + rand(-0.5, 0.5), e.z + rand(-0.5, 0.5));
    const lh = P.leech + 2 * wo('leech'); if (lh) P.hp = Math.min(P.maxHp, P.hp + lh);
    // chain blast: only enemies you killed explode; kills caused by a chain blast don't set off another one
    if (P.chain && !inChainBlast) {
      inChainBlast = true;
      // damage grows with depth at the same rate as enemy health, so the chip stays useful deep down
      const depthScale = Math.pow(DEPTH_HP_GROWTH, prog(run.stage) / 5);
      explode(pos.x, pos.y, pos.z, 2.5 + P.chain * 0.5, 18 * P.chain * P.dmgMul * depthScale, 0xffc24a);
      inChainBlast = false;
    }
  }
  // splitter: the halves appear after any blast from this kill, so they aren't wiped out by it
  if (e.def.split) {
    for (let k = 0; k < 2; k++) {
      const m = spawnEnemy('mini', e.x + (k ? 0.6 : -0.6), e.z + rand(-0.4, 0.4), e.room, diffOf(run.stage)); m.active = true;
    }
    if (e.room >= 0) roomCount[e.room] += 2;
  }
  if (e.room >= 0 && --roomCount[e.room] === 0) roomCleared(e.room);
}
export function roomCleared(idx) {
  const [x, z] = roomSpot(rooms[idx]);
  if (Math.random() < TUNE.chipChance) { addPickup('chip', x, z); toast(t('run.clearedChip')); }
  else { addPickup('kit', x - 0.8, z); dropBits(x + 0.8, z, 6 + prog(run.stage)); toast(t('run.cleared')); }
}
