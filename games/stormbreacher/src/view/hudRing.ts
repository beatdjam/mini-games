// The pure side of layout D (SB-2155): the shares and angles that the reticle's ring and the mech's ground ring show,
// without the DOM or three. The sizes come from data/tune.ts's HUD_RING_TUNE; the colours from HUD_COLOR. A test can fix
// every boundary here without a page.
import { HUD_COLOR } from '../data/colors.ts';

export type AmmoTier = 'quiet' | 'warn' | 'empty';
export type ArmorStage = 'high' | 'mid' | 'low';

export interface SubDots {
  lit: number; // the dots that stand for the rounds left
  count: number; // the dots drawn round the ring
}

// The share of a magazine that is left, clamped to 0-1. A magazine with no maximum is treated as empty.
function share(ammo: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, ammo / max));
}

// The main ammo's arc round the ring, in degrees: 0 at no rounds, a full turn at a full magazine, and the ends cut.
export function arcSweep(ratio: number): number {
  return Math.max(0, Math.min(1, ratio)) * 360;
}

// The sub ammo's dots. A magazine no larger than the ring's room gets one dot a round. A larger one is thinned to
// `maxDots` by share; a round still left always lights at least one dot, so an almost empty gun does not read as empty.
export function subDots(ammo: number, max: number, maxDots: number): SubDots {
  if (maxDots <= 0 || max <= 0) return { lit: 0, count: 0 };
  if (max <= maxDots) return { lit: Math.max(0, Math.min(max, ammo)), count: max };
  if (ammo <= 0) return { lit: 0, count: maxDots };
  const lit = Math.max(1, Math.min(maxDots, Math.round(share(ammo, max) * maxDots)));
  return { lit, count: maxDots };
}

// How hard the numbers should read: quiet in the ordinary case, warn at a quarter of a magazine or less (the boundary
// counts as warn), and empty at no rounds.
export function ammoTier(ammo: number, max: number, warnShare: number): AmmoTier {
  if (ammo <= 0) return 'empty';
  return share(ammo, max) <= warnShare ? 'warn' : 'quiet';
}

// The reticle ring's radius and colour: it draws in and takes the lock colour while the aim is pulled toward a target.
export function reticleRing(locked: boolean, radius: number, lockRadius: number): { radius: number; color: string } {
  return {
    radius: locked ? lockRadius : radius,
    color: locked ? HUD_COLOR.lock : HUD_COLOR.ring,
  };
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

// The boost half's opacity: thin while the gauge is full, clear as soon as any of it is spent. The full value is the
// boundary itself, so 0.999 of a gauge already reads as spent.
export function boostOpacity(ratio: number, fullOpacity: number, lowOpacity: number): number {
  return ratio >= 1 ? fullOpacity : lowOpacity;
}

// The left and right halves' middle angles in the ring geometry's own theta (0 at the world's +x, growing toward -z
// after RingGeometry's rotateX(-PI/2)). The left half is the screen's left: the camera looks along `azimuth`, whose
// screen top is (-sin, -cos) on the ground, so the screen's left is (+upZ, -upX). In this theta that is `azimuth + PI`;
// the right half is the opposite. The mech's own yaw is not in the sum, so the halves stay put while it turns.
export function groundHalves(azimuth: number): { left: number; right: number } {
  const turn = Math.PI * 2;
  const wrap = (angle: number): number => ((angle % turn) + turn) % turn;
  return { left: wrap(azimuth + Math.PI), right: wrap(azimuth) };
}

// The armour half's flash after a hit: 1 at the hit, 0 once `seconds` have passed, and 1 again for a negative time (a hit
// in the frame that is only now drawn).
export function hitGlow(elapsed: number, seconds: number): number {
  if (seconds <= 0) return 0;
  if (elapsed <= 0) return 1;
  if (elapsed >= seconds) return 0;
  return 1 - elapsed / seconds;
}
