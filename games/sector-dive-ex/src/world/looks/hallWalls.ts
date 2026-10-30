import type { RoomFloors, RoomWalls } from './common.ts';
// The walls and floors of a sector's boss room (hall.ts): the hall's pictures are numbered after the sector's own, so
// a sector only says how many pictures it has and how the hall's are weighted. `wall(n)` is the number of the hall's
// wall picture n (0 is the first), for the lists the hall's props use (hallProps.ts).
export interface HallWallNumbers {
  roomWalls: RoomWalls;
  roomFloors: RoomFloors;
  all: number; // every wall picture of the look
  wall: (n: number) => number;
}
export function hallWallNumbers(h: {
  first: number; // the number the hall's first wall picture gets (the sector has 0 .. first - 1)
  walls: number; // how many wall pictures the hall has
  map: number[]; // the hall's walls as the weighted list (RoomWalls.hall): picture n of them
  floors: number; // how many floor pictures the sector has (the hall's come after them)
  hallFloors: number; // how many floor pictures the hall has
}): HallWallNumbers {
  const { first, walls, map, floors, hallFloors } = h;
  return {
    roomWalls: {
      plain: first,
      common: Array.from({ length: first }, (_, n) => n),
      shops: [],
      ground: [],
      fronts: [],
      hall: map.map(n => first + n),
    },
    roomFloors: {
      plain: floors,
      shops: [],
      hall: Array.from({ length: hallFloors }, (_, n) => floors + n),
    },
    all: first + walls,
    wall: n => first + n,
  };
}
