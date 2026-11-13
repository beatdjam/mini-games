// The shapes a dense mech is made of (SB-1468): a chamfered plate, a tube, a ring, a two-part piston, a ring of bolts
// and the boost's flame. Each is a BufferGeometry in metres, centred on its own place (the flame starts at z = 0), and
// bake puts it where the table says. They are tools for any mech: data/mechProto.ts is the first table that reads them.
// The shapes are made once when a mech is built, never per frame, and mergeShapes joins them by material and moving part.
import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type ShapeAxis = 'x' | 'y' | 'z';

// The sides a round shape is drawn with. A table can pass its own.
const ROUND_SEGMENTS = 12;
const RING_SEGMENTS = 18;

// Turns a shape that runs along +y to the axis the table asks for.
function alongAxis(geometry: THREE.BufferGeometry, axis: ShapeAxis): THREE.BufferGeometry {
  if (axis === 'x') geometry.rotateZ(-Math.PI / 2);
  else if (axis === 'z') geometry.rotateX(Math.PI / 2);
  return geometry;
}

// A box whose corners and long edges are chamfered, read as armour: the cross-section is an octagon and the ends are
// beveled by the same `bevel`, so no edge is a razor line. Total size is exactly [width, height, depth].
export function plateGeometry(
  width: number,
  height: number,
  depth: number,
  bevel: number,
  segments = 1,
): THREE.BufferGeometry {
  const c = Math.max(1e-4, Math.min(bevel, width * 0.24, height * 0.24, depth * 0.24));
  const hw = width / 2 - c;
  const hh = height / 2 - c;
  const shape = new THREE.Shape();
  shape.moveTo(-hw + c, -hh);
  shape.lineTo(hw - c, -hh);
  shape.lineTo(hw, -hh + c);
  shape.lineTo(hw, hh - c);
  shape.lineTo(hw - c, hh);
  shape.lineTo(-hw + c, hh);
  shape.lineTo(-hw, hh - c);
  shape.lineTo(-hw, -hh + c);
  shape.lineTo(-hw + c, -hh);
  const body = Math.max(c, depth - 2 * c);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: body,
    bevelEnabled: true,
    bevelThickness: c,
    bevelSize: c,
    bevelSegments: segments,
    curveSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -body / 2);
  return nonIndexed(geometry);
}

// A cylinder from end to end along its axis.
export function tubeGeometry(
  radius: number,
  length: number,
  axis: ShapeAxis,
  segments = ROUND_SEGMENTS,
): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(radius, radius, length, segments, 1);
  return nonIndexed(alongAxis(geometry, axis));
}

// A ring with a hole down its axis (a bearing's rim, the rim of a muzzle).
export function ringGeometry(
  radius: number,
  tube: number,
  axis: ShapeAxis,
  segments = RING_SEGMENTS,
): THREE.BufferGeometry {
  const geometry = new THREE.TorusGeometry(radius, tube, 6, segments);
  if (axis === 'x') geometry.rotateY(Math.PI / 2);
  else if (axis === 'y') geometry.rotateX(Math.PI / 2);
  return nonIndexed(geometry);
}

// A hydraulic piston: a wide sleeve and a thin rod, with an eye at each end. It runs along its axis, from -length/2 to
// +length/2; a part that moves can slide it by moving the shape.
export function pistonGeometry(radius: number, length: number, axis: ShapeAxis, extend = 1): THREE.BufferGeometry {
  const sleeve = length * 0.55;
  const rod = length * 0.45;
  const slide = (1 - extend) * rod;
  const parts: THREE.BufferGeometry[] = [
    new THREE.CylinderGeometry(radius, radius, sleeve, ROUND_SEGMENTS, 1).translate(0, -length / 2 + sleeve / 2, 0),
    new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, rod, ROUND_SEGMENTS, 1).translate(
      0,
      length / 2 - rod / 2 - slide,
      0,
    ),
  ];
  const eye = radius * 1.5;
  parts.push(new THREE.TorusGeometry(eye, radius * 0.35, 5, RING_SEGMENTS).translate(0, length / 2 - eye - slide, 0));
  parts.push(new THREE.TorusGeometry(eye, radius * 0.35, 5, RING_SEGMENTS).translate(0, -length / 2 + eye, 0));
  const merged = mergeShapes(parts.map(nonIndexed));
  return nonIndexed(alongAxis(merged, axis));
}

// A circle of bolt heads, as on a joint's face; the circle lies across the axis.
export function boltsGeometry(radius: number, count: number, bolt: number, axis: ShapeAxis): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const head = new THREE.CylinderGeometry(bolt, bolt, bolt * 1.4, 6, 1);
    head.translate(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    parts.push(head);
  }
  return nonIndexed(alongAxis(mergeShapes(parts.map(nonIndexed)), axis));
}

// The boost's flame: a cone along +z whose point is its far end, starting at z = 0 so a scale on z stretches it back.
export function flameGeometry(radius: number, length = 1, segments = 8): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(radius * 0.28, radius, length, segments, 1, true);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0, length / 2);
  return nonIndexed(geometry);
}

// A shape with its place and turn baked in. The shape itself is changed and returned (the factories make fresh ones).
export function bakeGeometry(
  geometry: THREE.BufferGeometry,
  at: readonly [number, number, number],
  rot?: readonly [number, number, number],
): THREE.BufferGeometry {
  if (rot) geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])));
  geometry.translate(at[0], at[1], at[2]);
  return geometry;
}

// Puts the picture on the shape in the plane its normal faces (the dominant axis), so a panel line or a bolt keeps its
// size across plates of different sizes. `tile` is how many metres one repeat of the picture covers.
export function projectUV(geometry: THREE.BufferGeometry, tile: number): THREE.BufferGeometry {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    let u: number;
    let v: number;
    if (nx >= ny && nx >= nz) {
      u = z;
      v = y;
    } else if (ny >= nz) {
      u = x;
      v = z;
    } else {
      u = x;
      v = y;
    }
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

// Joins shapes into one geometry (one draw). The shapes must carry the same attributes; every shape here does.
export function mergeShapes(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geometries.length === 0) throw new Error('mergeShapes needs at least one shape');
  const merged = BufferGeometryUtils.mergeBufferGeometries(geometries);
  if (merged === null) throw new Error('the shapes did not join: their attributes differ');
  return merged;
}

// Every shape of a mech is drawn as triangles, and three's merge wants them all the same way.
function nonIndexed(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const converted = geometry.index === null ? geometry : geometry.toNonIndexed();
  if (converted.getAttribute('uv') === undefined && converted.getAttribute('position') !== undefined) {
    converted.setAttribute(
      'uv',
      new THREE.BufferAttribute(new Float32Array(converted.getAttribute('position').count * 2), 2),
    );
  }
  return converted;
}
