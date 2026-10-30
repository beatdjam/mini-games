// Best key count per solved puzzle and the endless best, kept through the engine store. Reading and writing never
// throw: the game still runs when storage is blocked (private windows, for example).
import { loadStore, prefGet, prefSet, saveStore } from '@engine/core/store.ts';

export interface Progress {
  done: Record<string, number>;
}

const KEY = 'tsume-vim/progress';
const ENDLESS_KEY = 'tsume-vim/endless';

const empty = (): Progress => ({ done: {} });

export function loadProgress(): Progress {
  const { data } = loadStore<Progress>(KEY, empty);
  const done = data.done;
  if (!done || typeof done !== 'object') return empty();
  const out: Record<string, number> = {};
  for (const [id, value] of Object.entries(done)) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) out[id] = value;
  }
  return { done: out };
}

export function saveProgress(progress: Progress): void {
  saveStore(KEY, progress);
}

export function recordSolve(progress: Progress, id: string, keys: number): boolean {
  const best = progress.done[id];
  if (best !== undefined && best <= keys) return false;
  progress.done[id] = keys;
  saveProgress(progress);
  return true;
}

export function loadEndlessBest(): number {
  const value = Number(prefGet(ENDLESS_KEY, ''));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function saveEndlessBest(value: number): number {
  const best = Math.max(loadEndlessBest(), value);
  prefSet(ENDLESS_KEY, String(best));
  return best;
}
