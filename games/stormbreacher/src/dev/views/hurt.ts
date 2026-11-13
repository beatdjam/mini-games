// The signs of being under fire as the player sees them (#view-hurt, SB-1380): the entry starts the real sortie so the
// red edge, the white flash and the dark, drained edge can be seen on the game's own screen, and puts the shared tuning
// panel on HURT_TUNE. The buttons bring the three things the effects answer without playing them: a hit from the right,
// a blast close by and a low armour. The landing cutscene is passed over so the first click has somewhere to show.
import { addSystem, systems } from '@engine/core/index.ts';
import { currentGame, startSortie } from '../../app/play.ts';
import { HURT_TUNE, MECH_TUNE } from '../../data/tune.ts';
import { sendToScript } from '../../logic/game.ts';
import { createTunePanel, type TuneRange } from '../tunePanel.ts';

const SYSTEMS = ['sb-hurt-skip', 'sb-hurt-values'] as const;

// Opening the entry again (the dev page can) must not leave the last opening's systems running beside the new ones.
function dropSystems(): void {
  for (let i = systems.length - 1; i >= 0; i--) {
    if ((SYSTEMS as readonly string[]).includes(systems[i].name)) systems.splice(i, 1);
  }
}

// The values the panel turns, with the ranges a slider can reach. The colours are the 0xRRGGBB numbers the table holds.
const HURT_RANGES: Record<string, TuneRange> = {
  edgeColor: { min: 0, max: 0xffffff, step: 1 },
  edgeAlpha: { min: 0, max: 1, step: 0.01 },
  edgeWidth: { min: 0.05, max: 0.8, step: 0.01 },
  edgeFade: { min: 0.1, max: 2, step: 0.05 },
  flashColor: { min: 0, max: 0xffffff, step: 1 },
  flashAlpha: { min: 0, max: 1, step: 0.01 },
  flashNear: { min: 1, max: 40, step: 0.5 },
  flashFade: { min: 0.05, max: 1.5, step: 0.05 },
  armorDarkFrom: { min: 0, max: 1, step: 0.01 },
  armorDarkMax: { min: 0, max: 1, step: 0.01 },
  armorDrain: { min: 0, max: 1, step: 0.01 },
  armorColor: { min: 0, max: 0xffffff, step: 1 },
};

const HURT_LABELS: Record<string, string> = {
  edgeColor: '縁の色（0xRRGGBB）',
  edgeAlpha: '縁の明るさ',
  edgeWidth: '縁の広がり',
  edgeFade: '縁が消えるまで（s）',
  flashColor: '白む色（0xRRGGBB）',
  flashAlpha: '白む強さ（0m）',
  flashNear: '白む距離（m）',
  flashFade: '白む時間（s）',
  armorDarkFrom: '暗み始める装甲（0-1）',
  armorDarkMax: '暗みの最大（0-1）',
  armorDrain: '色の抜けの最大（0-1）',
  armorColor: '暗みの色（0xRRGGBB）',
};

const BUTTON_STYLE =
  'flex:1;min-width:0;height:24px;border:1px solid rgba(213,228,238,0.35);background:rgba(10,17,25,0.7);' +
  'color:inherit;font:inherit';

function button(parent: HTMLElement, label: string, run: () => void): void {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  node.style.cssText = BUTTON_STYLE;
  node.addEventListener('click', run);
  parent.appendChild(node);
}

export function showHurt(_hash: string) {
  dropSystems();
  startSortie();

  // The game's own step sets the landing cutscene at its end, so the skip waits for it to appear.
  let skipped = false;
  addSystem({
    name: 'sb-hurt-skip',
    modes: ['play'],
    update: () => {
      const game = currentGame();
      if (skipped || !game || game.script.cutscene === null) return;
      skipped = true;
      sendToScript(game, { kind: 'skip' });
    },
  });

  const extra = document.createElement('div');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:4px;margin-bottom:6px';
  extra.appendChild(row);
  button(row, '右から被弾', () => {
    const game = currentGame();
    if (!game) return;
    // inside the mech's box, flying from its right: the first step takes the armour and reports the way it came from
    game.bullets.push({
      enemy: 'grunt',
      x: game.mech.x + 0.5,
      y: game.mech.y + MECH_TUNE.chestHeight,
      z: game.mech.z,
      dx: -1,
      dy: 0,
      dz: 0,
      left: 50,
    });
  });
  button(row, '近くに着弾', () => {
    const game = currentGame();
    if (!game) return;
    // a shell about to land 6m to the mech's right: the game's own landing makes the blast, the shake and the white
    game.shells.push({ x: game.mech.x + 6, z: game.mech.z, radius: 1, warn: 0.5, left: 0.001, damage: 0 });
  });

  const armorRow = document.createElement('div');
  armorRow.style.cssText = 'display:flex;gap:4px;margin-bottom:6px';
  extra.appendChild(armorRow);
  button(armorRow, '装甲25%', () => {
    const game = currentGame();
    if (game) game.armor = Math.round(MECH_TUNE.armor * 0.25);
  });
  button(armorRow, '装甲を戻す', () => {
    const game = currentGame();
    if (game) game.armor = MECH_TUNE.armor;
  });

  const values = document.createElement('div');
  values.style.cssText = 'margin-bottom:6px;color:#ffcf6a;white-space:pre-wrap';
  extra.appendChild(values);

  const note = document.createElement('div');
  note.style.cssText = 'margin-top:6px;color:#9fb3c0;white-space:pre-wrap';
  note.textContent = '導入のカットシーンは飛ばす。\n保存はしない。';
  extra.appendChild(note);

  let painted = -1; // the armour's percent last written, so a frame without a hit writes nothing
  const paint = () => {
    const game = currentGame();
    const ratio = game ? game.armor / MECH_TUNE.armor : 1;
    const percent = Math.round(ratio * 100);
    // the armour changes only on a hit or a button, so the text is not remade every frame
    if (percent === painted) return;
    painted = percent;
    values.textContent = `装甲 ${percent}%`;
  };

  createTunePanel({
    title: '撃たれている感 #view-hurt',
    extra,
    groups: [{ name: 'HURT_TUNE', table: HURT_TUNE, ranges: HURT_RANGES, labels: HURT_LABELS }],
    onChange: paint,
  });
  paint();

  // the armour can change without the panel (a hit), so the reading follows the game
  addSystem({ name: 'sb-hurt-values', modes: ['play'], update: paint });
}
