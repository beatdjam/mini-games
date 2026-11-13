// The blast points on the hedgehog line and the charge planted on one (#view-breach, SB-1500). The hand map's line 1 is
// drawn with the beach's builder, the mech stands at the breakthrough at x 40, and the buttons plant a charge, burn its
// fuse to the blast and put everything back. The panel turns CHARGE_TUNE; window.sbBreachReport() gives the same state
// and the last frame's draw counts as JSON.
import { addSystem, el } from '@engine/core/index.ts';
import { camera, renderer, scene } from '@engine/render/index.ts';
import { CHARGE_TUNE } from '../../data/charge.ts';
import { lookOf } from '../../data/looks.ts';
import { M1B_HAND } from '../../data/maps/m1b-hand.ts';
import { M1_MECH, M1_MECH_PALETTE, M1_WEAPON_SCALE } from '../../data/mech.ts';
import { M1 } from '../../data/missions/m1.ts';
import { MECH_TUNE } from '../../data/tune.ts';
import { newGame, type GameModel } from '../../logic/game.ts';
import { buildWorld } from '../../view/world.ts';
import { buildBlastView, drawBlasts, type BlastView } from '../../view/blasts.ts';
import { buildBooms, drawBooms, spawnBoom } from '../../view/boom.ts';
import { GROUND_NAME, SIZE_BOX_NAME } from '../../view/field.ts';
import { applyLookTo } from '../../view/look.ts';
import { buildMechVisual } from '../../view/mechModel.ts';
import { createTunePanel, type TuneRange } from '../tunePanel.ts';
import { stepBlasts, stepCharge } from '../../logic/blasts.ts';

declare global {
  interface Window {
    sbBreachReport?: () => string;
  }
}

const MECH_X = 40; // the breakthrough on line 1 (m)
const MECH_Z = 150; // just sea-side of the line (m)
const CAM_POS = [40, 9, 161] as const; // over the mech's shoulder, looking down the line's sea-side face
const CAM_LOOK = [40, 1.2, 146] as const;
const CHARGE_RANGES: Record<string, TuneRange> = {
  holdSec: { min: 0.2, max: 4, step: 0.05 },
  reach: { min: 1, max: 15, step: 0.1 },
  fuse: { min: 0.5, max: 10, step: 0.1 },
  blastRadius: { min: 1, max: 30, step: 0.5 },
  damage: { min: 0, max: 200, step: 1 },
  holeHalfWidth: { min: 0.5, max: 15, step: 0.1 },
  holeHalfDepth: { min: 1, max: 30, step: 0.5 },
};
const CHARGE_LABELS: Record<string, string> = {
  holdSec: '長押し（s）',
  reach: '届く距離（m）',
  fuse: '導火線（s）',
  blastRadius: '爆風の半径（m）',
  damage: '爆風の装甲',
  holeHalfWidth: '穴の半幅（m）',
  holeHalfDepth: '穴の半奥行き（m）',
};

interface BreachReport {
  mech: { x: number; z: number };
  blasts: { id: string; x: number; z: number }[];
  charges: { blast: string; left: number }[];
  plant: { blast: string; hold: number } | null;
  calls: number;
  triangles: number;
}

function button(parent: HTMLElement, label: string, run: () => void): void {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  node.style.cssText =
    'flex:1;min-width:0;height:26px;border:1px solid rgba(213,228,238,0.35);background:rgba(10,17,25,0.7);' +
    'color:inherit;font:inherit';
  node.addEventListener('click', run);
  parent.appendChild(node);
}

export function showBreach(_hash: string) {
  el('#sbApp').hidden = true;
  const map = M1B_HAND;
  for (const name of [GROUND_NAME, SIZE_BOX_NAME]) {
    const node = scene.getObjectByName(name);
    if (node) node.visible = false;
  }
  const { built } = buildWorld(map);
  applyLookTo(lookOf(M1.id), built.group);
  buildBooms(map.bounds);

  const game: GameModel = newGame(map);
  game.mech.x = MECH_X;
  game.mech.z = MECH_Z;
  game.mech.y = 0;
  game.mech.grounded = true;
  game.mech.yaw = 0;

  const model = buildMechVisual(
    { build: M1_MECH, palette: M1_MECH_PALETTE, weaponScale: M1_WEAPON_SCALE },
    MECH_TUNE.height,
  );
  model.position.set(game.mech.x, game.mech.y, game.mech.z);
  scene.add(model);

  const view: BlastView = buildBlastView(map);
  camera.position.set(...CAM_POS);
  camera.lookAt(...CAM_LOOK);
  camera.fov = 50;
  camera.updateProjectionMatrix();

  const hud = document.createElement('div');
  hud.id = 'sbBreachHud';
  hud.style.cssText =
    'position:fixed;left:8px;top:calc(env(safe-area-inset-top,0px) + 8px);padding:4px 6px;' +
    'font:12px/1.4 monospace;color:#fff;background:rgba(0,0,0,0.45);white-space:pre;pointer-events:none;z-index:5';
  document.body.appendChild(hud);

  let useHeld = false;
  window.addEventListener('keydown', event => {
    if (event.code === 'KeyF') useHeld = true;
  });
  window.addEventListener('keyup', event => {
    if (event.code === 'KeyF') useHeld = false;
  });

  const extra = document.createElement('div');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:4px;margin-bottom:6px';
  extra.appendChild(row);
  button(row, '仕掛ける', () => {
    stepCharge(game, true, CHARGE_TUNE.holdSec);
  });
  button(row, '爆破', () => {
    for (const charge of game.charges) charge.left = 0;
  });
  button(row, '戻す', () => {
    game.charges = [];
    game.plant = null;
    useHeld = false;
  });

  const note = document.createElement('div');
  note.style.cssText = 'margin-top:6px;color:#9fb3c0;white-space:pre-wrap';
  note.textContent = 'F を押し続けても仕掛けられる。\n保存はしない。';
  extra.appendChild(note);

  createTunePanel({
    title: '爆破点と爆薬 #view-breach',
    extra,
    groups: [{ name: 'CHARGE_TUNE', table: CHARGE_TUNE, ranges: CHARGE_RANGES, labels: CHARGE_LABELS }],
  });

  window.sbBreachReport = () => {
    const report: BreachReport = {
      mech: { x: game.mech.x, z: game.mech.z },
      blasts: game.blasts.map(blast => ({ id: blast.id, x: blast.x, z: blast.z })),
      charges: game.charges.map(charge => ({ blast: charge.blast, left: charge.left })),
      plant: game.plant === null ? null : { blast: game.plant.blast, hold: game.plant.hold },
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    };
    return JSON.stringify(report);
  };

  addSystem({
    name: 'sb-breach',
    update: dt => {
      game.time += dt;
      const hold = stepCharge(game, useHeld, dt);
      game.plant = hold.plant;
      for (const blown of stepBlasts(game, dt)) spawnBoom('large', blown.blast.x, 0.8, blown.blast.z);
      model.position.set(game.mech.x, game.mech.y, game.mech.z);
      drawBooms(dt);
      drawBlasts(view, game);
      const near = game.blasts.find(blast => blast.id === 'l1-b');
      hud.textContent =
        `機体 x ${game.mech.x} z ${game.mech.z}\n` +
        `爆破点 l1-b ${near ? `${near.x}, ${near.z}` : 'なし'}\n` +
        `長押し ${game.plant === null ? '-' : `${(game.plant.hold / CHARGE_TUNE.holdSec).toFixed(2)}`}\n` +
        `爆薬 ${game.charges.map(charge => `${charge.blast} ${charge.left.toFixed(2)}s`).join(' ') || '-'}\n` +
        `描画 calls ${renderer.info.render.calls} / tris ${renderer.info.render.triangles}`;
    },
  });
}
