import type * as THREE from 'three';
import type { EBullet, Enemy, PBullet } from '../data/types.ts';
import { sfx } from '../../../../engine/audio/audio.ts';
import { basicMat } from '../../../../engine/render/render.ts';
import { burst } from '../../../../engine/render/fx.ts';
import { floorY, moveCircle } from '../../../../engine/world/tiles.ts';
import { projHitsTerrain, steerToward, stepProjectile } from '../../../../engine/world/projectiles.ts';
import { WALL_H } from '../data/level.ts';
import { eBullets, enemies, isShielded, pBullets } from '../world/entities.ts';
import { CRIT_MUL, P, critChance, damagePlayer, explode, hurtEnemy, spheres } from './player.ts';
import { hitMark } from '../ui/hud.ts';
import { COLOR } from '../data/colors.ts';
// ---- tuning numbers used only here ----
const PBULLET_STEP = 0.6; // player bullets move in sub-steps of at most this (m)
const EBULLET_STEP = 0.5; // enemy bullets: the same
const TERRAIN_ABOVE_WALL = 3; // player bullets fly this far above the wall top before they are dropped (m)
const PBULLET_TERRAIN_PAD = 0.03,
  EBULLET_TERRAIN_PAD = 0.05; // terrain hit tolerance (m)
const SMOKE_ORANGE = 0.35; // share of rocket trail puffs that are fiery (the rest grey)
const BLAST_TOUCH_PAD = 0.2,
  SHOT_TOUCH_PAD = 0.05; // added to an enemy's hit radius: rockets, other rounds (m)
const SHIELD_FRONT_DOT = 0.3; // a round counts as from the front above this (cosine of the angle off the facing)
const SHIELD_BREAK_STUN = 1.0; // seconds an enemy staggers when its shield breaks
const SHIELD_BREAK_FLASH = 0.25; // seconds it flashes
const SHIELD_CRACK_AT = 0.5; // the shield looks cracked below this share of its health
const EBULLET_HIT_R = 0.42,
  EBULLET_HIT_R_PER_SIZE = 0.2; // enemy round hit radius: base + per size (m)
const PLAYER_HEIGHT = 2.1; // enemy rounds hit the player between the feet and this height (m)
const HOMING_AIM_Y = 1.2; // homing rounds aim this high above the player's feet (m)
const HOMING_TURN = 2.2; // homing turn rate (rad/s)
// ================= bullets (per frame) =================
// What bullets do each frame. Moving in sub-steps, terrain hits and homing are engine/world/projectiles.js;
// hits on enemies (shields, pierce, crits, blasts) and on the player are here. Fields are set in js/world/entities.js.

export function updatePBullets(dt: number) {
  for (const b of pBullets) {
    if (!b.alive) continue;
    b.life -= dt;
    const dead = b.life <= 0 || stepProjectile(b, dt, PBULLET_STEP, pBulletStep);
    if (dead) {
      b.alive = false;
      b.mesh.visible = false;
      continue;
    }
    b.mesh.position.set(b.x, b.y, b.z);
    if (b.blast) {
      // rocket: face the flight direction and leave a smoke trail
      b.mesh.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
      const smoke = Math.random() < SMOKE_ORANGE ? COLOR.orange : 0x6b7480;
      burst(b.x - b.vx * 0.02, b.y, b.z - b.vz * 0.02, smoke, 1, 0.6, 0.7, -1.5);
    }
  }
}
// one sub-step of a player bullet: true = it is used up
export function pBulletStep(b: PBullet) {
  if (hitsTerrain(b)) {
    if (b.blast) explode(b.x, Math.max(floorY(b.x, b.z) + 0.4, b.y), b.z, b.blast, b.dmg, b.color, true);
    else burst(b.x, b.y, b.z, b.color, 3, 4, 0.3);
    return true;
  }
  for (const e of enemies) {
    if (e.dead || b.hit.has(e) || !bulletTouches(b, e)) continue;
    b.hit.add(e);
    if (b.blast) {
      explode(b.x, b.y, b.z, b.blast, b.dmg, b.color, true);
      return true;
    }
    if (shieldBlocks(b, e)) return true;
    damageFromBullet(b, e);
    if (--b.pierce < 0) return true;
  }
  return false;
}

export function hitsTerrain(b: PBullet) {
  return projHitsTerrain(b, WALL_H + TERRAIN_ABOVE_WALL, PBULLET_TERRAIN_PAD);
}

export function bulletTouches(b: PBullet, e: Enemy) {
  const pad = b.blast ? BLAST_TOUCH_PAD : SHOT_TOUCH_PAD;
  for (const sp of spheres(e)) {
    const q = sp.p,
      dx = b.x - q.x,
      dy = b.y - q.y,
      dz = b.z - q.z,
      hr = sp.r + pad;
    if (dx * dx + dy * dy + dz * dz < hr * hr) return true;
  }
  return false;
}

// Shield enemies stop rounds arriving from the front (the rail gun punches through).
// Each blocked round wears the shield down; at 0 it breaks and the enemy staggers.
export function shieldBlocks(b: PBullet, e: Enemy) {
  if (!isShielded(e) || e.shieldHp <= 0 || b.rail) return false;
  const fx = Math.sin(e.mesh.rotation.y),
    fz = Math.cos(e.mesh.rotation.y);
  const ox = b.x - e.x,
    oz = b.z - e.z,
    ol = Math.hypot(ox, oz) || 1;
  if ((ox * fx + oz * fz) / ol <= SHIELD_FRONT_DOT) return false; // came from the side or behind
  e.shieldHp -= b.dmg;
  burst(b.x, b.y, b.z, COLOR.shield, 4, 5, 0.25);
  hitMark(false);
  if (e.shieldHp <= 0) {
    e.shieldParts.forEach((o: THREE.Object3D) => e.mesh.remove(o));
    e.stun = SHIELD_BREAK_STUN;
    e.flash = SHIELD_BREAK_FLASH;
    burst(b.x, b.y, b.z, COLOR.shield, 22, 8, 0.6);
    sfx('boom', 60);
  } else {
    sfx('empty', 60);
    if (e.shieldHp < e.def.shieldHp * SHIELD_CRACK_AT) e.shieldParts[0].material = basicMat(0x5b3a3a); // cracked
  }
  return true;
}

// Crits, rail range bonus, knockback.
export function damageFromBullet(b: PBullet, e: Enemy) {
  const crit = Math.random() < critChance();
  let dmg = b.dmg * (crit ? CRIT_MUL : 1);
  if (b.far && Math.hypot(b.x - b.ox, b.z - b.oz) > b.far) dmg *= b.farMul;
  hurtEnemy(e, dmg, crit);
  if (b.kb && !e.boss && !e.dead && e.kbShot !== b.shot) {
    // once per shot, however many pellets hit
    e.kbShot = b.shot;
    const kx = e.x - P.x,
      kz = e.z - P.z,
      kl = Math.hypot(kx, kz) || 1;
    moveCircle(e, (kx / kl) * b.kb, (kz / kl) * b.kb, e.r);
    e.fy = floorY(e.x, e.z);
  }
  burst(b.x, b.y, b.z, b.color, 2, 3, 0.25);
}

export function updateEBullets(dt: number) {
  for (const b of eBullets) {
    if (!b.alive) continue;
    b.life -= dt;
    if (b.homing > 0) steerHoming(b, dt);
    const hitR = EBULLET_HIT_R + EBULLET_HIT_R_PER_SIZE * b.size;
    const gone = stepProjectile(
      b,
      dt,
      EBULLET_STEP,
      b => {
        if (b.life <= 0 || projHitsTerrain(b, Infinity, EBULLET_TERRAIN_PAD)) {
          burst(b.x, Math.max(0.1, b.y), b.z, COLOR.mag, 2, 3, 0.2);
          return true;
        }
        const dx = b.x - P.x,
          dz = b.z - P.z;
        const touchesPlayer = dx * dx + dz * dz < hitR * hitR && b.y > P.fy && b.y < P.fy + PLAYER_HEIGHT;
        if (touchesPlayer && P.inv <= 0) {
          damagePlayer(b.dmg, { x: b.ox, z: b.oz });
          return true;
        }
        return false;
      },
      b.speed,
    );
    if (gone) {
      b.alive = false;
      b.mesh.visible = false;
      continue;
    }
    b.mesh.position.set(b.x, b.y, b.z);
  }
}

// homing rounds turn toward the player's chest while b.homing lasts
export function steerHoming(b: EBullet, dt: number) {
  b.homing -= dt;
  steerToward(b, P.x, P.fy + HOMING_AIM_Y, P.z, dt, HOMING_TURN);
}
