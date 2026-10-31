import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { T } from '@engine/world/tiles.ts';
import { css } from '../../../data/colors.ts';
import { HALL_H } from '../../../data/level.ts';
import { NOISE_ON_AIR } from '../../../i18n/signs.ts';
import type { FloorPlan } from '../../building.ts';
import { FULL_SIZE, facing, lightMat, onWall, pose } from '../props.ts';
import type { Light, PropTools } from '../props.ts';
import { wallPic } from '../common.ts';
import { hallSurround } from '../hallFaces.ts';
import { canvasTex, poolTex } from '../paint.ts';
import { NOISE_ALL_WALLS, NOISE_HALL_CABINET_WALLS, NOISE_HALL_PLAIN_WALLS, NOISE_ROOM_WALLS } from './pictures.ts';
import {
  CABLE_TONES,
  HALL_HOUSING,
  HALL_METAL,
  HALL_ON_AIR,
  HALL_ON_AIR_DARK,
  HALL_STEEL,
  HALL_STUDIO_LIGHT,
  HALL_VALVE,
  HALL_WELL,
} from './strokes.ts';
// What stands in the deep noise's big studio (its boss room), all of it for the eye: it has no body in the tile world,
// and all of it stays close to the walls (a metre or so out) or lies on the floor beside them, so nothing is in the
// way of the fight. CORE hangs in the middle of the room and sweeps its lasers across it, BASTION stands there, so the
// middle of the room and the air over it are left empty. Under the ceiling, along the walls: a lighting truss with
// studio lamps hanging from it. On the floor, by the walls: lamps on stands, a camera on its pedestal, reels and
// coils of cable. On the walls: a lamp box saying "ON AIR", and the glow of the transmitter's valves, which also
// lights the floor before the cabinets.
// ---- tuning numbers used only here ----
const TRUSS = { y: HALL_H - 1.7, h: 0.4, out: 0.6, r: 0.035, bays: 4, brace: 0.04 }; // the truss along a wall: its height, depth (m), distance from the wall, tube radius, diagonals per tile
const TRUSS_LAMP = { chance: 0.45, drop: 0.55, yoke: 0.5, cols: 4 }; // a lamp hung from the truss (share of the places that take one)
const LAMP = { w: 0.36, h: 0.34, deep: 0.42 }; // a studio lamp's can (m)
const STAND = { chance: 0.13, out: [0.6, 1.1] as const, y: 1.85, pole: 0.025, aim: 0.7 }; // a lamp on a stand: chance per wall face, its distance from the wall, the height of the lamp, the sway of its aim (rad)
const FOOT_R = 0.3; // the disc under a stand or a pedestal (m)
const CAMERA = { chance: 0.07, max: 2, out: [0.8, 1.3] as const, y: 1.4, aim: 0.5, pillar: 0.1 }; // a camera on a pedestal
const CAMERA_BODY = { w: 0.34, h: 0.38, deep: 0.7 };
const REEL = { chance: 0.17, out: [0.5, 1.0] as const, r: 0.42, wound: 0.27, width: 0.4, flange: 0.04 }; // a reel of cable standing on its side
const COIL = { chance: 0.15, out: [0.5, 1.1] as const, r: 0.34, tube: 0.05, turns: 3 }; // cable coiled on the floor
const ON_AIR = { chance: 0.22, max: 2, w: 1.15, h: 0.4, thick: 0.16, y: 3.9, glow: 2.2, glowOpacity: 0.22 }; // the lamp box on a wall
const VALVE_GLOW = { w: 3.4, h: 1.5, y: 3.3, opacity: 0.25 }; // the warm light over a transmitter's window
const VALVE_POOL = { size: 0.45, out: 1.1 }; // the light before a cabinet on the floor
const POOL_OPACITY = 0.3; // the light thrown on the floor: weak, so the floor stays dark
const ON_AIR_FONT = '"Helvetica Neue","Arial",sans-serif';

let shared: { lens: THREE.CanvasTexture; onAir: THREE.CanvasTexture } | null = null;
// the front of a studio lamp: the dark can, a round pale lens, the barn doors folded back
const lensTex = () =>
  canvasTex(64, 64, g => {
    g.fillStyle = css(HALL_HOUSING);
    g.fillRect(0, 0, 64, 64);
    const fade = g.createRadialGradient(32, 32, 2, 32, 32, 22);
    fade.addColorStop(0, '#ffffff');
    fade.addColorStop(0.6, css(HALL_STUDIO_LIGHT));
    fade.addColorStop(1, css(HALL_STEEL));
    g.fillStyle = fade;
    g.beginPath();
    g.arc(32, 32, 22, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = css(HALL_WELL);
    g.lineWidth = 3;
    g.strokeRect(2, 2, 60, 60);
  });
// the lamp box, lit: red letters in a dark frame
const onAirTex = () =>
  canvasTex(256, 88, g => {
    g.fillStyle = css(HALL_ON_AIR_DARK);
    g.fillRect(0, 0, 256, 88);
    g.strokeStyle = css(HALL_HOUSING);
    g.lineWidth = 8;
    g.strokeRect(4, 4, 248, 80);
    g.font = `900 52px ${ON_AIR_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = css(HALL_ON_AIR);
    g.shadowBlur = 14;
    g.fillStyle = css(HALL_ON_AIR);
    g.fillText(NOISE_ON_AIR, 128, 47, 220);
  });

export function hallProps(plan: FloorPlan, tools: Pick<PropTools, 'add' | 'd' | 'pools'>, rng: Rng) {
  if (!plan.hall) return;
  shared ??= { lens: lensTex(), onAir: onAirTex() };
  const tex = shared,
    { add, d, pools } = tools,
    lights: Light[] = [],
    { open, pictureOf } = hallSurround(plan, d, wall =>
      wallPic(d, wall, { count: NOISE_ALL_WALLS, rooms: NOISE_ROOM_WALLS }),
    ),
    edges = open.filter(f => f.edge),
    cabinets = edges.filter(f => NOISE_HALL_CABINET_WALLS.includes(pictureOf(f))),
    plained = edges.filter(f => NOISE_HALL_PLAIN_WALLS.includes(pictureOf(f))),
    flat = (color: number) => new THREE.MeshBasicMaterial({ color }),
    // (white: each copy has its own colour)
    tinted = new THREE.MeshBasicMaterial({ color: 0xffffff }),
    metal = flat(HALL_METAL),
    steel = flat(HALL_STEEL),
    housing = flat(HALL_HOUSING),
    // (the faces of a box: +x, -x, up, down, +z, -z; +z looks away from the wall)
    lensFace = [housing, housing, housing, housing, new THREE.MeshBasicMaterial({ map: tex.lens }), housing],
    lampGeo = new THREE.BoxGeometry(LAMP.w, LAMP.h, LAMP.deep),
    lamps: THREE.Matrix4[] = [];

  // ---- the truss along each wall under the ceiling: two tubes, the zigzag between them, brackets to the wall ----
  const chords: THREE.Matrix4[] = [],
    braces: THREE.Matrix4[] = [],
    brackets: THREE.Matrix4[] = [],
    yokes: THREE.Matrix4[] = [],
    pitch = T / TRUSS.bays,
    slope = Math.atan2(TRUSS.h, pitch / 2);
  for (const f of edges) {
    const turn = facing(f);
    for (const dy of [-1, 1]) chords.push(pose(onWall(f, 0, TRUSS.out, TRUSS.y + (dy * TRUSS.h) / 2), turn));
    for (let b = 0; b < TRUSS.bays * 2; b++)
      braces.push(
        pose(onWall(f, (b + 0.5) * (pitch / 2) - T / 2, TRUSS.out, TRUSS.y), turn, FULL_SIZE, b % 2 ? -slope : slope),
      );
    for (const off of [-T * 0.4, T * 0.4])
      brackets.push(pose(onWall(f, off, TRUSS.out / 2, TRUSS.y + TRUSS.h / 2), turn));
    for (let c = 0; c < TRUSS_LAMP.cols; c++) {
      if (rng.next() >= TRUSS_LAMP.chance) continue;
      const off = ((c + 0.5) / TRUSS_LAMP.cols - 0.5) * T;
      lamps.push(pose(onWall(f, off, TRUSS.out, TRUSS.y - TRUSS_LAMP.drop), turn + rng.rand(-0.3, 0.3)));
      yokes.push(pose(onWall(f, off, TRUSS.out, TRUSS.y - TRUSS_LAMP.yoke / 2), turn));
    }
  }
  add(new THREE.CylinderGeometry(TRUSS.r, TRUSS.r, T, 6).rotateZ(Math.PI / 2), metal, chords);
  add(new THREE.BoxGeometry(Math.hypot(pitch / 2, TRUSS.h), TRUSS.brace, TRUSS.brace), metal, braces);
  add(new THREE.BoxGeometry(0.06, 0.06, TRUSS.out), metal, brackets);
  add(new THREE.BoxGeometry(0.04, TRUSS_LAMP.yoke, 0.04), housing, yokes);

  // ---- lamps on stands, by the walls ----
  const poles: THREE.Matrix4[] = [],
    feet: THREE.Matrix4[] = [];
  for (const f of edges) {
    if (rng.next() >= STAND.chance) continue;
    const out = rng.rand(STAND.out[0], STAND.out[1]),
      off = rng.rand(-1.4, 1.4),
      turn = facing(f);
    feet.push(pose(onWall(f, off, out, 0.03), turn));
    poles.push(pose(onWall(f, off, out, STAND.y / 2), turn));
    lamps.push(pose(onWall(f, off, out, STAND.y), turn + rng.rand(-STAND.aim, STAND.aim)));
  }
  add(new THREE.CylinderGeometry(STAND.pole, STAND.pole, STAND.y, 6), steel, poles);
  add(lampGeo, lensFace, lamps);

  // ---- a camera on its pedestal, by a wall (its foot is a disc like a stand's) ----
  const pillars: THREE.Matrix4[] = [],
    bodies: THREE.Matrix4[] = [],
    barrels: THREE.Matrix4[] = [],
    tallies: THREE.Matrix4[] = [];
  for (const f of edges) {
    if (bodies.length >= CAMERA.max || rng.next() >= CAMERA.chance) continue;
    const out = rng.rand(CAMERA.out[0], CAMERA.out[1]),
      off = rng.rand(-1.2, 1.2),
      turn = facing(f) + rng.rand(-CAMERA.aim, CAMERA.aim),
      ahead = new THREE.Vector3(Math.sin(turn), 0, Math.cos(turn)),
      at = onWall(f, off, out, CAMERA.y);
    feet.push(pose(onWall(f, off, out, 0.03), turn));
    pillars.push(pose(onWall(f, off, out, CAMERA.y / 2 - 0.1), turn));
    bodies.push(pose(at, turn));
    barrels.push(pose(at.clone().addScaledVector(ahead, CAMERA_BODY.deep / 2 + 0.1), turn));
    tallies.push(
      pose(
        at
          .clone()
          .addScaledVector(ahead, 0.2)
          .setY(CAMERA.y + CAMERA_BODY.h / 2 + 0.04),
        turn,
      ),
    );
  }
  add(new THREE.CylinderGeometry(FOOT_R, FOOT_R, 0.06, 10), housing, feet);
  add(new THREE.CylinderGeometry(CAMERA.pillar, CAMERA.pillar * 1.3, CAMERA.y - 0.2, 8), steel, pillars);
  add(new THREE.BoxGeometry(CAMERA_BODY.w, CAMERA_BODY.h, CAMERA_BODY.deep), housing, bodies);
  add(new THREE.CylinderGeometry(0.1, 0.14, 0.24, 10).rotateX(Math.PI / 2), flat(HALL_WELL), barrels);
  add(new THREE.BoxGeometry(0.07, 0.05, 0.07), flat(HALL_ON_AIR), tallies);

  // ---- reels and coils of cable on the floor ----
  const reels: THREE.Matrix4[] = [],
    woundColors: number[] = [],
    coils: THREE.Matrix4[] = [],
    coilColors: number[] = [];
  for (const f of edges) {
    if (rng.next() < REEL.chance) {
      reels.push(
        pose(
          onWall(f, rng.rand(-1.3, 1.3), rng.rand(REEL.out[0], REEL.out[1]), REEL.r),
          facing(f) + (rng.next() < 0.5 ? Math.PI / 2 : 0) + rng.rand(-0.3, 0.3),
        ),
      );
      woundColors.push(rng.pick(CABLE_TONES));
    }
    if (rng.next() < COIL.chance) {
      const turn = facing(f) + rng.rand(-1, 1),
        base = onWall(f, rng.rand(-1.3, 1.3), rng.rand(COIL.out[0], COIL.out[1]), COIL.tube),
        color = rng.pick(CABLE_TONES);
      for (let n = 0; n < COIL.turns; n++) {
        coils.push(
          pose(base.clone().setY(COIL.tube * (1 + 2 * n)), turn, new THREE.Vector3(1 - n * 0.08, 1, 1 - n * 0.08)),
        );
        coilColors.push(color);
      }
    }
  }
  const flange = new THREE.CylinderGeometry(REEL.r, REEL.r, REEL.flange, 14).rotateX(Math.PI / 2);
  add(flange.clone().translate(0, 0, REEL.width / 2), steel, reels);
  add(flange.clone().translate(0, 0, -REEL.width / 2), steel, reels);
  add(
    new THREE.CylinderGeometry(REEL.wound, REEL.wound, REEL.width, 14).rotateX(Math.PI / 2),
    tinted,
    reels,
    woundColors,
  );
  add(new THREE.TorusGeometry(COIL.r, COIL.tube, 6, 16).rotateX(Math.PI / 2), tinted, coils, coilColors);

  // ---- the lamp box on a plain wall, lit, with its red light on the wall round it ----
  const boxes: THREE.Matrix4[] = [],
    boxGlow: THREE.Matrix4[] = [];
  for (const f of plained) {
    if (boxes.length >= ON_AIR.max || rng.next() >= ON_AIR.chance) continue;
    const off = rng.rand(-0.9, 0.9),
      turn = facing(f);
    boxes.push(pose(onWall(f, off, ON_AIR.thick / 2, ON_AIR.y), turn));
    boxGlow.push(pose(onWall(f, off, 0.03, ON_AIR.y), turn));
  }
  const front = new THREE.MeshBasicMaterial({ map: tex.onAir });
  add(
    new THREE.BoxGeometry(ON_AIR.w, ON_AIR.h, ON_AIR.thick),
    [housing, housing, housing, housing, front, housing],
    boxes,
  );
  add(
    new THREE.PlaneGeometry(ON_AIR.glow, ON_AIR.glow * 0.7),
    lightMat(poolTex(), ON_AIR.glowOpacity, HALL_ON_AIR),
    boxGlow,
  );

  // ---- the glow of the valves: over each cabinet's windows, and on the floor before it ----
  const spill: THREE.Matrix4[] = [];
  for (const f of cabinets) {
    spill.push(pose(onWall(f, 0, 0.05, VALVE_GLOW.y), facing(f)));
    const at = onWall(f, 0, VALVE_POOL.out, 0);
    lights.push({ x: at.x, z: at.z, color: HALL_VALVE, size: VALVE_POOL.size });
  }
  add(new THREE.PlaneGeometry(VALVE_GLOW.w, VALVE_GLOW.h), lightMat(poolTex(), VALVE_GLOW.opacity, HALL_VALVE), spill);
  pools(lights, POOL_OPACITY);
}
