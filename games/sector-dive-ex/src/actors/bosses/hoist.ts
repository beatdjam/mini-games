import {
  HOIST_CARGO_H,
  HOIST_FACE,
  HOIST_HOOK_TOP,
  hoistCargo,
  hoistFrame,
  hoistMagnet,
} from '../../world/models/bosses/hoist/look.ts';
import type { HoistFrame } from '../../world/models/bosses/hoist/look.ts';
import { cylGeo } from '../../world/models/machine.ts';
import { plainLooks } from '../../world/looks.ts';
import type { Boss } from '../../data/types.ts';
import * as THREE from 'three';
import { clamp, distXZ, rand } from '@engine/core/util.ts';
import { sfx } from '@engine/audio/audio.ts';
import { disposeTree, dynGroup, shared } from '@engine/render/render.ts';
import { burst } from '@engine/render/fx.ts';
import { spawn } from '@engine/core/world.ts';
import type { WorldObject } from '@engine/core/world.ts';
import { floorY, moveCircle, T } from '@engine/world/tiles.ts';
import { BOSS_META } from '../../data/bosses.ts';
import { HALL_H } from '../../data/level.ts';
import { COLOR, PAINT } from '../../data/colors.ts';
import { level } from '../../world/level.ts';
import { fanAt } from '../../world/entities.ts';
import { player } from '../player.ts';
import { damagePlayer } from '../combat.ts';
import {
  arenaRoom,
  bossMaterial,
  createBoss,
  isEnraged,
  minionCount,
  nextPattern,
  spawnMinion,
  wireOutline,
} from './common.ts';
import type { BossVisual } from './common.ts';
import { screenFx } from '../../ui/hud.ts';
// HOIST: the loading dock's overhead crane. A trolley on a bridge on two rails trails the player along the ceiling, and
// the magnet on its wire is what is shot. Two attacks: it hangs a load over the spot and lets it fall after a shadow
// has told where (the shadow is black, the mortar's ring is red); or its coil lights and drags the player toward it for
// a while, and the load falls on the spot the player was dragged to. A load that breaks lets out a crawler (two below half
// health), and between the attacks the guns under the magnet fire fans at the player.

const RAIL_MARGIN = 2; // the rails run this far inside the walls (m)
const TROLLEY_MARGIN = 4; // the trolley stays this far from the walls (m)
const SHADOW_OPACITY: [number, number] = [0.15, 0.85]; // the shadow's fill, from the load appearing to its fall
const RIM_OPACITY = 0.8;
const RIM_BLINK = 0.75; // the rim blinks over the last quarter of the warning
const SHADOW_LIFT = 0.06; // the shadow floats this far above the floor (m)
const CARGO_GAP = 0.2; // between the magnet's face and the load's top (m)
const CARGO_IN = 0.25; // the load appears over this long (s)
const LAND_DY = 1.5; // the load crushes a player whose feet are this close to the floor it lands on (m)
const CRAWLER_OUT = 1.6; // the crawlers come out this far from where the load broke (m)
const PULL_STOP = 0.5; // the pull stops this near the magnet (m)
const PULL_SHAKE = 0.1; // the screen shakes this much while it pulls
const REEL_SPEED = 1.5; // the drum's turn while it winds or pays out (rad/s; it is for the eye: the magnet hangs at one height)
const HUM_EVERY = 0.9; // seconds between the magnet's hums while it pulls
const GLOW_FADE = 2; // the magnet's glow dies down at this rate per second
const MAGNET_GLOW = 0.8; // the body's glow at full pull, on top of its glow at rest
const COIL_DIM = 0x2a3a4a; // the coil's face at rest
const COIL_LIT = new THREE.Color(0x7fc4ff); // ... and at full pull
const BEAM_R = 0.07; // the line from the magnet to the player (m across)
const BEAM_OPACITY = 0.35;
const BEAM_SHORT = 2; // ... ends this far short of the player (m)
const CHEST_Y = 1.1; // the line ends this high above the player's feet (m)
const RING_N = 3; // rings on the floor that close in on the magnet while it pulls
const RING_FAR = 14; // ... from this far (m)
const RING_RATE = 1.1; // ... and this many times a second
const RING_OPACITY = 0.6;
const SMOKE = PAINT.grey3; // the dust of a landing
const WRECK_TILT = 0.12; // the fallen magnet lies this far over (rad)
const UP = new THREE.Vector3(0, 1, 0);
const ringGeo = shared(new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2));
const discGeo = shared(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2));

type Fill = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
// the load hanging or falling: g its picture, shadow the ring on the floor (fill and rim); x / z / floor where it lands;
// y its middle's height; vy how fast it falls (m/s); color the dust of its breaking
interface Cargo {
  g: THREE.Group;
  shadow: THREE.Group;
  fill: Fill;
  rim: Fill;
  x: number;
  z: number;
  floor: number;
  y: number;
  vy: number;
  color: number;
}
// st: chase (the trolley trails the player) / approach (it goes to where the player is) / wind (the coil lights) /
// pull / hang (the load is up, the shadow fills) / fall; cargo: the load; frame: the crane over the room
// limX / limZ: how far the trolley goes from the middle of the room; glow: the coil's light (0 to 1); coil: its face;
// restEI: the body's glow at rest; beam / rings: what shows the pull; humT: seconds to the next hum
type HoistBoss = Boss & {
  st: string;
  cargo: Cargo | null;
  frame: HoistFrame;
  limX: number;
  limZ: number;
  glow: number;
  coil: THREE.MeshBasicMaterial;
  restEI: number;
  beam: Fill;
  rings: Fill[];
  humT: number;
  gunT: number;
};
// the numbers HOIST's behaviour reads (BOSS_META.hoist.tune)
export interface HoistTune {
  chase: number;
  approach: number;
  approachMax: number;
  stopNear: number;
  first: number;
  gap: number;
  gapEnr: number;
  shadowR: number;
  warn: number;
  fallG: number;
  dropDmg: number;
  pullWind: number;
  pullTime: number;
  pullSpeed: number;
  minionCap: number;
  crawlers: number;
  crawlers1: number;
  gunEvery: number;
  gunEveryEnr: number;
  gunN: number;
  gunNEnr: number;
  gunSpread: number;
  gunSpeed: number;
}
const additive = (color: number, opacity: number): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
// the magnet's body, with the looks or without
function magnetBody(mat: THREE.MeshLambertMaterial, coil: THREE.Material, sector: string): THREE.Group {
  if (!plainLooks()) return hoistMagnet(mat, coil, sector === 'MALL' ? 'mall' : 'forge');
  const g = new THREE.Group(),
    geo = new THREE.BoxGeometry(3, 1.6, 3);
  g.add(new THREE.Mesh(geo, mat), wireOutline(geo, COLOR.shield));
  return g;
}
// how HOIST's magnet looks (common.ts BossVisual) in a sector, with the material of its coil (it lights up as it
// pulls). The crane it hangs from is the arena's (hoistFrame), not the boss's
export function hoistVisual(sector: string): BossVisual & { coil: THREE.MeshBasicMaterial } {
  const g = new THREE.Group(),
    mat = bossMaterial(0x14181c, COLOR.shield),
    coil = new THREE.MeshBasicMaterial({ color: COIL_DIM });
  g.add(magnetBody(mat, coil, sector));
  return { mesh: g, mat, coil };
}
export function spawnHoist() {
  const K = BOSS_META.hoist.tune,
    room = arenaRoom(),
    hw = (room.w * T) / 2,
    hd = (room.h * T) / 2,
    frame = hoistFrame(hw - RAIL_MARGIN, hd, HALL_H, !level.hall),
    look = hoistVisual(level.biome.code);
  const beam: Fill = new THREE.Mesh(cylGeo(BEAM_R, BEAM_R, 1, 8), additive(COLOR.shield, BEAM_OPACITY)),
    rings: Fill[] = [];
  beam.visible = false;
  dynGroup.add(beam);
  for (let k = 0; k < RING_N; k++) {
    const ring: Fill = new THREE.Mesh(ringGeo, additive(COLOR.shield, RING_OPACITY));
    ring.visible = false;
    dynGroup.add(ring);
    rings.push(ring);
  }
  const e = createBoss({
    kind: 'hoist',
    look,
    behave: updHoist,
    state: {
      st: 'chase',
      cargo: null,
      frame,
      limX: hw - TROLLEY_MARGIN,
      limZ: hd - TROLLEY_MARGIN,
      glow: 0,
      coil: look.coil,
      restEI: 0,
      beam,
      rings,
      humT: 0,
      gunT: K.first,
    },
    centred: true,
    timer: K.first,
    pool: false, // no pool of light under the magnet: the floor under it carries the shadow
    extra: [beam, ...rings],
    onDown: hoistDown,
    hint: ['boss.hoistHint', 4200],
  });
  e.restEI = e.baseEI;
  // the crane stays after the magnet is gone: a world object of its own (cleared with the level)
  frame.g.position.set(e.cx, floorY(e.cx, e.cz), e.cz);
  frame.wire.visible = false; // (until it acts: the magnet grows in on its own at first)
  dynGroup.add(frame.g);
  spawn({ tag: 'crane' as const, mesh: frame.g });
}
// the trolley goes toward (x, z) at `speed` along each axis, and no farther than the rails and the bridge reach
function follow(e: HoistBoss, x: number, z: number, speed: number, dt: number) {
  e.x = clamp(e.x + clamp(x - e.x, -speed * dt, speed * dt), e.cx - e.limX, e.cx + e.limX);
  e.z = clamp(e.z + clamp(z - e.z, -speed * dt, speed * dt), e.cz - e.limZ, e.cz + e.limZ);
}
// takes a mesh off the boss and frees it
function release(e: HoistBoss, o: THREE.Object3D) {
  disposeTree(o);
  o.parent?.remove(o);
  e.extra = (e.extra ?? []).filter(x => x !== o);
}
// the load appears under the magnet, and the shadow begins to fill under it
function hang(e: HoistBoss) {
  const K = BOSS_META.hoist.tune,
    kind = e.patIdx % 2,
    g = hoistCargo(kind),
    floor = floorY(e.x, e.z),
    shadow = new THREE.Group(),
    fill: Fill = new THREE.Mesh(
      discGeo,
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }),
    ),
    rim: Fill = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: PAINT.amber2, transparent: true, opacity: 0, depthWrite: false }),
    );
  g.position.set(e.x, e.mesh.position.y - HOIST_FACE - CARGO_GAP - HOIST_CARGO_H / 2, e.z);
  g.scale.setScalar(0.01);
  shadow.position.set(e.x, floor + SHADOW_LIFT, e.z);
  fill.scale.set(K.shadowR, 1, K.shadowR);
  rim.scale.set(K.shadowR, 1, K.shadowR);
  shadow.add(fill, rim);
  dynGroup.add(g, shadow);
  e.extra = [...(e.extra ?? []), g, shadow];
  e.cargo = {
    g,
    shadow,
    fill,
    rim,
    x: e.x,
    z: e.z,
    floor,
    y: g.position.y,
    vy: 0,
    color: kind === 0 ? PAINT.teal : PAINT.clay3,
  };
  e.st = 'hang';
  e.timer = K.warn;
  sfx('unlock');
}
// the shadow fills, the load comes up to size
function updateHang(e: HoistBoss) {
  const K = BOSS_META.hoist.tune,
    c = e.cargo!,
    k = clamp(1 - e.timer / K.warn, 0, 1);
  c.g.scale.setScalar(Math.max(0.01, clamp((k * K.warn) / CARGO_IN, 0, 1)));
  c.fill.material.opacity = SHADOW_OPACITY[0] + (SHADOW_OPACITY[1] - SHADOW_OPACITY[0]) * k;
  c.rim.material.opacity = k > RIM_BLINK && Math.sin(e.t * 40) > 0 ? 0 : RIM_OPACITY;
}
// the load falls, and lands: it crushes what is in the ring, breaks, and (below half health) lets crawlers out
function updateFall(e: HoistBoss, dt: number, enr: boolean) {
  const K = BOSS_META.hoist.tune,
    c = e.cargo!;
  c.vy += K.fallG * dt;
  c.y -= c.vy * dt;
  c.g.position.y = Math.max(c.y, c.floor + HOIST_CARGO_H / 2);
  if (c.y > c.floor + HOIST_CARGO_H / 2) return;
  const at = { x: c.x, z: c.z };
  if (distXZ(player, at) < K.shadowR && Math.abs(player.fy - c.floor) < LAND_DY) damagePlayer(e.dmg * K.dropDmg, at);
  burst(c.x, c.floor + 0.4, c.z, SMOKE, 16, 5, 1.1, -1);
  burst(c.x, c.floor + 0.8, c.z, c.color, 18, 9, 0.9);
  screenFx.shake = Math.max(screenFx.shake, 0.4);
  sfx('slam');
  sfx('boom');
  release(e, c.g);
  release(e, c.shadow);
  e.cargo = null;
  // crawlers out of the broken load: one, or two below half health, while the room has room for them
  const out = enr ? K.crawlers : K.crawlers1,
    n = Math.min(out, K.minionCap - minionCount()),
    a0 = rand(0, Math.PI * 2);
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / out) * Math.PI * 2;
    spawnMinion('crawler', c.x + Math.cos(a) * CRAWLER_OUT, c.z + Math.sin(a) * CRAWLER_OUT);
  }
  e.st = 'chase';
  e.timer = enr ? K.gapEnr : K.gap;
}
// the pull: the player is moved toward the point under the magnet, over what they walk
function pull(e: HoistBoss, dt: number) {
  const K = BOSS_META.hoist.tune,
    dx = e.x - player.x,
    dz = e.z - player.z,
    d = Math.hypot(dx, dz);
  if (d > PULL_STOP) {
    const s = Math.min(K.pullSpeed * dt, d - PULL_STOP);
    moveCircle(player, (dx / d) * s, (dz / d) * s, player.r);
  }
  screenFx.shake = Math.max(screenFx.shake, PULL_SHAKE);
  e.humT -= dt;
  if (e.humT <= 0) {
    sfx('hum');
    e.humT = HUM_EVERY;
  }
}
// the line from the magnet to the player and the rings closing in on it, while it pulls
function showPull(e: HoistBoss, on: boolean) {
  e.beam.visible = on;
  e.rings.forEach(r => {
    r.visible = on;
  });
  if (!on) return;
  const from = new THREE.Vector3(e.x, e.mesh.position.y - HOIST_FACE, e.z),
    to = new THREE.Vector3(player.x, player.fy + CHEST_Y, player.z),
    dir = to.clone().sub(from),
    reach = dir.length(),
    len = Math.max(reach - BEAM_SHORT, 0.1); // (it stops short of the eye: up close it would fill the screen)
  dir.divideScalar(reach || 1);
  e.beam.position.copy(from).addScaledVector(dir, len / 2);
  e.beam.quaternion.setFromUnitVectors(UP, dir);
  e.beam.scale.set(1, len, 1);
  e.beam.material.opacity = BEAM_OPACITY * (0.75 + 0.25 * Math.sin(e.t * 25));
  const floor = floorY(e.x, e.z);
  e.rings.forEach((r, k) => {
    const phase = (e.t * RING_RATE + k / RING_N) % 1;
    r.position.set(e.x, floor + SHADOW_LIFT, e.z);
    r.scale.set(1 + RING_FAR * (1 - phase), 1, 1 + RING_FAR * (1 - phase));
    r.material.opacity = RING_OPACITY * phase;
  });
}
function updHoist(e: HoistBoss, dt: number) {
  const K = BOSS_META.hoist.tune;
  e.t += dt;
  e.timer -= dt;
  const enr = isEnraged(e);
  // the guns under the magnet fire while the trolley trails the player and goes to drop a load
  if ((e.st === 'chase' || e.st === 'approach') && (e.gunT -= dt) <= 0) {
    e.gunT = enr ? K.gunEveryEnr : K.gunEvery;
    fanAt(
      e.x,
      e.mesh.position.y - HOIST_FACE,
      e.z,
      enr ? K.gunNEnr : K.gunN,
      K.gunSpread,
      K.gunSpeed,
      e.dmg,
      COLOR.amber,
    );
    sfx('eshot', 60);
  }
  if (e.st === 'chase') {
    follow(e, player.x, player.z, K.chase, dt);
    if (e.timer <= 0) {
      nextPattern(e);
      if (e.pat === 1) {
        e.st = 'wind';
        e.timer = K.pullWind;
        e.humT = HUM_EVERY;
        sfx('hum');
      } else {
        e.st = 'approach';
        e.timer = K.approachMax;
      }
    }
  } else if (e.st === 'approach') {
    follow(e, player.x, player.z, K.approach, dt);
    if (distXZ(e, player) < K.stopNear || e.timer <= 0) hang(e);
  } else if (e.st === 'wind') {
    e.glow = clamp(1 - e.timer / K.pullWind, 0, 1);
    if (e.timer <= 0) {
      e.st = 'pull';
      e.timer = K.pullTime;
    }
  } else if (e.st === 'pull') {
    e.glow = 1;
    pull(e, dt);
    if (e.timer <= 0) hang(e);
  } else if (e.st === 'hang') {
    updateHang(e);
    if (e.timer <= 0) e.st = 'fall';
  } else if (e.st === 'fall') updateFall(e, dt, enr);
  if (e.st !== 'wind' && e.st !== 'pull') e.glow = Math.max(0, e.glow - dt * GLOW_FADE);
  e.baseEI = e.restEI + e.glow * MAGNET_GLOW;
  e.coil.color.setHex(COIL_DIM).lerp(COIL_LIT, e.glow);
  showPull(e, e.st === 'pull');
  e.aloft = e.st !== 'chase' && e.st !== 'approach'; // a phase change waits for the attack to end
  e.mesh.position.set(e.x, floorY(e.cx, e.cz) + e.y, e.z);
  e.frame.wire.visible = true;
  // the beacons warn from the load going up until it lands, and while the magnet pulls; the drum winds while it pulls
  // and pays out as the load falls
  const warning = e.st === 'wind' || e.st === 'pull' || e.st === 'hang';
  e.frame.tick(dt, e.t, warning, e.st === 'fall' ? -REEL_SPEED : warning ? REEL_SPEED : 0);
  e.frame.pose(e.x - e.cx, e.z - e.cz, e.mesh.position.y + HOIST_HOOK_TOP);
}
// the magnet falls to the floor and the trolley stops where it is (the rest of the crane stays as it was)
function hoistDown(e: HoistBoss) {
  const K = BOSS_META.hoist.tune,
    at = e.mesh.position,
    mat = bossMaterial(0x14181c, COLOR.shield),
    g = magnetBody(mat, new THREE.MeshBasicMaterial({ color: COIL_DIM }), level.biome.code);
  e.frame.wire.visible = false;
  e.frame.stop();
  g.position.copy(at);
  dynGroup.add(g);
  let vy = 0;
  const wreck: WorldObject = spawn({
    tag: 'crane' as const,
    mesh: g,
    update(dt: number) {
      vy += K.fallG * dt;
      g.position.y -= vy * dt;
      const rest = floorY(g.position.x, g.position.z) + HOIST_FACE;
      if (g.position.y > rest) return;
      g.position.y = rest;
      g.rotation.z = WRECK_TILT;
      burst(g.position.x, rest, g.position.z, SMOKE, 20, 6, 1.2, -1);
      burst(g.position.x, rest + 0.4, g.position.z, COLOR.amber, 12, 8, 0.8);
      screenFx.shake = Math.max(screenFx.shake, 0.3);
      sfx('slam');
      wreck.update = undefined; // it lies where it fell
    },
  });
}
