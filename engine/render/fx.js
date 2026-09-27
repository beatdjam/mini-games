import * as THREE from 'three';
import { rand } from '../core/util.js';
import { addSystem } from '../core/loop.js';
import { basicMat, disposeTree, dynGroup, shared } from './render.js';
// engine: Visual effects that run by themselves (the engine registers their systems).
// - burst(x, y, z, color, n, speed, life, gravity): n small cubes flying out; gravity < 0 makes them rise (smoke)
// - fireball(x, y, z, radius, color): a flash that grows to `radius` and fades in 0.5 s
// - clearFx(): remove everything (when a level is torn down)
// FX.particles / FX.fireballs are the systems; set their .modes to the game's mode names (default: every mode).
export const FX_GEO = { part: shared(new THREE.BoxGeometry(0.13, 0.13, 0.13)), ball: shared(new THREE.SphereGeometry(1, 16, 12)) };
export const parts = [];
for (let i = 0; i < 300; i++) {
  const m = new THREE.Mesh(FX_GEO.part, basicMat(0xffffff)); m.visible = false; dynGroup.add(m);
  parts.push({ mesh: m, life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: 14 });
}
export let partIdx = 0, balls = [];
export function burst(x, y, z, color, n, spd, life, grav) {
  for (let k = 0; k < n; k++) {
    const p = parts[partIdx = (partIdx + 1) % parts.length];
    p.mesh.material = basicMat(color); p.mesh.visible = true; p.mesh.position.set(x, y, z);
    const a = Math.random() * Math.PI * 2, u = rand(-1, 1), s = spd * rand(0.3, 1), q = Math.sqrt(1 - u * u);
    p.vx = Math.cos(a) * q * s; p.vy = u * s + spd * 0.35; p.vz = Math.sin(a) * q * s;
    p.life = p.max = (life || 0.6) * rand(0.6, 1.2); p.g = grav === undefined ? 14 : grav;
  }
}
export function updateParts(dt) {
  for (const p of parts) {
    if (p.life <= 0) continue;
    p.life -= dt; if (p.life <= 0) { p.mesh.visible = false; continue; }
    p.vy -= p.g * dt;
    const pos = p.mesh.position; pos.x += p.vx * dt; pos.y += p.vy * dt; pos.z += p.vz * dt;
    if (pos.y < 0.07) { pos.y = 0.07; p.vy *= -0.35; p.vx *= 0.6; p.vz *= 0.6; }
    const s = p.life / p.max; p.mesh.scale.setScalar(p.g < 0 ? 1.8 - s : 0.3 + s);
  }
}
export function fireball(x, y, z, radius, color) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
  const m = new THREE.Mesh(FX_GEO.ball, mat); m.position.set(x, y, z); m.scale.setScalar(0.3); dynGroup.add(m);
  balls.push({ m, t: 0, radius, dead: false });
}
export function updateBalls(dt) {
  for (const b of balls) {
    b.t += dt;
    const k = Math.min(1, b.t / 0.16);
    b.m.scale.setScalar(0.3 + (b.radius - 0.3) * (1 - Math.pow(1 - k, 3)));
    b.m.material.opacity = 0.85 * Math.max(0, 1 - b.t / 0.5);
    if (b.t > 0.5) { b.dead = true; disposeTree(b.m); dynGroup.remove(b.m); }
  }
  balls = balls.filter(b => !b.dead);
}
export function clearFx() {
  balls.forEach(b => { disposeTree(b.m); dynGroup.remove(b.m); }); balls = [];
  parts.forEach(p => { p.life = 0; p.mesh.visible = false; });
}
export const FX = {
  fireballs: addSystem({ name: 'fireballs', order: 40, update: updateBalls }),
  particles: addSystem({ name: 'particles', order: 41, update: updateParts }),
};
