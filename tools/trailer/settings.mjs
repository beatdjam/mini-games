// What tools/trailer needs to know of a trailer script before the page is up: the game, the picture's size, touch or
// mouse, the language, the scenes' lengths (the script itself is read by engine/src/trailer/script.ts in the page)
import fs from 'node:fs';
import path from 'node:path';

export function readScript(file) {
  const source = fs.readFileSync(file, 'utf8'),
    settingOf = key => source.match(new RegExp(`^${key}[ \\t]+([^#\\n]*)`, 'm'))?.[1].trim(),
    size = (settingOf('size') ?? '1280x576 @1.5').match(/^(\d+)x(\d+)(?:\s*@\s*([\d.]+))?/),
    parts = [...source.matchAll(/^(?:scene|end)[ \t]+([\d.]+)/gm)].map(m => +m[1]);
  if (!size) throw new Error('size takes WIDTHxHEIGHT @SCALE, e.g. 1280x576 @1.5');
  return {
    source,
    // the game: the setting, or the games/<game>/ the script is in
    game: settingOf('game') ?? path.resolve(file).match(/[/\\]games[/\\]([^/\\]+)[/\\]/)?.[1] ?? 'sector-dive-ex',
    width: +size[1],
    height: +size[2],
    scale: +(size[3] ?? 1),
    touch: (settingOf('input') ?? 'touch') === 'touch',
    lang: settingOf('lang') ?? 'ja',
    parts, // the seconds of each scene and of the title card
    total: parts.reduce((t, x) => t + x, 0),
  };
}
