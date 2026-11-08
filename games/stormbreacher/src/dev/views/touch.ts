// The touch view (#view-touch): the same flat field, mech and targets as #view-move, moved by the touch screen
// (app/touch.ts) instead of the keyboard. The button layout can be edited on the phone, and the screen reports how
// hard the layout is to use: the presses, the most fingers down at once and how long the three actions overlapped.
import * as THREE from 'three';
import { addSystem, clamp, el } from '@engine/core/index.ts';
import { camera, scene } from '@engine/render/index.ts';
import { buttonLayout, openLayoutEditor } from '@engine/ui/index.ts';
import { CAMERA_TUNE, FEEL_TUNE, MOVE_TUNE } from '../../data/tune.ts';
import { TOUCH_BUTTONS, type TouchButton } from '../../data/touch.ts';
import { initTouch, readTouch, touchStats, type TouchStats } from '../../app/touch.ts';
import type { MechState } from '../../logic/mech.ts';
import { applyPose, cameraPose, followPose } from '../../view/camera.ts';
import { SIZE_BOX_NAME } from '../../view/field.ts';
import { buildFlatRange } from './move.ts';

declare global {
  interface Window {
    sbTouchReport?: () => string;
  }
}

interface ReportButton {
  x: number; // the button's centre across the screen (0-1)
  y: number; // the button's centre down the screen (0-1)
  s: number; // the size multiplier
  b: number; // the button's size at s = 1 (px)
}

interface TouchReport {
  stats: TouchStats;
  layout: Record<TouchButton, ReportButton>;
  screen: { width: number; height: number; devicePixelRatio: number };
  userAgent: string;
}

function place(id: TouchButton): ReportButton {
  const l = buttonLayout(id);
  return { x: l.x, y: l.y, s: l.s, b: l.b };
}

function reportJson(): string {
  const report: TouchReport = {
    stats: touchStats(),
    layout: {
      main: place('main'),
      sub: place('sub'),
      jump: place('jump'),
      boost: place('boost'),
      lock: place('lock'),
    },
    screen: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
    userAgent: navigator.userAgent,
  };
  return JSON.stringify(report);
}

// The small numbers at the top left: what the last frame did and how hard the layout is to use.
function hudText(mech: MechState, lock: boolean, stats: TouchStats): string {
  const pressed = TOUCH_BUTTONS.map(id => `${id} ${stats.presses[id]}`).join(' ');
  return (
    `speed ${Math.hypot(mech.vx, mech.vz).toFixed(1)} m/s\n` +
    `gauge ${mech.gauge.toFixed(2)}\n` +
    `LOCK ${lock ? 'on' : '--'}\n` +
    `press ${pressed}\n` +
    `fingers max ${stats.maxPointers}\n` +
    `stick+look+fire ${stats.stickLookFireSec.toFixed(2)} s\n` +
    `stick+look+boost ${stats.stickLookBoostSec.toFixed(2)} s`
  );
}

function addTopButton(bar: HTMLElement, id: string, label: string, onClick: () => void) {
  const button = document.createElement('button');
  button.id = id;
  button.type = 'button';
  button.textContent = label;
  button.style.cssText =
    'pointer-events:auto;height:36px;padding:0 14px;border-radius:18px;font:inherit;font-size:13px;' +
    'border:1px solid rgba(255,207,106,.6);background:rgba(10,17,25,.8);color:#ffcf6a';
  button.addEventListener('click', onClick);
  bar.appendChild(button);
}

// The two buttons at the top middle: open the layout editor, and show or hide the result JSON.
function addTopBar(onResult: () => void): void {
  const bar = document.createElement('div');
  bar.style.cssText =
    'position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 8px);transform:translateX(-50%);' +
    'z-index:6;display:flex;gap:8px;pointer-events:none';
  addTopButton(bar, 'sbLayoutBtn', '配置', () => openLayoutEditor());
  addTopButton(bar, 'sbResultBtn', '結果', onResult);
  document.body.appendChild(bar);
}

export function showTouch(_hash: string) {
  const sizeBox = scene.getObjectByName(SIZE_BOX_NAME);
  if (sizeBox) sizeBox.visible = false;
  // the title and the link to the list would sit under the touch HUD
  el('#sbApp').hidden = true;

  const range = buildFlatRange(CAMERA_TUNE.fov);
  const mech = range.mech;
  initTouch();

  let pitch = 0;
  let camPos: THREE.Vector3 | null = null;

  const hud = document.createElement('div');
  hud.id = 'sbTouchHud';
  hud.style.cssText =
    'position:fixed;left:8px;top:calc(env(safe-area-inset-top,0px) + 8px);padding:4px 6px;' +
    'font:12px/1.4 monospace;color:#fff;background:rgba(0,0,0,0.45);white-space:pre;pointer-events:none';
  document.body.appendChild(hud);

  const result = document.createElement('textarea');
  result.id = 'sbResult';
  result.readOnly = true;
  result.hidden = true;
  result.style.cssText =
    'position:fixed;left:8px;right:8px;top:calc(env(safe-area-inset-top,0px) + 56px);height:42%;' +
    'z-index:6;padding:6px;font:11px/1.4 monospace;color:#e8eef2;background:rgba(5,8,12,.92);' +
    'border:1px solid rgba(213,228,238,.35)';
  document.body.appendChild(result);

  addTopBar(() => {
    if (result.hidden) {
      result.value = reportJson();
      result.hidden = false;
    } else {
      result.hidden = true;
    }
  });

  window.sbTouchReport = reportJson;

  addSystem({
    name: 'sb-touch',
    update: dt => {
      const read = readTouch();
      pitch = clamp(pitch + read.pitchDelta, CAMERA_TUNE.pitchMin, CAMERA_TUNE.pitchMax);
      const step = range.step(read.input, dt, MOVE_TUNE, FEEL_TUNE);

      const pose = cameraPose({ x: mech.x, y: mech.y, z: mech.z, yaw: mech.yaw }, pitch, CAMERA_TUNE, []);
      camPos = camPos ? followPose(camPos, pose.pos, dt, CAMERA_TUNE.lag) : pose.pos.clone();
      const pos = camPos.clone().add(step.offset);
      applyPose(camera, { ...pose, pos }, step.fov);

      hud.textContent = hudText(mech, read.lock, touchStats());
    },
  });
}
