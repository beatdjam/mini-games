// Vitest setup for the STORMBREACHER tests: puts the game page's styles and elements into the document before the
// game modules load, then starts the engine's renderer on them. No input yet: the prototype has no controls.
import page from '../../index.html?raw';
import { el } from '@engine/core/index.ts';
import { initRender } from '@engine/render/index.ts';

// Each test file has a storage of its own, in memory. The real one is shared by the files running at the same time in
// one browser: the game reads its save from it as it loads, so a file could start from a save another had just written.
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

const doc = new DOMParser().parseFromString(page, 'text/html');
doc.head.querySelectorAll('style').forEach(s => document.head.appendChild(s.cloneNode(true)));
document.body.innerHTML = doc.body.innerHTML;
initRender(el<HTMLCanvasElement>('#gl'));
