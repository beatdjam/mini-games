import * as THREE from 'three';
import { basicMat, shared } from '@engine/render/render.ts';
import { PAINT, css } from '../../data/colors.ts';
import { HOIST_CAUTION, HOIST_RATING, HOIST_UNIT } from '../../i18n/signs.ts';
import { SIGN_FONT, TEX, grain, grime, paint, smudge, stripes, words } from '../looks/paint.ts';
import type { Paint } from '../looks/paint.ts';
import { at, boxGeo, cylGeo, machine } from './machine.ts';
// What HOIST's model (world/models/bossLooks.ts) is dressed with, all for the eye and none of it hit: the pictures
// (rust, oil, dents and welds on the girder and the magnet, the plates and the caution card on the girder, the cab's
// broken window), the cab, the beacons, the cable and chains hanging from the girder, and the scrap stuck to the
// magnet (a mall's carts and shelves, a foundry's offcuts, pipe and gear). The pictures are painted on a canvas each

const GIRDER_REPEAT = 8; // times the girder's picture runs along it
const BEACON_SPIN = 5; // rad/s a beacon's lamp turns...
const BEACON_SPIN_ALERT = 16; // ... and when it warns
const BEACON_BLINK = 20; // rad/s of the red blink
const BEACON_DIM = 0.2; // the red between blinks
const AMBER = PAINT.amber3;
const RED = PAINT.red1;

// ---- the pictures ----
// slanting rust runs down from the top of the picture
function drips(g: CanvasRenderingContext2D, rand: () => number, n: number, color: string) {
  g.fillStyle = color;
  for (let k = 0; k < n; k++) {
    const x = rand() * TEX,
      y = rand() * TEX * 0.6,
      w = 2 + rand() * 4,
      len = 30 + rand() * 110;
    g.fillRect(x, y, w, len);
    g.beginPath();
    g.arc(x + w / 2, y + len, w * 0.8, 0, Math.PI * 2);
    g.fill();
  }
}
// dark patches of oil
function oil(g: CanvasRenderingContext2D, rand: () => number, n: number) {
  for (let k = 0; k < n; k++) smudge(g, rand() * TEX, rand() * TEX, 8 + rand() * 20, 5 + rand() * 12, '8,6,5', 0.45);
}
// dents: a dark hollow with a light rim at its lower edge
function dents(g: CanvasRenderingContext2D, rand: () => number, n: number) {
  for (let k = 0; k < n; k++) {
    const x = 20 + rand() * (TEX - 40),
      y = 20 + rand() * (TEX - 40),
      rx = 10 + rand() * 16,
      ry = 6 + rand() * 10;
    g.fillStyle = 'rgba(0,0,0,.3)';
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,225,190,.28)';
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(x + 1.5, y + 1.5, rx, ry, 0, 0.2, Math.PI * 0.9);
    g.stroke();
  }
}
// a weld seam along a row: a line of beads
function weld(g: CanvasRenderingContext2D, rand: () => number, y: number) {
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.fillRect(0, y + 3, TEX, 3);
  for (let x = 2; x < TEX; x += 5 + rand() * 2) {
    g.fillStyle = `rgba(${170 + rand() * 40},${140 + rand() * 30},${110 + rand() * 20},.55)`;
    g.beginPath();
    g.arc(x, y + rand() * 2, 2.2 + rand(), 0, Math.PI * 2);
    g.fill();
  }
}
const girderPaint: Paint = (g, rand) => {
  g.fillStyle = css(PAINT.rust2);
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 50, css(PAINT.clay3), css(PAINT.umber1));
  drips(g, rand, 16, 'rgba(60,28,16,.5)');
  oil(g, rand, 4);
  dents(g, rand, 3);
  weld(g, rand, TEX * 0.5);
  grain(g, rand, 10);
};
// the same marks on a picture that is clear elsewhere: laid over the magnet's body
const decalPaint: Paint = (g, rand) => {
  drips(g, rand, 10, 'rgba(110,52,28,.5)');
  oil(g, rand, 5);
  dents(g, rand, 4);
  weld(g, rand, TEX * 0.78);
  weld(g, rand, TEX * 0.12);
};
// an enamel plate: its ground, a border, the words (the plate is `aspect` times wider than high), bolts and some rust
function platePaint(text: string, ground: string, ink: string, aspect: number, px: number): Paint {
  return (g, rand) => {
    g.fillStyle = ground;
    g.fillRect(0, 0, TEX, TEX);
    g.strokeStyle = ink;
    g.lineWidth = 6;
    g.strokeRect(8, 8, TEX - 16, TEX - 16);
    g.fillStyle = ink;
    words(g, text, TEX / 2, TEX / 2 / aspect, px, aspect, SIGN_FONT, TEX - 40);
    for (const [bx, by] of [
      [20, 20],
      [TEX - 20, 20],
      [20, TEX - 20],
      [TEX - 20, TEX - 20],
    ] as const) {
      g.fillStyle = 'rgba(0,0,0,.5)';
      g.beginPath();
      g.arc(bx, by, 4, 0, Math.PI * 2);
      g.fill();
    }
    drips(g, rand, 5, 'rgba(110,52,28,.4)');
    grime(g, rand, 20, 'rgba(255,255,255,.5)', 'rgba(0,0,0,.5)');
  };
}
// the caution card: a yellow field with black stripes top and bottom and the words between
const cardPaint: Paint = (g, rand) => {
  g.fillStyle = css(PAINT.amber1);
  g.fillRect(0, 0, TEX, TEX);
  stripes(g, [0, 0, TEX, 52], 40, css(PAINT.amber1), css(PAINT.ink7));
  stripes(g, [0, TEX - 52, TEX, 52], 40, css(PAINT.amber1), css(PAINT.ink7));
  g.fillStyle = css(PAINT.ink7);
  g.beginPath();
  g.moveTo(TEX / 2, 70);
  g.lineTo(TEX / 2 + 46, 150);
  g.lineTo(TEX / 2 - 46, 150);
  g.closePath();
  g.fill();
  g.fillStyle = css(PAINT.amber1);
  words(g, '!', TEX / 2, 128 / CARD_ASPECT, 52, CARD_ASPECT, SIGN_FONT);
  g.fillStyle = css(PAINT.ink7);
  words(g, HOIST_CAUTION, TEX / 2, 190 / CARD_ASPECT, 34, CARD_ASPECT, SIGN_FONT, TEX - 30);
  drips(g, rand, 4, 'rgba(90,40,20,.4)');
  grain(g, rand, 10);
};
// the cab's window: dark glass in a frame, a star of cracks, one pane gone, and a faint warm light inside
const windowPaint: Paint = (g, rand) => {
  g.fillStyle = '#0c1216';
  g.fillRect(0, 0, TEX, TEX);
  const glow = g.createRadialGradient(70, 190, 6, 70, 190, 130);
  glow.addColorStop(0, 'rgba(255,196,110,.5)');
  glow.addColorStop(1, 'rgba(255,196,110,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, TEX, TEX);
  g.strokeStyle = 'rgba(210,225,230,.75)';
  g.lineWidth = 2;
  for (let k = 0; k < 9; k++) {
    const a = rand() * Math.PI * 2,
      len = 40 + rand() * 110;
    g.beginPath();
    g.moveTo(170, 90);
    g.lineTo(170 + Math.cos(a) * len, 90 + Math.sin(a) * len);
    g.stroke();
  }
  g.fillStyle = '#05080a';
  g.beginPath();
  g.moveTo(170, 90);
  g.lineTo(215, 70);
  g.lineTo(226, 120);
  g.lineTo(184, 134);
  g.closePath();
  g.fill();
  g.strokeStyle = css(PAINT.ink7);
  g.lineWidth = 12;
  g.strokeRect(0, 0, TEX, TEX);
  g.beginPath();
  g.moveTo(TEX / 2, 0);
  g.lineTo(TEX / 2, TEX);
  g.stroke();
  drips(g, rand, 4, 'rgba(60,28,16,.5)');
};
const RATING_ASPECT = 3.7; // the rating plate is this many times wider than high (m over m)
const UNIT_ASPECT = 2.3;
const CARD_ASPECT = 1.3;
const WINDOW_ASPECT = 2.4;
const phong = (map: THREE.Texture, extra: THREE.MeshPhongMaterialParameters = {}) =>
  shared(new THREE.MeshPhongMaterial({ map, specular: PAINT.soot15, shininess: 16, ...extra }));
const plainPhong = (color: number) =>
  shared(new THREE.MeshPhongMaterial({ color, specular: PAINT.soot15, shininess: 14 }));
let kit: {
  rust: THREE.Material;
  junk: THREE.Material;
  sign: THREE.Material;
  girder: THREE.Material;
  decal: THREE.Material;
  rating: THREE.Material;
  unit: THREE.Material;
  card: THREE.Material;
  window: THREE.Material;
} | null = null;
export function decoKit() {
  if (kit) return kit;
  const girder = paint(7201, girderPaint, true);
  girder.repeat.set(GIRDER_REPEAT, 1);
  kit = {
    rust: plainPhong(PAINT.rust2),
    junk: plainPhong(PAINT.grey3),
    sign: plainPhong(PAINT.red2),
    girder: phong(girder, { emissive: PAINT.umber2 }), // (a little of its own light: the girder's sides are in shadow)
    decal: phong(paint(7202, decalPaint), {
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
    rating: phong(paint(7203, platePaint(HOIST_RATING, css(PAINT.glow2), css(PAINT.ink9), RATING_ASPECT, 34))),
    unit: phong(paint(7204, platePaint(HOIST_UNIT, '#2c3136', '#e8e2d0', UNIT_ASPECT, 40))),
    card: phong(paint(7205, cardPaint)),
    window: shared(new THREE.MeshBasicMaterial({ map: paint(7206, windowPaint) })),
  };
  return kit;
}
export const RATING_SIZE: [number, number] = [2.6, 0.7]; // the plates' sizes on the girder (m)
export const UNIT_SIZE: [number, number] = [1.6, 0.7];
export const CARD_SIZE: [number, number] = [1.3, 1.0];

// ---- what stands on the girder ----
const winGeo = shared(new THREE.PlaneGeometry(1.2, 1.2 / WINDOW_ASPECT));
// the cab: a small box with a roof and a window on three sides; its origin is the middle of its floor
export function hoistCab(): THREE.Group {
  const g = new THREE.Group(),
    k = machine(),
    kk = decoKit();
  g.add(at(boxGeo(1.8, 1.0, 1.6), kk.girder, 0, 0.5, 0), at(boxGeo(2.0, 0.08, 1.8), k.black, 0, 1.04, 0));
  const front = new THREE.Mesh(winGeo, kk.window),
    left = new THREE.Mesh(winGeo, kk.window),
    right = new THREE.Mesh(winGeo, kk.window);
  front.position.set(0, 0.55, 0.81);
  left.position.set(-0.91, 0.55, 0);
  left.rotation.y = -Math.PI / 2;
  right.position.set(0.91, 0.55, 0);
  right.rotation.y = Math.PI / 2;
  g.add(front, left, right);
  return g;
}
export interface Beacon {
  g: THREE.Group;
  dome: THREE.MeshBasicMaterial;
  lamp: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
}
// a rotating beacon: a dark base, a clear dome, and a bright lamp turning inside it; its origin is the base's floor
export function hoistBeacon(): Beacon {
  const g = new THREE.Group(),
    dome = new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.55, depthWrite: false }),
    lamp: Beacon['lamp'] = new THREE.Mesh(boxGeo(0.3, 0.06, 0.1), new THREE.MeshBasicMaterial({ color: AMBER }));
  lamp.position.y = 0.28;
  g.add(
    at(cylGeo(0.2, 0.22, 0.12, 10), machine().black, 0, 0.06, 0),
    new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), dome),
    lamp,
  );
  g.children[1]!.position.y = 0.28;
  return { g, dome, lamp };
}
// turns the lamp; amber while the crane works, red and fast and blinking while it warns
export function beaconTick(b: Beacon, t: number, alert: boolean) {
  const spin = t * (alert ? BEACON_SPIN_ALERT : BEACON_SPIN);
  b.lamp.rotation.y = spin;
  const k = alert ? (Math.sin(t * BEACON_BLINK) > 0 ? 1 : BEACON_DIM) : 0.55 + 0.45 * Math.abs(Math.cos(spin));
  b.dome.color.setHex(alert ? RED : AMBER).multiplyScalar(k);
  b.lamp.material.color.setHex(alert ? RED : AMBER).multiplyScalar(k);
}
// a beacon that has stopped: dark
export function beaconOff(b: Beacon) {
  b.dome.color.setHex(PAINT.soot1);
  b.lamp.material.color.setHex(PAINT.soot1);
}

// ---- what hangs from the girder ----
const UP = new THREE.Vector3(0, 1, 0);
// a straight bar from one point to another
function bar(from: THREE.Vector3, to: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(cylGeo(r, r, 1, 6), mat),
    d = to.clone().sub(from);
  m.position.copy(from).add(to).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, d.clone().normalize());
  m.scale.set(1, d.length(), 1);
  return m;
}
const CABLE_SPANS = 4; // hangers along the cable
const CABLE_STEPS = 5; // bars to a span
const CABLE_SAG = 0.4; // how far it dips between two hangers (m)
// the supply cable: sagging between clips, `len` long along x, from the origin
export function hoistCable(len: number): THREE.Group {
  const g = new THREE.Group(),
    black = machine().black,
    n = CABLE_SPANS * CABLE_STEPS;
  let prev = new THREE.Vector3(0, 0, 0);
  for (let i = 1; i <= n; i++) {
    const u = (i % CABLE_STEPS) / CABLE_STEPS,
      p = new THREE.Vector3((len * i) / n, -CABLE_SAG * 4 * u * (1 - u), 0);
    g.add(bar(prev, p, 0.05, black));
    if (i % CABLE_STEPS === 0) g.add(at(boxGeo(0.12, 0.18, 0.12), machine().steel, p.x, 0.02, 0));
    prev = p;
  }
  g.add(at(boxGeo(0.12, 0.18, 0.12), machine().steel, 0, 0.02, 0));
  return g;
}
const linkGeo = shared(new THREE.TorusGeometry(0.1, 0.03, 5, 8));
const hookGeo = shared(new THREE.TorusGeometry(0.16, 0.04, 5, 10, Math.PI * 1.5));
const CHAIN_LINKS = 7;
const CHAIN_PITCH = 0.15; // between two links (m)
// a chain hanging from its origin, torn off and ending in a hook
export function hoistChain(): THREE.Group {
  const g = new THREE.Group(),
    steel = machine().steel;
  for (let i = 0; i < CHAIN_LINKS; i++) {
    const link = new THREE.Mesh(linkGeo, steel);
    link.position.y = -i * CHAIN_PITCH;
    link.rotation.y = i % 2 ? Math.PI / 2 : 0;
    g.add(link);
  }
  const hook = new THREE.Mesh(hookGeo, steel);
  hook.position.set(0.03, -CHAIN_LINKS * CHAIN_PITCH - 0.1, 0);
  hook.rotation.z = Math.PI * 0.8;
  g.add(hook);
  return g;
}
// the lamp under the trolley: a housing and its glowing face (it lights nothing: the floor has the shadow rings)
export function hoistWorkLamp(): THREE.Group {
  const g = new THREE.Group();
  g.add(
    at(boxGeo(0.5, 0.18, 0.4), machine().black, 0, 0, 0),
    at(boxGeo(0.4, 0.03, 0.3), basicMat(PAINT.glow5), 0, -0.1, 0),
    at(cylGeo(0.04, 0.04, 0.16, 6), machine().steel, 0, 0.16, 0),
  );
  return g;
}

// ---- what is stuck to the magnet ----
// the plate the load hangs from is 3.4 square: the scrap clings to its sides, outside the load (3 square)
const spun = <T extends THREE.Object3D>(m: T, x: number, y: number, z: number): T => {
  m.rotation.set(x, y, z);
  return m;
};
function cart(): THREE.Group {
  const g = new THREE.Group(),
    k = decoKit();
  g.add(at(boxGeo(0.9, 0.03, 0.6), k.junk, 0, 0, 0)); // the basket's floor and its wire sides
  for (const z of [-0.3, 0.3]) g.add(at(boxGeo(0.9, 0.03, 0.03), k.junk, 0, 0.4, z));
  for (const x of [-0.45, 0.45]) {
    g.add(at(boxGeo(0.03, 0.03, 0.6), k.junk, x, 0.4, 0));
    for (const z of [-0.3, 0.3]) g.add(at(boxGeo(0.03, 0.4, 0.03), k.junk, x, 0.2, z));
  }
  g.add(at(boxGeo(0.03, 0.03, 0.62), k.junk, 0, 0.2, 0.3), at(boxGeo(0.9, 0.03, 0.03), k.junk, 0, 0.2, -0.3));
  g.add(at(boxGeo(0.04, 0.45, 0.5), k.junk, -0.5, 0.45, 0)); // the handle
  for (const x of [-0.35, 0.35])
    for (const z of [-0.22, 0.22]) g.add(at(cylGeo(0.06, 0.06, 0.04, 8), machine().black, x, -0.1, z, 'z'));
  return g;
}
function shelf(): THREE.Group {
  const g = new THREE.Group(),
    k = decoKit();
  g.add(at(boxGeo(1.7, 0.05, 0.4), k.junk, 0, 0, 0), at(boxGeo(1.7, 0.12, 0.04), k.junk, 0, 0.05, 0.2));
  return g;
}
function signScrap(): THREE.Group {
  const g = new THREE.Group(),
    k = decoKit();
  g.add(at(boxGeo(0.8, 0.55, 0.04), k.sign, 0, 0, 0), at(boxGeo(0.8, 0.1, 0.05), basicMat(PAINT.glow2), 0, 0.1, 0));
  return g;
}
function offcuts(): THREE.Group {
  const g = new THREE.Group(),
    k = decoKit();
  g.add(
    spun(at(boxGeo(0.9, 0.06, 0.5), k.rust, 0, 0, 0), 0.2, 0.5, 0.1),
    spun(at(boxGeo(0.5, 0.05, 0.7), k.junk, 0.3, -0.2, 0.1), -0.3, 0.2, 0.4),
  );
  return g;
}
function pipe(): THREE.Group {
  const g = new THREE.Group(),
    k = decoKit();
  g.add(
    at(cylGeo(0.12, 0.12, 1.4, 10), k.junk, 0, 0, 0, 'z'),
    at(cylGeo(0.2, 0.2, 0.05, 10), k.rust, 0, 0, 0.7, 'z'),
    at(cylGeo(0.2, 0.2, 0.05, 10), k.rust, 0, 0, -0.7, 'z'),
  );
  return g;
}
function gear(): THREE.Group {
  const g = new THREE.Group(),
    k = decoKit();
  g.add(at(cylGeo(0.42, 0.42, 0.1, 12), k.rust, 0, 0, 0, 'z'));
  for (let n = 0; n < 10; n++) {
    const a = (n / 10) * Math.PI * 2;
    g.add(spun(at(boxGeo(0.14, 0.14, 0.1), k.rust, Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0), 0, 0, a));
  }
  return g;
}
// the scrap a magnet of a mall ('mall': carts, shelves, sign boards) or of a foundry (anything else: offcuts, pipe, gear)
// has picked up and not let go; positions are the magnet's own, its middle the origin
export function hoistScrap(kind: 'mall' | 'forge'): THREE.Group {
  const g = new THREE.Group(),
    pieces: [THREE.Group, number, number, number, number, number, number][] =
      kind === 'mall'
        ? [
            [cart(), 2.15, -1.15, 0.4, 0, 0, 0.35],
            [shelf(), -2.1, -1.05, -0.2, 0, 0, -0.6],
            [signScrap(), 0.3, -1.2, 2.05, 0.7, 0, 0],
          ]
        : [
            [offcuts(), 2.1, -1.15, -0.3, 0, 0, 0.5],
            [pipe(), -2.0, -1.15, 0.2, 0, 0, 0.2],
            [gear(), 0.2, -1.15, 2.05, 0, 0, 0],
          ];
  for (const [p, x, y, z, rx, ry, rz] of pieces) {
    p.position.set(x, y, z);
    p.rotation.set(rx, ry, rz);
    g.add(p);
  }
  return g;
}
