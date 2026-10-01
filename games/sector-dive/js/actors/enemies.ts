import type { Enemy } from '../data/types.ts';
import { clamp, rand } from '../../../../engine/core/util.ts';
import { sfx } from '../../../../engine/audio/audio.ts';
import { flowAt, hasLOS } from '../../../../engine/world/tiles.ts';
import { steerChase } from '../../../../engine/world/steer.ts';
import { ENEMY_TUNE } from '../data/enemies.ts';
import { enemies, fanAt, spawnEBullet } from '../world/entities.ts';
import { P, damagePlayer, detonate } from './player.ts';
import { bossPauseTick, setLaser } from './bosses/common.ts';
// ================= enemy behaviour (per frame) =================
// Fields on an enemy object are listed in spawnEnemy (js/world/entities.js).

// one enemy for one frame (engine world group 'enemy', order 10)
export function updateEnemy(e: Enemy, dt: number) {
  const py = P.fy + 1.3; // player chest height, used for line of sight
  if (e.flash > 0) e.flash -= dt;
  e.mat.emissiveIntensity = e.flash > 0 ? 1.8 : e.baseEI;
  if (e.boss) { if (e.spawnT > 0) bossPauseTick(e, dt); else e.behave(e, dt); return; }

  const def = e.def;
  const dx = P.x - e.x, dz = P.z - e.z;
  const dist = Math.hypot(dx, dz) || 0.001;
  const eyeY = e.fy + def.y;
  e.t += dt;

  if (!e.active && !wakeCheck(e, eyeY, py, dt)) return;
  e.cd -= dt;
  e.mcd -= dt;
  const los = dist < 40 && hasLOS(e.x, e.z, P.x, P.z, eyeY, py);

  let still = false; // true = this enemy doesn't walk this frame
  if (e.stun > 0) { e.stun -= dt; still = true; e.mcd = Math.max(e.mcd, 0.2); }
  if (def.bomber) {
    const r = updateBomber(e, dt, dist);
    if (r === 'gone') return;
    if (r) still = true;
  }
  if (def.sniper && updateSniper(e, dt, los, py)) still = true;
  if (def.speed > 0 && !still) steerEnemy(e, dt, dx, dz, dist, los);

  if (def.melee && dist < e.r + P.r + 0.4 && Math.abs(P.fy - e.fy!) < 1.2 && e.mcd <= 0) {
    e.mcd = 0.9;
    damagePlayer(e.dmg, e);
  }
  if (def.ranged && los && dist < 26 && e.cd <= 0) {
    const r = def.ranged;
    e.cd = r.rate * ENEMY_TUNE.fireInterval * rand(0.8, 1.25);
    fireRanged(e);
    if (r.burst) { e.burstN = r.burst - 1; e.burstT = r.burstGap; }
  }
  // the rest of a burst: one round every burstGap while the player stays in sight
  if (e.burstN > 0 && (e.burstT -= dt) <= 0) {
    if (los) { fireRanged(e); e.burstN--; e.burstT = def.ranged.burstGap; } else e.burstN = 0;
  }
  poseEnemy(e, dt, dx, dz);
}

function fireRanged(e: Enemy) {
  const def = e.def, r = def.ranged;
  const muzzleY = e.mesh.position.y + (def.muzzle ?? (def.geo === 'cyl' ? 1.1 : 0));
  const color = def.color === 0xffe14a ? 0xffe14a : 0xff4d8d;
  fanAt(e.x, muzzleY, e.z, r.count, r.spread, r.speed, e.dmg, color);
  e.kick = 1;
}

// Idle until the player is within ENEMY_TUNE.wakeTiles of walking distance and in sight. Returns true once awake.
export function wakeCheck(e: Enemy, eyeY: number, py: number, dt: number) {
  const fd = flowAt(e.x, e.z);
  if (fd >= 0 && fd <= ENEMY_TUNE.wakeTiles && hasLOS(e.x, e.z, P.x, P.z, eyeY, py)) {
    e.active = true;
    return true;
  }
  if (e.def.humanoid) { // stands on its feet and looks around
    e.body.rotation.y = Math.sin(e.t * 0.7) * 0.7;
    poseHumanoid(e, dt, false);
  } else {
    e.mesh.position.y = eyeY + Math.sin(e.t * 2) * 0.12;
    e.body.rotation.y += dt * 0.5;
  }
  return false;
}

// Bomber: light the fuse when close, blow up when it runs out.
// Returns 'gone' if it exploded, true if it should stand still, false otherwise.
export function updateBomber(e: Enemy, dt: number, dist: number) {
  if (e.fuse !== undefined) {
    e.fuse -= dt;
    e.flash = Math.sin(e.t * 50) > 0 ? 0.05 : 0;
    if (e.fuse <= 0) { detonate(e); return 'gone'; }
    return true;
  }
  if (dist < 2.2 && Math.abs(P.fy - e.fy!) < 1.5) {
    e.fuse = 0.45;
    sfx('empty');
    return true;
  }
  return false;
}

// Sniper: 1.1s visible laser (tracks, then locks for the last 0.25s), then one fast round.
// Returns true while aiming (it stands still).
export function updateSniper(e: Enemy, dt: number, los: boolean, py: number) {
  if (e.aim > 0) {
    e.aim -= dt;
    const sy = e.mesh.position.y + 0.7;
    if (e.aim > 0.25) e.lock = [P.x, py - 0.1, P.z];
    const opacity = e.aim > 0.25 ? 0.45 : (Math.sin(e.t * 60) > 0 ? 1 : 0.3);
    setLaser(e.laser, [e.x, sy, e.z], e.lock, opacity);
    if (e.aim <= 0) {
      e.laser.visible = false;
      e.cd = rand(2.6, 3.4) * ENEMY_TUNE.fireInterval;
      const vx = e.lock[0] - e.x, vy = e.lock[1] - sy, vz = e.lock[2] - e.z;
      const l = Math.hypot(vx, vy, vz) || 1, speed = 60;
      spawnEBullet(e.x, sy, e.z, vx / l * speed, vy / l * speed, vz / l * speed, e.dmg, 0xff4d8d, 0.7);
      sfx('rail', 80);
    }
    return true;
  }
  if (los && e.cd <= 0) {
    e.aim = 1.1;
    e.lock = [P.x, py, P.z];
    return true;
  }
  e.laser.visible = false;
  return false;
}

// Walk toward the player (straight when in sight, along the flow field otherwise),
// circle-strafe when a `keep` distance is set, and push away from nearby enemies.
// chase the player (engine/world/steer.js); bosses don't take part in the pushing apart
export function steerEnemy(e: Enemy, dt: number, dx: number, dz: number, dist: number, los: boolean) {
  steerChase(e, dt, dx, dz, dist, los, e.def.speed, e.def.keep, enemies, o => o.boss);
}

// Place the mesh, face the player (limited by def.turn rad/s if set), spin decorative bodies.
export function poseEnemy(e: Enemy, dt: number, dx: number, dz: number) {
  const def = e.def;
  const bob = def.fly ? Math.sin(e.t * 3) * 0.3 : 0;
  e.mesh.position.set(e.x, e.fy + def.y + bob, e.z);
  const want = Math.atan2(dx, dz);
  if (def.turn) {
    const diff = Math.atan2(Math.sin(want - e.face), Math.cos(want - e.face));
    e.face += clamp(diff, -def.turn * dt, def.turn * dt);
  } else {
    e.face = want;
  }
  e.mesh.rotation.y = e.face;
  if (def.geo === 'tetra' || def.geo === 'tetraS') e.body.rotation.x += dt * 8;
  if (def.geo === 'octa' || def.geo === 'ico') e.body.rotation.y += dt * 3;
  if (def.humanoid) { e.body.rotation.y *= Math.max(0, 1 - dt * 6); poseHumanoid(e, dt, true); }
}

// The trooper's limbs: legs and the free arm swing with the distance walked, the gun arm is raised toward the player
// while awake (kicking back on each shot), and the hit spheres follow the head, chest and legs.
export function poseHumanoid(e: Enemy, dt: number, aiming: boolean) {
  const rig = e.rig, moved = Math.hypot(e.x - e.px, e.z - e.pz);
  e.px = e.x; e.pz = e.z;
  const pace = clamp(moved / Math.max(dt, 1e-3) / 3.5, 0, 1);
  e.walk += moved * 2.4;
  const swing = Math.sin(e.walk) * 0.65 * pace;
  rig.legL.rotation.x = swing; rig.legR.rotation.x = -swing;
  rig.armL.rotation.x = -swing * 0.8;
  e.kick = Math.max(0, e.kick - dt * 9);
  const dy = P.fy + 1.3 - (e.mesh.position.y + 0.6), dh = Math.hypot(P.x - e.x, P.z - e.z) || 1;
  const want = aiming ? -Math.PI / 2 - Math.atan2(dy, dh) * 0.8 + e.kick * 0.35 : swing * 0.8;
  rig.armR.rotation.x += (want - rig.armR.rotation.x) * Math.min(1, dt * 12);
  rig.upper.rotation.x = -e.kick * 0.08;
  e.mesh.position.y = e.fy + e.def.y + Math.abs(Math.sin(e.walk)) * 0.05 * pace;
  const m = e.mesh.position;
  e.parts[0].p.set(m.x, m.y + 0.95, m.z); e.parts[1].p.set(m.x, m.y + 0.4, m.z); e.parts[2].p.set(m.x, m.y - 0.5, m.z);
}
