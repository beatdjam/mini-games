import { wallFloor } from '../common.ts';
import type { FloorPlan } from '../../building.ts';
import { KIND_EXAM, KIND_LAB, KIND_LINEN, KIND_PHARMACY, KIND_WAITING, KIND_WARD } from './shared.ts';
// Which kind of room each room of a hospital floor is (Look.roomKinds): a ward, a consulting room, an examination
// room, the pharmacy, a linen room or store, the waiting hall, or none. The waiting hall is the biggest room of the
// floor that is big enough; the start room, the boss room (the operating theatre) and the light well's room are none of
// these. The other rooms draw a kind from their number and their floor, most of them wards. A room with a deck in it is
// not the waiting hall.
const WAITING_MIN_AREA = 48; // tiles: a room this big or bigger can be the waiting hall
// the share of the other rooms that each kind has, in the order of the kinds (they add up to 1)
const DRAWN_SHARES: [number, number][] = [
  [KIND_WARD, 0.46],
  [KIND_EXAM, 0.2],
  [KIND_LAB, 0.12],
  [KIND_PHARMACY, 0.1],
  [KIND_LINEN, 0.12],
];

// the rooms that are no hospital rooms of a kind
function noKinds(plan: FloorPlan): Set<number> {
  const d = plan.gen,
    none = new Set<number>([d.startIdx]);
  if (plan.hall) none.add(plan.hall.room);
  if (plan.court?.ground) none.add(d.maps.roomOf[plan.court.tiles[0]!]!);
  return none;
}
// the waiting hall's room of a floor (-1 = none)
export function waitingRoom(plan: FloorPlan): number {
  const d = plan.gen,
    none = noKinds(plan);
  let hall = -1;
  d.rooms.forEach((r, n) => {
    if (
      !none.has(n) &&
      !r.plat &&
      r.w * r.h >= WAITING_MIN_AREA &&
      (hall < 0 || r.w * r.h > d.rooms[hall]!.w * d.rooms[hall]!.h)
    )
      hall = n;
  });
  return hall;
}

export function hospRoomKinds(plan: FloorPlan): number[] {
  const d = plan.gen,
    floor = wallFloor.get(d.maps.grid) ?? 0,
    none = noKinds(plan),
    waiting = waitingRoom(plan);
  return d.rooms.map((_, n) => {
    if (none.has(n)) return -1;
    if (n === waiting) return KIND_WAITING;
    let u = (Math.imul(n * 7919 + floor * 104729 + 1, 2246822519) >>> 0) / 4294967296;
    for (const [kind, share] of DRAWN_SHARES) {
      if (u < share) return kind;
      u -= share;
    }
    return KIND_WARD;
  });
}
