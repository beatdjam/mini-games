import { describe, expect, test } from 'vitest';
import { keyLabel, keyOf } from '../src/ui/keyboard.ts';

const event = (key: string, options: KeyboardEventInit = {}) => new KeyboardEvent('keydown', { key, ...options });

describe('keyboard', () => {
  test('arrows move in normal mode and are text keys in insert mode', () => {
    expect(keyOf(event('ArrowLeft'), 'normal')).toBe('h');
    expect(keyOf(event('ArrowDown'), 'visual')).toBe('j');
    expect(keyOf(event('ArrowLeft'), 'insert')).toBe('ArrowLeft');
    expect(keyOf(event('Home'), 'search')).toBe('Home');
  });

  test('control keys are mapped only where the engine uses them', () => {
    expect(keyOf(event('r', { ctrlKey: true }), 'normal')).toBe('C-r');
    expect(keyOf(event('a', { ctrlKey: true }), 'normal')).toBe('C-a');
    expect(keyOf(event('x', { ctrlKey: true }), 'normal')).toBe('C-x');
    expect(keyOf(event('a', { ctrlKey: true }), 'insert')).toBe('');
    expect(keyOf(event('[', { ctrlKey: true }), 'normal')).toBe('Escape');
  });

  test('alt and IME composition keys are passed through as they are', () => {
    // the terminal ignores Alt presses before keyOf; keyOf itself only looks at event.key
    expect(keyOf(event('a', { altKey: true }), 'normal')).toBe('a');
    expect(keyOf(event('ArrowLeft', { altKey: true }), 'normal')).toBe('h');
    expect(keyOf(event(' ', { altKey: true }), 'insert')).toBe(' ');
    // an IME reports Process or its key while composing; the terminal skips those before keyOf
    expect(keyOf(event('Process', { isComposing: true }), 'normal')).toBe('Process');
    expect(keyOf(event('あ', { isComposing: true }), 'insert')).toBe('あ');
  });

  test('key labels are readable in the status line', () => {
    expect(keyLabel(' ')).toBe('␣');
    expect(keyLabel('Escape')).toBe('Esc');
    expect(keyLabel('@')).toBe('@');
  });
});
