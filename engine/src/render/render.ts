import * as THREE from 'three';
import { el, isTouch } from '../core/util.ts';
// engine: three.js setup: renderer on canvas#gl, scene, camera, resize, shared materials, disposal, text sprites, and the in-hand viewmodel pass
const BG_COLOR = 0x061219; // fog and background
const FOV_LANDSCAPE = 72; // vertical field of view (deg) on a wide window
const FOV_PORTRAIT = 90; // ... on a tall window (width < height)
// a sky/ground light and one directional light, added to `target`; sunPos is where the directional light sits
function addLights(target: THREE.Scene, sunPos: [number, number, number]): THREE.DirectionalLight {
  target.add(new THREE.HemisphereLight(0xcfefff, 0x141c26, 1.0));
  const light = new THREE.DirectionalLight(0xffffff, 0.45);
  light.position.set(...sunPos);
  target.add(light);
  return light;
}
export const canvas = el<HTMLCanvasElement>('#gl');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(BG_COLOR, 4, 44);
scene.background = new THREE.Color(BG_COLOR);
export const camera = new THREE.PerspectiveCamera(FOV_LANDSCAPE, 1, 0.05, 140);
camera.rotation.order = 'YXZ';
scene.add(camera);
export const sun = addLights(scene, [3, 10, 2]);
export const dynGroup = new THREE.Group();
scene.add(dynGroup);
export const V3 = THREE.Vector3;
export const UP = new V3(0, 1, 0);

export function resize() {
  const w = window.innerWidth,
    h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w / h < 1 ? FOV_PORTRAIT : FOV_LANDSCAPE;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// marks a geometry / material as shared, so disposeTree leaves it alone
export function shared<T extends { userData: Record<string, any> }>(x: T): T {
  x.userData.shared = true;
  return x;
}
export const bmats: Record<number, THREE.MeshBasicMaterial> = {};
export const lmats: Record<number, THREE.LineBasicMaterial> = {};
export function basicMat(c: number): THREE.MeshBasicMaterial {
  return bmats[c] || (bmats[c] = shared(new THREE.MeshBasicMaterial({ color: c })));
}
export function lineMat(c: number): THREE.LineBasicMaterial {
  return lmats[c] || (lmats[c] = shared(new THREE.LineBasicMaterial({ color: c })));
}
// frees the GPU resources of an object and its children (skipping shared ones, and textures not owned by the material)
export function disposeTree(obj: THREE.Object3D) {
  obj.traverse(node => {
    const o = node as THREE.Mesh;
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []).forEach(m => {
      if (m.userData.shared) return;
      const map = (m as THREE.MeshBasicMaterial).map;
      if (map && m.userData.ownMap) map.dispose();
      m.dispose();
    });
  });
}

export function textSprite(text: string, color: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.font = '64px "DotGothic16","Hiragino Sans",sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(5,8,12,.7)';
  g.fillRect(96, 16, 320, 96);
  g.strokeStyle = color;
  g.lineWidth = 4;
  g.strokeRect(96, 16, 320, 96);
  g.fillStyle = color;
  g.fillText(text, 256, 66);
  const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true });
  mat.userData.ownMap = true;
  const s = new THREE.Sprite(mat);
  s.scale.set(4, 1, 1);
  return s;
}

// ---- viewmodels ----
// the gun in hand lives in its own scene, drawn after the world with the depth buffer cleared:
// nothing in the world (walls, hazard floors, blasts) can cover it, and its own parts still depth-sort.
// gunScene's space is the camera's local space (gunCam sits at the origin looking down -z)
export const gunScene = new THREE.Scene();
export const gunCam = new THREE.PerspectiveCamera();
addLights(gunScene, [1, 3, 2]);
export const gun = new THREE.Group();
gunScene.add(gun);
gun.visible = false;
export function renderGun() {
  if (!gun.visible) return;
  gunCam.projectionMatrix.copy(camera.projectionMatrix);
  gunCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(gunScene, gunCam);
  renderer.autoClear = true;
}

// viewmodel parts: lit materials for the body, unlit for accents so they read as glowing
export function vmMat(c: number, lit?: boolean): THREE.MeshLambertMaterial | THREE.MeshBasicMaterial {
  return lit ? new THREE.MeshLambertMaterial({ color: c }) : new THREE.MeshBasicMaterial({ color: c });
}
export function partBox(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}
export function partCylinder(r: number, len: number, mat: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}
// def = { tip: [x, y, z], pos: [x, y, z], flash: radius, parts: [['box', w, h, d, material, x, y, z] | ['cyl', r, len, material, x, y, z]] }
// colors = { material name: hex }; names listed in `unlit` get an unlit material. Returns a Group with
// userData { tip (Object3D at the muzzle), flash (hidden muzzle-flash mesh), pos } to add under `gun`.
export type Vec3 = [number, number, number];
export type VmPart =
  | ['box', number, number, number, string, number, number, number]
  | ['cyl', number, number, string, number, number, number];
export interface ViewmodelDef {
  tip: Vec3;
  pos: Vec3;
  flash: number;
  parts: VmPart[];
}
export function buildViewmodel(
  def: ViewmodelDef,
  colors: Record<string, number>,
  unlit: string[] = ['acc'],
): THREE.Group {
  const g = new THREE.Group(),
    mats: Record<string, THREE.Material> = {};
  const mat = (name: string) => mats[name] || (mats[name] = vmMat(colors[name], !unlit.includes(name)));
  def.parts.forEach(p =>
    g.add(
      p[0] === 'cyl'
        ? partCylinder(p[1], p[2], mat(p[3]), p[4], p[5], p[6])
        : partBox(p[1], p[2], p[3], mat(p[4]), p[5], p[6], p[7]),
    ),
  );
  const tip = new THREE.Object3D();
  tip.position.set(def.tip[0], def.tip[1], def.tip[2]);
  g.add(tip);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(def.flash, 8, 6), vmMat(0xffffff));
  flash.position.copy(tip.position);
  flash.visible = false;
  g.add(flash);
  g.userData = { tip, flash, pos: def.pos };
  return g;
}
