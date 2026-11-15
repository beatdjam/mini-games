// Which blast points show a light on screen, and how strongly (SB-2022). The view draws exactly these; the small map
// (hud.ts) uses `pillboxShot` for its marks. Pure: it reads the game and writes nothing.
import { distXZ } from '@engine/core/index.ts';
import { MARKER_TUNE, type MarkerMode } from '../data/marker.ts';
import { blastTarget, targetStands } from './blasts.ts';
import type { GameModel } from './game.ts';

export interface BlastMark {
  id: string;
  alpha: number; // 0..1: 1 far off, down to 0 once the mech is within the use reach
}

// Whether the pillbox has been shot at least once. Before that its points show no light and no mark on the small map.
export function pillboxShot(game: Pick<GameModel, 'pillboxes'>, target: string): boolean {
  return game.pillboxes.find(state => state.id === target)?.shot === true;
}

// The light of a point at distance `dist` from the mech (0..1).
export function markerAlpha(dist: number): number {
  const span = MARKER_TUNE.fadeStart - MARKER_TUNE.fadeEnd;
  if (span <= 0) return dist > MARKER_TUNE.fadeEnd ? 1 : 0;
  return Math.min(1, Math.max(0, (dist - MARKER_TUNE.fadeEnd) / span));
}

// A point that may show a light: not blown, no charge on it, its pillbox (if any) standing and shot once, and its line
// (if any) not yet opened by another point of the same line.
function eligible(game: GameModel, blast: GameModel['blasts'][number]): boolean {
  if (blast.blasted) return false;
  if (game.charges.some(charge => charge.blast === blast.id)) return false;
  if (!targetStands(blast, game)) return false;
  const target = blastTarget(game.map, blast.id);
  if (target !== undefined) return pillboxShot(game, target);
  return blast.line === null || !game.blasts.some(other => other.line === blast.line && other.blasted);
}

// The points that show a light this frame, by mode. A cutscene shows none, and `map` shows none.
export function blastMarks(game: GameModel, mode: MarkerMode): BlastMark[] {
  if (game.script.cutscene !== null || mode === 'map') return [];
  const points = game.blasts.filter(blast => eligible(game, blast));
  const lit = mode === 'dim' ? points : nextPoint(game, points);
  return lit.map(blast => ({ id: blast.id, alpha: markerAlpha(distXZ(blast, game.mech)) }));
}

// `next`: the one point to go to. Among the pillboxes still standing and already shot, the one nearer the mech gives its
// nearer point; the lines give their nearest point; the nearer of those two is it. A pillbox that falls moves it on.
function nextPoint(game: GameModel, points: readonly GameModel['blasts'][number][]): GameModel['blasts'][number][] {
  let best: GameModel['blasts'][number] | null = null;
  let bestDist = Infinity;
  const pillboxPoints = points.filter(blast => blastTarget(game.map, blast.id) !== undefined);
  let nearestBox: string | null = null;
  let nearestBoxDist = Infinity;
  for (const blast of pillboxPoints) {
    const target = blastTarget(game.map, blast.id);
    const place = game.map.targets.find(entry => entry.id === target);
    if (!place) continue;
    const dist = distXZ(place, game.mech);
    if (dist < nearestBoxDist) {
      nearestBoxDist = dist;
      nearestBox = place.id;
    }
  }
  for (const blast of points) {
    const target = blastTarget(game.map, blast.id);
    if (target !== undefined && target !== nearestBox) continue;
    const dist = distXZ(blast, game.mech);
    if (dist < bestDist) {
      best = blast;
      bestDist = dist;
    }
  }
  return best === null ? [] : [best];
}
