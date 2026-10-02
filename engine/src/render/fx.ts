import * as THREE from 'three';
import { rand } from '../core/util.ts';
import { addSystem } from '../core/loop.ts';
import { basicMat, disposeTree, dynGroup, shared } from './render.ts';
// engine: Visual effects that run by themselves (the engine registers their systems).
// - burst(x, y, z, color, n, speed, life, gravity): n small cubes flying out; gravity < 0 makes them rise (smoke)
// - fireball(x, y, z, radius, color): a flash that grows to `radius` and fades in 0.5 s
// - clearFx(): remove everything (when a level is torn down)
// FX.particles / FX.fireballs are the systems; set their .modes to the game's mode names (default: every mode).
const PART_POOL = 300; // particle cubes made up front and reused in a ring
const PART_GRAVITY = 14; // default downward pull of a particle (m/s^2)
const PART_LIFE = 0.6; // default particle life when burst() gets none (s)
const FIREBALL_START = 0.3; // scale of a fireball when it appears
const FIREBALL_GROW = 0.16; // time to grow to full radius (s)
const FIREBALL_LIFE = 0.5; // time until a fireball has faded out (s)
const FIREBALL_OPACITY = 0.85; // opacity of a fireball when it appears
export const FX_GEO = {
  part: shared(new THREE.BoxGeometry(0.13, 0.13, 0.13)),
  ball: shared(new THREE.SphereGeometry(1, 16, 12)),
};
interface Particle {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  life: number;
  max: number;
  vx: number;
  vy: number;
  vz: number;
  g: number;
}
interface Fireball {
  m: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  t: number;
  radius: number;
  dead: boolean;
}
export const parts: Particle[] = [];
for (let i = 0; i < PART_POOL; i++) {
  const m = new THREE.Mesh(FX_GEO.part, basicMat(0xffffff));
  m.visible = false;
  dynGroup.add(m);
  parts.push({ mesh: m, life: 0, max: 1, vx: 0, vy: 0, vz: 0, g: PART_GRAVITY });
}
let partIdx = 0; // next particle to reuse (ring)
let balls: Fireball[] = [];
export function burst(
  x: number,
  y: number,
  z: number,
  color: number,
  n: number,
  spd: number,
  life?: number,
  grav?: number,
) {
  for (let k = 0; k < n; k++) {
    partIdx = (partIdx + 1) % parts.length;
    const p = parts[partIdx];
    p.mesh.material = basicMat(color);
    p.mesh.visible = true;
    p.mesh.position.set(x, y, z);
    const a = Math.random() * Math.PI * 2,
      u = rand(-1, 1),
      s = spd * rand(0.3, 1),
      q = Math.sqrt(1 - u * u);
    p.vx = Math.cos(a) * q * s;
    p.vy = u * s + spd * 0.35;
    p.vz = Math.sin(a) * q * s;
    p.life = (life || PART_LIFE) * rand(0.6, 1.2);
    p.max = p.life;
    p.g = grav === undefined ? PART_GRAVITY : grav;
  }
}
export function updateParts(dt: number) {
  for (const p of parts) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.mesh.visible = false;
      continue;
    }
    p.vy -= p.g * dt;
    const pos = p.mesh.position;
    pos.x += p.vx * dt;
    pos.y += p.vy * dt;
    pos.z += p.vz * dt;
    if (pos.y < 0.07) {
      pos.y = 0.07;
      p.vy *= -0.35;
      p.vx *= 0.6;
      p.vz *= 0.6;
    }
    const s = p.life / p.max;
    p.mesh.scale.setScalar(p.g < 0 ? 1.8 - s : 0.3 + s);
  }
}
export function fireball(x: number, y: number, z: number, radius: number, color: number) {
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: FIREBALL_OPACITY,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(FX_GEO.ball, mat);
  m.position.set(x, y, z);
  m.scale.setScalar(FIREBALL_START);
  dynGroup.add(m);
  balls.push({ m, t: 0, radius, dead: false });
}
export function updateBalls(dt: number) {
  for (const b of balls) {
    b.t += dt;
    const k = Math.min(1, b.t / FIREBALL_GROW);
    b.m.scale.setScalar(FIREBALL_START + (b.radius - FIREBALL_START) * (1 - Math.pow(1 - k, 3)));
    b.m.material.opacity = FIREBALL_OPACITY * Math.max(0, 1 - b.t / FIREBALL_LIFE);
    if (b.t > FIREBALL_LIFE) {
      b.dead = true;
      disposeTree(b.m);
      dynGroup.remove(b.m);
    }
  }
  balls = balls.filter(b => !b.dead);
}
export function clearFx() {
  balls.forEach(b => {
    disposeTree(b.m);
    dynGroup.remove(b.m);
  });
  balls = [];
  parts.forEach(p => {
    p.life = 0;
    p.mesh.visible = false;
  });
}
export const FX = {
  fireballs: addSystem({ name: 'fireballs', order: 40, update: updateBalls }),
  particles: addSystem({ name: 'particles', order: 41, update: updateParts }),
};
