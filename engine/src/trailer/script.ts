// engine: the trailer's script, a text file read by tools/trailer (see tools/trailer/README.md for the words a game
// takes). A line at the left edge is a setting (`music KWLN boss`) or starts a part: `scene <seconds> <caption>` or,
// last, `end <seconds>` (the title card). The indented lines under a part are what happens in it (`at stairs top`,
// `do run`, `in flash`). `#` starts a comment (at a line's start, or after a space). Pure: no page, no three.js
export interface ScriptLine {
  key: string;
  args: string[]; // the words after the key that are not name=value
  named: Record<string, string>; // the name=value words
  text: string; // all of the line after the key, as written
  line: number; // in the file, from 1
}
export type TransitionKind = 'cut' | 'flash' | 'fade';
export interface Transition {
  kind: TransitionKind;
  secs: number; // how long the flash or the fade takes (each way for a fade)
}
export interface ScriptScene {
  start: number; // seconds from the film's start
  secs: number;
  caption: string; // '' for none
  keep: boolean; // the caption of the scene before goes on (written `^`): it is not faded out and in again
  enter: Transition; // how the cut into it looks (`in`)
  lines: ScriptLine[]; // what happens in it, but `in`
  end: boolean; // the title card (`end`): its lines are title, line, sub, url
  line: number;
}
export interface Script {
  settings: ScriptLine[];
  scenes: ScriptScene[]; // the title card last, if there is one
  total: number; // seconds
}
// the settings the film itself reads (tools/trailer/capture.mjs and runTrailer); a game takes the others
export const FILM_SETTINGS = ['size', 'lang', 'input', 'game'];
export const END_KEYS = ['title', 'line', 'sub', 'url'];
const TRANSITIONS: Record<TransitionKind, number> = { cut: 0, flash: 0.7, fade: 0.35 };

const words = (text: string): string[] => text.split(/\s+/).filter(Boolean);
function lineOf(text: string, line: number): ScriptLine {
  const [key = '', ...rest] = words(text),
    after = text.trim().slice(key.length).trim(),
    named: Record<string, string> = {};
  for (const w of rest) {
    const at = w.indexOf('=');
    if (at > 0) named[w.slice(0, at)] = w.slice(at + 1);
  }
  return { key, args: rest.filter(w => w.indexOf('=') <= 0), named, text: after, line };
}
// a comment: from a # at the start of the line or after a space
const uncomment = (raw: string): string => raw.replace(/(^|\s)#.*$/, '');

// The script, and what is wrong with it (each "line N: ..."; the script is only as far as could be read then)
export function parseScript(source: string): { script: Script; errors: string[] } {
  const settings: ScriptLine[] = [],
    scenes: ScriptScene[] = [],
    errors: string[] = [];
  let start = 0,
    caption = '';
  source.split(/\r?\n/).forEach((raw, n) => {
    const line = n + 1,
      text = uncomment(raw);
    if (!text.trim()) return;
    const at = scenes[scenes.length - 1];
    if (/^\s/.test(text)) {
      // a line of the part above
      if (!at) {
        errors.push(`line ${line}: an indented line before any scene`);
        return;
      }
      const l = lineOf(text, line);
      if (l.key === 'in') {
        const kind = l.args[0] as TransitionKind,
          secs = l.args[1] === undefined ? TRANSITIONS[kind] : Number(l.args[1]);
        if (!(kind in TRANSITIONS)) errors.push(`line ${line}: in takes cut, flash or fade, not "${l.args[0] ?? ''}"`);
        else if (!(secs >= 0)) errors.push(`line ${line}: in ${kind} takes seconds, not "${l.args[1]}"`);
        else at.enter = { kind, secs };
      } else if (at.end && !END_KEYS.includes(l.key))
        errors.push(`line ${line}: the title card takes ${END_KEYS.join(', ')} and in, not "${l.key}"`);
      else at.lines.push(l);
      return;
    }
    const l = lineOf(text, line);
    if (l.key === 'scene' || l.key === 'end') {
      const secs = Number(l.args[0]);
      if (scenes[scenes.length - 1]?.end) errors.push(`line ${line}: nothing can come after the title card (end)`);
      if (!(secs > 0))
        errors.push(`line ${line}: ${l.key} takes its length in seconds first, not "${l.args[0] ?? ''}"`);
      const rest = l.text.slice((l.args[0] ?? '').length).trim(),
        keep = l.key === 'scene' && rest === '^';
      if (l.key === 'scene') caption = keep ? caption : rest;
      scenes.push({
        start,
        secs: secs > 0 ? secs : 0,
        caption: l.key === 'scene' ? caption : '',
        keep,
        enter: { kind: 'cut', secs: 0 },
        lines: [],
        end: l.key === 'end',
        line,
      });
      start += secs > 0 ? secs : 0;
    } else if (scenes.length) errors.push(`line ${line}: a setting after the first scene ("${l.key}")`);
    else settings.push(l);
  });
  if (!scenes.some(s => !s.end)) errors.push('no scene');
  return { script: { settings, scenes, total: start }, errors };
}
export const setting = (s: Script, key: string): ScriptLine | undefined => s.settings.find(l => l.key === key);
// the scene at `t` seconds (the last one past the end)
export const sceneAt = (s: Script, t: number): ScriptScene =>
  s.scenes.find(x => t < x.start + x.secs) ?? s.scenes[s.scenes.length - 1]!;
