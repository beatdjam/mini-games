import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { tileCenter } from '@engine/world/tiles.ts';
import type { PropRule } from '@engine/world/slots.ts';
import { WALL_H } from '../../data/level.ts';
import type { FloorPlan } from '../building.ts';
import { WALL_PLAIN_SHARE, variantOf } from './common.ts';
import { poolTex } from './paint.ts';
import { facing, lightMat, onWall, pose, propTools } from './props.ts';
import type { Light, WallSlot } from './props.ts';
import { CABLES, DATA_WALLS, RACK, RACK_PICS } from './data.ts';
import type { WallPic } from './data.ts';
// The props of the discarded data layer (DATA): the things fixed to its walls and ceilings, and the light they throw. They go by the
// pictures on the walls (data.ts), which are painted there. world/looks.ts puts the two together.
// ---- tuning numbers used only here ----
const POOL_OPACITY = 0.38; // the light a tube throws on the ground (the floor is pale already)
const CEILING_GLOW = { size: 5, opacity: 0.4 }; // ... and on the ceiling round its fitting (m)
const WALL_GLOW = { size: 2.4, opacity: 0.3 }; // the light an emergency lamp throws on its wall (m)
const BARE_PICS: WallPic[] = ['panel', 'trunk']; // the walls with room for cables up them
// ---- the things on the walls and ceilings ----
// (all of them are above head height, EYE in src/data/level.ts, or flat against the wall, so nothing gets in front of
// the eye)
const DATA_PROPS: PropRule[] = [
  { id: 'tray', slots: ['wall'], blocks: false, count: [14, 20], gap: 2 },
  { id: 'bundle', slots: ['wall'], blocks: false, count: [20, 28], gap: 2 },
  { id: 'status', slots: ['wall'], blocks: false, count: [22, 30], gap: 2 },
  { id: 'emergency', slots: ['wall'], blocks: false, count: [8, 12], gap: 3 },
  { id: 'tube', slots: ['floor', 'center', 'corridor'], blocks: false, count: [16, 20], gap: 3 },
];
const TRAY = { len: 3.6, w: 0.5, y: 4.7, out: 0.34, rungs: 9 }; // a cable ladder along a wall, high up (m)
const BUNDLE = { r: 0.035, pitch: 0.085, out: 0.05, ties: [1.3, 3.1, 4.9] }; // cables up a wall, tied at these heights (m)
const STATUS_Y = RACK.top + 0.3; // a rack row's alarm unit, on the wall over the racks (m)
const EMERGENCY_Y = 3.7; // m
const TUBE = { len: 1.5, drop: 0.09 }; // a ceiling fitting's tubes (m)
// the tubes: cold white, some gone dim, one or two yellowed and about to fail (the pool under each is as bright as it is)
const TUBE_COLORS = [0xe3f0fb, 0xe3f0fb, 0xe3f0fb, 0xd3e3f2, 0x7d8b98, 0xa9a487];
const EMERGENCY_COLOR = 0xd9b77c;
const STATUS_LAMPS = [0x4fae74, 0xc2913a, 0xa8443a]; // an alarm unit's three lamps
const METAL = 0x89939b; // ladders, fittings
const HOUSING = 0x2a3036; // boxes, brackets
// Cable ladders along the walls under the ceiling, bundles of cables up the bare walls, a small alarm unit over some
// rack rows, emergency lamps on the walls with their glow, and tube fittings on the ceiling with a pool of light
// under each
export function dataProps(plan: FloorPlan, group: THREE.Group, rng: Rng) {
  const { d, wallOf, of, add, pools } = propTools(plan, group, DATA_PROPS, rng),
    up = new THREE.Vector3(0, 1, 0);
  // the picture on the wall a wall slot is on
  const picOf = (s: WallSlot) => DATA_WALLS[variantOf(wallOf(s), DATA_WALLS.length, WALL_PLAIN_SHARE)]!;
  const metal = new THREE.MeshBasicMaterial({ color: METAL }),
    housing = new THREE.MeshBasicMaterial({ color: HOUSING }),
    tinted = new THREE.MeshBasicMaterial({ color: 0xffffff }), // takes each copy's own colour
    lights: Light[] = [];

  // cable ladders: two rails and their rungs on brackets, the cables lying on them, a box at each end where the
  // cables go into the wall
  const rail: THREE.Matrix4[] = [],
    rung: THREE.Matrix4[] = [],
    bracket: THREE.Matrix4[] = [],
    endBox: THREE.Matrix4[] = [],
    cable: THREE.Matrix4[] = [],
    cableColors: number[] = [];
  of('tray').forEach(s => {
    const turn = facing(s),
      y = TRAY.y + rng.rand(-0.2, 0.2);
    for (const side of [-1, 1]) {
      rail.push(pose(onWall(s, 0, TRAY.out + (side * TRAY.w) / 2, y), turn));
      bracket.push(pose(onWall(s, side * TRAY.len * 0.3, (TRAY.out + TRAY.w / 2) / 2, y - 0.07), turn));
      endBox.push(pose(onWall(s, (side * TRAY.len) / 2, TRAY.out / 2 + 0.14, y + 0.03), turn));
    }
    for (let n = 0; n < TRAY.rungs; n++)
      rung.push(pose(onWall(s, (n / (TRAY.rungs - 1) - 0.5) * (TRAY.len - 0.3), TRAY.out, y - 0.02), turn));
    CABLES.forEach((c, n) => {
      cable.push(pose(onWall(s, 0, TRAY.out + (n / (CABLES.length - 1) - 0.5) * (TRAY.w - 0.14), y + 0.05), turn));
      cableColors.push(c);
    });
  });
  add(new THREE.BoxGeometry(TRAY.len, 0.09, 0.035), metal, rail);
  add(new THREE.BoxGeometry(0.05, 0.03, TRAY.w), metal, rung);
  add(new THREE.BoxGeometry(0.06, 0.06, TRAY.out + TRAY.w / 2), housing, bracket);
  add(new THREE.BoxGeometry(0.34, 0.3, TRAY.out + 0.28), housing, endBox);
  add(new THREE.CylinderGeometry(0.045, 0.045, TRAY.len, 6).rotateZ(Math.PI / 2), tinted, cable, cableColors);

  // bundles: a few cables side by side up a bare wall, tied to it (the racks, plates and monitors stay clear)
  const strand: THREE.Matrix4[] = [],
    strandColors: number[] = [],
    tie: THREE.Matrix4[] = [];
  of('bundle')
    .filter(s => BARE_PICS.includes(picOf(s)))
    .forEach(s => {
      const off = rng.rand(-1.3, 1.3),
        turn = facing(s),
        count = rng.randi(3, 5);
      for (let n = 0; n < count; n++) {
        strand.push(pose(onWall(s, off + n * BUNDLE.pitch, BUNDLE.out, WALL_H / 2), turn));
        strandColors.push(rng.pick(CABLES));
      }
      for (const y of BUNDLE.ties)
        tie.push(
          pose(
            onWall(s, off + ((count - 1) * BUNDLE.pitch) / 2, BUNDLE.out, y),
            turn,
            new THREE.Vector3(count * BUNDLE.pitch + 0.08, 1, 1),
          ),
        );
    });
  add(new THREE.CylinderGeometry(BUNDLE.r, BUNDLE.r, WALL_H, 6), tinted, strand, strandColors);
  add(new THREE.BoxGeometry(1, 0.04, BUNDLE.out * 2 + 0.03), housing, tie);

  // alarm units: a small box on the wall over a row of racks, three dull lamps on it
  const unit: THREE.Matrix4[] = [],
    lamp: THREE.Matrix4[] = [],
    lampColors: number[] = [];
  of('status')
    .filter(s => RACK_PICS.includes(picOf(s)))
    .forEach(s => {
      const off = rng.rand(-1.2, 1.2),
        turn = facing(s);
      unit.push(pose(onWall(s, off, 0.04, STATUS_Y), turn));
      STATUS_LAMPS.forEach((c, n) => {
        if (rng.next() < 0.3) return; // out
        lamp.push(pose(onWall(s, off + (n - 1) * 0.13, 0.09, STATUS_Y), turn));
        lampColors.push(c);
      });
    });
  add(new THREE.BoxGeometry(0.5, 0.18, 0.08), housing, unit);
  add(new THREE.BoxGeometry(0.06, 0.06, 0.03), tinted, lamp, lampColors);

  // emergency lamps: a box with a dull warm lens, and its glow on the wall round it
  const box: THREE.Matrix4[] = [],
    lens: THREE.Matrix4[] = [],
    glow: THREE.Matrix4[] = [];
  of('emergency').forEach(s => {
    const off = rng.rand(-1, 1),
      turn = facing(s),
      p = onWall(s, off, 0.11, EMERGENCY_Y);
    box.push(pose(onWall(s, off, 0.05, EMERGENCY_Y), turn));
    lens.push(pose(p, turn));
    glow.push(pose(onWall(s, off, 0.03, EMERGENCY_Y), turn));
    lights.push({ x: p.x, z: p.z, color: EMERGENCY_COLOR, size: 0.5 });
  });
  add(new THREE.BoxGeometry(0.6, 0.3, 0.1), housing, box);
  add(new THREE.BoxGeometry(0.46, 0.16, 0.14), new THREE.MeshBasicMaterial({ color: EMERGENCY_COLOR }), lens);
  add(
    new THREE.PlaneGeometry(WALL_GLOW.size, WALL_GLOW.size),
    lightMat(poolTex(), WALL_GLOW.opacity, EMERGENCY_COLOR),
    glow,
  );

  // tube fittings (not where the ceiling is open): a tray on the ceiling with two tubes. The boss room's ceiling is
  // far above (HALL_H), so there only the pool of light is drawn
  const fitting: THREE.Matrix4[] = [],
    tube: THREE.Matrix4[] = [],
    tubeColors: number[] = [],
    halo: THREE.Matrix4[] = [],
    haloColors: number[] = [];
  of('tube')
    .filter(s => !plan.noCeil[s.j * d.W + s.i])
    .forEach(s => {
      const x = tileCenter(s.i),
        z = tileCenter(s.j),
        c = rng.pick(TUBE_COLORS),
        turn = rng.pick([0, Math.PI / 2]);
      lights.push({ x, z, color: c, size: 1 });
      if (plan.hall && s.room === plan.hall.room) return;
      fitting.push(pose(new THREE.Vector3(x, WALL_H - 0.03, z), turn));
      halo.push(pose(new THREE.Vector3(x, WALL_H - 0.01, z)));
      haloColors.push(c);
      for (const side of [-1, 1]) {
        const out = new THREE.Vector3(0, 0, side * 0.1).applyAxisAngle(up, turn);
        tube.push(pose(new THREE.Vector3(x + out.x, WALL_H - TUBE.drop, z + out.z), turn));
        tubeColors.push(c);
      }
    });
  add(new THREE.BoxGeometry(TUBE.len + 0.15, 0.06, 0.42), metal, fitting);
  add(new THREE.BoxGeometry(TUBE.len, 0.06, 0.08), tinted, tube, tubeColors);
  add(
    new THREE.PlaneGeometry(CEILING_GLOW.size, CEILING_GLOW.size).rotateX(Math.PI / 2),
    lightMat(poolTex(), CEILING_GLOW.opacity),
    halo,
    haloColors,
  );

  // the light the lamps throw on the ground: a soft pool of their colour
  pools(lights, POOL_OPACITY);
}
