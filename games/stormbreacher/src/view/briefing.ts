// The briefing's map (SB-310), drawn on a 2D canvas seen from above: the land on top (-z) and the sea at the bottom
// (+z), as on the map. What is drawn comes from logic/briefing.ts; nothing here decides what shows when.
import { BRIEFING_TUNE } from '../data/briefings.ts';
import { BRIEFING_COLOR } from '../data/colors.ts';
import { symbolState, type BriefingMap, type BriefingMark } from '../logic/briefing.ts';
import type { BriefingLine, BriefingSymbol, GroundSpot } from '../data/types.ts';

const PX_PER_M = 2; // the canvas's pixels for a metre
const TERRAIN_R: Record<string, number> = { hedgehog: 1.2, seawall: 2.4, cliff: 3 }; // a ground dot's radius (m)
const SITE_R = 5; // a target's mark, half its side (m)
const DOT_R = 2; // a squad's dot (m)
const ARROW_WIDTH = 2.2; // an arrow's line (m)
const ARROW_HEAD = 7; // an arrow's head, its length (m)
const BLINK_LOW = 0.35; // the least opacity of a blinking symbol

export function briefingCanvasSize(map: BriefingMap): { width: number; height: number } {
  return {
    width: Math.round((map.bounds.maxX - map.bounds.minX) * PX_PER_M),
    height: Math.round((map.bounds.maxZ - map.bounds.minZ) * PX_PER_M),
  };
}

const COLOR_OF: Record<BriefingSymbol, string> = {
  battery: BRIEFING_COLOR.enemy,
  pillboxes: BRIEFING_COLOR.enemy,
  squad: BRIEFING_COLOR.enemy,
  depot: BRIEFING_COLOR.depot,
  wave1: BRIEFING_COLOR.wave1,
  wave2: BRIEFING_COLOR.wave2,
};

// Draws the whole map at `time` (s) for the lines out by then.
export function drawBriefing(
  ctx: CanvasRenderingContext2D,
  map: BriefingMap,
  lines: readonly BriefingLine[],
  time: number,
): void {
  const { minX, minZ, maxZ } = map.bounds;
  const at = (p: GroundSpot): GroundSpot => ({ x: (p.x - minX) * PX_PER_M, z: (p.z - minZ) * PX_PER_M });
  const width = ctx.canvas.width;
  const front = (maxZ - BRIEFING_TUNE.seaMargin - minZ) * PX_PER_M; // where the sand ends and the sea begins
  ctx.clearRect(0, 0, width, ctx.canvas.height);
  ctx.fillStyle = BRIEFING_COLOR.land;
  ctx.fillRect(0, 0, width, front);
  ctx.fillStyle = BRIEFING_COLOR.sea;
  ctx.fillRect(0, front, width, ctx.canvas.height - front);
  const dotColor: Record<string, string> = {
    hedgehog: BRIEFING_COLOR.hedgehog,
    seawall: BRIEFING_COLOR.wall,
    cliff: BRIEFING_COLOR.cliff,
  };
  for (const dot of map.terrain) {
    const p = at(dot);
    ctx.fillStyle = dotColor[dot.kind] ?? BRIEFING_COLOR.hedgehog;
    ctx.beginPath();
    ctx.arc(p.x, p.z, (TERRAIN_R[dot.kind] ?? 1) * PX_PER_M, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const mark of map.marks) {
    const state = symbolState(lines, time, mark.symbol);
    if (!state.shown) continue;
    ctx.globalAlpha = state.latest
      ? BLINK_LOW + (1 - BLINK_LOW) * (0.5 + 0.5 * Math.sin(time * BRIEFING_TUNE.blinkHz * Math.PI * 2))
      : 1;
    drawMark(ctx, mark, at, (time - state.since) / BRIEFING_TUNE.arrowSec);
  }
  ctx.globalAlpha = 1;
}

function drawMark(
  ctx: CanvasRenderingContext2D,
  mark: BriefingMark,
  at: (p: GroundSpot) => GroundSpot,
  progress: number,
): void {
  const color = COLOR_OF[mark.symbol];
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  const first = mark.points[0];
  if (!first) return;
  const head = at(first);
  if (mark.shape === 'site') {
    const r = SITE_R * PX_PER_M;
    ctx.fillRect(head.x - r, head.z - r, r * 2, r * 2);
  } else if (mark.shape === 'dot') {
    ctx.beginPath();
    ctx.arc(head.x, head.z, DOT_R * PX_PER_M, 0, Math.PI * 2);
    ctx.fill();
  } else {
    drawArrow(ctx, mark.points.map(at), Math.min(1, Math.max(0, progress)));
  }
}

// An arrow along `points` (canvas pixels), drawn from its tail as far as `progress` (0..1) of its length, with the head
// on the end of what is drawn.
function drawArrow(ctx: CanvasRenderingContext2D, points: GroundSpot[], progress: number): void {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - (points[i]?.x ?? 0), p.z - (points[i]?.z ?? 0)));
  const total = lengths.reduce((a, b) => a + b, 0);
  let left = total * progress;
  const drawn: GroundSpot[] = points.slice(0, 1);
  for (let i = 0; i < lengths.length; i++) {
    const from = points[i];
    const to = points[i + 1];
    const len = lengths[i];
    if (!from || !to || len === undefined) break;
    const f = len === 0 ? 1 : Math.min(1, left / len);
    drawn.push({ x: from.x + (to.x - from.x) * f, z: from.z + (to.z - from.z) * f });
    left -= len * f;
    if (f < 1) break;
  }
  ctx.lineWidth = ARROW_WIDTH * PX_PER_M;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  drawn.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.z) : ctx.lineTo(p.x, p.z)));
  ctx.stroke();
  const tip = drawn[drawn.length - 1];
  const prev = drawn[drawn.length - 2];
  if (!tip || !prev || (tip.x === prev.x && tip.z === prev.z)) return;
  const angle = Math.atan2(tip.z - prev.z, tip.x - prev.x);
  const h = ARROW_HEAD * PX_PER_M;
  ctx.beginPath();
  ctx.moveTo(tip.x + Math.cos(angle) * h * 0.5, tip.z + Math.sin(angle) * h * 0.5);
  ctx.lineTo(tip.x + Math.cos(angle + 2.5) * h * 0.7, tip.z + Math.sin(angle + 2.5) * h * 0.7);
  ctx.lineTo(tip.x + Math.cos(angle - 2.5) * h * 0.7, tip.z + Math.sin(angle - 2.5) * h * 0.7);
  ctx.closePath();
  ctx.fill();
}
