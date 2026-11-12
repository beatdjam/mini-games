// The pieces the HUD shares between the mock (#view-hud) and the game's sortie: the aim circle's radius, an arc along
// it, the round radar, the radar's marks, and the dot and circle. DOM only; no three, so a test can build them without
// a renderer.
import { HUD_COLOR } from '../data/colors.ts';
import { CAMERA_TUNE, FCS_TUNE } from '../data/tune.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DOT_RADIUS = 2.5; // px
const RADAR_PAD = 8; // px kept inside the round radar's edge
const ARC_GAP = 14; // px, from the aim circle to the arc; the arc's radius is ringRadius + ARC_GAP
const ARC_HALF = 50; // degrees, half the arc's opening: 50 above and below the horizontal, 100 in all
const ARC_TEXT_W = 44; // px, the text column outside the arc
const ARC_TEXT_GAP = 6; // px, between the arc and the text column

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

export type RadarMarkKind = 'objective' | 'depot' | 'enemy';

export interface RadarKey {
  kind: RadarMarkKind;
  angle: number; // degrees from the mech's front, + to the right
  dist: number; // 0 at the centre, 1 at the edge
}

export function markShape(kind: RadarMarkKind, x: number, y: number): SVGElement {
  if (kind === 'enemy') return svg('circle', { cx: x, cy: y, r: 3, fill: HUD_COLOR.warn });
  if (kind === 'depot') return svg('rect', { x: x - 3, y: y - 3, width: 6, height: 6, fill: HUD_COLOR.amber });
  const points = `${x},${y - 5} ${x + 5},${y} ${x},${y + 5} ${x - 5},${y}`;
  return svg('polygon', { points, fill: HUD_COLOR.amber });
}

// A round radar with the mech at its centre and the mech's front up. The outer circle and the centre dot are drawn once;
// `set` puts the marks down again.
export function roundRadar(
  width: number,
  height: number,
): { root: SVGSVGElement; set(marks: readonly RadarKey[]): void } {
  const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height: '100%' }) as SVGSVGElement;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - RADAR_PAD;
  root.appendChild(
    svg('circle', { cx, cy, r: radius, fill: HUD_COLOR.panel, stroke: HUD_COLOR.text, 'stroke-opacity': 0.35 }),
  );
  root.appendChild(svg('circle', { cx, cy, r: 2.5, fill: HUD_COLOR.bar }));
  const marks = svg('g', {}) as SVGGElement;
  root.appendChild(marks);
  return {
    root,
    set(list) {
      marks.replaceChildren();
      for (const mark of list) {
        const angle = (mark.angle * Math.PI) / 180;
        const x = cx + Math.sin(angle) * mark.dist * radius;
        const y = cy - Math.cos(angle) * mark.dist * radius;
        marks.appendChild(markShape(mark.kind, x, y));
      }
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

// The dot at the screen's centre and the aim circle around it.
export function reticleSvg(): SVGSVGElement {
  const root = svg('svg', { width: '100%', height: '100%' }) as SVGSVGElement;
  root.appendChild(svg('circle', { cx: '50%', cy: '50%', r: DOT_RADIUS, fill: HUD_COLOR.dot }));
  root.appendChild(
    svg('circle', {
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
