// The painters' tools for the set pieces (a sector's cutouts.ts): pictures of whole heaps of things and of what is
// let into a wall, painted from a seed so that a picture is the same every time
export type G = CanvasRenderingContext2D;
// random numbers from a seed (0..1), the same row every time
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
export const pick = <T>(rand: () => number, of: readonly T[]): T => of[Math.floor(rand() * of.length)]!;
export { block, soil } from '@engine/render/paint.ts';
