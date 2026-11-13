// The game's one source of random numbers. Nothing else calls Math.random (engine's rand / pick do, so they are not
// used either): a test, a simulation or ?seed= can put a seeded generator here and get the same run every time.
import { createRng, type Rng } from '@engine/core/index.ts';

// The named streams: each kind of thing draws from its own sequence, so adding a draw in one place does not shift
// another place's numbers.
export type StreamName =
  | 'field'
  | 'fcs'
  | 'dummies'
  | 'map'
  | 'craters'
  | 'shots'
  | 'enemies'
  | 'emplacements'
  | 'mortar'
  | 'battery'
  | 'pillboxes'
  | 'battle'
  | 'allyFx';

// The value mixed into the seed for a stream (a 32-bit constant). Each stream needs its own.
const STREAM_SALT: Record<StreamName, number> = {
  field: 0x9e3779b9,
  fcs: 0x85ebca6b,
  dummies: 0xc2b2ae35,
  map: 0x27d4eb2f,
  craters: 0x165667b1,
  shots: 0xd3a2646c,
  enemies: 0x6a09e667,
  emplacements: 0x9b05688c,
  mortar: 0xbb67ae85,
  battery: 0x3c6ef372,
  pillboxes: 0x510e527f,
  battle: 0xa54ff53a,
  allyFx: 0x7f4a7c15,
};

// A generator on Math.random, for the runs that are not seeded (the published game and the dev views).
function randomRng(): Rng {
  const next = (): number => Math.random();
  const rand = (a: number, b: number): number => a + next() * (b - a);
  return {
    next,
    rand,
    randi: (a, b) => Math.floor(rand(a, b + 1)),
    pick: a => a[Math.floor(next() * a.length)],
    shuffle: a => {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}

let current = randomRng();
// the seed in use, or null while the run is not seeded
let currentSeed: number | null = null;
const streams = new Map<StreamName, Rng>();

// Puts a seeded generator in place (a test, a simulation, ?seed=). Forgets the streams already made, so each one
// starts again from this seed.
export function seed(n: number) {
  currentSeed = n >>> 0;
  current = createRng(currentSeed);
  streams.clear();
}

// The generator for everything that has no stream of its own.
export const rng = (): Rng => current;

// A stream of its own for one kind of thing ({ name } is the stream's name). Seeded from the same seed, mixed with
// the stream's salt; not seeded, it draws from Math.random like the rest.
export function stream(name: StreamName): Rng {
  let s = streams.get(name);
  if (!s) {
    s = currentSeed === null ? randomRng() : createRng(currentSeed ^ STREAM_SALT[name]);
    streams.set(name, s);
  }
  return s;
}
