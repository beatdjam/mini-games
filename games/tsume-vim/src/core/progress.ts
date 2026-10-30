// Best key count per solved puzzle and the endless best, kept in localStorage. Reading and writing never throw:
// the game still runs when storage is blocked (private windows, for example).
export interface Progress {
  done: Record<string, number>;
}

const KEY = 'tsume-vim/progress';
const ENDLESS_KEY = 'tsume-vim/endless';

const empty = (): Progress => ({ done: {} });

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage is optional
  }
}

export function loadProgress(): Progress {
  const raw = read(KEY);
  if (!raw) return empty();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return empty();
    const done = (parsed as { done?: unknown }).done;
    if (!done || typeof done !== 'object') return empty();
    const out: Record<string, number> = {};
    for (const [id, value] of Object.entries(done)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) out[id] = value;
    }
    return { done: out };
  } catch {
    return empty();
  }
}

export function saveProgress(progress: Progress): void {
  write(KEY, JSON.stringify(progress));
}

export function recordSolve(progress: Progress, id: string, keys: number): boolean {
  const best = progress.done[id];
  if (best !== undefined && best <= keys) return false;
  progress.done[id] = keys;
  saveProgress(progress);
  return true;
}

export function loadEndlessBest(): number {
  const value = Number(read(ENDLESS_KEY));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function saveEndlessBest(value: number): number {
  const best = Math.max(loadEndlessBest(), value);
  write(ENDLESS_KEY, String(best));
  return best;
}
