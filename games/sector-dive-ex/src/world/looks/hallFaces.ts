import { SIDE_STEP } from '@engine/world/tiles.ts';
import type { FloorPlan } from '../building.ts';
import type { PropTools, WallSlot } from './props.ts';
// The walls of a sector's boss room, found for the props that stand along them (mall/dockProps.ts, forge/hallProps.ts,
// data/hallProps.ts): every face of a wall that looks into the room, the picture on it, and which tiles of the floor
// have nothing special about them.
// a wall face of the boss room: the floor tile and the side its wall is on; `edge`: the wall is the room's own (not a pillar's)
export type HallFace = WallSlot & { side: number; edge: boolean };
export interface HallSurround {
  room: PropTools['d']['rooms'][number];
  // a tile of the room with nothing special about its floor: no deck, ramp, cover, hole
  plain: (k: number) => boolean;
  // the faces that nothing stands by a door of (it would be in the doorway), the room's walls and pillars' alike
  open: HallFace[];
  // the picture on the wall of a face (`pictureAt`: the picture of a wall tile)
  pictureOf: (f: WallSlot) => number;
}
export function hallSurround(plan: FloorPlan, d: PropTools['d'], pictureAt: (wall: number) => number): HallSurround {
  const hallRoom = plan.hall!.room,
    room = d.rooms[hallRoom]!,
    inside = (i: number, j: number): boolean =>
      i >= room.x && i < room.x + room.w && j >= room.y && j < room.y + room.h,
    plain = (k: number): boolean =>
      d.maps.grid[k] === 1 &&
      d.maps.roomOf[k] === hallRoom &&
      d.maps.hgt[k] === 0 &&
      d.maps.ramp[k]! < 0 &&
      !d.maps.cover[k] &&
      !plan.noFloor[k],
    byDoor = (f: WallSlot): boolean =>
      [[0, 0], ...SIDE_STEP].some(([di, dj]) => !!d.maps.door?.[(f.j + dj!) * d.W + f.i + di!]),
    faces: HallFace[] = [];
  for (let j = room.y; j < room.y + room.h; j++)
    for (let i = room.x; i < room.x + room.w; i++) {
      if (!plain(j * d.W + i)) continue;
      SIDE_STEP.forEach(([di, dj], side) => {
        const wall = (j + dj) * d.W + i + di;
        if (!d.maps.grid[wall] && !plan.voids[wall]) faces.push({ i, j, side, edge: !inside(i + di, j + dj) });
      });
    }
  return {
    room,
    plain,
    open: faces.filter(f => !byDoor(f)),
    pictureOf: f => {
      const [di, dj] = SIDE_STEP[f.side ?? 0]!;
      return pictureAt((f.j + dj) * d.W + f.i + di);
    },
  };
}
