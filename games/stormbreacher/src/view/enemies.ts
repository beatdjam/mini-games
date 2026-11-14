// The enemies as the screen draws them: one instanced mesh per kind, each soldier one merged shape baked from a mech kit
// (view/mechProtoBake.ts, SB-2083), and the machine-gun nest built from parts (one instanced mesh each, drawn once for
// every nest). The shape, not the colour, tells the soldiers' roles apart; their colours are baked in, so two materials
// still cover a whole soldier. Past a role's distance (data/enemyLooks.ts) its copies move to a second, simpler instanced
// mesh, so a crowd at a distance costs fewer triangles. It reads GameModel and never writes it.
import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { camera, scene } from '@engine/render/index.ts';
import {
  ENEMY_DOWN_TINT,
  NEST_BARREL_COLOR,
  NEST_DROID_COLOR,
  NEST_FLASH_COLOR,
  NEST_MARK_COLOR,
  NEST_MOUNT_COLOR,
  NEST_SAND_COLOR,
  NEST_SENSOR_COLOR,
  NEST_SHIELD_COLOR,
  NEST_TRIM_COLOR,
  PILLBOX_WARN_COLOR,
  WARDEN_COLOR,
} from '../data/colors.ts';
import { ENEMIES, ENEMY_KINDS, type EnemyKind, type SoldierKind } from '../data/enemies.ts';
import { ENEMY_DETAIL_DISTANCE, ENEMY_KITS } from '../data/enemyLooks.ts';
import { WARDEN_TUNE } from '../data/warden.ts';
import type { EnemyState } from '../logic/enemies.ts';
import type { GameModel } from '../logic/game.ts';
import { bakeProtoMech } from './mechProtoBake.ts';
import { MAP_FOG } from './world.ts';

const MAX_ENEMIES = 64; // the most enemies of one kind drawn at once; the rest walk unseen
const DOWN_SCALE_Y = 0.35; // how low a fallen enemy sits (its height scale)
const HOLD_HIDE_SCALE = 0.55; // how low a posted defender sits while it hides behind cover (SB-2015)
const ALIVE_TINT = 0xffffff; // an instance's colour multiplies the shape's own, so white leaves it as built
const DETAIL_HYSTERESIS = 3; // m either side of a role's distance; inside it a copy keeps the shape it had (SB-2086)

// The machine-gun nest's model (m), all in the nest's own frame: the middle of the ring on the ground, the front at -z.
// The enclosure is wider and taller than the hit box (5.8 m across, its wall 1.9 m high) so it reads from far away, and
// the gun and the shield stand near the middle of the hit box, so a shot that hits the middle shows on them. The bags
// are laid as four courses, each turned half a bag from the one below and drawn a little inside.
const NEST_MODEL = {
  bagW: 0.95, // a bag along the ring (m)
  bagH: 0.48, // its height
  bagD: 0.6, // its depth across the ring
  lowerRadius: 2.6, // the first course's ring (m)
  lowerBags: 17,
  lowerY: 0.24, // the first course's middle above the ground (m)
  midRadius: 2.5, // the second course sits a little inside
  midBags: 16,
  midY: 0.72,
  upperRadius: 2.42,
  upperBags: 15,
  upperY: 1.2,
  topRadius: 2.5,
  topBags: 16,
  topY: 1.68,
  frontOpening: 0.85, // the top courses stop within this angle of the front, so the gun looks out over a low lip (rad)
  gunPivot: [0, 2.05, 0.2] as const, // the barrel turns about this
  gunDip: -0.55, // how far the barrel points down while the nest sleeps (rad)
  fellTilt: -0.7, // and how far it tips when the nest is put down
  fellDrop: -0.5, // how far the gun drops then (m)
  droidPivot: [-1.55, 0, 0.7] as const, // the gunner falls about its feet
  droidTilt: -1.05,
  mountPivot: [0, 1.6, 0.2] as const,
  mountTilt: -0.8,
  mountDrop: -1.2,
  shieldPivot: [0, 2.05, -0.35] as const,
  shieldTilt: -0.9,
  shieldDrop: -1.4,
} as const;

// One part of a model: its mesh, where the part stands in a whole model and in a fallen one, and (for a part that moves
// while the enemy sleeps) where it rests then. The places are the part's own, in metres, from the enemy's feet.
export interface EnemyPart {
  mesh: THREE.InstancedMesh;
  standing: THREE.Matrix4;
  fallen: THREE.Matrix4;
  sleeping?: THREE.Matrix4;
  firingOnly?: boolean; // drawn only while the enemy is awake (the nest's muzzle flash)
  level?: 'near' | 'far'; // the soldier's detail: a copy takes one level or the other
}

export interface EnemyKindView {
  mesh: THREE.InstancedMesh; // the mesh named for the kind (the full shape, for a soldier)
  parts: readonly EnemyPart[]; // its parts, the named mesh among them
  colored: boolean; // whether each copy takes a tint (the soldiers' alive or down) or the parts' own colours (the nest)
  detail?: number; // m from the camera past which a soldier's copies take the far part
  farLevels?: WeakMap<EnemyState, boolean>; // soldiers: the shape each copy had last frame, for the switch's width
}

export type EnemyView = Record<EnemyKind, EnemyKindView>;

// The name of a kind's mesh in the scene.
export const enemyMeshName = (kind: EnemyKind): string => `sb-enemy-${kind}`;
// The name of a soldier's simplified mesh, drawn past the role's distance (SB-2083).
export const enemyFarMeshName = (kind: SoldierKind): string => `${enemyMeshName(kind)}-far`;

// One box with its place baked in.
function box(
  w: number,
  h: number,
  d: number,
  at: readonly [number, number, number],
  turn = [0, 0, 0],
): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d);
  if (turn[0] !== 0) geometry.rotateX(turn[0]);
  if (turn[1] !== 0) geometry.rotateY(turn[1]);
  if (turn[2] !== 0) geometry.rotateZ(turn[2]);
  geometry.translate(at[0], at[1], at[2]);
  return geometry;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return BufferGeometryUtils.mergeBufferGeometries(parts);
}

// Gives a geometry one flat colour, so pieces of different colours can be merged into one mesh and drawn in one call.
function painted(geometry: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const shade = new THREE.Color(color);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) shade.toArray(colors, i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// What the part's mesh does in a whole model, in a sleeping one (only a part with its own sleeping place) and in a fallen
// one. `tipped` turns a part about a pivot and then drops it, so a barrel tips at its mount rather than at the feet.
interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const ONE: Vec3 = { x: 1, y: 1, z: 1 };

function shifted(at: readonly [number, number, number], scale: Vec3 = ONE): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...at),
    new THREE.Quaternion(),
    new THREE.Vector3(scale.x, scale.y, scale.z),
  );
}

function tipped(pivot: readonly [number, number, number], rotX: number, drop: number): THREE.Matrix4 {
  const matrix = new THREE.Matrix4().makeTranslation(0, drop, 0);
  matrix.multiply(new THREE.Matrix4().makeTranslation(pivot[0], pivot[1], pivot[2]));
  matrix.multiply(new THREE.Matrix4().makeRotationX(rotX));
  matrix.multiply(new THREE.Matrix4().makeTranslation(-pivot[0], -pivot[1], -pivot[2]));
  return matrix;
}

// One part's mesh: made once at the most copies a kind may draw, with nothing drawn yet. A part that takes a colour per
// copy (`colored`) gets its colour array now at the full size; a part that does not gets none, because three multiplies
// the material's colour by instanceColor whenever it exists, and an array never written is all zeros: the part draws black.
function partMesh(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  colored = false,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, MAX_ENEMIES);
  mesh.name = name;
  // three r128 sizes instanceColor from the count at the first setColorAt, which is 0 here, so build it at full size now
  if (colored) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_ENEMIES * 3), 3);
  mesh.count = 0;
  // the instances move every frame, so the bounding sphere made at the start would cull them
  mesh.frustumCulled = false;
  return mesh;
}

// A soldier: its kit baked into one shape, drawn as one copy of one instanced mesh. The shape is already in metres with
// its feet at y = 0, so standing is the copy's own place, and it is only squashed to fall. Two shapes are built: the full
// one and the simplified one the far copies use (SB-2083), and both share the two materials (paint and light).
function buildSoldierView(kind: SoldierKind): EnemyKindView {
  const kit = ENEMY_KITS[kind];
  const height = ENEMIES[kind].height;
  const near = bakeProtoMech(kit, height, 'full');
  const far = bakeProtoMech(kit, height, 'far');
  const materials = [
    new THREE.MeshLambertMaterial({ vertexColors: true }),
    new THREE.MeshBasicMaterial({ vertexColors: true }),
  ];
  const nearMesh = partMesh(enemyMeshName(kind), near.geometry, materials, true);
  const farMesh = partMesh(enemyFarMeshName(kind), far.geometry, materials, true);
  const standing = new THREE.Matrix4();
  const fallen = shifted([0, 0, 0], { x: 1, y: DOWN_SCALE_Y, z: 1 });
  const nearPart: EnemyPart = { mesh: nearMesh, standing, fallen, level: 'near' };
  const farPart: EnemyPart = { mesh: farMesh, standing, fallen, level: 'far' };
  return {
    mesh: nearMesh,
    parts: [nearPart, farPart],
    colored: true,
    detail: ENEMY_DETAIL_DISTANCE[kind],
    farLevels: new WeakMap(),
  };
}

// The mid boss (SB-1850): its body, the shoulder light that warns of a burst and the radiator plate on its back, merged
// into one shape in metres with its feet at y = 0. The boxes are laid out at the unit size and scaled by the kind's
// height and WARDEN_TUNE.look. The shape is white, so the copy's colour is the body's colour (WARDEN_COLOR) and the
// shoulder light's warning can swap it for PILLBOX_WARN_COLOR while a burst telegraph runs.
function wardenGeometry(): THREE.BufferGeometry {
  const body = new THREE.BoxGeometry(0.86, 0.8, 0.7);
  body.translate(0, -0.06, 0);
  const shoulder = new THREE.BoxGeometry(1, 0.08, 0.46);
  shoulder.translate(0, 0.18, -0.12);
  const back = new THREE.BoxGeometry(0.62, 0.42, 0.08);
  back.translate(0, -0.06, 0.36);
  const merged = merge([body, shoulder, back]);
  const look = WARDEN_TUNE.look;
  const height = ENEMIES.warden.height;
  merged.scale(look.bodyW, height, look.bodyD);
  merged.translate(0, height / 2, 0);
  merged.computeVertexNormals();
  return painted(merged, 0xffffff);
}

function buildWardenView(): EnemyKindView {
  const mesh = partMesh(
    enemyMeshName('warden'),
    wardenGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
    true,
  );
  const part: EnemyPart = {
    mesh,
    standing: new THREE.Matrix4(),
    fallen: shifted([0, 0, 0], { x: 1, y: DOWN_SCALE_Y, z: 1 }),
  };
  return { mesh, parts: [part], colored: true };
}

// A ring of sandbags: four courses of boxes, each turned half a bag from the one below and drawn a little inside, with
// the top two courses left open at the front so the gun looks out over a low lip. They are made in two halves so a
// fallen nest's enclosure can break open instead of sinking as one ring.
function sandbagsGeometry(half: 0 | 1): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const courses = [
    { radius: NEST_MODEL.lowerRadius, bags: NEST_MODEL.lowerBags, y: NEST_MODEL.lowerY, offset: 0, low: true },
    {
      radius: NEST_MODEL.midRadius,
      bags: NEST_MODEL.midBags,
      y: NEST_MODEL.midY,
      offset: Math.PI / NEST_MODEL.midBags,
      low: true,
    },
    { radius: NEST_MODEL.upperRadius, bags: NEST_MODEL.upperBags, y: NEST_MODEL.upperY, offset: 0, low: false },
    {
      radius: NEST_MODEL.topRadius,
      bags: NEST_MODEL.topBags,
      y: NEST_MODEL.topY,
      offset: Math.PI / NEST_MODEL.topBags,
      low: false,
    },
  ];
  for (const course of courses) {
    for (let i = 0; i < course.bags; i++) {
      const angle = (i / course.bags) * Math.PI * 2 + course.offset;
      const wrapped = angle % (Math.PI * 2);
      if (!course.low && Math.cos(angle) > Math.cos(NEST_MODEL.frontOpening)) continue;
      if ((wrapped < Math.PI ? 0 : 1) !== half) continue;
      parts.push(
        box(
          NEST_MODEL.bagW,
          NEST_MODEL.bagH,
          NEST_MODEL.bagD,
          [-course.radius * Math.sin(angle), course.y, -course.radius * Math.cos(angle)],
          [0, angle, 0],
        ),
      );
    }
  }
  return merge(parts);
}

// The tripod, the receiver and the ammunition; the barrel is a part of its own so it can point down while the nest
// sleeps. The bright rail and the mark are painted in, so the part is still one draw.
function mountGeometry(): THREE.BufferGeometry {
  return merge([
    painted(box(0.12, 2, 0.12, [-0.45, 0.95, 0.34], [0, 0, -0.32]), NEST_MOUNT_COLOR),
    painted(box(0.12, 2, 0.12, [0.45, 0.95, 0.34], [0, 0, 0.32]), NEST_MOUNT_COLOR),
    painted(box(0.12, 2, 0.12, [0, 0.95, 0.75], [-0.36, 0, 0]), NEST_MOUNT_COLOR),
    painted(box(0.28, 0.8, 0.28, [0, 1.6, 0.2]), NEST_MOUNT_COLOR),
    painted(box(0.48, 0.42, 1, [0, 2.05, 0.2]), NEST_MOUNT_COLOR),
    painted(box(0.32, 0.4, 0.42, [0.45, 1.86, 0.34]), NEST_MOUNT_COLOR),
    painted(box(0.5, 0.08, 0.9, [0, 2.29, 0.2]), NEST_TRIM_COLOR),
    painted(box(0.24, 0.2, 0.04, [0.45, 1.86, 0.11]), NEST_MARK_COLOR),
  ]);
}

// The barrel and its jacket, in the gun's own frame (the pivot at the origin, the muzzle toward -z), with bright bands
// and a bright sight, so the barrel reads even where the shield's slot is dark.
function barrelGeometry(): THREE.BufferGeometry {
  return merge([
    painted(new THREE.CylinderGeometry(0.1, 0.1, 1.4, 8).rotateX(Math.PI / 2).translate(0, 0, -0.8), NEST_BARREL_COLOR),
    painted(
      new THREE.CylinderGeometry(0.16, 0.16, 0.5, 8).rotateX(Math.PI / 2).translate(0, 0, -0.55),
      NEST_BARREL_COLOR,
    ),
    painted(box(0.26, 0.26, 0.34, [0, 0, -1.55]), NEST_MOUNT_COLOR),
    painted(box(0.06, 0.2, 0.06, [0, 0.21, -0.75]), NEST_TRIM_COLOR),
    painted(
      new THREE.CylinderGeometry(0.175, 0.175, 0.1, 8).rotateX(Math.PI / 2).translate(0, 0, -0.35),
      NEST_TRIM_COLOR,
    ),
    painted(
      new THREE.CylinderGeometry(0.175, 0.175, 0.1, 8).rotateX(Math.PI / 2).translate(0, 0, -0.74),
      NEST_TRIM_COLOR,
    ),
    painted(
      new THREE.CylinderGeometry(0.15, 0.15, 0.1, 8).rotateX(Math.PI / 2).translate(0, 0, -1.34),
      NEST_TRIM_COLOR,
    ),
  ]);
}

// The flash at the muzzle while the nest fires: a bright cross with a core.
function flashGeometry(): THREE.BufferGeometry {
  return merge([
    box(0.72, 0.13, 0.07, [0, 0, -1.72]),
    box(0.13, 0.72, 0.07, [0, 0, -1.72]),
    box(0.26, 0.26, 0.09, [0, 0, -1.75]),
  ]);
}

// The gun's shield: two plates with a slot for the barrel between them, and two wings turned back. The bright rims and
// the marks are painted in, so the part is still one draw.
function shieldGeometry(): THREE.BufferGeometry {
  return merge([
    painted(box(0.62, 1.4, 0.1, [-0.55, 2.1, -0.35], [0.12, 0, 0]), NEST_SHIELD_COLOR),
    painted(box(0.62, 1.4, 0.1, [0.55, 2.1, -0.35], [0.12, 0, 0]), NEST_SHIELD_COLOR),
    painted(box(0.28, 1.2, 0.1, [-1.12, 2.05, -0.2], [0, 0.6, 0]), NEST_SHIELD_COLOR),
    painted(box(0.28, 1.2, 0.1, [1.12, 2.05, -0.2], [0, -0.6, 0]), NEST_SHIELD_COLOR),
    painted(box(0.64, 0.1, 0.12, [-0.55, 2.81, -0.29], [0.12, 0, 0]), NEST_TRIM_COLOR),
    painted(box(0.64, 0.1, 0.12, [0.55, 2.81, -0.29], [0.12, 0, 0]), NEST_TRIM_COLOR),
    painted(box(0.06, 1.4, 0.12, [-0.25, 2.1, -0.35], [0.12, 0, 0]), NEST_TRIM_COLOR),
    painted(box(0.06, 1.4, 0.12, [0.25, 2.1, -0.35], [0.12, 0, 0]), NEST_TRIM_COLOR),
    painted(box(0.06, 1.4, 0.12, [-0.84, 2.1, -0.35], [0.12, 0, 0]), NEST_TRIM_COLOR),
    painted(box(0.06, 1.4, 0.12, [0.84, 2.1, -0.35], [0.12, 0, 0]), NEST_TRIM_COLOR),
    painted(box(0.3, 0.24, 0.04, [-0.55, 2.35, -0.42], [0.12, 0, 0]), NEST_MARK_COLOR),
    painted(box(0.3, 0.24, 0.04, [0.55, 2.35, -0.42], [0.12, 0, 0]), NEST_MARK_COLOR),
  ]);
}

// The gunner's upper body: a torso, a head, a shoulder yoke and the two arms reaching for the gun.
function droidGeometry(): THREE.BufferGeometry {
  return merge([
    box(0.46, 0.66, 0.38, [-1.55, 2.2, 0.7]),
    box(0.12, 0.18, 0.12, [-1.55, 2.5, 0.69]),
    box(0.28, 0.32, 0.06, [-1.55, 2.27, 0.5]),
    box(0.34, 0.34, 0.32, [-1.55, 2.7, 0.69]),
    box(0.58, 0.12, 0.28, [-1.55, 2.43, 0.67]),
    box(0.7, 0.1, 0.1, [-1.2, 2.12, 0.35]),
    box(0.7, 0.1, 0.1, [-1.2, 2.05, 0.15]),
    box(0.4, 0.8, 0.32, [-1.55, 1.55, 0.7]),
  ]);
}

// The gunner's sensor: a band across the head and a small light on the chest.
function sensorGeometry(): THREE.BufferGeometry {
  return merge([box(0.2, 0.07, 0.03, [-1.55, 2.72, 0.535]), box(0.09, 0.07, 0.03, [-1.55, 2.27, 0.475])]);
}

// The machine-gun nest: the sandbags, the tripod and receiver, the barrel, the shield, the gunner, its sensor and the
// flash that shows while it fires. The nest's named mesh is the sandbags, so a count of the kind counts the nests.
function buildNestView(): EnemyKindView {
  const name = enemyMeshName('emplacement');
  const bagMaterial = new THREE.MeshLambertMaterial({ color: NEST_SAND_COLOR });
  const paintedMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const sandbags = partMesh(name, sandbagsGeometry(0), bagMaterial);
  const sandbags2 = partMesh(`${name}-sandbags2`, sandbagsGeometry(1), bagMaterial);
  const mount = partMesh(`${name}-mount`, mountGeometry(), paintedMaterial);
  const barrel = partMesh(`${name}-barrel`, barrelGeometry(), paintedMaterial);
  const shield = partMesh(`${name}-shield`, shieldGeometry(), paintedMaterial);
  const droid = partMesh(`${name}-droid`, droidGeometry(), new THREE.MeshLambertMaterial({ color: NEST_DROID_COLOR }));
  const sensor = partMesh(
    `${name}-sensor`,
    sensorGeometry(),
    new THREE.MeshBasicMaterial({ color: NEST_SENSOR_COLOR }),
  );
  const flash = partMesh(`${name}-flash`, flashGeometry(), new THREE.MeshBasicMaterial({ color: NEST_FLASH_COLOR }));

  const gunPivot = NEST_MODEL.gunPivot;
  const droidPivot = NEST_MODEL.droidPivot;
  // a broken half of the ring: turned outward about the middle and dropped, so the two halves part at the gaps
  const brokenHalf = (side: 1 | -1): THREE.Matrix4 =>
    new THREE.Matrix4().compose(
      new THREE.Vector3(side * 0.12, 0.02, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(side * 0.12, 0, side * 0.22)),
      new THREE.Vector3(1, 0.32, 1),
    );
  const parts: EnemyPart[] = [
    { mesh: sandbags, standing: new THREE.Matrix4(), fallen: brokenHalf(1) },
    { mesh: sandbags2, standing: new THREE.Matrix4(), fallen: brokenHalf(-1) },
    {
      mesh: mount,
      standing: new THREE.Matrix4(),
      fallen: tipped(NEST_MODEL.mountPivot, NEST_MODEL.mountTilt, NEST_MODEL.mountDrop),
    },
    {
      mesh: barrel,
      standing: shifted(gunPivot),
      sleeping: tipped(gunPivot, NEST_MODEL.gunDip, 0),
      fallen: tipped(gunPivot, NEST_MODEL.fellTilt, NEST_MODEL.fellDrop),
    },
    {
      mesh: shield,
      standing: new THREE.Matrix4(),
      fallen: tipped(NEST_MODEL.shieldPivot, NEST_MODEL.shieldTilt, NEST_MODEL.shieldDrop),
    },
    {
      mesh: droid,
      standing: new THREE.Matrix4(),
      fallen: tipped(droidPivot, NEST_MODEL.droidTilt, 0),
    },
    {
      mesh: sensor,
      standing: new THREE.Matrix4(),
      fallen: tipped(droidPivot, NEST_MODEL.droidTilt, 0),
    },
    { mesh: flash, standing: shifted(gunPivot), fallen: shifted(gunPivot), firingOnly: true },
  ];
  return { mesh: sandbags, parts, colored: false };
}

// Builds the enemies' meshes into the scene, with nothing drawn yet.
export function buildEnemyView(): EnemyView {
  const view = {} as EnemyView; // filled for every kind in the loop below
  for (const kind of ENEMY_KINDS) {
    const kindView =
      kind === 'emplacement' ? buildNestView() : kind === 'warden' ? buildWardenView() : buildSoldierView(kind);
    for (const part of kindView.parts) scene.add(part.mesh);
    view[kind] = kindView;
  }
  return view;
}

const place = new THREE.Object3D();
const tint = new THREE.Color();
const matrix = new THREE.Matrix4();
const NOTHING = new THREE.Matrix4().makeScale(0, 0, 0); // a part not drawn at all: its copies shrink to nothing
const FORWARD = new THREE.Vector3();
// How many copies a mesh has taken this frame is kept in the mesh's own `count`: the meshes are the view's, so nothing
// outlives the view that built them (SB-2086, where a map here kept a removed sortie's meshes alive).

// The shape a soldier's copy takes: the far one past its role's distance, with a band either side of the edge where it
// keeps the shape it had, so walking back and forth across the line does not flicker between two very different builds.
function soldierIsFar(kindView: EnemyKindView, enemy: EnemyState, distanceSq: number): boolean {
  const detail = kindView.detail;
  const levels = kindView.farLevels;
  if (detail === undefined || levels === undefined) return false;
  const had = levels.get(enemy);
  let far = had ?? distanceSq > detail ** 2;
  if (!far && distanceSq > (detail + DETAIL_HYSTERESIS) ** 2) far = true;
  else if (far && distanceSq < (detail - DETAIL_HYSTERESIS) ** 2) far = false;
  levels.set(enemy, far);
  return far;
}

// Writes each enemy of each kind into its meshes and sets how many are drawn. A soldier past its role's distance takes
// the simpler shape (SB-2083); one behind the camera or past the fog is not written at all (SB-2086). Every other part is
// written as before.
export function drawEnemies(view: EnemyView, game: GameModel): void {
  for (const kind of ENEMY_KINDS) {
    for (const part of view[kind].parts) part.mesh.count = 0;
  }
  camera.getWorldDirection(FORWARD);
  for (const enemy of game.enemies) {
    const kindView = view[enemy.kind];
    const dx = enemy.x - camera.position.x;
    const dy = enemy.y - camera.position.y;
    const dz = enemy.z - camera.position.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    // the fog hides everything past its far plane, and nothing behind the camera shows
    if (distanceSq > MAP_FOG.far ** 2) continue;
    if (dx * FORWARD.x + dy * FORWARD.y + dz * FORWARD.z < 0) continue;
    const far = soldierIsFar(kindView, enemy, distanceSq);
    const alive = enemy.hp > 0;
    // a posted defender ducks behind its cover while it hides and stands up to fire (SB-2015)
    const hidden = alive && enemy.post !== null && !enemy.holdOut;
    const asleep = !enemy.awake;
    for (const part of kindView.parts) {
      if (part.level !== undefined && (part.level === 'far') !== far) continue;
      const at = part.mesh.count;
      if (at >= MAX_ENEMIES) continue;
      part.mesh.count = at + 1;
      const local =
        part.firingOnly === true
          ? alive && !asleep
            ? part.standing
            : NOTHING
          : !alive
            ? part.fallen
            : asleep && part.sleeping !== undefined
              ? part.sleeping
              : part.standing;
      place.position.set(enemy.x, enemy.y, enemy.z);
      place.rotation.set(0, enemy.yaw, 0);
      place.scale.set(1, hidden ? HOLD_HIDE_SCALE : 1, 1);
      place.updateMatrix();
      part.mesh.setMatrixAt(at, matrix.multiplyMatrices(place.matrix, local));
      if (kindView.colored) {
        // the shape carries the enemy side's own colours; the copy only darkens one that is down
        // the mid boss is white in the shape and takes its body colour here; its shoulder light warms the whole body
        // while a burst telegraph runs
        const telegraph =
          enemy.kind === 'warden' &&
          alive &&
          enemy.warden?.phase === 'burst' &&
          enemy.warden.burstLeft > 0 &&
          enemy.warden.timer > 0;
        const aliveTint = enemy.kind === 'warden' ? (telegraph ? PILLBOX_WARN_COLOR : WARDEN_COLOR) : ALIVE_TINT;
        part.mesh.setColorAt(at, tint.setHex(alive ? aliveTint : ENEMY_DOWN_TINT));
      }
    }
  }
  for (const kind of ENEMY_KINDS) {
    for (const part of view[kind].parts) {
      // an empty mesh is not drawn, so the near and far shapes cost one draw between them, not two
      part.mesh.visible = part.mesh.count > 0;
      part.mesh.instanceMatrix.needsUpdate = true;
      if (part.mesh.instanceColor) part.mesh.instanceColor.needsUpdate = true;
    }
  }
}

// Takes the meshes out of the scene. The two materials of a soldier are shared by its near and far shapes, so each one
// is disposed once.
export function removeEnemyView(view: EnemyView): void {
  const materials = new Set<THREE.Material>();
  for (const kind of ENEMY_KINDS) {
    for (const part of view[kind].parts) {
      scene.remove(part.mesh);
      part.mesh.geometry.dispose();
      const parts = Array.isArray(part.mesh.material) ? part.mesh.material : [part.mesh.material];
      for (const material of parts) materials.add(material);
      part.mesh.dispose();
    }
  }
  for (const material of materials) material.dispose();
}
