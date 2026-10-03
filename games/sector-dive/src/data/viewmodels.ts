import type { ViewmodelDef } from '@engine/render/render.ts';
// The gun in hand for each weapon, built from boxes and cylinders by buildViewmodel (engine/src/render/render.ts).
// Sizes and positions are in metres in camera space (-z is forward). part: [shape, ...size, material, x, y, z]
//   'box' size = w, h, d / 'cyl' size = r, len (along the barrel)
//   material: dark / darker (body colours below) or acc (the weapon's colour)
// tip: the muzzle (bullets and the flash start here), pos: where the gun sits on screen, flash: muzzle flash radius
export const VM_COLORS = { dark: 0x1d2935, darker: 0x0f161d };
export const VIEWMODELS: Record<string, ViewmodelDef> = {
  pistol: {
    tip: [0, 0.01, -0.3],
    pos: [0.28, -0.28, -0.55],
    flash: 0.08,
    parts: [
      ['box', 0.1, 0.13, 0.34, 'dark', 0, 0, 0],
      ['box', 0.105, 0.025, 0.3, 'acc', 0, 0.05, 0],
      ['box', 0.05, 0.05, 0.12, 'darker', 0, 0.01, -0.22],
      ['box', 0.08, 0.2, 0.09, 'darker', 0, -0.13, 0.1],
    ],
  },
  smg: {
    tip: [0, 0.01, -0.4],
    pos: [0.3, -0.3, -0.6],
    flash: 0.08,
    parts: [
      ['box', 0.11, 0.14, 0.46, 'dark', 0, 0, 0],
      ['box', 0.115, 0.025, 0.38, 'acc', 0, 0.055, 0],
      ['box', 0.06, 0.22, 0.08, 'darker', 0, -0.17, -0.06],
      ['box', 0.06, 0.08, 0.2, 'darker', 0, -0.02, 0.3],
      ['box', 0.05, 0.05, 0.16, 'darker', 0, 0.01, -0.3],
    ],
  },
  shotgun: {
    tip: [0, 0.035, -0.7],
    pos: [0.3, -0.3, -0.55],
    flash: 0.08,
    parts: [
      ['box', 0.12, 0.13, 0.5, 'dark', 0, 0, 0.05],
      ['box', 0.075, 0.075, 0.55, 'darker', 0, 0.035, -0.42],
      ['box', 0.11, 0.08, 0.2, 'acc', 0, -0.045, -0.36],
      ['box', 0.09, 0.16, 0.12, 'darker', 0, -0.12, 0.2],
    ],
  },
  rail: {
    tip: [0, 0.01, -0.46],
    pos: [0.3, -0.3, -0.6],
    flash: 0.08,
    parts: [
      ['box', 0.09, 0.12, 0.72, 'dark', 0, 0, -0.05],
      ['box', 0.02, 0.02, 0.7, 'acc', 0.05, 0.07, -0.12],
      ['box', 0.02, 0.02, 0.7, 'acc', -0.05, 0.07, -0.12],
      // the rings stick out past the body and the rails, so no face lies flat on another (it would flicker)
      ['box', 0.14, 0.15, 0.03, 'acc', 0, 0.01, -0.12],
      ['box', 0.14, 0.15, 0.03, 'acc', 0, 0.01, -0.26],
      ['box', 0.14, 0.15, 0.03, 'acc', 0, 0.01, -0.4],
      ['box', 0.08, 0.18, 0.1, 'darker', 0, -0.13, 0.15],
    ],
  },
  launcher: {
    tip: [0, 0, -0.58],
    pos: [0.32, -0.25, -0.5],
    flash: 0.16,
    parts: [
      ['cyl', 0.12, 0.95, 'dark', 0, 0, -0.05],
      ['cyl', 0.135, 0.07, 'acc', 0, 0, -0.52],
      ['cyl', 0.135, 0.05, 'acc', 0, 0, 0.405], // ends 5 mm behind the tube so the two back faces don't overlap
      ['box', 0.04, 0.09, 0.12, 'darker', -0.12, 0.12, -0.1],
      ['box', 0.07, 0.18, 0.08, 'darker', 0, -0.18, 0.08],
    ],
  },
};
