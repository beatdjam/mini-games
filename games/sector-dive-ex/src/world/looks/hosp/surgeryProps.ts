import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { SIDE_STEP, tileCenter } from '@engine/world/tiles.ts';
import { HALL_H } from '../../../data/level.ts';
import type { FloorPlan } from '../../building.ts';
import { canvasTex } from '../paint.ts';
import { facing, onWall, pose } from '../props.ts';
import type { Light, PropTools, WallSlot } from '../props.ts';
// What stands in the hospital's operating theatre (its boss room), all of it for the eye: it has no body in the tile world,
// and all of it stays close to the walls (under a metre out) or hangs high, so nothing is in the way of the fight. Along
// the walls: instrument trolleys with their trays, an anaesthetic machine, the operating table pushed against a wall
// with its pad and its drape, pairs of drip stands. High up: two surgical lamps (big discs with a ring of lights, on jointed
// arms from the ceiling) over two of the corners; the middle of the ceiling is left clear for the boss that hangs there
// (SURGEON, to come). On the floor, in front of the clerestory windows, the evening sun in patches.
// ---- tuning numbers used only here ----
const LAMP = { r: 1.15, y: 8.4, thick: 0.22, arm: 0.12, share: 0.24, color: 0xfff1d4, size: 2.8 }; // a surgical lamp: its disc, how high it hangs, where (a share of the room across from its corner), its pool of light
const SUN_PATCHES = 5; // patches of the evening sun on the floor
const SUN = { color: 0xffb46b, size: 3.2 };
const TABLE_CHANCE = 0.5; // of the faces along the walls, this many get the operating table (once or twice in the room)
const TROLLEY_CHANCE = 0.18;
const MACHINE_CHANCE = 0.12;
const STANDS_CHANCE = 0.14;
const STEEL = 0xa9b2ae;
const STEEL_DARK = 0x6a7470;
const PAD = 0x6fa7a3; // the table's pad: vinyl in blue-green
const DRAPE = 0xcfe0db; // the sheet over the table
const TOOLS = [0xd8dad1, 0x7b8f9a, 0xb9c3c0];
const MACHINE = 0xcfd4c8;
const SCREEN = 0x16201e;
const DRAWER = 0x8c968f;
const WHEEL = 0x23282c;
const BAG = 0xb8ced7;

type Face = WallSlot & { side: number; edge: boolean };
// the lamp's disc, from below: a pale rim, a ring of small lights round a bigger one in the middle
function discTex(): THREE.CanvasTexture {
  return canvasTex(128, 128, g => {
    g.fillStyle = '#c4cbc2';
    g.beginPath();
    g.arc(64, 64, 63, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#8f9992';
    g.beginPath();
    g.arc(64, 64, 55, 0, Math.PI * 2);
    g.fill();
    for (let n = 0; n < 12; n++) {
      const a = (n * Math.PI) / 6;
      g.fillStyle = '#f6efd2';
      g.beginPath();
      g.arc(64 + Math.cos(a) * 38, 64 + Math.sin(a) * 38, 8, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#e8dfb4';
      g.beginPath();
      g.arc(64 + Math.cos(a + 0.26) * 20, 64 + Math.sin(a + 0.26) * 20, 5, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#fffbea';
    g.beginPath();
    g.arc(64, 64, 11, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#b4bbb2';
    g.fillRect(60, 0, 8, 128);
  });
}
let disc: THREE.CanvasTexture | null = null;

export function surgeryProps(plan: FloorPlan, tools: Pick<PropTools, 'add' | 'd'>, rng: Rng, lights: Light[]) {
  if (!plan.hall) return;
  disc ??= discTex();
  const { add, d } = tools,
    room = d.rooms[plan.hall.room]!,
    inside = (i: number, j: number): boolean =>
      i >= room.x && i < room.x + room.w && j >= room.y && j < room.y + room.h,
    // (a tile of the room with nothing special about its floor: no deck, ramp, cover, hole)
    plain = (k: number): boolean =>
      d.maps.grid[k] === 1 &&
      d.maps.roomOf[k] === plan.hall!.room &&
      d.maps.hgt[k] === 0 &&
      d.maps.ramp[k]! < 0 &&
      !d.maps.cover[k] &&
      !plan.noFloor[k],
    // (nothing stands by a door: it would be in the doorway)
    byDoor = (f: WallSlot): boolean =>
      [[0, 0], ...SIDE_STEP].some(([di, dj]) => !!d.maps.door?.[(f.j + dj!) * d.W + f.i + di!]),
    faces: Face[] = [];
  for (let j = room.y; j < room.y + room.h; j++)
    for (let i = room.x; i < room.x + room.w; i++) {
      if (!plain(j * d.W + i)) continue;
      SIDE_STEP.forEach(([di, dj], side) => {
        const wall = (j + dj) * d.W + i + di;
        if (!d.maps.grid[wall] && !plan.voids[wall]) faces.push({ i, j, side, edge: !inside(i + di, j + dj) });
      });
    }
  const open = faces.filter(f => f.edge && !byDoor(f)),
    // the parts of everything, a list of boxes for each colour: (w along the wall, h high, deep from the wall) at `along`
    // from the middle of the face and `out` from the wall, its foot at y
    parts = new Map<number, THREE.Matrix4[]>(),
    put = (
      f: Face,
      turn: number,
      color: number,
      along: number,
      out: number,
      y: number,
      w: number,
      h: number,
      deep: number,
    ) => {
      (parts.get(color) ?? parts.set(color, []).get(color)!).push(
        pose(onWall(f, along, out, y + h / 2), turn, new THREE.Vector3(w, h, deep)),
      );
    };

  // ---- along the walls ----
  let tables = 0;
  for (const f of open) {
    const turn = facing(f),
      dice = rng.next();
    if (dice < TABLE_CHANCE && tables < 2 && (f.i + f.j) % 3 === 0) {
      // the operating table pushed against the wall: a base, a column, the top with its pad and a drape over the middle
      tables++;
      put(f, turn, STEEL_DARK, 0, 0.55, 0, 0.9, 0.08, 0.6);
      put(f, turn, STEEL, 0, 0.55, 0.08, 0.28, 0.7, 0.28);
      put(f, turn, STEEL, 0, 0.55, 0.78, 2.1, 0.08, 0.62);
      put(f, turn, PAD, 0, 0.55, 0.86, 2.0, 0.07, 0.54);
      put(f, turn, DRAPE, 0.1, 0.55, 0.93, 1.1, 0.05, 0.56);
      put(f, turn, STEEL, 1.15, 0.55, 0.9, 0.5, 0.04, 0.2);
    } else if (dice < TABLE_CHANCE + TROLLEY_CHANCE) {
      // an instrument trolley: two shelves on posts, casters, a tray of tools on the top, a green drape over a corner of it
      const along = rng.rand(-1.0, 1.0);
      put(f, turn, STEEL, along, 0.55, 0.78, 0.9, 0.04, 0.6);
      put(f, turn, STEEL, along, 0.55, 0.22, 0.9, 0.04, 0.6);
      for (const sx of [-0.42, 0.42])
        for (const sz of [-0.27, 0.27]) put(f, turn, STEEL_DARK, along + sx, 0.55 + sz, 0.1, 0.04, 0.72, 0.04);
      for (const sx of [-0.4, 0.4])
        for (const sz of [-0.25, 0.25]) put(f, turn, WHEEL, along + sx, 0.55 + sz, 0, 0.1, 0.1, 0.1);
      for (let n = 0; n < 5; n++)
        put(
          f,
          turn,
          TOOLS[n % TOOLS.length]!,
          along - 0.35 + n * 0.17,
          0.5 + (n % 2) * 0.1,
          0.82,
          0.12,
          0.03 + (n % 3) * 0.02,
          0.07,
        );
      put(f, turn, DRAPE, along + 0.3, 0.7, 0.82, 0.3, 0.04, 0.3);
    } else if (dice < TABLE_CHANCE + TROLLEY_CHANCE + MACHINE_CHANCE) {
      // an anaesthetic machine: a tall case on casters with drawers, a screen on its top, a gas bottle behind it
      const along = rng.rand(-0.8, 0.8);
      put(f, turn, MACHINE, along, 0.5, 0.12, 0.7, 1.15, 0.6);
      for (let n = 0; n < 3; n++) put(f, turn, DRAWER, along, 0.81, 0.2 + n * 0.22, 0.6, 0.03, 0.02);
      put(f, turn, MACHINE, along, 0.5, 1.27, 0.76, 0.08, 0.66);
      put(f, turn, SCREEN, along, 0.82, 1.4, 0.5, 0.32, 0.05);
      put(f, turn, STEEL_DARK, along + 0.3, 0.2, 0.12, 0.14, 0.95, 0.14);
      for (const sx of [-0.28, 0.28]) put(f, turn, WHEEL, along + sx, 0.5, 0, 0.1, 0.1, 0.1);
    } else if (dice < TABLE_CHANCE + TROLLEY_CHANCE + MACHINE_CHANCE + STANDS_CHANCE) {
      // two drip stands: a pole on a foot of five legs, a bag hanging from it
      for (const along of [rng.rand(-1.2, -0.3), rng.rand(0.3, 1.2)]) {
        put(f, turn, STEEL, along, 0.5, 0, 0.04, 1.9, 0.04);
        put(f, turn, STEEL_DARK, along, 0.5, 0.03, 0.5, 0.04, 0.5);
        put(f, turn, STEEL, along, 0.5, 1.9, 0.3, 0.03, 0.03);
        put(f, turn, BAG, along + 0.1, 0.5, 1.45, 0.1, 0.3, 0.05);
      }
    }
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (const [color, where] of parts) add(box, new THREE.MeshBasicMaterial({ color }), where);

  // ---- the surgical lamps, over two opposite corners (the middle of the ceiling is the boss's) ----
  const cx = room.x + room.w / 2,
    cz = room.y + room.h / 2;
  for (const s of [-1, 1]) {
    const x = tileCenter(Math.floor(cx + s * room.w * (0.5 - LAMP.share))),
      z = tileCenter(Math.floor(cz + s * room.h * (0.5 - LAMP.share))),
      spin = rng.rand(0, Math.PI);
    add(
      new THREE.CylinderGeometry(LAMP.r, LAMP.r * 0.96, LAMP.thick, 28),
      [
        new THREE.MeshBasicMaterial({ color: STEEL }),
        new THREE.MeshBasicMaterial({ map: disc! }),
        new THREE.MeshBasicMaterial({ color: STEEL_DARK }),
      ],
      [pose(new THREE.Vector3(x, LAMP.y, z), spin)],
    );
    add(
      new THREE.BoxGeometry(LAMP.arm, HALL_H - LAMP.y - LAMP.thick / 2, LAMP.arm),
      new THREE.MeshBasicMaterial({ color: STEEL_DARK }),
      [pose(new THREE.Vector3(x, (HALL_H + LAMP.y) / 2, z))],
    );
    add(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: STEEL }), [
      pose(new THREE.Vector3(x, HALL_H - 0.3, z)),
    ]);
    lights.push({ x, z, color: LAMP.color, size: LAMP.size });
  }

  // ---- the evening sun through the clerestory windows, in patches on the floor ----
  const inner: number[] = [];
  for (let j = room.y; j < room.y + room.h; j++)
    for (let i = room.x; i < room.x + room.w; i++)
      if (
        plain(j * d.W + i) &&
        (i === room.x || j === room.y || i === room.x + room.w - 1 || j === room.y + room.h - 1)
      )
        inner.push(j * d.W + i);
  for (const k of rng.shuffle([...inner]).slice(0, SUN_PATCHES))
    lights.push({ x: tileCenter(k % d.W), z: tileCenter((k / d.W) | 0), color: SUN.color, size: SUN.size });
}
