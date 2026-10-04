import * as THREE from 'three';
import type { FloorLink, Floors } from '../world/floors.ts';
import type { TileStyle } from './minimap.ts';
// engine: The detail map in 3D: every floor drawn as a slab of tiles, one above the other, the links (stairs, lifts)
// as upright lines between their ends, and the viewer as an arrow on its floor. It draws on its own canvas with its
// own renderer, so it can sit in a map overlay; dragging on the canvas turns the view. The game decides which tiles
// show (say, the ones the player has seen) and their colours, as for the 2D map (minimap.ts).
// Map space: one tile = 1 unit, x = column, z = row, floor n at height n * gap.
// ---- tuning numbers ----
const FLOOR_GAP = 8; // height between two floors on the map (tiles) unless the style says otherwise
const TILE_H = 0.12; // thickness of a tile slab
const TILE_FILL = 0.92; // a tile's width (the rest is the gap that shows the grid)
const OTHER_FLOOR_OPACITY = 0.3; // floors other than the viewer's are dimmed to this
const VIEWER_FLOOR_OPACITY = 0.95;
const ARROW_R = 0.6; // viewer arrow: radius and length (tiles)
const ARROW_LEN = 1.6;
const MARKER_R = 0.45; // marker size (tiles)
const VIEW_DIST = 2; // camera distance as a multiple of the map's largest side
const DRAG_TURN = 0.008; // radians per pixel dragged
const PITCH_MIN = 0.15; // how low and how high the camera can tilt (radians above the horizon)
const PITCH_MAX = 1.45;
const START_YAW = 0.6; // the view the map opens with
const START_PITCH = 0.5;

export interface FloorMapStyle {
  tile: (floor: number, k: number) => TileStyle | null; // null leaves the tile out (alpha is not used: floors dim as a whole)
  link?: (l: FloorLink) => string | null; // colour of a link's line; null (or no function) leaves it out
  gap?: number; // see FLOOR_GAP
}
export interface FloorMapMarker {
  floor: number;
  x: number; // world position (m), as in the 2D map
  z: number;
  color: string;
}
export interface FloorMapView {
  floor: number; // the viewer's floor: drawn bright, the others dimmed
  viewer: { x: number; z: number; yaw: number }; // world position (m) and facing (yaw 0 = -z)
  viewerColor?: string;
  markers?: FloorMapMarker[];
}
export interface FloorMap3D {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  yaw: number; // the camera's turn around the map (radians); dragging changes it
  pitch: number; // the camera's tilt above the horizon (radians)
  build(f: Floors, style: FloorMapStyle, tileSize: number): void; // (re)makes the slabs and links; tileSize = T (m)
  draw(view: FloorMapView): void; // places the viewer and markers, dims the other floors and renders
  dispose(): void;
}

// Makes the map on `canvas` (its own WebGL renderer, made once). Call build when the floors or the tiles that show
// change (not every frame), and draw every frame while the map is open
export function createFloorMap3D(canvas: HTMLCanvasElement): FloorMap3D {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }),
    scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000),
    content = new THREE.Group(), // remade by build
    dynamic = new THREE.Group(); // viewer and markers, remade by draw
  scene.add(content, dynamic);
  let floorMats: THREE.MeshBasicMaterial[] = [],
    size = { w: 1, h: 1, gap: FLOOR_GAP, floors: 1, tile: 1 };
  const slab = new THREE.BoxGeometry(TILE_FILL, TILE_H, TILE_FILL),
    arrow = new THREE.ConeGeometry(ARROW_R, ARROW_LEN, 3),
    dot = new THREE.SphereGeometry(MARKER_R, 8, 6);
  arrow.rotateX(-Math.PI / 2); // the tip points along -z, like yaw 0
  const map: FloorMap3D = {
    scene,
    camera,
    yaw: START_YAW,
    pitch: START_PITCH,
    build(f, style, tileSize) {
      clearGroup(content);
      floorMats.forEach(m => m.dispose());
      floorMats = [];
      const gap = style.gap ?? FLOOR_GAP;
      let w = 1,
        h = 1;
      const color = new THREE.Color(),
        place = new THREE.Matrix4();
      f.grids.forEach((g, floor) => {
        const { W, H } = g.world;
        w = Math.max(w, W);
        h = Math.max(h, H);
        const shown: [number, string][] = [];
        for (let k = 0; k < W * H; k++) {
          const st = style.tile(floor, k);
          if (st) shown.push([k, st.color]);
        }
        // The slabs are see-through, and three.js sorts see-through meshes by their own position, which is the same
        // for all of them. The camera always looks down on the map (PITCH_MIN is above the horizon), so drawing the
        // floors from the lowest up is always back to front: a floor never shows through the one above it wrongly.
        // No depth write: a dim floor must not hide what lies behind it
        const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: OTHER_FLOOR_OPACITY, depthWrite: false });
        floorMats.push(mat);
        if (!shown.length) return;
        const mesh = new THREE.InstancedMesh(slab, mat, shown.length);
        shown.forEach(([k, c], n) => {
          place.makeTranslation((k % W) + 0.5, floor * gap, Math.floor(k / W) + 0.5);
          mesh.setMatrixAt(n, place);
          mesh.setColorAt(n, color.set(c));
        });
        mesh.userData.floor = floor;
        mesh.renderOrder = floor;
        content.add(mesh);
      });
      // the links: a line from end to end, each in its own colour
      const pts: number[] = [],
        cols: number[] = [];
      for (const l of f.links) {
        const c = style.link ? style.link(l) : null;
        if (!c) continue;
        color.set(c);
        for (const s of [l.a, l.b]) {
          pts.push(s.i + 0.5, s.floor * gap + TILE_H, s.j + 0.5);
          cols.push(color.r, color.g, color.b);
        }
      }
      if (pts.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
        const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true }));
        lines.userData.links = true;
        content.add(lines);
      }
      size = { w, h, gap, floors: f.grids.length, tile: tileSize };
    },
    draw(view) {
      floorMats.forEach((m, n) => (m.opacity = n === view.floor ? VIEWER_FLOOR_OPACITY : OTHER_FLOOR_OPACITY));
      clearGroup(dynamic, true);
      const at = (floor: number, x: number, z: number, lift: number) =>
        new THREE.Vector3(x / size.tile, floor * size.gap + lift, z / size.tile);
      const viewer = new THREE.Mesh(arrow, new THREE.MeshBasicMaterial({ color: view.viewerColor ?? '#ffffff' }));
      viewer.position.copy(at(view.floor, view.viewer.x, view.viewer.z, ARROW_R));
      viewer.rotation.y = view.viewer.yaw;
      viewer.userData.viewer = true;
      dynamic.add(viewer);
      for (const m of view.markers ?? []) {
        const mark = new THREE.Mesh(dot, new THREE.MeshBasicMaterial({ color: m.color }));
        mark.position.copy(at(m.floor, m.x, m.z, MARKER_R));
        dynamic.add(mark);
      }
      // the camera circles the middle of all the floors
      const mid = new THREE.Vector3(size.w / 2, ((size.floors - 1) * size.gap) / 2, size.h / 2),
        dist = Math.max(size.w, size.h, (size.floors - 1) * size.gap) * VIEW_DIST;
      camera.position.set(
        mid.x + Math.sin(map.yaw) * Math.cos(map.pitch) * dist,
        mid.y + Math.sin(map.pitch) * dist,
        mid.z + Math.cos(map.yaw) * Math.cos(map.pitch) * dist,
      );
      camera.lookAt(mid);
      const cw = canvas.clientWidth || canvas.width,
        ch = canvas.clientHeight || canvas.height;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(cw, ch, false);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    },
    dispose() {
      clearGroup(content);
      clearGroup(dynamic, true);
      floorMats.forEach(m => m.dispose());
      slab.dispose();
      arrow.dispose();
      dot.dispose();
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      renderer.dispose();
    },
  };
  // dragging turns the view (left-right: around, up-down: tilt)
  let drag: { id: number; x: number; y: number } | null = null;
  const down = (e: PointerEvent) => {
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const move = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    map.yaw -= (e.clientX - drag.x) * DRAG_TURN;
    map.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, map.pitch + (e.clientY - drag.y) * DRAG_TURN));
    drag.x = e.clientX;
    drag.y = e.clientY;
  };
  const up = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.id) drag = null;
  };
  canvas.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  return map;
}

// empties a group; the shared geometries (slab, arrow, dot) stay, the rest is freed. `ownMats`: the meshes' materials
// are their own (viewer, markers), so they go too; the floor materials are freed by build
function clearGroup(g: THREE.Group, ownMats = false) {
  for (const o of [...g.children]) {
    g.remove(o);
    if (o instanceof THREE.LineSegments) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    } else if (ownMats && o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
    else if (o instanceof THREE.InstancedMesh) o.dispose?.();
  }
}
