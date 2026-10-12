import * as THREE from 'three';
import type { FloorLink, Floors } from '../world/floors.ts';
import type { TileStyle } from './minimap.ts';
// engine: The detail map in 3D: every floor drawn as a slab of tiles, one above the other, the links (stairs, lifts)
// as posts or ramps between their ends, the tall spaces (a courtyard through the floors, a high hall) as boxes, and the
// viewer as an arrow on its floor. It draws on its own canvas with its own renderer, so it can sit in a map overlay;
// dragging on the canvas turns the view. The game decides which tiles show (say, the ones the player has seen) and
// their colours, as for the 2D map (minimap.ts).
// Map space: one tile = 1 unit, x = column, z = row, floor n at height n * gap.
// ---- tuning numbers ----
const FLOOR_GAP = 8; // height between two floors on the map (tiles) unless the style says otherwise
const TILE_H = 0.12; // thickness of a tile slab
const TILE_FILL = 0.92; // a tile's width (the rest is the gap that shows the grid)
const OTHER_FLOOR_OPACITY = 0.4; // the floors next to the viewer's are dimmed to this
const FAR_FLOOR_FADE = 0.75; // ... and each floor further away to this share of the one before
const MIN_FLOOR_OPACITY = 0.18; // ... but never below this
const VIEWER_FLOOR_OPACITY = 0.95;
const ARROW_R = 0.9; // viewer arrow: radius and length (tiles)
const ARROW_LEN = 2.4;
const MARKER_R = 0.45; // a dot marker's radius (tiles)
const BEACON_R = 1.1; // a beacon marker: half its width, its height above the floor, how much it swells, how fast (tiles, rad/s)
const BEACON_UP = 2.6;
const BEACON_SWELL = 0.22;
const BEACON_RATE = 5;
const LINK_W = 0.35; // side of a link's post unless the style says otherwise (tiles)
const FRAME_OPACITY = 0.5; // the outline of the building on the viewer's floor; on the others it dims like the tiles
const LABEL_H = 2.4; // height of a floor's label (tiles)
const LABEL_PX = 64; // ... and of its picture (px)
const LABEL_FONT = '700 48px ui-monospace, Menlo, Consolas, monospace';
const VOLUME_SIDE_OPACITY = 0.1; // a volume's faces
const VOLUME_EDGE_OPACITY = 0.85; // ... and its edges
const QUIET_EDGE_OPACITY = 0.4; // the edges of a quiet volume (it has no faces)
const VIEW_DIST = 2; // camera distance as a multiple of the map's largest side
const DRAG_TURN = 0.008; // radians per pixel dragged
const PITCH_MIN = 0.15; // how low and how high the camera can tilt (radians above the horizon)
const PITCH_MAX = 1.45;
const START_YAW = 0.6; // the view the map opens with
const START_PITCH = 0.5;
const ZOOM_RANGE: [number, number] = [0.3, 1.5]; // camera distance as a share of the whole-map distance (small = close)
const WHEEL_ZOOM = 0.0012; // zoom per unit of wheel movement
const PAN_TILT_FLOOR = 0.35; // dragging the map toward or away from the camera divides by sin(pitch), not less than this

// how a link is drawn: a square post `width` a side from end to end, or (`flat`) a plate `width` wide, like a ramp
export interface FloorMapLink {
  color: string;
  width?: number; // tiles; LINK_W without it
  flat?: boolean; // (a link straight up is a post either way)
}
// a tall space: a box over the tiles (i, j) to (i + w, j + h), from floor `floor` up `floors` floor gaps
export interface FloorMapVolume {
  floor: number;
  floors: number; // may be a fraction (a hall one and a half floors high)
  i: number;
  j: number;
  w: number;
  h: number;
  color: string;
  quiet?: boolean; // only its edges, and those faint: a space that is there but not where one is going
}
export interface FloorMapStyle {
  tile: (floor: number, k: number) => TileStyle | null; // null leaves the tile out (alpha is not used: floors dim as a whole)
  // a link's colour, or how it is drawn (a colour alone: a post); null (or no function) leaves it out
  link?: (l: FloorLink) => string | FloorMapLink | null;
  gap?: number; // see FLOOR_GAP
  frame?: string; // colour of the outline of the building (the box round the floor tiles of all floors), on every floor
  label?: (floor: number) => string | null; // a floor's name, written at a corner of its outline
  volumes?: FloorMapVolume[];
}
export interface FloorMapMarker {
  floor: number;
  x: number; // world position (m), as in the 2D map
  z: number;
  color: string;
  beacon?: boolean; // a larger mark above the floor that swells and shrinks and shows through the floors (else a dot)
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
  zoom: number; // 1 = the whole map in view; smaller = closer (ZOOM_RANGE). A pinch or the wheel changes it
  panX: number; // where the camera looks, from the middle of the map (tiles); two fingers or the right button move it
  panZ: number;
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
  // per floor: the tiles' material, and the materials of what else belongs to the floor (its outline and label)
  let floorMats: THREE.MeshBasicMaterial[] = [],
    floorExtras: { mat: THREE.Material; share: number }[][] = [],
    made: { dispose(): void }[] = [], // what build made besides (geometries, materials, pictures), freed by the next
    size = { w: 1, h: 1, gap: FLOOR_GAP, floors: 1, tile: 1 };
  const slab = new THREE.BoxGeometry(TILE_FILL, TILE_H, TILE_FILL),
    arrow = new THREE.ConeGeometry(ARROW_R, ARROW_LEN, 3),
    dot = new THREE.SphereGeometry(MARKER_R, 8, 6),
    beacon = new THREE.OctahedronGeometry(BEACON_R);
  arrow.rotateX(-Math.PI / 2); // the tip points along -z, like yaw 0
  const map: FloorMap3D = {
    scene,
    camera,
    yaw: START_YAW,
    pitch: START_PITCH,
    zoom: 1,
    panX: 0,
    panZ: 0,
    build(f, style, tileSize) {
      clearGroup(content);
      floorMats.forEach(m => m.dispose());
      made.forEach(m => m.dispose());
      floorMats = [];
      made = [];
      floorExtras = f.grids.map(() => []);
      const keep = <X extends { dispose(): void }>(x: X): X => {
        made.push(x);
        return x;
      };
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
      // the links: a post (or a plate) from end to end, each in its own colour
      const links = new THREE.Group();
      links.userData.links = true;
      for (const l of f.links) {
        const st = style.link ? style.link(l) : null;
        if (!st) continue;
        const { color: c, width = LINK_W, flat = false } = typeof st === 'string' ? { color: st } : st,
          [from, to] = [l.a, l.b].map(e => new THREE.Vector3(e.i + 0.5, e.floor * gap + TILE_H, e.j + 0.5)),
          len = from!.distanceTo(to!),
          upright = Math.hypot(to!.x - from!.x, to!.z - from!.z) < 1e-6,
          // (a box lying along z is turned to point from one end to the other; straight up, lookAt has no way to turn)
          geo = upright
            ? new THREE.BoxGeometry(width, len, width)
            : new THREE.BoxGeometry(width, flat ? TILE_H : width, len),
          mesh = new THREE.Mesh(keep(geo), keep(new THREE.MeshBasicMaterial({ color: c })));
        mesh.position.copy(from!).lerp(to!, 0.5);
        if (!upright) mesh.lookAt(to!);
        links.add(mesh);
      }
      if (links.children.length) content.add(links);
      // the building's outline on every floor, with the floor's name at a corner: the box round every floor tile there
      // is (shown or not, so it does not move as more is seen)
      if (style.frame || style.label) {
        let i0 = Infinity,
          j0 = Infinity,
          i1 = -Infinity,
          j1 = -Infinity;
        for (const g of f.grids) {
          const { W, H, grid } = g.world;
          for (let k = 0; k < W * H; k++) {
            if (grid[k] !== 1) continue;
            i0 = Math.min(i0, k % W);
            i1 = Math.max(i1, (k % W) + 1);
            j0 = Math.min(j0, Math.floor(k / W));
            j1 = Math.max(j1, Math.floor(k / W) + 1);
          }
        }
        if (i0 < i1)
          f.grids.forEach((_, floor) => {
            const y = floor * gap;
            if (style.frame) {
              const geo = keep(new THREE.BufferGeometry()),
                mat = keep(new THREE.LineBasicMaterial({ color: style.frame, transparent: true, depthWrite: false }));
              geo.setAttribute(
                'position',
                new THREE.Float32BufferAttribute([i0, y, j0, i1, y, j0, i1, y, j1, i0, y, j1], 3),
              );
              const loop = new THREE.LineLoop(geo, mat);
              loop.userData.frame = floor;
              content.add(loop);
              floorExtras[floor]!.push({ mat, share: FRAME_OPACITY });
            }
            const text = style.label?.(floor);
            if (text) {
              const pic = document.createElement('canvas'),
                g2 = pic.getContext('2d')!;
              g2.font = LABEL_FONT;
              pic.width = Math.ceil(g2.measureText(text).width) + 8;
              pic.height = LABEL_PX;
              g2.font = LABEL_FONT;
              g2.fillStyle = style.frame ?? '#ffffff';
              g2.textBaseline = 'middle';
              g2.fillText(text, 4, LABEL_PX / 2);
              const mat = keep(
                  new THREE.SpriteMaterial({
                    map: keep(new THREE.CanvasTexture(pic)),
                    transparent: true,
                    depthWrite: false,
                    depthTest: false,
                  }),
                ),
                sprite = new THREE.Sprite(mat);
              sprite.scale.set((LABEL_H * pic.width) / pic.height, LABEL_H, 1);
              sprite.center.set(1, 0.5); // (to the left of the corner, outside the outline)
              sprite.position.set(i0 - 0.6, y, j1);
              sprite.userData.label = floor;
              sprite.renderOrder = f.grids.length + 2;
              content.add(sprite);
              floorExtras[floor]!.push({ mat, share: 1 });
            }
          });
      }
      // the tall spaces: a box each, its faces faint and its edges bright (a quiet one: faint edges only), drawn after
      // the floors
      for (const v of style.volumes ?? []) {
        const box = keep(new THREE.BoxGeometry(v.w, v.floors * gap, v.h)),
          at = new THREE.Vector3(v.i + v.w / 2, (v.floor + v.floors / 2) * gap, v.j + v.h / 2),
          sides = new THREE.Mesh(
            box,
            keep(
              new THREE.MeshBasicMaterial({
                color: v.color,
                transparent: true,
                opacity: VOLUME_SIDE_OPACITY,
                depthWrite: false,
                side: THREE.DoubleSide,
              }),
            ),
          ),
          edges = new THREE.LineSegments(
            keep(new THREE.EdgesGeometry(box)),
            keep(
              new THREE.LineBasicMaterial({
                color: v.color,
                transparent: true,
                opacity: v.quiet ? QUIET_EDGE_OPACITY : VOLUME_EDGE_OPACITY,
                depthWrite: false,
              }),
            ),
          );
        for (const o of v.quiet ? [edges] : [sides, edges]) {
          o.position.copy(at);
          o.renderOrder = f.grids.length + 1;
          o.userData.volume = true;
          content.add(o);
        }
      }
      size = { w, h, gap, floors: f.grids.length, tile: tileSize };
    },
    draw(view) {
      // the viewer's floor bright, the others dimmer the further they are from it
      floorMats.forEach((m, n) => {
        const away = Math.abs(n - view.floor);
        m.opacity = away
          ? Math.max(MIN_FLOOR_OPACITY, OTHER_FLOOR_OPACITY * FAR_FLOOR_FADE ** (away - 1))
          : VIEWER_FLOOR_OPACITY;
        for (const x of floorExtras[n] ?? []) x.mat.opacity = (m.opacity / VIEWER_FLOOR_OPACITY) * x.share;
      });
      clearGroup(dynamic, true);
      const at = (floor: number, x: number, z: number, lift: number) =>
        new THREE.Vector3(x / size.tile, floor * size.gap + lift, z / size.tile);
      const viewer = new THREE.Mesh(arrow, new THREE.MeshBasicMaterial({ color: view.viewerColor ?? '#ffffff' }));
      viewer.position.copy(at(view.floor, view.viewer.x, view.viewer.z, ARROW_R));
      viewer.rotation.y = view.viewer.yaw;
      viewer.userData.viewer = true;
      dynamic.add(viewer);
      for (const m of view.markers ?? []) {
        const mark = new THREE.Mesh(
          m.beacon ? beacon : dot,
          new THREE.MeshBasicMaterial({ color: m.color, depthTest: !m.beacon }),
        );
        mark.position.copy(at(m.floor, m.x, m.z, m.beacon ? BEACON_UP : MARKER_R));
        if (m.beacon) {
          mark.scale.setScalar(1 + BEACON_SWELL * Math.sin((performance.now() / 1000) * BEACON_RATE));
          mark.renderOrder = size.floors + 3;
        }
        dynamic.add(mark);
      }
      // the camera circles the middle of all the floors, moved by the pan and brought closer by the zoom
      const mid = new THREE.Vector3(size.w / 2 + map.panX, ((size.floors - 1) * size.gap) / 2, size.h / 2 + map.panZ),
        dist = fullDist() * map.zoom;
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
      made.forEach(m => m.dispose());
      slab.dispose();
      arrow.dispose();
      dot.dispose();
      beacon.dispose();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('contextmenu', noMenu);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      renderer.dispose();
    },
  };
  // the camera distance that shows the whole map
  const fullDist = () => Math.max(size.w, size.h, (size.floors - 1) * size.gap) * VIEW_DIST;
  const setZoom = (z: number) => {
    map.zoom = Math.min(ZOOM_RANGE[1], Math.max(ZOOM_RANGE[0], z));
  };
  // moves where the camera looks so that the map follows a drag of (dx, dy) pixels; it stays over the map
  const panBy = (dx: number, dy: number) => {
    const perPx = (2 * Math.tan((camera.fov * Math.PI) / 360) * fullDist() * map.zoom) / (canvas.clientHeight || 1),
      along = (dy * perPx) / Math.max(PAN_TILT_FLOOR, Math.sin(map.pitch)), // toward (+) or away from the camera
      across = dx * perPx;
    // on the ground the camera looks along (-sin yaw, -cos yaw); its right is (cos yaw, -sin yaw)
    map.panX = Math.min(
      size.w / 2,
      Math.max(-size.w / 2, map.panX - Math.cos(map.yaw) * across - Math.sin(map.yaw) * along),
    );
    map.panZ = Math.min(
      size.h / 2,
      Math.max(-size.h / 2, map.panZ + Math.sin(map.yaw) * across - Math.cos(map.yaw) * along),
    );
  };
  // One pointer dragging turns the view (left-right: around, up-down: tilt); with the right button it moves the map.
  // Two pointers: pinching zooms, moving them together moves the map. The wheel zooms. Pointers beyond two are ignored
  const points = new Map<number, { x: number; y: number; pan: boolean }>();
  const spread = () => {
    const [a, b] = [...points.values()];
    return { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
  };
  const down = (e: PointerEvent) => {
    if (points.size < 2) points.set(e.pointerId, { x: e.clientX, y: e.clientY, pan: e.button === 2 });
  };
  const move = (e: PointerEvent) => {
    const p = points.get(e.pointerId);
    if (!p) return;
    if (points.size === 1) {
      const dx = e.clientX - p.x,
        dy = e.clientY - p.y;
      if (p.pan) panBy(dx, dy);
      else {
        map.yaw -= dx * DRAG_TURN;
        map.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, map.pitch + dy * DRAG_TURN));
      }
      p.x = e.clientX;
      p.y = e.clientY;
      return;
    }
    const was = spread();
    p.x = e.clientX;
    p.y = e.clientY;
    const now = spread();
    if (was.d > 0 && now.d > 0) setZoom((map.zoom * was.d) / now.d);
    panBy(now.x - was.x, now.y - was.y);
  };
  const up = (e: PointerEvent) => {
    points.delete(e.pointerId);
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    setZoom(map.zoom * Math.exp(e.deltaY * WHEEL_ZOOM));
  };
  const noMenu = (e: Event) => e.preventDefault(); // the right button drags the map
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('contextmenu', noMenu);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  return map;
}

// empties a group. What build made is freed by build itself (floorMats, made), the shared geometries (slab, arrow,
// dot, beacon) stay. `ownMats`: the meshes' materials are their own (viewer, markers), so they go too
function clearGroup(g: THREE.Group, ownMats = false) {
  for (const o of [...g.children]) {
    g.remove(o);
    if (ownMats && o instanceof THREE.Mesh) (o.material as THREE.Material).dispose();
    else if (o instanceof THREE.InstancedMesh) o.dispose?.();
  }
}
