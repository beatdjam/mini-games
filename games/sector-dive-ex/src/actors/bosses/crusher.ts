import { crusherLook } from '../../world/models/bossLooks.ts';
import { plainLooks } from '../../world/looks.ts';
import type { Boss } from '../../data/types.ts';
import * as THREE from 'three';
import { clamp } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { sfx } from '@engine/audio/audio.ts';
import { burst } from '@engine/render/fx.ts';
import { moveCircle } from '@engine/world/tiles.ts';
import { toast } from '@engine/ui/ui.ts';
import { query } from '@engine/core/world.ts';
import { BOSS_META } from '../../data/bosses.ts';
import { fanAt, shootHoming, spawnWave } from '../../world/entities.ts';
import { player } from '../player.ts';
import { damagePlayer } from '../combat.ts';
import { bossBase, bossMaterial, isEnraged, wireOutline } from './common.ts';
import { screenFx } from '../../ui/hud.ts';
import { COLOR } from '../../data/colors.ts';
// CRUSHER: charges (stuns itself on walls), jump-slam shockwaves, homing volleys; it fires fans as it walks between them.
// Enraged, a charge that ends is followed by a second one, and only that one ends in the stun

const AFTER_STUN_WAIT = 1.0; // idle wait after a stun ends when it doesn't go straight into a slam (s)

const FIRE_Y = 2.4; // the walking fans leave from this height (the launchers on its shoulders) (m)

// st: state machine; cdx / cdz: charge direction; hitP: the charge has hit the player; second: delay of the enraged second wave
// fireT: time to the next fan while it walks; chained: this charge is the second of an enraged pair
type CrusherBoss = Boss & {
  st: string;
  cdx: number;
  cdz: number;
  hitP: boolean;
  second: number;
  fireT: number;
  chained: boolean;
};
export function spawnCrusher() {
  const g = new THREE.Group(),
    geo = new THREE.BoxGeometry(3.2, 3.2, 3.2);
  const mat = bossMaterial(0x1c0f09, COLOR.orange);
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.5, 0.2),
    new THREE.MeshBasicMaterial({ color: COLOR.amber }),
  );
  plate.position.set(0, 0.5, 1.65);
  if (plainLooks()) g.add(new THREE.Mesh(geo, mat), wireOutline(geo, COLOR.orange), plate);
  else g.add(crusherLook(mat));
  const e = bossBase('crusher', g, mat, updCrusher, {
    st: 'idle',
    cdx: 0,
    cdz: 0,
    hitP: false,
    second: 0,
    fireT: BOSS_META.crusher.tune.walkFireFirst,
    chained: false,
  });
  e.timer = 2;
  toast(t('boss.crusherHint'), 4200);
}
function updCrusher(e: CrusherBoss, dt: number) {
  const K = BOSS_META.crusher.tune;
  e.t += dt;
  e.timer -= dt;
  const enr = isEnraged(e),
    dx = player.x - e.x,
    dz = player.z - e.z,
    d = Math.hypot(dx, dz) || 1;
  let y = 1.6;
  if (e.st === 'idle') {
    moveCircle(e, (dx / d) * K.walk * dt, (dz / d) * K.walk * dt, 1.8);
    e.mesh.rotation.y = Math.atan2(dx, dz);
    // it shoots as it walks, so the time between its attacks isn't free and keeping away from it isn't safe.
    // Not while a shockwave is spreading: a wave and a fan to dodge at once is more than two dashes can answer
    if (!query('wave').some(w => !w.dead)) e.fireT -= dt;
    if (e.fireT <= 0) {
      fanAt(e.x, FIRE_Y, e.z, K.walkFan[0], K.walkFan[1], K.walkFan[2], e.dmg, COLOR.fire);
      e.fireT = enr ? K.walkFireEnr : K.walkFire;
    }
    if (e.timer <= 0) {
      e.fireT = K.walkFireFirst;
      const r = Math.random();
      if (r < K.pick[0]) {
        e.st = 'tele';
        e.timer = enr ? K.teleEnr : K.tele;
      } else if (r < K.pick[1]) {
        e.st = 'slam';
        e.timer = K.slamTime;
      } else {
        e.st = 'volley';
        e.timer = K.volleyTele;
      }
    }
  } else if (e.st === 'tele') {
    e.mesh.rotation.y = Math.atan2(dx, dz);
    e.cdx = dx / d;
    e.cdz = dz / d;
    e.flash = Math.sin(e.t * 40) > 0 ? 0.03 : 0;
    y += Math.sin(e.t * 50) * 0.05;
    if (e.timer <= 0) {
      e.st = 'charge';
      e.timer = K.chargeTime;
      e.hitP = false;
    }
  } else if (e.st === 'charge') {
    const hit = moveCircle(e, e.cdx * K.chargeSpeed * dt, e.cdz * K.chargeSpeed * dt, 1.8);
    burst(e.x - e.cdx * 1.6, 0.3, e.z - e.cdz * 1.6, COLOR.orange, 1, 3, 0.3);
    if (!e.hitP && d < K.chargeHitR) {
      e.hitP = true;
      damagePlayer(e.dmg * K.chargeDmg, e);
      moveCircle(player, e.cdx * K.chargeKnock, e.cdz * K.chargeKnock, player.r);
    }
    if ((hit || e.timer <= 0) && enr && !e.chained) {
      // enraged: the first charge only shakes the room; it turns round and charges again
      e.chained = true;
      e.st = 'tele';
      e.timer = K.chainTele;
      screenFx.shake = Math.max(screenFx.shake, 0.25);
      sfx('boom');
    } else if (hit || e.timer <= 0) {
      e.chained = false;
      e.st = 'stun';
      e.timer = K.stun;
      e.stunMul = K.stunMul;
      screenFx.shake = Math.max(screenFx.shake, 0.35);
      sfx('boom');
      spawnWave(e.x, e.z, K.hitWave[0], K.hitWave[1], e.dmg * K.hitWave[2], COLOR.orange);
      toast(t('boss.crusherStun'), 1400);
    }
  } else if (e.st === 'stun') {
    y += Math.sin(e.t * 30) * 0.08;
    if (e.timer <= 0) {
      e.stunMul = 0;
      const slam = enr && Math.random() < 0.5;
      e.st = slam ? 'slam' : 'idle';
      e.timer = slam ? K.slamTime : AFTER_STUN_WAIT;
    }
  } else if (e.st === 'slam') {
    const jt = 1 - e.timer / K.slamTime;
    y += Math.sin(Math.PI * clamp(jt, 0, 1)) * K.jump;
    moveCircle(e, (dx / d) * K.slamMove * dt, (dz / d) * K.slamMove * dt, 1.8);
    if (e.timer <= 0) {
      screenFx.shake = Math.max(screenFx.shake, 0.4);
      sfx('boom');
      spawnWave(e.x, e.z, K.slamWave[0], K.slamWave[1], e.dmg * K.slamWave[2], COLOR.amber);
      if (enr) e.second = K.secondDelay;
      e.st = 'idle';
      e.timer = K.afterSlam;
    }
  } else if (e.st === 'volley') {
    if (e.timer <= 0) {
      const n = enr ? K.volleyNEnr : K.volleyN;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        shootHoming(e.x, 3.4, e.z, a, K.volleySpeed, e.dmg, COLOR.fire, { reach: 2, rise: 2, homing: 2.6 });
      }
      sfx('eshot');
      e.st = 'idle';
      e.timer = K.afterVolley;
    }
  }
  if (e.second > 0) {
    e.second -= dt;
    if (e.second <= 0) spawnWave(e.x, e.z, K.secondWave[0], K.secondWave[1], e.dmg * K.secondWave[2], COLOR.amber);
  }
  e.mesh.position.set(e.x, y, e.z);
}
