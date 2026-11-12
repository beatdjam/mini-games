// The cutscene as the screen draws it (SB-180): the black bars with the line in the lower one, the camera on the table's
// path, the craft beside the player's that sinks and the player's ramp that comes down. The view reads GameModel and
// never writes it; what is shown when comes from logic/cutscene.ts and data/cutscenes.ts.
import * as THREE from 'three';
import { clamp, t } from '@engine/core/index.ts';
import { camera } from '@engine/render/index.ts';
import { HUD_COLOR } from '../data/colors.ts';
import { CUTSCENES, type CutsceneEvent } from '../data/cutscenes.ts';
import { CUTSCENE_SEC } from '../data/script.ts';
import { CAMERA_TUNE, FEEL_TUNE } from '../data/tune.ts';
import type { MapBounds } from '../data/types.ts';
import { cutsceneEvents, cutsceneLine, cutscenePose } from '../logic/cutscene.ts';
import type { GameModel } from '../logic/game.ts';
import { spawnDust } from './feel.ts';
import { buildCraft, CRAFT_NAME, craftZ, RAMP_DOWN } from './shore.ts';

const BAR_HEIGHT = '12vh'; // each black bar, as in the HUD mock (#view-hud?cut=1)
const CAPTION_SIZE = 16; // px
const RAMP_UP = 1.35; // the ramp's turn about its hinge when it is shut (rad)
const SINK_ROLL = 0.6; // how far a sinking craft rolls over (rad)
const SINK_DEPTH = 5; // how far it goes down (m)
const SINK_DUST = 14; // the dust's particle count before FEEL_TUNE.dust, where a craft goes down
const RAMP_DUST = 8; // the same, where the ramp meets the sand
const RAMP_LENGTH = 5; // the ramp's length (m), for where its tip lands

type SinkEvent = Extract<CutsceneEvent, { kind: 'sink' }>;

export interface CutsceneView {
  root: HTMLElement; // the bars; hidden when no cutscene plays
  caption: HTMLElement; // the line, in the lower bar
  lineKey: string | null; // the key the caption shows now
  playing: boolean; // a cutscene was drawn in the last frame
  elapsed: number; // the cutscene's second in the last frame; below 0 when none was playing
  ramp: THREE.Object3D; // the player's ramp, turning about x
  rampX: number; // where the player's craft stands on x (m)
  rampZ: number; // where the player's craft's body begins (m)
  sinkers: { event: SinkEvent; craft: THREE.Group }[]; // the crafts that sink, with their events
}

const smooth = (u: number): number => u * u * (3 - 2 * u);

function bar(side: 'top' | 'bottom'): HTMLElement {
  const node = document.createElement('div');
  node.style.cssText =
    `position:absolute;left:0;right:0;height:${BAR_HEIGHT};background:#000;` + (side === 'top' ? 'top:0' : 'bottom:0');
  return node;
}

// Builds the bars into `parent` and puts the crafts the tables sink beside the player's, in `shore`. Everything starts
// out of sight; the player's ramp starts down.
export function buildCutsceneView(parent: HTMLElement, shore: THREE.Group, bounds: MapBounds): CutsceneView {
  const root = document.createElement('div');
  root.id = 'sbCutscene';
  root.hidden = true;
  root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:6';
  const top = bar('top');
  top.dataset.cutscene = 'top';
  const bottom = bar('bottom');
  bottom.dataset.cutscene = 'bottom';
  const caption = document.createElement('div');
  caption.dataset.cutscene = 'caption';
  caption.style.cssText =
    `position:absolute;left:0;right:0;bottom:0;height:${BAR_HEIGHT};display:flex;align-items:center;` +
    `justify-content:center;color:${HUD_COLOR.text};font-size:${CAPTION_SIZE}px;white-space:nowrap`;
  root.append(top, bottom, caption);
  parent.appendChild(root);

  const z = craftZ(bounds);
  const sinkers: CutsceneView['sinkers'] = [];
  for (const def of Object.values(CUTSCENES)) {
    for (const event of def.events) {
      if (event.kind !== 'sink') continue;
      const craft = buildCraft(`${CRAFT_NAME}Side${sinkers.length}`);
      craft.position.set(event.x, 0, z);
      craft.visible = false;
      shore.add(craft);
      sinkers.push({ event, craft });
    }
  }
  const ramp = shore.getObjectByName(`${CRAFT_NAME}Ramp`);
  if (!ramp) throw new Error("the player's craft has no ramp");
  return {
    root,
    caption,
    lineKey: null,
    playing: false,
    elapsed: -1,
    ramp,
    rampX: (bounds.minX + bounds.maxX) / 2,
    rampZ: z,
    sinkers,
  };
}

export function removeCutsceneView(view: CutsceneView): void {
  view.root.remove();
}

// How far along an event is at `elapsed`, 0 to 1.
const progress = (elapsed: number, at: number, sec: number): number => clamp((elapsed - at) / sec, 0, 1);

// One frame. While a cutscene with a table plays: the bars and the line show, the HUD hides, the camera goes where the
// table says, the ramp and the sinking craft follow the second, and the events of the frame throw dust. Otherwise the
// bars are away, the ramp is down and the crafts beside the player's are out of sight. Call it after the game's own
// camera is placed and before anything is culled by the camera.
export function drawCutscene(view: CutsceneView, game: GameModel, hud: HTMLElement): void {
  const cutscene = game.script.cutscene;
  const def = cutscene === null ? undefined : CUTSCENES[cutscene.id];
  const playing = cutscene !== null && def !== undefined;
  if (playing !== view.playing) {
    view.playing = playing;
    view.root.hidden = !playing;
    hud.hidden = playing;
  }
  if (!playing || def === undefined || cutscene === null) {
    view.elapsed = -1;
    view.ramp.rotation.x = RAMP_DOWN;
    for (const sinker of view.sinkers) sinker.craft.visible = false;
    return;
  }

  const elapsed = CUTSCENE_SEC[cutscene.id] - cutscene.left;
  for (const event of cutsceneEvents(cutscene.id, view.elapsed, elapsed)) {
    if (event.kind === 'sink') spawnDust(event.x, view.rampZ + 6, SINK_DUST, FEEL_TUNE);
    else spawnDust(view.rampX, view.rampZ - RAMP_LENGTH, RAMP_DUST, FEEL_TUNE);
  }
  view.elapsed = elapsed;

  const key = cutsceneLine(cutscene.id, elapsed);
  if (key !== view.lineKey) {
    view.lineKey = key;
    view.caption.textContent = key === null ? '' : t(key);
  }

  const pose = cutscenePose(cutscene.id, elapsed);
  camera.fov = CAMERA_TUNE.fov;
  camera.updateProjectionMatrix();
  camera.position.set(...pose.pos);
  camera.lookAt(...pose.look);

  const ramp = def.events.find(event => event.kind === 'ramp');
  view.ramp.rotation.x =
    ramp === undefined ? RAMP_DOWN : RAMP_UP + (RAMP_DOWN - RAMP_UP) * smooth(progress(elapsed, ramp.at, ramp.sec));
  for (const sinker of view.sinkers) {
    const p = smooth(progress(elapsed, sinker.event.at, sinker.event.sec));
    sinker.craft.visible = p < 1;
    sinker.craft.rotation.z = p * SINK_ROLL;
    sinker.craft.position.y = -p * SINK_DEPTH;
  }
}
