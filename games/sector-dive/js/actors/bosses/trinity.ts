import type { Boss } from '../../data/types.ts';
import * as THREE from 'three';
import { randi } from '../../../../../engine/core/util.ts';
import { t } from '../../../../../engine/core/i18n.ts';
import { sfx } from '../../../../../engine/audio/audio.ts';
import { dynGroup } from '../../../../../engine/render/render.ts';
import { toast } from '../../../../../engine/ui/ui.ts';
import { BOSS_META } from '../../data/bosses.ts';
import { fanAt, ring } from '../../world/entities.ts';
import { P, damagePlayer } from '../player.ts';
import { bossBase } from './common.ts';
import { COLOR } from '../../data/colors.ts';
// TRINITY: three bodies orbiting the centre on one shared health pool

// ---- TRINITY: three bodies orbiting the centre on one shared health pool ----
// bodies: the three orbiting meshes; fireK / fireT: fan fire counter and timer; ringT / ramT: ring and lunge timers; ram: the lunge in progress
export type Ram = { k: number; t: number; dur: number; tx: number; tz: number; hit: boolean };
export type TrinityBoss = Boss & {
  bodies: THREE.Object3D[];
  fireK: number;
  fireT: number;
  ringT: number;
  ramT: number;
  ram: Ram | null;
};
export function spawnTrinity() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x160a12, emissive: COLOR.mag, emissiveIntensity: 0.3 });
  const geo = new THREE.OctahedronGeometry(1.2, 0),
    cols = [COLOR.mag, COLOR.amber, COLOR.cyan];
  const bodies = cols.map(c => {
    const b = new THREE.Group();
    b.add(
      new THREE.Mesh(geo, mat),
      new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: c })),
    );
    dynGroup.add(b);
    return b;
  });
  const K = BOSS_META.trinity.tune;
  const e = bossBase('trinity', g, mat, updTrinity, {
    bodies,
    fireK: 0,
    fireT: K.firstFire,
    ringT: K.firstRing,
    ramT: K.firstRam,
    ram: null,
  });
  e.x = e.cx;
  e.z = e.cz;
  e.extra = bodies;
  e.parts = bodies.map(b => ({ p: b.position, r: 1.4 }));
  updTrinity(e, 0);
  toast(t('boss.trinityHint'), 3800);
}
export function updTrinity(e: TrinityBoss, dt: number) {
  const K = BOSS_META.trinity.tune;
  e.t += dt;
  const enr = e.hp < e.maxHp * 0.5,
    R = enr ? K.orbitREnr : K.orbitR,
    a0 = e.t * (enr ? K.orbitSpeedEnr : K.orbitSpeed),
    cols = [COLOR.mag, COLOR.amber, COLOR.cyan];
  e.bodies.forEach((b, k) => {
    let x = e.cx + Math.cos(a0 + (k * Math.PI * 2) / 3) * R,
      z = e.cz + Math.sin(a0 + (k * Math.PI * 2) / 3) * R,
      y = 2.2 + Math.sin(e.t * 2 + k) * 0.4;
    if (e.ram && e.ram.k === k) {
      // enraged: one body lunges at where you stood, then returns
      const r = e.ram,
        u = r.t / r.dur,
        f = u < 0.5 ? u * 2 : 2 - u * 2;
      x += (r.tx - x) * f;
      z += (r.tz - z) * f;
      y += (1.2 - y) * f;
      if (!r.hit && Math.hypot(P.x - x, P.z - z) < 1.8) {
        r.hit = true;
        damagePlayer(e.dmg * K.ramDmg, { x, z });
      }
    }
    b.position.set(x, y, z);
    b.rotation.y += dt * (1.5 + k);
  });
  e.fireT -= dt;
  if (e.fireT <= 0) {
    const k = e.fireK++ % 3,
      b = e.bodies[k].position;
    fanAt(b.x, b.y, b.z, K.fan[0], K.fan[1], K.fan[2], e.dmg, cols[k]);
    e.fireT = enr ? K.fireEnr : K.fire;
  }
  e.ringT -= dt;
  if (e.ringT <= 0) {
    e.bodies.forEach((b, k) =>
      ring(b.position.x, b.position.z, 1.3, K.ring[0], K.ring[1], k * 0.3 + e.t, e.dmg, COLOR.violet),
    );
    e.ringT = enr ? K.ringEveryEnr : K.ringEvery;
  }
  if (enr) {
    if (e.ram) {
      e.ram.t += dt;
      if (e.ram.t >= e.ram.dur) e.ram = null;
    } else if ((e.ramT -= dt) <= 0) {
      e.ram = { k: randi(0, 2), t: 0, dur: K.ramDur, tx: P.x, tz: P.z, hit: false };
      e.ramT = K.ramEvery;
      sfx('dash');
    }
  }
  e.mesh.position.set(e.cx, 2.2, e.cz);
}
