import type { Boss } from '../../data/types.ts';
import * as THREE from 'three';
import { pick, rand } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { sfx } from '@engine/audio/audio.ts';
import { toast } from '@engine/ui/ui.ts';
import { BOSS_META } from '../../data/bosses.ts';
import { level } from '../../world/level.ts';
import { enemies, fanAt, ring, spawnEBullet, spawnEnemy } from '../../world/entities.ts';
import { player, damagePlayer, difficultyAt, run } from '../player.ts';
import { bossBase } from './common.ts';
import { COLOR } from '../../data/colors.ts';
// NOISE CORE: rotating beams, bullet rings, summons

// knot: the spinning mesh; beams: the three beam meshes; ba / bdir: beam angle and spin direction
export type CoreBoss = Boss & {
  knot: THREE.Mesh;
  beams: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
  ba: number;
  bdir: number;
};
export function spawnCore() {
  const g = new THREE.Group(),
    geo = new THREE.TorusKnotGeometry(1.3, 0.38, 72, 8);
  const mat = new THREE.MeshLambertMaterial({ color: 0x140c20, emissive: COLOR.violet, emissiveIntensity: 0.3 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const knot = new THREE.Mesh(geo, mat);
  g.add(knot, core);
  const beams: CoreBoss['beams'] = [];
  const e = bossBase('core', g, mat, updCore, { knot, beams, ba: 0, bdir: 1 });
  e.x = e.cx;
  e.z = e.cz;
  g.position.set(e.x, e.y, e.z);
  for (let k = 0; k < 3; k++) {
    const bg = new THREE.BoxGeometry(34, 0.45, 0.45);
    bg.translate(17, 0, 0);
    const bm = new THREE.Mesh(
      bg,
      new THREE.MeshBasicMaterial({ color: COLOR.mag, transparent: true, opacity: 0.25, depthWrite: false }),
    );
    bm.position.set(e.cx, 1.2, e.cz);
    bm.visible = false;
    level.group!.add(bm);
    e.beams.push(bm);
  }
  toast(t('boss.coreHint'), 3800);
}
export function updCore(e: CoreBoss, dt: number) {
  const K = BOSS_META.core.tune;
  e.t += dt;
  e.timer -= dt;
  e.pt += dt;
  const enr = e.hp < e.maxHp * 0.5;
  e.knot.rotation.x += dt * 0.8;
  e.knot.rotation.y += dt * (enr ? 1.6 : 1.0);
  e.mesh.position.y = e.y + Math.sin(e.t * 1.3) * 0.25;
  if (e.timer <= 0) {
    e.pat = e.patIdx++ % 3;
    e.pt = 0;
    e.shots = 0;
    e.acc = 0;
    e.timer = K.patTime[e.pat];
    if (e.pat === 0) {
      e.bdir *= -1;
      e.ba = Math.atan2(-(player.z - e.cz), player.x - e.cx) + Math.PI * 0.5;
      sfx('beam');
    }
  }
  const nb = enr ? K.beamsEnr : K.beams;
  e.beams.forEach((b, k) => {
    b.visible = e.pat === 0 && k < nb;
  });
  if (e.pat === 0) {
    const live = e.pt > K.beamWarm;
    const sp = (live ? (enr ? K.beamSpinEnr : K.beamSpin) : K.beamSpinWarm) * e.bdir;
    e.ba += sp * dt;
    const pd = Math.hypot(player.x - e.cx, player.z - e.cz),
      pa = Math.atan2(-(player.z - e.cz), player.x - e.cx);
    for (let k = 0; k < nb; k++) {
      const b = e.beams[k],
        a = e.ba + (k * Math.PI * 2) / nb;
      b.rotation.y = a;
      b.material.opacity = live ? 0.95 : 0.22 + Math.sin(e.t * 30) * 0.08;
      b.scale.set(1, live ? 1 : 0.35, live ? 1 : 0.35);
      if (live) {
        const df = Math.atan2(Math.sin(pa - a), Math.cos(pa - a));
        if (Math.cos(df) > 0 && pd * Math.abs(Math.sin(df)) < K.beamWidth)
          damagePlayer(e.dmg * K.beamDmg, { x: e.cx, z: e.cz });
      }
    }
    if (enr && live && e.pt > 2 + e.shots * K.fanGap) {
      e.shots++;
      fanAt(e.cx, 2.6, e.cz, K.fan[0], K.fan[1], K.fan[2], e.dmg, COLOR.violet);
    }
  } else if (e.pat === 1) {
    if (e.shots < K.ringShots && e.pt > 0.3 + e.shots * K.ringGap) {
      ring(e.cx, e.cz, 1.3, K.ring[0], K.ring[1], e.shots * 0.16, e.dmg, COLOR.violet);
      if (enr) ring(e.cx, e.cz, 1.3, K.ringEnr[0], K.ringEnr[1], e.shots * 0.3 + 0.1, e.dmg, COLOR.mag, 0.8);
      e.shots++;
    }
  } else if (e.pat === 2 && e.shots === 0 && e.pt > 0.3) {
    e.shots = 1;
    const minions = enemies.filter(o => !o.boss && !o.dead).length;
    const n = minions < K.minionCap ? (enr ? K.minionsEnr : K.minions) : 0;
    for (let k = 0; k < n; k++) {
      const a = rand(0, Math.PI * 2);
      spawnEnemy(
        pick(['crawler', 'crawler', 'drone']),
        e.cx + Math.cos(a) * 5,
        e.cz + Math.sin(a) * 5,
        -1,
        difficultyAt(run.stage),
      ).active = true;
    }
    for (let k = 0; k < K.burstN; k++) {
      const a = (k / K.burstN) * Math.PI * 2;
      spawnEBullet(
        e.cx + Math.sin(a) * 2,
        2.6,
        e.cz + Math.cos(a) * 2,
        Math.sin(a) * K.burstSpeed,
        0,
        Math.cos(a) * K.burstSpeed,
        e.dmg,
        COLOR.mag,
        1.3,
        3,
      );
    }
  }
}
