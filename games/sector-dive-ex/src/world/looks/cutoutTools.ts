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
// a block lit from the upper left: its colour, a lighter top edge, a shadow down its right side and under it
export function block(g: G, x: number, y: number, w: number, h: number, color: string) {
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(x + 3, y + 4, w, h);
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
  const shade = g.createLinearGradient(x, y, x + w, y + h);
  shade.addColorStop(0, 'rgba(255,255,255,0.14)');
  shade.addColorStop(0.5, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = shade;
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(x, y, w, 2);
}
// dirt over the lower part of everything, and specks
export function soil(g: G, rand: () => number, w: number, h: number, from: number) {
  g.globalCompositeOperation = 'source-atop';
  const dirt = g.createLinearGradient(0, from, 0, h);
  dirt.addColorStop(0, 'rgba(20,14,10,0)');
  dirt.addColorStop(1, 'rgba(20,14,10,0.55)');
  g.fillStyle = dirt;
  g.fillRect(0, 0, w, h);
  for (let k = 0; k < 500; k++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.22)' : 'rgba(255,240,210,0.07)';
    g.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
  }
  g.globalCompositeOperation = 'source-over';
}
