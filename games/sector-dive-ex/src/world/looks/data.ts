import * as THREE from 'three';
import type { Rng } from '@engine/core/util.ts';
import { tileCenter } from '@engine/world/tiles.ts';
import type { PropRule } from '@engine/world/slots.ts';
import { WALL_H } from '../../data/level.ts';
import { css } from '../../data/colors.ts';
import { DATA_PLATE_CAUTION, DATA_PLATE_ZONE, DATA_RACK_IDS, DATA_SEALED } from '../../i18n/signs.ts';
import type { FloorPlan } from '../building.ts';
import { WALL_PLAIN_SHARE, variantOf } from './common.ts';
import type { Look } from './common.ts';
import {
  DOOR_ASPECT,
  TEX,
  WALL_ASPECT,
  grain,
  grime,
  oval,
  paint,
  poolTex,
  rowOf,
  smudge,
  stripes,
  words,
} from './paint.ts';
import type { Paint } from './paint.ts';
import { facing, lightMat, onWall, pose, propTools } from './props.ts';
import type { Light, WallSlot } from './props.ts';
// The discarded data layer (DATA): a server room nobody has entered for years. Pale wall panels and rows of racks in
// grey metal and plastic, a raised floor, cable ladders and a duct overhead, and the cold white of the few tubes that
// still burn. The lights of the scenery are small and dull, so that the enemies, the shots and the pickups (which
// glow) stand out from it.
// ---- tuning numbers used only here ----
const POOL_OPACITY = 0.38; // the light a tube throws on the ground (the floor is pale already)
const CEILING_GLOW = { size: 5, opacity: 0.4 }; // ... and on the ceiling round its fitting (m)
const WALL_GLOW = { size: 2.4, opacity: 0.3 }; // the light an emergency lamp throws on its wall (m)
// The wall pictures. The first is the plainest and comes up most (WALL_PLAIN_SHARE of the walls, and the walls above
// a boss room); the others share the rest equally, so the racks are listed twice and the pictures that catch the eye
// (the plate, the monitor) once
type WallPic = 'panel' | 'mesh' | 'blank' | 'cable' | 'vent' | 'trunk' | 'plate' | 'monitor';
const DATA_WALLS: WallPic[] = ['panel', 'mesh', 'blank', 'cable', 'vent', 'mesh', 'blank', 'trunk', 'plate', 'monitor'];
const RACK_PICS: WallPic[] = ['mesh', 'blank', 'cable']; // the walls that are a row of racks
const BARE_PICS: WallPic[] = ['panel', 'trunk']; // the walls with room for cables up them
const DATA_FLOORS = 5; // 0 bare panels, 1 perforated panels, 2 a cable cut-out, 3 dust and scraps, 4 a leak
const RACK = { top: 3.3, foot: 0.12, n: 3 }; // a row of racks on a wall: its top and its plinth (m), racks per tile
// patch cables, dulled by dust: grey, blue, yellow, red, black (the pictures and the props use the same ones)
const CABLES = [0x7b838a, 0x3f587a, 0x8a7a3c, 0x633a36, 0x2c3136];
const LEDS = ['#63c98a', '#63c98a', '#d7a23f', '#c9503f']; // the lamps of a rack: mostly green
const HAZARD_RED = '#b8261f';
const HAZARD_WHITE = '#d9dee2';

// a thin joint between two panels (across the picture, or down it): a dark line with a light one beside it
function joint(g: CanvasRenderingContext2D, x: number, y: number, len: number, down: boolean, dark = 0.4) {
  g.fillStyle = `rgba(16,24,32,${dark})`;
  g.fillRect(x, y, down ? 1.5 : len, down ? len : 1.5);
  g.fillStyle = `rgba(255,255,255,${dark * 0.3})`;
  g.fillRect(down ? x + 1.5 : x, down ? y : y + 1.5, down ? 1 : len, down ? len : 1);
}
// a small lamp behind a rack's door: a dot and a faint halo
function led(g: CanvasRenderingContext2D, x: number, y: number, color: string) {
  g.globalAlpha = 0.22;
  g.fillStyle = color;
  oval(g, x, y, 4, 4 * WALL_ASPECT);
  g.globalAlpha = 1;
  g.fillRect(x - 1.1, y - 0.8, 2.2, 1.6);
}
// pale wall panels over the whole picture: their joints stay clear of the picture's edges, a dark skirting at the foot
function panels(g: CanvasRenderingContext2D, rand: () => number) {
  const bg = g.createLinearGradient(0, 0, 0, TEX);
  bg.addColorStop(0, '#5d6973');
  bg.addColorStop(0.35, '#6f7c87');
  bg.addColorStop(1, '#5b6670');
  g.fillStyle = bg;
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 90, '#8794a0', '#333c45');
  for (const x of [TEX / 6, TEX / 2, (TEX * 5) / 6]) joint(g, x, 0, TEX, true);
  joint(g, 0, rowOf(3.6), TEX, false);
  // dust that has run down from the joints
  for (let k = 0; k < 9; k++) {
    const len = 30 + rand() * 90,
      y = rand() < 0.5 ? rowOf(3.6) : 0,
      st = g.createLinearGradient(0, y, 0, y + len);
    st.addColorStop(0, 'rgba(34,42,50,.3)');
    st.addColorStop(1, 'rgba(34,42,50,0)');
    g.fillStyle = st;
    g.fillRect(rand() * TEX, y, 2 + rand() * 7, len);
  }
  g.fillStyle = '#2f373e';
  g.fillRect(0, rowOf(0.28), TEX, TEX - rowOf(0.28));
  g.fillStyle = 'rgba(255,255,255,.16)';
  g.fillRect(0, rowOf(0.28), TEX, 1.5);
}
// the door of a rack: perforated sheet, the machines behind it showing as faint bars, a lamp on some of them
function meshDoor(g: CanvasRenderingContext2D, rand: () => number, x: number, y: number, w: number, h: number) {
  g.fillStyle = '#3b444c';
  g.fillRect(x, y, w, h);
  const live = rand() < 0.7; // some racks are dead
  const lamps: [number, number, string][] = [];
  for (let by = y + 5; by < y + h - 6; by += 7) {
    if (rand() < 0.2) continue;
    g.fillStyle = 'rgba(132,146,158,.2)';
    g.fillRect(x + 4, by, w - 12, 4.5);
    if (live && rand() < 0.3)
      lamps.push([x + 8 + rand() * (w - 22), by + 2.2, LEDS[Math.floor(rand() * LEDS.length)]!]);
  }
  g.fillStyle = 'rgba(8,12,16,.5)';
  for (let py = y + 2, row = 0; py < y + h - 2; py += 3, row++)
    for (let px = x + 3 + (row % 2 ? 2 : 0); px < x + w - 7; px += 4) g.fillRect(px, py, 2, 1.5);
  lamps.forEach(([lx, ly, c]) => led(g, lx, ly, c));
  // the handle and its lock
  g.fillStyle = '#1b2025';
  g.fillRect(x + w - 6.5, rowOf(1.85), 4.5, rowOf(1.2) - rowOf(1.85));
  g.fillStyle = '#a7b0b7';
  g.fillRect(x + w - 5.5, rowOf(1.8), 2.2, rowOf(1.3) - rowOf(1.8));
}
// the two rails of an open rack, with their rows of holes
function rails(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  g.fillStyle = '#12161a';
  g.fillRect(x, y, w, h);
  for (const rx of [x, x + w - 4.5]) {
    g.fillStyle = '#515a62';
    g.fillRect(rx, y, 4.5, h);
    g.fillStyle = 'rgba(8,12,16,.7)';
    for (let py = y + 2; py < y + h - 2; py += 3) g.fillRect(rx + 1.5, py, 1.5, 1.2);
  }
}
// an open rack filled with blanking plates: a dead machine or an empty space here and there
const BLANKS = ['#4b545c', '#535c64', '#454e56'];
function blankRack(g: CanvasRenderingContext2D, rand: () => number, x: number, y: number, w: number, h: number) {
  rails(g, x, y, w, h);
  for (let py = y + 2; py < y + h - 5;) {
    const ph = [4.5, 4.5, 7.5, 10.5, 15][Math.floor(rand() * 5)]!,
      what = rand();
    if (what > 0.1) {
      const machine = what < 0.28;
      g.fillStyle = machine ? '#30373d' : BLANKS[Math.floor(rand() * BLANKS.length)]!;
      g.fillRect(x + 1, py, w - 2, ph);
      g.fillStyle = 'rgba(255,255,255,.13)';
      g.fillRect(x + 1, py, w - 2, 1);
      g.fillStyle = 'rgba(0,0,0,.45)';
      for (const sx of [x + 2.5, x + w - 4]) g.fillRect(sx, py + ph / 2 - 0.6, 1.5, 1.2);
      if (machine) {
        // its drive bays, and a lamp that may still be lit
        g.fillStyle = 'rgba(10,14,18,.6)';
        for (let bx = x + 8; bx < x + w - 22; bx += 7) g.fillRect(bx, py + 1.5, 5.5, ph - 3);
        if (rand() < 0.4) led(g, x + w - 12, py + ph / 2, LEDS[Math.floor(rand() * LEDS.length)]!);
      }
    }
    py += ph + 1;
  }
}
// an open rack of patch panels: the cables looped from the ports to the sides and down in bundles
function cableRack(g: CanvasRenderingContext2D, rand: () => number, x: number, y: number, w: number, h: number) {
  rails(g, x, y, w, h);
  g.lineCap = 'round';
  for (let py = y + 6; py < y + h - 30; py += 19 + rand() * 12) {
    g.fillStyle = '#5a636b';
    g.fillRect(x + 1, py, w - 2, 5);
    g.fillStyle = 'rgba(10,14,18,.75)';
    for (let px = x + 8; px < x + w - 9; px += 4.5) g.fillRect(px, py + 1.5, 3, 2.2);
    for (let px = x + 9.5; px < x + w - 9; px += 4.5) {
      if (rand() < 0.45) continue;
      const side = px < x + w / 2 ? x + 7 + rand() * 4 : x + w - 7 - rand() * 4,
        drop = 10 + rand() * 16;
      g.strokeStyle = css(CABLES[Math.floor(rand() * CABLES.length)]!);
      g.lineWidth = 1.3;
      g.beginPath();
      g.moveTo(px, py + 4);
      g.bezierCurveTo(px, py + 4 + drop, side, py + 6, side, py + 8 + drop);
      g.stroke();
    }
  }
  // the bundles down both sides, and a few cables hanging loose at the foot
  for (const [bx, dir] of [
    [x + 7, 1],
    [x + w - 7, -1],
  ] as [number, number][])
    for (let n = 0; n < 4; n++) {
      g.strokeStyle = css(CABLES[Math.floor(rand() * CABLES.length)]!);
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(bx + n * 1.6 * dir, y + 14 + rand() * 20);
      g.lineTo(bx + n * 1.6 * dir, y + h - 2 - rand() * 14);
      g.stroke();
    }
  for (let n = 0; n < 3; n++) {
    const lx = x + 16 + rand() * (w - 32),
      ly = y + h - 26 - rand() * 12;
    g.strokeStyle = css(CABLES[Math.floor(rand() * CABLES.length)]!);
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(lx, ly);
    g.bezierCurveTo(lx - 8, ly + 26, lx + 14, ly + 30, lx + 10 - rand() * 20, y + h - 1);
    g.stroke();
  }
}
// a row of racks along the foot of a wall, each with its number on a small plate
function racks(g: CanvasRenderingContext2D, rand: () => number, pic: WallPic) {
  const top = rowOf(RACK.top),
    foot = rowOf(RACK.foot),
    w = TEX / RACK.n;
  g.fillStyle = 'rgba(12,18,24,.35)'; // their shadow on the wall above
  g.fillRect(0, top - 12, TEX, 12);
  g.fillStyle = '#1c2126';
  g.fillRect(0, foot, TEX, TEX - foot);
  for (let n = 0; n < RACK.n; n++) {
    const x = n * w;
    g.fillStyle = '#2b3239';
    g.fillRect(x, top, w, foot - top);
    g.fillStyle = 'rgba(255,255,255,.14)';
    g.fillRect(x, top, w, 1.5);
    g.fillRect(x, top, 1.2, foot - top);
    g.fillStyle = 'rgba(0,0,0,.5)';
    g.fillRect(x + w - 1.5, top, 1.5, foot - top);
    const ix = x + 5,
      iy = top + 13,
      iw = w - 10,
      ih = foot - iy - 3;
    if (pic === 'mesh') meshDoor(g, rand, ix, iy, iw, ih);
    else if (pic === 'blank') blankRack(g, rand, ix, iy, iw, ih);
    else cableRack(g, rand, ix, iy, iw, ih);
    g.fillStyle = '#c3cbd1';
    g.fillRect(x + w / 2 - 15, top + 3.5, 30, 7);
    g.fillStyle = '#20262c';
    words(
      g,
      DATA_RACK_IDS[Math.floor(rand() * DATA_RACK_IDS.length)]!,
      x + w / 2,
      top + 7.3,
      8.5,
      WALL_ASPECT,
      'sans-serif',
    );
  }
}
const dataWall =
  (pic: WallPic): Paint =>
  (g, rand) => {
    panels(g, rand);
    if (RACK_PICS.includes(pic)) racks(g, rand, pic);
    else if (pic === 'vent') {
      // the grille of the air return, low on the wall, grey with dust; a thermostat beside it
      const x = 54,
        w = 132,
        y = rowOf(1.75),
        h = rowOf(0.42) - y;
      g.fillStyle = '#4a535b';
      g.fillRect(x - 5, y - 3.5, w + 10, h + 7);
      g.fillStyle = '#161b20';
      g.fillRect(x, y, w, h);
      for (let sy = y + 1; sy < y + h - 2; sy += 4.4) {
        g.fillStyle = '#808b93';
        g.fillRect(x, sy, w, 2.2);
        g.fillStyle = 'rgba(255,255,255,.2)';
        g.fillRect(x, sy, w, 0.8);
      }
      g.fillStyle = '#4a535b';
      g.fillRect(x + w / 2 - 2, y, 4, h);
      const dust = g.createLinearGradient(0, y + h, 0, y + h + 22);
      dust.addColorStop(0, 'rgba(34,42,50,.35)');
      dust.addColorStop(1, 'rgba(34,42,50,0)');
      g.fillStyle = dust;
      g.fillRect(x, y + h + 3, w, 22);
      g.fillStyle = '#b3bcc2';
      g.fillRect(212, rowOf(1.72), 15, 9);
      g.fillStyle = '#39424a';
      g.fillRect(215, rowOf(1.72) + 2.2, 9, 2.6);
    } else if (pic === 'trunk') {
      // plastic trunking along the wall, a drop from it to a socket box near the floor
      const y = rowOf(3.05);
      g.fillStyle = 'rgba(16,24,32,.3)';
      g.fillRect(0, y + 7, TEX, 3);
      g.fillStyle = '#a9b2b9';
      g.fillRect(0, y, TEX, 7);
      g.fillStyle = 'rgba(255,255,255,.3)';
      g.fillRect(0, y, TEX, 1.3);
      g.fillStyle = 'rgba(16,24,32,.3)';
      g.fillRect(176, y + 7, 3, rowOf(0.75) - y - 7);
      g.fillStyle = '#a9b2b9';
      g.fillRect(167, y + 7, 9, rowOf(0.75) - y - 7);
      g.fillStyle = '#5c666e';
      g.fillRect(159, rowOf(0.78), 25, 13);
      g.fillStyle = '#171c21';
      for (const sx of [163.5, 173.5]) g.fillRect(sx, rowOf(0.78) + 3.5, 6, 6);
      for (const jx of [60, 196]) joint(g, jx, y, 7, true, 0.3);
    } else if (pic === 'plate') {
      // the zone's plate at eye height: its code on a blue band, a caution under it; a small maker's plate below
      const x = 80,
        w = 96,
        y = rowOf(2.85),
        h = rowOf(1.8) - y,
        band = h * 0.42;
      g.fillStyle = 'rgba(12,18,24,.4)';
      g.fillRect(x + 2, y + 2, w, h);
      g.fillStyle = '#cdd4d9';
      g.fillRect(x, y, w, h);
      g.fillStyle = '#2f5a84';
      g.fillRect(x, y, w, band);
      g.fillStyle = '#e4e9ec';
      words(g, DATA_PLATE_ZONE, x + w / 2, y + band / 2 + 0.5, 21, WALL_ASPECT);
      g.fillStyle = '#22303d';
      words(g, DATA_PLATE_CAUTION, x + w / 2, y + band + (h - band) / 2 + 0.5, 16, WALL_ASPECT);
      g.fillStyle = 'rgba(40,48,56,.28)'; // dusty at the foot, a corner peeling
      g.fillRect(x, y + h - 5, w, 5);
      g.fillStyle = '#7f8a92';
      g.beginPath();
      g.moveTo(x + w, y);
      g.lineTo(x + w - 9, y);
      g.lineTo(x + w, y + 6);
      g.fill();
      g.fillStyle = '#4c555d';
      g.fillRect(x + 28, rowOf(1.45), 40, 9);
      g.fillStyle = 'rgba(214,222,228,.5)';
      for (let n = 0; n < 3; n++) g.fillRect(x + 32, rowOf(1.45) + 2 + n * 2.3, 32 - n * 9, 0.9);
    } else if (pic === 'monitor') {
      // a monitor on a bracket, dead, its glass cracked; a shelf with a keyboard under it
      const x = 78,
        w = 100,
        y = rowOf(2.9),
        h = rowOf(1.75) - y;
      g.fillStyle = '#39424a';
      g.fillRect(TEX / 2 - 3, y + h, 6, rowOf(0.28) - y - h); // its cable duct down to the skirting
      g.fillStyle = 'rgba(12,18,24,.4)';
      g.fillRect(x + 3, y + 3, w, h);
      g.fillStyle = '#23292f';
      g.fillRect(x, y, w, h);
      const glass = g.createLinearGradient(x, y, x + w, y + h);
      glass.addColorStop(0, '#18212a');
      glass.addColorStop(0.5, '#0d1318');
      glass.addColorStop(1, '#141c24');
      g.fillStyle = glass;
      g.fillRect(x + 4, y + 3, w - 8, h - 8);
      g.save();
      g.beginPath();
      g.rect(x + 4, y + 3, w - 8, h - 8);
      g.clip();
      g.fillStyle = 'rgba(190,210,225,.07)'; // the room in the glass
      g.beginPath();
      g.moveTo(x + 14, y);
      g.lineTo(x + 40, y);
      g.lineTo(x + 18, y + h);
      g.lineTo(x - 8, y + h);
      g.fill();
      const cx = x + w * 0.66,
        cy = y + h * 0.4;
      g.strokeStyle = 'rgba(196,210,220,.6)';
      g.lineWidth = 0.9;
      for (let n = 0; n < 9; n++) {
        const a = (n / 9) * Math.PI * 2 + rand() * 0.5,
          len = 14 + rand() * 46;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a) * len * 0.5 + (rand() - 0.5) * 6, cy + Math.sin(a) * len * 0.5 * WALL_ASPECT);
        g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len * WALL_ASPECT + (rand() - 0.5) * 4);
        g.stroke();
      }
      g.fillStyle = 'rgba(196,210,220,.5)';
      oval(g, cx, cy, 2.5, 2.5 * WALL_ASPECT);
      g.restore();
      g.fillStyle = '#4a535b';
      g.fillRect(x + 8, rowOf(1.3), w - 16, 4);
      g.fillStyle = '#2b3239';
      g.fillRect(x + 20, rowOf(1.3) - 3, w - 44, 3);
      g.fillStyle = 'rgba(12,18,24,.35)';
      g.fillRect(x + 8, rowOf(1.3) + 4, w - 16, 3);
    }
    // the ceiling's shadow at the top, the floor's at the foot
    const shade = g.createLinearGradient(0, 0, 0, TEX);
    shade.addColorStop(0, 'rgba(10,16,22,.4)');
    shade.addColorStop(0.16, 'rgba(10,16,22,0)');
    shade.addColorStop(0.88, 'rgba(10,16,22,0)');
    shade.addColorStop(1, 'rgba(10,16,22,.3)');
    g.fillStyle = shade;
    g.fillRect(0, 0, TEX, TEX);
    grain(g, rand, 16);
  };

const FLOOR_PANEL = TEX / 8; // a panel of the raised floor is half a metre (px)
// a cable lying on the floor: its shadow, then the cable
function floorCable(g: CanvasRenderingContext2D, pts: [number, number][], color: string, width: number) {
  for (const [off, c, w] of [
    [1.6, 'rgba(8,12,16,.45)', width + 1],
    [0, color, width],
  ] as [number, string, number][]) {
    g.strokeStyle = c;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(pts[0]![0] + off, pts[0]![1] + off);
    g.bezierCurveTo(
      pts[1]![0] + off,
      pts[1]![1] + off,
      pts[2]![0] + off,
      pts[2]![1] + off,
      pts[3]![0] + off,
      pts[3]![1] + off,
    );
    g.stroke();
  }
}
// The raised floor: the same panels under every variant (the painter is given the same seed for all of them). The
// joints are half a panel in from the picture's edge and faint, and the stains run on across the edge, so the floor
// reads as one surface and not as tiles
const dataFloor =
  (variant: number): Paint =>
  (g, rand) => {
    g.fillStyle = '#515b64';
    g.fillRect(0, 0, TEX, TEX);
    // each panel a shade of its own (the ones on the edge are drawn on both sides of it)
    for (let a = 0; a < 8; a++)
      for (let b = 0; b < 8; b++) {
        g.fillStyle = rand() < 0.5 ? `rgba(255,255,255,${rand() * 0.05})` : `rgba(10,16,22,${rand() * 0.07})`;
        for (const ox of [0, -TEX])
          for (const oy of [0, -TEX])
            g.fillRect(FLOOR_PANEL * (a + 0.5) + ox, FLOOR_PANEL * (b + 0.5) + oy, FLOOR_PANEL, FLOOR_PANEL);
      }
    for (let k = 0; k < 40; k++) {
      const dark = rand() < 0.55;
      smudge(
        g,
        rand() * TEX,
        rand() * TEX,
        14 + rand() * 46,
        10 + rand() * 30,
        dark ? '20,26,32' : '132,144,154',
        0.06 + rand() * 0.12,
      );
    }
    for (let k = 0; k < 160; k++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(20,26,32,.35)' : 'rgba(190,200,208,.25)';
      g.fillRect(rand() * TEX, rand() * TEX, 1 + rand() * 2, 1 + rand() * 2);
    }
    for (let p = FLOOR_PANEL / 2; p < TEX; p += FLOOR_PANEL) {
      joint(g, p, 0, TEX, true, 0.16);
      joint(g, 0, p, TEX, false, 0.16);
    }
    // everything below stays clear of the picture's edge
    const at = (n: number) => FLOOR_PANEL * (n + 0.5); // the joint before panel n
    if (variant === 1) {
      // four perforated panels, where the cold air came up
      const x = at(2),
        y = at(3),
        s = FLOOR_PANEL * 2;
      g.fillStyle = '#4d565d';
      g.fillRect(x, y, s, s);
      g.fillStyle = 'rgba(12,16,20,.7)';
      for (let py = y + 3; py < y + s - 2; py += 4)
        for (let px = x + 3; px < x + s - 2; px += 4)
          if ((px - x) % FLOOR_PANEL > 3 && (py - y) % FLOOR_PANEL > 3) g.fillRect(px, py, 2, 2);
      joint(g, x + FLOOR_PANEL, y, s, true, 0.5);
      joint(g, x, y + FLOOR_PANEL, s, false, 0.5);
      g.strokeStyle = 'rgba(12,16,20,.5)';
      g.lineWidth = 1.5;
      g.strokeRect(x, y, s, s);
    } else if (variant === 2) {
      // a panel with a cut-out, cables coming up through it and lying across the floor
      const x = at(3),
        y = at(3);
      g.fillStyle = '#7b858c';
      g.fillRect(x + 3, y + 3, FLOOR_PANEL - 6, FLOOR_PANEL - 6);
      g.fillStyle = '#0d1114';
      g.fillRect(x + 6, y + 6, FLOOR_PANEL - 12, FLOOR_PANEL - 12);
      g.lineCap = 'round';
      const cx = x + FLOOR_PANEL / 2,
        cy = y + FLOOR_PANEL / 2;
      for (let n = 0; n < 4; n++) {
        const a = rand() * Math.PI * 2,
          len = 60 + rand() * 40,
          ex = Math.min(TEX - 36, Math.max(36, cx + Math.cos(a) * len)),
          ey = Math.min(TEX - 36, Math.max(36, cy + Math.sin(a) * len));
        floorCable(
          g,
          [
            [cx + (rand() - 0.5) * 8, cy + (rand() - 0.5) * 8],
            [cx + (rand() - 0.5) * 90, cy + (rand() - 0.5) * 90],
            [ex + (rand() - 0.5) * 70, ey + (rand() - 0.5) * 70],
            [ex, ey],
          ],
          css(CABLES[n % CABLES.length]!),
          2,
        );
        g.fillStyle = '#20262c'; // its plug
        g.fillRect(ex - 2.5, ey - 2.5, 5, 5);
      }
    } else if (variant === 3) {
      // dust drifted into heaps, and scraps of paper
      for (let k = 0; k < 9; k++)
        smudge(g, 60 + rand() * 136, 60 + rand() * 136, 16 + rand() * 30, 10 + rand() * 18, '176,184,190', 0.28);
      for (let k = 0; k < 5; k++) {
        g.save();
        g.translate(50 + rand() * 156, 50 + rand() * 156);
        g.rotate(rand() * Math.PI);
        g.fillStyle = 'rgba(8,12,16,.3)';
        g.fillRect(-4, -5, 10, 13);
        g.fillStyle = '#aeb6bc';
        g.fillRect(-5, -6.5, 10, 13);
        g.fillStyle = 'rgba(60,70,80,.5)';
        for (let n = 0; n < 4; n++) g.fillRect(-3.5, -4.5 + n * 2.5, 7 - (n % 2) * 2, 0.8);
        g.restore();
      }
    } else if (variant === 4) {
      // a leak dried into a dark stain with a pale rim
      const cx = 100 + rand() * 56,
        cy = 100 + rand() * 56;
      for (let k = 0; k < 6; k++) {
        const px = cx + (rand() - 0.5) * 64,
          py = cy + (rand() - 0.5) * 64,
          r = 18 + rand() * 26;
        smudge(g, px, py, r + 5, (r + 5) * 0.7, '168,178,186', 0.18);
        smudge(g, px, py, r, r * 0.7, '22,28,34', 0.6);
      }
    }
    grain(g, rand, 14);
  };
// the top of a deck or a ramp: studded rubber matting with a pale edge strip, so where a deck ends shows
const dataDeck: Paint = (g, rand) => {
  g.fillStyle = '#4f5961';
  g.fillRect(0, 0, TEX, TEX);
  grime(g, rand, 70, '#727d86', '#1e252b');
  for (let y = 8, row = 0; y < TEX; y += 12, row++)
    for (let x = row % 2 ? 14 : 8; x < TEX; x += 12) {
      g.fillStyle = 'rgba(8,12,16,.4)';
      oval(g, x + 0.9, y + 0.9, 3, 3);
      g.fillStyle = 'rgba(150,164,174,.5)';
      oval(g, x, y, 2.6, 2.6);
    }
  const band = 11;
  g.fillStyle = '#a3aeb6';
  g.fillRect(0, 0, TEX, band);
  g.fillRect(0, TEX - band, TEX, band);
  g.fillRect(0, 0, band, TEX);
  g.fillRect(TEX - band, 0, band, TEX);
  g.strokeStyle = '#35607f';
  g.lineWidth = 3;
  g.strokeRect(band + 1.5, band + 1.5, TEX - band * 2 - 3, TEX - band * 2 - 3);
  g.fillStyle = 'rgba(20,28,36,.22)'; // worn
  for (let k = 0; k < 26; k++) g.fillRect(rand() * TEX, rand() < 0.5 ? 0 : TEX - band, 6 + rand() * 22, band);
  grain(g, rand, 16);
};
// The ceiling from below: hung panels on a grid of bars, and along one way of the room a cable ladder and an air
// duct, which run on from tile to tile
const dataCeiling: Paint = (g, rand) => {
  g.fillStyle = '#353d44';
  g.fillRect(0, 0, TEX, TEX);
  // the panels: speckled, a few stained
  for (let k = 0; k < 500; k++) {
    g.fillStyle = 'rgba(14,20,26,.3)';
    g.fillRect(rand() * TEX, rand() * TEX, 1.4, 1.4);
  }
  grime(g, rand, 40, '#444d55', '#20272d');
  for (let p = TEX / 8; p < TEX; p += TEX / 4) {
    g.fillStyle = '#4c565e';
    g.fillRect(p - 1.5, 0, 3, TEX);
    g.fillRect(0, p - 1.5, TEX, 3);
  }
  // the duct: galvanised sheet, lit along its middle, a joint every two metres and one grille
  const dy = 150,
    dh = 58,
    duct = g.createLinearGradient(0, dy, 0, dy + dh);
  g.fillStyle = 'rgba(8,12,16,.4)';
  g.fillRect(0, dy - 6, TEX, dh + 12);
  duct.addColorStop(0, '#48525a');
  duct.addColorStop(0.45, '#687480');
  duct.addColorStop(1, '#434c54');
  g.fillStyle = duct;
  g.fillRect(0, dy, TEX, dh);
  for (const x of [64, 192]) {
    g.fillStyle = '#55606a';
    g.fillRect(x - 3, dy - 2, 6, dh + 4);
    g.fillStyle = 'rgba(8,12,16,.4)';
    g.fillRect(x + 3, dy, 1.5, dh);
  }
  g.fillStyle = '#20262c';
  g.fillRect(104, dy + 15, 48, dh - 30);
  g.fillStyle = '#7a858d';
  for (let x = 107; x < 150; x += 5) g.fillRect(x, dy + 15, 2, dh - 30);
  // the ladder: two rails, a rung every quarter of a metre, the cables lying on it
  const ly = 52,
    lh = 38;
  g.fillStyle = 'rgba(8,12,16,.35)';
  g.fillRect(0, ly - 4, TEX, lh + 8);
  g.fillStyle = '#5b666f';
  for (let x = 8; x < TEX; x += 16) g.fillRect(x - 1.5, ly, 3, lh);
  CABLES.forEach((c, n) => {
    g.fillStyle = css(c);
    g.fillRect(0, ly + 6 + n * 5.4, TEX, 4);
    g.fillStyle = 'rgba(10,16,22,.4)'; // seen from below, in their own shadow
    g.fillRect(0, ly + 6 + n * 5.4, TEX, 4);
  });
  g.fillStyle = '#6d7882';
  g.fillRect(0, ly, TEX, 3);
  g.fillRect(0, ly + lh - 3, TEX, 3);
  grain(g, rand, 12);
};
// One leaf of a server room door (a leaf is 2 m wide and a wall high, so its picture is stretched three times as
// tall): pale grey steel with a narrow window, a card reader, a push bar and a kick plate, louvres over head height.
// The boss room's is dark steel between red and white bands, red lamps in slits near the top, and the word "sealed"
// on a red plate below the height of the door's "BOSS" label (world/doors.ts BOSS_LABEL_Y), so the two do not cover
// each other
const dataDoor =
  (boss: boolean): Paint =>
  (g, rand) => {
    const steel = g.createLinearGradient(0, 0, TEX, 0);
    steel.addColorStop(0, boss ? '#2d3339' : '#6c7780');
    steel.addColorStop(0.5, boss ? '#3c444b' : '#828e98');
    steel.addColorStop(1, boss ? '#282e34' : '#66717b');
    g.fillStyle = steel;
    g.fillRect(0, 0, TEX, TEX);
    grime(g, rand, 90, boss ? '#58626a' : '#a5b0b8', '#20272d');
    // the frame, and the rail across the leaf above head height
    g.fillStyle = boss ? '#171b1f' : '#4d5860';
    g.fillRect(0, 0, 12, TEX);
    g.fillRect(TEX - 12, 0, 12, TEX);
    g.fillRect(0, 0, TEX, 7);
    g.fillRect(0, rowOf(boss ? 2.95 : 2.4) - 3, TEX, 6);
    if (boss) {
      g.fillRect(0, rowOf(4.55) - 3, TEX, 6);
      stripes(g, [12, rowOf(5.75), TEX - 24, rowOf(5.3) - rowOf(5.75)], 46, HAZARD_WHITE, HAZARD_RED);
      // the slits: red lamps behind them, their light on the plate round them
      const sy = rowOf(5.12),
        sh = rowOf(4.78) - sy;
      g.globalCompositeOperation = 'lighter';
      const halo = g.createLinearGradient(0, sy - 14, 0, sy + sh + 14);
      halo.addColorStop(0, 'rgba(255,40,30,0)');
      halo.addColorStop(0.5, 'rgba(255,40,30,.5)');
      halo.addColorStop(1, 'rgba(255,40,30,0)');
      g.fillStyle = halo;
      g.fillRect(12, sy - 14, TEX - 24, sh + 28);
      g.globalCompositeOperation = 'source-over';
      for (const x of [40, 108, 176]) {
        const lamp = g.createLinearGradient(0, sy, 0, sy + sh);
        lamp.addColorStop(0, '#d21f17');
        lamp.addColorStop(0.5, '#ffb0a4');
        lamp.addColorStop(1, '#d21f17');
        g.fillStyle = '#0e1114';
        g.fillRect(x - 3, sy - 1.5, 46, sh + 3);
        g.fillStyle = lamp;
        g.fillRect(x, sy, 40, sh);
      }
      // the red plate with the word, one character over the other
      const top = rowOf(2.85),
        foot = rowOf(1.1);
      g.fillStyle = HAZARD_RED;
      g.fillRect(40, top, TEX - 80, foot - top);
      g.strokeStyle = HAZARD_WHITE;
      g.lineWidth = 6;
      g.strokeRect(49, top + 3, TEX - 98, foot - top - 6);
      g.fillStyle = HAZARD_WHITE;
      const step = (foot - top) / DATA_SEALED.length;
      [...DATA_SEALED].forEach((ch, n) => words(g, ch, TEX / 2, top + step * (n + 0.5) + 2, 108, DOOR_ASPECT));
      stripes(g, [12, rowOf(0.85), TEX - 24, rowOf(0.15) - rowOf(0.85)], 46, HAZARD_WHITE, HAZARD_RED);
      // heavy bolts down both edges
      for (let y = 10; y < TEX; y += 14)
        for (const x of [6, TEX - 6]) {
          g.fillStyle = 'rgba(0,0,0,.6)';
          oval(g, x + 0.8, y + 0.4, 3.6, 3.6 * DOOR_ASPECT);
          g.fillStyle = '#6d7880';
          oval(g, x, y, 3, 3 * DOOR_ASPECT);
        }
    } else {
      // over the rail: a band in the zone's blue, and louvres near the top
      g.fillStyle = '#35607f';
      g.fillRect(12, rowOf(2.95), TEX - 24, rowOf(2.62) - rowOf(2.95));
      const ly = rowOf(5.3),
        lh = rowOf(4.3) - ly;
      g.fillStyle = '#20262c';
      g.fillRect(44, ly, TEX - 88, lh);
      for (let y = ly + 1; y < ly + lh - 1; y += 3.4) {
        g.fillStyle = '#7f8a92';
        g.fillRect(44, y, TEX - 88, 1.8);
      }
      // the narrow window at eye height: dark glass, the room's light slanting across it
      const wx = 100,
        ww = 56,
        wy = rowOf(2.1),
        wh = rowOf(1.3) - wy;
      g.fillStyle = '#3a444c';
      g.fillRect(wx - 7, wy - 2.5, ww + 14, wh + 5);
      g.fillStyle = '#121a21';
      g.fillRect(wx, wy, ww, wh);
      g.fillStyle = 'rgba(190,212,228,.16)';
      g.beginPath();
      g.moveTo(wx + 8, wy);
      g.lineTo(wx + 30, wy);
      g.lineTo(wx + 14, wy + wh);
      g.lineTo(wx, wy + wh);
      g.lineTo(wx, wy + wh * 0.6);
      g.fill();
      // the push bar, the card reader beside it (a small green lamp), the kick plate
      g.fillStyle = 'rgba(16,24,32,.4)';
      g.fillRect(34, rowOf(1.05) + 4, 150, 2);
      g.fillStyle = '#b9c2c9';
      g.fillRect(34, rowOf(1.05), 150, 4);
      g.fillStyle = '#262c32';
      g.fillRect(200, rowOf(1.32), 30, rowOf(0.95) - rowOf(1.32));
      g.fillStyle = '#4d5860';
      g.fillRect(205, rowOf(1.2), 20, rowOf(1.0) - rowOf(1.2));
      g.fillStyle = LEDS[0]!;
      oval(g, 215, rowOf(1.27), 3.2, 3.2 * DOOR_ASPECT);
      const kick = g.createLinearGradient(0, rowOf(0.6), 0, rowOf(0.08));
      kick.addColorStop(0, '#9aa5ad');
      kick.addColorStop(1, '#7a848c');
      g.fillStyle = kick;
      g.fillRect(12, rowOf(0.6), TEX - 24, rowOf(0.08) - rowOf(0.6));
      g.strokeStyle = 'rgba(40,50,60,.35)';
      g.lineWidth = 1;
      for (let k = 0; k < 16; k++) {
        const sx = 20 + rand() * (TEX - 60),
          sy = rowOf(0.55) + rand() * (rowOf(0.12) - rowOf(0.55));
        g.beginPath();
        g.moveTo(sx, sy);
        g.lineTo(sx + 8 + rand() * 26, sy + (rand() - 0.5) * 2);
        g.stroke();
      }
    }
    const dirt = g.createLinearGradient(0, 0, 0, TEX * 0.25);
    dirt.addColorStop(0, 'rgba(10,16,22,.45)');
    dirt.addColorStop(1, 'rgba(10,16,22,0)');
    g.fillStyle = dirt;
    g.fillRect(0, 0, TEX, TEX * 0.25);
    grain(g, rand, 16);
  };

// ---- the things on the walls and ceilings ----
// (all of them are above head height, EYE in src/data/level.ts, or flat against the wall, so nothing gets in front of
// the eye)
const DATA_PROPS: PropRule[] = [
  { id: 'tray', slots: ['wall'], blocks: false, count: [14, 20], gap: 2 },
  { id: 'bundle', slots: ['wall'], blocks: false, count: [20, 28], gap: 2 },
  { id: 'status', slots: ['wall'], blocks: false, count: [22, 30], gap: 2 },
  { id: 'emergency', slots: ['wall'], blocks: false, count: [8, 12], gap: 3 },
  { id: 'tube', slots: ['floor', 'center', 'corridor'], blocks: false, count: [16, 20], gap: 3 },
];
const TRAY = { len: 3.6, w: 0.5, y: 4.7, out: 0.34, rungs: 9 }; // a cable ladder along a wall, high up (m)
const BUNDLE = { r: 0.035, pitch: 0.085, out: 0.05, ties: [1.3, 3.1, 4.9] }; // cables up a wall, tied at these heights (m)
const STATUS_Y = RACK.top + 0.3; // a rack row's alarm unit, on the wall over the racks (m)
const EMERGENCY_Y = 3.7; // m
const TUBE = { len: 1.5, drop: 0.09 }; // a ceiling fitting's tubes (m)
// the tubes: cold white, some gone dim, one or two yellowed and about to fail (the pool under each is as bright as it is)
const TUBE_COLORS = [0xe3f0fb, 0xe3f0fb, 0xe3f0fb, 0xd3e3f2, 0x7d8b98, 0xa9a487];
const EMERGENCY_COLOR = 0xd9b77c;
const STATUS_LAMPS = [0x4fae74, 0xc2913a, 0xa8443a]; // an alarm unit's three lamps
const METAL = 0x89939b; // ladders, fittings
const HOUSING = 0x2a3036; // boxes, brackets
// Cable ladders along the walls under the ceiling, bundles of cables up the bare walls, a small alarm unit over some
// rack rows, emergency lamps on the walls with their glow, and tube fittings on the ceiling with a pool of light
// under each
function dataProps(plan: FloorPlan, group: THREE.Group, rng: Rng) {
  const { d, wallOf, of, add, pools } = propTools(plan, group, DATA_PROPS, rng),
    up = new THREE.Vector3(0, 1, 0);
  // the picture on the wall a wall slot is on
  const picOf = (s: WallSlot) => DATA_WALLS[variantOf(wallOf(s), DATA_WALLS.length, WALL_PLAIN_SHARE)]!;
  const metal = new THREE.MeshBasicMaterial({ color: METAL }),
    housing = new THREE.MeshBasicMaterial({ color: HOUSING }),
    tinted = new THREE.MeshBasicMaterial({ color: 0xffffff }), // takes each copy's own colour
    lights: Light[] = [];

  // cable ladders: two rails and their rungs on brackets, the cables lying on them, a box at each end where the
  // cables go into the wall
  const rail: THREE.Matrix4[] = [],
    rung: THREE.Matrix4[] = [],
    bracket: THREE.Matrix4[] = [],
    endBox: THREE.Matrix4[] = [],
    cable: THREE.Matrix4[] = [],
    cableColors: number[] = [];
  of('tray').forEach(s => {
    const turn = facing(s),
      y = TRAY.y + rng.rand(-0.2, 0.2);
    for (const side of [-1, 1]) {
      rail.push(pose(onWall(s, 0, TRAY.out + (side * TRAY.w) / 2, y), turn));
      bracket.push(pose(onWall(s, side * TRAY.len * 0.3, (TRAY.out + TRAY.w / 2) / 2, y - 0.07), turn));
      endBox.push(pose(onWall(s, (side * TRAY.len) / 2, TRAY.out / 2 + 0.14, y + 0.03), turn));
    }
    for (let n = 0; n < TRAY.rungs; n++)
      rung.push(pose(onWall(s, (n / (TRAY.rungs - 1) - 0.5) * (TRAY.len - 0.3), TRAY.out, y - 0.02), turn));
    CABLES.forEach((c, n) => {
      cable.push(pose(onWall(s, 0, TRAY.out + (n / (CABLES.length - 1) - 0.5) * (TRAY.w - 0.14), y + 0.05), turn));
      cableColors.push(c);
    });
  });
  add(new THREE.BoxGeometry(TRAY.len, 0.09, 0.035), metal, rail);
  add(new THREE.BoxGeometry(0.05, 0.03, TRAY.w), metal, rung);
  add(new THREE.BoxGeometry(0.06, 0.06, TRAY.out + TRAY.w / 2), housing, bracket);
  add(new THREE.BoxGeometry(0.34, 0.3, TRAY.out + 0.28), housing, endBox);
  add(new THREE.CylinderGeometry(0.045, 0.045, TRAY.len, 6).rotateZ(Math.PI / 2), tinted, cable, cableColors);

  // bundles: a few cables side by side up a bare wall, tied to it (the racks, plates and monitors stay clear)
  const strand: THREE.Matrix4[] = [],
    strandColors: number[] = [],
    tie: THREE.Matrix4[] = [];
  of('bundle')
    .filter(s => BARE_PICS.includes(picOf(s)))
    .forEach(s => {
      const off = rng.rand(-1.3, 1.3),
        turn = facing(s),
        count = rng.randi(3, 5);
      for (let n = 0; n < count; n++) {
        strand.push(pose(onWall(s, off + n * BUNDLE.pitch, BUNDLE.out, WALL_H / 2), turn));
        strandColors.push(rng.pick(CABLES));
      }
      for (const y of BUNDLE.ties)
        tie.push(
          pose(
            onWall(s, off + ((count - 1) * BUNDLE.pitch) / 2, BUNDLE.out, y),
            turn,
            new THREE.Vector3(count * BUNDLE.pitch + 0.08, 1, 1),
          ),
        );
    });
  add(new THREE.CylinderGeometry(BUNDLE.r, BUNDLE.r, WALL_H, 6), tinted, strand, strandColors);
  add(new THREE.BoxGeometry(1, 0.04, BUNDLE.out * 2 + 0.03), housing, tie);

  // alarm units: a small box on the wall over a row of racks, three dull lamps on it
  const unit: THREE.Matrix4[] = [],
    lamp: THREE.Matrix4[] = [],
    lampColors: number[] = [];
  of('status')
    .filter(s => RACK_PICS.includes(picOf(s)))
    .forEach(s => {
      const off = rng.rand(-1.2, 1.2),
        turn = facing(s);
      unit.push(pose(onWall(s, off, 0.04, STATUS_Y), turn));
      STATUS_LAMPS.forEach((c, n) => {
        if (rng.next() < 0.3) return; // out
        lamp.push(pose(onWall(s, off + (n - 1) * 0.13, 0.09, STATUS_Y), turn));
        lampColors.push(c);
      });
    });
  add(new THREE.BoxGeometry(0.5, 0.18, 0.08), housing, unit);
  add(new THREE.BoxGeometry(0.06, 0.06, 0.03), tinted, lamp, lampColors);

  // emergency lamps: a box with a dull warm lens, and its glow on the wall round it
  const box: THREE.Matrix4[] = [],
    lens: THREE.Matrix4[] = [],
    glow: THREE.Matrix4[] = [];
  of('emergency').forEach(s => {
    const off = rng.rand(-1, 1),
      turn = facing(s),
      p = onWall(s, off, 0.11, EMERGENCY_Y);
    box.push(pose(onWall(s, off, 0.05, EMERGENCY_Y), turn));
    lens.push(pose(p, turn));
    glow.push(pose(onWall(s, off, 0.03, EMERGENCY_Y), turn));
    lights.push({ x: p.x, z: p.z, color: EMERGENCY_COLOR, size: 0.5 });
  });
  add(new THREE.BoxGeometry(0.6, 0.3, 0.1), housing, box);
  add(new THREE.BoxGeometry(0.46, 0.16, 0.14), new THREE.MeshBasicMaterial({ color: EMERGENCY_COLOR }), lens);
  add(
    new THREE.PlaneGeometry(WALL_GLOW.size, WALL_GLOW.size),
    lightMat(poolTex(), WALL_GLOW.opacity, EMERGENCY_COLOR),
    glow,
  );

  // tube fittings (not where the ceiling is open): a tray on the ceiling with two tubes. The boss room's ceiling is
  // far above (HALL_H), so there only the pool of light is drawn
  const fitting: THREE.Matrix4[] = [],
    tube: THREE.Matrix4[] = [],
    tubeColors: number[] = [],
    halo: THREE.Matrix4[] = [],
    haloColors: number[] = [];
  of('tube')
    .filter(s => !plan.noCeil[s.j * d.W + s.i])
    .forEach(s => {
      const x = tileCenter(s.i),
        z = tileCenter(s.j),
        c = rng.pick(TUBE_COLORS),
        turn = rng.pick([0, Math.PI / 2]);
      lights.push({ x, z, color: c, size: 1 });
      if (plan.hall && s.room === plan.hall.room) return;
      fitting.push(pose(new THREE.Vector3(x, WALL_H - 0.03, z), turn));
      halo.push(pose(new THREE.Vector3(x, WALL_H - 0.01, z)));
      haloColors.push(c);
      for (const side of [-1, 1]) {
        const out = new THREE.Vector3(0, 0, side * 0.1).applyAxisAngle(up, turn);
        tube.push(pose(new THREE.Vector3(x + out.x, WALL_H - TUBE.drop, z + out.z), turn));
        tubeColors.push(c);
      }
    });
  add(new THREE.BoxGeometry(TUBE.len + 0.15, 0.06, 0.42), metal, fitting);
  add(new THREE.BoxGeometry(TUBE.len, 0.06, 0.08), tinted, tube, tubeColors);
  add(
    new THREE.PlaneGeometry(CEILING_GLOW.size, CEILING_GLOW.size).rotateX(Math.PI / 2),
    lightMat(poolTex(), CEILING_GLOW.opacity),
    halo,
    haloColors,
  );

  // the light the lamps throw on the ground: a soft pool of their colour
  pools(lights, POOL_OPACITY);
}

// the discarded data layer's look (world/looks.ts makes it the first time the sector is drawn)
export function dataLook(): Look {
  return {
    walls: DATA_WALLS.map((pic, v) => paint(1100 + v, dataWall(pic))),
    floors: Array.from({ length: DATA_FLOORS }, (_, v) => paint(1200, dataFloor(v))),
    deck: paint(1300, dataDeck),
    ceiling: paint(1400, dataCeiling),
    door: paint(1500, dataDoor(false)),
    bossDoor: paint(1501, dataDoor(true)),
    fog: 0x121a21,
    props: dataProps,
  };
}
