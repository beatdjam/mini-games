// The infantry as the battle layer runs it (#view-squad, SB-1610): waves of 20 every 10 s, two squads of five walking on
// the machine-gun nests and falling in their fire, the rest of the wave scattered and now and then taken by a shell. The
// entry starts the real sortie and passes over the landing cutscene; the panel turns PLAY_BATTLE_TUNE, and "出撃し直す"
// makes the battle again so a changed value shows. Nothing is saved.
import { addSystem, systems } from '@engine/core/index.ts';
import { currentGame, startSortie } from '../../app/play.ts';
import { PLAY_BATTLE_TUNE } from '../../data/tune.ts';
import { sendToScript } from '../../logic/game.ts';
import { seed } from '../../logic/rng.ts';
import { createTunePanel, type TuneRange } from '../tunePanel.ts';

const SYSTEMS = ['sb-squad-skip'] as const;

// Where "B の手前へ" puts the mech (m); +z is the sea and the nests stand at z 147, 99 and 29.
const BEFORE_B = { x: 0, z: 140, y: 0 };

const BATTLE_RANGES: Record<string, TuneRange> = {
  allies: { min: 0, max: 60, step: 1 },
  allyWaves: { min: 0.5, max: 30, step: 0.5 },
  allySpeed: { min: 0, max: 10, step: 0.5 },
  allyDeathRate: { min: 0, max: 1, step: 0.01 },
  squads: { min: 0, max: 8, step: 1 },
  squad: { min: 0, max: 10, step: 1 },
  squadFallShare: { min: 0, max: 1, step: 0.05 },
  squadFallRadius: { min: 0, max: 40, step: 1 },
  shellFallRadius: { min: 0, max: 40, step: 1 },
  shellFallShare: { min: 0, max: 1, step: 0.05 },
};

const BATTLE_LABELS: Record<string, string> = {
  allies: '1波の人数(人)',
  allyWaves: '波の間隔(s)',
  allySpeed: '歩く速さ(m/s)',
  allyDeathRate: '1秒に倒れる確率',
  squads: '分隊の数',
  squad: '分隊の人数(人)',
  squadFallShare: '線で倒れる割合',
  squadFallRadius: '機銃座から倒れる距離(m)',
  shellFallRadius: '着弾で倒れる半径(m)',
  shellFallShare: '半径内で倒れる確率',
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

// The ?seed=<n> of the hash, or null: the same seed brings the same waves.
function seedOfHash(): number | null {
  const at = location.hash.indexOf('?');
  const value = at < 0 ? null : new URLSearchParams(location.hash.slice(at + 1)).get('seed');
  return value !== null && /^\d+$/.test(value) ? Number(value) >>> 0 : null;
}

// Puts the mech at `place` and lets its camera come round behind it.
function standAt(place: { x: number; z: number; y: number }): void {
  const game = currentGame();
  if (!game) return;
  game.mech.x = place.x;
  game.mech.z = place.z;
  game.mech.y = place.y;
  game.mech.grounded = true;
  game.mech.yaw = 0;
}

export function showSquad(_hash: string) {
  dropSystems();
  const seedValue = seedOfHash();
  if (seedValue !== null) seed(seedValue);
  startSortie();

  // The sortie's first step puts the landing cutscene up; a restart puts it up again, so every landing is passed over.
  addSystem({
    name: 'sb-squad-skip',
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
  button(row, 'B の手前へ', () => {
    standAt(BEFORE_B);
    const game = currentGame();
    if (game) sendToScript(game, { kind: 'enter', area: 'b-line' });
  });
  button(row, '出撃し直す', () => startSortie());

  const note = document.createElement('div');
  note.style.cssText = 'margin-top:6px;color:#9fb3c0;white-space:pre-wrap';
  note.textContent =
    '出た瞬間: 海側から20人が来て、5人の分隊2つが機銃座へ歩き、機銃座から10m以内で一部が倒れる。\n' +
    '残りの10人は今までどおり浜に散らばり、倒れ方も今までどおり。\n' +
    'B の手前: 機銃座（z 147）は機体の後ろ（海側）に立つ。\n' +
    'つまみは「出撃し直す」で反映する（人数・分隊は作り直しで効く）。\n' +
    '保存はしない。';
  extra.appendChild(note);

  createTunePanel({
    title: '歩兵の分隊 #view-squad',
    extra,
    groups: [
      {
        name: 'PLAY_BATTLE_TUNE',
        table: PLAY_BATTLE_TUNE,
        ranges: BATTLE_RANGES,
        labels: BATTLE_LABELS,
      },
    ],
  });
}
