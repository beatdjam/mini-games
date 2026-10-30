// The Vim editor the screen and tests use. Only the view they need and `feed` are public; the internal state
// (registers, pending key, undo stacks, `.` recording) lives in `EditorCore`.
import type { Pos } from '../../data/types.ts';
import type { Mode } from './types.ts';
import { EditorCore } from './core.ts';

export class Editor {
  private readonly core: EditorCore;

  constructor(lines: string[], cursor: Pos, marks: Record<string, Pos> = {}) {
    this.core = new EditorCore(lines, cursor, marks);
  }

  get lines(): string[] {
    return this.core.lines;
  }

  get cursor(): Pos {
    return this.core.cursor;
  }

  get mode(): Mode {
    return this.core.mode;
  }

  get pendingText(): string {
    return this.core.pendingText;
  }

  get searchText(): string {
    return this.core.searchText;
  }

  get searchDirection(): 1 | -1 {
    return this.core.searchDirection;
  }

  get commandText(): string {
    return this.core.commandText;
  }

  get marks(): Record<string, Pos> {
    return this.core.marks;
  }

  isSelected(line: number, col: number): boolean {
    return this.core.isSelected(line, col);
  }

  feed(key: string): boolean {
    return this.core.feed(key);
  }
}
