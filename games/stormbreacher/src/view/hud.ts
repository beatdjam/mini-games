// The HUD of the game's sortie (SB-160). D plan: the objective at the top left, the enemy's health at the top centre,
// the round radar at the top right, an arc along the aim circle (the armour on the left, the boost on the right), the
// main and sub ammo under the circle, the last radio line at the bottom centre and a lock frame round the target the
// aim is pulled toward. It reads HudModel (logic/hud.ts) and draws it; it never writes the model. Heat is not drawn;
// the only warning is the shell's. The shades and the emphasis are 仮.
import { isTouch, t } from '@engine/core/index.ts';
import { HUD_COLOR } from '../data/colors.ts';
import type { EnemyKind } from '../data/enemies.ts';
import type { TargetKind } from '../data/types.ts';
import type { HudAmmo, HudModel } from '../logic/hud.ts';
import type { ScreenRect } from './camera.ts';
import {
  fillArcGauge,
  lockFrame,
  reticleAt,
  reticleSvg,
  ringRadius,
  roundRadar,
  type RadarFront,
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
  optional: { css: 'left:24px;top:calc(48px + 96px);width:340px' },
  radio: { css: 'left:50%;transform:translateX(-50%);bottom:48px;width:560px;padding:2px 6px' },
  enemy: { css: 'left:50%;transform:translateX(-50%);top:48px;width:300px' },
  headline: { css: 'left:50%;transform:translateX(-50%);top:24%;width:720px;text-align:center' },
  warning: { css: 'left:50%;transform:translateX(-50%);top:calc(50% - var(--ring) - 40px);text-align:center' },
  // the short order near the aim (SB-2028): above the shell warning (-40px) and the use prompt's spot, so none overlap
  callout: {
    css: 'left:50%;transform:translateX(-50%);top:calc(50% - var(--ring) - 120px);width:520px;text-align:center',
  },
  use: {
    css: 'left:50%;transform:translateX(-50%);top:calc(50% + var(--ring) + 72px);width:280px;text-align:center',
  },
  melee: {
    css: 'left:50%;transform:translateX(-50%);top:calc(50% + var(--ring) + 8px);text-align:center',
  },
  reticle: { css: 'inset:0;pointer-events:none' },
} as const;

const PLAY_HUD_TEXT = {
  armor: { name: 10, value: 13, arc: 4 }, // px
  boost: { name: 10, value: 13, arc: 4 }, // px
  main: { name: 11, value: 16 }, // px
  sub: { name: 11, value: 13 }, // px
  objective: { label: 16, value: 16 }, // px
  optional: { label: 13, value: 13 }, // px
  radio: { label: 16, value: 16 }, // px
  enemy: { name: 14, bar: 10 }, // px
  headline: { text: 34 }, // px
  warning: { text: 18 }, // px
  callout: { text: 26 }, // px
  use: { text: 13, bar: 6 }, // px; the charge's fuse uses the same sizes
  melee: { text: 13 }, // px
} as const;

// The target and enemy kinds become the radar's mark kinds: the bunkers, the guns and the magazine are objectives (an
// amber diamond), the depot is an amber square, an enemy is a red dot.
const RADAR_MARK: Record<TargetKind | EnemyKind, RadarMarkKind> = {
  pillbox: 'objective',
  depot: 'depot',
  gun: 'objective',
  magazine: 'objective',
  fortressGun: 'objective',
  grunt: 'enemy',
  assault: 'enemy',
  heavy: 'enemy',
  emplacement: 'enemy',
  warden: 'enemy',
};

// The radar's size (px): the mock's D plan.
const RADAR_SIZE = 150; // px

interface ArcGauge {
  set(ratio: number, value: string): void;
}

interface RadarGauge {
  set(marks: readonly RadarKey[], front?: RadarFront | null): void;
}

// The reticle's dot and ring, and the place the dot was last put (so a rebuilt HUD can put it back).
interface Reticle {
  dot: SVGCircleElement;
  ring: SVGCircleElement;
  at: ReturnType<typeof reticleAt>;
}

// The values written last, so a frame writes only what changed. null means "not written yet".
interface HudLast {
  armor: number | null;
  boost: number | null;
  main: string | null;
  sub: string | null;
  objective: string | null;
  optional: string | null;
  radio: string | null;
  enemy: TargetKind | EnemyKind | null;
  enemyRatio: number | null;
  enemyHidden: boolean | null;
  headline: string | null;
  callout: string | null;
  warning: HudModel['warning'] | undefined; // undefined means "not written yet" (null is a written "none")
  use: number | null; // the hold's progress (0-1), or null when the prompt is not up
  charge: string | null; // the fuse's text, or null when no charge is shown
  melee: boolean | null; // whether the "melee (Q)" hint shows
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
  optional: HTMLElement;
  optionalValue: HTMLSpanElement;
  radio: HTMLElement;
  radioValue: HTMLSpanElement;
  lock: ReturnType<typeof lockFrame>;
  enemy: HTMLElement;
  enemyName: HTMLSpanElement;
  enemyFill: HTMLElement;
  headline: HTMLElement;
  headlineText: HTMLSpanElement;
  warning: HTMLElement;
  warningText: HTMLSpanElement;
  callout: HTMLElement;
  calloutText: HTMLSpanElement;
  use: HTMLElement;
  useRow: HTMLElement;
  useText: HTMLSpanElement;
  useFill: HTMLElement;
  chargeRow: HTMLElement;
  chargeText: HTMLSpanElement;
  chargeFill: HTMLElement;
  melee: HTMLElement;
  radar: RadarGauge;
  reticle: Reticle;
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

// The bar under the use prompt and the charge's fuse: a thin fill on the panel.
function useBar(color: string): { box: HTMLElement; fill: HTMLElement } {
  const box = document.createElement('div');
  box.style.cssText = `position:relative;background:${HUD_COLOR.panel};width:100%;height:${PLAY_HUD_TEXT.use.bar}px;`;
  const fill = document.createElement('div');
  fill.style.cssText = `position:absolute;left:0;top:0;bottom:0;width:0%;background:${color};`;
  box.appendChild(fill);
  return { box, fill };
}

// The reticle with its parts pulled out, and its dot put at `at`. On a touch screen the aim circle shows; on a PC the
// dot alone marks the cursor, so the cone's ring is hidden.
function makeReticle(at: ReturnType<typeof reticleAt>): { root: SVGSVGElement; reticle: Reticle } {
  const root = reticleSvg();
  const reticle: Reticle = {
    dot: root.querySelector('.sb-ret-dot') as SVGCircleElement,
    ring: root.querySelector('.sb-ret-ring') as SVGCircleElement,
    at,
  };
  placeReticleDot(reticle);
  return { root, reticle };
}

function placeReticleDot(reticle: Reticle): void {
  reticle.dot.setAttribute('cx', reticle.at.left);
  reticle.dot.setAttribute('cy', reticle.at.top);
  reticle.ring.style.display = isTouch ? '' : 'none';
}

// Puts the reticle's dot at the cursor's normalized point (null at the centre) and remembers it for the next lay-out.
export function placeReticle(hud: PlayHud, cursor: { x: number; y: number } | null): void {
  hud.reticle.at = reticleAt(cursor);
  placeReticleDot(hud.reticle);
}

function freshLast(): HudLast {
  return {
    armor: null,
    boost: null,
    main: null,
    sub: null,
    objective: null,
    optional: null,
    radio: null,
    enemy: null,
    enemyRatio: null,
    enemyHidden: null,
    headline: null,
    callout: null,
    warning: undefined,
    use: null,
    charge: null,
    melee: null,
  };
}

// Lays the HUD's parts out for the window's size and returns what drawHud writes into. Called again when the window's
// height changes; the root stays. `reticleAt` is the dot's last place, put back after the rebuild.
function layOut(root: HTMLElement, reticlePosition = reticleAt(null)): PlayHud {
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

  const optional = place(root, PLAY_HUD_LAYOUT.optional.css, 'optional');
  const optionalValue = span('', PLAY_HUD_TEXT.optional.value);
  optional.append(span(t('hud.optional'), PLAY_HUD_TEXT.optional.label, HUD_COLOR.amber), optionalValue);
  optional.hidden = true;

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

  // The short heading a milestone puts up for a moment (SB-2010), above the aim circle and below the enemy's health.
  const headline = place(root, PLAY_HUD_LAYOUT.headline.css, 'headline');
  const headlineText = span('', PLAY_HUD_TEXT.headline.text, HUD_COLOR.amber);
  headline.appendChild(headlineText);
  headline.hidden = true;

  const warning = place(root, PLAY_HUD_LAYOUT.warning.css, 'warning');
  const warningText = span('', PLAY_HUD_TEXT.warning.text, HUD_COLOR.warn);
  warning.appendChild(warningText);
  warning.hidden = true;

  const callout = place(root, PLAY_HUD_LAYOUT.callout.css, 'callout');
  const calloutText = span('', PLAY_HUD_TEXT.callout.text, HUD_COLOR.amber);
  callout.appendChild(calloutText);
  callout.hidden = true;

  // One place below the aim circle: the use prompt with the hold's progress, or the planted charge's fuse. Both rows sit
  // in the same element and only one shows. On a keyboard the prompt says how to plant (SB-2017); on touch there is no F
  // key, so it keeps the button's name and the button itself lights up (app/play.ts).
  const use = place(root, PLAY_HUD_LAYOUT.use.css, 'use');
  const useRow = document.createElement('div');
  const useText = span(t(isTouch ? 'hud.use' : 'hud.plant'), PLAY_HUD_TEXT.use.text, HUD_COLOR.amber);
  const useMeter = useBar(HUD_COLOR.bar);
  useRow.append(useText, useMeter.box);
  const chargeRow = document.createElement('div');
  chargeRow.hidden = true;
  const chargeText = span('', PLAY_HUD_TEXT.use.text, HUD_COLOR.warn);
  const chargeMeter = useBar(HUD_COLOR.warn);
  chargeRow.append(chargeText, chargeMeter.box);
  use.append(useRow, chargeRow);
  use.hidden = true;

  // Under the aim circle: the fist's hint when neither gun has a shot left.
  const melee = place(root, PLAY_HUD_LAYOUT.melee.css, 'melee');
  melee.appendChild(span(t(isTouch ? 'btn.melee' : 'hud.melee'), PLAY_HUD_TEXT.melee.text, HUD_COLOR.amber));
  melee.hidden = true;

  const radarNode = place(root, PLAY_HUD_LAYOUT.radar.css, 'radar');
  const radar = roundRadar(RADAR_SIZE, RADAR_SIZE);
  radarNode.appendChild(radar.root);

  const aim = makeReticle(reticlePosition);
  place(root, PLAY_HUD_LAYOUT.reticle.css, 'reticle').appendChild(aim.root);

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
    optional,
    optionalValue,
    radio,
    radioValue,
    lock,
    enemy,
    enemyName,
    enemyFill: enemyBar.fill,
    headline,
    headlineText,
    warning,
    warningText,
    callout,
    calloutText,
    use,
    useRow,
    useText,
    useFill: useMeter.fill,
    chargeRow,
    chargeText,
    chargeFill: chargeMeter.fill,
    melee,
    radar,
    reticle: aim.reticle,
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
  if (window.innerHeight !== hud.height) {
    const at = hud.reticle.at;
    Object.assign(hud, layOut(hud.root, at));
  }
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

  const optional = model.optional === null ? '' : ` ${t(model.optional.key)} ${Math.round(model.optional.distance)}m`;
  if (last.optional !== optional) {
    hud.optional.hidden = model.optional === null;
    hud.optionalValue.textContent = optional;
    last.optional = optional;
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

  const headline = model.headline === null ? '' : t(model.headline);
  if (last.headline !== headline) {
    hud.headline.hidden = model.headline === null;
    hud.headlineText.textContent = headline;
    last.headline = headline;
  }

  if (last.callout !== model.callout) {
    hud.callout.hidden = model.callout === null;
    if (model.callout !== null) hud.calloutText.textContent = t(model.callout);
    last.callout = model.callout;
  }

  if (last.warning !== model.warning) {
    hud.warning.hidden = model.warning === null;
    if (model.warning !== null) hud.warningText.textContent = t(`hud.warn.${model.warning}`);
    last.warning = model.warning;
  }

  const useProgress = model.use === null ? null : Math.max(0, Math.min(1, model.use.progress));
  if (last.use !== useProgress) {
    if (useProgress !== null) hud.useFill.style.width = `${useProgress * 100}%`;
    last.use = useProgress;
  }
  const charge = model.charge;
  const chargeText = charge === null ? null : `${t('hud.charge')} ${String(Math.max(0, charge.left).toFixed(1))}`;
  if (last.charge !== chargeText) {
    if (charge !== null && chargeText !== null) {
      hud.chargeText.textContent = chargeText;
      hud.chargeFill.style.width = `${Math.max(0, Math.min(1, charge.total > 0 ? charge.left / charge.total : 0)) * 100}%`;
    }
    last.charge = chargeText;
  }
  // one row at a time: a burning charge takes the place over the use prompt
  const showCharge = chargeText !== null;
  const showUse = !showCharge && useProgress !== null;
  if (hud.useRow.hidden === showUse) hud.useRow.hidden = !showUse;
  if (hud.chargeRow.hidden === showCharge) hud.chargeRow.hidden = !showCharge;
  const useVisible = showUse || showCharge;
  if (hud.use.hidden === useVisible) hud.use.hidden = !useVisible;

  if (last.melee !== model.melee) {
    hud.melee.hidden = !model.melee;
    last.melee = model.melee;
  }

  hud.lock.set(lock);
  hud.radar.set(
    model.radar.map(mark => ({
      kind: mark.kind === 'blast' ? 'blast' : RADAR_MARK[mark.kind],
      angle: mark.angle,
      dist: mark.dist,
    })),
    model.front,
  );
}

// Takes the HUD out of the page.
export function removeHud(hud: PlayHud): void {
  hud.root.remove();
}
