import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { SIDE_STEP, tileCenter } from '@engine/world/tiles.ts';
import type { PropRule } from '@engine/world/slots.ts';
import { HALL_H, WALL_H } from '../../data/level.ts';
import type { FloorPlan } from '../building.ts';
import { WALL_PLAIN_SHARE, variantOf } from './common.ts';
import { canvasTex, poolTex } from './paint.ts';
import { facing, lightMat, onWall, pose, propTools } from './props.ts';
import type { Light, WallSlot } from './props.ts';
import { NOISE_ON_AIR } from '../../i18n/signs.ts';
import { FRAME_BLACK, SCREEN, WALL_KINDS } from './noise.ts';
import type { WallKind } from './noise.ts';
// The props of the deep noise (NOISE): the things fixed to its walls and ceilings, and the light they throw. They go by the
// pictures on the walls (noise.ts), which are painted there. world/looks.ts puts the two together.
// ---- tuning numbers used only here ----
const POOL_OPACITY = 0.42; // the light a lamp throws on the ground (pale: it must not be taken for a pick-up)
const SCREEN_POOL = 0.45; // the pool of light before a monitor, as a share of a lamp's
const QUIET_WALLS: WallKind[] = ['board', 'foam', 'cloth']; // the walls plain enough to hang cables on
const LAMP_FONT = '"Helvetica Neue","Arial",sans-serif';
// ---- the things on the walls and ceilings ----
// (all of them are fixed to a wall or a ceiling; the lamp signs and the coils hang above head height, EYE in
// src/data/level.ts, so nothing gets in front of the eye)
const NOISE_PROPS: PropRule[] = [
  { id: 'feeder', slots: ['wall'], blocks: false, count: [18, 26], gap: 2 },
  { id: 'coil', slots: ['wall'], blocks: false, count: [10, 14], gap: 3 },
  { id: 'onAir', slots: ['wall'], blocks: false, count: [8, 12], gap: 3 },
  { id: 'lamp', slots: ['floor', 'center', 'corridor'], blocks: false, count: [16, 22], gap: 3 },
];
const FEEDER = { r: 0.045, gap: 0.13, out: 0.07, clamps: [0.8, 2.6, 4.4] }; // aerial feeders up a wall: three cables in clamps (m)
const COIL = { r: 0.3, tube: 0.035, y: 2.9, out: 0.09 }; // spare cable coiled on a hook (m)
const ON_AIR = { w: 1.05, h: 0.36, thick: 0.14, y: 3.45, litShare: 0.4, glow: 1.7, glowOpacity: 0.22 }; // the lamp sign (m; share lit)
const LAMP = { len: 1.5, w: 0.26, drop: 0.05 }; // a ceiling lamp: a tube in a tray, lying along the lighting track (m)
const LAMP_COLORS = [0xe4dcff, 0xe4dcff, 0xfff0dc]; // tired white tubes, mostly gone violet
const SCREEN_COLOR = 0xc4c6ea;
const ON_AIR_RED = '#ff5b3a';
const CABLE_TONES = [0x2c2734, 0x4d4759, 0x89826f];
const FIXING = 0x3a3544; // clamps, hooks, lamp trays
function onAirTex(lit: boolean): THREE.CanvasTexture {
  return canvasTex(256, 88, g => {
    g.fillStyle = lit ? '#3a1210' : '#2b2731';
    g.fillRect(0, 0, 256, 88);
    g.strokeStyle = FRAME_BLACK;
    g.lineWidth = 8;
    g.strokeRect(4, 4, 248, 80);
    g.font = `900 52px ${LAMP_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (lit) {
      g.shadowColor = ON_AIR_RED;
      g.shadowBlur = 14;
    }
    g.fillStyle = lit ? ON_AIR_RED : '#6a4a4c';
    g.fillText(NOISE_ON_AIR, 128, 47, 220);
  });
}
// grey specks to move over a monitor's glass
function staticTex(): THREE.CanvasTexture {
  const size = 64,
    t = canvasTex(size, size, g => {
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x += 2) {
          const v = Math.floor(Math.random() * 255);
          g.fillStyle = `rgb(${v},${v},${v})`;
          g.fillRect(x, y, 2, 1);
        }
    });
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}
interface NoiseShared {
  snow: THREE.CanvasTexture;
  onAir: [THREE.CanvasTexture, THREE.CanvasTexture]; // dead, lit
}
let noiseShared: NoiseShared | null = null;
// Static moving on the monitors that still work, with its faint light on the floor before them; aerial feeders up
// the walls and spare cable coiled on hooks; "ON AIR" lamp signs, most of them dead; tube lamps on the ceiling with
// a pale pool of light under each
export function noiseProps(plan: FloorPlan, group: THREE.Group, rng: Rng) {
  noiseShared ??= { snow: staticTex(), onAir: [onAirTex(false), onAirTex(true)] };
  const shared = noiseShared,
    { d, wallOf, of, add, pools } = propTools(plan, group, NOISE_PROPS, rng);
  // the picture on a wall tile
  const kindOf = (wall: number) => WALL_KINDS[variantOf(wall, WALL_KINDS.length, WALL_PLAIN_SHARE)]!;
  const quiet = (s: WallSlot) => QUIET_WALLS.includes(kindOf(wallOf(s)));
  const fixing = new THREE.MeshBasicMaterial({ color: FIXING }),
    lights: Light[] = [];

  // the monitors: every face of a monitor wall that looks onto a floor tile gets the moving static
  const screens: THREE.Matrix4[] = [];
  for (let j = 1; j < d.H - 1; j++)
    for (let i = 1; i < d.W - 1; i++) {
      if (d.maps.grid[j * d.W + i] !== 1) continue;
      SIDE_STEP.forEach(([di, dj], side) => {
        const wall = (j + dj) * d.W + i + di;
        if (d.maps.grid[wall] || plan.voids[wall] || kindOf(wall) !== 'monitor') return;
        const s = { i, j, side },
          p = onWall(s, 0, 0.02, SCREEN.y);
        screens.push(pose(p, facing(s)));
        const pool = onWall(s, 0, 1.2, 0);
        lights.push({ x: pool.x, z: pool.z, color: SCREEN_COLOR, size: SCREEN_POOL });
      });
    }
  const snow = add(
    new THREE.PlaneGeometry(SCREEN.w, SCREEN.h),
    new THREE.MeshBasicMaterial({ map: shared.snow, color: SCREEN_COLOR, transparent: true, opacity: SCREEN.opacity }),
    screens,
  );
  // the static jumps a few times a second (the picture is moved under the glass; only while it is drawn)
  if (snow) {
    let frame = -1;
    snow.onBeforeRender = () => {
      const now = Math.floor(performance.now() / SCREEN.every);
      if (now === frame) return;
      frame = now;
      shared.snow.offset.set(Math.random(), Math.random());
    };
  }

  // feeders: three cables up the wall, held by clamps. Only on the plainer walls (the gear and the plates stay clear)
  const feeders = of('feeder').filter(quiet),
    cable: THREE.Matrix4[] = [],
    cableColors: number[] = [],
    clamp: THREE.Matrix4[] = [];
  feeders.forEach(s => {
    const off = rng.rand(-1.4, 1.4),
      turn = facing(s);
    for (let n = 0; n < 3; n++) {
      cable.push(pose(onWall(s, off + (n - 1) * FEEDER.gap, FEEDER.out, WALL_H / 2), turn));
      cableColors.push(rng.pick(CABLE_TONES));
    }
    for (const y of FEEDER.clamps) clamp.push(pose(onWall(s, off, FEEDER.out, y), turn));
  });
  add(
    new THREE.CylinderGeometry(FEEDER.r, FEEDER.r, WALL_H, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    cable,
    cableColors,
  );
  add(new THREE.BoxGeometry(FEEDER.gap * 3.4, 0.07, FEEDER.out * 2 + 0.03), fixing, clamp);

  // coils: spare cable wound up and hung on a hook
  const coils = of('coil').filter(quiet),
    ring: THREE.Matrix4[] = [],
    ringColors: number[] = [],
    hook: THREE.Matrix4[] = [];
  coils.forEach(s => {
    const off = rng.rand(-1.2, 1.2),
      turn = facing(s),
      tone = rng.pick(CABLE_TONES);
    for (let n = 0; n < 3; n++) {
      // each turn of the coil a little off the last
      ring.push(
        pose(
          onWall(s, off + rng.rand(-0.03, 0.03), COIL.out + n * 0.035, COIL.y - COIL.r * 0.75 + rng.rand(-0.03, 0.03)),
          turn,
          new THREE.Vector3(1 - n * 0.06, 1.25, 1),
        ),
      );
      ringColors.push(tone);
    }
    hook.push(pose(onWall(s, off, COIL.out, COIL.y + COIL.r * 0.2), turn));
  });
  add(
    new THREE.TorusGeometry(COIL.r, COIL.tube, 6, 20),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    ring,
    ringColors,
  );
  add(new THREE.BoxGeometry(0.1, 0.1, COIL.out * 2 + 0.12), fixing, hook);

  // lamp signs: a box on the wall with the words on its front; a lit one glows a little on the wall round it
  const signs = of('onAir'),
    lit: THREE.Matrix4[] = [],
    dead: THREE.Matrix4[] = [],
    glow: THREE.Matrix4[] = [];
  signs.forEach(s => {
    const off = rng.rand(-0.9, 0.9),
      turn = facing(s),
      on = rng.next() < ON_AIR.litShare;
    (on ? lit : dead).push(pose(onWall(s, off, ON_AIR.thick / 2, ON_AIR.y), turn));
    if (on) glow.push(pose(onWall(s, off, 0.03, ON_AIR.y), turn));
  });
  const signBox = new THREE.BoxGeometry(ON_AIR.w, ON_AIR.h, ON_AIR.thick);
  shared.onAir.forEach((map, n) => {
    const front = new THREE.MeshBasicMaterial({ map });
    add(signBox, [fixing, fixing, fixing, fixing, front, front], n ? lit : dead);
  });
  add(
    new THREE.PlaneGeometry(ON_AIR.glow, ON_AIR.glow * 0.7),
    lightMat(poolTex(), ON_AIR.glowOpacity, ON_AIR_RED),
    glow,
  );

  // ceiling lamps (not where the ceiling is open): a lit tube in a tray. The boss room's ceiling is higher
  const hall = plan.hall ? d.rooms[plan.hall.room]! : null,
    ceilingAt = (i: number, j: number) =>
      hall && i >= hall.x && i < hall.x + hall.w && j >= hall.y && j < hall.y + hall.h ? HALL_H : WALL_H;
  const lamps = of('lamp').filter(s => !plan.noCeil[s.j * d.W + s.i]),
    tray: THREE.Matrix4[] = [],
    tube: THREE.Matrix4[] = [],
    tubeColors: number[] = [];
  lamps.forEach(s => {
    const x = tileCenter(s.i),
      z = tileCenter(s.j),
      y = ceilingAt(s.i, s.j),
      c = rng.pick(LAMP_COLORS);
    tray.push(pose(new THREE.Vector3(x, y - LAMP.drop / 2, z)));
    tube.push(pose(new THREE.Vector3(x, y - LAMP.drop - 0.03, z)));
    tubeColors.push(c);
    lights.push({ x, z, color: c, size: 1 });
  });
  add(new THREE.BoxGeometry(LAMP.len + 0.2, LAMP.drop, LAMP.w + 0.16), fixing, tray);
  add(
    new THREE.BoxGeometry(LAMP.len, 0.06, LAMP.w),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    tube,
    tubeColors,
  );

  // the light the lamps and the monitors throw on the ground: a soft pool of their colour
  pools(lights, POOL_OPACITY);
}
