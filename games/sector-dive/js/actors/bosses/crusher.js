import * as THREE from 'three';
import { clamp } from '../../../../../engine/core/util.js';
import { t } from '../../../../../engine/core/i18n.js';
import { sfx } from '../../../../../engine/audio/audio.js';
import { burst } from '../../../../../engine/render/fx.js';
import { moveCircle } from '../../../../../engine/world/tiles.js';
import { toast } from '../../../../../engine/ui/ui.js';
import { BOSS_META } from '../../data/bosses.js';
import { spawnEBullet, spawnWave } from '../../world/entities.js';
import { P, damagePlayer } from '../player.js';
import { bossBase, bossDiff } from './common.js';
import { SCR } from '../../ui/hud.js';
// CRUSHER: charges (stuns itself on walls), jump-slam shockwaves, homing volleys

export function spawnCrusher() {
  const bd = bossDiff();
  const g = new THREE.Group(), geo = new THREE.BoxGeometry(3.2, 3.2, 3.2);
  const mat = new THREE.MeshLambertMaterial({ color: 0x1c0f09, emissive: 0xff8a3d, emissiveIntensity: 0.3 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 0.2), new THREE.MeshBasicMaterial({ color: 0xffc24a })); plate.position.set(0, 0.5, 1.65);
  g.add(new THREE.Mesh(geo, mat), new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xff8a3d })), plate);
  const e = bossBase('crusher', g, mat, updCrusher);
  e.st = 'idle'; e.timer = 2;
  toast(t('boss.crusherHint'), 4200);
}
export function updCrusher(e, dt) {
  const K = BOSS_META.crusher.tune;
  e.t += dt; e.timer -= dt;
  const enr = e.hp < e.maxHp * 0.5, dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz) || 1;
  let y = 1.6;
  if (e.st === 'idle') {
    moveCircle(e, dx / d * K.walk * dt, dz / d * K.walk * dt, 1.8);
    e.mesh.rotation.y = Math.atan2(dx, dz);
    if (e.timer <= 0) {
      const r = Math.random();
      if (r < K.pick[0]) { e.st = 'tele'; e.timer = enr ? K.teleEnr : K.tele; }
      else if (r < K.pick[1]) { e.st = 'slam'; e.timer = K.slamTime; }
      else { e.st = 'volley'; e.timer = K.volleyTele; }
    }
  } else if (e.st === 'tele') {
    e.mesh.rotation.y = Math.atan2(dx, dz); e.cdx = dx / d; e.cdz = dz / d;
    e.flash = Math.sin(e.t * 40) > 0 ? 0.03 : 0;
    y += Math.sin(e.t * 50) * 0.05;
    if (e.timer <= 0) { e.st = 'charge'; e.timer = K.chargeTime; e.hitP = false; }
  } else if (e.st === 'charge') {
    const hit = moveCircle(e, e.cdx * K.chargeSpeed * dt, e.cdz * K.chargeSpeed * dt, 1.8);
    burst(e.x - e.cdx * 1.6, 0.3, e.z - e.cdz * 1.6, 0xff8a3d, 1, 3, 0.3);
    if (!e.hitP && d < K.chargeHitR) { e.hitP = true; damagePlayer(e.dmg * K.chargeDmg); moveCircle(P, e.cdx * K.chargeKnock, e.cdz * K.chargeKnock, P.r); }
    if (hit || e.timer <= 0) {
      e.st = 'stun'; e.timer = K.stun; e.stunMul = K.stunMul; SCR.shake = Math.max(SCR.shake, 0.35); sfx('boom');
      spawnWave(e.x, e.z, K.hitWave[0], K.hitWave[1], e.dmg * K.hitWave[2], 0xff8a3d);
      toast(t('boss.crusherStun'), 1400);
    }
  } else if (e.st === 'stun') {
    y += Math.sin(e.t * 30) * 0.08;
    if (e.timer <= 0) { e.stunMul = 0; e.st = enr && Math.random() < 0.5 ? 'slam' : 'idle'; e.timer = 1.0; }
  } else if (e.st === 'slam') {
    const jt = 1 - e.timer;
    y += Math.sin(Math.PI * clamp(jt, 0, 1)) * K.jump;
    moveCircle(e, dx / d * K.slamMove * dt, dz / d * K.slamMove * dt, 1.8);
    if (e.timer <= 0) {
      SCR.shake = Math.max(SCR.shake, 0.4); sfx('boom');
      spawnWave(e.x, e.z, K.slamWave[0], K.slamWave[1], e.dmg * K.slamWave[2], 0xffc24a);
      if (enr) e.second = K.secondDelay;
      e.st = 'idle'; e.timer = K.afterSlam;
    }
  } else if (e.st === 'volley') {
    if (e.timer <= 0) {
      const n = enr ? K.volleyNEnr : K.volleyN;
      for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; spawnEBullet(e.x + Math.sin(a) * 2, 3.4, e.z + Math.cos(a) * 2, Math.sin(a) * K.volleySpeed, 2, Math.cos(a) * K.volleySpeed, e.dmg, 0xff6a3d, 1.3, 2.6); }
      sfx('eshot'); e.st = 'idle'; e.timer = K.afterVolley;
    }
  }
  if (e.second > 0) { e.second -= dt; if (e.second <= 0) spawnWave(e.x, e.z, K.secondWave[0], K.secondWave[1], e.dmg * K.secondWave[2], 0xffc24a); }
  e.mesh.position.set(e.x, y, e.z);
}
