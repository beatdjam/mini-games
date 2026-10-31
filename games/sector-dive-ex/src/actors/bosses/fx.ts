import * as THREE from 'three';
import { dynGroup, shared } from '@engine/render/render.ts';
import { spawn } from '@engine/core/world.ts';
import type { WorldObject } from '@engine/core/world.ts';
import { floorY } from '@engine/world/tiles.ts';
import { burst } from '@engine/render/fx.ts';
import { rand } from '@engine/core/util.ts';
import { PAINT } from '../../data/colors.ts';
// what a boss's attacks draw on the screen: the warning ring on the floor, a beam between two points and the wreck of
// something that falls. They are the boss's own show, so they stay in the game (not the engine).

export type Fill = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
export const additive = (color: number, opacity: number): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
export const flat = (color: number, opacity: number): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
export const ringGeo = shared(new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2));
export const discGeo = shared(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2));
export const RIM_BLINK = 0.75; // the rim blinks over the last quarter of the warning

const UP = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();

// the ring a boss puts on the floor before an attack lands
export interface WarningPad {
  g: THREE.Group; // put it in the boss's extra (it is already in the scene)
  fill: Fill;
  rim: Fill;
  // put it at (x, y, z), r wide (y is the floor's height plus the lift)
  set(x: number, y: number, z: number, r: number): void;
  // k: 0 when it appears, 1 at the blow; returns whether the rim is blinking now
  warn(k: number, t: number): boolean;
  hide(): void;
}
export function warningPad(o: {
  fill: number;
  rim: number;
  fillOpacity: [number, number];
  rimOpacity: number;
  visible?: boolean; // false: hidden until the attack shows it (SURGEON)
  inner?: Fill[]; // between the disc and the rim (SURGEON's core and inner ring)
  outer?: Fill[]; // over the rim (SURGEON's pulsing edge)
}): WarningPad {
  const fill: Fill = new THREE.Mesh(discGeo, flat(o.fill, 0)),
    rim: Fill = new THREE.Mesh(ringGeo, flat(o.rim, 0)),
    g = new THREE.Group();
  g.add(fill, ...(o.inner ?? []), rim, ...(o.outer ?? []));
  g.visible = o.visible ?? true;
  dynGroup.add(g);
  return {
    g,
    fill,
    rim,
    set(x: number, y: number, z: number, r: number) {
      g.position.set(x, y, z);
      g.scale.set(r, 1, r);
    },
    warn(k: number, t: number): boolean {
      fill.material.opacity = o.fillOpacity[0] + (o.fillOpacity[1] - o.fillOpacity[0]) * k;
      const blink = k > RIM_BLINK && Math.sin(t * 40) > 0;
      rim.material.opacity = blink ? 0 : o.rimOpacity;
      return blink;
    },
    hide() {
      g.visible = false;
    },
  };
}

// a mesh whose own length is 1 along y, laid from one point to another; wide is its scale across
export function layBeam(m: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, wide: number): void {
  m.position.copy(from).add(to).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, _dir.copy(to).sub(from).normalize());
  m.scale.set(wide, from.distanceTo(to), wide);
}

export interface DropWreck {
  gravity: number; // m/s^2
  drop: number; // how far it falls (m)
  tag?: string; // the world group (default 'wreck'; HOIST keeps 'crane')
  hang?: number; // seconds it hangs first (s)
  sag?: number; // the most it sags while hanging (m; min(sag ?? drop / 2, drop / 2))
  spin?: number; // rad/s it turns as it falls
  tilt?: number; // how far over it lies as it falls (rad); 0: it does not tilt (HOIST tilts it when it lands)
  sparkY?: number; // the world height its sparks come from while it hangs (m)
  sparkGap?: number; // seconds between sparks (no sparks when not given). They keep coming until it lands, from lower as it falls
  dim?: (life: number) => void;
  onLand?: (x: number, z: number, floor: number) => void; // its dust, shake and sound
}
// something falls `drop` m, lies there (its onLand), and stays with the level
export function dropWreck(g: THREE.Object3D, x: number, z: number, o: DropWreck): void {
  const floor = floorY(x, z),
    hang = o.hang ?? 0,
    sag = Math.min(o.sag ?? o.drop / 2, o.drop / 2),
    y0 = g.position.y;
  dynGroup.add(g);
  let vy = 0,
    fallen = 0,
    t = 0,
    sparkIn = 0,
    dark = false;
  const w: WorldObject = spawn({
    tag: o.tag ?? 'wreck',
    mesh: g,
    update(dt: number) {
      t += dt;
      sparkIn -= dt;
      if (o.sparkGap !== undefined && sparkIn <= 0 && fallen < o.drop) {
        sparkIn = o.sparkGap;
        burst(
          x + rand(-0.4, 0.4),
          (o.sparkY ?? y0) + g.position.y - y0 + rand(-0.4, 0.4),
          z + rand(-0.4, 0.4),
          PAINT.amber3,
          3,
          5,
          0.5,
        );
      }
      if (t < hang) {
        // hanging: sagging and shaking, the lights flickering out
        const u = t / hang;
        fallen = sag * u * u;
        g.position.y = y0 - fallen;
        g.rotation.z = Math.sin(t * 45) * 0.025 * (1 - u);
        o.dim?.(Math.random() < 1 - u ? 1 - u * 0.5 : 0.05);
        return;
      }
      if (!dark) {
        dark = true;
        o.dim?.(0);
      }
      vy += o.gravity * dt;
      const step = Math.min(vy * dt, Math.max(o.drop - fallen, 0));
      fallen += step;
      g.position.y -= step;
      g.rotation.y += (o.spin ?? 0) * dt;
      g.rotation.z = (o.tilt ?? 0) * Math.min(fallen / Math.max(o.drop, 0.01), 1);
      if (fallen < o.drop) return;
      o.onLand?.(x, z, floor);
      w.update = undefined; // it lies where it fell
    },
  });
}
