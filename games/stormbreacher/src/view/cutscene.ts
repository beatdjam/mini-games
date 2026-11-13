// The cutscene as the screen draws it (SB-180, SB-300): the black bars with the line in the lower one, the camera on the
// table's path, the crafts at sea that sink or come in, the shells that land, the battery's wrecks that go down and the
// player's ramp that comes down. The view reads GameModel and never writes it; what is shown when comes from
// logic/cutscene.ts and data/cutscenes.ts.
import * as THREE from 'three';
import { clamp, t } from '@engine/core/index.ts';
import { camera } from '@engine/render/index.ts';
import { boomShakeAt } from '../data/boom.ts';
import { HUD_COLOR } from '../data/colors.ts';
import { CUTSCENES, type CutsceneEvent } from '../data/cutscenes.ts';
import { CUTSCENE_SEC } from '../data/script.ts';
import { CAMERA_TUNE, FEEL_TUNE } from '../data/tune.ts';
import type { CutsceneId, MapBounds } from '../data/types.ts';
import { cutsceneEvents, cutsceneLine, cutscenePose } from '../logic/cutscene.ts';
import type { GameModel } from '../logic/game.ts';
import { spawnBoom } from './boom.ts';
import { feelBoom, spawnDust, type FeelState } from './feel.ts';
import { buildCraft, CRAFT_NAME, craftZ, RAMP_DOWN } from './shore.ts';
import { playSound, soundMix } from './sound.ts';

const BAR_HEIGHT = '12vh'; // each black bar, as in the HUD mock (#view-hud?cut=1)
const CAPTION_SIZE = 16; // px
const RAMP_UP = 1.35; // the ramp's turn about its hinge when it is shut (rad)
const SINK_ROLL = 0.6; // how far a sinking craft rolls over (rad)
const SINK_DEPTH = 5; // how far it goes down (m)
const RAMP_DUST = 8; // the dust's particle count before FEEL_TUNE.dust, where the ramp meets the sand
const RAMP_LENGTH = 5; // the ramp's length (m), for where its tip lands
const COLLAPSE_DEPTH = 3; // how far a target of the battery goes down in a collapse (m)
const COLLAPSE_TILT = 0.35; // how far it tips over (rad); alternate targets tip the other way

type SinkEvent = Extract<CutsceneEvent, { kind: 'sink' }>;
type ArriveEvent = Extract<CutsceneEvent, { kind: 'arrive' }>;
type CollapseEvent = Extract<CutsceneEvent, { kind: 'collapse' }>;

export interface CutsceneView {
  root: HTMLElement; // the bars; hidden when no cutscene plays
  caption: HTMLElement; // the line, in the lower bar
  lineKey: string | null; // the key the caption shows now
  playing: boolean; // a cutscene was drawn in the last frame
  elapsed: number; // the cutscene's second in the last frame; below 0 when none was playing
  ramp: THREE.Object3D; // the player's ramp, turning about x
  rampX: number; // where the player's craft stands on x (m)
  rampZ: number; // where the player's craft's body begins (m)
  crafts: { cutscene: CutsceneId; event: SinkEvent | ArriveEvent; craft: THREE.Group }[]; // the crafts at sea, with their events
  targets: Map<string, THREE.Mesh>; // the map's mission targets by id, for the collapse
  seaZ: number; // the map's front edge: a shell past it falls in the sea
}

const smooth = (u: number): number => u * u * (3 - 2 * u);

function bar(side: 'top' | 'bottom'): HTMLElement {
  const node = document.createElement('div');
  node.style.cssText =
    `position:absolute;left:0;right:0;height:${BAR_HEIGHT};background:#000;` + (side === 'top' ? 'top:0' : 'bottom:0');
  return node;
}

// Builds the bars into `parent` and puts the crafts the tables sink or bring in, in `shore`. Everything starts out of
// sight; the player's ramp starts down. `targets` are the map's mission targets (the view moves them in a collapse).
export function buildCutsceneView(
  parent: HTMLElement,
  shore: THREE.Group,
  bounds: MapBounds,
  targets: Map<string, THREE.Mesh>,
): CutsceneView {
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
  const crafts: CutsceneView['crafts'] = [];
  for (const [id, def] of Object.entries(CUTSCENES)) {
    for (const event of def.events) {
      if (event.kind !== 'sink' && event.kind !== 'arrive') continue;
      const craft = buildCraft(`${CRAFT_NAME}Side${crafts.length}`);
      craft.position.set(event.x, 0, event.kind === 'sink' ? (event.z ?? z) : event.from);
      craft.visible = false;
      shore.add(craft);
      crafts.push({ cutscene: id as CutsceneId, event, craft }); // the keys of CUTSCENES are cutscene ids
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
    crafts,
    targets,
    seaZ: bounds.maxZ,
  };
}

export function removeCutsceneView(view: CutsceneView): void {
  view.root.remove();
}

// How far along an event is at `elapsed`, 0 to 1.
const progress = (elapsed: number, at: number, sec: number): number => clamp((elapsed - at) / sec, 0, 1);

// One frame. While a cutscene with a table plays: the bars and the line show, the HUD hides, the camera goes where the
// table says, the ramp, the crafts and the collapsing targets follow the second, and the events of the frame blow up.
// `feel` takes the shake of those blasts; `offset` is the frame's shake, added to the cutscene's camera as well.
// Otherwise the bars are away, the ramp is down and the crafts beside the player's are out of sight. Call it after the
// game's own camera is placed and before anything is culled by the camera.
export function drawCutscene(
  view: CutsceneView,
  game: GameModel,
  hud: HTMLElement,
  feel: FeelState,
  offset: THREE.Vector3,
): void {
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
    for (const entry of view.crafts) entry.craft.visible = false;
    return;
  }

  const elapsed = CUTSCENE_SEC[cutscene.id] - cutscene.left;
  const pose = cutscenePose(cutscene.id, elapsed, game.mech);
  // a blast shakes the cutscene's camera by how near it is to that camera; a shell that falls past the map's front edge
  // is a water blast, as in the sortie. It sounds the way a big blast in the sortie does, from that camera's distance
  const blast = (kind: 'large' | 'craft' | 'water', x: number, y: number, z: number) => {
    spawnBoom(kind, x, y, z);
    const distance = Math.hypot(pose.pos[0] - x, pose.pos[2] - z);
    feelBoom(feel, boomShakeAt(kind, distance), FEEL_TUNE);
    playSound({ name: 'explosionLarge', ...soundMix(distance) });
  };
  for (const event of cutsceneEvents(cutscene.id, view.elapsed, elapsed)) {
    if (event.kind === 'sink') blast('craft', event.x, 1.2, (event.z ?? view.rampZ) + 6);
    else if (event.kind === 'ramp') spawnDust(view.rampX, view.rampZ - RAMP_LENGTH, RAMP_DUST, FEEL_TUNE);
    else if (event.kind === 'burst') blast(event.z >= view.seaZ ? 'water' : 'large', event.x, 0.8, event.z);
  }
  view.elapsed = elapsed;

  const key = cutsceneLine(cutscene.id, elapsed);
  if (key !== view.lineKey) {
    view.lineKey = key;
    view.caption.textContent = key === null ? '' : t(key);
  }

  camera.fov = CAMERA_TUNE.fov;
  camera.updateProjectionMatrix();
  camera.position.set(...pose.pos).add(offset);
  camera.lookAt(...pose.look);

  const ramp = def.events.find(event => event.kind === 'ramp');
  view.ramp.rotation.x =
    ramp === undefined ? RAMP_DOWN : RAMP_UP + (RAMP_DOWN - RAMP_UP) * smooth(progress(elapsed, ramp.at, ramp.sec));
  for (const entry of view.crafts) {
    const { event, craft } = entry;
    const p = smooth(progress(elapsed, event.at, event.sec));
    craft.visible = entry.cutscene === cutscene.id && (event.kind === 'arrive' || p < 1);
    if (event.kind === 'sink') {
      craft.rotation.z = p * SINK_ROLL;
      craft.position.y = -p * SINK_DEPTH;
    } else {
      craft.position.z = event.from + (event.z - event.from) * p;
    }
  }
  for (const event of def.events) {
    if (event.kind === 'collapse') collapse(view, event, progress(elapsed, event.at, event.sec));
  }
}

// Sinks and tips the event's targets, `u` of the way (0 to 1).
function collapse(view: CutsceneView, event: CollapseEvent, u: number): void {
  const p = smooth(u);
  event.targets.forEach((id, i) => {
    const mesh = view.targets.get(id);
    if (!mesh) throw new Error(`the collapse has no target "${id}"`);
    mesh.position.y = -p * COLLAPSE_DEPTH;
    mesh.rotation.z = (i % 2 === 0 ? 1 : -1) * p * COLLAPSE_TILT;
  });
}
