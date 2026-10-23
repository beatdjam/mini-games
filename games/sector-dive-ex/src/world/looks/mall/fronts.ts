import * as THREE from 'three';
import { SIDE_STEP } from '@engine/world/tiles.ts';
import { MALL_SHOP_NAMES } from '../../../i18n/signs.ts';
import type { FloorPlan } from '../../building.ts';
import { roomBeside, roomKindOf, wallFloor } from '../common.ts';
import { SIGN_FONT, canvasTex } from '../paint.ts';
import { BRASS, SHOP_SIGNS } from './shared.ts';
// The name boards of the mall's shops (props): one for each shop room, on the wall of its longest front along the
// concourse, at the middle of it. The wall pictures there have a plain band in the shop's colour for it. The pictures
// of the boards are made once for each name.
// ---- tuning numbers used only here ----
const BOARD_PX = [384, 64] as const; // the picture of a board (px)
const WORDS_COLOR = '#cdbd8e';

export interface Front {
  i: number; // the corridor tile the board is seen from
  j: number;
  side: number; // the side of that tile the wall is on
  kind: number;
  name: string;
}
// the shop rooms' fronts on the floor, one for each room: kind, name, and where
export function shopFronts(plan: FloorPlan): Front[] {
  const { W, H, maps: M } = plan.gen,
    floor = wallFloor.get(M.grid) ?? 0,
    // for each (room, side, line) the corridor tiles along it, by their place along the line
    runs = new Map<string, { room: number; side: number; along: [number, number, number][] }>();
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      if (M.grid[k] !== 1 || M.roomOf[k]! >= 0 || M.hgt[k] !== 0 || M.ramp[k]! >= 0 || M.cover[k] || plan.noFloor[k])
        continue;
      SIDE_STEP.forEach(([di, dj], side) => {
        const wall = k + dj! * W + di!;
        if (M.grid[wall] === 1 || plan.voids[wall]) return;
        const room = roomBeside({ W, maps: M }, wall);
        if (roomKindOf(M.grid, room) < 0) return;
        const along = di !== 0 ? j : i,
          line = `${room}|${side}|${di !== 0 ? i : j}`,
          run = runs.get(line) ?? runs.set(line, { room, side, along: [] }).get(line)!;
        run.along.push([along, i, j]);
      });
    }
  // the longest stretch of unbroken tiles of each room
  const best = new Map<number, { len: number; mid: [number, number]; side: number }>();
  for (const { room, side, along } of runs.values()) {
    along.sort((a, b) => a[0] - b[0]);
    let from = 0;
    for (let n = 1; n <= along.length; n++) {
      if (n < along.length && along[n]![0] === along[n - 1]![0] + 1) continue;
      const len = n - from,
        mid = along[from + Math.floor((len - 1) / 2)]!,
        had = best.get(room);
      if (!had || len > had.len) best.set(room, { len, mid: [mid[1], mid[2]], side });
      from = n;
    }
  }
  return [...best].map(([room, { mid, side }]) => {
    const kind = roomKindOf(M.grid, room),
      names = MALL_SHOP_NAMES[kind]!;
    return {
      i: mid[0],
      j: mid[1],
      side,
      kind,
      name: names[
        Math.floor(((Math.imul(room * 2971 + floor * 55511 + 3, 3266489917) >>> 0) / 4294967296) * names.length)
      ]!,
    };
  });
}

const boards = new Map<string, THREE.CanvasTexture>();
// the board of a shop: the kind's colour, a brass rim, the name
export function boardTex(kind: number, name: string): THREE.CanvasTexture {
  const key = `${kind}|${name}`;
  let tex = boards.get(key);
  if (!tex) {
    tex = canvasTex(BOARD_PX[0], BOARD_PX[1], g => {
      g.fillStyle = SHOP_SIGNS[kind]!;
      g.fillRect(0, 0, BOARD_PX[0], BOARD_PX[1]);
      g.strokeStyle = BRASS;
      g.lineWidth = 4;
      g.strokeRect(4, 4, BOARD_PX[0] - 8, BOARD_PX[1] - 8);
      g.fillStyle = WORDS_COLOR;
      g.font = `700 36px ${SIGN_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(name, BOARD_PX[0] / 2, BOARD_PX[1] / 2 + 2, BOARD_PX[0] - 30);
    });
    boards.set(key, tex);
  }
  return tex;
}
