// engine: Small helpers: DOM lookup, random, clamp, shuffle, touch detection
// Small helpers shared by every file
// el: an element that must exist, typed (el<HTMLCanvasElement>('#mini')); for one that may be missing use document.querySelector<T>(...)
export const el = <T extends HTMLElement = HTMLElement>(s: string): T => document.querySelector<T>(s)!;
export const rand = (a: number, b: number): number => a + Math.random() * (b - a);
export const randi = (a: number, b: number): number => Math.floor(rand(a, b + 1));
export const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const shuffle = <T>(a: T[]): T[] => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
// A random source that repeats for the same seed (mulberry32), for things that must come out the same again: a
// level built from a seed, a fixed test. The plain rand / pick / shuffle above stay on Math.random.
export interface Rng {
  next: () => number; // 0 <= x < 1, like Math.random
  rand: (a: number, b: number) => number;
  randi: (a: number, b: number) => number; // a..b, both included
  pick: <T>(a: readonly T[]) => T;
  shuffle: <T>(a: T[]) => T[];
}
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = (a: number, b: number): number => a + next() * (b - a);
  return {
    next,
    rand: r,
    randi: (a, b) => Math.floor(r(a, b + 1)),
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
// `-touch` at the end of a dev hash (e.g. #view-pick-touch) forces the touch layout for screenshots
export const isTouch =
  (typeof window.matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ||
  'ontouchstart' in window ||
  /-touch$/.test(location.hash);
document.body.classList.add(isTouch ? 'touch' : 'desk');

export const pct = (v: number): string => `${Math.round(v * 100)}%`;
// distance between two points on the ground plane (ignores y)
export function distXZ(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
