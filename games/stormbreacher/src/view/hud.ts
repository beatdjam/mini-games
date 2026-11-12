// The HUD of the game's sortie (SB-160). D plan: the objective at the top left, the enemy's health at the top centre,
// the round radar at the top right, an arc along the aim circle (the armour on the left, the boost on the right), the
// main and sub ammo under the circle, the last radio line at the bottom centre and a lock frame round the target the
// aim is pulled toward. It reads HudModel (logic/hud.ts) and draws it; it never writes the model. Heat is not drawn;
// the only warning is the shell's. The shades and the emphasis are 仮.
import { t } from '@engine/core/index.ts';
import { HUD_COLOR } from '../data/colors.ts';
import type { EnemyKind } from '../data/enemies.ts';
import type { TargetKind } from '../data/types.ts';
import type { HudAmmo, HudModel } from '../logic/hud.ts';
import type { ScreenRect } from './camera.ts';
import {
  fillArcGauge,
  lockFrame,
  reticleSvg,
  ringRadius,
  roundRadar,
  type RadarKey,
  type RadarMarkKind,
} from './hudParts.ts';

// The D plan's placement and text sizes, copied from dev/hud/plans.ts (HUD_PLANS.d) and dev/hud/build.ts
// (TEXT_STYLES.d). view/ cannot read dev/, and the mock compares four plans while the game has settled on D, so the two
// copies are meant. The values are for 1280x720; `--ring` is the aim circle's radius (px), set on the root. 仮: the
// shades and these sizes are not settled yet.
const PLAY_HUD_LAYOUT = {
  armor: { css: '', side: 'left' },
  boost: { css: '', side: 'right' },
  main: { css: 'right:50%;margin-right:8px;top:calc(50% + var(--ring) + 36px);width:150px;text-align:right' },
  sub: { css: 'left:50%;margin-left:8px;top:calc(50% + var(--ring) + 36px);width:150px' },
  radar: { css: 'right:24px;top:48px;width:150px;height:150px' },
  objective: { css: 'left:24px;top:48px;width:340px' },
  radio: { css: 'left:50%;transform:translateX(-50%);bottom:48px;width:560px;padding:2px 6px' },
  enemy: { css: 'left:50%;transform:translateX(-50%);top:48px;width:300px' },
  warning: { css: 'left:50%;transform:translateX(-50%);top:calc(50% - var(--ring) - 40px);text-align:center' },
  reticle: { css: 'inset:0;pointer-events:none' },
} as const;

const PLAY_HUD_TEXT = {
  armor: { name: 10, value: 13, arc: 4 }, // px
  boost: { name: 10, value: 13, arc: 4 }, // px
  main: { name: 11, value: 16 }, // px
  sub: { name: 11, value: 13 }, // px
  objective: { label: 16, value: 16 }, // px
  radio: { label: 16, value: 16 }, // px
  enemy: { name: 14, bar: 10 }, // px
  warning: { text: 18 }, // px
} as const;

// The target and enemy kinds become the radar's mark kinds: the bunkers, the guns and the magazine are objectives (an
// amber diamond), the depot is an amber square, an enemy is a red dot.
const RADAR_MARK: Record<TargetKind | EnemyKind, RadarMarkKind> = {
  pillbox: 'objective',
  depot: 'depot',
  gun: 'objective',
  magazine: 'objective',
  grunt: 'enemy',
};

// The radar's size (px): the mock's D plan.
const RADAR_SIZE = 150; // px

interface ArcGauge {
  set(ratio: number, value: string): void;
}

interface RadarGauge {
  set(marks: readonly RadarKey[]): void;
}

// The values written last, so a frame writes only what changed. null means "not written yet".
interface HudLast {
  armor: number | null;
  boost: number | null;
  main: string | null;
  sub: string | null;
  objective: string | null;
  radio: string | null;
  enemy: TargetKind | EnemyKind | null;
  enemyRatio: number | null;
  enemyHidden: boolean | null;
  warning: HudModel['warning'] | undefined; // undefined means "not written yet" (null is a written "none")
}

export interface PlayHud {
  root: HTMLElement;
  height: number; // window.innerHeight the parts were laid out for (px)
  armor: ArcGauge;
  boost: ArcGauge;
  mainValue: HTMLSpanElement;
  subValue: HTMLSpanElement;
  objective: HTMLElement;
  objectiveValue: HTMLSpanElement;
  radio: HTMLElement;
  radioValue: HTMLSpanElement;
  lock: ReturnType<typeof lockFrame>;
  enemy: HTMLElement;
  enemyName: HTMLSpanElement;
  enemyFill: HTMLElement;
  warning: HTMLElement;
  warningText: HTMLSpanElement;
  radar: RadarGauge;
  last: HudLast;
}

function span(text: string, size: number, color: string = HUD_COLOR.text): HTMLSpanElement {
  const node = document.createElement('span');
  node.textContent = text;
  node.style.fontSize = `${size}px`;
  node.style.color = color;
  return node;
}

function place(parent: HTMLElement, css: string, id: string): HTMLElement {
  const node = document.createElement('div');
  node.dataset.hud = id;
  node.style.cssText = `position:absolute;box-sizing:border-box;${css}`;
  parent.appendChild(node);
  return node;
}

// The enemy's health: a panel whose fill is `ratio` (0-1) wide.
function healthBar(): { box: HTMLElement; fill: HTMLElement } {
  const box = document.createElement('div');
  box.style.cssText =
    `position:relative;background:${HUD_COLOR.panel};width:100%;` +
    `height:${PLAY_HUD_TEXT.enemy.bar}px;margin-top:2px;`;
  const fill = document.createElement('div');
  fill.style.cssText = `position:absolute;left:0;top:0;bottom:0;width:100%;background:${HUD_COLOR.bar};`;
  box.appendChild(fill);
  return { box, fill };
}

function freshLast(): HudLast {
  return {
    armor: null,
    boost: null,
    main: null,
    sub: null,
    objective: null,
    radio: null,
    enemy: null,
    enemyRatio: null,
    enemyHidden: null,
    warning: undefined,
  };
}

// Lays the HUD's parts out for the window's size and returns what drawHud writes into. Called again when the window's
// height changes; the root stays.
function layOut(root: HTMLElement): PlayHud {
  root.replaceChildren();
  root.style.setProperty('--ring', `${ringRadius(window.innerHeight)}px`);

  const armor = fillArcGauge(place(root, PLAY_HUD_LAYOUT.armor.css, 'armor'), {
    side: PLAY_HUD_LAYOUT.armor.side,
    ratio: 1,
    color: HUD_COLOR.bar,
    thickness: PLAY_HUD_TEXT.armor.arc,
    name: t('hud.armor'),
    nameSize: PLAY_HUD_TEXT.armor.name,
    value: '',
    valueSize: PLAY_HUD_TEXT.armor.value,
  });
  const boost = fillArcGauge(place(root, PLAY_HUD_LAYOUT.boost.css, 'boost'), {
    side: PLAY_HUD_LAYOUT.boost.side,
    ratio: 0,
    color: HUD_COLOR.bar,
    thickness: PLAY_HUD_TEXT.boost.arc,
    name: t('hud.boost'),
    nameSize: PLAY_HUD_TEXT.boost.name,
    value: '',
    valueSize: PLAY_HUD_TEXT.boost.value,
  });

  const main = place(root, PLAY_HUD_LAYOUT.main.css, 'main');
  main.appendChild(span(t('hud.main'), PLAY_HUD_TEXT.main.name));
  const mainValue = span('', PLAY_HUD_TEXT.main.value);
  main.appendChild(mainValue);

  const sub = place(root, PLAY_HUD_LAYOUT.sub.css, 'sub');
  sub.appendChild(span(t('hud.sub'), PLAY_HUD_TEXT.sub.name));
  const subValue = span('', PLAY_HUD_TEXT.sub.value);
  sub.appendChild(subValue);

  const objective = place(root, PLAY_HUD_LAYOUT.objective.css, 'objective');
  const objectiveValue = span('', PLAY_HUD_TEXT.objective.value);
  objective.append(span(t('hud.objective'), PLAY_HUD_TEXT.objective.label, HUD_COLOR.amber), objectiveValue);
  objective.hidden = true;

  const radio = place(root, PLAY_HUD_LAYOUT.radio.css, 'radio');
  radio.style.background = HUD_COLOR.panel;
  const radioValue = span('', PLAY_HUD_TEXT.radio.value);
  radio.append(span(t('hud.radio'), PLAY_HUD_TEXT.radio.label), radioValue);
  radio.hidden = true;

  const enemy = place(root, PLAY_HUD_LAYOUT.enemy.css, 'enemy');
  const enemyName = span('', PLAY_HUD_TEXT.enemy.name);
  const enemyBar = healthBar();
  enemy.append(enemyName, enemyBar.box);
  enemy.hidden = true;

  const warning = place(root, PLAY_HUD_LAYOUT.warning.css, 'warning');
  const warningText = span('', PLAY_HUD_TEXT.warning.text, HUD_COLOR.warn);
  warning.appendChild(warningText);
  warning.hidden = true;

  const radarNode = place(root, PLAY_HUD_LAYOUT.radar.css, 'radar');
  const radar = roundRadar(RADAR_SIZE, RADAR_SIZE);
  radarNode.appendChild(radar.root);

  place(root, PLAY_HUD_LAYOUT.reticle.css, 'reticle').appendChild(reticleSvg());

  const lock = lockFrame();
  root.appendChild(lock.root);

  return {
    root,
    height: window.innerHeight,
    armor,
    boost,
    mainValue,
    subValue,
    objective,
    objectiveValue,
    radio,
    radioValue,
    lock,
    enemy,
    enemyName,
    enemyFill: enemyBar.fill,
    warning,
    warningText,
    radar,
    last: freshLast(),
  };
}

// Builds the sortie's HUD into `parent` (the page's body) and returns it. The root's id is #sbPlayHud: the mock's #sbHud
// is a different element.
export function buildPlayHud(parent: HTMLElement): PlayHud {
  const root = document.createElement('div');
  root.id = 'sbPlayHud';
  root.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:5;line-height:1.2;box-sizing:border-box;' +
    'white-space:nowrap;text-shadow:0 1px 4px rgba(0,0,0,.8)';
  parent.appendChild(root);
  return layOut(root);
}

// The main and sub ammo: the shots left and the most a sortie loads.
function ammoText(ammo: HudAmmo): string {
  return ` ${ammo.ammo} / ${ammo.max}`;
}

// " 1/2" for a counted objective, nothing for one that is not counted.
function countText(count: { done: number; total: number } | null): string {
  return count === null ? '' : ` ${count.done}/${count.total}`;
}

// Writes one frame of the HUD. Only the values that changed are written; the radar's marks and the lock frame are put
// down every frame. `lock` is the lock target's rectangle on the screen (view/camera.ts screenRect), null for none.
export function drawHud(hud: PlayHud, model: HudModel, lock: ScreenRect | null): void {
  // the arcs and the aims sit on the window's size, so a new height lays the parts out again
  if (window.innerHeight !== hud.height) Object.assign(hud, layOut(hud.root));
  const last = hud.last;

  if (last.armor !== model.armor) {
    hud.armor.set(model.armor, '');
    last.armor = model.armor;
  }
  if (last.boost !== model.boost) {
    hud.boost.set(model.boost, `${Math.round(model.boost * 100)}%`);
    last.boost = model.boost;
  }

  const main = ammoText(model.main);
  if (last.main !== main) {
    hud.mainValue.textContent = main;
    last.main = main;
  }
  const sub = ammoText(model.sub);
  if (last.sub !== sub) {
    hud.subValue.textContent = sub;
    last.sub = sub;
  }

  const objective = model.objective === null ? '' : ` ${t(model.objective.key)}${countText(model.objective.count)}`;
  if (last.objective !== objective) {
    hud.objective.hidden = model.objective === null;
    hud.objectiveValue.textContent = objective;
    last.objective = objective;
  }

  const radio = model.radio === null ? '' : ` ${t(model.radio)}`;
  if (last.radio !== radio) {
    hud.radio.hidden = model.radio === null;
    hud.radioValue.textContent = radio;
    last.radio = radio;
  }

  if (!model.enemy) {
    if (last.enemyHidden !== true) {
      hud.enemy.hidden = true;
      last.enemyHidden = true;
    }
  } else {
    if (last.enemyHidden !== false) {
      hud.enemy.hidden = false;
      last.enemyHidden = false;
    }
    if (last.enemy !== model.enemy.kind) {
      hud.enemyName.textContent = t(`target.${model.enemy.kind}`);
      last.enemy = model.enemy.kind;
    }
    if (last.enemyRatio !== model.enemy.ratio) {
      hud.enemyFill.style.width = `${Math.max(0, Math.min(1, model.enemy.ratio)) * 100}%`;
      last.enemyRatio = model.enemy.ratio;
    }
  }

  if (last.warning !== model.warning) {
    hud.warning.hidden = model.warning === null;
    if (model.warning !== null) hud.warningText.textContent = t(`hud.warn.${model.warning}`);
    last.warning = model.warning;
  }

  hud.lock.set(lock);
  hud.radar.set(model.radar.map(mark => ({ kind: RADAR_MARK[mark.kind], angle: mark.angle, dist: mark.dist })));
}

// Takes the HUD out of the page.
export function removeHud(hud: PlayHud): void {
  hud.root.remove();
}
