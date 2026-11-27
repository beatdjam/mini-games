// The pieces the HUD shares between the mock (#view-hud) and the game's sortie: the aim circle's radius, an arc along
// it, the round radar, the radar's marks, and the dot and circle. DOM only; no three, so a test can build them without
// a renderer.
import { HUD_COLOR } from '../data/colors.ts';
import { CAMERA_TUNE, FCS_TUNE, type HudRingTune } from '../data/tune.ts';
import type { ScreenPoint } from './hudPlace.ts';
import { keepInside } from './hudPlace.ts';
import { ammoLine, armorColor, armorStage, boostOpacity, gaugeSweep, reticleColor, type AmmoTier } from './hudRing.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DOT_RADIUS = 2.5; // px
const RADAR_PAD = 8; // px kept inside the round radar's edge
const ARC_GAP = 14; // px, from the aim circle to the arc; the arc's radius is ringRadius + ARC_GAP
const ARC_HALF = 50; // degrees, half the arc's opening: 50 above and below the horizontal, 100 in all
const ARC_TEXT_W = 44; // px, the text column outside the arc
const ARC_TEXT_GAP = 6; // px, between the arc and the text column
export const BAR_GAUGE_HEIGHT = 24; // px, a short bar's name/value line plus the bar (SB-2150)

// The aim circle's radius (px) for a screen of this height: the soft-lock cone's half-angle at the camera's field of
// view. 720 gives about 70.
export function ringRadius(height: number): number {
  const cone = (FCS_TUNE.soft.cone * Math.PI) / 180;
  const halfFov = (CAMERA_TUNE.fov * Math.PI) / 360;
  return Math.tan(cone) * (height / 2 / Math.tan(halfFov));
}

export function svg(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
}

// One arc of a circle centred at (cx, cy) in the SVG's own coordinates, from `startDeg` through `sweepDeg` (positive is
// clockwise on screen, the way a growing angle turns when y points down).
export function arcPath(cx: number, cy: number, radius: number, startDeg: number, sweepDeg: number): string {
  const point = (deg: number): [number, number] => {
    const angle = (deg * Math.PI) / 180;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  };
  const [x1, y1] = point(startDeg);
  const [x2, y2] = point(startDeg + sweepDeg);
  const large = Math.abs(sweepDeg) > 180 ? 1 : 0;
  const sweep = sweepDeg >= 0 ? 1 : 0;
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} ${sweep} ${x2} ${y2}`;
}

export type RadarMarkKind = 'objective' | 'depot' | 'enemy' | 'blast';

export interface RadarKey {
  kind: RadarMarkKind;
  angle: number; // degrees from the mech's front, + to the right
  dist: number; // 0 at the centre, 1 at the edge
}

// A front line's two ends on the radar, in the same angle and distance as a mark. A point may lie outside the dial; the
// line is clipped to the circle.
export interface RadarFront {
  a: { angle: number; dist: number };
  b: { angle: number; dist: number };
}

const FRONT_DASH = '5 4'; // px; the front line is dashed so it reads apart from the marks
const FRONT_WIDTH = 1.5; // px
let radarCount = 0; // one clip path an instance, so two radars in a page do not share one

export function markShape(kind: RadarMarkKind, x: number, y: number): SVGElement {
  if (kind === 'enemy') return svg('circle', { cx: x, cy: y, r: 3, fill: HUD_COLOR.warn });
  if (kind === 'depot') return svg('rect', { x: x - 3, y: y - 3, width: 6, height: 6, fill: HUD_COLOR.amber });
  // a blast point is a small hollow diamond (SB-2017): on the objective's colour, but open, so it reads apart from the
  // solid diamond of the target it breaks
  if (kind === 'blast') {
    return svg('polygon', {
      points: `${x},${y - 3.5} ${x + 3.5},${y} ${x},${y + 3.5} ${x - 3.5},${y}`,
      fill: 'none',
      stroke: HUD_COLOR.amber,
      'stroke-width': 1.2,
    });
  }
  const points = `${x},${y - 5} ${x + 5},${y} ${x},${y + 5} ${x - 5},${y}`;
  return svg('polygon', { points, fill: HUD_COLOR.amber });
}

// A round radar with the mech at its centre and the mech's front up. The outer circle and the centre dot are drawn once;
// `set` puts the front line and the marks down again. The front line is the edge of the ground the allies hold (SB-2010).
export function roundRadar(
  width: number,
  height: number,
): { root: SVGSVGElement; set(marks: readonly RadarKey[], front?: RadarFront | null): void } {
  const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height: '100%' }) as SVGSVGElement;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - RADAR_PAD;
  const clipId = `sb-radar-clip-${radarCount++}`;
  const defs = svg('defs', {});
  const clip = svg('clipPath', { id: clipId });
  clip.appendChild(svg('circle', { cx, cy, r: radius }));
  defs.appendChild(clip);
  root.appendChild(defs);
  root.appendChild(
    svg('circle', { cx, cy, r: radius, fill: HUD_COLOR.panel, stroke: HUD_COLOR.text, 'stroke-opacity': 0.35 }),
  );
  root.appendChild(svg('circle', { cx, cy, r: 2.5, fill: HUD_COLOR.bar }));
  const frontLine = svg('g', { 'clip-path': `url(#${clipId})` }) as SVGGElement;
  root.appendChild(frontLine);
  const marks = svg('g', {}) as SVGGElement;
  root.appendChild(marks);
  const at = (point: { angle: number; dist: number }): { x: number; y: number } => {
    const angle = (point.angle * Math.PI) / 180;
    return {
      x: cx + Math.sin(angle) * point.dist * radius,
      y: cy - Math.cos(angle) * point.dist * radius,
    };
  };
  return {
    root,
    set(list, front = null) {
      marks.replaceChildren();
      for (const mark of list) {
        const place = at(mark);
        marks.appendChild(markShape(mark.kind, place.x, place.y));
      }
      frontLine.replaceChildren();
      if (front === null) return;
      const a = at(front.a);
      const b = at(front.b);
      frontLine.appendChild(
        svg('line', {
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          stroke: HUD_COLOR.bar,
          'stroke-width': FRONT_WIDTH,
          'stroke-opacity': 0.85,
          'stroke-dasharray': FRONT_DASH,
        }),
      );
    },
  };
}

// An arc along the aim circle with the name and the number outside it. The caller makes `node` (already placed); this
// puts its position and size down and fills it. `set` rewrites only the arc and the number.
export interface ArcGaugeOptions {
  side: 'left' | 'right';
  ratio: number; // 0-1
  color: string;
  thickness: number; // px, the arc's line
  name: string;
  nameSize: number; // px
  value: string;
  valueSize: number; // px
}

export function fillArcGauge(node: HTMLElement, options: ArcGaugeOptions): { set(ratio: number, value: string): void } {
  const { side, color, thickness, name, nameSize, valueSize } = options;
  const radius = ringRadius(window.innerHeight) + ARC_GAP;
  const width = thickness;
  const half = (ARC_HALF * Math.PI) / 180;
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const arcW = radius * (1 - Math.cos(half)) + width;
  const arcH = 2 * radius * Math.sin(half) + width;
  const boxW = arcW + ARC_TEXT_GAP + ARC_TEXT_W;
  const left =
    side === 'left' ? cx - radius - width / 2 - ARC_TEXT_GAP - ARC_TEXT_W : cx + radius * Math.cos(half) - width / 2;
  const top = cy - arcH / 2;
  node.style.left = `${left}px`;
  node.style.top = `${top}px`;
  node.style.width = `${boxW}px`;
  node.style.height = `${arcH}px`;

  // the box's top left from the circle's centre, then the arc runs from its lower end towards the upper one
  const root = svg('svg', { width: '100%', height: '100%' }) as SVGSVGElement;
  root.style.display = 'block';
  const mid = side === 'left' ? 180 : 0;
  const dir = side === 'left' ? 1 : -1;
  const from = mid - dir * ARC_HALF;
  const sweep = dir * ARC_HALF * 2;
  const stroke = (d: string, strokeColor: string) =>
    svg('path', { d, fill: 'none', stroke: strokeColor, 'stroke-width': width, 'stroke-linecap': 'butt' });
  const ox = cx - left;
  const oy = cy - top;
  root.appendChild(stroke(arcPath(ox, oy, radius, from, sweep), HUD_COLOR.track));
  const fill = stroke(arcPath(ox, oy, radius, from, sweep * Math.max(0, Math.min(1, options.ratio))), color);
  fill.style.display = options.ratio > 0 ? '' : 'none';
  root.appendChild(fill);
  node.appendChild(root);

  const column = document.createElement('div');
  column.style.cssText =
    `position:absolute;top:50%;transform:translateY(-50%);width:${ARC_TEXT_W}px;` +
    (side === 'left' ? 'left:0;text-align:right' : 'right:0;text-align:left');
  const nameNode = document.createElement('span');
  nameNode.textContent = name;
  nameNode.style.fontSize = `${nameSize}px`;
  nameNode.style.color = HUD_COLOR.text;
  const valueNode = document.createElement('span');
  valueNode.textContent = options.value;
  valueNode.style.fontSize = `${valueSize}px`;
  valueNode.style.color = HUD_COLOR.text;
  nameNode.style.display = 'block';
  valueNode.style.display = 'block';
  column.append(nameNode, valueNode);
  node.appendChild(column);

  return {
    set(ratio, value) {
      if (ratio > 0) {
        fill.setAttribute('d', arcPath(ox, oy, radius, from, sweep * Math.min(1, ratio)));
        fill.style.display = '';
      } else {
        fill.style.display = 'none';
      }
      valueNode.textContent = value;
    },
  };
}

// A short bar with the name and the number over it (SB-2150): the gauges of layouts B and C, where the arc along the aim
// circle would sit nowhere near the eye. The caller makes `node` (already placed); this puts its width down and fills it.
export interface BarGaugeOptions {
  width: number; // px
  thickness: number; // px
  ratio: number; // 0-1
  color: string;
  name: string;
  nameSize: number; // px
  value: string;
  valueSize: number; // px
}

export function fillBarGauge(node: HTMLElement, options: BarGaugeOptions): { set(ratio: number, value: string): void } {
  const { width, thickness, color, name, nameSize, valueSize } = options;
  node.style.width = `${width}px`;
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;justify-content:space-between;gap:6px;align-items:baseline';
  const nameNode = document.createElement('span');
  nameNode.textContent = name;
  nameNode.style.fontSize = `${nameSize}px`;
  nameNode.style.color = HUD_COLOR.text;
  const valueNode = document.createElement('span');
  valueNode.textContent = options.value;
  valueNode.style.fontSize = `${valueSize}px`;
  valueNode.style.color = HUD_COLOR.text;
  head.append(nameNode, valueNode);

  const track = document.createElement('div');
  track.style.cssText =
    `position:relative;width:100%;height:${thickness}px;margin-top:2px;` + `background:${HUD_COLOR.track}`;
  const fill = document.createElement('div');
  fill.style.cssText = `position:absolute;left:0;top:0;bottom:0;width:0%;background:${color}`;
  track.appendChild(fill);
  node.append(head, track);

  const draw = (ratio: number, value: string) => {
    const shown = Math.max(0, Math.min(1, ratio));
    fill.style.width = `${shown * 100}%`;
    fill.style.display = shown > 0 ? '' : 'none';
    valueNode.textContent = value;
  };
  draw(options.ratio, options.value);
  return { set: draw };
}

// The dot at the screen's centre and the aim circle around it. The classes let the game move the dot and hide the ring.
export function reticleSvg(): SVGSVGElement {
  const root = svg('svg', { width: '100%', height: '100%' }) as SVGSVGElement;
  root.appendChild(svg('circle', { class: 'sb-ret-dot', cx: '50%', cy: '50%', r: DOT_RADIUS, fill: HUD_COLOR.dot }));
  root.appendChild(
    svg('circle', {
      class: 'sb-ret-ring',
      cx: '50%',
      cy: '50%',
      r: ringRadius(window.innerHeight),
      fill: 'none',
      stroke: HUD_COLOR.ring,
      'stroke-width': 1,
    }),
  );
  return root;
}

// The reticle's dot as percentages of its box, from the cursor's normalized point (-1 to 1, + up): the box's centre is
// 0. null puts the dot at the centre.
export function reticleAt(cursor: { x: number; y: number } | null): { left: string; top: string } {
  const x = cursor?.x ?? 0;
  const y = cursor?.y ?? 0;
  return { left: `${((x + 1) / 2) * 100}%`, top: `${((1 - y) / 2) * 100}%` };
}

// Layout D's aim mark (SB-2155, revised SB-2157): the centre dot and small circle, the armour's short arc on the left,
// the boost's on the right, and one small line of ammo under it. It follows the cursor's point; `setPosition` pulls the
// mark inward near an edge so neither the arcs nor the line leave the screen. `set` writes the marks' values, so a frame
// only touches what changed.
export interface ReticleMarkState {
  armor: number; // 0-1
  boost: number; // 0-1
  main: number; // rounds left
  sub: number; // rounds left
  mainTier: AmmoTier;
  subTier: AmmoTier;
  locked: boolean;
  glow: number; // the armour's flash, 0-1
}

export interface ReticleMarks {
  root: HTMLElement;
  mainValue: HTMLSpanElement;
  subValue: HTMLSpanElement;
  setPosition(at: ScreenPoint): void;
  set(state: ReticleMarkState): void;
}

// The numbers take the warn colour at a quarter and the red at no rounds; the empty red reads hardest.
function tierStyle(tune: HudRingTune['reticle']): Record<AmmoTier, { color: string; opacity: number }> {
  return {
    quiet: { color: HUD_COLOR.text, opacity: tune.number.opacity.quiet },
    warn: { color: HUD_COLOR.amber, opacity: tune.number.opacity.warn },
    empty: { color: HUD_COLOR.warn, opacity: tune.number.opacity.empty },
  };
}

export function reticleMarks(tune: HudRingTune['reticle']): ReticleMarks {
  const tier = tierStyle(tune);
  const root = document.createElement('div');
  root.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  const rootSvg = svg('svg', { width: '100%', height: '100%' }) as SVGSVGElement;
  rootSvg.style.display = 'block';
  root.appendChild(rootSvg);

  const group = svg('g', {}) as SVGGElement;
  rootSvg.appendChild(group);

  // The left arc is the armour, the right the boost: each opens from its own middle as the gauge goes down.
  const arc = (mid: number, color: string): SVGPathElement => {
    const node = svg('path', {
      d: arcPath(0, 0, tune.arc.radius, mid - tune.arc.openDeg / 2, tune.arc.openDeg),
      fill: 'none',
      stroke: color,
      'stroke-width': tune.arc.thickness,
      'stroke-linecap': 'butt',
    }) as SVGPathElement;
    group.appendChild(node);
    return node;
  };
  arc(180, HUD_COLOR.track);
  const armorArc = arc(180, HUD_COLOR.armorHigh);
  arc(0, HUD_COLOR.track);
  const boostArc = arc(0, HUD_COLOR.bar);
  armorArc.style.display = 'none';
  boostArc.style.display = 'none';

  const circle = svg('circle', {
    cx: 0,
    cy: 0,
    r: tune.radius,
    fill: 'none',
    stroke: HUD_COLOR.ring,
    'stroke-width': tune.thickness,
  });
  group.appendChild(circle);
  const dot = svg('circle', { cx: 0, cy: 0, r: tune.dotRadius, fill: HUD_COLOR.dot });
  group.appendChild(dot);

  const line = document.createElement('div');
  line.style.cssText =
    `position:absolute;box-sizing:border-box;width:${tune.number.width}px;height:${tune.number.height}px;` +
    `font-size:${tune.number.size}px;line-height:${tune.number.height}px;text-align:center;white-space:nowrap;`;
  const mainValue = document.createElement('span');
  mainValue.style.color = tier.quiet.color;
  mainValue.style.opacity = String(tier.quiet.opacity);
  const subValue = document.createElement('span');
  subValue.style.color = tier.quiet.color;
  subValue.style.opacity = String(tier.quiet.opacity);
  line.append(mainValue, document.createTextNode(' '), subValue);
  root.appendChild(line);

  let lastCenter: ScreenPoint | null = null;
  let lastLocked: boolean | null = null;
  let lastArmorSweep = -1;
  let lastArmorColor = '';
  let lastArmorOpacity = -1;
  let lastBoostSweep = -1;
  let lastBoostOpacity = -1;
  let lastMainText = '';
  let lastSubText = '';
  let lastMainTier: AmmoTier | null = null;
  let lastSubTier: AmmoTier | null = null;

  return {
    root,
    mainValue,
    subValue,
    setPosition(at) {
      const screen = { width: window.innerWidth, height: window.innerHeight };
      const number = tune.number;
      const reach = tune.arc.radius + tune.arc.thickness / 2;
      const size = reach * 2;
      // the whole mark is pulled inward, so the arcs stay on the screen; the line is kept inside on its own below
      const box = keepInside({ x: at.x - reach, y: at.y - reach }, size, size, screen, number.margin);
      const center = { x: box.x + reach, y: box.y + reach };
      if (lastCenter !== null && lastCenter.x === center.x && lastCenter.y === center.y) return;
      lastCenter = center;
      group.setAttribute('transform', `translate(${center.x} ${center.y})`);
      const below = center.y + number.gap;
      const top = below + number.height > screen.height - number.margin ? center.y - number.gap - number.height : below;
      const lineAt = keepInside(
        { x: center.x - number.width / 2, y: top },
        number.width,
        number.height,
        screen,
        number.margin,
      );
      line.style.left = `${lineAt.x}px`;
      line.style.top = `${lineAt.y}px`;
    },
    set(state) {
      const locked = reticleColor(state.locked);
      if (state.locked !== lastLocked) {
        lastLocked = state.locked;
        circle.setAttribute('stroke', locked);
        dot.setAttribute('fill', state.locked ? HUD_COLOR.lock : HUD_COLOR.dot);
      }
      const armorSweep = gaugeSweep(state.armor, tune.arc.openDeg);
      const color = armorColor(armorStage(state.armor, tune.armorMid, tune.armorLow));
      const armorOpacity = Math.min(1, tune.arc.armorOpacity + (1 - tune.arc.armorOpacity) * Math.max(0, state.glow));
      if (armorSweep !== lastArmorSweep) {
        lastArmorSweep = armorSweep;
        if (armorSweep <= 0) {
          armorArc.style.display = 'none';
        } else {
          armorArc.style.display = '';
          armorArc.setAttribute('d', arcPath(0, 0, tune.arc.radius, 180 - armorSweep / 2, armorSweep));
        }
      }
      if (color !== lastArmorColor) {
        lastArmorColor = color;
        armorArc.setAttribute('stroke', color);
      }
      if (armorOpacity !== lastArmorOpacity) {
        lastArmorOpacity = armorOpacity;
        armorArc.setAttribute('stroke-opacity', String(armorOpacity));
      }
      const boostSweep = gaugeSweep(state.boost, tune.arc.openDeg);
      if (boostSweep !== lastBoostSweep) {
        lastBoostSweep = boostSweep;
        if (boostSweep <= 0) {
          boostArc.style.display = 'none';
        } else {
          boostArc.style.display = '';
          boostArc.setAttribute('d', arcPath(0, 0, tune.arc.radius, -boostSweep / 2, boostSweep));
        }
      }
      const boostAlpha = boostOpacity(state.boost, tune.arc.boostFullOpacity, tune.arc.boostLowOpacity);
      if (boostAlpha !== lastBoostOpacity) {
        lastBoostOpacity = boostAlpha;
        boostArc.setAttribute('stroke-opacity', String(boostAlpha));
      }
      const text = ammoLine(state.main, state.sub);
      if (text.main !== lastMainText) {
        lastMainText = text.main;
        mainValue.textContent = text.main;
      }
      if (text.sub !== lastSubText) {
        lastSubText = text.sub;
        subValue.textContent = text.sub;
      }
      if (state.mainTier !== lastMainTier) {
        lastMainTier = state.mainTier;
        const style = tier[state.mainTier];
        mainValue.style.color = style.color;
        mainValue.style.opacity = String(style.opacity);
      }
      if (state.subTier !== lastSubTier) {
        lastSubTier = state.subTier;
        const style = tier[state.subTier];
        subValue.style.color = style.color;
        subValue.style.opacity = String(style.opacity);
      }
    },
  };
}

const LOCK_ARM = 10; // px; the length of each corner's arm
const LOCK_LINE = 2; // px; the arm's thickness
const LOCK_PAD = 4; // px; how far the frame stands off the target's rectangle

// The lock frame: four corner hooks round a rectangle. `set` moves it (the rect is the target's, the frame adds
// LOCK_PAD round it); null hides it.
export function lockFrame(): {
  root: HTMLElement;
  set(rect: { left: number; top: number; width: number; height: number } | null): void;
} {
  const root = document.createElement('div');
  root.dataset.hud = 'lock';
  root.style.cssText = 'position:absolute;box-sizing:border-box;pointer-events:none';
  root.hidden = true;
  const line = `${LOCK_LINE}px solid ${HUD_COLOR.lock}`;
  for (const [v, h] of [
    ['top', 'left'],
    ['top', 'right'],
    ['bottom', 'left'],
    ['bottom', 'right'],
  ]) {
    const hook = document.createElement('div');
    hook.style.cssText =
      `position:absolute;box-sizing:border-box;${v}:0;${h}:0;width:${LOCK_ARM}px;height:${LOCK_ARM}px;` +
      `border-${v}:${line};border-${h}:${line}`;
    root.appendChild(hook);
  }
  return {
    root,
    set(rect) {
      root.hidden = rect === null;
      if (rect === null) return;
      root.style.left = `${rect.left - LOCK_PAD}px`;
      root.style.top = `${rect.top - LOCK_PAD}px`;
      root.style.width = `${rect.width + LOCK_PAD * 2}px`;
      root.style.height = `${rect.height + LOCK_PAD * 2}px`;
    },
  };
}
