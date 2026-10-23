import { COVER_H } from '@engine/world/tiles.ts';
import { sinkRect } from '@engine/world/dungeon.ts';
import type { FloorPlan } from '../../building.ts';
import { wallLinks } from '../common.ts';
import { foodCourtRoom } from './rooms.ts';
// The mall's food court is a sunk square (engine sinkRect): the room, but for a ground-level aisle along its walls, is
// two steps down, a plaza. Called by the building (world/building.ts) once the floor's rooms are laid out; it draws no
// random numbers. The tables stand on the plaza's floor (cover.ts); the floor and the steps are drawn by levelMesh.ts
const COURT_CLEAR = 2; // tiles round a courtyard's open middle that stay as they are

// sinks the food court of the floor; returns the sunk tiles (none: a floor with no food court)
export function sinkFoodCourt(plan: FloorPlan): number[] {
  const room = foodCourtRoom(plan);
  if (room < 0) return [];
  const { W, maps } = plan.gen,
    strips = wallLinks.get(maps.grid)?.strips,
    near = new Set<number>();
  // (an atrium's or galleria's gallery and middle, and a stairwell's or lift's tiles, stay as they are)
  plan.court?.tiles.forEach(k => {
    for (let dj = -COURT_CLEAR; dj <= COURT_CLEAR; dj++)
      for (let di = -COURT_CLEAR; di <= COURT_CLEAR; di++) near.add(k + dj * W + di);
  });
  return sinkRect(
    maps,
    W,
    plan.gen.rooms[room]!,
    k =>
      !!plan.gen.hazard[k] ||
      !!plan.voids[k] ||
      !!plan.noFloor[k] ||
      !!plan.shaft[k] ||
      !!strips?.has(k) ||
      near.has(k),
    COVER_H,
  );
}
