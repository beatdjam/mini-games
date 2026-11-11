// The screens the sortie moves through: the start button (title), the sortie itself and its result. The logic stays in
// logic/game.ts and the drawing in view/play.ts; this file decides which of them runs and what the page shows.
import { addSystem, el, t } from '@engine/core/index.ts';
import { scene } from '@engine/render/index.ts';
import { exitLock } from '@engine/ui/index.ts';
import { M1B_HAND } from '../data/maps/m1b-hand.ts';
import { newGame, step, type GameModel } from '../logic/game.ts';
import { GROUND_NAME, SIZE_BOX_NAME } from '../view/field.ts';
import { buildPlayView, drawPlay, type PlayView } from '../view/play.ts';
import { initPlayInput, readInput } from './input.ts';
import { setState } from './screen.ts';

let game: GameModel | null = null; // the sortie in play; null before the first one
let view: PlayView | null = null;
let started = false; // the play system and the result's button are set up once

// Hides the start-up field's ground and size box; the sortie's map takes their place.
function hideField(): void {
  const ground = scene.getObjectByName(GROUND_NAME);
  if (ground) ground.visible = false;
  const sizeBox = scene.getObjectByName(SIZE_BOX_NAME);
  if (sizeBox) sizeBox.visible = false;
}

// Takes the last sortie's map, targets and mech out of the scene.
function clearPlay(old: PlayView): void {
  scene.remove(old.world.built.group);
  scene.remove(old.world.targetGroup);
  scene.remove(old.model);
  for (const tracer of old.tracers) {
    scene.remove(tracer.line);
    tracer.line.geometry.dispose();
    tracer.line.material.dispose();
  }
}

// The sortie's time as minutes and seconds ("3:07").
function clock(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

// Starts a sortie on M1's B line. The tests sortie more than once on one page, so this builds the game again and takes
// out what the last one left; the play system and the input are set up only once.
export function startSortie(): void {
  if (view) clearPlay(view);
  view = null;
  el('#sbApp').hidden = true;
  el('#sbResult').hidden = true;
  setState('play');
  hideField();
  game = newGame(M1B_HAND);
  view = buildPlayView(game);
  initPlayInput();
  if (started) return;
  started = true;
  addSystem({ name: 'sb-play', modes: ['play'], update });
  // Provisional: the result and the save come with SB-210, so the title is the page as it loaded.
  el('#sbResultBack').addEventListener('click', () => location.reload());
}

function update(dt: number): void {
  if (!game || !view) return;
  const read = readInput(dt);
  step(game, read.input, dt);
  drawPlay(view, game, dt, read.pitchDelta);
  if (game.cleared) showResult();
}

// The result's screen: the run's time, and the title's page comes back by loading it again.
export function showResult(): void {
  if (!game) return;
  setState('result');
  el('#sbResult').hidden = false;
  el('#sbResultTime').textContent = t('result.time', { time: clock(game.time) });
  exitLock();
}

// The game in play, for the tests; null before the first sortie.
export const currentGame = (): GameModel | null => game;
