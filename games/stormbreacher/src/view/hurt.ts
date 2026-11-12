// The screen's signs of being under fire (SB-1380): a red glow on the edge a shot came from, a white flash when a blast
// goes off close by, and a dark, drained edge while the armour is low. The elements are made once when the sortie is
// built; a frame only writes their opacity and the armour's filter, so play makes no element. The values are in
// HURT_TUNE, and the drawing is only here: the game's events come in as they are.
import { clamp } from '@engine/core/index.ts';
import { HURT_TUNE, type HurtTune } from '../data/tune.ts';

const DEG = 180 / Math.PI;
const EDGE_COUNT = 8; // the directions the edge is split into: front, front-right, right, ... (45 degrees each)

// Where each direction's glow sits on the screen. The camera sits behind the mech, so the mech's front is the screen's
// far side: the front at the top, the right on the right, the back at the bottom and the left on the left.
const EDGE_ANCHORS = ['50% 0%', '100% 0%', '100% 50%', '100% 100%', '50% 100%', '0% 100%', '0% 50%', '0% 0%'] as const;

export interface HurtView {
  root: HTMLElement;
  edges: HTMLElement[]; // EDGE_COUNT glows, in EDGE_ANCHORS' order
  flash: HTMLElement;
  armor: HTMLElement;
  edgeLeft: number[]; // how long each direction's glow has left (s)
  flashLeft: number; // how long the white has left (s)
  flashTop: number; // the white's strength when it was set (0-1)
  width: number; // the edge width the glows were made for
  dark: number; // the armour's darkness last written (-1 before the first)
  drain: number; // the colour's drain last written (-1 before the first)
}

// The direction a shot came from, as degrees from the mech's front, + to the right. (fromX, fromZ) is the way from the
// mech toward the shooter; the front is (-sin yaw, -cos yaw) and the right is (cos yaw, -sin yaw), as in hud.ts.
export function hurtAngle(fromX: number, fromZ: number, yaw: number): number {
  const ahead = fromX * -Math.sin(yaw) + fromZ * -Math.cos(yaw);
  const side = fromX * Math.cos(yaw) - fromZ * Math.sin(yaw);
  const degrees = Math.atan2(side, ahead) * DEG;
  return (degrees + 360) % 360;
}

// The edge (0-7) an angle from hurtAngle lights. The boundary between two edges goes to the later one, so every angle
// has exactly one edge.
export function hurtEdge(angle: number): number {
  const wrapped = ((angle % 360) + 360) % 360;
  return Math.round(wrapped / (360 / EDGE_COUNT)) % EDGE_COUNT;
}

// How dark the edge is at `ratio` of the armour left: 0 at HURT_TUNE.armorDarkFrom and above, up to 1 at no armour.
export function armorLoss(ratio: number, tune: HurtTune): number {
  if (tune.armorDarkFrom <= 0) return ratio <= 0 ? 1 : 0;
  return clamp((tune.armorDarkFrom - ratio) / tune.armorDarkFrom, 0, 1);
}

// A colour as the CSS rgba() the gradients take.
function rgba(hex: number, alpha: number): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

// The glow of one edge: strongest at its side of the screen, gone at `edgeWidth` of the way in.
function edgeBackground(anchor: string, tune: HurtTune): string {
  const end = Math.round(clamp(tune.edgeWidth, 0.05, 1) * 100);
  return (
    `radial-gradient(circle farthest-side at ${anchor}, ` +
    `${rgba(tune.edgeColor, 1)} 0%, ${rgba(tune.edgeColor, 0.5)} ${Math.round(end * 0.4)}%, transparent ${end}%)`
  );
}

// The darkening of the armour: clear in the middle, darkest at the edge.
function armorBackground(tune: HurtTune): string {
  return `radial-gradient(ellipse farthest-corner at 50% 50%, transparent 40%, ${rgba(tune.armorColor, 1)} 100%)`;
}

let live: HurtView | null = null;

// The hurt view the sortie built, for the dev entry (#view-hurt); null before one.
export function currentHurtView(): HurtView | null {
  return live;
}

// Builds the overlay into `parent` (the page's body) and returns it. The root's id is #sbPlayHurt; it sits over the
// canvas but under the HUD and the cutscene's bars.
export function buildHurtView(parent: HTMLElement): HurtView {
  const root = document.createElement('div');
  root.id = 'sbPlayHurt';
  root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;overflow:hidden';

  const armor = document.createElement('div');
  armor.dataset.hurtArmor = '';
  armor.style.cssText = `position:absolute;inset:0;opacity:0;background:${armorBackground(HURT_TUNE)}`;
  root.appendChild(armor);

  const edges = EDGE_ANCHORS.map((anchor, index) => {
    const node = document.createElement('div');
    node.dataset.hurtEdge = String(index);
    node.style.cssText = `position:absolute;inset:0;opacity:0;background:${edgeBackground(anchor, HURT_TUNE)}`;
    root.appendChild(node);
    return node;
  });

  const flash = document.createElement('div');
  flash.dataset.hurtFlash = '';
  flash.style.cssText = `position:absolute;inset:0;opacity:0;background:${rgba(HURT_TUNE.flashColor, 1)}`;
  root.appendChild(flash);

  parent.appendChild(root);
  live = {
    root,
    edges,
    flash,
    armor,
    edgeLeft: Array.from({ length: EDGE_COUNT }, () => 0),
    flashLeft: 0,
    flashTop: 0,
    width: HURT_TUNE.edgeWidth,
    dark: -1,
    drain: -1,
  };
  return live;
}

// Lights the edge the shot came from. (fromX, fromZ) is the way from the mech toward the shooter, as the `damaged`
// event carries it; a second hit on the same direction starts its fade again.
export function hurtDamage(
  view: HurtView,
  fromX: number,
  fromZ: number,
  yaw: number,
  tune: HurtTune = HURT_TUNE,
): void {
  view.edgeLeft[hurtEdge(hurtAngle(fromX, fromZ, yaw))] = tune.edgeFade;
}

// Whitenesses the screen for a blast at (x, z): the closer it is, the stronger the white, and a blast past
// HURT_TUNE.flashNear makes none. The camera's shake is the blast table's (data/boom.ts), so it is not added again here.
export function hurtBlast(
  view: HurtView,
  x: number,
  z: number,
  mech: { x: number; z: number },
  tune: HurtTune = HURT_TUNE,
): void {
  const distance = Math.hypot(x - mech.x, z - mech.z);
  if (distance >= tune.flashNear) return;
  const strength = tune.flashAlpha * (1 - distance / tune.flashNear);
  // two blasts in one frame: the stronger white stays
  if (view.flashLeft > 0 && strength <= view.flashTop) return;
  view.flashTop = strength;
  view.flashLeft = tune.flashFade;
}

// Advances the glows, the white and the armour's darkening by one frame and writes them into the page. `armorRatio` is
// the armour left as a share of the full armour.
export function hurtStep(view: HurtView, dt: number, armorRatio: number, tune: HurtTune = HURT_TUNE): void {
  const span = Math.max(0, dt);

  // the dev panel writes edgeWidth into the table, so the gradients are made again only when it changes
  if (view.width !== tune.edgeWidth) {
    view.width = tune.edgeWidth;
    for (let i = 0; i < view.edges.length; i++) view.edges[i].style.background = edgeBackground(EDGE_ANCHORS[i], tune);
  }
  for (let i = 0; i < view.edges.length; i++) {
    view.edgeLeft[i] = Math.max(0, view.edgeLeft[i] - span);
    const lit = tune.edgeFade > 0 ? (view.edgeLeft[i] / tune.edgeFade) * tune.edgeAlpha : 0;
    view.edges[i].style.opacity = String(lit);
  }

  view.flashLeft = Math.max(0, view.flashLeft - span);
  const white = tune.flashFade > 0 ? (view.flashLeft / tune.flashFade) * view.flashTop : 0;
  view.flash.style.opacity = String(white);

  const loss = armorLoss(armorRatio, tune);
  const dark = loss * tune.armorDarkMax;
  if (dark !== view.dark) {
    view.dark = dark;
    view.armor.style.opacity = String(dark);
  }
  const drain = loss * tune.armorDrain;
  if (drain !== view.drain) {
    view.drain = drain;
    const filter = drain > 0 ? `saturate(${1 - drain})` : '';
    view.armor.style.setProperty('-webkit-backdrop-filter', filter);
    view.armor.style.setProperty('backdrop-filter', filter);
  }
}

// Takes the overlay out of the page (the sortie's end).
export function removeHurtView(view: HurtView): void {
  view.root.remove();
  if (live === view) live = null;
}
