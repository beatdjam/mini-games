// The mech's look plans A, E, F, B, D (#view-mech): the M1 B beach with the mech on it, spun to look around. It never
// reads the game's state and never takes input. The buttons act out walking, boosting, jumping and firing for the
// body's motion (SB-130's third card).
import * as THREE from 'three';
import { addSystem, el } from '@engine/core/index.ts';
import { camera, cullChunks, renderer, scene } from '@engine/render/index.ts';
import { PROTO_PALETTES } from '../../data/colors.ts';
import { lookOf } from '../../data/looks.ts';
import { M1B_HAND } from '../../data/maps/m1b-hand.ts';
import { meleeBlowSec } from '../../data/melee.ts';
import { CORES, MECH_PAINT, MECH_PAINT_TEX, PARTS } from '../../data/mech.ts';
import { PROTO_KIT_IDS, PROTO_KITS, PROTO_MATERIALS, PROTO_TUNE, type ProtoKitId } from '../../data/mechProto.ts';
import { CAMERA_TUNE, MECH_TUNE, MOVE_TUNE } from '../../data/tune.ts';
import { moveTuneOf } from '../../logic/mechTune.ts';
import { applyPose, cameraPose } from '../../view/camera.ts';
import { applyLookTo } from '../../view/look.ts';
import { animateMech, buildMechVisual, countMechDraws, disposeMech } from '../../view/mechModel.ts';
import { animateProtoMech, buildProtoMech, countProtoDraws, disposeProtoMech } from '../../view/mechProtoModel.ts';
import { protoTextureBytes } from '../../view/mechProtoSurfaces.ts';
import { resetMechPaint } from '../../view/mechSurfaces.ts';
import { addProtoStage, stageFlag, type ProtoStage } from '../../view/protoStage.ts';
import { PATTERN_IDS, PATTERN_LABELS, PATTERNS, type PatternId } from '../mech/patterns.ts';
import { createTunePanel, type TunePanel } from '../tunePanel.ts';
import { buildMapScene, MAP_FOG } from './mapView.ts';

declare global {
  interface Window {
    sbMechReport?: () => string;
  }
}

const BUTTON_TEXT = '#ffcf6a';
const BUTTON_BACK = 'rgba(10,17,25,.85)';
const BUTTON_ON_TEXT = '#10161d';
const BUTTON_ON_BACK = 'rgba(255,207,106,.85)';
const BUTTON =
  'pointer-events:auto;min-height:30px;padding:0 8px;border-radius:4px;font:inherit;font-size:12px;white-space:nowrap;' +
  `border:1px solid rgba(255,207,106,.55);background:${BUTTON_BACK};color:${BUTTON_TEXT}`;

// How far inside the map's front edge the mech stands (m); showMap's MECH_MARGIN is not exported.
const MECH_MARGIN = 4;

// The spin's speed (rad/s; 仮).
const SPIN_RATE = 0.6;

const KEY_PATTERN: Record<string, PatternId> = { '1': 'a', '2': 'e', '3': 'f', '4': 'b', '5': 'd' };

// The kits of #view-mech?kit: the player's prototype, the friendly paint, and the three views' variants. The labels stay
// in src/dev/, where screen text is allowed.
const KIT_LABELS: Record<ProtoKitId, string> = {
  player: '自機（白・黄）',
  ally: '味方（明るい黄・橙）',
  sniper: '狙撃',
  scout: '偵察',
  enemy: '敵（灰・赤）',
  enemyRifle: '敵・小銃',
  enemyGunner: '敵・ガンナー',
  enemyHeavy: '敵・重装',
  boss: 'ボス（黒・赤）',
};

// The motions the buttons act out. 'jump' lasts one hop; the others stay on until pressed again.
const ACTS = ['walk', 'boost', 'jump', 'fire'] as const;
type Act = (typeof ACTS)[number];
const ACT_LABELS: Record<Act, string> = { walk: '歩く', boost: 'ブースト', jump: '跳ぶ', fire: '撃つ' };
const KEY_ACT: Record<string, Act> = { w: 'walk', b: 'boost', j: 'jump', f: 'fire' };
const FIRE_INTERVAL = 0.125; // the time between the acted shots (s)

type ViewMode = 'spin' | 'behind';

interface MechState {
  pattern: PatternId;
  spin: boolean;
  view: ViewMode;
  proto: boolean; // draw the prototype (data/mechProto.ts) in place of the sortie's mech
  kit: ProtoKitId; // the parts and palette the prototype wears (?kit=player, sniper, scout, enemy)
  compare: boolean; // draw the prototype and the sortie's mech side by side
  on: Record<Act, boolean>; // 'jump' is on while a hop lasts
  hopT: number; // the time since the hop began (s)
  fireT: number; // the time left to the next acted shot (s)
  punchT: number | null; // the seconds since the acted blow began; null between blows
}

function paintButton(node: HTMLButtonElement, on: boolean) {
  node.setAttribute('aria-pressed', String(on));
  node.style.background = on ? BUTTON_ON_BACK : BUTTON_BACK;
  node.style.color = on ? BUTTON_ON_TEXT : BUTTON_TEXT;
}

function button(parent: HTMLElement, label: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  node.style.cssText = BUTTON;
  node.addEventListener('click', onClick);
  parent.appendChild(node);
  return node;
}

function stateOf(params: URLSearchParams): MechState {
  const asked = params.get('pattern');
  const pattern = asked !== null && (PATTERN_IDS as readonly string[]).includes(asked) ? (asked as PatternId) : 'a';
  const askedKit = params.get('kit');
  const kit =
    askedKit !== null && (PROTO_KIT_IDS as readonly string[]).includes(askedKit) ? (askedKit as ProtoKitId) : 'player';
  return {
    pattern,
    spin: params.get('spin') !== '0',
    view: params.get('view') === 'behind' ? 'behind' : 'spin',
    proto: params.has('proto') || params.has('compare') || params.has('kit'),
    kit,
    compare: params.has('compare'),
    on: { walk: false, boost: false, jump: false, fire: false },
    hopT: 0,
    fireT: 0,
    punchT: null,
  };
}

// The boxes the mech draws now, after the mirrors and with the weapons (one instance is one box).
function countBoxes(root: THREE.Object3D): number {
  let boxes = 0;
  root.traverse(object => {
    const mesh = object as THREE.InstancedMesh;
    if (mesh.isInstancedMesh === true) boxes += mesh.count;
  });
  return boxes;
}

export function showMech(_hash: string) {
  el('#sbApp').hidden = true;

  const { built } = buildMapScene(M1B_HAND);
  // the sortie's own look (M1), so a pale palette is judged against the sand it will stand on; full resolution, to
  // see the boxes' edges
  applyLookTo({ ...lookOf('m1'), pixel: 1 }, built.group);

  const x = (M1B_HAND.bounds.minX + M1B_HAND.bounds.maxX) / 2;
  const z = M1B_HAND.bounds.maxZ - MECH_MARGIN;
  const height = MECH_TUNE.height;
  const state = stateOf(new URLSearchParams(location.search));

  // How far apart the prototype and the sortie's mech stand in ?compare (m).
  const SLOT = height * 0.95;
  const currentX = (): number => (state.compare ? x + SLOT : x);
  const protoX = (): number => (state.compare ? x - SLOT : x);

  let mech = buildMechVisual(PATTERNS[state.pattern], height);
  mech.position.set(currentX(), 0, z);
  mech.visible = !state.proto || state.compare;
  scene.add(mech);

  // The prototype is drawn only by the confirmation view; the stage's light and shadow come with it.
  let protoMech: THREE.Group | null = null;
  let stage: ProtoStage | null = null;
  if (state.proto) {
    protoMech = buildProtoMech(height, state.kit);
    protoMech.position.set(protoX(), 0, z);
    scene.add(protoMech);
    stage = addProtoStage(protoMech, built.group, x, z);
    // ?shadow=0 and ?env=0 start with that light off, for a picture of what it adds
    if (stageFlag('shadow') === '0') stage.setShadow(false);
    if (stageFlag('env') === '0') stage.setEnv(false);
  }

  document.getElementById('sbMechBar')?.remove();
  document.getElementById('sbKitBar')?.remove();
  const bar = document.createElement('div');
  bar.id = 'sbMechBar';
  bar.style.cssText =
    'position:fixed;left:50%;top:0;transform:translateX(-50%);height:28px;z-index:8;' +
    'pointer-events:auto;display:flex;gap:4px';
  document.body.appendChild(bar);

  const patternButtons = new Map<PatternId, HTMLButtonElement>();
  for (const id of PATTERN_IDS)
    patternButtons.set(
      id,
      button(bar, `${id.toUpperCase()} ${PATTERN_LABELS[id]}`, () => setPattern(id)),
    );
  const spinButton = button(bar, '回転', () => {
    state.spin = !state.spin;
    paintButtons();
  });
  const viewButton = button(bar, '後ろから', () => {
    state.view = state.view === 'spin' ? 'behind' : 'spin';
    paintButtons();
  });

  const actButtons = new Map<Act, HTMLButtonElement>();
  for (const act of ACTS)
    actButtons.set(
      act,
      button(bar, ACT_LABELS[act], () => toggleAct(act)),
    );
  // A blow is one swing, not a switch: the prototype's free arm and torso move through it on the mech's own clock.
  button(bar, '殴る', () => startPunch());

  // The prototype's switches: its shadow and surroundings' light can be turned off to see what each adds, and it can
  // stand beside the sortie's mech (?compare).
  const shadowButton =
    stage === null
      ? null
      : button(bar, '影', () => {
          stage?.setShadow(!stage.shadowOn);
          paintButtons();
        });
  const envButton =
    stage === null
      ? null
      : button(bar, '環境の光', () => {
          stage?.setEnv(!stage.envOn);
          paintButtons();
        });
  const compareButton =
    protoMech === null
      ? null
      : button(bar, '並べる', () => {
          state.compare = !state.compare;
          layout();
          paintButtons();
          syncUrl();
        });

  // The kit's switches: a named set of parts and colours (?kit=player, ally, sniper, scout, enemy). The row sits under
  // the main bar, so the pattern buttons keep their place.
  const kitButtons = new Map<ProtoKitId, HTMLButtonElement>();
  if (protoMech !== null) {
    const kitBar = document.createElement('div');
    kitBar.id = 'sbKitBar';
    kitBar.style.cssText =
      'position:fixed;left:50%;top:30px;transform:translateX(-50%);height:28px;z-index:8;' +
      'pointer-events:auto;display:flex;gap:4px';
    document.body.appendChild(kitBar);
    for (const id of PROTO_KIT_IDS)
      kitButtons.set(
        id,
        button(kitBar, KIT_LABELS[id], () => setKit(id)),
      );
  }

  // The paint's numbers (#view-mech's panel): a change repaints the pictures and rebuilds the mech where it stands, so
  // the grime, the stencil and the stripes can be judged against the sand.
  createTunePanel({
    title: '機体の質感 #view-mech',
    groups: [
      {
        name: 'MECH_PAINT',
        table: MECH_PAINT,
        ranges: {
          'armor.grime': { min: 0, max: 80, step: 1 },
          'armor.scratches': { min: 0, max: 60, step: 1 },
          'armor.grain': { min: 0, max: 60, step: 1 },
          'frame.grime': { min: 0, max: 80, step: 1 },
          'frame.scratches': { min: 0, max: 60, step: 1 },
          'accent.grime': { min: 0, max: 40, step: 1 },
          'weapon.scratches': { min: 0, max: 60, step: 1 },
          'sensor.grime': { min: 0, max: 40, step: 1 },
        },
        labels: {
          'armor.grime': '装甲の汚れ',
          'armor.scratches': '装甲の傷',
          'armor.grain': '装甲の粒',
          'frame.grime': '骨格の汚れ',
          'frame.scratches': '骨格の傷',
          'accent.grime': '警告の汚れ',
          'weapon.scratches': '武器の傷',
          'sensor.grime': 'センサーの汚れ',
        },
      },
      {
        name: 'MECH_PAINT_TEX',
        table: MECH_PAINT_TEX,
        ranges: {
          stencilSize: { min: 8, max: 48, step: 1 },
          stripePitch: { min: 6, max: 40, step: 1 },
        },
        labels: { stencilSize: '番号の大きさ', stripePitch: '縞の間隔' },
      },
    ],
    onChange: () => rebuild(true),
  });

  // The prototype's numbers, apart from the sortie's mech's panel: the stance, the colours, the materials and the body's
  // proportions. A stance change is read every frame; the rest need the model (or its materials) remade, so they wait
  // for the slider to be let go. A colour row writes the whole 0xRRGGBB number the table holds. The colour table is the
  // selected kit's row, so another kit shows (and edits) its own palette.
  createProtoPanel();

  function createProtoPanel(): TunePanel | null {
    if (protoMech === null) return null;
    const palette = PROTO_PALETTES[PROTO_KITS[state.kit].palette];
    const panel = createTunePanel({
      id: 'sbProtoPanel',
      title: `試作の調整 #view-mech?kit=${state.kit}`,
      groups: [
        {
          name: 'PROTO_TUNE',
          table: PROTO_TUNE,
          ranges: {
            'pose.knee': { min: 0, max: 1.7, step: 0.01 },
            'pose.lean': { min: -0.6, max: 0, step: 0.01 },
            'pose.hip': { min: 0.32, max: 0.56, step: 0.005 },
            'pose.elbow': { min: 0, max: 1.2, step: 0.01 },
            'build.legLength': { min: 0.8, max: 1.25, step: 0.01 },
            'build.torsoWidth': { min: 0.8, max: 1.3, step: 0.01 },
            'build.limbGirth': { min: 0.8, max: 1.4, step: 0.01 },
            'light.env': { min: 0, max: 2.5, step: 0.05 },
          },
          labels: {
            'pose.knee': '膝の曲げ',
            'pose.lean': '前傾',
            'pose.hip': '腰の高さ',
            'pose.elbow': '肘の曲げ',
            'build.legLength': '脚の長さ',
            'build.torsoWidth': '胸と肩の幅',
            'build.limbGirth': '四肢の太さ',
            'light.env': '環境の光',
          },
        },
        {
          name: 'PROTO_MATERIALS',
          table: PROTO_MATERIALS,
          ranges: {
            'armor.metalness': { min: 0, max: 1, step: 0.01 },
            'armor.roughness': { min: 0, max: 1, step: 0.01 },
            'armor.envMapIntensity': { min: 0, max: 2.5, step: 0.05 },
            'frame.metalness': { min: 0, max: 1, step: 0.01 },
            'frame.roughness': { min: 0, max: 1, step: 0.01 },
            'frame.envMapIntensity': { min: 0, max: 2.5, step: 0.05 },
            'accent.metalness': { min: 0, max: 1, step: 0.01 },
            'accent.roughness': { min: 0, max: 1, step: 0.01 },
            'accent.envMapIntensity': { min: 0, max: 2.5, step: 0.05 },
            'glow.metalness': { min: 0, max: 1, step: 0.01 },
            'glow.roughness': { min: 0, max: 1, step: 0.01 },
            'glow.envMapIntensity': { min: 0, max: 2.5, step: 0.05 },
            'glow.emissive': { min: 0, max: 3, step: 0.05 },
          },
          labels: {
            'armor.metalness': '装甲の金属度',
            'armor.roughness': '装甲の粗さ',
            'armor.envMapIntensity': '装甲の環境の光',
            'frame.metalness': '骨格の金属度',
            'frame.roughness': '骨格の粗さ',
            'frame.envMapIntensity': '骨格の環境の光',
            'accent.metalness': '差し色の金属度',
            'accent.roughness': '差し色の粗さ',
            'accent.envMapIntensity': '差し色の環境の光',
            'glow.metalness': '発光の金属度',
            'glow.roughness': '発光の粗さ',
            'glow.envMapIntensity': '発光の環境の光',
            'glow.emissive': '発光の明るさ',
          },
        },
        {
          name: `PROTO_PALETTES.${PROTO_KITS[state.kit].palette}`,
          table: palette,
          ranges: {},
          colors: { armor: '装甲', frame: '関節', accent: '差し色', glow: '発光', mark: '味方の印' },
        },
      ],
      onCommit: (group, key) => {
        // the stance is read every frame; the rest remakes the model
        if (group === 'PROTO_TUNE' && key.startsWith('pose.')) return;
        rebuildProto();
      },
    });
    // the sortie's mech keeps the right side; the prototype's panel sits on the left
    panel.element.style.left = '8px';
    panel.element.style.right = 'auto';
    return panel;
  }

  function toggleAct(act: Act) {
    if (act === 'jump') {
      if (state.on.jump) return;
      state.on.jump = true;
      state.hopT = 0;
    } else {
      state.on[act] = !state.on[act];
    }
    paintButtons();
  }

  function startPunch() {
    state.punchT = 0;
  }

  function paintButtons() {
    for (const [id, node] of patternButtons) paintButton(node, id === state.pattern);
    for (const [act, node] of actButtons) paintButton(node, state.on[act]);
    for (const [id, node] of kitButtons) paintButton(node, id === state.kit);
    paintButton(spinButton, state.spin);
    paintButton(viewButton, state.view === 'behind');
    if (shadowButton !== null && stage !== null) paintButton(shadowButton, stage.shadowOn);
    if (envButton !== null && stage !== null) paintButton(envButton, stage.envOn);
    if (compareButton !== null) paintButton(compareButton, state.compare);
  }

  // Where the two mechs stand: in proto mode the sortie's mech hides unless ?compare shows them side by side.
  function layout() {
    mech.visible = !state.proto || state.compare;
    mech.position.x = currentX();
    if (protoMech !== null) protoMech.position.x = protoX();
  }

  function syncUrl() {
    const query = new URLSearchParams(location.search);
    if (state.compare) query.set('compare', '1');
    else query.delete('compare');
    history.replaceState(null, '', `${location.pathname}?${query.toString()}${location.hash}`);
  }

  // Remakes the prototype after a colour, material or proportion change: the pictures, the materials and the shapes
  // are made once when the mech is built, so the model and its light are rebuilt where it stands.
  function rebuildProto() {
    if (protoMech === null) return;
    const shadow = stage?.shadowOn ?? true;
    const env = stage?.envOn ?? true;
    const position = protoMech.position.clone();
    const yaw = protoMech.rotation.y;
    const visible = protoMech.visible;
    scene.remove(protoMech);
    disposeProtoMech(protoMech);
    stage?.dispose();
    stage = null;
    protoMech = buildProtoMech(height, state.kit);
    protoMech.position.copy(position);
    protoMech.rotation.y = yaw;
    protoMech.visible = visible;
    scene.add(protoMech);
    stage = addProtoStage(protoMech, built.group, x, z);
    stage.setShadow(shadow);
    stage.setEnv(env);
    layout();
    paintButtons();
  }

  // Rebuilds the mech where it stands: for another pattern, or for the panel's changed paint counts, which are painted
  // into new pictures (repaint).
  function rebuild(repaint: boolean) {
    if (repaint) resetMechPaint();
    const position = mech.position.clone();
    const yaw = mech.rotation.y;
    const visible = mech.visible;
    scene.remove(mech);
    disposeMech(mech);
    mech = buildMechVisual(PATTERNS[state.pattern], height);
    mech.position.copy(position);
    mech.rotation.y = yaw;
    mech.visible = visible;
    scene.add(mech);
  }

  function setPattern(next: PatternId) {
    if (next === state.pattern) {
      paintButtons();
      return;
    }
    state.pattern = next;
    rebuild(false);
    paintButtons();
    const query = new URLSearchParams(location.search);
    query.set('pattern', next);
    history.replaceState(null, '', `${location.pathname}?${query.toString()}${location.hash}`);
  }

  // Switches the prototype's kit: the model, the palette shown in the panel and ?kit all follow. The old panel is
  // replaced, so its colour rows point at the new kit's palette.
  function setKit(next: ProtoKitId) {
    if (next === state.kit) {
      paintButtons();
      return;
    }
    state.kit = next;
    rebuildProto();
    createProtoPanel();
    paintButtons();
    const query = new URLSearchParams(location.search);
    query.set('kit', next);
    history.replaceState(null, '', `${location.pathname}?${query.toString()}${location.hash}`);
  }

  window.sbMechReport = () => {
    const draws = countMechDraws(mech);
    const build = PATTERNS[state.pattern].build;
    const weight =
      CORES[build.core].weight +
      PARTS.arms[build.arms].weight +
      PARTS.legs[build.legs].weight +
      PARTS.back[build.back].weight +
      PARTS.fcs[build.fcs].weight;
    const proto = protoMech === null ? null : { ...countProtoDraws(protoMech), textureBytes: protoTextureBytes() };
    return JSON.stringify({
      pattern: state.proto ? 'proto' : state.pattern,
      mode: state.proto ? (state.compare ? 'compare' : 'proto') : 'pattern',
      kit: state.proto ? state.kit : null,
      spin: state.spin,
      view: state.view,
      acts: state.on,
      mech: { calls: draws.calls, triangles: draws.triangles, boxes: countBoxes(mech), weight },
      proto,
      light: stage === null ? null : { shadow: stage.shadowOn, env: stage.envOn },
      frame: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles },
    });
  };

  // Acts the motions out: the speeds are the pattern's own legs' (moveTuneOf), the hop is the jump's arc under gravity.
  const actMotion = (dt: number) => {
    const tune = moveTuneOf(PATTERNS[state.pattern].build, MOVE_TUNE);
    let landSpeed: number | null = null;
    if (state.on.jump) {
      state.hopT += dt;
      const height = tune.jump * state.hopT - (tune.gravity * state.hopT ** 2) / 2;
      if (height <= 0) {
        state.on.jump = false;
        landSpeed = tune.jump;
        paintButtons();
      }
      mech.position.y = Math.max(0, height);
      if (protoMech !== null) protoMech.position.y = Math.max(0, height);
    }
    let fired = false;
    state.fireT = Math.max(0, state.fireT - dt);
    if (state.on.fire && state.fireT === 0) {
      fired = true;
      state.fireT = FIRE_INTERVAL;
    }
    const speed = state.on.boost ? tune.boost : state.on.walk ? tune.walk : 0;
    if (state.punchT !== null) {
      state.punchT += dt;
      if (state.punchT >= meleeBlowSec()) state.punchT = null;
    }
    const input = { speed, grounded: !state.on.jump, boosting: state.on.boost, landSpeed, fired, meleeT: state.punchT };
    animateMech(mech, input, dt);
    if (protoMech !== null) animateProtoMech(protoMech, input, dt);
  };

  const update = (dt: number) => {
    actMotion(dt);
    if (state.view === 'behind') {
      mech.rotation.y = 0;
      if (protoMech !== null) protoMech.rotation.y = 0;
      applyPose(camera, cameraPose({ x, y: 0, z, yaw: 0 }, 0, CAMERA_TUNE, []), CAMERA_TUNE.fov);
    } else {
      if (state.spin) {
        mech.rotation.y += SPIN_RATE * dt;
        if (protoMech !== null) protoMech.rotation.y += SPIN_RATE * dt;
      }
      if (state.compare) {
        camera.position.set(x, height * 0.95, z + height * 3.4);
        camera.lookAt(x, height * 0.52, z);
      } else {
        camera.position.set(x + height, height * 0.9, z + height * 2.4);
        camera.lookAt(x, height * 0.5, z);
      }
    }
    cullChunks(built.chunks, built.group, camera, MAP_FOG.far);
  };
  addSystem({ name: 'sb-mech', update });
  update(0);

  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    const next = KEY_PATTERN[event.key];
    if (next !== undefined) setPattern(next);
    if (event.key === 'q') startPunch();
    const act = KEY_ACT[event.key];
    if (act !== undefined) toggleAct(act);
  });

  paintButtons();
}
