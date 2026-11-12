// The explosions on the screen (SB-1340): a flash, a column of black smoke that stays a while, the debris thrown out,
// and the sand or water the blast lifts. Everything of one kind is one InstancedMesh made once, so a frame makes no
// mesh, geometry or material; a pool that is full reuses its oldest slot. The values come from data/boom.ts and the
// shake from boomShakeAt; this file only draws.
import * as THREE from 'three';
import { disposeTree, scene } from '@engine/render/index.ts';
import { BOOM_CAP, BOOM_DEFS, type BoomKind } from '../data/boom.ts';
import type { MapBounds } from '../data/types.ts';

const SMOKE_EMIT = 1.6; // how long a blast keeps adding to its smoke column (s); a puff waits its turn
const SMOKE_OPACITY = 0.42; // the smoke is see-through so what lies behind it still reads
const WATER_OPACITY = 0.7;
const GROUND = 0.05; // where a piece of debris bounces (m)
const BOUNCE = 0.35; // how much of a piece's speed a bounce keeps
const FIRE_GROW = 0.3; // the share of the flash's life it takes to reach its full size
const COLUMN_GROW = 0.18; // the share of the column's life it takes to reach its full height

export const BOOM_MESH_NAME = 'sb-boom'; // each mesh is `${BOOM_MESH_NAME}-fire`, `-smoke`, ...

interface FireSlot {
  live: boolean;
  age: number;
  life: number;
  radius: number;
  x: number;
  y: number;
  z: number;
  color: number;
}

interface SmokeSlot {
  live: boolean;
  age: number;
  delay: number; // before this the puff has not left the ground yet (s)
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

interface DebrisSlot {
  live: boolean;
  age: number;
  life: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  size: number;
  color: number;
}

interface ColumnSlot {
  live: boolean;
  age: number;
  life: number;
  x: number;
  y: number;
  z: number;
  height: number;
  radius: number;
  color: number;
}

interface BoomPools {
  group: THREE.Group;
  fire: THREE.InstancedMesh;
  smoke: THREE.InstancedMesh;
  debris: THREE.InstancedMesh;
  sand: THREE.InstancedMesh;
  water: THREE.InstancedMesh;
}

const fires: FireSlot[] = Array.from({ length: BOOM_CAP.fire }, () => emptyFire());
const smokes: SmokeSlot[] = Array.from({ length: BOOM_CAP.smoke }, () => emptySmoke());
const debris: DebrisSlot[] = Array.from({ length: BOOM_CAP.debris }, () => emptyDebris());
const sands: ColumnSlot[] = Array.from({ length: BOOM_CAP.column }, () => emptyColumn());
const waters: ColumnSlot[] = Array.from({ length: BOOM_CAP.column }, () => emptyColumn());
let fireNext = 0;
let smokeNext = 0;
let debrisNext = 0;
let sandNext = 0;
let waterNext = 0;
let pools: BoomPools | null = null;
let seaZ = Number.POSITIVE_INFINITY; // the sea begins at this z; before buildBooms nothing is over it

function emptyFire(): FireSlot {
  return { live: false, age: 0, life: 0, radius: 0, x: 0, y: 0, z: 0, color: 0 };
}

function emptySmoke(): SmokeSlot {
  return {
    live: false,
    age: 0,
    delay: 0,
    life: 0,
    x: 0,
    y: 0,
    z: 0,
    rise: 0,
    size: 0,
    grow: 0,
    color: 0,
    fade: 0,
  };
}

function emptyDebris(): DebrisSlot {
  return { live: false, age: 0, life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, gravity: 0, size: 0, color: 0 };
}

function emptyColumn(): ColumnSlot {
  return { live: false, age: 0, life: 0, x: 0, y: 0, z: 0, height: 0, radius: 0, color: 0 };
}

// An instanced mesh with a white base, so the instance's own colour is what shows; the colours are made before the first
// draw because three r128 creates the buffer inside setColorAt.
function poolMesh(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  capacity: number,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = `${BOOM_MESH_NAME}-${name}`;
  const white = new THREE.Color(0xffffff);
  for (let i = 0; i < capacity; i++) mesh.setColorAt(i, white);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.visible = false;
  return mesh;
}

function ensurePools(): BoomPools {
  if (pools) {
    if (!pools.group.parent) scene.add(pools.group);
    return pools;
  }
  const group = new THREE.Group();
  group.name = 'sbBooms';
  // the flash is see-through so its own colour reads; the smoke does not write depth either
  const fire = poolMesh(
    'fire',
    new THREE.SphereGeometry(1, 12, 8),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    }),
    BOOM_CAP.fire,
  );
  const smoke = poolMesh(
    'smoke',
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: SMOKE_OPACITY, depthWrite: false }),
    BOOM_CAP.smoke,
  );
  const debris = poolMesh(
    'debris',
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    BOOM_CAP.debris,
  );
  const sand = poolMesh(
    'sand',
    new THREE.CylinderGeometry(0.3, 1, 1, 10).translate(0, 0.5, 0),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    BOOM_CAP.column,
  );
  const water = poolMesh(
    'water',
    new THREE.CylinderGeometry(0.12, 1, 1, 10).translate(0, 0.5, 0),
    new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: WATER_OPACITY, depthWrite: false }),
    BOOM_CAP.column,
  );
  group.add(fire, smoke, debris, sand, water);
  scene.add(group);
  pools = { group, fire, smoke, debris, sand, water };
  return pools;
}

// Sets the sea's edge for the blasts of this map: past it the ground column is water. The sortie and #view-boom call it
// when they build their scene; it also clears what the last scene left.
export function buildBooms(bounds: MapBounds): void {
  seaZ = bounds.maxZ;
  ensurePools();
  clearBooms();
}

function fireAt(x: number, y: number, z: number, radius: number, life: number, color: number): void {
  const slot = fires[fireNext];
  fireNext = (fireNext + 1) % fires.length;
  slot.live = true;
  slot.age = 0;
  slot.life = life;
  slot.radius = radius;
  slot.x = x;
  slot.y = y;
  slot.z = z;
  slot.color = color;
}

function smokeAt(
  x: number,
  y: number,
  z: number,
  delay: number,
  rise: number,
  size: number,
  grow: number,
  life: number,
  color: number,
  fade: number,
): void {
  const slot = smokes[smokeNext];
  smokeNext = (smokeNext + 1) % smokes.length;
  slot.live = true;
  slot.age = 0;
  slot.delay = delay;
  slot.life = life;
  slot.x = x;
  slot.y = y;
  slot.z = z;
  slot.rise = rise;
  slot.size = size;
  slot.grow = grow;
  slot.color = color;
  slot.fade = fade;
}

function debrisAt(
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  gravity: number,
  life: number,
  size: number,
  color: number,
): void {
  const slot = debris[debrisNext];
  debrisNext = (debrisNext + 1) % debris.length;
  slot.live = true;
  slot.age = 0;
  slot.life = life;
  slot.x = x;
  slot.y = y;
  slot.z = z;
  slot.vx = vx;
  slot.vy = vy;
  slot.vz = vz;
  slot.gravity = gravity;
  slot.size = size;
  slot.color = color;
}

function columnAt(
  slot: ColumnSlot,
  x: number,
  y: number,
  z: number,
  height: number,
  radius: number,
  life: number,
  color: number,
): void {
  slot.live = true;
  slot.age = 0;
  slot.life = life;
  slot.x = x;
  slot.y = y;
  slot.z = z;
  slot.height = height;
  slot.radius = radius;
  slot.color = color;
}

const spread = (radius: number): number => Math.sqrt(Math.random()) * radius * (Math.random() < 0.5 ? -1 : 1);

// Blows up at a place (m). Over the sea a blast lifts a column of water instead of sand.
export function spawnBoom(kind: BoomKind, x: number, y: number, z: number): void {
  ensurePools();
  const def = BOOM_DEFS[kind];

  fireAt(x, y, z, def.fire.radius, def.fire.life, def.fire.color);

  const smokeCount = Math.max(0, Math.round(def.smoke.count));
  for (let i = 0; i < smokeCount; i++) {
    // the puffs leave the ground a few at a time, so the column rises instead of appearing all at once
    const delay = smokeCount > 1 ? (SMOKE_EMIT * i) / smokeCount : 0;
    smokeAt(
      x + spread(def.smoke.spread),
      y,
      z + spread(def.smoke.spread),
      delay,
      def.smoke.rise * (0.7 + Math.random() * 0.6),
      def.smoke.size * (0.7 + Math.random() * 0.6),
      def.smoke.grow,
      def.smoke.life * (0.9 + Math.random() * 0.25),
      def.smoke.color,
      def.smoke.fade,
    );
  }

  const debrisCount = Math.max(0, Math.round(def.debris.count));
  for (let i = 0; i < debrisCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const up = Math.random() * 2 - 1;
    const side = Math.sqrt(1 - up * up);
    const speed = def.debris.speed * (0.35 + Math.random() * 0.75);
    debrisAt(
      x,
      y,
      z,
      Math.cos(angle) * side * speed,
      up * speed + def.debris.speed * 0.45,
      Math.sin(angle) * side * speed,
      def.debris.gravity,
      def.debris.life * (0.7 + Math.random() * 0.6),
      def.debris.size * (0.7 + Math.random() * 0.7),
      def.debris.color,
    );
  }

  if (kind === 'water' || z >= seaZ) {
    const slot = waters[waterNext];
    waterNext = (waterNext + 1) % waters.length;
    // the water's colour is the sea's own, whatever kind of blast lifted it
    columnAt(slot, x, y, z, def.column.height, def.column.radius, def.column.life, BOOM_DEFS.water.column.color);
  } else {
    const slot = sands[sandNext];
    sandNext = (sandNext + 1) % sands.length;
    columnAt(slot, x, y, z, def.column.height, def.column.radius, def.column.life, def.column.color);
  }
}

const dummy = new THREE.Object3D();
const tint = new THREE.Color();
const fadeTint = new THREE.Color();

function drawFire(mesh: THREE.InstancedMesh, dt: number): number {
  let n = 0;
  for (const slot of fires) {
    if (!slot.live) continue;
    slot.age += dt;
    if (slot.age >= slot.life) {
      slot.live = false;
      continue;
    }
    const u = slot.age / slot.life;
    const grow = Math.min(1, u / FIRE_GROW);
    const fade = u < 0.5 ? 1 : Math.max(0, 1 - (u - 0.5) / 0.5);
    dummy.position.set(slot.x, slot.y, slot.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(Math.max(0.001, slot.radius * grow * fade));
    dummy.updateMatrix();
    mesh.setMatrixAt(n, dummy.matrix);
    mesh.setColorAt(n, tint.setHex(slot.color));
    n++;
  }
  return n;
}

function drawSmoke(mesh: THREE.InstancedMesh, dt: number): number {
  let n = 0;
  for (const slot of smokes) {
    if (!slot.live) continue;
    slot.age += dt;
    const local = slot.age - slot.delay;
    if (local < 0) continue;
    if (local >= slot.life) {
      slot.live = false;
      continue;
    }
    slot.y += slot.rise * dt;
    const k = local / slot.life;
    dummy.position.set(slot.x, slot.y, slot.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(slot.size * (1 + slot.grow * k));
    dummy.updateMatrix();
    mesh.setMatrixAt(n, dummy.matrix);
    mesh.setColorAt(n, tint.setHex(slot.color).lerp(fadeTint.setHex(slot.fade), k));
    n++;
  }
  return n;
}

function drawDebris(mesh: THREE.InstancedMesh, dt: number): number {
  let n = 0;
  for (const slot of debris) {
    if (!slot.live) continue;
    slot.age += dt;
    if (slot.age >= slot.life) {
      slot.live = false;
      continue;
    }
    slot.vy -= slot.gravity * dt;
    slot.x += slot.vx * dt;
    slot.y += slot.vy * dt;
    slot.z += slot.vz * dt;
    if (slot.y < GROUND) {
      slot.y = GROUND;
      slot.vy *= -BOUNCE;
      slot.vx *= 0.6;
      slot.vz *= 0.6;
    }
    dummy.position.set(slot.x, slot.y, slot.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(slot.size);
    dummy.updateMatrix();
    mesh.setMatrixAt(n, dummy.matrix);
    mesh.setColorAt(n, tint.setHex(slot.color));
    n++;
  }
  return n;
}

function drawColumns(mesh: THREE.InstancedMesh, slots: ColumnSlot[], dt: number): number {
  let n = 0;
  for (const slot of slots) {
    if (!slot.live) continue;
    slot.age += dt;
    if (slot.age >= slot.life) {
      slot.live = false;
      continue;
    }
    const u = slot.age / slot.life;
    const grow = Math.min(1, u / COLUMN_GROW);
    // the column climbs to its height, holds, then falls back and thins to nothing
    const fall = u < 0.6 ? 1 : Math.max(0, 1 - (u - 0.6) / 0.4);
    const width = slot.radius * grow * (0.5 + 0.5 * fall);
    dummy.position.set(slot.x, slot.y, slot.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(width, slot.height * grow * fall, width);
    dummy.updateMatrix();
    mesh.setMatrixAt(n, dummy.matrix);
    mesh.setColorAt(n, tint.setHex(slot.color));
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

// Moves every blast on by a frame and writes what is left into the pools' instances. Call it once a frame, after the
// game has spawned the frame's blasts.
export function drawBooms(dt: number): void {
  const p = ensurePools();
  const span = Math.max(0, dt);
  show(p.fire, drawFire(p.fire, span));
  show(p.smoke, drawSmoke(p.smoke, span));
  show(p.debris, drawDebris(p.debris, span));
  show(p.sand, drawColumns(p.sand, sands, span));
  show(p.water, drawColumns(p.water, waters, span));
}

// How many of each kind are on screen now (the views and the unit tests read it).
export function boomCounts(): { fire: number; smoke: number; debris: number; sand: number; water: number } {
  const live = <T extends { live: boolean }>(slots: readonly T[]): number => slots.filter(slot => slot.live).length;
  return {
    fire: live(fires),
    smoke: live(smokes),
    debris: live(debris),
    sand: live(sands),
    water: live(waters),
  };
}

// Takes every blast off the screen at once (a new sortie or a new #view-boom scene).
export function clearBooms(): void {
  for (const slots of [fires, smokes, debris, sands, waters]) for (const slot of slots) slot.live = false;
  fireNext = 0;
  smokeNext = 0;
  debrisNext = 0;
  sandNext = 0;
  waterNext = 0;
  if (!pools) return;
  for (const mesh of [pools.fire, pools.smoke, pools.debris, pools.sand, pools.water]) show(mesh, 0);
}

// Takes the pools out of the scene and frees them (the sortie's end).
export function removeBooms(): void {
  if (!pools) return;
  scene.remove(pools.group);
  disposeTree(pools.group);
  for (const mesh of [pools.fire, pools.smoke, pools.debris, pools.sand, pools.water]) mesh.dispose();
  pools = null;
  clearBooms();
}
