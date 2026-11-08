import { expect, test } from 'vitest';
import { parseScript, sceneAt, setting } from '../src/trailer/script.ts';

test('trailer script: settings, scenes with their seconds, captions kept, transitions, the title card; errors by line', () => {
  const { script, errors } = parseScript(
    [
      '# a comment',
      'size 1280x576 @1.5   # after a space too',
      'music KWLN boss',
      '',
      'scene 2.5  Old looks',
      '  at KWLN start seed=7',
      '  do look-around',
      'scene 1  ^',
      '  in flash',
      '  at same',
      'scene 1',
      '  in fade 0.5',
      'end 3',
      '  title SECTOR/DIVE EX',
      '  url  beatdjam.github.io/mini-games',
    ].join('\n'),
  );
  expect(errors).toEqual([]);
  expect(setting(script, 'music')?.args).toEqual(['KWLN', 'boss']);
  expect(setting(script, 'size')?.text, 'the comment is cut off').toBe('1280x576 @1.5');
  expect(script.scenes.map(s => [s.start, s.secs])).toEqual([
    [0, 2.5],
    [2.5, 1],
    [3.5, 1],
    [4.5, 3],
  ]);
  expect(script.total).toBe(7.5);
  const [a, b, c, end] = script.scenes;
  expect(a!.lines[0]).toMatchObject({ key: 'at', args: ['KWLN', 'start'], named: { seed: '7' }, line: 6 });
  expect([b!.caption, b!.keep], '^ goes on with the caption before').toEqual(['Old looks', true]);
  expect([c!.caption, c!.keep]).toEqual(['', false]);
  expect(a!.enter.kind).toBe('cut');
  expect(b!.enter).toEqual({ kind: 'flash', secs: 0.7 });
  expect(c!.enter).toEqual({ kind: 'fade', secs: 0.5 });
  expect(
    b!.lines.map(l => l.key),
    'in is not one of its lines',
  ).toEqual(['at']);
  expect(end!.end).toBe(true);
  expect(end!.lines.find(l => l.key === 'title')?.text).toBe('SECTOR/DIVE EX');
  expect(sceneAt(script, 2.6)).toBe(b);
  expect(sceneAt(script, 99), 'past the end: the last').toBe(end);
  // what is wrong, by line
  const bad = parseScript(
    ['  at nowhere', 'scene x', 'scene 1', '  in wipe', 'music late', 'end 1', '  do run', 'scene 1'].join('\n'),
  ).errors;
  expect(bad.map(e => e.split(':')[0])).toEqual(['line 1', 'line 2', 'line 4', 'line 5', 'line 7', 'line 8']);
  expect(parseScript('music KWLN').errors).toEqual(['no scene']);
});
