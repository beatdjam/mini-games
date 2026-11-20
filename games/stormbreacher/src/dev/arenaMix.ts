// The enemies #view-arena's URL asks for (?enemies=grunt:4,assault:2).
import { SOLDIER_KINDS, type SoldierKind } from '../data/enemies.ts';

const DEFAULT_MIX: readonly { kind: SoldierKind; count: number }[] = [
  { kind: 'grunt', count: 3 },
  { kind: 'assault', count: 1 },
];
export const MAX_PER_KIND = 20; // the most of one kind the URL may ask for, so a mistyped count cannot freeze the page

const isSoldierKind = (value: string): value is SoldierKind => (SOLDIER_KINDS as readonly string[]).includes(value);

// The enemies the URL asks for (?enemies=grunt:4,assault:2), as one kind per enemy in the order they come in. A name the
// table does not have is skipped, and a list with nothing in it falls back to the default mix.
export function mixOf(raw: string | null): SoldierKind[] {
  const kinds: SoldierKind[] = [];
  if (raw !== null && raw.trim() !== '') {
    for (const part of raw.split(',')) {
      const [name, countText] = part.split(':');
      if (name === undefined || !isSoldierKind(name.trim())) continue;
      const count = Math.min(MAX_PER_KIND, countText === undefined ? 1 : Math.floor(Number(countText)));
      if (!Number.isFinite(count) || count <= 0) continue;
      for (let i = 0; i < count; i++) kinds.push(name.trim() as SoldierKind);
    }
  }
  if (kinds.length > 0) return kinds;
  return DEFAULT_MIX.flatMap(({ kind, count }) => Array.from({ length: count }, () => kind));
}
