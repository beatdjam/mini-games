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
  LAND_DY,
  minionCount,
  nextPattern,
  spawnMinion,
  wireOutline,
} from './common.ts';
import type { BossVisual } from './common.ts';
import { additive, dropWreck, flat, layBeam, RIM_BLINK, ringGeo, warningPad } from './fx.ts';
import type { Fill, WarningPad } from './fx.ts';
import { screenFx } from '../../ui/hud.ts';
// HOIST: the loading dock's overhead crane. A trolley on a bridge on two rails trails the player along the ceiling, and
// the magnet on its wire is what is shot. Four attacks, in this order: it hangs a load over the spot and lets it fall
// after a shadow has told where (the shadow is black, the mortar's ring is red); it rushes in and swings a load round
// the magnet, which hurts only in the band the load crosses; its coil lights and drags the player toward it for a while,
// and the load falls on the spot the player was dragged to; or it runs past the player dropping loads one after another,
// each with its own shadow. A load that breaks lets out a crawler (two below half health), and between the attacks the
// guns under the magnet fire fans at the player.

// the order the attacks come in (nextPattern advances e.patIdx, so the attack is the one before the new count)
const ATTACKS = ['drop', 'swing', 'pull', 'barrage'] as const;

const RAIL_MARGIN = 2; // the rails run this far inside the walls (m)
const TROLLEY_MARGIN = 4; // the trolley stays this far from the walls (m)
const SHADOW_OPACITY: [number, number] = [0.15, 0.85]; // the shadow's fill, from the load appearing to its fall
const RIM_OPACITY = 0.8;
const SHADOW_LIFT = 0.06; // the shadow floats this far above the floor (m)
const CARGO_GAP = 0.2; // between the magnet's face and the load's top (m)
const CARGO_IN = 0.25; // the load appears over this long (s)
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
const SWING_Y = 1.2; // the swinging load's middle above the floor (m)
const CHAIN_R = 0.08; // the chain from the magnet to the load (m across)
const SWING_HIT_GAP = 0.6; // seconds from one hit of the swing to the next
const CARGO_HALF_W = 1.5; // half the load's width (m; the container and the pallet are both 3 wide)

// the load hanging or falling: g its picture, shadow the ring on the floor (fill and rim); x / z / floor where it lands;
// y its middle's height; vy how fast it falls (m/s); color the dust of its breaking; t the warning left (s) and warn the
// warning it started with (s); falling whether it is on its way down; crawl whether it lets a crawler out when it breaks
interface Cargo {
  g: THREE.Group;
  shadow: WarningPad;
  fill: Fill;
  rim: Fill;
  x: number;
  z: number;
  floor: number;
  y: number;
  vy: number;
  color: number;
  t: number;
  warn: number;
  falling: boolean;
  crawl: boolean;
}
// st: chase (the trolley trails the player) / approach (it goes to where the player is) / hang (the loads are up and
// fall) / wind (the coil lights) / pull / rush (it closes in to swing) / swingWind (the load comes down) / swing /
// barrage (it runs past dropping loads); cargos: the loads; frame: the crane over the room
// limX / limZ: how far the trolley goes from the middle of the room; glow: the coil's light (0 to 1); coil: its face;
// restEI: the body's glow at rest; beam / rings: what shows the pull; humT: seconds to the next hum
// band / bandGeo: the warning of the swing's band; swingG / chain / swingA / hitT: the load it swings, its chain, the
// angle it is at and the seconds until it can hit again; left / dropT / goal: the barrage's loads left, seconds to the
// next and where it runs
type HoistBoss = Boss & {
  st: string;
  cargos: Cargo[];
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
  band: Fill | null;
  bandGeo: THREE.BufferGeometry;
  swingG: THREE.Group | null;
  chain: Fill | null;
  swingA: number;
  hitT: number;
  left: number;
  dropT: number;
  goal: { x: number; z: number };
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
  rushSpeed: number;
  rushMax: number;
  swingWarn: number;
  swingR: number;
  swingW: number;
  swingTime: number;
  swingTurns: number;
  swingTurnsEnr: number;
  swingDmg: number;
  pullWind: number;
  pullTime: number;
  pullSpeed: number;
  barrageN: number;
  barrageNEnr: number;
  barrageEvery: number;
  barrageWarn: number;
  barrageOver: number;
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
    rings: Fill[] = [],
    bandGeo = shared(
      new THREE.RingGeometry((K.swingR - K.swingW) / (K.swingR + K.swingW), 1, 64).rotateX(-Math.PI / 2),
    );
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
      cargos: [],
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
      band: null, // (made at the first swing, so that the boss's extra at its spawn is what it was)
      bandGeo,
      swingG: null,
      chain: null,
      swingA: 0,
      hitT: 0,
      left: 0,
      dropT: 0,
      goal: { x: 0, z: 0 },
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
// the band on the floor under the magnet: a ring between (swingR - swingW) and (swingR + swingW)
function bandAt(e: HoistBoss, x: number, z: number) {
  const K = BOSS_META.hoist.tune;
  if (!e.band) {
    e.band = new THREE.Mesh(e.bandGeo, flat(PAINT.amber2, 0));
    dynGroup.add(e.band);
    e.extra = [...(e.extra ?? []), e.band];
  }
  e.band.position.set(x, floorY(x, z) + SHADOW_LIFT, z);
  e.band.scale.set(K.swingR + K.swingW, 1, K.swingR + K.swingW);
  e.band.visible = true;
  return e.band;
}
// the load appears under the magnet at (x, z), and the shadow begins to fill under it; crawl: it lets a crawler out
function hang(e: HoistBoss, x: number, z: number, warn: number, crawl: boolean) {
  const K = BOSS_META.hoist.tune,
    kind = e.patIdx % 2,
    g = hoistCargo(kind),
    floor = floorY(x, z),
    shadow = warningPad({
      fill: 0x000000,
      rim: PAINT.amber2,
      fillOpacity: SHADOW_OPACITY,
      rimOpacity: RIM_OPACITY,
    });
  g.position.set(x, e.mesh.position.y - HOIST_FACE - CARGO_GAP - HOIST_CARGO_H / 2, z);
  g.scale.setScalar(0.01);
  shadow.set(x, floor + SHADOW_LIFT, z, K.shadowR);
  dynGroup.add(g);
  e.extra = [...(e.extra ?? []), g, shadow.g];
  e.cargos.push({
    g,
    shadow,
    fill: shadow.fill,
    rim: shadow.rim,
    x,
    z,
    floor,
    y: g.position.y,
    vy: 0,
    color: kind === 0 ? PAINT.teal : PAINT.clay3,
    t: warn,
    warn,
    falling: false,
    crawl,
  });
  sfx('unlock');
}
// every load in the air: the shadow fills while its warning runs, then it falls, lands, breaks and (if crawl) lets
// crawlers out
function updateCargos(e: HoistBoss, dt: number, enr: boolean) {
  const K = BOSS_META.hoist.tune;
  for (let i = e.cargos.length - 1; i >= 0; i--) {
    const c = e.cargos[i]!;
    if (!c.falling) {
      c.t -= dt;
      const k = clamp(1 - c.t / c.warn, 0, 1);
      c.g.scale.setScalar(Math.max(0.01, clamp((k * c.warn) / CARGO_IN, 0, 1)));
      c.shadow.warn(k, e.t);
      if (c.t > 0) continue;
      c.falling = true;
      continue;
    }
    c.vy += K.fallG * dt;
    c.y -= c.vy * dt;
    c.g.position.y = Math.max(c.y, c.floor + HOIST_CARGO_H / 2);
    if (c.y > c.floor + HOIST_CARGO_H / 2) continue;
    const at = { x: c.x, z: c.z };
    if (distXZ(player, at) < K.shadowR && Math.abs(player.fy - c.floor) < LAND_DY) damagePlayer(e.dmg * K.dropDmg, at);
    burst(c.x, c.floor + 0.4, c.z, SMOKE, 16, 5, 1.1, -1);
    burst(c.x, c.floor + 0.8, c.z, c.color, 18, 9, 0.9);
    screenFx.shake = Math.max(screenFx.shake, 0.4);
    sfx('slam');
    sfx('boom');
    release(e, c.g);
    release(e, c.shadow.g);
    e.cargos.splice(i, 1);
    if (!c.crawl) continue;
    // crawlers out of the broken load: one, or two below half health, while the room has room for them
    const out = enr ? K.crawlers : K.crawlers1,
      n = Math.min(out, K.minionCap - minionCount()),
      a0 = rand(0, Math.PI * 2);
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / out) * Math.PI * 2;
      spawnMinion('crawler', c.x + Math.cos(a) * CRAWLER_OUT, c.z + Math.sin(a) * CRAWLER_OUT);
    }
  }
}
// the load the swing attack uses: it comes down under the magnet, with its chain and the band's warning; it starts
// opposite the player so that the first turn does not hit at once
function swingLoad(e: HoistBoss) {
  const kind = e.patIdx % 2,
    g = hoistCargo(kind),
    chain: Fill = new THREE.Mesh(cylGeo(CHAIN_R, CHAIN_R, 1, 6), flat(0x2b2f33, 1));
  g.position.set(e.x, e.mesh.position.y - HOIST_FACE - CARGO_GAP - HOIST_CARGO_H / 2, e.z);
  g.scale.setScalar(0.01);
  dynGroup.add(g);
  chain.visible = false;
  dynGroup.add(chain);
  e.extra = [...(e.extra ?? []), g, chain];
  e.swingG = g;
  e.chain = chain;
  e.swingA = Math.atan2(player.z - e.z, player.x - e.x) + Math.PI;
  e.hitT = 0;
  bandAt(e, e.x, e.z);
  sfx('unlock');
}
// the swing is over: the load comes down where it is and breaks (no crush), and lets its crawlers out
function endSwing(e: HoistBoss, enr: boolean) {
  const K = BOSS_META.hoist.tune,
    g = e.swingG,
    x = g?.position.x ?? e.x,
    z = g?.position.z ?? e.z,
    floor = floorY(x, z),
    color = e.patIdx % 2 === 0 ? PAINT.teal : PAINT.clay3;
  if (g) {
    burst(x, floor + 0.4, z, SMOKE, 16, 5, 1.1, -1);
    burst(x, floor + 0.8, z, color, 18, 9, 0.9);
    screenFx.shake = Math.max(screenFx.shake, 0.4);
    sfx('slam');
    sfx('boom');
    release(e, g);
    e.swingG = null;
  }
  if (e.chain) {
    e.chain.visible = false;
    release(e, e.chain);
    e.chain = null;
  }
  if (e.band) {
    e.band.visible = false;
    release(e, e.band);
    e.band = null;
  }
  const out = enr ? K.crawlers : K.crawlers1,
    n = Math.min(out, K.minionCap - minionCount()),
    a0 = rand(0, Math.PI * 2);
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / out) * Math.PI * 2;
    spawnMinion('crawler', x + Math.cos(a) * CRAWLER_OUT, z + Math.sin(a) * CRAWLER_OUT);
  }
  e.st = 'chase';
  e.timer = enr ? K.gapEnr : K.gap;
}
// the barrage's run: past the player by barrageOver m, kept inside the rails, with the loads left counted down
function startBarrage(e: HoistBoss, enr: boolean) {
  const K = BOSS_META.hoist.tune,
    dx = player.x - e.x,
    dz = player.z - e.z,
    d = Math.hypot(dx, dz),
    ux = d ? dx / d : 0,
    uz = d ? dz / d : 0;
  e.goal = {
    x: clamp(player.x + ux * K.barrageOver, e.cx - e.limX, e.cx + e.limX),
    z: clamp(player.z + uz * K.barrageOver, e.cz - e.limZ, e.cz + e.limZ),
  };
  e.left = enr ? K.barrageNEnr : K.barrageN;
  e.dropT = 0;
  e.st = 'barrage';
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
  layBeam(e.beam, from, from.clone().addScaledVector(dir, len), 1);
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
      const atk = ATTACKS[(e.patIdx - 1) % ATTACKS.length];
      if (atk === 'pull') {
        e.st = 'wind';
        e.timer = K.pullWind;
        e.humT = HUM_EVERY;
        sfx('hum');
      } else if (atk === 'swing') {
        e.st = 'rush';
        e.timer = K.rushMax;
      } else if (atk === 'barrage') startBarrage(e, enr);
      else {
        e.st = 'approach';
        e.timer = K.approachMax;
      }
    }
  } else if (e.st === 'approach') {
    follow(e, player.x, player.z, K.approach, dt);
    if (distXZ(e, player) < K.stopNear || e.timer <= 0) {
      hang(e, e.x, e.z, K.warn, true);
      e.st = 'hang';
    }
  } else if (e.st === 'wind') {
    e.glow = clamp(1 - e.timer / K.pullWind, 0, 1);
    if (e.timer <= 0) {
      e.st = 'pull';
      e.timer = K.pullTime;
    }
  } else if (e.st === 'pull') {
    e.glow = 1;
    pull(e, dt);
    if (e.timer <= 0) {
      hang(e, e.x, e.z, K.warn, true);
      e.st = 'hang';
    }
  } else if (e.st === 'rush') {
    follow(e, player.x, player.z, K.rushSpeed, dt);
    if (distXZ(e, player) < K.stopNear || e.timer <= 0) {
      swingLoad(e);
      e.st = 'swingWind';
      e.timer = K.swingWarn;
    }
  } else if (e.st === 'swingWind') {
    const k = clamp(1 - e.timer / K.swingWarn, 0, 1),
      blink = k > RIM_BLINK && Math.sin(e.t * 40) > 0;
    if (e.swingG) {
      // it grows under the magnet, then swings out and down to where the swing begins (it does not jump there)
      const g = e.swingG,
        out = clamp((k * K.swingWarn - CARGO_IN) / Math.max(K.swingWarn - CARGO_IN, 0.01), 0, 1),
        top = e.mesh.position.y - HOIST_FACE - CARGO_GAP - HOIST_CARGO_H / 2,
        low = floorY(e.x, e.z) + SWING_Y;
      g.scale.setScalar(Math.max(0.01, clamp((k * K.swingWarn) / CARGO_IN, 0, 1)));
      g.position.set(
        e.x + Math.cos(e.swingA) * K.swingR * out,
        top + (low - top) * out,
        e.z + Math.sin(e.swingA) * K.swingR * out,
      );
      if (e.chain) {
        e.chain.visible = out > 0;
        layBeam(e.chain, new THREE.Vector3(e.x, e.mesh.position.y - HOIST_FACE, e.z), g.position, 1);
      }
    }
    if (e.band) e.band.material.opacity = blink ? 0 : SHADOW_OPACITY[0] + (SHADOW_OPACITY[1] - SHADOW_OPACITY[0]) * k;
    if (e.timer <= 0) {
      e.st = 'swing';
      e.timer = K.swingTime;
      if (e.chain) e.chain.visible = true;
    }
  } else if (e.st === 'swing') {
    e.swingA += (enr ? K.swingTurnsEnr : K.swingTurns) * Math.PI * 2 * dt;
    e.hitT = Math.max(0, e.hitT - dt);
    const floor = floorY(e.x, e.z),
      gx = e.x + Math.cos(e.swingA) * K.swingR,
      gz = e.z + Math.sin(e.swingA) * K.swingR,
      gy = floor + SWING_Y;
    if (e.swingG) e.swingG.position.set(gx, gy, gz);
    if (e.chain)
      layBeam(e.chain, new THREE.Vector3(e.x, e.mesh.position.y - HOIST_FACE, e.z), new THREE.Vector3(gx, gy, gz), 1);
    if (e.band) e.band.material.opacity = SHADOW_OPACITY[0];
    if (e.hitT <= 0 && Math.abs(player.fy - floor) < LAND_DY) {
      const d = Math.hypot(player.x - e.x, player.z - e.z),
        pa = Math.atan2(player.z - e.z, player.x - e.x),
        da = Math.atan2(Math.sin(pa - e.swingA), Math.cos(pa - e.swingA));
      if (Math.abs(d - K.swingR) < K.swingW && Math.abs(da) < CARGO_HALF_W / K.swingR) {
        damagePlayer(e.dmg * K.swingDmg, { x: gx, z: gz });
        e.hitT = SWING_HIT_GAP;
      }
    }
    if (e.timer <= 0) endSwing(e, enr);
  } else if (e.st === 'barrage') {
    follow(e, e.goal.x, e.goal.z, K.rushSpeed, dt);
    e.dropT -= dt;
    if (e.dropT <= 0 && e.left > 0) {
      hang(e, e.x, e.z, K.barrageWarn, false);
      e.left--;
      e.dropT = K.barrageEvery;
    }
    if (e.left <= 0) e.st = 'hang';
  }
  updateCargos(e, dt, enr);
  if (e.st === 'hang' && e.cargos.length === 0) {
    e.st = 'chase';
    e.timer = enr ? K.gapEnr : K.gap;
  }
  if (e.st !== 'wind' && e.st !== 'pull') e.glow = Math.max(0, e.glow - dt * GLOW_FADE);
  e.baseEI = e.restEI + e.glow * MAGNET_GLOW;
  e.coil.color.setHex(COIL_DIM).lerp(COIL_LIT, e.glow);
  showPull(e, e.st === 'pull');
  e.aloft = e.st !== 'chase' && e.st !== 'approach'; // a phase change waits for the attack to end
  e.mesh.position.set(e.x, floorY(e.cx, e.cz) + e.y, e.z);
  e.frame.wire.visible = true;
  // the beacons warn from the load going up until it lands, and while the magnet pulls; the drum winds while they warn
  // and pays out as a load falls
  const warning =
    e.st === 'wind' ||
    e.st === 'pull' ||
    e.st === 'hang' ||
    e.st === 'barrage' ||
    e.st === 'swingWind' ||
    e.st === 'swing';
  e.frame.tick(dt, e.t, warning, e.cargos.some(c => c.falling) ? -REEL_SPEED : warning ? REEL_SPEED : 0);
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
  e.cargos = []; // (their meshes went with the boss's extra)
  g.position.copy(at);
  dropWreck(g, g.position.x, g.position.z, {
    tag: 'crane', // (the test counts the crane and the fallen magnet)
    gravity: K.fallG,
    drop: g.position.y - floorY(g.position.x, g.position.z) - HOIST_FACE,
    onLand: (x, z, floor) => {
      g.rotation.z = WRECK_TILT;
      burst(x, floor + HOIST_FACE, z, SMOKE, 20, 6, 1.2, -1);
      burst(x, floor + HOIST_FACE + 0.4, z, COLOR.amber, 12, 8, 0.8);
      screenFx.shake = Math.max(screenFx.shake, 0.3);
      sfx('slam');
    },
  });
}
