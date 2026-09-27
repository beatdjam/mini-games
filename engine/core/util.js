// engine: Small helpers: DOM lookup, random, clamp, shuffle, touch detection
// Small helpers shared by every file
export const $ = s => document.querySelector(s);
export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = a => a[Math.floor(Math.random() * a.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// `-touch` at the end of a dev hash (e.g. #view-pick-touch) forces the touch layout for screenshots
export const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || /-touch$/.test(location.hash);
document.body.classList.add(isTouch ? 'touch' : 'desk');

export const pct = v => `${Math.round(v * 100)}%`;
