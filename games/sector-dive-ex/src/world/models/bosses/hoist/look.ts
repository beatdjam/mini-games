import * as THREE from 'three';
import { basicMat, shared } from '@engine/render/render.ts';
import { PAINT, css } from '../../../../data/colors.ts';
import { TEX, grain, paint, stripes } from '../../../looks/paint.ts';
import type { Paint } from '../../../looks/paint.ts';
import {
  CARD_SIZE,
  RATING_SIZE,
  UNIT_SIZE,
  beaconOff,
  beaconTick,
  decoKit,
  hoistBeacon,
  hoistCab,
  hoistCable,
  hoistChain,
  hoistScrap,
  hoistWorkLamp,
} from './deco.ts';
import { V, at, boxGeo, cylGeo, machine, piston } from '../../machine.ts';
import { torusGeo } from '../shared.ts';
// HOIST: the overhead crane of a loading dock. The frame (hoistFrame) stands in the boss room for the whole fight: two
// rails from wall to wall under the ceiling, a bridge girder that runs along them on a truck at each end, and the
// trolley that runs along the girder with the wire's drum. The rails and the girder are rust iron; the girder wears
// safety stripes. The magnet (hoistMagnet) hangs on the wire: a heavy box with a stripe band, the hook block on chains
// over it and, under it, the plate that holds the load; the coil's face lights when it pulls. The load it lets go of
// (hoistCargo) is a shipping container or a pallet of crates. Their pictures are the boss's own: nothing here is hit
const STRIPE_PITCH = 64; // px, on a TEX picture
const BRIDGE_STRIPE_REPEAT = 24; // times the stripes' picture runs along the bridge's band
const MAGNET_STRIPE_REPEAT = 2; // ... and round the magnet's
const hoistStripes: Paint = (g, rand) => {
  stripes(g, [0, 0, TEX, TEX], STRIPE_PITCH, css(PAINT.amber1), css(PAINT.ink7), 'rgba(20,14,10,.22)');
  grain(g, rand, 10);
};
const stripeMat = (seed: number, repeat: number) => {
  const map = paint(seed, hoistStripes, true);
  map.repeat.set(repeat, 1);
  return shared(new THREE.MeshPhongMaterial({ map, specular: PAINT.soot15, shininess: 20 }));
};
const plainPhong = (color: number, shininess = 14) =>
  shared(new THREE.MeshPhongMaterial({ color, specular: PAINT.soot15, shininess }));
let hoistMats: Record<'rust' | 'bridgeBand' | 'magnetBand' | 'container' | 'crate' | 'wood', THREE.Material> | null =
  null;
const hoistKit = () =>
  (hoistMats ??= {
    rust: plainPhong(PAINT.rust2),
    bridgeBand: stripeMat(7101, BRIDGE_STRIPE_REPEAT),
    magnetBand: stripeMat(7102, MAGNET_STRIPE_REPEAT),
    container: plainPhong(PAINT.teal),
    crate: plainPhong(PAINT.clay3),
    wood: plainPhong(PAINT.clay1),
  });
export const HOIST_HOOK_TOP = 2.35; // the magnet's hook is this far above its middle (m)
export const HOIST_FACE = 1.0; // ... and its lower face this far under it
export const HOIST_CARGO_H = 1.5; // the load's height (m)
export interface HoistFrame {
  g: THREE.Group; // stands at the middle of the room, on the floor
  wire: THREE.Mesh;
  // the trolley at (x, z) from the middle of the room, the wire down to a hook at hookY
  pose(x: number, z: number, hookY: number): void;
  // a frame of the dressing: the beacons turn (alert: red and fast), the drum turns `reel` rad/s
  tick(dt: number, t: number, alert: boolean, reel: number): void;
  stop(): void; // the beacons go dark
}
// railX: how far each rail is from the middle, halfZ: how far the room goes either way along them, top: the ceiling's
// height; pylons: columns under the rails' ends, for a room whose walls do not reach the ceiling (a boss arena)
export function hoistFrame(railX: number, halfZ: number, top: number, pylons: boolean): HoistFrame {
  const g = new THREE.Group(),
    k = machine(),
    kit = hoistKit(),
    deco = decoKit(),
    bridge = new THREE.Group(),
    trolley = new THREE.Group(),
    railY = top - 0.6,
    trolleyBottom = top - 3.55,
    wire = at(cylGeo(0.07, 0.07, 1, 8), k.black);
  g.add(
    at(boxGeo(0.9, 0.8, halfZ * 2 + 4), kit.rust, -railX, railY, 0), // the rails run into the walls
    at(boxGeo(0.9, 0.8, halfZ * 2 + 4), kit.rust, railX, railY, 0),
  );
  bridge.add(
    at(boxGeo(railX * 2, 1.3, 1.5), deco.girder, 0, top - 1.95, 0), // the girder
    at(boxGeo(railX * 2 - 4, 0.5, 1.56), kit.bridgeBand, 0, top - 1.95, 0),
  );
  // the plates and the caution card on both sides of the girder, the cab on it, a beacon at each end
  for (const side of [-1, 1]) {
    const z = side * 0.78,
      y = top - 1.95,
      turn = side > 0 ? 0 : Math.PI;
    for (const [mat, size, x] of [
      [deco.rating, RATING_SIZE, -railX * 0.62],
      [deco.unit, UNIT_SIZE, railX * 0.5],
      [deco.card, CARD_SIZE, railX * 0.18],
    ] as const) {
      const plate = at(boxGeo(size[0], size[1], 0.04), mat, side * x, y, z);
      plate.rotation.y = turn;
      bridge.add(plate);
    }
  }
  // (the beacons stand out from the girder's sides, near each end: from the floor, the top of the girder is not seen)
  const cab = hoistCab(),
    beacons: ReturnType<typeof hoistBeacon>[] = [];
  cab.position.set(-railX * 0.25, top - 1.3, 0);
  bridge.add(cab);
  for (const side of [-1, 1])
    for (const x of [-railX + 5, railX - 5]) {
      const b = hoistBeacon();
      b.g.position.set(x, top - 1.65, side * 0.75);
      b.g.rotation.x = (side * Math.PI) / 2;
      bridge.add(b.g);
      beacons.push(b);
    }
  // the supply cable along one side, a broken chain from under each truck (outside the trolley's way)
  const cable = hoistCable(railX * 2 - 6);
  cable.position.set(-railX + 3, top - 1.7, 0.82);
  bridge.add(cable);
  for (const sx of [-1, 1]) {
    const chain = hoistChain();
    chain.position.set(sx * railX, top - 1.85, sx * 1.2);
    chain.rotation.z = sx * 0.08;
    bridge.add(chain);
  }
  for (const sx of [-1, 1])
    bridge.add(
      at(boxGeo(2.4, 1.4, 3.2), k.black, sx * railX, top - 1.15, 0), // the truck on a rail
      at(boxGeo(2.6, 0.16, 3.4), k.steel, sx * railX, top - 0.42, 0),
      at(boxGeo(0.3, 0.3, 0.3), basicMat(PAINT.amber5), sx * railX, top - 1.9, 1.7), // its lamp
    );
  // the drum turns on its own axis (along z): fins on its ends show it
  const drum = new THREE.Group();
  drum.position.set(0, top - 3.2, 0);
  drum.add(at(cylGeo(0.42, 0.42, 1.7, 14), k.steel, 0, 0, 0, 'z'));
  for (const z of [-0.9, 0.9]) drum.add(at(boxGeo(0.95, 0.08, 0.1), k.black, 0, 0, z));
  trolley.add(
    at(boxGeo(2.2, 0.9, 2.4), k.black, 0, top - 3.1, 0),
    at(boxGeo(1.6, 0.2, 1.8), k.steel, 0, top - 2.62, 0),
    drum,
    at(boxGeo(0.3, 0.3, 0.3), basicMat(PAINT.amber5), 0.9, top - 3.0, 1.25),
  );
  const work = hoistWorkLamp(); // under the trolley, to one side of the wire
  work.position.set(0, top - 3.65, 0.85);
  trolley.add(work);
  bridge.add(trolley);
  g.add(bridge, wire);
  if (pylons)
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) g.add(at(boxGeo(0.9, railY, 0.9), k.black, sx * railX, railY / 2, sz * (halfZ - 0.6)));
  return {
    g,
    wire,
    pose(x, z, hookY) {
      bridge.position.z = z;
      trolley.position.x = x;
      wire.position.set(x, (trolleyBottom + hookY) / 2, z);
      wire.scale.set(1, Math.max(0.01, trolleyBottom - hookY), 1);
    },
    tick(dt, t, alert, reel) {
      beacons.forEach(b => beaconTick(b, t, alert));
      drum.rotation.z += reel * dt;
    },
    stop() {
      beacons.forEach(beaconOff);
    },
  };
}
// the magnet; `mat` is the boss's body material (it flashes when hit), `coil` the lit face of the coil
// `scrap`: what is stuck to its plate, a mall's or a foundry's
export function hoistMagnet(mat: THREE.Material, coil: THREE.Material, scrap: 'mall' | 'forge'): THREE.Group {
  const g = new THREE.Group(),
    k = machine(),
    lamp = basicMat(PAINT.amber5);
  g.add(
    at(boxGeo(3.0, 1.4, 3.0), mat, 0, 0, 0), // the body
    at(boxGeo(3.02, 1.4, 3.02), decoKit().decal, 0, 0, 0), // rust runs, oil, dents and welds on it
    hoistScrap(scrap),
    at(boxGeo(3.06, 0.4, 3.06), hoistKit().magnetBand, 0, -0.25, 0),
    at(boxGeo(2.0, 0.7, 2.0), mat, 0, 1.05, 0),
    at(boxGeo(3.4, 0.3, 3.4), k.black, 0, -0.85, 0), // the plate the load hangs from
    at(cylGeo(1.25, 1.25, 0.06, 20), coil, 0, -1.0, 0), // the coil's face
    at(boxGeo(0.8, 0.6, 0.8), k.steel, 0, 1.55, 0), // the hook block, and the hook
    at(torusGeo(0.26, 0.07), k.steel, 0, 2.08, 0),
  );
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      g.add(
        piston(V(sx * 0.9, 1.4, sz * 0.9), V(sx * 0.3, 1.75, sz * 0.3), 0.06), // the chains
        at(boxGeo(0.25, 0.25, 0.25), lamp, sx * 1.5, 0.55, sz * 1.5),
      );
  // two guns slung under the plate at opposite corners (actors/bosses/hoist.ts fires its fans from under the magnet):
  // a box with twin barrels pointing down and out, an ammunition can on its side
  for (const s of [-1, 1]) {
    const gun = new THREE.Group();
    gun.position.set(s * 1.25, -1.15, s * 1.25);
    gun.rotation.y = s > 0 ? Math.PI / 4 : (-3 * Math.PI) / 4;
    gun.rotation.x = 0.5;
    gun.add(
      at(boxGeo(0.4, 0.3, 0.5), k.black, 0, 0, 0),
      at(cylGeo(0.05, 0.05, 0.6, 8), k.steel, -0.09, 0, 0.5, 'z'),
      at(cylGeo(0.05, 0.05, 0.6, 8), k.steel, 0.09, 0, 0.5, 'z'),
      at(boxGeo(0.18, 0.22, 0.3), mat, 0.3, 0, -0.05),
      at(boxGeo(0.3, 0.06, 0.06), lamp, 0, 0.18, 0.1),
    );
    g.add(gun);
  }
  return g;
}
// a load for the magnet to drop: a shipping container (kind 0) or a pallet of crates (1); its middle is its origin
export function hoistCargo(kind: number): THREE.Group {
  const g = new THREE.Group(),
    k = machine(),
    kit = hoistKit();
  if (kind === 0) {
    g.add(at(boxGeo(3.0, HOIST_CARGO_H, 3.0), kit.container, 0, 0, 0));
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) g.add(at(boxGeo(0.14, HOIST_CARGO_H + 0.06, 0.14), k.black, sx * 1.5, 0, sz * 1.5));
    for (const side of [-1, 1])
      for (let n = -2; n <= 2; n++)
        g.add(
          at(boxGeo(0.1, HOIST_CARGO_H - 0.2, 0.06), k.black, n * 0.55, 0, side * 1.52), // the ribs of the sides
          at(boxGeo(0.06, HOIST_CARGO_H - 0.2, 0.1), k.black, side * 1.52, 0, n * 0.55),
        );
    return g;
  }
  g.add(at(boxGeo(3.0, 0.1, 3.0), kit.wood, 0, -0.56, 0));
  for (const z of [-1.1, 0, 1.1]) g.add(at(boxGeo(3.0, 0.14, 0.5), kit.wood, 0, -0.68, z));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      g.add(
        at(boxGeo(1.35, 1.2, 1.35), kit.crate, sx * 0.72, 0.09, sz * 0.72),
        at(boxGeo(1.39, 0.08, 1.39), k.black, sx * 0.72, 0.3, sz * 0.72), // its strap
      );
  return g;
}
