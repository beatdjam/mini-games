import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { T } from '@engine/world/tiles.ts';
import { css } from '../../../data/colors.ts';
import { HALL_H } from '../../../data/level.ts';
import type { FloorPlan } from '../../building.ts';
import { wallPic } from '../common.ts';
import { hallSurround } from '../hallFaces.ts';
import type { HallFace } from '../hallFaces.ts';
import { canvasTex, oval } from '../paint.ts';
import { facing, onWall, pose } from '../props.ts';
import type { Light, PropTools } from '../props.ts';
import { DATA_ALL_WALLS, DATA_HALL_PLAIN_WALLS, DATA_HALL_RACK_WALLS, DATA_ROOM_WALLS } from './pictures.ts';
import {
  CABLES,
  DISPLAY_DARK,
  DISPLAY_LIT,
  HALL_BUTTON,
  HALL_HAZARD,
  HALL_HEAD,
  HALL_HOUSING,
  HALL_LAMPS,
  HALL_METAL,
  HALL_WELL,
} from './strokes.ts';
// What stands in the data layer's server hall (its boss room), all of it for the eye: it has no body in the tile
// world, and all of it stays close to the walls (under a metre out) or lies flat on the floor, so nothing is in the way
// of the fight, which is in the air (WATCHER and PHANTOM move over the whole room). Along the walls: cable ladders from
// the floor to the ceiling, air-conditioning units (CRAC) with their grilles, boards pulled out of the racks and left on
// the floor, and small lamps down the rack fronts that blink (a few times a second, only while they are drawn). On the
// floor: a yellow line along every wall and pillar. Under the ceiling, along the walls only (the middle of the room is
// left empty): a cable tray with its cables, and the fire main with a sprinkler head on every tile.
// ---- tuning numbers used only here ----
const LINE = { w: 0.16, thick: 0.02, y: 0.03, out: 1.5, color: 0x8f7f2e }; // the yellow line along a wall: where, its colour
const LADDER = { w: 0.46, h: HALL_H - 0.3, rail: 0.05, rung: 0.5, out: 0.28, chance: 0.14, cables: 3 }; // a cable ladder up a wall (m)
const CRAC = { w: 1.7, h: 2.3, deep: 0.9, chance: 0.55, out: 0.04 }; // an air-conditioning unit; `out`: it stands this far off the wall
const BOARD = { w: 0.56, deep: 0.4, thick: 0.03, out: [0.5, 1.3] as const, chance: 0.3 }; // a board pulled from a rack, lying on the floor
const BLINK = {
  out: 0.05,
  y: [0.7, 4.0] as const,
  pitch: 0.1,
  size: 0.05,
  every: 260,
  off: 0.14,
  clusters: [1, 3] as const,
}; // the small lamps: their rows, and how fast they change
const BLINK_GROUPS = 3; // the lamps blink in this many groups, each at its own rate
const LAMP_POOL = { size: 0.45, chance: 0.18, color: 0x3fae7a }; // the light a few of the lamps throw on the floor
const POOL_OPACITY = 0.3; // the light thrown on the floor (the layer's own tubes throw 0.38): weak, so the floor stays dark
const TRAY = { y: HALL_H - 1.5, w: 0.5, out: 0.42, rung: 0.5, cables: 4 }; // the cable tray under the ceiling, along the walls
const MAIN = { y: HALL_H - 0.7, r: 0.07, out: 0.85, head: 0.2, hanger: 0.3 }; // the fire main and its sprinkler heads
const MAIN_RED = 0x74211b; // the fire main (pictures: PANEL_RED)

let shared: { crac: THREE.CanvasTexture; board: THREE.CanvasTexture } | null = null;
// the front of an air-conditioning unit: a grille over a dark panel, a display and three buttons, a hazard strip
const cracTex = () =>
  canvasTex(112, 160, g => {
    g.fillStyle = '#2e3a43';
    g.fillRect(0, 0, 112, 160);
    g.fillStyle = 'rgba(180,205,222,.16)';
    g.fillRect(0, 0, 112, 2);
    g.fillRect(0, 0, 2, 160);
    g.fillStyle = 'rgba(0,0,0,.5)';
    g.fillRect(110, 0, 2, 160);
    g.fillStyle = css(HALL_WELL);
    g.fillRect(10, 10, 92, 70);
    for (let y = 14; y < 78; y += 6) {
      g.fillStyle = '#74818b';
      g.fillRect(10, y, 92, 3);
    }
    g.fillStyle = css(DISPLAY_DARK);
    g.fillRect(14, 94, 52, 20);
    g.fillStyle = css(DISPLAY_LIT);
    for (let x = 18; x < 62; x += 7) g.fillRect(x, 99, 4, 10);
    g.fillStyle = css(HALL_BUTTON);
    for (let n = 0; n < 3; n++) g.fillRect(74 + n * 12, 98, 9, 12);
    g.fillStyle = 'rgba(0,0,0,.5)';
    g.fillRect(8, 124, 96, 1.5);
    g.fillRect(56, 124, 1.5, 28);
    g.fillStyle = css(HALL_HAZARD);
    for (let x = -10; x < 120; x += 16) {
      g.beginPath();
      g.moveTo(x, 160);
      g.lineTo(x + 8, 160);
      g.lineTo(x + 16, 148);
      g.lineTo(x + 8, 148);
      g.fill();
    }
  });
// a board from above: dark green with traces, a few chips, a connector of gold along one edge
const boardTex = () =>
  canvasTex(128, 96, g => {
    g.fillStyle = '#183a2e';
    g.fillRect(0, 0, 128, 96);
    g.strokeStyle = 'rgba(120,200,160,.28)';
    g.lineWidth = 1;
    for (let y = 8; y < 80; y += 7) {
      g.beginPath();
      g.moveTo(6, y);
      g.lineTo(40 + (y % 5) * 14, y);
      g.lineTo(54 + (y % 4) * 12, y + 5);
      g.lineTo(122, y + 5);
      g.stroke();
    }
    for (const [x, y, w, h] of [
      [18, 14, 26, 20],
      [62, 20, 18, 14],
      [88, 50, 24, 18],
      [20, 52, 14, 14],
    ] as const) {
      g.fillStyle = '#0c1114';
      g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(190,210,225,.2)';
      g.fillRect(x, y, w, 1.5);
    }
    g.fillStyle = '#b79a3c';
    for (let x = 6; x < 122; x += 4) g.fillRect(x, 88, 2.4, 8);
    g.fillStyle = '#c8a850';
    oval(g, 110, 14, 3, 3);
  });

export function hallProps(plan: FloorPlan, tools: Pick<PropTools, 'add' | 'd' | 'pools'>, rng: Rng) {
  if (!plan.hall) return;
  shared ??= { crac: cracTex(), board: boardTex() };
  const tex = shared,
    { add, d, pools } = tools,
    lights: Light[] = [],
    { open, pictureOf } = hallSurround(plan, d, wall =>
      wallPic(d, wall, DATA_ALL_WALLS, undefined, undefined, DATA_ROOM_WALLS),
    ),
    edges = open.filter(f => f.edge),
    racked = edges.filter(f => DATA_HALL_RACK_WALLS.includes(pictureOf(f))),
    plained = edges.filter(f => DATA_HALL_PLAIN_WALLS.includes(pictureOf(f))),
    flat = (color: number) => new THREE.MeshBasicMaterial({ color }),
    // (white: each copy has its own colour)
    tinted = new THREE.MeshBasicMaterial({ color: 0xffffff }),
    metal = flat(HALL_METAL),
    taken = new Set<HallFace>();

  // ---- the yellow line along every wall and round every pillar ----
  add(
    new THREE.BoxGeometry(T + LINE.w, LINE.thick, LINE.w),
    flat(LINE.color),
    open.map(f => pose(onWall(f, 0, LINE.out, LINE.y), facing(f))),
  );

  // ---- cable ladders from the floor to the ceiling, with cables lying up them ----
  const rails: THREE.Matrix4[] = [],
    rungs: THREE.Matrix4[] = [],
    strands: THREE.Matrix4[] = [],
    strandColors: number[] = [];
  for (const f of racked) {
    if (rng.next() >= LADDER.chance) continue;
    taken.add(f);
    const off = rng.rand(-1.2, 1.2),
      turn = facing(f);
    for (const side of [-1, 1])
      rails.push(pose(onWall(f, off + (side * LADDER.w) / 2, LADDER.out, LADDER.h / 2), turn));
    for (let y = 0.3; y < LADDER.h; y += LADDER.rung) rungs.push(pose(onWall(f, off, LADDER.out, y), turn));
    for (let n = 0; n < LADDER.cables; n++) {
      strands.push(
        pose(
          onWall(f, off + (n / (LADDER.cables - 1) - 0.5) * (LADDER.w - 0.14), LADDER.out + 0.04, LADDER.h / 2),
          turn,
        ),
      );
      strandColors.push(rng.pick(CABLES));
    }
  }
  add(new THREE.BoxGeometry(LADDER.rail, LADDER.h, LADDER.rail), metal, rails);
  add(new THREE.BoxGeometry(LADDER.w, 0.04, 0.04), metal, rungs);
  add(new THREE.CylinderGeometry(0.04, 0.04, LADDER.h - 0.4, 6), tinted, strands, strandColors);

  // ---- air-conditioning units along the plain walls: a box with its front to the room ----
  const crac: THREE.Matrix4[] = [];
  for (const f of plained) {
    if (rng.next() >= CRAC.chance) continue;
    crac.push(pose(onWall(f, rng.rand(-0.3, 0.3), CRAC.out + CRAC.deep / 2, CRAC.h / 2), facing(f)));
  }
  // (the faces of a box: +x, -x, up, down, +z, -z; +z looks away from the wall)
  const side = flat(HALL_HOUSING);
  add(
    new THREE.BoxGeometry(CRAC.w, CRAC.h, CRAC.deep),
    [side, side, side, side, new THREE.MeshBasicMaterial({ map: tex.crac }), side],
    crac,
  );

  // ---- boards pulled out of the racks and left on the floor ----
  const boards: THREE.Matrix4[] = [];
  for (const f of racked) {
    if (taken.has(f) || rng.next() >= BOARD.chance) continue;
    boards.push(
      pose(
        onWall(f, rng.rand(-1.4, 1.4), rng.rand(BOARD.out[0], BOARD.out[1]), BOARD.thick / 2),
        facing(f) + rng.rand(-0.6, 0.6),
      ),
    );
  }
  const back = flat(HALL_HOUSING);
  add(
    new THREE.BoxGeometry(BOARD.w, BOARD.thick, BOARD.deep),
    [back, back, new THREE.MeshBasicMaterial({ map: tex.board }), back, back, back],
    boards,
  );

  // ---- the small lamps down the rack fronts: a short row of three, each row in one of the groups that blink ----
  const rows: THREE.Matrix4[][] = Array.from({ length: BLINK_GROUPS }, () => []),
    rowColors: number[][] = Array.from({ length: BLINK_GROUPS }, () => []);
  for (const f of racked) {
    const turn = facing(f);
    for (let c = 0, n = rng.randi(BLINK.clusters[0], BLINK.clusters[1]); c < n; c++) {
      const group = rng.randi(0, BLINK_GROUPS - 1),
        off = rng.rand(-1.6, 1.6),
        y = rng.rand(BLINK.y[0], BLINK.y[1]),
        color = rng.pick(HALL_LAMPS);
      for (let k = -1; k <= 1; k++) {
        rows[group]!.push(pose(onWall(f, off + k * BLINK.pitch, BLINK.out, y), turn));
        rowColors[group]!.push(color);
      }
      if (rng.next() < LAMP_POOL.chance) {
        const at = onWall(f, off, 0.8, 0);
        lights.push({ x: at.x, z: at.z, color: LAMP_POOL.color, size: LAMP_POOL.size });
      }
    }
  }
  const lampGeo = new THREE.BoxGeometry(BLINK.size, BLINK.size * 0.7, BLINK.size * 0.6);
  rows.forEach((where, group) => {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff }),
      mesh = add(lampGeo, mat, where, rowColors[group]);
    // each group changes at its own rate: on for a while, then dim for as long
    if (mesh)
      mesh.onBeforeRender = () => {
        const lit = Math.floor(performance.now() / (BLINK.every * (group + 1))) % 2 === 0;
        mat.color.setScalar(lit ? 1 : BLINK.off);
      };
  });

  // ---- under the ceiling, along the walls: the cable tray and the fire main, a sprinkler head on every tile ----
  const trayRails: THREE.Matrix4[] = [],
    trayRungs: THREE.Matrix4[] = [],
    trayCables: THREE.Matrix4[] = [],
    trayCableColors: number[] = [],
    mains: THREE.Matrix4[] = [],
    hangers: THREE.Matrix4[] = [],
    heads: THREE.Matrix4[] = [];
  for (const f of edges) {
    const turn = facing(f);
    for (const s of [-1, 1]) trayRails.push(pose(onWall(f, 0, TRAY.out + (s * TRAY.w) / 2, TRAY.y), turn));
    for (let r = 0; r < T / TRAY.rung; r++)
      trayRungs.push(pose(onWall(f, (r + 0.5) * TRAY.rung - T / 2, TRAY.out, TRAY.y), turn));
    CABLES.slice(0, TRAY.cables).forEach((c, n) => {
      trayCables.push(
        pose(onWall(f, 0, TRAY.out + (n / (TRAY.cables - 1) - 0.5) * (TRAY.w - 0.14), TRAY.y + 0.05), turn),
      );
      trayCableColors.push(c);
    });
    mains.push(pose(onWall(f, 0, MAIN.out, MAIN.y), turn));
    hangers.push(pose(onWall(f, 0, MAIN.out, MAIN.y + MAIN.hanger / 2), turn));
    heads.push(pose(onWall(f, 0, MAIN.out, MAIN.y - MAIN.r - MAIN.head / 2), turn));
  }
  add(new THREE.BoxGeometry(T, 0.08, 0.04), metal, trayRails);
  add(new THREE.BoxGeometry(0.04, 0.03, TRAY.w), metal, trayRungs);
  add(new THREE.CylinderGeometry(0.04, 0.04, T, 6).rotateZ(Math.PI / 2), tinted, trayCables, trayCableColors);
  add(new THREE.CylinderGeometry(MAIN.r, MAIN.r, T, 10).rotateZ(Math.PI / 2), flat(MAIN_RED), mains);
  add(new THREE.BoxGeometry(0.04, MAIN.hanger, 0.04), metal, hangers);
  add(new THREE.CylinderGeometry(0.03, 0.09, MAIN.head, 8), flat(HALL_HEAD), heads);

  // (the pools of light on the floor: weak)
  pools(lights, POOL_OPACITY);
}
