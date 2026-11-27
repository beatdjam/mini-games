// The enemies the front keeps putting out while a sector is not secured (SB-2230): one at a time, out of sight of the
// overview camera and inland of the front sector's land-side edge, up to a budget for each sector. The values are
// provisional, to be settled by eye in the sortie.
import type { EnemyKind } from './enemies.ts';

// The wave name of the trickle. It is not one of the mission's waves, so the script's `cleared` never waits on it.
export const TRICKLE_WAVE = 'trickle';

export const TRICKLE_TUNE = {
  kind: 'grunt' as EnemyKind, // the enemy the trickle puts out (the counterattack's kind, SB-2220)
  intervalMin: 1.1, // the shortest wait to the next enemy (s); the spike's values
  intervalMax: 1.9, // the longest wait to the next enemy (s)
  maxAlive: 11, // the most living infantry on the field at once, the script's own counted (soldiers); the spike's cap
  minDist: 40, // how far from the mech an enemy comes out, at least (m); the spike's 170 px at 0.2375 m/px
  spawnBack: 12, // how far inland of the front sector's land-side edge the spawn band starts (m)
  spawnDepth: 60, // how far further inland the spawn band runs (m)
  spawnSpread: 60, // half the x spread of the spawn points (m)
  tries: 8, // how many points are tried before the frame gives up (points); the spike's count
  retryT: 0.5, // the wait after no point was found (s)
  viewAspect: 16 / 9, // the screen's aspect the ground view is worked out for
  viewMargin: 8, // how far outside that view a point still counts as out of sight (m)
  fallenKeep: 10, // how long a fallen trickle enemy stays in the list before it is taken out (s)
};
