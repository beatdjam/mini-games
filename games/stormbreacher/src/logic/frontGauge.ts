// The front gauge (SB-2270, SB-2281): the whole M1 front as one line from the sea's edge to the magazine, with the
// sectors' states and the mech's and the front's places on it. Pure, so a node test reads it; no three and no DOM.
import type { Sector } from '../data/sectors.ts';
import type { SectorPhase } from './sectors.ts';

// A sector's fill on the gauge: the enemy's land, a secured sector (its counterattack not yet withstood), or a stable one.
export type GaugeFill = 'enemy' | 'secured' | 'stable';

// How far inland of the front the mech stands: within the infantry's cover, past the warning mark, or isolated.
export type Isolation = 'near' | 'warn' | 'isolated';

export interface SectorFill {
  from: number; // 0 at the sea's edge, 1 at the last sector's land side
  to: number;
  fill: GaugeFill;
}

export interface IsolationTune {
  warnGap: number; // m inland of the front where the mark starts to change colour
  isolatedGap: number; // m inland of the front where the support fire can no longer reach
}

// The gauge's two ends: the first sector's sea-side edge and the last one's land-side edge. The sectors run front to back,
// so the first is the seaward-most.
export function gaugeSpan(sectors: readonly Sector[]): { fromZ: number; toZ: number } {
  const first = sectors[0];
  const last = sectors[sectors.length - 1];
  return { fromZ: first === undefined ? 0 : first.seaZ, toZ: last === undefined ? 0 : last.landZ };
}

// The place of z on the gauge: 0 at the sea's edge, 1 at the land side. A z outside the span is kept at the nearer end.
export function gaugeRatio(z: number, fromZ: number, toZ: number): number {
  const span = fromZ - toZ;
  const ratio = span === 0 ? 0 : (fromZ - z) / span;
  return Math.min(1, Math.max(0, ratio));
}

// The fill a sector's phase gives: still the enemy's land until it is secured, secured until its counterattack is
// withstood, then stable. `secured` itself does not last a frame (stepSectors moves it on), but a test may set it.
function fillOf(phase: SectorPhase): GaugeFill {
  if (phase === 'secured' || phase === 'counter') return 'secured';
  if (phase === 'stable') return 'stable';
  return 'enemy';
}

// One fill a sector, front to back, each with its sea-side and land-side places on the gauge. The sectors' own ends give
// the gauge's span, so the widths keep their share of the whole front (the eleven sectors' own widths over 425 m in M1).
export function sectorFills(phases: readonly SectorPhase[], sectors: readonly Sector[]): SectorFill[] {
  const { fromZ, toZ } = gaugeSpan(sectors);
  return sectors.map((sector, i) => ({
    from: gaugeRatio(sector.seaZ, fromZ, toZ),
    to: gaugeRatio(sector.landZ, fromZ, toZ),
    fill: fillOf(phases[i]),
  }));
}

// How far inland of the front the mech stands. Seaward of the front, or less than `warnGap` past it, it has the
// infantry's cover; from `isolatedGap` on it is out of the support fire's reach.
export function isolation(mechZ: number, holdZ: number, tune: IsolationTune): Isolation {
  const gap = holdZ - mechZ;
  if (gap < tune.warnGap) return 'near';
  if (gap >= tune.isolatedGap) return 'isolated';
  return 'warn';
}
