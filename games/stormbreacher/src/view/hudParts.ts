// The pieces the HUD shares between the mock (#view-hud) and the game's sortie: the aim circle's radius, an arc along
// it, the round radar, the radar's marks, and the dot and circle. DOM only; no three, so a test can build them without
// a renderer.
import { HUD_COLOR } from '../data/colors.ts';
import { CAMERA_TUNE, FCS_TUNE, type HudRingTune } from '../data/tune.ts';
import type { ScreenPoint } from './hudPlace.ts';
import { keepInside } from './hudPlace.ts';
import {
  arcLowEndIsStart,
  gaugeReading,
  gaugeSweep,
  reticleColor,
  type AmmoTier,
  type GaugeKind,
  type GaugeReading,
} from './hudRing.ts';

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

// The aim mark of layouts D, E and F (SB-2155, revised SB-2157 and SB-2158, shared in SB-2159): the centre dot and small
// circle, two short arcs at its sides and up to two short bars over or under it. The layout says which gauge goes in each
// place (`ReticleMarkSpec`); the drawing here is the same for all of them, so an armour arc and an armour bar read alike.
// The mark follows the cursor's point; `setPosition` pulls it inward near an edge so neither the arcs nor the bars leave
// the screen. `set` writes the gauges' values, so a frame only touches what changed.
export interface ReticleMarkState {
  armor: number; // 0-1
  boost: number; // 0-1
  main: number; // rounds left
  mainMax: number; // a full magazine
  sub: number; // rounds left
  subMax: number; // a full magazine
  mainTier: AmmoTier;
  subTier: AmmoTier;
  locked: boolean;
  glow: number; // the armour's flash, 0-1
  blink: number; // an empty gauge's brightness, 0-1
}

// Which gauge a layout sets in each place: the left and right arcs, the bar over the mark, and the bars under it from the
// top down. A slot is the same whether it is an arc or a bar, so one gauge keeps its look in any place.
export interface ReticleMarkSpec {
  left: GaugeKind;
  right: GaugeKind;
  above: GaugeKind | null;
  below: readonly GaugeKind[];
}

export interface ReticleMarks {
  root: HTMLElement;
  main: HTMLElement | SVGElement; // the main ammo gauge (data-hud `main` in hud.ts)
  sub: HTMLElement | SVGElement; // the sub ammo gauge (data-hud `sub` in hud.ts)
  setPosition(at: ScreenPoint): void;
  set(state: ReticleMarkState): void;
}

interface GaugeVisual {
  node: HTMLElement | SVGElement;
  set(reading: GaugeReading, blink: number): void;
}

interface BarVisual extends GaugeVisual {
  node: HTMLElement;
  position(cx: number, cy: number): void;
}

// An arc or a bar's line: round ends, and a butt end for one cell of a segmented gauge, so neighbouring cells keep their
// gap. A cell's butt end is inside the gauge, so the gauge's own ends are still round.
function gaugeStroke(d: string, width: number, color: string, linecap: 'round' | 'butt' = 'round'): SVGPathElement {
  return svg('path', {
    d,
    fill: 'none',
    stroke: color,
    'stroke-width': width,
    'stroke-linecap': linecap,
  }) as SVGPathElement;
}

// One arc of the mark. It drains like a level: what is left sits at the arc's lower end on the screen and the gauge goes
// down from the top, on the left arc and the right one alike. A sub gauge can be drawn as cells instead: one arc a
// round, lit from the lower end, with a dark backing that keeps the divisions visible.
function buildArc(group: SVGGElement, mid: number, tune: HudRingTune['reticle']): GaugeVisual {
  const radius = tune.arc.radius;
  const open = tune.arc.openDeg;
  const start = mid - open / 2;
  const fromStart = arcLowEndIsStart(start, open);
  const holder = svg('g', {}) as SVGGElement;
  group.appendChild(holder);
  // the thin dark edge behind the whole opening, so the track and the cells read over bright sand
  holder.appendChild(
    gaugeStroke(arcPath(0, 0, radius, start, open), tune.stroke + tune.shadow * 2, HUD_COLOR.markShadow),
  );

  let mode = -1; // -1 before the first frame, 0 for one length, >0 for cells
  let track: SVGPathElement | null = null;
  let fill: SVGPathElement | null = null;
  let cells: SVGPathElement[] = [];
  let lastSweep = Number.NaN;
  let lastColor = '';
  let lastOpacity = Number.NaN;
  let lastFilled = -1;
  let lastEmpty: boolean | null = null;
  let lastBlink = Number.NaN;
  let lastTrack = '';

  const rebuild = (count: number): void => {
    track?.remove();
    fill?.remove();
    for (const cell of cells) cell.remove();
    track = null;
    fill = null;
    cells = [];
    if (count > 0) {
      const gapDeg = (tune.bar.segmentGap / radius) * (180 / Math.PI);
      const cellDeg = Math.max(0, (open - gapDeg * (count - 1)) / count);
      for (let i = 0; i < count; i++) {
        const cell = gaugeStroke(
          arcPath(0, 0, radius, start + i * (cellDeg + gapDeg), cellDeg),
          tune.stroke,
          HUD_COLOR.track,
          'butt',
        );
        holder.appendChild(cell);
        cells.push(cell);
      }
    } else {
      track = gaugeStroke(arcPath(0, 0, radius, start, open), tune.stroke, HUD_COLOR.track);
      fill = gaugeStroke(arcPath(0, 0, radius, start, 0), tune.stroke, HUD_COLOR.track);
      holder.append(track, fill);
    }
    lastSweep = Number.NaN;
    lastColor = '';
    lastOpacity = Number.NaN;
    lastFilled = -1;
    lastEmpty = null;
    lastBlink = Number.NaN;
    lastTrack = '';
  };

  return {
    node: holder,
    set(reading, blink) {
      if (reading.cells !== mode) {
        mode = reading.cells;
        rebuild(mode);
      }
      if (mode > 0) {
        if (reading.filled !== lastFilled || reading.color !== lastColor || reading.empty !== lastEmpty) {
          lastFilled = reading.filled;
          lastColor = reading.color;
          lastEmpty = reading.empty;
          for (let i = 0; i < cells.length; i++) {
            cells[i].setAttribute(
              'stroke',
              reading.empty
                ? HUD_COLOR.warn
                : (fromStart ? i : cells.length - 1 - i) < reading.filled
                  ? reading.color
                  : HUD_COLOR.track,
            );
          }
        }
      } else if (track !== null && fill !== null) {
        const trackColor = reading.empty ? HUD_COLOR.warn : HUD_COLOR.track;
        if (trackColor !== lastTrack) {
          lastTrack = trackColor;
          track.setAttribute('stroke', trackColor);
        }
        if (reading.color !== lastColor) {
          lastColor = reading.color;
          fill.setAttribute('stroke', reading.color);
        }
        if (reading.opacity !== lastOpacity) {
          lastOpacity = reading.opacity;
          fill.setAttribute('stroke-opacity', String(reading.opacity));
        }
        const sweep = gaugeSweep(reading.ratio, open);
        if (sweep !== lastSweep) {
          lastSweep = sweep;
          if (sweep <= 0) {
            fill.style.display = 'none';
          } else {
            fill.style.display = '';
            fill.setAttribute('d', arcPath(0, 0, radius, fromStart ? start : start + open - sweep, sweep));
          }
        }
      }
      const alpha = reading.empty ? blink : 1;
      if (alpha !== lastBlink) {
        lastBlink = alpha;
        holder.style.opacity = String(alpha);
      }
    },
  };
}

// One bar of the mark. Like an arc, it shows a share or, for a sub gauge, one cell a round. The caller places it relative
// to the mark's centre with `position`.
function buildBar(parent: HTMLElement, top: number, tune: HudRingTune['reticle']): BarVisual {
  const width = tune.bar.width;
  const thickness = tune.stroke;
  const end = thickness / 2;
  const bar = document.createElement('div');
  bar.style.cssText =
    `position:absolute;box-sizing:border-box;width:${width}px;height:${thickness}px;` +
    `border-radius:${end}px;background:${HUD_COLOR.track};` +
    `box-shadow:0 0 0 ${tune.shadow}px ${HUD_COLOR.markShadow};`;
  const fill = document.createElement('div');
  fill.style.cssText = `position:absolute;left:0;top:0;bottom:0;width:0%;border-radius:${end}px;background:${HUD_COLOR.track};`;
  bar.appendChild(fill);
  parent.appendChild(bar);

  let mode = -1;
  let cells: HTMLDivElement[] = [];
  let lastShare = Number.NaN;
  let lastColor = '';
  let lastOpacity = Number.NaN;
  let lastFilled = -1;
  let lastEmpty: boolean | null = null;
  let lastBlink = Number.NaN;

  const rebuild = (count: number): void => {
    bar.replaceChildren();
    cells = [];
    if (count > 0) {
      bar.style.background = 'transparent';
      bar.style.boxShadow = 'none';
      bar.style.gap = `${tune.bar.segmentGap}px`;
      bar.style.display = 'flex';
      for (let i = 0; i < count; i++) {
        const cell = document.createElement('div');
        cell.style.cssText =
          `flex:1 1 0;height:100%;border-radius:${end}px;background:${HUD_COLOR.track};` +
          `box-shadow:0 0 0 ${tune.shadow}px ${HUD_COLOR.markShadow};`;
        bar.appendChild(cell);
        cells.push(cell);
      }
    } else {
      bar.style.background = HUD_COLOR.track;
      bar.style.boxShadow = `0 0 0 ${tune.shadow}px ${HUD_COLOR.markShadow}`;
      bar.style.gap = '';
      bar.style.display = '';
      bar.appendChild(fill);
    }
    lastShare = Number.NaN;
    lastColor = '';
    lastOpacity = Number.NaN;
    lastFilled = -1;
    lastEmpty = null;
    lastBlink = Number.NaN;
  };

  return {
    node: bar,
    position(cx, cy) {
      bar.style.left = `${cx - width / 2}px`;
      bar.style.top = `${cy + top}px`;
    },
    set(reading, blink) {
      if (reading.cells !== mode) {
        mode = reading.cells;
        rebuild(mode);
      }
      if (mode > 0) {
        if (reading.filled !== lastFilled || reading.color !== lastColor || reading.empty !== lastEmpty) {
          lastFilled = reading.filled;
          lastColor = reading.color;
          lastEmpty = reading.empty;
          for (let i = 0; i < cells.length; i++) {
            cells[i].style.background = reading.empty
              ? HUD_COLOR.warn
              : i < reading.filled
                ? reading.color
                : HUD_COLOR.track;
          }
        }
      } else {
        if (reading.color !== lastColor) {
          lastColor = reading.color;
          fill.style.background = reading.color;
        }
        if (reading.opacity !== lastOpacity) {
          lastOpacity = reading.opacity;
          fill.style.opacity = String(reading.opacity);
        }
        if (reading.ratio !== lastShare || reading.empty !== lastEmpty) {
          lastShare = reading.ratio;
          lastEmpty = reading.empty;
          fill.style.width = `${reading.ratio * 100}%`;
          fill.style.display = reading.ratio > 0 && !reading.empty ? '' : 'none';
          bar.style.background = reading.empty ? HUD_COLOR.warn : HUD_COLOR.track;
        }
      }
      const alpha = reading.empty ? blink : 1;
      if (alpha !== lastBlink) {
        lastBlink = alpha;
        bar.style.opacity = String(alpha);
      }
    },
  };
}

export function reticleMarks(tune: HudRingTune['reticle'], spec: ReticleMarkSpec): ReticleMarks {
  const root = document.createElement('div');
  root.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  const rootSvg = svg('svg', { width: '100%', height: '100%' }) as SVGSVGElement;
  rootSvg.style.display = 'block';
  root.appendChild(rootSvg);

  const group = svg('g', {}) as SVGGElement;
  rootSvg.appendChild(group);

  const gauges: { kind: GaugeKind; visual: GaugeVisual }[] = [];
  const bars: BarVisual[] = [];
  const addArc = (kind: GaugeKind, mid: number): void => {
    gauges.push({ kind, visual: buildArc(group, mid, tune) });
  };
  addArc(spec.left, 180);
  addArc(spec.right, 0);

  // The bars sit one `gap` beyond the arcs, and each further bar one `gap` beyond the last.
  const arcOuter = tune.arc.radius + tune.stroke / 2;
  const addBar = (kind: GaugeKind, top: number): void => {
    const visual = buildBar(root, top, tune);
    bars.push(visual);
    gauges.push({ kind, visual });
  };
  if (spec.above !== null) addBar(spec.above, -(arcOuter + tune.gap + tune.stroke));
  let belowTop = arcOuter + tune.gap;
  for (const kind of spec.below) {
    addBar(kind, belowTop);
    belowTop += tune.stroke + tune.gap;
  }

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

  const style = {
    armorMid: tune.armorMid,
    armorLow: tune.armorLow,
    armorOpacity: tune.arc.armorOpacity,
    boostFullOpacity: tune.arc.boostFullOpacity,
    boostLowOpacity: tune.arc.boostLowOpacity,
    maxSegments: tune.bar.maxSegments,
  };

  const nodeOf = (kind: GaugeKind): HTMLElement | SVGElement => {
    const found = gauges.find(gauge => gauge.kind === kind);
    if (found === undefined) throw new Error(`the aim mark has no ${kind} gauge`);
    return found.visual.node;
  };

  let lastCenter: ScreenPoint | null = null;
  let lastLocked: boolean | null = null;

  return {
    root,
    main: nodeOf('main'),
    sub: nodeOf('sub'),
    setPosition(at) {
      const screen = { width: window.innerWidth, height: window.innerHeight };
      const arcReach = arcOuter + tune.shadow;
      const halfWidth = Math.max(arcReach, tune.bar.width / 2 + tune.shadow);
      const above = spec.above === null ? arcReach : arcOuter + tune.gap + tune.stroke + tune.shadow;
      const below =
        spec.below.length === 0
          ? arcReach
          : arcOuter + tune.gap + spec.below.length * tune.stroke + (spec.below.length - 1) * tune.gap + tune.shadow;
      // the whole mark is pulled inward, so the arcs and every bar stay on the screen
      const box = keepInside(
        { x: at.x - halfWidth, y: at.y - above },
        halfWidth * 2,
        above + below,
        screen,
        tune.margin,
      );
      const center = { x: box.x + halfWidth, y: box.y + above };
      if (lastCenter !== null && lastCenter.x === center.x && lastCenter.y === center.y) return;
      lastCenter = center;
      group.setAttribute('transform', `translate(${center.x} ${center.y})`);
      for (const bar of bars) bar.position(center.x, center.y);
    },
    set(state) {
      const locked = reticleColor(state.locked);
      if (state.locked !== lastLocked) {
        lastLocked = state.locked;
        circle.setAttribute('stroke', locked);
        dot.setAttribute('fill', state.locked ? HUD_COLOR.lock : HUD_COLOR.dot);
      }
      for (const gauge of gauges) gauge.visual.set(gaugeReading(gauge.kind, state, style), state.blink);
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
