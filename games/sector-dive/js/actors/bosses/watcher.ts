import * as THREE from 'three';
import { t } from '../../../../../engine/core/i18n.ts';
import { sfx } from '../../../../../engine/audio/audio.ts';
import { blocked } from '../../../../../engine/world/tiles.ts';
import { toast } from '../../../../../engine/ui/ui.ts';
import { BOSS_META } from '../../data/bosses.ts';
import { randomTileIn, rooms } from '../../world/level.ts';
import { fanAt, ring, shootAngle, spawnEnemy } from '../../world/entities.ts';
import { P, diffOf, run } from '../player.ts';
import { bossBase, bossDiff } from './common.ts';
// WATCHER: rings, aimed fans and a spiral; summons drones at 75% and 40% health

export function spawnWatcher() {
  const bd = bossDiff();
  const g = new THREE.Group(), geo = new THREE.IcosahedronGeometry(2.1, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0x0f151c, emissive: 0x54e8ff, emissiveIntensity: 0.3 });
  g.add(new THREE.Mesh(geo, mat), new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x54e8ff })));
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff4d8d })); eye.position.z = 1.75; g.add(eye);
  bossBase('watcher', g, mat, updWatcher);
  toast(t('boss.watcherHint'), 3800);
}
export function updWatcher(e, dt) {
  const K = BOSS_META.watcher.tune;
  e.t += dt; e.timer -= dt; e.pt += dt;
  const enr = e.hp < e.maxHp * 0.5;
  e.x = e.cx + Math.sin(e.t * 0.35) * 7; e.z = e.cz + Math.sin(e.t * 0.22) * 5 - 3;
  e.mesh.position.set(e.x, e.y + Math.sin(e.t * 1.6) * 0.4, e.z);
  e.mesh.lookAt(P.x, 1.6, P.z);
  // drone waves: [health share at which it triggers, drones]
  const waves = K.drones;
  e.summoned = e.summoned || 0;
  if (e.summoned < waves.length && e.hp < e.maxHp * waves[e.summoned][0]) {
    const n = waves[e.summoned++][1];
    for (let k = 0; k < n; k++) {
      let x = e.x + Math.cos(k * 2.1) * 4, z = e.z + Math.sin(k * 2.1) * 4;
      if (blocked(x, z, 0.6)) [x, z] = randomTileIn(rooms[0]);
      spawnEnemy('drone', x, z, -1, diffOf(run.stage)).active = true;
    }
    toast(t('boss.watcherDrones'));
  }
  if (e.timer <= 0) { e.pat = e.patIdx++ % 3; e.pt = 0; e.shots = 0; e.acc = 0; e.timer = K.patTime[e.pat] * (enr ? K.enrTime : 1); }
  const y = 1.3;
  if (e.pat === 0) {
    if (e.shots < K.ringShots && e.pt > 0.3 + e.shots * K.ringGap) { ring(e.x, e.z, y, enr ? K.ringNEnr : K.ringN, K.ringSpeed, e.shots * 0.15 + e.t, e.dmg, 0xff4d8d); e.shots++; }
  } else if (e.pat === 1) {
    if (e.shots < (enr ? K.fanShotsEnr : K.fanShots) && e.pt > 0.3 + e.shots * K.fanGap) { fanAt(e.x, e.mesh.position.y, e.z, K.fanN, K.fanSpread, K.fanSpeed, e.dmg, 0xffc24a); e.shots++; }
  } else if (e.pat === 2 && e.pt < K.spiralTime) {
    e.acc += dt;
    const arms = enr ? K.spiralArmsEnr : K.spiralArms;
    while (e.acc > K.spiralGap) {
      e.acc -= K.spiralGap;
      for (let k = 0; k < arms; k++) shootAngle(e.x, y, e.z, e.t * 2.2 + k * Math.PI * 2 / arms, K.spiralSpeed, e.dmg, 0x54e8ff);
      sfx('eshot', 90);
    }
  }
}
