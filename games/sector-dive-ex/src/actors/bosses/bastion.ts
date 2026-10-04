import type { Boss, RegularEnemy } from '../../data/types.ts';
import * as THREE from 'three';
import { rand } from '@engine/core/util.ts';
import { t } from '@engine/core/i18n.ts';
import { sfx } from '@engine/audio/audio.ts';
import { toast } from '@engine/ui/ui.ts';
import { BOSS_META } from '../../data/bosses.ts';
import { ring, shootHoming } from '../../world/entities.ts';
import { ringAngles } from '@engine/world/projectiles.ts';
import { RING_Y, bossBase, bossMaterial, isEnraged, spawnMinion, wireOutline } from './common.ts';
import { COLOR } from '../../data/colors.ts';
// BASTION: shielded core; destroy every turret to open it for a few seconds

// invuln: shielded; core / shield: meshes; turrets: the shield generators still standing; openT: seconds left open; ringT: ring timer
type BastionBoss = Boss & {
  invuln: boolean;
  core: THREE.Mesh;
  shield: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  turrets: RegularEnemy[];
  openT: number;
  ringT: number;
};
export function spawnBastion() {
  const g = new THREE.Group();
  const mat = bossMaterial(0x1b1408, 0xffb347);
  const baseGeo = new THREE.CylinderGeometry(2.4, 3, 1.6, 8),
    coreGeo = new THREE.IcosahedronGeometry(1.3, 1);
  const base = new THREE.Mesh(baseGeo, mat);
  base.position.y = -1.6;
  const baseEdge = wireOutline(baseGeo, 0xffb347);
  baseEdge.position.y = -1.6;
  const core = new THREE.Mesh(coreGeo, mat);
  const shieldM = new THREE.Mesh(
    new THREE.SphereGeometry(2.6, 20, 14),
    new THREE.MeshBasicMaterial({ color: COLOR.shield, transparent: true, opacity: 0.25, depthWrite: false }),
  );
  g.add(base, baseEdge, core, shieldM);
  const e = bossBase('bastion', g, mat, updBastion, {
    core,
    shield: shieldM,
    invuln: true,
    turrets: [],
    openT: 0,
    ringT: 2.5,
  });
  e.x = e.cx;
  e.z = e.cz;
  bastionTurrets(e, BOSS_META.bastion.tune.turretsFirst);
  toast(t('boss.bastionHint'), 4600);
}
function bastionTurrets(e: BastionBoss, n: number) {
  const off = rand(0, Math.PI);
  ringAngles(n, off).forEach(a => {
    const x = e.cx + Math.cos(a) * BOSS_META.bastion.tune.turretR,
      z = e.cz + Math.sin(a) * BOSS_META.bastion.tune.turretR;
    e.turrets.push(spawnMinion('bturret', x, z));
  });
}
function updBastion(e: BastionBoss, dt: number) {
  const K = BOSS_META.bastion.tune;
  e.t += dt;
  const enr = isEnraged(e);
  e.core.rotation.y += dt * (e.invuln ? 0.6 : 2.5);
  e.core.rotation.x += dt * 0.4;
  e.shield.visible = e.invuln;
  e.shield.material.opacity = 0.2 + Math.sin(e.t * 4) * 0.06;
  e.turrets = e.turrets.filter(turret => !turret.dead);
  if (e.invuln && !e.turrets.length) {
    e.invuln = false;
    e.openT = K.open;
    e.stunMul = K.openMul;
    toast(t('boss.bastionOpen'), 2400);
    sfx('chip');
  }
  if (!e.invuln) {
    e.openT -= dt;
    if (e.openT <= 0) {
      e.invuln = true;
      e.stunMul = 0;
      e.hinted = true;
      bastionTurrets(e, enr ? K.turretsEnr : K.turrets);
      toast(t('boss.bastionClose'), 2200);
    }
  }
  e.ringT -= dt;
  if (e.ringT <= 0) {
    ring(
      e.cx,
      RING_Y,
      e.cz,
      e.invuln ? K.ring[0] : K.ringOpen[0],
      e.invuln ? K.ring[1] : K.ringOpen[1],
      e.t,
      e.dmg,
      0xffb347,
    );
    if (enr)
      for (let k = 0; k < K.enrShots; k++) {
        const a = rand(0, Math.PI * 2);
        shootHoming(e.cx, 2.6, e.cz, a, K.enrSpeed, e.dmg, COLOR.mag, { reach: 2.5, rise: 1, homing: 3 });
      }
    e.ringT = e.invuln ? K.ringEvery : K.ringEveryOpen;
  }
  e.mesh.position.set(e.cx, e.y, e.cz);
}
