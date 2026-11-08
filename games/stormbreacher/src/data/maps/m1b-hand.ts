// M1's B line and the front of C (SB-055), written by hand: every prop is one line so the shape can be read and
// edited without a tool. +z is the sea and -z is the land; the bounds stop before the seawall, which is not climbed yet.
import type { MapDef, Prop } from '../types.ts';

// The B line's three hedgehog rows leave three wide gaps, and C's last row leaves the same three. The spaces between
// them stay open as the mech's lanes.
const PROPS: Prop[] = [
  // the cliff along the right edge (x 100, clear of the depot at x 80)
  { kind: 'cliff', x: 100, z: 160, yaw: 0.1, scale: 1 },
  { kind: 'cliff', x: 100, z: 140, yaw: -0.2, scale: 1.1 },
  { kind: 'cliff', x: 100, z: 120, yaw: 0.3, scale: 0.95 },
  { kind: 'cliff', x: 100, z: 100, yaw: 0.15, scale: 1.05 },
  { kind: 'cliff', x: 100, z: 80, yaw: -0.1, scale: 1 },
  { kind: 'cliff', x: 100, z: 60, yaw: 0.25, scale: 1.1 },
  { kind: 'cliff', x: 100, z: 40, yaw: -0.3, scale: 0.9 },
  { kind: 'cliff', x: 100, z: 20, yaw: 0.2, scale: 1 },
  { kind: 'cliff', x: 100, z: 0, yaw: 0, scale: 1.05 },
  { kind: 'cliff', x: 100, z: -20, yaw: -0.2, scale: 1 },
  { kind: 'cliff', x: 100, z: -40, yaw: 0.1, scale: 0.95 },
  // low rocks along the sea's left edge (x -100)
  { kind: 'block', x: -98, z: 150, yaw: 0.2, scale: 0.8 },
  { kind: 'block', x: -98, z: 120, yaw: -0.1, scale: 0.9 },
  { kind: 'block', x: -98, z: 90, yaw: 0.3, scale: 0.75 },
  { kind: 'block', x: -98, z: 60, yaw: 0, scale: 0.85 },
  { kind: 'block', x: -98, z: 30, yaw: -0.25, scale: 0.8 },
  { kind: 'block', x: -98, z: 0, yaw: 0.15, scale: 0.9 },
  { kind: 'block', x: -98, z: -30, yaw: -0.1, scale: 0.75 },
  // B's first hedgehog row, z 124 (gaps near x -67, -4 and 63, each over 8 m wide)
  { kind: 'hedgehog', x: -96, z: 124, yaw: 0.1, scale: 1 },
  { kind: 'hedgehog', x: -82, z: 124, yaw: 0.5, scale: 1.1 },
  { kind: 'hedgehog', x: -52, z: 124, yaw: 0.9, scale: 0.9 },
  { kind: 'hedgehog', x: -38, z: 124, yaw: 1.3, scale: 1 },
  { kind: 'hedgehog', x: -24, z: 124, yaw: 1.7, scale: 1.05 },
  { kind: 'hedgehog', x: 16, z: 124, yaw: 2.1, scale: 0.95 },
  { kind: 'hedgehog', x: 30, z: 124, yaw: 2.5, scale: 1 },
  { kind: 'hedgehog', x: 44, z: 124, yaw: 2.9, scale: 1.1 },
  { kind: 'hedgehog', x: 82, z: 124, yaw: 0.3, scale: 0.9 },
  { kind: 'hedgehog', x: 96, z: 124, yaw: 0.7, scale: 1 },
  // B's second hedgehog row, z 136, offset half a step
  { kind: 'hedgehog', x: -90, z: 136, yaw: 0.2, scale: 1 },
  { kind: 'hedgehog', x: -76, z: 136, yaw: 0.6, scale: 1.05 },
  { kind: 'hedgehog', x: -46, z: 136, yaw: 1, scale: 0.95 },
  { kind: 'hedgehog', x: -32, z: 136, yaw: 1.4, scale: 1 },
  { kind: 'hedgehog', x: -18, z: 136, yaw: 1.8, scale: 1.1 },
  { kind: 'hedgehog', x: 10, z: 136, yaw: 2.2, scale: 0.9 },
  { kind: 'hedgehog', x: 24, z: 136, yaw: 2.6, scale: 1 },
  { kind: 'hedgehog', x: 38, z: 136, yaw: 3, scale: 1.05 },
  { kind: 'hedgehog', x: 76, z: 136, yaw: 0.4, scale: 0.95 },
  { kind: 'hedgehog', x: 90, z: 136, yaw: 0.8, scale: 1 },
  // B's cover: blocks and wrecks between the three approaches, with craters on the open ground
  { kind: 'block', x: -70, z: 100, yaw: 0.2, scale: 1 },
  { kind: 'block', x: -10, z: 85, yaw: -0.3, scale: 1.1 },
  { kind: 'block', x: 55, z: 75, yaw: 0.1, scale: 0.9 },
  { kind: 'block', x: -55, z: 40, yaw: 0.4, scale: 1 },
  { kind: 'block', x: 45, z: 25, yaw: -0.2, scale: 1.05 },
  { kind: 'wreck', x: -85, z: 118, yaw: 0.3, scale: 1 },
  { kind: 'wreck', x: 60, z: 118, yaw: -0.4, scale: 0.9 },
  { kind: 'wreck', x: -65, z: 25, yaw: 0.15, scale: 1 },
  { kind: 'wreck', x: 60, z: 35, yaw: 0.5, scale: 1.05 },
  { kind: 'crater', x: -25, z: 100, yaw: 0.1, scale: 1.1 },
  { kind: 'crater', x: 10, z: 110, yaw: 0.4, scale: 1 },
  { kind: 'crater', x: 35, z: 85, yaw: -0.2, scale: 0.9 },
  { kind: 'crater', x: -60, z: 60, yaw: 0.2, scale: 1.05 },
  { kind: 'crater', x: 55, z: 55, yaw: 0, scale: 1 },
  // C's last hedgehog row before the seawall, z -45 (the same three gaps)
  { kind: 'hedgehog', x: -96, z: -45, yaw: 0.15, scale: 1 },
  { kind: 'hedgehog', x: -82, z: -45, yaw: 0.55, scale: 1.1 },
  { kind: 'hedgehog', x: -52, z: -45, yaw: 0.95, scale: 0.9 },
  { kind: 'hedgehog', x: -38, z: -45, yaw: 1.35, scale: 1 },
  { kind: 'hedgehog', x: -24, z: -45, yaw: 1.75, scale: 1.05 },
  { kind: 'hedgehog', x: 16, z: -45, yaw: 2.15, scale: 0.95 },
  { kind: 'hedgehog', x: 30, z: -45, yaw: 2.55, scale: 1 },
  { kind: 'hedgehog', x: 44, z: -45, yaw: 2.95, scale: 1.1 },
  { kind: 'hedgehog', x: 82, z: -45, yaw: 0.35, scale: 0.9 },
  { kind: 'hedgehog', x: 96, z: -45, yaw: 0.75, scale: 1 },
];

export const M1B_HAND: MapDef = {
  id: 'm1b-hand',
  bounds: { minX: -100, maxX: 100, minZ: -60, maxZ: 170 },
  props: PROPS,
  targets: [
    { id: 'pillbox-1', kind: 'pillbox', x: -30, z: 70, yaw: 0 },
    { id: 'pillbox-2', kind: 'pillbox', x: 25, z: 60, yaw: 0.2 },
    { id: 'depot', kind: 'depot', x: 80, z: 95, yaw: -0.3 },
  ],
  spawns: {
    'b-squad': [
      { x: -40, z: 38 },
      { x: -16, z: 42 },
      { x: 8, z: 36 },
      { x: 30, z: 44 },
      { x: -55, z: 32 },
      { x: 50, z: 38 },
    ],
    'seawall-drop': [
      { x: -50, z: -55 },
      { x: -30, z: -55 },
      { x: -10, z: -55 },
      { x: 10, z: -55 },
      { x: 30, z: -55 },
      { x: 50, z: -55 },
    ],
  },
};
