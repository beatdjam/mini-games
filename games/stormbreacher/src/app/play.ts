// The screens the sortie moves through: the start button (title), the sortie itself and its result. The logic stays in
// logic/game.ts and the drawing in view/play.ts; this file decides which of them runs and what the page shows.
import { addSystem, el, lang, t } from '@engine/core/index.ts';
import { scene } from '@engine/render/index.ts';
import { exitLock } from '@engine/ui/index.ts';
import { M1B_HAND } from '../data/maps/m1b-hand.ts';
import { CAMERA_TUNE } from '../data/tune.ts';
import { hasCutscene } from '../logic/cutscene.ts';
import { payoutOf, type Payout } from '../logic/economy.ts';
import { newGame, restartGame, retryFromCheckpoint, sendToScript, step, type GameModel } from '../logic/game.ts';
import { recordClear } from '../logic/save.ts';
import { aimRay } from '../view/camera.ts';
import { GROUND_NAME, SIZE_BOX_NAME } from '../view/field.ts';
import { removeCutsceneView } from '../view/cutscene.ts';
import { removeEnemyView } from '../view/enemies.ts';
import { removeHazardView } from '../view/hazards.ts';
import { removeHud } from '../view/hud.ts';
import { removeSeaFire } from '../view/seaFire.ts';
import { buildPlayView, drawPlay, type PlayView } from '../view/play.ts';
import { save, writeSave } from './storage.ts';
import { initPlayInput, readInput } from './input.ts';
import { setState } from './screen.ts';
import { armSkip, takeSkip } from './skip.ts';

let game: GameModel | null = null; // the sortie in play; null before the first one
let view: PlayView | null = null;
let settled: { game: GameModel; payout: Payout } | null = null; // the clear already written to the save, so a second showResult adds nothing
let started = false; // the play system and the result's button are set up once

// Hides the start-up field's ground and size box; the sortie's map takes their place.
function hideField(): void {
  const ground = scene.getObjectByName(GROUND_NAME);
  if (ground) ground.visible = false;
  const sizeBox = scene.getObjectByName(SIZE_BOX_NAME);
  if (sizeBox) sizeBox.visible = false;
}

// Takes the last sortie's map, targets, enemies and mech out of the scene.
function clearPlay(old: PlayView): void {
  scene.remove(old.world.built.group);
  scene.remove(old.world.targetGroup);
  scene.remove(old.world.shore);
  scene.remove(old.model);
  scene.remove(old.bullets.lines);
  old.bullets.lines.geometry.dispose();
  old.bullets.lines.material.dispose();
  scene.remove(old.enemyBullets.lines);
  old.enemyBullets.lines.geometry.dispose();
  old.enemyBullets.lines.material.dispose();
  removeEnemyView(old.enemies);
  removeHazardView(old.hazards);
  removeSeaFire(old.seaFire);
  removeHud(old.hud);
  removeCutsceneView(old.cutscene);
}

// The sortie's time as minutes and seconds ("3:07").
function clock(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

// Puts `next` in play: the last sortie's drawing is taken out, the page goes to the sortie and the game is drawn anew.
// The tests sortie more than once on one page, so this builds the view again; the play system and the buttons are set up
// only once.
function beginPlay(next: GameModel): void {
  if (view) clearPlay(view);
  view = null;
  el('#sbApp').hidden = true;
  el('#sbResult').hidden = true;
  setState('play');
  hideField();
  game = next;
  view = buildPlayView(game);
  initPlayInput();
  armSkip();
  if (started) return;
  started = true;
  addSystem({ name: 'sb-play', modes: ['play'], update });
  // The title is the page as it loaded.
  el('#sbResultBack').addEventListener('click', () => location.reload());
  el('#sbResultCheckpoint').addEventListener('click', () => {
    if (game && game.checkpoint) beginPlay(retryFromCheckpoint(game));
  });
  el('#sbResultRestart').addEventListener('click', () => {
    if (game) beginPlay(restartGame(game));
  });
}

// Starts a sortie on M1's B line.
export function startSortie(): void {
  beginPlay(newGame(M1B_HAND));
}

function update(dt: number): void {
  if (!game || !view) return;
  const read = readInput(dt);
  // The aim is the camera's line with the pitch of the last frame; drawPlay adds this frame's pitch change after.
  const aim = aimRay({ x: game.mech.x, y: game.mech.y, z: game.mech.z, yaw: game.mech.yaw }, view.pitch, CAMERA_TUNE);
  step(game, { ...read.input, sub: read.sub, aim }, dt);
  // A request to skip, or a cutscene that has no table (it is not played), ends the cutscene before it is drawn.
  const skip = takeSkip();
  const cutscene = game.script.cutscene;
  if (cutscene !== null && (skip || !hasCutscene(cutscene.id))) sendToScript(game, { kind: 'skip' });
  drawPlay(view, game, dt, read.pitchDelta);
  if (game.cleared || game.downed) showResult();
}

// A number with the language's thousands separators ("12,300").
const money = (n: number): string => n.toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-US');

// The cleared run's take-home, written into the save once (the money moves only here, at the clear) and returned.
function settle(done: GameModel): Payout {
  if (settled && settled.game === done) return settled.payout;
  const clearedBefore = save.records.missions[done.mission.id]?.cleared === true;
  const payout = payoutOf(done, clearedBefore);
  recordClear(save, done.mission.id, done.time, payout);
  writeSave();
  settled = { game: done, payout };
  return payout;
}

// The breakdown's lines: the base, the bonuses earned, the costs, the take-home and the funds, and a note when it does
// not go to the funds.
function payLines(payout: Payout): string[] {
  const lines = [t('result.base', { cr: money(payout.base) })];
  for (const id of ['depot', 'par', 'noRetry'] as const) {
    const bonus = payout.bonuses[id];
    if (bonus.earned) lines.push(t(`result.bonus.${id}`, { cr: money(bonus.amount) }));
  }
  lines.push(t('result.ammo', { cr: money(payout.ammo) }), t('result.repair', { cr: money(payout.repair) }));
  if (payout.retries > 0) {
    lines.push(t('result.retry', { count: payout.retries, cr: money(payout.retryCost) }));
  }
  lines.push(t('result.net', { cr: money(payout.net) }), t('result.funds', { cr: money(save.funds) }));
  if (!payout.credited) lines.push(t('result.noCredit'));
  return lines;
}

// The result's screen: the heading (the mech downed, or the script's end), the run's time, the cleared run's breakdown
// and the buttons. A downed mech
// can start again from the checkpoint (when there is one) or from the start; both come back to the title's page by
// loading it again.
export function showResult(): void {
  if (!game) return;
  if (view) view.hud.root.hidden = true;
  setState('result');
  el('#sbResult').hidden = false;
  el('#sbResult .title').textContent = t(game.downed ? 'result.downed' : 'result.title');
  el('#sbResultTime').textContent = t('result.time', { time: clock(game.time) });
  const pay = el('#sbResultPay');
  pay.replaceChildren();
  pay.hidden = !game.cleared;
  if (game.cleared) {
    for (const line of payLines(settle(game))) {
      const row = document.createElement('p');
      row.textContent = line;
      pay.append(row);
    }
  }
  el('#sbResultCheckpoint').hidden = !(game.downed && game.checkpoint);
  el('#sbResultRestart').hidden = !game.downed;
  exitLock();
}

// The game in play, for the tests; null before the first sortie.
export const currentGame = (): GameModel | null => game;
