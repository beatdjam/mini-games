// The look of a shot (SB-1450): the flash at a muzzle, the tracer band that shows a bullet in flight, and the sparks and
// small smoke of an impact. Everything of one kind is one InstancedMesh made once, so a frame makes no mesh, geometry or
// material; a pool that is full reuses its oldest slot. The values come from data/gunfire.ts and the colours from
// data/colors.ts; this file only draws. It reads the bullets in flight and never writes the game.
import * as THREE from 'three';
import { createRng, type Rng } from '@engine/core/index.ts';
import { camera, disposeTree, scene } from '@engine/render/index.ts';
import { GUN_TUNE } from '../data/battery.ts';
import { GUNFIRE_COLOR } from '../data/colors.ts';
import { ENEMIES } from '../data/enemies.ts';
import { FORTRESS_GUN_TUNE } from '../data/fortress.ts';
import {
  GUNFIRE_CAP,
  GUNFIRE_LOOK,
  GUNFIRE_SEED,
  GUNFIRE_TUNE,
  type FlashKind,
  type MuzzleFlashDef,
} from '../data/gunfire.ts';
import { PILLBOX_TUNE } from '../data/pillbox.ts';
import { WEAPONS } from '../data/weapons.ts';
import { isHostileBullet, type Bullet } from '../logic/game.ts';
import { freeSlot } from './boom.ts';

export const GUNFIRE_NAME = 'sb-gunfire'; // each mesh is `${GUNFIRE_NAME}-tracers`, `-flashes`, ...

interface FlashSlot {
  live: boolean;
  age: number;
  life: number;
  size: number;
  x: number;
  y: number;
  z: number;
  color: number;
}

interface SparkSlot {
  live: boolean;
  age: number;
  life: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  color: number;
}

interface SmokeSlot {
  live: boolean;
  age: number;
  life: number;
  x: number;
  y: number;
  z: number;
  rise: number;
  size: number;
  grow: number;
  color: number;
  fade: number;
}

// The pools of one sortie's gunfire, with the bullets a flash has already been made for.
export interface GunfireView {
  group: THREE.Group;
  tracers: THREE.InstancedMesh;
  flashes: THREE.InstancedMesh;
  sparks: THREE.InstancedMesh;
  smoke: THREE.InstancedMesh;
  flashSlots: FlashSlot[];
  sparkSlots: SparkSlot[];
  smokeSlots: SmokeSlot[];
  flashNext: number;
  sparkNext: number;
  smokeNext: number;
  seen: WeakSet<Bullet>; // the hostile bullets whose muzzle has flashed
}

// The view built last (the sortie's own): a dev view and a shot reach it, as they do the hurt view's.
let current: GunfireView | null = null;
let sparksRng: Rng = createRng(GUNFIRE_SEED);

export const currentGunfireView = (): GunfireView | null => current;

// An instanced mesh with a white base, so the instance's own colour is what shows; the colours are made before the first
// draw because three r128 creates the buffer inside setColorAt.
function poolMesh(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  capacity: number,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = `${GUNFIRE_NAME}-${name}`;
  const white = new THREE.Color(0xffffff);
  for (let i = 0; i < capacity; i++) mesh.setColorAt(i, white);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // the parts move every frame, so the bounding sphere made at the start would cull them
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.visible = false;
  return mesh;
}

// A tracer's band: a strip whose head is bright and whose tail fades to the table's share. The tail is narrower than the
// head, so the head reads as the bullet and the tail trails away. It lies in the xz plane (the length runs along +z).
function tracerGeometry(): THREE.BufferGeometry {
  const tail = GUNFIRE_TUNE.tracer.tail;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-0.18, 0, -0.5, 0.18, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5], 3),
  );
  geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute([tail, tail, tail, tail, tail, tail, 1, 1, 1, 1, 1, 1], 3),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

// A muzzle flash's plate: a square that is bright at its middle and fades out by its edge, so no square corner shows.
function flashGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(1, 1, 2, 2);
  const position = geometry.getAttribute('position');
  const color: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const r = Math.min(1, Math.hypot(position.getX(i), position.getY(i)) / 0.7072);
    const k = (1 - r) * (1 - r);
    color.push(k, k, k);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  return geometry;
}

function buildSlots<T extends { live: boolean }>(count: number, empty: () => T): T[] {
  return Array.from({ length: count }, empty);
}

const emptyFlash = (): FlashSlot => ({ live: false, age: 0, life: 0, size: 0, x: 0, y: 0, z: 0, color: 0 });
const emptySpark = (): SparkSlot => ({
  live: false,
  age: 0,
  life: 0,
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  size: 0,
  color: 0,
});
const emptySmoke = (): SmokeSlot => ({
  live: false,
  age: 0,
  life: 0,
  x: 0,
  y: 0,
  z: 0,
  rise: 0,
  size: 0,
  grow: 0,
  color: 0,
  fade: 0,
});

export function buildGunfireView(): GunfireView {
  const group = new THREE.Group();
  group.name = GUNFIRE_NAME;
  const tracers = poolMesh(
    'tracers',
    tracerGeometry(),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    GUNFIRE_CAP.tracers,
  );
  const flashes = poolMesh(
    'flashes',
    flashGeometry(),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    GUNFIRE_CAP.flashes,
  );
  const sparks = poolMesh(
    'sparks',
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    GUNFIRE_CAP.sparks,
  );
  const smoke = poolMesh(
    'smoke',
    new THREE.BoxGeometry(1, 1, 1),
    // the puff is see-through so what lies behind it still reads, as the blasts' smoke is
    new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }),
    GUNFIRE_CAP.smoke,
  );
  group.add(tracers, flashes, sparks, smoke);
  scene.add(group);
  sparksRng = createRng(GUNFIRE_SEED);
  const view: GunfireView = {
    group,
    tracers,
    flashes,
    sparks,
    smoke,
    flashSlots: buildSlots(GUNFIRE_CAP.flashes, emptyFlash),
    sparkSlots: buildSlots(GUNFIRE_CAP.sparks, emptySpark),
    smokeSlots: buildSlots(GUNFIRE_CAP.smoke, emptySmoke),
    flashNext: 0,
    sparkNext: 0,
    smokeNext: 0,
    seen: new WeakSet<Bullet>(),
  };
  current = view;
  return view;
}

// Takes the pools out of the scene and frees them (the sortie's end).
export function removeGunfireView(view: GunfireView): void {
  scene.remove(view.group);
  disposeTree(view.group);
  for (const mesh of [view.tracers, view.flashes, view.sparks, view.smoke]) mesh.dispose();
  if (current === view) current = null;
}

// Lights the muzzle of a `kind` weapon at (x, y, z) for the table's short life.
export function spawnMuzzleFlash(view: GunfireView, kind: FlashKind, x: number, y: number, z: number): void {
  const def: MuzzleFlashDef = GUNFIRE_TUNE.flash[kind];
  const at = freeSlot(view.flashSlots, view.flashNext);
  view.flashNext = (at + 1) % view.flashSlots.length;
  const slot = view.flashSlots[at];
  slot.live = true;
  slot.age = 0;
  slot.life = def.life;
  slot.size = def.size;
  slot.x = x;
  slot.y = y;
  slot.z = z;
  slot.color = def.color;
}

const next = (): number => sparksRng.next();

// Throws the sparks and the small puff an impact makes at (x, y, z). A metal hit (a target, an enemy or the mech's
// armour) throws more of them than sand or a prop.
export function spawnImpact(view: GunfireView, x: number, y: number, z: number, metal: boolean): void {
  const def = GUNFIRE_TUNE.impact;
  const count = metal ? def.metalSparks : def.surfaceSparks;
  const color = metal ? GUNFIRE_COLOR.metalSpark : GUNFIRE_COLOR.surfaceSpark;
  for (let i = 0; i < count; i++) {
    const at = freeSlot(view.sparkSlots, view.sparkNext);
    view.sparkNext = (at + 1) % view.sparkSlots.length;
    const slot = view.sparkSlots[at];
    const angle = next() * Math.PI * 2;
    const up = 0.25 + next() * 0.75;
    const side = Math.sqrt(Math.max(0, 1 - up * up));
    const speed = def.sparkSpeed * (GUNFIRE_LOOK.sparkSpeedMin + next() * GUNFIRE_LOOK.sparkSpeedVar);
    slot.live = true;
    slot.age = 0;
    slot.life = def.sparkLife * (GUNFIRE_LOOK.sparkLifeMin + next() * GUNFIRE_LOOK.sparkLifeVar);
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.vx = Math.cos(angle) * side * speed;
    slot.vy = up * speed;
    slot.vz = Math.sin(angle) * side * speed;
    slot.size = def.sparkSize * (0.7 + next() * 0.6);
    slot.color = color;
  }
  const at = freeSlot(view.smokeSlots, view.smokeNext);
  view.smokeNext = (at + 1) % view.smokeSlots.length;
  const puff = view.smokeSlots[at];
  puff.live = true;
  puff.age = 0;
  puff.life = def.smokeLife;
  puff.x = x;
  puff.y = y;
  puff.z = z;
  puff.rise = def.smokeRise;
  puff.size = def.smokeSize;
  puff.grow = def.smokeGrow;
  puff.color = def.smokeColor;
  puff.fade = def.smokeFade;
}

// How fast a hostile bullet flies, so the flash a frame late is put back at the muzzle it left.
function hostileSpeed(bullet: Bullet): number {
  if ('gun' in bullet) return GUN_TUNE.bulletSpeed;
  if ('fort' in bullet) return FORTRESS_GUN_TUNE.bulletSpeed;
  if ('pillbox' in bullet) return PILLBOX_TUNE.bulletSpeed;
  if ('enemy' in bullet) return ENEMIES[bullet.enemy].bulletSpeed;
  return 0;
}

// Flashes the muzzle of every hostile bullet seen for the first time: the enemies, the pillboxes and the battery report
// no shot event, so the bullet itself is the sign that one was fired.
function flashNewHostileBullets(view: GunfireView, bullets: readonly Bullet[], dt: number): void {
  const back = Math.max(0, dt);
  for (const bullet of bullets) {
    if (!isHostileBullet(bullet) || view.seen.has(bullet)) continue;
    view.seen.add(bullet);
    const at = hostileSpeed(bullet) * back;
    spawnMuzzleFlash(view, 'enemy', bullet.x - bullet.dx * at, bullet.y - bullet.dy * at, bullet.z - bullet.dz * at);
  }
}

const dummy = new THREE.Object3D();
const tint = new THREE.Color();
const fadeTint = new THREE.Color();
const head = new THREE.Vector3();
const dir = new THREE.Vector3();
const mid = new THREE.Vector3();
const toCam = new THREE.Vector3();
const normal = new THREE.Vector3();
const right = new THREE.Vector3();
const basis = new THREE.Matrix4();
const quat = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const SIDE = new THREE.Vector3(1, 0, 0);

// Writes each bullet as a band from its head back along its direction, turned so its face is toward the camera. A mech's
// shot for the first metres of its flight starts at the cannon's mouth the view knows, so its band leaves the barrel with
// the flash rather than from the chest the logic fires the bullet at. Whether it is that new is read from the range it has
// left, not from where the mouth stands: the mech walks and turns, and a moving mouth would put an older shot back at the
// barrel (SB-2086).
function drawTracers(view: GunfireView, bullets: readonly Bullet[], muzzle: THREE.Vector3 | null): number {
  const { length, width } = GUNFIRE_TUNE.tracer;
  let n = 0;
  for (const bullet of bullets) {
    if (n >= GUNFIRE_CAP.tracers) break;
    dir.set(bullet.dx, bullet.dy, bullet.dz);
    head.set(bullet.x, bullet.y, bullet.z);
    if (muzzle !== null && !isHostileBullet(bullet)) {
      const travelled = WEAPONS[bullet.weapon].range - bullet.left;
      if (travelled < length) head.copy(muzzle).addScaledVector(dir, length);
    }
    mid.copy(head).addScaledVector(dir, -length / 2);
    toCam.copy(camera.position).sub(mid);
    normal.copy(toCam).addScaledVector(dir, -toCam.dot(dir));
    if (normal.lengthSq() < 1e-6) {
      // the camera looks straight along the band: any side will do, but not one parallel to it
      normal.copy(Math.abs(dir.x) > 0.9 ? UP : SIDE);
      normal.addScaledVector(dir, -normal.dot(dir));
    }
    normal.normalize();
    right.crossVectors(normal, dir);
    basis.makeBasis(right, normal, dir);
    quat.setFromRotationMatrix(basis);
    dummy.position.copy(mid);
    dummy.quaternion.copy(quat);
    dummy.scale.set(width, 1, length);
    dummy.updateMatrix();
    view.tracers.setMatrixAt(n, dummy.matrix);
    view.tracers.setColorAt(
      n,
      tint.setHex(isHostileBullet(bullet) ? GUNFIRE_COLOR.enemyTracer : GUNFIRE_COLOR.mechTracer),
    );
    n++;
  }
  return n;
}

function drawFlashes(view: GunfireView, dt: number): number {
  let n = 0;
  for (const slot of view.flashSlots) {
    if (!slot.live) continue;
    slot.age += dt;
    if (slot.age >= slot.life) {
      slot.live = false;
      continue;
    }
    const u = slot.age / slot.life;
    dummy.position.set(slot.x, slot.y, slot.z);
    dummy.quaternion.copy(camera.quaternion);
    dummy.scale.setScalar(Math.max(0.001, slot.size * (1 - u * 0.4)));
    dummy.updateMatrix();
    view.flashes.setMatrixAt(n, dummy.matrix);
    const fade =
      u < GUNFIRE_LOOK.flashFadeFrom ? 1 : 1 - (u - GUNFIRE_LOOK.flashFadeFrom) / (1 - GUNFIRE_LOOK.flashFadeFrom);
    view.flashes.setColorAt(n, tint.setHex(slot.color).multiplyScalar(fade));
    n++;
  }
  return n;
}

function drawSparks(view: GunfireView, dt: number): number {
  let n = 0;
  for (const slot of view.sparkSlots) {
    if (!slot.live) continue;
    slot.age += dt;
    if (slot.age >= slot.life) {
      slot.live = false;
      continue;
    }
    slot.vy -= GUNFIRE_TUNE.impact.sparkGravity * dt;
    slot.x += slot.vx * dt;
    slot.y += slot.vy * dt;
    slot.z += slot.vz * dt;
    if (slot.y < GUNFIRE_LOOK.sparkGround) {
      slot.y = GUNFIRE_LOOK.sparkGround;
      slot.vy *= -GUNFIRE_LOOK.sparkBounce;
      slot.vx *= GUNFIRE_LOOK.sparkDrag;
      slot.vz *= GUNFIRE_LOOK.sparkDrag;
    }
    const u = slot.age / slot.life;
    dummy.position.set(slot.x, slot.y, slot.z);
    dummy.quaternion.copy(camera.quaternion);
    dummy.scale.setScalar(Math.max(0.001, slot.size * (1 - u * 0.6)));
    dummy.updateMatrix();
    view.sparks.setMatrixAt(n, dummy.matrix);
    view.sparks.setColorAt(n, tint.setHex(slot.color).multiplyScalar(1 - u));
    n++;
  }
  return n;
}

function drawSmoke(view: GunfireView, dt: number): number {
  let n = 0;
  for (const slot of view.smokeSlots) {
    if (!slot.live) continue;
    slot.age += dt;
    if (slot.age >= slot.life) {
      slot.live = false;
      continue;
    }
    slot.y += slot.rise * dt;
    const u = slot.age / slot.life;
    const k = u < GUNFIRE_LOOK.smokeFadeFrom ? 0 : (u - GUNFIRE_LOOK.smokeFadeFrom) / (1 - GUNFIRE_LOOK.smokeFadeFrom);
    dummy.position.set(slot.x, slot.y, slot.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(slot.size * (1 + slot.grow * u));
    dummy.updateMatrix();
    view.smoke.setMatrixAt(n, dummy.matrix);
    view.smoke.setColorAt(n, tint.setHex(slot.color).lerp(fadeTint.setHex(slot.fade), k));
    n++;
  }
  return n;
}

function show(mesh: THREE.InstancedMesh, count: number): void {
  mesh.count = count;
  mesh.visible = count > 0;
  if (count > 0) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

// Moves every flash, spark and puff on by a frame and writes what is left, with the bullets in flight, into the pools.
// Call it once a frame after the camera is placed and the game has spawned the frame's shots and hits. `muzzle` is the
// mech's cannon mouth in the world, when the view knows it; the mech's new bands start there.
export function drawGunfire(
  view: GunfireView,
  bullets: readonly Bullet[],
  dt: number,
  muzzle: THREE.Vector3 | null = null,
): void {
  const span = Math.max(0, dt);
  flashNewHostileBullets(view, bullets, span);
  show(view.tracers, drawTracers(view, bullets, muzzle));
  show(view.flashes, drawFlashes(view, span));
  show(view.sparks, drawSparks(view, span));
  show(view.smoke, drawSmoke(view, span));
}

// How many of each part are on screen now (the dev view and the unit tests read it).
export function gunfireCounts(view: GunfireView): { tracers: number; flashes: number; sparks: number; smoke: number } {
  const live = (slots: readonly { live: boolean }[]): number => slots.filter(slot => slot.live).length;
  return {
    tracers: view.tracers.count,
    flashes: live(view.flashSlots),
    sparks: live(view.sparkSlots),
    smoke: live(view.smokeSlots),
  };
}
