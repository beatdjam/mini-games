import { trinityBodyLook } from '../../world/models/bossLooks.ts';
import { plainLooks } from '../../world/looks.ts';
import type { Boss } from '../../data/types.ts';
import * as THREE from 'three';
import { distXZ, randi } from '@engine/core/util.ts';
import { ringAngles } from '@engine/world/projectiles.ts';
import { sfx } from '@engine/audio/audio.ts';
import { dynGroup } from '@engine/render/render.ts';
import { BOSS_META } from '../../data/bosses.ts';
import { fanAt, ring } from '../../world/entities.ts';
import { player } from '../player.ts';
import { damagePlayer } from '../combat.ts';
import { bossMaterial, createBoss, isEnraged, RING_Y, wireOutline } from './common.ts';
import type { BossVisual } from './common.ts';
import { COLOR } from '../../data/colors.ts';
// TRINITY: three bodies orbiting the centre on one shared health pool

// bodies: the three orbiting meshes; fireK / fireT: fan fire counter and timer; ringT / ramT: ring and lunge timers; ram: the lunge in progress
type Ram = { k: number; t: number; dur: number; tx: number; tz: number; hit: boolean };
type TrinityBoss = Boss & {
  bodies: THREE.Object3D[];
  fireK: number;
  fireT: number;
  ringT: number;
  ramT: number;
  ram: Ram | null;
};
// how TRINITY looks (common.ts BossVisual): its three bodies, each a mesh of its own (they fly apart); the boss's own
// mesh is an empty group
export function trinityVisual(): BossVisual & { bodies: THREE.Group[] } {
  const g = new THREE.Group();
  const mat = bossMaterial(0x160a12, COLOR.mag);
  const geo = new THREE.OctahedronGeometry(1.2, 0),
    cols = [COLOR.mag, COLOR.amber, COLOR.cyan];
  const bodies = cols.map(c => {
    const b = plainLooks() ? new THREE.Group() : trinityBodyLook(mat, c);
    if (plainLooks()) b.add(new THREE.Mesh(geo, mat), wireOutline(geo, c));
    return b;
  });
  return { mesh: g, mat, bodies };
}
export function spawnTrinity() {
  const look = trinityVisual(),
    bodies = look.bodies;
  bodies.forEach(b => dynGroup.add(b));
  const K = BOSS_META.trinity.tune;
  const e = createBoss({
    kind: 'trinity',
    look,
    behave: updTrinity,
    state: {
      bodies,
      fireK: 0,
      fireT: K.firstFire,
      ringT: K.firstRing,
      ramT: K.firstRam,
      ram: null,
    },
    centred: true,
    extra: bodies, // (after its pool of light, when it has a look)
    hint: ['boss.trinityHint', 3800],
  });
  e.parts = bodies.map(b => ({ p: b.position, r: 1.4 }));
  updTrinity(e, 0);
}
function updTrinity(e: TrinityBoss, dt: number) {
  const K = BOSS_META.trinity.tune;
  e.t += dt;
  const enr = isEnraged(e),
    R = enr ? K.orbitREnr : K.orbitR,
    a0 = e.t * (enr ? K.orbitSpeedEnr : K.orbitSpeed),
    cols = [COLOR.mag, COLOR.amber, COLOR.cyan],
    angles = ringAngles(e.bodies.length, a0);
  e.bodies.forEach((b, k) => {
    let x = e.cx + Math.cos(angles[k]) * R,
      z = e.cz + Math.sin(angles[k]) * R,
      y = 2.2 + Math.sin(e.t * 2 + k) * 0.4;
    if (e.ram && e.ram.k === k) {
      // enraged: one body lunges at where you stood, then returns
      const r = e.ram,
        u = r.t / r.dur,
        f = u < 0.5 ? u * 2 : 2 - u * 2;
      x += (r.tx - x) * f;
      z += (r.tz - z) * f;
      y += (1.2 - y) * f;
      const at = { x, z };
      if (!r.hit && distXZ(player, at) < 1.8) {
        r.hit = true;
        damagePlayer(e.dmg * K.ramDmg, at);
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
      ring(b.position.x, RING_Y, b.position.z, K.ring[0], K.ring[1], k * 0.3 + e.t, e.dmg, COLOR.violet),
    );
    e.ringT = enr ? K.ringEveryEnr : K.ringEvery;
  }
  if (enr) {
    if (e.ram) {
      e.ram.t += dt;
      if (e.ram.t >= e.ram.dur) e.ram = null;
    } else if ((e.ramT -= dt) <= 0) {
      e.ram = { k: randi(0, 2), t: 0, dur: K.ramDur, tx: player.x, tz: player.z, hit: false };
      e.ramT = K.ramEvery;
      sfx('dash');
    }
  }
  e.mesh.position.set(e.cx, 2.2, e.cz);
}
