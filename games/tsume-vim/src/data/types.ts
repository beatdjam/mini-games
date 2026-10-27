// Shapes shared by the puzzle data, the editor and the screens.
export interface Pos {
  line: number;
  col: number;
}

export interface Level {
  id: string;
  chapter: number;
  // the buffer at the start
  lines: string[];
  cursor: Pos;
  // the buffer that counts as solved
  target: string[];
  // movement-only puzzles are solved when the cursor is here too
  targetCursor?: Pos;
  // one set of keys that reaches the target (the tests type it into the editor)
  solution: string[];
  // marks that exist before the first key (for mark-jump levels)
  marks?: Record<string, Pos>;
  // drills and endless puzzles name their kind here; the text comes from the language file
  kind?: string;
}

export interface LevelText {
  title: string;
  brief: string;
  hint: string;
  explanation: string;
}

export interface ChapterText {
  title: string;
  intro: string;
}

export interface HelpRow {
  keys: string;
  text: string;
}

// Text for a generated puzzle kind (drills and endless mode).
export type EndlessText = LevelText;
