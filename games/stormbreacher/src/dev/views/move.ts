// The movement view (#view-move): a 4 m mech walks, jumps, boosts, lands and fires on the flat field, with the feel's
// camera effects, while the values are turned with URL parameters. The targets are five boxes in front.
import * as THREE from 'three';
import { addSystem, clamp } from '@engine/core/index.ts';
import { camera, scene } from '@engine/render/index.ts';
import type { MechInput } from '../../logic/mech.ts';
import { applyPose, cameraPose, followCamera, type CameraState } from '../../view/camera.ts';
import { SIZE_BOX_NAME } from '../../view/field.ts';
import { buildFlatRange, moveFeelFromParams } from '../flatRange.ts';
import { heldKeys } from '../keys.ts';
import { tuneFrom } from './camera.ts';

const MOUSE_TURN = 0.004; // the yaw a pixel of mouse drag adds (rad/px)

const axis = (held: Set<string>, plus: string, minus: string): number =>
  (held.has(plus) ? 1 : 0) - (held.has(minus) ? 1 : 0);

export function showMove(_hash: string) {
  const params = new URLSearchParams(location.search);
  const cameraTune = tuneFrom(params);
  const { moveTune, feelTune } = moveFeelFromParams(params);

  const sizeBox = scene.getObjectByName(SIZE_BOX_NAME);
  if (sizeBox) sizeBox.visible = false;

  const range = buildFlatRange(cameraTune.fov);
  const mech = range.mech;
  const keys = heldKeys();
  const walls: THREE.Box3[] = []; // no walls in this view

  // The HUD at the bottom left: the numbers that say what the movement did.
  const hud = document.createElement('div');
  hud.id = 'sbMoveHud';
  hud.style.cssText =
    'position:fixed;left:8px;bottom:8px;padding:4px 6px;font:12px/1.4 monospace;color:#fff;' +
    'background:rgba(0,0,0,0.45);white-space:pre;pointer-events:none';
  document.body.appendChild(hud);

  let mouseDown = false;
  let dragging = false;
  let lastMouseX = 0;
  let mouseYaw = 0; // the yaw the mouse added since the last frame (rad)
  window.addEventListener('mousedown', event => {
    if (event.button === 0) mouseDown = true;
    dragging = true;
    lastMouseX = event.clientX;
  });
  window.addEventListener('mouseup', event => {
    if (event.button === 0) mouseDown = false;
    dragging = false;
  });
  window.addEventListener('mousemove', event => {
    if (!dragging) return;
    mouseYaw -= (event.clientX - lastMouseX) * MOUSE_TURN;
    lastMouseX = event.clientX;
  });

  let cam: CameraState | null = null;

  addSystem({
    name: 'sb-move',
    update: dt => {
      const turnKeys = clamp(axis(keys.held, 'KeyQ', 'KeyE') + axis(keys.held, 'ArrowLeft', 'ArrowRight'), -1, 1);
      const input: MechInput = {
        moveX: axis(keys.held, 'KeyD', 'KeyA'),
        moveZ: axis(keys.held, 'KeyW', 'KeyS'),
        turn: turnKeys * moveTune.turn * dt + mouseYaw,
        jump: keys.pressed.has('Space'),
        jumpHeld: keys.held.has('Space'),
        boost: keys.held.has('ShiftLeft') || keys.held.has('ShiftRight'),
        fire: keys.held.has('KeyJ') || mouseDown,
      };
      mouseYaw = 0;
      keys.pressed.clear();

      const step = range.step(input, dt, moveTune, feelTune);

      const pose = cameraPose({ x: mech.x, y: mech.y, z: mech.z, yaw: mech.yaw }, 0, cameraTune, walls);
      cam = followCamera(cam, pose, dt, cameraTune);
      const pos = cam.pos.clone().add(step.offset);
      applyPose(camera, { ...pose, pos, look: cam.sight }, step.fov);

      // The HUD's numbers: the horizontal speed, the gauge, the ground and the landing stop.
      hud.textContent =
        `speed ${Math.hypot(mech.vx, mech.vz).toFixed(1)} m/s\n` +
        `gauge ${mech.gauge.toFixed(2)}\n` +
        `${mech.grounded ? 'ground' : 'air'}\n` +
        `land ${mech.landT.toFixed(2)} s`;
    },
  });
}
