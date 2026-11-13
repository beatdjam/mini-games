// The boundary between the beach and the sea (#view-boom, SB-1340): a fixed camera on the water's edge where each kind of
// explosion can be set off with a button. The four knobs (size, smoke count, smoke life, shake) write straight into
// data/boom.ts's row for the selected kind, so the next blast shows the new value; nothing is saved. The knobs are the
// shared tuning panel (dev/tunePanel.ts), which also copies the changed values in the table's shape.
import { addSystem } from '@engine/core/index.ts';
import { camera, renderer, scene } from '@engine/render/index.ts';
import { BOOM_DEFS, BOOM_SHAKE, boomShakeAt, type BoomKind } from '../../data/boom.ts';
import { lookOf } from '../../data/looks.ts';
import { M1B_HAND } from '../../data/maps/m1b-hand.ts';
import { M1 } from '../../data/missions/m1.ts';
import { CAMERA_TUNE, FEEL_TUNE } from '../../data/tune.ts';
import { boomCounts, buildBooms, drawBooms, spawnBoom } from '../../view/boom.ts';
import { feelBoom, feelStep, newFeel } from '../../view/feel.ts';
import { applyLookTo } from '../../view/look.ts';
import { CRAFT_NAME } from '../../view/shore.ts';
import { createTunePanel, type TuneRange } from '../tunePanel.ts';
import { buildMapScene } from './mapView.ts';

declare global {
  interface Window {
    sbBoomReport?: () => string;
  }
}

const KINDS: readonly BoomKind[] = ['small', 'large', 'craft', 'water'];
const LAND_Z = 158; // where a blast on the beach goes (m)
const SEA_Z = 181; // where one on the sea goes (m)
const CAM_POS = [0, 12, 202] as const; // over the water, the boundary and the beach in view
const CAM_LOOK = [0, 2, 160] as const;
const X_STEPS = [-9, 0, 9] as const; // where the next blast goes, so two side by side can be compared

// The four values the panel turns, by dotted path into the selected kind's row.
const BOOM_RANGES: Record<string, TuneRange> = {
  'fire.radius': { min: 0.5, max: 15, step: 0.1 },
  'smoke.count': { min: 0, max: 120, step: 1 },
  'smoke.life': { min: 1, max: 20, step: 0.5 },
  shake: { min: 0, max: 2, step: 0.01 },
};
const BOOM_LABELS: Record<string, string> = {
  'fire.radius': '大きさ（火球 m）',
  'smoke.count': '煙の数',
  'smoke.life': '煙の寿命（s）',
  shake: '揺れ（m）',
};

interface BoomReport {
  kind: BoomKind;
  defs: Record<BoomKind, { size: number; smoke: number; smokeLife: number; shake: number }>;
  live: ReturnType<typeof boomCounts>;
  calls: number;
  triangles: number;
}

function valuesOf(kind: BoomKind) {
  const def = BOOM_DEFS[kind];
  return { size: def.fire.radius, smoke: def.smoke.count, smokeLife: def.smoke.life, shake: def.shake };
}

// The same four values as the dotted paths the panel turns, used to remember what the table held when the view opened.
function tuneOf(kind: BoomKind): Record<string, number> {
  const def = BOOM_DEFS[kind];
  return {
    'fire.radius': def.fire.radius,
    'smoke.count': def.smoke.count,
    'smoke.life': def.smoke.life,
    shake: def.shake,
  };
}

function valuesText(): string {
  return KINDS.map(kind => {
    const value = valuesOf(kind);
    return `${kind.padEnd(5)} 火球 ${value.size.toFixed(1)}m  煙 ${value.smoke}個 ${value.smokeLife.toFixed(1)}s  揺れ ${value.shake.toFixed(2)}m`;
  }).join('\n');
}

export function showBoom(_hash: string) {
  const { built } = buildMapScene(M1B_HAND);
  applyLookTo(lookOf(M1.id), built.group);
  buildBooms(M1B_HAND.bounds);
  // the player's craft sits right where the water blast goes; it is not what this view is for
  const craft = scene.getObjectByName(`${CRAFT_NAME}Unit`);
  if (craft) craft.visible = false;
  const feel = newFeel(CAMERA_TUNE.fov);
  let kind: BoomKind = 'large';
  let step = 0;

  camera.position.set(...CAM_POS);
  camera.lookAt(...CAM_LOOK);
  camera.fov = CAMERA_TUNE.fov;
  camera.updateProjectionMatrix();

  const hud = document.createElement('div');
  hud.id = 'sbBoomHud';
  hud.style.cssText =
    'position:fixed;left:8px;top:calc(env(safe-area-inset-top,0px) + 8px);padding:4px 6px;' +
    'font:12px/1.4 monospace;color:#fff;background:rgba(0,0,0,0.45);white-space:pre;pointer-events:none;z-index:5';
  document.body.appendChild(hud);

  // What the tables held when the view opened: "元に戻す" goes back to these, whichever kind is picked.
  const originals = {
    small: tuneOf('small'),
    large: tuneOf('large'),
    craft: tuneOf('craft'),
    water: tuneOf('water'),
  };
  const groupsFor = (name: BoomKind) => [
    {
      name: `BOOM_DEFS.${name}`,
      table: BOOM_DEFS[name],
      ranges: BOOM_RANGES,
      labels: BOOM_LABELS,
      baseline: originals[name],
    },
  ];

  // The panel's own header: the kind buttons, the values of every kind and the note.
  const extra = document.createElement('div');
  const buttons = document.createElement('div');
  buttons.style.cssText = 'display:flex;gap:4px;margin-bottom:6px';
  extra.appendChild(buttons);

  const values = document.createElement('pre');
  values.dataset.boomValues = '1';
  values.style.cssText = 'margin:0 0 6px;white-space:pre-wrap;color:#ffcf6a';
  extra.appendChild(values);

  const note = document.createElement('div');
  note.style.cssText = 'margin-top:6px;color:#9fb3c0;white-space:pre-wrap';
  note.textContent = '土の上は砂柱、海の上は水柱。\nキー 1〜4 でも出せる。\n保存はしない。';
  extra.appendChild(note);

  const tune = createTunePanel({
    title: '爆発 #view-boom',
    extra,
    groups: groupsFor(kind),
    onChange: () => {
      values.textContent = valuesText();
    },
  });

  const kindButtons = new Map<BoomKind, HTMLButtonElement>();
  const markKind = () => {
    for (const [name, button] of kindButtons) {
      button.style.background = name === kind ? 'rgba(255,207,106,0.25)' : 'rgba(10,17,25,0.7)';
      button.style.color = name === kind ? '#ffcf6a' : 'inherit';
    }
  };

  const fire = () => {
    const x = X_STEPS[step % X_STEPS.length];
    step++;
    const z = kind === 'water' ? SEA_Z : LAND_Z;
    spawnBoom(kind, x, 0.4, z);
    feelBoom(feel, boomShakeAt(kind, Math.hypot(CAM_POS[0] - x, CAM_POS[2] - z)), FEEL_TUNE);
  };

  for (const name of KINDS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = name;
    button.dataset.boomKind = name;
    button.style.cssText =
      'flex:1;height:26px;border:1px solid rgba(213,228,238,0.35);background:rgba(10,17,25,0.7);' +
      'color:inherit;font:inherit';
    button.addEventListener('click', () => {
      kind = name;
      markKind();
      tune.setGroups(groupsFor(kind));
      fire();
    });
    buttons.appendChild(button);
    kindButtons.set(name, button);
  }

  values.textContent = valuesText();
  markKind();

  window.sbBoomReport = () => {
    const report: BoomReport = {
      kind,
      defs: {
        small: valuesOf('small'),
        large: valuesOf('large'),
        craft: valuesOf('craft'),
        water: valuesOf('water'),
      },
      live: boomCounts(),
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    };
    return JSON.stringify(report);
  };

  // 1〜4 set off a blast of that kind, the same as pressing its button.
  window.addEventListener('keydown', event => {
    const at = Number(event.key) - 1;
    if (!Number.isInteger(at) || at < 0 || at >= KINDS.length) return;
    kind = KINDS[at];
    markKind();
    tune.setGroups(groupsFor(kind));
    fire();
  });

  addSystem({
    name: 'sb-boom',
    update: dt => {
      drawBooms(dt);
      const frame = feelStep(feel, dt, false, CAMERA_TUNE.fov, FEEL_TUNE);
      camera.fov = frame.fov;
      camera.updateProjectionMatrix();
      camera.position.set(...CAM_POS).add(frame.offset);
      camera.lookAt(...CAM_LOOK);
      const live = boomCounts();
      hud.textContent =
        `爆発 ${kind} 火球 ${live.fire} 煙 ${live.smoke} 破片 ${live.debris} 柱 ${live.sand + live.water}\n` +
        `揺れ 近 ${BOOM_SHAKE.near}m 遠 ${BOOM_SHAKE.far}m\n` +
        `描画 calls ${renderer.info.render.calls} / tris ${renderer.info.render.triangles}`;
    },
  });
}
