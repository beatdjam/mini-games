// The pillboxes' blast points as the player uses them (#view-pillbox, SB-1540): the entry starts the real sortie and
// passes over the landing cutscene, and its buttons put the mech at pillbox-1's side or back point, 4 m from it and
// facing the point, so the ring stands in front of the camera. F holds a charge on the point and stepping away blows
// it. The panel turns PILLBOX_BLAST.damage; nothing is saved.
import { addSystem, systems } from '@engine/core/index.ts';
import { currentGame, startSortie } from '../../app/play.ts';
import { PILLBOX_BLAST } from '../../data/pillbox.ts';
import { sendToScript } from '../../logic/game.ts';
import { createTunePanel, type TuneRange } from '../tunePanel.ts';

const SYSTEMS = ['sb-pillbox-skip'] as const;

const SIDE_POINT = 'blast-pillbox-1-side';
const BACK_POINT = 'blast-pillbox-1-back';
const STAND_OFF = 4; // how far from a point the mech stands, on the sea side for the side point (m)

const PILLBOX_RANGES: Record<string, TuneRange> = {
  damage: { min: 0, max: 300, step: 10 },
};

const PILLBOX_LABELS: Record<string, string> = {
  damage: '爆薬1つのダメージ',
};

const BUTTON_STYLE =
  'flex:1;min-width:0;height:24px;border:1px solid rgba(213,228,238,0.35);background:rgba(10,17,25,0.7);' +
  'color:inherit;font:inherit';

// Opening the entry again (the dev page can) must not leave the last opening's system running beside the new one.
function dropSystems(): void {
  for (let i = systems.length - 1; i >= 0; i--) {
    if ((SYSTEMS as readonly string[]).includes(systems[i].name)) systems.splice(i, 1);
  }
}

function button(parent: HTMLElement, label: string, run: () => void): void {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  node.style.cssText = BUTTON_STYLE;
  node.addEventListener('click', run);
  parent.appendChild(node);
}

// Puts the mech `dz` metres from the point on the ground, facing `yaw` (0 is the land). The camera follows it from
// behind, so a point ahead of the mech is the one in the picture.
function standAt(pointId: string, dz: number, yaw: number): void {
  const game = currentGame();
  if (!game) return;
  const point = game.blasts.find(place => place.id === pointId);
  if (!point) return;
  game.mech.x = point.x;
  game.mech.z = point.z + dz;
  game.mech.y = 0;
  game.mech.grounded = true;
  game.mech.yaw = yaw;
}

export function showPillbox(_hash: string) {
  dropSystems();
  startSortie();

  // The sortie's first step puts the landing cutscene up; a restart puts it up again, so every landing is passed over.
  addSystem({
    name: 'sb-pillbox-skip',
    modes: ['play'],
    update: () => {
      const game = currentGame();
      if (!game || game.script.cutscene === null || game.script.cutscene.id !== 'landing') return;
      sendToScript(game, { kind: 'skip' });
    },
  });

  const extra = document.createElement('div');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:4px;margin-bottom:6px';
  extra.appendChild(row);
  // the side point's ring is watched from its sea side, the back point's from its land side
  button(row, '横の爆破点へ', () => standAt(SIDE_POINT, STAND_OFF, 0));
  button(row, '後ろの爆破点へ', () => standAt(BACK_POINT, -STAND_OFF, Math.PI));
  const restartRow = document.createElement('div');
  restartRow.style.cssText = 'display:flex;gap:4px;margin-bottom:6px';
  extra.appendChild(restartRow);
  button(restartRow, 'やり直す', () => startSortie());

  const note = document.createElement('div');
  note.style.cssText = 'margin-top:6px;color:#9fb3c0;white-space:pre-wrap';
  note.textContent = 'F（使う）を長押しすると仕掛ける。\n離れて導火線が切れると爆破する。\n保存はしない。';
  extra.appendChild(note);

  createTunePanel({
    title: 'トーチカの爆破点 #view-pillbox',
    extra,
    groups: [{ name: 'PILLBOX_BLAST', table: PILLBOX_BLAST, ranges: PILLBOX_RANGES, labels: PILLBOX_LABELS }],
  });
}
