import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { SIDE_STEP, tileCenter } from '@engine/world/tiles.ts';
import type { PropRule } from '@engine/world/slots.ts';
import { WALL_H } from '../../../data/level.ts';
import type { FloorPlan } from '../../building.ts';
import { WALL_PLAIN_SHARE, variantOf } from '../common.ts';
import { SIGN_FONT, canvasTex, oval, poolTex } from '../paint.ts';
import { LAMP_POOL, facing, lightMat, onWall, pose, propTools } from '../props.ts';
import { CITY_EXTINGUISHER, CITY_GUIDE } from '../../../i18n/signs.ts';
import { BARRIER_RED, BARRIER_WHITE, CITY_WALL_PICS } from './pictures.ts';
// The props of the old downtown (CITY): the things fixed to its walls and ceilings, and the light they throw. They go
// by the pictures on the walls (pictures.ts, next to this file), which are painted there. world/looks.ts puts the two
// together.
// ---- tuning numbers used only here ----
const POOL_OPACITY = 0.26; // the light a ceiling lamp throws on the floor (soft: the room is seen from far away)
const SUN_OPACITY = 0.42; // the sunlight a window throws on the floor
const WALL_BLIND = 3;
const WALL_BLIND_RAISED = 4;
const PLAIN_WALLS = [0, 1, 2]; // the walls that take a clock, a board or an extinguisher
// ---- the things on the walls and ceilings ----
// (the clocks, boards and lamps are above head height, EYE in src/data/level.ts; the extinguishers stand in the
// angle of wall and floor, and none of them has a body in the tile world)
const CITY_PROPS: PropRule[] = [
  { id: 'tube', slots: ['floor', 'center', 'corridor'], blocks: false, count: [26, 34], gap: 3 },
  { id: 'clock', slots: ['wall'], blocks: false, count: [10, 14], gap: 5 },
  { id: 'guide', slots: ['wall'], blocks: false, count: [8, 12], gap: 5 },
  { id: 'extinguisher', slots: ['wall'], blocks: false, count: [14, 18], gap: 4 },
];
const TUBE = { w: 0.86, len: 1.9, drop: 0.07 }; // a lit lamp fitting on the ceiling (m)
const TUBE_COLORS = [0xfff0d0, 0xfff0d0, 0xffe6b8, 0xf2f1e2]; // warm white tubes, an older yellower one, a colder new one
const TUBE_HOUSING = 0x4b4842;
const SUN = { w: 3.3, len: 3.5, color: 0xffb968 }; // the patch of sun under a window (m)
const CLOCK = { r: 0.34, y: 3.25 }; // m
const GUIDE = { w: 1.0, h: 1.4, y: 2.75 }; // a floor guide board (m)
const EXTINGUISHER = { r: 0.085, h: 0.46, out: 0.16, plateY: 1.75, color: 0xa8281c }; // m
interface CityShared {
  sun: THREE.CanvasTexture;
  clock: THREE.CanvasTexture;
  guide: THREE.CanvasTexture;
  plate: THREE.CanvasTexture;
}
let cityShared: CityShared | null = null;
// the sunlight a window with a blind throws on the floor (the top of the picture is at the wall): bars of light, one
// for every gap between the slats, fading into the room, parted by the shadow of the window's middle post
function sunTex(): THREE.CanvasTexture {
  const w = 256,
    h = 256;
  return canvasTex(w, h, g => {
    g.fillStyle = '#000000';
    g.fillRect(0, 0, w, h);
    for (let y = 10; y < h - 6; y += 13) {
      const far = y / h;
      g.fillStyle = `rgba(255,255,255,${0.9 * (1 - far) ** 1.4})`;
      g.fillRect(0, y, w, 7.5);
    }
    // soft at the sides, and the post's shadow
    const side = g.createLinearGradient(0, 0, w, 0);
    side.addColorStop(0, 'rgba(0,0,0,1)');
    side.addColorStop(0.14, 'rgba(0,0,0,0)');
    side.addColorStop(0.47, 'rgba(0,0,0,0)');
    side.addColorStop(0.5, 'rgba(0,0,0,.85)');
    side.addColorStop(0.53, 'rgba(0,0,0,0)');
    side.addColorStop(0.86, 'rgba(0,0,0,0)');
    side.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = side;
    g.fillRect(0, 0, w, h);
  });
}
function clockTex(): THREE.CanvasTexture {
  const s = 128,
    c = s / 2;
  return canvasTex(s, s, g => {
    g.fillStyle = '#35322d';
    oval(g, c, c, c - 1, c - 1);
    g.fillStyle = '#c6c2b2';
    oval(g, c, c, c - 9, c - 9);
    g.strokeStyle = '#2b2925';
    g.lineCap = 'round';
    for (let n = 0; n < 12; n++) {
      const a = (n / 12) * Math.PI * 2;
      g.lineWidth = n % 3 ? 2 : 4.5;
      g.beginPath();
      g.moveTo(c + Math.sin(a) * (c - 21), c - Math.cos(a) * (c - 21));
      g.lineTo(c + Math.sin(a) * (c - 14), c - Math.cos(a) * (c - 14));
      g.stroke();
    }
    // stopped at twenty to five
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(c, c);
    g.lineTo(c + 17, c + 21);
    g.stroke();
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(c, c);
    g.lineTo(c - 35, c + 20);
    g.stroke();
    g.fillStyle = '#2b2925';
    oval(g, c, c, 5, 5);
  });
}
// the floor guide: a dark board with its heading and the rows of the tenants' names (lines only: nobody is left)
function guideTex(): THREE.CanvasTexture {
  const w = 200,
    h = 280;
  return canvasTex(w, h, g => {
    g.fillStyle = '#7b776c';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2e3a39';
    g.fillRect(7, 7, w - 14, h - 14);
    g.fillStyle = '#c9c4ae';
    g.font = `700 26px ${SIGN_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(CITY_GUIDE, w / 2, 36, w - 40);
    g.fillRect(20, 58, w - 40, 2);
    for (let r = 0; r < 8; r++) {
      const y = 76 + r * 24;
      g.fillStyle = '#a79a6c';
      g.font = `700 16px ${SIGN_FONT}`;
      g.textAlign = 'left';
      g.fillText(`${8 - r}F`, 22, y + 7);
      g.fillStyle = r % 3 === 1 ? 'rgba(201,196,174,.25)' : 'rgba(201,196,174,.7)'; // some names taken down
      g.fillRect(64, y + 3, 60 + ((r * 37) % 50), 7);
    }
    g.fillStyle = 'rgba(20,14,8,.18)';
    g.fillRect(0, 0, w, h);
  });
}
// the plate over an extinguisher: white on red, read downwards
function plateTex(): THREE.CanvasTexture {
  const w = 64,
    h = 192;
  return canvasTex(w, h, g => {
    g.fillStyle = BARRIER_RED;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = BARRIER_WHITE;
    g.lineWidth = 3;
    g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = BARRIER_WHITE;
    g.font = `900 46px ${SIGN_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const step = (h - 20) / CITY_EXTINGUISHER.length;
    [...CITY_EXTINGUISHER].forEach((ch, n) => g.fillText(ch, w / 2, 12 + step * (n + 0.5)));
  });
}
// Lit lamp fittings on the ceiling with a soft pool of light under each, the sun on the floor under the windows,
// and on the plainer walls clocks, floor guides and fire extinguishers
export function cityProps(plan: FloorPlan, group: THREE.Group, rng: Rng) {
  cityShared ??= {
    sun: sunTex(),
    clock: clockTex(),
    guide: guideTex(),
    plate: plateTex(),
  };
  const shared = cityShared,
    tools = propTools(plan, group, CITY_PROPS, rng),
    { d, wallOf, add } = tools,
    M = d.maps;
  const pictureOf = (wall: number) => variantOf(wall, CITY_WALL_PICS.length, WALL_PLAIN_SHARE);
  // (the things on the walls go on the plain pictures only, clear of the windows, boards and cabinets)
  const of = (id: string) => tools.of(id).filter(s => s.kind !== 'wall' || PLAIN_WALLS.includes(pictureOf(wallOf(s))));

  // lit fittings (not where the ceiling is open): over the painted fitting of the tile, so they run the same way
  // (none in the boss room: its ceiling is twice as high, and a fitting at the usual height would hang in the air)
  const bossRoom = plan.hall?.room ?? -1;
  const tubes = of('tube').filter(s => !plan.noCeil[s.j * d.W + s.i] && s.room !== bossRoom),
    housing: THREE.Matrix4[] = [],
    lit: THREE.Matrix4[] = [],
    pools: THREE.Matrix4[] = [],
    tubeColors: number[] = [];
  tubes.forEach(s => {
    const x = tileCenter(s.i),
      z = tileCenter(s.j);
    housing.push(pose(new THREE.Vector3(x, WALL_H - TUBE.drop / 2, z)));
    lit.push(pose(new THREE.Vector3(x, WALL_H - TUBE.drop - 0.01, z)));
    pools.push(pose(new THREE.Vector3(x, 0.05, z)));
    tubeColors.push(rng.pick(TUBE_COLORS));
  });
  add(
    new THREE.BoxGeometry(TUBE.w, TUBE.drop, TUBE.len),
    new THREE.MeshBasicMaterial({ color: TUBE_HOUSING }),
    housing,
  );
  add(
    new THREE.PlaneGeometry(TUBE.w - 0.14, TUBE.len - 0.14).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    lit,
    tubeColors,
  );
  add(
    new THREE.PlaneGeometry(LAMP_POOL, LAMP_POOL).rotateX(-Math.PI / 2),
    lightMat(poolTex(), POOL_OPACITY),
    pools,
    tubeColors,
  );

  // the sun under the windows: on every flat floor tile that has a window wall beside it. Not from a wall only one
  // tile thick (a pillar, or a wall with a room behind it: the sun cannot come through there)
  const sun: THREE.Matrix4[] = [];
  for (let j = 1; j < d.H - 1; j++)
    for (let i = 1; i < d.W - 1; i++) {
      const k = j * d.W + i;
      if (M.grid[k] !== 1 || M.hgt[k] !== 0 || M.ramp[k]! >= 0 || M.cover[k] || plan.noFloor[k]) continue;
      SIDE_STEP.forEach(([di, dj], side) => {
        const wall = k + dj * d.W + di,
          behind = wall + dj * d.W + di,
          bi = i + di * 2,
          bj = j + dj * 2;
        if (M.grid[wall] === 1 || plan.voids[wall]) return;
        if (bi >= 0 && bj >= 0 && bi < d.W && bj < d.H && M.grid[behind] === 1) return;
        const picture = pictureOf(wall);
        if (picture !== WALL_BLIND && picture !== WALL_BLIND_RAISED) return;
        const s = { i, j, side };
        sun.push(pose(onWall(s, 0, SUN.len / 2 + 0.05, 0.06), facing(s)));
      });
    }
  add(new THREE.PlaneGeometry(SUN.w, SUN.len).rotateX(-Math.PI / 2), lightMat(shared.sun, SUN_OPACITY, SUN.color), sun);

  // clocks and floor guides, flat on the wall
  add(
    new THREE.CircleGeometry(CLOCK.r, 20),
    new THREE.MeshBasicMaterial({ map: shared.clock }),
    of('clock').map(s => pose(onWall(s, rng.rand(-1, 1), 0.03, CLOCK.y), facing(s))),
  );
  add(
    new THREE.PlaneGeometry(GUIDE.w, GUIDE.h),
    new THREE.MeshBasicMaterial({ map: shared.guide }),
    of('guide').map(s => pose(onWall(s, rng.rand(-0.8, 0.8), 0.03, GUIDE.y), facing(s))),
  );

  // fire extinguishers: the red bottle at the foot of the wall with its black head, the plate above it
  const bottle: THREE.Matrix4[] = [],
    head: THREE.Matrix4[] = [],
    plate: THREE.Matrix4[] = [];
  of('extinguisher').forEach(s => {
    const off = rng.rand(-1.4, 1.4),
      turn = facing(s);
    bottle.push(pose(onWall(s, off, EXTINGUISHER.out, EXTINGUISHER.h / 2), turn));
    head.push(pose(onWall(s, off, EXTINGUISHER.out, EXTINGUISHER.h + 0.06), turn));
    plate.push(pose(onWall(s, off, 0.03, EXTINGUISHER.plateY), turn));
  });
  add(
    new THREE.CylinderGeometry(EXTINGUISHER.r, EXTINGUISHER.r, EXTINGUISHER.h, 10),
    new THREE.MeshBasicMaterial({ color: EXTINGUISHER.color }),
    bottle,
  );
  add(new THREE.BoxGeometry(0.1, 0.12, 0.16), new THREE.MeshBasicMaterial({ color: 0x1f1c1a }), head);
  add(new THREE.PlaneGeometry(0.2, 0.6), new THREE.MeshBasicMaterial({ map: shared.plate }), plate);
}
