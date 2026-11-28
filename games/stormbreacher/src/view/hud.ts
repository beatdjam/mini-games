// The HUD of the game's sortie (SB-160). The aim mark sits at the cursor (SB-2159): the main ammo on its left arc, the
// sub ammo on its right one, the armour as the bar above it and the boost as the bar below it. The objective is at the
// top left, the enemy's health at the top centre, the round radar at the top right, the front gauge down the right edge
// (SB-2270), the last radio line at the bottom centre and a lock frame round the target the aim is pulled toward. It
// reads HudModel (logic/hud.ts) and draws it; it never writes the model. Heat is not drawn; the only warning is the
// shell's. The shades and the emphasis are 仮.
import { isTouch, t } from '@engine/core/index.ts';
import { HUD_COLOR } from '../data/colors.ts';
import type { EnemyKind } from '../data/enemies.ts';
import { GAUGE_TUNE, HUD_RING_TUNE } from '../data/tune.ts';
import type { TargetKind } from '../data/types.ts';
import type { HudModel } from '../logic/hud.ts';
import type { GaugeFill, Isolation } from '../logic/frontGauge.ts';
import type { ScreenRect } from './camera.ts';
import { ndcToScreen } from './hudPlace.ts';
import { ammoBlink, ammoTier } from './hudRing.ts';
import {
  lockFrame,
  reticleMarks,
  ringRadius,
  roundRadar,
  type RadarFront,
  type RadarKey,
  type RadarMarkKind,
  type ReticleMarkSpec,
  type ReticleMarks,
} from './hudParts.ts';

// The fixed parts' placement and text sizes, copied from dev/hud/plans.ts (HUD_PLANS.d) and dev/hud/build.ts
// (TEXT_STYLES.d). view/ cannot read dev/, so the two copies are meant. The values are for 1280x720; `--ring` is the aim
// circle's radius (px), set on the root. 仮: the shades and these sizes are not settled yet.
const PLAY_HUD_PLACES = {
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
  // the front gauge (SB-2270): at the right edge, under the radar (24 + 150 + a little), the height from GAUGE_TUNE
  gauge: { css: 'right:24px;top:198px;width:12px' },
} as const;

// Which gauge goes where in the aim mark (SB-2159): the main ammo on the left arc, the sub ammo on the right one, the
// armour as the bar above and the boost as the bar below.
const HUD_RETICLE_MARK: ReticleMarkSpec = { left: 'main', right: 'sub', above: 'armor', below: ['boost'] };

const PLAY_HUD_TEXT = {
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

// The front gauge's marks (SB-2270): the front line is a thick bar reaching a little past the gauge's sides, the sector
// boundaries are thin short lines, and the mech is a small diamond. These sizes are 仮.
const GAUGE_EDGE = 4; // px, how far the front line and the boundaries reach past the gauge's sides
const GAUGE_FRONT = 3; // px, the front line's thickness
const GAUGE_BOUNDARY = 1; // px, a sector boundary's thickness
const GAUGE_MECH = 7; // px, the mech's diamond's side

// The fills and the mech's shades: the three fills read apart in brightness as well as hue (dark, amber, cyan), and the
// mech's mark turns amber at the warning gap and red when isolated, never blinking.
const GAUGE_FILL_COLOR: Record<GaugeFill, string> = {
  enemy: HUD_COLOR.gaugeEnemy,
  secured: HUD_COLOR.gaugeSecured,
  stable: HUD_COLOR.gaugeStable,
};

const GAUGE_MECH_COLOR: Record<Isolation, string> = {
  near: HUD_COLOR.text,
  warn: HUD_COLOR.amber,
  isolated: HUD_COLOR.warn,
};

interface RadarGauge {
  set(marks: readonly RadarKey[], front?: RadarFront | null): void;
}

// The front gauge's parts: the box, the sectors' fills, the boundaries between them, the front line and the mech's mark.
interface FrontGaugeView {
  box: HTMLElement;
  fills: HTMLElement;
  boundaries: HTMLElement;
  front: HTMLElement;
  mech: HTMLElement;
}

// The values written last, so a frame writes only what changed. null means "not written yet".
interface HudLast {
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
  gaugeShown: boolean | null; // whether the front gauge is up
  gaugeFills: string | null; // the sectors' fills and boundaries, as one key
  gaugeFront: number | null; // the front line's place on the gauge (0-1)
  gaugeMech: number | null; // the mech's place on the gauge (0-1)
  gaugeIsolation: Isolation | null; // the mech's mark's shade
}

export interface PlayHud {
  root: HTMLElement;
  height: number; // window.innerHeight the parts were laid out for (px)
  marks: ReticleMarks; // the aim mark at the cursor: the arcs and bars
  cursor: { x: number; y: number } | null; // the last point the mark was put for
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
  gauge: FrontGaugeView;
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

// Puts the aim mark at the cursor's normalized point (null at the centre).
export function placeReticle(hud: PlayHud, cursor: { x: number; y: number } | null): void {
  hud.cursor = cursor;
  positionMarks(hud);
}

function positionMarks(hud: PlayHud): void {
  hud.marks.setPosition(ndcToScreen(hud.cursor ?? { x: 0, y: 0 }, window.innerWidth, window.innerHeight));
}

function freshLast(): HudLast {
  return {
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
    gaugeShown: null,
    gaugeFills: null,
    gaugeFront: null,
    gaugeMech: null,
    gaugeIsolation: null,
  };
}

// The front gauge's height (px) for a window of this height: written for baseHeight, scaled the way the aim circle's
// radius follows the window (hudParts.ringRadius).
function gaugeHeight(height: number): number {
  return Math.round((GAUGE_TUNE.height * height) / GAUGE_TUNE.baseHeight);
}

// Lays the HUD's parts out for the window's size and returns what drawHud writes into. Called again when the window's
// height changes; the root stays and the cursor's point is put back after the rebuild.
function layOut(root: HTMLElement, cursor: { x: number; y: number } | null = null): PlayHud {
  root.replaceChildren();
  root.style.setProperty('--ring', `${ringRadius(window.innerHeight)}px`);
  const spec = PLAY_HUD_PLACES;

  const marks = reticleMarks(HUD_RING_TUNE.reticle, HUD_RETICLE_MARK);
  marks.main.dataset.hud = 'main';
  marks.sub.dataset.hud = 'sub';

  const objective = place(root, spec.objective.css, 'objective');
  const objectiveValue = span('', PLAY_HUD_TEXT.objective.value);
  objective.append(span(t('hud.objective'), PLAY_HUD_TEXT.objective.label, HUD_COLOR.amber), objectiveValue);
  objective.hidden = true;

  const optional = place(root, spec.optional.css, 'optional');
  const optionalValue = span('', PLAY_HUD_TEXT.optional.value);
  optional.append(span(t('hud.optional'), PLAY_HUD_TEXT.optional.label, HUD_COLOR.amber), optionalValue);
  optional.hidden = true;

  const radio = place(root, spec.radio.css, 'radio');
  radio.style.background = HUD_COLOR.panel;
  const radioValue = span('', PLAY_HUD_TEXT.radio.value);
  radio.append(span(t('hud.radio'), PLAY_HUD_TEXT.radio.label), radioValue);
  radio.hidden = true;

  const enemy = place(root, spec.enemy.css, 'enemy');
  const enemyName = span('', PLAY_HUD_TEXT.enemy.name);
  const enemyBar = healthBar();
  enemy.append(enemyName, enemyBar.box);
  enemy.hidden = true;

  // The short heading a milestone puts up for a moment (SB-2010), above the aim circle and below the enemy's health.
  const headline = place(root, spec.headline.css, 'headline');
  const headlineText = span('', PLAY_HUD_TEXT.headline.text, HUD_COLOR.amber);
  headline.appendChild(headlineText);
  headline.hidden = true;

  const warning = place(root, spec.warning.css, 'warning');
  const warningText = span('', PLAY_HUD_TEXT.warning.text, HUD_COLOR.warn);
  warning.appendChild(warningText);
  warning.hidden = true;

  const callout = place(root, spec.callout.css, 'callout');
  const calloutText = span('', PLAY_HUD_TEXT.callout.text, HUD_COLOR.amber);
  callout.appendChild(calloutText);
  callout.hidden = true;

  // One place below the aim circle: the use prompt with the hold's progress, or the planted charge's fuse. Both rows sit
  // in the same element and only one shows. On a keyboard the prompt says how to plant (SB-2017); on touch there is no F
  // key, so it keeps the button's name and the button itself lights up (app/play.ts).
  const use = place(root, spec.use.css, 'use');
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
  const melee = place(root, spec.melee.css, 'melee');
  melee.appendChild(span(t(isTouch ? 'btn.melee' : 'hud.melee'), PLAY_HUD_TEXT.melee.text, HUD_COLOR.amber));
  melee.hidden = true;

  const radarNode = place(root, spec.radar.css, 'radar');
  const radar = roundRadar(RADAR_SIZE, RADAR_SIZE);
  radarNode.appendChild(radar.root);

  // The front gauge (SB-2270): a vertical line at the right edge, the sea at its foot and the pillbox line at its head.
  // Its height follows the window's, as the aim circle's radius does; `layOut` runs again when the height changes.
  const gaugeBox = place(root, spec.gauge.css, 'gauge');
  gaugeBox.style.height = `${gaugeHeight(window.innerHeight)}px`;
  gaugeBox.style.background = HUD_COLOR.panel;
  gaugeBox.style.boxShadow = `0 0 0 1px ${HUD_COLOR.markShadow}`;
  gaugeBox.hidden = true;
  const gaugeFills = document.createElement('div');
  gaugeFills.style.cssText = 'position:absolute;inset:0;overflow:hidden';
  const gaugeBoundaries = document.createElement('div');
  gaugeBoundaries.style.cssText = 'position:absolute;inset:0';
  const gaugeFront = document.createElement('div');
  gaugeFront.style.cssText =
    `position:absolute;left:${-GAUGE_EDGE}px;right:${-GAUGE_EDGE}px;height:${GAUGE_FRONT}px;` +
    `background:${HUD_COLOR.bar};box-shadow:0 0 0 1px ${HUD_COLOR.markShadow};`;
  const gaugeMech = document.createElement('div');
  gaugeMech.style.cssText =
    `position:absolute;left:50%;width:${GAUGE_MECH}px;height:${GAUGE_MECH}px;margin-left:${-GAUGE_MECH / 2}px;` +
    `transform:rotate(45deg);background:${HUD_COLOR.text};box-shadow:0 0 0 1px ${HUD_COLOR.markShadow};`;
  gaugeBox.append(gaugeFills, gaugeBoundaries, gaugeFront, gaugeMech);

  const reticleBox = place(root, spec.reticle.css, 'reticle');
  reticleBox.appendChild(marks.root);

  const lock = lockFrame();
  root.appendChild(lock.root);

  return {
    root,
    height: window.innerHeight,
    marks,
    cursor,
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
    gauge: { box: gaugeBox, fills: gaugeFills, boundaries: gaugeBoundaries, front: gaugeFront, mech: gaugeMech },
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
  const hud = layOut(root);
  positionMarks(hud);
  return hud;
}

// " 1/2" for a counted objective, nothing for one that is not counted.
function countText(count: { done: number; total: number } | null): string {
  return count === null ? '' : ` ${count.done}/${count.total}`;
}

// Writes one frame of the HUD. Only the values that changed are written; the radar's marks and the lock frame are put
// down every frame. `lock` is the lock target's rectangle on the screen (view/camera.ts screenRect), null for none.
// `glow` is the aim mark's armour flash after a hit (0-1) and `time` the game's clock, which drives an empty gauge's
// blink.
export function drawHud(hud: PlayHud, model: HudModel, lock: ScreenRect | null, glow = 0, time = 0): void {
  // the aim mark sits on the window's size, so a new height lays the parts out again
  if (window.innerHeight !== hud.height) {
    Object.assign(hud, layOut(hud.root, hud.cursor));
  }
  positionMarks(hud);
  const last = hud.last;

  const reticle = HUD_RING_TUNE.reticle;
  hud.marks.set({
    armor: model.armor,
    boost: model.boost,
    main: model.main.ammo,
    mainMax: model.main.max,
    sub: model.sub.ammo,
    subMax: model.sub.max,
    mainTier: ammoTier(model.main.ammo, model.main.max, reticle.ammo.warnShare),
    subTier: ammoTier(model.sub.ammo, model.sub.max, reticle.ammo.warnShare),
    locked: lock !== null,
    glow,
    blink: ammoBlink(time, reticle.ammo.blinkHz, reticle.ammo.blinkMin),
  });

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

  drawFrontGauge(hud, model.gauge);

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

// Writes the front gauge (SB-2270). A null gauge (the plaza, where the sectors do not run) hides it. The sectors' fills
// and the boundaries are rebuilt only when a sector's state changes; the two marks move by their place on the gauge, and
// the mech's shade changes only when it crosses a gap.
function drawFrontGauge(hud: PlayHud, gauge: HudModel['gauge']): void {
  const last = hud.last;
  const shown = gauge !== null;
  if (last.gaugeShown !== shown) {
    hud.gauge.box.hidden = !shown;
    last.gaugeShown = shown;
  }
  if (gauge === null) return;

  const fillsKey = gauge.fills.map(fill => `${fill.from.toFixed(4)}:${fill.to.toFixed(4)}:${fill.fill}`).join('|');
  if (last.gaugeFills !== fillsKey) {
    last.gaugeFills = fillsKey;
    hud.gauge.fills.replaceChildren();
    for (const fill of gauge.fills) {
      const node = document.createElement('div');
      node.style.cssText =
        `position:absolute;left:0;right:0;bottom:${fill.from * 100}%;` +
        `height:${(fill.to - fill.from) * 100}%;background:${GAUGE_FILL_COLOR[fill.fill]};`;
      hud.gauge.fills.appendChild(node);
    }
    hud.gauge.boundaries.replaceChildren();
    for (const at of gauge.marks) {
      const node = document.createElement('div');
      node.style.cssText =
        `position:absolute;left:${-GAUGE_EDGE}px;right:${-GAUGE_EDGE}px;` +
        `bottom:calc(${at * 100}% - ${GAUGE_BOUNDARY / 2}px);height:${GAUGE_BOUNDARY}px;` +
        `background:${HUD_COLOR.text};opacity:.55;`;
      hud.gauge.boundaries.appendChild(node);
    }
  }

  if (last.gaugeFront !== gauge.front) {
    last.gaugeFront = gauge.front;
    hud.gauge.front.style.bottom = `calc(${gauge.front * 100}% - ${GAUGE_FRONT / 2}px)`;
  }
  if (last.gaugeMech !== gauge.mech) {
    last.gaugeMech = gauge.mech;
    hud.gauge.mech.style.bottom = `calc(${gauge.mech * 100}% - ${GAUGE_MECH / 2}px)`;
  }
  if (last.gaugeIsolation !== gauge.isolation) {
    last.gaugeIsolation = gauge.isolation;
    hud.gauge.mech.style.background = GAUGE_MECH_COLOR[gauge.isolation];
  }
}

// Takes the HUD out of the page.
export function removeHud(hud: PlayHud): void {
  hud.root.remove();
}
