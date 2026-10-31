import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { T } from '@engine/world/tiles.ts';
import { PAINT, css } from '../../../data/colors.ts';
import { HALL_H } from '../../../data/level.ts';
import type { FloorPlan } from '../../building.ts';
import { wallPic } from '../common.ts';
import { hallSurround } from '../hallFaces.ts';
import { canvasTex } from '../paint.ts';
import { facing, hallLine, onWall, pose } from '../props.ts';
import type { Light, PropTools } from '../props.ts';
import { seeded } from '../cutoutTools.ts';
import { DRUM as DRUM_PAINTS, chainsTex } from './cutouts.ts';
import {
  FORGE_ALL_WALLS,
  FORGE_HALL_MOUTH_WALLS,
  FORGE_HALL_PLAIN_WALLS,
  FORGE_HALL_STORE_WALLS,
  FORGE_HALL_TAP_WALLS,
  FORGE_ROOM_WALLS,
} from './pictures.ts';
import { VALVE_RED } from './strokes.ts';
// What stands in the smelter block's casting hall (its boss room), all of it for the eye: it has no body in the tile
// world, and all of it stays close to the walls or lies flat on the floor, so nothing
// is in the way of the fight. At the furnaces: a trough of metal raised on legs along the wall (orange and yellow,
// seen from above; it is not on the floor, so it does not read as the damaging floor), ladles, a hood and a duct up to
// the roof, sparks. Along the other walls: piles of ingots, oil drums, a coil of chain, pipes and risers, chains on a
// beam, a sodium lamp on a bracket every other tile. It stays clear of what the boss crane sweeps, HOIST: its rails
// run 2 m in from the walls at 11 to 11.8 m and its bridge is at 9.4 to 10.7 m, so everything here is under 8 m or
// within a metre of the wall (the duct, which goes up to the roof, is 0.7 m out). A ladle before a tap is the furthest
// out, under 2 m.
// ---- tuning numbers used only here ----
const TROUGH = { len: 3.6, w: 0.7, h: 0.24, y: 0.3, out: 0.36, leg: 0.1, glow: 0.46, glowY: 0.435 }; // the raised trough (m)
const LADLE = { top: 0.62, bottom: 0.46, h: 1.3, base: 0.2, rim: 0.05, trunnion: 0.95, bail: 0.72 }; // a ladle (m)
const LADLE_OUT = { tap: 1.3, mouth: 1.0 }; // how far out its middle stands, before a tap and before a mouth (m)
const LADLE_CHANCE = { tap: 0.85, mouth: 0.4 };
const INGOT = { w: 0.62, h: 0.16, deep: 0.3, rows: 4, out: 0.45, chance: 0.32 }; // a pile of ingots (m), two deep
const DRUM = { r: 0.3, h: 0.9, gap: 0.64, out: 0.55, chance: 0.3 }; // oil drums in a row
const CHAIN_COIL = { r: 0.45, tube: 0.06, out: 1.0, chance: 0.2 }; // a coil of chain on the floor
const PIPES = { chance: 0.45, y: [2.7, 3.25] as const, r: 0.1, out: 0.22, riser: 0.35, top: 8 }; // pipes along a wall, risers
const HOOD = { y: 3.95, h: 1.2, top: 0.64, bottom: 1.7, depth: 0.66, out: 0.4 }; // the hood over a furnace mouth (m)
const DUCT = { w: 0.9, deep: 0.6, out: 0.4, flanges: [6.3, 8.4, 10.5] as const }; // the duct up to the roof (m)
const CHAINS = { chance: 0.3, y: 5, w: 1.6, h: 2.6, out: 0.55, beam: 6.4 }; // chains hung from a beam, on a plain wall
const LAMP = { y: 7.4, out: 0.9, size: 1.3, color: PAINT.amber6, glow: PAINT.glow3 }; // a sodium lamp on its bracket
const LINE = { w: 0.16, thick: 0.02, y: 0.03, out: 1.9, color: 0x8c7424 }; // the worn yellow line along a wall
const POOL_OPACITY = 0.3; // the light thrown on the floor (the plant's own lamps throw 0.5): weak, so no floor glows
const FURNACE_POOL = { mouth: 1.5, tap: 1.1 }; // the size of the pool before a furnace (the lamps' size is 1)
const SPARK = { w: 1.7, h: 1.3, out: 0.4, frames: 3, every: 140, opacity: 0.9 }; // sparks; the frame changes every `every` ms
const SPARK_Y = [1.1, 2.5] as const; // the heights of the two sheets of sparks at a furnace
const INGOTS = [0x8a9096, 0x6f757c, 0x9ba1a7, 0x5d636a, 0x9a7a5a, 0xc9702a]; // cold steel, cast iron, one still hot
const DRUMS = DRUM_PAINTS.map(c => new THREE.Color(c).getHex()); // the paints of the plant's own drums (cutouts.ts)
const PIPE_TINTS = [0x6b5a4c, 0x8b8179, 0x5a504a, 0x9a5a3c];
const IRON = 0x4c443e; // the iron of a ladle's rim and pins
const IRON_DARK = 0x2b2623; // flanges, the trough, a ladle's stand
const IRON_HOOP = 0x1c1815; // the hoops of a drum
const LADLE_FIRE = [0xff9a3a, 0xffc866, 0x3b2a22]; // what is in a ladle: metal, white-hot metal, a crust

let shared: {
  trough: THREE.CanvasTexture;
  sheet: THREE.CanvasTexture;
  sparks: THREE.CanvasTexture[];
  chains: THREE.CanvasTexture[];
} | null = null;
// the metal in the trough, seen from above (a picture along its length): yellow where it is hottest, orange toward the
// ends, a dark crust along both edges
const troughTex = () =>
  canvasTex(256, 64, g => {
    const rand = seeded(5150);
    g.fillStyle = '#e8731c';
    g.fillRect(0, 0, 256, 64);
    const hot = g.createRadialGradient(40, 32, 4, 40, 32, 150);
    hot.addColorStop(0, 'rgba(255,240,150,1)');
    hot.addColorStop(0.5, 'rgba(255,200,80,.8)');
    hot.addColorStop(1, 'rgba(255,200,80,0)');
    g.fillStyle = hot;
    g.fillRect(0, 0, 256, 64);
    for (let k = 0; k < 18; k++) {
      g.fillStyle = `rgba(255,${200 + Math.floor(rand() * 50)},110,${0.2 + rand() * 0.3})`;
      g.fillRect(rand() * 220, 8 + rand() * 48, 14 + rand() * 40, 2);
    }
    const crust = g.createLinearGradient(0, 0, 0, 64);
    crust.addColorStop(0, 'rgba(50,20,8,.85)');
    crust.addColorStop(0.28, 'rgba(50,20,8,0)');
    crust.addColorStop(0.72, 'rgba(50,20,8,0)');
    crust.addColorStop(1, 'rgba(50,20,8,.85)');
    g.fillStyle = crust;
    g.fillRect(0, 0, 256, 64);
    const ends = g.createLinearGradient(0, 0, 256, 0);
    ends.addColorStop(0.8, 'rgba(50,20,8,0)');
    ends.addColorStop(1, 'rgba(50,20,8,.6)');
    g.fillStyle = ends;
    g.fillRect(0, 0, 256, 64);
  });
// the sheet metal of the hood and the duct: dark iron lit from one side, rust and soot running down it, a row of rivets
// at the top and the foot
const ductTex = () =>
  canvasTex(64, 128, g => {
    const rand = seeded(5170),
      sheet = g.createLinearGradient(0, 0, 64, 0);
    sheet.addColorStop(0, css(IRON_DARK));
    sheet.addColorStop(0.35, '#5a4e45');
    sheet.addColorStop(1, css(IRON_DARK));
    g.fillStyle = sheet;
    g.fillRect(0, 0, 64, 128);
    for (let k = 0; k < 9; k++) {
      const len = 30 + rand() * 90,
        rust = g.createLinearGradient(0, 0, 0, len);
      rust.addColorStop(0, 'rgba(150,76,36,.45)');
      rust.addColorStop(1, 'rgba(150,76,36,0)');
      g.fillStyle = rust;
      g.fillRect(rand() * 60, rand() * 40, 2 + rand() * 5, len);
    }
    const cloud = g.createLinearGradient(0, 0, 0, 128);
    cloud.addColorStop(0, 'rgba(10,8,6,.6)');
    cloud.addColorStop(0.6, 'rgba(10,8,6,0)');
    g.fillStyle = cloud;
    g.fillRect(0, 0, 64, 128);
    g.fillStyle = 'rgba(180,164,150,.6)';
    for (const y of [5, 123]) for (let x = 6; x < 64; x += 12) g.fillRect(x, y, 3, 3);
  });
// a sheet of sparks: bright streaks flying out and down, and a few dots (a few sheets, shown one after another)
const sparkTex = (seed: number) =>
  canvasTex(128, 128, g => {
    const rand = seeded(seed);
    for (let k = 0; k < 11; k++) {
      const x = 14 + rand() * 100,
        y = 10 + rand() * 90,
        dx = (rand() - 0.4) * 22,
        dy = 6 + rand() * 18,
        streak = g.createLinearGradient(x, y, x + dx, y + dy);
      streak.addColorStop(0, 'rgba(255,250,210,1)');
      streak.addColorStop(1, 'rgba(255,140,40,0)');
      g.strokeStyle = streak;
      g.lineWidth = 1.5 + rand() * 1.5;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + dx, y + dy);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,225,150,.9)';
    for (let k = 0; k < 6; k++) g.fillRect(8 + rand() * 112, 8 + rand() * 112, 2, 2);
  });

export function hallProps(plan: FloorPlan, tools: Pick<PropTools, 'add' | 'd' | 'pools'>, rng: Rng) {
  if (!plan.hall) return;
  shared ??= {
    trough: troughTex(),
    sheet: ductTex(),
    sparks: Array.from({ length: SPARK.frames }, (_, n) => sparkTex(5160 + n)),
    chains: [0, 1, 2].map(n => chainsTex(780 + n)),
  };
  const tex = shared,
    { add, d, pools } = tools,
    lights: Light[] = [],
    { open, pictureOf } = hallSurround(plan, d, wall =>
      wallPic(d, wall, { count: FORGE_ALL_WALLS, rooms: FORGE_ROOM_WALLS }),
    ),
    edges = open.filter(f => f.edge),
    mouths = edges.filter(f => FORGE_HALL_MOUTH_WALLS.includes(pictureOf(f))),
    taps = edges.filter(f => FORGE_HALL_TAP_WALLS.includes(pictureOf(f))),
    stores = edges.filter(f => FORGE_HALL_STORE_WALLS.includes(pictureOf(f))),
    plainWalls = edges.filter(f => FORGE_HALL_PLAIN_WALLS.includes(pictureOf(f))),
    flat = (color: number) => new THREE.MeshBasicMaterial({ color }),
    // (white: each copy has its own colour)
    tinted = new THREE.MeshBasicMaterial({ color: 0xffffff }),
    dark = flat(IRON_DARK);

  // ---- the worn yellow line along every wall and round every pillar ----
  hallLine(add, open, LINE);

  // ---- the furnaces: the trough along the wall, a hood and a duct, the light, the sparks ----
  const bodies: THREE.Matrix4[] = [],
    legs: THREE.Matrix4[] = [],
    glows: THREE.Matrix4[] = [],
    hoods: THREE.Matrix4[] = [],
    ducts: THREE.Matrix4[] = [],
    flanges: THREE.Matrix4[] = [],
    sparkAt: THREE.Matrix4[] = [];
  for (const f of taps) {
    const turn = facing(f);
    bodies.push(pose(onWall(f, 0, TROUGH.out, TROUGH.y), turn));
    for (const end of [-1, 1])
      legs.push(pose(onWall(f, (end * (TROUGH.len - TROUGH.leg)) / 2, TROUGH.out, TROUGH.y / 2), turn));
    glows.push(pose(onWall(f, 0, TROUGH.out, TROUGH.glowY), turn));
    const on = onWall(f, 0, 1.5, 0);
    lights.push({ x: on.x, z: on.z, color: LAMP.glow, size: FURNACE_POOL.tap });
    for (const y of SPARK_Y) sparkAt.push(pose(onWall(f, rng.rand(-0.6, 0.6), SPARK.out, y), turn));
  }
  for (const f of mouths) {
    const turn = facing(f);
    hoods.push(pose(onWall(f, 0, HOOD.out, HOOD.y + HOOD.h / 2), turn, new THREE.Vector3(1, 1, HOOD.depth)));
    ducts.push(pose(onWall(f, 0, DUCT.out, (HOOD.y + HOOD.h + HALL_H) / 2), turn));
    for (const y of DUCT.flanges) flanges.push(pose(onWall(f, 0, DUCT.out, y), turn));
    const on = onWall(f, 0, 1.6, 0);
    lights.push({ x: on.x, z: on.z, color: LAMP.glow, size: FURNACE_POOL.mouth });
    for (const y of SPARK_Y) sparkAt.push(pose(onWall(f, rng.rand(-0.6, 0.6), SPARK.out, y), turn));
  }
  add(new THREE.BoxGeometry(TROUGH.len, TROUGH.h, TROUGH.w), dark, bodies);
  add(new THREE.BoxGeometry(TROUGH.leg, TROUGH.y, TROUGH.w - 0.2), dark, legs);
  add(
    new THREE.PlaneGeometry(TROUGH.len - 0.2, TROUGH.glow).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: tex.trough }),
    glows,
  );
  // (a square frustum, turned so that its sides face the wall and the room; squeezed to a share of its width in depth)
  add(
    new THREE.CylinderGeometry(HOOD.top, HOOD.bottom, HOOD.h, 4, 1, true).rotateY(Math.PI / 4),
    new THREE.MeshBasicMaterial({ map: tex.sheet, side: THREE.DoubleSide }),
    hoods,
  );
  add(
    new THREE.BoxGeometry(DUCT.w, HALL_H - HOOD.y - HOOD.h - 0.02, DUCT.deep),
    new THREE.MeshBasicMaterial({ map: tex.sheet }),
    ducts,
  );
  add(new THREE.BoxGeometry(DUCT.w + 0.2, 0.12, DUCT.deep + 0.2), dark, flanges);
  const sparks = add(
    new THREE.PlaneGeometry(SPARK.w, SPARK.h),
    new THREE.MeshBasicMaterial({
      map: tex.sparks[0]!,
      transparent: true,
      opacity: SPARK.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    sparkAt,
  );
  // the sparks jump from one sheet to the next a few times a second (only while they are drawn)
  if (sparks) {
    let frame = -1;
    const mat = sparks.material as THREE.MeshBasicMaterial;
    sparks.onBeforeRender = () => {
      const now = Math.floor(performance.now() / SPARK.every);
      if (now === frame) return;
      frame = now;
      mat.map = tex.sparks[now % SPARK.frames]!;
    };
  }

  // ---- ladles, before the taps and (now and then) before the mouths ----
  const ladleFaces = [
      ...taps.filter(() => rng.next() < LADLE_CHANCE.tap).map(f => ({ f, out: LADLE_OUT.tap })),
      ...mouths.filter(() => rng.next() < LADLE_CHANCE.mouth).map(f => ({ f, out: LADLE_OUT.mouth })),
    ],
    stands: THREE.Matrix4[] = [],
    pots: THREE.Matrix4[] = [],
    rims: THREE.Matrix4[] = [],
    surfaces: THREE.Matrix4[] = [],
    surfaceColors: number[] = [],
    pins: THREE.Matrix4[] = [],
    bails: THREE.Matrix4[] = [];
  for (const { f, out } of ladleFaces) {
    const turn = facing(f),
      off = out === LADLE_OUT.tap ? rng.rand(-1.2, 1.2) : rng.rand(-0.3, 0.3),
      at = (y: number) => onWall(f, off, out, y);
    stands.push(pose(at(LADLE.base / 2), turn));
    pots.push(pose(at(LADLE.base + LADLE.h / 2), turn));
    rims.push(pose(at(LADLE.base + LADLE.h), turn));
    surfaces.push(pose(at(LADLE.base + LADLE.h - 0.12), turn));
    surfaceColors.push(rng.pick(LADLE_FIRE));
    pins.push(pose(at(LADLE.trunnion), turn));
    bails.push(pose(at(LADLE.trunnion), turn));
  }
  add(new THREE.CylinderGeometry(LADLE.bottom + 0.04, LADLE.bottom + 0.1, LADLE.base, 10), dark, stands);
  add(
    new THREE.CylinderGeometry(LADLE.top, LADLE.bottom, LADLE.h, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x3b342f, side: THREE.DoubleSide }),
    pots,
  );
  add(new THREE.TorusGeometry(LADLE.top, LADLE.rim, 6, 16).rotateX(Math.PI / 2), flat(IRON), rims);
  add(new THREE.CircleGeometry(LADLE.top - LADLE.rim, 14).rotateX(-Math.PI / 2), tinted, surfaces, surfaceColors);
  add(new THREE.CylinderGeometry(0.05, 0.05, LADLE.top * 2 + 0.3, 6).rotateZ(Math.PI / 2), flat(IRON), pins);
  add(new THREE.TorusGeometry(LADLE.bail, 0.035, 5, 14, Math.PI), flat(IRON), bails);

  // ---- stores along the walls: ingots in piles, oil drums in rows, a coil of chain on the floor ----
  const ingotAt: THREE.Matrix4[] = [],
    ingotColors: number[] = [],
    drumAt: THREE.Matrix4[] = [],
    drumColors: number[] = [],
    hoops: THREE.Matrix4[] = [],
    coils: THREE.Matrix4[] = [];
  for (const f of stores) {
    const turn = facing(f),
      roll = rng.next();
    if (roll < INGOT.chance) {
      const off = rng.rand(-0.5, 0.5);
      for (let row = 0; row < INGOT.rows; row++) {
        const n = INGOT.rows - row;
        for (let c = 0; c < n; c++)
          for (const deep of [0, 1]) {
            ingotAt.push(
              pose(
                onWall(
                  f,
                  off + (c - (n - 1) / 2) * (INGOT.w + 0.03),
                  INGOT.out + deep * (INGOT.deep + 0.04),
                  INGOT.h * (row + 0.5),
                ),
                turn + rng.rand(-0.03, 0.03),
              ),
            );
            ingotColors.push(rng.pick(INGOTS));
          }
      }
    } else if (roll < INGOT.chance + DRUM.chance) {
      const n = rng.randi(2, 4),
        off = rng.rand(-0.4, 0.4);
      for (let c = 0; c < n; c++) {
        const p = onWall(f, off + (c - (n - 1) / 2) * DRUM.gap, DRUM.out + rng.rand(-0.04, 0.04), DRUM.h / 2);
        drumAt.push(pose(p, turn));
        drumColors.push(rng.pick(DRUMS));
        for (const y of [0.25, 0.65])
          hoops.push(pose(onWall(f, off + (c - (n - 1) / 2) * DRUM.gap, DRUM.out, y), turn));
      }
    }
    if (rng.next() < CHAIN_COIL.chance) {
      const side = rng.next() < 0.5 ? -1 : 1,
        p = onWall(f, side * 1.5, CHAIN_COIL.out, 0);
      for (let k = 0; k < 3; k++)
        coils.push(pose(new THREE.Vector3(p.x, CHAIN_COIL.tube * (1 + 2 * k), p.z), rng.rand(0, Math.PI)));
    }
  }
  add(new THREE.BoxGeometry(INGOT.w, INGOT.h, INGOT.deep), tinted, ingotAt, ingotColors);
  add(new THREE.CylinderGeometry(DRUM.r, DRUM.r, DRUM.h, 12), tinted, drumAt, drumColors);
  add(new THREE.CylinderGeometry(DRUM.r + 0.012, DRUM.r + 0.012, 0.05, 12), flat(IRON_HOOP), hoops);
  add(new THREE.TorusGeometry(CHAIN_COIL.r, CHAIN_COIL.tube, 5, 14).rotateX(Math.PI / 2), flat(0x3a3532), coils);

  // ---- pipes along the plain walls (two runs, flanged, now and then a riser with a valve) and chains on a beam ----
  const runs: THREE.Matrix4[] = [],
    runColors: number[] = [],
    collars: THREE.Matrix4[] = [],
    risers: THREE.Matrix4[] = [],
    riserColors: number[] = [],
    riserFlanges: THREE.Matrix4[] = [],
    wheels: THREE.Matrix4[] = [],
    beams: THREE.Matrix4[] = [],
    chainsOf = new Map<THREE.Texture, THREE.Matrix4[]>();
  for (const f of plainWalls) {
    const turn = facing(f);
    if (rng.next() < PIPES.chance) {
      PIPES.y.forEach(y => {
        runs.push(pose(onWall(f, 0, PIPES.out, y), turn));
        runColors.push(rng.pick(PIPE_TINTS));
        for (const off of [-1.2, 1.2]) collars.push(pose(onWall(f, off, PIPES.out, y), turn));
      });
      if (rng.next() < PIPES.riser) {
        const off = rng.next() < 0.5 ? -1.7 : 1.7;
        risers.push(pose(onWall(f, off, PIPES.out, PIPES.top / 2), turn));
        riserColors.push(rng.pick(PIPE_TINTS));
        for (const y of [0.9, 4.1, 7.2]) riserFlanges.push(pose(onWall(f, off, PIPES.out, y), turn));
        wheels.push(pose(onWall(f, off, PIPES.out + 0.3, 1.5), turn));
      }
    } else if (rng.next() < CHAINS.chance) {
      const map = rng.pick(tex.chains);
      (chainsOf.get(map) ?? chainsOf.set(map, []).get(map)!).push(
        pose(onWall(f, rng.rand(-1, 1), CHAINS.out, CHAINS.y), turn),
      );
      beams.push(pose(onWall(f, 0, CHAINS.out / 2, CHAINS.beam), turn));
    }
  }
  add(new THREE.CylinderGeometry(PIPES.r, PIPES.r, T - 0.4, 10).rotateZ(Math.PI / 2), tinted, runs, runColors);
  add(new THREE.CylinderGeometry(PIPES.r + 0.05, PIPES.r + 0.05, 0.1, 10).rotateZ(Math.PI / 2), dark, collars);
  add(new THREE.CylinderGeometry(PIPES.r + 0.02, PIPES.r + 0.02, PIPES.top, 10), tinted, risers, riserColors);
  add(new THREE.CylinderGeometry(PIPES.r + 0.07, PIPES.r + 0.07, 0.12, 10), dark, riserFlanges);
  const red = flat(VALVE_RED);
  add(new THREE.TorusGeometry(0.22, 0.035, 6, 16), red, wheels);
  add(new THREE.BoxGeometry(CHAINS.w, 0.14, 0.14), dark, beams);
  chainsOf.forEach((where, map) =>
    add(
      new THREE.PlaneGeometry(CHAINS.w, CHAINS.h),
      new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }),
      where,
    ),
  );

  // ---- a sodium lamp on a bracket every other tile, high on the wall ----
  const arms: THREE.Matrix4[] = [],
    shades: THREE.Matrix4[] = [],
    bulbs: THREE.Matrix4[] = [];
  for (const f of edges.filter(e => (e.i + e.j) % 2 === 0)) {
    const turn = facing(f);
    arms.push(pose(onWall(f, 0, LAMP.out / 2, LAMP.y + 0.28), turn + Math.PI / 2));
    shades.push(pose(onWall(f, 0, LAMP.out, LAMP.y)));
    bulbs.push(pose(onWall(f, 0, LAMP.out, LAMP.y - 0.2)));
    const on = onWall(f, 0, LAMP.out + 0.8, 0);
    lights.push({ x: on.x, z: on.z, color: LAMP.glow, size: LAMP.size });
  }
  add(new THREE.BoxGeometry(0.07, 0.07, LAMP.out), flat(0x4b4540), arms);
  add(
    new THREE.CylinderGeometry(0.16, 0.46, 0.36, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: IRON, side: THREE.DoubleSide }),
    shades,
  );
  add(new THREE.SphereGeometry(0.15, 10, 8), flat(LAMP.color), bulbs);
  // (the pools of light on the floor: weak)
  pools(lights, POOL_OPACITY);
}
