// The pure side of layout D (SB-2155, revised SB-2157): the shares, shades and angles that the aim mark at the cursor
// shows, without the DOM or three. The sizes come from data/tune.ts's HUD_RING_TUNE; the colours from HUD_COLOR. A test
// can fix every boundary here without a page.
import { HUD_COLOR } from '../data/colors.ts';

export type AmmoTier = 'quiet' | 'warn' | 'empty';
export type ArmorStage = 'high' | 'mid' | 'low';

export interface AmmoLine {
  main: string; // "M120"
  sub: string; // "S8"
}

// The share of a magazine that is left, clamped to 0-1. A magazine with no maximum is treated as empty.
function share(ammo: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, ammo / max));
}

// How far a gauge's arc opens, in degrees: nothing at no rounds and `maxDeg` at a full gauge, with the ends cut.
export function gaugeSweep(ratio: number, maxDeg: number): number {
  return Math.max(0, Math.min(1, ratio)) * Math.max(0, maxDeg);
}

// How hard a number should read: quiet in the ordinary case, warn at a quarter of a magazine or less (the boundary
// counts as warn), and empty at no rounds.
export function ammoTier(ammo: number, max: number, warnShare: number): AmmoTier {
  if (ammo <= 0) return 'empty';
  return share(ammo, max) <= warnShare ? 'warn' : 'quiet';
}

// The one line of ammo under the aim mark: the main count wears an M, the sub count an S. Rounds are counted, so a
// fraction or a negative never reaches the line.
export function ammoLine(main: number, sub: number): AmmoLine {
  return { main: `M${Math.max(0, Math.round(main))}`, sub: `S${Math.max(0, Math.round(sub))}` };
}

// The aim mark's colour: the lock colour while the aim is pulled toward a target, the ring colour otherwise.
export function reticleColor(locked: boolean): string {
  return locked ? HUD_COLOR.lock : HUD_COLOR.ring;
}

// The armour's three shades. The boundary values belong to the lower shade, so a half armour is mid and just under
// `lowFrom` is low.
export function armorStage(ratio: number, midFrom: number, lowFrom: number): ArmorStage {
  if (ratio > midFrom) return 'high';
  if (ratio > lowFrom) return 'mid';
  return 'low';
}

export function armorColor(stage: ArmorStage): string {
  if (stage === 'high') return HUD_COLOR.armorHigh;
  if (stage === 'mid') return HUD_COLOR.armorMid;
  return HUD_COLOR.armorLow;
}

// The boost arc's opacity: thin while the gauge is full, clear as soon as any of it is spent. The full value is the
// boundary itself, so 0.999 of a gauge already reads as spent.
export function boostOpacity(ratio: number, fullOpacity: number, lowOpacity: number): number {
  return ratio >= 1 ? fullOpacity : lowOpacity;
}

// The armour arc's flash after a hit: 1 at the hit, 0 once `seconds` have passed, and 1 again for a negative time (a hit
// in the frame that is only now drawn).
export function hitGlow(elapsed: number, seconds: number): number {
  if (seconds <= 0) return 0;
  if (elapsed <= 0) return 1;
  if (elapsed >= seconds) return 0;
  return 1 - elapsed / seconds;
}
