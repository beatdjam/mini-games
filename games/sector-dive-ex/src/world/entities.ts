import type {
  Boss,
  EBullet,
  Enemy,
  PBullet,
  Pickup,
  PickupKind,
  RegularEnemy,
  Shielded,
  Sniper,
  Trooper,
  Wave,
  Weapon,
} from '../data/types.ts';
import * as THREE from 'three';
import { clamp, rand } from '@engine/core/util.ts';
import { spawn, worldGroup } from '@engine/core/world.ts';
import { sfx } from '@engine/audio/audio.ts';
import { basicMat, disposeTree, dynGroup } from '@engine/render/render.ts';
import { blocked, floorY, tileIndex, walkable } from '@engine/world/tiles.ts';
import { aimFan, ringAngles, takeFromPool } from '@engine/world/projectiles.ts';
import { ENEMY, ENEMY_TUNE } from '../data/enemies.ts';
import { rebootMul } from '../core/rules.ts';
import { geoCache } from './render.ts';
import { level } from './level.ts';
import { player, run } from '../actors/player.ts';
import { damageScaleAt } from '../core/stages.ts';
import { buildEnemyMesh, buildPickupMesh, makeLaser } from './models.ts';
import { updateEnemy } from '../actors/enemies.ts';
import { updatePickup, updateWave } from '../flow/update.ts';
import { COLOR } from '../data/colors.ts';
// ================= entities =================
const HOMING_SIZE = 1.3; // size of the bosses' homing bullets (shootHoming)
// pickups and shockwaves live in the engine world (engine/src/core/world.ts) with tag 'pickup' / 'wave'
// enemies (bosses included) are an engine world group updated at order 10; `enemies` is that group's list
export const ENEMY_GROUP = worldGroup('enemy', 10);
// the living enemies: the group's list
export const enemies = ENEMY_GROUP.list as Enemy[];
export let boss: Boss | null = null; // the boss of this stage (set by setBoss)
export let nearPickup: Pickup | null = null; // the pickup in reach for the interact key (set by setNear)
export let nearPickupDist = 1.9; // its distance (m)
export let target: AimTarget | null = null; // aim assist / autofire lock (set by setTarget)
// what the aim assist / autofire locks onto: an enemy and the point on it (a body of a multi-body boss)
export interface AimTarget {
  e: Enemy;
  p: THREE.Vector3;
}
export function setBoss(b: Boss | null) {
  boss = b;
}
export function setTarget(e: AimTarget | null) {
  target = e;
}
// the weapon pickup nearest to the player (and its distance, if given)
export function setNear(w: Pickup | null, d?: number) {
  nearPickup = w;
  if (d !== undefined) nearPickupDist = d;
}
export const pBullets: PBullet[] = [],
  eBullets: EBullet[] = [];
// far / farMul: rail damage bonus past `far` metres; kb: knockback; rail: punches through shields; shot: id of the trigger pull
interface ShotOptions {
  far?: number;
  farMul?: number;
  kb?: number;
  rail?: boolean;
  shot?: number;
}
export function spawnPBullet(
  pos: THREE.Vector3,
  dir: THREE.Vector3,
  speed: number,
  dmg: number,
  pierce: number,
  blast: number,
  color: number,
  grav: number,
  opt?: ShotOptions,
) {
  // a very fast gun with many split rounds can have hundreds in the air: when the pool is full the oldest round is
  // reused, so a new shot is never silently dropped (it used to vanish, hits and all)
  const b = takeFromPool(pBullets, geoCache.pbullet, 480, true);
  if (!b) return;
  b.alive = true;
  b.x = pos.x;
  b.y = pos.y;
  b.z = pos.z;
  b.vx = dir.x * speed;
  b.vy = dir.y * speed;
  b.vz = dir.z * speed;
  b.dmg = dmg;
  b.pierce = pierce;
  b.blast = blast || 0;
  b.grav = grav || 0;
  b.life = blast ? 4 : 1.6;
  b.color = color;
  b.hit.clear();
  b.ox = pos.x;
  b.oz = pos.z;
  const o: ShotOptions = opt || {};
  b.far = o.far || 0;
  b.farMul = o.farMul || 1; // rail gun: bonus beyond `far` metres
  b.kb = o.kb || 0;
  b.rail = !!o.rail;
  b.shot = o.shot || 0;
  b.mesh.geometry = blast ? geoCache.rocket : geoCache.pbullet;
  b.mesh.material = basicMat(blast ? 0xd8dde3 : color);
  b.mesh.visible = true;
  b.mesh.position.set(b.x, b.y, b.z);
  b.mesh.lookAt(b.x + dir.x, b.y + dir.y, b.z + dir.z);
}
function spawnEBullet(
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  dmg: number,
  color: number,
  size?: number,
  homing?: number,
) {
  const b = takeFromPool(eBullets, geoCache.ebullet, 360);
  if (!b) return;
  b.alive = true;
  b.x = x;
  b.y = y;
  b.z = z;
  b.ox = x;
  b.oz = z;
  b.vx = vx;
  b.vy = vy;
  b.vz = vz;
  b.dmg = dmg;
  b.life = 6;
  b.size = size || 1;
  b.homing = homing || 0;
  b.speed = Math.hypot(vx, vy, vz);
  b.mesh.material = basicMat(color || COLOR.mag);
  b.mesh.scale.setScalar(b.size);
  b.mesh.visible = true;
  b.mesh.position.set(x, y, z);
}
export function shootAngle(
  x: number,
  y: number,
  z: number,
  ang: number,
  speed: number,
  dmg: number,
  color: number,
  size?: number,
) {
  const s = Math.sin(ang),
    c = Math.cos(ang);
  spawnEBullet(x + s * 1.8, y, z + c * 1.8, s * speed, 0, c * speed, dmg, color, size);
}
export function ring(
  x: number,
  y: number,
  z: number,
  n: number,
  speed: number,
  off: number,
  dmg: number,
  color: number,
  size?: number,
) {
  ringAngles(n, off).forEach(a => shootAngle(x, y, z, a, speed, dmg, color, size));
  sfx('eshot', 60);
}
export function fanAt(
  x: number,
  y: number,
  z: number,
  n: number,
  spread: number,
  speed: number,
  dmg: number,
  color: number,
) {
  // aimed at the player's chest, with a little random spread per bullet
  aimFan(x, y, z, player.x, player.fy + 1.2, player.z, n, spread, 0.03).forEach(([dx, dy, dz]) =>
    spawnEBullet(x, y, z, dx * speed, dy * speed, dz * speed, dmg, color),
  );
  sfx('eshot', 60);
}
// one bullet from (x, y, z) straight at the point (tx, ty, tz)
export function shootAtPoint(
  x: number,
  y: number,
  z: number,
  tx: number,
  ty: number,
  tz: number,
  speed: number,
  dmg: number,
  color: number,
  size?: number,
) {
  const vx = tx - x,
    vy = ty - y,
    vz = tz - z;
  const l = Math.hypot(vx, vy, vz) || 1;
  spawnEBullet(x, y, z, (vx / l) * speed, (vy / l) * speed, (vz / l) * speed, dmg, color, size);
}
// a homing bullet flying out sideways at angle ang from `reach` m off (x, z); rise: its climb (m/s); homing: how hard it turns toward the player
export function shootHoming(
  x: number,
  y: number,
  z: number,
  ang: number,
  speed: number,
  dmg: number,
  color: number,
  opt: { reach: number; rise: number; homing: number },
) {
  const s = Math.sin(ang),
    c = Math.cos(ang);
  spawnEBullet(
    x + s * opt.reach,
    y,
    z + c * opt.reach,
    s * speed,
    opt.rise,
    c * speed,
    dmg,
    color,
    HOMING_SIZE,
    opt.homing,
  );
}

export function spawnEnemy(type: string, x: number, z: number, room: number, diff: number): RegularEnemy {
  const def = ENEMY[type],
    m = buildEnemyMesh(def),
    fy = floorY(x, z);
  m.g.position.set(x, fy + def.y, z);
  dynGroup.add(m.g);
  const e: RegularEnemy = {
    type,
    def,
    mesh: m.g,
    body: m.body,
    mat: m.mat,
    baseEI: 0.4, // group, spinning body, body material, normal glow
    x,
    z,
    fy, // position on the floor and feet height
    y: def.y, // body height above the feet
    r: def.r,
    hitR: def.hitR, // collision radius, hit sphere radius
    hp: def.hp * diff,
    maxHp: def.hp * diff,
    dmg: def.dmg * ENEMY_TUNE.dmgMul * (run ? damageScaleAt(run.stage) : rebootMul()),
    room, // room index (-1 = not tied to a room, e.g. boss minions)
    active: false, // wakes up when the player comes near (see wakeCheck)
    cd: rand(0.8, 1.8), // ranged / sniper cooldown
    mcd: 0, // melee cooldown
    t: rand(0, 6), // animation clock
    flash: 0, // hit flash timer
    side: Math.random() < 0.5 ? -1 : 1, // strafe direction for `keep` enemies
    face: 0, // facing angle (turns gradually when def.turn is set)
    stun: 0, // seconds of stagger left (shield break)
    burstN: 0,
    burstT: 0, // rounds left in a burst, time to the next (trooper)
    // set later by behaviour code: fuse (bomber), detonated, kbShot (last shot that knocked it back)
  };
  if (def.shield) {
    e.shieldHp = def.shieldHp! * diff; // shield breaks at 0
    e.shieldParts = m.g.userData.shield; // plate + outline meshes, removed on break
  }
  if (def.sniper) {
    e.laser = makeLaser(COLOR.mag);
    e.aim = 0;
    e.lock = [0, 0, 0];
  }
  if (def.humanoid) {
    // head, chest and legs are hit separately (kept in place by poseHumanoid); walk cycle state
    e.rig = m.g.userData.rig;
    e.walk = 0;
    e.px = x;
    e.pz = z;
    e.kick = 0;
    e.parts = [
      { p: new THREE.Vector3(), r: 0.36 },
      { p: new THREE.Vector3(), r: 0.62 },
      { p: new THREE.Vector3(), r: 0.5 },
    ];
  }
  return spawnEnemyObj(e);
}
// joins the enemy group; each frame the engine calls updateEnemy (src/actors/enemies.ts)
// type guards: the fields of a shield / sniper / trooper are set by spawnEnemy for exactly those types
export const isShielded = (e: Enemy): e is Shielded => !e.boss && !!e.def.shield;
export const isSniper = (e: Enemy): e is Sniper => !e.boss && !!e.def.sniper;
export const isTrooper = (e: Enemy): e is Trooper => !e.boss && !!e.def.humanoid;
export function spawnEnemyObj<T extends Enemy>(e: T): T {
  e.tag = 'enemy';
  e.update = (dt: number) => updateEnemy(e, dt);
  return spawn(e);
}
export function removeEnemyMesh(e: Enemy) {
  disposeTree(e.mesh);
  dynGroup.remove(e.mesh);
  if (e.laser) {
    disposeTree(e.laser);
    dynGroup.remove(e.laser);
    e.laser = null;
  }
  if (e.extra)
    e.extra.forEach((o: THREE.Object3D) => {
      disposeTree(o);
      (o.parent || dynGroup).remove(o);
    });
}

// keep drops out of portal range so they can be picked up without touching the gate
function clearOfPortals(x: number, z: number): [number, number] {
  const R = 3.2;
  for (const pt of level.portals) {
    const dx = x - pt.x,
      dz = z - pt.z,
      d = Math.hypot(dx, dz);
    if (d >= R - 0.05) continue;
    const base = d > 0.01 ? Math.atan2(dz, dx) : Math.random() * Math.PI * 2;
    for (let k = 0; k < 12; k++) {
      const a = base + ((k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI) / 6;
      const nx = pt.x + Math.cos(a) * R,
        nz = pt.z + Math.sin(a) * R;
      const tile = tileIndex(nx, nz);
      if (!blocked(nx, nz, 0.4) && walkable(tile) && !level.hazardTiles[tile]) return clearOfPortals(nx, nz);
    }
  }
  return [x, z];
}
export function addPickup(kind: PickupKind, x: number, z: number, extra?: { value?: number; w?: Weapon }): Pickup {
  const [px, pz] = clearOfPortals(x, z);
  const mesh = buildPickupMesh(kind, extra?.w);
  const baseY = (kind === 'bit' ? 0.5 : 1.0) + floorY(px, pz);
  mesh.position.set(px, baseY, pz);
  dynGroup.add(mesh);
  const p: Pickup = Object.assign(
    { tag: 'pickup' as const, kind, x: px, z: pz, y: baseY, mesh, t: rand(0, 6), dead: false },
    extra || {},
  );
  p.update = (dt: number) => updatePickup(p, dt);
  return spawn(p);
}
export function dropBits(x: number, z: number, total: number) {
  const n = clamp(Math.round(total / 4), 1, 10),
    per = total / n;
  for (let k = 0; k < n; k++) addPickup('bit', x + rand(-0.9, 0.9), z + rand(-0.9, 0.9), { value: per });
}
export function spawnWave(x: number, z: number, speed: number, max: number, dmg: number, color: number) {
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const m = new THREE.Mesh(geoCache.wave, mat);
  m.position.set(x, floorY(x, z) + 0.55, z);
  m.scale.set(0.5, 1, 0.5);
  dynGroup.add(m);
  const w: Wave = spawn({ tag: 'wave' as const, x, z, r: 0.5, speed, max, dmg, hit: false, mesh: m, dead: false });
  w.update = (dt: number) => updateWave(w, dt);
}
