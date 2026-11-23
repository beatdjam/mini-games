// The pillboxes' blast points as the player uses them (#view-pillbox, SB-1540): the entry starts the real sortie and
// passes over the landing cutscene, and its buttons put the mech at pillbox-1's side or back point, 4 m from it and
// facing the point, so the ring stands in front of the camera. F holds a charge on the point and stepping away blows
// it. The panel turns PILLBOX_BLAST.damage; nothing is saved.
import { addSystem, systems } from '@engine/core/index.ts';
import { currentGame, startSortie } from '../../app/play.ts';
import { DEFENDER_TUNE } from '../../data/defenders.ts';
import { FRONT_TUNE } from '../../data/front.ts';
import { PAYOFF_TUNE } from '../../data/payoff.ts';
import { PILLBOX_BLAST, PILLBOX_BREAK, PILLBOX_TUNE } from '../../data/pillbox.ts';
import { BATTLE_TUNE } from '../../data/tune.ts';
import { sendToScript } from '../../logic/game.ts';
import { createTunePanel, type TuneRange } from '../tunePanel.ts';
import { CHARGE_TUNE } from '../../data/charge.ts';

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

const TUNE_RANGES: Record<string, TuneRange> = {
  suppressSec: { min: 0, max: 10, step: 0.1 },
};

const TUNE_LABELS: Record<string, string> = {
  suppressSec: '射撃で黙る秒',
};

const DEFENDER_RANGES: Record<string, TuneRange> = {
  hideSec: { min: 0, max: 8, step: 0.1 },
  peekSec: { min: 0.5, max: 8, step: 0.1 },
  stepSpeed: { min: 1, max: 10, step: 0.1 },
  arrive: { min: 0.1, max: 2, step: 0.1 },
  firstWait: { min: 0, max: 5, step: 0.1 },
  fireInterval: { min: 0.5, max: 8, step: 0.1 },
};

const DEFENDER_LABELS: Record<string, string> = {
  hideSec: '隠れる秒',
  peekSec: '身を出す秒',
  stepSpeed: '出る速さ(m/s)',
  arrive: '着いたと見る距離(m)',
  firstWait: '出てから最初の射撃まで(s)',
  fireInterval: '持ち場の射撃間隔(s)',
};

const BREAK_RANGES: Record<string, TuneRange> = {
  sec: { min: 0.5, max: 6, step: 0.1 },
  sink: { min: 0, max: 4, step: 0.1 },
  lean: { min: 0, max: 1, step: 0.01 },
};

const BREAK_LABELS: Record<string, string> = {
  sec: '沈み切るまでの秒',
  sink: '沈む深さ(m)',
  lean: '傾く角(rad)',
};

// The battle layer's table: only the waiting line. The allies' count is not here, because the sortie reads it when it
// makes PLAY_BATTLE_TUNE; change src/data/tune.ts to see another number.
const BATTLE_RANGES: Record<string, TuneRange> = {
  holdZ: { min: -30, max: 10, step: 1 },
  holdBeachZ: { min: 100, max: 170, step: 1 },
  holdLine1Z: { min: 60, max: 150, step: 1 },
};

const BATTLE_LABELS: Record<string, string> = {
  holdZ: '歩兵ドロイドの待ち線(z)',
  holdBeachZ: '待ち線: 浜(z)',
  holdLine1Z: '待ち線: 線1の後ろ(z)',
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

// Breaks both pillboxes with a charge on each side point, as a player would (SB-2015: shots no longer break them): the
// fuse is already out, so the game's own blast makes the `destroyed` event (sendToScript is not called).
function breakPillboxes(): void {
  const game = currentGame();
  if (!game) return;
  for (const id of ['blast-pillbox-1-side', 'blast-pillbox-2-side']) {
    game.charges.push({ blast: id, left: 0, total: CHARGE_TUNE.fuse });
  }
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
  button(restartRow, 'トーチカ2基を壊す', breakPillboxes);
  button(restartRow, 'やり直す', () => startSortie());

  const note = document.createElement('div');
  note.style.cssText = 'margin-top:6px;color:#9fb3c0;white-space:pre-wrap';
  note.textContent =
    '射撃では壊れず、しばらく銃眼が黙るだけ（制圧）。\nF（使う）を長押しすると仕掛ける。\n離れて導火線が切れると爆破する。\n壊し直すときは「やり直す」。\n待ち線は作り直しで反映する。\n保存はしない。';
  extra.appendChild(note);

  createTunePanel({
    title: 'トーチカの爆破点 #view-pillbox',
    extra,
    groups: [
      { name: 'PILLBOX_BLAST', table: PILLBOX_BLAST, ranges: PILLBOX_RANGES, labels: PILLBOX_LABELS },
      { name: 'PILLBOX_TUNE', table: PILLBOX_TUNE, ranges: TUNE_RANGES, labels: TUNE_LABELS },
      { name: 'PILLBOX_BREAK', table: PILLBOX_BREAK, ranges: BREAK_RANGES, labels: BREAK_LABELS },
      { name: 'DEFENDER_TUNE', table: DEFENDER_TUNE, ranges: DEFENDER_RANGES, labels: DEFENDER_LABELS },
      { name: 'BATTLE_TUNE', table: BATTLE_TUNE, ranges: BATTLE_RANGES, labels: BATTLE_LABELS },
      {
        name: 'FRONT_TUNE',
        table: FRONT_TUNE,
        ranges: {
          beachZ: { min: -20, max: 170, step: 1 },
          line1Z: { min: 0, max: 170, step: 1 },
          pillboxesZ: { min: -60, max: 40, step: 1 },
        },
        labels: { beachZ: '前線: 浜(z)', line1Z: '前線: 線1(z)', pillboxesZ: '前線: トーチカ線(z)' },
      },
      {
        name: 'PAYOFF_TUNE',
        table: PAYOFF_TUNE,
        ranges: {
          slowSec: { min: 0, max: 1, step: 0.01 },
          slowScale: { min: 0, max: 1, step: 0.05 },
          firstSlowSec: { min: 0, max: 1, step: 0.01 },
          firstSlowScale: { min: 0, max: 1, step: 0.05 },
          calmSec: { min: 0, max: 15, step: 0.5 },
          calmMul: { min: 1, max: 5, step: 0.1 },
          headlineSec: { min: 0, max: 4, step: 0.1 },
          cheerDelay: { min: 0, max: 5, step: 0.1 },
          retreatSpeed: { min: 1, max: 3, step: 0.05 },
          retreatHold: { min: 0, max: 10, step: 0.5 },
          retreatArrive: { min: 0.5, max: 5, step: 0.1 },
          surgeAllies: { min: 0, max: 40, step: 1 },
        },
        labels: {
          slowSec: '溜めの秒',
          slowScale: '溜めの時間の割合',
          firstSlowSec: '1基目の溜めの秒',
          firstSlowScale: '1基目の時間の割合',
          calmSec: '砲撃が弱まる秒',
          calmMul: '砲撃の間隔の倍率',
          headlineSec: '見出しの秒',
          cheerDelay: '歓声の遅れ（秒）',
          retreatSpeed: '下がる速さの倍率',
          retreatHold: '遮蔽に留まる秒',
          retreatArrive: '着いたと見る距離(m)',
          surgeAllies: '節目の増援（人）',
        },
      },
    ],
  });
}
