import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { SIDE_STEP } from '@engine/world/tiles.ts';
import { PAINT, css } from '../../../data/colors.ts';
import { CITY_HALL_RECEPTION } from '../../../i18n/signs.ts';
import type { FloorPlan } from '../../building.ts';
import { boxGeo, cylGeo } from '../../models/machine.ts';
import { wallPic } from '../common.ts';
import { hallSurround } from '../hallFaces.ts';
import { SIGN_FONT, canvasTex } from '../paint.ts';
import { facing, onWall, pose } from '../props.ts';
import type { Light, PropTools } from '../props.ts';
import {
  CITY_ALL_WALLS,
  CITY_HALL_DESK_WALLS,
  CITY_HALL_EXIT_WALLS,
  CITY_HALL_GLASS_WALLS,
  CITY_ROOM_WALLS,
} from './pictures.ts';
// What stands in the old downtown's entrance lobby (its boss room), all of it for the eye: it has no body in the tile
// world, and all of it stays close to the walls (about two metres out) or lies on the floor beside them, so the middle
// of the room is clear for the fight. Along the walls: the reception desk with chairs knocked over before it, stopped
// escalators climbing to the gallery, a row of security gates by the reception, benches, pots with dead trees and a
// directory board fallen on the floor. The lobby's lamps are out: the floor takes the green of the emergency lamps and
// the low sun through the glass curtain wall.
// ---- tuning numbers used only here ----
const DESK = { chance: 0.7, max: 2, w: 3.4, h: 1.06, top: 0.08, deep: 0.62, out: 0.36, off: 0.35 }; // the reception desk (m)
const DESK_LOGO = { w: 0.95, h: 0.34, y: 0.62 }; // the plate on its front (m)
const CHAIR = { chance: 0.75, max: 10, n: [2, 4] as const, seat: 0.42, back: 0.55, leg: 0.4 }; // the chairs knocked over before it
const ESC = {
  chance: 0.5,
  max: 2,
  run: 6.5,
  rise: 7.05,
  w: 1.35,
  thick: 0.3,
  side: 0.9,
  panel: 0.12,
  plate: 0.4,
  rail: 0.09,
  railW: 0.14,
  railH: 0.92,
  landing: 2.0,
  comb: 0.3,
  out: 1.05,
  walls: 2,
}; // a stopped escalator: its run and rise (the rise brings the top to the gallery's handrail, about 8 m up), width, body and balustrade sizes, the plate's share of the balustrade's height, handrail, landings, distance from the wall, and the wall tiles it needs either side of its face (m)
const ESC_TOP = { len: 3.6, deep: 2.6, thick: 0.4, rail: 1.0, post: 0.06, nosing: 0.05 }; // the landing it climbs to: a slab out from the wall at the gallery's floor, its length along the wall, depth, thickness, handrail height, posts and brass nosing (m)
const ESC_DOOR = { w: 2.0, h: 2.7, out: 0.04 }; // the way in to the floor above, at the back of that landing (m)
const ESC_STEP = 0.4; // the depth of one of its steps (m)
const ESC_PX = 96; // the scale of its pictures (px to the metre): the treads and the plate keep one size on both the run and the landings
const ESC_LEN = Math.hypot(ESC.run, ESC.rise); // the length of its run (m)
const GATE = { chance: 0.8, n: [3, 4] as const, gap: 0.82, w: 0.26, d: 0.38, h: 0.95, out: 2.1, lamp: 0.08 }; // the security gates by the reception (m)
const POT = {
  chance: 0.55,
  max: 5,
  r: 0.3,
  h: 0.55,
  out: [0.55, 0.95] as const,
  trunk: 1.0,
  trunkR: 0.045,
  branch: [5, 7] as const,
}; // a pot with a dead tree: the pot, its distance from the wall, the trunk and the number of bare branches
const BENCH = { chance: 0.35, max: 3, w: 1.8, d: 0.5, h: 0.45, slats: 3, out: [0.45, 0.7] as const }; // a bench (m)
const BOARD = { chance: 0.4, max: 2, w: 1.2, d: 0.8, thick: 0.06, out: [0.7, 1.3] as const }; // the directory board fallen on the floor (m)
const SUN_POOL = { chance: 0.7, out: [1.2, 2.6] as const, size: [0.55, 0.85] as const }; // the low sun through the glass wall on the floor
const GREEN_POOL = { chance: 0.8, out: 0.9, size: 0.3 }; // the emergency lamp's green on the floor
const POOL_OPACITY = 0.3; // the light thrown on the floor: weak, so the marble stays dark
const MARBLE = PAINT.grey7;
const DESK_FRONT = PAINT.soot15;
const DESK_SIDE = PAINT.soot16;
const BRASS = PAINT.brass1;
const STEEL = PAINT.grey10;
const STEEL_DARK = PAINT.grey2;
const ESC_PLATE = PAINT.grey5; // the matte stainless of the escalator's lower balustrade (the lobby's warm grey)
const ESC_TREAD = PAINT.grey6; // the metal of its steps
const ESC_GLASS = 0x8fb7ae; // the pale blue-green of its glass balustrade
const ESC_EDGE = PAINT.amber2; // the yellow line at the front of a step
const ESC_SEAM = PAINT.soot15; // the darker line where one step meets the next
const ESC_SLAB = PAINT.soot5; // the edge and underside of the landing at its top, dark as the gallery's slab in the picture
const IRON = PAINT.ink9;
const RUBBER = PAINT.ink3;
const WOOD = PAINT.clay1;
const POT_CLAY = PAINT.rust2;
const SOIL = PAINT.umber1;
const TWIG = PAINT.olive;
const LAMP_GREEN = PAINT.mint2;
const SUN_COLOR = PAINT.amber4;
const GREEN_COLOR = PAINT.mint1;

let shared: {
  logo: THREE.CanvasTexture;
  board: THREE.CanvasTexture;
  plate: THREE.CanvasTexture;
  tread: THREE.CanvasTexture;
  landing: THREE.CanvasTexture;
  door: THREE.CanvasTexture;
} | null = null;
// the plate on the front of the reception desk: dark bronze with brass letters
const logoTex = () =>
  canvasTex(160, 64, g => {
    g.fillStyle = css(PAINT.soot5);
    g.fillRect(0, 0, 160, 64);
    g.strokeStyle = css(BRASS);
    g.lineWidth = 2;
    g.strokeRect(3, 3, 154, 58);
    g.fillStyle = css(PAINT.amber2);
    g.font = `700 30px ${SIGN_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(CITY_HALL_RECEPTION, 80, 34, 140);
  });
// the face of the directory board: dark enamel, a brass line and the rows of the floors (lines only: nobody is left)
const boardTex = () =>
  canvasTex(96, 64, g => {
    g.fillStyle = css(PAINT.soot5);
    g.fillRect(0, 0, 96, 64);
    g.fillStyle = css(PAINT.soot9);
    g.fillRect(4, 4, 88, 56);
    g.strokeStyle = css(BRASS);
    g.lineWidth = 1.5;
    g.strokeRect(7, 7, 82, 50);
    g.fillStyle = css(PAINT.clay5);
    for (let y = 12; y < 56; y += 6) g.fillRect(12, y, 26 + ((y * 7) % 34), 2);
  });
// the lower balustrade of an escalator: matte steel brushed top to bottom, its dirt gathered along the foot
const plateTex = (length: number) =>
  canvasTex(Math.round(length * ESC_PX), 64, g => {
    const w = g.canvas.width,
      steel = g.createLinearGradient(0, 0, w, 0);
    steel.addColorStop(0, '#666a62');
    steel.addColorStop(0.5, css(ESC_PLATE));
    steel.addColorStop(1, '#61655d');
    g.fillStyle = steel;
    g.fillRect(0, 0, w, 64);
    // the fine vertical brushing
    for (let x = 0; x < w; x += 3) {
      g.fillStyle = x % 6 ? 'rgba(255,255,255,.05)' : 'rgba(18,20,17,.14)';
      g.fillRect(x, 0, 1, 64);
    }
    // the dirt of the years along the foot
    const dirt = g.createLinearGradient(0, 38, 0, 64);
    dirt.addColorStop(0, 'rgba(30,25,20,0)');
    dirt.addColorStop(1, 'rgba(30,25,20,.5)');
    g.fillStyle = dirt;
    g.fillRect(0, 38, w, 26);
    for (let k = 0, x = 8; x < w; x += 14, k++) {
      g.fillStyle = 'rgba(24,20,16,.18)';
      g.fillRect(x, 44 + (k % 4) * 5, 2 + (k % 3), 12 + (k % 5) * 3);
    }
  });
// the steps of an escalator seen from above: fine grooves run across each step, a dark seam and a yellow edge at its front
const treadTex = (length: number) =>
  canvasTex(Math.round(length * ESC_PX), 64, g => {
    const w = g.canvas.width,
      step = ESC_STEP * ESC_PX;
    g.fillStyle = css(ESC_TREAD);
    g.fillRect(0, 0, w, 64);
    for (let x = 0; x < w; x += step) {
      for (let gx = x + 1; gx < x + step; gx += 3) {
        g.fillStyle = (gx - x) % 6 < 3 ? 'rgba(20,22,20,.3)' : 'rgba(255,255,255,.07)';
        g.fillRect(gx, 0, 1, 64);
      }
      g.fillStyle = css(ESC_SEAM);
      g.fillRect(x, 0, 1.5, 64);
      g.fillStyle = css(ESC_EDGE);
      g.fillRect(x + 1.5, 0, 1.5, 64);
    }
    const wear = g.createLinearGradient(0, 0, 0, 64);
    wear.addColorStop(0, 'rgba(12,10,8,.24)');
    wear.addColorStop(0.5, 'rgba(12,10,8,0)');
    wear.addColorStop(1, 'rgba(12,10,8,.24)');
    g.fillStyle = wear;
    g.fillRect(0, 0, w, 64);
  });
// the way in to the floor above at the top of an escalator: a steel frame, a shutter stuck half down, the dark beyond
const doorTex = () =>
  canvasTex(128, 176, g => {
    const shutter = 74;
    g.fillStyle = css(PAINT.soot5);
    g.fillRect(0, 0, 128, 176);
    // the dark of the floor above, a little light from its far end along the floor
    const dark = g.createLinearGradient(0, shutter, 0, 176);
    dark.addColorStop(0, css(PAINT.ink1));
    dark.addColorStop(1, '#2a2620');
    g.fillStyle = dark;
    g.fillRect(10, shutter, 108, 166 - shutter);
    g.fillStyle = 'rgba(224,190,120,.12)';
    g.fillRect(44, 150, 40, 16);
    // the shutter: ribs of steel, its bottom bar, the dirt run down it
    for (let y = 10; y < shutter; y += 5) {
      g.fillStyle = y % 10 ? '#5d5f59' : '#4d4f4a';
      g.fillRect(10, y, 108, 5);
      g.fillStyle = 'rgba(18,18,16,.4)';
      g.fillRect(10, y + 4, 108, 1);
    }
    g.fillStyle = '#34352f';
    g.fillRect(10, shutter - 4, 108, 5);
    g.fillStyle = 'rgba(30,24,18,.25)';
    for (let x = 18; x < 112; x += 17) g.fillRect(x, 10, 3, shutter - 22 + (x % 3) * 4);
    // the frame, and a strip of brass over the head
    g.strokeStyle = css(PAINT.soot13);
    g.lineWidth = 6;
    g.strokeRect(7, 7, 114, 162);
    g.fillStyle = css(BRASS);
    g.fillRect(4, 2, 120, 3);
  });

export function hallProps(plan: FloorPlan, tools: Pick<PropTools, 'add' | 'd' | 'pools'>, rng: Rng) {
  if (!plan.hall) return;
  shared ??= {
    logo: logoTex(),
    board: boardTex(),
    plate: plateTex(ESC_LEN),
    tread: treadTex(ESC_LEN),
    landing: treadTex(ESC.landing),
    door: doorTex(),
  };
  const tex = shared,
    { add, d, pools } = tools,
    lights: Light[] = [],
    { open, pictureOf } = hallSurround(plan, d, wall =>
      wallPic(d, wall, { count: CITY_ALL_WALLS, rooms: CITY_ROOM_WALLS }),
    ),
    edges = open.filter(f => f.edge),
    desks = edges.filter(f => CITY_HALL_DESK_WALLS.includes(pictureOf(f))),
    flat = (color: number) => new THREE.MeshBasicMaterial({ color }),
    marble = flat(MARBLE),
    deskFront = flat(DESK_FRONT),
    deskSide = flat(DESK_SIDE),
    steel = flat(STEEL),
    steelDark = flat(STEEL_DARK),
    iron = flat(IRON),
    rubber = flat(RUBBER),
    wood = flat(WOOD),
    clay = flat(POT_CLAY),
    soil = flat(SOIL),
    twig = flat(TWIG),
    green = flat(LAMP_GREEN),
    plate = new THREE.MeshBasicMaterial({ map: tex.plate }),
    tread = new THREE.MeshBasicMaterial({ map: tex.tread }),
    landingTread = new THREE.MeshBasicMaterial({ map: tex.landing }),
    glass = new THREE.MeshBasicMaterial({ color: ESC_GLASS, transparent: true, opacity: 0.22, depthWrite: false }),
    // a thing is stood a little out from its wall, at a height, along its wall
    spot = (
      f: (typeof open)[number],
      off: number,
      out: number,
      y: number,
      turn = 0,
      roll = 0,
      scale = new THREE.Vector3(1, 1, 1),
    ) => pose(onWall(f, off, out, y), facing(f) + turn, scale, roll);

  // ---- the reception desk: a long marble top on a dark front, its plate, and chairs knocked over before it ----
  const deskTops: THREE.Matrix4[] = [],
    deskFronts: THREE.Matrix4[] = [],
    deskEnds: THREE.Matrix4[] = [],
    deskLogos: THREE.Matrix4[] = [],
    chairSeats: THREE.Matrix4[] = [],
    chairBacks: THREE.Matrix4[] = [],
    chairLegs: THREE.Matrix4[] = [],
    deskFaces: { f: (typeof open)[number]; off: number }[] = [];
  for (const f of desks) {
    if (deskTops.length >= DESK.max || rng.next() >= DESK.chance) continue;
    const off = rng.rand(-DESK.off, DESK.off);
    deskTops.push(spot(f, off, DESK.out + DESK.deep / 2, DESK.h - DESK.top / 2));
    deskFronts.push(spot(f, off, DESK.out + DESK.deep - 0.03, (DESK.h - DESK.top) / 2));
    for (const a of [-1, 1])
      deskEnds.push(spot(f, off + a * (DESK.w / 2 - 0.05), DESK.out + DESK.deep / 2, (DESK.h - DESK.top) / 2));
    deskLogos.push(spot(f, off, DESK.out + DESK.deep + 0.02, DESK_LOGO.y));
    deskFaces.push({ f, off });
    if (rng.next() >= CHAIR.chance) continue;
    for (let n = rng.randi(CHAIR.n[0], CHAIR.n[1]); n > 0 && chairSeats.length < CHAIR.max; n--) {
      const co = off + rng.rand(-1.6, 1.6),
        cout = DESK.out + DESK.deep + rng.rand(0.25, 0.9),
        ct = rng.rand(-0.7, 0.7);
      // (on its side: the seat on edge, the back lying flat beside it, the legs along the floor)
      chairSeats.push(spot(f, co, cout, CHAIR.seat / 2, ct, Math.PI / 2));
      chairBacks.push(spot(f, co + rng.rand(-0.1, 0.1), cout + 0.3, 0.07, ct, Math.PI / 2));
      for (const a of [-1, 1])
        chairLegs.push(spot(f, co + a * 0.13, cout + rng.rand(-0.16, 0.16), 0.04, ct, Math.PI / 2));
    }
  }
  add(boxGeo(DESK.w, DESK.top, DESK.deep), marble, deskTops);
  add(boxGeo(DESK.w, DESK.h - DESK.top, 0.06), deskFront, deskFronts);
  add(boxGeo(0.08, DESK.h - DESK.top, DESK.deep), deskSide, deskEnds);
  const plateSide = flat(DESK_FRONT);
  add(
    boxGeo(DESK_LOGO.w, DESK_LOGO.h, 0.03),
    [plateSide, plateSide, plateSide, plateSide, new THREE.MeshBasicMaterial({ map: tex.logo }), plateSide],
    deskLogos,
  );
  add(boxGeo(CHAIR.seat, 0.06, CHAIR.seat), deskSide, chairSeats);
  add(boxGeo(CHAIR.seat, CHAIR.back, 0.06), deskSide, chairBacks);
  add(boxGeo(0.04, CHAIR.leg, 0.04), iron, chairLegs);

  // ---- stopped escalators climbing along the walls to the gallery ----
  const bodies: THREE.Matrix4[] = [],
    plates: THREE.Matrix4[] = [],
    glasses: THREE.Matrix4[] = [],
    rails: THREE.Matrix4[] = [],
    landings: THREE.Matrix4[] = [],
    combs: THREE.Matrix4[] = [],
    tops: THREE.Matrix4[] = [],
    noses: THREE.Matrix4[] = [],
    endNoses: THREE.Matrix4[] = [],
    topGlasses: THREE.Matrix4[] = [],
    topRails: THREE.Matrix4[] = [],
    posts: THREE.Matrix4[] = [],
    doors: THREE.Matrix4[] = [],
    // the balustrade: a plate of brushed steel at the foot of it, glass up to the handrail over that
    plateH = ESC.side * ESC.plate,
    glassH = ESC.railH + ESC.thick / 2 - plateH,
    // an escalator climbs along the wall, so the wall has to run on past its face (and no door there)
    wallRun = (f: (typeof open)[number], along: number): boolean => {
      const [di, dj] = SIDE_STEP[f.side]!,
        wall = (f.j + dj) * d.W + f.i + di,
        step = along * (dj + di * d.W);
      for (let n = 1; n <= ESC.walls; n++) {
        const t = wall + step * n;
        if (d.maps.grid[t] === 1 || d.maps.door?.[t]) return false;
      }
      return true;
    };
  // (one to a wall: the landing at the top of one would be over the run of the next)
  const escSides: number[] = [];
  for (const f of edges) {
    const along = f.side === 0 || f.side === 1 ? 1 : -1;
    if (bodies.length >= ESC.max || rng.next() >= ESC.chance || !wallRun(f, along) || escSides.includes(f.side))
      continue;
    escSides.push(f.side);
    const bottom = along > 0 ? rng.rand(-1.4, 0) : rng.rand(0, 1.4),
      top = bottom + along * ESC.run,
      angle = Math.atan2(ESC.rise, ESC.run),
      turn = facing(f),
      // a point on the escalator's line: `t` along the run (0 at the bottom), `n` up its normal, `z` across it
      point = (t: number, n: number, z: number) =>
        onWall(
          f,
          bottom + along * t * ESC.run - Math.sin(angle) * along * n,
          ESC.out + z,
          t * ESC.rise + Math.cos(angle) * n,
        );
    // the body, its two balustrades (plate and glass), and the handrails along their tops
    for (const z of [0, -1, 1]) {
      const scale = new THREE.Vector3(ESC_LEN, 1, 1),
        at = z ? ESC.w / 2 - ESC.panel / 2 : 0;
      if (!z) bodies.push(pose(point(0.5, 0, 0), turn, scale, angle));
      else {
        plates.push(pose(point(0.5, -ESC.thick / 2 + plateH / 2, z * at), turn, scale, angle));
        glasses.push(pose(point(0.5, ESC.railH - glassH / 2, z * at), turn, scale, angle));
        rails.push(pose(point(0.5, ESC.railH, z * at), turn, scale, angle));
      }
    }
    // the landings at each end, and the yellow comb plates where they meet the steps
    for (const [t, y, dir] of [
      [0, 0, -1],
      [1, ESC.rise, 1],
    ] as const) {
      const end = t ? top : bottom,
        off = end + along * dir * (ESC.landing / 2);
      landings.push(pose(onWall(f, off, ESC.out, y + 0.06), turn));
      combs.push(pose(onWall(f, end - along * dir * (ESC.comb / 2), ESC.out, y + 0.13), turn));
    }
    // the landing it climbs to, out from the wall at the gallery's floor: a marble slab with a brass nosing, glass and a
    // brass handrail round its open sides (the side the escalator comes up is open over it), and the way in to the floor
    // above at its back
    const T = ESC_TOP,
      floor = ESC.rise + 0.11,
      mid = top + (along * T.len) / 2,
      far = top + along * T.len,
      gap = ESC.out + ESC.w / 2 + 0.12;
    tops.push(pose(onWall(f, mid, T.deep / 2, floor - T.thick / 2), turn));
    noses.push(pose(onWall(f, mid, T.deep + T.nosing / 2, floor - 0.04), turn));
    endNoses.push(pose(onWall(f, far + (along * T.nosing) / 2, T.deep / 2, floor - 0.04), turn + Math.PI / 2));
    // its sides: along the front, across the far end, and the bit of the near end past the escalator
    for (const [at, out, len, across] of [
      [mid, T.deep - ESC.panel / 2, T.len, false],
      [far - (along * ESC.panel) / 2, T.deep / 2, T.deep, true],
      [top + (along * ESC.panel) / 2, (gap + T.deep) / 2, T.deep - gap, true],
    ] as const) {
      const side = new THREE.Vector3(len, 1, 1),
        spin = turn + (across ? Math.PI / 2 : 0);
      topGlasses.push(pose(onWall(f, at, out, floor + T.rail / 2), spin, side));
      topRails.push(pose(onWall(f, at, out, floor + T.rail), spin, side));
    }
    for (let k = 0; k <= 3; k++)
      posts.push(pose(onWall(f, top + (along * T.len * k) / 3, T.deep - ESC.panel / 2, floor + T.rail / 2), turn));
    posts.push(pose(onWall(f, far - (along * ESC.panel) / 2, ESC.panel, floor + T.rail / 2), turn));
    doors.push(pose(onWall(f, mid + along * 0.3, ESC_DOOR.out, floor + ESC_DOOR.h / 2), turn));
  }
  // (the body is a metre long and scaled to the length of the run; its top takes the steps, its sides and foot stay dark)
  add(boxGeo(1, ESC.thick, ESC.w), [steelDark, steelDark, tread, steelDark, steelDark, steelDark], bodies);
  add(boxGeo(1, plateH, ESC.panel), plate, plates);
  add(boxGeo(1, glassH, ESC.panel), glass, glasses);
  add(boxGeo(1, ESC.rail, ESC.railW), rubber, rails);
  add(boxGeo(ESC.landing, 0.12, ESC.w + 0.24), [iron, iron, landingTread, iron, iron, iron], landings);
  add(boxGeo(ESC.comb, 0.03, ESC.w - 0.2), flat(PAINT.amber1), combs);
  const brass = flat(BRASS),
    slabSide = flat(ESC_SLAB),
    doorSide = flat(DESK_FRONT);
  add(
    boxGeo(ESC_TOP.len, ESC_TOP.thick, ESC_TOP.deep),
    [slabSide, slabSide, marble, slabSide, slabSide, slabSide],
    tops,
  );
  add(boxGeo(ESC_TOP.len, 0.08, ESC_TOP.nosing), brass, noses);
  add(boxGeo(ESC_TOP.deep, 0.08, ESC_TOP.nosing), brass, endNoses);
  // (the glass and the handrails are a metre long and scaled to their side)
  add(boxGeo(1, ESC_TOP.rail, ESC.panel), glass, topGlasses);
  add(boxGeo(1, ESC_TOP.post, ESC_TOP.post * 1.4), brass, topRails);
  add(boxGeo(ESC_TOP.post, ESC_TOP.rail, ESC_TOP.post), iron, posts);
  add(
    boxGeo(ESC_DOOR.w, ESC_DOOR.h, 0.03),
    [doorSide, doorSide, doorSide, doorSide, new THREE.MeshBasicMaterial({ map: tex.door }), doorSide],
    doors,
  );

  // ---- the security gates: low posts in a row beside the reception desk ----
  const gateBodies: THREE.Matrix4[] = [],
    gateCaps: THREE.Matrix4[] = [],
    gateLamps: THREE.Matrix4[] = [];
  for (const { f, off } of deskFaces) {
    // one row of gates, by the first reception desk that takes them
    if (gateBodies.length || rng.next() >= GATE.chance) continue;
    const side = rng.pick([-1, 1]),
      first = off + side * (DESK.w / 2 + 1.1);
    for (let n = rng.randi(GATE.n[0], GATE.n[1]); n > 0; n--) {
      const go = first + side * (n - 1) * GATE.gap;
      gateBodies.push(spot(f, go, GATE.out, GATE.h / 2));
      gateCaps.push(spot(f, go, GATE.out, GATE.h + 0.03));
      gateLamps.push(spot(f, go, GATE.out + GATE.d / 2 + 0.02, GATE.h - 0.22));
    }
  }
  add(boxGeo(GATE.w, GATE.h, GATE.d), steelDark, gateBodies);
  add(boxGeo(GATE.w + 0.08, 0.06, GATE.d + 0.08), steel, gateCaps);
  add(boxGeo(0.12, GATE.lamp, 0.03), green, gateLamps);

  // ---- pots with dead trees, benches and the directory board: by the walls and round the pillars ----
  const pots: THREE.Matrix4[] = [],
    soils: THREE.Matrix4[] = [],
    trunks: THREE.Matrix4[] = [],
    branches: THREE.Matrix4[] = [],
    slats: THREE.Matrix4[] = [],
    benchLegs: THREE.Matrix4[] = [],
    boards: THREE.Matrix4[] = [],
    boardLegs: THREE.Matrix4[] = [];
  for (const f of open) {
    if (pots.length < POT.max && rng.next() < POT.chance) {
      const off = rng.rand(-1.2, 1.2),
        out = rng.rand(POT.out[0], POT.out[1]),
        top = POT.h + 0.03;
      pots.push(spot(f, off, out, POT.h / 2));
      soils.push(spot(f, off, out, POT.h + 0.01));
      trunks.push(spot(f, off, out, top + POT.trunk / 2, 0, rng.rand(-0.09, 0.09)));
      for (let n = rng.randi(POT.branch[0], POT.branch[1]); n > 0; n--) {
        const yaw = rng.rand(0, Math.PI * 2),
          tilt = rng.rand(0.35, 0.9);
        branches.push(
          spot(
            f,
            off + Math.cos(yaw) * 0.08,
            out + Math.sin(yaw) * 0.08,
            top + POT.trunk * 0.72 + rng.rand(-0.18, 0.22),
            yaw,
            tilt,
            new THREE.Vector3(1, rng.rand(0.45, 0.85), 1),
          ),
        );
      }
    }
    if (slats.length < BENCH.max * BENCH.slats && rng.next() < BENCH.chance) {
      const off = rng.rand(-1.2, 1.2),
        out = rng.rand(BENCH.out[0], BENCH.out[1]);
      for (let n = 0; n < BENCH.slats; n++)
        slats.push(spot(f, off, out + (n - (BENCH.slats - 1) / 2) * (BENCH.d / BENCH.slats), BENCH.h));
      for (const a of [-1, 1]) benchLegs.push(spot(f, off + a * (BENCH.w / 2 - 0.12), out, BENCH.h / 2));
    }
    if (boards.length < BOARD.max && rng.next() < BOARD.chance) {
      boards.push(
        spot(f, rng.rand(-1.0, 1.0), rng.rand(BOARD.out[0], BOARD.out[1]), BOARD.thick / 2, rng.rand(-0.5, 0.5)),
      );
      boardLegs.push(spot(f, rng.rand(-1.3, 1.3), rng.rand(BOARD.out[0], BOARD.out[1]), 0.05, rng.rand(0, Math.PI)));
    }
  }
  add(cylGeo(POT.r, POT.r * 0.82, POT.h, 10), clay, pots);
  add(cylGeo(POT.r * 0.84, POT.r * 0.84, 0.05, 10), soil, soils);
  add(cylGeo(POT.trunkR, POT.trunkR * 1.3, POT.trunk, 6), twig, trunks);
  add(cylGeo(0.018, 0.03, 1, 5), twig, branches);
  add(boxGeo(BENCH.w, 0.06, BENCH.d / BENCH.slats - 0.02), wood, slats);
  add(boxGeo(0.08, BENCH.h, BENCH.d - 0.06), iron, benchLegs);
  const boardSide = flat(DESK_SIDE);
  add(
    boxGeo(BOARD.w, BOARD.thick, BOARD.d),
    [boardSide, boardSide, new THREE.MeshBasicMaterial({ map: tex.board }), boardSide, boardSide, boardSide],
    boards,
  );
  add(boxGeo(0.05, 0.06, 0.5), iron, boardLegs);

  // ---- the light on the floor: the low sun through the glass, the green of the emergency lamps ----
  for (const f of edges) {
    const picture = pictureOf(f);
    if (CITY_HALL_GLASS_WALLS.includes(picture) && rng.next() < SUN_POOL.chance) {
      const at = onWall(f, rng.rand(-1.3, 1.3), rng.rand(SUN_POOL.out[0], SUN_POOL.out[1]), 0);
      lights.push({
        x: at.x,
        z: at.z,
        color: SUN_COLOR,
        size: rng.rand(SUN_POOL.size[0], SUN_POOL.size[1]),
      });
    }
    if (CITY_HALL_EXIT_WALLS.includes(picture) && rng.next() < GREEN_POOL.chance) {
      const at = onWall(f, rng.rand(-0.8, 0.8), GREEN_POOL.out, 0);
      lights.push({ x: at.x, z: at.z, color: GREEN_COLOR, size: GREEN_POOL.size });
    }
  }
  pools(lights, POOL_OPACITY);
}
