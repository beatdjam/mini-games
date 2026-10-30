// The unnamed register plus named a-z / A-Z registers. The active name is chosen with `"` and applies to the next
// yank/delete/put; an unused name is dropped after that command.
import type { Register } from './types.ts';

const empty = (): Register => ({ text: '', linewise: false });

export class Registers {
  private unnamed: Register = empty();
  private named: Record<string, Register> = {};
  private active: string | null = null;
  private fresh = false;

  select(name: string): void {
    this.active = name;
    this.fresh = true;
  }

  // Called after every key: the key that selected a name is kept; an unused name is dropped after the command.
  finishKey(canDrop: boolean): void {
    if (this.fresh) {
      this.fresh = false;
    } else if (canDrop) {
      this.active = null;
    }
  }

  store(text: string, linewise: boolean): void {
    const value = { text, linewise };
    this.unnamed = value;
    const name = this.active;
    if (!name) return;
    this.active = null;
    if (name === '"') return;
    const upper = name === name.toUpperCase() && name !== name.toLowerCase();
    const key = upper ? name.toLowerCase() : name;
    if (upper) {
      const previous = this.named[key];
      const joined = previous ? (previous.linewise ? `${previous.text}\n${text}` : previous.text + text) : text;
      this.named[key] = { text: joined, linewise };
    } else {
      this.named[key] = value;
    }
  }

  // The named register (or the unnamed one); null when a name was selected but has no content.
  read(): Register | null {
    const name = this.active;
    this.active = null;
    if (!name || name === '"') return this.unnamed;
    const key = name === name.toUpperCase() && name !== name.toLowerCase() ? name.toLowerCase() : name;
    return this.named[key] ?? null;
  }
}
