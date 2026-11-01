// Vitest setup for the Sector Dive Extended tests: puts the game page's styles and elements into the document before the game modules load
import page from '../index.html?raw';

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

const doc = new DOMParser().parseFromString(page, 'text/html');
doc.head.querySelectorAll('style').forEach(s => document.head.appendChild(s.cloneNode(true)));
document.body.innerHTML = doc.body.innerHTML;
