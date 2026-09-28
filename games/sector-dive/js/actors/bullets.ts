import type * as THREE from 'three';
import type { Enemy } from '../data/types.ts';
import type { Projectile } from '../../../../engine/world/projectiles.ts';
import { sfx } from '../../../../engine/audio/audio.ts';
import { basicMat } from '../../../../engine/render/render.ts';
import { burst } from '../../../../engine/render/fx.ts';
import { floorY, moveCircle } from '../../../../engine/world/tiles.ts';
import { projHitsTerrain, steerToward, stepProjectile } from '../../../../engine/world/projectiles.ts';
import { WALL_H } from '../data/level.ts';
import { eBullets, enemies, pBullets } from '../world/entities.ts';
import { P, critChance, damagePlayer, explode, hurtEnemy, spheres } from './player.ts';
import { hitMark } from '../ui/hud.ts';
// ================= bullets (per frame) =================
// What bullets do each frame. Moving in sub-steps, terrain hits and homing are engine/world/projectiles.js;
// hits on enemies (shields, pierce, crits, blasts) and on the player are here. Fields are set in js/world/entities.js.

export function updatePBullets(dt: number) {
  for (const b of pBullets) {
    if (!b.alive) continue;
    b.life -= dt;
    const dead = b.life <= 0 || stepProjectile(b, dt, 0.6, pBulletStep);
    if (dead) { b.alive = false; b.mesh.visible = false; continue; }
    b.mesh.position.set(b.x, b.y, b.z);
    if (b.blast) { // rocket: face the flight direction and leave a smoke trail
      b.mesh.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
      const smoke = Math.random() < 0.35 ? 0xff8a3d : 0x6b7480;
      burst(b.x - b.vx * 0.02, b.y, b.z - b.vz * 0.02, smoke, 1, 0.6, 0.7, -1.5);
    }
  }
}
// one sub-step of a player bullet: true = it is used up
export function pBulletStep(b: Projectile) {
  if (hitsTerrain(b)) {
    if (b.blast) explode(b.x, Math.max(floorY(b.x, b.z) + 0.4, b.y), b.z, b.blast, b.dmg, b.color, true);
    else burst(b.x, b.y, b.z, b.color, 3, 4, 0.3);
    return true;
  }
  for (const e of enemies) {
    if (e.dead || b.hit.has(e) || !bulletTouches(b, e)) continue;
    b.hit.add(e);
    if (b.blast) { explode(b.x, b.y, b.z, b.blast, b.dmg, b.color, true); return true; }
    if (shieldBlocks(b, e)) return true;
    damageFromBullet(b, e);
    if (--b.pierce < 0) return true;
  }
  return false;
}

export function hitsTerrain(b: Projectile) { return projHitsTerrain(b, WALL_H + 3, 0.03); }

export function bulletTouches(b: Projectile, e: Enemy) {
  const pad = b.blast ? 0.2 : 0.05;
  for (const sp of spheres(e)) {
    const q = sp.p, dx = b.x - q.x, dy = b.y - q.y, dz = b.z - q.z, hr = sp.r + pad;
    if (dx * dx + dy * dy + dz * dz < hr * hr) return true;
  }
  return false;
}

// Shield enemies stop rounds arriving from the front (the rail gun punches through).
// Each blocked round wears the shield down; at 0 it breaks and the enemy staggers.
export function shieldBlocks(b: Projectile, e: Enemy) {
  if (!e.def.shield || e.shieldHp <= 0 || b.rail) return false;
  const fx = Math.sin(e.mesh.rotation.y), fz = Math.cos(e.mesh.rotation.y);
  const ox = b.x - e.x, oz = b.z - e.z, ol = Math.hypot(ox, oz) || 1;
  if ((ox * fx + oz * fz) / ol <= 0.3) return false; // came from the side or behind
  e.shieldHp -= b.dmg;
  burst(b.x, b.y, b.z, 0x8cc8ff, 4, 5, 0.25);
  hitMark(false);
  if (e.shieldHp <= 0) {
    e.shieldParts.forEach((o: THREE.Object3D) => e.mesh.remove(o));
    e.stun = 1.0;
    e.flash = 0.25;
    burst(b.x, b.y, b.z, 0x8cc8ff, 22, 8, 0.6);
    sfx('boom', 60);
  } else {
    sfx('empty', 60);
    if (e.shieldHp < e.def.shieldHp * 0.5) e.shieldParts[0].material = basicMat(0x5b3a3a); // cracked
  }
  return true;
}

// Crits, rail range bonus, knockback.
export function damageFromBullet(b: Projectile, e: Enemy) {
  const crit = Math.random() < critChance();
  let dmg = b.dmg * (crit ? 2 : 1);
  if (b.far && Math.hypot(b.x - b.ox, b.z - b.oz) > b.far) dmg *= b.farMul;
  hurtEnemy(e, dmg, crit);
  if (b.kb && !e.boss && !e.dead && e.kbShot !== b.shot) { // once per shot, however many pellets hit
    e.kbShot = b.shot;
    const kx = e.x - P.x, kz = e.z - P.z, kl = Math.hypot(kx, kz) || 1;
    moveCircle(e, kx / kl * b.kb, kz / kl * b.kb, e.r);
    e.fy = floorY(e.x, e.z);
  }
  burst(b.x, b.y, b.z, b.color, 2, 3, 0.25);
}

export function updateEBullets(dt: number) {
  for (const b of eBullets) {
    if (!b.alive) continue;
    b.life -= dt;
    if (b.homing > 0) steerHoming(b, dt);
    const hitR = 0.42 + 0.2 * b.size;
    const gone = stepProjectile(b, dt, 0.5, b => {
      if (b.life <= 0 || projHitsTerrain(b, Infinity, 0.05)) { burst(b.x, Math.max(0.1, b.y), b.z, 0xff4d8d, 2, 3, 0.2); return true; }
      const dx = b.x - P.x, dz = b.z - P.z;
      const touchesPlayer = dx * dx + dz * dz < hitR * hitR && b.y > P.fy && b.y < P.fy + 2.1;
      if (touchesPlayer && P.inv <= 0) { damagePlayer(b.dmg, { x: b.ox, z: b.oz }); return true; }
      return false;
    }, b.speed);
    if (gone) { b.alive = false; b.mesh.visible = false; continue; }
    b.mesh.position.set(b.x, b.y, b.z);
  }
}

// homing rounds turn toward the player's chest while b.homing lasts
export function steerHoming(b: Projectile, dt: number) {
  b.homing -= dt;
  steerToward(b, P.x, P.fy + 1.2, P.z, dt, 2.2);
}
