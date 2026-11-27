// The scale course view (#view-scale…): the course, the 7/8/10 m mechs and the collision radius, from a few cameras.
// It is a tool for deciding sizes by eye; it does not move anything or collide with the walls.
import { camera, scene } from '@engine/render/index.ts';
import {
  STEP_SIZES,
  STATIONS,
  buildCourse,
  CORRIDOR_WIDTHS,
  DOOR_OPENINGS,
  REF_WALLS,
  type StationName,
} from '../course.ts';
import { buildMechProxy, buildRadiusRing } from '../../view/mechProxy.ts';
import { SIZE_BOX_NAME } from '../../view/field.ts';

declare global {
  interface Window {
    sbScaleTable?: () => string;
  }
}

const SCALE_DEFAULTS = {
  mech: 8, // the mech's height (m)
  ceil: 18, // the hall's ceiling height (m)
  radius: 2, // the collision radius drawn at each model's feet (m)
} as const;

const SCALE_HASH = '#view-scale';

// The heights of the models lined up at each station (m). A ?mech= value that is not one of them is added, so the line
// always has a model at the chosen height.
const MECH_HEIGHTS = [7, 8, 10] as const;
const MECH_GAP = 6; // between the models' centres (m)

const SCALE_FAR = 600; // the camera's far plane for the course (m), past the whole course

interface Shot {
  pos: [number, number, number];
  look: [number, number, number];
}

type ShotName = 'overview' | StationName;

// The course's cameras: the whole course from above and each place from the front.
const SHOTS: Record<ShotName, Shot> = {
  overview: { pos: [48, 130, 100], look: [48, 0, -40] },
  corridor: { pos: [STATIONS.corridor.x, 18, STATIONS.corridor.z + 26], look: [STATIONS.corridor.x, 6, 18] },
  door: { pos: [STATIONS.door.x, 16, STATIONS.door.z + 30], look: [STATIONS.door.x, 9, 0] },
  hall: { pos: [STATIONS.hall.x, 22, STATIONS.hall.z + 26], look: [STATIONS.hall.x, 10, -60] },
  step: { pos: [STATIONS.step.x, 12, STATIONS.step.z + 26], look: [STATIONS.step.x, 3, STATIONS.step.z - 10] },
  ref: { pos: [STATIONS.ref.x, 12, STATIONS.ref.z + 30], look: [STATIONS.ref.x, 7, 0] },
};

function numberParam(params: URLSearchParams, name: string, fallback: number): number {
  const value = params.get(name);
  if (value === null || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isShotName(name: string): name is ShotName {
  return Object.prototype.hasOwnProperty.call(SHOTS, name);
}

function shotName(hash: string): ShotName {
  const rest = hash.slice(SCALE_HASH.length);
  if (rest === '') return 'overview';
  const parts = rest.startsWith('-') ? rest.slice(1).split('-') : [];
  const name = parts.length === 1 ? parts[0] : '';
  if (!isShotName(name)) throw new Error(`no camera for ${hash}`);
  return name;
}

// The heights of the models, with ?mech= added when it is not one of the three.
function mechHeights(mech: number): number[] {
  return [...new Set<number>([...MECH_HEIGHTS, mech])].sort((a, b) => a - b);
}

function addStation(station: { x: number; z: number }, heights: readonly number[], radius: number) {
  for (let i = 0; i < heights.length; i++) {
    const x = station.x + (i - (heights.length - 1) / 2) * MECH_GAP;
    const mech = buildMechProxy(heights[i]);
    mech.position.set(x, 0, station.z);
    scene.add(mech);
    const ring = buildRadiusRing(radius);
    ring.position.x = x;
    ring.position.z = station.z;
    scene.add(ring);
  }
}

export interface ScaleTableOpts {
  ceil: number;
  radius: number;
}

// The same sizes as a Markdown table: each one over the 7, 8 and 10 m mechs' heights (an opening by its height, the
// size a mech has to pass under), with the width left over after the collision radius for the widths.
export function scaleTable(opts: ScaleTableOpts): string {
  const heights = [7, 8, 10] as const;
  const columns = ['寸法'];
  for (const h of heights) columns.push(`${h}m 比`, `${h}m 余裕 (m)`);
  const lines = [`| ${columns.join(' | ')} |`, `| ${columns.map(() => '---').join(' | ')} |`];
  const row = (label: string, value: number, clearance?: number): string => {
    const cells = [label];
    for (const h of heights) {
      cells.push((value / h).toFixed(2), clearance === undefined ? '-' : clearance.toFixed(1));
    }
    return `| ${cells.join(' | ')} |`;
  };
  const room = (width: number): number => width - opts.radius * 2;
  for (const width of CORRIDOR_WIDTHS) lines.push(row(`通路の幅 ${width}m`, width, room(width)));
  for (const opening of DOOR_OPENINGS) lines.push(row(`開口 ${opening.w}×${opening.h}m`, opening.h, room(opening.w)));
  lines.push(row('天井', opts.ceil));
  for (const step of STEP_SIZES) lines.push(row(`段差 ${step}m`, step));
  for (const wall of REF_WALLS) lines.push(row(`Extended の壁 ${wall}m`, wall));
  return lines.join('\n');
}

export function showScale(hash: string) {
  const params = new URLSearchParams(location.search);
  const mech = numberParam(params, 'mech', SCALE_DEFAULTS.mech);
  const ceil = numberParam(params, 'ceil', SCALE_DEFAULTS.ceil);
  const radius = numberParam(params, 'radius', SCALE_DEFAULTS.radius);

  // the field's size box would stand in the course
  const sizeBox = scene.getObjectByName(SIZE_BOX_NAME);
  if (sizeBox) sizeBox.visible = false;
  // the course reaches past the field's fog, and the far plane has to take all of it
  scene.fog = null;
  camera.far = SCALE_FAR;
  camera.updateProjectionMatrix();

  scene.add(buildCourse({ ceil }).group);

  const heights = mechHeights(mech);
  for (const station of Object.values(STATIONS)) addStation(station, heights, radius);

  const name = shotName(hash);
  const shot = SHOTS[name];
  camera.position.set(shot.pos[0], shot.pos[1], shot.pos[2]);
  camera.lookAt(shot.look[0], shot.look[1], shot.look[2]);

  window.sbScaleTable = () => scaleTable({ ceil, radius });
}
