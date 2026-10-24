import { TEX, grain, grime, oval, smudge } from '../paint.ts';
import type { Paint } from '../paint.ts';
import { PLATE_WHITE, WARM, paper } from './shared.ts';
// The floors of the hospital. The corridors' (the default floors, HOSP_CORRIDOR_FLOORS): beige linoleum in sheets two
// metres across with a welded seam half a tile in from the picture's edge, flecked, and six kinds of wear; then the
// rooms' (Look.roomFloors), two for each kind of room (the plain floor and one with a mark of wear on it): the ward's
// pale green linoleum, the consulting room's cream, the examination room's blue-grey, the pharmacy's sage tiles, the
// linen room's concrete, the waiting hall's terrazzo; last the operating theatre's (HOSP_THEATRE_FLOORS). The seams and
// the stains run on across the edge of the picture (they are drawn again on every side), so the tiles of the floor do not
// show.
// ---- tuning numbers used only here ----
const SHEETS = 2; // sheets of linoleum across a picture
const CORRIDOR_FLOORS = 6; // 0 plain, 1 wheel marks, 2 a stain's tide marks, 3 a cracked sheet, 4 the evening sun, 5 charts on the floor
const FLECKS = 700; // flecks in the linoleum's pattern

interface Style {
  how: 'sheets' | 'tiles' | 'concrete' | 'terrazzo';
  base: string;
  alt: string; // the second shade: the speckle, the other tile, the seams
}
const STYLES: Style[] = [
  { how: 'sheets', base: '#a6bf9e', alt: '#8ea987' }, // ward: pale green linoleum
  { how: 'sheets', base: '#c8bd98', alt: '#a89d78' }, // consulting room: cream
  { how: 'sheets', base: '#9fb5b4', alt: '#7f9a9a' }, // examination room: blue-grey
  { how: 'tiles', base: '#b7c5a6', alt: '#8fa08a' }, // pharmacy: sage tiles
  { how: 'concrete', base: '#8c9a8f', alt: '#6c7a70' }, // linen room: painted concrete
  { how: 'terrazzo', base: '#cdc09e', alt: '#a89b7b' }, // waiting hall: terrazzo
];
const THEATRE = { base: '#9cc3be', alt: '#7aa6a2' };

const seam = (g: CanvasRenderingContext2D, alt: string) => {
  g.fillStyle = alt + '99';
  for (let n = 0; n < SHEETS; n++) {
    const p = (n + 0.5) * (TEX / SHEETS);
    g.fillRect(p - 0.7, 0, 1.4, TEX);
    g.fillRect(0, p - 0.7, TEX, 1.4);
  }
};
const flecks = (g: CanvasRenderingContext2D, rand: () => number, alt: string) => {
  for (let k = 0; k < FLECKS; k++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(20,24,20,.13)' : alt + '66';
    g.fillRect(rand() * TEX, rand() * TEX, 1 + rand() * 2, 1);
  }
};
const stains = (g: CanvasRenderingContext2D, rand: () => number, n: number) => {
  for (let k = 0; k < n; k++)
    smudge(g, rand() * TEX, rand() * TEX, 16 + rand() * 46, 12 + rand() * 30, '30,34,26', 0.04 + rand() * 0.08);
};

// the corridors' linoleum: variant 0 plain, then six marks of wear
const corridorFloor =
  (variant: number): Paint =>
  (g, rand) => {
    g.fillStyle = '#c0b290';
    g.fillRect(0, 0, TEX, TEX);
    // each sheet a shade of its own
    for (let a = 0; a <= SHEETS; a++)
      for (let b = 0; b <= SHEETS; b++) {
        const t = rand(),
          s = TEX / SHEETS;
        g.fillStyle = t < 0.5 ? `rgba(255,248,222,${t * 0.14})` : `rgba(30,26,16,${(t - 0.5) * 0.14})`;
        g.fillRect((a - 0.5) * s, (b - 0.5) * s, s, s);
      }
    flecks(g, rand, '#e6dcba');
    stains(g, rand, 28);
    seam(g, '#7d7254');
    // everything below stays clear of the picture's edge (the guide line runs across it, in line with the next)
    if (variant === 1) {
      // the black rubber marks of wheels, curving and fading: a trolley pushed round the corner
      g.lineCap = 'round';
      for (const [sx, sy, ex, ey, bend, a] of [
        [40, 70, 216, 100, 30, 0.22],
        [46, 82, 222, 112, 34, 0.18],
        [70, 190, 200, 150, -24, 0.2],
      ] as const) {
        g.strokeStyle = `rgba(14,14,12,${a})`;
        g.lineWidth = 4 + rand() * 2;
        g.beginPath();
        g.moveTo(sx, sy);
        g.quadraticCurveTo((sx + ex) / 2, (sy + ey) / 2 + bend, ex, ey);
        g.stroke();
      }
    } else if (variant === 2) {
      // a leak that dried: rings of tide marks, the middle darker
      const cx = 100 + rand() * 56,
        cy = 100 + rand() * 56;
      for (let r = 0; r < 4; r++) {
        const rx = 18 + r * 12 + rand() * 6,
          ry = rx * (0.7 + rand() * 0.2);
        g.strokeStyle = `rgba(86,72,40,${0.34 - r * 0.06})`;
        g.lineWidth = 1.2 + rand();
        g.beginPath();
        g.ellipse(cx, cy, rx, ry, rand() * 0.6, 0, Math.PI * 2);
        g.stroke();
      }
      smudge(g, cx, cy, 24, 18, '84,66,40', 0.3);
    } else if (variant === 3) {
      // a cracked sheet: a dark crack with its branches, a corner lifted
      g.strokeStyle = 'rgba(16,14,10,.8)';
      g.lineWidth = 1.3;
      for (let k = 0; k < 3; k++) {
        let cx = 70 + rand() * 120,
          cy = 50;
        g.beginPath();
        g.moveTo(cx, cy);
        while (cy < 200) {
          cx += (rand() - 0.5) * 14;
          cy += 4 + rand() * 8;
          g.lineTo(cx, cy);
        }
        g.stroke();
      }
      g.fillStyle = 'rgba(40,34,22,.5)';
      g.beginPath();
      g.moveTo(190, 200);
      g.lineTo(172, 200);
      g.lineTo(190, 184);
      g.fill();
    } else if (variant === 4) {
      // the evening sun through a window: a warm parallelogram with the window's bars across it
      g.save();
      g.beginPath();
      g.moveTo(70, 50);
      g.lineTo(190, 50);
      g.lineTo(166, 206);
      g.lineTo(46, 206);
      g.closePath();
      g.clip();
      const sun = g.createLinearGradient(70, 50, 46, 206);
      sun.addColorStop(0, `${WARM}.3)`);
      sun.addColorStop(1, `${WARM}.12)`);
      g.fillStyle = sun;
      g.fillRect(40, 40, 160, 180);
      g.fillStyle = 'rgba(40,24,10,.22)';
      g.fillRect(40, 124, 160, 3);
      g.fillRect(122, 40, 3, 180);
      g.restore();
    } else if (variant === 5) {
      // charts and forms that slid out of a folder: pale sheets at all angles, with their lines of print
      for (let k = 0; k < 8; k++) {
        g.save();
        g.translate(60 + rand() * 136, 60 + rand() * 136);
        g.rotate(rand() * Math.PI);
        paper(g, rand, 12 + rand() * 6, 16 + rand() * 6, PLATE_WHITE);
        g.restore();
      }
    }
    grime(g, rand, 24, '#b8ad8a', '#2e2a1c');
    grain(g, rand, 12);
  };
export const CORRIDOR_PICS: Paint[] = Array.from({ length: CORRIDOR_FLOORS }, (_, v) => corridorFloor(v));

// the floor of a kind of room: variant 0 plain, 1 with a mark of wear (a path worn through the middle, or a stain)
const roomFloor =
  (st: Style, variant: number): Paint =>
  (g, rand) => {
    g.fillStyle = st.base;
    g.fillRect(0, 0, TEX, TEX);
    if (st.how === 'tiles' || st.how === 'terrazzo') {
      const n = st.how === 'tiles' ? 6 : 4,
        s = TEX / n;
      // (the tiles are laid with the joints half a tile in from the edge, and painted over it to the other side)
      for (let a = 0; a <= n; a++)
        for (let b = 0; b <= n; b++) {
          const t = rand();
          g.fillStyle = st.how === 'terrazzo' && (a + b) % 2 ? st.alt + '55' : 'rgba(0,0,0,0)';
          g.fillRect((a - 0.5) * s, (b - 0.5) * s, s, s);
          g.fillStyle = t < 0.5 ? `rgba(255,250,230,${t * 0.12})` : `rgba(24,26,18,${(t - 0.5) * 0.14})`;
          g.fillRect((a - 0.5) * s, (b - 0.5) * s, s, s);
        }
      g.fillStyle = st.alt + '88';
      for (let k = 0; k < n; k++) {
        g.fillRect((k + 0.5) * s - 0.6, 0, 1.2, TEX);
        g.fillRect(0, (k + 0.5) * s - 0.6, TEX, 1.2);
      }
      if (st.how === 'terrazzo')
        for (let k = 0; k < 260; k++) {
          g.fillStyle = rand() < 0.5 ? 'rgba(250,244,220,.3)' : 'rgba(80,70,50,.22)';
          g.fillRect(rand() * TEX, rand() * TEX, 1 + rand() * 2, 1 + rand());
        }
    } else if (st.how === 'concrete') {
      for (let k = 0; k < 1200; k++) {
        g.fillStyle = rand() < 0.5 ? 'rgba(10,14,12,.2)' : st.alt + '66';
        g.fillRect(rand() * TEX, rand() * TEX, 1 + rand() * 2, 1);
      }
      g.fillStyle = 'rgba(14,16,14,.5)';
      g.fillRect(TEX / 2 - 1, 0, 2, TEX);
      g.fillRect(0, TEX / 2 - 1, TEX, 2);
    } else {
      flecks(g, rand, st.alt);
      seam(g, st.alt);
    }
    stains(g, rand, 22);
    if (variant === 1) {
      smudge(g, TEX / 2, TEX / 2, 46, 26, st.how === 'concrete' ? '20,20,16' : '236,230,206', 0.22);
      g.fillStyle = 'rgba(20,24,16,.26)';
      oval(g, TEX * 0.62, TEX * 0.4, 9, 6);
      g.fillStyle = 'rgba(20,24,16,.18)';
      oval(g, TEX * 0.4, TEX * 0.64, 14, 8);
    }
    grime(g, rand, 22, '#a9a98c', '#20241a');
    grain(g, rand, 12);
  };
// the pictures, kind by kind: [plain, worn] for each
export const ROOM_FLOOR_PICS: Paint[] = STYLES.flatMap(st => [roomFloor(st, 0), roomFloor(st, 1)]);

// The operating theatre's floor (Look.roomFloors.hall): pale blue-green linoleum with welded seams and a conductive strip
// at the edge of every sheet; variants 1 to 3 have a mark of use: a trolley's wheel track, a stain scrubbed pale, a
// pattern of scrapes
const theatreFloor =
  (variant: number): Paint =>
  (g, rand) => {
    g.fillStyle = THEATRE.base;
    g.fillRect(0, 0, TEX, TEX);
    flecks(g, rand, THEATRE.alt);
    stains(g, rand, 16);
    seam(g, THEATRE.alt);
    g.fillStyle = 'rgba(30,50,48,.22)';
    for (let n = 0; n < SHEETS; n++) {
      const p = (n + 0.5) * (TEX / SHEETS);
      g.fillRect(p - 3, 0, 1, TEX);
      g.fillRect(p + 2, 0, 1, TEX);
    }
    if (variant === 1) {
      g.lineCap = 'round';
      for (const [sx, sy, ex, ey, bend] of [
        [30, 60, 226, 84, 24],
        [34, 72, 230, 96, 26],
      ] as const) {
        g.strokeStyle = 'rgba(30,44,42,.2)';
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(sx, sy);
        g.quadraticCurveTo((sx + ex) / 2, (sy + ey) / 2 + bend, ex, ey);
        g.stroke();
      }
    } else if (variant === 2) {
      smudge(g, TEX * 0.4, TEX * 0.6, 40, 28, '236,244,240', 0.34);
      smudge(g, TEX * 0.46, TEX * 0.64, 18, 12, '40,64,60', 0.2);
    } else if (variant === 3) {
      for (let k = 0; k < 14; k++) {
        g.strokeStyle = 'rgba(26,40,38,.22)';
        g.lineWidth = 0.9;
        const x = 40 + rand() * 170,
          y = 40 + rand() * 170;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (rand() - 0.5) * 50, y + (rand() - 0.5) * 24);
        g.stroke();
      }
    }
    grime(g, rand, 20, '#bcd2cc', '#1c2624');
    grain(g, rand, 10);
  };
export const THEATRE_PICS: Paint[] = [0, 1, 2, 3].map(theatreFloor);
