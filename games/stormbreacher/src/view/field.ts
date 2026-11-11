// The empty outdoor field the prototype (G0) starts in: a sand ground, a sky, a light, the fog and one box that shows
// how tall a mech is. The engine's defaults (fog 4-44 m, camera far 140 m) are for indoor sectors, so the game sets its
// own here.
import * as THREE from 'three';
import { camera, scene } from '@engine/render/index.ts';
import { SAND_COLOR, SKY_COLOR } from '../data/colors.ts';
import { FIELD_TUNE, MECH_TUNE } from '../data/tune.ts';

const BOX = 0x5c6670;

// The names the dev views look up in the scene to hide the field's own ground and size box (the scale course and the
// beach bench build their own).
export const SIZE_BOX_NAME = 'sizeBox';
export const GROUND_NAME = 'ground';

// Builds the field into the engine's scene: ground, sky, the two lights, the fog and the size box. Called once at
// start-up; placeCamera() then puts the camera where the view starts.
export function buildField() {
  scene.background = new THREE.Color(SKY_COLOR);
  scene.fog = new THREE.Fog(SKY_COLOR, FIELD_TUNE.fogNear, FIELD_TUNE.fogFar);
  camera.far = FIELD_TUNE.viewFar;
  camera.updateProjectionMatrix();

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD_TUNE.groundSize, FIELD_TUNE.groundSize),
    new THREE.MeshLambertMaterial({ color: SAND_COLOR }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.name = GROUND_NAME;
  scene.add(ground);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a60, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(30, 50, 20);
  scene.add(sun);

  // the size box: a mech's height at the origin, 2 m wide and deep
  const size = new THREE.Mesh(
    new THREE.BoxGeometry(MECH_TUNE.radius * 2, MECH_TUNE.height, MECH_TUNE.radius * 2),
    new THREE.MeshLambertMaterial({ color: BOX }),
  );
  size.position.y = MECH_TUNE.height / 2;
  size.name = SIZE_BOX_NAME;
  scene.add(size);
}

// Puts the camera behind and above the size box, looking at its middle (the start view and #view-field).
export function placeCamera() {
  const mid = MECH_TUNE.height / 2;
  camera.position.set(0, mid + FIELD_TUNE.camHeight, FIELD_TUNE.camDist);
  camera.lookAt(0, mid, 0);
}
