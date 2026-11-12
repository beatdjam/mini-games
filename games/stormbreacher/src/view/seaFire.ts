// The main guns firing at the allied boats out at sea (SB-200): while a gun stands, a flash at its muzzle and a line
// streaking toward the sea (+z) every few seconds, each gun on its own beat. Only drawn: no shot is made and nothing is
// hit. The beat is read from the game's clock, so a fallen gun just stops. It reads GameModel and never writes it.
import * as THREE from 'three';
import { scene } from '@engine/render/index.ts';
import { SEA_FLASH_COLOR, SEA_TRACER_COLOR } from '../data/colors.ts';
import { GUN_TUNE } from '../data/battery.ts';
import type { GameModel } from '../logic/game.ts';

const SEA_FIRE_PERIOD = 3.2; // the seconds between one shot of a gun and the next
const SEA_FIRE_OFFSET = 1.3; // how much later each gun's beat falls than the one before it (s)
const FLASH_TIME = 0.15; // how long the flash shows (s)
const FLASH_SIZE = 3; // the flash's side (m)
const TRACER_TIME = 0.9; // how long the line streaks (s)
const TRACER_SPEED = 220; // how fast the line's head flies (m/s)
const TRACER_LENGTH = 25; // the line's length behind its head (m)
const TRACER_SLOPE = 0.02; // how much the line climbs per metre toward the sea
const TRACER_SWAY = 0.08; // how far to the side the line goes per metre toward the sea; the guns go opposite ways

interface SeaGun {
  id: string; // the target's id
  flash: THREE.Mesh;
  tracer: THREE.Line;
}

export interface SeaFireView {
  guns: SeaGun[];
  group: THREE.Group; // the guns' flashes and lines, to take out
}

export const SEA_FLASH_NAME = 'sb-sea-flash';
export const SEA_TRACER_NAME = 'sb-sea-tracer';

// Builds a flash and a line for each main gun the game has, hidden.
export function buildSeaFire(game: GameModel): SeaFireView {
  const group = new THREE.Group();
  const guns: SeaGun[] = game.battery.guns.map(gun => {
    const flash = new THREE.Mesh(
      new THREE.BoxGeometry(FLASH_SIZE, FLASH_SIZE, FLASH_SIZE),
      new THREE.MeshBasicMaterial({ color: SEA_FLASH_COLOR }),
    );
    flash.name = SEA_FLASH_NAME;
    flash.visible = false;
    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const tracer = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: SEA_TRACER_COLOR }));
    tracer.name = SEA_TRACER_NAME;
    tracer.visible = false;
    // the two points are rewritten every frame, so the bounding sphere made at the start would cull the line
    tracer.frustumCulled = false;
    group.add(flash, tracer);
    return { id: gun.id, flash, tracer };
  });
  scene.add(group);
  return { guns, group };
}

// Shows each standing gun's flash and line for the part of its beat they last, and hides them otherwise.
export function drawSeaFire(view: SeaFireView, game: GameModel): void {
  view.guns.forEach((gun, i) => {
    const target = game.targets.find(item => item.id === gun.id);
    const standing = target !== undefined && target.hp > 0;
    // the seconds since this gun's last shot; a negative clock (before its first beat) shows nothing
    const age = (game.time - i * SEA_FIRE_OFFSET) % SEA_FIRE_PERIOD;
    gun.flash.visible = standing && game.time >= i * SEA_FIRE_OFFSET && age < FLASH_TIME;
    gun.tracer.visible = standing && game.time >= i * SEA_FIRE_OFFSET && age < TRACER_TIME;
    if (!target || !standing) return;
    const x = (target.box.minX + target.box.maxX) / 2;
    const y = target.box.maxY * GUN_TUNE.muzzle;
    const z = target.box.maxZ + GUN_TUNE.muzzleGap;
    gun.flash.position.set(x, y, z);
    if (!gun.tracer.visible) return;
    const sway = i % 2 === 0 ? TRACER_SWAY : -TRACER_SWAY;
    const head = age * TRACER_SPEED;
    const tail = Math.max(0, head - TRACER_LENGTH);
    const points = gun.tracer.geometry.getAttribute('position');
    points.setXYZ(0, x + sway * tail, y + TRACER_SLOPE * tail, z + tail);
    points.setXYZ(1, x + sway * head, y + TRACER_SLOPE * head, z + head);
    points.needsUpdate = true;
  });
}

// Takes the flashes and lines out of the scene.
export function removeSeaFire(view: SeaFireView): void {
  scene.remove(view.group);
  for (const gun of view.guns) {
    gun.flash.geometry.dispose();
    (gun.flash.material as THREE.Material).dispose(); // built above as a single material
    gun.tracer.geometry.dispose();
    (gun.tracer.material as THREE.Material).dispose(); // built above as a single material
  }
}
