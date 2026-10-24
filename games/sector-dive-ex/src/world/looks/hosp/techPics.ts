import { HOSP_NO_ENTRY, HOSP_PHARMACY_WINDOW, HOSP_RADIATION } from '../../../i18n/signs.ts';
import { WALL_ASPECT, oval, rowOf, smudge } from '../paint.ts';
import type { Paint } from '../paint.ts';
import { HAZARD_BLACK, HAZARD_YELLOW, KIND_LAB, KIND_PHARMACY, PLATE_WHITE, STEEL, STEEL_DARK, box } from './shared.ts';
import {
  BOX_COLORS,
  FRONT_TOP,
  PILL_COLORS,
  WOOD,
  boxesOnShelf,
  doorLeaf,
  dot,
  inKind,
  pane,
  plateWords,
  shelving,
} from './kit.ts';
import type { G } from './kit.ts';
// The examination rooms' (X-ray, CT) and the pharmacy's pictures (roomPics.ts puts them in the order of the kinds).
// Examination room: a CT scanner seen head on, a rack of lead aprons by a wall detector, the lead-glass window of the
// control booth beside the yellow radiation plate. Pharmacy: shelves of medicine boxes, the dispensing window, a cabinet of
// small drawers. And the fronts of both: the lead door with its plate, the control booth's window; the pharmacy's
// counter with the shutter let down, and with its glass.
const LEAD_GREY = '#aeb4aa';
const LEAD_GLASS = '#33463c'; // the lead glass's tint: a dull yellow-green
const GANTRY = ['#e0e0d4', '#b9bcb2']; // a scanner's casing, lit side and shade
const APRONS = ['#6e8a8a', '#7a8f9c', '#6c7d6f'];
const DRAWER = ['#cdd4c0', '#b9c6b2'];
const BOTTLES = ['#7a5a3c', '#4f7a5b', '#cfcfc1'];

// the radiation trefoil, black on yellow: three blades round a hub, painted flat to be round on the wall
export function trefoil(g: G, cx: number, cy: number, r: number) {
  g.save();
  g.translate(cx, cy);
  g.scale(1, WALL_ASPECT);
  g.fillStyle = '#1c1d18';
  for (let k = 0; k < 3; k++) {
    const a = (k * 2 * Math.PI) / 3 - Math.PI / 2;
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, r, a - Math.PI / 6, a + Math.PI / 6);
    g.closePath();
    g.fill();
  }
  oval(g, 0, 0, r * 0.22, r * 0.22);
  g.restore();
}
// a yellow plate with the trefoil over the words
function radiationPlate(g: G, x: number, y: number, w: number, h: number) {
  box(g, x, y, w, h, '#d6b83a');
  g.strokeStyle = '#1c1d18';
  g.lineWidth = 1.6;
  g.strokeRect(x + 3, y + 3, w - 6, h - 6);
  trefoil(g, x + w / 2, y + h * 0.4, Math.min(w * 0.3, 16));
  g.fillStyle = '#1c1d18';
  plateWords(g, HOSP_RADIATION, x + w / 2, y + h - 8, 9, w - 8);
}

// ---- the examination room ----
// a CT scanner head on: the casing round a dark bore, the table running out of it on its pedestal, the display and
// the lamps on top of the casing
const labScanner: Paint = inKind(KIND_LAB, (g, rand) => {
  const cx = 128,
    cy = rowOf(1.7),
    rx = 88,
    ry = 48;
  g.fillStyle = 'rgba(14,18,14,.35)';
  oval(g, cx + 3, cy + 4, rx, ry);
  const casing = g.createLinearGradient(cx - rx, 0, cx + rx, 0);
  casing.addColorStop(0, GANTRY[0]!);
  casing.addColorStop(1, GANTRY[1]!);
  g.fillStyle = casing;
  oval(g, cx, cy, rx, ry);
  g.fillStyle = 'rgba(30,36,32,.25)';
  oval(g, cx, cy, rx - 10, ry - 7);
  g.fillStyle = '#8c928c';
  oval(g, cx, cy, 54, 30);
  g.fillStyle = '#0f1817';
  oval(g, cx, cy, 46, 25);
  g.fillStyle = 'rgba(190,212,206,.07)';
  oval(g, cx - 10, cy - 6, 24, 10);
  g.fillStyle = STEEL_DARK; // the stands it hangs between
  g.fillRect(cx - rx - 10, cy, 14, rowOf(0.14) - cy);
  g.fillRect(cx + rx - 4, cy, 14, rowOf(0.14) - cy);
  // the table: a slab with a cushion, out of the bore, on its pedestal
  g.fillStyle = '#868e89';
  g.fillRect(cx - 62, cy + 8, 124, 5);
  g.fillStyle = '#4f6e72';
  g.fillRect(cx - 62, cy + 3, 124, 6);
  box(g, cx - 16, cy + 14, 32, rowOf(0.14) - cy - 14, '#6d7571');
  // the display and the lamps on top
  box(g, cx - 24, cy - ry - 14, 48, 12, '#1d2724');
  g.fillStyle = '#d6a140';
  g.fillRect(cx - 18, cy - ry - 10, 16, 4);
  for (const [lx, c] of [
    [cx + 8, '#4b6a50'],
    [cx + 16, '#6f5a35'],
  ] as const) {
    g.fillStyle = c;
    dot(g, lx, cy - ry - 8, 2.4);
  }
  smudge(g, 60 + rand() * 130, rowOf(0.5), 40, 10, '20,20,14', 0.2);
});
// a rack of lead aprons on a rail, three hanging; a wall detector beside it on its column with the handle of its tray
const labApron: Paint = inKind(KIND_LAB, (g, rand) => {
  g.fillStyle = STEEL;
  g.fillRect(18, rowOf(2.6), 112, 3);
  g.fillRect(18, rowOf(2.6), 3, rowOf(2.2) - rowOf(2.6));
  g.fillRect(127, rowOf(2.6), 3, rowOf(2.2) - rowOf(2.6));
  APRONS.forEach((c, n) => {
    const x = 30 + n * 34;
    g.fillStyle = 'rgba(14,18,14,.3)';
    g.fillRect(x + 2, rowOf(2.55) + 2, 28, rowOf(0.95) - rowOf(2.55));
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(x, rowOf(2.55));
    g.lineTo(x + 28, rowOf(2.55));
    g.lineTo(x + 31, rowOf(0.95));
    g.lineTo(x - 3, rowOf(0.95));
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.14)';
    g.fillRect(x + 2, rowOf(2.55), 5, rowOf(0.95) - rowOf(2.55));
    g.fillStyle = STEEL_DARK;
    g.fillRect(x + 5, rowOf(2.55) - 8, 3, 9);
    g.fillRect(x + 20, rowOf(2.55) - 8, 3, 9);
  });
  box(g, 156, rowOf(3.2), 60, rowOf(0.5) - rowOf(3.2), '#cfd1c6');
  g.fillStyle = '#1d2724';
  g.fillRect(164, rowOf(2.8), 44, rowOf(1.2) - rowOf(2.8));
  g.fillStyle = 'rgba(190,212,206,.1)';
  g.fillRect(166, rowOf(2.75), 12, rowOf(1.25) - rowOf(2.75));
  g.fillStyle = STEEL_DARK;
  g.fillRect(160, rowOf(1.05), 52, 4);
  g.fillStyle = HAZARD_YELLOW;
  g.fillRect(156, rowOf(0.5) - 5, 60, 5);
  smudge(g, 90 + rand() * 80, rowOf(0.4), 30, 8, '20,20,14', 0.2);
});
// the control booth's lead-glass window over its console (a keyboard, a row of buttons), the yellow plate beside it
const labBooth: Paint = inKind(KIND_LAB, (g, rand) => {
  pane(g, 24, rowOf(3.3), 128, rowOf(1.7) - rowOf(3.3), LEAD_GLASS);
  g.fillStyle = 'rgba(206,224,170,.12)';
  g.fillRect(28, rowOf(3.3) + 4, 120, 6);
  g.fillStyle = 'rgba(20,28,24,.5)'; // a monitor's back seen through the glass
  g.fillRect(70, rowOf(2.7), 40, rowOf(2.0) - rowOf(2.7));
  box(g, 18, rowOf(1.2), 140, 7, WOOD);
  box(g, 22, rowOf(1.2) + 7, 132, rowOf(0.15) - rowOf(1.2) - 7, '#9fa89b');
  g.fillStyle = '#2d3733';
  g.fillRect(36, rowOf(1.2) - 5, 54, 5);
  for (let b = 0; b < 6; b++) {
    g.fillStyle = b === 5 ? '#6e4a3a' : PILL_COLORS[b % PILL_COLORS.length]!;
    g.fillRect(104 + b * 8, rowOf(1.2) - 5, 5, 4);
  }
  radiationPlate(g, 176, rowOf(3.0), 56, rowOf(1.7) - rowOf(3.0));
  smudge(g, 40 + rand() * 80, rowOf(0.5), 40, 10, '20,20,14', 0.16);
});

// ---- the pharmacy ----
// shelves from the floor to above the head, six boards of medicine boxes standing side by side, white and pale blue and
// green, with the bottles on the bottom board
const pharmacyShelves: Paint = inKind(KIND_PHARMACY, (g, rand) => {
  shelving(g, 16, 224, 3.5, 0.2, 6, (board, level) => {
    if (level === 5) {
      for (let bx = 24; bx < 230; bx += 10 + rand() * 6) {
        g.fillStyle = BOTTLES[Math.floor(rand() * BOTTLES.length)]!;
        g.fillRect(bx, board - 16 - rand() * 4, 7, 17);
        g.fillStyle = PLATE_WHITE;
        g.fillRect(bx, board - 11, 7, 5);
      }
      return;
    }
    boxesOnShelf(g, rand, 20, 216, board, 22, BOX_COLORS);
  });
});
// the dispensing window: the counter, the glass over it with the sliding pane open in the middle, a steel tray in the
// opening, the lit sign over it (out) and the number display beside it (out)
const pharmacyWindow: Paint = inKind(KIND_PHARMACY, (g, rand) => {
  box(g, 14, rowOf(1.1), 228, 8, WOOD);
  box(g, 18, rowOf(1.1) + 8, 220, rowOf(0.15) - rowOf(1.1) - 8, '#bfc8b4');
  g.fillStyle = 'rgba(30,40,32,.3)';
  for (let x = 18; x < 238; x += 44) g.fillRect(x, rowOf(1.1) + 8, 1.4, rowOf(0.15) - rowOf(1.1) - 8);
  pane(g, 18, rowOf(3.15), 220, rowOf(1.1) - rowOf(3.15), '#22302c');
  g.fillStyle = 'rgba(20,24,20,.7)'; // the room behind: shelves in the dark
  for (let sy = rowOf(2.9); sy < rowOf(1.4); sy += 14) g.fillRect(24, sy, 208, 2);
  g.fillStyle = STEEL_DARK; // the sliding pane's frame, open
  g.fillRect(96, rowOf(2.6), 3, rowOf(1.1) - rowOf(2.6));
  g.fillRect(156, rowOf(2.6), 3, rowOf(1.1) - rowOf(2.6));
  g.fillStyle = '#0f1817';
  g.fillRect(99, rowOf(2.6), 57, rowOf(1.1) - rowOf(2.6));
  g.fillStyle = STEEL;
  g.fillRect(90, rowOf(1.1) - 4, 70, 4);
  box(g, 76, rowOf(3.75), 104, rowOf(3.3) - rowOf(3.75), '#2c3a38');
  g.fillStyle = '#6a7a62';
  plateWords(g, HOSP_PHARMACY_WINDOW, 128, rowOf(3.52), 15, 92);
  box(g, 24, rowOf(2.95), 46, rowOf(2.3) - rowOf(2.95), '#1b2420');
  g.fillStyle = '#4a2e28';
  for (let k = 0; k < 3; k++) g.fillRect(29 + k * 13, rowOf(2.85), 9, rowOf(2.5) - rowOf(2.85));
  smudge(g, 60 + rand() * 120, rowOf(0.4), 40, 8, '20,20,14', 0.16);
});
// a cabinet of small drawers, ten across and eight down, a label card on each and some pulled out
const pharmacyDrawers: Paint = inKind(KIND_PHARMACY, (g, rand) => {
  const x0 = 24,
    w = 208,
    cols = 10,
    rows = 8,
    top = rowOf(3.3),
    foot = rowOf(0.4),
    cw = w / cols,
    ch = (foot - top) / rows;
  g.fillStyle = 'rgba(14,18,14,.4)';
  g.fillRect(x0 - 2, top - 2, w + 6, foot - top + 6);
  g.fillStyle = STEEL_DARK;
  g.fillRect(x0 - 3, top - 3, w + 6, foot - top + 6);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * cw,
        y = top + r * ch,
        out = rand() < 0.08;
      g.fillStyle = out ? '#101714' : DRAWER[(r + c) % 2]!;
      g.fillRect(x + 1, y + 1, cw - 2, ch - 2);
      if (out) {
        g.fillStyle = DRAWER[c % 2]!;
        g.fillRect(x + 2, y + ch - 7, cw - 4, 6);
        continue;
      }
      g.fillStyle = PLATE_WHITE;
      g.fillRect(x + 4, y + 3, cw - 8, 5);
      g.fillStyle = 'rgba(40,44,44,.5)';
      g.fillRect(x + 6, y + 5, (cw - 12) * (0.4 + rand() * 0.5), 1);
      g.fillStyle = STEEL_DARK;
      g.fillRect(x + cw / 2 - 3, y + ch - 7, 6, 2);
    }
  g.fillStyle = 'rgba(20,26,20,.3)';
  g.fillRect(x0, foot - 4, w, 4);
  smudge(g, 100, foot - 10, 60, 10, '20,20,14', 0.2);
});

// ---- the fronts ----
// the lead door of an examination room: a heavy grey leaf with its rivets, the lamp over it that says the beam is on
// (out), the yellow plate on the wall beside it
const labLeadDoor: Paint = inKind(KIND_LAB, (g, rand) => {
  const x = 100,
    w = 78;
  doorLeaf(g, rand, x, w, FRONT_TOP - 0.3, LEAD_GREY);
  g.fillStyle = 'rgba(30,40,34,.35)';
  for (let ry = rowOf(3.1); ry < rowOf(0.7); ry += 14) {
    g.fillRect(x + 6, ry, 3, 3);
    g.fillRect(x + w - 10, ry, 3, 3);
  }
  stripe(g, x, w);
  box(g, x + 14, rowOf(3.5) - 4, 50, 11, '#2a332f');
  g.fillStyle = '#6a2e26';
  dot(g, x + 39, rowOf(3.5) + 1, 4);
  radiationPlate(g, 30, rowOf(3.0), 56, rowOf(1.8) - rowOf(3.0));
  g.fillStyle = '#e3e0d1';
  g.fillRect(x + w + 14, rowOf(2.4), 36, 18);
  g.fillStyle = 'rgba(40,44,44,.6)';
  plateWords(g, HOSP_NO_ENTRY, x + w + 32, rowOf(2.4) + 9, 7, 32);
});
// a band of yellow and black across a door's foot
function stripe(g: G, x: number, w: number) {
  g.fillStyle = HAZARD_BLACK;
  g.fillRect(x, rowOf(0.5), w, 5);
  g.fillStyle = HAZARD_YELLOW;
  for (let sx = x; sx < x + w; sx += 10) g.fillRect(sx, rowOf(0.5), 5, 5);
}
// the control booth seen from the corridor: its lead-glass window, the three lamps beside it (red, amber, green; out)
const labWindow: Paint = inKind(KIND_LAB, g => {
  pane(g, 36, rowOf(3.2), 130, rowOf(1.4) - rowOf(3.2), LEAD_GLASS);
  g.fillStyle = 'rgba(20,28,24,.5)';
  g.fillRect(70, rowOf(2.7), 60, rowOf(1.8) - rowOf(2.7));
  box(g, 184, rowOf(3.1), 22, rowOf(1.9) - rowOf(3.1), '#2a332f');
  [
    ['#5a2c26', 2.9],
    ['#6a5530', 2.55],
    ['#2f4d38', 2.2],
  ].forEach(([c, m]) => {
    g.fillStyle = c as string;
    dot(g, 195, rowOf(m as number), 5);
  });
  radiationPlate(g, 214, rowOf(2.9), 36, rowOf(1.9) - rowOf(2.9));
});
// the counter of the pharmacy shut: a steel counter, the roll shutter let down over the window, the plate over it
const pharmacyShutter: Paint = inKind(KIND_PHARMACY, (g, rand) => {
  const x = 44,
    w = 168,
    top = rowOf(3.2),
    sill = rowOf(1.2);
  box(g, x - 6, top - 6, w + 12, sill - top + 6, STEEL_DARK);
  g.fillStyle = '#0f1817';
  g.fillRect(x, top, w, sill - top);
  g.fillStyle = '#8d958f';
  g.fillRect(x, top, w, (sill - top) * 0.82);
  for (let sy = top; sy < top + (sill - top) * 0.82; sy += 4) {
    g.fillStyle = 'rgba(0,0,0,.28)';
    g.fillRect(x, sy + 2.8, w, 1.2);
    g.fillStyle = 'rgba(255,255,250,.12)';
    g.fillRect(x, sy, w, 1);
  }
  g.fillStyle = '#4a514d';
  g.fillRect(x, top + (sill - top) * 0.82 - 5, w, 5);
  box(g, x - 10, sill, w + 20, 7, STEEL);
  box(g, x - 6, sill + 7, w + 12, rowOf(0.12) - sill - 7, '#bfc8b4');
  g.fillStyle = '#2c3a38';
  g.fillRect(x + 22, rowOf(3.55), w - 44, rowOf(3.3) - rowOf(3.55));
  g.fillStyle = '#6a7a62';
  plateWords(g, HOSP_PHARMACY_WINDOW, x + w / 2, rowOf(3.43), 11, w - 56);
  smudge(g, 80 + rand() * 90, rowOf(0.5), 40, 8, '20,20,14', 0.16);
});
// the pharmacy's open counter: the glass over it, an empty tray, the ticket number display (out) and a bell
const pharmacyCounter: Paint = inKind(KIND_PHARMACY, (g, rand) => {
  const x = 40,
    w = 176;
  pane(g, x, rowOf(3.2), w, rowOf(1.2) - rowOf(3.2), '#1f2b2a');
  g.fillStyle = 'rgba(20,26,22,.8)';
  for (let sy = rowOf(2.9); sy < rowOf(1.5); sy += 15) g.fillRect(x + 8, sy, w - 16, 2);
  box(g, x - 8, rowOf(1.2), w + 16, 8, WOOD);
  box(g, x - 4, rowOf(1.2) + 8, w + 8, rowOf(0.12) - rowOf(1.2) - 8, '#bfc8b4');
  g.fillStyle = STEEL;
  g.fillRect(x + 66, rowOf(1.2) - 3, 44, 3);
  box(g, x + 120, rowOf(1.2) - 14, 22, 14, '#1b2420');
  g.fillStyle = '#4a2e28';
  g.fillRect(x + 124, rowOf(1.2) - 11, 14, 8);
  g.fillStyle = '#c9a85a';
  dot(g, x + 20, rowOf(1.2) - 4, 4);
  smudge(g, 90 + rand() * 80, rowOf(0.5), 40, 8, '20,20,14', 0.16);
});

export const LAB_PICS: Paint[] = [labScanner, labApron, labBooth];
export const LAB_FRONTS: Paint[] = [labLeadDoor, labWindow];
export const PHARMACY_PICS: Paint[] = [pharmacyShelves, pharmacyWindow, pharmacyDrawers];
export const PHARMACY_FRONTS: Paint[] = [pharmacyShutter, pharmacyCounter];
