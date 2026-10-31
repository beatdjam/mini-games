import { HOSP_IN_SURGERY, HOSP_SURGERY } from '../../../i18n/signs.ts';
import { DOOR_ASPECT, SIGN_FONT, TEX, grain, grime, oval, rowOf, smudge, words } from '../paint.ts';
import type { Paint } from '../paint.ts';
import { HAZARD_BLACK, HAZARD_YELLOW, PLATE_WHITE, STEEL, STEEL_DARK, TEAL_TILE, box, glow } from './shared.ts';
import { dot } from './kit.ts';
import type { G } from './kit.ts';
// The operating theatre (the boss room): pale blue-green tiles up to a painted wall, an observation window with the
// control room dark behind it, the scrub sink, a wall of gas outlets and monitors, light boxes, glass instrument
// cabinets; above the wall, painted sheet with a row of clerestory windows that let in the last of the sun. The
// ceiling is a clean-room ceiling of panels. All of it is painted whole: nothing of the corridors' wall is under it.
// ---- tuning numbers used only here ----
const TILE_TOP = 3.3; // m: the tiles go up to here, the paint above
const TILE_W = 20; // px across one tile of the wall (about 30 cm)
const TILE_H = 14; // ... and down
const GROUT = 'rgba(40,66,64,.5)';
const PAINT_UPPER = '#bfd6cf';
const CEILING_PANELS = 3; // panels across one ceiling picture
const GAS = ['#5aa874', '#d8c452', '#d8d6cb', '#6b95c6'];
const CLEAR_ROWS = 3; // clerestory windows: rows of panes in one

// the wall every picture is painted on: tiles in pale blue-green with their grout and the odd one gone or cracked, the
// dirt of years under the ceiling's edge and a rubber cove at the foot, a stainless trim along the top of the tiles
function tileWall(g: G, rand: () => number) {
  const top = rowOf(TILE_TOP),
    foot = rowOf(0.2);
  g.fillStyle = PAINT_UPPER;
  g.fillRect(0, 0, TEX, top);
  const up = g.createLinearGradient(0, 0, 0, top);
  up.addColorStop(0, 'rgba(60,84,78,.3)');
  up.addColorStop(1, 'rgba(60,84,78,0)');
  g.fillStyle = up;
  g.fillRect(0, 0, TEX, top);
  g.fillStyle = TEAL_TILE;
  g.fillRect(0, top, TEX, foot - top);
  for (let y = top; y < foot; y += TILE_H) {
    const lit = (y - top) / (foot - top);
    for (let x = 0; x < TEX; x += TILE_W) {
      const t = rand();
      g.fillStyle = t < 0.5 ? `rgba(255,252,236,${t * 0.12})` : `rgba(30,50,48,${(t - 0.5) * 0.14 + lit * 0.04})`;
      g.fillRect(x, y, TILE_W, TILE_H);
    }
  }
  g.fillStyle = GROUT;
  for (let y = top; y < foot; y += TILE_H) g.fillRect(0, y, TEX, 1);
  for (let x = 0; x < TEX; x += TILE_W) g.fillRect(x, top, 1, foot - top);
  // a tile gone, and one cracked
  for (let k = 0; k < 2; k++) {
    const x = Math.floor(rand() * (TEX / TILE_W)) * TILE_W,
      y = top + Math.floor(rand() * ((foot - top) / TILE_H)) * TILE_H;
    g.fillStyle = k ? '#7e9a92' : '#9bab9d';
    g.fillRect(x + 1, y + 1, TILE_W - 1, TILE_H - 1);
    if (k) {
      g.strokeStyle = 'rgba(20,34,32,.6)';
      g.beginPath();
      g.moveTo(x + 1, y + 1);
      g.lineTo(x + TILE_W * 0.6, y + TILE_H * 0.5);
      g.lineTo(x + TILE_W, y + TILE_H);
      g.stroke();
    }
  }
  grime(g, rand, 70, '#c6dcd4', '#26322e');
  g.fillStyle = STEEL;
  g.fillRect(0, top - 2, TEX, 4);
  g.fillStyle = 'rgba(255,255,255,.35)';
  g.fillRect(0, top - 2, TEX, 1);
  g.fillStyle = '#566660';
  g.fillRect(0, foot, TEX, TEX - foot);
  g.fillStyle = 'rgba(255,255,255,.12)';
  g.fillRect(0, foot, TEX, 1);
  for (let k = 0; k < 3; k++) {
    const len = 40 + rand() * 90,
      st = g.createLinearGradient(0, 0, 0, len);
    st.addColorStop(0, 'rgba(70,64,40,.3)');
    st.addColorStop(1, 'rgba(70,64,40,0)');
    g.fillStyle = st;
    g.fillRect(rand() * TEX, 0, 3 + rand() * 8, len);
  }
}
const plainWall: Paint = (g, rand) => tileWall(g, rand);
// the observation window: a wide opening over a ledge, the glass dark, the control room behind it a few shapes (a chair,
// two monitors out, the shine of a lamp left on)
const observation: Paint = (g, rand) => {
  tileWall(g, rand);
  const x = 26,
    w = TEX - 52,
    y = rowOf(3.5),
    foot = rowOf(1.55);
  box(g, x - 6, y - 5, w + 12, foot - y + 10, STEEL_DARK);
  g.fillStyle = '#16211f';
  g.fillRect(x, y, w, foot - y);
  g.save();
  g.beginPath();
  g.rect(x, y, w, foot - y);
  g.clip();
  g.fillStyle = 'rgba(38,52,50,.9)';
  g.fillRect(x + 20, y + (foot - y) * 0.55, 70, foot - y);
  g.fillRect(x + 110, y + (foot - y) * 0.5, 60, foot - y);
  g.fillStyle = 'rgba(120,150,140,.3)'; // two monitors, off
  g.fillRect(x + 30, y + (foot - y) * 0.3, 22, 16);
  g.fillRect(x + 60, y + (foot - y) * 0.3, 22, 16);
  g.fillStyle = 'rgba(240,180,100,.5)'; // a lamp left on in the booth
  dot(g, x + w - 24, y + 14, 4);
  glow(g, x + w - 24, y + 14, 40, 0.3);
  g.fillStyle = 'rgba(190,214,208,.1)';
  g.beginPath();
  g.moveTo(x + 20, y);
  g.lineTo(x + 110, y);
  g.lineTo(x + 70, foot);
  g.lineTo(x, foot);
  g.fill();
  g.restore();
  g.fillStyle = STEEL_DARK; // the mullion
  g.fillRect(x + w / 2 - 2, y, 4, foot - y);
  box(g, x - 10, foot + 4, w + 20, 6, STEEL);
  smudge(g, 60 + rand() * 120, rowOf(1.2), 60, 14, '20,30,28', 0.2);
};
// the scrub sink: a long stainless trough under three arched taps, the splashback of steel over it, a soap dispenser and a
// clock with a second hand on the tiles, the foot pedals underneath
const scrubSink: Paint = (g, rand) => {
  tileWall(g, rand);
  const x = 40,
    w = TEX - 80;
  const back = g.createLinearGradient(x, 0, x + w, 0);
  back.addColorStop(0, '#9ea6a2');
  back.addColorStop(0.5, '#b4bbb7');
  back.addColorStop(1, '#939b97');
  g.fillStyle = back;
  g.fillRect(x, rowOf(3.1), w, rowOf(1.5) - rowOf(3.1));
  g.fillStyle = 'rgba(255,255,255,.18)';
  g.fillRect(x + 6, rowOf(3.1), 14, rowOf(1.5) - rowOf(3.1));
  g.strokeStyle = STEEL_DARK;
  g.lineWidth = 3;
  g.lineCap = 'round';
  for (const tx of [x + w * 0.2, x + w * 0.5, x + w * 0.8]) {
    g.beginPath();
    g.moveTo(tx, rowOf(1.6));
    g.lineTo(tx, rowOf(2.2));
    g.quadraticCurveTo(tx, rowOf(2.4), tx + 12, rowOf(2.4));
    g.lineTo(tx + 12, rowOf(2.2));
    g.stroke();
  }
  g.lineCap = 'butt';
  box(g, x - 4, rowOf(1.5), w + 8, rowOf(1.1) - rowOf(1.5), STEEL);
  g.fillStyle = '#6e7874';
  g.fillRect(x + 2, rowOf(1.5) + 3, w - 4, 6);
  box(g, x, rowOf(1.1), w, rowOf(0.25) - rowOf(1.1), STEEL_DARK);
  g.fillStyle = STEEL;
  for (const px of [x + w * 0.2, x + w * 0.5, x + w * 0.8]) g.fillRect(px - 6, rowOf(0.32), 12, 4);
  box(g, x + w + 8, rowOf(2.4), 10, 20, PLATE_WHITE);
  g.fillStyle = PLATE_WHITE; // the clock, stopped
  dot(g, TEX / 2, rowOf(3.55), 11);
  g.strokeStyle = '#263031';
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(TEX / 2, rowOf(3.55));
  g.lineTo(TEX / 2 + 4, rowOf(3.55) - 4);
  g.moveTo(TEX / 2, rowOf(3.55));
  g.lineTo(TEX / 2 - 6, rowOf(3.55) - 1);
  g.stroke();
  smudge(g, 90 + rand() * 80, rowOf(0.5), 60, 8, '20,30,28', 0.2);
};
// a wall of gas outlets and monitors: the medical gas outlets in a steel rail, colour-coded, a pressure dial over each, two wall monitors
// (dark), a whiteboard with the day's count wiped nearly clean
const gasWall: Paint = (g, rand) => {
  tileWall(g, rand);
  box(g, 28, rowOf(1.9), 200, rowOf(1.4) - rowOf(1.9), STEEL);
  for (let n = 0; n < 8; n++) {
    const px = 44 + n * 24;
    g.fillStyle = GAS[n % GAS.length]!;
    dot(g, px, rowOf(1.65), 5);
    g.fillStyle = 'rgba(0,0,0,.5)';
    dot(g, px, rowOf(1.65), 2);
    g.fillStyle = PLATE_WHITE;
    dot(g, px, rowOf(2.3), 6);
    g.strokeStyle = '#263031';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(px, rowOf(2.3));
    g.lineTo(px + 3, rowOf(2.3) - 3);
    g.stroke();
  }
  for (const mx of [40, 134]) {
    box(g, mx, rowOf(3.2), 78, rowOf(2.55) - rowOf(3.2), '#1c2625');
    g.fillStyle = '#0d1313';
    g.fillRect(mx + 4, rowOf(3.15), 70, rowOf(2.6) - rowOf(3.15));
    g.fillStyle = 'rgba(190,210,204,.1)';
    g.fillRect(mx + 4, rowOf(3.15), 22, rowOf(2.6) - rowOf(3.15));
  }
};
// light boxes on the tiles, one still lit, a film on it, and a counter with drawers under them
const viewers: Paint = (g, rand) => {
  tileWall(g, rand);
  for (const [x, lit] of [
    [20, false],
    [92, true],
    [164, false],
  ] as const) {
    box(g, x - 3, rowOf(3.2) - 3, 72, rowOf(2.0) - rowOf(3.2) + 6, '#46514d');
    g.fillStyle = lit ? '#eef0d8' : '#2a3431';
    g.fillRect(x, rowOf(3.2), 66, rowOf(2.0) - rowOf(3.2));
    if (lit) {
      g.fillStyle = '#18262a';
      g.fillRect(x + 8, rowOf(3.1), 50, rowOf(2.1) - rowOf(3.1));
      g.strokeStyle = 'rgba(206,222,224,.5)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(x + 33, rowOf(3.05));
      g.lineTo(x + 33, rowOf(2.15));
      g.stroke();
      glow(g, x + 33, rowOf(2.6), 90, 0.14);
    }
  }
  box(g, 14, rowOf(1.1), 228, 8, '#8c9690');
  box(g, 18, rowOf(1.1) + 8, 220, rowOf(0.2) - rowOf(1.1) - 8, '#a5b0aa');
  g.fillStyle = 'rgba(30,44,40,.35)';
  for (let x = 18; x < 238; x += 55) g.fillRect(x, rowOf(1.1) + 8, 1.4, rowOf(0.2) - rowOf(1.1) - 8);
  g.fillStyle = STEEL_DARK;
  for (let x = 40; x < 238; x += 55) g.fillRect(x, rowOf(0.8), 14, 2.4);
};
// two tall glass-fronted cabinets of instruments: steel trays on the shelves, the glass a little cloudy
const cabinets: Paint = (g, rand) => {
  tileWall(g, rand);
  for (const x of [30, 134]) {
    const w = 92,
      top = rowOf(3.2),
      foot = rowOf(0.2);
    box(g, x - 4, top - 4, w + 8, foot - top + 4, STEEL);
    g.fillStyle = '#1b2725';
    g.fillRect(x, top, w, foot - top);
    for (let sh = 0; sh < 5; sh++) {
      const by = top + ((foot - top) / 5) * (sh + 1);
      g.fillStyle = '#7d8885';
      g.fillRect(x + 2, by - 3, w - 4, 3);
      for (let tx = x + 8; tx < x + w - 14; tx += 18 + rand() * 8) {
        g.fillStyle = STEEL;
        g.fillRect(tx, by - 9 - rand() * 4, 14, 6);
        g.fillStyle = 'rgba(255,255,255,.4)';
        g.fillRect(tx, by - 9, 14, 1);
      }
    }
    g.fillStyle = 'rgba(190,214,208,.1)';
    g.beginPath();
    g.moveTo(x, top);
    g.lineTo(x + 36, top);
    g.lineTo(x + 8, foot);
    g.lineTo(x, foot);
    g.fill();
    g.fillStyle = STEEL_DARK;
    g.fillRect(x + w / 2 - 1, top, 2, foot - top);
  }
};
// the wall pictures of the theatre; `HALL_WALL_MAP` is how often each one comes up (the plain tiles the most)
export const THEATRE_WALL_PICS: Paint[] = [plainWall, observation, scrubSink, gasWall, viewers, cabinets];
export const THEATRE_WALL_MAP = [0, 0, 0, 0, 1, 1, 2, 3, 3, 4, 5];

// ---- the wall above the usual height (a tile wide, as high as the boss room goes above the usual wall) ----
// painted sheet in the same green, a trunking along the foot of it, and two clerestory windows high up with the evening in
// them: it runs on from the picture of the wall under it
export const theatreUpper: Paint = (g, rand) => {
  g.fillStyle = PAINT_UPPER;
  g.fillRect(0, 0, TEX, TEX);
  const shade = g.createLinearGradient(0, 0, 0, TEX);
  shade.addColorStop(0, 'rgba(60,84,78,.3)');
  shade.addColorStop(0.4, 'rgba(60,84,78,0)');
  shade.addColorStop(1, 'rgba(60,84,78,.18)');
  g.fillStyle = shade;
  g.fillRect(0, 0, TEX, TEX);
  for (let y = 0; y < TEX; y += 32) {
    g.fillStyle = 'rgba(40,60,56,.16)';
    g.fillRect(0, y, TEX, 1);
  }
  // the clerestory: a window of rows of panes with the sunset in it, framed in steel, near the middle of the height
  const wy = TEX * 0.3,
    wh = TEX * 0.3;
  for (const wx of [24, 140]) {
    const ww = 92;
    glow(g, wx + ww / 2, wy + wh / 2, 120, 0.12);
    box(g, wx - 4, wy - 4, ww + 8, wh + 8, STEEL_DARK);
    const sky = g.createLinearGradient(0, wy, 0, wy + wh);
    sky.addColorStop(0, '#4f7b88');
    sky.addColorStop(0.6, '#d4b484');
    sky.addColorStop(1, '#efc080');
    g.fillStyle = sky;
    g.fillRect(wx, wy, ww, wh);
    g.fillStyle = STEEL_DARK;
    for (let r = 1; r < CLEAR_ROWS; r++) g.fillRect(wx, wy + (wh / CLEAR_ROWS) * r - 1, ww, 3);
    for (let c = 1; c < 3; c++) g.fillRect(wx + (ww / 3) * c - 1.5, wy, 3, wh);
    g.fillStyle = 'rgba(244,190,110,.18)';
    g.fillRect(wx, wy, ww, wh);
  }
  // a ventilation grille and a duct trunking at the foot of the picture
  box(g, 100, TEX * 0.72, 56, TEX * 0.1, STEEL);
  g.fillStyle = 'rgba(20,30,28,.5)';
  for (let ly = TEX * 0.72 + 4; ly < TEX * 0.82 - 3; ly += 4) g.fillRect(104, ly, 48, 1.6);
  g.fillStyle = '#6f7d78';
  g.fillRect(0, TEX * 0.9, TEX, TEX * 0.06);
  g.fillStyle = 'rgba(255,255,255,.2)';
  g.fillRect(0, TEX * 0.9, TEX, 2);
  for (let k = 0; k < 6; k++) {
    const len = 30 + rand() * 120,
      st = g.createLinearGradient(0, 0, 0, len);
    st.addColorStop(0, 'rgba(80,66,40,.28)');
    st.addColorStop(1, 'rgba(80,66,40,0)');
    g.fillStyle = st;
    g.fillRect(rand() * TEX, 0, 3 + rand() * 8, len);
  }
  grime(g, rand, 60, '#cfe0da', '#26322e');
  grain(g, rand, 10);
};

// ---- the ceiling: clean-room panels ----
// pale panels (a third of a tile across) in a grid of narrow bars, a dead troffer in each of two panels, a smoke
// detector: the bars run on from tile to tile
export const theatreCeiling: Paint = (g, rand) => {
  const s = TEX / CEILING_PANELS;
  g.fillStyle = '#a9bfb9';
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 40, '#bcd0ca', '#7d918b');
  for (let p = 0; p <= CEILING_PANELS; p++) {
    g.fillStyle = 'rgba(214,226,222,.4)';
    g.fillRect(p * s - 1, 0, 2, TEX);
    g.fillRect(0, p * s - 1, TEX, 2);
  }
  for (const [a, b] of [
    [0, 1],
    [2, 2],
  ] as const) {
    g.fillStyle = '#7e918b';
    g.fillRect(a * s + 8, b * s + 14, s - 16, s - 28);
    g.fillStyle = '#4b5b57';
    g.fillRect(a * s + 11, b * s + 17, s - 22, s - 34);
    g.fillStyle = 'rgba(190,214,208,.1)';
    g.fillRect(a * s + 11, b * s + 17, (s - 22) * 0.4, s - 34);
  }
  g.fillStyle = '#d8dad0';
  oval(g, s * 1.5, s * 0.5, 5, 5);
  smudge(g, rand() * TEX, rand() * TEX, 30, 24, '96,86,60', 0.16);
  grain(g, rand, 10);
};

// ---- the doors ----
const LAMP_RED = '#ff5b46';
// One leaf of a door (a leaf is 2 m wide and a wall high, so its picture is stretched three times as tall). The hospital's
// door is a pale flush leaf with a vertical handle and a porthole of wired glass, a kick plate at its foot. The operating
// theatre's (boss) is the swing door of the theatre: pale blue-green with a big round porthole, a steel kick plate, the
// "operation in progress" lamp lit red over it with its light on the leaf round it, and the room's name on a plate
// below the height of the door's "BOSS" label (world/doors.ts BOSS_LABEL_Y), like the lamp
export const hospDoor =
  (boss: boolean): Paint =>
  (g, rand) => {
    if (boss) {
      const leaf = g.createLinearGradient(0, 0, TEX, 0);
      leaf.addColorStop(0, '#8fb7b0');
      leaf.addColorStop(0.5, '#a1c7c0');
      leaf.addColorStop(1, '#86aea8');
      g.fillStyle = leaf;
      g.fillRect(0, 0, TEX, TEX);
      grime(g, rand, 70, '#c3dcd6', '#26342f');
      g.fillStyle = STEEL_DARK;
      g.fillRect(0, 0, 12, TEX);
      g.fillRect(TEX - 12, 0, 12, TEX);
      // the porthole
      const px = TEX / 2,
        py = rowOf(3.9);
      g.fillStyle = STEEL_DARK;
      oval(g, px, py, 50, 50 * DOOR_ASPECT);
      g.fillStyle = '#16211f';
      oval(g, px, py, 42, 42 * DOOR_ASPECT);
      g.fillStyle = 'rgba(190,214,208,.12)';
      oval(g, px - 10, py - 6, 22, 22 * DOOR_ASPECT);
      // the stripes of yellow and black at the foot, the kick plate over them
      g.fillStyle = HAZARD_BLACK;
      g.fillRect(12, rowOf(0.5), TEX - 24, rowOf(0.15) - rowOf(0.5));
      g.fillStyle = HAZARD_YELLOW;
      for (let sx = 12; sx < TEX - 12; sx += 26) {
        g.beginPath();
        g.moveTo(sx, rowOf(0.15));
        g.lineTo(sx + 12, rowOf(0.15));
        g.lineTo(sx + 26, rowOf(0.5));
        g.lineTo(sx + 14, rowOf(0.5));
        g.fill();
      }
      g.fillStyle = STEEL;
      g.fillRect(12, rowOf(1.1), TEX - 24, rowOf(0.5) - rowOf(1.1));
      g.fillStyle = 'rgba(255,255,255,.3)';
      g.fillRect(12, rowOf(1.1), TEX - 24, 2);
      // the lamp over the door, lit, and its light on the leaf
      const lx = TEX / 2,
        ly = rowOf(4.9);
      g.globalCompositeOperation = 'lighter';
      g.save();
      g.translate(lx, ly);
      g.scale(1, DOOR_ASPECT);
      const halo = g.createRadialGradient(0, 0, 4, 0, 0, 64);
      halo.addColorStop(0, 'rgba(255,70,50,.5)');
      halo.addColorStop(1, 'rgba(255,70,50,0)');
      g.fillStyle = halo;
      g.fillRect(-64, -64, 128, 128);
      g.restore();
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#251b19';
      g.fillRect(lx - 52, ly - 16 * DOOR_ASPECT * 1.2, 104, 32 * DOOR_ASPECT * 1.2);
      g.fillStyle = LAMP_RED;
      g.fillRect(lx - 47, ly - 12 * DOOR_ASPECT * 1.2, 94, 24 * DOOR_ASPECT * 1.2);
      g.fillStyle = '#fff1e6';
      words(g, HOSP_IN_SURGERY, lx, ly + 1, 24, DOOR_ASPECT, SIGN_FONT, 86);
      // the plate with the room's name, below the label
      const top = rowOf(2.8),
        foot = rowOf(1.5);
      g.fillStyle = '#2c4f48';
      g.fillRect((TEX - 140) / 2, top, 140, foot - top);
      g.strokeStyle = PLATE_WHITE;
      g.lineWidth = 3;
      g.strokeRect((TEX - 140) / 2 + 4, top + 3, 132, foot - top - 6);
      g.fillStyle = PLATE_WHITE;
      words(g, HOSP_SURGERY, TEX / 2, (top + foot) / 2 + 1, 38, DOOR_ASPECT, SIGN_FONT, 112);
      const dirt = g.createLinearGradient(0, 0, 0, TEX * 0.25);
      dirt.addColorStop(0, 'rgba(10,14,12,.5)');
      dirt.addColorStop(1, 'rgba(10,14,12,0)');
      g.fillStyle = dirt;
      g.fillRect(0, 0, TEX, TEX * 0.25);
    } else {
      // an ordinary door: a pale leaf with a wired-glass porthole and a long handle, a kick plate
      const leaf = g.createLinearGradient(0, 0, TEX, 0);
      leaf.addColorStop(0, '#8e937f');
      leaf.addColorStop(0.5, '#989d88');
      leaf.addColorStop(1, '#878c78');
      g.fillStyle = leaf;
      g.fillRect(0, 0, TEX, TEX);
      g.fillStyle = STEEL_DARK;
      g.fillRect(0, 0, 10, TEX);
      g.fillRect(TEX - 10, 0, 10, TEX);
      g.fillRect(0, 0, TEX, 8);
      const gx = 62,
        gw = TEX - 124,
        gy = rowOf(3.5),
        gh = rowOf(2.2) - gy;
      g.fillStyle = STEEL_DARK;
      g.fillRect(gx - 5, gy - 4, gw + 10, gh + 8);
      g.fillStyle = '#7d928b';
      g.fillRect(gx, gy, gw, gh);
      g.strokeStyle = 'rgba(40,56,50,.5)'; // the wire in the glass
      g.lineWidth = 0.9;
      for (let wx = gx; wx <= gx + gw; wx += 10) {
        g.beginPath();
        g.moveTo(wx, gy);
        g.lineTo(wx, gy + gh);
        g.stroke();
      }
      for (let wy = gy; wy <= gy + gh; wy += 8) {
        g.beginPath();
        g.moveTo(gx, wy);
        g.lineTo(gx + gw, wy);
        g.stroke();
      }
      g.fillStyle = 'rgba(230,240,236,.16)';
      g.beginPath();
      g.moveTo(gx, gy);
      g.lineTo(gx + gw * 0.5, gy);
      g.lineTo(gx + gw * 0.15, gy + gh);
      g.lineTo(gx, gy + gh);
      g.fill();
      g.fillStyle = STEEL;
      g.fillRect(TEX - 40, rowOf(2.0), 8, rowOf(0.9) - rowOf(2.0));
      g.fillRect(10, rowOf(0.55), TEX - 20, rowOf(0.12) - rowOf(0.55));
      g.fillStyle = 'rgba(255,255,255,.3)';
      g.fillRect(10, rowOf(0.55), TEX - 20, 1.6);
      grime(g, rand, 50, '#9aa092', '#20241c');
    }
    grain(g, rand, 14);
  };
