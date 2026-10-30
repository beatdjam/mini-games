// Reads the written words out of LANG.ja. src/i18n/ja.ts holds them; tools/check_i18n.js checks their shape.
import type { ChapterText, EndlessText, HelpRow, LevelText } from '../data/types.ts';
import { LANG } from './lang.ts';

interface TextData {
  chapters: Record<string, ChapterText>;
  levels: Record<string, LevelText>;
  help: HelpRow[];
  endless: { kinds: Record<string, EndlessText> };
}

// ja.ts is checked by tools/check_i18n.js; this names the shape once for the UI.
const data = (): Partial<TextData> => (LANG.ja?.data ?? {}) as Partial<TextData>;

export function levelText(id: string): LevelText {
  return (data().levels ?? {})[id] ?? { title: id, brief: '', hint: '', explanation: '' };
}

export function chapterText(chapter: number): ChapterText {
  return (data().chapters ?? {})[String(chapter)] ?? { title: '', intro: '' };
}

export function helpRows(): HelpRow[] {
  return data().help ?? [];
}

export function endlessText(kind: string): EndlessText {
  return data().endless?.kinds[kind] ?? { title: kind, brief: '', hint: '', explanation: '' };
}
