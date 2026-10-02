import type * as THREE from 'three';
// ---- where a hit came from: an arc around the crosshair, only when the attacker is outside the view ----
// hits from in front need no arc (you can see them); the arc keeps pointing at the spot while you turn, then fades
const MAX_ARCS = 4; // arcs shown at once by default (the oldest is reused when all are busy)
const VIEW_MARGIN = 0.9; // a hit inside this share of the horizontal half field of view counts as "in front"
export interface HitDir {
  el: HTMLElement;
  x: number;
  z: number;
  t: number; // seconds left to show it (0 = free)
}
export interface HitDirOptions {
  container: HTMLElement; // the arcs are added here (a zero-size box at the crosshair)
  view: () => { x: number; z: number; yaw: number }; // the viewer's position and yaw (positive yaw turns left)
  camera: THREE.PerspectiveCamera; // for the horizontal field of view
  time: number; // seconds an arc stays (fades out linearly)
  max?: number; // arcs at once
  className?: string; // CSS class of an arc
}
export function createHitDirs(opts: HitDirOptions) {
  const list: HitDir[] = [];
  const max = opts.max ?? MAX_ARCS;
  // angle of a point from the view direction: 0 = straight ahead, positive = to the left
  const relAngle = (x: number, z: number) => {
    const v = opts.view();
    const a = Math.atan2(-(x - v.x), -(z - v.z)) - v.yaw;
    return Math.atan2(Math.sin(a), Math.cos(a));
  };
  function show(x: number, z: number) {
    const cam = opts.camera;
    const half = Math.atan(Math.tan((cam.fov * Math.PI) / 360) * cam.aspect); // half the horizontal field of view
    if (Math.abs(relAngle(x, z)) < half * VIEW_MARGIN) return;
    let d = list.find(h => h.t <= 0);
    if (!d && list.length < max) {
      const de = document.createElement('div');
      de.className = opts.className ?? 'hdir';
      opts.container.appendChild(de);
      d = { el: de, x: 0, z: 0, t: 0 };
      list.push(d);
    }
    if (!d) d = list.reduce((a, b) => (a.t < b.t ? a : b));
    d.x = x;
    d.z = z;
    d.t = opts.time;
  }
  function update(dt: number) {
    for (const d of list) {
      if (d.t <= 0) {
        d.el.style.opacity = '0';
        continue;
      }
      d.t -= dt;
      d.el.style.transform = `rotate(${-relAngle(d.x, d.z)}rad)`;
      d.el.style.opacity = String(Math.max(0, d.t / opts.time));
    }
  }
  return { show, update, list };
}
