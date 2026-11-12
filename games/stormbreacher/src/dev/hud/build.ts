// The HUD mock's DOM (#view-hud, SB-160): the three plans from plans.ts drawn with sample values, the shared reticle
// and lock square, and the optional touch rings. DOM only; no three, so a test can build it without a renderer.
import { t } from '@engine/core/index.ts';
import { HUD_COLOR } from '../../data/colors.ts';
import { TOUCH_DEFAULTS, type TouchButton } from '../../data/touch.ts';
import { fillArcGauge, lockFrame, markShape, reticleSvg, ringRadius, roundRadar, svg } from '../../view/hudParts.ts';
import {
  CUTSCENE_RADIO_CSS,
  HUD_IDS,
  HUD_PLANS,
  HUD_SAMPLE,
  PLAN_IDS,
  type HudDir,
  type HudId,
  type HudPlace,
  type PlanId,
} from './plans.ts';

const HEAT_COLOR = '#ff9d3d';
const EDGE_COLOR = 'rgba(84, 232, 255, 0.35)';
const TOUCH_COLOR = 'rgba(255, 255, 255, 0.35)';
const CUTSCENE_COLOR = '#000';

const LOCK_SAMPLE = { left: 775, top: 285, width: 40, height: 40 }; // px; the sample frame's rectangle (1280x720)
const COMPASS_PAD = 8; // px between the compass's edge and angle +-90
const COMPASS_LETTER_SIZE = 11; // px, the W / N / E letters
const COMPASS_LETTER_Y = 22; // px, the letters' baseline from the compass's top (under the amber mark)

// test/e2e/hud.test.ts reads ringRadius from here; the mock and the game both draw with view/hudParts.ts.
export { ringRadius };

// The text sizes and the bar's thickness per plan, from the ticket's notes. For a `v` element `bar` is the bar's
// length and `barWidth` its width.
interface HudStyle {
  name: number;
  value: number;
  bar: number;
  barWidth?: number;
}

const TEXT_STYLES: Record<PlanId, Partial<Record<HudId, HudStyle>>> = {
  a: {
    armor: { name: 12, value: 28, bar: 10 },
    boost: { name: 12, value: 12, bar: 8 },
    heat: { name: 12, value: 12, bar: 6 },
    main: { name: 12, value: 28, bar: 0 },
    sub: { name: 12, value: 20, bar: 0 },
    enemy: { name: 14, value: 14, bar: 10 },
  },
  b: {
    armor: { name: 12, value: 18, bar: 12 },
    boost: { name: 12, value: 12, bar: 8 },
    heat: { name: 12, value: 12, bar: 6 },
    main: { name: 12, value: 28, bar: 0 },
    sub: { name: 12, value: 28, bar: 0 },
    enemy: { name: 14, value: 14, bar: 10 },
  },
  c: {
    // 112 + the name and the number on two lines (about 34 px) stay inside the 150 px box
    armor: { name: 11, value: 14, bar: 112, barWidth: 8 },
    boost: { name: 11, value: 14, bar: 112, barWidth: 8 },
    heat: { name: 11, value: 11, bar: 5 },
    main: { name: 12, value: 20, bar: 0 },
    sub: { name: 12, value: 15, bar: 0 },
    enemy: { name: 12, value: 12, bar: 4 },
  },
  d: {
    // on an `arc` element `bar` is the arc's line thickness
    armor: { name: 10, value: 13, bar: 4 },
    boost: { name: 10, value: 13, bar: 4 },
    heat: { name: 11, value: 11, bar: 3 },
    main: { name: 11, value: 16, bar: 0 },
    sub: { name: 11, value: 13, bar: 0 },
    enemy: { name: 14, value: 14, bar: 10 },
  },
};

const WARNING_SIZE: Record<PlanId, number> = { a: 20, b: 18, c: 20, d: 20 };

const LABELS: Record<HudId, string> = {
  armor: '装甲',
  boost: 'ブースト',
  heat: '熱',
  main: 'メイン',
  sub: 'サブ',
  enemy: HUD_SAMPLE.enemy.name,
  objective: '目標',
  radar: '',
  radio: HUD_SAMPLE.radio.label,
  warning: '',
};

// A bar's fill, 0-1. The elements without a bar are left out.
function ratios(): Partial<Record<HudId, number>> {
  const s = HUD_SAMPLE;
  return {
    armor: s.armor.current / s.armor.max,
    boost: s.boost,
    heat: s.heat,
    enemy: s.enemy.health,
  };
}

function texts(): Record<HudId, string> {
  const s = HUD_SAMPLE;
  return {
    armor: `${s.armor.current} / ${s.armor.max}`,
    boost: `${Math.round(s.boost * 100)}%`,
    heat: `${Math.round(s.heat * 100)}%`,
    main: `${s.main.current} / ${s.main.max}`,
    sub: `${s.sub.current} / ${s.sub.max}`,
    enemy: '',
    objective: t(s.objective.key) + s.objective.count,
    radar: '',
    radio: t(s.radio.key),
    warning: `WARNING  ${s.warning}`,
  };
}

// The shorter numbers under a `v` bar (plan C), which is only 56 px wide; the bar already shows the share.
const SHORT_TEXTS: Partial<Record<HudId, string>> = {
  armor: `${HUD_SAMPLE.armor.current}`,
};

function pxOf(css: string, name: string): number {
  const hit = new RegExp(`${name}:(\\d+)px`).exec(css);
  return hit ? Number(hit[1]) : 0;
}

function span(text: string, size: number): HTMLSpanElement {
  const node = document.createElement('span');
  node.textContent = text;
  node.style.fontSize = `${size}px`;
  node.style.color = HUD_COLOR.text;
  return node;
}

// A bar: h runs across the element (A's armor), row shares a line (B's gauges) and v stands up (C's armor).
function bar(ratio: number, style: HudStyle, mode: 'h' | 'row' | 'v', color: string): HTMLElement {
  const box = document.createElement('div');
  const layout =
    mode === 'h'
      ? `width:100%;height:${style.bar}px;margin-top:2px;`
      : mode === 'row'
        ? `flex:1 1 auto;height:${style.bar}px;`
        : `width:${style.barWidth ?? 8}px;height:${style.bar}px;`;
  box.style.cssText = `position:relative;background:${HUD_COLOR.panel};${layout}`;
  const fill = document.createElement('div');
  const share = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  fill.style.cssText =
    mode === 'v'
      ? `position:absolute;left:0;right:0;bottom:0;height:${share};background:${color};`
      : `position:absolute;left:0;top:0;bottom:0;width:${share};background:${color};`;
  box.appendChild(fill);
  return box;
}

function compass(width: number, height: number): SVGSVGElement {
  const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height: '100%' }) as SVGSVGElement;
  const cx = width / 2;
  const half = width / 2 - COMPASS_PAD;
  root.appendChild(svg('rect', { x: 0, y: 0, width, height, fill: HUD_COLOR.panel }));
  // ticks every 15 degrees, from -90 (left) to +90 (right)
  for (let angle = -90; angle <= 90; angle += 15) {
    const x = cx + (angle / 90) * half;
    const top = angle % 45 === 0 ? 4 : 7;
    root.appendChild(
      svg('line', { x1: x, y1: top, x2: x, y2: height - 3, stroke: HUD_COLOR.text, 'stroke-opacity': 0.3 }),
    );
  }
  // the letters: W at the left end, N in the middle and E at the right end. S lies outside +-90 degrees, so it is not
  // drawn.
  const letter = (text: string, x: number): SVGElement => {
    const node = svg('text', {
      x,
      y: COMPASS_LETTER_Y,
      fill: HUD_COLOR.text,
      'font-size': COMPASS_LETTER_SIZE,
      'text-anchor': 'middle',
      'font-family': 'monospace',
    });
    node.textContent = text;
    return node;
  };
  root.appendChild(letter('W', cx - half + 8));
  root.appendChild(letter('N', cx));
  root.appendChild(letter('E', cx + half - 8));
  root.appendChild(svg('polygon', { points: `${cx - 4},3 ${cx + 4},3 ${cx},9`, fill: HUD_COLOR.amber }));
  for (const mark of HUD_SAMPLE.radar) {
    const x = cx + (Math.max(-90, Math.min(90, mark.angle)) / 90) * half;
    root.appendChild(markShape(mark.kind, x, height / 2 + 4));
  }
  return root;
}

function radarOf(place: HudPlace): SVGElement {
  const width = pxOf(place.css, 'width');
  const height = pxOf(place.css, 'height');
  if (place.radar === 'compass') return compass(width, height);
  const radar = roundRadar(width, height);
  radar.set(HUD_SAMPLE.radar);
  return radar.root;
}

// What a builder gets: the element's outer node (already placed) and what it may draw into it.
interface BuildArgs {
  node: HTMLElement;
  place: HudPlace;
  plan: PlanId;
  texts: Record<HudId, string>;
}

type Builder = (args: BuildArgs) => void;

// The elements with a look of their own. The rest are gauges, drawn by their `dir`.
const SPECIAL_BUILDERS: Partial<Record<HudId | 'strip', Builder>> = {
  strip: ({ node }) => {
    node.style.background = HUD_COLOR.panel;
    node.style.borderTop = `1px solid ${EDGE_COLOR}`;
  },
  radar: ({ node, place }) => {
    node.appendChild(radarOf(place));
  },
  objective: ({ node, texts }) => {
    const label = span(LABELS.objective, 16);
    label.style.color = HUD_COLOR.amber;
    node.append(label, span(` ${texts.objective}`, 16));
  },
  warning: ({ node, plan, texts }) => {
    const text = span(texts.warning, WARNING_SIZE[plan]);
    text.style.color = HUD_COLOR.warn;
    text.style.fontWeight = 'bold';
    node.appendChild(text);
  },
  radio: ({ node, texts }) => {
    node.style.background = HUD_COLOR.panel;
    node.style.padding = '2px 6px';
    node.append(span(LABELS.radio, 16), span(` ${texts.radio}`, 16));
  },
};

// A gauge's id is always a HudId: the strip has a builder of its own.
const gaugeId = (place: HudPlace): HudId => place.id as HudId;

function gaugeParts(args: BuildArgs) {
  const id = gaugeId(args.place);
  const style = TEXT_STYLES[args.plan][id] ?? { name: 12, value: 14, bar: 0 };
  const ratio = ratios()[id];
  const color = id === 'heat' ? HEAT_COLOR : HUD_COLOR.bar;
  return { id, style, ratio, color };
}

const GAUGE_BUILDERS: Record<HudDir, Builder> = {
  // name, bar and number on one line
  row: args => {
    const { id, style, ratio, color } = gaugeParts(args);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px';
    row.appendChild(span(LABELS[id], style.name));
    if (style.bar > 0 && ratio !== undefined) row.appendChild(bar(ratio, style, 'row', color));
    row.appendChild(span(args.texts[id], style.value));
    args.node.appendChild(row);
  },
  // a tall bar, then the name and a short number on two lines, all centred inside the box
  v: args => {
    const { id, style, ratio, color } = gaugeParts(args);
    const column = document.createElement('div');
    column.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px';
    if (style.bar > 0 && ratio !== undefined) column.appendChild(bar(ratio, style, 'v', color));
    column.append(span(LABELS[id], style.name), span(SHORT_TEXTS[id] ?? args.texts[id], style.value));
    args.node.appendChild(column);
  },
  // the name and the number on one line, the bar under it
  h: args => {
    const { id, style, ratio, color } = gaugeParts(args);
    const row = document.createElement('div');
    row.appendChild(span(LABELS[id], style.name));
    if (args.texts[id] !== '') row.appendChild(span(` ${args.texts[id]}`, style.value));
    args.node.appendChild(row);
    if (style.bar > 0 && ratio !== undefined) args.node.appendChild(bar(ratio, style, 'h', color));
  },
  // a thin arc along the aim circle with the name and the number outside it (plan D)
  arc: args => {
    const { id, style, ratio, color } = gaugeParts(args);
    fillArcGauge(args.node, {
      side: args.place.side ?? 'right',
      ratio: ratio ?? 0,
      color,
      thickness: style.bar,
      name: LABELS[id],
      nameSize: style.name,
      value: SHORT_TEXTS[id] ?? args.texts[id],
      valueSize: style.value,
    });
  },
};

function buildElement(place: HudPlace, plan: PlanId, texts: Record<HudId, string>): HTMLElement {
  const node = document.createElement('div');
  node.dataset.hud = place.id;
  node.style.cssText = `position:absolute;box-sizing:border-box;${place.css}`;
  const builder = SPECIAL_BUILDERS[place.id] ?? GAUGE_BUILDERS[place.dir ?? 'h'];
  builder({ node, place, plan, texts });
  return node;
}

function reticle(): HTMLElement {
  const node = document.createElement('div');
  node.dataset.hud = 'reticle';
  node.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  node.appendChild(reticleSvg());
  return node;
}

// The lock frame round a sample rectangle, drawn by the same part the game uses.
function lockSample(): HTMLElement {
  const frame = lockFrame();
  frame.set(LOCK_SAMPLE);
  return frame.root;
}

function touchRing(id: TouchButton): HTMLElement {
  const place = TOUCH_DEFAULTS[id];
  const diameter = place.b * place.s;
  const node = document.createElement('div');
  node.dataset.hud = `touch-${id}`;
  node.textContent = t(`btn.${id}`);
  node.style.cssText =
    `position:absolute;box-sizing:border-box;display:flex;align-items:center;justify-content:center;` +
    `left:${window.innerWidth * place.x - diameter / 2}px;top:${window.innerHeight * place.y - diameter / 2}px;` +
    `width:${diameter}px;height:${diameter}px;border:1px dashed ${TOUCH_COLOR};border-radius:50%;` +
    `font-size:10px;color:${TOUCH_COLOR}`;
  return node;
}

function barElement(side: 'top' | 'bottom'): HTMLElement {
  const node = document.createElement('div');
  node.dataset.hud = `cutscene-${side}`;
  node.style.cssText =
    `position:absolute;left:0;right:0;height:12vh;background:${CUTSCENE_COLOR};` +
    (side === 'top' ? 'top:0' : 'bottom:0');
  return node;
}

// Builds the HUD into `parent` and returns it, replacing an older #sbHud. `plan` picks the placement, `cutscene`
// draws the bars and hides everything but the radio, and `touch` lays the touch buttons' rings over it.
export function buildHud(
  parent: HTMLElement,
  plan: PlanId,
  options: { cutscene: boolean; touch: boolean },
): HTMLElement {
  parent.querySelector('#sbHud')?.remove();
  const root = document.createElement('div');
  root.id = 'sbHud';
  root.dataset.plan = plan;
  root.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:5;line-height:1.2;box-sizing:border-box;' +
    'white-space:nowrap;text-shadow:0 1px 4px rgba(0,0,0,.8)';
  root.style.setProperty('--ring', `${ringRadius(window.innerHeight)}px`);
  parent.appendChild(root);

  // the bars go in first so the radio and the touch rings stay on top of them
  if (options.cutscene) {
    root.appendChild(barElement('top'));
    root.appendChild(barElement('bottom'));
  }

  const textsById = texts();
  for (const place of HUD_PLANS[plan]) {
    const shown: HudPlace = place.id === 'radio' && options.cutscene ? { ...place, css: CUTSCENE_RADIO_CSS } : place;
    root.appendChild(buildElement(shown, plan, textsById));
  }
  root.appendChild(reticle());
  root.appendChild(lockSample());

  if (options.touch) {
    for (const id of Object.keys(TOUCH_DEFAULTS) as TouchButton[]) root.appendChild(touchRing(id));
  }

  if (options.cutscene) {
    for (const node of root.querySelectorAll<HTMLElement>('[data-hud]')) {
      const id = node.dataset.hud;
      if (id === 'radio' || id?.startsWith('cutscene-') || id?.startsWith('touch-')) continue;
      node.style.display = 'none';
    }
  }

  // the plan's ids are checked here so a typo in the table fails at once in a test
  if (!PLAN_IDS.includes(plan)) throw new Error(`unknown HUD plan: ${plan}`);
  for (const id of HUD_IDS)
    if (!root.querySelector(`[data-hud="${id}"]`)) throw new Error(`missing HUD element: ${id}`);
  return root;
}
