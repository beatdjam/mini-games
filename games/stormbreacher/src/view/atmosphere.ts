// The air over the beach (SB-1440): the drifting smoke columns, the low haze, the fire on the wrecks and the screen's
// grade. Everything of one kind is one InstancedMesh made once when the map is built, so a frame makes no mesh,
// geometry or material; the puffs and flames are billboards with the one soft patch from view/puff.ts. The values come
// from data/atmosphere.ts and are read every frame, so #view-map's panel shows a change at once. This file only draws:
// it touches no game state.
import * as THREE from 'three';
import { addSystem, clamp, createRng } from '@engine/core/index.ts';
import { camera, disposeTree, renderer, scene } from '@engine/render/index.ts';
import {
  ATMOSPHERE_FIRES,
  ATMOSPHERE_LIGHT,
  ATMOSPHERE_PLUMES,
  ATMOSPHERE_TUNE,
  type PlumePlace,
} from '../data/atmosphere.ts';
import {
  FIRE_CORE_COLOR,
  FIRE_FLAME_COLOR,
  FIRE_GLOW_COLOR,
  HAZE_COLOR,
  LIGHT_GROUND_COLOR,
  LIGHT_SKY_COLOR,
  LIGHT_SUN_COLOR,
  PLUME_FADE_COLOR,
  PLUME_SMOKE_COLOR,
} from '../data/colors.ts';
import { BASE_LIGHTS } from '../data/looks.ts';
import type { MapDef } from '../data/types.ts';
import { softDiscTexture } from './puff.ts';

const GROUP_NAME = 'sbAtmosphere';
const MESH_NAME = 'sb-atmosphere';
const HAZE_MAX = 8; // the most haze sheets the pools room for (the panel stops at the same number)
const HAZE_MARGIN = 40; // how far past the map's sides a sheet may wander (m)
const GLOW_Y = 0.07; // how high the warm pool lies above the ground (m)
const GRAIN_TILE = 96; // the noise picture's side (px)
const PLUME_FADE_FROM = 0.8; // the share of a puff's life where it starts to shrink away
const SEED = 0x1440a11e; // the look's own stream, so the game's random sequence is untouched

interface Puff {
  live: boolean;
  age: number;
  life: number;
  x: number;
  y: number;
  z: number;
  rise: number; // how fast this puff climbs (m/s)
  drift: number; // its share of the wind, so a column is not one stiff line
  size: number;
  grow: number;
}

interface Flame {
  live: boolean;
  age: number;
  life: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  size: number;
  flicker: number; // the phase of its dance
}

interface Fire {
  x: number;
  y: number;
  z: number;
  next: number; // seconds until its next flame (s)
  smoke: number; // seconds until its next puff (s); a table fire's smoke comes from its column instead
  dynamic: boolean; // a thing broken in play, which needs its own smoke
}

interface Atmosphere {
  group: THREE.Group;
  plumes: THREE.InstancedMesh;
  flames: THREE.InstancedMesh;
  glows: THREE.InstancedMesh;
  haze: THREE.InstancedMesh;
  plumePlaces: readonly PlumePlace[];
  fires: Fire[];
  columnNext: number[]; // each column's seconds until its next puff (s)
  hazeAt: number[]; // each sheet's starting place along the map's width (m)
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  clock: number;
}

interface ScreenFx {
  root: HTMLDivElement; // the vignette's layer (#sbAtmosphere)
  vignette: HTMLDivElement;
  grain: HTMLDivElement; // a layer of its own on body, so its overlay blend reaches the canvas
}

const rng = createRng(SEED);
let current: Atmosphere | null = null;
let screen: ScreenFx | null = null;
let systemAdded = false;
let plumeNext = 0;
let flameNext = 0;
// The look's own filter terms (view/look.ts), with the grade's added after them.
let baseFilter = '';
// Whether a map's air is built. The grade is the air's, so a page without air (a dev view asked for no effects) keeps
// the look's own filter alone.
let gradeOn = false;

const puffs: Puff[] = [];
const flames: Flame[] = [];

function emptyPuff(): Puff {
  return { live: false, age: 0, life: 0, x: 0, y: 0, z: 0, rise: 0, drift: 0, size: 0, grow: 0 };
}

function emptyFlame(): Flame {
  return { live: false, age: 0, life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, size: 0, flicker: 0 };
}

// The first dead slot from `next` on, or -1 when every slot is live: a full pool drops the new part instead of taking
// one still in use (which would make it vanish mid-life).
export function freeOf(slots: readonly { live: boolean }[], next: number): number {
  for (let i = 0; i < slots.length; i++) {
    const at = (next + i) % slots.length;
    if (!slots[at].live) return at;
  }
  return -1;
}

function poolMesh(
  name: string,
  material: THREE.MeshBasicMaterial,
  geometry: THREE.BufferGeometry,
  capacity: number,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = `${MESH_NAME}-${name}`;
  const white = new THREE.Color(0xffffff);
  for (let i = 0; i < capacity; i++) mesh.setColorAt(i, white);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.visible = false;
  // the haze lies over the far sand, the smoke over it and the fire last, so the soft edges stack in that order
  mesh.renderOrder = name === 'haze' ? 1 : name === 'plume' ? 2 : name === 'glow' ? 3 : 4;
  return mesh;
}

function discMaterial(opacity: number, toneMapped = true, additive = false): THREE.MeshBasicMaterial {
  const disc = softDiscTexture();
  return new THREE.MeshBasicMaterial({
    ...(disc ? { map: disc } : {}),
    color: 0xffffff,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped,
    ...(additive ? { blending: THREE.AdditiveBlending } : {}),
  });
}

// The lights a built map stands under: the overcast fill from above, the dark bounce from the sand, and one low warm
// sun. Set in place on the field's own lights, so no light is added and a look still scales the same two.
export function applyAtmosphereLight(): void {
  scene.traverse(object => {
    if (object instanceof THREE.HemisphereLight) {
      object.color.setHex(LIGHT_SKY_COLOR);
      object.groundColor.setHex(LIGHT_GROUND_COLOR);
      object.intensity = ATMOSPHERE_LIGHT.hemi;
    } else if (object instanceof THREE.DirectionalLight) {
      object.color.setHex(LIGHT_SUN_COLOR);
      object.intensity = ATMOSPHERE_LIGHT.sun;
      object.position.set(...BASE_LIGHTS.sunAt);
    }
  });
}

// The canvas's part of the screen grade (5): a little less colour, a little more contrast and a warm cast. 0 leaves the
// filter alone; view/look.ts puts these terms after the look's own, while a map's air is built.
export function gradeFilterCss(): string {
  const grade = clamp(ATMOSPHERE_TUNE.grade, 0, 1);
  if (grade <= 0) return '';
  const saturate = 1 - 0.16 * grade;
  const contrast = 1 + 0.14 * grade;
  const sepia = 0.1 * grade;
  return `saturate(${saturate}) contrast(${contrast}) sepia(${sepia})`;
}

// The look's filter without the grade, so the grade can be replaced when the panel moves it. Called by view/look.ts.
export function setGradeBase(filter: string): void {
  baseFilter = filter;
}

export function refreshGradeFilter(): void {
  if (!renderer) return; // the unit tests run without a page
  const style = renderer.domElement.style;
  style.filter = [baseFilter, gradeOn ? gradeFilterCss() : ''].filter(value => value !== '').join(' ');
}

// A small tile of grey noise for the grain layer, made once and repeated by the browser.
function grainUrl(): string {
  const canvas = document.createElement('canvas');
  canvas.width = GRAIN_TILE;
  canvas.height = GRAIN_TILE;
  const g = canvas.getContext('2d');
  if (!g) return '';
  const pixels = g.createImageData(GRAIN_TILE, GRAIN_TILE);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const value = 92 + Math.round(rng.next() * 74);
    pixels.data[i] = value;
    pixels.data[i + 1] = value;
    pixels.data[i + 2] = value;
    pixels.data[i + 3] = 255;
  }
  g.putImageData(pixels, 0, 0);
  return canvas.toDataURL();
}

function ensureScreen(): ScreenFx | null {
  if (typeof document === 'undefined') return null;
  if (screen) return screen;
  const root = document.createElement('div');
  root.id = 'sbAtmosphere';
  // above the canvas, below the HUD (5) and the cutscene's bars (6); buildHurtView's edge (4) is made after it
  root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;overflow:hidden';
  const vignette = document.createElement('div');
  vignette.style.cssText =
    'position:absolute;inset:0;background:radial-gradient(ellipse at 50% 48%,rgba(3,5,8,0) 40%,rgba(3,5,8,0.9) 100%)';
  // The grain is a layer of its own on the body: inside #sbAtmosphere its overlay blend would see the vignette alone and
  // never the canvas. It is one tile wider on every side than the screen, so moving it by up to a tile leaves no edge.
  const grain = document.createElement('div');
  grain.id = 'sbAtmosphereGrain';
  grain.style.cssText =
    `position:fixed;inset:-${GRAIN_TILE}px;pointer-events:none;z-index:4;` +
    'background-repeat:repeat;image-rendering:pixelated;mix-blend-mode:overlay;will-change:transform';
  const url = grainUrl();
  if (url) grain.style.backgroundImage = `url(${url})`;
  root.append(vignette);
  document.body.append(root, grain);
  screen = { root, vignette, grain };
  applyAtmosphereScreen();
  return screen;
}

// The strengths the panel turns for the page's layers: the dark edge and the film grain. 0 hides its layer.
export function applyAtmosphereScreen(): void {
  const view = ensureScreen();
  if (!view) return;
  const vignette = clamp(ATMOSPHERE_TUNE.vignette, 0, 1);
  const grain = clamp(ATMOSPHERE_TUNE.grain, 0, 1);
  view.root.style.display = vignette > 0 ? '' : 'none';
  view.vignette.style.opacity = String(vignette);
  view.grain.style.display = grain > 0 ? '' : 'none';
  view.grain.style.opacity = String(grain * 0.2);
}

// Re-applies what is not drawn every frame: the page's layers, the canvas's grade and the map's lights. #view-map calls
// it from the panel's onChange.
export function applyAtmosphere(): void {
  applyAtmosphereLight();
  applyAtmosphereScreen();
  refreshGradeFilter();
}

function spawnPuff(x: number, y: number, z: number, age = 0): number {
  const tune = ATMOSPHERE_TUNE;
  const at = freeOf(puffs, plumeNext);
  if (at < 0) return -1; // a full pool drops this puff; the live ones keep their life
  plumeNext = (at + 1) % puffs.length;
  const slot = puffs[at];
  slot.live = true;
  slot.age = age;
  slot.life = tune.plumeLife;
  // a little sideways scatter at the foot, so a column is a body of smoke and not one line of puffs
  slot.x = x + (rng.next() - 0.5) * 1.6;
  slot.y = y;
  slot.z = z + (rng.next() - 0.5) * 1.6;
  slot.rise = tune.rise * (0.7 + rng.next() * 0.6);
  slot.drift = 0.55 + rng.next() * 0.9;
  slot.size = tune.plumeSize * (0.75 + rng.next() * 0.5);
  slot.grow = tune.plumeGrow;
  return at;
}

function spawnFlame(fire: Fire): number {
  const tune = ATMOSPHERE_TUNE;
  const at = freeOf(flames, flameNext);
  if (at < 0) return -1; // a full pool drops this flame
  flameNext = (at + 1) % flames.length;
  const slot = flames[at];
  slot.live = true;
  slot.age = 0;
  slot.life = tune.flameLife * (0.7 + rng.next() * 0.6);
  slot.x = fire.x + (rng.next() - 0.5) * 2.6;
  slot.y = fire.y + (rng.next() - 0.5) * 0.7;
  slot.z = fire.z + (rng.next() - 0.5) * 1.6;
  slot.vx = (rng.next() - 0.5) * 0.8;
  slot.vy = tune.flameRise * (0.7 + rng.next() * 0.7);
  slot.size = tune.flameSize * (0.6 + rng.next() * 0.7);
  slot.flicker = rng.next() * Math.PI * 2;
  return at;
}

// A column's first puffs, spread over a whole life, so the air is already full on the first frame.
function prefill(place: PlumePlace): void {
  const tune = ATMOSPHERE_TUNE;
  const count = Math.min(40, Math.floor(tune.plumeLife / Math.max(0.1, tune.columnEvery)));
  for (let i = 0; i < count; i++) {
    spawnPuff(place.x, place.y, place.z, (i / count) * tune.plumeLife);
  }
}

function prefillFlame(fire: Fire): void {
  const count = Math.min(12, Math.floor(ATMOSPHERE_TUNE.flameLife / Math.max(0.02, ATMOSPHERE_TUNE.flameEvery)));
  for (let i = 0; i < count; i++) {
    const at = spawnFlame(fire);
    if (at < 0) return;
    flames[at].age = (i / count) * flames[at].life;
  }
}

// Builds the air into the scene for a map. A new map replaces the last one's air; the pools are made at their caps from
// the table, so a slider only changes how much of them is used.
export function buildAtmosphere(map: MapDef): void {
  removeAtmosphere();
  applyAtmosphereLight();

  const tune = ATMOSPHERE_TUNE;
  const plumeCap = Math.max(1, Math.round(tune.plumeCap));
  const flameCap = Math.max(1, Math.round(tune.flameCap));
  const glowCap = Math.max(1, ATMOSPHERE_FIRES.length + Math.round(tune.burnFires));
  const group = new THREE.Group();
  group.name = GROUP_NAME;

  const plumes = poolMesh('plume', discMaterial(tune.plumeOpacity), new THREE.PlaneGeometry(1, 1), plumeCap);
  const flamesMesh = poolMesh('flame', discMaterial(1, false, true), new THREE.PlaneGeometry(1, 1), flameCap);
  const glows = poolMesh(
    'glow',
    discMaterial(tune.glowOpacity, false, true),
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    glowCap,
  );
  const haze = poolMesh('haze', discMaterial(tune.hazeOpacity), new THREE.PlaneGeometry(1, 1), HAZE_MAX);
  (haze.material as THREE.MeshBasicMaterial).color.setHex(HAZE_COLOR);
  group.add(haze, plumes, glows, flamesMesh);
  scene.add(group);

  puffs.length = 0;
  for (let i = 0; i < plumeCap; i++) puffs.push(emptyPuff());
  flames.length = 0;
  for (let i = 0; i < flameCap; i++) flames.push(emptyFlame());
  plumeNext = 0;
  flameNext = 0;

  const fires: Fire[] = ATMOSPHERE_FIRES.map(place => ({
    x: place.x,
    y: place.y,
    z: place.z,
    next: rng.next() * Math.max(0.02, tune.flameEvery),
    smoke: 0,
    dynamic: false,
  }));

  const hazeAt: number[] = [];
  for (let i = 0; i < HAZE_MAX; i++) {
    hazeAt.push((i / HAZE_MAX) * (map.bounds.maxX - map.bounds.minX + HAZE_MARGIN * 2));
  }

  current = {
    group,
    plumes,
    flames: flamesMesh,
    glows,
    haze,
    plumePlaces: ATMOSPHERE_PLUMES,
    fires,
    columnNext: ATMOSPHERE_PLUMES.map(() => rng.next() * Math.max(0.1, tune.columnEvery)),
    hazeAt,
    minX: map.bounds.minX,
    maxX: map.bounds.maxX,
    minZ: map.bounds.minZ,
    maxZ: map.bounds.maxZ,
    clock: 0,
  };

  const columns = clamp(Math.round(tune.columns), 0, ATMOSPHERE_PLUMES.length);
  for (let i = 0; i < columns; i++) prefill(ATMOSPHERE_PLUMES[i]);
  for (let i = 0; i < fires.length && i < tune.fires; i++) prefillFlame(fires[i]);
  ensureScreen();
  // a page without a look (the map views) still gets the beach's grade on the canvas
  gradeOn = true;
  refreshGradeFilter();

  if (!systemAdded) {
    systemAdded = true;
    // after the views have moved the camera for the frame, so the billboards face where it now looks. It runs in the
    // sortie, the title (the dev views walk their map there) and the result, but not while paused.
    addSystem({
      name: 'sb-atmosphere',
      order: 20,
      modes: ['play', 'title', 'result'],
      update: drawAtmosphere,
    });
  }
}

const dummy = new THREE.Object3D();
const fresh = new THREE.Color(PLUME_SMOKE_COLOR);
const faded = new THREE.Color(PLUME_FADE_COLOR);
const tint = new THREE.Color();
const core = new THREE.Color(FIRE_CORE_COLOR);
const flameTint = new THREE.Color(FIRE_FLAME_COLOR);
const glowTint = new THREE.Color(FIRE_GLOW_COLOR);

function show(mesh: THREE.InstancedMesh, count: number): void {
  mesh.count = count;
  mesh.visible = count > 0;
  if (count > 0) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

function stepEmitters(view: Atmosphere, dt: number): void {
  const tune = ATMOSPHERE_TUNE;
  const columns = clamp(Math.round(tune.columns), 0, view.plumePlaces.length);
  for (let i = 0; i < columns; i++) {
    view.columnNext[i] -= dt;
    while (view.columnNext[i] <= 0) {
      const place = view.plumePlaces[i];
      spawnPuff(place.x, place.y, place.z);
      view.columnNext[i] += Math.max(0.1, tune.columnEvery);
    }
  }
  for (let i = 0; i < view.fires.length; i++) {
    const fire = view.fires[i];
    if (!fire.dynamic && i >= tune.fires) continue;
    fire.next -= dt;
    while (fire.next <= 0) {
      spawnFlame(fire);
      fire.next += Math.max(0.02, tune.flameEvery);
    }
    if (!fire.dynamic) continue;
    fire.smoke -= dt;
    if (fire.smoke <= 0) {
      spawnPuff(fire.x, fire.y + 0.6, fire.z);
      fire.smoke += Math.max(0.1, tune.burnSmokeEvery);
    }
  }
}

// How much of its size a puff keeps at `k` (its age over its life): the last fifth shrinks it away, so a puff is
// unseen before its life ends instead of a large pale sheet going out at full opacity.
export function plumeFade(k: number): number {
  return k <= PLUME_FADE_FROM ? 1 : Math.max(0, 1 - (k - PLUME_FADE_FROM) / (1 - PLUME_FADE_FROM));
}

function drawPlumes(view: Atmosphere): void {
  const tune = ATMOSPHERE_TUNE;
  const mesh = view.plumes;
  (mesh.material as THREE.MeshBasicMaterial).opacity = tune.plumeOpacity;
  let n = 0;
  for (const slot of puffs) {
    if (!slot.live) continue;
    const k = slot.age / slot.life;
    if (k >= 1) {
      slot.live = false;
      continue;
    }
    const x = slot.x + tune.windX * slot.drift * slot.age;
    const y = slot.y + slot.rise * slot.age;
    const z = slot.z + tune.windZ * slot.drift * slot.age;
    dummy.position.set(x, y, z);
    dummy.quaternion.copy(camera.quaternion);
    dummy.scale.setScalar(Math.max(0.001, slot.size * (1 + slot.grow * k) * plumeFade(k)));
    dummy.updateMatrix();
    mesh.setMatrixAt(n, dummy.matrix);
    mesh.setColorAt(n, tint.copy(fresh).lerp(faded, k));
    n++;
  }
  show(mesh, n);
}

function drawFlames(view: Atmosphere): void {
  const tune = ATMOSPHERE_TUNE;
  const mesh = view.flames;
  let n = 0;
  for (const slot of flames) {
    if (!slot.live) continue;
    const k = slot.age / slot.life;
    if (k >= 1) {
      slot.live = false;
      continue;
    }
    const x = slot.x + slot.vx * slot.age;
    const y = slot.y + slot.vy * slot.age;
    const dance = 1 + tune.flameFlicker * Math.sin(view.clock * 17 + slot.flicker);
    const fade = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    dummy.position.set(x, y, slot.z);
    dummy.quaternion.copy(camera.quaternion);
    dummy.scale.setScalar(Math.max(0.001, slot.size * dance * (0.55 + 0.45 * (1 - k)) * fade));
    dummy.updateMatrix();
    mesh.setMatrixAt(n, dummy.matrix);
    mesh.setColorAt(n, tint.copy(core).lerp(flameTint, clamp(k * 1.4, 0, 1)));
    n++;
  }
  show(mesh, n);
}

function drawGlows(view: Atmosphere): void {
  const tune = ATMOSPHERE_TUNE;
  const mesh = view.glows;
  (mesh.material as THREE.MeshBasicMaterial).opacity = tune.glowOpacity;
  let n = 0;
  for (let i = 0; i < view.fires.length; i++) {
    const fire = view.fires[i];
    if (!fire.dynamic && i >= tune.fires) continue;
    const dance = 1 + 0.07 * Math.sin(view.clock * 7 + i * 1.7);
    dummy.position.set(fire.x, GLOW_Y, fire.z);
    dummy.quaternion.identity();
    dummy.scale.setScalar(tune.glowSize * dance);
    dummy.updateMatrix();
    mesh.setMatrixAt(n, dummy.matrix);
    mesh.setColorAt(n, glowTint);
    n++;
  }
  show(mesh, n);
}

function drawHaze(view: Atmosphere): void {
  const tune = ATMOSPHERE_TUNE;
  const mesh = view.haze;
  const material = mesh.material as THREE.MeshBasicMaterial;
  material.opacity = tune.hazeOpacity;
  const count = clamp(Math.round(tune.hazeSheets), 0, HAZE_MAX);
  const span = view.maxX - view.minX + HAZE_MARGIN * 2;
  const depth = view.maxZ - view.minZ;
  for (let i = 0; i < count; i++) {
    let offset = (view.hazeAt[i] + view.clock * tune.hazeDrift) % span;
    if (offset < 0) offset += span;
    const x = view.minX - HAZE_MARGIN + offset;
    const z = view.minZ + ((i + 0.5) / HAZE_MAX) * depth;
    dummy.position.set(x, tune.hazeY, z);
    dummy.rotation.set(0, Math.atan2(camera.position.x - x, camera.position.z - z), 0);
    dummy.scale.set(tune.hazeWidth, tune.hazeHeight, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  show(mesh, count > 0 && tune.hazeOpacity > 0 ? count : 0);
}

// Moves the air on by a frame and writes it into the pools' instances. Call it once a frame, after the camera has moved.
export function drawAtmosphere(dt: number): void {
  const view = current;
  if (!view) return;
  const span = Math.max(0, dt);
  view.clock += span;
  stepEmitters(view, span);
  for (const slot of puffs) if (slot.live) slot.age += span;
  for (const slot of flames) if (slot.live) slot.age += span;
  drawHaze(view);
  drawPlumes(view);
  drawGlows(view);
  drawFlames(view);
  if (screen && ATMOSPHERE_TUNE.grain > 0) {
    // transform, not background-position: the position change redraws the whole-screen layer every frame, while a
    // transform is composited. The layer is a tile wider on every side, so a step of up to a tile shows no edge.
    const x = Math.round((view.clock * 61) % GRAIN_TILE);
    const y = Math.round((view.clock * 37) % GRAIN_TILE);
    screen.grain.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }
}

// What the pools hold now, for the tests and the dev screens: the live puffs and flames, and the fires (the table's
// plus those broken in play).
export function atmosphereCounts(): { puffs: number; flames: number; fires: number } {
  let livePuffs = 0;
  for (const slot of puffs) if (slot.live) livePuffs++;
  let liveFlames = 0;
  for (const slot of flames) if (slot.live) liveFlames++;
  return { puffs: livePuffs, flames: liveFlames, fires: current ? current.fires.length : 0 };
}

// Lets a thing broken in play keep a fire of its own (a prop's wreck). The cap is the table's burnFires; the same place
// is not lit twice.
export function burnAtmosphere(x: number, z: number, y = 0.6): void {
  const view = current;
  if (!view) return;
  if (view.fires.filter(fire => fire.dynamic).length >= ATMOSPHERE_TUNE.burnFires) return;
  if (view.fires.some(fire => Math.abs(fire.x - x) < 1 && Math.abs(fire.z - z) < 1)) return;
  view.fires.push({ x, y, z, next: 0, smoke: 0, dynamic: true });
  spawnPuff(x, y + 0.6, z);
}

// Takes the air out of the scene and frees it (a new sortie or a new map view), with the page's grade layers.
export function removeAtmosphere(): void {
  if (current) {
    scene.remove(current.group);
    disposeTree(current.group);
    for (const mesh of [current.plumes, current.flames, current.glows, current.haze]) mesh.dispose();
    current = null;
  }
  if (screen) {
    screen.root.remove();
    screen.grain.remove();
    screen = null;
  }
  puffs.length = 0;
  flames.length = 0;
  plumeNext = 0;
  flameNext = 0;
  // the canvas's grade was the air's: go back to the look's own filter alone (a title return inside the page keeps it)
  gradeOn = false;
  baseFilter = '';
  refreshGradeFilter();
}
