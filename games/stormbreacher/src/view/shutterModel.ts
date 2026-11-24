// The armour shutter before a target (SB-2052): a thick plate that rolls up. It is two vertex-coloured shapes, each one
// draw. The plate is centred on its own middle with its front at +z (toward the sea) and is as wide, as tall and as thick
// as the shutter's table says (data/battery.ts); its details stand out of the front a little. It is a stage prop and stops
// no shot. The colours are absolute (the material takes them as they are).
//
// The plate: a body with a plate bolted over it in panels, each ringed with rivets; vertical and horizontal I-beams over
// the seams and two crossed braces; a lifting bar along the foot, with lugs; a hazard-striped band over the bar and a
// strip down each edge; guide channels along both sides; dents, scorch, rust and chipped paint.
// The housing (the winding machine): the drum over the top of the plate, its end caps and bands, a gear case at each end
// with a toothed wheel, a motor and its chain, a cover over the drum, a warning lamp at each end and the cables. Its
// origin is the middle of its foot (the plate's top edge), so it stays put when the plate rolls up under it.
import * as THREE from 'three';
import { FORT_COLOR, SHUTTER_COLOR } from '../data/colors.ts';
import { createKit } from './modelKit.ts';

const RIVET = 0.05; // half a rivet's side (m)
const PANEL_W = 4; // about how wide a panel is (m)
const PANEL_H = 3.3; // about how tall (m)
const LIGHTEN = 1.7; // the plate's grey is lifted so its details read under the overcast light (it lit near black at 1)
const PROUD = 0.1; // how far a panel stands out of the body (m)
export const SHUTTER_HOUSING_HEIGHT = 1.9; // the housing's height over the plate's top edge (m)

export function shutterPlateGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const k = createKit(Math.round(w * 100 + h * 10 + d), 4);
  const { range, hex, box, bevelBox, decal } = k;
  const plate = hex(SHUTTER_COLOR, LIGHTEN);
  const plateWorn = hex(SHUTTER_COLOR, LIGHTEN * 0.82);
  const beam = hex(FORT_COLOR.shutterBeam, LIGHTEN);
  const rivetColor = hex(FORT_COLOR.shutterRivet, LIGHTEN);
  const gap = hex(FORT_COLOR.shutterDark);
  const yellow = hex(FORT_COLOR.hazardYellow);
  const black = hex(FORT_COLOR.hazardBlack);
  const rust = hex(FORT_COLOR.rust);
  const hw = w / 2;
  const hh = h / 2;
  const hd = d / 2;
  const front = hd + PROUD;
  const face = k.face([0, 0, front], [1, 0, 0], [0, 0, 1]);
  const FOOT = 1.1; // the lifting bar's height

  // the body, and the guide channels either side of it
  box(-hw, hw, -hh, hh, -hd, hd, gap);
  for (const sx of [-1, 1]) {
    const x = sx * hw;
    box(Math.min(x, x + sx * 0.32), Math.max(x, x + sx * 0.32), -hh, hh, -hd - 0.1, hd + 0.2, beam);
    box(Math.min(x, x + sx * 0.32), Math.max(x, x + sx * 0.32) - sx * 0.04, -hh, hh, hd + 0.2, hd + 0.3, beam);
    for (let y = -hh + 0.5; y < hh; y += 1.4) {
      rivet(sx * (hw + 0.16), y, hd + 0.3);
    }
  }
  function rivet(x: number, y: number, z: number, color = rivetColor): void {
    box(x - RIVET, x + RIVET, y - RIVET, y + RIVET, z, z + RIVET * 1.6, color);
  }

  // panels in columns and rows over the body, above the lifting bar
  const cols = Math.max(2, Math.round(w / PANEL_W));
  const rows = Math.max(2, Math.round((h - FOOT) / PANEL_H));
  const pw = w / cols;
  const ph = (h - FOOT) / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x0 = -hw + i * pw + 0.08;
      const x1 = -hw + (i + 1) * pw - 0.08;
      const y0 = -hh + FOOT + j * ph + 0.08;
      const y1 = -hh + FOOT + (j + 1) * ph - 0.08;
      bevelBox(x0, x1, y0, y1, hd - 0.02, hd + PROUD, 0.05, (i + j) % 2 === 0 ? plate : plateWorn);
      // rivets round the panel's edge
      const nx = Math.max(4, Math.round((x1 - x0) / 0.55));
      const ny = Math.max(3, Math.round((y1 - y0) / 0.55));
      for (let n = 0; n < nx; n++) {
        const x = x0 + 0.2 + ((x1 - x0 - 0.4) * n) / (nx - 1);
        rivet(x, y0 + 0.16, hd + PROUD - 0.01);
        rivet(x, y1 - 0.16, hd + PROUD - 0.01);
      }
      for (let n = 1; n < ny - 1; n++) {
        const y = y0 + 0.16 + ((y1 - y0 - 0.32) * n) / (ny - 1);
        rivet(x0 + 0.2, y, hd + PROUD - 0.01);
        rivet(x1 - 0.2, y, hd + PROUD - 0.01);
      }
    }
  }

  // I-beams over the seams: a web between two flanges
  const zb = front + 0.02;
  const ibeamV = (x: number) => {
    box(x - 0.05, x + 0.05, -hh + FOOT, hh, zb, zb + 0.24, beam);
    box(x - 0.2, x + 0.2, -hh + FOOT, hh, zb + 0.24, zb + 0.32, beam);
  };
  for (let i = 1; i < cols; i++) ibeamV(-hw + i * pw);
  for (let j = 1; j < rows; j++) {
    const y = -hh + FOOT + j * ph;
    box(-hw, hw, y - 0.05, y + 0.05, zb + 0.1, zb + 0.34, beam);
    box(-hw, hw, y - 0.2, y + 0.2, zb + 0.34, zb + 0.42, beam);
  }
  // two crossed braces on the middle columns' lower panels
  for (const c of [Math.floor(cols / 2) - 1, Math.floor(cols / 2)]) {
    const cx = -hw + (c + 0.5) * pw;
    const cy = -hh + FOOT + ph / 2;
    const slope = Math.atan2(ph - 0.5, pw - 0.5);
    const len = Math.hypot(pw - 0.5, ph - 0.5);
    for (const sgn of [-1, 1]) k.tilted([cx, cy, zb + 0.08], [len, 0.14, 0.12], 0, 0, sgn * slope, beam);
  }

  // the lifting bar along the foot, with its lugs and the hazard band over it
  bevelBox(-hw - 0.1, hw + 0.1, -hh, -hh + FOOT, hd - 0.05, hd + 0.35, 0.08, beam);
  const stripes = Math.round((w + 0.2) / 0.7);
  for (let i = 0; i < stripes; i++) {
    const x0 = -hw - 0.1 + (i * (w + 0.2)) / stripes;
    const x1 = -hw - 0.1 + ((i + 1) * (w + 0.2)) / stripes;
    const half = (x1 - x0) / 2;
    decal(
      face,
      [
        [x0, -hh + 0.15],
        [x1 - half * 0.2, -hh + 0.15],
        [x1 + half * 0.4, -hh + FOOT - 0.15],
        [x0 + half * 0.6, -hh + FOOT - 0.15],
      ],
      0.35 - PROUD + 0.02,
      i % 2 === 0 ? yellow : black,
    );
  }
  for (let i = 0; i < 5; i++) {
    const x = -hw + 0.8 + (i * (w - 1.6)) / 4;
    box(x - 0.18, x + 0.18, -hh + FOOT - 0.05, -hh + FOOT + 0.35, hd + 0.05, hd + 0.3, beam);
    rivet(x, -hh + FOOT + 0.2, hd + 0.3, rivetColor);
  }
  // a warning strip down each edge, in steps, and a band under the housing
  for (const sx of [-1, 1]) {
    for (let j = 0; j < Math.floor((h - FOOT - 0.6) / 0.5); j++) {
      const y0 = -hh + FOOT + 0.3 + j * 0.5;
      const u = sx * (hw - 0.55);
      decal(
        face,
        [
          [u - 0.25, y0],
          [u + 0.25, y0],
          [u + 0.25, y0 + 0.25],
          [u - 0.25, y0 + 0.25],
        ],
        0.01,
        j % 2 === 0 ? yellow : black,
      );
    }
  }
  for (let i = 0; i < Math.round(w / 0.6); i++) {
    const x0 = -hw + (i * w) / Math.round(w / 0.6);
    const dx = w / Math.round(w / 0.6);
    decal(
      face,
      [
        [x0, hh - 0.35],
        [x0 + dx * 0.8, hh - 0.35],
        [x0 + dx, hh - 0.08],
        [x0 + dx * 0.2, hh - 0.08],
      ],
      0.015,
      i % 2 === 0 ? yellow : black,
    );
  }

  // wear: dents with a bright rim, scorch, chipped paint and rust running from the rivets
  for (let n = 0; n < 14; n++) {
    const u = range(-hw + 0.6, hw - 0.6);
    const v = range(-hh + FOOT + 0.5, hh - 0.6);
    const r = range(0.12, 0.4);
    const points: [number, number][] = Array.from({ length: 7 }, (_, i) => {
      const a = (i / 7) * Math.PI * 2;
      const j = range(0.7, 1.2);
      return [u + Math.cos(a) * r * j, v + Math.sin(a) * r * j * 0.85] as [number, number];
    });
    decal(face, points, 0.02, hex(SHUTTER_COLOR, LIGHTEN * 1.3));
    decal(
      face,
      points.map(([pu, pv]) => [u + (pu - u) * 0.6, v + (pv - v) * 0.6] as [number, number]),
      0.03,
      gap,
    );
  }
  for (let n = 0; n < 7; n++) {
    const u = range(-hw + 0.6, hw - 0.6);
    const v = range(-hh + FOOT + 0.6, hh - 1);
    const r = range(0.5, 1.1);
    decal(
      face,
      [
        [u - r, v - r * 0.3],
        [u + r, v - r * 0.3],
        [u + r * 0.6, v + r * 0.8],
        [u - r * 0.5, v + r * 0.8],
      ],
      0.012,
      hex(FORT_COLOR.shutterDark, 1.5),
    );
  }
  for (let n = 0; n < 14; n++) {
    const u = -hw + range(0.3, 1) * w * 0.98;
    const v = range(-hh + FOOT + 0.5, hh - 0.5);
    const length = range(0.5, 1.6);
    const width = range(0.03, 0.07);
    decal(
      face,
      [
        [u - width, v],
        [u + width, v],
        [u + width * 0.5, v - length],
        [u - width * 0.5, v - length],
      ],
      0.04,
      rust,
    );
  }
  // the paint's chips: small bright flakes at the panels' edges
  for (let n = 0; n < 16; n++) {
    const u = range(-hw + 0.4, hw - 0.4);
    const v = range(-hh + FOOT + 0.4, hh - 0.4);
    const r = range(0.04, 0.1);
    decal(
      face,
      [
        [u - r, v - r],
        [u + r, v - r * 0.5],
        [u + r * 0.4, v + r],
      ],
      0.015,
      hex(SHUTTER_COLOR, LIGHTEN * 1.6),
    );
  }

  // the back: three flat bars, so the plate is not a blank slab from behind
  for (let i = 0; i < 3; i++) {
    const x = -hw + ((i + 0.5) * w) / 3;
    box(x - 0.15, x + 0.15, -hh, hh, -hd - 0.12, -hd, beam);
  }
  return k.geometry();
}

export function shutterHousingGeometry(w: number, d: number): THREE.BufferGeometry {
  const k = createKit(Math.round(w * 37 + d * 11), 4);
  const { hex, box, bevelBox, rod, sheet } = k;
  const beam = hex(FORT_COLOR.shutterBeam, LIGHTEN);
  const plate = hex(SHUTTER_COLOR, LIGHTEN * 0.9);
  const rivetColor = hex(FORT_COLOR.shutterRivet, LIGHTEN);
  const gap = hex(FORT_COLOR.shutterDark);
  const yellow = hex(FORT_COLOR.hazardYellow);
  const black = hex(FORT_COLOR.hazardBlack);
  const lens = hex(FORT_COLOR.lens);
  const hw = w / 2;
  const hd = d / 2;
  const H = SHUTTER_HOUSING_HEIGHT;
  const DRUM_Y = 0.95;
  const DRUM_Z = hd - 0.1;

  // the drum: a long roll with its bands and its end caps, and the cover over it
  rod([-hw + 0.9, DRUM_Y, DRUM_Z], [hw - 0.9, DRUM_Y, DRUM_Z], 0.62, 0.62, 16, hex(SHUTTER_COLOR, LIGHTEN * 0.75));
  const bands = Math.max(4, Math.round(w / 2));
  for (let i = 0; i <= bands; i++) {
    const x = -hw + 1.1 + (i * (w - 2.2)) / bands;
    rod([x - 0.07, DRUM_Y, DRUM_Z], [x + 0.07, DRUM_Y, DRUM_Z], 0.69, 0.69, 16, beam);
  }
  box(-hw + 0.9, hw - 0.9, 1.55, H, -hd - 0.35, hd + 0.4, plate); // the cover over the drum
  bevelBox(-hw - 0.05, hw + 0.05, H - 0.14, H, -hd - 0.4, hd + 0.45, 0.05, beam);
  box(-hw + 0.9, hw - 0.9, 0, 0.35, -hd - 0.35, -hd - 0.1, beam); // the back wall under it
  box(-hw + 0.9, hw - 0.9, 0.3, 1.7, -hd - 0.35, -hd - 0.3, gap);
  // hazard stripes along the cover's front lip
  const nStripe = Math.round((w - 1.8) / 0.5);
  for (let i = 0; i < nStripe; i++) {
    const x0 = -hw + 0.9 + (i * (w - 1.8)) / nStripe;
    const dx = (w - 1.8) / nStripe;
    sheet(
      [
        [x0, 1.57, hd + 0.405],
        [x0 + dx * 0.8, 1.57, hd + 0.405],
        [x0 + dx, 1.82, hd + 0.405],
        [x0 + dx * 0.2, 1.82, hd + 0.405],
      ],
      [0, 0, 1],
      i % 2 === 0 ? yellow : black,
    );
  }
  for (let i = 0; i < Math.round((w - 2) / 0.8); i++) {
    const x = -hw + 1 + (i * (w - 2)) / Math.round((w - 2) / 0.8);
    box(x - 0.05, x + 0.05, H - 0.2, H - 0.1, hd + 0.4, hd + 0.5, rivetColor);
  }

  // a gear case at each end: the box, its toothed wheel, the motor on the right with its chain
  for (const sx of [-1, 1]) {
    const x0 = sx * (hw - 0.9);
    const x1 = sx * (hw + 0.3);
    bevelBox(Math.min(x0, x1), Math.max(x0, x1), 0, H, -hd - 0.4, hd + 0.5, 0.1, plate);
    const xo = sx * (hw + 0.3);
    // the toothed wheel on the case's outer face: a hub and twelve teeth
    rod([xo, DRUM_Y, DRUM_Z], [xo + sx * 0.12, DRUM_Y, DRUM_Z], 0.5, 0.5, 14, beam);
    rod([xo + sx * 0.12, DRUM_Y, DRUM_Z], [xo + sx * 0.2, DRUM_Y, DRUM_Z], 0.18, 0.18, 8, rivetColor);
    for (let t = 0; t < 12; t++) {
      const a = (t / 12) * Math.PI * 2;
      const cx = xo + sx * 0.06;
      const cy = DRUM_Y + Math.sin(a) * 0.55;
      const cz = DRUM_Z + Math.cos(a) * 0.55;
      k.tilted([cx, cy, cz], [0.12, 0.16, 0.16], a, 0, 0, beam);
    }
    for (let i = 0; i < 4; i++) {
      const y = 0.3 + i * 0.45;
      box(Math.min(x0, x1) - 0.01, Math.max(x0, x1) + 0.01, y, y + 0.08, hd + 0.5, hd + 0.56, gap);
    }
    // two warning lamps on the case's top: a post and a yellow lens
    box(sx * (hw - 0.3) - 0.1, sx * (hw - 0.3) + 0.1, H, H + 0.22, hd - 0.15, hd + 0.05, beam);
    box(sx * (hw - 0.3) - 0.16, sx * (hw - 0.3) + 0.16, H + 0.22, H + 0.55, hd - 0.22, hd + 0.12, lens);
    box(sx * (hw - 0.3) - 0.2, sx * (hw - 0.3) + 0.2, H + 0.55, H + 0.62, hd - 0.26, hd + 0.16, beam);
  }
  // the motor on the right case: a body, a fan cowl, a shaft and the chain to the wheel
  const mx = hw + 0.3;
  rod([mx + 0.2, 1.3, DRUM_Z - 0.9], [mx + 1.0, 1.3, DRUM_Z - 0.9], 0.38, 0.38, 12, beam);
  rod([mx + 1.0, 1.3, DRUM_Z - 0.9], [mx + 1.15, 1.3, DRUM_Z - 0.9], 0.3, 0.3, 12, gap);
  box(mx + 0.2, mx + 1.0, 0.1, 0.9, DRUM_Z - 1.3, DRUM_Z - 0.5, beam);
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const px = mx + 0.2 + 0.05;
    const py = 1.3 + (DRUM_Y - 1.3) * t;
    const pz = DRUM_Z - 0.9 + 0.9 * t;
    k.tilted([px, py, pz], [0.06, 0.14, 0.12], 0, 0, 0, i % 2 === 0 ? rivetColor : beam);
  }
  // cables from the motor up to the lamps, clipped to the case
  rod([hw + 0.8, 1.7, DRUM_Z - 0.9], [hw - 0.3, H, hd - 0.15], 0.04, 0.04, 5, hex(0x1c1c1b));
  return k.geometry();
}
