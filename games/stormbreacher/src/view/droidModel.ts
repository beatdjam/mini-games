// Builds the beach's infantry droids (SB-1745, near and far forms SB-2085) out of the shapes of SB-1468 and the tables in
// data/droids.ts. The body is one merged geometry and the head another, each painted with vertex colours (armour, frame
// and accent); the lit windows and lines are a second group in the same geometry, so a crowd of them costs one instanced
// mesh a part (two draws per part: the paint and the light). The shapes are made once for a whole crowd, never per frame,
// and a mirrored shape (a leg, a shoulder) is built as its own half and turned over x = 0.
import * as THREE from 'three';
import { DROID_COLOR } from '../data/colors.ts';
import { DROID_PARTS, DROID_TUNE, type DroidDetail, type DroidShape } from '../data/droids.ts';
import { bakeGeometry, mergeShapes, plateGeometry, ringGeometry, tubeGeometry } from './mechShapes.ts';

// Group 0 is painted, group 1 is lit (the material array in battle/parts.ts follows this order).
export interface DroidGeometries {
  body: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
}

// The colour a material paints on the merged geometry (the glow parts are drawn unlit, so their colour is the material's).
function colorOf(shape: DroidShape): THREE.Color {
  return new THREE.Color(DROID_COLOR[shape.material]);
}

// A shape with its place and turn baked in, then painted per vertex. Boxes are turned into triangle lists first, so
// every shape in a merge carries the same attributes. The close form uses more sides on its round joints (SB-2085).
function shapeGeometry(shape: DroidShape, detail: DroidDetail): THREE.BufferGeometry {
  const sides = detail === 'near' ? DROID_TUNE.nearRoundSegments : DROID_TUNE.roundSegments;
  let geometry: THREE.BufferGeometry;
  switch (shape.kind) {
    case 'plate': {
      const size = shape.size ?? [0, 0, 0];
      geometry = plateGeometry(
        size[0],
        size[1],
        size[2],
        shape.bevel ?? DROID_TUNE.bevel,
        DROID_TUNE.bevelSegments,
        shape.taper,
      );
      break;
    }
    case 'box': {
      const size = shape.size ?? [0, 0, 0];
      const box = new THREE.BoxGeometry(size[0], size[1], size[2]);
      geometry = box.index === null ? box : box.toNonIndexed();
      break;
    }
    case 'tube':
      geometry = tubeGeometry(shape.radius ?? 0, shape.length ?? 0, shape.axis ?? 'y', sides);
      break;
    case 'ring':
      geometry = ringGeometry(shape.radius ?? 0, shape.tube ?? 0, shape.axis ?? 'y', sides);
      break;
  }
  geometry = bakeGeometry(geometry, shape.at, shape.rot);
  const color = colorOf(shape);
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// A shape turned over the x = 0 plane: its place at -x, the turns about y and z flipped, and a one-sided cut moved to
// the other side, so a pair of legs or shoulders stays symmetrical.
function mirroredShape(shape: DroidShape): DroidShape {
  const mirrored: DroidShape = { ...shape, at: [-shape.at[0], shape.at[1], shape.at[2]] };
  if (shape.rot !== undefined) mirrored.rot = [shape.rot[0], -shape.rot[1], -shape.rot[2]];
  if (shape.taper?.cutSide !== undefined) {
    mirrored.taper = { ...shape.taper, cutSide: shape.taper.cutSide === 'left' ? 'right' : 'left' };
  }
  return mirrored;
}

// The body or the head: the painted shapes are merged into one geometry and the lit ones into another, then the two
// are joined with a group each, so the mesh draws the paint and the light with the two materials of parts.ts.
function mergePart(shapes: readonly DroidShape[], detail: DroidDetail): THREE.BufferGeometry {
  const painted: THREE.BufferGeometry[] = [];
  const lit: THREE.BufferGeometry[] = [];
  const add = (shape: DroidShape): void => {
    const geometry = shapeGeometry(shape, detail);
    if (shape.material === 'glow') lit.push(geometry);
    else painted.push(geometry);
    if (shape.mirror === true) add({ ...mirroredShape(shape), mirror: false });
  };
  for (const shape of shapes) add(shape);
  return mergeShapes([mergeShapes(painted), mergeShapes(lit)], true);
}

export function buildDroidGeometries(detail: DroidDetail = 'near'): DroidGeometries {
  const parts = DROID_PARTS[detail];
  return {
    body: mergePart(parts.body, detail),
    head: mergePart(parts.head, detail),
  };
}
