// The screens the sortie moves through: the start button (title), the sortie itself and its result. The logic stays in
// logic/game.ts and the drawing in view/play.ts; this file decides which of them runs and what the page shows.
import { addSystem, el, isTouch, lang, t } from '@engine/core/index.ts';
import { disposeTree, scene } from '@engine/render/index.ts';
import { exitLock } from '@engine/ui/index.ts';
import { M1B_HAND } from '../data/maps/m1b-hand.ts';
import { CUTSCENE_SKIP_GUARD_SEC } from '../data/script.ts';
import { TOUCH_TUNE } from '../data/touch.ts';
import { cutsceneElapsed, hasCutscene } from '../logic/cutscene.ts';
import { payoutOf, type Payout } from '../logic/economy.ts';
import { playInputOptions } from '../logic/input.ts';
import { touchAimInput } from '../logic/touchAim.ts';
import {
  newGame,
  restartGame,
  retryFromCheckpoint,
  sendToScript,
  step,
  timeScale,
  type GameInput,
  type GameModel,
} from '../logic/game.ts';
import { recordClear } from '../logic/save.ts';
import { GROUND_NAME, SIZE_BOX_NAME, placeCamera } from '../view/field.ts';
import { removeAllyView } from '../view/allies.ts';
import { removeBooms } from '../view/boom.ts';
import { removeAtmosphere } from '../view/atmosphere.ts';
import { removeBlastView } from '../view/blasts.ts';
import { removeCutsceneView } from '../view/cutscene.ts';
import { removeEnemyView } from '../view/enemies.ts';
import { removeGunfireView } from '../view/gunfire.ts';
import { removeHazardView } from '../view/hazards.ts';
import { removeHurtView } from '../view/hurt.ts';
import { placeReticle, removeHud } from '../view/hud.ts';
import { disposeProtoMech } from '../view/mechProtoModel.ts';
import { removeSeaFire } from '../view/seaFire.ts';
import { applyMarkerQuery } from '../data/marker.ts';
import { aimPointOf, buildPlayView, drawPlay, removeWardenChargeView, type PlayView } from '../view/play.ts';
import { resetSound, soundFrame } from '../view/sound.ts';
import { openBriefing } from './briefing.ts';
import { clearSuspend, loadSuspend, save, writeSave, writeSuspend } from './storage.ts';
import { cursorAimInput, holdMouseFireUntilRelease, initPlayInput, readInput, type PlayRead } from './input.ts';
import { hidePause, initPause, showPauseButton } from './pause.ts';
import { setState } from './screen.ts';
import { armSkip, skipFromPointer, takeSkip } from './skip.ts';
import { releaseTouch } from './touch.ts';

let game: GameModel | null = null; // the sortie in play; null before the first one
let view: PlayView | null = null;
let settled: { game: GameModel; payout: Payout } | null = null; // the clear already written to the save, so a second showResult adds nothing
let confirmingStart = false; // the title's start button asked whether to discard the suspended sortie, and waits for the second press
let started = false; // the play system and the result's button are set up once

// The movement frame and the ground point a step adds: WASD moves with the screen's top (the quarter camera's azimuth)
// and the mech faces the ground under the cursor at its feet (the middle of the screen until the mouse moves). With no
// point (the first frame, or the top edge above the horizon) the current yaw is held, so the turn keys do not take the
// aim over. A touch screen moves with the same frame: its right drag aims at a point on the ground and, without a right
// touch, the mech keeps the yaw it last aimed at. The arena calls this too.
export function cursorAim(
  game: GameModel,
  view: PlayView,
  read: PlayRead,
): Pick<GameInput, 'frame' | 'aimAt' | 'face'> {
  const azimuth = view.quarter.tune.azimuth;
  if (isTouch) {
    return touchAimInput({
      mech: { x: game.mech.x, z: game.mech.z },
      yaw: game.mech.yaw,
      azimuth,
      drag: read.drag,
      tune: TOUCH_TUNE,
    });
  }
  const at = aimPointOf(view, read.cursor ?? { x: 0, y: 0 }, game.mech.y);
  return { frame: azimuth, ...cursorAimInput(at, game.mech.yaw) };
}

// Hides the start-up field's ground and size box; the sortie's map takes their place.
function hideField(): void {
  const ground = scene.getObjectByName(GROUND_NAME);
  if (ground) ground.visible = false;
  const sizeBox = scene.getObjectByName(SIZE_BOX_NAME);
  if (sizeBox) sizeBox.visible = false;
}

// Takes the last sortie's map, targets, enemies and mech out of the scene.
function clearPlay(old: PlayView): void {
  // The map, the targets, the shore and the mech are built anew for every sortie, so their shapes and pictures are freed
  // here: leaving them to the scene's removal alone would keep them on the GPU, one sortie's worth each time.
  scene.remove(old.world.built.group);
  disposeTree(old.world.built.group);
  scene.remove(old.world.targetGroup);
  disposeTree(old.world.targetGroup);
  scene.remove(old.world.shore);
  disposeTree(old.world.shore);
  scene.remove(old.model);
  removeGunfireView(old.gunfire);
  disposeProtoMech(old.model);
  old.stage?.dispose();
  removeEnemyView(old.enemies);
  removeWardenChargeView(old.wardenCharge);
  removeHazardView(old.hazards);
  removeSeaFire(old.seaFire);
  old.battle.dispose();
  removeAllyView(old.allies);
  removeBlastView(old.blasts);
  removeHurtView(old.hurt);
  removeHud(old.hud);
  removeCutsceneView(old.cutscene);
  removeBooms();
  removeAtmosphere();
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
  resetSound(game.radio);
  // `?marker=dim|map|next` picks how the blast points' lights show (SB-2022)
  applyMarkerQuery(location.search);
  view = buildPlayView(game);
  initPlayInput(playInputOptions());
  // the title hides the touch layer so it does not cover the title's buttons; a sortie shows it again
  el('#touch').hidden = !isTouch;
  // the main body takes no jump (D-50), so its touch layer has no jump button
  el('#btnJump').hidden = true;
  touchCovered = false;
  hidePause();
  showPauseButton(true);
  armSkip();
  if (started) return;
  started = true;
  initPause({
    inCutscene: () => game !== null && game.script.cutscene !== null,
    suspend: suspendSortie,
    abandon: abandonSortie,
  });
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

// Starts a sortie on M1's B line. A suspended sortie is thrown away: the new one replaces it.
export function startSortie(): void {
  clearSuspend();
  beginPlay(newGame(M1B_HAND));
}

// Puts the title back: the sortie's drawing is taken out, the start-up field shows again and the title's buttons are
// set for the suspend that is there or not. The page is not loaded again, so the tests can go on after it.
// How the pause menu goes back to the title. The page loads again, as the result's "back to title" does: the sortie's
// look (lights, colour filter, fog, ground) stays on the scene otherwise, and the title's field shows washed out. The
// e2e tests cannot load the page again in the middle of a test, so they turn `reload` off and get the in-page way.
export const titleReturn = { reload: true };

function returnToTitle(): void {
  if (titleReturn.reload) {
    location.reload();
    return;
  }
  if (view) clearPlay(view);
  view = null;
  game = null;
  hidePause();
  showPauseButton(false);
  el('#touch').hidden = true;
  el('#sbResult').hidden = true;
  el('#sbApp').hidden = false;
  const ground = scene.getObjectByName(GROUND_NAME);
  if (ground) ground.visible = true;
  const sizeBox = scene.getObjectByName(SIZE_BOX_NAME);
  if (sizeBox) sizeBox.visible = true;
  placeCamera();
  exitLock();
  setState('title');
  syncTitle();
}

// Writes the sortie as it stands (the pause menu's suspend) and goes to the title, where "continue" takes it back.
function suspendSortie(): void {
  if (!game) return;
  writeSuspend(game);
  returnToTitle();
}

// Gives the sortie up (the pause menu's abandon, after its question): no reward and no save is written, and a suspend
// from before is gone too.
function abandonSortie(): void {
  clearSuspend();
  returnToTitle();
}

// Sets the title's buttons for the save: "continue" shows only while a sortie is suspended, and the start button goes
// back to its plain word.
export function syncTitle(): void {
  confirmingStart = false;
  el('#sbContinue').hidden = loadSuspend() === null;
  el('#sbStart').textContent = t('app.start');
}

// The title's start button (and Enter). With a sortie suspended, the first press asks (the new sortie would discard it)
// and the second opens the briefing, which starts the sortie when it ends. "Continue" and the retries skip the briefing.
export function pressStart(): void {
  if (!confirmingStart && loadSuspend() !== null) {
    confirmingStart = true;
    el('#sbStart').textContent = t('app.startOver');
    return;
  }
  openBriefing(startSortie);
}

// The title's "continue": the suspended sortie comes back and the suspend is gone, so one suspend gives one sortie back
// (a clear pays once). A suspend that cannot be read is gone already (loadSuspend) and the title goes on without it.
export function continueSortie(): void {
  const resumed = loadSuspend();
  if (resumed === null) {
    syncTitle();
    return;
  }
  clearSuspend();
  beginPlay(resumed);
}

// Whether the cutscene has hidden the touch layer (so the layer is put back only once, as the cutscene ends).
let touchCovered = false;

// The touch layer (stick and buttons) is hidden while a cutscene plays, as the HUD is, and comes back when it ends. It
// was shown only where the sortie showed it (a touch device), and a PC has it hidden all along, so a PC is not touched
// here. Hiding lets go of what the fingers held, so nothing walks or shoots on return. A tap still skips: the skip
// listens on the window, not on #touch.
function hideTouchInCutscene(inCutscene: boolean): void {
  const touch = el('#touch');
  if (inCutscene && !touchCovered && !touch.hidden) {
    touchCovered = true;
    touch.hidden = true;
    releaseTouch();
  } else if (!inCutscene && touchCovered) {
    touchCovered = false;
    touch.hidden = false;
  }
}

function update(dt: number): void {
  if (!game || !view) return;
  const read = readInput(dt);
  // The quarter camera leaves the aim undefined, so step builds the level line from the chest to the cursor's point
  // (the middle of the screen before the mouse moves). A touch screen adds the same movement frame, its right drag's
  // point or, without one, the stick's facing.
  const aim = view.aim;
  const cursor = cursorAim(game, view, read);
  step(game, { ...read.input, ...cursor, sub: read.sub, use: read.use, melee: read.melee, aim }, dt);
  // A milestone's short slowdown (SB-2010) slows the picture as well as the game: the blast, the smoke and the battle
  // run at the same share of time, while the input still goes through (step already scaled its own frame).
  const drawDt = dt * timeScale(game);
  // A request to skip, or a cutscene that has no table (it is not played), ends the cutscene before it is drawn. A
  // cutscene that step has just started takes no skip for CUTSCENE_SKIP_GUARD_SEC: the jump, shot or Enter of this frame
  // started it. takeSkip runs every frame, so a press inside the guard is thrown away rather than saved up.
  const skip = takeSkip();
  const cutscene = game.script.cutscene;
  if (cutscene !== null) {
    const elapsed = cutsceneElapsed(cutscene);
    if (!hasCutscene(cutscene.id) || (skip && elapsed >= CUTSCENE_SKIP_GUARD_SEC)) {
      sendToScript(game, { kind: 'skip' });
      // The mouse press that skipped must not turn into a shot once the controls come back (ticket 2137).
      if (skip && skipFromPointer()) holdMouseFireUntilRelease();
    }
  }
  hideTouchInCutscene(game.script.cutscene !== null);
  // the cutscene's sounds play too: this line is not behind the cutscene branch
  soundFrame(game, dt);
  drawPlay(view, game, drawDt);
  // the PC's reticle marks the cursor; a touch screen keeps the dot and circle at the centre (read.cursor is null there)
  placeReticle(view.hud, read.cursor);
  // the touch use button lights while the mech stands in reach of a blast point (SB-2017)
  el('#btnUse').classList.toggle('on', view.useNear);
  // a cleared sortie shows its result once the closing cutscene is over
  if ((game.cleared && game.script.cutscene === null) || game.downed) showResult();
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
  showPauseButton(false);
  // the touch layer covers the whole screen and would take the result's taps (back to title, retry)
  el('#touch').hidden = true;
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

// The sortie's view, for the tests; null before the first sortie.
export const currentPlayView = (): PlayView | null => view;
