import * as THREE from 'three';
import { SIDE_STEP, T } from '@engine/world/tiles.ts';
import type { FloorPlan } from '../../building.ts';
import { SIGN_FONT, canvasTex, poolTex } from '../paint.ts';
import { facing, lightMat, onWall, pose } from '../props.ts';
import type { PropTools } from '../props.ts';
// What marks a lift's way in at the mall (props): over the opening, a steel frame with the word on a plate and the
// lit number of the floor. The lift's own tile is marked on the floor (the violet platform) and its three walls are
// the car's (pictures.ts MALL_LIFT_WALLS); there is no door and no body in the tile world.
// ---- tuning numbers used only here ----
const BEAM = { h: 0.7, thick: 0.3, y: 3.55 }; // the steel header over the opening, from wall to wall (m)
const PLATE = { w: 2.2, h: 0.5, out: 0.17 }; // the plate with the word, on the header's face (m)
const LAMP = { w: 0.5, h: 0.4, off: 1.5, glow: 1.6, glowOpacity: 0.3 }; // the number's lamp, beside the plate
const STEEL = 0x9a9588;
const GLOW_COLOR = 0xffa95a;
const PX = [256, 52] as const;
let plateTexture: THREE.CanvasTexture | null = null;
const digits = new Map<number, THREE.CanvasTexture>();
// the plate: dark glass in a steel rim, the word in pale letters
const plateTex = (word: string): THREE.CanvasTexture =>
  (plateTexture ??= canvasTex(PX[0], PX[1], g => {
    g.fillStyle = '#9a9588';
    g.fillRect(0, 0, PX[0], PX[1]);
    g.fillStyle = '#26231f';
    g.fillRect(5, 5, PX[0] - 10, PX[1] - 10);
    g.fillStyle = '#d6cdb2';
    g.font = `700 30px ${SIGN_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(word, PX[0] / 2, PX[1] / 2 + 2, PX[0] - 24);
  }));
// the lamp: the floor's number in orange on black
function digitTex(n: number): THREE.CanvasTexture {
  let t = digits.get(n);
  if (!t) {
    t = canvasTex(64, 52, g => {
      g.fillStyle = '#9a9588';
      g.fillRect(0, 0, 64, 52);
      g.fillStyle = '#0d0b09';
      g.fillRect(4, 4, 56, 44);
      g.fillStyle = '#ffa95a';
      g.shadowColor = '#ff8a2a';
      g.shadowBlur = 8;
      g.font = '700 36px "Courier New",monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(n), 32, 27);
    });
    digits.set(n, t);
  }
  return t;
}
// the plate and the lamp on the way in of each lift that stops on this floor (`lifts`: the tiles of its platforms)
export function liftPlate(plan: FloorPlan, add: PropTools['add'], lifts: Set<number>, floor: number, word: string) {
  const { W, maps: M } = plan.gen,
    beams: THREE.Matrix4[] = [],
    plates: THREE.Matrix4[] = [],
    lamps = new Map<number, THREE.Matrix4[]>(),
    glow: THREE.Matrix4[] = [];
  for (const k of lifts) {
    if (M.grid[k] !== 1) continue;
    const open = SIDE_STEP.flatMap(([di, dj], s) => (M.grid[k + dj! * W + di!] === 1 ? [s] : []));
    if (open.length !== 1) continue;
    // the way in is the open side: a plate over it, turned to look out of the car (the side's own facing is of a
    // wall that side, so turned about to look toward the floor beyond)
    const s = { i: k % W, j: (k / W) | 0, side: open[0]! },
      turn = facing(s) + Math.PI,
      face = onWall(s, 0, -PLATE.out, BEAM.y);
    beams.push(pose(onWall(s, 0, 0, BEAM.y), turn));
    plates.push(pose(face, turn));
    const lampAt = onWall(s, LAMP.off, -PLATE.out, BEAM.y);
    (lamps.get(floor + 1) ?? lamps.set(floor + 1, []).get(floor + 1)!).push(pose(lampAt, turn));
    glow.push(pose(lampAt, turn));
  }
  add(new THREE.BoxGeometry(T, BEAM.h, BEAM.thick), new THREE.MeshBasicMaterial({ color: STEEL }), beams);
  add(
    new THREE.PlaneGeometry(PLATE.w, PLATE.h),
    new THREE.MeshBasicMaterial({ map: plateTex(word), side: THREE.DoubleSide }),
    plates,
  );
  for (const [n, where] of lamps)
    add(
      new THREE.PlaneGeometry(LAMP.w, LAMP.h),
      new THREE.MeshBasicMaterial({ map: digitTex(n), side: THREE.DoubleSide }),
      where,
    );
  add(new THREE.PlaneGeometry(LAMP.glow, LAMP.glow * 0.7), lightMat(poolTex(), LAMP.glowOpacity, GLOW_COLOR), glow);
}
