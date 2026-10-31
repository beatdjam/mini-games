import { PAINT, css } from '../../../data/colors.ts';
import { CITY_EXIT, CITY_GUIDE, CITY_HALL_RECEPTION, CITY_HALL_TENANT_FLOORS } from '../../../i18n/signs.ts';
import { TEX, WALL_ASPECT, grain, grime, oval, rowOf, smudge, words } from '../paint.ts';
import type { Paint } from '../paint.ts';
// The pictures of the old downtown's boss room: the double-height entrance lobby of the office building. Marble at the
// foot of the walls and a brass rail, a directory of the building's floors, a row of lift doors, the glass curtain wall
// with the evening sky behind it, and a fire exit with its emergency lamp. The lamps of the lobby are out: only the low
// sun through the glass and the emergency lamp's amber light are there. Its walls go on up to a gallery with a glass
// balustrade and the offices behind it, and its ceiling is a coffered one with a big dead fitting. The floor is polished
// marble, with the glass of the curtain wall scattered over it here and there. The walls are numbered after the
// sector's own (pictures.ts CITY_WALL_PICS; they come last): they are drawn whole.
// ---- tuning numbers used only here ----
const PLINTH_TOP = 1.35; // the top of the marble wainscot (m)
const BOX = { foot: 1.5, top: 4.25, inset: 20 }; // the directory board (m, m, px from the picture's side)
const LIFT = { w: 96, gap: 16, top: 2.45, foot: 0.06 }; // a lift door (px, px, m, m)
const CURTAIN = { side: 8, top: 4.9, foot: 0.08, transom: 2.8 }; // the curtain wall (px, m, m, m)
const DOOR = { x: 76, w: 104, top: 2.35, foot: 0.03 }; // the fire exit (px, px, m, m)
const SEAM = TEX / 4; // the marble floor's joints: a quarter of a tile in from its edge, so none is on that edge
const GALLERY = 0.82; // the gallery's floor slab along the foot of the upper wall
const FLOOR_LIGHT = '#8d8676';
const FLOOR_DARK = '#5b564b';
const FRAME = '#4b4d49';
const STEEL = ['#737a75', '#848b85', '#6c736e'];
const DUSK = ['#5f5a60', '#8a7566', '#bd8a61'];
const ROOFS = ['#3b3230', '#584a41'];
const GLASS_SHADE = 'rgba(20,26,28,.4)';
const EMERGENCY = '#ffb060';
const LAMP_DEAD = '#3c3a35';
const BRASS = css(PAINT.brass1);
const EXIT_GREEN = css(PAINT.green1);

// a soft patch of light over a spot, laid on the picture (the sun through the glass, the emergency lamp)
function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.translate(x, y);
  g.scale(1, WALL_ASPECT);
  const fade = g.createRadialGradient(0, 0, 0, 0, 0, r);
  fade.addColorStop(0, `rgba(${color},${a})`);
  fade.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = fade;
  g.fillRect(-r, -r, r * 2, r * 2);
  g.restore();
}
// the veins of a cut stone, run in a wavy line across a part of the picture
function veins(g: CanvasRenderingContext2D, rand: () => number, x: number, y: number, w: number, h: number, n: number) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  for (let k = 0; k < n; k++) {
    g.strokeStyle = rand() < 0.5 ? 'rgba(236,226,204,.22)' : 'rgba(52,46,38,.28)';
    g.lineWidth = 0.6 + rand() * 1.2;
    let vx = x + rand() * w,
      vy = y;
    g.beginPath();
    g.moveTo(vx, vy);
    while (vy < y + h) {
      vx += (rand() - 0.5) * 24;
      vy += 4 + rand() * 12;
      g.lineTo(vx, vy);
    }
    g.stroke();
  }
  g.restore();
}
// the wall every picture is painted on: big stone slabs, the dirt of years, and the low light of the street coming in
// at the foot (the lobby's own lamps are out)
function stoneWall(g: CanvasRenderingContext2D, rand: () => number) {
  const bg = g.createLinearGradient(0, 0, 0, TEX);
  bg.addColorStop(0, '#4a463d');
  bg.addColorStop(0.55, '#5c564a');
  bg.addColorStop(1, '#6a6254');
  g.fillStyle = bg;
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 90, '#7d7664', '#24211c');
  // the joints of the stone facing: two courses, and a joint down the middle of the lower one
  g.fillStyle = 'rgba(26,22,17,.42)';
  for (const y of [rowOf(4.2), rowOf(2.4)]) g.fillRect(0, y, TEX, 1.5);
  g.fillRect(TEX / 2 - 0.75, rowOf(2.4), 1.5, TEX - rowOf(2.4));
  g.fillStyle = 'rgba(238,228,204,.12)';
  for (const y of [rowOf(4.2), rowOf(2.4)]) g.fillRect(0, y + 1.5, TEX, 1);
  g.fillStyle = 'rgba(34,28,22,.35)';
  g.fillRect(TEX / 2 - 0.6, 0, 1.2, rowOf(4.2));
  // water running down from the ceiling
  for (let k = 0; k < 6; k++) {
    const len = 30 + rand() * 120,
      st = g.createLinearGradient(0, 0, 0, len);
    st.addColorStop(0, 'rgba(24,20,16,.35)');
    st.addColorStop(1, 'rgba(24,20,16,0)');
    g.fillStyle = st;
    g.fillRect(rand() * TEX, 0, 2 + rand() * 7, len);
  }
  // the last of the sun lies along the foot, the same all the way across, so it does not show as a patch
  const sun = g.createLinearGradient(0, rowOf(1.8), 0, TEX);
  sun.addColorStop(0, 'rgba(255,176,90,0)');
  sun.addColorStop(0.65, 'rgba(255,176,90,.1)');
  sun.addColorStop(1, 'rgba(255,176,90,.04)');
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = sun;
  g.fillRect(0, rowOf(1.8), TEX, TEX - rowOf(1.8));
  g.globalCompositeOperation = 'source-over';
}
// the shade at the foot, the shade at the top, and the grain
function hallShade(g: CanvasRenderingContext2D, rand: () => number) {
  const foot = g.createLinearGradient(0, TEX * 0.82, 0, TEX);
  foot.addColorStop(0, 'rgba(8,6,5,0)');
  foot.addColorStop(1, 'rgba(8,6,5,.55)');
  g.fillStyle = foot;
  g.fillRect(0, TEX * 0.82, TEX, TEX * 0.18);
  const top = g.createLinearGradient(0, 0, 0, TEX * 0.18);
  top.addColorStop(0, 'rgba(6,4,4,.38)');
  top.addColorStop(1, 'rgba(6,4,4,0)');
  g.fillStyle = top;
  g.fillRect(0, 0, TEX, TEX * 0.18);
  grain(g, rand, 16);
}

// ---- marble at the foot of the wall, and the reception ----
const wainscot: Paint = (g, rand) => {
  stoneWall(g, rand);
  const top = rowOf(PLINTH_TOP);
  const marble = g.createLinearGradient(0, top, 0, TEX);
  marble.addColorStop(0, '#6d6758');
  marble.addColorStop(0.45, '#565144');
  marble.addColorStop(1, '#3e392f');
  g.fillStyle = marble;
  g.fillRect(0, top, TEX, TEX - top);
  // the panels of the wainscot, their veins, and the brass rail over them
  for (let c = 0; c < 3; c++) {
    const x = (c * TEX) / 3,
      w = TEX / 3;
    veins(g, rand, x, top, w, TEX - top, 3);
    g.fillStyle = 'rgba(20,17,13,.5)';
    g.fillRect(x, top, 1.5, TEX - top);
    g.fillStyle = 'rgba(245,236,216,.16)';
    g.fillRect(x + 1.5, top, 1, TEX - top);
  }
  g.fillStyle = BRASS;
  g.fillRect(0, top - 1, TEX, 3);
  g.fillStyle = 'rgba(255,242,210,.4)';
  g.fillRect(0, top - 1, TEX, 1);
  // the sheen the polish catches
  const sheen = g.createLinearGradient(0, top, TEX, TEX);
  sheen.addColorStop(0.25, 'rgba(255,236,200,0)');
  sheen.addColorStop(0.48, 'rgba(255,236,200,.1)');
  sheen.addColorStop(0.7, 'rgba(255,236,200,0)');
  g.fillStyle = sheen;
  g.fillRect(0, top, TEX, TEX - top);
  // the plate by the reception desk: dark bronze with brass letters
  const px = TEX / 2 - 40,
    py = rowOf(2.15),
    pw = 80,
    ph = rowOf(1.8) - py;
  g.fillStyle = 'rgba(10,8,6,.5)';
  g.fillRect(px + 2, py + 2, pw, ph);
  g.fillStyle = css(PAINT.soot5);
  g.fillRect(px, py, pw, ph);
  g.strokeStyle = BRASS;
  g.lineWidth = 1.5;
  g.strokeRect(px + 3, py + 3, pw - 6, ph - 6);
  g.fillStyle = css(PAINT.amber2);
  words(g, CITY_HALL_RECEPTION, TEX / 2, py + ph / 2 + 0.5, 15, WALL_ASPECT, undefined, pw - 16);
  hallShade(g, rand);
};

// ---- the directory of the building's floors ----
const directory: Paint = (g, rand) => {
  stoneWall(g, rand);
  const x = BOX.inset,
    w = TEX - BOX.inset * 2,
    top = rowOf(BOX.top),
    h = rowOf(BOX.foot) - top;
  g.fillStyle = 'rgba(10,8,6,.5)';
  g.fillRect(x + 3, top + 3, w, h);
  g.fillStyle = FRAME;
  g.fillRect(x, top, w, h);
  g.fillStyle = '#25302c'; // dark enamel
  g.fillRect(x + 5, top + 5, w - 10, h - 10);
  g.strokeStyle = BRASS;
  g.lineWidth = 2;
  g.strokeRect(x + 9, top + 9, w - 18, h - 18);
  // the heading, and the floors one under the other with the tenants' names rubbed out
  g.fillStyle = css(PAINT.clay5);
  words(g, CITY_GUIDE, TEX / 2, top + 25, 18, WALL_ASPECT, undefined, w - 34);
  g.fillStyle = BRASS;
  g.fillRect(x + 18, top + 40, w - 36, 1.5);
  const step = (h - 60) / CITY_HALL_TENANT_FLOORS.length;
  CITY_HALL_TENANT_FLOORS.forEach((floor, n) => {
    const ry = top + 48 + step * (n + 0.5);
    g.fillStyle = css(PAINT.amber2);
    words(g, floor, x + 26, ry, 13, WALL_ASPECT, undefined, 30);
    g.fillStyle = 'rgba(201,196,174,.62)';
    g.fillRect(x + 58, ry - 2, 40 + rand() * 100, 4);
    if (rand() < 0.35) g.fillRect(x + 58, ry + 4, 24 + rand() * 50, 2);
  });
  // a small plan of the floor, only its lines left
  g.strokeStyle = 'rgba(201,196,174,.28)';
  g.lineWidth = 1;
  g.strokeRect(x + w - 52, top + 48, 32, 32);
  g.beginPath();
  g.moveTo(x + w - 52, top + 64);
  g.lineTo(x + w - 20, top + 64);
  g.moveTo(x + w - 40, top + 48);
  g.lineTo(x + w - 40, top + 80);
  g.stroke();
  hallShade(g, rand);
};

// ---- the lifts ----
const lifts: Paint = (g, rand) => {
  stoneWall(g, rand);
  // the polished stone surround, lighter than the wall
  const top = rowOf(LIFT.top),
    foot = rowOf(LIFT.foot);
  g.fillStyle = 'rgba(20,16,12,.35)';
  g.fillRect(10, top - 10, TEX - 20, foot - top + 10);
  g.fillStyle = '#6d6759';
  g.fillRect(12, top - 8, TEX - 24, foot - top + 8);
  veins(g, rand, 12, top - 8, TEX - 24, foot - top + 8, 5);
  const doorW = LIFT.w,
    doorX = [TEX / 2 - LIFT.gap / 2 - doorW, TEX / 2 + LIFT.gap / 2];
  doorX.forEach((x, n) => {
    // the dark frame, then the brushed steel of the two leaves and their seam
    g.fillStyle = '#2f2e2a';
    g.fillRect(x - 4, top - 4, doorW + 8, foot - top + 4);
    const steel = g.createLinearGradient(x, 0, x + doorW, 0);
    steel.addColorStop(0, STEEL[0]!);
    steel.addColorStop(0.5, STEEL[1]!);
    steel.addColorStop(1, STEEL[2]!);
    g.fillStyle = steel;
    g.fillRect(x, top, doorW, foot - top);
    for (let lx = x + 3; lx < x + doorW; lx += 3) {
      g.fillStyle = 'rgba(255,255,255,.05)';
      g.fillRect(lx, top, 1, foot - top);
    }
    g.fillStyle = 'rgba(20,20,18,.75)';
    g.fillRect(x + doorW / 2 - 0.75, top, 1.5, foot - top);
    g.fillStyle = 'rgba(255,246,222,.16)';
    g.fillRect(x, top, doorW, 1.5);
    // the kick plate, and the floor indicator over the door (dark: the lift is dead)
    g.fillStyle = 'rgba(20,18,16,.5)';
    g.fillRect(x, foot - 9, doorW, 9);
    g.fillStyle = '#22211e';
    g.fillRect(x + doorW / 2 - 20, top - 22, 40, 12);
    g.fillStyle = n === 0 ? 'rgba(210,160,80,.28)' : 'rgba(210,160,80,.1)';
    g.fillRect(x + doorW / 2 - 14, top - 18, 28, 4);
  });
  // the call plate between the doors: two buttons, one a little lit
  const cx = TEX / 2,
    cy = rowOf(1.15);
  g.fillStyle = '#2c2b27';
  g.fillRect(cx - 7, cy - 16, 14, 32);
  g.strokeStyle = 'rgba(200,190,165,.3)';
  g.lineWidth = 1;
  g.strokeRect(cx - 7, cy - 16, 14, 32);
  for (const [by, lit] of [
    [cy - 9, false],
    [cy + 2, true],
  ] as [number, boolean][]) {
    g.fillStyle = lit ? css(PAINT.amber2) : '#4d4a43';
    g.beginPath();
    g.moveTo(cx, by);
    g.lineTo(cx - 3, by + 5);
    g.lineTo(cx + 3, by + 5);
    g.closePath();
    g.fill();
  }
  hallShade(g, rand);
};

// ---- the glass curtain wall and the evening outside ----
const curtainWall: Paint = (g, rand) => {
  stoneWall(g, rand);
  const side = CURTAIN.side,
    top = rowOf(CURTAIN.top),
    foot = rowOf(CURTAIN.foot),
    w = TEX - side * 2,
    h = foot - top;
  // the spandrel over the glass, in dark stone
  g.fillStyle = '#38342d';
  g.fillRect(0, 0, TEX, top);
  g.fillStyle = 'rgba(230,220,196,.08)';
  g.fillRect(0, top - 3, TEX, 3);
  // the panes: the dusk sky and the roofs of the old downtown far below
  for (let c = 0; c < 3; c++) {
    const x = side + (c * w) / 3,
      pw = w / 3;
    const sky = g.createLinearGradient(0, top, 0, foot);
    sky.addColorStop(0, DUSK[0]!);
    sky.addColorStop(0.62, DUSK[1]!);
    sky.addColorStop(1, DUSK[2]!);
    g.fillStyle = sky;
    g.fillRect(x, top, pw, h);
    g.save();
    g.beginPath();
    g.rect(x, top, pw, h);
    g.clip();
    // the sun going down behind the roofs, low at one end of the wall
    if (c === 2) glow(g, x + pw * 0.55, foot - 16, 52, '255,166,84', 0.42);
    // two rows of roofs, the far one lighter, and an aerial
    for (const [shade, low, high] of [
      [ROOFS[1]!, 10, 26],
      [ROOFS[0]!, 4, 16],
    ] as [string, number, number][]) {
      g.fillStyle = shade;
      for (let bx = x - 4; bx < x + pw;) {
        const bw = 8 + rand() * 16,
          bh = low + rand() * (high - low);
        g.fillRect(bx, foot - bh, bw, bh);
        if (rand() < 0.3) g.fillRect(bx + bw * 0.4, foot - bh - 4, 1.2, 4);
        bx += bw + rand() * 3;
      }
    }
    // the glass: a pale reflection across it, the dirt of the weather
    g.fillStyle = 'rgba(220,226,230,.08)';
    g.beginPath();
    g.moveTo(x + pw * 0.1, top + h * 0.2);
    g.lineTo(x + pw * 0.55, top);
    g.lineTo(x + pw * 0.8, top);
    g.lineTo(x + pw * 0.25, top + h * 0.55);
    g.fill();
    for (let k = 0; k < 4; k++) {
      g.fillStyle = 'rgba(40,38,34,.14)';
      g.fillRect(x + rand() * pw, foot - 24 - rand() * 30, 1.5 + rand() * 3, 24 + rand() * 30);
    }
    g.restore();
    // the mullions between the panes
    g.fillStyle = FRAME;
    g.fillRect(x - 2.5, top - 4, 5, h + 8);
  }
  // the frame round the whole wall, and the transom across it
  g.fillStyle = FRAME;
  g.fillRect(side - 4, top - 4, w + 8, 5);
  g.fillRect(side - 4, foot, w + 8, 5);
  g.fillRect(side - 4, top - 4, 5, h + 9);
  g.fillRect(side + w - 1, top - 4, 5, h + 9);
  g.fillStyle = 'rgba(30,30,28,.7)';
  g.fillRect(side, rowOf(CURTAIN.transom), w, 4);
  g.fillStyle = 'rgba(225,232,232,.16)';
  g.fillRect(side, rowOf(CURTAIN.transom) + 4, w, 1.2);
  // the sill, and the low sun lying on it
  g.fillStyle = '#5a564c';
  g.fillRect(0, foot + 5, TEX, 6);
  g.fillStyle = 'rgba(255,210,150,.22)';
  g.fillRect(0, foot + 5, TEX, 1.5);
  g.fillStyle = GLASS_SHADE;
  g.fillRect(0, foot + 11, TEX, TEX - foot - 11);
  hallShade(g, rand);
};

// ---- the fire exit and its emergency lamp ----
const fireExit: Paint = (g, rand) => {
  stoneWall(g, rand);
  const x = DOOR.x,
    w = DOOR.w,
    top = rowOf(DOOR.top),
    foot = rowOf(DOOR.foot);
  // the door, in its frame
  g.fillStyle = '#2c2f2c';
  g.fillRect(x - 8, top - 8, w + 16, foot - top + 8);
  const steel = g.createLinearGradient(x, 0, x + w, 0);
  steel.addColorStop(0, '#69716b');
  steel.addColorStop(0.5, '#7d857e');
  steel.addColorStop(1, '#626963');
  g.fillStyle = steel;
  g.fillRect(x, top, w, foot - top);
  g.fillStyle = 'rgba(16,16,14,.32)';
  g.fillRect(x, foot - 11, w, 11);
  g.fillStyle = '#3c3c37'; // the push bar, its two posts
  g.fillRect(x + 10, rowOf(1.05), w - 20, 4);
  g.fillStyle = 'rgba(255,250,236,.28)';
  g.fillRect(x + 10, rowOf(1.05), w - 20, 1.2);
  g.fillStyle = '#4a5553'; // a small wired pane
  g.fillRect(x + w / 2 - 9, rowOf(1.95), 18, 16);
  g.strokeStyle = 'rgba(20,20,18,.5)';
  g.lineWidth = 1;
  for (let gx = x + w / 2 - 6; gx < x + w / 2 + 8; gx += 4) {
    g.beginPath();
    g.moveTo(gx, rowOf(1.95));
    g.lineTo(gx, rowOf(1.95) + 16);
    g.stroke();
  }
  // the green sign over it, its light weak
  const sy = rowOf(2.85),
    sh = rowOf(2.45) - sy,
    sx = TEX / 2 - 44;
  glow(g, TEX / 2, sy + sh / 2, 38, '70,190,120', 0.16);
  g.fillStyle = css(PAINT.glow4);
  g.fillRect(sx, sy, 88, sh);
  g.fillStyle = EXIT_GREEN;
  g.fillRect(sx + 2, sy + 2, 26, sh - 4);
  // the running figure, white on green
  g.strokeStyle = css(PAINT.glow6);
  g.fillStyle = css(PAINT.glow6);
  g.lineWidth = 1.6;
  g.lineCap = 'round';
  g.save();
  g.translate(sx + 15, sy + sh / 2);
  g.scale(1, WALL_ASPECT);
  oval(g, 2, -8, 2.2, 2.2);
  g.beginPath();
  g.moveTo(2, -5);
  g.lineTo(-1, 2);
  g.lineTo(4, 6);
  g.lineTo(3, 10);
  g.moveTo(-1, 2);
  g.lineTo(-5, 5);
  g.lineTo(-8, 9);
  g.moveTo(1, -3);
  g.lineTo(6, -1);
  g.moveTo(1, -3);
  g.lineTo(-5, -3);
  g.stroke();
  g.restore();
  g.lineCap = 'butt';
  g.fillStyle = EXIT_GREEN;
  words(g, CITY_EXIT, sx + 60, sy + sh / 2 + 0.5, 18, WALL_ASPECT, undefined, 54);
  // the emergency lamp above it: a small box throwing its amber light on wall and door
  const ly = rowOf(3.25);
  glow(g, TEX / 2, ly + 5, 46, '255,176,96', 0.2);
  g.fillStyle = '#2e2c27';
  g.fillRect(TEX / 2 - 17, ly - 8, 34, 12);
  g.fillStyle = EMERGENCY;
  g.fillRect(TEX / 2 - 14, ly - 5, 28, 6);
  g.fillStyle = css(PAINT.glow6);
  oval(g, TEX / 2 - 9, ly - 2, 2, 2 * WALL_ASPECT);
  hallShade(g, rand);
};

// ---- bare stone, one panel gone ----
const bareStone: Paint = (g, rand) => {
  stoneWall(g, rand);
  // a slab fallen out of the facing, the rough concrete under it
  const x = 42 + rand() * 40,
    y = rowOf(3.1),
    w = 92,
    h = 62;
  g.fillStyle = '#6b6355';
  g.fillRect(x, y, w, h);
  for (let k = 0; k < 240; k++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(238,228,204,.16)' : 'rgba(40,34,28,.2)';
    g.fillRect(x + rand() * w, y + rand() * h, 1 + rand() * 2, 1);
  }
  g.strokeStyle = 'rgba(26,22,17,.6)';
  g.lineWidth = 2;
  g.strokeRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle = 'rgba(30,26,20,.35)';
  g.fillRect(x, y + h - 3, w, 3);
  // cracks running down the stone
  g.strokeStyle = 'rgba(18,15,12,.5)';
  g.lineWidth = 1.4;
  for (let k = 0; k < 3; k++) {
    let cx = 24 + rand() * (TEX - 48),
      cy = rowOf(4.6);
    g.beginPath();
    g.moveTo(cx, cy);
    for (let s = 0; s < 6; s++) {
      cx += (rand() - 0.5) * 22;
      cy += 10 + rand() * 14;
      g.lineTo(cx, cy);
    }
    g.stroke();
  }
  // a dead socket and the conduit up from it
  g.fillStyle = '#514c42';
  g.fillRect(18, rowOf(2.2), 22, 30);
  g.fillStyle = 'rgba(12,10,8,.7)';
  g.fillRect(22, rowOf(2.2) + 5, 6, 7);
  g.fillRect(30, rowOf(2.2) + 5, 6, 7);
  g.strokeStyle = '#3a352d';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(29, rowOf(2.2));
  g.lineTo(29, 0);
  g.stroke();
  hallShade(g, rand);
};

// the walls by number, after the sector's (pictures.ts)
export const CITY_HALL_WALLS: Paint[] = [wainscot, directory, lifts, curtainWall, fireExit, bareStone];
const [WAINSCOT, BOARD, LIFTS, GLASS_WALL, EXIT, BARE] = CITY_HALL_WALLS.map((_, n) => n);
// the walls of the hall by the share of it each picture takes: the bare stone and the glass wall take most of it
export const CITY_HALL_MAP = [
  BARE,
  BARE,
  BARE,
  WAINSCOT,
  WAINSCOT,
  GLASS_WALL,
  GLASS_WALL,
  GLASS_WALL,
  LIFTS,
  LIFTS,
  BOARD,
  EXIT,
].map(n => n!);
// what is set up by the hall's walls (the props of the second picture): where the reception desk stands, and the walls
// of glass and of the lifts
export const CITY_HALL_DESK = [WAINSCOT!, BOARD!];
export const CITY_HALL_GLASS = [GLASS_WALL!];
export const CITY_HALL_LIFTS = [LIFTS!];

// ---- the floor: polished marble ----
// The marble is cut in metre squares laid light and dark turn about, its joints a quarter of a tile in from the edge,
// so none of them lies on the edge of the floor's picture; the sheen and the wear run on across it. Variant 0 is the
// chequer, 1 large slabs with their veins, 2 stains and cracks, 3 the glass of the curtain wall scattered over it
const hallFloor =
  (variant: number): Paint =>
  (g, rand) => {
    g.fillStyle = FLOOR_DARK;
    g.fillRect(0, 0, TEX, TEX);
    if (variant === 1) {
      // two-metre slabs, the vein of the stone clear across each
      for (let r = 0; r < 2; r++)
        for (let c = 0; c < 2; c++) {
          const x = (c * TEX) / 2,
            y = (r * TEX) / 2;
          g.fillStyle = (r + c) % 2 ? '#857e6e' : '#797264';
          g.fillRect(x, y, TEX / 2, TEX / 2);
          veins(g, rand, x, y, TEX / 2, TEX / 2, 7);
        }
      g.fillStyle = 'rgba(22,19,15,.45)';
      g.fillRect(TEX / 2 - 0.75, 0, 1.5, TEX);
      g.fillRect(0, TEX / 2 - 0.75, TEX, 1.5);
      g.fillStyle = 'rgba(240,232,212,.1)';
      g.fillRect(TEX / 2 + 0.75, 0, 1, TEX);
      g.fillRect(0, TEX / 2 + 0.75, TEX, 1);
    } else {
      // the chequer: a metre square at a time, light and dark
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 4; c++) {
          const x = c * SEAM,
            y = r * SEAM;
          g.fillStyle = (r + c) % 2 ? FLOOR_LIGHT : FLOOR_DARK;
          g.fillRect(x, y, SEAM, SEAM);
          veins(g, rand, x, y, SEAM, SEAM, 2);
        }
      for (let p = SEAM; p < TEX; p += SEAM) {
        g.fillStyle = 'rgba(22,19,15,.4)';
        g.fillRect(p - 0.75, 0, 1.5, TEX);
        g.fillRect(0, p - 0.75, TEX, 1.5);
        g.fillStyle = 'rgba(240,232,212,.08)';
        g.fillRect(p + 0.75, 0, 1, TEX);
        g.fillRect(0, p + 0.75, TEX, 1);
      }
    }
    // the polish catches what is left of the light, and the whole floor is worn
    const sheen = g.createLinearGradient(0, 0, TEX, TEX);
    sheen.addColorStop(0.2, 'rgba(255,226,180,0)');
    sheen.addColorStop(0.46, 'rgba(255,226,180,.09)');
    sheen.addColorStop(0.72, 'rgba(255,226,180,0)');
    g.fillStyle = sheen;
    g.fillRect(0, 0, TEX, TEX);
    for (let k = 0; k < 34; k++)
      smudge(
        g,
        rand() * TEX,
        rand() * TEX,
        14 + rand() * 40,
        10 + rand() * 28,
        rand() < 0.55 ? '22,18,14' : '150,140,120',
        0.06 + rand() * 0.1,
      );
    if (variant === 2) {
      // a dark stain with a harder rim, cracks, the scuff of a trolley
      const cx = 88 + rand() * 80,
        cy = 92 + rand() * 70;
      for (let k = 0; k < 5; k++) {
        const px = cx + (rand() - 0.5) * 46,
          py = cy + (rand() - 0.5) * 46,
          r = 14 + rand() * 22;
        smudge(g, px, py, r + 4, (r + 4) * 0.8, '54,44,32', 0.28);
        smudge(g, px, py, r, r * 0.8, '28,23,18', 0.38);
      }
      g.strokeStyle = 'rgba(16,13,11,.55)';
      g.lineWidth = 1.4;
      for (let k = 0; k < 3; k++) {
        let x = 40 + rand() * (TEX - 80),
          y = 40 + rand() * (TEX - 80);
        g.beginPath();
        g.moveTo(x, y);
        for (let s = 0; s < 5; s++) {
          x += (rand() - 0.5) * 40;
          y += (rand() - 0.5) * 40;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      g.strokeStyle = 'rgba(60,54,44,.34)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(34, 188);
      g.lineTo(206, 174);
      g.stroke();
    } else if (variant === 3) {
      // the glass of the curtain wall: shards of different sizes, their edges catching the last of the sun
      for (let k = 0; k < 13; k++) {
        const cx = 24 + rand() * (TEX - 48),
          cy = 24 + rand() * (TEX - 48),
          s = 5 + rand() * 14,
          a = rand() * Math.PI;
        g.save();
        g.translate(cx, cy);
        g.rotate(a);
        g.fillStyle = rand() < 0.5 ? 'rgba(150,168,170,.34)' : 'rgba(196,176,140,.3)';
        g.beginPath();
        g.moveTo(-s, -s * 0.5);
        g.lineTo(s * 0.7, -s);
        g.lineTo(s, s * 0.6);
        g.lineTo(-s * 0.4, s * 0.8);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(238,232,212,.45)';
        g.lineWidth = 0.8;
        g.stroke();
        g.restore();
      }
      // a bent length of the frame lying among them
      g.strokeStyle = FRAME;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(60, 206);
      g.lineTo(112, 198);
      g.lineTo(140, 210);
      g.stroke();
    }
    grain(g, rand, 16);
  };
export const CITY_HALL_FLOORS: Paint[] = [0, 1, 2, 3].map(hallFloor);

// ---- the wall above the usual height (a tile wide, as high as the boss room goes above the usual wall) ----
// The gallery of the floor above: its glass balustrade and brass handrail at the foot, the offices behind it, dark but
// for a faint light, and the stone of the wall over them
export const cityHallUpper: Paint = (g, rand) => {
  stoneWall(g, rand);
  g.fillStyle = 'rgba(14,11,9,.4)';
  g.fillRect(0, 0, TEX, TEX);
  // the offices behind the gallery: four panes of glass in dark frames
  const top = TEX * 0.12,
    foot = TEX * 0.68,
    w = TEX / 4;
  for (let c = 0; c < 4; c++) {
    const x = c * w + 6,
      pw = w - 12;
    g.fillStyle = '#2b2b28';
    g.fillRect(x - 3, top - 3, pw + 6, foot - top + 6);
    const glass = g.createLinearGradient(0, top, 0, foot);
    glass.addColorStop(0, '#2c3134');
    glass.addColorStop(0.6, '#38403f');
    glass.addColorStop(1, '#242a2b');
    g.fillStyle = glass;
    g.fillRect(x, top, pw, foot - top);
    if (c === 2) {
      // the one light left on in the offices
      g.fillStyle = 'rgba(224,190,120,.22)';
      g.fillRect(x + 5, top + 6, pw - 10, foot - top - 12);
      g.fillStyle = 'rgba(255,238,200,.4)';
      g.fillRect(x + 10, top + 10, pw - 20, 2);
    }
    // the blinds half down, and the dark line of a desk
    g.fillStyle = 'rgba(120,116,102,.2)';
    for (let sy = top + 4; sy < top + (foot - top) * 0.42; sy += 4) g.fillRect(x, sy, pw, 1.4);
    g.fillStyle = 'rgba(12,12,10,.45)';
    g.fillRect(x + 4, foot - 12, pw - 8, 4);
    g.fillStyle = 'rgba(230,226,210,.08)';
    g.beginPath();
    g.moveTo(x + 3, top + 8);
    g.lineTo(x + pw * 0.55, top);
    g.lineTo(x + pw * 0.8, top);
    g.lineTo(x + pw * 0.3, foot);
    g.lineTo(x, foot);
    g.fill();
    g.fillStyle = '#33342f';
    g.fillRect(x - 3, top - 3, 3, foot - top + 6);
  }
  // the gallery's floor slab, seen edge on, with its brass nosing
  const slab = TEX * GALLERY;
  g.fillStyle = '#38342d';
  g.fillRect(0, slab, TEX, TEX - slab);
  g.fillStyle = 'rgba(24,20,16,.6)';
  g.fillRect(0, slab, TEX, 3);
  g.fillStyle = BRASS;
  g.fillRect(0, slab - 1.5, TEX, 3);
  g.fillStyle = 'rgba(255,242,210,.22)';
  g.fillRect(0, slab - 1.5, TEX, 1);
  // the glass balustrade: panels between steel posts, a brass handrail over them
  const rail = slab - 38;
  for (let c = 0; c < 4; c++) {
    const x = c * (TEX / 4);
    g.fillStyle = 'rgba(140,160,158,.14)';
    g.fillRect(x + 4, rail, TEX / 4 - 8, slab - rail - 2);
    g.fillStyle = 'rgba(235,240,236,.1)';
    g.fillRect(x + 6, rail + 2, 2, slab - rail - 6);
    g.fillStyle = '#3b3c37';
    g.fillRect(x, rail - 3, 3, slab - rail + 3);
  }
  g.fillStyle = '#2f2e29';
  g.fillRect(0, rail - 4, TEX, 3);
  g.fillStyle = BRASS;
  g.fillRect(0, rail - 5, TEX, 2);
  g.fillStyle = 'rgba(255,240,206,.28)';
  g.fillRect(0, rail - 5, TEX, 1);
  // the dim of the high room, and its dust
  const dim = g.createLinearGradient(0, 0, 0, TEX);
  dim.addColorStop(0, 'rgba(6,4,4,.45)');
  dim.addColorStop(0.7, 'rgba(6,4,4,.1)');
  dim.addColorStop(1, 'rgba(6,4,4,.35)');
  g.fillStyle = dim;
  g.fillRect(0, 0, TEX, TEX);
  grain(g, rand, 14);
};

// ---- the ceiling: a coffered one, its big fitting dead ----
export const cityHallCeiling: Paint = (g, rand) => {
  const s = TEX / 4;
  g.fillStyle = '#3c3831';
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 70, '#575249', '#211e1a');
  // the coffers: a recessed panel inside each bay, stained here and there
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      const x = c * s + 5,
        y = r * s + 5,
        w = s - 10,
        h = s - 10;
      const inner = g.createLinearGradient(0, y, 0, y + h);
      inner.addColorStop(0, '#4a463e');
      inner.addColorStop(1, '#37342e');
      g.fillStyle = inner;
      g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,244,222,.08)';
      g.fillRect(x, y, w, 1.5);
      g.fillStyle = 'rgba(12,10,8,.45)';
      g.fillRect(x, y + h - 2, w, 2);
      if (rand() < 0.4) smudge(g, x + rand() * w, y + rand() * h, 8 + rand() * 12, 4 + rand() * 8, '70,54,34', 0.18);
    }
  // the beams between the coffers, each with its lit edge
  for (let p = 0; p <= TEX; p += s) {
    g.fillStyle = '#2c2924';
    g.fillRect(0, p - 4, TEX, 8);
    g.fillRect(p - 4, 0, 8, TEX);
    g.fillStyle = 'rgba(200,190,168,.12)';
    g.fillRect(0, p - 4, TEX, 1);
    g.fillRect(p - 4, 0, 1, TEX);
    g.fillStyle = 'rgba(8,7,6,.4)';
    g.fillRect(0, p + 3, TEX, 1.5);
    g.fillRect(p + 3, 0, 1.5, TEX);
  }
  // the big fitting in the middle: two bays by two, its frosted panels dark and one corner broken
  const fx = TEX / 2 - s + 6,
    fy = TEX / 2 - s + 6,
    fw = s * 2 - 12,
    fh = s * 2 - 12;
  g.fillStyle = '#24221f';
  g.fillRect(fx - 5, fy - 5, fw + 10, fh + 10);
  g.fillStyle = LAMP_DEAD;
  g.fillRect(fx, fy, fw, fh);
  g.fillStyle = 'rgba(255,244,222,.06)';
  for (let tx = fx + fw * 0.2; tx < fx + fw * 0.85; tx += fw * 0.2) g.fillRect(tx, fy + 6, fw * 0.1, fh - 12);
  for (let ty = fy + 8; ty < fy + fh - 6; ty += 9) {
    g.fillStyle = 'rgba(18,17,15,.5)';
    g.fillRect(fx + 4, ty, fw - 8, 1.5);
  }
  // the broken corner: the louvre gone, the dark inside
  g.fillStyle = '#141311';
  g.beginPath();
  g.moveTo(fx + fw - 26, fy + fh);
  g.lineTo(fx + fw, fy + fh);
  g.lineTo(fx + fw, fy + fh - 30);
  g.closePath();
  g.fill();
  g.strokeStyle = '#6a655a';
  g.lineWidth = 1.2;
  g.stroke();
  // a dead sprinkler and its pipe along one beam
  g.fillStyle = '#514c43';
  g.fillRect(0, s - 2, TEX, 4);
  g.fillStyle = '#6e6a60';
  oval(g, s * 1.5, s, 3, 3);
  oval(g, s * 3.5, s * 3, 3, 3);
  grain(g, rand, 12);
};
