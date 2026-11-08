// The editor's pointer, wheel and key handling: the top-down camera's pan and zoom, click to place, drag to move,
// R to turn and Delete to remove. The view owns the map and the DOM; this file turns an event into one of its edits.
import * as THREE from 'three';
import { clamp } from '@engine/core/index.ts';
import type { MapDef } from '../../data/types.ts';
import { TURN, move, pick, place, remove, rotate, selectionAt, type MapSelection, type MapTool } from './model.ts';

const CLICK_MOVE = 4; // a pointer that moved fewer pixels placed something (px)
const PICK_REACH = 6; // how near a piece the pointer grabs it (m)
const ZOOM_MIN = 24; // the camera's height above the ground (m)
const ZOOM_MAX = 480;

export interface EditorInputHost {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  view: { x: number; z: number; height: number };
  map(): MapDef;
  tool(): MapTool;
  targetId(): string;
  selection(): MapSelection;
  setSelection(selection: MapSelection): void;
  changed(save: boolean): void;
}

export function bindEditorInput(host: EditorInputHost): void {
  const { canvas, camera, view } = host;

  // The pointer on the ground: the camera looks straight down, so one ray meets y = 0 at one point.
  function groundAt(clientX: number, clientY: number): { x: number; z: number } | null {
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const { origin, direction } = ray.ray;
    if (Math.abs(direction.y) < 1e-6) return null;
    const t = -origin.y / direction.y;
    if (t <= 0) return null;
    return { x: origin.x + direction.x * t, z: origin.z + direction.z * t };
  }

  function pan(dx: number, dy: number) {
    const perPixel = (2 * view.height * Math.tan(((camera.fov / 2) * Math.PI) / 180)) / window.innerHeight;
    view.x -= dx * perPixel;
    view.z -= dy * perPixel;
  }

  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: 'none' | 'pan' | 'drag' | 'place' = 'none';
  let moved = 0;
  let dragOffset = { x: 0, z: 0 };
  let pinch = { dist: 0, cx: 0, cy: 0 };

  function pinchNow() {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('pointerdown', event => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      gesture = 'none';
      pinch = pinchNow();
      return;
    }
    if (pointers.size > 2) return;
    moved = 0;
    if (event.button === 2) {
      gesture = 'pan';
      return;
    }
    const at = groundAt(event.clientX, event.clientY);
    const picked = at === null ? null : pick(host.map(), at.x, at.z, PICK_REACH);
    if (picked !== null && at !== null) {
      host.setSelection(picked);
      gesture = 'drag';
      const here = selectionAt(host.map(), picked);
      dragOffset = here === null ? { x: 0, z: 0 } : { x: here.x - at.x, z: here.z - at.z };
      return;
    }
    gesture = 'place';
  });

  canvas.addEventListener('pointermove', event => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    moved += Math.hypot(dx, dy);
    if (pointers.size >= 2) {
      const next = pinchNow();
      if (pinch.dist > 0) view.height = clamp((view.height * pinch.dist) / next.dist, ZOOM_MIN, ZOOM_MAX);
      pan(next.cx - pinch.cx, next.cy - pinch.cy);
      pinch = next;
      return;
    }
    if (gesture === 'pan') {
      pan(dx, dy);
      return;
    }
    if (gesture === 'drag' && host.selection() !== null) {
      const at = groundAt(event.clientX, event.clientY);
      if (at === null) return;
      move(host.map(), host.selection(), at.x + dragOffset.x, at.z + dragOffset.z);
      host.changed(false);
    }
  });

  function pointerEnd(event: PointerEvent) {
    if (!pointers.delete(event.pointerId)) return;
    if (pointers.size > 0) {
      gesture = 'none';
      return;
    }
    if (gesture === 'place' && moved < CLICK_MOVE && event.button !== 2) {
      const at = groundAt(event.clientX, event.clientY);
      if (at !== null) {
        const next = place(host.map(), host.tool(), host.targetId(), at.x, at.z);
        host.setSelection(next);
        host.changed(true);
      }
    } else if (gesture === 'drag') {
      host.changed(true);
    }
    gesture = 'none';
  }
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener(
    'wheel',
    event => {
      event.preventDefault();
      view.height = clamp(view.height * Math.exp(event.deltaY * 0.001), ZOOM_MIN, ZOOM_MAX);
    },
    { passive: false },
  );

  window.addEventListener('keydown', event => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.target instanceof HTMLSelectElement) return;
    if (event.code === 'KeyR') {
      rotate(host.map(), host.selection(), TURN);
      host.changed(true);
    } else if (event.code === 'Delete' || event.code === 'Backspace') {
      event.preventDefault();
      remove(host.map(), host.selection());
      host.setSelection(null);
      host.changed(true);
    }
  });
}
