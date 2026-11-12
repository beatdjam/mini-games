// The briefing's map and clock (SB-310), pure: the marks are made from the map, and which line is out and which symbol
// shows at a time is read from the table. No DOM and no three.
import {
  BRIEFING_TARGET_SYMBOL,
  BRIEFING_TERRAIN_KINDS,
  BRIEFING_TUNE,
  M1_BRIEFING_SQUAD_WAVE,
} from '../data/briefings.ts';
import type {
  BriefingLine,
  BriefingSymbol,
  GroundSpot,
  MapBounds,
  MapDef,
  PropKind,
  TargetKind,
} from '../data/types.ts';

// One mark on the briefing's map. site: a target of the map (`target` says which kind); dot: a place a wave comes in;
// arrow: the points of a way, in order, from its tail to its head.
export interface BriefingMark {
  symbol: BriefingSymbol;
  shape: 'site' | 'dot' | 'arrow';
  target?: TargetKind; // site only
  points: readonly GroundSpot[]; // site and dot: one point
}

export interface BriefingTerrainDot {
  kind: PropKind;
  x: number;
  z: number;
}

export interface BriefingMap {
  bounds: MapBounds; // the map's bounds with the sea at the front edge (maxZ) added
  terrain: BriefingTerrainDot[];
  marks: BriefingMark[];
}

// The map's marks: a site for each target, a dot for each place the squad's wave comes in, and the two arrows. The first
// wave's arrow is `path` (the way the ally runs along the beach) with a tail out in the sea; the second wave's arrow
// follows the first's first points, shifted aside.
export function briefingMap(map: MapDef, path: readonly GroundSpot[]): BriefingMap {
  const marks: BriefingMark[] = [];
  for (const target of map.targets) {
    marks.push({
      symbol: BRIEFING_TARGET_SYMBOL[target.kind],
      shape: 'site',
      target: target.kind,
      points: [{ x: target.x, z: target.z }],
    });
  }
  const squad = map.spawns[M1_BRIEFING_SQUAD_WAVE];
  if (!squad) throw new Error(`the map ${map.id} has no wave ${M1_BRIEFING_SQUAD_WAVE}`);
  for (const spot of squad) marks.push({ symbol: 'squad', shape: 'dot', points: [{ x: spot.x, z: spot.z }] });
  const first = path[0];
  if (!first) throw new Error('the briefing has no way for the first wave');
  const tail = { x: first.x, z: map.bounds.maxZ + BRIEFING_TUNE.waveStartGap };
  const wave1 = [tail, ...path];
  const wave2 = wave1
    .slice(0, BRIEFING_TUNE.wave2Points)
    .map(spot => ({ x: spot.x + BRIEFING_TUNE.wave2ShiftX, z: spot.z }));
  marks.push({ symbol: 'wave1', shape: 'arrow', points: wave1 });
  marks.push({ symbol: 'wave2', shape: 'arrow', points: wave2 });
  const terrain = map.props
    .filter(prop => BRIEFING_TERRAIN_KINDS.includes(prop.kind))
    .map(prop => ({ kind: prop.kind, x: prop.x, z: prop.z }));
  return { bounds: { ...map.bounds, maxZ: map.bounds.maxZ + BRIEFING_TUNE.seaMargin }, terrain, marks };
}

// How many lines are out at `time` (s).
export function linesOut(lines: readonly BriefingLine[], time: number): number {
  return lines.filter(line => line.at <= time).length;
}

// The time of the next line after `out` lines, or null when all are out.
export function nextLineAt(lines: readonly BriefingLine[], out: number): number | null {
  return lines[out]?.at ?? null;
}

// A symbol at `time`: whether it is out, when it came (s), and whether the latest line brought it (it blinks then).
export interface SymbolState {
  shown: boolean;
  since: number;
  latest: boolean;
}

export function symbolState(lines: readonly BriefingLine[], time: number, symbol: BriefingSymbol): SymbolState {
  const out = linesOut(lines, time);
  const came = lines.slice(0, out).filter(line => line.show.includes(symbol));
  const first = came[0];
  if (!first) return { shown: false, since: 0, latest: false };
  return { shown: true, since: first.at, latest: lines[out - 1]?.show.includes(symbol) === true };
}
