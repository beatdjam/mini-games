// The script's assist (SB-1840): the cover mechs that lived through the first half stand at the fortress's sea gate and
// shoot one enemy of the waves the script names every interval. It takes the enemy's health to 0 and nothing else: no hit
// box, no health of its own, no change to the enemies' aim. Pure functions over the state and the enemies the game hands
// in (GameModel is not imported: game.ts imports this file), so a node test can run them. +z is the sea.
import { distXZ } from '@engine/core/index.ts';
import type { GroundSpot } from '../data/types.ts';

export interface AssistState {
  waves: string[]; // the waves the allies shoot at, copied from the script so the state stands alone
  left: number; // the seconds until the next shot (s); 0 or less shoots this frame
}

// What the assist needs to know of one enemy.
export interface AssistFoe {
  id: string;
  wave: string;
  hp: number;
  x: number;
  z: number;
  y: number;
}

// An assist that has not shot yet. The game fills `left` from the interval its flag asks for.
export function newAssist(waves: readonly string[]): AssistState {
  return { waves: [...waves], left: 0 };
}

// Counts the interval down by `dt`; when it runs out, picks the living enemy of the named waves that stands on the ground
// (an enemy still falling in from a wall is left alone: a shot would not match where it lands) and is nearest `from`, and
// gives back its id and place. With no such enemy nothing is picked. Either way the wait goes back to `every`.
export function stepAssist(
  state: AssistState,
  enemies: readonly AssistFoe[],
  from: GroundSpot,
  every: number,
  dt: number,
): { id: string; x: number; z: number } | null {
  state.left -= dt;
  if (state.left > 0) return null;
  state.left = every;
  let pick: AssistFoe | null = null;
  let best = Infinity;
  for (const enemy of enemies) {
    if (enemy.hp <= 0 || enemy.y > 0) continue;
    if (!state.waves.includes(enemy.wave)) continue;
    const dist = distXZ(from, enemy);
    if (dist >= best) continue;
    best = dist;
    pick = enemy;
  }
  return pick === null ? null : { id: pick.id, x: pick.x, z: pick.z };
}
