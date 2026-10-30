import {
  differentWord,
  move,
  pick,
  pickInt,
  pickWords,
  puzzle,
  startOfWord,
  WORDS,
  ZERO,
  type Generated,
  type Rng,
} from './base.ts';

export const BUILDERS: ((rng: Rng) => Generated)[] = [
  rng => {
    const words = pickWords(rng, 4);
    const index = pickInt(rng, 1, 2);
    return puzzle('deleteWord', [words.join(' ')], [words.filter((_, i) => i !== index).join(' ')], ['d', 'w'], {
      line: 0,
      col: startOfWord(words, index),
    });
  },
  rng => {
    const words = pickWords(rng, 4);
    const index = pickInt(rng, 2, 3);
    return puzzle(
      'deleteWordBack',
      [words.join(' ')],
      [words.filter((_, i) => i !== index - 1).join(' ')],
      ['d', 'b'],
      { line: 0, col: startOfWord(words, index) },
    );
  },
  rng => {
    const lines = pickWords(rng, 4);
    const index = pickInt(rng, 1, 2);
    return puzzle(
      'deleteLine',
      lines,
      lines.filter((_, i) => i !== index),
      ['d', 'd'],
      { line: index, col: 0 },
    );
  },
  rng => {
    const words = pickWords(rng, 4);
    const index = pickInt(rng, 1, 2);
    const next = differentWord(rng, words);
    const target = words.map((word, i) => (i === index ? next : word)).join(' ');
    return puzzle('changeWord', [words.join(' ')], [target], ['c', 'w', ...next.split(''), 'Escape'], {
      line: 0,
      col: startOfWord(words, index),
    });
  },
  rng => {
    const line = pick(rng, WORDS);
    const suffix = pick(rng, ['!', ' ok', ' 42', ';']);
    return puzzle('append', [line], [line + suffix], ['A', ...suffix.split(''), 'Escape']);
  },
  rng => {
    const first = pickInt(rng, 1, 9);
    let second = pickInt(rng, 1, 9);
    while (second === first) second = pickInt(rng, 1, 9);
    const line = `const value = ${first};`;
    return puzzle('replaceChar', [line], [`const value = ${second};`], ['r', String(second)], {
      line: 0,
      col: line.indexOf(String(first)),
    });
  },
  rng => {
    const line = pick(rng, ['run();', 'return;', 'break;', 'continue;']);
    return puzzle('indentLine', [line], ['  ' + line], ['>', '>']);
  },
  rng => {
    const [first, second] = pickWords(rng, 2);
    return puzzle('joinLines', [first, second], [first + ' ' + second], ['J']);
  },
  rng => {
    const line = pick(rng, WORDS);
    return puzzle('duplicateLine', [line], [line, line], ['y', 'y', 'p']);
  },
  rng => {
    const words = pickWords(rng, 3);
    const line = `${words[0]}, ${words[1]}, ${words[2]}`;
    return move('findComma', [line], ZERO, { line: 0, col: words[0].length }, ['f', ',']);
  },
  rng => {
    const words = pickWords(rng, 3);
    const lines = [`${words[0]} ${words[1]}`, `${words[2]} ${words[1]}`];
    return move('searchWord', lines, ZERO, { line: 1, col: 0 }, ['/', ...words[2].split(''), 'Enter']);
  },
  rng => {
    const [first, second] = pickWords(rng, 2);
    const line = `total = (${first} + ${second}) * 2;`;
    return move('matchBracket', [line], { line: 0, col: line.indexOf('(') }, { line: 0, col: line.indexOf(')') }, [
      '%',
    ]);
  },
  rng => {
    const [first, second] = pickWords(rng, 2);
    return move('markExact', [first, second], ZERO, { line: 1, col: 2 }, ['`', 'a'], {
      marks: { a: { line: 1, col: 2 } },
    });
  },
  rng => {
    const [first, second] = pickWords(rng, 2);
    return move('markLine', [first, second], ZERO, { line: 1, col: 0 }, ["'", 'b'], {
      marks: { b: { line: 1, col: 2 } },
    });
  },
  rng => {
    const words = pickWords(rng, 3);
    return puzzle('dotRepeat', [words.join(' ')], [words[2]], ['d', 'w', '.']);
  },
  rng => {
    const value = pickInt(rng, 10, 90);
    const line = `const timeout = ${value};`;
    return puzzle('increment', [line], [`const timeout = ${value + 1};`], ['C-a'], {
      line: 0,
      col: line.indexOf(String(value)),
    });
  },
  rng => {
    const value = pickInt(rng, 10, 90);
    const line = `let retries = ${value};`;
    return puzzle('decrement', [line], [`let retries = ${value - 2};`], ['2', 'C-x'], {
      line: 0,
      col: line.indexOf(String(value)),
    });
  },
  rng => {
    const value = pickInt(rng, 1, 9);
    const line = `let x = ${value}; // old`;
    return puzzle('changeToEnd', [line], [`let x = ${value}; // new`], ['C', 'n', 'e', 'w', 'Escape'], {
      line: 0,
      col: line.indexOf('old'),
    });
  },
  rng => {
    const value = pickInt(rng, 1, 9);
    const line = `let x = ${value};// note`;
    return puzzle('deleteToEnd', [line], [`let x = ${value};`], ['D'], { line: 0, col: line.indexOf('//') });
  },
  rng => {
    const [first, second] = pickWords(rng, 2);
    return puzzle('visualWord', [`${first} ${second}`], [second], ['v', 'e', 'l', 'd']);
  },
  rng => {
    const line = pick(rng, ['run();', 'stop();', 'return;']);
    return puzzle('visualIndent', [line], ['  ' + line], ['V', '>']);
  },
  rng => {
    const lines = pickWords(rng, 4);
    return puzzle('visualDeleteLine', lines, [lines[0], lines[3]], ['V', 'j', 'd'], { line: 1, col: 0 });
  },
  rng => {
    const words = pickWords(rng, 3);
    const lines = [words[0], `${words[1]} ${words[0]}`, `${words[0]} ${words[2]}`];
    return move('searchNext', lines, ZERO, { line: 2, col: 0 }, ['/', ...words[0].split(''), 'Enter', 'n']);
  },
  rng => {
    const words = pickWords(rng, 3);
    const lines = [words[0], `${words[1]} ${words[0]}`, `${words[0]} ${words[2]}`];
    return move('searchBack', lines, { line: 2, col: 0 }, { line: 1, col: words[1].length + 1 }, [
      '?',
      ...words[0].split(''),
      'Enter',
    ]);
  },
  rng => {
    const words = pickWords(rng, 3);
    return move('markSetAndLine', words, { line: 2, col: 2 }, { line: 2, col: 0 }, ['m', 'a', 'g', 'g', "'", 'a']);
  },
  rng => {
    const words = pickWords(rng, 3);
    const lines = [`${words[0]} ${words[1]}`, words[2], 'omega'];
    return move('previousJump', lines, { line: 0, col: 2 }, { line: 0, col: 0 }, [
      '/',
      'o',
      'm',
      'e',
      'g',
      'a',
      'Enter',
      "'",
      "'",
    ]);
  },
  rng => {
    const lines = pickWords(rng, 4);
    return move('colonLine', lines, ZERO, { line: 2, col: 0 }, [':', '3', 'Enter']);
  },
  rng => {
    const old = pick(rng, ['old', 'slow', 'red']);
    const next = pick(rng, ['new', 'fast', 'blue']);
    return puzzle(
      'substitute',
      [`the ${old} value`],
      [`the ${next} value`],
      [':', 's', '/', ...old.split(''), '/', ...next.split(''), '/', 'Enter'],
    );
  },
  rng => {
    const old = pick(rng, ['old', 'red']);
    const next = pick(rng, ['new', 'blue']);
    return puzzle(
      'substituteAll',
      [`${old} and ${old}`, old],
      [`${next} and ${next}`, next],
      [':', '%', 's', '/', ...old.split(''), '/', ...next.split(''), '/', 'g', 'Enter'],
    );
  },
  rng => {
    const line = pick(rng, WORDS);
    const prefix = pick(rng, ['let ', 'const ', '// ']);
    return puzzle('insertBeginning', [line], [prefix + line], ['I', ...prefix.split(''), 'Escape']);
  },
  rng => {
    const lines = pickWords(rng, 9);
    return move('screenTop', lines, { line: 4, col: 0 }, { line: 0, col: 0 }, ['H']);
  },
  rng => {
    const lines = pickWords(rng, 9);
    return move('screenMiddle', lines, ZERO, { line: 4, col: 0 }, ['M']);
  },
  rng => {
    const lines = pickWords(rng, 9);
    return move('screenBottom', lines, ZERO, { line: 8, col: 0 }, ['L']);
  },
  rng => {
    const lines = pickWords(rng, 9);
    return move('countTop', lines, { line: 8, col: 0 }, { line: 2, col: 0 }, ['3', 'H']);
  },
  rng => {
    const lines = pickWords(rng, 9);
    return move('countBottom', lines, ZERO, { line: 6, col: 0 }, ['3', 'L']);
  },
  rng => {
    const line = `name = "${pick(rng, WORDS)}"`;
    return move('findSecondQuote', [line], ZERO, { line: 0, col: line.lastIndexOf('"') }, ['2', 'f', '"']);
  },
  rng => {
    const lines = pickWords(rng, 4);
    return puzzle('deleteCount', lines, [lines[2], lines[3]], ['2', 'd', 'd']);
  },
  rng => {
    const lines = pickWords(rng, 4);
    return puzzle('indentCount', lines, ['  ' + lines[0], '  ' + lines[1], '  ' + lines[2], lines[3]], ['3', '>', '>']);
  },
  rng => {
    const words = pickWords(rng, 3);
    return puzzle('joinCount', words, [words.join(' ')], ['3', 'J']);
  },
  rng => {
    const line = pick(rng, ['abcde', 'vwxyz', 'hello']);
    return puzzle('replaceCount', [line], ['XXX' + line.slice(3)], ['3', 'r', 'X']);
  },
  _rng => {
    return puzzle('xCount', ['hellooooo'], ['hello'], ['4', 'x'], { line: 0, col: 5 });
  },
  rng => {
    const words = pickWords(rng, 3);
    return puzzle(
      'dotInsert',
      words,
      words.map(word => word + '!'),
      ['A', '!', 'Escape', 'j', '.', 'j', '.'],
    );
  },
  rng => {
    const words = pickWords(rng, 3);
    return puzzle('deleteAroundWord', [words.join(' ')], [`${words[0]} ${words[2]}`], ['d', 'a', 'w'], {
      line: 0,
      col: startOfWord(words, 1),
    });
  },
  rng => {
    const words = pickWords(rng, 3);
    const next = differentWord(rng, words);
    return puzzle(
      'changeInsideWord',
      [words.join(' ')],
      [`${words[0]} ${next} ${words[2]}`],
      ['c', 'i', 'w', ...next.split(''), 'Escape'],
      { line: 0, col: startOfWord(words, 1) },
    );
  },
  rng => {
    const old = pick(rng, ['old', 'vim', 'slow']);
    const next = pick(rng, ['new', 'neovim', 'fast']);
    const line = `name = "${old}"`;
    return puzzle('changeInsideQuote', [line], [`name = "${next}"`], ['c', 'i', '"', ...next.split(''), 'Escape'], {
      line: 0,
      col: line.indexOf(old),
    });
  },
  rng => {
    const old = pick(rng, ['ready', 'alpha', 'start']);
    const next = pick(rng, ['done', 'beta', 'stop']);
    const line = `if (${old}) {`;
    return puzzle('changeInsideParen', [line], [`if (${next}) {`], ['c', 'i', '(', ...next.split(''), 'Escape'], {
      line: 0,
      col: line.indexOf(old),
    });
  },
  rng => {
    const word = pick(rng, WORDS);
    return puzzle('deleteInsideBrace', [`map = {${word}: 1};`], ['map = {};'], ['d', 'i', '{'], {
      line: 0,
      col: `map = {`.length,
    });
  },
  rng => {
    const word = pick(rng, WORDS);
    return puzzle('visualInsideParen', [`call(${word})`], ['call()'], ['v', 'i', '(', 'd'], {
      line: 0,
      col: 'call('.length,
    });
  },
];
