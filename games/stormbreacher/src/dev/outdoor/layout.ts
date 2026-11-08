// The beach's layout as plain numbers (no three.js): what stands where on a 400 x 400 m beach, scattered from the
// seeded generator so the same seed gives the same beach. build.ts turns the list into meshes.
import type { Rng } from '@engine/core/index.ts';

export type OutdoorKind = 'tile' | 'hedgehog' | 'block' | 'bunker' | 'seawall' | 'cliff';

export interface OutdoorItem {
  kind: OutdoorKind;
  x: number; // the middle of the thing on the beach (m)
  z: number; // ... +z is the sea, -z is the land
  yaw: number; // how far it is turned about its middle (rad)
  scale: number; // its size (tile: how dark the sand is)
}

interface Band {
  count: number; // how many stand on the beach at density 1
  scaled: boolean; // the count follows ?density (the ground and the seawall do not: they cover the beach whole)
  x: [number, number]; // where their middles may fall (m)
  z: [number, number];
  scale: [number, number]; // the smallest and largest size (tile: 0.9 to 1.1, the shade of the sand)
}

// The beach: x and z each run -200 to 200 m, +z is the sea, -z is the land.
export const BEACH = 200; // half the beach's side (m)
export const TILE_SIZE = 4; // the ground tile's side (m)

// Where each kind of thing stands. The bands come from the beach's shape: hedgehogs at the water's edge, blocks across
// the sand, bunkers just in front of the seawall, the seawall along z = -70, and the cliffs behind it.
export const LAYOUT: Record<OutdoorKind, Band> = {
  tile: { count: 10_000, scaled: false, x: [-BEACH, BEACH], z: [-BEACH, BEACH], scale: [0.9, 1.1] },
  hedgehog: { count: 600, scaled: true, x: [-BEACH, BEACH], z: [40, 120], scale: [0.8, 1.2] },
  block: { count: 300, scaled: true, x: [-BEACH, BEACH], z: [-20, 80], scale: [0.7, 1.3] },
  bunker: { count: 20, scaled: true, x: [-BEACH, BEACH], z: [-60, -30], scale: [0.9, 1.1] },
  seawall: { count: 50, scaled: false, x: [-BEACH, BEACH], z: [-70, -70], scale: [1, 1] },
  cliff: { count: 40, scaled: true, x: [-BEACH, BEACH], z: [-200, -120], scale: [0.8, 1.4] },
};

const SEAWALL_STEP = 8; // between the seawall's pieces along x (m)
const SEAWALL_Z = -70; // the line the seawall stands on (m)
const FULL_TURN = Math.PI * 2; // a yaw's full circle (rad)

// The ground tile at grid index i on an axis: the tiles cover -BEACH..BEACH with no gap.
function tileAt(i: number): number {
  return -BEACH + TILE_SIZE / 2 + i * TILE_SIZE;
}

function countOf(band: Band, density: number): number {
  return band.scaled ? Math.round(band.count * density) : band.count;
}

function scatter(rng: Rng, kind: OutdoorKind, band: Band, count: number): OutdoorItem[] {
  const items: OutdoorItem[] = [];
  for (let i = 0; i < count; i++) {
    items.push({
      kind,
      x: rng.rand(band.x[0], band.x[1]),
      z: rng.rand(band.z[0], band.z[1]),
      yaw: rng.rand(0, FULL_TURN),
      scale: rng.rand(band.scale[0], band.scale[1]),
    });
  }
  return items;
}

// The beach the seed makes: the ground tiles first, then each kind of thing over them.
export function outdoorLayout(rng: Rng, density: number): OutdoorItem[] {
  const items: OutdoorItem[] = [];

  const side = Math.round((BEACH * 2) / TILE_SIZE);
  const tile = LAYOUT.tile;
  for (let iz = 0; iz < side; iz++) {
    for (let ix = 0; ix < side; ix++) {
      items.push({
        kind: 'tile',
        x: tileAt(ix),
        z: tileAt(iz),
        yaw: 0,
        scale: rng.rand(tile.scale[0], tile.scale[1]),
      });
    }
  }

  for (const kind of ['hedgehog', 'block', 'bunker', 'cliff'] as const) {
    const band = LAYOUT[kind];
    items.push(...scatter(rng, kind, band, countOf(band, density)));
  }

  const seawall = LAYOUT.seawall;
  for (let i = 0; i < seawall.count; i++) {
    items.push({
      kind: 'seawall',
      x: -BEACH + SEAWALL_STEP / 2 + i * SEAWALL_STEP,
      z: SEAWALL_Z,
      yaw: 0,
      scale: 1,
    });
  }

  return items;
}
