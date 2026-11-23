// Vitest setup for the Sector Dive Extended tests: puts the game page's styles and elements into the document before
// the game modules load, then starts the engine's renderer, input and touch layout on them
import page from '../index.html?raw';
import { el } from '@engine/core/index.ts';
import { initRender } from '@engine/render/index.ts';
import { initInput } from '@engine/ui/index.ts';
import { initTouchLayout } from '@engine/ui/index.ts';

// Each test file has a storage of its own, in memory. The real one is shared by the files running at the same time in
// one browser: the game reads its save from it as it loads, so a file could start from a save another had just written
// (the boss area's, DEPTH 50, whose weapons kill in one shot what the file's own test had put there to stand still)
const kept = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => kept.get(k) ?? null,
    setItem: (k: string, v: string) => void kept.set(k, String(v)),
    removeItem: (k: string) => void kept.delete(k),
    clear: () => kept.clear(),
    key: (n: number) => [...kept.keys()][n] ?? null,
    get length() {
      return kept.size;
    },
  },
});

// The page's own loop (the engine's loopFrame, started by main.ts) does not run in the tests: it would step the game
// by itself while a test waits or builds a state of its own, and a half-made state fails there (lockDoor: tile has no
// door). The tests step the game by hand (tick, update, runSystems). Other rAF callbacks go through
const raf = window.requestAnimationFrame.bind(window);
window.requestAnimationFrame = cb => (cb.name === 'loopFrame' ? 0 : raf(cb));

const doc = new DOMParser().parseFromString(page, 'text/html');
doc.head.querySelectorAll('style').forEach(s => document.head.appendChild(s.cloneNode(true)));
document.body.innerHTML = doc.body.innerHTML;
initRender(el<HTMLCanvasElement>('#gl'));
initInput({ touch: el('#touch'), fire: el('#btnFire'), fire2: el('#btnFire2') });
initTouchLayout();
