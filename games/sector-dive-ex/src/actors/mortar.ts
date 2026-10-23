import * as THREE from 'three';
import type { MortarShell, RegularEnemy } from '../data/types.ts';
import { distXZ } from '@engine/core/util.ts';
import { spawn } from '@engine/core/world.ts';
import { sfx } from '@engine/audio/audio.ts';
import { basicMat, dynGroup, shared } from '@engine/render/render.ts';
import { burst, fireball } from '@engine/render/fx.ts';
import { floorY } from '@engine/world/tiles.ts';
import { WALL_H } from '../data/level.ts';
import { COLOR } from '../data/colors.ts';
import { geoCache } from '../world/render.ts';
import { player } from './player.ts';
import { damagePlayer } from './combat.ts';
// ================= the mortar's round =================
// The mortar (data/enemies.ts, behaviour in actors/enemies.ts) picks the spot under the player's feet when it fires. The round
// flies an arc over everything in between and lands MORTAR_FLIGHT seconds later; the ring on the floor fills up until then.
// Nothing hits the round on the way, and it falls even if the mortar dies.

// ---- tuning numbers used only here ----
export const MORTAR_BLAST_R = 2.6; // the blast and the ring on the floor (m)
const MORTAR_FLIGHT = 1.4; // seconds from the muzzle to the floor
const MORTAR_ARC = 4; // the arc's top is this far above the higher of the muzzle and the landing spot (m)
const MORTAR_CEIL_GAP = 0.3; // ... and stays this far under the ceiling (m)
const MORTAR_BLAST_DY = 1.5; // the blast reaches a player whose feet are this close to the floor it lands on (m)
const ROUND_SCALE = 1.6; // the round's size as a multiple of an enemy bullet
const RING_LIFT = 0.06; // the ring floats this far above the floor (m)
const RING_OPACITY = 0.9,
  FILL_OPACITY = 0.38;
const RING_COLOR = 0xff3b30; // the warning ring and its fill
const ROUND_COLOR = 0xff9a5a;
const ROUND_SMOKE = 0x78808a;
const MUZZLE_SMOKE_N = 8; // puffs at the muzzle when it fires
const FLASH_R = 1.4; // the fireball of the blast (m)

const ringGeo = shared(new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2));
const discGeo = shared(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2));

// the mortar fires one round at the player's feet. (x, y, z) = the mouth of the tube
export function fireMortar(e: RegularEnemy, x: number, y: number, z: number) {
  const tx = player.x,
    tz = player.z,
    ty = floorY(tx, tz),
    top = Math.min(Math.max(y, ty) + MORTAR_ARC, WALL_H - MORTAR_CEIL_GAP),
    h = top - y, // how far the arc climbs above the muzzle
    d = ty - y,
    // y(t) = y + vy t - g t^2 / 2 with its top at `top` and the floor reached at t = MORTAR_FLIGHT
    vy = ((2 * h) / MORTAR_FLIGHT) * (1 + Math.sqrt(1 - d / h)),
    g = (vy * vy) / (2 * h);
  const round = new THREE.Mesh(geoCache.ebullet, basicMat(ROUND_COLOR)),
    fill = new THREE.Mesh(
      discGeo,
      new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: FILL_OPACITY, depthWrite: false }),
    ),
    ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: RING_OPACITY, depthWrite: false }),
    ),
    mesh = new THREE.Group();
  round.scale.setScalar(ROUND_SCALE);
  round.position.set(x, y, z);
  for (const o of [fill, ring]) {
    o.position.set(tx, ty + RING_LIFT, tz);
    o.scale.set(MORTAR_BLAST_R, 1, MORTAR_BLAST_R);
  }
  fill.scale.set(0.001, 1, 0.001);
  mesh.add(round, fill, ring);
  dynGroup.add(mesh);
  const s: MortarShell = spawn({
    tag: 'shell' as const,
    t: 0,
    x0: x,
    y0: y,
    z0: z,
    tx,
    ty,
    tz,
    vy,
    g,
    dmg: e.dmg,
    round,
    fill,
    mesh,
  });
  s.update = (dt: number) => updateShell(s, dt);
  for (let k = 0; k < MUZZLE_SMOKE_N; k++) burst(x, y, z, ROUND_SMOKE, 1, 2.5, 0.8, -1);
  sfx('launcher', 80);
  e.kick = 1;
  e.shots = (e.shots || 0) + 1; // rounds fired (the smoke test counts them)
}

function updateShell(s: MortarShell, dt: number) {
  s.t = Math.min(MORTAR_FLIGHT, s.t + dt);
  const k = s.t / MORTAR_FLIGHT,
    x = s.x0 + (s.tx - s.x0) * k,
    z = s.z0 + (s.tz - s.z0) * k,
    y = s.y0 + s.vy * s.t - 0.5 * s.g * s.t * s.t;
  s.round.position.set(x, y, z);
  s.fill.scale.set(Math.max(k, 0.001) * MORTAR_BLAST_R, 1, Math.max(k, 0.001) * MORTAR_BLAST_R);
  burst(x, y, z, ROUND_SMOKE, 1, 0.6, 0.5, -1.5);
  if (s.t < MORTAR_FLIGHT) return;
  s.dead = true;
  burst(s.tx, s.ty + 0.3, s.tz, COLOR.fire, 22, 9, 0.7);
  burst(s.tx, s.ty + 0.3, s.tz, 0xffffff, 8, 5, 0.4);
  fireball(s.tx, s.ty + 0.5, s.tz, FLASH_R, COLOR.orange);
  sfx('boom', 60);
  const at = { x: s.tx, z: s.tz };
  if (distXZ(player, at) < MORTAR_BLAST_R && Math.abs(player.fy - s.ty) < MORTAR_BLAST_DY) damagePlayer(s.dmg, at);
}
