import { wallFloor } from '../common.ts';
import type { FloorPlan } from '../../building.ts';
import { SHOP_KINDS } from './shared.ts';
// Which kind of room each room of a mall floor is (Look.roomKinds): a kind of shop (the order of MALL_SHOP_NAMES), the
// food court, or none. The food court is the biggest room of the floor that is big enough; the start room, the boss
// room and the atrium are no shops. The other rooms draw a kind of shop from their number and their floor.
export const KIND_FOOD = SHOP_KINDS - 1;
const FOOD_MIN_AREA = 48; // tiles: a room this big or bigger can be the food court
// the kinds a room may draw (all but the food court)
const DRAWN = SHOP_KINDS - 1;

export function mallRoomKinds(plan: FloorPlan): number[] {
  const d = plan.gen,
    floor = wallFloor.get(d.maps.grid) ?? 0,
    none = new Set<number>([d.startIdx]);
  if (plan.hall) none.add(plan.hall.room);
  if (plan.court?.ground) none.add(d.maps.roomOf[plan.court.tiles[0]!]!);
  let food = -1;
  d.rooms.forEach((r, n) => {
    if (!none.has(n) && r.w * r.h >= FOOD_MIN_AREA && (food < 0 || r.w * r.h > d.rooms[food]!.w * d.rooms[food]!.h))
      food = n;
  });
  return d.rooms.map((_, n) => {
    if (none.has(n)) return -1;
    if (n === food) return KIND_FOOD;
    return Math.floor(((Math.imul(n * 7919 + floor * 104729 + 1, 2246822519) >>> 0) / 4294967296) * DRAWN);
  });
}
