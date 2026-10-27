import { expect } from 'vitest';
import type { Editor } from '../src/core/vim/editor.ts';

// Types a sample key sequence and fails at the first key the editor does not handle.
export const type = (editor: Editor, keys: string[]): void => {
  for (const key of keys) {
    expect(editor.feed(key), `key ${JSON.stringify(key)} was not handled`).toBe(true);
  }
};
