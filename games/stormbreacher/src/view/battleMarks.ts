// The look of the infantry's being under fire (SB-2272), as pure functions: the colour of the mark over a soldier, the
// mark's size, and whether a hit may spark again. No three and no DOM, so a node test can try them.
import { FEEDBACK_COLOR } from '../data/colors.ts';
import { FEEDBACK_TUNE } from '../data/tune.ts';

// `a` to `b` by `t` (0-1), one 0xRRGGBB colour.
function mixColor(a: number, b: number, t: number): number {
  const r = Math.round(((a >> 16) & 0xff) + (((b >> 16) & 0xff) - ((a >> 16) & 0xff)) * t);
  const g = Math.round(((a >> 8) & 0xff) + (((b >> 8) & 0xff) - ((a >> 8) & 0xff)) * t);
  const bl = Math.round((a & 0xff) + ((b & 0xff) - (a & 0xff)) * t);
  return (r << 16) | (g << 8) | bl;
}

// The mark's colour for a soldier with `share` of its health left: amber while it is full, turning to red as it is hurt,
// and fully red at markRedShare or below. A soldier that is only aimed at keeps the amber.
export function markColor(share: number): number {
  const low = Math.max(0, Math.min(1, FEEDBACK_TUNE.markRedShare));
  const t = Math.max(0, Math.min(1, (share - low) / Math.max(1e-9, 1 - low)));
  return mixColor(FEEDBACK_COLOR.markHit, FEEDBACK_COLOR.mark, t);
}

// The mark's width and height in metres.
export function markSize(): number {
  return FEEDBACK_TUNE.markSize;
}

// Whether a hit on the soldier may throw its spark now. `lastAt` is the clock when it last sparked, null for never; a
// second hit inside sparkGap keeps quiet, so a machine gun's sweep does not fill the screen.
export function sparkReady(lastAt: number | null, now: number): boolean {
  return lastAt === null || now - lastAt >= FEEDBACK_TUNE.sparkGap;
}
