// The landing cutscene held at a second (#view-landing, SB-1630): the real sortie starts with the intro, and the loop's
// step is held at 0 so the picture stays at `?at=<s>`; the arrows move it by a tenth. The panel turns the nearest camera
// key's six values and LANDING_TUNE.startDepth, and copies the changed ones in the table's shape. The cutscene's own clock
// (its `left`) is written every frame, so the script never ends the intro by itself.
import { addSystem, LOOP, systems } from '@engine/core/index.ts';
import { renderer } from '@engine/render/index.ts';
import { currentGame, startSortie } from '../../app/play.ts';
import { CUTSCENES, type CameraKey } from '../../data/cutscenes.ts';
import { LANDING_TUNE } from '../../data/landing.ts';
import { CUTSCENE_SEC } from '../../data/script.ts';
import { FEEL_TUNE } from '../../data/tune.ts';
import { cutscenePose, type CutscenePose } from '../../logic/cutscene.ts';
import { createTunePanel, tuneNumber, type TuneGroup, type TuneRange } from '../tunePanel.ts';

declare global {
  interface Window {
    sbLandingReport?: () => string;
  }
}

const SYSTEM = 'sb-landing';
const AT_STEP = 0.1; // s the arrows move the picture
const MAX_AT = CUTSCENE_SEC.landing - 0.05; // a `left` of 0 ends the intro, so the last frame is just before it
const SHOT_CLOCK = 1000; // what performance.now() says while the view is held (ms)

interface LandingReport {
  at: number;
  keyAt: number;
  pose: CutscenePose;
  calls: number;
  triangles: number;
}

// The camera's six values: x and z over the map's range, y over the craft's height.
const CAMERA_RANGES: Record<string, TuneRange> = {
  'pos.0': { min: -80, max: 240, step: 0.05 },
  'pos.1': { min: -20, max: 40, step: 0.05 },
  'pos.2': { min: -80, max: 240, step: 0.05 },
  'look.0': { min: -80, max: 240, step: 0.05 },
  'look.1': { min: -20, max: 40, step: 0.05 },
  'look.2': { min: -80, max: 240, step: 0.05 },
};
const CAMERA_LABELS: Record<string, string> = {
  'pos.0': 'pos x (m)',
  'pos.1': 'pos y (m)',
  'pos.2': 'pos z (m)',
  'look.0': 'look x (m)',
  'look.1': 'look y (m)',
  'look.2': 'look z (m)',
};
const START_DEPTH_RANGES: Record<string, TuneRange> = { startDepth: { min: 0, max: 2.5, step: 0.05 } };
const START_DEPTH_LABELS: Record<string, string> = { startDepth: '甲板の深さ (m)' };

let at = 0; // the second the picture is held at
let keyIndex = 0; // the nearest key at or before `at`
let paint = () => {}; // writes the readouts and swaps the panel's key (the view that is open now)
let listening = false; // the arrow keys are listened for once
let held = false; // the loop and the clock are held (opening the view again keeps them)

function landingKeys(): readonly CameraKey[] {
  const def = CUTSCENES.landing;
  if (!def) throw new Error('no table for landing');
  return def.camera;
}

// The last key at or before `second` (the first key when it is before that one).
function keyIndexAt(second: number): number {
  const keys = landingKeys();
  let found = 0;
  for (let i = 0; i < keys.length; i++) if (keys[i].at <= second + 1e-9) found = i;
  return found;
}

// `?at=<s>` of the hash, clamped so the cutscene still plays.
function atOf(hash: string): number {
  const q = hash.indexOf('?');
  const params = new URLSearchParams(q >= 0 ? hash.slice(q + 1) : location.search);
  const raw = params.get('at');
  const value = raw === null || raw.trim() === '' ? 0 : Number(raw);
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_AT, Math.max(0, value));
}

const cameraGroups = (index: number): TuneGroup[] => [
  {
    name: `CUTSCENES.landing.camera.${index}`,
    table: landingKeys()[index],
    ranges: CAMERA_RANGES,
    labels: CAMERA_LABELS,
  },
  { name: 'LANDING_TUNE', table: LANDING_TUNE, ranges: START_DEPTH_RANGES, labels: START_DEPTH_LABELS },
];

const vecText = (v: readonly number[]): string => v.map(n => tuneNumber(n)).join(',');

// Opening the entry again must not leave the last opening's system running beside the new one.
function dropSystems(): void {
  for (let i = systems.length - 1; i >= 0; i--) if (systems[i].name === SYSTEM) systems.splice(i, 1);
}

// The step is 0, so the cutscene's second stays where `left` puts it and the page still draws each frame. A held step
// cannot let a blast's shake die away, so the view turns the shake off: the camera then sits on the key itself.
function hold(): void {
  if (held) return;
  held = true;
  LOOP.maxDt = 0;
  performance.now = () => SHOT_CLOCK;
  FEEL_TUNE.shakeMax = 0;
}

function listen(): void {
  if (listening) return;
  listening = true;
  window.addEventListener('keydown', event => {
    const right = event.code === 'ArrowRight' || event.key === 'ArrowRight';
    const left = event.code === 'ArrowLeft' || event.key === 'ArrowLeft';
    if (!right && !left) return;
    event.preventDefault();
    at = Math.min(MAX_AT, Math.max(0, Math.round((at + (right ? AT_STEP : -AT_STEP)) * 100) / 100));
    paint();
  });
}

export function showLanding(hash: string): void {
  at = atOf(hash);
  keyIndex = keyIndexAt(at);
  dropSystems();
  startSortie();
  hold();
  listen();

  const hud = document.createElement('div');
  hud.id = 'sbLandingHud';
  hud.dataset.noskip = ''; // pressing the readouts is not a request to skip the cutscene
  document.getElementById('sbLandingHud')?.remove();
  hud.style.cssText =
    'position:fixed;left:8px;top:calc(env(safe-area-inset-top,0px) + 8px);padding:4px 6px;' +
    'font:12px/1.4 monospace;color:#fff;background:rgba(0,0,0,0.45);white-space:pre;z-index:7';
  document.body.appendChild(hud);

  const readout = (label: string, name: string): HTMLElement => {
    const row = document.createElement('div');
    const title = document.createElement('span');
    title.textContent = `${label} `;
    const value = document.createElement('b');
    value.dataset.landing = name;
    row.append(title, value);
    hud.appendChild(row);
    return value;
  };
  const atText = readout('秒', 'at');
  const keyAtText = readout('キーの秒', 'keyAt');
  const keyIndexText = readout('キー番号', 'key');
  const poseText = readout('カメラ', 'pose');

  const note = document.createElement('div');
  note.dataset.landing = 'copy';
  note.style.cssText = 'margin-top:4px;color:#ffcf6a';
  note.textContent = '「値をコピー」は変えた値だけを CUTSCENES.landing.camera.<番号>.pos.0: … の形で出す';
  hud.appendChild(note);
  const help = document.createElement('div');
  help.style.cssText = 'color:#9fb3c0';
  help.textContent = '← → で 1/10 秒。?at=<秒> で開く秒。3.4→3.45 で艇の中へ。';
  hud.appendChild(help);

  const tune = createTunePanel({
    title: '導入 #view-landing',
    zIndex: 7,
    groups: cameraGroups(keyIndex),
  });
  tune.element.dataset.noskip = '';

  const poseOf = (): CutscenePose => cutscenePose('landing', at);

  paint = () => {
    const next = keyIndexAt(at);
    if (next !== keyIndex) {
      keyIndex = next;
      tune.setGroups(cameraGroups(keyIndex));
    }
    const pose = poseOf();
    atText.textContent = tuneNumber(at);
    keyAtText.textContent = tuneNumber(landingKeys()[keyIndex].at);
    keyIndexText.textContent = String(keyIndex);
    poseText.textContent = `pos ${vecText(pose.pos)} / look ${vecText(pose.look)}`;
  };
  paint();

  window.sbLandingReport = () => {
    const report: LandingReport = {
      at,
      keyAt: landingKeys()[keyIndex].at,
      pose: poseOf(),
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    };
    return JSON.stringify(report);
  };

  // Order -1 puts the second in before the sortie's own step, so the frame is drawn at `at` in the same frame.
  addSystem({
    name: SYSTEM,
    order: -1,
    modes: ['play'],
    update: () => {
      const game = currentGame();
      if (!game) return;
      game.script.cutscene = { id: 'landing', left: CUTSCENE_SEC.landing - at };
      paint();
    },
  });
}
