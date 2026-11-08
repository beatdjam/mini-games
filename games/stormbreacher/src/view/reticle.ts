// The reticle of #view-fcs (SB-060): a dot at the screen's centre, the aim circle, a small mark on each target in
// it, the arc of a lock that is filling, and a square on the target hard has caught. The view is DOM, so it may make
// elements; the logic above it only says what to show.
import * as THREE from 'three';
import type { FcsKind, FcsTune } from '../data/tune.ts';
import type { FcsStep, FcsTarget } from '../logic/fcs.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DOT_COLOR = '#f4f7fa';
const RING_COLOR = 'rgba(244, 247, 250, 0.55)';
const MARK_COLOR = '#ffcf6a';
const ARC_COLOR = '#ffcf6a';
const LOCK_COLOR = '#ff9d3d';
const DOT_RADIUS = 2.5; // px
const MARK_SIZE = 9; // half the corner mark's span (px)
const ARC_RADIUS = 20; // px
const LOCK_SIZE = 30; // the square's side (px)
const MAX_CIRCLE_FRACTION = 0.45; // the aim circle never grows past this share of the screen's height

let root: SVGSVGElement | null = null;
let ring: SVGCircleElement | null = null;
let dynamic: SVGGElement | null = null;

const toCamera = new THREE.Vector3();
const projected = new THREE.Vector3();
const forward = new THREE.Vector3();

function makeRoot(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.id = 'sbFcsReticle';
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:5;overflow:visible';
  const dot = document.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('cx', '50%');
  dot.setAttribute('cy', '50%');
  dot.setAttribute('r', String(DOT_RADIUS));
  dot.setAttribute('fill', DOT_COLOR);
  svg.appendChild(dot);
  ring = document.createElementNS(SVG_NS, 'circle');
  ring.setAttribute('cx', '50%');
  ring.setAttribute('cy', '50%');
  ring.setAttribute('fill', 'none');
  ring.setAttribute('stroke', RING_COLOR);
  ring.setAttribute('stroke-width', '1');
  svg.appendChild(ring);
  dynamic = document.createElementNS(SVG_NS, 'g');
  svg.appendChild(dynamic);
  document.body.appendChild(svg);
  return svg;
}

// A screen position for a point, or null when it is behind the camera.
function project(camera: THREE.PerspectiveCamera, x: number, y: number, z: number): { x: number; y: number } | null {
  camera.getWorldDirection(forward);
  toCamera.set(x - camera.position.x, y - camera.position.y, z - camera.position.z);
  if (toCamera.dot(forward) <= 0) return null;
  projected.set(x, y, z).project(camera);
  return {
    x: (projected.x * 0.5 + 0.5) * window.innerWidth,
    y: (-projected.y * 0.5 + 0.5) * window.innerHeight,
  };
}

function element(tag: string, attrs: Record<string, string>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  if (dynamic) dynamic.appendChild(node);
  return node;
}

// The four small corner ticks around a point in the aim circle.
function cornerMarks(x: number, y: number): SVGElement {
  const s = MARK_SIZE;
  const d =
    `M ${x - s} ${y - s + 4} L ${x - s} ${y - s} L ${x - s + 4} ${y - s} ` +
    `M ${x + s - 4} ${y - s} L ${x + s} ${y - s} L ${x + s} ${y - s + 4} ` +
    `M ${x + s} ${y + s - 4} L ${x + s} ${y + s} L ${x + s - 4} ${y + s} ` +
    `M ${x - s + 4} ${y + s} L ${x - s} ${y + s} L ${x - s} ${y + s - 4}`;
  return element('path', { d, fill: 'none', stroke: MARK_COLOR, 'stroke-width': '1.5' });
}

// The arc around a target that shows how far the lock has come.
function progressArc(x: number, y: number, progress: number): SVGElement {
  const circumference = Math.PI * 2 * ARC_RADIUS;
  const done = Math.max(0, Math.min(1, progress)) * circumference;
  return element('circle', {
    cx: String(x),
    cy: String(y),
    r: String(ARC_RADIUS),
    fill: 'none',
    stroke: ARC_COLOR,
    'stroke-width': '2.5',
    'stroke-linecap': 'round',
    'stroke-dasharray': `${done} ${circumference}`,
    transform: `rotate(-90 ${x} ${y})`,
  });
}

function lockSquare(x: number, y: number): SVGElement {
  return element('rect', {
    x: String(x - LOCK_SIZE / 2),
    y: String(y - LOCK_SIZE / 2),
    width: String(LOCK_SIZE),
    height: String(LOCK_SIZE),
    fill: 'none',
    stroke: LOCK_COLOR,
    'stroke-width': '2.5',
  });
}

// Draws one frame of the reticle. `camera` must already hold the frame's pose.
export function updateReticle(
  camera: THREE.PerspectiveCamera,
  fcsKind: FcsKind,
  tune: FcsTune,
  result: FcsStep,
  targets: readonly FcsTarget[],
) {
  if (!root) root = makeRoot();
  if (!ring || !dynamic) return;
  dynamic.replaceChildren();

  const width = window.innerWidth;
  const height = window.innerHeight;
  const halfFov = (camera.fov * Math.PI) / 360;
  const circle = Math.min(
    Math.min(width, height) * MAX_CIRCLE_FRACTION,
    Math.tan((tune.cone * Math.PI) / 180) * (height / 2 / Math.tan(halfFov)),
  );
  if (tune.cone > 0 && Number.isFinite(circle) && circle > 1) {
    ring.setAttribute('cx', String(width / 2));
    ring.setAttribute('cy', String(height / 2));
    ring.setAttribute('r', String(circle));
    ring.setAttribute('visibility', 'visible');
  } else {
    ring.setAttribute('visibility', 'hidden');
  }

  // A small mark on every target in the aim circle.
  for (const index of result.inCone) {
    const target = targets[index];
    if (!target || !target.alive) continue;
    const point = project(camera, target.cx, target.cy, target.cz);
    if (!point) continue;
    cornerMarks(point.x, point.y);
  }

  // The candidate's arc fills while hard waits for the lock.
  if (fcsKind === 'hard' && result.lockId === null && result.candidateId !== null && tune.lockTime > 0) {
    const target = targets.find(t => t.id === result.candidateId);
    if (target) {
      const point = project(camera, target.cx, target.cy, target.cz);
      if (point) progressArc(point.x, point.y, result.lockProgress / tune.lockTime);
    }
  }

  // The caught target gets a square.
  if (result.lockId !== null) {
    const target = targets.find(t => t.id === result.lockId);
    if (target) {
      const point = project(camera, target.cx, target.cy, target.cz);
      if (point) lockSquare(point.x, point.y);
    }
  }
}
