// engine: Small helpers: DOM lookup, random, clamp, shuffle, touch detection
// Small helpers shared by every file
// $ returns any so game code can use any element directly; for a typed lookup use document.querySelector<T>(...)
export const $ = (s: string): any => document.querySelector(s);
export const rand = (a: number, b: number): number => a + Math.random() * (b - a);
export const randi = (a: number, b: number): number => Math.floor(rand(a, b + 1));
export const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const shuffle = <T>(a: T[]): T[] => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// `-touch` at the end of a dev hash (e.g. #view-pick-touch) forces the touch layout for screenshots
export const isTouch = (typeof window.matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || /-touch$/.test(location.hash);
document.body.classList.add(isTouch ? 'touch' : 'desk');

export const pct = (v: number): string => `${Math.round(v * 100)}%`;
