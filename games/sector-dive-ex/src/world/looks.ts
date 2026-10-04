import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { renderer } from '@engine/render/render.ts';
import { SIDE_STEP, T, tileCenter } from '@engine/world/tiles.ts';
import { placeProps } from '@engine/world/slots.ts';
import type { PropRule } from '@engine/world/slots.ts';
import { WALL_H } from '../data/level.ts';
import { COLOR, CSS_COLOR } from '../data/colors.ts';
import type { Biome } from '../data/types.ts';
import type { FloorPlan } from './building.ts';
// A sector's own look: its wall, floor, deck and ceiling pictures (painted on canvases, a few variants each so the
// same picture is not on every tile) and the things fixed to its walls and ceilings (props; none of them is in the
// way, so the tile world is not touched). A sector without a look is drawn with the plain line pattern in its colours
// (world/render.ts). The pictures and the props are drawn from a seed, so a floor looks the same every time.
// ---- tuning numbers used only here ----
const TEX = 256; // side of a painted picture (px)
const LAMP_POOL = 7; // side of the pool of light a ceiling lamp throws on the floor (m)
const LAMP_POOL_OPACITY = 0.7;

export interface Look {
  walls: THREE.CanvasTexture[];
  floors: THREE.CanvasTexture[];
  deck: THREE.CanvasTexture; // top of raised decks and ramps
  ceiling: THREE.CanvasTexture;
  props: (plan: FloorPlan, group: THREE.Group, rng: Rng) => void;
}
type Paint = (g: CanvasRenderingContext2D, rand: () => number) => void;

// dev only (?plain): every sector drawn the plain way, to compare a look with what was there before
let plain = false;
export function devPlainLooks(on: boolean) {
  plain = on;
}

// a small seeded generator for the painters (the same picture every time)
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function paint(seed: number, fn: Paint, repeat = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = TEX;
  c.height = TEX;
  fn(c.getContext('2d')!, seeded(seed));
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  return t;
}
// speckles and blotches over the whole picture: dirt
function grime(g: CanvasRenderingContext2D, rand: () => number, n: number, light: string, dark: string) {
  for (let k = 0; k < n; k++) {
    g.globalAlpha = 0.04 + rand() * 0.1;
    g.fillStyle = rand() < 0.5 ? light : dark;
    const w = 4 + rand() * 46,
      h = 3 + rand() * 30;
    g.fillRect(rand() * TEX - w / 2, rand() * TEX - h / 2, w, h);
  }
  g.globalAlpha = 1;
}

// ---- the walled city (KWLN): stained concrete, conduits and posters under neon; wet floors; pipes overhead ----
const kwlnWall =
  (variant: number): Paint =>
  (g, rand) => {
    const bg = g.createLinearGradient(0, 0, 0, TEX);
    bg.addColorStop(0, '#48263f');
    bg.addColorStop(0.7, '#32172c');
    bg.addColorStop(1, '#1c0c18');
    g.fillStyle = bg;
    g.fillRect(0, 0, TEX, TEX);
    grime(g, rand, 150, '#5a3550', '#000000');
    // courses of blocks
    for (let y = 0; y < TEX; y += TEX / 8) {
      g.fillStyle = 'rgba(0,0,0,.4)';
      g.fillRect(0, y, TEX, 2);
      g.fillStyle = 'rgba(255,150,200,.05)';
      g.fillRect(0, y + 2, TEX, 1);
      const shift = (Math.round(y / (TEX / 8)) % 2) * (TEX / 8);
      g.fillStyle = 'rgba(0,0,0,.28)';
      for (let x = shift; x < TEX; x += TEX / 4) g.fillRect(x, y, 2, TEX / 8);
    }
    // water stains running down
    for (let k = 0; k < 9; k++) {
      const x = rand() * TEX,
        len = 40 + rand() * 170,
        st = g.createLinearGradient(0, 0, 0, len);
      st.addColorStop(0, 'rgba(0,0,0,.45)');
      st.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = st;
      g.fillRect(x, 0, 2 + rand() * 7, len);
    }
    if (variant === 0) {
      // a lit conduit along the wall with junction boxes
      g.shadowColor = CSS_COLOR.neonPink;
      g.shadowBlur = 14;
      g.fillStyle = '#ff5c9d';
      g.fillRect(0, TEX * 0.24, TEX, 4);
      g.shadowBlur = 0;
      g.fillStyle = '#120810';
      g.fillRect(40, TEX * 0.24 - 9, 26, 22);
      g.fillRect(170, TEX * 0.24 - 9, 26, 22);
      g.fillStyle = CSS_COLOR.neonMint;
      g.fillRect(48, TEX * 0.24 - 4, 4, 4);
    } else if (variant === 1) {
      // posters, half torn off
      const inks = [CSS_COLOR.neonMint, CSS_COLOR.neonGold, CSS_COLOR.neonSky, CSS_COLOR.neonPink];
      for (let k = 0; k < 3; k++) {
        const x = 14 + rand() * 150,
          y = 70 + rand() * 90,
          w = 46 + rand() * 34,
          h = 60 + rand() * 40;
        g.globalAlpha = 0.5 + rand() * 0.25;
        g.fillStyle = inks[Math.floor(rand() * inks.length)]!;
        g.fillRect(x, y, w, h);
        g.globalAlpha = 0.7;
        g.fillStyle = '#12080f';
        for (let l = 0; l < 5; l++) g.fillRect(x + 6, y + 10 + l * 11, (w - 12) * (0.4 + rand() * 0.6), 4);
        g.fillRect(x + w - 14 - rand() * 12, y + h - 12 - rand() * 14, 30, 30); // a torn corner
      }
      g.globalAlpha = 1;
    } else if (variant === 2) {
      // a barred window with a light on behind it
      const x = 62,
        y = 40,
        w = 132,
        h = 96;
      g.fillStyle = '#0b0509';
      g.fillRect(x - 6, y - 6, w + 12, h + 12);
      const lit = g.createLinearGradient(0, y, 0, y + h);
      lit.addColorStop(0, '#ffd68a');
      lit.addColorStop(1, '#c2733a');
      g.fillStyle = lit;
      g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(40,10,30,.55)';
      g.fillRect(x, y, w * 0.38, h); // a curtain
      g.fillStyle = '#0b0509';
      for (let b = 1; b < 6; b++) g.fillRect(x + (w / 6) * b - 2, y, 4, h);
      g.fillRect(x, y + h / 2 - 2, w, 4);
      // the stain under the sill
      const st = g.createLinearGradient(0, y + h, 0, TEX);
      st.addColorStop(0, 'rgba(0,0,0,.5)');
      st.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = st;
      g.fillRect(x + 10, y + h + 6, w - 20, TEX - y - h);
    }
    // the foot of the wall is the dirtiest; a thin line keeps the edge of each wall tile readable
    const foot = g.createLinearGradient(0, TEX * 0.8, 0, TEX);
    foot.addColorStop(0, 'rgba(0,0,0,0)');
    foot.addColorStop(1, 'rgba(0,0,0,.6)');
    g.fillStyle = foot;
    g.fillRect(0, TEX * 0.8, TEX, TEX * 0.2);
    g.strokeStyle = 'rgba(255,61,138,.5)';
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, TEX - 3, TEX - 3);
  };
const kwlnFloor =
  (variant: number): Paint =>
  (g, rand) => {
    g.fillStyle = '#26121f';
    g.fillRect(0, 0, TEX, TEX);
    grime(g, rand, 120, '#4a2c40', '#000000');
    // slabs with worn joints
    g.strokeStyle = 'rgba(255,61,138,.42)';
    g.lineWidth = 2.5;
    g.strokeRect(1, 1, TEX - 2, TEX - 2);
    g.strokeStyle = 'rgba(0,0,0,.45)';
    g.beginPath();
    g.moveTo(TEX / 2, 0);
    g.lineTo(TEX / 2, TEX);
    g.moveTo(0, TEX / 2);
    g.lineTo(TEX, TEX / 2);
    g.stroke();
    // cracks
    g.strokeStyle = 'rgba(0,0,0,.6)';
    g.lineWidth = 1.5;
    for (let k = 0; k < 4; k++) {
      let x = rand() * TEX,
        y = rand() * TEX;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        x += (rand() - 0.5) * 50;
        y += (rand() - 0.5) * 50;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    if (variant === 1) {
      // a puddle with the neon in it
      const cx = 90 + rand() * 70,
        cy = 90 + rand() * 70,
        pool = g.createRadialGradient(cx, cy, 6, cx, cy, 86);
      pool.addColorStop(0, 'rgba(255,90,160,.34)');
      pool.addColorStop(0.6, 'rgba(61,255,180,.12)');
      pool.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = pool;
      g.beginPath();
      g.ellipse(cx, cy, 86, 54, rand() * 3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,220,240,.35)';
      for (let k = 0; k < 5; k++) g.fillRect(cx - 40 + rand() * 80, cy - 20 + rand() * 40, 14 + rand() * 20, 1.5);
    } else if (variant === 2) {
      // a drain
      g.fillStyle = '#07030a';
      g.fillRect(96, 104, 64, 48);
      g.fillStyle = '#2c1a28';
      for (let b = 0; b < 6; b++) g.fillRect(100 + b * 10, 108, 5, 40);
    }
  };
const kwlnDeck: Paint = (g, rand) => {
  g.fillStyle = '#241320';
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 60, '#4a2c40', '#000000');
  // chequer plate
  g.fillStyle = 'rgba(255,150,200,.16)';
  for (let y = 0; y < TEX; y += 22)
    for (let x = (y / 22) % 2 ? 11 : 0; x < TEX; x += 22) {
      g.save();
      g.translate(x + 6, y + 6);
      g.rotate(((x + y) / 22) % 2 ? 0.7 : -0.7);
      g.fillRect(-6, -1.5, 12, 3);
      g.restore();
    }
  g.strokeStyle = CSS_COLOR.neonPink;
  g.lineWidth = 5;
  g.strokeRect(2, 2, TEX - 4, TEX - 4);
};
const kwlnCeiling: Paint = (g, rand) => {
  g.fillStyle = '#1a0c15';
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 80, '#3a2030', '#000000');
  // beams, then pipes and cables running under them
  g.fillStyle = '#1b0e17';
  g.fillRect(0, 0, TEX, 26);
  g.fillRect(0, TEX / 2 - 13, TEX, 26);
  for (const [y, w, c] of [
    [62, 12, '#3a2533'],
    [84, 7, '#2c1b27'],
    [176, 14, '#40283a'],
    [204, 5, '#2c1b27'],
  ] as [number, number, string][]) {
    g.fillStyle = c;
    g.fillRect(0, y, TEX, w);
    g.fillStyle = 'rgba(255,170,210,.18)';
    g.fillRect(0, y + 1, TEX, 2);
    g.fillStyle = '#12080f';
    g.fillRect(40 + rand() * 150, y - 2, 10, w + 4); // a clamp
  }
  g.strokeStyle = 'rgba(0,0,0,.7)';
  g.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    const y = 100 + k * 16;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(TEX / 3, y + 16, (TEX * 2) / 3, y - 12, TEX, y);
    g.stroke();
  }
};
// a soft round patch of light, for the pools under the lamps
const poolPaint: Paint = g => {
  const r = g.createRadialGradient(TEX / 2, TEX / 2, 4, TEX / 2, TEX / 2, TEX / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.35, 'rgba(255,255,255,.45)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, TEX, TEX);
};
// the front of an air conditioner
const acPaint: Paint = (g, rand) => {
  g.fillStyle = '#3d3940';
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 40, '#6b6570', '#000000');
  g.fillStyle = '#17141a';
  g.beginPath();
  g.arc(TEX * 0.36, TEX / 2, TEX * 0.3, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#4d4852';
  g.lineWidth = 5;
  for (let k = 0; k < 6; k++) {
    g.beginPath();
    g.arc(TEX * 0.36, TEX / 2, 10 + k * 11, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = '#17141a';
  for (let k = 0; k < 7; k++) g.fillRect(TEX * 0.74, 40 + k * 26, TEX * 0.2, 10);
  g.fillStyle = CSS_COLOR.neonMint;
  g.fillRect(TEX * 0.78, 16, 12, 12);
};

const LAMP_COLORS = [0xff5c9d, COLOR.neonMint, 0xffc27a, 0xff5c9d]; // pink is the walled city's colour: twice as likely
const KWLN_PROPS: PropRule[] = [
  { id: 'pipes', slots: ['wall'], blocks: false, count: [18, 26], gap: 2 },
  { id: 'ac', slots: ['wall'], blocks: false, count: [6, 10], gap: 3 },
  { id: 'lamp', slots: ['floor', 'center', 'corridor'], blocks: false, count: [18, 26], gap: 2 },
];
let kwlnShared: { pool: THREE.CanvasTexture; ac: THREE.CanvasTexture } | null = null;
// pipes down the walls, air conditioners high on them, lamps on the ceiling with a pool of their colour on the floor
function kwlnProps(plan: FloorPlan, group: THREE.Group, rng: Rng) {
  kwlnShared ??= { pool: paint(11, poolPaint), ac: paint(12, acPaint) };
  const d = { W: plan.gen.W, H: plan.gen.H, maps: plan.gen.maps, rooms: plan.gen.rooms },
    placed = placeProps(d, KWLN_PROPS, rng),
    of = (id: string) => placed.filter(p => p.id === id).map(p => p.slot),
    m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    one = new THREE.Vector3(1, 1, 1),
    up = new THREE.Vector3(0, 1, 0);
  // where on a wall face: the tile's middle moved to the wall, `off` along it, `out` away from it
  const onWall = (s: { i: number; j: number; side?: number }, off: number, out: number, y: number) => {
    const [di, dj] = SIDE_STEP[s.side ?? 0]!;
    return new THREE.Vector3(
      tileCenter(s.i) + di * (T / 2 - out) + dj * off,
      y,
      tileCenter(s.j) + dj * (T / 2 - out) + di * off,
    );
  };
  // pipes: a thick and a thin one side by side, floor to ceiling
  const pipes = of('pipes');
  if (pipes.length) {
    const mesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.1, 0.1, WALL_H, 8),
      new THREE.MeshBasicMaterial({ color: 0x4a3142 }),
      pipes.length * 2,
    );
    pipes.forEach((s, n) => {
      const off = rng.rand(-1.3, 1.3);
      m.compose(onWall(s, off, 0.14, WALL_H / 2), q.identity(), one);
      mesh.setMatrixAt(n * 2, m);
      m.compose(onWall(s, off + 0.3, 0.1, WALL_H / 2), q.identity(), new THREE.Vector3(0.55, 1, 0.55));
      mesh.setMatrixAt(n * 2 + 1, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }
  // air conditioners: a box high on the wall, its front toward the room
  const acs = of('ac');
  if (acs.length) {
    const front = new THREE.MeshBasicMaterial({ map: kwlnShared.ac }),
      body = new THREE.MeshBasicMaterial({ color: 0x2c2930 }),
      mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1.3, 0.8, 0.5),
        [body, body, body, body, front, front],
        acs.length,
      );
    acs.forEach((s, n) => {
      const [di, dj] = SIDE_STEP[s.side ?? 0]!;
      q.setFromAxisAngle(up, Math.atan2(-di, -dj)); // the box's +z face looks away from the wall
      m.compose(onWall(s, rng.rand(-1, 1), 0.26, rng.rand(3.2, 4.6)), q, one);
      mesh.setMatrixAt(n, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }
  // lamps (not where the ceiling is open): a bright plate on the ceiling and its light on the floor
  const lamps = of('lamp').filter(s => !plan.noCeil[s.j * d.W + s.i]);
  if (lamps.length) {
    const plates = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.9, 0.08, 0.3),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
        lamps.length,
      ),
      poolGeo = new THREE.PlaneGeometry(LAMP_POOL, LAMP_POOL);
    poolGeo.rotateX(-Math.PI / 2);
    const pools = new THREE.InstancedMesh(
        poolGeo,
        new THREE.MeshBasicMaterial({
          map: kwlnShared.pool,
          transparent: true,
          opacity: LAMP_POOL_OPACITY,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
        lamps.length,
      ),
      color = new THREE.Color();
    lamps.forEach((s, n) => {
      const x = tileCenter(s.i),
        z = tileCenter(s.j);
      color.setHex(rng.pick(LAMP_COLORS));
      q.setFromAxisAngle(up, rng.pick([0, Math.PI / 2]));
      m.compose(new THREE.Vector3(x, WALL_H - 0.06, z), q, one);
      plates.setMatrixAt(n, m);
      plates.setColorAt(n, color);
      m.compose(new THREE.Vector3(x, 0.05, z), q.identity(), one);
      pools.setMatrixAt(n, m);
      pools.setColorAt(n, color);
    });
    for (const mesh of [plates, pools]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      group.add(mesh);
    }
  }
}

// the looks, made the first time a sector is drawn (the pictures stay for the life of the page)
const MAKERS: Record<string, () => Look> = {
  KWLN: () => ({
    walls: [-1, 0, 1, 2].map(v => paint(100 + v, kwlnWall(v))), // bare, a conduit, posters, a window
    floors: [0, 1, 2].map(v => paint(200 + v, kwlnFloor(v))), // bare, a puddle, a drain
    deck: paint(300, kwlnDeck),
    ceiling: paint(400, kwlnCeiling),
    props: kwlnProps,
  }),
};
const made: Record<string, Look> = {};
// the sector's look, or null when it has none (or ?plain is on): it is drawn the plain way then
export function lookOf(b: Biome): Look | null {
  if (plain || !MAKERS[b.code]) return null;
  return (made[b.code] ??= MAKERS[b.code]!());
}
// which picture a tile gets: the same one every time, scattered so that neighbours differ. The first picture is the
// plainest and comes up most (`plainShare` of the tiles)
export function variantOf(k: number, count: number, plainShare: number): number {
  const h = (Math.imul(k + 1, 2654435761) >>> 0) / 4294967296;
  return h < plainShare ? 0 : 1 + (Math.floor((h - plainShare) * 9973) % (count - 1));
}
export const WALL_PLAIN_SHARE = 0.45; // share of the wall tiles that get the plain picture
export const FLOOR_PLAIN_SHARE = 0.6; // ... of the floor tiles
