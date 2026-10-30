import { describe, expect, test } from 'vitest';
import { Registers } from '../src/core/vim/registers.ts';

describe('registers', () => {
  test('named registers store and read back', () => {
    const registers = new Registers();
    registers.select('a');
    registers.store('one', true);
    registers.select('a');
    expect(registers.read()).toEqual({ text: 'one', linewise: true });
  });

  test('uppercase appends, and an unused name falls back to unnamed', () => {
    const registers = new Registers();
    registers.select('a');
    registers.store('one', true);
    registers.select('A');
    registers.store('two', true);
    registers.select('a');
    expect(registers.read()).toEqual({ text: 'one\ntwo', linewise: true });
    registers.store('plain', false);
    expect(registers.read()).toEqual({ text: 'plain', linewise: false });
  });

  test('an unused selected name is dropped after the command', () => {
    const registers = new Registers();
    registers.select('a');
    registers.finishKey(false);
    registers.finishKey(true);
    expect(registers.read()).toEqual({ text: '', linewise: false });
  });
});
