import { describe, expect, test } from 'vitest';
import { Editor } from '../src/core/vim/editor.ts';
import { type } from './helpers.ts';

describe('editor', () => {
  test('cw changes the word but leaves the space', () => {
    const editor = new Editor(['hello world'], { line: 0, col: 0 });
    type(editor, ['c', 'w', 'g', 'o', 'o', 'd', 'Escape']);
    expect(editor.lines).toEqual(['good world']);
  });

  test('ci" from the start of the line changes the string on the right', () => {
    const editor = new Editor(['name = "vim"'], { line: 0, col: 0 });
    type(editor, ['c', 'i', '"', 'X', 'Escape']);
    expect(editor.lines).toEqual(['name = "X"']);
  });

  test('di( outside a block does nothing', () => {
    const editor = new Editor(['foo (bar) baz', '  qux'], { line: 1, col: 4 });
    type(editor, ['d', 'i', '(']);
    expect(editor.lines).toEqual(['foo (bar) baz', '  qux']);
    expect(editor.cursor).toEqual({ line: 1, col: 4 });
  });

  test('da" deletes the trailing space of the string', () => {
    const editor = new Editor(['  qux "x y" end'], { line: 0, col: 4 });
    type(editor, ['d', 'a', '"']);
    expect(editor.lines).toEqual(['  qux end']);
  });

  test('dw at the last word keeps the line', () => {
    const editor = new Editor(['one two'], { line: 0, col: 4 });
    type(editor, ['d', 'w']);
    expect(editor.lines).toEqual(['one ']);
  });

  test('a count on f finds the nth occurrence, and F goes back', () => {
    const editor = new Editor(['name = "vim"'], { line: 0, col: 0 });
    type(editor, ['2', 'f', '"']);
    expect(editor.cursor).toEqual({ line: 0, col: 11 });
    type(editor, ['i', ' ', 'e', 'd', 'i', 't', 'o', 'r', 'Escape']);
    expect(editor.lines).toEqual(['name = "vim editor"']);
    const back = new Editor(['name = "vim"'], { line: 0, col: 11 });
    type(back, ['F', '"']);
    expect(back.cursor).toEqual({ line: 0, col: 7 });
    const first = new Editor(['name = "vim"'], { line: 0, col: 0 });
    type(first, ['f', '"']);
    expect(first.cursor).toEqual({ line: 0, col: 7 });
  });

  test('dt stops before the character and df includes it', () => {
    const till = new Editor(['one,two'], { line: 0, col: 0 });
    type(till, ['d', 't', ',']);
    expect(till.lines).toEqual([',two']);
    const find = new Editor(['one,two'], { line: 0, col: 0 });
    type(find, ['d', 'f', ',']);
    expect(find.lines).toEqual(['two']);
  });

  test('undo and redo walk the changes', () => {
    const editor = new Editor(['abc'], { line: 0, col: 0 });
    type(editor, ['x']);
    expect(editor.lines).toEqual(['bc']);
    type(editor, ['u']);
    expect(editor.lines).toEqual(['abc']);
    type(editor, ['C-r']);
    expect(editor.lines).toEqual(['bc']);
  });

  test('undo after an insert removes the whole insert', () => {
    const editor = new Editor(['ab'], { line: 0, col: 1 });
    type(editor, ['i', 'X', 'Y', 'Escape', 'u']);
    expect(editor.lines).toEqual(['ab']);
  });

  test('V j d deletes whole lines and counts work', () => {
    const editor = new Editor(['a', 'b', 'c', 'd'], { line: 0, col: 0 });
    type(editor, ['V', 'j', 'd']);
    expect(editor.lines).toEqual(['c', 'd']);
    type(editor, ['2', 'd', 'd']);
    expect(editor.lines).toEqual(['']);
  });

  test('marks jump to the exact spot and to the line start', () => {
    const editor = new Editor(['alpha', 'bravo', 'charlie'], { line: 0, col: 0 });
    type(editor, ['j', 'j', 'l', 'l', 'm', 'a', 'g', 'g', '`', 'a']);
    expect(editor.cursor).toEqual({ line: 2, col: 2 });
    type(editor, ['g', 'g', "'", 'a']);
    expect(editor.cursor).toEqual({ line: 2, col: 0 });
  });

  test('dot repeats a delete and an insert', () => {
    const del = new Editor(['alpha beta gamma'], { line: 0, col: 0 });
    type(del, ['d', 'w', '.']);
    expect(del.lines).toEqual(['gamma']);
    const ins = new Editor(['one', 'two'], { line: 0, col: 0 });
    type(ins, ['A', '!', 'Escape', 'j', '.']);
    expect(ins.lines).toEqual(['one!', 'two!']);
  });

  test('Ctrl-a and Ctrl-x change the number near the cursor', () => {
    const up = new Editor(['const timeout = 1000;'], { line: 0, col: 16 });
    type(up, ['1', '0', 'C-a']);
    expect(up.lines).toEqual(['const timeout = 1010;']);
    const down = new Editor(['let retries = 5;'], { line: 0, col: 14 });
    type(down, ['2', 'C-x']);
    expect(down.lines).toEqual(['let retries = 3;']);
  });

  test('colon commands jump to a line and substitute', () => {
    const line = new Editor(['one', 'two', 'three'], { line: 0, col: 0 });
    type(line, [':', '3', 'Enter']);
    expect(line.cursor).toEqual({ line: 2, col: 0 });
    const sub = new Editor(['the old value'], { line: 0, col: 0 });
    type(sub, [':', 's', '/', 'o', 'l', 'd', '/', 'n', 'e', 'w', '/', 'Enter']);
    expect(sub.lines).toEqual(['the new value']);
    const all = new Editor(['old and old', 'old'], { line: 0, col: 0 });
    type(all, [':', '%', 's', '/', 'o', 'l', 'd', '/', 'n', 'e', 'w', '/', 'g', 'Enter']);
    expect(all.lines).toEqual(['new and new', 'new']);
  });

  test('H, M and L move inside the screen, with counts', () => {
    const lines = Array.from({ length: 9 }, (_, i) => (i === 0 ? '  first' : `line ${i}`));
    const top = new Editor(lines, { line: 4, col: 0 });
    type(top, ['H']);
    expect(top.cursor).toEqual({ line: 0, col: 2 });
    const middle = new Editor(lines, { line: 0, col: 0 });
    type(middle, ['M']);
    expect(middle.cursor.line).toBe(4);
    const bottom = new Editor(lines, { line: 0, col: 0 });
    type(bottom, ['L']);
    expect(bottom.cursor.line).toBe(8);
    const fromTop = new Editor(lines, { line: 8, col: 0 });
    type(fromTop, ['3', 'H']);
    expect(fromTop.cursor.line).toBe(2);
    const fromBottom = new Editor(lines, { line: 0, col: 0 });
    type(fromBottom, ['3', 'L']);
    expect(fromBottom.cursor.line).toBe(6);
  });

  test('$ and n take a count', () => {
    const dollar = new Editor(['aaa', 'bbbb', 'c'], { line: 0, col: 0 });
    type(dollar, ['2', '$']);
    expect(dollar.cursor).toEqual({ line: 1, col: 3 });
    const next = new Editor(['foo foo foo'], { line: 0, col: 0 });
    type(next, ['/', 'f', 'o', 'o', 'Enter', '2', 'n']);
    expect(next.cursor).toEqual({ line: 0, col: 0 });
  });

  test('* and # stay on word boundaries', () => {
    const editor = new Editor(['cat catalog cat'], { line: 0, col: 0 });
    type(editor, ['*']);
    expect(editor.cursor).toEqual({ line: 0, col: 12 });
    type(editor, ['#']);
    expect(editor.cursor).toEqual({ line: 0, col: 0 });
  });

  test('p and u take a count', () => {
    const put = new Editor(['x'], { line: 0, col: 0 });
    type(put, ['y', 'y', '3', 'p']);
    expect(put.lines).toEqual(['x', 'x', 'x', 'x']);
    const undo = new Editor(['abc'], { line: 0, col: 0 });
    type(undo, ['x', 'x', 'x', '3', 'u']);
    expect(undo.lines).toEqual(['abc']);
  });

  test('% with a count jumps to that percentage of the file', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`);
    const editor = new Editor(lines, { line: 0, col: 0 });
    type(editor, ['5', '0', '%']);
    expect(editor.cursor.line).toBe(4);
  });

  test('J does not add a space before a closing parenthesis', () => {
    const editor = new Editor(['if (', ')'], { line: 0, col: 0 });
    type(editor, ['J']);
    expect(editor.lines).toEqual(['if ()']);
  });

  test('Ctrl-a keeps leading zeros and does nothing after the last number', () => {
    const zeros = new Editor(['value = 007;'], { line: 0, col: 8 });
    type(zeros, ['C-a']);
    expect(zeros.lines).toEqual(['value = 008;']);
    const after = new Editor(['value = 7;'], { line: 0, col: 9 });
    type(after, ['C-a']);
    expect(after.lines).toEqual(['value = 7;']);
  });

  test('named registers work with yank, delete and put', () => {
    const editor = new Editor(['one', 'two'], { line: 0, col: 0 });
    type(editor, ['"', 'a', 'y', 'y']);
    expect(editor.pendingText).toBe('');
    type(editor, ['j', '"', 'a', 'p']);
    expect(editor.lines).toEqual(['one', 'two', 'one']);
    const appended = new Editor(['one', 'two'], { line: 0, col: 0 });
    type(appended, ['"', 'a', 'y', 'y', 'j', '"', 'A', 'y', 'y', 'G', '"', 'a', 'p']);
    expect(appended.lines).toEqual(['one', 'two', 'one', 'two']);
    const deleted = new Editor(['one', 'two'], { line: 0, col: 0 });
    type(deleted, ['"', 'a', 'd', 'd', '"', 'a', 'p']);
    expect(deleted.lines).toEqual(['two', 'one']);
  });

  test('the register prefix is visible while it waits', () => {
    const editor = new Editor(['one'], { line: 0, col: 0 });
    type(editor, ['"']);
    expect(editor.pendingText).toBe('"');
    type(editor, ['a']);
    expect(editor.pendingText).toBe('');
  });

  test('text objects find the next target when the cursor is before it', () => {
    const quote = new Editor(['name = "vim"'], { line: 0, col: 0 });
    type(quote, ['c', 'i', '"', 'n', 'e', 'w', 'Escape']);
    expect(quote.lines).toEqual(['name = "new"']);
    const paren = new Editor(['if (ready) {'], { line: 0, col: 0 });
    type(paren, ['c', 'i', '(', 'd', 'o', 'n', 'e', 'Escape']);
    expect(paren.lines).toEqual(['if (done) {']);
    const word = new Editor(['hello world'], { line: 0, col: 5 });
    type(word, ['c', 'i', 'w', 'g', 'o', 'o', 'd', 'Escape']);
    expect(word.lines).toEqual(['hello good']);
  });

  test('text objects: words, quotes and brackets', () => {
    const iw = new Editor(['hello world'], { line: 0, col: 0 });
    type(iw, ['d', 'i', 'w']);
    expect(iw.lines).toEqual([' world']);
    const aw = new Editor(['hello world'], { line: 0, col: 0 });
    type(aw, ['d', 'a', 'w']);
    expect(aw.lines).toEqual(['world']);
    const ciw = new Editor(['hello world'], { line: 0, col: 0 });
    type(ciw, ['c', 'i', 'w', 'g', 'o', 'o', 'd', 'Escape']);
    expect(ciw.lines).toEqual(['good world']);
    const quote = new Editor(['name = "vim"'], { line: 0, col: 8 });
    type(quote, ['d', 'i', '"']);
    expect(quote.lines).toEqual(['name = ""']);
    const changeQuote = new Editor(['name = "old"'], { line: 0, col: 8 });
    type(changeQuote, ['c', 'i', '"', 'n', 'e', 'w', 'Escape']);
    expect(changeQuote.lines).toEqual(['name = "new"']);
    const paren = new Editor(['if (ready) {'], { line: 0, col: 4 });
    type(paren, ['c', 'i', '(', 'd', 'o', 'n', 'e', 'Escape']);
    expect(paren.lines).toEqual(['if (done) {']);
    const aroundParen = new Editor(['print(value)'], { line: 0, col: 6 });
    type(aroundParen, ['c', 'a', '(', 'Escape']);
    expect(aroundParen.lines).toEqual(['print']);
    const brace = new Editor(['map = {a: 1};'], { line: 0, col: 8 });
    type(brace, ['d', 'i', '{']);
    expect(brace.lines).toEqual(['map = {};']);
    const visualParen = new Editor(['call(alpha)'], { line: 0, col: 6 });
    type(visualParen, ['v', 'i', '(', 'd']);
    expect(visualParen.lines).toEqual(['call()']);
  });

  test('line, paragraph and bracket motions', () => {
    const lines = ['alpha', 'beta', '', 'if (ok) {', '  run();', '}'];
    const plus = new Editor(lines, { line: 0, col: 0 });
    type(plus, ['+']);
    expect(plus.cursor).toEqual({ line: 1, col: 0 });
    const paragraph = new Editor(lines, { line: 0, col: 0 });
    type(paragraph, ['}']);
    expect(paragraph.cursor.line).toBe(2);
    const back = new Editor(lines, { line: 5, col: 0 });
    type(back, ['{']);
    expect(back.cursor.line).toBe(2);
    const bracket = new Editor(lines, { line: 3, col: 9 });
    type(bracket, ['%']);
    expect(bracket.cursor).toEqual({ line: 5, col: 0 });
  });

  test('search moves with /, n and N', () => {
    const editor = new Editor(['todo', 'done todo', 'todo again'], { line: 0, col: 0 });
    type(editor, ['/', 't', 'o', 'd', 'o', 'Enter']);
    expect(editor.cursor).toEqual({ line: 1, col: 5 });
    type(editor, ['n']);
    expect(editor.cursor).toEqual({ line: 2, col: 0 });
    type(editor, ['N']);
    expect(editor.cursor).toEqual({ line: 1, col: 5 });
  });

  test('search backward and * use the word under the cursor', () => {
    const back = new Editor(['first target here', 'second target here', 'third'], { line: 2, col: 0 });
    type(back, ['?', 't', 'a', 'r', 'g', 'e', 't', 'Enter']);
    expect(back.cursor).toEqual({ line: 1, col: 7 });
    const star = new Editor(['count = 0', 'print(count)'], { line: 0, col: 0 });
    type(star, ['*']);
    expect(star.cursor).toEqual({ line: 1, col: 6 });
  });

  test('ge and g_ move to the previous word end and the last non-blank', () => {
    const ge = new Editor(['one two three'], { line: 0, col: 8 });
    type(ge, ['g', 'e']);
    expect(ge.cursor).toEqual({ line: 0, col: 6 });
    const gs = new Editor(['  return value  '], { line: 0, col: 0 });
    type(gs, ['g', '_']);
    expect(gs.cursor).toEqual({ line: 0, col: 13 });
  });

  test('counts combine with operators', () => {
    const editor = new Editor(['a b c d e'], { line: 0, col: 0 });
    type(editor, ['2', 'd', '2', 'w']);
    expect(editor.lines).toEqual(['e']);
  });

  test('visual indent shifts every selected line', () => {
    const editor = new Editor(['a', 'b', 'c'], { line: 0, col: 0 });
    type(editor, ['V', 'j', '>']);
    expect(editor.lines).toEqual(['  a', '  b', 'c']);
  });

  test('visual indent leaves empty lines alone', () => {
    const editor = new Editor(['one', '', 'three'], { line: 0, col: 0 });
    type(editor, ['V', 'j', '>']);
    expect(editor.lines).toEqual(['  one', '', 'three']);
    expect(editor.cursor).toEqual({ line: 0, col: 2 });
  });

  test('visual p replaces the selection with the register and keeps the deleted text', () => {
    const editor = new Editor(['foo (bar) baz'], { line: 0, col: 6 });
    type(editor, ['y', 'i', 'w', 'v', 'l', 'p']);
    expect(editor.lines).toEqual(['foo (barr) baz']);
    expect(editor.cursor).toEqual({ line: 0, col: 7 });
    type(editor, ['0', 'p']);
    expect(editor.lines).toEqual(['fbaoo (barr) baz']);
  });

  test('visual P keeps the unnamed register', () => {
    const editor = new Editor(['foo (bar) baz'], { line: 0, col: 6 });
    type(editor, ['y', 'i', 'w', 'v', 'l', 'P']);
    expect(editor.lines).toEqual(['foo (barr) baz']);
    type(editor, ['0', 'p']);
    expect(editor.lines).toEqual(['fbaroo (barr) baz']);
  });

  test('visual r replaces the selected characters but not the newlines', () => {
    const lines = ['foo (bar) baz', '  qux "x y" end', '', 'one {two} three', 'last line 42'];
    const editor = new Editor(lines, { line: 0, col: 6 });
    type(editor, ['y', 'i', 'w', 'v', 'j', 'r', '#']);
    expect(editor.lines).toEqual(['foo (########', '######"x y" end', '', 'one {two} three', 'last line 42']);
    expect(editor.cursor).toEqual({ line: 0, col: 5 });
  });

  test('visual ~ swaps the case of the selection', () => {
    const editor = new Editor(['foo (bar) baz'], { line: 0, col: 6 });
    type(editor, ['y', 'i', 'w', 'v', 'l', '~']);
    expect(editor.lines).toEqual(['foo (BAr) baz']);
    expect(editor.cursor).toEqual({ line: 0, col: 5 });
  });

  test('visual D deletes whole lines from a character selection', () => {
    const lines = ['foo (bar) baz', '  qux "x y" end', '', 'one {two} three', 'last line 42'];
    const editor = new Editor(lines, { line: 1, col: 4 });
    type(editor, ['y', 'i', 'w', 'v', 'l', 'D']);
    expect(editor.lines).toEqual(['foo (bar) baz', '', 'one {two} three', 'last line 42']);
    expect(editor.cursor).toEqual({ line: 1, col: 0 });
  });

  test('visual J joins one selected line with the next', () => {
    const linewise = new Editor(['one', 'two', 'three'], { line: 0, col: 0 });
    type(linewise, ['V', 'J']);
    expect(linewise.lines).toEqual(['one two', 'three']);
    expect(linewise.cursor).toEqual({ line: 0, col: 3 });
    const charwise = new Editor(['one', 'two', 'three'], { line: 0, col: 0 });
    type(charwise, ['v', 'l', 'J']);
    expect(charwise.lines).toEqual(['one two', 'three']);
    expect(charwise.cursor).toEqual({ line: 0, col: 3 });
  });

  test('visual "ay yanks into a named register and "aP puts it back', () => {
    const lines = ['foo (bar) baz', '  qux "x y" end', '', 'one {two} three', 'last line 42'];
    const editor = new Editor(lines, { line: 0, col: 6 });
    type(editor, ['y', 'i', 'w', 'v', 'l', '"', 'a', 'y', '"', 'a', 'P']);
    expect(editor.lines).toEqual(['foo (babar) baz', '  qux "x y" end', '', 'one {two} three', 'last line 42']);
    expect(editor.cursor).toEqual({ line: 0, col: 6 });
  });

  test('put works for characters and lines', () => {
    const chars = new Editor(['ab'], { line: 0, col: 0 });
    type(chars, ['x', 'p']);
    expect(chars.lines).toEqual(['ba']);
    const lines = new Editor(['one', 'two'], { line: 0, col: 0 });
    type(lines, ['d', 'd', 'p']);
    expect(lines.lines).toEqual(['two', 'one']);
  });

  test('# stops when the only candidates are not on word boundaries', () => {
    const editor = new Editor(['foobar', 'foo'], { line: 1, col: 0 });
    type(editor, ['#']);
    expect(editor.cursor).toEqual({ line: 1, col: 0 });
  });

  test('huge counts stop at the cap', () => {
    const del = new Editor(['abc'], { line: 0, col: 0 });
    type(del, [...Array(20).fill('9'), 'x']);
    expect(del.lines).toEqual(['']);
    const put = new Editor(['x'], { line: 0, col: 0 });
    type(put, ['y', 'y', ...Array(20).fill('9'), 'p']);
    expect(put.lines.length).toBeLessThanOrEqual(1 + 9999);
  });

  test('yyp duplicates an empty line', () => {
    const editor = new Editor(['', 'a'], { line: 0, col: 0 });
    type(editor, ['y', 'y', 'p']);
    expect(editor.lines).toEqual(['', '', 'a']);
    expect(editor.cursor).toEqual({ line: 1, col: 0 });
  });

  test('visual mode can use f and ;', () => {
    const find = new Editor(['foo bar baz'], { line: 0, col: 0 });
    type(find, ['v', 'f', ' ', 'd']);
    expect(find.lines).toEqual(['bar baz']);
    const repeat = new Editor(['foo bar baz'], { line: 0, col: 0 });
    type(repeat, ['v', 'f', ' ', ';', 'd']);
    expect(repeat.lines).toEqual(['baz']);
  });

  test('visual mode can use F', () => {
    const editor = new Editor(['foo bar baz'], { line: 0, col: 10 });
    type(editor, ['v', 'F', ' ', 'd']);
    expect(editor.lines).toEqual(['foo bar']);
  });

  test('visual mode can search and comes back to visual mode', () => {
    const editor = new Editor(['foo bar baz'], { line: 0, col: 0 });
    type(editor, ['v', '/', 'b', 'a', 'z', 'Enter', 'd']);
    expect(editor.lines).toEqual(['az']);
  });

  test('Escape while a visual motion waits keeps visual mode', () => {
    const editor = new Editor(['foo bar baz'], { line: 0, col: 0 });
    type(editor, ['v', 'f', 'Escape']);
    expect(editor.mode).toBe('visual');
  });

  test('v$ selects the newline and v$d joins the next line', () => {
    const editor = new Editor(['ab', 'cd'], { line: 0, col: 0 });
    type(editor, ['v', '$', 'd']);
    expect(editor.lines).toEqual(['cd']);
  });

  test('operators take linewise motions by whole lines', () => {
    const under = new Editor(['one', '  two', 'three'], { line: 0, col: 1 });
    type(under, ['d', '_']);
    expect(under.lines).toEqual(['  two', 'three']);
    expect(under.cursor).toEqual({ line: 0, col: 2 });

    const toEnd = new Editor(['one', 'two', 'three'], { line: 0, col: 1 });
    type(toEnd, ['d', 'G']);
    expect(toEnd.lines).toEqual(['']);

    const change = new Editor(['one', 'two', 'three'], { line: 0, col: 0 });
    type(change, ['c', 'j']);
    expect(change.lines).toEqual(['', 'three']);
    expect(change.mode).toBe('insert');
  });

  test('operators include or exclude the character the motion reaches', () => {
    const bracket = new Editor(['foo (bar) baz'], { line: 0, col: 6 });
    type(bracket, ['d', '%']);
    expect(bracket.lines).toEqual(['foo r) baz']);
    expect(bracket.cursor).toEqual({ line: 0, col: 4 });

    const back = new Editor(['foo (bar) baz'], { line: 0, col: 6 });
    type(back, ['d', 'F', 'o']);
    expect(back.lines).toEqual(['foar) baz']);
    expect(back.cursor).toEqual({ line: 0, col: 2 });
  });

  test('exclusive operator motions stop before their target', () => {
    const lines = ['foo (bar) baz', '  qux "x y" end', '', 'one {two} three', 'last line 42'];
    const paragraph = new Editor(lines, { line: 0, col: 6 });
    type(paragraph, ['d', '}']);
    expect(paragraph.lines).toEqual(['foo (b', '', 'one {two} three', 'last line 42']);
    expect(paragraph.cursor).toEqual({ line: 0, col: 5 });

    const search = new Editor(lines, { line: 0, col: 6 });
    type(search, ['d', '/', 'e', 'Enter']);
    expect(search.lines).toEqual(['foo (bend', '', 'one {two} three', 'last line 42']);
    expect(search.cursor).toEqual({ line: 0, col: 6 });

    const mark = new Editor(lines, { line: 0, col: 6 }, { a: { line: 3, col: 6 } });
    type(mark, ['d', '`', 'a']);
    expect(mark.lines).toEqual(['foo (bwo} three', 'last line 42']);
    expect(mark.cursor).toEqual({ line: 0, col: 6 });
  });

  test('cw in a word and d3w at the end of a line stop where Vim stops', () => {
    const change = new Editor(['hello world'], { line: 0, col: 1 });
    type(change, ['c', 'w', 'X', 'Escape']);
    expect(change.lines).toEqual(['hX world']);

    const lines = ['foo (bar) baz', '  qux "x y" end', '', 'one {two} three', 'last line 42'];
    const words = new Editor(lines, { line: 0, col: 6 });
    type(words, ['d', '3', 'w']);
    expect(words.lines).toEqual(['foo (b', '  qux "x y" end', '', 'one {two} three', 'last line 42']);
    expect(words.cursor).toEqual({ line: 0, col: 5 });
  });

  test('dk on the first line does nothing', () => {
    const editor = new Editor(['one', 'two'], { line: 0, col: 1 });
    type(editor, ['d', 'k']);
    expect(editor.lines).toEqual(['one', 'two']);
    expect(editor.cursor).toEqual({ line: 0, col: 1 });
  });

  test('~ leaves the cursor after the last character it swaps', () => {
    const one = new Editor(['foo  '], { line: 0, col: 0 });
    type(one, ['~']);
    expect(one.lines).toEqual(['Foo  ']);
    expect(one.cursor).toEqual({ line: 0, col: 1 });

    const count = new Editor(['foo  '], { line: 0, col: 0 });
    type(count, ['3', '~']);
    expect(count.lines).toEqual(['FOO  ']);
    expect(count.cursor).toEqual({ line: 0, col: 3 });

    const twice = new Editor(['foo  '], { line: 0, col: 0 });
    type(twice, ['~', '~']);
    expect(twice.lines).toEqual(['FOo  ']);
    expect(twice.cursor).toEqual({ line: 0, col: 2 });
  });

  test('J keeps trailing spaces and puts the cursor on the last join', () => {
    const editor = new Editor(['foo  ', '  bar baz', ')qux'], { line: 0, col: 0 });
    type(editor, ['J']);
    expect(editor.lines).toEqual(['foo  bar baz', ')qux']);
    expect(editor.cursor).toEqual({ line: 0, col: 5 });

    const three = new Editor(['foo  ', '  bar baz', ')qux'], { line: 0, col: 0 });
    type(three, ['3', 'J']);
    expect(three.lines).toEqual(['foo  bar baz)qux']);
    expect(three.cursor).toEqual({ line: 0, col: 12 });

    const visual = new Editor(['foo  ', '  bar baz', ')qux'], { line: 0, col: 0 });
    type(visual, ['V', 'j', 'j', 'J']);
    expect(visual.lines).toEqual(['foo  bar baz)qux']);
    expect(visual.cursor).toEqual({ line: 0, col: 12 });

    const next = new Editor(['foo  ', '  bar baz', ')qux'], { line: 0, col: 0 });
    type(next, ['J', 'x']);
    expect(next.lines).toEqual(['foo  ar baz', ')qux']);
  });

  test('a count on insert repeats the typed text', () => {
    const inside = new Editor(['foo  '], { line: 0, col: 0 });
    type(inside, ['3', 'i', '#', 'Escape']);
    expect(inside.lines).toEqual(['###foo  ']);
    expect(inside.cursor).toEqual({ line: 0, col: 2 });

    const after = new Editor(['foo  '], { line: 0, col: 0 });
    type(after, ['3', 'a', '#', 'Escape']);
    expect(after.lines).toEqual(['f###oo  ']);
    expect(after.cursor).toEqual({ line: 0, col: 3 });

    const open = new Editor(['foo  ', '  bar baz'], { line: 0, col: 0 });
    type(open, ['3', 'o', '#', 'Escape']);
    expect(open.lines).toEqual(['foo  ', '#', '#', '#', '  bar baz']);
    expect(open.cursor).toEqual({ line: 3, col: 0 });
  });

  test('a count on put repeats the text at the same place', () => {
    const word = new Editor(['foo  '], { line: 0, col: 0 });
    type(word, ['y', 'i', 'w', '3', 'P']);
    expect(word.lines).toEqual(['foofoofoofoo  ']);
    expect(word.cursor).toEqual({ line: 0, col: 8 });

    const line = new Editor(['foo  ', '  bar baz'], { line: 0, col: 0 });
    type(line, ['y', 'y', '2', 'p']);
    expect(line.lines).toEqual(['foo  ', 'foo  ', 'foo  ', '  bar baz']);
    expect(line.cursor).toEqual({ line: 1, col: 0 });

    const lines = new Editor(['foo  ', '  bar baz', ')qux'], { line: 0, col: 0 });
    type(lines, ['y', 'j', '3', 'p']);
    expect(lines.lines).toEqual([
      'foo  ',
      'foo  ',
      '  bar baz',
      'foo  ',
      '  bar baz',
      'foo  ',
      '  bar baz',
      '  bar baz',
      ')qux',
    ]);
    expect(lines.cursor).toEqual({ line: 1, col: 0 });
  });

  test('D with a count deletes the whole following lines', () => {
    const lines = ['foo  ', '  bar baz', ')qux', '', 'x 0x1f -5 Abc', 'last'];
    const first = new Editor(lines, { line: 0, col: 0 });
    type(first, ['2', 'D']);
    expect(first.lines).toEqual([')qux', '', 'x 0x1f -5 Abc', 'last']);
    expect(first.cursor).toEqual({ line: 0, col: 0 });

    const partial = new Editor(lines, { line: 1, col: 4 });
    type(partial, ['2', 'D']);
    expect(partial.lines).toEqual(['foo  ', '  ba', '', 'x 0x1f -5 Abc', 'last']);
    expect(partial.cursor).toEqual({ line: 1, col: 3 });
  });

  test('a count on . replaces the count of the recorded change', () => {
    const editor = new Editor(['foo  ', '  bar baz'], { line: 1, col: 4 });
    type(editor, ['3', 'x', '2', '.']);
    expect(editor.lines).toEqual(['foo  ', '  ba']);
    expect(editor.cursor).toEqual({ line: 1, col: 3 });
    const next = new Editor(['abcdefghij'], { line: 0, col: 0 });
    type(next, ['3', 'x', '2', '.', '.']);
    expect(next.lines).toEqual(['hij']);
  });

  test('one u undoes a whole dot repeat, but not the change it repeats', () => {
    const editor = new Editor(['foo  '], { line: 0, col: 0 });
    type(editor, ['x', '3', '.', 'u']);
    expect(editor.lines).toEqual(['oo  ']);
    expect(editor.cursor).toEqual({ line: 0, col: 0 });
  });

  test('dw. repeats on the empty line and joins the next line up', () => {
    const editor = new Editor(['foo  ', '  bar baz', ')qux'], { line: 0, col: 0 });
    type(editor, ['d', 'w', '.']);
    expect(editor.lines).toEqual(['  bar baz', ')qux']);
    expect(editor.cursor).toEqual({ line: 0, col: 2 });
  });

  test('ddu leaves the cursor on the first non-blank of the restored line', () => {
    const lines = ['foo  ', '  bar baz', ')qux', '', 'x 0x1f -5 Abc', 'last'];
    const spaced = new Editor(lines, { line: 1, col: 4 });
    type(spaced, ['d', 'd', 'u']);
    expect(spaced.cursor).toEqual({ line: 1, col: 2 });

    const start = new Editor(lines, { line: 4, col: 2 });
    type(start, ['d', 'd', 'u']);
    expect(start.cursor).toEqual({ line: 4, col: 0 });
  });

  test('Ctrl-a and Ctrl-x keep hexadecimal numbers in hex', () => {
    const up = new Editor(['x 0x1f -5 Abc'], { line: 0, col: 2 });
    type(up, ['C-a']);
    expect(up.lines).toEqual(['x 0x20 -5 Abc']);
    expect(up.cursor).toEqual({ line: 0, col: 5 });

    const counted = new Editor(['x 0x1f -5 Abc'], { line: 0, col: 2 });
    type(counted, ['3', 'C-a']);
    expect(counted.lines).toEqual(['x 0x22 -5 Abc']);

    const down = new Editor(['x 0x1f -5 Abc'], { line: 0, col: 2 });
    type(down, ['C-x']);
    expect(down.lines).toEqual(['x 0x1e -5 Abc']);

    const many = new Editor(['x 0x1f -5 Abc'], { line: 0, col: 2 });
    type(many, ['1', '2', 'C-x']);
    expect(many.lines).toEqual(['x 0x13 -5 Abc']);
  });
});
