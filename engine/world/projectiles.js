import * as THREE from 'three';
import { rand } from '../core/util.js';
import { basicMat, dynGroup } from '../render/render.js';
import { floorY, solidAt } from './tiles.js';
// engine: Projectiles: pooled meshes, movement in sub-steps (so fast rounds can't skip through walls or targets),
// terrain hits, homing, and the direction maths for bullet patterns. What happens on a hit is up to the game.
// A projectile is any object with x, y, z, vx, vy, vz (and optionally grav, mesh, alive).
// - takeFromPool(pool, geo, max): a free projectile from the pool (a new one with a mesh if there's room), or null
// - clearPool(pool): hide and free every projectile in it
// - stepProjectile(b, dt, maxStep, visit, speed): applies b.grav, then moves b in sub-steps no longer than maxStep
//   metres (counted from `speed` if given, else the current velocity); after each sub-step visit(b) returns true to
//   stop. Returns true if visit stopped it.
// - projHitsTerrain(b, ceil, pad): inside a wall, below the floor (+pad), or above ceil
// - steerToward(b, tx, ty, tz, dt, rate): turn the velocity toward a point, keeping b.speed
// - ringAngles(n, offset): n evenly spaced angles; aimFan(x, y, z, tx, ty, tz, n, spread, jitter): n unit directions
//   fanned `spread` radians apart around the aim at (tx, ty, tz), each with up to ±jitter of random turn
export function takeFromPool(pool, geo, max) {
  for (const b of pool) if (!b.alive) return b;
  if (pool.length >= max) return null;
  const b = { mesh: new THREE.Mesh(geo, basicMat(0xffffff)), alive: false, hit: new Set() };
  dynGroup.add(b.mesh); pool.push(b); return b;
}
export function clearPool(pool) { pool.forEach(b => { b.alive = false; b.mesh.visible = false; }); }
export function stepProjectile(b, dt, maxStep, visit, speed) {
  if (b.grav) b.vy -= b.grav * dt;
  const steps = Math.max(1, Math.ceil((speed ?? Math.hypot(b.vx, b.vy, b.vz)) * dt / maxStep));
  for (let s = 0; s < steps; s++) {
    b.x += b.vx * dt / steps;
    b.y += b.vy * dt / steps;
    b.z += b.vz * dt / steps;
    if (visit(b)) return true;
  }
  return false;
}
export function projHitsTerrain(b, ceil, pad) { return b.y > ceil || solidAt(b.x, b.z) || b.y < floorY(b.x, b.z) + pad; }
export function steerToward(b, tx, ty, tz, dt, rate) {
  const dx = tx - b.x, dy = ty - b.y, dz = tz - b.z;
  const l = Math.hypot(dx, dy, dz) || 1, k = Math.min(1, dt * rate);
  b.vx += (dx / l * b.speed - b.vx) * k;
  b.vy += (dy / l * b.speed - b.vy) * k;
  b.vz += (dz / l * b.speed - b.vz) * k;
}
export function ringAngles(n, offset) { const out = []; for (let k = 0; k < n; k++) out.push(offset + k * Math.PI * 2 / n); return out; }
export function aimFan(x, y, z, tx, ty, tz, n, spread, jitter) {
  const base = Math.atan2(tx - x, tz - z), hd = Math.hypot(tx - x, tz - z) || 1, vyr = (ty - y) / hd, out = [];
  for (let k = 0; k < n; k++) {
    const a = base + (n > 1 ? (k - (n - 1) / 2) * spread : 0) + rand(-jitter, jitter);
    const dx = Math.sin(a), dz = Math.cos(a), l = Math.hypot(1, vyr);
    out.push([dx / l, vyr / l, dz / l]);
  }
  return out;
}
