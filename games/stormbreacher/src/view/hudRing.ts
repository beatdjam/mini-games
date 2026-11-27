// The pure side of the aim marks (SB-2155, revised SB-2157 and SB-2158, shared by layouts D-F in SB-2159): the shares,
// shades, cells, angles and blink that the mark at the cursor shows, without the DOM or three. The sizes come from
// data/tune.ts's HUD_RING_TUNE; the colours from HUD_COLOR. A test can fix every boundary here without a page.
import { HUD_COLOR } from '../data/colors.ts';

export type AmmoTier = 'quiet' | 'warn' | 'empty';
export type ArmorStage = 'high' | 'mid' | 'low';

// The share of a magazine that is left, clamped to 0-1. A magazine with no maximum is treated as empty.
export function ammoShare(ammo: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, ammo / max));
}

// How far a gauge's arc opens, in degrees: nothing at no rounds and `maxDeg` at a full gauge, with the ends cut.
export function gaugeSweep(ratio: number, maxDeg: number): number {
  return Math.max(0, Math.min(1, ratio)) * Math.max(0, maxDeg);
}

// How hard a bar should read: quiet in the ordinary case, warn at a quarter of a magazine or less (the boundary counts
// as warn), and empty at no rounds.
export function ammoTier(ammo: number, max: number, warnShare: number): AmmoTier {
  if (ammo <= 0) return 'empty';
  return ammoShare(ammo, max) <= warnShare ? 'warn' : 'quiet';
}

// The bar's colour for its tier: the gauges' cyan while quiet, amber at a quarter, the warning red when empty.
export function ammoColor(tier: AmmoTier): string {
  if (tier === 'quiet') return HUD_COLOR.bar;
  if (tier === 'warn') return HUD_COLOR.amber;
  return HUD_COLOR.warn;
}

// How many cells a full magazine draws in the sub bar: one a round up to `maxSegments`, or 0 when the magazine is
// fuller than that (the bar then shows its share as one length instead of cells).
export function ammoCells(max: number, maxSegments: number): number {
  const count = Math.max(0, Math.round(max));
  return count <= maxSegments ? count : 0;
}

// How many of those cells the rounds left light. In the one-length case (no cells) it is 0; the caller uses the share.
export function ammoFilled(ammo: number, max: number, maxSegments: number): number {
  const cells = ammoCells(max, maxSegments);
  if (cells <= 0) return 0;
  return Math.min(cells, Math.max(0, Math.round(ammo)));
}

// An empty bar's blink: 1 at the start, 0 half a cycle later and 1 again on the next cycle, so the red comes and goes.
export function ammoBlink(elapsed: number, hz: number): number {
  if (hz <= 0) return 1;
  return (Math.cos(elapsed * hz * Math.PI * 2) + 1) / 2;
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

// The gauges that can stand in any of the mark's places (SB-2159): an arc at the aim mark's side or a bar over or under
// it. Which gauge goes where is the layout's business; how a gauge reads stays with its kind.
export type GaugeKind = 'armor' | 'boost' | 'main' | 'sub';

export interface GaugeValues {
  armor: number; // 0-1
  boost: number; // 0-1
  main: number; // rounds left
  mainMax: number; // a full magazine
  sub: number; // rounds left
  subMax: number; // a full magazine
  mainTier: AmmoTier;
  subTier: AmmoTier;
  glow: number; // the armour's flash, 0-1
}

export interface GaugeStyle {
  armorMid: number;
  armorLow: number;
  armorOpacity: number;
  boostFullOpacity: number;
  boostLowOpacity: number;
  maxSegments: number;
}

// How one gauge should read, whatever shape it takes: its share of the whole, its colour, its opacity, and (for a sub
// gauge) how many cells make a full magazine and how many of them are lit. The rules belong to the kind, so the armour's
// shades and glow, the boost's thin full gauge, and the ammo's warn and empty colours do not change with the place.
export interface GaugeReading {
  ratio: number; // 0-1, the length a one-length gauge fills
  color: string;
  opacity: number; // 0-1
  cells: number; // 0 for one length, otherwise how many cells a full magazine has
  filled: number; // the lit cells; 0 when there are no cells
  empty: boolean; // an empty ammo gauge reddens its track and blinks
}

export function gaugeReading(kind: GaugeKind, values: GaugeValues, style: GaugeStyle): GaugeReading {
  if (kind === 'armor') {
    const ratio = Math.max(0, Math.min(1, values.armor));
    return {
      ratio,
      color: armorColor(armorStage(ratio, style.armorMid, style.armorLow)),
      opacity: Math.min(1, style.armorOpacity + (1 - style.armorOpacity) * Math.max(0, values.glow)),
      cells: 0,
      filled: 0,
      empty: false,
    };
  }
  if (kind === 'boost') {
    const ratio = Math.max(0, Math.min(1, values.boost));
    return {
      ratio,
      color: HUD_COLOR.bar,
      opacity: boostOpacity(ratio, style.boostFullOpacity, style.boostLowOpacity),
      cells: 0,
      filled: 0,
      empty: false,
    };
  }
  if (kind === 'main') {
    return {
      ratio: ammoShare(values.main, values.mainMax),
      color: ammoColor(values.mainTier),
      opacity: 1,
      cells: 0,
      filled: 0,
      empty: values.mainTier === 'empty',
    };
  }
  return {
    ratio: ammoShare(values.sub, values.subMax),
    color: ammoColor(values.subTier),
    opacity: 1,
    cells: ammoCells(values.subMax, style.maxSegments),
    filled: ammoFilled(values.sub, values.subMax, style.maxSegments),
    empty: values.subTier === 'empty',
  };
}
