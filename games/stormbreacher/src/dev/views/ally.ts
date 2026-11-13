// The five allied mechs as the sortie runs them (#view-allies, SB-1590): the entry starts the real sortie and passes over
// the landing cutscene, and its buttons put the mech in front of B, before C and on the seawall, fire the cue of the
// place, and let the five take their posts, the gunner fall and the three cover mechs go on to C and the boss. The panel
// turns ALLY_TUNE and RADIO_TUNE; nothing is saved.
import { addSystem, systems } from '@engine/core/index.ts';
import { currentGame, startSortie } from '../../app/play.ts';
import { ALLY_TUNE } from '../../data/allies.ts';
import { RADIO_TUNE } from '../../data/script.ts';
import { sendToScript } from '../../logic/game.ts';
import { newEnemy } from '../../logic/enemies.ts';
import { createTunePanel, type TuneRange } from '../tunePanel.ts';

const SYSTEMS = ['sb-ally-skip'] as const;

// Where a button puts the mech (m); +z is the sea. The seawall's top is 6 m up.
const BEFORE_B = { x: 0, z: 140, y: 0 };
const BEFORE_C = { x: 35, z: -30, y: 0 };
const ON_SEAWALL = { x: 35, z: -70, y: 6 };
const PILLBOXES = ['pillbox-1', 'pillbox-2'] as const;

// Where the buttons put enemies to be shot at (m); within ALLY_TUNE.engageRange of the allies' posts.
const B_ENEMIES = [
  { x: 0, z: 70 },
  { x: 35, z: 70 },
  { x: 70, z: 70 },
] as const;
const C_ENEMIES = [
  { x: 0, z: -55 },
  { x: 35, z: -55 },
  { x: 70, z: -55 },
] as const;

const ALLY_RANGES: Record<string, TuneRange> = {
  speed: { min: 1, max: 20, step: 0.5 },
  arrive: { min: 0, max: 5, step: 0.1 },
  callLead: { min: 0, max: 10, step: 0.5 },
  groundRadius: { min: 0, max: 2, step: 0.1 },
  maxGround: { min: 0, max: 10, step: 0.5 },
  fallSpeed: { min: 1, max: 60, step: 1 },
  engageRange: { min: 10, max: 120, step: 5 },
  aimSpreadDeg: { min: 0, max: 8, step: 0.1 },
  enemyTracerEvery: { min: 0.2, max: 8, step: 0.1 },
  enemyTracerRange: { min: 10, max: 120, step: 5 },
  enemyTracerSpreadDeg: { min: 0, max: 8, step: 0.1 },
};

const ALLY_LABELS: Record<string, string> = {
  speed: '走る速さ(m/s)',
  arrive: '着いたと見る距離(m)',
  callLead: '倒れる前に叫ぶ秒(s)',
  groundRadius: '足元の半径(m)',
  maxGround: '上がれる高さ(m)',
  fallSpeed: '落ちる速さ(m/s)',
  engageRange: '撃つ敵を探す距離(m)',
  aimSpreadDeg: '味方機の散らし(deg)',
  enemyTracerEvery: '敵の曳光の間隔(s)',
  enemyTracerRange: '敵が探す距離(m)',
  enemyTracerSpreadDeg: '敵の散らし(deg)',
};

const RADIO_RANGES: Record<string, TuneRange> = {
  minSec: { min: 0.5, max: 8, step: 0.5 },
  maxPending: { min: 1, max: 16, step: 1 },
};

const RADIO_LABELS: Record<string, string> = {
  minSec: '1行を出す秒(s)',
  maxPending: '待たせる行の上限',
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

// Puts three enemies where the allies can see them, so the exchange of tracers shows.
function putEnemies(prefix: string, places: readonly { x: number; z: number }[]): void {
  const game = currentGame();
  if (!game) return;
  places.forEach((place, i) =>
    game.enemies.push(newEnemy(`dev-${prefix}-${game.enemies.length + i + 1}`, 'dev', 'grunt', place.x, place.z)),
  );
}

// Breaks both pillboxes, which fires cp1 and sends the three cover mechs on to C.
function breakPillboxes(): void {
  const game = currentGame();
  if (!game) return;
  for (const id of PILLBOXES) {
    const target = game.targets.find(entry => entry.id === id);
    if (target && target.hp > 0) target.hp = 0;
  }
  for (const id of PILLBOXES) sendToScript(game, { kind: 'destroyed', target: id });
}

export function showAlly(_hash: string) {
  dropSystems();
  startSortie();

  // The sortie's first step puts the landing cutscene up; a restart puts it up again, so every landing is passed over.
  addSystem({
    name: 'sb-ally-skip',
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
  button(row, 'C の手前へ', () => {
    standAt(BEFORE_C);
    breakPillboxes();
    const game = currentGame();
    if (game) sendToScript(game, { kind: 'enter', area: 'c-line' });
  });
  button(row, '防波堤の上へ', () => {
    standAt(ON_SEAWALL);
    const game = currentGame();
    if (game) sendToScript(game, { kind: 'enter', area: 'seawall-top' });
  });
  const enemyRow = document.createElement('div');
  enemyRow.style.cssText = 'display:flex;gap:4px;margin-bottom:6px';
  extra.appendChild(enemyRow);
  button(enemyRow, 'B の手前に敵', () => putEnemies('b', B_ENEMIES));
  button(enemyRow, 'C の手前に敵', () => putEnemies('c', C_ENEMIES));
  const restartRow = document.createElement('div');
  restartRow.style.cssText = 'display:flex;gap:4px;margin-bottom:6px';
  extra.appendChild(restartRow);
  button(restartRow, 'やり直す', () => startSortie());

  const note = document.createElement('div');
  note.style.cssText = 'margin-top:6px;color:#9fb3c0;white-space:pre-wrap';
  note.textContent =
    'B の手前: 4機が出て、B に入ると gunner が5機目に出て倒れる。\n' +
    'C の手前: トーチカ2基を壊して cp1 を起こし、3機が C へ動く。\n' +
    '防波堤の上: 3機がボスの投稿へ動く（坂の上で足元が上がる）。\n' +
    'B/C の手前に敵: 味方機の曳光が敵へ、敵の曳光が味方機へ向く（当たりは無い）。\n' +
    '保存はしない。';
  extra.appendChild(note);

  createTunePanel({
    title: '味方機 #view-allies',
    extra,
    groups: [
      { name: 'ALLY_TUNE', table: ALLY_TUNE, ranges: ALLY_RANGES, labels: ALLY_LABELS },
      { name: 'RADIO_TUNE', table: RADIO_TUNE, ranges: RADIO_RANGES, labels: RADIO_LABELS },
    ],
  });
}
