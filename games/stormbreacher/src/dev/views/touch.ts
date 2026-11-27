// The touch view (#view-touch): the flat field, mech and targets of flatRange.ts, moved by the
// touch screen (app/touch.ts) or the keyboard and mouse (app/keyboard.ts) through app/input.ts, under the overview
// camera. The button layout can be edited on the phone, and the screen reports how hard the layout is to use: the
// presses, the most fingers down at once and how long the three actions overlapped.
import { addSystem, el, isTouch } from '@engine/core/index.ts';
import { scene } from '@engine/render/index.ts';
import { buttonLayout, openLayoutEditor } from '@engine/ui/index.ts';
import { FOV_TUNE } from '../../data/tune.ts';
import { TOUCH_BUTTONS, type TouchButton } from '../../data/touch.ts';
import { initPlayInput, readInput } from '../../app/input.ts';
import { touchStats, type TouchStats } from '../../app/touch.ts';
import { playInputOptions } from '../../logic/input.ts';
import type { MechState } from '../../logic/mech.ts';
import { SIZE_BOX_NAME } from '../../view/field.ts';
import { buildFlatRange, moveFeelFromParams } from '../flatRange.ts';
import { createQuarterRig } from '../quarterRig.ts';

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
      melee: place('melee'),
      jump: place('jump'),
      boost: place('boost'),
      lock: place('lock'),
      use: place('use'),
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
    `${mech.grounded ? 'ground' : 'air'}\n` +
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

  const range = buildFlatRange(FOV_TUNE.feel);
  const mech = range.mech;
  const { moveTune, feelTune } = moveFeelFromParams(new URLSearchParams(location.search));
  const rig = createQuarterRig();
  initPlayInput(playInputOptions());
  // the touch view takes no jump, so its touch layer has no jump button
  el('#btnJump').hidden = true;

  const hud = document.createElement('div');
  hud.id = 'sbTouchHud';
  hud.style.cssText =
    'position:fixed;left:8px;top:calc(env(safe-area-inset-top,0px) + 8px);padding:4px 6px;' +
    'font:12px/1.4 monospace;color:#fff;background:rgba(0,0,0,0.45);white-space:pre;pointer-events:none';
  document.body.appendChild(hud);

  // The keys on a PC, small at the bottom middle. The mouse aims at the cursor; the overview camera does not turn.
  const hint = isTouch ? null : document.createElement('div');
  if (hint) {
    hint.id = 'sbPlayHint';
    hint.textContent = 'WASD 移動 / Shift ブースト / J メイン / K サブ / E ロック / F 使う / Q 殴る / P 一時停止';
    hint.style.cssText =
      'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 8px);transform:translateX(-50%);' +
      'max-width:calc(100% - 16px);padding:4px 8px;border-radius:6px;font:11px/1.4 monospace;color:#d5e4ee;' +
      'background:rgba(5,8,12,.6);white-space:nowrap;pointer-events:none;z-index:4';
    document.body.appendChild(hint);
  }

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
      const read = readInput(dt);
      const step = range.step({ ...read.input, ...rig.aim(read, mech) }, dt, moveTune, feelTune);
      rig.follow(mech, dt, step);

      hud.textContent = hudText(mech, read.lock, touchStats());
    },
  });
}
