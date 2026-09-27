'use strict';
// engine: three.js setup: renderer on canvas#gl, scene, camera, resize, shared materials, disposal, text sprites, and the in-hand viewmodel pass
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x061219, 4, 44);
scene.background = new THREE.Color(0x061219);
const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 140);
camera.rotation.order = 'YXZ';
scene.add(camera);
scene.add(new THREE.HemisphereLight(0xcfefff, 0x141c26, 1.0));
const sun = new THREE.DirectionalLight(0xffffff, 0.45); sun.position.set(3, 10, 2); scene.add(sun);
const dynGroup = new THREE.Group(); scene.add(dynGroup);
const V3 = THREE.Vector3, UP = new V3(0, 1, 0);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = w / h < 1 ? 90 : 72; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();

function shared(x) { x.userData.shared = true; return x; }
const bmats = {}, lmats = {};
function basicMat(c) { return bmats[c] || (bmats[c] = shared(new THREE.MeshBasicMaterial({ color: c }))); }
function lineMat(c) { return lmats[c] || (lmats[c] = shared(new THREE.LineBasicMaterial({ color: c }))); }
function disposeTree(obj) {
  obj.traverse(o => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []).forEach(m => {
      if (m.userData.shared) return;
      if (m.map && m.userData.ownMap) m.map.dispose();
      m.dispose();
    });
  });
}

function textSprite(text, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = '64px "DotGothic16","Hiragino Sans",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(5,8,12,.7)'; g.fillRect(96, 16, 320, 96);
  g.strokeStyle = color; g.lineWidth = 4; g.strokeRect(96, 16, 320, 96);
  g.fillStyle = color; g.fillText(text, 256, 66);
  const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true });
  mat.userData.ownMap = true;
  const s = new THREE.Sprite(mat); s.scale.set(4, 1, 1); return s;
}

// ---- viewmodels ----
// the gun in hand lives in its own scene, drawn after the world with the depth buffer cleared:
// nothing in the world (walls, hazard floors, blasts) can cover it, and its own parts still depth-sort.
// gunScene's space is the camera's local space (gunCam sits at the origin looking down -z)
const gunScene = new THREE.Scene(), gunCam = new THREE.PerspectiveCamera();
gunScene.add(new THREE.HemisphereLight(0xcfefff, 0x141c26, 1.0));
{ const l = new THREE.DirectionalLight(0xffffff, 0.45); l.position.set(1, 3, 2); gunScene.add(l); }
const gun = new THREE.Group(); gunScene.add(gun); gun.visible = false;
function renderGun() {
  if (!gun.visible) return;
  gunCam.projectionMatrix.copy(camera.projectionMatrix); gunCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
  renderer.autoClear = false; renderer.clearDepth(); renderer.render(gunScene, gunCam); renderer.autoClear = true;
}
